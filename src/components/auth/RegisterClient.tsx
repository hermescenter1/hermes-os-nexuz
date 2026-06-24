"use client";

import { useState }     from "react";
import Link             from "next/link";
import { scorePassword } from "@/lib/auth/password-policy";
import { inputStyle, labelStyle, primaryBtnStyle, errorStyle, successStyle } from "./AuthShell";

interface Props { locale: string }

const STRENGTH_COLORS = ["#e85c5c", "#e87939", "#e8c639", "#38bdf8", "#2DD4BF"] as const;
const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

export function RegisterClient({ locale }: Props) {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);

  const strength = scorePassword(pass);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pass !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/auth/register", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ name, email, password: pass, confirmPassword: confirm }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (res.ok) {
        setSuccess(String(data.message ?? "Account created! Please verify your email."));
      } else if (res.status === 409) {
        setError("An account with this email already exists.");
      } else if (res.status === 422) {
        const issues = data.issues as Record<string, string[]> | undefined;
        const first  = issues
          ? Object.values(issues).flat()[0]
          : String(data.error ?? "Validation failed.");
        setError(first ?? "Validation failed.");
      } else {
        setError(String(data.error ?? "Registration failed. Please try again."));
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
        <span style={labelStyle}>Full name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ada Lovelace"
          autoComplete="name"
          required
          style={inputStyle}
        />
      </label>

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

      <div>
        <label>
          <span style={labelStyle}>Password</span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••"
            dir="ltr"
            autoComplete="new-password"
            required
            style={inputStyle}
          />
        </label>

        {/* Strength meter */}
        {pass.length > 0 && (
          <div className="mt-2">
            <div className="flex gap-1 mb-1">
              {[0,1,2,3,4].map((i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full transition-all duration-300"
                  style={{
                    background: i <= strength.score
                      ? STRENGTH_COLORS[strength.score]
                      : "rgba(255,255,255,0.08)",
                  }}
                />
              ))}
            </div>
            <p className="text-xs" style={{ color: STRENGTH_COLORS[strength.score] }}>
              {STRENGTH_LABELS[strength.score]}
              {strength.feedback.length > 0 && ` · ${strength.feedback[0]}`}
            </p>
          </div>
        )}
      </div>

      <label>
        <span style={labelStyle}>Confirm password</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          dir="ltr"
          autoComplete="new-password"
          required
          style={inputStyle}
        />
      </label>

      {error   && <p style={errorStyle}>{error}</p>}
      {success && <p style={successStyle}>{success}</p>}

      <button
        type="submit"
        disabled={busy || !name || !email || !pass || !confirm}
        style={{ ...primaryBtnStyle, opacity: (busy || !name || !email || !pass || !confirm) ? 0.45 : 1 }}
      >
        {busy ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-xs" style={{ color: "rgba(140,178,215,0.55)" }}>
        By creating an account you agree to our terms of service.
      </p>
    </form>
  );
}
