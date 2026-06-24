"use client";

import { Link, usePathname } from "@/i18n/navigation";

const TABS = [
  { href: "/dashboard/customers",               label: "OVERVIEW"       },
  { href: "/dashboard/customers/accounts",      label: "ACCOUNTS"       },
  { href: "/dashboard/customers/health",        label: "HEALTH"         },
  { href: "/dashboard/customers/usage",         label: "USAGE"          },
  { href: "/dashboard/customers/risks",         label: "RISKS"          },
  { href: "/dashboard/customers/success-plans", label: "SUCCESS PLANS"  },
];

export function CustomerSubNav() {
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
            <span className="kpi-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
