import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../axios";

// ── Constants mapped to your aml_system schema ────────────────────────────────
const RC = { High:"#FC8181", Medium:"#F6AD55", Low:"#68D391" };
const RB = { High:"rgba(252,129,129,0.12)", Medium:"rgba(246,173,85,0.12)", Low:"rgba(104,211,145,0.12)" };

// Your transactions collection statuses: PROCESSED, FLAGGED, BLOCKED
const SC = {
  PROCESSED:"#68D391", Cleared:"#68D391",  SUCCESS:"#68D391",
  FLAGGED:"#F6AD55",   Flagged:"#F6AD55",
  BLOCKED:"#FC8181",   Blocked:"#FC8181",
  ACTIVE:"#68D391",    FROZEN:"#F6AD55",
};
const SB = {
  PROCESSED:"rgba(104,211,145,0.12)", Cleared:"rgba(104,211,145,0.12)",
  FLAGGED:"rgba(246,173,85,0.12)",    Flagged:"rgba(246,173,85,0.12)",
  BLOCKED:"rgba(252,129,129,0.12)",   Blocked:"rgba(252,129,129,0.12)",
};

const fmt = (n, cur = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", { style:"currency", currency: cur || "USD" }).format(Number(n)||0);
  } catch { return `$${Number(n||0).toFixed(2)}`; }
};

const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
const PAGE_SIZE = 10;

const TABS = [
  { id:"overview",  icon:"◈",  label:"Overview"      },
  { id:"accounts",  icon:"🏦", label:"My Accounts"   },
  { id:"send",      icon:"↗",  label:"Send Money"    },
  { id:"csv",       icon:"📂", label:"Upload CSV"    },
  { id:"history",   icon:"📋", label:"Tx History"    },
  { id:"risk",      icon:"🛡", label:"Risk Profile"  },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function CustomerDashboard() {
  const navigate = useNavigate();

  const [tab, setTab]           = useState("overview");
  const [user, setUser]         = useState(null);
  const [accounts, setAccounts] = useState([]);   // from aml_system.accounts
  const [txns, setTxns]         = useState([]);   // from aml_system.transactions
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");

  // Send Money
  const [sendForm, setSendForm]       = useState({ fromAccount:"", toAccount:"", amount:"", currency:"USD", paymentMethod:"ACH", description:"" });
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult]   = useState(null);

  // CSV
  const [csvFile, setCsvFile]         = useState(null);
  const [csvDrag, setCsvDrag]         = useState(false);
  const [csvLoading, setCsvLoading]   = useState(false);
  const [csvReport, setCsvReport]     = useState(null);
  const fileRef = useRef();

  // History
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter]     = useState("All");
  const [page, setPage]                 = useState(1);
  const [selTxn, setSelTxn]            = useState(null);

  // ── Load all data ───────────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true); setErr("");
    try {
      const token = localStorage.getItem("token");
      if (!token) { navigate("/login"); return; }

      const [profRes, accsRes, txnsRes] = await Promise.allSettled([
        API.get("/profile/me", auth()),
        API.get("/accounts/my", auth()),
        API.get("/transactions/my", auth()),
      ]);

      // Profile — required
      if (profRes.status === "fulfilled") {
        const data = profRes.value.data;
        if (data.setupRequired) { navigate("/profile-setup"); return; }
        setUser(data.user);
      } else {
        const status = profRes.reason?.response?.status;
        if (status === 401) { navigate("/login"); return; }
        setErr("Failed to load profile. Check your connection and retry.");
        setLoading(false); return;
      }

      // Accounts — from aml_system.accounts
      // Schema: { account_id, account_status, customer_id, balance, risk_score, flags }
      setAccounts(accsRes.status === "fulfilled" ? (accsRes.value.data || []) : []);

      // Transactions — from aml_system.transactions (normalized by backend)
      // Schema: { transactionId, fromAccount, toAccount, amount, currency,
      //           description, category, type, risk, riskScore, status, createdAt }
      setTxns(txnsRes.status === "fulfilled" ? (txnsRes.value.data || []) : []);

    } catch (e) {
      setErr("Something went wrong. Please retry.");
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  // ── Derived stats ───────────────────────────────────────────────────────────
  const totalBalance  = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const flaggedCount  = txns.filter(t => t.status === "Flagged" || t.status === "FLAGGED" || t.status === "Blocked" || t.status === "BLOCKED").length;
  const avgRisk       = accounts.length ? Math.round(accounts.reduce((s,a) => s + (a.risk_score||0), 0) / accounts.length) : 0;
  const initials      = user?.name?.split(" ").map(w=>w[0]).join("") || "U";
  const logout        = () => { localStorage.clear(); navigate("/"); };

  // History filters
  const filteredTxns = txns.filter(t => {
    const s = statusFilter === "All" || t.status === statusFilter;
    const tp = typeFilter  === "All" || t.type === typeFilter;
    return s && tp;
  });
  const totalPages = Math.ceil(filteredTxns.length / PAGE_SIZE);
  const paged      = filteredTxns.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  // ── Send Money handler ──────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e.preventDefault(); setSendLoading(true); setSendResult(null);
    try {
      const res = await API.post("/transactions/send", sendForm, auth());
      setSendResult(res.data);
      if (res.data.transaction) setTxns(p => [res.data.transaction, ...p]);
      // Refresh accounts to show updated balance
      const aRes = await API.get("/accounts/my", auth());
      setAccounts(aRes.data || []);
      setSendForm({ fromAccount:"", toAccount:"", amount:"", currency:"USD", paymentMethod:"ACH", description:"" });
    } catch (e) {
      setSendResult({ status:"ERROR", message: e.response?.data?.msg || "Transaction failed." });
    } finally { setSendLoading(false); }
  };

  // ── CSV Upload handler ──────────────────────────────────────────────────────
  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setCsvLoading(true); setCsvReport(null);
    try {
      const fd = new FormData(); fd.append("file", csvFile);
      const res = await API.post("/transactions/upload-csv", fd, {
        headers: { Authorization:`Bearer ${localStorage.getItem("token")}`, "Content-Type":"multipart/form-data" },
      });
      setCsvReport(res.data.report || res.data);
      const tRes = await API.get("/transactions/my", auth());
      setTxns(tRes.data || []);
    } catch (e) {
      setCsvReport({ error: e.response?.data?.msg || "Upload failed." });
    } finally {
      setCsvLoading(false); setCsvFile(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Loading / Error ─────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#080e1c", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, fontFamily:"'Sora',sans-serif" }}>
      <div style={{ fontSize:50, color:"#63b3ed" }}>⬡</div>
      <div style={{ color:"#63b3ed", fontSize:16, fontWeight:700 }}>Loading your dashboard...</div>
      <div style={{ color:"#4a5568", fontSize:13 }}>Connecting to AML System</div>
    </div>
  );

  if (err) return (
    <div style={{ minHeight:"100vh", background:"#080e1c", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, fontFamily:"'Sora',sans-serif" }}>
      <div style={{ fontSize:40 }}>⚠️</div>
      <div style={{ color:"#FC8181", fontSize:15, textAlign:"center", maxWidth:400 }}>{err}</div>
      <button onClick={loadAll} style={s.btn}>Retry</button>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>

      {/* ══ SIDEBAR ══ */}
      <aside style={s.sidebar}>
        <div>
          {/* Logo */}
          <div style={s.logoWrap}>
            <span style={{ fontSize:26, color:"#63b3ed" }}>⬡</span>
            <span style={{ fontSize:17, fontWeight:800, color:"#f7fafc" }}>AML<span style={{ color:"#63b3ed" }}>Secure</span></span>
          </div>

          {/* User */}
          <div style={s.userCard}>
            <div style={s.avatar}>{initials}</div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#f7fafc", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user?.name}</div>
              <div style={{ fontSize:11, color:"#4a5568" }}>Customer · ID {user?.customer_id}</div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:2 }}>
            {TABS.map(({ id, icon, label }) => (
              <button key={id} onClick={() => { setTab(id); setPage(1); }}
                style={{ ...s.navBtn, ...(tab === id ? s.navActive : {}) }}>
                <span style={{ width:22, textAlign:"center", fontSize:16, flexShrink:0 }}>{icon}</span>
                <span style={{ flex:1, textAlign:"left" }}>{label}</span>
                {id === "history" && flaggedCount > 0 &&
                  <span style={s.badge}>{flaggedCount}</span>}
              </button>
            ))}
          </nav>
        </div>
        <button onClick={logout} style={s.logoutBtn}>↩ Logout</button>
      </aside>

      {/* ══ MAIN ══ */}
      <main style={s.main}>

        {/* ─── OVERVIEW ─── */}
        {tab === "overview" && (
          <Section title={`Welcome back, ${user?.name?.split(" ")[0]} 👋`} sub="Your AML-monitored financial overview">

            {/* Stats */}
            <div style={s.statsGrid}>
              {[
                { label:"Total Accounts",    value: accounts.length,          sub:"Linked to your ID",           color:"#63b3ed", icon:"🏦" },
                { label:"Total Balance",      value: fmt(totalBalance),         sub:"Across all accounts",         color:"#68D391", icon:"💰" },
                { label:"Transactions",       value: txns.length,              sub:"Sent & received",              color:"#a78bfa", icon:"↔"  },
                { label:"Flagged / Blocked",  value: flaggedCount,             sub:flaggedCount > 0 ? "Needs attention" : "All clear", color: flaggedCount > 0 ? "#FC8181" : "#68D391", icon:"⚠" },
              ].map(({ label, value, sub, color, icon }) => (
                <div key={label} style={s.statCard}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                    <span style={s.statLbl}>{label}</span>
                    <span style={{ fontSize:20 }}>{icon}</span>
                  </div>
                  <div style={{ fontSize:28, fontWeight:800, color, marginBottom:4 }}>{value}</div>
                  <div style={{ fontSize:11, color:"#4a5568" }}>{sub}</div>
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, background:color, opacity:0.5 }} />
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
              {[
                { label:"Send Money",    icon:"↗",  t:"send",    c:"#63b3ed" },
                { label:"Upload CSV",   icon:"📂",   t:"csv",     c:"#F6AD55" },
                { label:"Tx History",   icon:"📋",   t:"history", c:"#a78bfa" },
              ].map(({ label, icon, t, c }) => (
                <button key={t} onClick={() => setTab(t)}
                  style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, padding:"20px 10px", borderRadius:14, border:`1px solid ${c}30`, background:`${c}08`, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s" }}
                  onMouseEnter={e => { e.currentTarget.style.background=`${c}18`; e.currentTarget.style.borderColor=`${c}60`; }}
                  onMouseLeave={e => { e.currentTarget.style.background=`${c}08`; e.currentTarget.style.borderColor=`${c}30`; }}>
                  <span style={{ fontSize:26 }}>{icon}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:c }}>{label}</span>
                </button>
              ))}
            </div>

            {/* Account cards preview */}
            {accounts.length > 0 && (
              <div style={s.card}>
                <Row>
                  <CardTitle>My Accounts</CardTitle>
                  <button onClick={() => setTab("accounts")} style={s.viewAll}>View All →</button>
                </Row>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
                  {accounts.slice(0, 4).map(acc => (
                    <AccountMiniCard key={acc._id?.toString() || acc.account_id} acc={acc} />
                  ))}
                </div>
              </div>
            )}

            {/* Recent transactions */}
            <div style={s.card}>
              <Row>
                <CardTitle>Recent Transactions</CardTitle>
                <button onClick={() => setTab("history")} style={s.viewAll}>View All →</button>
              </Row>
              {txns.length === 0
                ? <Empty text="No transactions yet. Use Send Money or Upload CSV to get started." />
                : txns.slice(0, 6).map(t => <TxnRow key={t._id?.toString()} t={t} cid={user?.customer_id} onClick={() => setSelTxn(t)} />)
              }
            </div>
          </Section>
        )}

        {/* ─── MY ACCOUNTS ─── */}
        {tab === "accounts" && (
          <Section title="My Accounts" sub={`All accounts linked to customer ID ${user?.customer_id}`}>
            {accounts.length === 0
              ? <div style={{ ...s.card, textAlign:"center", padding:"60px 24px" }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>🏦</div>
                  <div style={{ color:"#4a5568", fontSize:14, marginBottom:4 }}>No accounts found for your customer ID.</div>
                  <div style={{ color:"#2d3748", fontSize:12 }}>Accounts are created by the AML system. Contact your administrator.</div>
                </div>
              : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:18 }}>
                  {accounts.map(acc => <AccountFullCard key={acc._id?.toString() || acc.account_id} acc={acc} />)}
                </div>
            }
          </Section>
        )}

        {/* ─── SEND MONEY ─── */}
        {tab === "send" && (
          <Section title="Send Money" sub="Transfer funds — screened by AML pipeline in real-time">
            <div style={s.twoCol}>

              {/* Form */}
              <div style={s.card}>
                <CardTitle>Transfer Details</CardTitle>

                {/* Result banner */}
                {sendResult && <SendResultBanner result={sendResult} onClose={() => setSendResult(null)} />}

                <form onSubmit={handleSend} style={s.form}>

                  {/* FROM — dropdown of customer's own accounts */}
                  <FieldGroup label="From Account (your account_id)" icon="🏦">
                    <select required value={sendForm.fromAccount}
                      onChange={e => setSendForm({ ...sendForm, fromAccount:e.target.value })}
                      style={s.sel}>
                      <option value="">Select your account</option>
                      {accounts.filter(a => a.account_status === "ACTIVE").map(a => (
                        <option key={a.account_id} value={a.account_id}>
                          {a.account_id} — {fmt(a.balance, "USD")} ({a.accountType || "Account"})
                        </option>
                      ))}
                    </select>
                    {accounts.filter(a => a.account_status === "ACTIVE").length === 0 && (
                      <div style={{ fontSize:12, color:"#FC8181", marginTop:6 }}>⚠ No active accounts found.</div>
                    )}
                  </FieldGroup>

                  {/* TO — type receiver account_id */}
                  <FieldGroup label="To Account (receiver's account_id)" icon="↗">
                    <input required type="text" placeholder="e.g. 8045CC910"
                      value={sendForm.toAccount}
                      onChange={e => setSendForm({ ...sendForm, toAccount:e.target.value })}
                      style={s.inp} />
                  </FieldGroup>

                  {/* Amount + Currency */}
                  <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:12 }}>
                    <FieldGroup label="Amount" icon="💵">
                      <input required type="number" min="0.01" step="0.01" placeholder="0.00"
                        value={sendForm.amount}
                        onChange={e => setSendForm({ ...sendForm, amount:e.target.value })}
                        style={s.inp} />
                    </FieldGroup>
                    <FieldGroup label="Currency" icon="🌐">
                      <select value={sendForm.currency}
                        onChange={e => setSendForm({ ...sendForm, currency:e.target.value })}
                        style={s.sel}>
                        {["USD","EUR","GBP","INR","Ruble","AED"].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </FieldGroup>
                  </div>

                  {/* Payment Method — matches your payment_method field */}
                  <FieldGroup label="Payment Method" icon="🏧">
                    <select value={sendForm.paymentMethod}
                      onChange={e => setSendForm({ ...sendForm, paymentMethod:e.target.value })}
                      style={s.sel}>
                      {["ACH","WIRE","SWIFT","SEPA","NEFT","RTGS","Internal Transfer","Other"].map(m => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </FieldGroup>

                  {/* Description */}
                  <FieldGroup label="Description (optional)" icon="📝">
                    <input type="text" placeholder="e.g. Invoice #123, Rent, Salary"
                      value={sendForm.description}
                      onChange={e => setSendForm({ ...sendForm, description:e.target.value })}
                      style={s.inp} />
                  </FieldGroup>

                  <div style={s.infoBox}>
                    🛡️ This transaction will be screened by the AML pipeline. High-risk transfers may be FLAGGED or BLOCKED.
                  </div>

                  <button type="submit"
                    style={{ ...s.btn, opacity: sendLoading || !sendForm.fromAccount ? 0.6 : 1 }}
                    disabled={sendLoading || !sendForm.fromAccount}>
                    {sendLoading ? "⏳ Running AML Check..." : "↗ Send Transaction"}
                  </button>
                </form>
              </div>

              {/* AML Info Panel */}
              <div>
                <div style={s.card}>
                  <CardTitle>AML Pipeline Flow</CardTitle>
                  {[
                    { n:"1", title:"Transaction Submitted",      desc:"Your transfer details are queued for AML screening.",                      c:"#63b3ed" },
                    { n:"2", title:"Risk Analysis",               desc:"AI agents check amount, payment method, pattern, and recipient.",          c:"#F6AD55" },
                    { n:"3", title:"Policy Match (RAG)",          desc:"Policy agent matches against AML policy documents using RAG.",             c:"#a78bfa" },
                    { n:"4", title:"Decision",                    desc:"PROCESSED = cleared. FLAGGED = review. BLOCKED = rejected.",               c:"#68D391" },
                  ].map(({ n, title, desc, c }) => (
                    <div key={n} style={{ display:"flex", gap:14, marginBottom:18 }}>
                      <div style={{ width:30, height:30, borderRadius:"50%", background:`${c}20`, color:c, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, flexShrink:0 }}>{n}</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0", marginBottom:3 }}>{title}</div>
                        <div style={{ fontSize:12, color:"#4a5568", lineHeight:1.5 }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Status legend */}
                <div style={s.card}>
                  <CardTitle>Transaction Statuses</CardTitle>
                  {[
                    { st:"PROCESSED", c:"#68D391", desc:"Cleared by AML — funds transferred" },
                    { st:"FLAGGED",   c:"#F6AD55", desc:"Under review — compliance team notified" },
                    { st:"BLOCKED",   c:"#FC8181", desc:"Rejected — high risk detected, no transfer" },
                  ].map(({ st, c, desc }) => (
                    <div key={st} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                      <span style={{ display:"inline-block", padding:"3px 12px", borderRadius:6, fontSize:11, fontWeight:800, background:`${c}18`, color:c, minWidth:90, textAlign:"center" }}>{st}</span>
                      <span style={{ fontSize:12, color:"#4a5568" }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* ─── CSV UPLOAD ─── */}
        {tab === "csv" && (
          <Section title="Upload CSV Transactions" sub="Bulk import — every row is screened by the AML pipeline">
            <div style={s.twoCol}>

              {/* Upload */}
              <div>
                <div style={s.card}>
                  <CardTitle>Upload File</CardTitle>
                  <div
                    style={{ border:`2px dashed ${csvDrag?"#63b3ed":csvFile?"rgba(104,211,145,0.6)":"rgba(99,179,237,0.2)"}`, borderRadius:14, padding:"44px 20px", textAlign:"center", cursor:"pointer", background: csvDrag?"rgba(99,179,237,0.06)":csvFile?"rgba(104,211,145,0.04)":"transparent", marginBottom:16, transition:"all 0.2s" }}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setCsvDrag(true); }}
                    onDragLeave={() => setCsvDrag(false)}
                    onDrop={e => { e.preventDefault(); setCsvDrag(false); const f=e.dataTransfer.files[0]; if(f?.name.endsWith(".csv")) setCsvFile(f); }}>
                    <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }}
                      onChange={e => setCsvFile(e.target.files[0])} />
                    <div style={{ fontSize:42, marginBottom:10 }}>{csvFile?"📄":"📂"}</div>
                    <div style={{ fontSize:14, fontWeight:600, color: csvFile?"#68D391":"#4a5568", marginBottom:4 }}>
                      {csvFile ? csvFile.name : "Drag & drop CSV here"}
                    </div>
                    <div style={{ fontSize:12, color:"#2d3748" }}>
                      {csvFile ? `${(csvFile.size/1024).toFixed(1)} KB · click to change` : "or click to browse · .csv only"}
                    </div>
                  </div>

                  <div style={{ display:"flex", gap:10 }}>
                    {csvFile && (
                      <button onClick={() => { setCsvFile(null); if(fileRef.current) fileRef.current.value=""; }}
                        style={{ ...s.ghostBtn, flexShrink:0 }}>✕ Remove</button>
                    )}
                    <button onClick={handleCsvUpload} disabled={!csvFile || csvLoading}
                      style={{ ...s.btn, flex:1, opacity:(!csvFile||csvLoading)?0.5:1 }}>
                      {csvLoading ? "⏳ Processing AML Pipeline..." : "⬆ Upload & Analyze"}
                    </button>
                  </div>
                </div>

                {/* Format guide */}
                <div style={s.card}>
                  <CardTitle>📋 CSV Format</CardTitle>
                  <div style={{ background:"rgba(0,0,0,0.3)", borderRadius:10, padding:"14px 16px", marginBottom:12 }}>
                    {[
                      { line:"toAccount,amount,currency,paymentMethod,description", c:"#63b3ed" },
                      { line:"8045CC910,5000,USD,ACH,Rent payment",                 c:"#68D391" },
                      { line:"8037732C0,120000,USD,WIRE,Invoice #44",               c:"#F6AD55" },
                      { line:"80D1BD2F0,1500,USD,NEFT,Salary credit",              c:"#68D391" },
                    ].map(({ line, c }, i) => (
                      <code key={i} style={{ display:"block", fontFamily:"monospace", fontSize:11, color:c, marginBottom:4, lineHeight:1.7 }}>{line}</code>
                    ))}
                  </div>
                  <div style={{ fontSize:12, color:"#4a5568", lineHeight:1.8 }}>
                    <div>• <code style={{ color:"#63b3ed" }}>toAccount</code> = receiver's <strong>account_id</strong> from aml_system</div>
                    <div>• <code style={{ color:"#63b3ed" }}>paymentMethod</code> = ACH, WIRE, SWIFT, NEFT etc.</div>
                    <div>• Amounts over 100,000 are automatically high-risk checked</div>
                  </div>
                </div>
              </div>

              {/* Report */}
              <div style={s.card}>
                <CardTitle>AML Screening Report</CardTitle>
                {!csvReport
                  ? <Empty text="Upload a CSV to see the AML pipeline report here." />
                  : csvReport.error
                  ? <div style={{ color:"#FC8181", padding:"20px 0", fontSize:14 }}>⚠ {csvReport.error}</div>
                  : (
                    <div>
                      {/* Summary numbers */}
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
                        {[
                          { label:"Total",    v:csvReport.total,    c:"#63b3ed", icon:"↔"  },
                          { label:"Cleared",  v:csvReport.cleared,  c:"#68D391", icon:"✅"  },
                          { label:"High Risk",v:csvReport.highRisk, c:"#FC8181", icon:"🚨"  },
                          { label:"Flagged",  v:csvReport.flagged,  c:"#F6AD55", icon:"⚠"   },
                          { label:"Blocked",  v:csvReport.blocked,  c:"#FC8181", icon:"🚫"  },
                          { label:"Cases",    v:csvReport.cases,    c:"#a78bfa", icon:"📁"  },
                        ].map(({ label, v, c, icon }) => (
                          <div key={label} style={{ textAlign:"center", padding:"14px 6px", borderRadius:12, border:`1px solid ${c}20`, background:`${c}08` }}>
                            <div style={{ fontSize:20, marginBottom:6 }}>{icon}</div>
                            <div style={{ fontSize:24, fontWeight:800, color:c }}>{v ?? 0}</div>
                            <div style={{ fontSize:10, color:"#4a5568", marginTop:3 }}>{label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Risk bar */}
                      {csvReport.total > 0 && (
                        <div style={{ marginBottom:20 }}>
                          <div style={{ fontSize:11, color:"#4a5568", fontWeight:700, letterSpacing:0.8, marginBottom:8 }}>RISK DISTRIBUTION</div>
                          <div style={{ height:10, borderRadius:100, overflow:"hidden", display:"flex" }}>
                            <div style={{ flex:csvReport.cleared||0, background:"#68D391", transition:"flex 0.5s" }} />
                            <div style={{ flex:csvReport.flagged||0, background:"#F6AD55", transition:"flex 0.5s" }} />
                            <div style={{ flex:csvReport.blocked||0, background:"#FC8181", transition:"flex 0.5s" }} />
                          </div>
                          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#4a5568", marginTop:5 }}>
                            <span>● Cleared</span><span>● Flagged</span><span>● Blocked</span>
                          </div>
                        </div>
                      )}

                      {/* Per-row breakdown */}
                      {csvReport.transactions?.length > 0 && (
                        <div style={{ maxHeight:280, overflowY:"auto", display:"flex", flexDirection:"column", gap:5 }}>
                          {csvReport.transactions.map((t, i) => (
                            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, background:"rgba(255,255,255,0.03)" }}>
                              <span style={{ fontSize:11, color:"#2d3748", width:22, flexShrink:0 }}>#{i+1}</span>
                              <span style={{ fontSize:12, color:"#e2e8f0", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.description||`TXN ${i+1}`}</span>
                              <span style={{ fontSize:12, fontWeight:700, color:"#63b3ed", flexShrink:0 }}>{fmt(t.amount)}</span>
                              {t.risk && <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:5, color:RC[t.risk], background:RB[t.risk], flexShrink:0 }}>{t.risk}</span>}
                              <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:5, color:SC[t.status]||"#a0aec0", background:SB[t.status]||"rgba(160,174,192,0.1)", flexShrink:0 }}>{t.status}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {csvReport.errors?.length > 0 && (
                        <div style={{ marginTop:16, padding:"12px 16px", borderRadius:10, background:"rgba(252,129,129,0.08)", border:"1px solid rgba(252,129,129,0.2)" }}>
                          <div style={{ fontSize:12, color:"#FC8181", fontWeight:700, marginBottom:8 }}>⚠ {csvReport.errors.length} row(s) had errors:</div>
                          {csvReport.errors.map((e, i) => (
                            <div key={i} style={{ fontSize:11, color:"#4a5568", marginBottom:3 }}>Row {e.row}: {e.msg}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }
              </div>
            </div>
          </Section>
        )}

        {/* ─── TX HISTORY ─── */}
        {tab === "history" && (
          <Section title="Transaction History" sub="All transactions where you are sender or receiver">

            {/* Filters */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:16, alignItems:"center" }}>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <span style={s.filterLbl}>STATUS:</span>
                {["All","Cleared","Flagged","Blocked"].map(f => (
                  <button key={f} onClick={() => { setStatusFilter(f); setPage(1); }}
                    style={{ ...s.filterBtn, ...(statusFilter===f ? { background:SC[f]||"#63b3ed", color:"#080e1c", borderColor:"transparent" } : {}) }}>{f}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <span style={s.filterLbl}>TYPE:</span>
                {["All","debit","credit"].map(f => (
                  <button key={f} onClick={() => { setTypeFilter(f); setPage(1); }}
                    style={{ ...s.filterBtn, ...(typeFilter===f ? { background:"#63b3ed", color:"#080e1c", borderColor:"transparent" } : {}) }}>
                    {f === "debit" ? "↑ Sent" : f === "credit" ? "↓ Received" : f}
                  </button>
                ))}
              </div>
              <span style={{ marginLeft:"auto", fontSize:12, color:"#4a5568", fontWeight:600 }}>{filteredTxns.length} transactions</span>
            </div>

            <div style={s.card}>
              {paged.length === 0
                ? <Empty text="No transactions match your filters." />
                : (
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", minWidth:720 }}>
                      <thead>
                        <tr>
                          {["Txn ID","Date","From → To","Amount","Method","Risk","Status"].map(h => (
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paged.map(t => (
                          <tr key={t._id?.toString()}
                            style={{ borderBottom:"1px solid rgba(99,179,237,0.05)", cursor:"pointer", transition:"background 0.15s" }}
                            onClick={() => setSelTxn(t)}
                            onMouseEnter={e => e.currentTarget.style.background="rgba(99,179,237,0.04)"}
                            onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                            <td style={{ ...s.td, color:"#63b3ed", fontFamily:"monospace", fontWeight:600 }}>
                              {String(t.transactionId||t._id||"").slice(-10).toUpperCase()}
                            </td>
                            <td style={{ ...s.td, whiteSpace:"nowrap" }}>
                              {new Date(t.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                            </td>
                            <td style={{ ...s.td, fontFamily:"monospace", whiteSpace:"nowrap" }}>
                              <span style={{ color: t.type==="debit"?"#FC8181":"#68D391" }}>
                                {t.type==="debit" ? "↑" : "↓"}
                              </span>
                              {" "}
                              <span style={{ color:"#68D391" }}>•••{String(t.fromAccount||"???").slice(-6)}</span>
                              <span style={{ color:"#4a5568" }}> → </span>
                              <span style={{ color:"#FC8181" }}>•••{String(t.toAccount||"???").slice(-6)}</span>
                            </td>
                            <td style={{ ...s.td, fontWeight:700, whiteSpace:"nowrap", color: t.type==="credit"?"#68D391":"#FC8181" }}>
                              {t.type==="credit"?"+":"-"}{fmt(t.amount, t.currency)} <span style={{ fontSize:10, color:"#4a5568" }}>{t.currency}</span>
                            </td>
                            <td style={{ ...s.td, color:"#a0aec0", whiteSpace:"nowrap" }}>{t.category||"—"}</td>
                            <td style={s.td}>
                              {t.risk
                                ? <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:5, color:RC[t.risk], background:RB[t.risk] }}>
                                    {t.risk}{t.riskScore != null ? ` (${t.riskScore})` : ""}
                                  </span>
                                : <span style={{ color:"#4a5568" }}>—</span>}
                            </td>
                            <td style={s.td}>
                              <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:6, color:SC[t.status]||"#a0aec0", background:SB[t.status]||"rgba(160,174,192,0.08)" }}>
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:20, flexWrap:"wrap" }}>
                  <button onClick={() => setPage(p=>Math.max(1,p-1))} disabled={page===1}
                    style={{ ...s.pgBtn, opacity:page===1?0.4:1 }}>← Prev</button>
                  {Array.from({ length:totalPages },(_,i)=>i+1).map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      style={{ ...s.pgBtn, ...(page===p ? { background:"#63b3ed", color:"#080e1c", borderColor:"transparent", fontWeight:700 } : {}) }}>{p}</button>
                  ))}
                  <button onClick={() => setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                    style={{ ...s.pgBtn, opacity:page===totalPages?0.4:1 }}>Next →</button>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ─── RISK PROFILE ─── */}
        {tab === "risk" && (
          <Section title="Risk Profile" sub="AML risk assessment from your account activity">
            <div style={s.twoCol}>

              {/* Risk Score */}
              <div style={s.card}>
                <CardTitle>Risk Score Overview</CardTitle>
                <div style={{ textAlign:"center", padding:"20px 0 28px" }}>
                  <div style={{ fontSize:88, fontWeight:800, color: avgRisk >= 70 ? "#FC8181" : avgRisk >= 40 ? "#F6AD55" : "#68D391", lineHeight:1 }}>{avgRisk}</div>
                  <div style={{ fontSize:13, color:"#4a5568", margin:"8px 0 16px" }}>average risk score across accounts</div>
                  <div style={{ display:"inline-block", padding:"8px 24px", borderRadius:100, fontSize:12, fontWeight:800, letterSpacing:1,
                    background: avgRisk>=70?"rgba(252,129,129,0.15)":avgRisk>=40?"rgba(246,173,85,0.15)":"rgba(104,211,145,0.15)",
                    color:       avgRisk>=70?"#FC8181":avgRisk>=40?"#F6AD55":"#68D391",
                  }}>
                    🛡 {avgRisk>=70?"HIGH":avgRisk>=40?"MEDIUM":"LOW"} RISK
                  </div>
                </div>

                {/* Gauge bar */}
                <div style={{ position:"relative", marginBottom:20 }}>
                  <div style={{ height:10, borderRadius:100, background:"linear-gradient(to right,#68D391,#F6AD55,#FC8181)" }} />
                  <div style={{ position:"absolute", top:-3, left:`${Math.min(avgRisk,99)}%`, width:16, height:16, borderRadius:"50%", background:"#fff", border:"3px solid #63b3ed", transform:"translateX(-50%)", boxShadow:"0 0 10px rgba(99,179,237,0.6)" }} />
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#4a5568", marginBottom:24 }}>
                  <span>0 · Low</span><span>40 · Medium</span><span>70 · High · 100</span>
                </div>

                {/* Per-account risk */}
                <div style={{ borderTop:"1px solid rgba(99,179,237,0.08)", paddingTop:16 }}>
                  <div style={{ fontSize:11, color:"#4a5568", fontWeight:700, letterSpacing:0.8, marginBottom:12 }}>PER ACCOUNT</div>
                  {accounts.map(acc => (
                    <div key={acc.account_id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                      <span style={{ fontFamily:"monospace", fontSize:12, color:"#63b3ed", flex:1 }}>•••{acc.account_id?.slice(-6)}</span>
                      <div style={{ flex:2, height:6, borderRadius:100, background:"rgba(255,255,255,0.06)", overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${Math.min(acc.risk_score||0,100)}%`, background: (acc.risk_score||0)>=70?"#FC8181":(acc.risk_score||0)>=40?"#F6AD55":"#68D391", borderRadius:100 }} />
                      </div>
                      <span style={{ fontSize:12, fontWeight:700, color:(acc.risk_score||0)>=70?"#FC8181":(acc.risk_score||0)>=40?"#F6AD55":"#68D391", width:28, textAlign:"right" }}>{acc.risk_score||0}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Flags + Stats */}
              <div>
                <div style={s.card}>
                  <CardTitle>Transaction Risk Breakdown</CardTitle>
                  {[
                    { label:"High Risk",   count:txns.filter(t=>t.risk==="High").length,   color:"#FC8181" },
                    { label:"Medium Risk", count:txns.filter(t=>t.risk==="Medium").length, color:"#F6AD55" },
                    { label:"Low Risk",    count:txns.filter(t=>t.risk==="Low").length,    color:"#68D391" },
                  ].map(({ label, count, color }) => {
                    const pct = txns.length ? Math.round((count/txns.length)*100) : 0;
                    return (
                      <div key={label} style={{ marginBottom:18 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
                          <span style={{ fontSize:13, color:"#a0aec0" }}>{label}</span>
                          <span style={{ fontSize:13, fontWeight:700, color }}>{count} txns · {pct}%</span>
                        </div>
                        <div style={{ height:7, borderRadius:100, background:"rgba(255,255,255,0.06)", overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:100, transition:"width 0.6s ease" }} />
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ borderTop:"1px solid rgba(99,179,237,0.08)", paddingTop:16, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                    {[
                      { label:"Total", v:txns.length,    c:"#63b3ed" },
                      { label:"Flagged", v:txns.filter(t=>t.status==="Flagged"||t.status==="FLAGGED").length, c:"#F6AD55" },
                      { label:"Blocked", v:txns.filter(t=>t.status==="Blocked"||t.status==="BLOCKED").length, c:"#FC8181" },
                    ].map(({ label, v, c }) => (
                      <div key={label} style={{ textAlign:"center" }}>
                        <div style={{ fontSize:28, fontWeight:800, color:c }}>{v}</div>
                        <div style={{ fontSize:11, color:"#4a5568" }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active flags from accounts */}
                <div style={s.card}>
                  <CardTitle>Active Flags</CardTitle>
                  {accounts.every(a => !a.flags?.length)
                    ? <Empty text="✅ No active flags on your accounts." />
                    : accounts.filter(a => a.flags?.length > 0).map(acc => (
                        <div key={acc.account_id} style={{ marginBottom:12 }}>
                          <div style={{ fontSize:11, color:"#63b3ed", fontFamily:"monospace", marginBottom:6 }}>Account •••{acc.account_id?.slice(-6)}</div>
                          {acc.flags.map((flag, i) => (
                            <div key={i} style={{ display:"flex", gap:8, alignItems:"center", padding:"6px 10px", borderRadius:8, background:"rgba(252,129,129,0.08)", border:"1px solid rgba(252,129,129,0.2)", marginBottom:4 }}>
                              <span style={{ color:"#FC8181" }}>⚑</span>
                              <span style={{ fontSize:12, color:"#FC8181" }}>{typeof flag === "string" ? flag : JSON.stringify(flag)}</span>
                            </div>
                          ))}
                        </div>
                      ))
                  }
                </div>
              </div>
            </div>
          </Section>
        )}
      </main>

      {/* ══ TRANSACTION DETAIL MODAL ══ */}
      {selTxn && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:20 }}
          onClick={() => setSelTxn(null)}>
          <div style={{ background:"#0d1a2d", border:"1px solid rgba(99,179,237,0.2)", borderRadius:20, width:"100%", maxWidth:480, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 40px 100px rgba(0,0,0,0.7)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 24px", borderBottom:"1px solid rgba(99,179,237,0.1)", position:"sticky", top:0, background:"#0d1a2d" }}>
              <span style={{ fontSize:16, fontWeight:800, color:"#f7fafc" }}>Transaction Details</span>
              <button onClick={() => setSelTxn(null)} style={{ background:"none", border:"none", color:"#4a5568", fontSize:20, cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:12 }}>
              {[
                ["Transaction ID",   selTxn.transactionId || String(selTxn._id)],
                ["Date & Time",      new Date(selTxn.createdAt).toLocaleString()],
                ["Type",             selTxn.type === "debit" ? "↑ Sent" : "↓ Received"],
                ["From Account",     selTxn.fromAccount || "—"],
                ["To Account",       selTxn.toAccount   || "—"],
                ["Amount",           `${fmt(selTxn.amount, selTxn.currency)} ${selTxn.currency || "USD"}`],
                ["Payment Method",   selTxn.category    || "—"],
                ["Description",      selTxn.description || "—"],
                ["Risk Level",       selTxn.risk        || "—"],
                ["Risk Score",       selTxn.riskScore != null ? `${selTxn.riskScore}/100` : "—"],
                ["Risk Flags",       selTxn.risk_flags?.join(", ") || "None"],
                ["Status",           selTxn.status      || "—"],
              ].map(([label, value]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", borderBottom:"1px solid rgba(99,179,237,0.05)", paddingBottom:10, gap:12 }}>
                  <span style={{ fontSize:12, color:"#4a5568", flexShrink:0 }}>{label}</span>
                  <span style={{ fontSize:12, fontWeight:700, textAlign:"right", wordBreak:"break-all", maxWidth:"60%",
                    color: label==="Risk Level" ? (RC[value]||"#e2e8f0")
                         : label==="Status"     ? (SC[value]||"#e2e8f0")
                         : label==="Type"       ? (selTxn.type==="credit"?"#68D391":"#FC8181")
                         : label==="Amount"     ? (selTxn.type==="credit"?"#68D391":"#FC8181")
                         : "#e2e8f0"
                  }}>{value}</span>
                </div>
              ))}
            </div>
            {(selTxn.status==="Blocked"||selTxn.status==="BLOCKED") && (
              <div style={{ margin:"0 24px 20px", padding:"12px 16px", borderRadius:10, background:"rgba(252,129,129,0.1)", border:"1px solid rgba(252,129,129,0.2)", color:"#FC8181", fontSize:12, lineHeight:1.6 }}>
                🚫 This transaction was <strong>BLOCKED</strong> by the AML system. No funds were transferred.
              </div>
            )}
            {(selTxn.status==="Flagged"||selTxn.status==="FLAGGED") && (
              <div style={{ margin:"0 24px 20px", padding:"12px 16px", borderRadius:10, background:"rgba(246,173,85,0.1)", border:"1px solid rgba(246,173,85,0.2)", color:"#F6AD55", fontSize:12, lineHeight:1.6 }}>
                ⚠ This transaction is <strong>FLAGGED</strong> for AML compliance review.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Section({ title, sub, children }) {
  return (
    <div>
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontSize:26, fontWeight:800, color:"#f7fafc", marginBottom:4 }}>{title}</h1>
        <p style={{ fontSize:14, color:"#4a5568" }}>{sub}</p>
      </div>
      {children}
    </div>
  );
}

function CardTitle({ children }) {
  return <div style={{ fontSize:14, fontWeight:700, color:"#e2e8f0", marginBottom:18 }}>{children}</div>;
}

function Row({ children }) {
  return <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>{children}</div>;
}

function Empty({ text }) {
  return <div style={{ textAlign:"center", color:"#4a5568", padding:"36px 0", fontSize:14 }}>{text}</div>;
}

function FieldGroup({ label, icon, children }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
      <label style={{ fontSize:12, fontWeight:700, color:"#4a5568", textTransform:"uppercase", letterSpacing:0.6 }}>{label}</label>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"0 14px", borderRadius:12, border:`1px solid ${focused?"#63b3ed":"rgba(99,179,237,0.15)"}`, background:"rgba(255,255,255,0.02)", transition:"border-color 0.2s" }}
        onFocusCapture={() => setFocused(true)} onBlurCapture={() => setFocused(false)}>
        <span style={{ fontSize:16, flexShrink:0 }}>{icon}</span>
        {children}
      </div>
    </div>
  );
}

// Account mini card for overview
function AccountMiniCard({ acc }) {
  const isActive = acc.account_status === "ACTIVE";
  return (
    <div style={{ background:"rgba(99,179,237,0.04)", border:"1px solid rgba(99,179,237,0.12)", borderRadius:14, padding:"16px 18px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <span style={{ fontFamily:"monospace", fontSize:13, color:"#63b3ed", fontWeight:700 }}>•••{acc.account_id?.slice(-6)}</span>
        <span style={{ fontSize:10, fontWeight:800, padding:"3px 10px", borderRadius:100, background: isActive?"rgba(104,211,145,0.15)":"rgba(246,173,85,0.15)", color: isActive?"#68D391":"#F6AD55" }}>{acc.account_status}</span>
      </div>
      <div style={{ fontSize:22, fontWeight:800, color:"#f7fafc", marginBottom:4 }}>{fmt(acc.balance)}</div>
      <div style={{ fontSize:11, color:"#4a5568" }}>Risk score: {acc.risk_score || 0}</div>
    </div>
  );
}

// Full account card
function AccountFullCard({ acc }) {
  const isActive = acc.account_status === "ACTIVE";
  return (
    <div style={{ background:"linear-gradient(135deg,#0d2137 0%,#1a3a5c 50%,#0d2137 100%)", border:"1px solid rgba(99,179,237,0.25)", borderRadius:20, padding:"26px 28px", boxShadow:"0 16px 48px rgba(0,0,0,0.5)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 }}>
        <div>
          <div style={{ fontSize:11, color:"#63b3ed", fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:4 }}>AML Secure Bank</div>
          <div style={{ fontSize:12, color:"#4a5568" }}>{acc.accountType || "Account"}</div>
        </div>
        <span style={{ fontSize:10, fontWeight:800, padding:"4px 12px", borderRadius:100, background: isActive?"rgba(104,211,145,0.15)":"rgba(246,173,85,0.15)", color: isActive?"#68D391":"#F6AD55", letterSpacing:0.5 }}>
          {acc.account_status}
        </span>
      </div>
      <div style={{ fontSize:15, fontWeight:700, color:"#e2e8f0", letterSpacing:3, fontFamily:"monospace", marginBottom:24 }}>
        ••••  ••••  {acc.account_id?.slice(-8) || "????????"}
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
        <div>
          <div style={{ fontSize:10, color:"#4a5568", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Balance</div>
          <div style={{ fontSize:28, fontWeight:800, color:"#63b3ed" }}>{fmt(acc.balance)}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:10, color:"#4a5568", textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>Risk Score</div>
          <div style={{ fontSize:22, fontWeight:800, color: (acc.risk_score||0)>=70?"#FC8181":(acc.risk_score||0)>=40?"#F6AD55":"#68D391" }}>
            {acc.risk_score || 0}
          </div>
        </div>
      </div>
      {acc.flags?.length > 0 && (
        <div style={{ marginTop:14, padding:"8px 12px", borderRadius:8, background:"rgba(252,129,129,0.1)", border:"1px solid rgba(252,129,129,0.2)", fontSize:11, color:"#FC8181" }}>
          ⚑ {acc.flags.length} active flag(s): {acc.flags.slice(0,2).join(", ")}
        </div>
      )}
    </div>
  );
}

// Transaction row for overview
function TxnRow({ t, cid, onClick }) {
  const sent = t.type === "debit";
  return (
    <div onClick={onClick}
      style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 8px", borderBottom:"1px solid rgba(99,179,237,0.05)", cursor:"pointer", borderRadius:8, transition:"background 0.15s" }}
      onMouseEnter={e => e.currentTarget.style.background="rgba(99,179,237,0.04)"}
      onMouseLeave={e => e.currentTarget.style.background="transparent"}>
      <div style={{ width:36, height:36, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0, background: sent?"rgba(252,129,129,0.1)":"rgba(104,211,145,0.1)" }}>
        {sent ? "↑" : "↓"}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, color:"#e2e8f0", fontWeight:500, marginBottom:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {t.description || t.category || "Transaction"}
        </div>
        <div style={{ fontSize:11, color:"#4a5568" }}>
          {sent ? "To" : "From"} •••{sent ? String(t.toAccount||"").slice(-6) : String(t.fromAccount||"").slice(-6)} · {t.category}
        </div>
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <div style={{ fontSize:14, fontWeight:800, color: sent?"#FC8181":"#68D391", marginBottom:4 }}>
          {sent?"-":"+"}{fmt(t.amount, t.currency)}
        </div>
        <div style={{ display:"flex", gap:4, justifyContent:"flex-end" }}>
          {t.risk && <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:4, color:RC[t.risk], background:RB[t.risk] }}>{t.risk}</span>}
          <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, color:SC[t.status]||"#a0aec0", background:SB[t.status]||"rgba(160,174,192,0.08)" }}>{t.status}</span>
        </div>
      </div>
    </div>
  );
}

// Send result banner
function SendResultBanner({ result, onClose }) {
  const st = result.status;
  const c  = st==="SUCCESS"?"#68D391":st==="FLAGGED"?"#F6AD55":"#FC8181";
  const icon = st==="SUCCESS"?"✅":st==="FLAGGED"?"⚠️":"🚫";
  return (
    <div style={{ background:`${c}0d`, border:`1px solid ${c}40`, borderRadius:12, padding:"16px 20px", marginBottom:20, position:"relative" }}>
      <button onClick={onClose} style={{ position:"absolute", top:10, right:12, background:"none", border:"none", color:"#4a5568", cursor:"pointer", fontSize:16 }}>✕</button>
      <div style={{ fontSize:24, marginBottom:6 }}>{icon}</div>
      <div style={{ fontSize:15, fontWeight:800, color:c, marginBottom:4 }}>{st}</div>
      <div style={{ fontSize:12, color:"#a0aec0", lineHeight:1.5 }}>{result.message}</div>
      {result.riskScore != null && (
        <div style={{ marginTop:8, fontSize:12, color:"#4a5568" }}>
          Risk Score: <span style={{ fontWeight:700, color:c }}>{result.riskScore}/100</span>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  root:      { minHeight:"100vh", display:"flex", fontFamily:"'Sora','Segoe UI',sans-serif", background:"#080e1c", color:"#e2e8f0" },
  sidebar:   { width:250, background:"rgba(10,20,38,0.98)", borderRight:"1px solid rgba(99,179,237,0.08)", display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"24px 0", position:"sticky", top:0, height:"100vh", flexShrink:0, overflowY:"auto" },
  logoWrap:  { display:"flex", alignItems:"center", gap:10, padding:"0 22px 22px", borderBottom:"1px solid rgba(99,179,237,0.07)" },
  userCard:  { display:"flex", alignItems:"center", gap:12, padding:"16px 22px", borderBottom:"1px solid rgba(99,179,237,0.07)" },
  avatar:    { width:38, height:38, borderRadius:"50%", background:"linear-gradient(135deg,#63b3ed,#3182ce)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:13, color:"#080e1c", flexShrink:0 },
  navBtn:    { display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:10, border:"none", background:"transparent", color:"#4a5568", fontSize:13, fontWeight:500, cursor:"pointer", transition:"all 0.2s", fontFamily:"inherit", width:"100%" },
  navActive: { background:"rgba(99,179,237,0.1)", color:"#63b3ed", borderLeft:"3px solid #63b3ed" },
  badge:     { background:"#FC8181", color:"#080e1c", fontSize:10, fontWeight:800, padding:"2px 6px", borderRadius:100 },
  logoutBtn: { margin:"0 22px", padding:"10px 14px", borderRadius:10, border:"1px solid rgba(252,129,129,0.18)", background:"transparent", color:"#FC8181", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" },
  main:      { flex:1, padding:"36px 42px", overflowY:"auto", minWidth:0 },
  statsGrid: { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 },
  statCard:  { background:"rgba(10,20,38,0.8)", border:"1px solid rgba(99,179,237,0.1)", borderRadius:14, padding:"18px 20px", position:"relative", overflow:"hidden" },
  statLbl:   { fontSize:10, color:"#4a5568", fontWeight:700, textTransform:"uppercase", letterSpacing:0.8 },
  card:      { background:"rgba(10,20,38,0.7)", border:"1px solid rgba(99,179,237,0.08)", borderRadius:16, padding:"22px", marginBottom:18 },
  twoCol:    { display:"grid", gridTemplateColumns:"1fr 1fr", gap:18 },
  form:      { display:"flex", flexDirection:"column", gap:15 },
  inp:       { flex:1, padding:"13px 0", background:"transparent", border:"none", outline:"none", color:"#e2e8f0", fontSize:14, fontFamily:"inherit" },
  sel:       { flex:1, padding:"13px 0", background:"transparent", border:"none", outline:"none", color:"#e2e8f0", fontSize:14, fontFamily:"inherit", cursor:"pointer" },
  btn:       { padding:"13px 20px", borderRadius:12, border:"none", background:"linear-gradient(135deg,#63b3ed,#3182ce)", color:"#080e1c", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit", width:"100%", boxShadow:"0 6px 20px rgba(99,179,237,0.2)" },
  ghostBtn:  { padding:"12px 16px", borderRadius:12, border:"1px solid rgba(99,179,237,0.15)", background:"transparent", color:"#4a5568", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" },
  infoBox:   { background:"rgba(99,179,237,0.06)", border:"1px solid rgba(99,179,237,0.15)", borderRadius:10, padding:"11px 14px", fontSize:12, color:"#63b3ed", lineHeight:1.6 },
  viewAll:   { fontSize:12, color:"#63b3ed", background:"transparent", border:"none", cursor:"pointer", fontWeight:600, fontFamily:"inherit" },
  filterLbl: { fontSize:10, color:"#4a5568", fontWeight:700, letterSpacing:0.8 },
  filterBtn: { padding:"4px 12px", borderRadius:8, border:"1px solid rgba(99,179,237,0.15)", background:"transparent", color:"#4a5568", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s" },
  th:        { fontSize:10, fontWeight:700, color:"#4a5568", textTransform:"uppercase", letterSpacing:0.8, padding:"0 10px 14px 0", textAlign:"left", borderBottom:"1px solid rgba(99,179,237,0.07)", whiteSpace:"nowrap" },
  td:        { padding:"12px 10px 12px 0", fontSize:12, color:"#a0aec0" },
  pgBtn:     { padding:"6px 12px", borderRadius:8, border:"1px solid rgba(99,179,237,0.15)", background:"transparent", color:"#4a5568", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" },
};