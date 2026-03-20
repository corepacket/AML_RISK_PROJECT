import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import connectDB from "./db.js"
import accountRoutes from "./routes/accountRoute.js"
import TransactionRoutes from "./routes/TransactionRoute.js"
import ProfileRoute from "./routes/ProfileRoute.js"



dotenv.config();
connectDB();
const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/profile",ProfileRoute)
app.use("/api/accounts",accountRoutes);
app.use("/api/transactions",TransactionRoutes)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
