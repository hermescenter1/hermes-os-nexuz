// Phase 84 — Global SiteNav navigation model (pure, testable).
//
// The grouped top navigation data + its visibility policy live here so they can
// be unit-tested (the SiteNav.tsx client component cannot be imported under the
// test transform because Next uses jsx: "preserve"). SiteNav.tsx consumes this
// module for data + filtering and keeps only presentation.
//
// Visibility policy: most links are public. Links that target an admin-only
// route carry `capability: "admin"` and are shown only when can(role, "admin").
// The role is resolved server-side (SiteHeader) and passed into SiteNav as a
// prop — never fetched from a client endpoint — so the server-rendered markup
// already omits admin links for non-admins (no flash, no hydration mismatch).

import { can, type Capability, type Role } from "@/lib/auth/roles";

export interface NavItem {
  labelKey: string;              // under nav.items
  href:     string;              // locale-agnostic route; Link adds the prefix
  capability?: Capability;       // required to SEE the link; absent = public
  superadminOnly?: boolean;      // exact superadmin restriction
}
export interface NavGroup {
  groupKey: string;              // under nav.groups
  items:    NavItem[];
}

export const SITE_NAV_GROUPS: NavGroup[] = [
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
      { labelKey: "opsCenter",       href: "/dashboard/operations" },
      { labelKey: "atsPortal",       href: "/dashboard/ats" },
      { labelKey: "csCenter",        href: "/dashboard/customers" },
      { labelKey: "careersBoard",    href: "/careers" },
      { labelKey: "candidatePortal", href: "/candidate" },
      { labelKey: "academy",         href: "/academy" },
      // Admin-only: gated to can(role, "admin") to match the route guards +
      // middleware (previously shown to every visitor — Phase 84 leak fix).
      { labelKey: "compliance",      href: "/compliance",              capability: "admin" },
      { labelKey: "privacyCenter",   href: "/privacy-center" },
      { labelKey: "admin",           href: "/admin",                   capability: "admin" },
      { labelKey: "documents",       href: "/admin/documents",         capability: "admin" },
      { labelKey: "documentSearch",  href: "/admin/documents/search",  capability: "admin" },
      { labelKey: "assetRegistry",   href: "/assets/dashboard" },
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

/** True when `role` may see the given nav item. Public items (no capability)
 *  are visible to everyone, including unauthenticated (role null). */
export function isNavItemVisible(
  role: Role | null | undefined,
  item: Pick<NavItem, "capability" | "superadminOnly">,
): boolean {
  if (item.superadminOnly) return role === "superadmin";
  if (!item.capability) return true;
  return !!role && can(role, item.capability);
}

/** SITE_NAV_GROUPS pruned to the items `role` may see; empty groups dropped. */
export function visibleSiteNavGroups(role: Role | null | undefined): NavGroup[] {
  return SITE_NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => isNavItemVisible(role, it)) }))
    .filter((g) => g.items.length > 0);
}

/** Which group owns the current (locale-stripped) path, for active state.
 *  Longest-prefix match so /library/cases resolves to knowledge, /library too. */
export function activeGroupFor(pathname: string, groups: NavGroup[] = SITE_NAV_GROUPS): string | null {
  let best: { key: string; len: number } | null = null;
  for (const g of groups) {
    for (const it of g.items) {
      const h = it.href;
      const match = h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(h + "/");
      if (match && (!best || h.length > best.len)) best = { key: g.groupKey, len: h.length };
    }
  }
  return best?.key ?? null;
}
