"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { cn, Checkbox } from "@/components/ds";
import { AuthField, PasswordField, AuthStatus, AuthSubmit } from "@/components/auth-experience";

interface Props {
  locale: string;
  from?:  string;
}

export function NewLoginClient({ locale, from }: Props) {
  const t = useTranslations("auth");
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
        // Status-code driven, never the server's raw (English, sometimes
        // code-like e.g. "invalid-credentials") payload — keeps /fa fully
        // Persian and avoids leaking internal error strings.
        if (res.status === 423) {
          setError(t("accountLocked"));
        } else if (res.status === 429) {
          setError(t("tooManyAttempts"));
        } else {
          setError(t("invalidCredentials"));
        }
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
        label={t("email")}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("emailPlaceholder")}
        dir="ltr"
        autoComplete="email"
        required
      />

      <PasswordField
        label={t("password")}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />

      <div className="flex items-center justify-between">
        <label className="flex cursor-pointer select-none items-center gap-2 text-label text-text-secondary">
          <Checkbox checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
          {t("rememberMe")}
        </label>
        <Link
          href={`/${locale}/auth/forgot-password`}
          className={cn("ds-focus rounded-sm text-label text-brand-primary hover:underline")}
        >
          {t("forgotPassword")}
        </Link>
      </div>

      {error ? <AuthStatus variant="danger">{error}</AuthStatus> : null}

      <AuthSubmit loading={busy} disabled={!email || !password}>
        {busy ? t("signingIn") : t("submit")}
      </AuthSubmit>
    </form>
  );
}
