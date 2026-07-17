// PHASE 87D.1 — public-site navigation data (pure module, no React).
//
// Mirrors the Phase 84 `site-nav.ts` pattern: header/footer render from this
// data and the registry tests assert every href resolves to a real, publicly
// reachable route (never middleware-protected), so the public shell can never
// link an anonymous visitor into the login wall. Labels come from the
// `publicSite.header.*` / `publicSite.footer.*` catalog namespaces (en+fa+de).
//
// 87D.1 expands the flat five-item header into a grouped enterprise IA
// (Platform / Intelligence / Knowledge / Resources / Company) so the real
// scale of the platform is discoverable from every public page.

export type PublicNavGroupKey =
  | "platform"
  | "intelligence"
  | "knowledge"
  | "resources"
  | "company";

export interface PublicNavItem {
  labelKey: string;
  href: string;
}

export interface PublicNavGroup {
  groupKey: PublicNavGroupKey;
  items: readonly PublicNavItem[];
}

/** Grouped header navigation — five disclosure groups, existing routes only. */
export const PUBLIC_NAV_GROUPS: readonly PublicNavGroup[] = [
  {
    groupKey: "platform",
    items: [
      { labelKey: "platformOverview", href: "/platform" },
      { labelKey: "architecture",     href: "/architecture" },
      { labelKey: "services",         href: "/services" },
    ],
  },
  {
    groupKey: "intelligence",
    items: [
      { labelKey: "industrialBrain",  href: "/industrial-brain" },
      { labelKey: "hermesBrain",      href: "/brain" },
      { labelKey: "copilot",          href: "/copilot" },
    ],
  },
  {
    groupKey: "knowledge",
    items: [
      { labelKey: "library",          href: "/library" },
      { labelKey: "academy",          href: "/academy" },
      { labelKey: "articles",         href: "/articles" },
    ],
  },
  {
    groupKey: "resources",
    items: [
      { labelKey: "demo",             href: "/demo" },
      { labelKey: "vendors",          href: "/vendors" },
    ],
  },
  {
    groupKey: "company",
    items: [
      { labelKey: "about",            href: "/about" },
      { labelKey: "careers",          href: "/careers" },
      { labelKey: "contact",          href: "/contact" },
    ],
  },
];

export type PublicFooterColumnKey =
  | "platform"
  | "intelligence"
  | "resources"
  | "company"
  | "legal";

export interface PublicFooterLink {
  labelKey: string;
  href: string;
}

export interface PublicFooterColumn {
  columnKey: PublicFooterColumnKey;
  links: readonly PublicFooterLink[];
}

/**
 * Footer columns — the public site structure at a glance. Existing routes
 * only; no invented pages.
 */
export const PUBLIC_FOOTER_COLUMNS: readonly PublicFooterColumn[] = [
  {
    columnKey: "platform",
    links: [
      { labelKey: "platformOverview", href: "/platform" },
      { labelKey: "architecture",     href: "/architecture" },
      { labelKey: "services",         href: "/services" },
    ],
  },
  {
    columnKey: "intelligence",
    links: [
      { labelKey: "industrialBrain",  href: "/industrial-brain" },
      { labelKey: "hermesBrain",      href: "/brain" },
      { labelKey: "copilot",          href: "/copilot" },
    ],
  },
  {
    columnKey: "resources",
    links: [
      { labelKey: "knowledgeLibrary", href: "/library" },
      { labelKey: "academy",          href: "/academy" },
      { labelKey: "articles",         href: "/articles" },
      { labelKey: "vendors",          href: "/vendors" },
    ],
  },
  {
    columnKey: "company",
    links: [
      { labelKey: "about",            href: "/about" },
      { labelKey: "careers",          href: "/careers" },
      { labelKey: "contact",          href: "/contact" },
      { labelKey: "requestDemo",      href: "/demo" },
    ],
  },
  {
    columnKey: "legal",
    links: [
      { labelKey: "privacy",          href: "/privacy" },
      { labelKey: "terms",            href: "/terms" },
      { labelKey: "cookies",          href: "/cookies" },
    ],
  },
];

/** Every href rendered by the public shell (used by the integrity tests). */
export function allPublicShellHrefs(): string[] {
  return [
    ...PUBLIC_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)),
    ...PUBLIC_FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href)),
  ];
}
