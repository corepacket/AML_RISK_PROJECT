from config.database import cases_col
from datetime import datetime
import uuid

class CaseService:

    def create_case(self, customer_id, transaction_id, risk_score):

        case_id = str(uuid.uuid4())

        case = {
            "case_id": case_id,
            "customer_id": customer_id,
            "transaction_id": transaction_id,
            "risk_score": risk_score,
            "status": "OPEN",
            "created_at": datetime.utcnow()
        }

        cases_col.insert_one(case)

        return case
