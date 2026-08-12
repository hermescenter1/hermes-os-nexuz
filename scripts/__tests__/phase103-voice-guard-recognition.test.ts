/**
 * PHASE 103 — the route-security classifier's view of the voice surface.
 *
 * WHY THIS FILE EXISTS
 * The Phase 99 classifier reads authorization evidence out of each handler's own
 * body. The three voice routes carry none directly: their whole chain lives in
 * ONE composite helper, `requireVoiceCopilotActor`. Without teaching the
 * classifier that token, all three would classify `UNKNOWN` and fail readiness —
 * and "add it to the vocabulary" is a security statement that has to be earned,
 * not asserted.
 *
 * This suite is the lock on both halves of that bargain:
 *
 *   1. the classifier really does see the three routes as TENANT_MEMBER, through
 *      the registered token and not through a public-surface declaration;
 *   2. the helper really performs the checks the registration vouches for — it
 *      composes `requireOrgActor` and `requirePermission` against a
 *      server-derived organisation — so deleting either from the helper turns
 *      this RED even before the behavioural suites catch it;
 *   3. the tenant analyser still reports zero violations on the whole tree, with
 *      a population that only ever grows.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  GUARD_TOKENS,
  buildRouteInventory,
  stripComments,
} from "../security/phase99/route-inventory.mjs";
import { analyzeTenantPredicates } from "../security/phase99/tenant-predicates.mjs";
import { PUBLIC_SURFACE } from "../security/phase99/public-surface.mjs";

const REPO = process.cwd();

const GUARD_MODULE = "src/lib/copilot/voice/guard.ts";
const VOICE_PATHS = [
  "/api/copilot/voice/session",
  "/api/copilot/voice/query",
  "/api/copilot/voice/speech",
] as const;

const live = (rel: string) => stripComments(readFileSync(join(REPO, rel), "utf8"));

/* ── 1. The token is registered, once, with tenant scope ─────────────────── */

describe("the voice guard is a registered tenant-scope token", () => {
  it("appears exactly once in GUARD_TOKENS with scope tenant", () => {
    const entries = (GUARD_TOKENS as { token: string; scope: string }[]).filter(
      (g) => g.token === "requireVoiceCopilotActor",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].scope).toBe("tenant");
  });

  it("resolves to a real exported helper", () => {
    expect(existsSync(join(REPO, GUARD_MODULE))).toBe(true);
    expect(live(GUARD_MODULE)).toMatch(/export\s+async\s+function\s+requireVoiceCopilotActor\b/);
  });
});

/* ── 2. The classifier really sees the three routes ──────────────────────── */

describe("the three voice routes classify as tenant-scoped, on the real tree", () => {
  const inventory = buildRouteInventory() as {
    apiPath: string;
    method: string;
    classification: string;
    authEvidence: string[];
    declaredSurface: boolean;
    mutates: boolean;
  }[];

  it("finds all three POST handlers", () => {
    for (const apiPath of VOICE_PATHS) {
      const handler = inventory.find((r) => r.apiPath === apiPath && r.method === "POST");
      expect(handler, apiPath).toBeDefined();
    }
    // Nothing but POST: a GET on any of these would be a state-changing read.
    const methods = inventory
      .filter((r) => (VOICE_PATHS as readonly string[]).includes(r.apiPath))
      .map((r) => r.method);
    expect([...new Set(methods)]).toEqual(["POST"]);
  });

  it("classifies each as TENANT_MEMBER via the registered token", () => {
    for (const apiPath of VOICE_PATHS) {
      const handler = inventory.find((r) => r.apiPath === apiPath && r.method === "POST");
      expect(handler?.classification, apiPath).toBe("TENANT_MEMBER");
      expect(handler?.authEvidence, apiPath).toContain("requireVoiceCopilotActor");
      // NOT waved through by a public/health/webhook declaration.
      expect(handler?.declaredSurface, apiPath).toBe(false);
    }
  });

  it("none of them is declared a PUBLIC surface", () => {
    const declared = (PUBLIC_SURFACE as { path: string }[]).map((e) => e.path);
    for (const apiPath of VOICE_PATHS) expect(declared).not.toContain(apiPath);
  });

  it("none of them mutates persistent state", () => {
    for (const apiPath of VOICE_PATHS) {
      const handler = inventory.find((r) => r.apiPath === apiPath && r.method === "POST");
      expect(handler?.mutates, apiPath).toBe(false);
    }
  });

  it("MUTATION: without the token the classifier falls back to UNKNOWN", () => {
    // Proves the recognition is doing the work, rather than the routes passing
    // for some unrelated reason. Re-runs the classifier's own scope logic with
    // the Phase 103 token removed from the vocabulary.
    const withoutVoice = (GUARD_TOKENS as { token: string; scope: string }[]).filter(
      (g) => g.token !== "requireVoiceCopilotActor",
    );
    const body = live("src/app/api/copilot/voice/query/route.ts");
    const stillMatches = withoutVoice.filter((g) => new RegExp(`\\b${g.token}\\s*\\(`).test(body));
    expect(stillMatches.map((g) => g.token)).toEqual([]);
  });
});

/* ── 3. The helper performs what the registration vouches for ────────────── */

describe("requireVoiceCopilotActor keeps the predicates its registration claims", () => {
  const guard = live(GUARD_MODULE);

  it("resolves the organisation on the SERVER and proves membership of it", () => {
    expect(guard).toContain("await requirePlatformAuth(req)");
    expect(guard).toContain("await requireOrgActor(req, ctx.orgId)");
    // The organisation used downstream comes from the MEMBERSHIP record, never
    // from the request body or a header.
    expect(guard).toContain("const organizationId = member.ctx.orgId");
    expect(guard).toContain("const userId = member.ctx.userId");
  });

  it("enforces a permission predicate against that organisation's role", () => {
    expect(guard).toContain("requirePermission(member.ctx.role, VOICE_PERMISSION)");
    expect(guard).toContain('const VOICE_PERMISSION = "view_copilot"');
  });

  it("returns an ACTOR only on the success path", () => {
    // Exactly ONE success RETURN in the whole module. (The type union's own
    // `ok: true` is a declaration, not an exit, so the match is anchored on
    // `return` — a second early success would mean a path that skips checks.)
    const successReturns = guard.match(/return\s*\{\s*ok:\s*true/g) ?? [];
    expect(successReturns).toHaveLength(1);
    expect(guard).toContain("return { ok: true, actor: { organizationId, userId, role: member.ctx.role } };");
    // And it is the LAST statement: everything before it is a check.
    const lastReturn = guard.lastIndexOf("return {");
    expect(guard.indexOf("return { ok: true")).toBe(lastReturn);
  });

  it("reads no identity field out of the request", () => {
    for (const forbidden of ["body.organizationId", "body.userId", "searchParams", "req.json()"]) {
      expect(guard, forbidden).not.toContain(forbidden);
    }
  });
});

/* ── 4. The whole-tree tenant analysis stays clean ───────────────────────── */

describe("adding the voice surface leaves the tenant analysis at zero violations", () => {
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

  it("includes the three voice handlers, each carrying a server-derived scope", () => {
    for (const apiPath of VOICE_PATHS) {
      const result = analysis.results.find((r) => r.apiPath === apiPath && r.method === "POST");
      expect(result, apiPath).toBeDefined();
      expect(result?.objectScoped, apiPath).toBe(true);
      // The handler names the organisation itself — no allowlist entry and no
      // delegated-guard recognition is needed for these three.
      expect(result?.referencesServerScope, apiPath).toBe(true);
    }
  });

  it("does not shrink the analysed population to make the numbers work", () => {
    // Phase 102 pinned the floor at 249 tenant-bound handlers; Phase 103 adds
    // three, so the population may only grow.
    expect(analysis.coverage.TENANT_BOUND_HANDLERS_TOTAL).toBeGreaterThanOrEqual(252);
    expect(analysis.coverage.OBJECT_SCOPE_COVERAGE_PERCENT).toBe(100);
    expect(analysis.coverage.TENANT_IDENTITY_COVERAGE_PERCENT).toBe(100);
  });
});
