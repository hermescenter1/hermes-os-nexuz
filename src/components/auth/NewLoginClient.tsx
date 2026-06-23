"use client";

import { useState } from "react";
import Link         from "next/link";
import { inputStyle, labelStyle, primaryBtnStyle, errorStyle } from "./AuthShell";

interface Props {
  locale: string;
  from?:  string;
}

export function NewLoginClient({ locale, from }: Props) {
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [busy,       setBusy]       = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ action: "login", email, password, rememberMe }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({})) as { user?: { role?: string } };
        const role = data.user?.role ?? "";
        const privileged = ["superadmin", "admin", "engineer"].includes(role);
        // Default landing: privileged roles go to engineering, others to dashboard
        const defaultDest = privileged ? `/${locale}/engineering` : `/${locale}/dashboard`;
        // Only follow a `from` redirect when the role is permitted to access it,
        // preventing a silent bounce-loop for lower-privilege roles
        const fromPath = from ? decodeURIComponent(from) : null;
        const fromNeedsPrivilege = fromPath
          ? /^\/(fa|en)\/(engineering|admin)/.test(fromPath)
          : false;
        const dest = fromPath && (!fromNeedsPrivilege || privileged) ? fromPath : defaultDest;
        window.location.href = dest;
      } else {
        const data = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (res.status === 423) {
          setError("Account temporarily locked. Please try again in 15 minutes.");
        } else if (res.status === 429) {
          setError("Too many attempts. Please try again later.");
        } else {
          setError(String(data.error ?? "Invalid email or password."));
        }
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

      <label>
        <span style={labelStyle}>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          dir="ltr"
          autoComplete="current-password"
          required
          style={inputStyle}
        />
      </label>

      {/* Remember me + forgot password row */}
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-3.5 h-3.5 accent-[#00E5FF]"
          />
          <span style={{ color: "rgba(180,210,240,0.70)" }}>Remember me</span>
        </label>
        <Link
          href={`/${locale}/auth/forgot-password`}
          className="text-sm hover:underline"
          style={{ color: "#00E5FF" }}
        >
          Forgot password?
        </Link>
      </div>

      {error && <p style={errorStyle}>{error}</p>}

      <button
        type="submit"
        disabled={busy || !email || !password}
        style={{ ...primaryBtnStyle, opacity: (busy || !email || !password) ? 0.45 : 1 }}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
