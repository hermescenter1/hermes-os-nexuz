"use client";

import { useState }       from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { scorePassword }   from "@/lib/auth/password-policy";
import {
  PasswordField,
  PasswordStrengthMeter,
  AuthStatus,
  AuthSubmit,
} from "@/components/auth-experience";

interface Props {
  locale: string;
  token:  string;
}

export function ResetPasswordClient({ locale, token }: Props) {
  const t = useTranslations("authExperience.reset");
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
      const res = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ token, password: pass, confirmPassword: confirm }),
      });
      // Status-code driven, never the server's raw payload — no internal error
      // strings, fully localized on /fa.
      if (res.ok) {
        setSuccess(t("successMessage"));
      } else if (res.status === 422) {
        setError(t("validationFailed"));
      } else {
        setError(t("genericError"));
      }
    } catch {
      setError(t("connectionError"));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <AuthStatus variant="danger">{t("invalidToken")}</AuthStatus>
        <Link
          href={`/${locale}/auth/forgot-password`}
          className="ds-focus rounded-sm text-label text-brand-primary hover:underline"
        >
          {t("requestNewLink")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <PasswordField
          label={t("newPassword")}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          required
        />
        {pass.length > 0 ? <PasswordStrengthMeter score={strength.score} /> : null}
      </div>

      <PasswordField
        label={t("confirmPassword")}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="••••••••"
        autoComplete="new-password"
        required
      />

      {error ? <AuthStatus variant="danger">{error}</AuthStatus> : null}
      {success ? (
        <AuthStatus variant="success">
          <p>{success}</p>
          <Link href={`/${locale}/auth/login`} className="mt-1 inline-block text-caption underline">
            {t("signInNow")}
          </Link>
        </AuthStatus>
      ) : null}

      {!success ? (
        <AuthSubmit loading={busy} disabled={!pass || !confirm}>
          {busy ? t("submitting") : t("submit")}
        </AuthSubmit>
      ) : null}
    </form>
  );
}
