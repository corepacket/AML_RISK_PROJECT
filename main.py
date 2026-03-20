from database.mongodb import transactions_col
from database.mongodb import accounts_col
from database.mongodb import customer_memory_col

from agents.transaction_agent import transaction_agent
from agents.policy_agent import policy_agent
from agents.memory_agent import memory_agent
from agents.decision_agent import decision_agent
from agents.action_agent import action_agent
from langchain_openai import OpenAIEmbeddings
from rag.vector_store import create_vector_store, load_vector_store
from rag.retriever import build_policy_retriever, StubRetriever
# from config.rag_config import OPEN_API_KEY
import os

_api_key = os.getenv("OPENAI_API_KEY", "").strip()
if _api_key:
    os.environ["OPENAI_API_KEY"] = _api_key
    try:
        embedding_model = OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=_api_key)
        vectorstore = load_vector_store(embedding_model, "db")
        retriever = build_policy_retriever(embedding_model, "db")
    except Exception:
        retriever = StubRetriever()
else:
    retriever = StubRetriever()



def run_pipeline(txn):
    state = {"transaction": txn}

    print("\n--- Running Transaction Agent ---")
    state = transaction_agent(state)
    print("Findings:", state.get("findings"))

    print("\n--- Running Policy Agent ---")
    state = policy_agent(state, retriever)  # ✅ pass retriever
    print("Policy Result:", state.get("policy_result"))

    print("\n--- Running Memory Agent ---")
    state = memory_agent(state)
    print("Adjusted Risk Score:", state.get("adjusted_risk_score", state.get("risk_score")))

    print("\n--- Running Decision Agent ---")
    state = decision_agent(state)
    print("Final Decision:", state.get("final_decision"))

    print("\n--- Running Action Agent ---")
    state = action_agent(state)
    print("Action Taken:", state.get("action"))

    print("\n--- FINAL STATE ---")
    print(state)

    return state


def process_pending_transactions():

    pending_transactions = transactions_col.find()

    for txn in pending_transactions:
        # Some legacy records may not have an explicit transaction_id field
        txn_id = txn.get("transaction_id") or str(txn.get("_id"))
        print(f"\n⚙️ Processing Transaction: {txn_id}")

        result = run_pipeline(txn)
        print("✅ Final State:", result)


if __name__ == "__main__":

    print("🚀 AML Multi-Agent Pipeline Started")
    process_pending_transactions()
    print("\n✅ Pipeline Completed")
