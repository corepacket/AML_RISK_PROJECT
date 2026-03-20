import { useState } from "react";
import API from "../axios";

export default function AnalystDashboard() {

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState("ALL");

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await API.post("/transactions/upload-csv", fd, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "multipart/form-data"
        }
      });

      setReport(res.data.report || res.data);
      setTransactions(res.data.report?.transactions || []);

    } catch (e) {
      console.error(e);
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <h1 style={styles.title}>🧠 AML Analyst Dashboard</h1>
        <p style={styles.subtitle}>
          Upload transactions → Analyze → Investigate risk
        </p>
      </div>

      {/* UPLOAD SECTION */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>📂 Upload CSV</h3>

        <div style={styles.uploadBox}>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files[0])}
            style={styles.fileInput}
          />

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            style={{
              ...styles.button,
              opacity: (!file || loading) ? 0.5 : 1
            }}
          >
            {loading ? "Processing..." : "Upload & Analyze"}
          </button>
        </div>
      </div>

      {/* SUMMARY */}
      {report && (
        <div style={styles.summaryGrid}>
          {[
            { label: "Total", value: report.total, color: "#63b3ed" },
            { label: "Cleared", value: report.cleared, color: "#68D391" },
            { label: "Flagged", value: report.flagged, color: "#F6AD55" },
            { label: "Blocked", value: report.blocked, color: "#FC8181" }
          ].map((item) => (
            <div key={item.label} style={{ ...styles.summaryCard, borderColor: item.color }}>
              <div style={{ ...styles.summaryValue, color: item.color }}>
                {item.value || 0}
              </div>
              <div style={styles.summaryLabel}>{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* FILTERS */}
      <div style={styles.filterContainer}>
        {["ALL", "FLAGGED", "BLOCKED", "PROCESSED"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...styles.filterBtn,
              ...(filter === f ? styles.filterActive : {})
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* TABLE */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>🔍 Investigation Table</h3>

        {transactions.length === 0 ? (
          <p style={styles.empty}>No data available</p>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>#</th>
                <th style={styles.th}>Amount</th>
                <th style={styles.th}>Risk</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Reason</th>
              </tr>
            </thead>

            <tbody>
              {transactions
                .filter(t => filter === "ALL" || t.status === filter)
                .map((t, i) => (
                  <tr key={i} style={styles.tr}>
                    <td style={styles.td}>{i + 1}</td>
                    <td style={styles.td}>${t.amount}</td>

                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        background: getRiskBg(t.risk),
                        color: getRiskColor(t.risk)
                      }}>
                        {t.risk}
                      </span>
                    </td>

                    <td style={styles.td}>
                      <span style={{
                        ...styles.badge,
                        background: getStatusBg(t.status),
                        color: getStatusColor(t.status)
                      }}>
                        {t.status}
                      </span>
                    </td>

                    <td style={styles.td}>
                      {t.reason || "AI generated insight"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}

/* 🎨 STYLES */
const styles = {
  container: {
    background: "#080e1c",
    minHeight: "100vh",
    padding: "30px",
    color: "#e2e8f0",
    fontFamily: "Sora, sans-serif"
  },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: "800" },
  subtitle: { color: "#4a5568", fontSize: 14 },

  card: {
    background: "rgba(10,20,38,0.7)",
    border: "1px solid rgba(99,179,237,0.1)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20
  },

  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },

  uploadBox: {
    display: "flex",
    gap: 10,
    alignItems: "center"
  },

  fileInput: { color: "white" },

  button: {
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    background: "#63b3ed",
    cursor: "pointer",
    fontWeight: "700"
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 12,
    marginBottom: 20
  },

  summaryCard: {
    padding: 16,
    borderRadius: 12,
    border: "1px solid",
    textAlign: "center"
  },

  summaryValue: {
    fontSize: 24,
    fontWeight: "800"
  },

  summaryLabel: {
    fontSize: 12,
    color: "#4a5568"
  },

  filterContainer: {
    display: "flex",
    gap: 10,
    marginBottom: 20
  },

  filterBtn: {
    padding: "6px 12px",
    border: "1px solid #63b3ed",
    background: "transparent",
    color: "#63b3ed",
    borderRadius: 8,
    cursor: "pointer"
  },

  filterActive: {
    background: "#63b3ed",
    color: "#080e1c"
  },

  table: {
    width: "100%",
    borderCollapse: "collapse"
  },

  th: {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #2d3748"
  },

  td: {
    padding: 10,
    borderBottom: "1px solid #1a202c"
  },

  tr: {
    transition: "background 0.2s"
  },

  badge: {
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: "700"
  },

  empty: {
    textAlign: "center",
    color: "#4a5568"
  }
};

/* 🎨 Helpers */
const getRiskColor = (r) =>
  r === "High" ? "#FC8181" :
  r === "Medium" ? "#F6AD55" :
  "#68D391";

const getRiskBg = (r) =>
  r === "High" ? "rgba(252,129,129,0.2)" :
  r === "Medium" ? "rgba(246,173,85,0.2)" :
  "rgba(104,211,145,0.2)";

const getStatusColor = (s) =>
  s === "BLOCKED" ? "#FC8181" :
  s === "FLAGGED" ? "#F6AD55" :
  "#68D391";

const getStatusBg = (s) =>
  s === "BLOCKED" ? "rgba(252,129,129,0.2)" :
  s === "FLAGGED" ? "rgba(246,173,85,0.2)" :
  "rgba(104,211,145,0.2)";