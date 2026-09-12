/**
 * PHASE 110-A1.0b R6 — the missing precondition must stop being an accepted gap.
 *
 * R3 introduced the tenant-intent precondition and R5 extended it to every
 * implicit-context route, but in both rounds an ABSENT header meant "I assert
 * nothing" and the mutation went through. That was a deliberate compatibility
 * boundary, and both rounds asserted it rather than describing it — the R3 and
 * R5 suites each contain a case proving that a request with no header still
 * cancelled organization B's subscription.
 *
 * It is no longer acceptable for a BROWSER mutation. A stale tab that sends no
 * header is exactly as dangerous as one that sends the wrong header, and
 * "asserts nothing" is not a property a user-path write may have.
 *
 * WHAT THIS FILE DRIVES
 * Two REAL handlers, one from each implicit-context class, with their write
 * services counted rather than stubbed away:
 *
 *   DELETE /api/billing/subscription   selection class -> cancelSubscription
 *   POST   /api/platform/keys          platform class  -> createApiKey
 *
 * The count is the assertion. A status code alone cannot distinguish "refused"
 * from "refused after the write".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_TOKEN_COOKIE as ACCESS_COOKIE_NAME } from "@/lib/auth/config";

interface Row {
  organizationId: string;
  role: string;
  status: string;
}

interface Harness {
  userId: string | null;
  rows: Row[];
  sessionActive: boolean;
  apiKey: { id: string; organizationId: string; scopes: string[] } | null;
  /** Organizations a subscription was actually cancelled in, in order. */
  cancelled: string[];
  /** Organizations an API key was actually created in, in order. */
  keysCreated: string[];
}

let h: Harness;

const ORG_A: Row = { organizationId: "org_a", role: "OWNER", status: "ACTIVE" };
const ORG_B: Row = { organizationId: "org_b", role: "OWNER", status: "ACTIVE" };

function reset(over: Partial<Harness> = {}): void {
  h = {
    userId: "user_1",
    rows: [ORG_A, ORG_B],
    sessionActive: true,
    apiKey: null,
    cancelled: [],
    keysCreated: [],
    ...over,
  };
}

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    organizationMember: {
      findMany: async () => h.rows,
      // `requireOrgActor` reads the acting membership for the permission check.
      findFirst: async (a: { where: { organizationId?: string } }) =>
        h.rows.find((r) => r.organizationId === a.where.organizationId) ?? null,
    },
    organization: {
      findUnique: async (a: { where: { id: string } }) => ({
        id: a.where.id,
        slug: `slug-${a.where.id}`,
      }),
    },
  }),
}));
vi.mock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database" }));
vi.mock("@/lib/auth/jwt", () => ({
  verifyAccessToken: async () => (h.userId ? { sub: h.userId, sid: "sid_1" } : null),
}));
vi.mock("@/lib/auth/session-store", () => ({
  isPayloadSessionActive: async () => h.sessionActive,
}));
vi.mock("@/lib/api/keys", () => ({
  verifyApiKey: async () => h.apiKey,
  touchLastUsed: () => undefined,
  listApiKeys: async () => [],
  createApiKey: async ({ organizationId }: { organizationId: string }) => {
    h.keysCreated.push(organizationId);
    return { key: "hk_live_new", record: { id: "key_new", organizationId } };
  },
}));
vi.mock("@/lib/billing/subscriptions", () => ({
  getSubscription: async () => null,
  createSubscription: async () => ({ ok: true, subscription: {} }),
  changePlan: async () => ({ ok: true, subscription: {} }),
  renewSubscription: async () => ({ ok: true, subscription: {} }),
  cancelSubscription: async ({ organizationId }: { organizationId: string }) => {
    h.cancelled.push(organizationId);
    return { ok: true, subscription: {} };
  },
}));
/*
 * `requireOrgActor` is the ORGANIZATION-membership check the platform route runs
 * after authentication. It is given the real answer for the tenant the resolver
 * chose, so the permission check is genuine and the only thing under test here
 * is which tenant reached it.
 */
vi.mock("@/lib/org/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/org/context")>();
  return {
    ...actual,
    getUserIdFromRequest: async (req: {
      cookies: { get: (n: string) => { value: string } | undefined };
    }) => (h.userId && h.sessionActive && req.cookies.get(ACCESS_COOKIE_NAME) ? h.userId : null),
    requireOrgActor: async (_req: unknown, orgId: string) => {
      const row = h.rows.find((r) => r.organizationId === orgId && r.status === "ACTIVE");
      if (!row) return { error: "Not a member of this organization", status: 403 };
      return { ctx: { userId: h.userId, orgId, role: row.role, status: row.status } };
    },
  };
});

const { DELETE: CANCEL_SUBSCRIPTION } = await import("@/app/api/billing/subscription/route");
const { POST: CREATE_KEY } = await import("@/app/api/platform/keys/route");
const { TENANT_SELECTION_COOKIE, TENANT_PRECONDITION_HEADER } = await import("../contract");

const envelope = (userId: string, organizationId: string): string =>
  Buffer.from(JSON.stringify({ v: 1, u: userId, o: organizationId }), "utf8").toString(
    "base64url",
  );

/**
 * One request from one tab.
 *
 * `showing` is the precondition — what that tab last rendered. `undefined` is a
 * client that sends none at all, which is the case this round is about.
 */
function tab(
  opts: {
    chosen?: string;
    showing?: string;
    apiKeyHeader?: string;
    bearer?: string;
    body?: unknown;
    method?: string;
  } = {},
) {
  const jar: Record<string, string> = {};
  if (!opts.bearer) jar[ACCESS_COOKIE_NAME] = "token";
  if (opts.chosen) jar[TENANT_SELECTION_COOKIE] = envelope("user_1", opts.chosen);

  const headers = new Headers({
    origin: "https://www.hermesnovin.com",
    "content-type": "application/json",
  });
  if (opts.showing !== undefined) headers.set(TENANT_PRECONDITION_HEADER, opts.showing);
  if (opts.apiKeyHeader) headers.set("X-API-Key", opts.apiKeyHeader);
  if (opts.bearer) headers.set("Authorization", `Bearer ${opts.bearer}`);

  const method = opts.method ?? "POST";
  // GET and HEAD may not carry a body — the platform refuses to construct one.
  const carriesBody = method !== "GET" && method !== "HEAD";
  const native = new Request("https://www.hermesnovin.com/api/x", {
    method,
    headers,
    ...(carriesBody ? { body: JSON.stringify(opts.body ?? { name: "a key", scopes: [] }) } : {}),
  });

  return {
    /*
     * `method` is part of the request, and omitting it was a real harness bug:
     * the precondition is scoped BY METHOD, so a double without one made every
     * request look like a GET and the two header-absent cases kept writing.
     * The failure looked exactly like the product gap they were written to
     * catch, which is the most expensive kind of harness mistake.
     */
    method,
    headers: native.headers,
    get body() {
      return native.body;
    },
    text: () => native.text(),
    json: () => native.json(),
    cookies: { get: (n: string) => (jar[n] ? { value: jar[n] } : undefined) },
  } as never;
}

beforeEach(() => reset());

/* ── The gap, per header state, on a REAL handler ────────────────────────── */

describe("R6 — a browser mutation with NO precondition must not write", () => {
  it("DELETE /api/billing/subscription, cookie B, header ABSENT", async () => {
    const res = await CANCEL_SUBSCRIPTION(tab({ chosen: "org_b" }));

    expect(
      h.cancelled,
      "R5 measured ['org_b'] here: a client that sends no header was not protected by one",
    ).toEqual([]);
    expect(res.status).not.toBe(200);
  });

  it("POST /api/platform/keys, cookie B, header ABSENT", async () => {
    const res = await CREATE_KEY(tab({ chosen: "org_b" }));

    expect(h.keysCreated, "an API key minted in a tenant nobody asserted").toEqual([]);
    expect(res.status).not.toBe(201);
    expect(res.status).not.toBe(200);
  });

  it("header EMPTY writes nothing", async () => {
    await CANCEL_SUBSCRIPTION(tab({ chosen: "org_b", showing: "" }));
    await CREATE_KEY(tab({ chosen: "org_b", showing: "" }));
    expect(h.cancelled).toEqual([]);
    expect(h.keysCreated).toEqual([]);
  });

  it("header naming the OTHER organization (A) writes nothing", async () => {
    await CANCEL_SUBSCRIPTION(tab({ chosen: "org_b", showing: "org_a" }));
    await CREATE_KEY(tab({ chosen: "org_b", showing: "org_a" }));
    expect(h.cancelled).toEqual([]);
    expect(h.keysCreated).toEqual([]);
  });

  it("header naming a FOREIGN organization writes nothing", async () => {
    await CANCEL_SUBSCRIPTION(tab({ chosen: "org_b", showing: "org_not_mine" }));
    await CREATE_KEY(tab({ chosen: "org_b", showing: "org_not_mine" }));
    expect(h.cancelled).toEqual([]);
    expect(h.keysCreated).toEqual([]);
  });

  it("header MATCHING the selection is the only one that writes, and only there", async () => {
    await CANCEL_SUBSCRIPTION(tab({ chosen: "org_b", showing: "org_b" }));
    await CREATE_KEY(tab({ chosen: "org_b", showing: "org_b" }));

    expect(h.cancelled, "the reader's real, intended action goes through").toEqual(["org_b"]);
    expect(h.keysCreated).toEqual(["org_b"]);
  });

  it("a conflict is never replayed in the tenant that IS in effect", async () => {
    await CANCEL_SUBSCRIPTION(tab({ chosen: "org_b", showing: "org_a" }));
    expect(
      h.cancelled,
      "performing it in org_b 'because that is where they are' is the defect, not the fix",
    ).toEqual([]);
  });
});

/* ── What must NOT be caught by the requirement ──────────────────────────── */

describe("R6 — the requirement is scoped by METHOD and by credential path", () => {
  it("an API key writes in ITS OWN tenant with no header at all", async () => {
    reset({ apiKey: { id: "key_1", organizationId: "org_a", scopes: ["admin"] } });

    await CREATE_KEY(tab({ chosen: "org_b", apiKeyHeader: "hk_live_example" }));

    expect(
      h.keysCreated,
      "a machine credential has no rendered page, so it can assert nothing and must not be required to",
    ).toEqual(["org_a"]);
  });

  it("an API key is not moved by a header either", async () => {
    reset({ apiKey: { id: "key_1", organizationId: "org_a", scopes: ["admin"] } });
    await CREATE_KEY(tab({ chosen: "org_b", showing: "org_b", apiKeyHeader: "hk_live_example" }));
    expect(h.keysCreated).toEqual(["org_a"]);
  });
});

/* ── The unknown method must fail CLOSED ─────────────────────────────────── */

describe("R6 — an unclassifiable method is treated as a write", () => {
  /*
   * A mutation control found this UNTESTED: flipping the default from
   * fail-closed to fail-open broke nothing, because every case named a method.
   * A default that turns a missing field into "no precondition needed" is a
   * bypass waiting for the one caller that does not set it — and this project
   * has already been bitten by exactly that, when request doubles omitted the
   * method and made every request look like a read.
   */
  it("no method at all, no header: refused, and nothing is written", async () => {
    const req = tab({ chosen: "org_b" }) as unknown as Record<string, unknown>;
    delete req.method;

    const res = await CREATE_KEY(req as never);

    expect(h.keysCreated, "an unclassifiable request must not write").toEqual([]);
    expect(res.status).toBe(428);
  });

  it("an unrecognised verb, no header: refused", async () => {
    const res = await CREATE_KEY(tab({ chosen: "org_b", method: "PROPFIND" }));
    expect(h.keysCreated).toEqual([]);
    expect(res.status).toBe(428);
  });

  it("GET, HEAD and OPTIONS stay exempt — reads were never in scope", async () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      reset();
      const res = await CREATE_KEY(tab({ chosen: "org_b", method }));
      expect(res.status, `${method} must not be treated as a write`).not.toBe(428);
    }
  });
});

/* ── The bearer-JWT credential, per the module's stated contract ─────────── */

describe("R6 — a bearer JWT is a session credential, not an absence of choice", () => {
  /*
   * `src/lib/api/auth.ts` states its own contract: "JWT session —
   * 'Authorization: Bearer <jwt>' (cookie or header)". R5 routed that path
   * through a cookie-only identity port, so a bearer caller resolved as
   * UNAUTHENTICATED and was refused with "select an organization" — a valid
   * identity translated into an absence of choice. That was a contract break I
   * introduced, and no in-repository caller uses the path, which proves nothing
   * about external consumers.
   */
  it("a bearer caller with ONE membership resolves it", async () => {
    reset({ rows: [ORG_A] });

    const res = await CREATE_KEY(tab({ bearer: "a.valid.jwt", showing: "org_a" }));

    expect(
      h.keysCreated,
      "R5 refused this with ORGANIZATION_SELECTION_REQUIRED — a valid identity, no choice to make",
    ).toEqual(["org_a"]);
    // The status matters too: a bearer caller is served, not merely not-refused.
    expect(res.status).not.toBe(409);
    expect(res.status).not.toBe(428);
  });

  it("a bearer caller with SEVERAL memberships and no selection is refused for AMBIGUITY", async () => {
    const res = await CREATE_KEY(tab({ bearer: "a.valid.jwt", showing: "org_a" }));

    expect(h.keysCreated).toEqual([]);
    expect(res.status, "409, the ambiguity — not 401, and not an arbitrary pick").toBe(409);
  });

  it("a bearer caller is still subject to the write precondition", async () => {
    reset({ rows: [ORG_A] });
    const res = await CREATE_KEY(tab({ bearer: "a.valid.jwt" }));
    expect(h.keysCreated, "no header on a write, whatever the credential shape").toEqual([]);
    expect(res.status).toBe(428);
  });

  it("a bearer caller whose session is revoked is refused", async () => {
    reset({ rows: [ORG_A], sessionActive: false });
    const res = await CREATE_KEY(tab({ bearer: "a.valid.jwt", showing: "org_a" }));
    expect(h.keysCreated).toEqual([]);
    expect(res.status).toBe(401);
  });

  it("an API key sent as a Bearer token still goes to the KEY path", async () => {
    reset({ rows: [ORG_A, ORG_B], apiKey: { id: "k", organizationId: "org_a", scopes: ["admin"] } });

    const res = await CREATE_KEY(tab({ bearer: "hk_live_example" }));

    expect(h.keysCreated, "the key's own tenant, and no precondition required").toEqual(["org_a"]);
    expect(res.status).not.toBe(428);
  });
});

/* ── Ordering: authentication and membership still come first ────────────── */

describe("R6 — the precondition never pre-empts an earlier refusal", () => {
  it("a revoked session is 401, not a precondition complaint", async () => {
    reset({ sessionActive: false });
    const res = await CANCEL_SUBSCRIPTION(tab({ chosen: "org_b" }));
    expect(res.status).toBe(401);
    expect(h.cancelled).toEqual([]);
  });

  it("several memberships with no selection is refused for the ambiguity", async () => {
    const res = await CANCEL_SUBSCRIPTION(tab({ showing: "org_a" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "ORGANIZATION_SELECTION_REQUIRED",
    });
    expect(h.cancelled).toEqual([]);
  });

  it("a SUSPENDED selection is refused before the header is considered", async () => {
    reset({ rows: [ORG_A, { ...ORG_B, status: "SUSPENDED" }] });
    const res = await CANCEL_SUBSCRIPTION(tab({ chosen: "org_b", showing: "org_b" }));
    expect(res.status).toBe(409);
    expect(h.cancelled).toEqual([]);
  });
});
