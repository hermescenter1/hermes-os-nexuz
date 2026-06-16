"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

interface AuthState {
  authConfigured: boolean;
  user: { name: string; role: string } | null;
}

/**
 * Subtle auth indicator for the header (Phase 12A). Shows a quiet "Sign in"
 * link when signed out, or the user's name + a sign-out control when signed
 * in. Hidden entirely when auth is not configured, so it never crowds the
 * header in the default V1 setup.
 */
export function AuthIndicator() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [state, setState] = useState<AuthState | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/auth", { cache: "no-store" });
      if (r.ok) setState(await r.json());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function logout() {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      await load();
      router.refresh();
    } catch {
      /* ignore */
    }
  }

  // Not configured → render nothing (keeps the header uncrowded in V1).
  if (!state || !state.authConfigured) return null;

  if (!state.user) {
    return (
      <Link
        href="/login"
        className="font-mono text-xs text-muted transition-colors hover:text-ink"
      >
        {t("login")}
      </Link>
    );
  }

  return (
    <span className="flex items-center gap-2 font-mono text-xs text-muted">
      <span className="hidden sm:inline">{state.user.name}</span>
      <button onClick={logout} className="transition-colors hover:text-ink">
        {t("logout")}
      </button>
    </span>
  );
}
