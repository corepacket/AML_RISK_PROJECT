import express from "express";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "No token" });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ msg: "Invalid token" }); }
};

const getAml = () => {
  const db = mongoose.connection.useDb("aml_system");
  return {
    transactions: db.collection("transactions"),
    accounts:     db.collection("accounts"),
  };
};

// ── AML scoring ───────────────────────────────────────────────────────────────
const runAML = ({ amount, description = "", category = "" }) => {
  let score = 0;
  if (amount > 500000)      score += 45;
  else if (amount > 100000) score += 30;
  else if (amount > 50000)  score += 20;
  else if (amount > 10000)  score += 10;

  const kw = ["offshore","crypto","shell","anonymous","bearer","ruble","wire"];
  if (kw.some(w => description.toLowerCase().includes(w))) score += 30;
  if (category === "Wire Transfer") score += 15;
  if (category === "Remittance")    score += 15;
  if (category === "Crypto")        score += 25;

  let risk, status;
  if      (score >= 70) { risk = "High";   status = "Blocked"; }
  else if (score >= 40) { risk = "Medium";  status = "Flagged"; }
  else                  { risk = "Low";     status = "Cleared"; }
  return { riskScore: score, risk, status };
};

// Normalize aml_system txn → frontend shape
const normalize = (t, customerid) => ({
  _id:           t._id,
  transactionId: t.transaction_id,
  fromAccount:   t.sender_account_id,
  toAccount:     t.receiver_account_id,
  amount:        t.amount,
  currency:      t.currency || "USD",
  description:   t.description || t.payment_method || "Transaction",
  category:      t.payment_method || "Transfer",
  type:          t.sender_customer_id === customerid ? "debit" : "credit",
  risk:          t.risk_score >= 70 ? "High" : t.risk_score >= 40 ? "Medium" : "Low",
  riskScore:     t.risk_score || 0,
  status:        t.status === "PROCESSED" ? "Cleared"
               : t.status === "BLOCKED"   ? "Blocked"
               : t.status === "FLAGGED"   ? "Flagged"
               : t.status || "Cleared",
  risk_flags:    t.risk_flags || [],
  createdAt:     t.created_at || t.timestamp || new Date(),
});

// ── GET /api/transactions/my ──────────────────────────────────────────────────
router.get("/my", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user?.customer_id) return res.json([]);

    const { transactions } = getAml();
    const txns = await transactions.find({
      $or: [
        { sender_customer_id:   user.customer_id },
        { receiver_customer_id: user.customer_id },
      ],
    }).sort({ created_at: -1 }).limit(500).toArray();

    res.json(txns.map(t => normalize(t, user.customer_id)));
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

// ── POST /api/transactions/send ───────────────────────────────────────────────
router.post("/send", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user?.customer_id) return res.status(400).json({ msg: "Profile not linked." });

    const { fromAccount, toAccount, amount, description, category } = req.body;
    if (!fromAccount || !toAccount || !amount) {
      return res.status(400).json({ msg: "fromAccount, toAccount, and amount are required." });
    }

    const { transactions, accounts } = getAml();

    // Verify sender account
    const sender = await accounts.findOne({
      account_id:     fromAccount,
      customer_id:    user.customer_id,
      account_status: "ACTIVE",
    });
    if (!sender) return res.status(404).json({ msg: "Sender account not found or frozen." });

    const parsedAmount = parseFloat(amount);
    if ((sender.balance || 0) < parsedAmount) {
      return res.status(400).json({ msg: "Insufficient balance." });
    }

    const receiver = await accounts.findOne({ account_id: toAccount });
    const aml = runAML({ amount: parsedAmount, description, category });

    const txId = `TXN-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const doc = {
      transaction_id:       txId,
      timestamp:            new Date(),
      sender_customer_id:   user.customer_id,
      sender_account_id:    fromAccount,
      receiver_customer_id: receiver?.customer_id || null,
      receiver_account_id:  toAccount,
      amount:               parsedAmount,
      currency:             "USD",
      payment_method:       category || "Transfer",
      description:          description || "",
      status:               aml.status === "Blocked" ? "BLOCKED" : aml.status === "Flagged" ? "FLAGGED" : "PROCESSED",
      risk_score:           aml.riskScore,
      risk_flags:           aml.status !== "Cleared" ? [aml.risk] : [],
      created_at:           new Date(),
    };

    await transactions.insertOne(doc);

    // Update balances (only if not blocked)
    if (aml.status !== "Blocked") {
      await accounts.updateOne({ account_id: fromAccount }, { $inc: { balance: -parsedAmount } });
      if (receiver) await accounts.updateOne({ account_id: toAccount }, { $inc: { balance: parsedAmount } });
    }

    const frontStatus = aml.status === "Blocked" ? "BLOCKED" : aml.status === "Flagged" ? "FLAGGED" : "SUCCESS";
    res.status(201).json({
      status:    frontStatus,
      message:   frontStatus === "SUCCESS" ? "Transaction completed successfully."
               : frontStatus === "FLAGGED" ? "Transaction flagged for AML review."
               : "Transaction blocked — high risk detected.",
      riskScore: aml.riskScore,
      transactionId: txId,
      transaction: normalize(doc, user.customer_id),
    });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

// ── POST /api/transactions/upload-csv ────────────────────────────────────────
router.post("/upload-csv", protect, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "No file uploaded." });
    const user = await User.findById(req.user.id);
    if (!user?.customer_id) return res.status(400).json({ msg: "Profile not linked." });

    const rows = [];
    const errors = [];
    await new Promise((resolve, reject) => {
      Readable.from(req.file.buffer.toString())
        .pipe(csv())
        .on("data", r => rows.push(r))
        .on("end", resolve)
        .on("error", reject);
    });

    if (rows.length === 0) return res.status(400).json({ msg: "CSV is empty or invalid." });

    const { transactions } = getAml();
    let processed = 0, highRisk = 0, flagged = 0, blocked = 0, cleared = 0, cases = 0;
    const savedTxns = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.toAccount || !row.amount) {
        errors.push({ row: i+2, msg: "Missing toAccount or amount." }); continue;
      }
      const amt = parseFloat(row.amount);
      if (isNaN(amt) || amt <= 0) {
        errors.push({ row: i+2, msg: `Invalid amount: ${row.amount}` }); continue;
      }

      const aml = runAML({ amount: amt, description: row.description || "", category: row.category || "Transfer" });
      const txId = `TXN-CSV-${Date.now()}-${i}`;

      await transactions.insertOne({
        transaction_id:       txId,
        timestamp:            new Date(),
        sender_customer_id:   user.customer_id,
        sender_account_id:    row.fromAccount || "UNKNOWN",
        receiver_customer_id: null,
        receiver_account_id:  row.toAccount,
        amount:               amt,
        currency:             "USD",
        payment_method:       row.category || "Transfer",
        description:          row.description || "",
        status:               aml.status === "Blocked" ? "BLOCKED" : aml.status === "Flagged" ? "FLAGGED" : "PROCESSED",
        risk_score:           aml.riskScore,
        risk_flags:           aml.status !== "Cleared" ? [aml.risk] : [],
        source:               "csv",
        created_at:           new Date(),
      });

      savedTxns.push({ description: row.description, amount: amt, risk: aml.risk, status: aml.status });
      processed++;
      if (aml.risk === "High")      { highRisk++; cases++; }
      if (aml.status === "Flagged") flagged++;
      if (aml.status === "Blocked") { blocked++; cases++; }
      if (aml.status === "Cleared") cleared++;
    }

    res.json({
      report: { total: rows.length, processed, highRisk, flagged, blocked, cleared, cases, transactions: savedTxns, errors: errors.length ? errors : undefined },
    });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

export default router;