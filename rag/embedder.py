# rag/embedder.py

from langchain_community.embeddings import HuggingFaceEmbeddings

def get_embedding_model(model_name: str):
    """
    Returns embedding model
    """
    return HuggingFaceEmbeddings(model_name=model_name)
