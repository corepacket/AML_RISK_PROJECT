// backend/routes/TransactionRoute.js
// Endpoints:
//   POST   /api/transactions/send           — send a transaction (scored by Python AI)
//   POST   /api/transactions/upload-csv     — batch CSV upload (each row scored by Python AI)
//   GET    /api/transactions/my             — customer's own transactions
//   GET    /api/transactions/all            — analyst: all transactions
//   PATCH  /api/transactions/:id/approve    — analyst: approve a flagged transaction
//   PATCH  /api/transactions/:id/block      — analyst: block a transaction

import express from "express";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import Transaction from "../models/Transactions.js";
import { scoreTransaction } from "../services/aiClient.js";

const router = express.Router();

// ── Multer (memory storage — no disk writes) ──────────────────────────────────
const upload = multer({ storage: multer.memoryStorage() });

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map Python node_status → Mongo Transaction.status enum */
function mapStatus(nodeStatus) {
  const map = {
    BLOCKED:   "Blocked",
    FLAGGED:   "Flagged",
    PROCESSED: "Cleared",
  };
  return map[nodeStatus] || "Cleared";
}

/** Map risk_level → Transaction.risk enum */
function mapRisk(riskLevel) {
  const map = { High: "High", Medium: "Medium", Low: "Low" };
  return map[riskLevel] || "Low";
}

/**
 * Normalise a Mongo transaction doc for the frontend.
 * Analyst + Customer dashboards both use this shape.
 */
function normalize(t) {
  return {
    transactionId:   t.transactionId,
    amount:          t.amount,
    description:     t.description,
    category:        t.category,
    type:            t.type,
    status:          t.status,
    risk:            t.risk,
    riskScore:       t.riskScore,
    riskLevel:       t.riskLevel   || t.risk,
    reason:          t.explanation || t.reason || "",   // AI explanation
    explanation:     t.explanation || t.reason || "",
    riskFlags:       t.riskFlags   || [],
    source:          t.source,
    fromAccount:     t.fromAccount,
    toAccount:       t.toAccount,
    createdAt:       t.createdAt,
    updatedAt:       t.updatedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transactions/send
// Customer sends a transaction → Node scores it via Python → saves to Mongo
// ─────────────────────────────────────────────────────────────────────────────
router.post("/send", protect, authorizeRoles("customer"), async (req, res) => {
  try {
    const {
      toAccount,
      amount,
      description,
      category,
      paymentMethod,  // frontend sends camelCase
    } = req.body;

    if (!toAccount || !amount || !description) {
      return res.status(400).json({
        status:  "error",
        message: "toAccount, amount, and description are required.",
        data:    null,
      });
    }

    // ── Find sender's account ──────────────────────────────────────────────
    const amlDb       = mongoose.connection.useDb("aml_system");
    const accountsCol = amlDb.collection("accounts");

    const senderAccount = await accountsCol.findOne({
      customer_id: req.user.customer_id || req.user.id,
    });

    if (!senderAccount) {
      return res.status(404).json({
        status:  "error",
        message: "Sender account not found.",
        data:    null,
      });
    }

    if (senderAccount.balance < amount) {
      return res.status(400).json({
        status:  "error",
        message: "Insufficient balance.",
        data:    null,
      });
    }

    const transactionId = uuidv4();
    const now           = new Date();

    // ── Call Python AI scoring ─────────────────────────────────────────────
    const aiResult = await scoreTransaction({
      transactionId,
      timestamp:           now.toISOString(),
      senderCustomerId:    String(senderAccount.customer_id),
      senderAccountId:     senderAccount.account_id,
      receiverCustomerId:  "",                // unknown receiver customer
      receiverAccountId:   toAccount,
      amount:              Number(amount),
      currency:            "USD",
      paymentMethod:       paymentMethod || "UNKNOWN",
      description:         description   || "",
      category:            category      || "Transfer",
    });

    const mongoStatus = mapStatus(aiResult.node_status);
    const mongoRisk   = mapRisk(aiResult.risk_level);

    // ── Save transaction to Mongo ─────────────────────────────────────────
    const txn = await Transaction.create({
      userId:        req.user.id,
      transactionId,
      fromAccount:   senderAccount._id,
      toAccount,
      amount:        Number(amount),
      description,
      category:      category || "Transfer",
      type:          "debit",
      status:        mongoStatus,
      risk:          mongoRisk,
      riskScore:     aiResult.risk_score,
      riskLevel:     aiResult.risk_level,
      explanation:   aiResult.explanation,
      riskFlags:     aiResult.risk_flags || [],
      source:        "manual",
    });

    // ── Deduct balance only if NOT blocked ────────────────────────────────
    if (mongoStatus !== "Blocked") {
      await accountsCol.updateOne(
        { account_id: senderAccount.account_id },
        { $inc: { balance: -Number(amount) }, $set: { updated_at: now } }
      );
    }

    return res.status(201).json({
      status:  "success",
      message: `Transaction ${aiResult.node_status}.`,
      data: {
        transactionId,
        frontendStatus: aiResult.node_status,   // SUCCESS | FLAGGED | BLOCKED
        mongoStatus,
        riskScore:      aiResult.risk_score,
        riskLevel:      aiResult.risk_level,
        explanation:    aiResult.explanation,
        riskFlags:      aiResult.risk_flags || [],
        transaction:    normalize(txn),
      },
    });
  } catch (err) {
    console.error("❌ /send error:", err);
    res.status(500).json({ status: "error", message: err.message, data: null });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transactions/upload-csv
// Analyst uploads a CSV; each row is scored by Python AI
// CSV columns expected (matching clean_transaction.csv):
//   Timestamp, Sender_ID, Sender_Account, Receiver_ID,
//   Receiver_Account, Amount, Currency, Payment_Type
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/upload-csv",
  protect,
  authorizeRoles("analyst"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          status:  "error",
          message: "No file uploaded.",
          data:    null,
        });
      }

      // ── Parse CSV from buffer ────────────────────────────────────────────
      const rows = await new Promise((resolve, reject) => {
        const results = [];
        const stream  = Readable.from(req.file.buffer);
        stream
          .pipe(csv())
          .on("data", (row) => results.push(row))
          .on("end",  () => resolve(results))
          .on("error", reject);
      });

      // ── Score each row via Python ─────────────────────────────────────────
      const scoredRows = [];

      for (const row of rows) {
        const transactionId = uuidv4();
        const amount        = parseFloat(row["Amount"] || row["amount"] || 0);
        const timestamp     = row["Timestamp"] || row["timestamp"] || new Date().toISOString();
        const paymentMethod = row["Payment_Type"] || row["payment_method"] || "UNKNOWN";
        const senderAccount = row["Sender_Account"] || row["sender_account"] || "";
        const receiverAccount = row["Receiver_Account"] || row["receiver_account"] || "";
        const senderCustomerId  = String(row["Sender_ID"]   || row["sender_id"]   || "");
        const receiverCustomerId = String(row["Receiver_ID"] || row["receiver_id"] || "");

        // Call Python scoring
        const aiResult = await scoreTransaction({
          transactionId,
          timestamp,
          senderCustomerId,
          senderAccountId:  senderAccount,
          receiverCustomerId,
          receiverAccountId: receiverAccount,
          amount,
          currency:    row["Currency"] || "USD",
          paymentMethod,
          description: row["description"] || "CSV import",
          category:    row["category"]    || "Transfer",
        });

        const mongoStatus = mapStatus(aiResult.node_status);
        const mongoRisk   = mapRisk(aiResult.risk_level);

        // Save to Mongo
        const txn = await Transaction.create({
          userId:        req.user.id,
          transactionId,
          fromAccount:   null,
          toAccount:     receiverAccount,
          amount,
          description:   row["description"] || "CSV import",
          category:      row["category"]    || "Transfer",
          type:          "debit",
          status:        mongoStatus,
          risk:          mongoRisk,
          riskScore:     aiResult.risk_score,
          riskLevel:     aiResult.risk_level,
          explanation:   aiResult.explanation,
          riskFlags:     aiResult.risk_flags || [],
          source:        "csv",
        });

        scoredRows.push({
          transactionId,
          amount,
          risk:        mongoRisk,
          status:      mongoStatus,
          riskScore:   aiResult.risk_score,
          reason:      aiResult.explanation,
          explanation: aiResult.explanation,
          riskFlags:   aiResult.risk_flags || [],
          senderAccount,
          receiverAccount,
        });
      }

      const flaggedCount = scoredRows.filter((r) => r.status === "Flagged").length;
      const blockedCount = scoredRows.filter((r) => r.status === "Blocked").length;

      return res.status(200).json({
        status:  "success",
        message: `Processed ${scoredRows.length} transactions. Flagged: ${flaggedCount}, Blocked: ${blockedCount}.`,
        data: {
          total:    scoredRows.length,
          flagged:  flaggedCount,
          blocked:  blockedCount,
          transactions: scoredRows,
        },
      });
    } catch (err) {
      console.error("❌ /upload-csv error:", err);
      res.status(500).json({ status: "error", message: err.message, data: null });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/my  —  customer's own transactions
// ─────────────────────────────────────────────────────────────────────────────
router.get("/my", protect, authorizeRoles("customer"), async (req, res) => {
  try {
    const txns = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({
      status:  "success",
      message: "Transactions fetched.",
      data:    txns.map(normalize),
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message, data: null });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/all  —  analyst sees all transactions
// ─────────────────────────────────────────────────────────────────────────────
router.get("/all", protect, authorizeRoles("analyst"), async (req, res) => {
  try {
    const txns = await Transaction.find({}).sort({ createdAt: -1 });
    res.json({
      status:  "success",
      message: "All transactions fetched.",
      data:    txns.map(normalize),
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message, data: null });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/transactions/:id/approve  —  analyst manually approves
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/approve", protect, authorizeRoles("analyst"), async (req, res) => {
  try {
    const txn = await Transaction.findOneAndUpdate(
      { transactionId: req.params.id },
      {
        $set: {
          status:           "Cleared",
          analystAction:    "approved",
          analystReviewedAt: new Date(),
          analystNote:      req.body.note || "",
        },
      },
      { new: true }
    );

    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found.", data: null });
    }

    res.json({
      status:  "success",
      message: "Transaction approved.",
      data:    normalize(txn),
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message, data: null });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/transactions/:id/block  —  analyst manually blocks
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/block", protect, authorizeRoles("analyst"), async (req, res) => {
  try {
    const txn = await Transaction.findOneAndUpdate(
      { transactionId: req.params.id },
      {
        $set: {
          status:            "Blocked",
          analystAction:     "blocked",
          analystReviewedAt: new Date(),
          analystNote:       req.body.note || "",
        },
      },
      { new: true }
    );

    if (!txn) {
      return res.status(404).json({ status: "error", message: "Transaction not found.", data: null });
    }

    res.json({
      status:  "success",
      message: "Transaction blocked.",
      data:    normalize(txn),
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message, data: null });
  }
});

export default router;

















