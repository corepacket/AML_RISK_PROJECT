from langchain_text_splitters import RecursiveCharacterTextSplitter
from .loader import load_policy_pdf

def chunk_policy_document(documents,chunk_size=300,overlap=50):
    
    splitter=RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
       separators = [
    "\n\n",
    "\n•",
    "\n-",
    "\n",
    "\n",
    ". "
]

    )
    
    return  splitter.split_documents(documents)

