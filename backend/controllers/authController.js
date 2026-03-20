// ─────────────────────────────────────────────────────────────────────────────
// authController.js
//
// SIGNUP FLOW (Option A — Auto-create):
//   1. User submits name, email, password, role
//   2. Hash password
//   3. Auto-generate a unique customer_id (random 6-digit number)
//   4. Save User to fraud_ui DB (with customer_id)
//   5. Create a default account in aml_system.accounts for this customer
//   6. Return success → frontend redirects to /CustomerDashboard directly
//
// LOGIN FLOW:
//   1. Find user by email
//   2. Compare password with stored hash
//   3. Return JWT token + user data (including customer_id)
//   4. Frontend checks role → navigate to correct dashboard
// ─────────────────────────────────────────────────────────────────────────────

import User       from "../models/User.js";
import bcrypt     from "bcryptjs";
import jwt        from "jsonwebtoken";
import mongoose   from "mongoose";

// ── Helper: generate unique customer_id ──────────────────────────────────────
// Generates a random 6-digit number (100000–999999)
// Keeps trying until it finds one not already in the DB
const generateCustomerId = async () => {
  const usersCol = mongoose.connection.useDb("fraud_ui").collection("users");

  let customerId;
  let exists = true;

  // Loop until we get a unique ID
  while (exists) {
    // Math.random() gives 0–1, multiply and floor to get integer in range
    customerId = Math.floor(100000 + Math.random() * 900000);

    // Check if this customer_id is already taken in User collection
    exists = await usersCol.findOne({ customer_id: customerId });
  }

  return customerId;
};

// ── Helper: create default account in aml_system ─────────────────────────────
// When a new customer signs up, we create ONE default Savings account
// in the aml_system.accounts collection so the dashboard has data to show
const createAmlAccount = async (customerId, customerName) => {
  const amlDb      = mongoose.connection.useDb("aml_system");
  const accountsCol = amlDb.collection("accounts");

  // Generate a random account_id (like real bank account numbers)
  // Format: 8 random hex characters uppercase e.g. "A3F2B9C1"
  const accountId = Math.random().toString(16).slice(2, 10).toUpperCase();

  const newAccount = {
    account_id:     accountId,
    account_status: "ACTIVE",
    customer_id:    customerId,       // links to User.customer_id
    customer_name:  customerName,     // helpful for display
    balance:        10000,            // default starting balance for demo
    accountType:    "Savings",
    risk_score:     0,                // starts at 0, Python agents update this
    flags:          [],               // empty, Python agents add flags
    created_at:     new Date(),
  };

  await accountsCol.insertOne(newAccount);

  console.log(`✅ AML account created: ${accountId} for customer ${customerId}`);
  return newAccount;
};

// ── SIGNUP ────────────────────────────────────────────────────────────────────
export const signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // ── Step 1: Validate inputs ──────────────────────────────────────────────
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }

    // ── Step 2: Check for duplicate email ────────────────────────────────────
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "An account with this email already exists." });
    }

    // ── Step 3: Hash the password ────────────────────────────────────────────
    // bcrypt.hash(plainText, saltRounds)
    // saltRounds=10 means 2^10 = 1024 hashing iterations (secure but not slow)
    const hashedPassword = await bcrypt.hash(password, 10);

    // ── Step 4: Generate unique customer_id ───────────────────────────────────
    // Only for customers — analysts don't need AML accounts
    let customerId = null;
    const userRole = role || "customer";

    if (userRole === "customer") {
      customerId = await generateCustomerId();
      console.log(`Generated customer_id: ${customerId}`);
    }

    // ── Step 5: Save User to fraud_ui DB ─────────────────────────────────────
    const user = await User.create({
      name,
      email,
      password:    hashedPassword,
      role:        userRole,
      customer_id: customerId,     // null for analysts, number for customers
    });

    console.log(`✅ User created: ${user._id} | ${email} | role: ${userRole}`);

    // ── Step 6: Create account in aml_system (customers only) ────────────────
    if (userRole === "customer" && customerId) {
      try {
        await createAmlAccount(customerId, name);
      } catch (amlErr) {
        // If AML account creation fails, we still let signup succeed
        // The customer can retry linking from the dashboard
        console.error("⚠ AML account creation failed:", amlErr.message);
        // Don't return error — user is still created, just no AML account yet
      }
    }

    // ── Step 7: Return success ────────────────────────────────────────────────
    // We don't auto-login here — user must login manually
    // This keeps signup and login concerns separate (cleaner architecture)
    res.status(201).json({
      message:     "Account created successfully! Please log in.",
      customer_id: customerId,   // useful for debugging/display
    });

  } catch (error) {
    // This catches ALL errors from the above steps
    console.error("❌ Signup error:", error.message);
    res.status(500).json({ message: error.message });
  }
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── Step 1: Validate ─────────────────────────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    // ── Step 2: Find user ────────────────────────────────────────────────────
    const user = await User.findOne({ email });
    if (!user) {
      // Don't say "email not found" — security best practice is to be vague
      return res.status(400).json({ message: "Invalid credentials." });
    }

    // ── Step 3: Compare password ─────────────────────────────────────────────
    // bcrypt.compare(plainText, hashedFromDB) → true/false
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    // ── Step 4: Generate JWT token ────────────────────────────────────────────
    // jwt.sign(payload, secret, options)
    // payload: data to encode IN the token (readable by anyone, not secret)
    // secret: used to SIGN the token (only server knows this)
    // The frontend sends this token in every API request header
    const token = jwt.sign(
      {
        id:   user._id,    // so backend knows which user is making requests
        role: user.role,   // so backend can check permissions
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }  // token expires after 1 day
    );

    // ── Step 5: Return token + user info ─────────────────────────────────────
    // Frontend stores token in localStorage and uses it for all future requests
    res.json({
      token,
      user: {
        id:          user._id,
        name:        user.name,
        email:       user.email,
        role:        user.role,
        customer_id: user.customer_id,  // frontend uses this to know if setup needed
      },
    });

  } catch (error) {
    console.error("❌ Login error:", error.message);
    res.status(500).json({ message: error.message });
  }
};