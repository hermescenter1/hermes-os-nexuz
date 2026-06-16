"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

export function LoginClient() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", email, password }),
      });
      if (r.ok) {
        router.push("/knowledge/case-studio");
        router.refresh();
      } else {
        setError(t("invalidCredentials"));
      }
    } catch {
      setError(t("invalidCredentials"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 pb-16 pt-8">
      <div className="rounded-xl border border-line bg-surface p-6">
        <p className="font-body text-sm text-muted">{t("loginLede")}</p>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="font-body text-xs text-muted">{t("email")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="font-body text-xs text-muted">{t("password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              dir="ltr"
              className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
            />
          </label>
          {error && <p className="font-body text-xs text-[var(--danger)]">{error}</p>}
          <button
            onClick={submit}
            disabled={busy || !email || !password}
            className="w-full rounded-lg bg-signal px-5 py-2.5 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t("submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
