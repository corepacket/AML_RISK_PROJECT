class StubRetriever:
    """Retriever that returns no documents. Use when OpenAI API key is not set."""

    def invoke(self, query: str):
        return []


def build_policy_retriever(embedding_model, persist_directory, k=6):
    from rag.vector_store import load_vector_store

    vectorstore = load_vector_store(embedding_model, persist_directory)

    return vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={
            "k": k,
            "fetch_k": 20,
            "lambda_mult": 0.7
        }
    )
