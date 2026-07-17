"use client";

import { useState }        from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { scorePassword, passwordSchema } from "@/lib/auth/password-policy";
import {
  AuthField,
  PasswordField,
  PasswordStrengthMeter,
  AuthStatus,
  AuthSubmit,
} from "@/components/auth-experience";

interface Props {
  locale: string;
  token:  string;
  email:  string;
}

export function AcceptInviteClient({ locale, token, email }: Props) {
  const t = useTranslations("auth");
  const [pass,    setPass]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [error,   setError]   = useState<string | null>(null);
  const [done,    setDone]    = useState(false);
  const [busy,    setBusy]    = useState(false);

  const strength = scorePassword(pass);

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
      <div className="flex flex-col gap-4 text-center">
        <AuthStatus variant="success">{t("inviteAccepted")}</AuthStatus>
        <Link
          href={`/${locale}/auth/login`}
          className="ds-focus rounded-sm text-label text-brand-primary hover:underline"
        >
          {t("login")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <AuthField
        label={t("email")}
        type="email"
        value={email}
        disabled
        readOnly
        dir="ltr"
        autoComplete="email"
      />

      <div>
        <PasswordField
          label={t("setPassword")}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          required
        />
        {pass.length > 0 ? <PasswordStrengthMeter score={strength.score} /> : null}
      </div>

      <PasswordField
        label={t("acceptInviteConfirmPassword")}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="••••••••"
        autoComplete="new-password"
        required
      />

      {error ? <AuthStatus variant="danger">{error}</AuthStatus> : null}

      <AuthSubmit loading={busy} disabled={!pass || !confirm}>
        {busy ? t("acceptInviteSubmitting") : t("setPassword")}
      </AuthSubmit>
    </form>
  );
}
