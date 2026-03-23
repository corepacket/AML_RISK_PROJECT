// backend/models/Transactions.js
// Added: riskLevel, explanation, riskFlags, analystAction, analystReviewedAt, analystNote

import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    transactionId: {
      type: String,
      unique: true,
    },
    fromAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    toAccount: {
      type: String,
    },
    amount: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: "Transfer",
    },
    type: {
      type: String,
      enum: ["debit", "credit"],
      default: "debit",
    },

    // ── AI scoring fields ──────────────────────────────────────────────────
    riskScore: {
      type: Number,
      default: 0,
    },
    risk: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Low",
    },
    riskLevel: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Low",
    },
    explanation: {
      type: String,       // AI-generated "why flagged" text
      default: "",
    },
    riskFlags: {
      type: [String],     // e.g. ["CIRCULAR_FLOW", "RAPID_MOVEMENT"]
      default: [],
    },

    // ── Status ────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["Cleared", "Flagged", "Blocked", "Review", "Pending"],
      default: "Cleared",
    },

    // ── Source ────────────────────────────────────────────────────────────
    source: {
      type: String,
      enum: ["manual", "csv", "api"],
      default: "manual",
    },

    // ── Analyst review ────────────────────────────────────────────────────
    analystAction: {
      type: String,
      enum: ["approved", "blocked", null],
      default: null,
    },
    analystReviewedAt: {
      type: Date,
      default: null,
    },
    analystNote: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);