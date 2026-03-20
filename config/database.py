from pymongo import MongoClient
import os

# Prefer Atlas URI if provided, otherwise fall back to local MongoDB
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("MONGODB_DB_NAME", "aml_system")

client = MongoClient(MONGODB_URI)
db = client[DB_NAME]

# Define collections (VERY IMPORTANT)
transactions_col = db["transactions"]
accounts_col = db["accounts"]
customer_memory_col = db["customer_memory"]
cases_col = db["cases"]
audit_logs_col = db["audit_logs"]

print(f"[OK] MongoDB connected successfully to {DB_NAME}")
