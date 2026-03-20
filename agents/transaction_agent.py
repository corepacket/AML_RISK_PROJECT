from datetime import datetime
from collections import defaultdict
from typing import List, Dict, Any

from database.mongodb import transactions_col


# ==========================================
# 1️⃣ PERCEPTION AGENT (MongoDB Version)
# ==========================================
class TransactionPerceptionAgent:
    """
    Reads PENDING transactions from MongoDB
    """

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
# 3️⃣ PATTERN REASONING AGENT
# ==========================================
class TransactionPatternAgent:

    def detect_cycle_behavior(self, txs):
        seen_accounts = set()

        for tx in txs:
            if tx["receiver"] in seen_accounts:
                return {
                    "pattern": "CIRCULAR_FLOW",
                    "description": "Funds returned to previously involved account",
                    "transaction_count": len(txs),
                    "total_amount": sum(t["amount"] for t in txs)
                }
            seen_accounts.add(tx["sender"])

        return None

    def detect_structuring_behavior(self, txs):
        total = sum(t["amount"] for t in txs)

        if len(txs) >= 5 and total >= 10000:
            return {
                "pattern": "HIGH_FREQUENCY_SMALL_VALUE",
                "description": "Multiple small transactions over short duration",
                "transaction_count": len(txs),
                "total_amount": total
            }

        return None

    def detect_rapid_movement_with_5min(self, txs):
        for i in range(len(txs) - 1):
            time_diff = (
                txs[i + 1]["timestamp"] - txs[i]["timestamp"]
            ).total_seconds()

            if time_diff <= 300:
                return {
                    "pattern": "RAPID_MOVEMENT",
                    "description": "Funds moved within 5 minutes",
                    "transaction_count": len(txs),
                    "total_amount": sum(t["amount"] for t in txs)
                }

        return None

    def detect_amount_spike(self, txs):
        if len(txs) < 2:
            return None

        amounts = [t["amount"] for t in txs]
        avg = sum(amounts) / len(amounts)

        for amount in amounts:
            if amount > 5 * avg:
                return {
                    "pattern": "UNUSUAL_AMOUNT_SPIKE",
                    "description": "Transaction significantly higher than average",
                    "transaction_count": len(txs),
                    "total_amount": sum(amounts)
                }

        return None

    def detect_dormant_activity(self, txs):
        txs = sorted(txs, key=lambda x: x["timestamp"])

        for i in range(1, len(txs)):
            gap = (txs[i]["timestamp"] - txs[i - 1]["timestamp"]).days
            if gap > 90:
                return {
                    "pattern": "DORMANT_ACCOUNT_ACTIVITY",
                    "description": "Account inactive for 90+ days before activity",
                    "transaction_count": len(txs),
                    "total_amount": sum(t["amount"] for t in txs)
                }

        return None
    
    def detect_large_amount(self, txn):
        """Detect suspiciously large single transaction"""
        if txn["amount"] > 50000:  # $50k threshold
            return {
                "pattern": "UNUSUAL_AMOUNT_SPIKE",
                "description": f"Large transaction amount: ${txn['amount']:,.2f}",
                "transaction_count": 1,
                "total_amount": txn["amount"]
            }
        return None
    
    def detect_high_risk_payment_method(self, txn):
        """Detect high-risk payment methods"""
        high_risk_methods = ["CRYPTO", "CASH", "WIRE"]
        if txn.get("payment_type", "").upper() in high_risk_methods:
            return {
                "pattern": "HIGH_FREQUENCY_SMALL_VALUE",  # Reuse pattern for risk scoring
                "description": f"High-risk payment method: {txn.get('payment_type')}",
                "transaction_count": 1,
                "total_amount": txn["amount"]
            }
        return None

    def reason(self, grouped_transactions):
        findings = []

        detectors = [
            self.detect_cycle_behavior,
            self.detect_structuring_behavior,
            self.detect_rapid_movement_with_5min,
            self.detect_amount_spike,
            self.detect_dormant_activity
        ]

        for account, txs in grouped_transactions.items():
            txs = sorted(txs, key=lambda x: x["timestamp"])

            account_patterns = []

            for detector in detectors:
                result = detector(txs)
                if result:
                    result["subject_account"] = account
                    account_patterns.append(result)

            if account_patterns:
                findings.append({
                    "account": account,
                    "patterns": account_patterns
                })

        return findings


# ==========================================
# 4️⃣ TRANSACTION AGENT (ORCHESTRATOR)
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

        # ✅ Mark processed transactions
        transactions_col.update_many(
            {"status": "PENDING"},
            {"$set": {"status": "PROCESSED"}}
        )

        return {
            "agent": "TransactionAgent",
            "findings": findings
        }


# ==========================================
# LangGraph Adapter
# ==========================================
transaction_core = TransactionAgent()


def transaction_agent(state):
    """
    Analyze transaction(s) for suspicious patterns.
    If state contains a single transaction, analyze it with historical context.
    Otherwise, process all PENDING transactions from MongoDB.
    """
    # Check if we're processing a single transaction (from API)
    if "transaction" in state and state["transaction"]:
        single_txn = state["transaction"]
        
        # Get historical transactions for this account to detect patterns
        sender_account = single_txn.get("sender_account_id")
        
        # Query recent transactions for this sender account (last 30 days or last 50 transactions)
        from datetime import timedelta
        cutoff_date = single_txn.get("timestamp", datetime.utcnow()) - timedelta(days=30)
        
        historical_txns = list(
            transactions_col.find({
                "sender_account_id": sender_account,
                "timestamp": {"$gte": cutoff_date},
                "status": {"$ne": "PROCESSING"}  # Exclude currently processing
            }).sort("timestamp", -1).limit(50)
        )
        
        # Format transactions for pattern detection
        formatted_txns = []
        for tx in historical_txns:
            formatted_txns.append({
                "transaction_id": tx.get("transaction_id", str(tx.get("_id"))),
                "timestamp": tx["timestamp"] if isinstance(tx["timestamp"], datetime) else datetime.fromisoformat(str(tx["timestamp"])),
                "sender": tx["sender_account_id"],
                "receiver": tx["receiver_account_id"],
                "amount": float(tx["amount"]),
                "payment_type": tx.get("payment_method", "UNKNOWN")
            })
        
        # Add the current transaction
        formatted_txns.append({
            "transaction_id": single_txn.get("transaction_id"),
            "timestamp": single_txn["timestamp"] if isinstance(single_txn["timestamp"], datetime) else datetime.fromisoformat(str(single_txn["timestamp"])),
            "sender": single_txn["sender_account_id"],
            "receiver": single_txn["receiver_account_id"],
            "amount": float(single_txn["amount"]),
            "payment_type": single_txn.get("payment_method", "UNKNOWN")
        })
        
        # Sort by timestamp
        formatted_txns = sorted(formatted_txns, key=lambda x: x["timestamp"])
        
        # Group by sender and detect patterns
        aggregation = TransactionAggregationAgent()
        pattern_agent = TransactionPatternAgent()
        grouped = aggregation.group_by_sender(formatted_txns)
        findings = pattern_agent.reason(grouped)
        
        # If no patterns found from multi-transaction analysis, check single transaction
        if not findings:
            current_txn_formatted = formatted_txns[-1]  # The most recent (current) transaction
            single_txn_patterns = []
            
            # Check for large amount
            large_amt = pattern_agent.detect_large_amount(current_txn_formatted)
            if large_amt:
                single_txn_patterns.append(large_amt)
            
            # Check for high-risk payment method
            risky_payment = pattern_agent.detect_high_risk_payment_method(current_txn_formatted)
            if risky_payment:
                single_txn_patterns.append(risky_payment)
            
            # If any single-transaction patterns found, create findings
            if single_txn_patterns:
                findings = [{
                    "account": current_txn_formatted["sender"],
                    "patterns": single_txn_patterns
                }]
        
        state["findings"] = findings
        return state
    else:
        # Batch processing mode (original behavior)
        result = transaction_core.act()
        state["findings"] = result["findings"]
        return state

