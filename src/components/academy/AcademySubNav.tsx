"use client";

import { Link, usePathname } from "@/i18n/navigation";

const BASE_TABS = [
  { label: "Courses",      href: "/academy"          },
  { label: "My Learning",  href: "/academy/learning" },
  { label: "Certificates", href: "/academy/certs"    },
] as const;

const ADMIN_TAB = { label: "Admin", href: "/academy/admin" } as const;

export function AcademySubNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

  return (
    <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-line pb-0">
      {tabs.map((tab) => {
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
