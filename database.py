from pymongo import MongoClient
from datetime import datetime


client=MongoClient("mongodb://localhost:27017/")

db=client["aml_system"]

transaction_col=db["transactions"]
accounts_cols=db["accounts"]
customer_memory_col = db["customer_memory"]
cases_col = db["cases"]
audit_logs_col = db["audit_logs"]