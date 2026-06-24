"use client";

import { usePathname } from "@/i18n/navigation";
import { Link }        from "@/i18n/navigation";

const TABS = [
  { href: "/dashboard/operations",             label: "GLOBAL OPS"   },
  { href: "/dashboard/operations/sites",       label: "SITE MONITOR" },
  { href: "/dashboard/operations/alerts",      label: "ALERT CENTER" },
  { href: "/dashboard/operations/intelligence",label: "INTELLIGENCE"  },
  { href: "/dashboard/operations/war-room",    label: "WAR ROOM"     },
] as const;

export function OperationsSubNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center gap-0 border-b border-line mb-6 overflow-x-auto"
      aria-label="Operations center navigation"
    >
      {TABS.map(tab => {
        const isActive = tab.href === "/dashboard/operations"
          ? pathname === "/dashboard/operations"
          : pathname.startsWith(tab.href);

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
