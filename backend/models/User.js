import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
       trim: true,
      unique:   true,
      lowercase: true,
      indexx:true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    // will not return by default
    },
    role: {
      type: String,
      enum: ["analyst", "customer"],
      default: "customer",
    },
    customer_id:{
      type:Number,
      default:null,
    },
  },
  { timestamps: true }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};


export default mongoose.model("User", userSchema);