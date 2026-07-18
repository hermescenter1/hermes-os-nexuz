"use client";

// PHASE 87J — localized EDMS section navigation, replacing the legacy 56px
// boxed sidebar. Horizontal scrollable tab row under the AppShell topbar.
//
// It REUSES the existing `documents.nav.*` catalog (already EN + FA), which
// the legacy DocumentNav never consumed — that component carried hardcoded
// English labels plus an `isFa ? FA_LABELS[...]` ternary. Here the catalog is
// the single source, so Persian rendering has no hardcoded English fallback.
// The i18n Link adds the locale prefix exactly once; aria-current marks the
// active section.

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/components/ds";

const SECTIONS = [
  { key: "dashboard", href: "/documents" },
  { key: "explorer", href: "/documents/explorer" },
  { key: "search", href: "/documents/search" },
  { key: "approvals", href: "/documents/approvals" },
  { key: "revisions", href: "/documents/revisions" },
  { key: "comments", href: "/documents/comments" },
  { key: "audit", href: "/documents/audit" },
  { key: "folders", href: "/documents/folders" },
  { key: "categories", href: "/documents/categories" },
  { key: "templates", href: "/documents/templates" },
  { key: "retention", href: "/documents/retention" },
  { key: "settings", href: "/documents/settings" },
] as const;

export function EdmsSubNav({ ariaLabel }: { ariaLabel: string }) {
  const t = useTranslations("documents.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={ariaLabel} className="border-b border-border-default bg-surface-primary">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {SECTIONS.map(({ key, href }) => {
          // The register root must not stay active on every child route.
          const active = href === "/documents"
            ? pathname === "/documents"
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "ds-focus relative flex h-11 items-center rounded-sm px-3 text-label transition-colors duration-fast",
                  active
                    ? "font-semibold text-text-primary"
                    : "font-medium text-text-secondary hover:text-text-primary",
                )}
              >
                {t(key)}
                {active ? (
                  <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-primary" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
