from typing import TypedDict, List, Dict, Any

class AMLState(TypedDict, total=False):
    findings: List[Dict[str, Any]]
    policy_context: str
    risk_score: int
    adjusted_risk_score: int
    final_decision: Dict[str, Any]
    action_taken: str
    escalation_required: bool
    memory_updated: bool
