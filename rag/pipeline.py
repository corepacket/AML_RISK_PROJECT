from langchain_openai import ChatOpenAI
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

from .retriever import get_policy_retriever

def build_aml_rag_pipeline(vectorstore):
    """
    Builds the complete AML RAG pipeline:
    Retriever → LLM → Answer
    """

    # 1️⃣ LLM
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0,
        # api_key=""
    )

    # 2️⃣ Prompt
    aml_prompt = PromptTemplate(
        input_variables=["context", "question"],
        template="""
You are an AML compliance assistant.

Answer the question strictly using the AML policy excerpts provided below.
Do NOT use external knowledge.
Do NOT guess or assume thresholds.

AML Policy Excerpts:
{context}

Question:
{question}

Answer in a clear, structured manner.
"""
    )

    # 3️⃣ Retriever
    retriever = get_policy_retriever(vectorstore)

    # 4️⃣ RAG Chain
    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        chain_type="stuff",
        return_source_documents=True,
        chain_type_kwargs={"prompt": aml_prompt}
    )

    return qa_chain
