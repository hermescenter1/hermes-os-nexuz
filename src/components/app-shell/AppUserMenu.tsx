"use client";

// PHASE 87C — user menu: avatar trigger (Figma: 32px, surface-interactive fill,
// 40% active-cyan ring, ice initials) + an accessible menu popover.
//
// User identity is resolved SERVER-side and passed as props (SiteHeader
// pattern — no client /api/auth fetch, no auth-state flash). Sign-out uses the
// EXACT existing mechanism (POST /api/auth {action:"logout"} + router.refresh(),
// as AuthIndicator does) — session behavior is unchanged by this phase.

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { nextActiveLocale, LOCALE_ACCESSIBLE_NAME } from "@/i18n/locales";
import { cn, TechnicalValue } from "@/components/ds";

export interface AppUserMenuProps {
  name: string;
  email?: string | null;
  /** Platform role — display only (safe summary). */
  role?: string | null;
}

export function AppUserMenu({ name, email, role }: AppUserMenuProps) {
  const t = useTranslations("appShell.shell");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const initials =
    name
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "•";

  // Outside click + Escape close (menu popover semantics — not a modal trap).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setOpen(false);
      router.refresh();
    } catch {
      /* network failure — leave state unchanged */
    }
  }

  const next = nextActiveLocale(locale);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={t("accountMenuLabel")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "ds-focus flex h-8 w-8 items-center justify-center rounded-full",
          "border border-border-active/40 bg-surface-interactive",
          "text-label-compact font-semibold text-brand-ice",
        )}
      >
        <span aria-hidden="true">{initials}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("accountMenuLabel")}
          className={cn(
            "absolute end-0 top-full z-50 mt-2 w-64 rounded-md border border-border-default",
            "bg-surface-elevated p-1.5 shadow-e3",
          )}
        >
          <div className="border-b border-border-default px-2.5 pb-2 pt-1.5">
            <p className="truncate text-label font-semibold text-text-primary">{name}</p>
            {email ? (
              <p className="truncate text-caption text-text-secondary">
                <TechnicalValue mono={false}>{email}</TechnicalValue>
              </p>
            ) : null}
            {role ? (
              <p className="mt-0.5 text-caption text-text-muted">
                {t("roleLabel")}: <TechnicalValue mono={false}>{role}</TechnicalValue>
              </p>
            ) : null}
          </div>
          <div className="pt-1.5">
            <Link
              href="/dashboard/organization/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="ds-focus flex min-h-9 items-center rounded-sm px-2.5 text-label text-text-secondary transition-colors duration-fast hover:bg-surface-interactive hover:text-text-primary"
            >
              {t("settings")}
            </Link>
            <button
              type="button"
              role="menuitem"
              lang={next}
              onClick={() => {
                setOpen(false);
                router.replace(pathname, { locale: next });
              }}
              aria-label={`${tCommon("switchLanguage")} — ${LOCALE_ACCESSIBLE_NAME[next]}`}
              className="ds-focus flex min-h-9 w-full items-center rounded-sm px-2.5 text-start text-label text-text-secondary transition-colors duration-fast hover:bg-surface-interactive hover:text-text-primary"
            >
              {tCommon("switchLanguage")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="ds-focus flex min-h-9 w-full items-center rounded-sm px-2.5 text-start text-label text-status-danger transition-colors duration-fast hover:bg-status-danger-subtle"
            >
              {t("signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
