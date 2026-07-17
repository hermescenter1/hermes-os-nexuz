"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { AuthField, AuthStatus, AuthSubmit } from "@/components/auth-experience";

interface Props { locale: string }

export function ForgotPasswordClient({ locale }: Props) {
  const t = useTranslations("authExperience.forgot");
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
      const res = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      // Never render the server payload — status-code driven, neutral copy that
      // never reveals whether an account exists (account-enumeration safe) and
      // stays fully localized on /fa.
      if (res.ok) {
        setSuccess(t("genericSuccess"));
      } else if (res.status === 429) {
        setError(t("tooManyRequests"));
      } else {
        setError(t("genericError"));
      }
    } catch {
      setError(t("connectionError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <AuthField
        label={t("emailLabel")}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("emailPlaceholder")}
        dir="ltr"
        autoComplete="email"
        required
      />

      {error   ? <AuthStatus variant="danger">{error}</AuthStatus> : null}
      {success ? <AuthStatus variant="success">{success}</AuthStatus> : null}

      <AuthSubmit loading={busy} disabled={!email || Boolean(success)}>
        {busy ? t("submitting") : t("submit")}
      </AuthSubmit>

      <div className="text-center">
        <Link href={`/${locale}/auth/login`} className="ds-focus rounded-sm text-label text-brand-primary hover:underline">
          {t("backToSignIn")}
        </Link>
      </div>
    </form>
  );
}
