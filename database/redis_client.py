# #polygon persistence approach where each database serves specific purpose

# python test_system.py
# ```

# Here's exactly what it checks and what each failure means:

# ---

# **What the 10 sections test**

# **1. MongoDB** — pings the server, lists document counts in all 5 collections, and does a write+read+drop to confirm it's not read-only. If this fails: check `MONGODB_URI` in your `.env`.

# **2. RAG stack** — checks every layer in sequence: PDF file exists → loader reads pages → chunker splits them → embedder produces vectors → vector DB builds or loads from disk → retriever does a real MMR query → `StubRetriever` returns `[]` safely. The vector DB build only runs once; after that it loads from `vector_db/`. This is the slowest section (~30s first time).

# **3. transaction_agent** — feeds it the mock `$75k WIRE` transaction and checks it detects at least one pattern (`UNUSUAL_AMOUNT_SPIKE` or `HIGH_FREQUENCY_SMALL_VALUE`). Also tests batch mode doesn't crash.

# **4. policy_agent** — runs with both the real RAG retriever and the stub. Confirms `risk_score > 0` in both cases and that `policy_context` is populated.

# **5. memory_agent** — runs twice for the same account. Second call should produce a higher score than base because history now has 1 entry. Confirms no crash on empty findings.

# **6. decision_agent** — tests all 3 thresholds: score 20 → Low, score 50 → Medium, score 80 → High. Also forces `llm=None` to verify the fallback explanation path works without OpenAI.

# **7. action_agent + services** — calls action_agent with `recommended_actions: [RAISE_FLAG, CREATE_CASE, NOTIFY_COMPLIANCE]` and checks all service calls succeed. Then individually tests every service class.

# **8. Full pipeline** — runs `build_aml_graph` end-to-end twice: once with `StubRetriever` (no OpenAI needed), once with real RAG. Confirms `final_decision` has all required keys.

# **9. api.py** — imports the FastAPI app directly and verifies the route exists. Then runs the scoring logic without HTTP to confirm the wiring is correct.

# **10. HTTP (warnings only)** — hits `localhost:8000/health` and `POST /score_transaction` live. These are `[WARN]` not `[FAIL]` because they only work if `uvicorn` is already running — won't fail your test run if the server is off.

# ---

# **Reading the output**
# ```
# [PASS]  green  = working correctly
# [FAIL]  red    = broken, must fix before running server
# [WARN]  yellow = optional/live check, non-fatal