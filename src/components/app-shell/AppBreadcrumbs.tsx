"use client";

// PHASE 87C — accessible breadcrumbs (Figma topbar: "Intelligence / Executive
// Dashboard"). nav[aria-label] > ol; the current page carries aria-current.
// Crumbs derive from the app-nav registry (translated route labels only — no
// internal IDs); pages can override via the `items` prop. The "/" separator is
// direction-neutral and the flex row mirrors under RTL automatically.

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/components/ds";
import { breadcrumbsFor, type AppNavGroup } from "@/lib/navigation/app-nav";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export interface AppBreadcrumbsProps {
  /** Page-provided crumbs; when absent they derive from the nav registry. */
  items?: BreadcrumbItem[];
  /** Role-filtered groups for derivation. */
  groups?: AppNavGroup[];
  className?: string;
}

export function AppBreadcrumbs({ items, groups, className }: AppBreadcrumbsProps) {
  const t = useTranslations("appShell");
  const pathname = usePathname();

  const crumbs: BreadcrumbItem[] =
    items ??
    breadcrumbsFor(pathname, groups).map((c) => ({
      label: c.kind === "group" ? t(`nav.groups.${c.labelKey}`) : t(`nav.items.${c.labelKey}`),
      href: c.href,
      current: c.current,
    }));

  if (crumbs.length === 0) return null;

  return (
    <nav aria-label={t("shell.breadcrumbsLabel")} className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-2 text-label text-text-secondary">
        {crumbs.map((crumb, i) => (
          <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-text-muted">
                /
              </span>
            )}
            {crumb.href && !crumb.current ? (
              <Link
                href={crumb.href}
                className="ds-focus truncate rounded-xs font-medium transition-colors duration-fast hover:text-text-primary"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={crumb.current ? "page" : undefined}
                className={cn("truncate", crumb.current ? "font-medium text-text-primary" : undefined)}
              >
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
