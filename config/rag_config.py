POLICY_PDF_PATH = r"data/policies/aml_policy.pdf"

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

VECTOR_DB_DIR = "vector_db"

POLICY_PDF_PATH = r"data/policies/aml_policy.pdf"

CHUNK_SIZE = 800
CHUNK_OVERLAP = 100

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"


import os

# Use environment variable only (set OPENAI_API_KEY in .env or shell before running)
OPEN_API_KEY = os.getenv("OPENAI_API_KEY", "")