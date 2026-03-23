# agents/aml_graph.py
# Builds the LangGraph AML pipeline and exposes run_aml_pipeline()
# so aml_engine.py can import it.

from langgraph.graph import StateGraph, END
from agents.state import AMLState

from agents.transaction_agent import transaction_agent
from agents.policy_agent import policy_agent
from agents.memory_agent import memory_agent
from agents.decision_agent import decision_agent
from agents.action_agent import action_agent
from agents.escalation_agent import escalation_agent
from agents.learning_agent import learning_agent


def build_aml_graph(retriever):
    """
    Build and compile the AML LangGraph.
    `retriever` is injected so we can swap real RAG ↔ StubRetriever.
    """
    graph = StateGraph(AMLState)

    # ── Nodes ─────────────────────────────────────────────────────────────────
    graph.add_node("transaction", transaction_agent)
    graph.add_node("policy",      lambda state: policy_agent(state, retriever))
    graph.add_node("memory",      memory_agent)
    graph.add_node("decision",    decision_agent)
    graph.add_node("action",      action_agent)
    graph.add_node("escalation",  escalation_agent)
    graph.add_node("learning",    learning_agent)

    graph.set_entry_point("transaction")

    # ── Linear edges ──────────────────────────────────────────────────────────
    graph.add_edge("transaction", "policy")
    graph.add_edge("policy",      "memory")
    graph.add_edge("memory",      "decision")

    # ── Conditional routing after decision ───────────────────────────────────
    def route_decision(state):
        risk_score = state["final_decision"]["risk_score"]
        if risk_score >= 90:
            return "escalation"
        elif risk_score >= 70:
            return "action"
        else:
            return END

    graph.add_conditional_edges(
        "decision",
        route_decision,
        {
            "action":     "action",
            "escalation": "escalation",
            END:           END,
        }
    )

    # ── Post-action learning ──────────────────────────────────────────────────
    graph.add_edge("action",      "learning")
    graph.add_edge("escalation",  "learning")
    graph.add_edge("learning",    END)

    return graph.compile()


# ── Convenience wrapper (imported by aml_engine.py) ───────────────────────────
def run_aml_pipeline(initial_state: dict, retriever) -> dict:
    """
    Run the compiled AML graph on `initial_state` and return the final state.
    """
    compiled = build_aml_graph(retriever)
    return compiled.invoke(initial_state)