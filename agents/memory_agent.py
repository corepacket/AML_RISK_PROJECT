from database.mongodb import customer_memory_col
from datetime import datetime


class MemoryAgent:

    def __init__(self, collection):
        # MongoDB collection for customer memory
        self.collection = collection

    def adjust_risk(self, customer_id: str, risk_score: int) -> int:
        """
        Read/update historical AML memory from MongoDB (Atlas or local).
        """
        doc = self.collection.find_one({"customer_id": customer_id}) or {
            "customer_id": customer_id,
            "past_risk_scores": [],
            "suspicious_count": 0,
            "total_transactions": 0,
            "total_sent_amount": 0.0,
            "avg_transaction_amount": 0.0,
            "updated_at": datetime.utcnow(),
        }

        history_scores = doc.get("past_risk_scores", [])
        suspicious_count = doc.get("suspicious_count", 0)

        # Simple example logic: bump risk if history is heavy
        if len(history_scores) > 3:
            risk_score += 10

        if suspicious_count >= 2:
            risk_score += 15

        # Update memory document
        history_scores.append(risk_score)
        doc["past_risk_scores"] = history_scores[-20:]  # keep last 20
        doc["suspicious_count"] = suspicious_count + (1 if risk_score > 70 else 0)
        doc["updated_at"] = datetime.utcnow()

        self.collection.update_one(
            {"customer_id": customer_id},
            {"$set": doc},
            upsert=True,
        )

        return risk_score


def memory_agent(state):

    print("🧠 Memory Agent: Adjusting risk based on historical behavior (MongoDB-backed)")

    findings = state.get("findings", [])
    if not findings:
        return state

    # Use the first suspicious account as the key into memory
    account_id = findings[0]["account"]
    base_risk = state.get("risk_score", 0)

    agent = MemoryAgent(customer_memory_col)
    adjusted = agent.adjust_risk(account_id, base_risk)

    # propagate adjusted risk into main risk_score for downstream agents
    state["adjusted_risk_score"] = adjusted
    state["risk_score"] = adjusted
    return state
