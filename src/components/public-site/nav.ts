// PHASE 87D — public-site navigation data (pure module, no React).
//
// Mirrors the Phase 84 `site-nav.ts` pattern: the header/footer render from
// this data, and the registry tests assert every href resolves to a real,
// publicly reachable route (never middleware-protected), so the premium
// public shell can never link an anonymous visitor into the login wall.
// Labels come from the `publicSite.header.nav` / `publicSite.footer.links`
// catalog namespaces (en + fa + de).

export type PublicNavLabelKey =
  | "platform"
  | "solutions"
  | "industrialBrain"
  | "knowledge"
  | "company";

export interface PublicNavItem {
  labelKey: PublicNavLabelKey;
  href: string;
}

/** Primary header navigation — five flat items per the approved Figma header. */
export const PUBLIC_NAV_ITEMS: readonly PublicNavItem[] = [
  { labelKey: "platform",        href: "/platform" },
  { labelKey: "solutions",       href: "/services" },
  { labelKey: "industrialBrain", href: "/brain" },
  { labelKey: "knowledge",       href: "/library" },
  { labelKey: "company",         href: "/about" },
];

export type PublicFooterColumnKey = "platform" | "company" | "legal";

export interface PublicFooterLink {
  labelKey: string;
  href: string;
}

export interface PublicFooterColumn {
  columnKey: PublicFooterColumnKey;
  links: readonly PublicFooterLink[];
}

/**
 * Footer columns. Note: unlike the legacy SiteFooter, "Platform" points at
 * /platform (the legacy footer mislinked it to "/") and every target is a
 * real public page.
 */
export const PUBLIC_FOOTER_COLUMNS: readonly PublicFooterColumn[] = [
  {
    columnKey: "platform",
    links: [
      { labelKey: "platform",         href: "/platform" },
      { labelKey: "industrialBrain",  href: "/brain" },
      { labelKey: "copilot",          href: "/copilot" },
      { labelKey: "knowledgeLibrary", href: "/library" },
    ],
  },
  {
    columnKey: "company",
    links: [
      { labelKey: "about",       href: "/about" },
      { labelKey: "careers",     href: "/careers" },
      { labelKey: "contact",     href: "/contact" },
      { labelKey: "requestDemo", href: "/demo" },
    ],
  },
  {
    columnKey: "legal",
    links: [
      { labelKey: "privacy", href: "/privacy" },
      { labelKey: "terms",   href: "/terms" },
      { labelKey: "cookies", href: "/cookies" },
    ],
  },
];

/** Every href rendered by the public shell (used by the integrity tests). */
export function allPublicShellHrefs(): string[] {
  return [
    ...PUBLIC_NAV_ITEMS.map((i) => i.href),
    ...PUBLIC_FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href)),
  ];
}
