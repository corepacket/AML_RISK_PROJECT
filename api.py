from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import pandas as pd
from typing import List, Any, Dict
from datetime import datetime
import uuid
from pydantic import BaseModel
from typing import Optional

from database.mongodb import transactions_col
from agents.transaction_agent import transaction_agent
from agents.policy_agent import policy_agent
from agents.memory_agent import memory_agent
from agents.decision_agent import decision_agent
from agents.action_agent import action_agent
from rag.vector_store import load_vector_store
from rag.retriever import build_policy_retriever, StubRetriever
from langchain_openai import OpenAIEmbeddings
from config.rag_config import OPEN_API_KEY
import os as _os

# --------- Models / Retriever Init ----------
_api_key = (_os.getenv("OPENAI_API_KEY") or OPEN_API_KEY or "").strip()
if _api_key:
    _os.environ["OPENAI_API_KEY"] = _api_key
    try:
        _embedding_model = OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=_api_key)
        _vectorstore = load_vector_store(_embedding_model, "db")
        retriever = build_policy_retriever(_embedding_model, "db")
    except Exception:
        retriever = StubRetriever()
else:
    retriever = StubRetriever()


def run_aml_pipeline(txn):
    """Run the AML pipeline for a single transaction (same as main.py)"""
    state = {"transaction": txn}
    
    state = transaction_agent(state)
    state = policy_agent(state, retriever)
    state = memory_agent(state)
    state = decision_agent(state)
    state = action_agent(state)
    
    return state


app = FastAPI(title="AML Risk Scoring API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


RISK_TO_STATUS = {
    "High": "BLOCKED",
    "Medium": "FLAGGED",
    "Low": "PROCESSED",
}


def _save_upload_to_disk(upload: UploadFile, folder: str = "uploads") -> str:
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, upload.filename)

    with open(path, "wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)

    return path


def _load_transactions_from_csv(path: str) -> List[Dict[str, Any]]:
    df = pd.read_csv(path)
    # Expect same columns as your existing loader
    expected_cols = {
        "Timestamp",
        "Sender_ID",
        "Sender_Account",
        "Receiver_ID",
        "Receiver_Account",
        "Amount_USD",
        "Currency_USD",
        "Payment_Type",
    }
    if not expected_cols.issubset(set(df.columns)):
        raise ValueError(f"CSV missing required columns: {expected_cols - set(df.columns)}")

    txns: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        # Parse timestamp to match ingestion format
        try:
            timestamp = datetime.strptime(row["Timestamp"], "%Y/%m/%d %H:%M")
        except (ValueError, TypeError):
            # Fallback: try ISO format or use current time
            try:
                timestamp = datetime.fromisoformat(str(row["Timestamp"]))
            except:
                timestamp = datetime.utcnow()
        
        txns.append(
            {
                "transaction_id": str(uuid.uuid4()),
                "timestamp": timestamp,
                "sender_customer_id": row["Sender_ID"],
                "sender_account_id": row["Sender_Account"],
                "receiver_customer_id": row["Receiver_ID"],
                "receiver_account_id": row["Receiver_Account"],
                "amount": float(row["Amount_USD"]),
                "currency": row["Currency_USD"],
                "payment_method": row["Payment_Type"],
                "status": "PENDING",
                "risk_score": 0,
                "risk_flags": [],
                "created_at": datetime.utcnow()
            }
        )
    return txns


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "rag_ready": not isinstance(retriever, StubRetriever),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/score_transaction")
async def score_transaction(txn: TransactionInput):
    """
    Score one transaction and return a backend-compatible response.
    """
    try:
        ts = datetime.utcnow()
        if txn.timestamp:
            try:
                ts = datetime.fromisoformat(txn.timestamp.replace("Z", "+00:00"))
            except Exception:
                ts = datetime.utcnow()

        transaction = {
            "transaction_id": txn.transaction_id,
            "timestamp": ts,
            "sender_customer_id": txn.sender_customer_id or "",
            "sender_account_id": txn.sender_account_id,
            "receiver_customer_id": txn.receiver_customer_id or "",
            "receiver_account_id": txn.receiver_account_id,
            "amount": txn.amount,
            "currency": txn.currency,
            "payment_method": txn.payment_method,
            "description": txn.description,
            "category": txn.category,
            "status": "PROCESSING",
            "risk_score": 0,
            "risk_flags": [],
            "created_at": datetime.utcnow(),
        }

        final_state = run_aml_pipeline(transaction)
        decision = final_state.get("final_decision", {})
        findings = final_state.get("findings", [])

        risk_flags = []
        for finding in findings:
            for pattern in finding.get("patterns", []):
                pat = pattern.get("pattern")
                if pat and pat not in risk_flags:
                    risk_flags.append(pat)

        risk_score = decision.get("risk_score", final_state.get("risk_score", 0))
        risk_level = decision.get("risk_level", "Low")
        verdict = decision.get("verdict", "Not Suspicious")
        explanation = decision.get("explanation", "")
        node_status = RISK_TO_STATUS.get(risk_level, "PROCESSED")
        policy_context = final_state.get("policy_context", "")

        return {
            "status": "success",
            "message": "Transaction scored successfully.",
            "data": {
                "transaction_id": txn.transaction_id,
                "risk_score": risk_score,
                "risk_level": risk_level,
                "verdict": verdict,
                "explanation": explanation,
                "risk_flags": risk_flags,
                "node_status": node_status,
                "policy_context": policy_context,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring failed: {str(e)}")


@app.post("/upload_transactions")
async def upload_transactions(file: UploadFile = File(...)):
    """
    Upload a CSV of transactions, run AML graph per transaction,
    and return risk scores & decisions.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    try:
        saved_path = _save_upload_to_disk(file)
        txns = _load_transactions_from_csv(saved_path)

        results = []
        for txn in txns:
            # Store in Mongo (Atlas) first with PROCESSING status
            txn["status"] = "PROCESSING"
            # Important: Node backend schemas often use `transactionId` (camelCase) with a unique index.
            # Ensure both keys are present to avoid duplicate key errors on { transactionId: null }.
            txn["transactionId"] = txn.get("transaction_id")
            transactions_col.insert_one(txn)

            # Run AML pipeline (same as main.py)
            final_state = run_aml_pipeline(txn)
            
            # Update transaction status to PROCESSED after analysis
            transactions_col.update_one(
                {"transactionId": txn["transaction_id"]},
                {"$set": {"status": "PROCESSED", "risk_score": final_state.get("risk_score", 0)}}
            )

            final_decision = final_state.get("final_decision", {})
            findings = final_state.get("findings", [])
            policy_context = final_state.get("policy_context", "")
            
            # Extract pattern details for better visibility
            pattern_details = []
            for finding in findings:
                for pattern in finding.get("patterns", []):
                    pattern_details.append({
                        "pattern": pattern.get("pattern"),
                        "description": pattern.get("description"),
                        "account": finding.get("account")
                    })
            
            results.append(
                {
                    "transaction_id": txn.get("transaction_id"),
                    "amount": txn.get("amount"),
                    "sender_account": txn.get("sender_account_id"),
                    "receiver_account": txn.get("receiver_account_id"),
                    "risk_score": final_decision.get("risk_score", 0),
                    "risk_level": final_decision.get("risk_level", "Low"),
                    "verdict": final_decision.get("verdict", "Not Suspicious"),
                    "explanation": final_decision.get("explanation", ""),
                    "findings_count": len(findings),
                    "patterns_detected": pattern_details,
                    "has_suspicious_patterns": len(findings) > 0
                }
            )

        return JSONResponse(content={"results": results})

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

