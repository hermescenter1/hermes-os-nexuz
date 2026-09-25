/**
 * PHASE 112 — the route-security classifier's view of the reasoning-run surface.
 *
 * The three reasoning-run routes carry their authorization in ONE composite
 * adapter, `resolveReasoningRunActor` (tenant identity + permission) and, for the
 * write, `authorizeRunScope` (site/asset authorization). Teaching the classifier
 * and the tenant analyser those two tokens is a security statement that has to be
 * earned. This suite locks both halves:
 *
 *   1. the classifier sees the three routes as TENANT_MEMBER via the registered
 *      token, not via a public-surface declaration;
 *   2. the adapter really performs the checks the registrations vouch for —
 *      requirePlatformAuth + requireOrgActor + requirePermission, and
 *      requireSiteActor + requireSitePermission — so deleting any of them turns
 *      this RED;
 *   3. the whole-tree tenant analysis stays at zero violations.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { GUARD_TOKENS, buildRouteInventory, stripComments } from "../security/phase99/route-inventory.mjs";
import { analyzeTenantPredicates } from "../security/phase99/tenant-predicates.mjs";
import { PUBLIC_SURFACE } from "../security/phase99/public-surface.mjs";

const REPO = process.cwd();
const ADAPTER = "src/lib/reasoning-runs/tenant-adapter.ts";
const RUN_ROUTES = [
  { apiPath: "/api/industrial-brain/runs", method: "POST" },
  { apiPath: "/api/industrial-brain/runs/[id]", method: "GET" },
  { apiPath: "/api/industrial-brain/runs/[id]/replay", method: "POST" },
] as const;

const live = (rel: string) => stripComments(readFileSync(join(REPO, rel), "utf8"));

describe("the reasoning-run guard is a registered tenant-scope token", () => {
  it("resolveReasoningRunActor appears exactly once in GUARD_TOKENS with scope tenant", () => {
    const entries = (GUARD_TOKENS as { token: string; scope: string }[]).filter(
      (g) => g.token === "resolveReasoningRunActor",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].scope).toBe("tenant");
  });

  it("both adapter helpers are real exported functions", () => {
    expect(existsSync(join(REPO, ADAPTER))).toBe(true);
    const src = live(ADAPTER);
    expect(src).toMatch(/export\s+async\s+function\s+resolveReasoningRunActor\b/);
    expect(src).toMatch(/export\s+async\s+function\s+authorizeRunScope\b/);
  });
});

describe("the three reasoning-run routes classify as tenant-scoped on the real tree", () => {
  const inventory = buildRouteInventory() as {
    apiPath: string;
    method: string;
    classification: string;
    authEvidence: string[];
    declaredSurface: boolean;
  }[];

  it("classifies each via the registered token, not a public declaration", () => {
    for (const { apiPath, method } of RUN_ROUTES) {
      const handler = inventory.find((r) => r.apiPath === apiPath && r.method === method);
      expect(handler, `${method} ${apiPath}`).toBeDefined();
      expect(handler?.classification, apiPath).toBe("TENANT_MEMBER");
      expect(handler?.authEvidence, apiPath).toContain("resolveReasoningRunActor");
      expect(handler?.declaredSurface, apiPath).toBe(false);
    }
  });

  it("none of them is a declared PUBLIC surface", () => {
    const declared = (PUBLIC_SURFACE as { path: string }[]).map((e) => e.path);
    for (const { apiPath } of RUN_ROUTES) expect(declared).not.toContain(apiPath);
  });

  it("MUTATION: without the token the create route carries no tenant evidence", () => {
    const withoutRun = (GUARD_TOKENS as { token: string; scope: string }[]).filter(
      (g) => g.token !== "resolveReasoningRunActor",
    );
    const body = live("src/app/api/industrial-brain/runs/route.ts");
    const stillMatches = withoutRun.filter((g) => new RegExp(`\\b${g.token}\\s*\\(`).test(body));
    expect(stillMatches.map((g) => g.token)).toEqual([]);
  });
});

describe("the adapter performs the predicates its registrations claim", () => {
  const adapter = live(ADAPTER);

  it("resolveReasoningRunActor resolves the org on the server and proves membership + permission", () => {
    expect(adapter).toContain("await requirePlatformAuth(req)");
    expect(adapter).toContain("await requireOrgActor(req, ctx.orgId)");
    expect(adapter).toContain("requirePermission(member.ctx.role, permission)");
    // The organization used downstream comes from the server context, not the body.
    expect(adapter).toContain("orgId: ctx.orgId");
  });

  it("authorizeRunScope authorizes the site with requireSiteActor + requireSitePermission", () => {
    expect(adapter).toContain("await requireSiteActor(req, actor.orgId, siteId)");
    expect(adapter).toContain('requireSitePermission(siteAuth.ctx.role, "view_assets")');
    // A foreign/missing asset or site is a uniform 404, not a 403 disclosure.
    expect(adapter).toContain("status: 404");
  });

  it("reads no identity field out of the request body", () => {
    for (const forbidden of ["body.organizationId", "body.userId", "body.siteId"]) {
      expect(adapter, forbidden).not.toContain(forbidden);
    }
  });
});

describe("adding the reasoning-run surface leaves the tenant analysis at zero violations", () => {
  const analysis = analyzeTenantPredicates() as {
    ok: boolean;
    idorViolations: unknown[];
    siteViolations: unknown[];
    identityViolations: unknown[];
    roleViolations: unknown[];
    staleReviews: unknown[];
    results: { apiPath: string; method: string; objectScoped: boolean; referencesServerScope: boolean }[];
    coverage: Record<string, number>;
  };

  it("has zero violations on every dimension", () => {
    expect(analysis.identityViolations).toEqual([]);
    expect(analysis.idorViolations).toEqual([]);
    expect(analysis.siteViolations).toEqual([]);
    expect(analysis.roleViolations).toEqual([]);
    expect(analysis.staleReviews).toEqual([]);
    expect(analysis.ok).toBe(true);
  });

  it("includes the reasoning-run handlers, each carrying a server-derived scope", () => {
    for (const { apiPath, method } of RUN_ROUTES) {
      const result = analysis.results.find((r) => r.apiPath === apiPath && r.method === method);
      expect(result, `${method} ${apiPath}`).toBeDefined();
      expect(result?.objectScoped, apiPath).toBe(true);
      expect(result?.referencesServerScope, apiPath).toBe(true);
    }
  });
});
