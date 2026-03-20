import pandas as pd
import uuid
from datetime import datetime
from database import transactions_col, accounts_col, customer_memory_col

df = pd.read_csv("clean_transactions.csv", header=None)

df.columns = [
    "timestamp",
    "sender_customer_id",
    "sender_account_id",
    "receiver_customer_id",
    "receiver_account_id",
    "amount",
    "currency",
    "original_amount",
    "original_currency",
    "payment_method"
]

for _, row in df.iterrows():

    txn_doc = {
        "transaction_id": str(uuid.uuid4()),
        "timestamp": datetime.strptime(row["timestamp"], "%Y/%m/%d %H:%M"),
        "sender": {
            "customer_id": row["sender_customer_id"],
            "account_id": row["sender_account_id"]
        },
        "receiver": {
            "customer_id": row["receiver_customer_id"],
            "account_id": row["receiver_account_id"]
        },
        "amount": float(row["amount"]),
        "currency": row["currency"],
        "original_amount": float(row["original_amount"]),
        "original_currency": row["original_currency"],
        "payment_method": row["payment_method"],
        "risk_flags": [],
        "risk_score": 0,
        "created_at": datetime.utcnow()
    }

    transactions_col.insert_one(txn_doc)

    # Sender account
    accounts_col.update_one(
        {"account_id": row["sender_account_id"]},
        {
            "$setOnInsert": {
                "account_id": row["sender_account_id"],
                "customer_id": row["sender_customer_id"],
                "account_status": "ACTIVE",
                "risk_score": 0,
                "flags": [],
                "created_at": datetime.utcnow()
            }
        },
        upsert=True
    )

    # Receiver account
    accounts_col.update_one(
        {"account_id": row["receiver_account_id"]},
        {
            "$setOnInsert": {
                "account_id": row["receiver_account_id"],
                "customer_id": row["receiver_customer_id"],
                "account_status": "ACTIVE",
                "risk_score": 0,
                "flags": [],
                "created_at": datetime.utcnow()
            }
        },
        upsert=True
    )

    # Customer memory
    customer_memory_col.update_one(
        {"customer_id": row["sender_customer_id"]},
        {
            "$setOnInsert": {
                "customer_id": row["sender_customer_id"],
                "total_transactions": 0,
                "total_sent_amount": 0.0,
                "avg_transaction_amount": 0.0,
                "historical_risk_scores": [],
                "suspicious_count": 0,
                "last_suspicious_date": None,
                "updated_at": datetime.utcnow()
            }
        },
        upsert=True
    )

print("Data inserted successfully.")
