class EscalationAgent:

    def run(self, state):

        print("🚨 Escalation Agent: Escalating to Compliance Team")

        escalation_payload = {
            "case_id": "AUTO-GENERATED-ID",
            "account": state["findings"][0]["account"] if state.get("findings") else None,
            "risk_score": state["final_decision"]["risk_score"],
            "reason": state["final_decision"]["explanation"],
            "status": "Pending Analyst Review"
        }

        state["action_taken"] = "ESCALATED_TO_COMPLIANCE"
        state["escalation_required"] = True
        state["escalation_payload"] = escalation_payload

        return state


def escalation_agent(state):
    agent = EscalationAgent()
    return agent.run(state)
