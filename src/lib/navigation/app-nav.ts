// PHASE 87C — Authenticated application-shell navigation model (pure, testable).
//
// Mirrors the Phase 84 site-nav.ts pattern: the grouped navigation data and its
// visibility policy live in this JSX-free module so they are unit-testable under
// Vitest's node environment; the AppSidebar / AppMobileNav / AppCommandPalette
// client components consume it for data + filtering and keep only presentation.
//
// Visibility policy — DERIVED, never invented (87C amendment: EFFECTIVE access):
//   visible(role, item) ⇔ role !== null
//                          && isAuthorizedForPath(role, `/en${href}`)   // middleware
//                          && (!item.pageCapability || can(role, item.pageCapability)) // existing page guard
//
// `isAuthorizedForPath` is the exact function the middleware uses, and
// `pageCapability` mirrors the destination's EXISTING RequireCapability guard
// (see AppNavItem.pageCapability) — so nav visibility can never exceed either
// enforcement layer, and never presents a module whose own layout would deny
// the user (the invariants enforced by __tests__/app-nav.test.ts). Unknown or
// null roles fail safe: protected destinations resolve to hidden. UI
// visibility is presentation only — it is NOT a security boundary; the
// middleware and the per-route guards remain the enforcement layer, unchanged.

import { isAuthorizedForPath } from "@/lib/auth/rbac";
import { can, isRole, type Capability, type Role } from "@/lib/auth/roles";

export interface AppNavItem {
  /** Label key under appShell.nav.items.* */
  labelKey: string;
  /** Locale-agnostic route (Link adds the locale prefix). */
  href: string;
  /** Active-state matching: "exact" for hub roots that have deeper siblings. */
  match?: "exact" | "prefix";
  /**
   * PRESENTATION METADATA — NOT A SECURITY BOUNDARY (PHASE 87C amendment).
   *
   * Mirrors the destination's EXISTING page/layout `RequireCapability` guard so
   * navigation never presents a module the user cannot actually open. Some
   * module layouts are stricter than the middleware (e.g. cmms/documents/
   * assets/erp/automation/crm gate `RequireCapability("admin")` while the
   * middleware also admits engineers) — effective visibility is the
   * INTERSECTION of both existing rules. This field must track the real guard
   * in the route's layout/page; it grants nothing and enforces nothing —
   * middleware + RequireCapability remain the enforcement layers, unchanged.
   */
  pageCapability?: Capability;
}

export interface AppNavGroup {
  /** Label key under appShell.nav.groups.* */
  groupKey: string;
  items: AppNavItem[];
}

/**
 * The six authenticated navigation groups (Figma: Dashboard/Desktop sidebar,
 * PHASE 87C information architecture). Every href is a real route file —
 * asserted by the registry test. Order here is the render order.
 */
export const APP_NAV_GROUPS: AppNavGroup[] = [
  {
    groupKey: "intelligence",
    items: [
      { labelKey: "dashboard", href: "/dashboard", match: "exact" },
      { labelKey: "copilot", href: "/dashboard/copilot" },
      { labelKey: "industrialBrain", href: "/industrial-brain" },
      { labelKey: "predictive", href: "/dashboard/predictive" },
    ],
  },
  {
    groupKey: "operations",
    items: [
      { labelKey: "assets", href: "/assets", pageCapability: "authoring" },
      { labelKey: "sites", href: "/dashboard/industrial/sites" },
      { labelKey: "operationsCenter", href: "/dashboard/operations" },
      { labelKey: "automation", href: "/automation", pageCapability: "authoring" },
      { labelKey: "multiSite", href: "/dashboard/multi-site" },
      { labelKey: "maintenance", href: "/cmms", pageCapability: "authoring" },
    ],
  },
  {
    groupKey: "engineering",
    items: [
      { labelKey: "engineeringTools", href: "/engineering" },
      { labelKey: "digitalTwin", href: "/dashboard/digital-twin" },
      { labelKey: "timeSeries", href: "/dashboard/industrial/telemetry" },
      { labelKey: "assetIntelligence", href: "/dashboard/industrial", match: "exact" },
    ],
  },
  {
    groupKey: "knowledge",
    items: [
      { labelKey: "library", href: "/library" },
      { labelKey: "knowledgeBase", href: "/dashboard/knowledge", match: "exact" },
      { labelKey: "cases", href: "/dashboard/knowledge/cases" },
      { labelKey: "knowledgeGraph", href: "/dashboard/knowledge-graph" },
      { labelKey: "journal", href: "/articles" },
      { labelKey: "edms", href: "/documents", pageCapability: "authoring" },
    ],
  },
  {
    groupKey: "business",
    items: [
      { labelKey: "crm", href: "/crm", pageCapability: "admin" },
      { labelKey: "ats", href: "/dashboard/ats" },
      { labelKey: "erp", href: "/erp", pageCapability: "admin" },
      { labelKey: "customerSuccess", href: "/dashboard/customers" },
      { labelKey: "billing", href: "/dashboard/billing", pageCapability: "billing_admin" },
      { labelKey: "customerPortal", href: "/customer", pageCapability: "dashboard" },
      { labelKey: "vendorPortal", href: "/vendor", pageCapability: "dashboard" },
    ],
  },
  {
    groupKey: "administration",
    // PHASE 87L.6G — each item declares the SAME domain capability its page and
    // its middleware branch enforce, so navigation can never advertise a link
    // the server would refuse. Hiding is presentation only; the route policy in
    // rbac.ts and the page-level RequireCapability remain authoritative.
    items: [
      { labelKey: "organization", href: "/dashboard/organization", match: "exact", pageCapability: "org_admin" },
      { labelKey: "members", href: "/dashboard/organization/members", pageCapability: "org_admin" },
      { labelKey: "invitations", href: "/dashboard/organization/invitations", pageCapability: "org_admin" },
      { labelKey: "apiKeys", href: "/dashboard/api", pageCapability: "api_admin" },
      { labelKey: "orgSettings", href: "/dashboard/organization/settings", pageCapability: "org_admin" },
      { labelKey: "admin", href: "/admin", pageCapability: "admin" },
    ],
  },
];

/**
 * True when `role` may EFFECTIVELY use the nav item: the intersection of the
 * middleware route policy and the destination's existing page/layout guard
 * (`pageCapability`, when one exists). A signed-out (null) or unknown role
 * sees nothing. Locale choice is irrelevant to the policy (asserted for both
 * locales in tests); "/en" is used as the probe. Presentation-only — grants
 * nothing, enforces nothing.
 */
export function isAppNavItemVisible(
  role: Role | null | undefined,
  item: Pick<AppNavItem, "href" | "pageCapability">,
): boolean {
  if (!role || !isRole(role)) return false;
  if (!isAuthorizedForPath(role, `/en${item.href}`)) return false;
  if (item.pageCapability && !can(role, item.pageCapability)) return false;
  return true;
}

/** APP_NAV_GROUPS pruned to what `role` may see; empty groups dropped. */
export function visibleAppNavGroups(role: Role | null | undefined): AppNavGroup[] {
  return APP_NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => isAppNavItemVisible(role, it)) }))
    .filter((g) => g.items.length > 0);
}

/** True when `item` owns the current locale-stripped pathname. */
export function isItemActive(pathname: string, item: Pick<AppNavItem, "href" | "match">): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/**
 * The href of the active nav item for the pathname — longest-prefix match so
 * /dashboard/knowledge/cases activates "cases", not "knowledgeBase".
 * Returns null when no registered item matches.
 */
export function activeAppNavHref(pathname: string, groups: AppNavGroup[] = APP_NAV_GROUPS): string | null {
  let best: { href: string; len: number } | null = null;
  for (const g of groups) {
    for (const it of g.items) {
      if (isItemActive(pathname, it) && (!best || it.href.length > best.len)) {
        best = { href: it.href, len: it.href.length };
      }
    }
  }
  return best?.href ?? null;
}

export interface AppBreadcrumb {
  /** appShell.nav.groups.* key for the group crumb, items.* key for the item crumb. */
  labelKey: string;
  kind: "group" | "item";
  /** Present only on the item crumb. */
  href?: string;
  /** True when this crumb represents the current page. */
  current: boolean;
}

/**
 * Breadcrumb trail for a locale-stripped pathname, derived from the registry:
 * `Group / Item` (Figma: "Intelligence / Executive Dashboard"). The group crumb
 * is plain text; the item crumb links to its route and is marked current when
 * it IS the current page. Deeper segments keep the item crumb as the trail tail
 * (safe translated labels only — no raw IDs). Empty when nothing matches.
 */
export function breadcrumbsFor(pathname: string, groups: AppNavGroup[] = APP_NAV_GROUPS): AppBreadcrumb[] {
  const activeHref = activeAppNavHref(pathname, groups);
  if (!activeHref) return [];
  for (const g of groups) {
    for (const it of g.items) {
      if (it.href === activeHref) {
        return [
          { labelKey: g.groupKey, kind: "group", current: false },
          { labelKey: it.labelKey, kind: "item", href: it.href, current: true },
        ];
      }
    }
  }
  return [];
}
