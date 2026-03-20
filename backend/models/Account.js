import mongoose from "mongoose";

const accountSchema = new mongoose.Schema({


  userId:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  accountNumber: String,
  accountType:   String,
  balance:       { type: Number, default: 0 },
  bankName:      String,
  status:        { type: String, enum: ["ACTIVE","FROZEN"], default: "ACTIVE" },
}, { timestamps: true });


export default mongoose.model("Account", accountSchema);