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
      { labelKey: "industrialBrain", href: "/industrial-brain" },
      { labelKey: "copilot", href: "/copilot" },
      { labelKey: "unknownCenter", href: "/intelligence/unknown" },
      { labelKey: "discover", href: "/articles/discover" },
    ],
  },
  {
    groupKey: "operations",
    items: [
      { labelKey: "dashboard",       href: "/dashboard" },
      { labelKey: "opsCenter",      href: "/dashboard/operations" },
      { labelKey: "atsPortal",      href: "/dashboard/ats" },
      { labelKey: "csCenter",       href: "/dashboard/customers" },
      { labelKey: "careersBoard",   href: "/careers" },
      { labelKey: "candidatePortal",href: "/candidate" },
      { labelKey: "academy",        href: "/academy" },
      { labelKey: "compliance",     href: "/compliance" },
      { labelKey: "privacyCenter",  href: "/privacy-center" },
      { labelKey: "admin",          href: "/admin" },
      { labelKey: "documents",   href: "/admin/documents" },
      { labelKey: "documentSearch", href: "/admin/documents/search" },
      { labelKey: "assetRegistry", href: "/assets/dashboard" },
    ],
  },
  {
    groupKey: "knowledge",
    items: [
      { labelKey: "library",        href: "/library" },
      { labelKey: "cases",          href: "/library/cases" },
      { labelKey: "caseStudio",     href: "/knowledge/case-studio" },
      { labelKey: "knowledgeStudio",href: "/knowledge/studio" },
      { labelKey: "engGraph",       href: "/dashboard/knowledge-graph" },
    ],
  },
  {
    groupKey: "journal",
    items: [
      { labelKey: "journalFeed",       href: "/articles" },
      { labelKey: "journalLatest",     href: "/articles/latest" },
      { labelKey: "journalTrending",   href: "/articles/trending" },
      { labelKey: "journalAuthors",    href: "/articles/authors" },
      { labelKey: "journalCategories", href: "/articles/categories" },
    ],
  },
  {
    groupKey: "services",
    items: [
      { labelKey: "about", href: "/about" },
      { labelKey: "contact", href: "/contact" },
      { labelKey: "demo", href: "/demo" },
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
      <nav ref={navRef} className="hidden items-center gap-0.5 md:flex">
        {GROUPS.map((g) => {
          const open = openGroup === g.groupKey;
          const isActive = activeGroup === g.groupKey;
          const isJournal = g.groupKey === "journal";
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
                className={[
                  "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                  isJournal
                    ? open || isActive
                      ? "bg-signal/10 text-signal border border-signal/20"
                      : "text-signal/80 hover:text-signal hover:bg-signal/8 border border-transparent"
                    : open || isActive
                    ? "text-ink bg-surface2/60"
                    : "text-muted hover:text-ink hover:bg-surface2/40 border border-transparent",
                ].join(" ")}
              >
                {isJournal && (
                  <span className="w-1.5 h-1.5 rounded-full bg-signal shrink-0" aria-hidden="true" />
                )}
                {t(`groups.${g.groupKey}`)}
                <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 opacity-40 transition-transform ${open ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
                </svg>
              </button>
              {open && (
                <div
                  role="menu"
                  className="absolute top-full z-40 pt-2"
                  style={{ insetInlineEnd: 0 }}
                >
                  <div
                    className="min-w-48 rounded-xl border border-line/60 p-1.5 shadow-xl shadow-black/30"
                    style={{
                      background: "rgba(10,12,18,0.96)",
                      backdropFilter: "blur(20px) saturate(1.2)",
                    }}
                  >
                    {isJournal && (
                      <div className="px-3 pt-1.5 pb-2 mb-1 border-b border-line/30">
                        <p className="text-[9px] font-mono text-signal/70 uppercase tracking-[0.18em]">
                          {t("groups.journal")}
                        </p>
                      </div>
                    )}
                    {g.items.map((it) => (
                      <Link
                        key={it.labelKey}
                        href={it.href}
                        role="menuitem"
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-all duration-100 hover:bg-surface2/70 hover:text-ink"
                      >
                        {isJournal && (
                          <span className="w-1 h-1 rounded-full bg-signal/40 shrink-0" />
                        )}
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
        className="flex flex-col justify-center gap-1 rounded-lg border border-line/50 p-2.5 text-muted transition-colors hover:text-ink hover:border-signal/30 md:hidden"
      >
        <span className={`block h-0.5 w-5 bg-current transition-all ${mobileOpen ? "rotate-45 translate-y-1.5" : ""}`} />
        <span className={`block h-0.5 w-5 bg-current transition-all ${mobileOpen ? "opacity-0" : ""}`} />
        <span className={`block h-0.5 w-5 bg-current transition-all ${mobileOpen ? "-rotate-45 -translate-y-1.5" : ""}`} />
      </button>

      {/* Mobile panel */}
      {mobileOpen && (
        <div
          className="absolute inset-x-0 top-full z-30 border-b border-line/40 shadow-xl shadow-black/40 md:hidden"
          style={{ background: "rgba(7,9,13,0.97)", backdropFilter: "blur(24px)" }}
        >
          <div className="mx-auto max-w-6xl px-6 py-5 space-y-5">
            {GROUPS.map((g) => {
              const isJournal = g.groupKey === "journal";
              return (
                <div key={g.groupKey}>
                  <p className={`text-[10px] font-semibold uppercase tracking-[0.15em] mb-2 ${isJournal ? "text-signal/80" : "text-faint"}`}>
                    {isJournal && <span className="inline-block w-1.5 h-1.5 rounded-full bg-signal me-2 align-middle" />}
                    {t(`groups.${g.groupKey}`)}
                  </p>
                  <ul className="space-y-0.5">
                    {g.items.map((it) => (
                      <li key={it.labelKey}>
                        <Link
                          href={it.href}
                          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isJournal ? "text-muted hover:text-signal hover:bg-signal/5" : "text-ink hover:bg-surface2/60"}`}
                        >
                          {isJournal && <span className="w-1 h-1 rounded-full bg-signal/40 shrink-0" />}
                          {t(`items.${it.labelKey}`)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
