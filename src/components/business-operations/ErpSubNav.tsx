"use client";

// PHASE 87H — localized ERP section navigation (replaces the legacy boxed
// ErpNav sidebar that used dead shadcn tokens). Horizontal scrollable tab row
// under the AppShell topbar; reuses the existing enterpriseOperations.nav.items
// labels (already localized EN/FA/DE); i18n Link adds the locale prefix exactly
// once; aria-current marks the active section.

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/components/ds";

const SECTIONS = [
  { key: "dashboard", href: "/erp" },
  { key: "projects", href: "/erp/projects" },
  { key: "tasks", href: "/erp/tasks" },
  { key: "teams", href: "/erp/teams" },
  { key: "resources", href: "/erp/resources" },
  { key: "inventory", href: "/erp/inventory" },
  { key: "workOrders", href: "/erp/work-orders" },
  { key: "approvals", href: "/erp/approvals" },
  { key: "kpis", href: "/erp/kpis" },
  { key: "settings", href: "/erp/settings" },
] as const;

export function ErpSubNav() {
  const t = useTranslations("enterpriseOperations.nav.items");
  const pathname = usePathname();

  return (
    <nav aria-label={t("dashboard")} className="border-b border-border-default bg-surface-primary">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {SECTIONS.map(({ key, href }) => {
          const active = href === "/erp" ? pathname === "/erp" : pathname === href || pathname.startsWith(`${href}/`);
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
