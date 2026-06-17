"use client";
import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      setError("Access denied.");
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#141414", border: "1px solid #2a2a2a",
        borderRadius: 12, padding: "40px 48px", width: 340,
        display: "flex", flexDirection: "column", gap: 20,
        fontFamily: "Arial, sans-serif",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.3em", color: "#e8e8e8" }}>
            RUSH<span style={{ color: "#ff4444" }}>MORE</span>
          </div>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: "0.15em", marginTop: 6, textTransform: "uppercase" }}>
            Command Intelligence
          </div>
        </div>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Access code"
            autoFocus
            style={{
              background: "#0e0e0e", border: "1px solid #333", borderRadius: 6,
              padding: "10px 14px", color: "#e8e8e8", fontSize: 14,
              fontFamily: "Arial, sans-serif", outline: "none",
            }}
          />
          {error && <div style={{ color: "#ff4444", fontSize: 12, textAlign: "center" }}>{error}</div>}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              background: loading ? "#1a0800" : "#2a1200",
              border: "1px solid #5a2800", borderRadius: 6,
              padding: "10px", color: "#ff8c3a", fontSize: 12,
              fontWeight: 800, letterSpacing: "0.1em", cursor: "pointer",
              fontFamily: "Arial, sans-serif",
              opacity: !password ? 0.4 : 1,
            }}
          >
            {loading ? "VERIFYING..." : "INITIATE RUSHMORE"}
          </button>
        </form>
      </div>
    </div>
  );
}
