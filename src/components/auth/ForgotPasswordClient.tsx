"use client";

import { useState } from "react";
import Link         from "next/link";
import { inputStyle, labelStyle, primaryBtnStyle, errorStyle, successStyle } from "./AuthShell";

interface Props { locale: string }

export function ForgotPasswordClient({ locale }: Props) {
  const [email,   setEmail]   = useState("");
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res  = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (res.ok) {
        setSuccess(String(data.message ?? "If an account exists, a reset link has been sent."));
      } else if (res.status === 429) {
        setError("Too many requests. Please try again later.");
      } else {
        setError(String(data.error ?? "Something went wrong. Please try again."));
      }
    } catch {
      setError("Unable to connect. Please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label>
        <span style={labelStyle}>Email address</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          dir="ltr"
          autoComplete="email"
          required
          style={inputStyle}
        />
      </label>

      {error   && <p style={errorStyle}>{error}</p>}
      {success && <p style={successStyle}>{success}</p>}

      <button
        type="submit"
        disabled={busy || !email || !!success}
        style={{ ...primaryBtnStyle, opacity: (busy || !email || !!success) ? 0.45 : 1 }}
      >
        {busy ? "Sending…" : "Send reset link"}
      </button>

      <div className="text-center text-sm">
        <Link href={`/${locale}/auth/login`} style={{ color: "#2DD4BF" }} className="hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </form>
  );
}
