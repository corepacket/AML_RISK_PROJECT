// ─────────────────────────────────────────────────────────────────────────────
// ProfileSetup.jsx
//
// PURPOSE: After signup, User has customer_id: null in MongoDB.
// This page lets the customer enter their customer_id to link their
// login account (fraud_ui DB) → their bank accounts (aml_system DB).
//
// FLOW:
//   1. Customer types customer_id (e.g. 18112)
//   2. POST /api/profile/setup  { customer_id: 18112 }
//   3. Backend checks aml_system.accounts for that customer_id
//   4. Found → saves to User document → redirect to /CustomerDashboard
//   5. Not found → show error
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../axios";

export default function ProfileSetup() {
  const navigate = useNavigate();

  // useState(initialValue) returns [currentValue, setterFunction]
  // When setter is called → React re-renders this component
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); // stop page reload
    if (!customerId.trim()) { setError("Please enter your Customer ID."); return; }

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");
      await API.post(
        "/profile/setup",
        { customer_id: Number(customerId) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(true);
      setTimeout(() => navigate("/CustomerDashboard"), 2000);
    } catch (err) {
      setError(err.response?.data?.msg || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Success Screen ──────────────────────────────────────────────────────────
  if (success) return (
    <div style={s.page}>
      <div style={s.blob1}/><div style={s.blob2}/>
      <div style={s.container}>
        <Logo />
        <div style={{ ...s.card, textAlign:"center", padding:"52px 32px" }}>
          <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
          <h2 style={{ fontSize:22, fontWeight:800, color:"#68D391", marginBottom:8 }}>Account Linked!</h2>
          <p style={{ fontSize:14, color:"#718096", lineHeight:1.7, marginBottom:28 }}>
            Customer ID <span style={{ color:"#63b3ed", fontWeight:700 }}>{customerId}</span> has been
            successfully linked. Redirecting to your dashboard...
          </p>
          <div style={s.progressBar}>
            <div style={{ ...s.progressFill, animation:"fill 2s ease forwards" }}/>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Main Form ───────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <div style={s.blob1}/><div style={s.blob2}/>

      <div style={s.container}>
        <Logo />

        <div style={s.card}>
          {/* Header */}
          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ fontSize:44, marginBottom:14 }}>🔗</div>
            <h1 style={s.title}>Link Your Account</h1>
            <p style={s.subtitle}>
              Connect your login to your bank accounts in the AML system
              by entering your <span style={{ color:"#63b3ed", fontWeight:700 }}>Customer ID</span>.
            </p>
          </div>

          {/* Info box explaining what customer_id is */}
          <div style={s.infoBox}>
            <div style={s.infoTitle}>ℹ️ What is a Customer ID?</div>
            <p style={s.infoText}>
              Your Customer ID is a unique number in the AML database that links
              to your bank accounts and transaction history. Examples:{" "}
              <code style={s.code}>18112</code>, <code style={s.code}>7818</code>,{" "}
              <code style={s.code}>121523</code>
            </p>
          </div>

          {/* Error box — conditionally rendered */}
          {error && <div style={s.errorBox}>⚠ {error}</div>}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:16 }}>

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <label style={s.label}>Your Customer ID</label>
              <div style={s.inputWrap}
                onFocusCapture={e  => e.currentTarget.style.borderColor="#63b3ed"}
                onBlurCapture={e   => e.currentTarget.style.borderColor="rgba(99,179,237,0.2)"}>
                <span style={{ fontSize:18 }}>🪪</span>
                <input
                  type="number"
                  placeholder="e.g. 18112"
                  value={customerId}
                  onChange={e => { setCustomerId(e.target.value); setError(""); }}
                  style={s.input}
                  autoFocus
                  min="1"
                />
              </div>
              <div style={{ fontSize:11, color:"#4a5568" }}>
                Provided by your bank or AML system administrator.
              </div>
            </div>

            <button type="submit"
              disabled={loading || !customerId.trim()}
              style={{ ...s.btn, opacity: loading || !customerId.trim() ? 0.6 : 1,
                cursor: loading || !customerId.trim() ? "not-allowed" : "pointer" }}>
              {loading ? "⏳ Verifying with AML System..." : "🔗 Link My Account →"}
            </button>
          </form>

          {/* Back link */}
          <div style={{ textAlign:"center", marginTop:20 }}>
            <button onClick={() => { localStorage.clear(); navigate("/login"); }}
              style={{ background:"none", border:"none", color:"#4a5568", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              ← Back to Login
            </button>
          </div>
        </div>

        {/* How it works — educational section below card */}
        <div style={s.howItWorks}>
          <div style={s.howTitle}>HOW IT WORKS</div>
          <div style={s.steps}>
            {[
              { n:"1", t:"Enter Customer ID",      d:"The ID that exists in the AML system database",    c:"#63b3ed" },
              { n:"2", t:"System Verifies",         d:"Backend checks aml_system.accounts collection",   c:"#F6AD55" },
              { n:"3", t:"Accounts Linked",         d:"Your login now shows your real accounts & txns",  c:"#68D391" },
            ].map(({ n, t, d, c }) => (
              <div key={n} style={s.step}>
                <div style={{ ...s.stepNum, background:`${c}18`, color:c }}>{n}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0", marginBottom:2 }}>{t}</div>
                  <div style={{ fontSize:11, color:"#4a5568", lineHeight:1.5 }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CSS animation for progress bar */}
      <style>{`
        @keyframes fill {
          from { width: 0% }
          to   { width: 100% }
        }
      `}</style>
    </div>
  );
}

// ── Logo sub-component ────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:24 }}>
      <span style={{ fontSize:28, color:"#63b3ed" }}>⬡</span>
      <span style={{ fontSize:22, fontWeight:800, color:"#f7fafc" }}>
        AML<span style={{ color:"#63b3ed" }}>Secure</span>
      </span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight:"100vh", background:"#080e1c",
    display:"flex", alignItems:"center", justifyContent:"center",
    fontFamily:"'Sora','Segoe UI',sans-serif", padding:"24px",
    position:"relative", overflow:"hidden",
  },
  blob1: {
    position:"absolute", top:"-120px", right:"-120px",
    width:"500px", height:"500px", borderRadius:"50%",
    background:"radial-gradient(circle,rgba(99,179,237,0.07) 0%,transparent 70%)",
    pointerEvents:"none",
  },
  blob2: {
    position:"absolute", bottom:"-120px", left:"-120px",
    width:"400px", height:"400px", borderRadius:"50%",
    background:"radial-gradient(circle,rgba(167,139,250,0.06) 0%,transparent 70%)",
    pointerEvents:"none",
  },
  container: { width:"100%", maxWidth:460, position:"relative", zIndex:1 },
  card: {
    background:"rgba(10,20,38,0.92)", border:"1px solid rgba(99,179,237,0.12)",
    borderRadius:20, padding:"36px 32px",
    boxShadow:"0 24px 64px rgba(0,0,0,0.5)", backdropFilter:"blur(10px)",
  },
  title:    { fontSize:22, fontWeight:800, color:"#f7fafc", marginBottom:8 },
  subtitle: { fontSize:14, color:"#718096", lineHeight:1.6 },
  infoBox: {
    background:"rgba(99,179,237,0.05)", border:"1px solid rgba(99,179,237,0.14)",
    borderRadius:12, padding:"14px 16px", marginBottom:18,
  },
  infoTitle: { fontSize:11, fontWeight:700, color:"#63b3ed", textTransform:"uppercase", letterSpacing:0.8, marginBottom:7 },
  infoText:  { fontSize:13, color:"#718096", lineHeight:1.6 },
  code: {
    background:"rgba(99,179,237,0.12)", color:"#63b3ed",
    padding:"1px 6px", borderRadius:4, fontFamily:"monospace", fontSize:12,
  },
  errorBox: {
    background:"rgba(252,129,129,0.08)", border:"1px solid rgba(252,129,129,0.25)",
    borderRadius:10, padding:"12px 16px", fontSize:13, color:"#FC8181",
    marginBottom:16, lineHeight:1.5,
  },
  label: { fontSize:11, fontWeight:700, color:"#718096", textTransform:"uppercase", letterSpacing:0.7 },
  inputWrap: {
    display:"flex", alignItems:"center", gap:12, padding:"0 16px",
    borderRadius:12, border:"1px solid rgba(99,179,237,0.2)",
    background:"rgba(255,255,255,0.02)", transition:"border-color 0.2s",
  },
  input: {
    flex:1, padding:"14px 0", background:"transparent",
    border:"none", outline:"none", color:"#e2e8f0",
    fontSize:16, fontFamily:"inherit", fontWeight:600,
  },
  btn: {
    padding:"14px", borderRadius:12, border:"none",
    background:"linear-gradient(135deg,#63b3ed,#3182ce)",
    color:"#080e1c", fontSize:15, fontWeight:700,
    fontFamily:"inherit", width:"100%",
    boxShadow:"0 8px 24px rgba(99,179,237,0.2)", transition:"opacity 0.2s",
  },
  howItWorks: { marginTop:24, padding:"0 4px" },
  howTitle:   { fontSize:10, color:"#4a5568", fontWeight:700, letterSpacing:1.5, textAlign:"center", marginBottom:14 },
  steps:      { display:"flex", flexDirection:"column", gap:12 },
  step:       { display:"flex", alignItems:"flex-start", gap:14 },
  stepNum:    { width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, flexShrink:0 },
  progressBar:  { height:6, borderRadius:100, background:"rgba(99,179,237,0.1)", overflow:"hidden", width:"80%", margin:"0 auto" },
  progressFill: { height:"100%", borderRadius:100, background:"linear-gradient(to right,#63b3ed,#68D391)" },
};

