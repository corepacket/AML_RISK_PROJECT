from pymongo import MongoClient
from pymongo.errors import PyMongoError
import os

# Prefer Atlas URI if provided, otherwise fall back to local MongoDB
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("MONGODB_DB_NAME", "aml_system")

client = MongoClient(MONGODB_URI)
db = client[DB_NAME]


def check_mongo_connection() -> bool:
    """
    Simple health check for MongoDB.
    Returns True if the server responds to a ping, False otherwise.
    """
    try:
        client.admin.command("ping")
        print("[OK] MongoDB ping successful")
        return True
    except PyMongoError as e:
        print(f"[ERROR] MongoDB connection check failed: {e}")
        return False


# Collections
transactions_col = db["transactions"]
accounts_col = db["accounts"]
customer_memory_col = db["customer_memory"]
cases_col = db["cases"]
audit_logs_col = db["audit_logs"]

print("[OK] MongoDB connected")
