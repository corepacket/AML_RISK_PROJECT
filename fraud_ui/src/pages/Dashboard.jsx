import { useLocation, Link, useNavigate } from "react-router-dom";
import { useState } from "react";

const mockAlerts = [
  { id: 1, txn: "TXN-9021", amount: "$48,500", risk: "High", status: "Open", time: "2m ago" },
  { id: 2, txn: "TXN-8874", amount: "$12,000", risk: "Medium", status: "Review", time: "15m ago" },
  { id: 3, txn: "TXN-8821", amount: "$3,200", risk: "Low", status: "Cleared", time: "1h ago" },
  { id: 4, txn: "TXN-8756", amount: "$87,000", risk: "High", status: "Open", time: "2h ago" },
];

const riskColor = { High: "#FC8181", Medium: "#F6AD55", Low: "#68D391" };
const statusBg = { Open: "rgba(252,129,129,0.15)", Review: "rgba(246,173,85,0.15)", Cleared: "rgba(104,211,145,0.15)" };

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const role = params.get("role") || localStorage.getItem("role") || "customer";
  const isAnalyst = role === "analyst";

  const [activeNav, setActiveNav] = useState("overview");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

  return (
    <div style={s.root}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.sidebarLogo}>
          <span style={s.logoIcon}>⬡</span>
          <span style={s.logoText}>AML<span style={s.logoAccent}>Secure</span></span>
        </div>

        <div style={s.roleBadge}>
          <span style={s.roleDot} />
          {isAnalyst ? "AML Analyst" : "Customer"}
        </div>

        <nav style={s.nav}>
          {[
            { id: "overview", icon: "◈", label: "Overview" },
            { id: "transactions", icon: "↔", label: "Transactions" },
            ...(isAnalyst ? [
              { id: "alerts", icon: "⚠", label: "Alerts" },
              { id: "cases", icon: "📁", label: "Case Management" },
              { id: "reports", icon: "📊", label: "Reports" },
            ] : [
              { id: "profile", icon: "👤", label: "My Risk Profile" },
              { id: "history", icon: "🕐", label: "History" },
            ]),
          ].map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveNav(id)}
              style={{ ...s.navItem, ...(activeNav === id ? s.navItemActive : {}) }}
            >
              <span style={s.navIcon}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <button onClick={handleLogout} style={s.logoutBtn}>
          ↩ Logout
        </button>
      </aside>

      {/* Main Content */}
      <main style={s.main}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <h1 style={s.headerTitle}>
              {isAnalyst ? "AML Analyst Dashboard" : "Customer Dashboard"}
            </h1>
            <p style={s.headerSub}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <div style={s.headerRight}>
            <div style={s.statusPill}><span style={s.statusDot}/>System Normal</div>
          </div>
        </div>

        {/* Stats Row */}
        <div style={s.statsGrid}>
          {isAnalyst ? [
            { label: "Total Alerts", value: "127", sub: "+12 today", color: "#FC8181" },
            { label: "High Risk Customers", value: "23%", sub: "284 accounts", color: "#FC8181" },
            { label: "Cases Under Review", value: "18", sub: "3 urgent", color: "#F6AD55" },
            { label: "Transactions Monitored", value: "10.2M", sub: "Last 24h", color: "#63b3ed" },
          ] : [
            { label: "Your Risk Score", value: "Low", sub: "Score: 18/100", color: "#68D391" },
            { label: "Transactions", value: "142", sub: "This month", color: "#63b3ed" },
            { label: "Flagged Items", value: "0", sub: "All clear", color: "#68D391" },
            { label: "Account Status", value: "Active", sub: "Verified", color: "#68D391" },
          ].map(({ label, value, sub, color }) => (
            <div key={label} style={s.statCard}>
              <div style={s.statLabel}>{label}</div>
              <div style={{ ...s.statValue, color }}>{value}</div>
              <div style={s.statSub}>{sub}</div>
              <div style={{ ...s.statAccent, background: color }} />
            </div>
          ))}
        </div>

        {/* Risk Overview + Recent Alerts */}
        <div style={s.contentGrid}>
          <div style={s.riskCard}>
            <h3 style={s.cardTitle}>Risk Distribution</h3>
            {[
              { label: "High Risk", pct: 23, color: "#FC8181" },
              { label: "Medium Risk", pct: 41, color: "#F6AD55" },
              { label: "Low Risk", pct: 36, color: "#68D391" },
            ].map(({ label, pct, color }) => (
              <div key={label} style={s.riskRow}>
                <div style={s.riskRowLeft}>
                  <span style={{ ...s.dot, background: color }} />
                  <span style={s.riskLbl}>{label}</span>
                </div>
                <div style={s.barWrap}>
                  <div style={{ ...s.bar, width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}50` }} />
                </div>
                <span style={{ ...s.riskPct, color }}>{pct}%</span>
              </div>
            ))}
          </div>

          <div style={s.alertsCard}>
            <h3 style={s.cardTitle}>{isAnalyst ? "Recent Alerts" : "Recent Transactions"}</h3>
            <table style={s.table}>
              <thead>
                <tr>
                  {["Transaction", "Amount", "Risk", "Status", "Time"].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockAlerts.map(({ id, txn, amount, risk, status, time }) => (
                  <tr key={id} style={s.tr}>
                    <td style={s.td}>{txn}</td>
                    <td style={{ ...s.td, fontWeight: 700, color: "#e2e8f0" }}>{amount}</td>
                    <td style={s.td}>
                      <span style={{ color: riskColor[risk], fontWeight: 700 }}>{risk}</span>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.statusTag, background: statusBg[status], color: riskColor[risk] || "#68D391" }}>
                        {status}
                      </span>
                    </td>
                    <td style={{ ...s.td, color: "#718096" }}>{time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

const s = {
  root: {
    minHeight: "100vh", display: "flex",
    fontFamily: "'Sora', 'Segoe UI', sans-serif",
    background: "#0a0f1e", color: "#e2e8f0",
  },
  sidebar: {
    width: 240, background: "rgba(13,27,46,0.95)",
    borderRight: "1px solid rgba(99,179,237,0.1)",
    display: "flex", flexDirection: "column",
    padding: "28px 0", position: "sticky", top: 0, height: "100vh",
  },
  sidebarLogo: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "0 24px 24px", borderBottom: "1px solid rgba(99,179,237,0.1)",
  },
  logoIcon: { fontSize: 24, color: "#63b3ed" },
  logoText: { fontSize: 18, fontWeight: 800, color: "#e2e8f0" },
  logoAccent: { color: "#63b3ed" },
  roleBadge: {
    display: "flex", alignItems: "center", gap: 8,
    margin: "16px 24px", padding: "8px 14px",
    background: "rgba(99,179,237,0.1)", borderRadius: 8,
    fontSize: 12, fontWeight: 700, color: "#63b3ed",
  },
  roleDot: {
    width: 7, height: 7, borderRadius: "50%", background: "#63b3ed",
    boxShadow: "0 0 6px #63b3ed",
  },
  nav: { flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 },
  navItem: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "10px 14px", borderRadius: 10, border: "none",
    background: "transparent", color: "#718096", fontSize: 14, fontWeight: 500,
    cursor: "pointer", textAlign: "left", transition: "all 0.2s", fontFamily: "inherit",
  },
  navItemActive: {
    background: "rgba(99,179,237,0.12)", color: "#63b3ed",
    borderLeft: "3px solid #63b3ed",
  },
  navIcon: { fontSize: 16, width: 20, textAlign: "center" },
  logoutBtn: {
    margin: "0 24px", padding: "10px 14px", borderRadius: 10,
    border: "1px solid rgba(252,129,129,0.2)",
    background: "transparent", color: "#FC8181",
    fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  main: { flex: 1, padding: "32px 40px", overflow: "auto" },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 32,
  },
  headerTitle: { fontSize: 28, fontWeight: 800, color: "#f7fafc", marginBottom: 4 },
  headerSub: { fontSize: 14, color: "#718096" },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  statusPill: {
    display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
    borderRadius: 100, background: "rgba(104,211,145,0.1)",
    border: "1px solid rgba(104,211,145,0.3)",
    fontSize: 13, fontWeight: 600, color: "#68D391",
  },
  statusDot: {
    width: 7, height: 7, borderRadius: "50%", background: "#68D391",
    boxShadow: "0 0 6px #68D391",
  },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 },
  statCard: {
    background: "rgba(13,27,46,0.7)", border: "1px solid rgba(99,179,237,0.1)",
    borderRadius: 14, padding: "20px 24px", position: "relative", overflow: "hidden",
  },
  statLabel: { fontSize: 12, color: "#718096", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 800, marginBottom: 4 },
  statSub: { fontSize: 12, color: "#718096" },
  statAccent: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, opacity: 0.6 },
  contentGrid: { display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 },
  riskCard: {
    background: "rgba(13,27,46,0.7)", border: "1px solid rgba(99,179,237,0.1)",
    borderRadius: 14, padding: "24px",
  },
  alertsCard: {
    background: "rgba(13,27,46,0.7)", border: "1px solid rgba(99,179,237,0.1)",
    borderRadius: 14, padding: "24px",
  },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 20 },
  riskRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  riskRowLeft: { display: "flex", alignItems: "center", gap: 8, minWidth: 110 },
  dot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  riskLbl: { fontSize: 13, color: "#a0aec0" },
  barWrap: {
    flex: 1, height: 6, background: "rgba(255,255,255,0.06)",
    borderRadius: 100, overflow: "hidden",
  },
  bar: { height: "100%", borderRadius: 100 },
  riskPct: { fontSize: 13, fontWeight: 700, minWidth: 36, textAlign: "right" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    fontSize: 11, fontWeight: 700, color: "#718096", textTransform: "uppercase",
    letterSpacing: 0.8, padding: "0 12px 12px 0", textAlign: "left",
    borderBottom: "1px solid rgba(99,179,237,0.08)",
  },
  tr: { borderBottom: "1px solid rgba(99,179,237,0.05)" },
  td: { padding: "12px 12px 12px 0", fontSize: 13, color: "#a0aec0" },
  statusTag: {
    display: "inline-block", padding: "3px 10px", borderRadius: 6,
    fontSize: 11, fontWeight: 700,
  },
};