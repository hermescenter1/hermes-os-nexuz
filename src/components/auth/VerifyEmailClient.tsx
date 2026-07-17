"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Spinner } from "@/components/ds";
import { AuthStatus } from "@/components/auth-experience";

interface Props {
  locale: string;
  token:  string;
}

export function VerifyEmailClient({ locale, token }: Props) {
  const t = useTranslations("authExperience.verify");
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    let cancelled = false;
    fetch("/api/auth/verify-email", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data: Record<string, unknown>) => {
        if (cancelled) return;
        // Outcome only — never render the server payload.
        setStatus(data.ok ? "success" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });

    return () => { cancelled = true; };
  }, [token]);

  if (status === "pending") {
    return (
      <div className="flex flex-col items-center gap-3 py-4" role="status" aria-live="polite">
        <Spinner size={28} />
        <p className="text-body-compact text-text-secondary">{t("pending")}</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-status-success-border bg-status-success-subtle"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
            <path d="M5 13l4 4L19 7" stroke="var(--color-status-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <AuthStatus variant="success" title={t("successTitle")}>{t("successMessage")}</AuthStatus>
        <Link
          href={`/${locale}/auth/login`}
          className="ds-focus rounded-sm text-label text-brand-primary hover:underline"
        >
          {t("signInToAccount")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <AuthStatus variant="danger" title={t("errorTitle")}>
        {token ? t("errorMessage") : t("noToken")}
      </AuthStatus>
      <div className="flex flex-col gap-2">
        <Link href={`/${locale}/auth/login`} className="ds-focus rounded-sm text-label text-brand-primary hover:underline">
          {t("backToSignIn")}
        </Link>
        <Link
          href={`/${locale}/auth/forgot-password`}
          className="ds-focus rounded-sm text-caption text-text-muted hover:text-text-secondary hover:underline"
        >
          {t("resendHint")}
        </Link>
      </div>
    </div>
  );
}
