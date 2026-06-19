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
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "linear-gradient(135deg, #050816 0%, #060E20 100%)" }}
    >
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px]"
          style={{ background: "radial-gradient(ellipse, rgba(0,229,255,0.05) 0%, transparent 70%)" }}
        />
      </div>

      {/* Logo */}
      <Link href="/" className="mb-8 flex items-center gap-2.5 group">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: "rgba(0,229,255,0.10)",
            border:     "1px solid rgba(0,229,255,0.28)",
          }}
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
            <circle cx="8" cy="8" r="3" stroke="#00E5FF" strokeWidth="1.2"/>
            <circle cx="8" cy="8" r="6.5" stroke="rgba(0,229,255,0.35)" strokeWidth="0.7" strokeDasharray="3 2"/>
          </svg>
        </div>
        <span className="font-display font-bold text-sm tracking-wider" style={{ color: "#00E5FF" }}>
          HERMES OS
        </span>
      </Link>

      {/* Card */}
      <div
        className="relative w-full max-w-md rounded-2xl p-8"
        style={{
          background:     "rgba(8,16,32,0.80)",
          backdropFilter: "blur(24px)",
          border:         "1px solid rgba(0,229,255,0.14)",
          boxShadow:      "0 0 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,229,255,0.04)",
        }}
      >
        {/* Top accent */}
        <div
          className="absolute top-0 inset-x-0 h-px rounded-t-2xl"
          style={{ background: "linear-gradient(90deg, transparent, rgba(0,229,255,0.40), transparent)" }}
        />

        <h1
          className="font-display font-bold text-center mb-1"
          style={{ fontSize: "1.45rem", color: "#E8F4FF" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-center text-sm mb-6 font-body" style={{ color: "rgba(140,178,215,0.75)" }}>
            {subtitle}
          </p>
        )}
        <div className={subtitle ? "" : "mt-6"}>
          {children}
        </div>
      </div>

      {/* Footer links */}
      {footer && (
        <div className="mt-6 text-center text-sm font-body" style={{ color: "rgba(140,178,215,0.60)" }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// Shared input style helper
export const inputStyle: React.CSSProperties = {
  width:           "100%",
  background:      "rgba(4,12,24,0.85)",
  border:          "1px solid rgba(0,229,255,0.16)",
  borderRadius:    "10px",
  padding:         "0.65rem 0.85rem",
  color:           "#E8F4FF",
  fontSize:        "0.9rem",
  fontFamily:      "inherit",
  outline:         "none",
  transition:      "border-color 0.2s",
};

export const labelStyle: React.CSSProperties = {
  display:      "block",
  fontSize:     "0.78rem",
  fontWeight:   500,
  marginBottom: "0.35rem",
  color:        "rgba(180,210,240,0.80)",
  letterSpacing:"0.02em",
};

export const primaryBtnStyle: React.CSSProperties = {
  width:         "100%",
  background:    "linear-gradient(135deg, #00B8FF 0%, #0077CC 100%)",
  border:        "none",
  borderRadius:  "10px",
  padding:       "0.72rem 1rem",
  color:         "#fff",
  fontSize:      "0.9rem",
  fontWeight:    600,
  cursor:        "pointer",
  transition:    "opacity 0.2s",
  fontFamily:    "inherit",
};

export const errorStyle: React.CSSProperties = {
  padding:      "0.5rem 0.7rem",
  borderRadius: "8px",
  background:   "rgba(232,92,92,0.10)",
  border:       "1px solid rgba(232,92,92,0.25)",
  color:        "#e85c5c",
  fontSize:     "0.82rem",
};

export const successStyle: React.CSSProperties = {
  padding:      "0.5rem 0.7rem",
  borderRadius: "8px",
  background:   "rgba(0,229,255,0.07)",
  border:       "1px solid rgba(0,229,255,0.25)",
  color:        "#00E5FF",
  fontSize:     "0.82rem",
};
