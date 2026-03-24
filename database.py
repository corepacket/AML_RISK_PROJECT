from pymongo import MongoClient
import os
from pathlib import Path
from urllib.parse import quote_plus, unquote


def _read_env_value(file_path: Path, key: str):
    if not file_path.exists():
        return None
    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == key:
            return v.strip().strip('"').strip("'")
    return None


def _resolve_mongo_uri():
    # Priority: real env vars, then root .env, then backend/.env
    uri = os.getenv("MONGODB_URI") or os.getenv("MONGO_URI")
    if uri:
        return uri

    project_root = Path(__file__).resolve().parent
    env_files = [project_root / ".env", project_root / "backend" / ".env"]
    for env_file in env_files:
        uri = _read_env_value(env_file, "MONGODB_URI") or _read_env_value(env_file, "MONGO_URI")
        if uri:
            return uri
    return None


def _resolve_db_name():
    name = os.getenv("MONGODB_DB_NAME")
    if name:
        return name
    project_root = Path(__file__).resolve().parent
    env_files = [project_root / ".env", project_root / "backend" / ".env"]
    for env_file in env_files:
        name = _read_env_value(env_file, "MONGODB_DB_NAME")
        if name:
            return name
    return "aml_system"


def _sanitize_mongo_uri(uri: str) -> str:
    if uri.startswith("MONGO_URI="):
        uri = uri.split("=", 1)[1]
    if uri.startswith("MONGODB_URI="):
        uri = uri.split("=", 1)[1]
    scheme_sep = "://"
    if scheme_sep not in uri:
        return uri
    scheme, rest = uri.split(scheme_sep, 1)
    if "@" not in rest or ":" not in rest.split("@", 1)[0]:
        return uri
    userinfo, host_part = rest.rsplit("@", 1)
    username, password = userinfo.split(":", 1)
    safe_password = quote_plus(unquote(password))
    return f"{scheme}{scheme_sep}{username}:{safe_password}@{host_part}"


MONGODB_URI = _sanitize_mongo_uri(_resolve_mongo_uri() or "")
DB_NAME = _resolve_db_name()

if not MONGODB_URI:
    raise ValueError(
        "Mongo URI not configured. Set MONGODB_URI (or MONGO_URI) to your Atlas connection string."
    )

client = MongoClient(MONGODB_URI)
db = client[DB_NAME]

transactions_col = db["transactions"]
accounts_col = db["accounts"]
customer_memory_col = db["customer_memory"]
cases_col = db["cases"]
audit_logs_col = db["audit_logs"]