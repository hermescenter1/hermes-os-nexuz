// Phase 84 — Admin Control Center navigation registry.
//
// Single source of truth for the administrative, editorial and contributor
// navigation surfaced in the Admin Control Center (/admin). Visibility is
// derived from the platform capability model (can(role, capability)) — NOT from
// duplicated hard-coded role-name comparisons — so a link appears only when the
// viewer can actually reach the route behind it.
//
// Invariant (enforced by control-center.test.ts against the real middleware
// authorization function isAuthorizedForPath): every role that can SEE an item
// can ACCESS its route. Navigation visibility is never authorization; each
// destination keeps its own server-side + middleware guard.
//
// Labels are carried inline (en/fa) rather than through the i18n message files:
// these are new navigation entries with no existing translation keys, and full
// localization is deferred to Phase 86.

import { can, type Capability, type Role } from "@/lib/auth/roles";

export interface ControlCenterItem {
  /** Stable unique key. */
  key:        string;
  labelEn:    string;
  labelFa:    string;
  /** Locale-agnostic path — the locale-aware <Link> adds the /en|/fa prefix. */
  href:       string;
  /** Capability required to reach the destination route (matches its guard). */
  capability: Capability;
  /** When true, only superadmin sees it (a genuine admin-vs-superadmin split). */
  superadminOnly?: boolean;
}

export interface ControlCenterGroup {
  key:     string;
  labelEn: string;
  labelFa: string;
  items:   ControlCenterItem[];
}

/**
 * The complete registry. Every href resolves to an existing page file guarded
 * by the stated capability (administration + editorial: capability="admin";
 * contributor/account article tools: capability="dashboard" — any authenticated
 * dashboard-capable role, matching their real route guards). Verified in
 * control-center.test.ts.
 */
export const CONTROL_CENTER: ControlCenterGroup[] = [
  {
    key: "administration",
    labelEn: "Administration",
    labelFa: "مدیریت پلتفرم",
    items: [
      { key: "adminConsole",   labelEn: "Admin Console",    labelFa: "کنسول مدیریت",   href: "/admin",                   capability: "admin" },
      { key: "analytics",      labelEn: "Analytics",        labelFa: "تحلیل‌ها",        href: "/admin/analytics",         capability: "admin" },
      { key: "documents",      labelEn: "Documents",        labelFa: "اسناد",           href: "/admin/documents",         capability: "admin" },
      { key: "documentSearch", labelEn: "Document Search",  labelFa: "جست‌وجوی اسناد",  href: "/admin/documents/search",  capability: "admin" },
      { key: "customers",      labelEn: "Customers",        labelFa: "مشتریان",         href: "/admin/customers",         capability: "admin" },
      { key: "vendors",        labelEn: "Vendors",          labelFa: "تأمین‌کنندگان",   href: "/admin/vendors",           capability: "admin" },
      { key: "leads",          labelEn: "Leads",            labelFa: "سرنخ‌ها",         href: "/admin/leads",             capability: "admin" },
      { key: "seo",            labelEn: "SEO",              labelFa: "سئو",             href: "/admin/seo",               capability: "admin" },
      { key: "academyAdmin",   labelEn: "Academy Admin",    labelFa: "مدیریت آکادمی",   href: "/academy/admin",           capability: "admin" },
    ],
  },
  {
    key: "editorial",
    labelEn: "Editorial",
    labelFa: "هیئت تحریریه",
    items: [
      // /articles/editor and /articles/editorial-board are DISTINCT routes:
      // the former is the all-articles Editorial Dashboard (ModerationDashboardClient
      // mode="editorial"), the latter is the Editorial Board hub linking to the
      // review/moderation sections. Both must stay surfaced separately.
      { key: "editorialDashboard", labelEn: "Editorial Dashboard", labelFa: "داشبورد تحریریه", href: "/articles/editor",          capability: "admin" },
      { key: "editorialBoard",     labelEn: "Editorial Board",     labelFa: "هیئت تحریریه",    href: "/articles/editorial-board", capability: "admin" },
      { key: "reviewQueue",        labelEn: "Review Queue",        labelFa: "صف بررسی",        href: "/articles/review-queue",    capability: "admin" },
      { key: "submissions",        labelEn: "Submissions",         labelFa: "ارسال‌شده‌ها",    href: "/articles/submissions",     capability: "admin" },
      { key: "moderation",         labelEn: "Moderation",          labelFa: "اعتدال محتوا",    href: "/articles/moderation",      capability: "admin" },
      { key: "reports",            labelEn: "Reports",             labelFa: "گزارش‌ها",        href: "/articles/reports",         capability: "admin" },
    ],
  },
  {
    // Contributor/account tools — the authenticated external-contributor
    // article workflow (write → submit for admin review → manage own articles).
    // These are intentionally open to every dashboard-capable role, including
    // customer and vendor, under their existing ownership/API rules. They are
    // NOT platform-authoring tools (the "authoring" capability stays reserved
    // for internal engineering/knowledge/case surfaces) and NOT editorial
    // administration — customer/vendor are contributors, never platform
    // authors or editors.
    key: "contributor",
    labelEn: "Contributor Tools",
    labelFa: "ابزارهای مشارکت‌کنندگان",
    items: [
      { key: "write",      labelEn: "Write Article", labelFa: "نوشتن مقاله", href: "/articles/write",       capability: "dashboard" },
      { key: "myArticles", labelEn: "My Articles",   labelFa: "مقالات من",   href: "/articles/my-articles", capability: "dashboard" },
    ],
  },
];

/** True when `role` may both see and reach the given item. */
export function isControlCenterItemVisible(
  role: Role | null | undefined,
  item: Pick<ControlCenterItem, "capability" | "superadminOnly">,
): boolean {
  if (!role) return false;
  if (item.superadminOnly && role !== "superadmin") return false;
  return can(role, item.capability);
}

/**
 * The Control Center groups visible to `role`, each pruned to the items the
 * role can access; empty groups are dropped. Returns [] for null/none roles.
 */
export function controlCenterFor(role: Role | null | undefined): ControlCenterGroup[] {
  return CONTROL_CENTER
    .map((g) => ({ ...g, items: g.items.filter((it) => isControlCenterItemVisible(role, it)) }))
    .filter((g) => g.items.length > 0);
}
