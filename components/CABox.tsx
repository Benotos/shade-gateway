"use client";

import { useState } from "react";

const CA = "EfXpXYHgE8G6139N4rNrRFjudtjSbhyXj1dLrZRPpump";

export default function CABox() {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(CA);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      aria-label="SHADE token contract address"
      style={{
        margin: "28px 0 8px",
        padding: "24px",
        border: "1px solid var(--border, rgba(255,255,255,.14))",
        borderRadius: "18px",
        background: "linear-gradient(135deg, rgba(170,255,0,.075), rgba(255,255,255,.025))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent, #b7ff45)", fontWeight: 700 }}>
            Official token
          </p>
          <h2 style={{ margin: "7px 0 0", fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700 }}>
            SHADE contract address
          </h2>
        </div>
        <span style={{ fontSize: 11, padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(170,255,0,.35)", color: "var(--accent, #b7ff45)" }}>
          Solana · Mainnet
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, background: "rgba(0,0,0,.22)", border: "1px solid rgba(255,255,255,.09)" }}>
        <code style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontSize: "clamp(11px, 1.7vw, 14px)", lineHeight: 1.7 }}>
          {CA}
        </code>
        <button
          type="button"
          onClick={copyAddress}
          style={{ flexShrink: 0, border: 0, borderRadius: 9, padding: "10px 13px", background: "var(--accent, #b7ff45)", color: "#10130b", fontWeight: 700, cursor: "pointer" }}
        >
          {copied ? "Copied" : "Copy CA"}
        </button>
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--muted, rgba(255,255,255,.58))" }}>
        Always verify the contract address before trading.
      </p>
    </section>
  );
}
