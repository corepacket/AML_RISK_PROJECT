import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../axios";

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "customer" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await API.post("/auth/signup", form);
      alert("Account created successfully!");
      navigate("/CustomerDashboard");
    } catch (err) {
      setError(err.response?.data?.msg || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.root}>
      {/* Left Panel */}
      <div style={s.leftPanel}>
        <Link to="/" style={s.backLink}>← Back to Home</Link>
        <div style={s.leftContent}>
          <div style={s.logo}>
            <span style={s.logoIcon}>⬡</span>
            <span style={s.logoText}>AML<span style={s.logoAccent}>Secure</span></span>
          </div>

          <div style={s.roleSection}>
            <h3 style={s.roleTitle}>Choose your role</h3>

            {[
              {
                val: "customer", icon: "👤",
                title: "Customer",
                desc: "View your risk profile and transaction history",
              },
              {
                val: "analyst", icon: "🔬",
                title: "AML Analyst",
                desc: "Full access to monitoring, alerts, and case management",
              },
            ].map(({ val, icon, title, desc }) => (
              <div
                key={val}
                onClick={() => setForm({ ...form, role: val })}
                style={{
                  ...s.roleCard,
                  ...(form.role === val ? s.roleCardActive : {}),
                }}
              >
                <span style={s.roleCardIcon}>{icon}</span>
                <div>
                  <div style={s.roleCardTitle}>{title}</div>
                  <div style={s.roleCardDesc}>{desc}</div>
                </div>
                {form.role === val && <span style={s.checkmark}>✓</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div style={s.rightPanel}>
        <div style={s.formCard}>
          <div style={s.formHeader}>
            <h2 style={s.formTitle}>Create Account</h2>
            <p style={s.formSub}>Join AMLSecure — your compliance intelligence platform</p>
          </div>

          {error && <div style={s.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit} style={s.form}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Full Name</label>
              <input
                type="text" required placeholder="John Smith"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={s.input}
                onFocus={e => e.target.style.borderColor = "#63b3ed"}
                onBlur={e => e.target.style.borderColor = "rgba(99,179,237,0.2)"}
              />
            </div>

            <div style={s.fieldGroup}>
              <label style={s.label}>Email Address</label>
              <input
                type="email" required placeholder="you@company.com"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                style={s.input}
                onFocus={e => e.target.style.borderColor = "#63b3ed"}
                onBlur={e => e.target.style.borderColor = "rgba(99,179,237,0.2)"}
              />
            </div>

            <div style={s.fieldGroup}>
              <label style={s.label}>Password</label>
              <input
                type="password" required placeholder="Min. 8 characters"
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                style={s.input}
                onFocus={e => e.target.style.borderColor = "#63b3ed"}
                onBlur={e => e.target.style.borderColor = "rgba(99,179,237,0.2)"}
              />
            </div>

            <div style={s.fieldGroup}>
              <label style={s.label}>Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                style={s.select}
              >
                <option value="customer">Customer</option>
                <option value="analyst">AML Analyst</option>
              </select>
            </div>

            <button
              type="submit"
              style={{ ...s.submitBtn, opacity: loading ? 0.7 : 1 }}
              disabled={loading}
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <p style={s.loginText}>
            Already have an account?{" "}
            <Link to="/" style={s.loginLink}>Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const s = {
  root: {
    minHeight: "100vh", display: "flex",
    fontFamily: "'Sora', 'Segoe UI', sans-serif",
    background: "#0a0f1e",
  },
  leftPanel: {
    flex: 1, background: "linear-gradient(155deg, #0d1b2e 0%, #0a0f1e 100%)",
    borderRight: "1px solid rgba(99,179,237,0.1)",
    padding: "32px 48px", display: "flex", flexDirection: "column",
  },
  backLink: {
    color: "#718096", textDecoration: "none", fontSize: 13, fontWeight: 500,
    display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 48,
  },
  leftContent: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 400 },
  logo: { display: "flex", alignItems: "center", gap: 10, marginBottom: 40 },
  logoIcon: { fontSize: 28, color: "#63b3ed" },
  logoText: { fontSize: 22, fontWeight: 800, color: "#e2e8f0", letterSpacing: 0.5 },
  logoAccent: { color: "#63b3ed" },
  roleSection: {},
  roleTitle: { fontSize: 16, fontWeight: 700, color: "#a0aec0", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 },
  roleCard: {
    display: "flex", alignItems: "center", gap: 14,
    padding: "16px 20px", borderRadius: 12,
    border: "1px solid rgba(99,179,237,0.1)",
    background: "rgba(99,179,237,0.03)",
    marginBottom: 12, cursor: "pointer",
    transition: "all 0.2s", position: "relative",
  },
  roleCardActive: {
    border: "1px solid rgba(99,179,237,0.5)",
    background: "rgba(99,179,237,0.1)",
    boxShadow: "0 0 20px rgba(99,179,237,0.1)",
  },
  roleCardIcon: { fontSize: 22 },
  roleCardTitle: { fontSize: 15, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 },
  roleCardDesc: { fontSize: 12, color: "#718096" },
  checkmark: {
    position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
    width: 22, height: 22, borderRadius: "50%",
    background: "linear-gradient(135deg, #63b3ed, #4299e1)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#0a0f1e", fontSize: 12, fontWeight: 700,
  },
  rightPanel: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "40px", background: "#0a0f1e",
  },
  formCard: {
    width: "100%", maxWidth: 420,
    background: "rgba(13,27,46,0.8)",
    border: "1px solid rgba(99,179,237,0.15)",
    borderRadius: 20, padding: "40px",
    boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
  },
  formHeader: { marginBottom: 32 },
  formTitle: { fontSize: 26, fontWeight: 800, color: "#f7fafc", marginBottom: 6 },
  formSub: { fontSize: 14, color: "#718096" },
  errorBox: {
    background: "rgba(252,129,129,0.1)", border: "1px solid rgba(252,129,129,0.3)",
    borderRadius: 8, padding: "10px 14px", color: "#FC8181",
    fontSize: 13, marginBottom: 20,
  },
  form: { display: "flex", flexDirection: "column", gap: 18 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 8 },
  label: { fontSize: 13, fontWeight: 600, color: "#a0aec0" },
  input: {
    padding: "12px 16px", borderRadius: 10,
    border: "1px solid rgba(99,179,237,0.2)",
    background: "rgba(255,255,255,0.04)", color: "#e2e8f0",
    fontSize: 15, outline: "none", transition: "border-color 0.2s",
    fontFamily: "inherit",
  },
  select: {
    padding: "12px 16px", borderRadius: 10,
    border: "1px solid rgba(99,179,237,0.2)",
    background: "rgba(13,27,46,0.9)", color: "#e2e8f0",
    fontSize: 15, outline: "none", fontFamily: "inherit", cursor: "pointer",
    appearance: "auto",
  },
  submitBtn: {
    padding: "14px", borderRadius: 10, border: "none",
    background: "linear-gradient(135deg, #63b3ed, #4299e1)",
    color: "#0a0f1e", fontSize: 15, fontWeight: 700,
    cursor: "pointer", transition: "all 0.2s",
    boxShadow: "0 8px 20px rgba(99,179,237,0.3)", marginTop: 4,
    fontFamily: "inherit",
  },
  loginText: { textAlign: "center", fontSize: 14, color: "#718096", marginTop: 24 },
  loginLink: { color: "#63b3ed", fontWeight: 700, textDecoration: "none" },
};