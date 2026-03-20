from config.database import accounts_col
from datetime import datetime

class FlagService:

    def raise_flag(self, customer_id, reason):
        result = accounts_col.update_one(
            {"customer_id": customer_id},
            {
                "$set": {"account_status": "FLAGGED"},
                "$push": {"flags": reason},
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        return {"status": "Flag Raised", "modified": result.modified_count}
