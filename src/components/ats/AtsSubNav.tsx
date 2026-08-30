"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/*
 * The KEY is the contract, not the label: it addresses the catalogue entry and
 * survives translation, so a German or Persian rendering can never reorder or
 * rename a tab.
 */
const TABS = [
  { href: "/dashboard/ats",             key: "navOverview"   },
  { href: "/dashboard/ats/jobs",        key: "navJobs"       },
  { href: "/dashboard/ats/candidates",  key: "navCandidates" },
  { href: "/dashboard/ats/pipeline",    key: "navPipeline"   },
  { href: "/dashboard/ats/interviews",  key: "navInterviews" },
  { href: "/dashboard/ats/analytics",   key: "navAnalytics"  },
] as const;

export function AtsSubNav() {
  const pathname = usePathname();
  const t = useTranslations("ats");

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
            <span className="kpi-label">{t(tab.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
