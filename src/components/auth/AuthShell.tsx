"use client";

import type { ReactNode } from "react";
import Link from "next/link";

interface AuthShellProps {
  title:    string;
  subtitle?: string;
  children: ReactNode;
  footer?:  ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(45,212,191,0.04) 0%, transparent 60%), linear-gradient(160deg, #060A0F 0%, #080F18 60%, #060A0F 100%)",
      }}
    >
      {/* Ambient depth */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px]"
          style={{ background: "radial-gradient(ellipse, rgba(45,212,191,0.025) 0%, transparent 65%)" }}
        />
      </div>

      {/* Logo wordmark */}
      <Link href="/" className="mb-10 flex items-center gap-3 group" aria-label="Back to Hermes OS">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "rgba(45,212,191,0.08)",
            border:     "1px solid rgba(45,212,191,0.20)",
          }}
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-4.5 h-4.5" width="18" height="18">
            <circle cx="8" cy="8" r="2.8"  stroke="#2DD4BF" strokeWidth="1.2"/>
            <circle cx="8" cy="8" r="6.2"  stroke="rgba(45,212,191,0.30)" strokeWidth="0.8" strokeDasharray="2.5 2"/>
          </svg>
        </div>
        <div>
          <span
            className="font-display font-bold text-sm tracking-[0.12em] uppercase block"
            style={{ color: "#F1F5F9", letterSpacing: "0.12em" }}
          >
            Hermes OS
          </span>
          <span
            className="font-body text-[10px] tracking-[0.08em] uppercase block"
            style={{ color: "rgba(148,163,184,0.55)" }}
          >
            Industrial Intelligence Platform
          </span>
        </div>
      </Link>

      {/* Auth card */}
      <div
        className="relative w-full max-w-[420px] rounded-2xl p-8 sm:p-10"
        style={{
          background:     "rgba(11, 18, 25, 0.88)",
          backdropFilter: "blur(28px) saturate(1.5)",
          border:         "1px solid rgba(255,255,255,0.07)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(0,0,0,0.4), 0 32px 80px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.35)",
        }}
      >
        {/* Top accent */}
        <div
          className="absolute top-0 inset-x-8 h-px rounded-full"
          style={{ background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.30), transparent)" }}
        />

        <h1
          className="font-display font-bold text-center leading-tight"
          style={{ fontSize: "1.5rem", color: "#F1F5F9", letterSpacing: "-0.02em" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-center text-sm mt-2 mb-7 font-body leading-relaxed" style={{ color: "rgba(148,163,184,0.80)" }}>
            {subtitle}
          </p>
        )}
        <div className={subtitle ? "" : "mt-7"}>
          {children}
        </div>
      </div>

      {/* Footer links */}
      {footer && (
        <div className="mt-7 text-center text-sm font-body" style={{ color: "rgba(148,163,184,0.55)" }}>
          {footer}
        </div>
      )}

      {/* Trust line */}
      <p
        className="mt-10 text-center font-body text-[11px]"
        style={{ color: "rgba(71,85,105,0.70)", letterSpacing: "0.03em" }}
      >
        Enterprise-grade · End-to-end encrypted · SOC 2 aligned
      </p>
    </div>
  );
}

/* ── Shared input styles ─────────────────────────────────────────────────── */

export const inputStyle: React.CSSProperties = {
  width:           "100%",
  background:      "rgba(6, 10, 15, 0.85)",
  border:          "1px solid rgba(255,255,255,0.09)",
  borderRadius:    "10px",
  padding:         "0.7rem 0.9rem",
  color:           "#F1F5F9",
  fontSize:        "0.9rem",
  fontFamily:      "inherit",
  outline:         "none",
  transition:      "border-color 0.2s, box-shadow 0.2s",
};

export const inputFocusStyle: React.CSSProperties = {
  borderColor: "rgba(45,212,191,0.35)",
  boxShadow:   "0 0 0 3px rgba(45,212,191,0.08)",
};

export const labelStyle: React.CSSProperties = {
  display:       "block",
  fontSize:      "0.80rem",
  fontWeight:    600,
  marginBottom:  "0.4rem",
  color:         "rgba(203,213,225,0.85)",
  letterSpacing: "0.02em",
};

export const primaryBtnStyle: React.CSSProperties = {
  width:         "100%",
  background:    "linear-gradient(135deg, #2DD4BF 0%, #0EA5E9 100%)",
  border:        "none",
  borderRadius:  "10px",
  padding:       "0.75rem 1rem",
  color:         "#060A0F",
  fontSize:      "0.9rem",
  fontWeight:    700,
  cursor:        "pointer",
  transition:    "opacity 0.2s, box-shadow 0.2s",
  fontFamily:    "inherit",
  boxShadow:     "0 4px 20px rgba(45,212,191,0.20)",
};

export const errorStyle: React.CSSProperties = {
  padding:      "0.6rem 0.8rem",
  borderRadius: "8px",
  background:   "rgba(239,68,68,0.08)",
  border:       "1px solid rgba(239,68,68,0.22)",
  color:        "#EF4444",
  fontSize:     "0.82rem",
};

export const successStyle: React.CSSProperties = {
  padding:      "0.6rem 0.8rem",
  borderRadius: "8px",
  background:   "rgba(45,212,191,0.06)",
  border:       "1px solid rgba(45,212,191,0.22)",
  color:        "#2DD4BF",
  fontSize:     "0.82rem",
};
