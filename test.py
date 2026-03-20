import os
from langchain_community.vectorstores import Chroma
#from langchain_openai import OpenAIEmbeddings
from langchain_community.embeddings import HuggingFaceEmbeddings


from agents.aml_graph import build_aml_graph
from rag.retriever import get_policy_retriever

def main():
    print("\n🚀 STARTING AI ANTI-MONEY LAUNDERING SYSTEM")
    print("===========================================")

    current_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(current_dir, "vector_db")

    if not os.path.exists(db_path):
        print("❌ Vector DB not found. Run ingest first.")
        return

    embeddings_model = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )

    vectorstore = Chroma(
        persist_directory=db_path,
        embedding_function=embeddings_model,
        collection_name="aml_policies"
    )

    retriever_tool = get_policy_retriever(vectorstore)

    app = build_aml_graph(retriever_tool)

    result = app.invoke({
        "findings": [],
        "policy_context":"",
        "decision_recommendation":""
        })

    print("\n" + "="*60)
    print("🏁 FINAL AML REPORT")
    print("="*60)

    print("\n🔍 FINDINGS:")
    for f in result["findings"]:
        print("-", f)

    print("\n📜 POLICY CONTEXT:")
    print(result["policy_context"][:500], "...")

    print("\n⚖️ FINAL DECISION:")
    print(result["decision_recommendation"])
    print("="*60)

if __name__ == "__main__":
    main()
