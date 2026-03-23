// backend/services/aiClient.js

// ── Circuit Breaker State ─────────────────────────────────────────────
const CB = {
  state: "CLOSED",      // CLOSED | OPEN | HALF_OPEN
  failures: 0,
  threshold: 5,
  resetAfterMs: 30000,
  openedAt: null,
};

function recordSuccess() {
  CB.failures = 0;
  CB.state = "CLOSED";
}

function recordFailure() {
  CB.failures++;
  if (CB.failures >= CB.threshold) {
    CB.state = "OPEN";
    CB.openedAt = Date.now();
    console.warn("⚡ Circuit OPEN — Python AI calls suspended for 30s");
  }
}

function circuitAllows() {
  if (CB.state === "CLOSED") return true;

  if (CB.state === "OPEN") {
    if (Date.now() - CB.openedAt > CB.resetAfterMs) {
      CB.state = "HALF_OPEN";
      console.info("⚡ Circuit HALF-OPEN — probing Python");
      return true;
    }
    return false;
  }

  return true; // HALF_OPEN
}

// ── Base URL ─────────────────────────────────────────────────────────
const PYTHON_AI_BASE_URL =
  process.env.PYTHON_AI_BASE_URL || "http://localhost:8000";

/**
 * Score a single transaction via Python AML microservice
 */
export async function scoreTransaction(txn) {

  // 🔥 STEP 1: CHECK CIRCUIT FIRST
  if (!circuitAllows()) {
    console.warn("⚡ Circuit OPEN — returning fallback");
    return _fallback(
      txn.transactionId || txn.transaction_id,
      "Circuit open"
    );
  }

  const url = `${PYTHON_AI_BASE_URL}/score_transaction`;

  // 🔥 YOUR PAYLOAD (UNCHANGED — SAME PLACE ✅)
  const payload = {
    transaction_id: txn.transactionId || txn.transaction_id,
    timestamp: txn.timestamp
      ? new Date(txn.timestamp).toISOString()
      : new Date().toISOString(),
    sender_customer_id: String(
      txn.senderCustomerId || txn.sender_customer_id || ""
    ),
    sender_account_id: String(
      txn.senderAccountId || txn.sender_account_id || ""
    ),
    receiver_customer_id: String(
      txn.receiverCustomerId || txn.receiver_customer_id || ""
    ),
    receiver_account_id: String(
      txn.receiverAccountId || txn.receiver_account_id || ""
    ),
    amount: Number(txn.amount),
    currency: txn.currency || "USD",
    payment_method:
      txn.paymentMethod || txn.payment_method || "UNKNOWN",
    description: txn.description || "",
    category: txn.category || "Transfer",
  };

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    console.error(
      "❌ aiClient: Python service unreachable:",
      networkErr.message
    );

    recordFailure(); // 🔥 ADDED

    return _fallback(payload.transaction_id, networkErr.message);
  }

  if (!response.ok) {
    const text = await response.text();

    console.error(
      `❌ aiClient: Python returned ${response.status}:`,
      text
    );

    recordFailure(); // 🔥 ADDED

    return _fallback(payload.transaction_id, text);
  }

  const body = await response.json();

  if (body.status !== "success") {
    console.error(
      "❌ aiClient: Python responded with error:",
      body.message
    );

    recordFailure(); // 🔥 ADDED

    return _fallback(payload.transaction_id, body.message);
  }

  // ✅ SUCCESS → RESET CIRCUIT
  recordSuccess(); // 🔥 ADDED

  return body.data;
}

// ── Fallback ─────────────────────────────────────────────────────────
function _fallback(transactionId, reason) {
  return {
    transaction_id: transactionId,
    risk_score: 0,
    risk_level: "Low",
    verdict: "Not Suspicious",
    explanation: `AI scoring unavailable: ${reason}. Transaction processed with default low-risk verdict.`,
    risk_flags: [],
    node_status: "PROCESSED",
  };
}