# agents/decision_agent.py  — FIXED
# Changes from original:
#   1. Loads .env automatically so OPENAI_API_KEY is found even if not set in shell
#   2. Logs clearly whether LLM or fallback is being used
#   3. generate_explanation passes findings correctly to fallback
#   4. Fallback explanation is richer and always non-empty

from typing import Dict, Any
import os
import logging

# ── Load .env before reading env vars ─────────────────────────────────────────
# This is the #1 reason the key is always empty: the env var isn't loaded yet
try:
    from dotenv import load_dotenv
    load_dotenv()          # reads .env from cwd or parent dirs
except ImportError:
    pass                   # dotenv not installed — rely on shell env

from config.rag_config import OPEN_API_KEY

logger = logging.getLogger(__name__)

RISK_THRESHOLDS = {
    "LOW":    30,
    "MEDIUM": 70,
}


class DecisionAgent:

    def __init__(self):
        # Try env var first, then rag_config fallback
        api_key = (os.getenv("OPENAI_API_KEY") or OPEN_API_KEY or "").strip()
        self.llm = None

        if api_key:
            try:
                from langchain_openai import ChatOpenAI
                self.llm = ChatOpenAI(
                    model="gpt-4o-mini",
                    temperature=0,
                    openai_api_key=api_key,
                )
                logger.info("[DecisionAgent] LLM ready — will use GPT-4o-mini for explanations")
            except Exception as e:
                logger.warning(f"[DecisionAgent] LLM init failed: {e} — using rule-based fallback")
                self.llm = None
        else:
            # This is expected — not an error
            logger.info(
                "[DecisionAgent] No OPENAI_API_KEY found — using rule-based explanation. "
                "To enable LLM: set OPENAI_API_KEY in your .env file."
            )

    def compute_verdict(self, risk_score: int) -> dict:
        if risk_score >= RISK_THRESHOLDS["MEDIUM"]:
            return {"verdict": "Suspicious",      "risk_level": "High"}
        elif risk_score >= RISK_THRESHOLDS["LOW"]:
            return {"verdict": "Review Required", "risk_level": "Medium"}
        else:
            return {"verdict": "Not Suspicious",  "risk_level": "Low"}

    def generate_explanation(self, state: Dict[str, Any], verdict: str) -> str:
        risk_score     = state.get("risk_score", 0)
        findings       = state.get("findings", [])
        policy_context = state.get("policy_context", "")

        # Always build fallback first (used if LLM is None or fails)
        fallback = self._generate_fallback_explanation(
            risk_score, verdict, findings, policy_context
        )

        if self.llm is None:
            return fallback

        prompt = f"""You are a Senior AML Compliance Officer.

Risk Score: {risk_score}
Verdict: {verdict}

Detected Patterns:
{self._format_findings(findings)}

Policy Context:
{policy_context[:800] if policy_context else 'No policy context available.'}

Write a professional 3-4 sentence explanation of why this verdict was reached.
Be specific about the patterns detected and their AML risk implications.
"""
        try:
            response = self.llm.invoke(prompt)
            return response.content
        except Exception as e:
            logger.warning(f"[DecisionAgent] LLM call failed: {e} — using fallback")
            return fallback

    def _format_findings(self, findings: list) -> str:
        if not findings:
            return "No suspicious patterns detected."
        lines = []
        for f in findings:
            account  = f.get("account", "unknown")
            patterns = [p.get("pattern", "?") for p in f.get("patterns", [])]
            lines.append(f"Account {account}: {', '.join(patterns)}")
        return "\n".join(lines)

    def _generate_fallback_explanation(
        self, risk_score: int, verdict: str, findings: list, policy_context: str
    ) -> str:
        parts = []

        parts.append(
            f"Transaction risk assessment produced a score of {risk_score}, "
            f"resulting in a '{verdict}' verdict."
        )

        # List detected pattern names
        all_patterns = []
        for f in findings:
            for p in f.get("patterns", []):
                name = p.get("pattern", "")
                if name and name not in all_patterns:
                    all_patterns.append(name)

        if all_patterns:
            readable = {
                "CIRCULAR_FLOW":             "circular fund movement",
                "HIGH_FREQUENCY_SMALL_VALUE": "structuring / smurfing behaviour",
                "RAPID_MOVEMENT":            "rapid fund movement (layering)",
                "UNUSUAL_AMOUNT_SPIKE":      "unusually large transaction amount",
                "LARGE_SINGLE_TRANSACTION":  "large single transaction amount",
                "DORMANT_ACCOUNT_ACTIVITY":  "sudden activity on dormant account",
            }
            named = [readable.get(p, p) for p in all_patterns]
            parts.append(f"Suspicious patterns identified: {', '.join(named)}.")

        # Risk level narrative
        if risk_score >= RISK_THRESHOLDS["MEDIUM"]:
            parts.append(
                "The elevated risk score indicates significant AML concerns. "
                "Immediate review and potential account action is recommended."
            )
        elif risk_score >= RISK_THRESHOLDS["LOW"]:
            parts.append(
                "The moderate risk score suggests potential compliance issues "
                "that warrant further investigation by an analyst."
            )
        else:
            parts.append(
                "The low risk score indicates transaction patterns are within "
                "normal parameters. No immediate action required."
            )

        if policy_context and "No suspicious findings" not in policy_context:
            parts.append(
                "Analysis cross-referenced against AML policy guidelines "
                "for pattern-specific regulatory thresholds."
            )

        return " ".join(parts)

    def run(self, state: dict) -> dict:
        risk_score    = state.get("risk_score", 0)
        decision_data = self.compute_verdict(risk_score)
        explanation   = self.generate_explanation(state, decision_data["verdict"])

        state["final_decision"] = {
            "verdict":              decision_data["verdict"],
            "risk_level":           decision_data["risk_level"],
            "risk_score":           risk_score,
            "explanation":          explanation,
            "recommended_actions":  self._get_actions(decision_data["risk_level"]),
        }
        return state

    def _get_actions(self, risk_level: str) -> list:
        """Derive recommended_actions from risk level so action_agent always has them."""
        if risk_level == "High":
            return ["RAISE_FLAG", "CREATE_CASE", "NOTIFY_COMPLIANCE"]
        elif risk_level == "Medium":
            return ["RAISE_FLAG"]
        else:
            return []


def decision_agent(state: dict) -> dict:
    agent = DecisionAgent()
    return agent.run(state)