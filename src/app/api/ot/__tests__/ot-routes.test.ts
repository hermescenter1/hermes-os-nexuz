import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * PHASE 94B4 — HTTP behaviour of the OT / engineering API.
 *
 * Services are injected doubles here ON PURPOSE: the subject is the HTTP layer
 * — gates, status mapping, headers, body bounds — and the services already have
 * their own PostgreSQL-backed suite. Mocking them keeps each failure
 * attributable to the layer under test.
 */

const h = vi.hoisted(() => ({
  /** What requireOrgContext resolves to. null = unauthenticated. */
  org: null as null | { userId: string; orgId: string; role: string },
  /** requireOrgActor outcome. */
  actorError: null as null | { error: string; status: number },
  siteIds: [] as string[],
  rateLimited: false,
  /** Buckets that were consulted, in order — the machine route uses two. */
  buckets: [] as string[],
  /** PHASE 94B4.1 — the gateway rows the global auth lookup can resolve. */
  gateways: {} as Record<string, Record<string, unknown>>,
  calls: [] as Array<{ service: string; args: unknown[] }>,
}));

vi.mock("@/lib/billing/context", () => ({
  requireOrgContext: async () =>
    h.org ? { ctx: h.org } : { error: "Authentication required", status: 401 },
}));

vi.mock("@/lib/org/context", () => ({
  requireOrgActor: async () =>
    h.actorError ? h.actorError : { ctx: { ...h.org, memberId: "m-1", status: "ACTIVE" } },
}));

vi.mock("@/lib/site/context", () => ({ getAllowedSiteIds: async () => h.siteIds }));

vi.mock("@/lib/auth/rate-limiter", () => ({
  checkRateLimit: async (action: string) => {
    h.buckets.push(action);
    return !h.rateLimited;
  },
  limitWindowSeconds: () => 60,
}));

/** Service doubles. Every call is recorded so "called once" is provable. */
const record = (service: string) => (...args: unknown[]) => {
  h.calls.push({ service, args });
  return Promise.resolve({ ok: true, value: RESULT[service] });
};

const RESULT: Record<string, unknown> = {
  "imports.execute": { import: { id: "imp-1", status: "APPLIED" }, project: { id: "p-1" }, duplicate: false, findingCount: 2 },
  "analysis.run": { projectId: "p-1", ruleVersion: "1.0", ruleCount: 20, created: 1, updated: 0, superseded: 0, severity: {}, findings: [] },
  "findings.transitionFinding": { finding: { id: "f-1", state: "ACKNOWLEDGED" }, applied: true, previousState: "OPEN" },
  "gateway.ingest": { accepted: true, payloadType: "PROJECT_METADATA", receivedAt: "2026-01-01T00:00:00.000Z" },
};

const page = (items: unknown[]) => ({ ok: true, value: { items, total: items.length, take: 50, skip: 0 } });

vi.mock("@/lib/ot-edge/http/composition", () => ({
  __setOtServicesForTests: () => {},
  resolveOtServices: async () => ({
    repos: {
      gateways: {
        // PHASE 94B.1 — the call is recorded so "the filter reached the
        // repository" and "an invalid filter never did" are both provable.
        listVisible: async (...args: unknown[]) => {
          h.calls.push({ service: "gateways.listVisible", args });
          return page([{ id: "g-1", gatewayId: "GW1", signingKeyRef: "env:OT_GATEWAY_HMAC_PRIMARY" }]);
        },
        findVisibleById: async (_c: unknown, id: string) =>
          id === "g-1"
            ? { ok: true, value: { id: "g-1", gatewayId: "GW1", signingKeyRef: "env:OT_GATEWAY_HMAC_PRIMARY" } }
            : { ok: false, code: "NOT_FOUND" },
        createProfile: async () => ({ ok: true, value: { id: "g-2", gatewayId: "GW2" } }),
        updateProfile: async () => ({ ok: true, value: { id: "g-1", gatewayId: "GW1" } }),
        updateLifecycle: async () => ({ ok: true, value: { id: "g-1", gatewayId: "GW1", lifecycle: "DISABLED" } }),
      },
      devices: {
        listVisible: async (...args: unknown[]) => {
          h.calls.push({ service: "devices.listVisible", args });
          return page([{ id: "d-1", assetId: "a-1" }]);
        },
        findVisibleById: async (_c: unknown, id: string) =>
          id === "d-1" ? { ok: true, value: { id: "d-1", assetId: "a-1" } } : { ok: false, code: "NOT_FOUND" },
        createProfile: async () => ({ ok: true, value: { id: "d-2", assetId: "a-2" } }),
        updateProfile: async () => ({ ok: true, value: { id: "d-1", assetId: "a-1" } }),
      },
      projects: {
        listVisible: async () => page([{ id: "p-1", name: "Line" }]),
        findVisibleById: async (_c: unknown, id: string) =>
          id === "p-1" ? { ok: true, value: { id: "p-1", name: "Line" } } : { ok: false, code: "NOT_FOUND" },
        listTags: async () => page([{ id: "t-1", name: "T" }]),
        listAlarms: async () => page([{ id: "al-1", code: "A1" }]),
        listNetworkNodes: async () => page([{ id: "n-1", nodeName: "N" }]),
      },
      findings: { listVisible: async () => page([{ id: "f-1", ruleId: "R1" }]) },
      imports: {
        findById: async (_c: unknown, id: string) =>
          id === "imp-1"
            ? { ok: true, value: { id: "imp-1", status: "APPLIED", idempotencyKey: "SECRET-KEY-VALUE" } }
            : { ok: false, code: "NOT_FOUND" },
      },
      nonces: {},
    },
    imports: { execute: record("imports.execute") },
    analysis: { run: record("analysis.run") },
    findings: { transitionFinding: record("findings.transitionFinding") },
    gateway: {
      ingest: record("gateway.ingest"),
      // Recorded like any other call so "a rejection is audited" is provable.
      rejected: (...args: unknown[]) => {
        h.calls.push({ service: "gateway.rejected", args });
        return Promise.resolve();
      },
    },
    // PHASE 94B4.1 — the real credential check runs; only the ROW lookup is a
    // double. Signature verification, ordering and tenant derivation are the
    // production code paths.
    machineAuth: {
      lookup: async (ingestionId: string) => h.gateways[ingestionId] ?? null,
      secrets: { resolve: (ref: string) => (ref === TEST_KEY_REF ? TEST_SECRET : null) },
      simulatorAllowed: false,
    },
  }),
}));

/** Signing material used only by this suite; never a real reference. */
const TEST_KEY_REF = "env:OT_GATEWAY_HMAC_PRIMARY";
const TEST_SECRET = "route-suite-secret-0123456789abcdef";

const ORG = { userId: "u-1", orgId: "org-1", role: "ADMIN" };

beforeEach(() => {
  h.org = { ...ORG };
  h.actorError = null;
  h.siteIds = ["site-1"];
  h.rateLimited = false;
  h.buckets = [];
  h.calls = [];
  h.gateways = {};
  vi.resetModules();
});

const url = (p: string) => `http://t/api${p}`;
const get = (p: string) => new NextRequest(url(p));
const send = (p: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url(p), {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

/**
 * Every route module, so shared guarantees can be asserted across all of them.
 *
 * Collection and single-resource handlers have different arities, so they are
 * normalised to one signature here; without it TypeScript narrows the union to
 * `never` and the call site stops type-checking at all.
 */
type RouteHandler = (
  req: NextRequest,
  ctx?: { params: Promise<{ id: string }> },
) => Promise<Response>;

interface RouteCase {
  label: string;
  handler: RouteHandler;
  req: NextRequest;
  ctx?: { params: Promise<{ id: string }> };
}

async function allGetRoutes(): Promise<RouteCase[]> {
  const asHandler = (h: unknown) => h as RouteHandler;
  return [
    { label: "GET /ot/gateways", handler: asHandler((await import("../gateways/route")).GET), req: get("/ot/gateways") },
    { label: "GET /ot/devices", handler: asHandler((await import("../devices/route")).GET), req: get("/ot/devices") },
    { label: "GET /ot/gateways/[id]", handler: asHandler((await import("../gateways/[id]/route")).GET), req: get("/ot/gateways/g-1"), ctx: params("g-1") },
    { label: "GET /ot/devices/[id]", handler: asHandler((await import("../devices/[id]/route")).GET), req: get("/ot/devices/d-1"), ctx: params("d-1") },
  ];
}

describe("94B4 — authentication and authorization gates", () => {
  it("an anonymous request is 401 on every route", async () => {
    h.org = null;
    for (const { label, handler, req, ctx } of await allGetRoutes()) {
      const res = await handler(req, ctx);
      expect(res.status, label).toBe(401);
      expect((await res.json()).code).toBe("UNAUTHENTICATED");
    }
  });

  it("a suspended membership is refused even with a valid session", async () => {
    h.actorError = { error: "Your membership is suspended", status: 403 };
    const { GET } = await import("../gateways/route");
    const res = await GET(get("/ot/gateways"));
    expect(res.status).toBe(403);
  });

  it("a VIEWER may read gateways but may not create one", async () => {
    h.org = { ...ORG, role: "VIEWER" };
    const mod = await import("../gateways/route");
    expect((await mod.GET(get("/ot/gateways"))).status).toBe(200);

    const denied = await mod.POST(send("/ot/gateways", "POST", { gatewayId: "GW9" }));
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("FORBIDDEN");
  });

  it("an ENGINEER may import and analyse but may not review a finding", async () => {
    h.org = { ...ORG, role: "ENGINEER" };
    const imports = await import("../../engineering/imports/route");
    const ok = await imports.POST(
      send("/engineering/imports", "POST", { schemaVersion: "1.0" }, { "idempotency-key": "abcdefgh-1234" }),
    );
    expect(ok.status).toBe(201);

    const findings = await import("../../engineering/findings/[id]/route");
    const denied = await findings.PATCH(send("/engineering/findings/f-1", "PATCH", { state: "ACCEPTED" }), params("f-1"));
    expect(denied.status).toBe(403);
  });

  it("a rate-limited request is 429 with Retry-After and no tenant data", async () => {
    h.rateLimited = true;
    const { GET } = await import("../gateways/route");
    const res = await GET(get("/ot/gateways"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("org-1");
    expect(body).not.toMatch(/count|remaining|\d+ of \d+/i);
  });
});

describe("94B4 — every response is private", () => {
  it("success responses carry no-store", async () => {
    for (const { label, handler, req, ctx } of await allGetRoutes()) {
      const res = await handler(req, ctx);
      expect(res.headers.get("Cache-Control"), label).toBe("no-store, max-age=0");
    }
  });

  it("error responses carry no-store too", async () => {
    h.org = null;
    const { GET } = await import("../gateways/route");
    const res = await GET(get("/ot/gateways"));
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });

  it("no tenant identifier appears in a response header", async () => {
    const { GET } = await import("../gateways/route");
    const res = await GET(get("/ot/gateways"));
    const headers = JSON.stringify([...res.headers.entries()]);
    expect(headers).not.toContain("org-1");
    expect(headers).not.toContain("u-1");
  });
});

describe("94B4 — body handling on the import route", () => {
  const KEY = { "idempotency-key": "abcdefgh-1234" };

  it.each(["text/csv", "application/csv", "application/xml", "text/xml"])(
    "%s is refused with 415 and is never parsed",
    async (type) => {
      const { POST } = await import("../../engineering/imports/route");
      const res = await POST(send("/engineering/imports", "POST", "a,b,c", { ...KEY, "content-type": type }));
      expect(res.status).toBe(415);
      expect((await res.json()).code).toBe("UNSUPPORTED_FORMAT");
      expect(h.calls, "the service must never see an unsupported body").toEqual([]);
    },
  );

  it("malformed JSON is 400", async () => {
    const { POST } = await import("../../engineering/imports/route");
    const res = await POST(send("/engineering/imports", "POST", "{not json", KEY));
    expect(res.status).toBe(400);
    expect(h.calls).toEqual([]);
  });

  it("an oversized declared body is 413 before it is read", async () => {
    const { POST } = await import("../../engineering/imports/route");
    const res = await POST(
      send("/engineering/imports", "POST", { a: 1 }, { ...KEY, "content-length": String(5 * 1024 * 1024) }),
    );
    expect(res.status).toBe(413);
    expect(h.calls).toEqual([]);
  });

  it.each(["", "short", "has space!", "x".repeat(200)])(
    "a malformed idempotency key (%s) is refused and never echoed",
    async (key) => {
      const { POST } = await import("../../engineering/imports/route");
      const res = await POST(send("/engineering/imports", "POST", { schemaVersion: "1.0" }, { "idempotency-key": key }));
      expect(res.status).toBe(422);
      const body = await res.text();
      if (key.length > 0) expect(body, "the key must never be echoed").not.toContain(key);
      expect(h.calls).toEqual([]);
    },
  );

  it("a valid request calls the import service exactly once and returns no key", async () => {
    const { POST } = await import("../../engineering/imports/route");
    const res = await POST(send("/engineering/imports", "POST", { schemaVersion: "1.0" }, KEY));
    expect(res.status).toBe(201);
    expect(h.calls.filter((c) => c.service === "imports.execute")).toHaveLength(1);
    expect(await res.text()).not.toContain("abcdefgh-1234");
  });

  it("a client-supplied organizationId cannot reach the service", async () => {
    const { POST } = await import("../../engineering/imports/route");
    await POST(send("/engineering/imports", "POST", { schemaVersion: "1.0", organizationId: "org-EVIL" }, KEY));
    const call = h.calls.find((c) => c.service === "imports.execute");
    // The manifest is forwarded verbatim to the service, which rejects unknown
    // keys — but the CONTEXT the service trusts is built server-side, and the
    // request never supplies it.
    const ctx = call?.args[0] as { organizationId: string };
    expect(ctx.organizationId).toBe("org-1");
  });

  it("the import status DTO never exposes the idempotency key", async () => {
    const { GET } = await import("../../engineering/imports/[id]/route");
    const res = await GET(get("/engineering/imports/imp-1"), params("imp-1"));
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("SECRET-KEY-VALUE");
  });
});

describe("94B4.1 — the gateway envelope route authenticates a MACHINE", () => {
  const GW = "GW-1";
  const HANDLE = "h".repeat(43);
  const PAYLOAD = JSON.stringify({ kind: "PROJECT_METADATA" });

  /** Register a gateway the global lookup can resolve. */
  function provision(over: Record<string, unknown> = {}, handle = HANDLE) {
    h.gateways[handle] = {
      gatewayId: GW,
      ingestionId: handle,
      organizationId: "org-1",
      siteId: "site-1",
      lifecycle: "ACTIVE",
      disabled: false,
      simulatorMode: false,
      capabilities: ["PROJECT_METADATA_IMPORT"],
      signingKeyRef: TEST_KEY_REF,
      ...over,
    };
  }

  async function signed(over: Record<string, unknown> = {}) {
    const { computeSignature } = await import("@/lib/ot-edge/envelope-signature");
    const { createHash } = await import("node:crypto");
    const base = {
      envelopeVersion: "1.0" as const,
      organizationId: "org-1",
      gatewayId: GW,
      timestamp: new Date().toISOString(),
      nonce: `n-${Math.random().toString(36).slice(2)}`.padEnd(20, "x"),
      idempotencyKey: "idem-1",
      payloadType: "PROJECT_METADATA" as const,
      payloadChecksum: createHash("sha256").update(Buffer.from(PAYLOAD, "utf8")).digest("hex"),
      signingKeyRef: TEST_KEY_REF,
      signatureAlgorithm: "HMAC-SHA256" as const,
      ...over,
    };
    const forged = (over as { signature?: string }).signature;
    return { ...base, signature: forged ?? computeSignature(base as never, TEST_SECRET) };
  }

  const post = async (envelope: unknown, headers: Record<string, string> = {}, id = GW) => {
    const { POST } = await import("../gateways/[id]/envelopes/route");
    return POST(
      send(`/ot/gateways/${id}/envelopes`, "POST", { envelope, payload: PAYLOAD }, {
        "x-hermes-ingestion-id": HANDLE,
        ...headers,
      }),
      params(id),
    );
  };

  it("accepts a signed envelope with NO human session at all", async () => {
    // The decisive assertion of this phase: every human gate is absent, and a
    // machine still gets through on its signature alone.
    h.org = null;
    h.actorError = { error: "Forbidden", status: 403 };
    h.siteIds = [];
    provision();

    const res = await post(await signed());
    expect(res.status, await res.text()).toBe(202);
    expect(h.calls.filter((c) => c.service === "gateway.ingest")).toHaveLength(1);
  });

  it("derives tenant and site from the gateway record, not from the envelope", async () => {
    h.org = null;
    provision();
    // The envelope lies about its organization; the record is the authority, so
    // this must not be accepted at all.
    const res = await post(await signed({ organizationId: "org-VICTIM" }));
    expect(res.status).toBe(401);
    expect(h.calls.filter((c) => c.service === "gateway.ingest")).toHaveLength(0);

    // And for a truthful envelope, the context handed to the service carries
    // the record's values.
    h.calls = [];
    const ok = await post(await signed());
    expect(ok.status).toBe(202);
    const ctx = h.calls.find((c) => c.service === "gateway.ingest")?.args[0] as {
      organizationId: string; siteId: string | null; gatewayId: string;
    };
    expect(ctx.organizationId).toBe("org-1");
    expect(ctx.siteId).toBe("site-1");
    expect(ctx.gatewayId).toBe(GW);
    // A machine never receives a user identity.
    expect((ctx as unknown as Record<string, unknown>).userId).toBeUndefined();
    expect((ctx as unknown as Record<string, unknown>).role).toBeUndefined();
  });

  it.each([
    ["a forged signature", async () => ({ envelope: await signed({ signature: "A".repeat(43) }), headers: {} })],
    ["an unknown handle", async () => ({ envelope: await signed(), headers: { "x-hermes-ingestion-id": "z".repeat(43) } })],
    ["a missing handle", async () => ({ envelope: await signed(), headers: { "x-hermes-ingestion-id": "" } })],
    ["a stale envelope", async () => ({ envelope: await signed({ timestamp: new Date(Date.now() - 3_600_000).toISOString() }), headers: {} })],
    ["a payload type outside its capabilities", async () => ({ envelope: await signed({ payloadType: "TAG_METADATA" }), headers: {} })],
  ])("%s is refused with one indistinguishable answer and never ingests", async (_label, make) => {
    h.org = null;
    provision();
    const { envelope, headers } = await make();
    const res = await post(envelope, headers);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      code: "GATEWAY_AUTH_FAILED",
      message: "Gateway authentication failed.",
    });
    expect(h.calls.filter((c) => c.service === "gateway.ingest")).toHaveLength(0);
    // The reason is recorded internally even though it is not disclosed.
    expect(h.calls.filter((c) => c.service === "gateway.rejected")).toHaveLength(1);
  });

  it("a disabled or revoked gateway is refused exactly like an unknown one", async () => {
    h.org = null;
    const bodies: string[] = [];
    for (const patch of [{ disabled: true }, { lifecycle: "REVOKED" }, null]) {
      h.gateways = {};
      if (patch) provision(patch);
      const res = await post(await signed());
      expect(res.status).toBe(401);
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size, "lifecycle must not be distinguishable").toBe(1);
  });

  it("refuses when the path and the envelope name different gateways", async () => {
    h.org = null;
    provision();
    const res = await post(await signed({ gatewayId: "GW-OTHER" }), {}, GW);
    expect(res.status).toBe(401);
    expect(h.calls.filter((c) => c.service === "gateway.ingest")).toEqual([]);
  });

  it("throttles by IP before the lookup and by gateway after it", async () => {
    h.org = null;
    provision();
    await post(await signed());
    expect(h.buckets).toEqual(["ot-envelope-preauth", "ot-envelope-gateway"]);
  });

  it("a throttled request ingests nothing and says when to retry", async () => {
    h.org = null;
    provision();
    h.rateLimited = true;
    const res = await post(await signed());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(h.calls.filter((c) => c.service === "gateway.ingest")).toEqual([]);
  });

  it("returns no signature, nonce, handle or key reference, and is never cached", async () => {
    h.org = null;
    provision();
    const env = await signed();
    const res = await post(env);
    const body = await res.text();
    for (const secret of [env.signature, env.nonce, HANDLE, TEST_KEY_REF, TEST_SECRET]) {
      expect(body).not.toContain(secret);
    }
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });

  it("a gateway DTO reports signing config without the reference", async () => {
    const { GET } = await import("../gateways/[id]/route");
    const res = await GET(get("/ot/gateways/g-1"), params("g-1"));
    const body = await res.text();
    expect(body).toContain("signingConfigured");
    expect(body).not.toContain("OT_GATEWAY_HMAC");
  });

  it("the list and detail responses never reveal an ingestion handle", async () => {
    const list = await import("../gateways/route");
    const one = await import("../gateways/[id]/route");
    for (const body of [
      await (await list.GET(get("/ot/gateways"))).text(),
      await (await one.GET(get("/ot/gateways/g-1"), params("g-1"))).text(),
    ]) {
      expect(body).not.toContain("ingestionId");
    }
  });
});

describe("94B4 — hidden resources and pagination", () => {
  it("an unknown id is 404 and identical for every entity", async () => {
    const g = await import("../gateways/[id]/route");
    const d = await import("../devices/[id]/route");
    const p = await import("../../engineering/projects/[id]/route");
    const bodies: string[] = [];
    const handlers = [g.GET, d.GET, p.GET].map((x) => x as unknown as RouteHandler);
    for (const handler of handlers) {
      const res = await handler(get("/x"), params("nope"));
      expect(res.status).toBe(404);
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size, "404 bodies must be indistinguishable").toBe(1);
  });

  it("pagination is bounded whatever the caller sends", async () => {
    const { GET } = await import("../gateways/route");
    for (const q of ["?pageSize=99999", "?pageSize=-5", "?pageSize=NaN", "?page=-3", "?pageSize=Infinity"]) {
      const res = await GET(get(`/ot/gateways${q}`));
      expect(res.status).toBe(200);
      const data = (await res.json()).data as { take: number; skip: number };
      expect(data.take).toBeLessThanOrEqual(200);
      expect(data.take).toBeGreaterThanOrEqual(1);
      expect(data.skip).toBeGreaterThanOrEqual(0);
    }
  });

  it("the finding transition route validates its payload strictly", async () => {
    const { PATCH } = await import("../../engineering/findings/[id]/route");
    for (const bad of [{ state: "NOT_A_STATE" }, { state: "OPEN", extra: 1 }, { reviewNote: "x" }]) {
      const res = await PATCH(send("/engineering/findings/f-1", "PATCH", bad), params("f-1"));
      expect(res.status, JSON.stringify(bad)).toBe(422);
    }
    const ok = await PATCH(
      send("/engineering/findings/f-1", "PATCH", { state: "ACKNOWLEDGED", reviewNote: "seen" }),
      params("f-1"),
    );
    expect(ok.status).toBe(200);
    expect(h.calls.filter((c) => c.service === "findings.transitionFinding")).toHaveLength(1);
  });

  it("analysis takes no body and calls the service once", async () => {
    const { POST } = await import("../../engineering/projects/[id]/analyze/route");
    const res = await POST(new NextRequest(url("/engineering/projects/p-1/analyze"), { method: "POST" }), params("p-1"));
    expect(res.status).toBe(200);
    expect(h.calls.filter((c) => c.service === "analysis.run")).toHaveLength(1);
  });
});

describe("94B.1 — list filters reach the repository, or the request is refused", () => {
  /**
   * The defect this closes: before 94B.1 the routes read only page/pageSize/
   * sortBy/sortDir and `parseQuery` ignored everything else, so `?lifecycle=X`
   * returned the UNFILTERED page — which a dashboard would then have presented
   * as filtered. These tests pin both halves of the fix: a supported key is
   * honoured, and an unsupported VALUE is refused before any repository call.
   */
  const listArgs = (service: string) =>
    h.calls.find((c) => c.service === service)?.args as unknown[] | undefined;

  it("passes every supported gateway filter through to the query", async () => {
    const { GET } = await import("../gateways/route");
    const res = await GET(
      get("/ot/gateways?lifecycle=ACTIVE&siteId=site-1&capability=READ_ONLY_TELEMETRY&search=Line"),
    );
    expect(res.status).toBe(200);
    expect(listArgs("gateways.listVisible")?.[2]).toEqual({
      lifecycle: "ACTIVE",
      siteId: "site-1",
      capability: "READ_ONLY_TELEMETRY",
      search: "Line",
    });
  });

  it("passes every supported device filter through to the query", async () => {
    const { GET } = await import("../devices/route");
    const res = await GET(get("/ot/devices?lifecycle=OPERATIONAL&siteId=site-1&category=PLC&search=P-101"));
    expect(res.status).toBe(200);
    expect(listArgs("devices.listVisible")?.[2]).toEqual({
      lifecycle: "OPERATIONAL",
      siteId: "site-1",
      category: "PLC",
      search: "P-101",
    });
  });

  it("keeps pagination and sorting intact alongside a filter", async () => {
    const { GET } = await import("../gateways/route");
    await GET(get("/ot/gateways?lifecycle=ACTIVE&page=3&pageSize=10&sortBy=updatedAt&sortDir=asc"));
    const args = listArgs("gateways.listVisible");
    // The page argument is unchanged by filtering: skip is still (3-1)*10.
    expect(args?.[1]).toEqual({ take: 10, skip: 20, sortBy: "updatedAt", sortDir: "asc" });
    expect(args?.[2]).toEqual({ lifecycle: "ACTIVE" });
  });

  it.each([
    ["gateway lifecycle", "../gateways/route", "/ot/gateways?lifecycle=RETIRED"],
    ["gateway capability", "../gateways/route", "/ot/gateways?capability=CONTROL_WRITE"],
    ["gateway site id", "../gateways/route", "/ot/gateways?siteId=site%20one"],
    ["device lifecycle", "../devices/route", "/ot/devices?lifecycle=REVOKED"],
    ["device category", "../devices/route", "/ot/devices?category=ROBOT"],
    ["device site id", "../devices/route", "/ot/devices?siteId=%25"],
  ])("refuses an invalid %s with 400 and never queries", async (_label, mod, path) => {
    const { GET } = (await import(mod)) as { GET: (r: NextRequest) => Promise<Response> };
    const res = await GET(get(path));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_QUERY_PARAMETER");
    // The decisive assertion: a refused filter must not reach the database.
    expect(h.calls.filter((c) => c.service.endsWith("listVisible"))).toEqual([]);
  });

  it("a supported filter key is never silently ignored", async () => {
    const { GET } = await import("../gateways/route");
    await GET(get("/ot/gateways?lifecycle=STALE"));
    const filters = listArgs("gateways.listVisible")?.[2] as Record<string, unknown>;
    // If this ever comes back undefined or empty, the route has gone back to
    // answering with an unfiltered page while the caller believes otherwise.
    expect(filters).toBeDefined();
    expect(filters.lifecycle).toBe("STALE");
  });

  it("an unsupported key is ignored rather than refused, and filters nothing", async () => {
    const { GET } = await import("../gateways/route");
    // `category` and `vendor` have no backing column; accepting them would
    // advertise filters that can never do anything.
    const res = await GET(get("/ot/gateways?category=PLC&vendor=Siemens"));
    expect(res.status).toBe(200);
    expect(listArgs("gateways.listVisible")?.[2]).toEqual({});
  });

  it("filtering does not change authorization or caching guarantees", async () => {
    h.org = null;
    const { GET } = await import("../gateways/route");
    const res = await GET(get("/ot/gateways?lifecycle=ACTIVE"));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("UNAUTHENTICATED");
    // An anonymous request must not reach the query even with a valid filter.
    expect(h.calls.filter((c) => c.service.endsWith("listVisible"))).toEqual([]);

    h.org = { ...ORG };
    const ok = await GET(get("/ot/gateways?lifecycle=ACTIVE"));
    expect(ok.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });

  it("the filtered response still exposes no signing reference", async () => {
    const { GET } = await import("../gateways/route");
    const res = await GET(get("/ot/gateways?lifecycle=ACTIVE"));
    expect(await res.text()).not.toContain("OT_GATEWAY_HMAC");
  });
});
