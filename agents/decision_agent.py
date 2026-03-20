from typing import Dict, Any
from langchain_openai import ChatOpenAI
import os
from config.rag_config import OPEN_API_KEY


RISK_THRESHOLDS = {
    "LOW": 30,
    "MEDIUM": 70
}


class DecisionAgent:

    def __init__(self):
        api_key = (os.getenv("OPENAI_API_KEY") or OPEN_API_KEY or "").strip()
        self.llm = None
        if api_key:
            try:
                self.llm = ChatOpenAI(
                    model="gpt-4o-mini",
                    temperature=0,
                    openai_api_key=api_key,
                )
            except Exception:
                self.llm = None

    def compute_verdict(self, risk_score: int):

        if risk_score >= RISK_THRESHOLDS["MEDIUM"]:
            return {"verdict": "Suspicious", "risk_level": "High"}
        elif risk_score >= RISK_THRESHOLDS["LOW"]:
            return {"verdict": "Review Required", "risk_level": "Medium"}
        else:
            return {"verdict": "Not Suspicious", "risk_level": "Low"}

    def generate_explanation(self, state: Dict[str, Any], verdict: str):

        risk_score = state.get("risk_score", 0)
        findings = state.get("findings", [])
        policy_context = state.get("policy_context", "")
        
        # Generate fallback explanation based on risk score and findings
        fallback_explanation = self._generate_fallback_explanation(risk_score, verdict, findings, policy_context)

        prompt = f"""
        You are a Senior AML Compliance Officer.

        Risk Score: {risk_score}
        Verdict: {verdict}

        Evidence:
        {policy_context}

        Explain in 3-4 professional lines why this verdict was reached.
        """

        if self.llm is None:
            return fallback_explanation
        try:
            response = self.llm.invoke(prompt)
            return response.content
        except Exception:
            return fallback_explanation
    
    def _generate_fallback_explanation(self, risk_score: int, verdict: str, findings: list, policy_context: str) -> str:
        """Generate a rule-based explanation when LLM is unavailable"""
        explanation_parts = []
        
        explanation_parts.append(f"Risk assessment resulted in a score of {risk_score}, leading to a '{verdict}' verdict.")
        
        if findings:
            pattern_names = []
            for finding in findings:
                for pattern in finding.get("patterns", []):
                    pattern_names.append(pattern.get("pattern", "Unknown Pattern"))
            
            if pattern_names:
                explanation_parts.append(f"Suspicious patterns detected: {', '.join(set(pattern_names))}.")
        
        if risk_score >= 70:
            explanation_parts.append("The high risk score indicates significant AML concerns requiring immediate review.")
        elif risk_score >= 30:
            explanation_parts.append("The moderate risk score suggests potential compliance issues that warrant further investigation.")
        else:
            explanation_parts.append("The low risk score indicates normal transaction patterns with no immediate concerns.")
        
        if policy_context and "No suspicious findings" not in policy_context:
            explanation_parts.append("Policy analysis confirms alignment with AML compliance requirements.")
        
        return " ".join(explanation_parts)

    def run(self, state):

        risk_score = state.get("risk_score", 0)

        decision_data = self.compute_verdict(risk_score)

        explanation = self.generate_explanation(
            state,
            decision_data["verdict"]
        )

        state["final_decision"] = {
            "verdict": decision_data["verdict"],
            "risk_level": decision_data["risk_level"],
            "risk_score": risk_score,
            "explanation": explanation
        }

        return state


def decision_agent(state):
    agent = DecisionAgent()
    return agent.run(state)
