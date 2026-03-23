# api.py  —  AML Python Microservice
# Run with:  uvicorn api:app --host 0.0.0.0 --port 8000 --reload

import os
import logging
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

# ── Internal imports ──────────────────────────────────────────────────────────
from config.rag_config import (
    POLICY_PDF_PATH,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    EMBEDDING_MODEL_NAME,
    VECTOR_DB_DIR,
)
from rag.embedder import get_embedding_model
from rag.retriever import build_policy_retriever, StubRetriever
from agents.aml_graph import build_aml_graph

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="AML AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Bootstrap RAG retriever once at startup ───────────────────────────────────
retriever = None

@app.on_event("startup")
def startup_event():
    global retriever
    try:
        if not os.path.exists(POLICY_PDF_PATH):
            logger.warning(
                f"⚠  Policy PDF not found at '{POLICY_PDF_PATH}'. "
                "Using StubRetriever — verdicts will be rule-based only."
            )
            retriever = StubRetriever()
            return

        if not os.path.exists(VECTOR_DB_DIR):
            logger.info("📄 Vector DB not found — building from PDF...")
            from rag.loader import load_policy_pdf
            from rag.chunker import chunk_policy_document
            from rag.vector_store import create_vector_store

            docs = load_policy_pdf(POLICY_PDF_PATH)
            chunks = chunk_policy_document(docs, CHUNK_SIZE, CHUNK_OVERLAP)
            embedding_model = get_embedding_model(EMBEDDING_MODEL_NAME)
            create_vector_store(chunks, embedding_model, VECTOR_DB_DIR)
            logger.info("✅ Vector DB built and persisted.")

        embedding_model = get_embedding_model(EMBEDDING_MODEL_NAME)
        retriever = build_policy_retriever(embedding_model, VECTOR_DB_DIR)
        logger.info("✅ RAG retriever ready.")

    except Exception as e:
        logger.error(f"❌ RAG init failed: {e}. Falling back to StubRetriever.")
        retriever = StubRetriever()


# ── Request / Response schemas ────────────────────────────────────────────────
class TransactionInput(BaseModel):
    transaction_id: str
    timestamp: Optional[str] = None
    sender_customer_id: Optional[str] = None
    sender_account_id: str
    receiver_customer_id: Optional[str] = None
    receiver_account_id: str
    amount: float
    currency: Optional[str] = "USD"
    payment_method: Optional[str] = "UNKNOWN"
    description: Optional[str] = ""
    category: Optional[str] = "Transfer"


class ScoreResponse(BaseModel):
    status: str          # "success" | "error"
    message: str
    data: dict


# ── Risk level → Node status mapping ─────────────────────────────────────────
RISK_TO_STATUS = {
    "High":   "BLOCKED",
    "Medium": "FLAGGED",
    "Low":    "PROCESSED",
}


# ── Main scoring endpoint ─────────────────────────────────────────────────────
@app.post("/score_transaction", response_model=ScoreResponse)
async def score_transaction(txn: TransactionInput):
    """
    Receives a single transaction from Node, runs the full AML agent pipeline,
    and returns risk_score, risk_level, verdict, explanation, and status.
    """
    global retriever

    if retriever is None:
        retriever = StubRetriever()

    try:
        # Parse timestamp
        ts = datetime.utcnow()
        if txn.timestamp:
            try:
                ts = datetime.fromisoformat(txn.timestamp.replace("Z", "+00:00"))
            except Exception:
                ts = datetime.utcnow()

        # Build initial state for the LangGraph pipeline
        initial_state = {
            "transaction": {
                "transaction_id":    txn.transaction_id,
                "timestamp":         ts,
                "sender_customer_id": txn.sender_customer_id or "",
                "sender_account_id":  txn.sender_account_id,
                "receiver_customer_id": txn.receiver_customer_id or "",
                "receiver_account_id":  txn.receiver_account_id,
                "amount":            txn.amount,
                "currency":          txn.currency,
                "payment_method":    txn.payment_method,
                "description":       txn.description,
                "category":          txn.category,
            },
            "findings": [],
            "risk_score": 0,
        }

        # Run the AML graph
        aml_graph = build_aml_graph(retriever)
        final_state = aml_graph.invoke(initial_state)

        # Extract results
        decision = final_state.get("final_decision", {})
        risk_score  = decision.get("risk_score", 0)
        risk_level  = decision.get("risk_level", "Low")
        verdict     = decision.get("verdict", "Not Suspicious")
        explanation = decision.get("explanation", "No explanation available.")

        # Derive risk_flags from findings
        findings = final_state.get("findings", [])
        risk_flags = []
        for f in findings:
            for p in f.get("patterns", []):
                pat = p.get("pattern")
                if pat and pat not in risk_flags:
                    risk_flags.append(pat)

        # Map risk_level → Node-facing status
        node_status = RISK_TO_STATUS.get(risk_level, "PROCESSED")

        # Optional: policy context for debugging
        policy_context = final_state.get("policy_context", "")

        return {
            "status":  "success",
            "message": "Transaction scored successfully.",
            "data": {
                "transaction_id": txn.transaction_id,
                "risk_score":     risk_score,
                "risk_level":     risk_level,
                "verdict":        verdict,
                "explanation":    explanation,
                "risk_flags":     risk_flags,
                "node_status":    node_status,   # PROCESSED | FLAGGED | BLOCKED
                "policy_context": policy_context,
            }
        }

    except Exception as e:
        logger.error(f"❌ Scoring error for txn {txn.transaction_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "rag_ready": not isinstance(retriever, StubRetriever),
        "timestamp": datetime.utcnow().isoformat(),
    }