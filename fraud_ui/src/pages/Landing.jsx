import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";

export default function Landing() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.5,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.5 + 0.1,
    }));

    let animId;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99,179,237,${p.opacity})`;
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
      });
      // draw lines between close particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dist = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(99,179,237,${0.12 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div style={styles.root}>
      <canvas ref={canvasRef} style={styles.canvas} />

      {/* NAV */}
      <nav style={styles.nav}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>⬡</span>
          <span style={styles.logoText}>AML<span style={styles.logoAccent}>Secure</span></span>
        </div>
        <div style={styles.navLinks}>
          {["Platform", "Solutions", "AI Engine", "Company"].map(l => (
            <a key={l} href="#" style={styles.navLink}>{l}</a>
          ))}
        </div>
        <div style={styles.navActions}>
          <Link to="/login" style={styles.navLoginBtn}>Login</Link>
          <Link to="/signup" style={styles.navDemoBtn}>Request Demo</Link>
        </div>
      </nav>

      {/* HERO */}
      <div style={styles.hero}>
        <div style={styles.heroLeft}>
          <div style={styles.badge}>
            <span style={styles.badgeDot} />
            AI-Powered Compliance Intelligence
          </div>

          <h1 style={styles.heroTitle}>
            Stop Financial<br />
            <span style={styles.heroTitleAccent}>Crime</span> Before<br />
            It Happens
          </h1>

          <p style={styles.heroSub}>
            Develop comprehensive customer risk profiles, detect suspicious
            transactions in real-time, and streamline AML case management
            workflows with advanced AI.
          </p>

          <div style={styles.heroCtas}>
            <Link to="/signup" style={styles.ctaPrimary}>Get Started Free</Link>
            <Link to="/login" style={styles.ctaSecondary}>
              <span style={styles.playIcon}>▶</span> Sign In
            </Link>
          </div>

          <div style={styles.stats}>
            {[["99.2%", "Detection Rate"], ["<50ms", "Real-time Analysis"], ["10M+", "Transactions Daily"]].map(([val, label]) => (
              <div key={label} style={styles.statItem}>
                <div style={styles.statVal}>{val}</div>
                <div style={styles.statLabel}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard Preview Card */}
        <div style={styles.heroRight}>
          <div style={styles.dashCard}>
            <div style={styles.dashHeader}>
              <span style={styles.dashTitle}>Risk Rating Overview</span>
              <span style={styles.dashLive}><span style={styles.liveDot}/>LIVE</span>
            </div>

            {[
              { label: "High Risk", pct: 23, color: "#FC8181", bg: "rgba(252,129,129,0.12)" },
              { label: "Medium Risk", pct: 41, color: "#F6AD55", bg: "rgba(246,173,85,0.12)" },
              { label: "Low Risk", pct: 36, color: "#68D391", bg: "rgba(104,211,145,0.12)" },
            ].map(({ label, pct, color, bg }) => (
              <div key={label} style={styles.riskRow}>
                <div style={styles.riskLeft}>
                  <span style={{ ...styles.riskDot, background: color }} />
                  <span style={styles.riskLabel}>{label}</span>
                </div>
                <div style={styles.riskBarWrap}>
                  <div style={{ ...styles.riskBar, width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
                </div>
                <span style={{ ...styles.riskPct, color }}>{pct}%</span>
              </div>
            ))}

            <div style={styles.dashDivider} />

            <div style={styles.alertRow}>
              <div style={styles.alertItem}>
                <div style={styles.alertNum}>12</div>
                <div style={styles.alertLbl}>Alerts Today</div>
              </div>
              <div style={styles.alertItem}>
                <div style={{ ...styles.alertNum, color: "#F6AD55" }}>3</div>
                <div style={styles.alertLbl}>Pending Review</div>
              </div>
              <div style={styles.alertItem}>
                <div style={{ ...styles.alertNum, color: "#68D391" }}>847</div>
                <div style={styles.alertLbl}>Cleared</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0a0f1e 0%, #0d1b2e 50%, #0a0f1e 100%)",
    fontFamily: "'Sora', 'Segoe UI', sans-serif",
    color: "#e2e8f0",
    position: "relative",
    overflow: "hidden",
  },
  canvas: {
    position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
    pointerEvents: "none", zIndex: 0,
  },
  nav: {
    position: "relative", zIndex: 10,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "20px 60px",
    borderBottom: "1px solid rgba(99,179,237,0.1)",
    backdropFilter: "blur(10px)",
    background: "rgba(10,15,30,0.6)",
  },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: { fontSize: 24, color: "#63b3ed" },
  logoText: { fontSize: 20, fontWeight: 700, color: "#e2e8f0", letterSpacing: 1 },
  logoAccent: { color: "#63b3ed" },
  navLinks: { display: "flex", gap: 36 },
  navLink: { color: "#a0aec0", textDecoration: "none", fontSize: 14, fontWeight: 500, transition: "color 0.2s", ":hover": { color: "#e2e8f0" } },
  navActions: { display: "flex", gap: 12, alignItems: "center" },
  navLoginBtn: {
    padding: "8px 20px", borderRadius: 8, color: "#63b3ed",
    border: "1px solid rgba(99,179,237,0.4)", textDecoration: "none",
    fontSize: 14, fontWeight: 600, transition: "all 0.2s",
    background: "transparent",
  },
  navDemoBtn: {
    padding: "8px 20px", borderRadius: 8, color: "#0a0f1e",
    background: "linear-gradient(135deg, #63b3ed, #4299e1)",
    textDecoration: "none", fontSize: 14, fontWeight: 600,
    boxShadow: "0 4px 15px rgba(99,179,237,0.3)",
  },
  hero: {
    position: "relative", zIndex: 10,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "80px 60px", gap: 60, minHeight: "calc(100vh - 80px)",
  },
  heroLeft: { flex: 1, maxWidth: 580 },
  badge: {
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "6px 16px", borderRadius: 100,
    border: "1px solid rgba(99,179,237,0.3)",
    background: "rgba(99,179,237,0.08)",
    color: "#63b3ed", fontSize: 13, fontWeight: 500, marginBottom: 28,
  },
  badgeDot: {
    width: 7, height: 7, borderRadius: "50%", background: "#63b3ed",
    display: "inline-block", boxShadow: "0 0 6px #63b3ed",
    animation: "pulse 2s infinite",
  },
  heroTitle: {
    fontSize: "clamp(42px, 5vw, 62px)", fontWeight: 800,
    lineHeight: 1.1, color: "#f7fafc", marginBottom: 24,
    letterSpacing: -1,
  },
  heroTitleAccent: {
    background: "linear-gradient(135deg, #63b3ed, #4299e1)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
  },
  heroSub: {
    fontSize: 17, color: "#718096", lineHeight: 1.7, marginBottom: 40, maxWidth: 480,
  },
  heroCtas: { display: "flex", gap: 16, marginBottom: 56, alignItems: "center" },
  ctaPrimary: {
    padding: "14px 32px", borderRadius: 10, color: "#0a0f1e",
    background: "linear-gradient(135deg, #63b3ed, #4299e1)",
    textDecoration: "none", fontWeight: 700, fontSize: 15,
    boxShadow: "0 8px 24px rgba(99,179,237,0.35)",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
  ctaSecondary: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "14px 28px", borderRadius: 10,
    border: "1px solid rgba(99,179,237,0.25)",
    color: "#a0aec0", textDecoration: "none", fontWeight: 600, fontSize: 15,
    background: "rgba(99,179,237,0.05)", transition: "all 0.2s",
  },
  playIcon: { fontSize: 11, color: "#63b3ed" },
  stats: { display: "flex", gap: 40 },
  statItem: {},
  statVal: { fontSize: 28, fontWeight: 800, color: "#63b3ed" },
  statLabel: { fontSize: 12, color: "#718096", marginTop: 2 },
  heroRight: { flex: 1, display: "flex", justifyContent: "center" },
  dashCard: {
    background: "rgba(13,27,46,0.8)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(99,179,237,0.15)",
    borderRadius: 20, padding: "28px 32px",
    width: "100%", maxWidth: 420,
    boxShadow: "0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(99,179,237,0.1)",
  },
  dashHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24,
  },
  dashTitle: { fontSize: 15, fontWeight: 700, color: "#e2e8f0" },
  dashLive: {
    display: "flex", alignItems: "center", gap: 6, fontSize: 11,
    fontWeight: 700, color: "#68D391", letterSpacing: 1,
  },
  liveDot: {
    width: 7, height: 7, borderRadius: "50%", background: "#68D391",
    display: "inline-block", boxShadow: "0 0 8px #68D391",
  },
  riskRow: {
    display: "flex", alignItems: "center", gap: 12, marginBottom: 16,
  },
  riskLeft: { display: "flex", alignItems: "center", gap: 8, minWidth: 110 },
  riskDot: { width: 8, height: 8, borderRadius: "50%", display: "inline-block" },
  riskLabel: { fontSize: 13, color: "#a0aec0" },
  riskBarWrap: {
    flex: 1, height: 6, background: "rgba(255,255,255,0.06)",
    borderRadius: 100, overflow: "hidden",
  },
  riskBar: { height: "100%", borderRadius: 100, transition: "width 0.5s ease" },
  riskPct: { fontSize: 13, fontWeight: 700, minWidth: 36, textAlign: "right" },
  dashDivider: {
    height: 1, background: "rgba(99,179,237,0.1)", margin: "20px 0",
  },
  alertRow: { display: "flex", justifyContent: "space-between" },
  alertItem: { textAlign: "center" },
  alertNum: { fontSize: 24, fontWeight: 800, color: "#FC8181" },
  alertLbl: { fontSize: 11, color: "#718096", marginTop: 2 },
};