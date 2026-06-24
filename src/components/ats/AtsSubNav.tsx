"use client";

import { Link, usePathname } from "@/i18n/navigation";

const TABS = [
  { href: "/dashboard/ats",             label: "OVERVIEW"   },
  { href: "/dashboard/ats/jobs",        label: "JOBS"       },
  { href: "/dashboard/ats/candidates",  label: "CANDIDATES" },
  { href: "/dashboard/ats/pipeline",    label: "PIPELINE"   },
  { href: "/dashboard/ats/interviews",  label: "INTERVIEWS" },
  { href: "/dashboard/ats/analytics",   label: "ANALYTICS"  },
];

export function AtsSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0 border-b border-line mb-6 overflow-x-auto">
      {TABS.map(tab => {
        const isActive = tab.href === "/dashboard/ats"
          ? pathname === "/dashboard/ats" || pathname.endsWith("/dashboard/ats")
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
