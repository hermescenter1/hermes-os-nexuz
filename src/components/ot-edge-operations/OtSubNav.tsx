"use client";

// PHASE 94C1 — section navigation for the OT Edge surface.
//
// Follows the established module pattern (ErpSubNav): a horizontal, scrollable
// tab row under the AppShell topbar, with `aria-current` marking the active
// section. The i18n `Link` adds the locale prefix exactly once — building the
// href by hand would either drop it or double it.
//
// This is navigation, not authorization: reaching a section still requires the
// server-side permission the API enforces.

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/components/ds";

const SECTIONS = [
  { key: "overview", href: "/dashboard/ot" },
  { key: "gateways", href: "/dashboard/ot/gateways" },
  { key: "devices", href: "/dashboard/ot/devices" },
] as const;

export function OtSubNav() {
  const t = useTranslations("otEdge.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("sectionLabel")} className="border-b border-border-default bg-surface-primary">
      <ul className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
        {SECTIONS.map(({ key, href }) => {
          // The overview is an exact match; the sections also claim their own
          // detail pages, so a gateway detail keeps "Gateways" highlighted.
          const active =
            href === "/dashboard/ot"
              ? pathname === "/dashboard/ot"
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
