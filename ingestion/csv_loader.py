import os
import pandas as pd
import uuid
from datetime import datetime
from database.mongodb import (
    transactions_col,
    accounts_col,
    customer_memory_col
)

# ---------- CSV PATH (SAFE & ABSOLUTE) ----------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
csv_path = os.path.join(BASE_DIR, "clean_transactions.csv")


def load_transactions(csv_path: str):
    # Load CSV
    df = pd.read_csv(csv_path)

    print("CSV loaded successfully")
    print("Columns:", df.columns.tolist())
    print("Total rows:", len(df))

    # Iterate rows
    for _, row in df.iterrows():

        txn_doc = {
            "transaction_id": str(uuid.uuid4()),
            "timestamp": datetime.strptime(row["Timestamp"], "%Y/%m/%d %H:%M"),

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

        transactions_col.insert_one(txn_doc)

        # Sender account
        accounts_col.update_one(
            {"account_id": row["Sender_Account"]},
            {"$setOnInsert": {
                "customer_id": row["Sender_ID"],
                "account_status": "ACTIVE",
                "risk_score": 0,
                "flags": [],
                "created_at": datetime.utcnow()
            }},
            upsert=True
        )

        # Receiver account
        accounts_col.update_one(
            {"account_id": row["Receiver_Account"]},
            {"$setOnInsert": {
                "customer_id": row["Receiver_ID"],
                "account_status": "ACTIVE",
                "risk_score": 0,
                "flags": [],
                "created_at": datetime.utcnow()
            }},
            upsert=True
        )

        # Customer memory
        customer_memory_col.update_one(
            {"customer_id": row["Sender_ID"]},
            {"$setOnInsert": {
                "total_transactions": 0,
                "total_sent_amount": 0.0,
                "avg_transaction_amount": 0.0,
                "historical_risk_scores": [],
                "suspicious_count": 0,
                "last_suspicious_date": None,
                "usual_currency": row["Currency_USD"],
                "usual_payment_method": row["Payment_Type"],
                "behavior_profile": {},
                "created_at": datetime.utcnow()
            }},
            upsert=True
        )

    print("✅ CSV Data Loaded Successfully")
    print(df.head())


# ---------- ENTRY POINT ----------
if __name__ == "__main__":
    load_transactions(csv_path)
