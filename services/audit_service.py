from datetime import datetime
from config.database import audit_logs_col
class AuditService:

    def log_action(self,log_data):
        
        log_data["timestamp"]=datetime.utcnow()
        audit_logs_col.insert_one(log_data)

        return {"status":"Logged"}
