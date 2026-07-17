"use client";

import { useRef, useState } from "react";
import { useTranslations }  from "next-intl";
import { Textarea } from "@/components/ds";
import { AuthField, AuthStatus, AuthSubmit } from "@/components/auth-experience";

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
      <div className="flex flex-col gap-4 text-center">
        <p className="text-title-lg font-bold text-text-primary">{t("requestAccessSuccessTitle")}</p>
        <AuthStatus variant="success">{success}</AuthStatus>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {/* Honeypot — hidden from real users, bots tend to fill every field */}
      <input
        type="text"
        value={gotcha}
        onChange={(e) => setGotcha(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />

      <AuthField
        label={t("fullName")}
        type="text"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder={t("namePlaceholder")}
        autoComplete="name"
        required
      />

      <AuthField
        label={t("email")}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("emailPlaceholder")}
        dir="ltr"
        autoComplete="email"
        required
      />

      <AuthField
        label={t("company")}
        type="text"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder={t("companyPlaceholder")}
        autoComplete="organization"
      />

      <AuthField
        label={t("roleTitle")}
        type="text"
        value={roleTitle}
        onChange={(e) => setRoleTitle(e.target.value)}
        placeholder={t("roleTitlePlaceholder")}
        autoComplete="organization-title"
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-medium text-text-primary">{t("requestAccessMessageLabel")}</span>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("requestAccessMessagePlaceholder")}
          rows={3}
          className="resize-y"
        />
      </label>

      {error ? <AuthStatus variant="danger">{error}</AuthStatus> : null}

      <AuthSubmit loading={busy} disabled={!fullName || !email}>
        {busy ? t("requestAccessSubmitting") : t("requestAccessSubmit")}
      </AuthSubmit>

      <p className="text-center text-caption text-text-muted">{t("requestAccessNote")}</p>
    </form>
  );
}
