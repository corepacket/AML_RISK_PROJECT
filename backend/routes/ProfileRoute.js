import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";

const router = express.Router();

// ── Auth Middleware ───────────────────────────────────────────────────────────
const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "No token" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ msg: "Invalid token" });
  }
};

// Helper — get aml_system collections
const getAmlCols = () => {
  const amlDb = mongoose.connection.useDb("aml_system");
  return {
    accounts:     amlDb.collection("accounts"),
    transactions: amlDb.collection("transactions"),
    cases:        amlDb.collection("cases"),
    audit_logs:   amlDb.collection("audit_logs"),
  };
};

// ── GET /api/profile/me ───────────────────────────────────────────────────────
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Customer must have customer_id linked
    if (user.role === "customer" && !user.customer_id) {
      return res.status(200).json({ setupRequired: true });
    }

    const { accounts } = getAmlCols();
    const userAccounts = await accounts
      .find({ customer_id: user.customer_id })
      .toArray();

    res.json({ user, accounts: userAccounts });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// ── GET /api/profile/accounts ─────────────────────────────────────────────────
router.get("/accounts", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const { accounts } = getAmlCols();
    const userAccounts = await accounts
      .find({ customer_id: user.customer_id })
      .toArray();
    res.json(userAccounts);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// ── POST /api/profile/setup ───────────────────────────────────────────────────
// Links customer_id from aml_system to the logged-in user
router.post("/setup", protect, async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ msg: "customer_id is required" });

    const { accounts } = getAmlCols();
    const exists = await accounts.findOne({ customer_id: Number(customer_id) });
    if (!exists) {
      return res.status(404).json({ msg: "No accounts found for this customer ID." });
    }

    await User.findByIdAndUpdate(req.user.id, { customer_id: Number(customer_id) });
    res.json({ msg: "Profile linked successfully", customer_id: Number(customer_id) });
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

export default router;