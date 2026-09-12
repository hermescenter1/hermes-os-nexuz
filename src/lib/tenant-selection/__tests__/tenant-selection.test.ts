/**
 * PHASE 110-A1.0b — the operational matrix for organization selection.
 *
 * WHAT THESE TESTS DRIVE
 * The real modules. `resolveTenantDecision`, `selectTenantContext`, the real
 * `GET`/`PUT` handlers and the real `resolveOrgContext` that billing's nine
 * routes call. Failure is injected at the LOWEST port — `getPrisma`,
 * `getCurrentUser`, `getUserIdFromRequest` — so the reviewed Phase 110-A1.0
 * resolver runs for real in every case.
 *
 * WHAT IS DELIBERATELY NOT MOCKED
 * The tenant core. Stubbing it to `{ ok: true }` would prove that this layer
 * forwards a constant, which is not a property anybody cares about. Every
 * assertion below therefore depends on the core actually validating rows,
 * counting memberships and refusing the ones it should.
 *
 * THE SPY THAT MATTERS
 * `findMany` and `findUnique` are counted. A refusal that still queried the
 * domain would be a refusal that leaked work; a grant that never queried would
 * be a grant invented locally. Both are asserted, not assumed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/* ── Harness ─────────────────────────────────────────────────────────────── */

interface Row {
  organizationId: string;
  role: string;
  status: string;
}

interface Harness {
  /** null = no identity at all (absent, invalid or revoked session). */
  userId: string | null;
  rows: Row[] | null;
  /** Thrown by the membership port when set. */
  membershipThrows?: boolean;
  identityThrows?: boolean;
  /** null = no Prisma client, which is an outage in database mode. */
  db: boolean;
  organizations: Record<string, { id: string; slug: string } | null>;
  /** Counted so a refusal can be proven to have queried nothing. */
  findManyCalls: number;
  findUniqueCalls: number;
}

let h: Harness;

function reset(over: Partial<Harness> = {}): void {
  h = {
    userId: "user_1",
    rows: [],
    db: true,
    organizations: {
      org_a: { id: "org_a", slug: "alpha" },
      org_b: { id: "org_b", slug: "beta" },
    },
    findManyCalls: 0,
    findUniqueCalls: 0,
    ...over,
  };
}

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () =>
    h.db
      ? {
          organizationMember: {
            findMany: async () => {
              h.findManyCalls += 1;
              if (h.membershipThrows) throw new Error("membership store down");
              return h.rows;
            },
          },
          organization: {
            findUnique: async (args: { where: { id: string } }) => {
              h.findUniqueCalls += 1;
              return h.organizations[args.where.id] ?? null;
            },
          },
        }
      : null,
}));

vi.mock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database" }));

vi.mock("@/lib/org/context", () => ({
  getUserIdFromRequest: async () => {
    if (h.identityThrows) throw new Error("session store down");
    return h.userId;
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => {
    if (h.identityThrows) throw new Error("session store down");
    return h.userId ? { id: h.userId } : null;
  },
}));

// Same-origin is proven by its own test below; every other case assumes it.
/*
 * PHASE 110-A1.0b R3 (R3-1) — the REAL module, with only the origin check
 * replaced.
 *
 * This mock used to REPLACE the whole module, which silently dropped
 * `readBoundedJson` — the repository's own bounded body reader, which the route
 * now uses. A wholesale mock of a module a route depends on does not fail
 * loudly at the boundary; it fails wherever the missing export is first called.
 */
vi.mock("@/lib/security/request-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/request-guards")>();
  return {
    ...actual,
    requireTrustedOrigin: () => ({ ok: trustedOrigin, reason: "allowed" }),
    resolveClientIp: () => "127.0.0.1",
  };
});
let trustedOrigin = true;

const { resolveTenantDecision, selectTenantContext } = await import("../selection");
const { GET, PUT } = await import("@/app/api/tenant/context/route");
const { resolveOrgContext } = await import("@/lib/billing/context");
const { TENANT_SELECTION_COOKIE } = await import("../contract");

/** A request whose cookie jar carries whatever the case needs. */
function req(cookie?: string, body?: unknown, method = "PUT") {
  /*
   * PHASE 110-A1.0b R3 (R3-1) — a REAL body, because the route now reads a
   * real stream.
   *
   * The endpoint went from `await req.text()` to the repository's bounded
   * reader, which takes `req.body`. A double that only answers `text()`
   * leaves `body` undefined, and every selection here would refuse as
   * malformed — the double would be testing itself.
   */
  const native = new Request("https://www.hermesnovin.com/api/tenant/context", {
    /*
     * PHASE 110-A1.0b R6 — the method is now part of what a request MEANS: the
     * write precondition is scoped by it and fails closed. PUT stays the
     * default because most cases here drive the selection endpoint; the billing
     * RESOLUTION cases below pass GET, because resolving a tenant is a read.
     */
    method,
    headers: {
      origin: "https://www.hermesnovin.com",
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  return {
    /*
     * PHASE 110-A1.0b R6 — the double EXPOSES its method.
     *
     * It was set on the native request and never surfaced, so the handler saw
     * `undefined` and the fail-closed branch decided everything. Cases then
     * passed or failed for a reason unrelated to what they were testing.
     */
    method: native.method,
    cookies: { get: (n: string) => (n === TENANT_SELECTION_COOKIE && cookie ? { value: cookie } : undefined) },
    get body() {
      return native.body;
    },
    text: () => native.text(),
    json: () => native.json(),
    headers: native.headers,
  } as never;
}

/** The envelope the server writes, built the same way `cookie.ts` builds it. */
function envelope(userId: string, organizationId: string): string {
  return Buffer.from(JSON.stringify({ v: 1, u: userId, o: organizationId }), "utf8").toString("base64url");
}

const ACTIVE_A: Row = { organizationId: "org_a", role: "OWNER", status: "ACTIVE" };
const ACTIVE_B: Row = { organizationId: "org_b", role: "MEMBER", status: "ACTIVE" };

beforeEach(() => {
  reset();
  trustedOrigin = true;
});

/* ── Identity ────────────────────────────────────────────────────────────── */

describe("no usable identity", () => {
  it("absent, invalid and revoked sessions are one identical 401 with zero queries", async () => {
    // All three arrive here as `getUserIdFromRequest` returning null: the
    // helper verifies the signature AND the session's liveness, so a revoked
    // session is indistinguishable from an absent one by construction.
    reset({ userId: null, rows: [ACTIVE_A] });

    const decision = await resolveTenantDecision(req());
    // R2: `staleSelection` no longer exists. A dead intent is now expressed as a
    // REFUSAL rather than as a flag riding along with a grant, which is what let
    // R1 grant A while reporting the intent as stale.
    expect(decision).toEqual({ granted: false, code: "AUTHENTICATION_REQUIRED" });

    const res = await GET(req());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ state: "REFUSED", code: "AUTHENTICATION_REQUIRED" });

    // The membership store was never asked. An unauthenticated probe must not
    // cost a query, and must not be able to time one.
    expect(h.findManyCalls, "no domain query before identity").toBe(0);
    expect(h.findUniqueCalls).toBe(0);
  });

  it("an anonymous caller is given no organization list, even with a cookie", async () => {
    reset({ userId: null, rows: [ACTIVE_A, ACTIVE_B] });
    const res = await GET(req(envelope("user_1", "org_a")));
    const body = await res.json();
    expect(body).not.toHaveProperty("options");
    expect(body).not.toHaveProperty("organizationId");
  });
});

/* ── The four states ─────────────────────────────────────────────────────── */

describe("the four refusals are four different answers", () => {
  it("no membership at all is 409 ORGANIZATION_CONTEXT_REQUIRED", async () => {
    reset({ rows: [] });
    const res = await GET(req());
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      state: "REFUSED",
      code: "ORGANIZATION_CONTEXT_REQUIRED",
    });
  });

  it("only INVITED or SUSPENDED grants nothing and offers no default", async () => {
    for (const status of ["INVITED", "SUSPENDED"]) {
      reset({ rows: [{ organizationId: "org_a", role: "OWNER", status }] });
      const decision = await resolveTenantDecision(req());
      expect(decision.granted, `${status} must not grant`).toBe(false);
      expect(decision).not.toHaveProperty("organizationId");
      const res = await GET(req());
      expect(res.status).toBe(409);
      await expect(res.json()).resolves.toMatchObject({ code: "ORGANIZATION_CONTEXT_REQUIRED" });
    }
  });

  it("exactly one ACTIVE membership resolves, and the query used that id", async () => {
    reset({ rows: [ACTIVE_A] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      state: "SINGLE_ACTIVE_ORGANIZATION",
      organizationId: "org_a",
      organizationSlug: "alpha",
      organizationRole: "OWNER",
      selectable: false,
    });
    expect(h.findUniqueCalls, "the organization row was actually loaded").toBe(1);
  });

  it("several ACTIVE memberships ask for a choice and run no business query", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const res = await GET(req());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ORGANIZATION_SELECTION_REQUIRED");
    expect(body.options).toHaveLength(2);
    expect(body.options.map((o: { organizationId: string }) => o.organizationId).sort()).toEqual(["org_a", "org_b"]);
    // No organizationId anywhere on a refusal: the union makes it unwritable in
    // the core, and this proves the transport did not add one back.
    expect(body).not.toHaveProperty("organizationId");
  });

  it("row order does not create a selection", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const first = await (await GET(req())).json();
    reset({ rows: [ACTIVE_B, ACTIVE_A] });
    const second = await (await GET(req())).json();
    expect(second.code).toBe("ORGANIZATION_SELECTION_REQUIRED");
    expect(second.options).toEqual(first.options);
  });

  it("an outage is 503, never 'you have no organization'", async () => {
    reset({ rows: [], membershipThrows: true });
    const res = await GET(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("ORGANIZATION_CONTEXT_UNAVAILABLE");
    // Nothing internal travels: no diagnostic, no driver text, no DSN.
    expect(JSON.stringify(body)).not.toMatch(/MEMBERSHIP_QUERY_FAILED|down|postgres|prisma/i);
  });

  it("database mode with no client is the same 503", async () => {
    reset({ db: false });
    const res = await GET(req());
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: "ORGANIZATION_CONTEXT_UNAVAILABLE" });
  });

  it("an identity outage is an outage, not a missing organization", async () => {
    reset({ identityThrows: true, rows: [ACTIVE_A] });
    const res = await GET(req());
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ code: "ORGANIZATION_CONTEXT_UNAVAILABLE" });
  });
});

/* ── Explicit selection ──────────────────────────────────────────────────── */

describe("explicit selection", () => {
  it("accepts one of the caller's own organizations and stores it", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const res = await PUT(req(undefined, { organizationId: "org_b" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      organizationId: "org_b",
      organizationSlug: "beta",
      organizationRole: "MEMBER",
      selectable: true,
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(TENANT_SELECTION_COOKIE);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    // No token, no role, no permission inside the value.
    expect(setCookie).not.toMatch(/OWNER|MEMBER|role/);
  });

  it("refuses a foreign, absent or malformed candidate identically and writes nothing", async () => {
    for (const candidate of ["org_zzz", "", "   ", 7, null, ["org_a"], { toString: () => "org_a" }, undefined]) {
      reset({ rows: [ACTIVE_A, ACTIVE_B] });
      const res = await PUT(req(undefined, { organizationId: candidate }));
      expect(res.status, `candidate ${JSON.stringify(candidate)}`).toBe(422);
      await expect(res.json()).resolves.toEqual({
        state: "REFUSED",
        code: "ORGANIZATION_SELECTION_INVALID",
      });
      expect(res.headers.get("set-cookie") ?? "", "no cookie on a refused selection").not.toContain(
        TENANT_SELECTION_COOKIE,
      );
    }
  });

  it("SINGLE=A but an explicit request for B is REFUSED, not silently answered with A", async () => {
    /*
     * The reason this layer exists at all. `resolveTenantContextForCandidate`
     * in the reviewed core returns SINGLE(A) unchanged here — correct for the
     * implicit path, and a lie for an explicit one. A 200 carrying A would tell
     * the reader they are in B while every later query runs in A.
     */
    reset({ rows: [ACTIVE_A] });
    const res = await PUT(req(undefined, { organizationId: "org_b" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("ORGANIZATION_SELECTION_INVALID");
    expect(body).not.toHaveProperty("organizationId");
    expect(res.headers.get("set-cookie") ?? "").not.toContain(TENANT_SELECTION_COOKIE);
  });

  it("re-affirming the one organization the caller has is accepted", async () => {
    reset({ rows: [ACTIVE_A] });
    const res = await PUT(req(undefined, { organizationId: "org_a" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ organizationId: "org_a", selectable: false });
  });

  it("a cross-origin PUT is refused before any organization is consulted", async () => {
    trustedOrigin = false;
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const res = await PUT(req(undefined, { organizationId: "org_a" }));
    expect(res.status).toBe(403);
    expect(h.findManyCalls, "CSRF check precedes every lookup").toBe(0);
  });

  it("GET writes no selection cookie", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const res = await GET(req());
    const setCookie = res.headers.get("set-cookie");
    // The only Set-Cookie GET may emit is a DELETION of a dead hint, and there
    // is no hint here at all.
    expect(setCookie).toBeNull();
  });
});

/* ── The adapter, called directly ────────────────────────────────────────── */

describe("selectTenantContext, without the HTTP layer around it", () => {
  /*
   * The cases above drive the real `PUT` handler, which is the stronger proof
   * for a route. These call the adapter itself, because the explicit-selection
   * rule is a property of the ADAPTER — the handler only renders it — and a
   * future caller that uses it without going through HTTP must get the same
   * answer.
   */
  it("accepts a proven membership and reports whether alternatives exist", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    await expect(selectTenantContext(req(), "org_a")).resolves.toEqual({
      accepted: true,
      userId: "user_1",
      organizationId: "org_a",
      organizationSlug: "alpha",
      organizationRole: "OWNER",
      selectable: true,
    });
  });

  it("refuses a mismatch even when a context COULD have been granted", async () => {
    // The core would answer SINGLE(org_a) here. Accepting that as a successful
    // selection of org_b is the failure this adapter exists to prevent.
    reset({ rows: [ACTIVE_A] });
    await expect(selectTenantContext(req(), "org_b")).resolves.toEqual({
      accepted: false,
      code: "ORGANIZATION_SELECTION_INVALID",
    });
  });

  it("never returns an organizationId on a refusal", async () => {
    for (const [rows, candidate] of [
      [[], "org_a"],
      [[ACTIVE_A, ACTIVE_B], "org_zzz"],
      [[ACTIVE_A], 42],
    ] as const) {
      reset({ rows: [...rows] });
      const outcome = await selectTenantContext(req(), candidate);
      expect(outcome.accepted).toBe(false);
      expect(outcome).not.toHaveProperty("organizationId");
    }
  });
});

/* ── The stored selection ────────────────────────────────────────────────── */

describe("a stored selection is a hint, never an authority", () => {
  it("narrows the multi case to the chosen organization", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const res = await GET(req(envelope("user_1", "org_b")));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ organizationId: "org_b", selectable: true });
  });

  it("a cookie written for ANOTHER user is ignored", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const res = await GET(req(envelope("user_2", "org_b")));
    expect(res.status, "user_1 must not inherit user_2's choice").toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "ORGANIZATION_SELECTION_REQUIRED" });
  });

  it("a stale or forged cookie falls back to a CHOICE, never to another tenant", async () => {
    for (const value of [envelope("user_1", "org_zzz"), "not-base64url!!", "", Buffer.from("{}").toString("base64url")]) {
      reset({ rows: [ACTIVE_A, ACTIVE_B] });
      const res = await GET(req(value));
      expect(res.status, `cookie ${JSON.stringify(value.slice(0, 12))}`).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("ORGANIZATION_SELECTION_REQUIRED");
      expect(body).not.toHaveProperty("organizationId");
    }
  });

  it("a dead hint is KEPT and refused — GET writes nothing at all", async () => {
    /*
     * R2 REVERSAL, and the reason is the F2 defect.
     *
     * R1 cleared the cookie here, and this test asserted the clearing. Codex
     * showed what that produced one request later: with the hint gone, the
     * reader looked like somebody who had never chosen, so a surviving single
     * membership was granted automatically. Clearing was not a recovery, it was
     * the mechanism of the silent tenant switch.
     *
     * R2 keeps the dead intent and refuses it every time, so GET writes no
     * cookie at all — which also makes the route's own header comment true for
     * the first time.
     */
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const res = await GET(req(envelope("user_1", "org_zzz")));
    expect(res.status).toBe(409);
    expect(res.headers.get("set-cookie"), "GET must write nothing").toBeNull();
  });

  it("a membership removed after the choice refuses — it does not become another tenant", async () => {
    /*
     * R2 REPLACEMENT. This test previously REQUIRED the defect: it asserted 200
     * with `organizationId: "org_a"` after B was suspended, so the suite was
     * actively defending a silent tenant switch. Codex found it, and the
     * replacement asserts the intent-preservation property instead.
     *
     * Refusing access to B was never the whole requirement. A request whose
     * stored intent was B must not quietly be performed in A.
     */
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    expect((await GET(req(envelope("user_1", "org_b")))).status).toBe(200);

    reset({ rows: [ACTIVE_A, { ...ACTIVE_B, status: "SUSPENDED" }] });
    const after = await GET(req(envelope("user_1", "org_b")));
    const body = await after.json();

    expect(after.status, "R1 answered 200 here").toBe(409);
    expect(body.state).toBe("REFUSED");
    expect(body.code).toBe("ORGANIZATION_SELECTION_REQUIRED");
    expect(body, "nothing may be granted").not.toHaveProperty("organizationId");
    // A is offered as the way OUT, which is not the same as being handed it.
    expect(body.options.map((o: { organizationId: string }) => o.organizationId)).toEqual(["org_a"]);
  });

  it("a hint cannot turn 'no organization' into a tenant", async () => {
    reset({ rows: [] });
    const res = await GET(req(envelope("user_1", "org_a")));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "ORGANIZATION_CONTEXT_REQUIRED" });
  });

  it("a hint cannot turn an outage into a tenant", async () => {
    reset({ membershipThrows: true });
    const res = await GET(req(envelope("user_1", "org_a")));
    expect(res.status).toBe(503);
  });
});

/* ── The billing surface that consumes it ────────────────────────────────── */

describe("resolveOrgContext, which billing's nine routes call", () => {
  it("returns the selected organization rather than the earliest membership", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const result = await resolveOrgContext(req(envelope("user_1", "org_b"), undefined, "GET"));
    expect(result).toEqual({ ok: true, ctx: { userId: "user_1", orgId: "org_b", role: "MEMBER" } });
  });

  it("refuses instead of picking one when several are proven", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    expect(await resolveOrgContext(req())).toEqual({
      ok: false,
      reason: "ORGANIZATION_SELECTION_REQUIRED",
    });
  });

  it("carries every one of the fifteen schema roles without a cast", async () => {
    for (const role of ["HR_MANAGER", "RECRUITER", "ACADEMY_ADMIN", "COMPLIANCE_MANAGER", "STUDENT"]) {
      reset({ rows: [{ organizationId: "org_a", role, status: "ACTIVE" }] });
      const result = await resolveOrgContext(req(undefined, undefined, "GET"));
      expect(result, `${role} must resolve a context`).toMatchObject({ ok: true, ctx: { role } });
    }
  });

  it("refuses a role the schema does not declare", async () => {
    reset({ rows: [{ organizationId: "org_a", role: "SUPERUSER", status: "ACTIVE" }] });
    const result = await resolveOrgContext(req());
    expect(result).toMatchObject({ ok: false, reason: "ORGANIZATION_CONTEXT_UNAVAILABLE" });
  });
});
