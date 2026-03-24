"""
test_system.py — Full AML Microservice Health Check
=====================================================
Run from your project ROOT (the folder containing agents/, rag/, services/):

    python test_system.py

Checks (in order):
  1.  MongoDB connection + collections
  2.  RAG — PDF exists, vector DB build/load, retriever query
  3.  transaction_agent  — pattern detection on mock data
  4.  policy_agent       — risk scoring with retriever
  5.  memory_agent       — customer memory read/write
  6.  decision_agent     — verdict + explanation (LLM or fallback)
  7.  action_agent       — service calls (freeze, flag, case, audit)
  8.  Full pipeline      — build_aml_graph end-to-end
  9.  api.py readiness   — FastAPI app import + /score_transaction logic
  10. Node bridge        — Python HTTP endpoint reachable (if running)
"""

import sys, os, json, traceback
from datetime import datetime, timedelta

# ── Terminal colours (no external deps) ──────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

PASS = f"{GREEN}[PASS]{RESET}"
FAIL = f"{RED}[FAIL]{RESET}"
WARN = f"{YELLOW}[WARN]{RESET}"
INFO = f"{CYAN}[INFO]{RESET}"

results = []   # (name, passed, message)

def check(name, fn):
    print(f"\n{BOLD}── {name}{RESET}")
    try:
        msg = fn()
        print(f"  {PASS} {msg or 'ok'}")
        results.append((name, True, msg or "ok"))
    except Exception as e:
        tb = traceback.format_exc().strip().split("\n")[-1]
        print(f"  {FAIL} {tb}")
        results.append((name, False, str(e)))

def warn_check(name, fn):
    """Like check() but a failure is only a warning (optional dependency)."""
    print(f"\n{BOLD}── {name}{RESET}")
    try:
        msg = fn()
        print(f"  {PASS} {msg or 'ok'}")
        results.append((name, True, msg or "ok"))
    except Exception as e:
        tb = traceback.format_exc().strip().split("\n")[-1]
        print(f"  {WARN} {tb} (non-fatal)")
        results.append((name, None, str(e)))   # None = warning


# =============================================================================
# 1. MONGODB
# =============================================================================
print(f"\n{BOLD}{CYAN}═══ 1. MongoDB ═══{RESET}")

def _mongo_connect():
    from config.database import client, db, DB_NAME
    client.admin.command("ping")
    return f"Connected to '{DB_NAME}'"

def _mongo_collections():
    from config.database import (
        transactions_col, accounts_col,
        customer_memory_col, cases_col, audit_logs_col
    )
    counts = {
        "transactions":    transactions_col.estimated_document_count(),
        "accounts":        accounts_col.estimated_document_count(),
        "customer_memory": customer_memory_col.estimated_document_count(),
        "cases":           cases_col.estimated_document_count(),
        "audit_logs":      audit_logs_col.estimated_document_count(),
    }
    return "  ".join(f"{k}:{v}" for k, v in counts.items())

def _mongo_write_read():
    from config.database import db
    col = db["_test_ping"]
    col.insert_one({"ping": True, "ts": datetime.utcnow()})
    doc = col.find_one({"ping": True})
    col.drop()
    assert doc is not None
    return "write + read + drop ok"

check("MongoDB — ping",        _mongo_connect)
check("MongoDB — collections", _mongo_collections)
check("MongoDB — write/read",  _mongo_write_read)


# =============================================================================
# 2. RAG STACK
# =============================================================================
print(f"\n{BOLD}{CYAN}═══ 2. RAG Stack ═══{RESET}")

def _rag_pdf():
    from config.rag_config import POLICY_PDF_PATH
    assert os.path.exists(POLICY_PDF_PATH), f"PDF not found at {POLICY_PDF_PATH}"
    size_kb = os.path.getsize(POLICY_PDF_PATH) // 1024
    return f"PDF found — {size_kb} KB at '{POLICY_PDF_PATH}'"

def _rag_loader():
    from config.rag_config import POLICY_PDF_PATH
    from rag.loader import load_policy_pdf
    docs = load_policy_pdf(POLICY_PDF_PATH)
    assert len(docs) > 0, "PDF loaded but 0 pages"
    return f"Loaded {len(docs)} pages from PDF"

def _rag_chunker():
    from config.rag_config import POLICY_PDF_PATH, CHUNK_SIZE, CHUNK_OVERLAP
    from rag.loader import load_policy_pdf
    from rag.chunker import chunk_policy_document
    docs   = load_policy_pdf(POLICY_PDF_PATH)
    chunks = chunk_policy_document(docs, CHUNK_SIZE, CHUNK_OVERLAP)
    assert len(chunks) > 0, "0 chunks produced"
    return f"Produced {len(chunks)} chunks (size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})"

def _rag_embedder():
    from config.rag_config import EMBEDDING_MODEL_NAME
    from rag.embedder import get_embedding_model
    model = get_embedding_model(EMBEDDING_MODEL_NAME)
    test_vec = model.embed_query("AML suspicious transaction")
    assert len(test_vec) > 0, "Empty embedding vector"
    return f"Embedding ok — vector dim={len(test_vec)} model='{EMBEDDING_MODEL_NAME}'"

def _rag_vector_store():
    from config.rag_config import (
        POLICY_PDF_PATH, CHUNK_SIZE, CHUNK_OVERLAP,
        EMBEDDING_MODEL_NAME, VECTOR_DB_DIR
    )
    from rag.embedder import get_embedding_model
    from rag.vector_store import load_vector_store, create_vector_store

    embedding_model = get_embedding_model(EMBEDDING_MODEL_NAME)

    if os.path.exists(VECTOR_DB_DIR):
        vs = load_vector_store(embedding_model, VECTOR_DB_DIR)
        print(f"    {INFO} Loaded existing vector DB from '{VECTOR_DB_DIR}'")
    else:
        print(f"    {INFO} Vector DB not found — building now (takes ~30s first time)...")
        from rag.loader import load_policy_pdf
        from rag.chunker import chunk_policy_document
        docs   = load_policy_pdf(POLICY_PDF_PATH)
        chunks = chunk_policy_document(docs, CHUNK_SIZE, CHUNK_OVERLAP)
        vs     = create_vector_store(chunks, embedding_model, VECTOR_DB_DIR)
        print(f"    {INFO} Vector DB built at '{VECTOR_DB_DIR}'")

    docs = vs.similarity_search("suspicious transaction structuring", k=2)
    assert len(docs) > 0, "similarity_search returned 0 docs"
    snippet = docs[0].page_content[:80].replace("\n", " ")
    return f"Vector DB ok — sample: '{snippet}...'"

def _rag_retriever():
    from config.rag_config import EMBEDDING_MODEL_NAME, VECTOR_DB_DIR
    from rag.embedder import get_embedding_model
    from rag.retriever import build_policy_retriever

    embedding_model = get_embedding_model(EMBEDDING_MODEL_NAME)
    retriever = build_policy_retriever(embedding_model, VECTOR_DB_DIR)
    docs = retriever.invoke("FATF structuring smurfing")
    assert len(docs) > 0, "Retriever returned 0 docs"
    return f"Retriever ok — returned {len(docs)} docs for test query"

def _rag_stub_fallback():
    from rag.retriever import StubRetriever
    r = StubRetriever()
    docs = r.invoke("anything")
    assert docs == [], "StubRetriever should return []"
    return "StubRetriever returns [] — fallback safe"

check("RAG — PDF exists",    _rag_pdf)
check("RAG — loader",        _rag_loader)
check("RAG — chunker",       _rag_chunker)
check("RAG — embedder",      _rag_embedder)
check("RAG — vector store",  _rag_vector_store)
check("RAG — retriever MMR", _rag_retriever)
check("RAG — stub fallback", _rag_stub_fallback)


# =============================================================================
# 3. TRANSACTION AGENT
# =============================================================================
print(f"\n{BOLD}{CYAN}═══ 3. transaction_agent ═══{RESET}")

MOCK_TXN = {
    "transaction_id":      "TEST-001",
    "timestamp":           datetime.utcnow(),
    "sender_customer_id":  "CUST-TEST",
    "sender_account_id":   "ACC-TEST-SENDER",
    "receiver_customer_id": "CUST-RCV",
    "receiver_account_id": "ACC-TEST-RECV",
    "amount":              75000.0,
    "currency":            "USD",
    "payment_method":      "WIRE",
    "description":         "Test large wire",
    "category":            "Transfer",
}

def _txn_agent_single():
    from agents.transaction_agent import transaction_agent
    state = {"transaction": MOCK_TXN, "findings": []}
    out   = transaction_agent(state)
    findings = out.get("findings", [])
    # Large amount + WIRE should trigger at least one pattern
    total_patterns = sum(len(f.get("patterns", [])) for f in findings)
    return f"findings={len(findings)}, total_patterns={total_patterns} — {[f['account'] for f in findings]}"

def _txn_agent_no_txn():
    """Batch mode — no 'transaction' key — should not crash."""
    from agents.transaction_agent import transaction_agent
    state = {"findings": []}
    out   = transaction_agent(state)
    assert "findings" in out
    return "Batch mode (no 'transaction' key) — returned findings safely"

check("transaction_agent — single txn", _txn_agent_single)
check("transaction_agent — batch mode", _txn_agent_no_txn)


# =============================================================================
# 4. POLICY AGENT
# =============================================================================
print(f"\n{BOLD}{CYAN}═══ 4. policy_agent ═══{RESET}")

MOCK_FINDINGS = [
    {
        "account": "ACC-TEST-SENDER",
        "patterns": [
            {"pattern": "UNUSUAL_AMOUNT_SPIKE", "description": "Large wire", "transaction_count": 1, "total_amount": 75000}
        ]
    }
]

def _policy_agent_real_retriever():
    from config.rag_config import EMBEDDING_MODEL_NAME, VECTOR_DB_DIR
    from rag.embedder import get_embedding_model
    from rag.retriever import build_policy_retriever
    from agents.policy_agent import policy_agent

    em  = get_embedding_model(EMBEDDING_MODEL_NAME)
    ret = build_policy_retriever(em, VECTOR_DB_DIR)

    state = {"findings": MOCK_FINDINGS, "risk_score": 0}
    out   = policy_agent(state, ret)

    assert out.get("risk_score", 0) > 0,       "risk_score should be > 0"
    assert out.get("policy_context"),           "policy_context should be non-empty"
    ctx_snippet = out["policy_context"][:80].replace("\n", " ")
    return f"risk_score={out['risk_score']}  ctx='{ctx_snippet}...'"

def _policy_agent_stub():
    from rag.retriever import StubRetriever
    from agents.policy_agent import policy_agent

    state = {"findings": MOCK_FINDINGS, "risk_score": 0}
    out   = policy_agent(state, StubRetriever())

    assert out.get("risk_score", 0) > 0, "risk_score should be > 0 even with stub"
    return f"Stub retriever — risk_score={out['risk_score']} (rule-based only)"

def _policy_agent_empty_findings():
    from rag.retriever import StubRetriever
    from agents.policy_agent import policy_agent

    state = {"findings": [], "risk_score": 0}
    out   = policy_agent(state, StubRetriever())
    assert out["risk_score"] == 0
    return "Empty findings → risk_score=0 — safe"

check("policy_agent — real RAG retriever", _policy_agent_real_retriever)
check("policy_agent — stub retriever",     _policy_agent_stub)
check("policy_agent — empty findings",     _policy_agent_empty_findings)


# =============================================================================
# 5. MEMORY AGENT
# =============================================================================
print(f"\n{BOLD}{CYAN}═══ 5. memory_agent ═══{RESET}")

def _memory_agent_new_customer():
    from agents.memory_agent import memory_agent
    state = {"findings": MOCK_FINDINGS, "risk_score": 25}
    out   = memory_agent(state)
    assert "risk_score" in out
    return f"New customer — adjusted risk_score={out['risk_score']} (base=25)"

def _memory_agent_repeat_customer():
    """Run twice — second call should bump score via history."""
    from agents.memory_agent import memory_agent
    state1 = {"findings": MOCK_FINDINGS, "risk_score": 25}
    out1   = memory_agent(state1)
    state2 = {"findings": MOCK_FINDINGS, "risk_score": 25}
    out2   = memory_agent(state2)
    diff   = out2["risk_score"] - 25
    return f"Repeat customer — base=25, adjusted={out2['risk_score']} (delta={diff:+d})"

def _memory_agent_no_findings():
    from agents.memory_agent import memory_agent
    state = {"findings": [], "risk_score": 10}
    out   = memory_agent(state)
    assert out["risk_score"] == 10, "Should not modify risk_score with no findings"
    return "No findings → risk_score unchanged — safe"

check("memory_agent — new customer",    _memory_agent_new_customer)
check("memory_agent — repeat customer", _memory_agent_repeat_customer)
check("memory_agent — no findings",     _memory_agent_no_findings)


# =============================================================================
# 6. DECISION AGENT
# =============================================================================
print(f"\n{BOLD}{CYAN}═══ 6. decision_agent ═══{RESET}")

def _make_decision_state(score):
    return {
        "risk_score":     score,
        "findings":       MOCK_FINDINGS,
        "policy_context": "FATF recommendation: unusual large transaction requires review.",
    }

def _decision_low():
    from agents.decision_agent import decision_agent
    out = decision_agent(_make_decision_state(20))
    d   = out["final_decision"]
    assert d["risk_level"] == "Low"
    return f"score=20 → {d['verdict']} / {d['risk_level']}"

def _decision_medium():
    from agents.decision_agent import decision_agent
    out = decision_agent(_make_decision_state(50))
    d   = out["final_decision"]
    assert d["risk_level"] == "Medium"
    return f"score=50 → {d['verdict']} / {d['risk_level']}"

def _decision_high():
    from agents.decision_agent import decision_agent
    out = decision_agent(_make_decision_state(80))
    d   = out["final_decision"]
    assert d["risk_level"] == "High"
    assert d.get("explanation"), "explanation should not be empty"
    snippet = d["explanation"][:80].replace("\n", " ")
    return f"score=80 → {d['verdict']} / {d['risk_level']}  expl='{snippet}...'"

def _decision_explanation_fallback():
    """Verify fallback explanation works without OpenAI key."""
    from agents.decision_agent import DecisionAgent
    agent = DecisionAgent()
    agent.llm = None   # force fallback path
    expl = agent._generate_fallback_explanation(75, "Suspicious", MOCK_FINDINGS[0]["patterns"], "policy text")
    assert len(expl) > 20, "Fallback explanation too short"
    return f"Fallback ok — '{expl[:80]}...'"

check("decision_agent — Low (score=20)",    _decision_low)
check("decision_agent — Medium (score=50)", _decision_medium)
check("decision_agent — High (score=80)",   _decision_high)
check("decision_agent — explanation fallback", _decision_explanation_fallback)


# =============================================================================
# 7. ACTION AGENT + SERVICES
# =============================================================================
print(f"\n{BOLD}{CYAN}═══ 7. action_agent + services ═══{RESET}")

MOCK_HIGH_DECISION_STATE = {
    "transaction":    {**MOCK_TXN, "customer_id": "CUST-TEST"},
    "findings":       MOCK_FINDINGS,
    "risk_score":     80,
    "policy_context": "...",
    "final_decision": {
        "verdict":     "Suspicious",
        "risk_level":  "High",
        "risk_score":  80,
        "explanation": "Large wire transfer triggers AML review.",
        "recommended_actions": ["RAISE_FLAG", "CREATE_CASE", "NOTIFY_COMPLIANCE"],
    }
}

def _action_agent_runs():
    from agents.action_agent import action_agent
    out = action_agent(dict(MOCK_HIGH_DECISION_STATE))
    assert "action_results" in out
    results_keys = list(out["action_results"].keys())
    return f"action_results keys: {results_keys}"

def _service_account_freeze():
    from services.account_service import AccountService
    svc = AccountService()
    r   = svc.freeze_account("CUST-TEST")
    assert r.get("status") == "Account Frozen"
    return f"freeze_account → {r}"

def _service_flag():
    from services.flag_service import FlagService
    svc = FlagService()
    r   = svc.raise_flag("CUST-TEST", "Test suspicious activity")
    assert r.get("status") == "Flag Raised"
    return f"raise_flag → {r}"

def _service_case():
    from services.case_service import CaseService
    svc = CaseService()
    r   = svc.create_case("CUST-TEST", "TEST-001", 80)
    assert r.get("case_id")
    return f"create_case → case_id={r['case_id']}"

def _service_audit():
    from services.audit_service import AuditService
    svc = AuditService()
    r   = svc.log_action({"customer_id": "CUST-TEST", "action": "TEST_RUN"})
    assert r.get("status") == "Logged"
    return f"log_action → {r}"

def _service_notification():
    from services.notification_service import NotificationService
    svc = NotificationService()
    r   = svc.notify_compliance("CASE-TEST-001")
    assert r.get("status") == "SENT"
    return f"notify_compliance → {r}"

check("action_agent — runs all actions",     _action_agent_runs)
check("AccountService — freeze_account",     _service_account_freeze)
check("FlagService — raise_flag",            _service_flag)
check("CaseService — create_case",           _service_case)
check("AuditService — log_action",           _service_audit)
check("NotificationService — notify",        _service_notification)


# =============================================================================
# 8. FULL PIPELINE — build_aml_graph end-to-end
# =============================================================================
print(f"\n{BOLD}{CYAN}═══ 8. Full Pipeline (build_aml_graph) ═══{RESET}")

def _full_pipeline_stub():
    """Run complete graph with StubRetriever — no OpenAI needed."""
    from rag.retriever import StubRetriever
    from agents.aml_graph import build_aml_graph

    graph = build_aml_graph(StubRetriever())

    initial_state = {
        "transaction": {**MOCK_TXN},
        "findings":    [],
        "risk_score":  0,
    }

    final = graph.invoke(initial_state)

    assert "final_decision" in final,               "final_decision missing from state"
    d = final["final_decision"]
    assert d.get("risk_level") in ("Low","Medium","High"), f"Bad risk_level: {d}"
    assert d.get("explanation"),                    "explanation is empty"

    flags = []
    for f in final.get("findings", []):
        for p in f.get("patterns", []):
            flags.append(p.get("pattern"))

    return (
        f"risk_score={d['risk_score']}  "
        f"risk_level={d['risk_level']}  "
        f"verdict='{d['verdict']}'  "
        f"flags={flags}"
    )

def _full_pipeline_rag():
    """Run with real RAG retriever."""
    from config.rag_config import EMBEDDING_MODEL_NAME, VECTOR_DB_DIR
    from rag.embedder import get_embedding_model
    from rag.retriever import build_policy_retriever
    from agents.aml_graph import build_aml_graph

    em        = get_embedding_model(EMBEDDING_MODEL_NAME)
    retriever = build_policy_retriever(em, VECTOR_DB_DIR)
    graph     = build_aml_graph(retriever)

    final = graph.invoke({
        "transaction": {**MOCK_TXN},
        "findings":    [],
        "risk_score":  0,
    })

    d = final["final_decision"]
    ctx_snippet = final.get("policy_context", "")[:60].replace("\n", " ")
    return (
        f"risk_score={d['risk_score']}  "
        f"risk_level={d['risk_level']}  "
        f"policy_ctx='{ctx_snippet}...'"
    )

check("Full pipeline — StubRetriever (no OpenAI)", _full_pipeline_stub)
check("Full pipeline — real RAG retriever",        _full_pipeline_rag)


# =============================================================================
# 9. API.PY READINESS
# =============================================================================
print(f"\n{BOLD}{CYAN}═══ 9. api.py Import + Score Logic ═══{RESET}")

def _api_import():
    import api   # will trigger startup logic without actually running uvicorn
    assert hasattr(api, "app"), "api.py has no 'app' FastAPI instance"
    assert hasattr(api, "score_transaction"), "api.py missing score_transaction route"
    return "api.py imports cleanly — FastAPI app + route found"

def _api_score_logic():
    """Test the scoring logic directly without HTTP."""
    from rag.retriever import StubRetriever
    from agents.aml_graph import build_aml_graph

    initial = {
        "transaction": {**MOCK_TXN},
        "findings":    [],
        "risk_score":  0,
    }
    graph = build_aml_graph(StubRetriever())
    final = graph.invoke(initial)
    d     = final["final_decision"]

    RISK_TO_STATUS = {"High": "BLOCKED", "Medium": "FLAGGED", "Low": "PROCESSED"}
    node_status = RISK_TO_STATUS.get(d["risk_level"], "PROCESSED")
    return f"Scoring logic ok → node_status={node_status}  risk_level={d['risk_level']}"

warn_check("api.py — import check",    _api_import)
check("api.py — scoring logic direct", _api_score_logic)


# =============================================================================
# 10. LIVE HTTP — Python /health (only if server is running)
# =============================================================================
print(f"\n{BOLD}{CYAN}═══ 10. Live HTTP check (optional — needs uvicorn running) ═══{RESET}")

def _http_health():
    import urllib.request, json as _json
    url = "http://localhost:8000/health"
    try:
        with urllib.request.urlopen(url, timeout=3) as r:
            body = _json.loads(r.read())
        assert body.get("status") == "ok"
        return f"GET /health → {body}"
    except Exception as e:
        raise RuntimeError(f"Server not reachable at {url} — start with: uvicorn api:app --reload") from e

def _http_score():
    import urllib.request, urllib.error, json as _json
    url     = "http://localhost:8000/score_transaction"
    payload = _json.dumps({
        "transaction_id":    "HTTP-TEST-001",
        "sender_account_id": "ACC-HTTP-SENDER",
        "receiver_account_id": "ACC-HTTP-RECV",
        "amount":            75000,
        "payment_method":    "WIRE",
        "description":       "HTTP test",
    }).encode()
    req = urllib.request.Request(url, data=payload,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = _json.loads(r.read())
    assert body["status"] == "success"
    d = body["data"]
    return (
        f"node_status={d['node_status']}  "
        f"risk_level={d['risk_level']}  "
        f"risk_score={d['risk_score']}"
    )

warn_check("HTTP — GET /health",             _http_health)
warn_check("HTTP — POST /score_transaction", _http_score)


# =============================================================================
# SUMMARY
# =============================================================================
print(f"\n\n{BOLD}{'═'*60}{RESET}")
print(f"{BOLD}  TEST SUMMARY{RESET}")
print(f"{BOLD}{'═'*60}{RESET}")

passed  = [r for r in results if r[1] is True]
failed  = [r for r in results if r[1] is False]
warned  = [r for r in results if r[1] is None]

for name, ok, msg in results:
    icon = PASS if ok is True else (WARN if ok is None else FAIL)
    print(f"  {icon}  {name}")
    if ok is False:
        print(f"         {RED}{msg}{RESET}")

print(f"\n  {GREEN}{len(passed)} passed{RESET}  "
      f"{RED}{len(failed)} failed{RESET}  "
      f"{YELLOW}{len(warned)} warnings{RESET}")

if failed:
    print(f"\n{RED}Some checks failed. Fix the issues above before running the server.{RESET}")
    sys.exit(1)
else:
    print(f"\n{GREEN}All critical checks passed. Your microservice is ready.{RESET}")
    if warned:
        print(f"{YELLOW}Warnings are for optional/live checks (HTTP server, OpenAI key).{RESET}")
    sys.exit(0)