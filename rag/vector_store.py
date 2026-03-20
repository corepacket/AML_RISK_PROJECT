from langchain_community.vectorstores import Chroma

def create_vector_store(documents,embedding_model,persist_directory):
    vectorstore=Chroma.from_documents(
        documents=documents,
        embedding=embedding_model,
        persist_directory=persist_directory
    )

    vectorstore.persist()
    return vectorstore
def load_vector_store(embedding_model,persist_directory):
    vectorstore=Chroma(
        persist_directory=persist_directory,
        embedding_function=embedding_model
    )
    return vectorstore