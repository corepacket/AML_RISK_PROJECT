import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";

const router = express.Router();

const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "No token" });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ msg: "Invalid token" }); }
};

const col = () => mongoose.connection.useDb("aml_system").collection("accounts");

// GET /api/accounts/my
router.get("/my", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user?.customer_id) return res.json([]);
    const accounts = await col().find({ customer_id: user.customer_id }).toArray();
    res.json(accounts);
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

// POST /api/accounts/create
router.post("/create", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user?.customer_id) return res.status(400).json({ msg: "Profile not linked." });

    const { accountNumber, accountType, balance, status } = req.body;
    if (!accountNumber) return res.status(400).json({ msg: "Account number required." });

    const existing = await col().findOne({ account_id: accountNumber });
    if (existing) return res.status(400).json({ msg: "Account number already exists." });

    const doc = {
      account_id:     accountNumber,
      account_status: status || "ACTIVE",
      customer_id:    user.customer_id,
      balance:        parseFloat(balance) || 0,
      accountType,
      risk_score:     0,
      flags:          [],
      created_at:     new Date(),
    };

    const result = await col().insertOne(doc);
    res.status(201).json({ account: { ...doc, _id: result.insertedId } });
  } catch (err) { res.status(500).json({ msg: err.message }); }
});

export default router;