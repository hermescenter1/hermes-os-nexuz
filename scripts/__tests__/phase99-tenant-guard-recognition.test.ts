/**
 * PHASE 102 — tenant-scope recognition for the media byte-serving and write
 * surfaces, and the mutation matrix that keeps that recognition honest.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The Phase 99 tenant analyser demands a scope identifier INSIDE each handler
 * body. The Phase 102 byte-serving routes (`poster`, `stream`) deliberately
 * carry none: their whole tenant boundary lives in ONE canonical helper,
 * `authorizeByteServing`, which validates the id, resolves the owning
 * organization server-side, applies `{ id, organizationId }` inside the
 * database query and refuses with a uniform 404 before storage is touched.
 * The analyser was taught to recognise exactly that delegation — structurally,
 * not lexically — and this suite is the lock on both sides of the bargain:
 *
 *   1. the two routes ARE recognised as tenant-scoped on the real tree;
 *   2. every trick that could satisfy the recogniser without providing the
 *      guarantee — a name in a comment, a string, an alias, a shadow, dead or
 *      nested code, a missing refusal branch — is proven NOT to satisfy it;
 *   3. the helper's own source keeps the predicates that make the delegation
 *      true, so deleting the organization binding fails HERE even before the
 *      behavioural matrix in
 *      src/app/api/media/binary/__tests__/byte-serving-auth-contract.test.ts
 *      catches it at runtime;
 *   4. the media write routes' site-reference authorization
 *      (`referenceBelongsToOrg`) keeps its `{ id, organizationId }` predicate
 *      and stays recognised as site-filter evidence.
 *
 * Everything here runs against the REAL repository or REAL analyser functions
 * with synthetic inputs — there is no fixture that could go green on its own.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DELEGATED_SCOPE_GUARDS,
  analyzeTenantPredicates,
  delegatesScopeToCanonicalGuard,
  siteFilterAuthorised,
  stripStringLiterals,
} from "../security/phase99/tenant-predicates.mjs";
import { stripComments } from "../security/phase99/route-inventory.mjs";

const REPO = process.cwd();

const POSTER_ROUTE = "src/app/api/media/assets/[id]/poster/route.ts";
const STREAM_ROUTE = "src/app/api/media/assets/[id]/stream/route.ts";
const SUBTITLE_ROUTE = "src/app/api/media/assets/[id]/subtitles/[trackId]/route.ts";
const GUARD_MODULE = "src/lib/media/byte-serving-auth.ts";
const MEDIA_DB = "src/lib/media/db.ts";
const CONTRACT_SUITE = "src/app/api/media/binary/__tests__/byte-serving-auth-contract.test.ts";

const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");
const live = (rel: string) => stripComments(read(rel));

// ── 1. The real tree is recognised ───────────────────────────────────────────

describe("tenant analysis over the real repository", () => {
  const analysis = analyzeTenantPredicates();

  it("has zero violations on every dimension", () => {
    expect(analysis.idorViolations).toEqual([]);
    expect(analysis.siteViolations).toEqual([]);
    expect(analysis.identityViolations).toEqual([]);
    expect(analysis.roleViolations).toEqual([]);
    expect(analysis.staleReviews).toEqual([]);
    expect(analysis.ok).toBe(true);
  });

  it("keeps full coverage without shrinking the denominator", () => {
    const c = analysis.coverage;
    // The fix must never be "analyse fewer handlers": the population this
    // analyser saw when the media surfaces were flagged was 249, and it may
    // only grow.
    expect(c.TENANT_BOUND_HANDLERS_TOTAL).toBeGreaterThanOrEqual(249);
    expect(c.TENANT_BOUND_HANDLERS_ANALYSED).toBe(c.TENANT_BOUND_HANDLERS_TOTAL);
    expect(c.OBJECT_SCOPE_COVERAGE_PERCENT).toBe(100);
    expect(c.UNSCOPED_OBJECT_REFERENCE_HANDLERS).toBe(0);
    expect(c.TENANT_IDENTITY_COVERAGE_PERCENT).toBe(100);
  });

  it("recognises poster and stream as tenant-scoped THROUGH the canonical guard, not via an allowlist", () => {
    for (const apiPath of ["/api/media/assets/[id]/poster", "/api/media/assets/[id]/stream"]) {
      const r = analysis.results.find((x: { apiPath: string; method: string }) => x.apiPath === apiPath && x.method === "GET");
      if (!r) throw new Error(`handler missing from tenant analysis: GET ${apiPath}`);
      expect(r.objectScoped, apiPath).toBe(true);
      expect(r.delegatedScopeGuard, apiPath).toBe("authorizeByteServing");
      // Recognition came from the recogniser — these handlers still carry no
      // lexical scope token of their own, so if the recogniser regresses this
      // flips back to a violation rather than being silently absorbed.
      expect(r.referencesServerScope, apiPath).toBe(false);
    }
  });

  it("subtitles rides the same chain and stays scoped", () => {
    const r = analysis.results.find(
      (x: { apiPath: string; method: string }) =>
        x.apiPath === "/api/media/assets/[id]/subtitles/[trackId]" && x.method === "GET",
    );
    if (!r) throw new Error("subtitle handler missing from tenant analysis");
    expect(r.objectScoped).toBe(true);
  });

  it("the media write routes' site references are authorised by referenceBelongsToOrg", () => {
    for (const [apiPath, method] of [
      ["/api/media/assets", "POST"],
      ["/api/media/assets/[id]", "PATCH"],
    ] as const) {
      const r = analysis.results.find((x: { apiPath: string; method: string }) => x.apiPath === apiPath && x.method === method);
      if (!r) throw new Error(`handler missing from tenant analysis: ${method} ${apiPath}`);
      expect(r.siteFilter.reads, `${method} ${apiPath}`).toBe(true);
      expect(r.siteFilter.authorised, `${method} ${apiPath}`).toBe(true);
      expect(r.siteFilter.evidence, `${method} ${apiPath}`).toContain("referenceBelongsToOrg(");
    }
  });
});

// ── 2. The guard registry cannot rot ─────────────────────────────────────────

describe("DELEGATED_SCOPE_GUARDS registry", () => {
  it("contains exactly the byte-serving guard, fully described", () => {
    expect(DELEGATED_SCOPE_GUARDS).toHaveLength(1);
    const [guard] = DELEGATED_SCOPE_GUARDS;
    expect(guard.helper).toBe("authorizeByteServing");
    expect(guard.importPath).toBe("@/lib/media/byte-serving-auth");
    // The registry is a security statement, not a mute button: an entry must
    // explain the mechanism it vouches for.
    expect(guard.mechanism.length).toBeGreaterThanOrEqual(80);
    expect(guard.mechanism).toContain("organizationId");
  });

  it("every registered guard resolves to a real exported helper with a behavioural contract suite", () => {
    for (const guard of DELEGATED_SCOPE_GUARDS) {
      const modulePath = `${guard.importPath.replace("@/", "src/")}.ts`;
      expect(existsSync(join(REPO, modulePath)), modulePath).toBe(true);
      expect(live(modulePath)).toMatch(
        new RegExp(`export\\s+async\\s+function\\s+${guard.helper}\\b`),
      );
    }
    // The runtime lock: the contract matrix drives cross-tenant, quarantine,
    // permission and anonymity cases through every surface that delegates.
    expect(existsSync(join(REPO, CONTRACT_SUITE))).toBe(true);
    const contract = read(CONTRACT_SUITE);
    expect(contract).toContain("authorizeByteServing");
    expect(contract).toContain("cross-tenant");
  });
});

// ── 3. The recogniser's mutation matrix ──────────────────────────────────────

describe("delegatesScopeToCanonicalGuard — mutation matrix", () => {
  const IMPORT = 'import { authorizeByteServing, byteServingRefusalResponse } from "@/lib/media/byte-serving-auth";';

  /** The canonical accepted shape, mirroring the real poster/stream handlers. */
  const HANDLER = [
    "export async function GET(",
    "  req: NextRequest,",
    "  { params }: { params: Promise<{ id: string }> },",
    "): Promise<NextResponse> {",
    "  const { id: rawId } = await params;",
    "  const gate = await authorizeByteServing({ req, assetId: rawId });",
    "  if (!gate.ok) return byteServingRefusalResponse(gate);",
    "  return serve(gate.asset);",
    "}",
  ].join("\n");

  const recognise = (handler: string, moduleExtra = "", importLine = IMPORT) =>
    delegatesScopeToCanonicalGuard(
      stripComments(handler),
      stripComments(`${importLine}\n${moduleExtra}\n${handler}\n`),
    );

  it("accepts the canonical shape", () => {
    expect(recognise(HANDLER)).toBe("authorizeByteServing");
  });

  it("a helper name in a comment proves nothing", () => {
    const handler = HANDLER.replace(
      "  const gate = await authorizeByteServing({ req, assetId: rawId });",
      "  // const gate = await authorizeByteServing({ req, assetId: rawId });\n  const gate = { ok: true } as const;",
    );
    expect(recognise(handler)).toBeNull();
  });

  it("a helper name in a string or template literal proves nothing", () => {
    for (const decoy of [
      '  const note = "const gate = await authorizeByteServing(x); if (!gate.ok) return no(gate);";',
      "  const note = `const gate = await authorizeByteServing(x); if (!gate.ok) return no(gate);`;",
    ]) {
      const handler = HANDLER.replace(
        "  const gate = await authorizeByteServing({ req, assetId: rawId });",
        `${decoy}\n  const gate = { ok: true } as const;`,
      );
      expect(recognise(handler), decoy).toBeNull();
    }
  });

  it("calling the guard but not returning on its refusal proves nothing", () => {
    const handler = HANDLER.replace(
      "  if (!gate.ok) return byteServingRefusalResponse(gate);",
      "  if (!gate.ok) console.warn(gate);",
    );
    expect(recognise(handler)).toBeNull();
  });

  it("a call without the real import proves nothing", () => {
    expect(recognise(HANDLER, "", "")).toBeNull();
    expect(
      recognise(HANDLER, "", 'import { authorizeByteServing } from "./my-local-fake";'),
    ).toBeNull();
  });

  it("a type-only or aliased import proves nothing", () => {
    expect(
      recognise(HANDLER, "", 'import { type authorizeByteServing } from "@/lib/media/byte-serving-auth";'),
    ).toBeNull();
    expect(
      recognise(
        HANDLER,
        "",
        'import { authorizeByteServing as realGuard } from "@/lib/media/byte-serving-auth";',
      ),
    ).toBeNull();
  });

  it("a local shadow of the guard name proves nothing", () => {
    expect(
      recognise(HANDLER, "const authorizeByteServing = async () => ({ ok: true });"),
    ).toBeNull();
    expect(
      recognise(HANDLER, "async function authorizeByteServing() { return { ok: true }; }"),
    ).toBeNull();
  });

  it("a call parked in nested or unreachable code proves nothing", () => {
    // Nested inside a conditional that may never run.
    const nested = HANDLER.replace(
      "  const gate = await authorizeByteServing({ req, assetId: rawId });\n  if (!gate.ok) return byteServingRefusalResponse(gate);",
      "  if (false) {\n    const gate = await authorizeByteServing({ req, assetId: rawId });\n    if (!gate.ok) return byteServingRefusalResponse(gate);\n  }",
    );
    expect(recognise(nested)).toBeNull();

    // Dead code after an unconditional top-level return.
    const dead = HANDLER.replace(
      "  const { id: rawId } = await params;",
      "  const { id: rawId } = await params;\n  return serveWithoutAuth(rawId);",
    );
    expect(recognise(dead)).toBeNull();
  });

  it("stripStringLiterals erases content but preserves structure", () => {
    expect(stripStringLiterals('const a = "authorizeByteServing(";')).toBe('const a = "";');
    expect(stripStringLiterals("const b = `x ${y} z`;")).toBe('const b = "";');
    expect(stripStringLiterals("const c = 'ok';")).toBe('const c = "";');
  });
});

// ── 4. The delegation is true: the helper keeps its predicates ───────────────

describe("authorizeByteServing keeps the predicates the recognition vouches for", () => {
  const guard = live(GUARD_MODULE);

  it("resolves membership against the OWNING organization, never the request", () => {
    expect(guard).toContain("requireOrgActor(input.req, organizationId)");
  });

  it("binds every asset read to { organizationId, id } inside the query", () => {
    // Both the anonymous and the member read go through the org-scoped
    // repository call. Deleting the organizationId binding from either call
    // site fails here.
    const orgBoundReads = guard.match(/getMediaAssetById\(\{\s*organizationId,\s*id:\s*assetId,/g) ?? [];
    expect(orgBoundReads.length).toBeGreaterThanOrEqual(2);
  });

  it("the repository predicate itself carries the organization", () => {
    const db = live(MEDIA_DB);
    expect(db).toContain("where: { organizationId: params.organizationId, id: params.id");
  });

  it("authorization runs before storage: the guard module never touches the filesystem or storage layer", () => {
    // The specifiers are matched WITH their closing quote. `@/lib/media/storage`
    // as a bare substring also matches `@/lib/media/storage-key`, which is pure
    // string algebra over a key's own segments and imports no I/O at all — the
    // module exists precisely so this chain can answer a tenancy question
    // without pulling in a filesystem. Matching loosely would forbid the thing
    // that keeps the invariant true.
    for (const forbidden of [
      'from "node:fs"',
      'from "fs"',
      'from "@/lib/media/storage"',
      'from "./storage"',
      "openMediaObject",
      "createReadStream",
    ]) {
      expect(guard, forbidden).not.toContain(forbidden);
    }
  });

  it("the storage-key module it DOES import pulls in no I/O of its own", () => {
    // Guards the exemption above: if `storage-key` ever grew a filesystem or
    // object-storage import, the guard module would reach storage transitively
    // and the invariant would be false while still reading as true.
    const keyModule = live("src/lib/media/storage-key.ts");
    for (const forbidden of [
      'from "node:fs"',
      'from "fs"',
      'from "crypto"',
      '"@/lib/documents/config"',
      '"@/lib/documents/object-storage"',
      './secure-read"',
      './storage"',
    ]) {
      expect(keyModule, forbidden).not.toContain(forbidden);
    }
    // And it really is what the guard uses for the tenancy decision.
    expect(guard).toContain('from "@/lib/media/storage-key"');
    expect(guard).toContain("isStorageKeyBoundTo");
  });

  it("both byte-serving handlers await the guard before any storage call", () => {
    for (const rel of [POSTER_ROUTE, STREAM_ROUTE]) {
      const src = live(rel);
      const gateIndex = src.indexOf("await authorizeByteServing(");
      const storageIndex = src.indexOf("openMediaObject(");
      expect(gateIndex, rel).toBeGreaterThan(-1);
      expect(storageIndex, rel).toBeGreaterThan(-1);
      expect(gateIndex, `${rel}: authorization must precede storage`).toBeLessThan(storageIndex);
    }
  });

  it("all three surfaces share the identical policy imports", () => {
    for (const rel of [POSTER_ROUTE, STREAM_ROUTE, SUBTITLE_ROUTE]) {
      const src = live(rel);
      expect(src, rel).toContain('from "@/lib/media/byte-serving-auth"');
      expect(src, rel).toContain("authorizeByteServing(");
      expect(src, rel).toContain("byteServingRefusalResponse(");
    }
  });
});

// ── 5. The site-reference authorization stays real ───────────────────────────

describe("referenceBelongsToOrg keeps its organization predicate", () => {
  const WRITE_ROUTES = ["src/app/api/media/assets/route.ts", "src/app/api/media/assets/[id]/route.ts"];

  it("both write routes bind the reference lookup to { id, organizationId }", () => {
    for (const rel of WRITE_ROUTES) {
      const src = live(rel);
      expect(src, rel).toContain("findFirst({ where: { id, organizationId } })");
      // And the handler actually consults it for the industrial site.
      expect(src, rel).toContain('"industrialSite"');
      expect(src, rel).toContain("referenceBelongsToOrg(");
    }
  });

  it("a site filter without evidence still fails the analyser", () => {
    expect(siteFilterAuthorised("const s = input.siteId; await save(s);")).toMatchObject({
      reads: true,
      authorised: false,
    });
    expect(
      siteFilterAuthorised(
        "const s = input.siteId; if (!(await referenceBelongsToOrg(db, m, s, organizationId))) return no();",
      ),
    ).toMatchObject({ reads: true, authorised: true });
  });
});
