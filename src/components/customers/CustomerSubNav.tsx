"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/*
 * The KEY is the contract, not the label: it addresses the catalogue entry and
 * survives translation, so a German or Persian rendering can never reorder or
 * rename a tab. The label itself is uppercased by .kpi-label in CSS, so the
 * catalogue stores natural case.
 */
const TABS = [
  { href: "/dashboard/customers",               key: "navOverview"     },
  { href: "/dashboard/customers/accounts",      key: "navAccounts"     },
  { href: "/dashboard/customers/health",        key: "navHealth"       },
  { href: "/dashboard/customers/usage",         key: "navUsage"        },
  { href: "/dashboard/customers/risks",         key: "navRisks"        },
  { href: "/dashboard/customers/success-plans", key: "navSuccessPlans" },
] as const;

export function CustomerSubNav() {
  const t = useTranslations("customerSuccess");
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-0 border-b border-line mb-6 overflow-x-auto">
      {TABS.map(tab => {
        const isActive = tab.href === "/dashboard/customers"
          ? pathname === "/dashboard/customers" || pathname.endsWith("/dashboard/customers")
          : pathname.includes(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-shrink-0 px-4 py-2.5 border-b-2 transition-colors ${
              isActive
                ? "border-signal text-signal"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <span className="kpi-label">{t(tab.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
