/**
 * PHASE 102 / RELEASE BLOCKERS 3 and 9 — the cross-site gate and the existence
 * oracle on the two multipart upload surfaces.
 *
 * BLOCKER 9 — THE ORACLE
 * `POST …/upload` and `POST …/subtitles` both resolved the OWNING organization
 * with an un-scoped `findUnique({ where: { id } })` BEFORE any authentication,
 * then mapped `requireOrgActor`'s 401 straight through. So, with no credentials
 * at all:
 *
 *     id exists in ANY tenant  → 401 authentication_required
 *     id exists nowhere        → 404 not_found
 *
 * — a clean, cross-tenant enumeration oracle for every `MediaAsset` id in the
 * product. The byte-serving chain had already closed exactly this hole and
 * documented it; these two routes were never migrated.
 *
 * The fix is ordering, not obfuscation: authentication runs BEFORE the un-scoped
 * lookup, where its 401 is id-independent, and every refusal decided AFTER the
 * lookup collapses to a single 404.
 *
 * BLOCKER 3 — CSRF
 * Both are cookie-authenticated multipart writes with no origin check. A
 * cross-site page could make an authenticated editor attach bytes or captions to
 * an asset. Cookie/JWT callers must now present an allowed `Origin`; API-key
 * callers are exempt, because no browser attaches a key on a victim's behalf.
 *
 * These assertions read the REAL handlers. Only the database, the object store,
 * the limiter, the entitlement resolver, the audit sink and the two auth
 * resolvers are doubled — `isAllowedOrigin` and the ordering under test are real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ASSET_ID,
  ALLOWED_ORIGIN,
  FOREIGN_ORIGIN,
  LOOKALIKE_ORIGIN,
  ORG_A,
  ORG_B,
  VALID_WEBVTT,
  buildAsset,
  emptyStore,
  mp4Bytes,
  multipartRequest,
  multipartUrl,
  routeParams,
  type FakeStore,
} from "./harness";

const h = vi.hoisted(() => ({
  store: { assets: [], subtitles: [] } as FakeStore,
  session: null as null | { userId: string; orgId: string; role: string },
  authMethod: "jwt" as "jwt" | "apikey",
  puts: [] as string[],
  audit: [] as Array<Record<string, unknown>>,
  /** One entry per `getPrisma()` handed out; each is that client's query log. */
  queries: [] as Array<Array<Record<string, unknown>>>,
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => {
    const { createFakePrisma } = await import("./harness");
    const client = createFakePrisma(h.store);
    // Every query this request makes is recorded on the SHARED log, so a test
    // can assert that the un-scoped owner lookup did not run at all — not
    // merely that nothing was written afterwards.
    h.queries.push(client.calls);
    return client;
  },
}));

vi.mock("@/lib/api/auth", () => ({
  requirePlatformAuth: async () =>
    h.session
      ? { ctx: { userId: h.session.userId, orgId: h.session.orgId, authMethod: h.authMethod, scopes: [] } }
      : { error: "Authentication required", status: 401 },
}));

vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async (_req: unknown, orgId: string) => {
    if (!h.session) return { error: "Authentication required", status: 401 };
    if (h.session.orgId !== orgId) return { error: "Not a member", status: 403 };
    return {
      ctx: { userId: h.session.userId, orgId, memberId: "member-1", role: h.session.role, status: "ACTIVE" },
    };
  },
}));

vi.mock("@/lib/auth/rate-limiter", () => ({
  checkRateLimit: async () => true,
  retryAfter: () => 42,
}));

vi.mock("@/lib/billing-governance/runtime/require-entitlement", () => ({
  enforceEntitlement: async () => ({ ok: true, decision: { allowed: true } }),
}));

vi.mock("@/lib/audit/audit-service", () => ({
  recordAuditEvent: async (event: Record<string, unknown>) => {
    h.audit.push(event);
  },
}));

vi.mock("@/lib/media/storage", async (importOriginal) => {
  const actual: typeof import("@/lib/media/storage") =
    await importOriginal<typeof import("@/lib/media/storage")>();
  return {
    ...actual,
    putMediaObject: async (args: { key: string; body: Buffer; contentType: string }) => {
      actual.assertMediaStorageKey(args.key);
      h.puts.push(args.key);
      return { key: args.key, sizeBytes: args.body.byteLength };
    },
    deleteMediaObject: async () => {},
  };
});

/** An id that is a legal shape but names no row anywhere. */
const ABSENT_ID = "asset000000000000000404";
/** A legal id owned by a DIFFERENT tenant than the caller. */
const FOREIGN_ID = "asset000000000000000002";

beforeEach(() => {
  h.store = emptyStore();
  h.store.assets.push(buildAsset({ processingState: "PENDING_UPLOAD" }));
  h.store.assets.push(buildAsset({ id: FOREIGN_ID, organizationId: ORG_B, processingState: "PENDING_UPLOAD" }));
  h.session = { userId: "user-1", orgId: ORG_A, role: "ENGINEER" };
  h.authMethod = "jwt";
  h.puts = [];
  h.audit = [];
  h.queries = [];
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ── Request builders ────────────────────────────────────────────────────── */

function videoForm(): FormData {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(mp4Bytes(64))], "lesson.mp4", { type: "video/mp4" }));
  return form;
}

function subtitleForm(): FormData {
  const form = new FormData();
  form.append("file", new File([VALID_WEBVTT], "captions.vtt", { type: "text/vtt" }));
  form.append("locale", "en");
  return form;
}

type Surface = {
  readonly name: string;
  readonly segment: string;
  readonly form: () => FormData;
  readonly handler: () => Promise<(req: never, ctx: never) => Promise<Response>>;
};

const SURFACES: readonly Surface[] = [
  {
    name: "POST …/upload",
    segment: "upload",
    form: videoForm,
    handler: async () => (await import("../../assets/[id]/upload/route")).POST as never,
  },
  {
    name: "POST …/subtitles",
    segment: "subtitles",
    form: subtitleForm,
    handler: async () => (await import("../../assets/[id]/subtitles/route")).POST as never,
  },
];

async function call(
  surface: Surface,
  assetId: string,
  options: { origin?: string | null; realIp?: string } = {},
): Promise<Response> {
  const post = await surface.handler();
  const req = multipartRequest(multipartUrl(assetId, surface.segment), surface.form(), {
    realIp: options.realIp ?? "10.0.0.1",
    origin: options.origin,
  });
  return post(req as never, routeParams(assetId) as never);
}

/** Status + body, so two refusals can be compared as whole responses. */
async function shapeOf(res: Response): Promise<string> {
  const body = await res.text();
  return `${res.status}|${body}`;
}

/* ═════════════════════ BLOCKER 9 — the existence oracle ═════════════════════ */

for (const surface of SURFACES) {
  describe(`${surface.name} — an anonymous caller learns nothing about which ids exist`, () => {
    it("answers identically for an existing id, an absent id and another tenant's id", async () => {
      h.session = null;

      const shapes = await Promise.all([
        call(surface, ASSET_ID).then(shapeOf),
        call(surface, ABSENT_ID).then(shapeOf),
        call(surface, FOREIGN_ID).then(shapeOf),
      ]);

      // Before the fix this was ["401|…", "404|…", "401|…"] — an oracle.
      expect(new Set(shapes).size).toBe(1);
      expect(shapes[0].startsWith("401|")).toBe(true);
    });

    it("runs NO query at all for an anonymous request — the ordering IS the fix", async () => {
      h.session = null;
      await call(surface, ASSET_ID);

      // The un-scoped owner lookup must not run for a caller with no session.
      // Asserting on the query log rather than on the absence of writes is the
      // difference between proving the ordering and merely observing its effect.
      const issued = h.queries.flat();
      expect(issued).toEqual([]);
      expect(h.puts).toEqual([]);
      expect(h.audit).toEqual([]);
    });

    it("DOES query once the caller is authenticated — the log is not vacuous", async () => {
      await call(surface, ASSET_ID);
      const ops = h.queries.flat();
      expect(ops.length).toBeGreaterThan(0);
      expect(ops.some((o) => o.op === "findUnique")).toBe(true);
    });

    it("answers identically for an AUTHENTICATED caller across absent and foreign ids", async () => {
      const shapes = await Promise.all([
        call(surface, ABSENT_ID).then(shapeOf),
        call(surface, FOREIGN_ID).then(shapeOf),
      ]);

      expect(new Set(shapes).size).toBe(1);
      expect(shapes[0].startsWith("404|")).toBe(true);
      expect(h.puts).toEqual([]);
    });

    it("still serves the legitimate caller — the surface is not simply always closed", async () => {
      const res = await call(surface, ASSET_ID);
      expect(res.status).toBe(201);
      expect(h.puts.length).toBe(1);
    });
  });
}

/* ══════════════════════════ BLOCKER 3 — the CSRF gate ═══════════════════════ */

for (const surface of SURFACES) {
  describe(`${surface.name} — cookie-authenticated uploads require an allowed Origin`, () => {
    const REFUSED: ReadonlyArray<readonly [string, string | null]> = [
      ["absent", null],
      ["cross-site", FOREIGN_ORIGIN],
      ["a suffix look-alike", LOOKALIKE_ORIGIN],
      ["the canonical host over plain http", ALLOWED_ORIGIN.replace(/^https:/, "http:")],
      ["not a URL", "null"],
    ];

    for (const [label, origin] of REFUSED) {
      it(`refuses an Origin that is ${label}, storing no bytes`, async () => {
        const res = await call(surface, ASSET_ID, { origin });
        expect(res.status).toBe(403);
        expect(h.puts).toEqual([]);
        expect(h.audit).toEqual([]);
      });
    }

    it("accepts the allowed same-origin value", async () => {
      const res = await call(surface, ASSET_ID, { origin: ALLOWED_ORIGIN });
      expect(res.status).toBe(201);
      expect(h.puts.length).toBe(1);
    });

    it("exempts an API-key caller, which no browser can forge on a victim's behalf", async () => {
      h.authMethod = "apikey";
      const res = await call(surface, ASSET_ID, { origin: null });
      // The key holder still has to pass membership and RBAC below; this asserts
      // only that the ORIGIN gate did not refuse them.
      expect(res.status).not.toBe(403);
    });

    it("refuses a cross-site Origin identically across existing, absent and foreign ids", async () => {
      const shapes = await Promise.all([
        call(surface, ASSET_ID, { origin: FOREIGN_ORIGIN }).then(shapeOf),
        call(surface, ABSENT_ID, { origin: FOREIGN_ORIGIN }).then(shapeOf),
        call(surface, FOREIGN_ID, { origin: FOREIGN_ORIGIN }).then(shapeOf),
      ]);
      expect(new Set(shapes).size).toBe(1);
    });
  });
}
