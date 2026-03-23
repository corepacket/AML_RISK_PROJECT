from datetime import datetime
from collections import defaultdict
from typing import List, Dict, Any
from abc import ABC, abstractmethod

from database.mongodb import transactions_col


# ==========================================
# 1️⃣ PERCEPTION AGENT
# ==========================================
class TransactionPerceptionAgent:
    def observe(self) -> List[Dict[str, Any]]:
        transactions = list(
            transactions_col.find({"status": "PENDING"})
        )

        formatted = []

        for tx in transactions:
            formatted.append({
                "transaction_id": tx["transaction_id"],
                "timestamp": tx["timestamp"]
                if isinstance(tx["timestamp"], datetime)
                else datetime.fromisoformat(tx["timestamp"]),
                "sender": tx["sender_account_id"],
                "receiver": tx["receiver_account_id"],
                "amount": float(tx["amount"]),
                "payment_type": tx.get("payment_method", "UNKNOWN")
            })

        return formatted


# ==========================================
# 2️⃣ AGGREGATION AGENT
# ==========================================
class TransactionAggregationAgent:
    def group_by_sender(self, transactions):
        grouped = defaultdict(list)

        for tx in transactions:
            grouped[tx["sender"]].append(tx)

        return grouped


# ==========================================
# 3️⃣ STRATEGY BASE CLASS
# ==========================================
class PatternDetector(ABC):

    @abstractmethod
    def detect(self, txs):
        pass

    # ✅ Shared utility (your doubt solved)
    def total_amount(self, txs):
        return sum(t["amount"] for t in txs)


# ==========================================
# 4️⃣ STRATEGY IMPLEMENTATIONS
# ==========================================

class CircularFlowDetector(PatternDetector):
    def detect(self, txs):
        seen = set()
        for tx in txs:
            if tx["receiver"] in seen:
                return {
                    "pattern": "CIRCULAR_FLOW",
                    "description": "Funds returned to previous account",
                    "transaction_count": len(txs),
                    "total_amount": self.total_amount(txs)
                }
            seen.add(tx["sender"])
        return None


class StructuringDetector(PatternDetector):
    def detect(self, txs):
        total = self.total_amount(txs)

        if len(txs) >= 5 and total >= 10000:
            return {
                "pattern": "HIGH_FREQUENCY_SMALL_VALUE",
                "description": "Multiple small transactions",
                "transaction_count": len(txs),
                "total_amount": total
            }
        return None


class RapidMovementDetector(PatternDetector):
    def detect(self, txs):
        for i in range(len(txs) - 1):
            diff = (txs[i+1]["timestamp"] - txs[i]["timestamp"]).total_seconds()

            if diff <= 300:
                return {
                    "pattern": "RAPID_MOVEMENT",
                    "description": "Funds moved within 5 minutes",
                    "transaction_count": len(txs),
                    "total_amount": self.total_amount(txs)
                }
        return None


class AmountSpikeDetector(PatternDetector):
    def detect(self, txs):
        if len(txs) < 2:
            return None

        amounts = [t["amount"] for t in txs]
        avg = sum(amounts) / len(amounts)

        if any(a > 5 * avg for a in amounts):
            return {
                "pattern": "UNUSUAL_AMOUNT_SPIKE",
                "description": "Transaction higher than average",
                "transaction_count": len(txs),
                "total_amount": self.total_amount(txs)
            }
        return None


class DormantActivityDetector(PatternDetector):
    def detect(self, txs):
        txs = sorted(txs, key=lambda x: x["timestamp"])

        for i in range(1, len(txs)):
            gap = (txs[i]["timestamp"] - txs[i-1]["timestamp"]).days

            if gap > 90:
                return {
                    "pattern": "DORMANT_ACCOUNT_ACTIVITY",
                    "description": "Account inactive for 90+ days",
                    "transaction_count": len(txs),
                    "total_amount": self.total_amount(txs)
                }
        return None


# ==========================================
# 5️⃣ STRATEGY ENGINE
# ==========================================
class PatternEngine:
    def __init__(self):
        self.detectors = [
            CircularFlowDetector(),
            StructuringDetector(),
            RapidMovementDetector(),
            AmountSpikeDetector(),
            DormantActivityDetector()
        ]

    def run_all(self, grouped):
        findings = []

        for account, txs in grouped.items():
            txs = sorted(txs, key=lambda x: x["timestamp"])

            patterns = []

            for detector in self.detectors:
                result = detector.detect(txs)
                if result:
                    result["subject_account"] = account
                    patterns.append(result)

            if patterns:
                findings.append({
                    "account": account,
                    "patterns": patterns
                })

        return findings


# ==========================================
# 6️⃣ PATTERN AGENT (UPDATED)
# ==========================================
class TransactionPatternAgent:
    def __init__(self):
        self.engine = PatternEngine()

    def reason(self, grouped_transactions):
        return self.engine.run_all(grouped_transactions)


# ==========================================
# 7️⃣ MAIN TRANSACTION AGENT
# ==========================================
class TransactionAgent:

    def __init__(self):
        self.perception = TransactionPerceptionAgent()
        self.aggregation = TransactionAggregationAgent()
        self.pattern_agent = TransactionPatternAgent()

    def act(self):
        transactions = self.perception.observe()

        if not transactions:
            return {
                "agent": "TransactionAgent",
                "findings": []
            }

        grouped = self.aggregation.group_by_sender(transactions)
        findings = self.pattern_agent.reason(grouped)

        # mark processed
        transactions_col.update_many(
            {"status": "PENDING"},
            {"$set": {"status": "PROCESSED"}}
        )

        return {
            "agent": "TransactionAgent",
            "findings": findings
        }


# ==========================================
# 8️⃣ LANGGRAPH ADAPTER
# ==========================================
transaction_core = TransactionAgent()


def transaction_agent(state):

    if "transaction" in state and state["transaction"]:
        single_txn = state["transaction"]

        sender_account = single_txn.get("sender_account_id")

        from datetime import timedelta
        cutoff_date = single_txn.get("timestamp", datetime.utcnow()) - timedelta(days=30)

        historical_txns = list(
            transactions_col.find({
                "sender_account_id": sender_account,
                "timestamp": {"$gte": cutoff_date},
                "status": {"$ne": "PROCESSING"}
            }).sort("timestamp", -1).limit(50)
        )

        formatted_txns = []

        for tx in historical_txns:
            formatted_txns.append({
                "transaction_id": tx.get("transaction_id", str(tx.get("_id"))),
                "timestamp": tx["timestamp"] if isinstance(tx["timestamp"], datetime)
                else datetime.fromisoformat(str(tx["timestamp"])),
                "sender": tx["sender_account_id"],
                "receiver": tx["receiver_account_id"],
                "amount": float(tx["amount"]),
                "payment_type": tx.get("payment_method", "UNKNOWN")
            })

        formatted_txns.append({
            "transaction_id": single_txn.get("transaction_id"),
            "timestamp": single_txn["timestamp"] if isinstance(single_txn["timestamp"], datetime)
            else datetime.fromisoformat(str(single_txn["timestamp"])),
            "sender": single_txn["sender_account_id"],
            "receiver": single_txn["receiver_account_id"],
            "amount": float(single_txn["amount"]),
            "payment_type": single_txn.get("payment_method", "UNKNOWN")
        })

        formatted_txns = sorted(formatted_txns, key=lambda x: x["timestamp"])

        aggregation = TransactionAggregationAgent()
        pattern_agent = TransactionPatternAgent()

        grouped = aggregation.group_by_sender(formatted_txns)
        findings = pattern_agent.reason(grouped)

        state["findings"] = findings
        return state

    else:
        result = transaction_core.act()
        state["findings"] = result["findings"]
        return state