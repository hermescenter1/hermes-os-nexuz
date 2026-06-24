"use client";

import { Link, usePathname } from "@/i18n/navigation";

const TABS = [
  { label: "Courses",     href: "/academy"          },
  { label: "My Learning", href: "/academy/learning" },
  { label: "Certificates",href: "/academy/certs"    },
  { label: "Admin",       href: "/academy/admin"    },
] as const;

export function AcademySubNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-line pb-0">
      {TABS.map((tab) => {
        const active =
          tab.href === "/academy"
            ? pathname === "/academy"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 border-b-2 px-4 py-3 font-mono text-xs uppercase tracking-widest transition-colors ${
              active
                ? "border-signal text-signal"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
