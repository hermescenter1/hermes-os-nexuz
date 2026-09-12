/**
 * PHASE 110-A1.0b R6.1 — the SECOND identity check must refuse as an identity
 * failure, not as a missing organization choice.
 *
 * `resolveJwtContext` establishes identity twice, on purpose: once from the
 * credential it authenticates (`verifyAccessToken` + `isPayloadSessionActive`),
 * and once inside the tenant resolver, whose own port repeats both. The two are
 * compared, and that comparison is the guarantee that no caller can state who
 * they are.
 *
 * The two checks are not simultaneous. A session revoked, expired or logged out
 * BETWEEN them makes the first succeed and the second answer UNAUTHENTICATED —
 * the tenant core's one answer for "absent, malformed, unverifiable or revoked".
 *
 * WHAT R6 DID WITH THAT ANSWER
 *
 *     AUTHENTICATION_REQUIRED: "organization_selection_required"
 *
 * which is 409 and the message "select an organization". A caller whose session
 * had just died was told to pick a tenant, and there is nothing they can pick:
 * the remedy for a dead session is to sign in, and 409 does not say so. That
 * mapping was written for the R5 bearer gap — a bearer-only caller reached the
 * cookie-only identity port and came back UNAUTHENTICATED — and R6 fixed that
 * gap at the source with `resolveTenantForCredential` while leaving the mapping,
 * and its comment, describing a route that no longer exists.
 *
 * It is also a DIVERGENCE. `resolveOrgContext` forwards the same resolver code
 * unchanged, so the identical condition answered 401 on the billing routes and
 * 409 on the 69 platform routes. Two unified helpers, one question, two answers.
 *
 * WHAT THIS FILE ASSERTS
 * Real handlers, real resolver, write services COUNTED. The status is not the
 * whole assertion: nothing may be written on any of these paths.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_TOKEN_COOKIE as ACCESS_COOKIE_NAME } from "@/lib/auth/config";

interface Row {
  organizationId: string;
  role: string;
  status: string;
}

interface Harness {
  /** Who `verifyAccessToken` says this credential belongs to — the FIRST check. */
  tokenSubject: string | null;
  /** What `isPayloadSessionActive` says at the FIRST check. */
  sessionActive: boolean;
  /**
   * Who the resolver's own identity port resolves — the SECOND check.
   * `null` is the case this round is about: valid a moment ago, gone now.
   */
  identity: string | null;
  rows: Row[];
  apiKey: { id: string; organizationId: string; scopes: string[] } | null;
  cancelled: string[];
  keysCreated: string[];
}

let h: Harness;

const ORG_A: Row = { organizationId: "org_a", role: "OWNER", status: "ACTIVE" };
const ORG_B: Row = { organizationId: "org_b", role: "OWNER", status: "ACTIVE" };

function reset(over: Partial<Harness> = {}): void {
  h = {
    tokenSubject: "user_1",
    sessionActive: true,
    identity: "user_1",
    rows: [ORG_A, ORG_B],
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
  verifyAccessToken: async () => (h.tokenSubject ? { sub: h.tokenSubject, sid: "sid_1" } : null),
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
    // The route checks `result.ok` before answering 201. A double that omits it
    // makes every successful path a 422, which looks exactly like a rejected
    // request — an easy way to "prove" a refusal that never happened.
    return { ok: true, key: "hk_live_new", record: { id: "key_new", organizationId } };
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
 * THE SECOND CHECK, and the only place in this file it is decided.
 *
 * `getUserIdFromRequest` is the resolver's identity port. It reads the same
 * cookie and runs the same verification and revocation check as the first —
 * which is exactly why it can disagree: it runs LATER.
 */
vi.mock("@/lib/org/context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/org/context")>();
  return {
    ...actual,
    getUserIdFromRequest: async (req: {
      cookies: { get: (n: string) => { value: string } | undefined };
    }) => (h.identity && req.cookies.get(ACCESS_COOKIE_NAME) ? h.identity : null),
    requireOrgActor: async (_req: unknown, orgId: string) => {
      const row = h.rows.find((r) => r.organizationId === orgId && r.status === "ACTIVE");
      if (!row) return { error: "Not a member of this organization", status: 403 };
      return { ctx: { userId: h.identity, orgId, role: row.role, status: row.status } };
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

function tab(
  opts: {
    chosen?: string;
    showing?: string;
    apiKeyHeader?: string;
    method?: string;
    noCookie?: boolean;
  } = {},
) {
  const jar: Record<string, string> = {};
  if (!opts.noCookie) jar[ACCESS_COOKIE_NAME] = "token";
  if (opts.chosen) jar[TENANT_SELECTION_COOKIE] = envelope("user_1", opts.chosen);

  const headers = new Headers({
    origin: "https://www.hermesnovin.com",
    "content-type": "application/json",
  });
  if (opts.showing !== undefined) headers.set(TENANT_PRECONDITION_HEADER, opts.showing);
  if (opts.apiKeyHeader) headers.set("X-API-Key", opts.apiKeyHeader);

  const method = opts.method ?? "POST";
  // GET and HEAD may not carry a body — the platform refuses to construct one.
  const carriesBody = method !== "GET" && method !== "HEAD";
  const native = new Request("https://www.hermesnovin.com/api/x", {
    method,
    headers,
    ...(carriesBody ? { body: JSON.stringify({ name: "a key", scopes: [] }) } : {}),
  });

  return {
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

const codeOf = async (res: Response): Promise<string | undefined> => {
  try {
    return (await res.clone().json())?.code;
  } catch {
    return undefined;
  }
};

beforeEach(() => reset());

/* ── The defect ──────────────────────────────────────────────────────────── */

describe("R6.1 — a session that dies between the two checks is an AUTH failure", () => {
  it("POST /api/platform/keys answers 401, not 409 'select an organization'", async () => {
    // First check passes: the token verifies and the session is active.
    // Second check fails: the resolver's own port can no longer identify anyone.
    reset({ identity: null });

    const res = await CREATE_KEY(tab({ chosen: "org_b", showing: "org_b" }));

    expect(
      res.status,
      "R6 mapped the resolver's AUTHENTICATION_REQUIRED to organization_selection_required, so this was 409 and the caller was told to pick a tenant they cannot pick",
    ).toBe(401);
    expect(await codeOf(res)).toBe("AUTHENTICATION_REQUIRED");
    expect(h.keysCreated, "nothing may be minted for an identity that no longer resolves").toEqual(
      [],
    );
  });

  it("the billing path already answered 401 — the two helpers must now agree", async () => {
    reset({ identity: null });

    const res = await CANCEL_SUBSCRIPTION(tab({ chosen: "org_b", showing: "org_b", method: "DELETE" }));

    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe("AUTHENTICATION_REQUIRED");
    expect(h.cancelled).toEqual([]);
  });

  it("a single membership does not rescue it — identity is decided before tenancy", async () => {
    reset({ identity: null, rows: [ORG_A] });

    const res = await CREATE_KEY(tab({ showing: "org_a" }));

    expect(res.status).toBe(401);
    expect(h.keysCreated).toEqual([]);
  });

  it("a READ is refused the same way — this is not a precondition question", async () => {
    reset({ identity: null });
    const { GET: LIST_KEYS } = await import("@/app/api/platform/keys/route");

    const res = await LIST_KEYS(tab({ chosen: "org_b", method: "GET" }));

    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe("AUTHENTICATION_REQUIRED");
  });
});

/* ── What must NOT change ────────────────────────────────────────────────── */

describe("R6.1 — 'choose an organization' keeps its own, narrower meaning", () => {
  it("valid identity + several memberships + no selection = 409", async () => {
    const res = await CREATE_KEY(tab({ showing: "org_b" }));

    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("ORGANIZATION_SELECTION_REQUIRED");
    expect(h.keysCreated).toEqual([]);
  });

  it("valid identity + a stale selection naming an organization no longer held = 409", async () => {
    reset({ rows: [ORG_A] });

    const res = await CREATE_KEY(tab({ chosen: "org_b", showing: "org_a" }));

    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("ORGANIZATION_SELECTION_REQUIRED");
    expect(h.keysCreated).toEqual([]);
  });

  it("valid identity + NO membership at all = 409 organization context, not 401", async () => {
    reset({ rows: [] });

    const res = await CREATE_KEY(tab({ showing: "org_a" }));

    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("ORGANIZATION_CONTEXT_REQUIRED");
  });

  it("a granted selection still writes, in that organization only", async () => {
    const res = await CREATE_KEY(tab({ chosen: "org_b", showing: "org_b" }));

    expect(res.status).toBe(201);
    expect(h.keysCreated).toEqual(["org_b"]);
  });
});

describe("R6.1 — API-key precedence and the identity binding are untouched", () => {
  it("an API key wins over the session cookie and carries the key row's tenant", async () => {
    reset({
      identity: null, // the session is dead; the key does not care
      apiKey: { id: "key_1", organizationId: "org_a", scopes: ["admin"] },
    });

    const res = await CREATE_KEY(tab({ chosen: "org_b", apiKeyHeader: "hk_live_x" }));

    expect(res.status, "the key resolves before any of this and never reaches it").toBe(201);
    expect(h.keysCreated, "the tenant comes from the key row, never from the cookie").toEqual([
      "org_a",
    ]);
  });

  it("an API key needs no precondition header — it is exempt by authentication path", async () => {
    reset({ apiKey: { id: "key_1", organizationId: "org_a", scopes: ["admin"] } });

    const res = await CREATE_KEY(tab({ chosen: "org_b", apiKeyHeader: "hk_live_x" }));

    expect(res.status).toBe(201);
    expect(h.keysCreated).toEqual(["org_a"]);
  });

  it("an invalid API key denies and never falls through to the session", async () => {
    reset({ apiKey: null });

    const res = await CREATE_KEY(tab({ chosen: "org_b", showing: "org_b", apiKeyHeader: "hk_live_bad" }));

    expect(res.status).toBe(401);
    expect(h.keysCreated).toEqual([]);
  });

  it("the two identities naming DIFFERENT people is 403, not 401 and not 409", async () => {
    // The token says user_1; the resolver's own port says user_2. Neither is
    // absent, so this is not an authentication failure — it is a decision about
    // somebody else, and it is refused rather than adopted.
    // ONE membership, deliberately: with two, the resolver refuses for ambiguity
    // and returns before the identity comparison is ever reached, so the guard
    // would be "proved" by a refusal that has nothing to do with it.
    reset({ identity: "user_2", rows: [ORG_A] });

    const res = await CREATE_KEY(tab({ chosen: "org_b", showing: "org_b" }));

    expect(res.status).toBe(403);
    expect(h.keysCreated).toEqual([]);
  });

  it("the FIRST check still refuses on its own — a revoked session never reaches the resolver", async () => {
    reset({ sessionActive: false });

    const res = await CREATE_KEY(tab({ chosen: "org_b", showing: "org_b" }));

    expect(res.status).toBe(401);
    expect(h.keysCreated).toEqual([]);
  });
});
