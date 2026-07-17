"use client";

// PHASE 87G — localized CRM section navigation (replaces the legacy boxed
// CrmNav that hardcoded English labels and hand-built locale prefixes).
// Horizontal scrollable tab row under the AppShell topbar; i18n Link adds the
// locale prefix exactly once; aria-current marks the active section.

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/components/ds";

const SECTIONS = [
  { key: "dashboard", href: "/crm" },
  { key: "leads", href: "/crm/leads" },
  { key: "pipeline", href: "/crm/opportunities" },
  { key: "accounts", href: "/crm/accounts" },
  { key: "customerSuccess", href: "/crm/customer-success" },
] as const;

export function CrmSubNav() {
  const t = useTranslations("crm.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="border-b border-border-default bg-surface-primary">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {SECTIONS.map(({ key, href }) => {
          const active = href === "/crm" ? pathname === "/crm" : pathname === href || pathname.startsWith(`${href}/`);
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
