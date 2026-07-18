"use client";

// PHASE 87I — localized Asset Registry / CMMS section navigation, replacing the
// legacy 56px boxed sidebars. Horizontal scrollable tab row under the AppShell
// topbar; REUSES the existing assetOperations / maintenanceOperations
// nav.items labels (already localized EN/FA/DE); i18n Link adds the locale
// prefix exactly once; aria-current marks the active section. Rendered once per
// module — desktop and mobile share the same DOM (no duplicated datasets).

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/components/ds";

const ASSET_SECTIONS = [
  { key: "dashboard", href: "/assets/dashboard" },
  { key: "registry", href: "/assets/registry" },
  { key: "hierarchy", href: "/assets/hierarchy" },
  { key: "criticality", href: "/assets/criticality" },
  { key: "health", href: "/assets/health" },
  { key: "lifecycle", href: "/assets/lifecycle" },
  { key: "maintenance", href: "/assets/maintenance" },
  { key: "documents", href: "/assets/documents" },
  { key: "analytics", href: "/assets/analytics" },
  { key: "settings", href: "/assets/settings" },
] as const;

const CMMS_SECTIONS = [
  { key: "dashboard", href: "/cmms/dashboard" },
  { key: "plans", href: "/cmms/plans" },
  { key: "schedules", href: "/cmms/schedules" },
  { key: "workorders", href: "/cmms/work-orders" },
  { key: "tasks", href: "/cmms/tasks" },
  { key: "failures", href: "/cmms/failures" },
  { key: "downtime", href: "/cmms/downtime" },
  { key: "checklists", href: "/cmms/checklists" },
  { key: "calendar", href: "/cmms/calendar" },
  { key: "spares", href: "/cmms/spares" },
  { key: "costs", href: "/cmms/costs" },
  { key: "history", href: "/cmms/history" },
  { key: "reports", href: "/cmms/reports" },
  { key: "settings", href: "/cmms/settings" },
] as const;

function SubNav({
  sections, namespace, ariaLabel,
}: {
  sections: readonly { key: string; href: string }[];
  namespace: "assetOperations.nav.items" | "maintenanceOperations.nav.items";
  ariaLabel: string;
}) {
  const t = useTranslations(namespace);
  const pathname = usePathname();

  return (
    <nav aria-label={ariaLabel} className="border-b border-border-default bg-surface-primary">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {sections.map(({ key, href }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
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

export function AssetsSubNav({ ariaLabel }: { ariaLabel: string }) {
  return <SubNav sections={ASSET_SECTIONS} namespace="assetOperations.nav.items" ariaLabel={ariaLabel} />;
}

export function CmmsSubNav({ ariaLabel }: { ariaLabel: string }) {
  return <SubNav sections={CMMS_SECTIONS} namespace="maintenanceOperations.nav.items" ariaLabel={ariaLabel} />;
}
