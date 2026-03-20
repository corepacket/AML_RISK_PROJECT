

from config.database import accounts_col
from datetime import datetime

class AccountService:

    def freeze_account(self, customer_id):
        result = accounts_col.update_one(
            {"customer_id": customer_id},
            {"$set": {
                "account_status": "FROZEN",
                "updated_at": datetime.utcnow()
            }}
        )
        return {"status": "Account Frozen", "modified": result.modified_count}
