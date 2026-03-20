from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import os
import shutil
import pandas as pd
from typing import List, Any, Dict
from datetime import datetime
import uuid

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
            transactions_col.insert_one(txn)

            # Run AML pipeline (same as main.py)
            final_state = run_aml_pipeline(txn)
            
            # Update transaction status to PROCESSED after analysis
            transactions_col.update_one(
                {"transaction_id": txn["transaction_id"]},
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

