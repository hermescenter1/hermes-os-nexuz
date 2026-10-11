/**
 * Executive Management Center — the route-security classifier's view of it.
 *
 * `GET /api/executive/summary` carries its authorization in ONE composite
 * resolver, `resolveExecutiveScope`. Teaching the Phase 99 classifier that token
 * is a security statement, and it has to be earned rather than asserted. This
 * suite locks both halves:
 *
 *   1. the classifier sees the route as TENANT_MEMBER through the registered
 *      token, not through a public-surface declaration;
 *   2. the resolver really performs the five checks the registration vouches
 *      for, so deleting any one of them turns this suite RED instead of quietly
 *      widening the route;
 *   3. the whole-tree tenant analysis stays at zero violations with the new
 *      route present.
 *
 * The source assertions read the LIVE file with comments stripped, so a check
 * that survives only inside a comment does not satisfy them.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { GUARD_TOKENS, buildRouteInventory, stripComments } from "../security/phase99/route-inventory.mjs";
import { analyzeTenantPredicates } from "../security/phase99/tenant-predicates.mjs";

const REPO = process.cwd();
const RESOLVER = "src/lib/executive/scope.ts";
const ROUTE = "src/app/api/executive/summary/route.ts";
const WORKER_AUTH = "src/lib/executive/report/auth.ts";
const WORKER_ROUTE = "src/app/api/executive/reports/run/route.ts";

const live = (rel: string) => stripComments(readFileSync(join(REPO, rel), "utf8"));

describe("the executive guard is a registered tenant-scope token", () => {
  it("resolveExecutiveScope appears exactly once in GUARD_TOKENS with scope tenant", () => {
    const entries = (GUARD_TOKENS as { token: string; scope: string }[]).filter(
      g => g.token === "resolveExecutiveScope",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].scope).toBe("tenant");
  });

  it("is a real exported function in the resolver module", () => {
    expect(existsSync(join(REPO, RESOLVER))).toBe(true);
    expect(live(RESOLVER)).toMatch(/export\s+async\s+function\s+resolveExecutiveScope\b/);
  });
});

describe("the resolver performs every check the registration vouches for", () => {
  const src = live(RESOLVER);

  it("establishes an authenticated identity from the session, not the request", () => {
    expect(src).toMatch(/getCurrentUser\s*\(/);
    expect(src).toMatch(/from\s+"@\/lib\/auth\/session"/);
  });

  it("requires the platform admin capability", () => {
    expect(src).toMatch(/platformCan\s*\(\s*user\.role\s*,\s*"admin"\s*\)/);
  });

  it("resolves the acting organization SERVER-side and re-reads membership", () => {
    expect(src).toMatch(/getActiveOrganizationContext\s*\(/);
    expect(src).toMatch(/from\s+"@\/lib\/erp\/active-organization"/);
  });

  it("checks the three authority axes independently against the proven role", () => {
    expect(src).toMatch(/orgCan\s*\(\s*scope\.role\s*,\s*"view_erp"\s*\)/);
    expect(src).toMatch(/orgCan\s*\(\s*scope\.role\s*,\s*"view_erp_compensation"\s*\)/);
    expect(src).toMatch(/orgCan\s*\(\s*scope\.role\s*,\s*"view_industrial"\s*\)/);
  });

  it("refuses a reader who holds none of the three axes", () => {
    expect(src).toMatch(/NO_ACCESSIBLE_AXIS/);
  });

  it("resolves the site allow-list through the canonical helper", () => {
    expect(src).toMatch(/getAllowedSiteIds\s*\(/);
    expect(src).toMatch(/from\s+"@\/lib\/site\/context"/);
  });

  it("never reads an organization, site or role from a request or a client payload", () => {
    // The resolver takes no arguments at all: there is nothing for a caller to
    // pass in, which is the strongest available form of this guarantee.
    expect(src).toMatch(/export\s+async\s+function\s+resolveExecutiveScope\s*\(\s*\)/);
    expect(src).not.toMatch(/searchParams/);
    expect(src).not.toMatch(/req\.(json|headers|cookies)/);
  });
});

describe("the route delegates to the resolver and classifies as tenant-scoped on the real tree", () => {
  const inventory = buildRouteInventory() as {
    apiPath: string;
    method: string;
    classification: string;
    authEvidence: string[];
    declaredSurface: boolean;
    tenantScoped: boolean;
    mutates: boolean;
  }[];

  it("the handler really calls the resolver", () => {
    const src = live(ROUTE);
    expect(src).toMatch(/resolveExecutiveScope\s*\(/);
    // A refusal must short-circuit before any data is built.
    expect(src).toMatch(/if\s*\(\s*!resolved\.ok\s*\)/);
  });

  it("classifies GET /api/executive/summary as TENANT_MEMBER via the registered token", () => {
    const handler = inventory.find(r => r.apiPath === "/api/executive/summary" && r.method === "GET");
    expect(handler).toBeDefined();
    expect(handler?.classification).toBe("TENANT_MEMBER");
    expect(handler?.authEvidence).toContain("resolveExecutiveScope");
    expect(handler?.declaredSurface).toBe(false);
    expect(handler?.tenantScoped).toBe(true);
  });

  it("the worker route is PLATFORM_ADMIN via its OWN registered token", () => {
    const entries = (GUARD_TOKENS as { token: string; scope: string }[]).filter(
      g => g.token === "authorizeExecutiveReportWorker",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].scope).toBe("platform");

    const handler = inventory.find(
      r => r.apiPath === "/api/executive/reports/run" && r.method === "POST",
    );
    expect(handler).toBeDefined();
    expect(handler?.classification).toBe("PLATFORM_ADMIN");
    expect(handler?.authEvidence).toContain("authorizeExecutiveReportWorker");
    expect(handler?.declaredSurface).toBe(false);
  });

  it("the worker guard performs the checks its registration vouches for", () => {
    const src = live(WORKER_AUTH);
    // A constant-time comparison, never a plain ===.
    expect(src).toMatch(/timingSafeEqual/);
    expect(src).toMatch(/EXECUTIVE_REPORT_WORKER_TOKEN/);
    // The documented fallback chain.
    expect(src).toMatch(/METERING_WORKER_TOKEN/);
    expect(src).toMatch(/METRICS_TOKEN/);
    // The session alternative, and the admin capability on it.
    expect(src).toMatch(/getCurrentUser\s*\(/);
    expect(src).toMatch(/can\s*\(\s*user\.role\s*,\s*"admin"\s*\)/);
    // Fails closed: with nothing configured and no session it refuses.
    expect(src).toMatch(/configured\.length === 0/);
    expect(src).toMatch(/status: 401/);
  });

  it("the worker route really delegates to that guard and short-circuits on refusal", () => {
    const src = live(WORKER_ROUTE);
    expect(src).toMatch(/authorizeExecutiveReportWorker\s*\(/);
    expect(src).toMatch(/if\s*\(\s*!auth\.ok\s*\)/);
    // It must NOT quietly reuse the metering credential's guard.
    expect(src).not.toMatch(/authorizeWorkerRequest/);
  });

  it("is a read-only handler — the executive surface mutates nothing", () => {
    // The READER surface. The worker entrypoint is deliberately excluded: it is
    // a scheduler trigger that writes reports, and it is gated PLATFORM_ADMIN
    // rather than TENANT_MEMBER.
    const readers = inventory.filter(
      r => r.apiPath.startsWith("/api/executive") && r.apiPath !== "/api/executive/reports/run",
    );
    expect(readers.length).toBeGreaterThan(0);
    for (const h of readers) {
      expect(h.method, h.apiPath).toBe("GET");
      expect(h.mutates, h.apiPath).toBe(false);
    }
  });

  it("leaves the whole-tree tenant analysis at zero violations on every dimension", () => {
    const analysis = analyzeTenantPredicates({ repoRoot: REPO }) as {
      ok: boolean;
      idorViolations: unknown[];
      siteViolations: unknown[];
      identityViolations: unknown[];
      roleViolations: unknown[];
      staleReviews: unknown[];
      results: { apiPath: string; method: string; objectScoped: boolean }[];
    };
    expect(analysis.idorViolations).toEqual([]);
    expect(analysis.siteViolations).toEqual([]);
    expect(analysis.identityViolations).toEqual([]);
    expect(analysis.roleViolations).toEqual([]);
    expect(analysis.staleReviews).toEqual([]);
    expect(analysis.ok).toBe(true);
  });

  it("accepts the executive route as object-scoped without a review exception", () => {
    const analysis = analyzeTenantPredicates({ repoRoot: REPO }) as {
      results: { apiPath: string; method: string; objectScoped: boolean }[];
    };
    const row = analysis.results.find(r => r.apiPath === "/api/executive/summary" && r.method === "GET");
    expect(row).toBeDefined();
    // The handler addresses no object by a client-supplied id at all, so there
    // is nothing for an IDOR predicate to miss — and no allowlist entry was
    // needed to make the gate pass.
    expect(row?.objectScoped).toBe(true);
  });
});
