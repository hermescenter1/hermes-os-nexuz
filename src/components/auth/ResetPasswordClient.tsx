"use client";

import { useState }       from "react";
import Link               from "next/link";
import { scorePassword }  from "@/lib/auth/password-policy";
import { inputStyle, labelStyle, primaryBtnStyle, errorStyle, successStyle } from "./AuthShell";

interface Props {
  locale: string;
  token:  string;
}

const STRENGTH_COLORS = ["#e85c5c", "#e87939", "#e8c639", "#38bdf8", "#2DD4BF"] as const;
const STRENGTH_LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

export function ResetPasswordClient({ locale, token }: Props) {
  const [pass,    setPass]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);

  const strength = scorePassword(pass);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !token) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res  = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ token, password: pass, confirmPassword: confirm }),
      });
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (res.ok) {
        setSuccess(String(data.message ?? "Password reset! You may now sign in."));
      } else if (res.status === 422) {
        const issues = data.issues as Record<string, string[]> | undefined;
        const first  = issues ? Object.values(issues).flat()[0] : undefined;
        setError(first ?? String(data.error ?? "Validation failed."));
      } else {
        setError(String(data.error ?? "Reset failed. The link may have expired."));
      }
    } catch {
      setError("Unable to connect. Please check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <p style={errorStyle}>Invalid or missing reset token. Please request a new password reset.</p>
        <Link href={`/${locale}/auth/forgot-password`} style={{ color: "#2DD4BF" }} className="text-sm hover:underline">
          Request new link →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label>
          <span style={labelStyle}>New password</span>
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
        {pass.length > 0 && (
          <div className="mt-2">
            <div className="flex gap-1 mb-1">
              {[0,1,2,3,4].map((i) => (
                <div key={i} className="h-1 flex-1 rounded-full transition-all"
                  style={{ background: i <= strength.score ? STRENGTH_COLORS[strength.score] : "rgba(255,255,255,0.08)" }}
                />
              ))}
            </div>
            <p className="text-xs" style={{ color: STRENGTH_COLORS[strength.score] }}>
              {STRENGTH_LABELS[strength.score]}
            </p>
          </div>
        )}
      </div>

      <label>
        <span style={labelStyle}>Confirm new password</span>
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
      {success && (
        <div style={successStyle}>
          <p>{success}</p>
          <Link href={`/${locale}/auth/login`} className="block mt-2 underline text-xs">
            Sign in now →
          </Link>
        </div>
      )}

      {!success && (
        <button
          type="submit"
          disabled={busy || !pass || !confirm}
          style={{ ...primaryBtnStyle, opacity: (busy || !pass || !confirm) ? 0.45 : 1 }}
        >
          {busy ? "Resetting…" : "Reset password"}
        </button>
      )}
    </form>
  );
}
