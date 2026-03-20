fake_memory_store = {}

class LearningAgent:

    def update_memory(self, state):

        findings = state.get("findings", [])
        if not findings:
            return state

        account = findings[0]["account"]
        verdict = state["final_decision"]["verdict"]
        risk = state["final_decision"]["risk_score"]

        history = fake_memory_store.setdefault(account, {
            "past_risk_scores": [],
            "suspicious_count": 0
        })

        history["past_risk_scores"].append(risk)

        if verdict == "Suspicious":
            history["suspicious_count"] += 1

        print("📈 Learning Agent: Memory Updated")

        state["memory_updated"] = True

        return state


def learning_agent(state):
    agent = LearningAgent()
    return agent.update_memory(state)
