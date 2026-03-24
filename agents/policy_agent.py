from typing import List, Dict, Any


PATTERN_QUERY_MAP = {
    "CIRCULAR_FLOW": "FATF complex unusual transaction no economic rationale",
    "HIGH_FREQUENCY_SMALL_VALUE": "FATF structuring smurfing reporting threshold",
    "RAPID_MOVEMENT": "FATF rapid movement layering stage money laundering",
    "UNUSUAL_AMOUNT_SPIKE": "FATF unusual large transaction risk profile",
    "LARGE_SINGLE_TRANSACTION": "FATF unusually large transaction red flags source of funds",
    "DORMANT_ACCOUNT_ACTIVITY": "FATF dormant account sudden activity suspicious"
}


RISK_WEIGHTS = {
    "CIRCULAR_FLOW": 40,
    "HIGH_FREQUENCY_SMALL_VALUE": 35,
    "RAPID_MOVEMENT": 30,
    "UNUSUAL_AMOUNT_SPIKE": 25,
    "LARGE_SINGLE_TRANSACTION": 40,
    "DORMANT_ACCOUNT_ACTIVITY": 30
}


class PolicyAgent:

    def __init__(self, retriever):
        self.retriever = retriever

    def analyze_findings(self, findings: List[Dict[str, Any]]):

        if not findings:
            return {
                "policy_context": "No suspicious findings detected.",
                "risk_score": 0
            }

        total_risk_score = 0
        policy_context_report = []

        for case in findings:
            account = case["account"]
            patterns = case["patterns"]

            account_risk = 0
            law_blocks = []

            for pattern_obj in patterns:
                pattern_name = pattern_obj["pattern"]

                weight = RISK_WEIGHTS.get(pattern_name, 10)
                account_risk += weight

                query = PATTERN_QUERY_MAP.get(pattern_name)

                try:
                    docs = self.retriever.invoke(query)
                    retrieved_law = "\n".join(
                        [doc.page_content[:300] for doc in docs[:2]]
                    )
                except:
                    retrieved_law = "Policy retrieval error."

                law_blocks.append(
                    f"PATTERN: {pattern_name}\n"
                    f"RISK WEIGHT: {weight}\n"
                    f"LAW REFERENCE:\n{retrieved_law}\n"
                )

            total_risk_score += account_risk

            policy_context_report.append(
                f"\nACCOUNT: {account}\n"
                f"ACCOUNT RISK SCORE: {account_risk}\n"
                + "\n".join(law_blocks)
            )

        return {
            "policy_context": "\n".join(policy_context_report),
            "risk_score": total_risk_score
        }


def policy_agent(state, retriever):
    findings = state.get("findings", [])
    agent = PolicyAgent(retriever)
    result = agent.analyze_findings(findings)

    state["policy_context"] = result["policy_context"]
    state["risk_score"] = result["risk_score"]

    return state
