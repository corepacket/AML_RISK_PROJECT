import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../axios";
// import AnalystDashboard from "./AnalystDashboard";
// import CustomerDashboard from "./CustomerDashboard";
export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await API.post("/auth/login", form);
      localStorage.setItem("token", res.data.token);
      const role=res.data.user.role;
      localStorage.setItem("role", role);

      if (role === "analyst") {
        navigate("/AnalystDashboard");
      } else {
        navigate("/CustomerDashboard");
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.msg || "Invalid credentials");
    } finally {
      setLoading(false);
    }


  };
  
  return (
    <div style={s.root}>
      <div style={s.leftPanel}>
        <Link to="/" style={s.backLink}>← Back to Home</Link>
        <div style={s.leftContent}>
          <div style={s.logo}>
            <span style={s.logoIcon}>⬡</span>
            <span style={s.logoText}>AML<span style={s.logoAccent}>Secure</span></span>
          </div>
          <h2 style={s.panelTitle}>Secure Access to Your Compliance Dashboard</h2>
          <p style={s.panelSub}>Monitor transactions, manage risk profiles, and stay ahead of financial crime.</p>
          <div style={s.featureList}>
            {[
              ["🔍", "Real-time Transaction Monitoring"],
              ["🛡️", "AI-Powered Risk Scoring"],
              ["📊", "Comprehensive AML Reporting"],
              ["⚡", "Instant Alert Management"],
            ].map(([icon, text]) => (
              <div key={text} style={s.featureItem}>
                <span style={s.featureIcon}>{icon}</span>
                <span style={s.featureText}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={s.rightPanel}>
        <div style={s.formCard}>
          <div style={s.formHeader}>
            <h2 style={s.formTitle}>Welcome back</h2>
            <p style={s.formSub}>Sign in to your AMLSecure account</p>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit} style={s.form}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Email Address</label>
              <input
                type="email" name="email" required
                placeholder="you@company.com"
                onChange={handleChange}
                style={s.input}
                onFocus={e => e.target.style.borderColor = "#63b3ed"}
                onBlur={e => e.target.style.borderColor = "rgba(99,179,237,0.2)"}
              />
            </div>

            <div style={s.fieldGroup}>
              <div style={s.labelRow}>
                <label style={s.label}>Password</label>
                <a href="#" style={s.forgotLink}>Forgot password?</a>
              </div>
              <input
                type="password" name="password" required
                placeholder="••••••••"
                onChange={handleChange}
                style={s.input}
                onFocus={e => e.target.style.borderColor = "#63b3ed"}
                onBlur={e => e.target.style.borderColor = "rgba(99,179,237,0.2)"}
              />
            </div>

            <button type="submit" style={{ ...s.submitBtn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div style={s.divider}>
            <span style={s.dividerLine} />
            <span style={s.dividerText}>OR</span>
            <span style={s.dividerLine} />
          </div>

          <p style={s.signupText}>
            Don't have an account?{" "}
            <Link to="/signup" style={s.signupLink}>Create Account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const s = {
  root: { minHeight: "100vh", display: "flex", fontFamily: "'Sora', 'Segoe UI', sans-serif", background: "#0a0f1e" },
  leftPanel: { flex: 1, background: "linear-gradient(155deg, #0d1b2e 0%, #0a0f1e 100%)", borderRight: "1px solid rgba(99,179,237,0.1)", padding: "32px 48px", display: "flex", flexDirection: "column" },
  backLink: { color: "#718096", textDecoration: "none", fontSize: 13, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: "auto" },
  leftContent: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 420 },
  logo: { display: "flex", alignItems: "center", gap: 10, marginBottom: 32 },
  logoIcon: { fontSize: 28, color: "#63b3ed" },
  logoText: { fontSize: 22, fontWeight: 800, color: "#e2e8f0", letterSpacing: 0.5 },
  logoAccent: { color: "#63b3ed" },
  panelTitle: { fontSize: 30, fontWeight: 800, color: "#f7fafc", lineHeight: 1.3, marginBottom: 16, letterSpacing: -0.5 },
  panelSub: { fontSize: 15, color: "#718096", lineHeight: 1.7, marginBottom: 40 },
  featureList: { display: "flex", flexDirection: "column", gap: 16 },
  featureItem: { display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 10, background: "rgba(99,179,237,0.05)", border: "1px solid rgba(99,179,237,0.1)" },
  featureIcon: { fontSize: 20 },
  featureText: { fontSize: 14, color: "#a0aec0", fontWeight: 500 },
  rightPanel: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px", background: "#0a0f1e" },
  formCard: { width: "100%", maxWidth: 420, background: "rgba(13,27,46,0.8)", border: "1px solid rgba(99,179,237,0.15)", borderRadius: 20, padding: "40px", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" },
  formHeader: { marginBottom: 32 },
  formTitle: { fontSize: 26, fontWeight: 800, color: "#f7fafc", marginBottom: 6 },
  formSub: { fontSize: 14, color: "#718096" },
  errorBox: { background: "rgba(252,129,129,0.1)", border: "1px solid rgba(252,129,129,0.3)", borderRadius: 8, padding: "10px 14px", color: "#FC8181", fontSize: 13, marginBottom: 20 },
  form: { display: "flex", flexDirection: "column", gap: 20 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 8 },
  label: { fontSize: 13, fontWeight: 600, color: "#a0aec0" },
  labelRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  forgotLink: { fontSize: 13, color: "#63b3ed", textDecoration: "none" },
  input: { padding: "12px 16px", borderRadius: 10, border: "1px solid rgba(99,179,237,0.2)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 15, outline: "none", transition: "border-color 0.2s", fontFamily: "inherit" },
  submitBtn: { padding: "14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #63b3ed, #4299e1)", color: "#0a0f1e", fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", boxShadow: "0 8px 20px rgba(99,179,237,0.3)", marginTop: 4, fontFamily: "inherit" },
  divider: { display: "flex", alignItems: "center", gap: 12, margin: "24px 0" },
  dividerLine: { flex: 1, height: 1, background: "rgba(99,179,237,0.1)" },
  dividerText: { fontSize: 12, color: "#718096", fontWeight: 600 },
  signupText: { textAlign: "center", fontSize: 14, color: "#718096" },
  signupLink: { color: "#63b3ed", fontWeight: 700, textDecoration: "none" },
};