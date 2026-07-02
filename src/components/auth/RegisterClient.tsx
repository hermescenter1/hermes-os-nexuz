"use client";

import { useRef, useState } from "react";
import { useTranslations }  from "next-intl";
import { inputStyle, labelStyle, primaryBtnStyle, errorStyle, successStyle } from "./AuthShell";

interface Props { locale: string }

export function RegisterClient({ locale }: Props) {
  const t = useTranslations("auth");

  const [fullName,  setFullName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [company,   setCompany]   = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [message,   setMessage]   = useState("");
  const [gotcha,    setGotcha]    = useState(""); // honeypot
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState<string | null>(null);
  const [busy,      setBusy]      = useState(false);
  const submitted = useRef(false);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || submitted.current) return;

    if (!EMAIL_RE.test(email.trim())) {
      setError(t("invalidEmail"));
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/auth/access-request", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({
          fullName,
          email,
          company,
          roleTitle,
          message,
          locale,
          _gotcha: gotcha,
        }),
      });
      // Status-code driven, never the server's raw (English) payload —
      // keeps /fa fully Persian and avoids leaking internal error strings.
      if (res.ok) {
        submitted.current = true;
        setSuccess(t("requestAccessSuccessBody"));
      } else if (res.status === 429) {
        setError(t("tooManyAttempts"));
      } else if (res.status === 400) {
        setError(t("invalidInput"));
      } else {
        setError(t("connectionError"));
      }
    } catch {
      setError(t("connectionError"));
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <p className="font-display font-bold" style={{ fontSize: "1.05rem", color: "#F1F5F9" }}>
          {t("requestAccessSuccessTitle")}
        </p>
        <p style={successStyle}>{success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Honeypot — hidden from real users, bots tend to fill every field */}
      <input
        type="text"
        value={gotcha}
        onChange={(e) => setGotcha(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] w-px h-px opacity-0"
      />

      <label>
        <span style={labelStyle}>{t("fullName")}</span>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t("namePlaceholder")}
          autoComplete="name"
          required
          style={inputStyle}
        />
      </label>

      <label>
        <span style={labelStyle}>{t("email")}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          dir="ltr"
          autoComplete="email"
          required
          style={inputStyle}
        />
      </label>

      <label>
        <span style={labelStyle}>{t("company")}</span>
        <input
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={t("companyPlaceholder")}
          autoComplete="organization"
          style={inputStyle}
        />
      </label>

      <label>
        <span style={labelStyle}>{t("roleTitle")}</span>
        <input
          type="text"
          value={roleTitle}
          onChange={(e) => setRoleTitle(e.target.value)}
          placeholder={t("roleTitlePlaceholder")}
          autoComplete="organization-title"
          style={inputStyle}
        />
      </label>

      <label>
        <span style={labelStyle}>{t("requestAccessMessageLabel")}</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("requestAccessMessagePlaceholder")}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" as const }}
        />
      </label>

      {error && <p style={errorStyle}>{error}</p>}

      <button
        type="submit"
        disabled={busy || !fullName || !email}
        style={{ ...primaryBtnStyle, opacity: (busy || !fullName || !email) ? 0.45 : 1 }}
      >
        {busy ? t("requestAccessSubmitting") : t("requestAccessSubmit")}
      </button>

      <p className="text-center text-xs" style={{ color: "rgba(140,178,215,0.55)" }}>
        {t("requestAccessNote")}
      </p>
    </form>
  );
}
