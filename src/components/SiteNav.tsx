"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Grouped navigation (display-only).
 *
 * Five top-level groups, each a dropdown of links to existing routes.
 * Links use the locale-aware Link from @/i18n/navigation, so the active
 * locale prefix is applied automatically (no hardcoded "/en", no
 * window.location, no plain <a>). usePathname() here is also locale-aware
 * and returns the path WITHOUT the locale prefix, so active-state matching
 * works identically in EN and FA.
 *
 * Dropdowns close on route change (via the pathname effect), never by
 * unmounting the link synchronously on click — that previously swallowed
 * the navigation before it fired.
 */

interface NavItem {
  labelKey: string; // under nav.items
  href: string; // locale-agnostic route; Link adds the prefix
}
interface NavGroup {
  groupKey: string; // under nav.groups
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    groupKey: "platform",
    items: [
      { labelKey: "overview", href: "/" },
      { labelKey: "architecture", href: "/architecture" },
      { labelKey: "servicesItem", href: "/services" },
    ],
  },
  {
    groupKey: "intelligence",
    items: [
      { labelKey: "brain", href: "/brain" },
      { labelKey: "copilot", href: "/copilot" },
      { labelKey: "unknownCenter", href: "/intelligence/unknown" },
    ],
  },
  {
    groupKey: "operations",
    items: [
      { labelKey: "dashboard", href: "/dashboard" },
      { labelKey: "admin", href: "/admin" },
      { labelKey: "documents", href: "/admin/documents" },
      { labelKey: "documentSearch", href: "/admin/documents/search" },
    ],
  },
  {
    groupKey: "knowledge",
    items: [
      { labelKey: "library", href: "/library" },
      { labelKey: "cases", href: "/library/cases" },
      { labelKey: "caseStudio", href: "/knowledge/case-studio" },
      { labelKey: "knowledgeStudio", href: "/knowledge/studio" },
    ],
  },
  {
    groupKey: "services",
    items: [
      { labelKey: "about", href: "/about" },
      { labelKey: "contact", href: "/contact" },
    ],
  },
];

/** Which group owns the current path (locale-stripped), for active state. */
function activeGroupFor(pathname: string): string | null {
  // longest-prefix match so /library/cases resolves to knowledge, /library too
  let best: { key: string; len: number } | null = null;
  for (const g of GROUPS) {
    for (const it of g.items) {
      const h = it.href;
      const match = h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(h + "/");
      if (match && (!best || h.length > best.len)) best = { key: g.groupKey, len: h.length };
    }
  }
  return best?.key ?? null;
}

export function SiteNav() {
  const t = useTranslations("nav");
  const pathname = usePathname(); // locale-stripped, e.g. "/library/cases"
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  const activeGroup = activeGroupFor(pathname);

  // Close menus on route change — this is what closes the dropdown after a
  // link is clicked, WITHOUT unmounting the link mid-click.
  useEffect(() => {
    setOpenGroup(null);
    setMobileOpen(false);
  }, [pathname]);

  // Close desktop dropdown on outside click / Escape.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      {/* Desktop grouped nav */}
      <nav ref={navRef} className="hidden items-center gap-1 md:flex">
        {GROUPS.map((g) => {
          const open = openGroup === g.groupKey;
          const isActive = activeGroup === g.groupKey;
          return (
            <div
              key={g.groupKey}
              className="relative"
              onMouseEnter={() => setOpenGroup(g.groupKey)}
              onMouseLeave={() => setOpenGroup(null)}
            >
              <button
                type="button"
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpenGroup(open ? null : g.groupKey)}
                onFocus={() => setOpenGroup(g.groupKey)}
                className={`rounded-md px-3 py-2 font-body text-sm transition-colors ${
                  open || isActive ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {t(`groups.${g.groupKey}`)}
              </button>
              {open && (
                <div
                  role="menu"
                  className="absolute top-full z-40 pt-1.5"
                  style={{ insetInlineStart: 0 }}
                >
                  <div className="min-w-44 rounded-xl border border-line bg-surface p-1.5 shadow-lg shadow-black/20">
                    {g.items.map((it) => (
                      <Link
                        key={it.labelKey}
                        href={it.href}
                        role="menuitem"
                        className="block rounded-lg px-3 py-2 font-body text-sm text-muted transition-colors hover:bg-bg hover:text-ink"
                      >
                        {t(`items.${it.labelKey}`)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Mobile toggle */}
      <button
        type="button"
        aria-expanded={mobileOpen}
        aria-label={t(mobileOpen ? "close" : "menu")}
        onClick={() => setMobileOpen((v) => !v)}
        className="rounded-md border border-line p-2 text-muted transition-colors hover:text-ink md:hidden"
      >
        <span className="block h-0.5 w-5 bg-current" />
        <span className="mt-1 block h-0.5 w-5 bg-current" />
        <span className="mt-1 block h-0.5 w-5 bg-current" />
      </button>

      {/* Mobile panel — same route map */}
      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-30 border-b border-line bg-bg shadow-lg shadow-black/30 md:hidden">
          <div className="mx-auto max-w-6xl space-y-4 px-6 py-5">
            {GROUPS.map((g) => (
              <div key={g.groupKey}>
                <p className="font-mono text-xs uppercase tracking-widest text-muted/70">
                  {t(`groups.${g.groupKey}`)}
                </p>
                <ul className="mt-2 space-y-1">
                  {g.items.map((it) => (
                    <li key={it.labelKey}>
                      <Link
                        href={it.href}
                        className="block rounded-lg px-2 py-2 font-body text-sm text-ink transition-colors hover:bg-surface"
                      >
                        {t(`items.${it.labelKey}`)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
