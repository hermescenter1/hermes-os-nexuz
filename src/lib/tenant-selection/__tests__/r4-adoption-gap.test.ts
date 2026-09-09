/**
 * PHASE 110-A1.0b — ONE TENANT ANSWER FOR ONE REQUEST.
 *
 * WHAT THIS FILE WAS, AND WHY IT STILL EXISTS
 * In R4 this file RECORDED a defect it was not permitted to fix: two helpers
 * answered "which organization is this request for?" and disagreed.
 * `resolveOrgContext` honoured the reader's explicit selection;
 * `requirePlatformAuth` resolved
 *
 *     findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } })
 *
 * — the arbitrary earliest membership — on 69 routes, 45 of them mutating, and
 * never read the selection at all. The switcher said B and
 * `POST /api/industrial/assets` created the asset in A.
 *
 * R5 was authorised to repair it. The file is KEPT rather than deleted and
 * every case is inverted: each one now asserts the behaviour that must hold, so
 * the same scenarios that once documented the gap now defend the fix. A
 * reviewer can read the two versions side by side and see exactly what changed.
 *
 * THE INVARIANT, stated once: a request has ONE acting organization, and it is
 * the one the caller's own credential establishes.
 *   - a user session: the organization the reader explicitly selected, refused
 *     when they have several and have chosen none;
 *   - an API key: the organization on the key row, which no cookie may move.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACCESS_TOKEN_COOKIE as ACCESS_COOKIE_NAME } from "@/lib/auth/config";

interface Row {
  organizationId: string;
  role: string;
  status: string;
  createdAt: string;
}

interface Harness {
  userId: string | null;
  rows: Row[];
  sessionActive: boolean;
  db: boolean;
  /** The API-key row `verifyApiKey` should return, if any. */
  apiKey: { id: string; organizationId: string; scopes: string[] } | null;
}

let h: Harness;

/** A is the EARLIEST membership; B was joined later and is the one chosen. */
const ORG_A: Row = {
  organizationId: "org_a",
  role: "OWNER",
  status: "ACTIVE",
  createdAt: "2024-01-01T00:00:00.000Z",
};
const ORG_B: Row = {
  organizationId: "org_b",
  role: "OWNER",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function reset(over: Partial<Harness> = {}): void {
  h = {
    userId: "user_1",
    rows: [ORG_A, ORG_B],
    sessionActive: true,
    db: true,
    apiKey: null,
    ...over,
  };
}

const earliest = (rows: Row[]) =>
  [...rows].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0] ?? null;

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () =>
    h.db
      ? {
          organizationMember: {
            /*
             * Both shapes are served so this file can detect a REGRESSION to
             * the old lookup. If `findFirst` is ever reached again it returns
             * the earliest membership, exactly as the removed code did, and the
             * assertions below fail loudly instead of quietly agreeing.
             */
            findFirst: async () => earliest(h.rows.filter((r) => r.status === "ACTIVE")),
            findMany: async () => h.rows,
          },
          organization: {
            findUnique: async (a: { where: { id: string } }) => ({
              id: a.where.id,
              slug: `slug-${a.where.id}`,
            }),
          },
        }
      : null,
}));
vi.mock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database" }));
vi.mock("@/lib/org/context", () => ({
  /*
   * Mirrors the REAL helper, and the mirroring is the point: cookie only (no
   * bearer fallback), and only for a live session. The cookie NAME is imported
   * rather than typed out — a first version of this file guessed
   * "hermes_access" while the real constant is "hermes_at", so every request
   * looked unauthenticated and every case failed for the wrong reason.
   */
  getUserIdFromRequest: async (req: {
    cookies: { get: (n: string) => { value: string } | undefined };
  }) => (h.userId && h.sessionActive && req.cookies.get(ACCESS_COOKIE_NAME) ? h.userId : null),
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

const { resolveOrgContext } = await import("@/lib/billing/context");
const { requirePlatformAuth } = await import("@/lib/api/auth");
const { TENANT_SELECTION_COOKIE } = await import("../contract");
const ACCESS_TOKEN_COOKIE = ACCESS_COOKIE_NAME;

const envelope = (userId: string, organizationId: string): string =>
  Buffer.from(JSON.stringify({ v: 1, u: userId, o: organizationId }), "utf8").toString(
    "base64url",
  );

/** One request: a session cookie, optionally a selection, optionally a key. */
function req(
  opts: { chosen?: string; session?: boolean; apiKeyHeader?: string; method?: string } = {},
) {
  const jar: Record<string, string> = {};
  if (opts.session !== false) jar[ACCESS_TOKEN_COOKIE] = "token";
  if (opts.chosen) jar[TENANT_SELECTION_COOKIE] = envelope("user_1", opts.chosen);

  const headers = new Headers({ origin: "https://www.hermesnovin.com" });
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

beforeEach(() => reset());

/* ── The user session ────────────────────────────────────────────────────── */

describe("a user session: both resolvers give the organization the reader chose", () => {
  it("selection B is honoured by the platform path, not just by billing", async () => {
    const chosen = req({ chosen: "org_b" });

    const billing = await resolveOrgContext(chosen);
    const platform = await requirePlatformAuth(chosen);

    expect(billing.ok && billing.ctx.orgId).toBe("org_b");
    expect(
      orgOf(platform),
      "R4 measured org_a here — the earliest membership, ignoring the choice",
    ).toBe("org_b");
  });

  it("selection A is honoured too, so this is a CHOICE and not a new default", async () => {
    /*
     * A passes trivially against the old code, because A *is* the earliest
     * membership. It is kept precisely so the pair is meaningful: only the two
     * cases together show the answer following the reader rather than the
     * insertion order.
     */
    const platform = await requirePlatformAuth(req({ chosen: "org_a" }));
    expect(orgOf(platform)).toBe("org_a");
  });

  it("the two resolvers AGREE for every choice", async () => {
    for (const choice of ["org_a", "org_b"]) {
      const r = req({ chosen: choice });
      const billing = await resolveOrgContext(r);
      const platform = await requirePlatformAuth(r);
      expect(billing.ok && billing.ctx.orgId).toBe(choice);
      expect(orgOf(platform), `disagreement on ${choice}`).toBe(choice);
    }
  });

  it("several memberships and NO choice is refused, never picked", async () => {
    const platform = await requirePlatformAuth(req());

    expect(orgOf(platform), "an arbitrary pick is exactly the defect").toBeNull();
    expect(codeOf(platform)).toBe("ORGANIZATION_SELECTION_REQUIRED");
    expect("status" in platform && platform.status).toBe(409);
  });

  it("a FOREIGN selection is refused and does not fall back to the earliest", async () => {
    const platform = await requirePlatformAuth(req({ chosen: "org_not_mine" }));
    expect(orgOf(platform)).toBeNull();
    expect(codeOf(platform)).toBe("ORGANIZATION_SELECTION_REQUIRED");
  });

  it("a SUSPENDED selection is refused and does not fall back to the survivor", async () => {
    reset({ rows: [ORG_A, { ...ORG_B, status: "SUSPENDED" }] });

    const platform = await requirePlatformAuth(req({ chosen: "org_b" }));
    expect(
      orgOf(platform),
      "silently returning org_a is how the reader ends up in a tenant they did not choose",
    ).toBeNull();
    expect(codeOf(platform)).toBe("ORGANIZATION_SELECTION_REQUIRED");
  });

  it("a single membership still resolves with no selection at all", async () => {
    reset({ rows: [ORG_A] });
    const platform = await requirePlatformAuth(req());
    expect(orgOf(platform), "one membership is unambiguous and needs no choice").toBe("org_a");
  });

  it("no membership is its own refusal, distinct from needing a choice", async () => {
    reset({ rows: [] });
    const platform = await requirePlatformAuth(req());
    expect(codeOf(platform)).toBe("ORGANIZATION_CONTEXT_REQUIRED");
    expect("status" in platform && platform.status).toBe(409);
  });

  it("a database outage is NOT reported as having no organization", async () => {
    reset({ db: false });
    const platform = await requirePlatformAuth(req({ chosen: "org_b" }));

    expect(codeOf(platform), "an outage is not a fact about the account").not.toBe(
      "ORGANIZATION_CONTEXT_REQUIRED",
    );
    expect(codeOf(platform)).toBe("ORGANIZATION_CONTEXT_UNAVAILABLE");
    expect("status" in platform && platform.status).toBe(503);
  });

  it("a revoked session is refused before any tenant is considered", async () => {
    reset({ sessionActive: false });
    const platform = await requirePlatformAuth(req({ chosen: "org_b" }));

    expect(orgOf(platform)).toBeNull();
    expect(codeOf(platform)).toBe("AUTHENTICATION_REQUIRED");
    expect("status" in platform && platform.status).toBe(401);
  });
});

/* ── The API key ─────────────────────────────────────────────────────────── */

describe("an API key carries its own tenant, and no cookie may move it", () => {
  const KEY_A = { id: "key_1", organizationId: "org_a", scopes: ["read"] };

  it("a key issued for A resolves A even when the cookie selects B", async () => {
    reset({ apiKey: KEY_A });

    const platform = await requirePlatformAuth(
      req({ chosen: "org_b", apiKeyHeader: "hk_live_example" }),
    );

    expect(
      orgOf(platform),
      "a browser cookie must never redirect a machine credential's tenant",
    ).toBe("org_a");
    expect("ctx" in platform && platform.ctx.authMethod).toBe("apikey");
  });

  it("the key's tenant survives a cookie selecting an organization it does not hold", async () => {
    reset({ apiKey: KEY_A, rows: [ORG_A, ORG_B] });
    const platform = await requirePlatformAuth(
      req({ chosen: "org_b", apiKeyHeader: "hk_live_example" }),
    );
    expect(orgOf(platform)).toBe("org_a");
  });

  it("a key with no session cookie at all still resolves its own tenant", async () => {
    reset({ apiKey: KEY_A });
    const platform = await requirePlatformAuth(
      req({ session: false, apiKeyHeader: "hk_live_example" }),
    );
    expect(orgOf(platform)).toBe("org_a");
  });

  it("an INVALID key denies, and does not fall through to the session", async () => {
    reset({ apiKey: null });

    const platform = await requirePlatformAuth(
      req({ chosen: "org_b", apiKeyHeader: "hk_live_revoked" }),
    );

    expect(orgOf(platform), "a bad key must not borrow the browser's session").toBeNull();
    expect(codeOf(platform)).toBe("AUTHENTICATION_REQUIRED");
  });

  it("the key's scopes are preserved, not replaced by session scopes", async () => {
    reset({ apiKey: { id: "key_2", organizationId: "org_a", scopes: ["read", "write"] } });
    const platform = await requirePlatformAuth(req({ apiKeyHeader: "hk_live_example" }));
    expect("ctx" in platform && platform.ctx.scopes).toEqual(["read", "write"]);
    expect("ctx" in platform && platform.ctx.userId).toBeNull();
  });

  it("API key WINS over a session when both are present — the existing contract", async () => {
    /*
     * Extracted from `resolvePlatformContext`, not invented: it checks
     * `X-API-Key` first, then a Bearer beginning with the key prefix, and only
     * then falls back to the JWT. This pins that order so the repair cannot
     * quietly change it.
     */
    reset({ apiKey: KEY_A });
    const platform = await requirePlatformAuth(
      req({ chosen: "org_b", apiKeyHeader: "hk_live_example" }),
    );
    expect("ctx" in platform && platform.ctx.authMethod).toBe("apikey");
    expect(orgOf(platform)).toBe("org_a");
  });
});

/* ── The old lookup must not come back ───────────────────────────────────── */

describe("the arbitrary earliest-membership pick is gone", () => {
  it("no user-session path returns the earliest membership when another was chosen", async () => {
    const platform = await requirePlatformAuth(req({ chosen: "org_b" }));
    expect(orgOf(platform)).not.toBe(earliest(h.rows)?.organizationId);
  });

  it("ambiguity is answered with a refusal in BOTH helpers, identically", async () => {
    const r = req();
    const billing = await resolveOrgContext(r);
    const platform = await requirePlatformAuth(r);

    expect(billing.ok).toBe(false);
    expect(!billing.ok && billing.reason).toBe("ORGANIZATION_SELECTION_REQUIRED");
    expect(codeOf(platform)).toBe("ORGANIZATION_SELECTION_REQUIRED");
  });
});
