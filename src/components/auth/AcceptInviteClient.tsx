"use client";

import { useState }        from "react";
import { useTranslations } from "next-intl";
import Link                from "next/link";
import { scorePassword, passwordSchema } from "@/lib/auth/password-policy";
import { inputStyle, labelStyle, primaryBtnStyle, errorStyle, successStyle } from "./AuthShell";

interface Props {
  locale: string;
  token:  string;
  email:  string;
}

const STRENGTH_COLORS = ["#e85c5c", "#e87939", "#e8c639", "#38bdf8", "#2DD4BF"] as const;

export function AcceptInviteClient({ locale, token, email }: Props) {
  const t = useTranslations("auth");
  const [pass,    setPass]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState<string | null>(null);
  const [done,    setDone]    = useState(false);
  const [busy,    setBusy]    = useState(false);

  const strength = scorePassword(pass);
  const strengthLabels = [
    t("passwordStrengthVeryWeak"),
    t("passwordStrengthVeryWeak"),
    t("passwordStrengthFair"),
    t("passwordStrengthStrong"),
    t("passwordStrengthVeryStrong"),
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || done) return;

    if (pass !== confirm) {
      setError(t("passwordsDoNotMatch"));
      return;
    }
    if (!passwordSchema.safeParse(pass).success) {
      setError(t("passwordPolicyHint"));
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/accept-invite", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ token, password: pass, confirmPassword: confirm }),
      });
      // Status/code driven, never the server's raw (English) payload —
      // keeps /fa fully Persian and avoids leaking internal error strings.
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => ({})) as { code?: string };
        if (res.status === 429) {
          setError(t("tooManyAttempts"));
        } else if (data.code === "invalid-input") {
          setError(t("passwordPolicyHint"));
        } else if (data.code === "invalid-invite") {
          setError(t("inviteInvalid"));
        } else {
          setError(t("connectionError"));
        }
      }
    } catch {
      setError(t("connectionError"));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <p style={successStyle}>{t("inviteAccepted")}</p>
        <Link
          href={`/${locale}/auth/login`}
          className="inline-block text-sm hover:underline"
          style={{ color: "var(--signal)" }}
        >
          {t("login")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label>
        <span style={labelStyle}>{t("email")}</span>
        <input
          type="email"
          value={email}
          disabled
          readOnly
          dir="ltr"
          style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }}
        />
      </label>

      <div>
        <label>
          <span style={labelStyle}>{t("setPassword")}</span>
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
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-1 flex-1 rounded-full transition-all"
                  style={{ background: i <= strength.score ? STRENGTH_COLORS[strength.score] : "rgba(255,255,255,0.08)" }}
                />
              ))}
            </div>
            <p className="text-xs" style={{ color: STRENGTH_COLORS[strength.score] }}>
              {strengthLabels[strength.score]}
            </p>
          </div>
        )}
      </div>

      <label>
        <span style={labelStyle}>{t("acceptInviteConfirmPassword")}</span>
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

      {error && <p style={errorStyle}>{error}</p>}

      <button
        type="submit"
        disabled={busy || !pass || !confirm}
        style={{ ...primaryBtnStyle, opacity: (busy || !pass || !confirm) ? 0.45 : 1 }}
      >
        {busy ? t("acceptInviteSubmitting") : t("setPassword")}
      </button>
    </form>
  );
}
