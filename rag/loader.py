from langchain_community.document_loaders import PyPDFLoader

def load_policy_pdf(pdf_path:str):
    """
    Loads AML policy PDF and returns LangChain Documents
    """
    loader=PyPDFLoader(pdf_path)
    documents=loader.load()

    return documents
#docs=load_policy_pdf("data/policies/aml_policy.pdf")

#print(len(docs))