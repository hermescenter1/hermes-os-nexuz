#!/usr/bin/env node
// @ts-check
/**
 * PHASE 104-G — product route design-coverage inventory.
 *
 * Phase 104 is a design phase across a product with hundreds of pages. The
 * failure mode that matters is not an ugly screen — it is a screen NOBODY OWNS:
 * a route that predates the design language, inherits nothing, and is never
 * looked at again because no list says it exists.
 *
 * This module derives every `page.*` under `src/app` from the filesystem, maps
 * each one onto exactly one design family and one coverage status, and fails
 * closed on anything it cannot classify. The route COUNT is derived, never
 * pinned: adding a page to the product adds it here, and if no rule matches it
 * the gate goes red until someone gives it a design owner.
 *
 * Usage:
 *   node scripts/design/phase104-route-inventory.mjs           # print a summary
 *   node scripts/design/phase104-route-inventory.mjs --json    # machine output
 *   node scripts/design/phase104-route-inventory.mjs --check   # exit 1 if unclassified
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * How a route reaches the Phase 104 visual language. These are deliberately
 * distinguishable: "covered by a shared layout" is a real, verifiable claim,
 * while "migrated directly" means the page's own file was changed.
 *
 * @typedef {"MIGRATED_DIRECTLY"
 *   | "COVERED_BY_SHARED_LAYOUT"
 *   | "COVERED_BY_SHARED_TEMPLATE"
 *   | "VISUAL_ONLY_STATIC_PUBLIC"
 *   | "INTENTIONALLY_UNCHANGED_WITH_JUSTIFICATION"
 *   | "BLOCKED_OWNER_TOOLING"} CoverageStatus
 */

/** The design families every product route must belong to. */
export const DESIGN_FAMILIES = Object.freeze([
  "public/marketing",
  "authentication",
  "workspace/dashboard",
  "command/intelligence",
  "industrial operations",
  "assets/connectivity",
  "alarms",
  "reports/analytics",
  "administration/organization",
  "ERP/CRM/CMMS/documents/compliance/automation",
  "academy/articles/library/media",
  "customer/vendor/candidate/careers",
  "error/not-found/access-denied",
]);

/**
 * Families that are declared but own ZERO routes today, each with the reason.
 *
 * A family with no routes is not a bookkeeping detail — it would mean a surface
 * the Phase 104 brief treats as existing does not exist in the product.
 *
 * CORRECTION (post-review). This map previously claimed `alarms` was empty and
 * asserted that no Alarm Center existed. That was WRONG, and the way it was
 * wrong is worth recording: the search looked for `/alarm/i` in route and
 * component filenames, but the shipped surface is spelled ALERTS —
 * `src/app/[locale]/dashboard/operations/alerts/page.tsx`, rendering
 * `src/components/operations/AlertCommandClient.tsx` against
 * `GET /api/operations/alerts`. A narrow lexical scan was turned into a
 * confident negative about the whole product. Every family now owns routes.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const EMPTY_FAMILIES = Object.freeze({});

/**
 * Ordered classification rules. FIRST MATCH WINS, so the list runs from most
 * specific to least specific. `prefix` is matched against the locale-stripped
 * route path.
 *
 * `exact: true` matches the route itself but NOT its subtree — needed where a
 * route is directly migrated while its children are not (Workspace Home).
 *
 * @type {ReadonlyArray<{prefix: string, family: string, status: CoverageStatus, note: string, exact?: boolean}>}
 */
export const ROUTE_RULES = Object.freeze([
  // ── Error and catch-all surfaces ────────────────────────────────────────
  { prefix: "/[...unmatched]", family: "error/not-found/access-denied", status: "COVERED_BY_SHARED_LAYOUT", note: "catch-all; renders the shared not-found surface" },

  // ── Dashboard subtree — classified BEFORE the generic /dashboard rule ───
  // The Alert Command surface IS the product's Alarm Center. It must be matched
  // before the generic operations rule, or it disappears into "industrial
  // operations" and the alarms family looks empty — which is exactly the
  // mistake this rule corrects.
  { prefix: "/dashboard/operations/alerts", family: "alarms", status: "COVERED_BY_SHARED_LAYOUT", note: "Alert Command — the shipped Alarm Center (AlertCommandClient over GET /api/operations/alerts; that API exposes GET only, so there is no acknowledge mutation to bind a control to)" },
  { prefix: "/dashboard/operations", family: "industrial operations", status: "COVERED_BY_SHARED_LAYOUT", note: "live operations surface" },
  { prefix: "/dashboard/industrial", family: "industrial operations", status: "COVERED_BY_SHARED_LAYOUT", note: "industrial engineering surface" },
  { prefix: "/dashboard/predictive", family: "reports/analytics", status: "COVERED_BY_SHARED_LAYOUT", note: "predictive maintenance analytics" },
  { prefix: "/dashboard/multi-site", family: "reports/analytics", status: "COVERED_BY_SHARED_LAYOUT", note: "multi-site rollup analytics" },
  { prefix: "/dashboard/digital-twin", family: "industrial operations", status: "COVERED_BY_SHARED_LAYOUT", note: "digital twin surface" },
  { prefix: "/dashboard/ot", family: "assets/connectivity", status: "COVERED_BY_SHARED_LAYOUT", note: "OT gateways and devices" },
  { prefix: "/dashboard/knowledge-graph", family: "command/intelligence", status: "COVERED_BY_SHARED_LAYOUT", note: "knowledge graph surface" },
  { prefix: "/dashboard/knowledge", family: "command/intelligence", status: "COVERED_BY_SHARED_LAYOUT", note: "knowledge surfaces" },
  { prefix: "/dashboard/copilot", family: "command/intelligence", status: "COVERED_BY_SHARED_LAYOUT", note: "assistant surface" },
  { prefix: "/dashboard/organization", family: "administration/organization", status: "COVERED_BY_SHARED_LAYOUT", note: "organization administration" },
  { prefix: "/dashboard/billing", family: "administration/organization", status: "COVERED_BY_SHARED_LAYOUT", note: "billing administration" },
  { prefix: "/dashboard/ats", family: "customer/vendor/candidate/careers", status: "COVERED_BY_SHARED_LAYOUT", note: "applicant tracking" },
  { prefix: "/dashboard/customers", family: "ERP/CRM/CMMS/documents/compliance/automation", status: "COVERED_BY_SHARED_LAYOUT", note: "CRM customers" },
  // PHASE 104-D2 — Workspace Home is the first directly migrated route
  // content: the Hermes Triad replaced the flat section stack. Matched before
  // the generic /dashboard rule so the pilot cannot hide inside it.
  { prefix: "/dashboard", family: "workspace/dashboard", status: "MIGRATED_DIRECTLY", note: "Workspace Home — Phase 104-D2 visual pilot; the Hermes Triad (operate/understand/act) is the decision hierarchy", exact: true },
  { prefix: "/dashboard", family: "workspace/dashboard", status: "COVERED_BY_SHARED_LAYOUT", note: "workspace shell and dashboard subroutes" },

  // ── Authentication ──────────────────────────────────────────────────────
  // The canonical Login is the second directly migrated route: Hermes Horizon
  // plus a contract-owned Glass tier. Every other auth route keeps the shared
  // 87E template, which is exactly what the 104-D2 gate asserts.
  // `exact` for the same reason Workspace Home needs it: only the canonical
  // Login page was redesigned. A future `/auth/login/*` child would otherwise
  // inherit MIGRATED_DIRECTLY and inflate the count without being touched.
  { prefix: "/auth/login", family: "authentication", status: "MIGRATED_DIRECTLY", note: "canonical Login — Phase 104-D2 visual pilot; Horizon atmosphere and .ds-glass-elevated content surface", exact: true },
  // `/login` is a redirect to /auth/login and is NOT a separately designed
  // page; it must never be counted as a migrated visual route.
  { prefix: "/login", family: "authentication", status: "COVERED_BY_SHARED_TEMPLATE", note: "compatibility redirect to /auth/login — no visual surface of its own" },
  { prefix: "/auth", family: "authentication", status: "COVERED_BY_SHARED_TEMPLATE", note: "auth-experience shell" },

  // ── Intelligence ────────────────────────────────────────────────────────
  { prefix: "/industrial-brain", family: "command/intelligence", status: "COVERED_BY_SHARED_LAYOUT", note: "Industrial Brain" },
  { prefix: "/brain", family: "command/intelligence", status: "COVERED_BY_SHARED_LAYOUT", note: "Brain entry surface" },
  { prefix: "/intelligence", family: "command/intelligence", status: "COVERED_BY_SHARED_LAYOUT", note: "intelligence surface" },
  { prefix: "/copilot", family: "command/intelligence", status: "COVERED_BY_SHARED_LAYOUT", note: "assistant surface" },
  { prefix: "/knowledge", family: "command/intelligence", status: "COVERED_BY_SHARED_LAYOUT", note: "knowledge surfaces" },

  // ── Industrial engineering (Phase 101) ──────────────────────────────────
  { prefix: "/engineering", family: "industrial operations", status: "COVERED_BY_SHARED_LAYOUT", note: "Phase 101 engineering surfaces" },

  // ── Assets and connectivity ─────────────────────────────────────────────
  { prefix: "/assets", family: "assets/connectivity", status: "COVERED_BY_SHARED_LAYOUT", note: "asset register and detail" },
  { prefix: "/cmms", family: "assets/connectivity", status: "COVERED_BY_SHARED_LAYOUT", note: "maintenance management" },

  // ── Business modules ────────────────────────────────────────────────────
  { prefix: "/erp", family: "ERP/CRM/CMMS/documents/compliance/automation", status: "COVERED_BY_SHARED_LAYOUT", note: "ERP module" },
  { prefix: "/crm", family: "ERP/CRM/CMMS/documents/compliance/automation", status: "COVERED_BY_SHARED_LAYOUT", note: "CRM module" },
  { prefix: "/documents", family: "ERP/CRM/CMMS/documents/compliance/automation", status: "COVERED_BY_SHARED_LAYOUT", note: "EDMS document management" },
  { prefix: "/compliance", family: "ERP/CRM/CMMS/documents/compliance/automation", status: "COVERED_BY_SHARED_LAYOUT", note: "compliance module" },
  { prefix: "/automation", family: "ERP/CRM/CMMS/documents/compliance/automation", status: "COVERED_BY_SHARED_LAYOUT", note: "automation studio" },

  // ── Learning and media ──────────────────────────────────────────────────
  { prefix: "/academy", family: "academy/articles/library/media", status: "COVERED_BY_SHARED_LAYOUT", note: "academy" },
  { prefix: "/articles", family: "academy/articles/library/media", status: "COVERED_BY_SHARED_LAYOUT", note: "articles" },
  { prefix: "/library", family: "academy/articles/library/media", status: "COVERED_BY_SHARED_LAYOUT", note: "library" },
  { prefix: "/videos", family: "academy/articles/library/media", status: "COVERED_BY_SHARED_LAYOUT", note: "Phase 102 media and video hub" },

  // ── Administration ──────────────────────────────────────────────────────
  { prefix: "/admin", family: "administration/organization", status: "COVERED_BY_SHARED_LAYOUT", note: "platform administration" },

  // ── External-party portals ──────────────────────────────────────────────
  { prefix: "/customer", family: "customer/vendor/candidate/careers", status: "COVERED_BY_SHARED_LAYOUT", note: "customer portal" },
  { prefix: "/vendors", family: "customer/vendor/candidate/careers", status: "COVERED_BY_SHARED_LAYOUT", note: "vendor directory" },
  { prefix: "/vendor", family: "customer/vendor/candidate/careers", status: "COVERED_BY_SHARED_LAYOUT", note: "vendor portal" },
  { prefix: "/candidate", family: "customer/vendor/candidate/careers", status: "COVERED_BY_SHARED_LAYOUT", note: "candidate portal" },
  { prefix: "/careers", family: "customer/vendor/candidate/careers", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "public careers pages" },

  // ── Public and marketing ────────────────────────────────────────────────
  { prefix: "/about", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "public site" },
  { prefix: "/platform", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "public site" },
  { prefix: "/services", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "public site" },
  { prefix: "/pricing", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "public site" },
  { prefix: "/contact", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "public site" },
  { prefix: "/architecture", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "public site" },
  { prefix: "/demo", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "public site" },
  { prefix: "/cookies", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "legal page" },
  { prefix: "/privacy-center", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "privacy centre" },
  { prefix: "/privacy", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "legal page" },
  { prefix: "/terms", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "legal page" },
  { prefix: "/gdpr", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "legal page" },
  { prefix: "/data-request", family: "public/marketing", status: "VISUAL_ONLY_STATIC_PUBLIC", note: "privacy request form" },

  // ── Locale root ─────────────────────────────────────────────────────────
  // Phase 104-E — the Observatory homepage is the first PUBLIC route to be
  // redesigned in full (owner-approved after three visual review rounds:
  // bespoke ObservatorySignature, eight-chapter narrative, no stock imagery,
  // Glass/Beacon/Edge at their contract meanings, header/footer opt-in).
  // The classifier already treats "/" as an EXACT match (see ), so
  // this status reaches the localised homepage only — no other public route
  // inherits it, and the locale variants remain ONE route, not three.
  { prefix: "/", family: "public/marketing", status: "MIGRATED_DIRECTLY", note: "Observatory homepage — Phase 104-E; owner + Codex approved reference surface", exact: true },
]);

/**
 * Every `page.*` under `src/app`, as a locale-stripped route path.
 * @param {string} [repoRoot]
 * @returns {string[]}
 */
export function deriveRoutes(repoRoot = process.cwd()) {
  const appDir = resolve(repoRoot, "src/app");
  /** @type {string[]} */
  const pages = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") continue;
        walk(p);
      } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
        pages.push(p);
      }
    }
  };
  walk(appDir);

  return pages
    .map((p) => p.slice(appDir.length).split("\\").join("/"))
    .map((p) => p.replace(/\/page\.(tsx|ts|jsx|js)$/, ""))
    // The locale segment is a routing device, not a design surface: /fa/assets
    // and /en/assets are the same screen in two directions.
    .map((p) => p.replace(/^\/\[locale\]/, ""))
    .map((p) => (p === "" ? "/" : p))
    .sort();
}

/**
 * Classify one route. Returns null when no rule matches — the fail-closed case.
 * @param {string} route
 */
export function classify(route) {
  for (const rule of ROUTE_RULES) {
    if (rule.prefix === "/") {
      if (route === "/") return rule;
      continue;
    }
    // `exact: true` matches the route itself but not its subtree. Workspace
    // Home is directly migrated while `/dashboard/*` is not, and a prefix rule
    // alone cannot express that difference.
    if (rule.exact) {
      if (route === rule.prefix) return rule;
      continue;
    }
    if (route === rule.prefix || route.startsWith(`${rule.prefix}/`)) return rule;
  }
  return null;
}

/**
 * Full inventory.
 * @param {string} [repoRoot]
 */
export function buildInventory(repoRoot = process.cwd()) {
  const routes = deriveRoutes(repoRoot);
  const classified = routes.map((route) => {
    const rule = classify(route);
    return {
      route,
      family: rule?.family ?? null,
      status: rule?.status ?? null,
      note: rule?.note ?? null,
    };
  });
  const unclassified = classified.filter((c) => c.family === null).map((c) => c.route);

  /** @type {Record<string, number>} */
  const byFamily = {};
  /** @type {Record<string, number>} */
  const byStatus = {};
  for (const c of classified) {
    if (c.family) byFamily[c.family] = (byFamily[c.family] ?? 0) + 1;
    if (c.status) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  }

  return {
    total: routes.length,
    covered: routes.length - unclassified.length,
    unclassified,
    byFamily,
    byStatus,
    routes: classified,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1].split("\\").join("/")}`).href;

if (isMain) {
  const inv = buildInventory();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(inv, null, 2));
  } else {
    console.log("\n=== PHASE 104 ROUTE DESIGN COVERAGE ===");
    console.log(`PHASE104_ROUTE_COVERAGE=${inv.covered}/${inv.total}`);
    console.log(`PHASE104_UNCLASSIFIED_ROUTES=${inv.unclassified.length}`);
    console.log("\nby family:");
    for (const [f, n] of Object.entries(inv.byFamily).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${f}`);
    }
    console.log("\nby coverage status:");
    for (const [s, n] of Object.entries(inv.byStatus).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${s}`);
    }
    if (inv.unclassified.length) {
      console.log("\nUNCLASSIFIED (no design owner):");
      for (const r of inv.unclassified) console.log(`  - ${r}`);
    }
  }
  if (process.argv.includes("--check") && inv.unclassified.length > 0) {
    console.error(
      `\nFAIL: ${inv.unclassified.length} route(s) have no design family.`,
    );
    process.exit(1);
  }
}
