/**
 * PHASE 110-A1.0b R5 — the tenant-intent precondition on the PLATFORM path.
 *
 * R3 gave the precondition to the ten selection-class routes. R5 gave the other
 * sixty-nine the same resolver, and only then extended the precondition to them
 * — in that order, because doing it the other way round would have been worse
 * than doing nothing: while `requirePlatformAuth` still resolved the earliest
 * membership, a page rendered for B would have asserted B, the server would
 * have resolved A, and every request from a correct client would have failed.
 *
 * WHAT THESE CASES ARE FOR
 *   - a stale browser tab cannot act in the organization it is not showing;
 *   - the exemption is decided by the AUTHENTICATION PATH, so an API key — which
 *     carries its own organization — is never subject to it and no cookie or
 *     header can move its tenant;
 *   - the absence of the header is measured rather than described, because a
 *     caller that does not send it is not protected by it.
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
  /**
   * The identity the COOKIE path resolves, when it must differ from the one the
   * token authenticated. Defaults to `userId`; only the identity-binding cases
   * set it apart.
   */
  cookieUserId?: string | null;
  rows: Row[];
  sessionActive: boolean;
  apiKey: { id: string; organizationId: string; scopes: string[] } | null;
  /** Every membership listing, counted: a refusal must not query twice. */
  findManyCalls: number;
  /** Memberships for the OTHER identity, when the two are made to differ. */
  otherUserRows?: Row[];
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
    findManyCalls: 0,
    ...over,
  };
}

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    organizationMember: {
      findMany: async (a: { where: { userId: string } }) => {
        h.findManyCalls += 1;
        /*
         * Rows are returned PER USER. The identity-binding cases need the two
         * identities to see different memberships — otherwise the mismatch is
         * never reachable: a second user with the same two organizations is
         * refused for ambiguity and returns before the guard.
         */
        const who = h.cookieUserId === undefined ? h.userId : h.cookieUserId;
        return a.where.userId === who && h.otherUserRows ? h.otherUserRows : h.rows;
      },
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
vi.mock("@/lib/org/context", () => ({
  getUserIdFromRequest: async (req: {
    cookies: { get: (n: string) => { value: string } | undefined };
  }) => {
    const who = h.cookieUserId === undefined ? h.userId : h.cookieUserId;
    return who && h.sessionActive && req.cookies.get(ACCESS_COOKIE_NAME) ? who : null;
  },
}));
vi.mock("@/lib/auth/jwt", () => ({
  verifyAccessToken: async () => (h.userId ? { sub: h.userId, sid: "sid_1" } : null),
}));
vi.mock("@/lib/auth/session-store", () => ({
  isPayloadSessionActive: async () => h.sessionActive,
}));
vi.mock("@/lib/api/keys", () => ({
  verifyApiKey: async () => h.apiKey,
  touchLastUsed: () => undefined,
}));

const { requirePlatformAuth } = await import("@/lib/api/auth");
const { TENANT_SELECTION_COOKIE, TENANT_PRECONDITION_HEADER } = await import("../contract");

const envelope = (userId: string, organizationId: string): string =>
  Buffer.from(JSON.stringify({ v: 1, u: userId, o: organizationId }), "utf8").toString(
    "base64url",
  );

/**
 * One request from one tab.
 *
 * `chosen` is what the browser's shared cookie says. `showing` is what THAT TAB
 * last rendered — the precondition. The two differing is the whole scenario.
 */
function tab(
  opts: { chosen?: string; showing?: string; apiKeyHeader?: string; method?: string } = {},
) {
  const jar: Record<string, string> = { [ACCESS_COOKIE_NAME]: "token" };
  if (opts.chosen) jar[TENANT_SELECTION_COOKIE] = envelope("user_1", opts.chosen);

  const headers = new Headers({ origin: "https://www.hermesnovin.com" });
  if (opts.showing !== undefined) headers.set(TENANT_PRECONDITION_HEADER, opts.showing);
  if (opts.apiKeyHeader) headers.set("X-API-Key", opts.apiKeyHeader);

  return {
    /*
     * PHASE 110-A1.0b R6 — the double states its METHOD.
     *
     * The write precondition is scoped by method and fails closed on an unknown
     * one, so a double that omits it is a request the server cannot classify.
     * These cases exercise tenant RESOLUTION rather than a write, so they say
     * GET; the cases that are about writes drive real handlers and say so.
     */
    method: opts.method ?? "GET",
    headers,
    cookies: { get: (n: string) => (jar[n] ? { value: jar[n] } : undefined) },
  } as never;
}

const orgOf = (r: Awaited<ReturnType<typeof requirePlatformAuth>>) =>
  "ctx" in r ? r.ctx.orgId : null;
const codeOf = (r: Awaited<ReturnType<typeof requirePlatformAuth>>) =>
  "code" in r ? r.code : null;
const statusOf = (r: Awaited<ReturnType<typeof requirePlatformAuth>>) =>
  "status" in r ? r.status : null;

beforeEach(() => reset());

describe("R5 — a stale tab cannot act on a platform route either", () => {
  it("THE SCENARIO: the cookie says B, the tab is still showing A", async () => {
    const res = await requirePlatformAuth(tab({ chosen: "org_b", showing: "org_a" }));

    expect(orgOf(res), "acting in org_b here is the whole defect").toBeNull();
    expect(codeOf(res)).toBe("ORGANIZATION_CONTEXT_CONFLICT");
    expect(statusOf(res)).toBe(409);
  });

  it("a matching precondition is an ordinary request", async () => {
    const res = await requirePlatformAuth(tab({ chosen: "org_b", showing: "org_b" }));
    expect(orgOf(res)).toBe("org_b");
  });

  it("NO precondition on a READ still acts — reads were never in scope", async () => {
    /*
     * PHASE 110-A1.0b R6 INVERTED HALF OF THIS CASE.
     *
     * R5 asserted that a header-less request still acted, and called it a
     * measured compatibility boundary. That was honest for its round and is no
     * longer acceptable for a WRITE — see the companion case below. Reads keep
     * the old behaviour, because a read that renders the wrong tenant is
     * already prevented by the membership check.
     */
    const res = await requirePlatformAuth(tab({ chosen: "org_b", method: "GET" }));
    expect(orgOf(res)).toBe("org_b");
  });

  it("NO precondition on a WRITE is refused — the R5 gap is closed", async () => {
    const res = await requirePlatformAuth(tab({ chosen: "org_b", method: "POST" }));

    expect(orgOf(res), "R5 measured org_b here and accepted it as a boundary").toBeNull();
    expect(codeOf(res)).toBe("ORGANIZATION_PRECONDITION_REQUIRED");
    expect(statusOf(res), "428 Precondition Required, which is literally what this is").toBe(428);
  });

  it("an EMPTY precondition asserts a value, and it is the wrong one", async () => {
    const res = await requirePlatformAuth(tab({ chosen: "org_b", showing: "" }));
    expect(codeOf(res)).toBe("ORGANIZATION_CONTEXT_CONFLICT");
  });

  it("a precondition naming a FOREIGN organization is refused and reveals nothing", async () => {
    const res = await requirePlatformAuth(
      tab({ chosen: "org_b", showing: "org_someone_elses" }),
    );

    expect(codeOf(res), "identical to any other mismatch").toBe("ORGANIZATION_CONTEXT_CONFLICT");
    expect(orgOf(res)).toBeNull();
  });

  it("the precondition is never consulted before the tenant is resolved", async () => {
    /*
     * Order, asserted. An unauthenticated caller must still be refused as
     * unauthenticated — if the header were compared first, a signed-out request
     * carrying a plausible id would answer 409 and confirm which organization
     * the browser was last in.
     */
    reset({ userId: null });
    const res = await requirePlatformAuth(tab({ chosen: "org_b", showing: "org_a" }));
    expect(statusOf(res)).toBe(401);
    expect(codeOf(res)).toBe("AUTHENTICATION_REQUIRED");
  });

  it("a revoked session outranks a matching precondition", async () => {
    reset({ sessionActive: false });
    const res = await requirePlatformAuth(tab({ chosen: "org_b", showing: "org_b" }));
    expect(statusOf(res)).toBe(401);
  });

  it("an ambiguous account is refused for AMBIGUITY, not for the precondition", async () => {
    /*
     * Both conditions hold at once: the reader has chosen nothing AND is
     * asserting a page. The refusal must name the one they can act on.
     */
    const res = await requirePlatformAuth(tab({ showing: "org_a" }));
    expect(codeOf(res)).toBe("ORGANIZATION_SELECTION_REQUIRED");
  });

  it("a conflict does not cause a second membership query", async () => {
    await requirePlatformAuth(tab({ chosen: "org_b", showing: "org_a" }));
    expect(h.findManyCalls, "one resolution per request, conflict or not").toBe(1);
  });
});

describe("R5 — one request, one identity", () => {
  /*
   * The failure mode this repair was most at risk of introducing, and the one
   * the review named explicitly: the platform path authenticates a token, the
   * tenant resolver establishes its own identity from the cookie, and if the
   * two are ever allowed to differ then a request authenticated as one person
   * could act in an organization resolved for another.
   *
   * These cases exist because a mutation control found the guard UNTESTED:
   * deleting `decision.userId !== payload.sub` left every suite green. A guard
   * nobody constrains is a comment with a syntax error budget.
   */
  it("a tenant decision describing a DIFFERENT user is refused, not adopted", async () => {
    /*
     * The mismatch is only REACHABLE when the other identity's decision is
     * granted — a refusal returns first. So user_2 holds exactly one
     * membership, which resolves without any selection, and the guard is the
     * only thing standing between that grant and this request.
     */
    reset({ userId: "user_1", cookieUserId: "user_2", otherUserRows: [ORG_A] });

    const res = await requirePlatformAuth(tab({ chosen: "org_b" }));

    expect(orgOf(res), "acting on another person's tenant decision").toBeNull();
    expect(codeOf(res)).toBe("FORBIDDEN");
    expect(statusOf(res)).toBe(403);
  });

  it("the refusal is FORBIDDEN, not a re-authentication prompt", async () => {
    /*
     * 401 would be wrong twice over: the caller authenticated perfectly well,
     * and sending them to sign in again would not change the mismatch.
     */
    reset({ userId: "user_1", cookieUserId: "user_2", otherUserRows: [ORG_B] });
    const res = await requirePlatformAuth(tab({ chosen: "org_a" }));
    expect(statusOf(res)).not.toBe(401);
    expect(statusOf(res)).toBe(403);
  });

  it("matching identities are the ordinary case and are unaffected", async () => {
    reset({ userId: "user_1", cookieUserId: "user_1" });
    const res = await requirePlatformAuth(tab({ chosen: "org_b" }));
    expect(orgOf(res)).toBe("org_b");
  });
});

describe("R5 — an API key is exempt BY AUTHENTICATION PATH, not by a header", () => {
  const KEY_A = { id: "key_1", organizationId: "org_a", scopes: ["read"] };

  it("a key resolves its own tenant even with a conflicting precondition", async () => {
    reset({ apiKey: KEY_A });

    const res = await requirePlatformAuth(
      tab({ chosen: "org_b", showing: "org_b", apiKeyHeader: "hk_live_example" }),
    );

    expect(
      orgOf(res),
      "the key's organization comes from the key row; nothing in the request may move it",
    ).toBe("org_a");
    expect("ctx" in res && res.ctx.authMethod).toBe("apikey");
  });

  it("a precondition naming the key's OWN organization changes nothing either", async () => {
    reset({ apiKey: KEY_A });
    const res = await requirePlatformAuth(
      tab({ showing: "org_a", apiKeyHeader: "hk_live_example" }),
    );
    expect(orgOf(res)).toBe("org_a");
    expect("ctx" in res && res.ctx.authMethod).toBe("apikey");
  });

  it("the key path performs NO membership listing at all", async () => {
    reset({ apiKey: KEY_A });
    await requirePlatformAuth(
      tab({ chosen: "org_b", showing: "org_b", apiKeyHeader: "hk_live_example" }),
    );
    expect(
      h.findManyCalls,
      "a machine credential has no selection to resolve, so it must not query for one",
    ).toBe(0);
  });

  it("an invalid key denies rather than falling back to the session's tenant", async () => {
    reset({ apiKey: null });
    const res = await requirePlatformAuth(
      tab({ chosen: "org_b", showing: "org_b", apiKeyHeader: "hk_live_revoked" }),
    );
    expect(orgOf(res)).toBeNull();
    expect(codeOf(res)).toBe("AUTHENTICATION_REQUIRED");
  });

  it("conflicting credentials: the key wins, and it is the KEY's tenant that applies", async () => {
    reset({ apiKey: KEY_A });
    const res = await requirePlatformAuth(
      tab({ chosen: "org_b", apiKeyHeader: "hk_live_example" }),
    );
    expect(orgOf(res)).toBe("org_a");
    expect("ctx" in res && res.ctx.userId, "an API key names no user").toBeNull();
  });
});
