# agents/transaction_agent.py
# Strategy pattern — fully correct version
# Bugs fixed:
#   1. cutoff_date always uses datetime.utcnow() — never from txn.timestamp (avoids str crash)
#   2. Historical Mongo docs skipped if required fields missing (no KeyError)
#   3. LargeAmountDetector + HighRiskPaymentDetector added to PatternEngine
#   4. Single-txn fallback runs inside PatternEngine when len(txs)==1

from datetime import datetime, timedelta
from collections import defaultdict
from typing import List, Dict, Any
from abc import ABC, abstractmethod

from database.mongodb import transactions_col


# ══════════════════════════════════════════════════════
# 1. PERCEPTION AGENT
# ══════════════════════════════════════════════════════
class TransactionPerceptionAgent:
    def observe(self) -> List[Dict[str, Any]]:
        transactions = list(transactions_col.find({"status": "PENDING"}))
        formatted = []
        for tx in transactions:
            if not tx.get("sender_account_id") or not tx.get("receiver_account_id"):
                continue
            try:
                ts = tx["timestamp"] if isinstance(tx["timestamp"], datetime) \
                     else datetime.fromisoformat(str(tx["timestamp"]))
            except Exception:
                ts = datetime.utcnow()
            formatted.append({
                "transaction_id": tx.get("transaction_id", str(tx.get("_id", ""))),
                "timestamp":      ts,
                "sender":         tx["sender_account_id"],
                "receiver":       tx["receiver_account_id"],
                "amount":         float(tx.get("amount", 0)),
                "payment_type":   tx.get("payment_method", "UNKNOWN"),
            })
        return formatted


# ══════════════════════════════════════════════════════
# 2. AGGREGATION AGENT
# ══════════════════════════════════════════════════════
class TransactionAggregationAgent:
    def group_by_sender(self, transactions):
        grouped = defaultdict(list)
        for tx in transactions:
            grouped[tx["sender"]].append(tx)
        return grouped


# ══════════════════════════════════════════════════════
# 3. STRATEGY BASE CLASS
# ══════════════════════════════════════════════════════
class PatternDetector(ABC):

    @abstractmethod
    def detect(self, txs: list) -> dict | None:
        pass

    def total_amount(self, txs: list) -> float:
        return sum(t["amount"] for t in txs)


# ══════════════════════════════════════════════════════
# 4. MULTI-TRANSACTION STRATEGY IMPLEMENTATIONS
# ══════════════════════════════════════════════════════

class CircularFlowDetector(PatternDetector):
    def detect(self, txs):
        seen = set()
        for tx in txs:
            if tx["receiver"] in seen:
                return {
                    "pattern":           "CIRCULAR_FLOW",
                    "description":       "Funds returned to previous account",
                    "transaction_count": len(txs),
                    "total_amount":      self.total_amount(txs),
                }
            seen.add(tx["sender"])
        return None


class StructuringDetector(PatternDetector):
    def detect(self, txs):
        total = self.total_amount(txs)
        if len(txs) >= 5 and total >= 10000:
            return {
                "pattern":           "HIGH_FREQUENCY_SMALL_VALUE",
                "description":       "Multiple small transactions",
                "transaction_count": len(txs),
                "total_amount":      total,
            }
        return None


class RapidMovementDetector(PatternDetector):
    def detect(self, txs):
        for i in range(len(txs) - 1):
            diff = (txs[i+1]["timestamp"] - txs[i]["timestamp"]).total_seconds()
            if diff <= 300:
                return {
                    "pattern":           "RAPID_MOVEMENT",
                    "description":       "Funds moved within 5 minutes",
                    "transaction_count": len(txs),
                    "total_amount":      self.total_amount(txs),
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
                "pattern":           "UNUSUAL_AMOUNT_SPIKE",
                "description":       "Transaction significantly higher than average",
                "transaction_count": len(txs),
                "total_amount":      self.total_amount(txs),
            }
        return None


class DormantActivityDetector(PatternDetector):
    def detect(self, txs):
        txs_sorted = sorted(txs, key=lambda x: x["timestamp"])
        for i in range(1, len(txs_sorted)):
            gap = (txs_sorted[i]["timestamp"] - txs_sorted[i-1]["timestamp"]).days
            if gap > 90:
                return {
                    "pattern":           "DORMANT_ACCOUNT_ACTIVITY",
                    "description":       "Account inactive for 90+ days",
                    "transaction_count": len(txs),
                    "total_amount":      self.total_amount(txs),
                }
        return None


# ══════════════════════════════════════════════════════
# 5. SINGLE-TRANSACTION STRATEGY IMPLEMENTATIONS
#    Bug fix: these were missing — so single $75k WIRE
#    returned findings=[] → risk_score=0 → "Not Suspicious"
#
#    They use the SAME base class and interface.
#    PatternEngine calls them only when len(txs) == 1.
# ══════════════════════════════════════════════════════

class LargeAmountDetector(PatternDetector):
    THRESHOLD = 50_000

    def detect(self, txs):
        if not txs:
            return None
        # Detect large amounts even when multiple transactions exist (CSV batches / history)
        txn = max(txs, key=lambda t: float(t.get("amount", 0) or 0))
        if float(txn.get("amount", 0) or 0) > self.THRESHOLD:
            return {
                "pattern":           "LARGE_SINGLE_TRANSACTION",
                "description":       f"Large single transaction: ${txn['amount']:,.2f}",
                "transaction_count": len(txs),
                "total_amount":      float(txn.get("amount", 0) or 0),
            }
        return None


class HighRiskPaymentDetector(PatternDetector):
    HIGH_RISK = {"CRYPTO", "CASH", "WIRE"}

    def detect(self, txs):
        if len(txs) != 1:
            return None
        txn    = txs[0]
        method = str(txn.get("payment_type", "")).upper()
        if method in self.HIGH_RISK:
            return {
                "pattern":           "HIGH_FREQUENCY_SMALL_VALUE",
                "description":       f"High-risk payment method: {method}",
                "transaction_count": 1,
                "total_amount":      txn["amount"],
            }
        return None


# ══════════════════════════════════════════════════════
# 6. PATTERN ENGINE
#    Owns ALL detectors. To add a new AML rule:
#    1. Write a new PatternDetector subclass above
#    2. Add it to the correct list below
#    Zero changes anywhere else.
# ══════════════════════════════════════════════════════
class PatternEngine:

    def __init__(self):
        self.multi_detectors = [
            CircularFlowDetector(),
            StructuringDetector(),
            RapidMovementDetector(),
            AmountSpikeDetector(),
            DormantActivityDetector(),
            # Run large-amount detector in multi mode so it triggers in CSV batches too
            LargeAmountDetector(),
        ]
        self.single_detectors = [
            HighRiskPaymentDetector(),
        ]

    def run_all(self, grouped: dict) -> list:
        findings = []

        for account, txs in grouped.items():
            txs      = sorted(txs, key=lambda x: x["timestamp"])
            patterns = []

            # Multi-transaction detectors first
            for detector in self.multi_detectors:
                result = detector.detect(txs)
                if result:
                    result["subject_account"] = account
                    patterns.append(result)

            # Bug 3+4 fix: single-txn fallback — only when no multi-patterns found
            if not patterns and len(txs) == 1:
                for detector in self.single_detectors:
                    result = detector.detect(txs)
                    if result:
                        result["subject_account"] = account
                        patterns.append(result)

            if patterns:
                findings.append({"account": account, "patterns": patterns})

        return findings


# ══════════════════════════════════════════════════════
# 7. PATTERN AGENT (thin wrapper — keeps original interface)
# ══════════════════════════════════════════════════════
class TransactionPatternAgent:
    def __init__(self):
        self.engine = PatternEngine()

    def reason(self, grouped_transactions: dict) -> list:
        return self.engine.run_all(grouped_transactions)


# ══════════════════════════════════════════════════════
# 8. MAIN TRANSACTION AGENT (batch mode)
# ══════════════════════════════════════════════════════
class TransactionAgent:

    def __init__(self):
        self.perception    = TransactionPerceptionAgent()
        self.aggregation   = TransactionAggregationAgent()
        self.pattern_agent = TransactionPatternAgent()

    def act(self):
        transactions = self.perception.observe()
        if not transactions:
            return {"agent": "TransactionAgent", "findings": []}

        grouped  = self.aggregation.group_by_sender(transactions)
        findings = self.pattern_agent.reason(grouped)

        transactions_col.update_many(
            {"status": "PENDING"},
            {"$set": {"status": "PROCESSED"}},
        )
        return {"agent": "TransactionAgent", "findings": findings}


transaction_core = TransactionAgent()


# ══════════════════════════════════════════════════════
# 9. LANGGRAPH ADAPTER
# ══════════════════════════════════════════════════════
def transaction_agent(state: dict) -> dict:

    single_txn = state.get("transaction")

    if single_txn:

        if not isinstance(single_txn, dict):
            raise TypeError(
                f"state['transaction'] must be a dict, got {type(single_txn).__name__}. "
                "Pass a single transaction object, not a list."
            )

        sender_account = single_txn.get("sender_account_id", "")

        # ── Bug 1 fix ────────────────────────────────────────────────────────
        # WRONG (original): cutoff = single_txn.get("timestamp") - timedelta(days=30)
        #   → crashes when timestamp is a string (sent from Node as ISO string)
        # RIGHT: always compute from utcnow()
        cutoff_date = datetime.utcnow() - timedelta(days=30)

        # ── Pull historical transactions for this sender ───────────────────
        raw_history = list(
            transactions_col.find({
                "sender_account_id": sender_account,
                "timestamp":         {"$gte": cutoff_date},
                "status":            {"$ne": "PROCESSING"},
            }).sort("timestamp", -1).limit(50)
        )

        # ── Bug 2 fix: format defensively ─────────────────────────────────
        formatted_txns = []
        for tx in raw_history:
            if not tx.get("sender_account_id") or not tx.get("receiver_account_id"):
                continue
            try:
                ts = tx["timestamp"] if isinstance(tx["timestamp"], datetime) \
                     else datetime.fromisoformat(str(tx["timestamp"]))
            except Exception:
                ts = datetime.utcnow()
            formatted_txns.append({
                "transaction_id": tx.get("transaction_id", str(tx.get("_id", ""))),
                "timestamp":      ts,
                "sender":         tx["sender_account_id"],
                "receiver":       tx["receiver_account_id"],
                "amount":         float(tx.get("amount", 0)),
                "payment_type":   tx.get("payment_method", "UNKNOWN"),
            })

        # ── Add the current (incoming) transaction ─────────────────────────
        try:
            cur_ts = single_txn["timestamp"] if isinstance(single_txn["timestamp"], datetime) \
                     else datetime.fromisoformat(str(single_txn["timestamp"]))
        except Exception:
            cur_ts = datetime.utcnow()

        formatted_txns.append({
            "transaction_id": single_txn.get("transaction_id", ""),
            "timestamp":      cur_ts,
            "sender":         single_txn.get("sender_account_id", ""),
            "receiver":       single_txn.get("receiver_account_id", ""),
            "amount":         float(single_txn.get("amount", 0)),
            "payment_type":   single_txn.get("payment_method", "UNKNOWN"),
        })

        formatted_txns = sorted(formatted_txns, key=lambda x: x["timestamp"])

        # ── Run through PatternEngine (handles single+multi fallback) ──────
        aggregation   = TransactionAggregationAgent()
        pattern_agent = TransactionPatternAgent()
        grouped       = aggregation.group_by_sender(formatted_txns)
        findings      = pattern_agent.reason(grouped)

        state["findings"] = findings
        return state

    else:
        result = transaction_core.act()
        state["findings"] = result["findings"]
        return state