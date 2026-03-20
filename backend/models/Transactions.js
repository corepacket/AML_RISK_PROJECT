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
    },
    toAccount: {
      type: String, // account number string for external receivers
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
    riskScore: {
      type: Number,
      default: 0,
    },
    risk: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Low",
    },
    status: {
      type: String,
      enum: ["Cleared", "Flagged", "Blocked", "Review", "Pending"],
      default: "Cleared",
    },
    source: {
      type: String,
      enum: ["manual", "csv", "api"],
      default: "manual",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);