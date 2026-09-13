/**
 * PHASE 110-A1.0b R2 — the four defects Codex found in R1, as failing tests
 * written BEFORE the fix.
 *
 * Each case here asserts the user-visible property, not the shape of the code
 * that happens to implement it. They were run against unchanged R1 first and
 * recorded RED; the measured R1 values are quoted in each case so a reviewer can
 * see what the old behaviour actually was rather than taking the description on
 * trust.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  organizationId: string;
  role: string;
  status: string;
}

interface Harness {
  userId: string | null;
  rows: Row[] | null;
  membershipThrows?: boolean;
  db: boolean;
  organizations: Record<string, { id: string; slug: string } | null>;
  findManyCalls: number;
  /** How many times the request body was actually consumed. */
  bodyReads: number;
}

let h: Harness;
let trustedOrigin = true;

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
    bodyReads: 0,
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
            findUnique: async (a: { where: { id: string } }) => h.organizations[a.where.id] ?? null,
          },
        }
      : null,
}));
vi.mock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database" }));
vi.mock("@/lib/org/context", () => ({ getUserIdFromRequest: async () => h.userId }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: async () => (h.userId ? { id: h.userId } : null),
}));
/*
 * PHASE 110-A1.0b R3 (R3-1) — the REAL module, with only the origin check
 * replaced. Replacing it wholesale dropped `readBoundedJson`, which the route
 * now uses to bound the body during the read rather than after it.
 */
vi.mock("@/lib/security/request-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/request-guards")>();
  return {
    ...actual,
    requireTrustedOrigin: () => ({ ok: trustedOrigin, reason: "allowed" }),
    resolveClientIp: () => "127.0.0.1",
  };
});

const { GET, PUT } = await import("@/app/api/tenant/context/route");
const { resolveTenantDecision } = await import("../selection");
const { resolveOrgContext } = await import("@/lib/billing/context");
const { TENANT_SELECTION_COOKIE } = await import("../contract");
const cookieModule = await import("../cookie");

function envelope(userId: string, organizationId: string): string {
  return Buffer.from(JSON.stringify({ v: 1, u: userId, o: organizationId }), "utf8").toString("base64url");
}

/** A request whose body read is counted, so "was it consumed?" is measurable. */
function req(cookie?: string, body?: unknown) {
  /*
   * PHASE 110-A1.0b R3 (R3-1) — a REAL body, and the counter moved onto the
   * STREAM.
   *
   * R2's double answered `text()` with a whole string in one shot, so "was the
   * body consumed?" could only ever be yes-or-no. That is exactly why an R2
   * test could assert the body was bounded while the handler ingested 256 KB:
   * the double had no way to express streaming. Counting a pull on the real
   * stream measures ingestion instead of intent.
   */
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const stream =
    payload === undefined
      ? undefined
      : new ReadableStream<Uint8Array>(
          {
            pull(controller) {
              h.bodyReads += 1;
              controller.enqueue(new TextEncoder().encode(payload));
              controller.close();
            },
          },
          { highWaterMark: 0 },
        );

  const native = new Request("https://www.hermesnovin.com/api/tenant/context", {
    method: "PUT",
    headers: {
      origin: "https://www.hermesnovin.com",
      "content-type": "application/json",
    },
    ...(stream === undefined ? {} : { body: stream, duplex: "half" }),
  } as RequestInit & { duplex?: "half" });

  return {
    cookies: {
      get: (n: string) => (n === TENANT_SELECTION_COOKIE && cookie ? { value: cookie } : undefined),
    },
    get body() {
      return native.body;
    },
    text: () => native.text(),
    json: () => native.json(),
    headers: native.headers,
  } as never;
}

const ACTIVE_A: Row = { organizationId: "org_a", role: "OWNER", status: "ACTIVE" };
const ACTIVE_B: Row = { organizationId: "org_b", role: "MEMBER", status: "ACTIVE" };

beforeEach(() => {
  reset();
  trustedOrigin = true;
});

/* ── F1 ──────────────────────────────────────────────────────────────────── */

describe("F1 — a reader who has already chosen can still see their alternatives", () => {
  /*
   * R1 MEASURED (Codex, and reproduced here before the fix):
   *   {"state":"SINGLE_ACTIVE_ORGANIZATION","organizationId":"org_a",
   *    "organizationSlug":"alpha","organizationRole":"OWNER","selectable":true}
   * — `selectable: true` and NO options. The switcher reads a 200 without
   * options as "ready, nothing to choose", so after the first successful
   * selection the control could never switch again.
   */
  it("GET returns the proven alternatives alongside a granted context", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const res = await GET(req(envelope("user_1", "org_a")));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.organizationId).toBe("org_a");
    expect(body.selectable, "several memberships means switchable").toBe(true);
    expect(Array.isArray(body.options), "R1 omitted options entirely").toBe(true);
    expect(body.options.map((o: { organizationId: string }) => o.organizationId).sort()).toEqual([
      "org_a",
      "org_b",
    ]);
  });

  it("a single-membership reader is offered no alternatives at all", async () => {
    // The list must not appear where there is nothing to choose: a switcher
    // rendered for one organization is a control that cannot do anything.
    reset({ rows: [ACTIVE_A] });
    const body = await (await GET(req())).json();
    expect(body.selectable).toBe(false);
    expect(body.options).toBeUndefined();
  });

  it("still withholds the list from callers who have not proven anything", async () => {
    // The point of F1 is not "always send options". Unauthenticated, no-membership
    // and outage answers must stay list-free.
    reset({ userId: null, rows: [ACTIVE_A, ACTIVE_B] });
    expect(await (await GET(req())).json()).not.toHaveProperty("options");

    reset({ rows: [] });
    expect(await (await GET(req())).json()).not.toHaveProperty("options");

    reset({ membershipThrows: true });
    expect(await (await GET(req())).json()).not.toHaveProperty("options");
  });
});

/* ── F2 ──────────────────────────────────────────────────────────────────── */

describe("F2 — a selection that stops granting must not silently become another tenant", () => {
  /*
   * R1 MEASURED:
   *   {"granted":true,"organizationId":"org_a","selectable":false,
   *    "staleSelection":true}
   * A request whose stored intent was B was answered with A. Worse, R1's own
   * test asserted that outcome, so the suite defended the defect.
   *
   * The user never left B. Refusing access to B is not enough — the work must
   * not be silently performed somewhere else.
   */
  it("suspending the selected organization refuses, it does not fall back", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    expect((await GET(req(envelope("user_1", "org_b")))).status, "B grants first").toBe(200);

    reset({ rows: [ACTIVE_A, { ...ACTIVE_B, status: "SUSPENDED" }] });
    const res = await GET(req(envelope("user_1", "org_b")));
    const body = await res.json();

    expect(res.status, "R1 answered 200 with org_a here").toBe(409);
    expect(body.code).toBe("ORGANIZATION_SELECTION_REQUIRED");
    /*
     * The property is that nothing is GRANTED, not that `org_a` never appears.
     * My first draft asserted the string was absent and was wrong: A is listed
     * as the recovery OPTION, which is the whole point — the reader has to be
     * able to choose their way out. What must not happen is A arriving as a
     * granted context, and that is what is asserted here.
     */
    expect(body.state).toBe("REFUSED");
    expect(body).not.toHaveProperty("organizationId");
    expect(body.options.map((o: { organizationId: string }) => o.organizationId)).toEqual(["org_a"]);
  });

  it("the refusal is repeatable — the same dead intent refuses every time", async () => {
    /*
     * Codex: "ensure the recovery protocol does not clear the cookie and then
     * automatically grant A on the next GET."
     *
     * R2 satisfies that by NOT CLEARING at all. R1 deleted the cookie on a dead
     * intent, so the next request looked like somebody who had never chosen and
     * the surviving membership was granted automatically — the second half of
     * the F2 defect. The intent is now kept and refused until an explicit PUT
     * replaces it, so the browser keeps sending the same value and keeps
     * getting the same answer.
     */
    reset({ rows: [ACTIVE_A, { ...ACTIVE_B, status: "SUSPENDED" }] });
    const cookie = envelope("user_1", "org_b");

    for (const attempt of [1, 2, 3]) {
      const res = await GET(req(cookie));
      expect(res.status, `read ${attempt} must still refuse`).toBe(409);
      expect(
        res.headers.get("set-cookie"),
        "GET must not write or clear anything",
      ).toBeNull();
    }
  });

  it("an explicit choice of A afterwards succeeds", async () => {
    reset({ rows: [ACTIVE_A, { ...ACTIVE_B, status: "SUSPENDED" }] });
    const res = await PUT(req(undefined, { organizationId: "org_a" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ organizationId: "org_a" });
  });

  it("a scoped consumer refuses too, rather than reading in the wrong tenant", async () => {
    reset({ rows: [ACTIVE_A, { ...ACTIVE_B, status: "SUSPENDED" }] });
    const result = await resolveOrgContext(req(envelope("user_1", "org_b")));
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toMatch(/org_a/);
  });

  it("zero remaining memberships and an outage stay their own answers", async () => {
    reset({ rows: [] });
    expect((await GET(req(envelope("user_1", "org_b")))).status).toBe(409);

    reset({ membershipThrows: true });
    expect((await GET(req(envelope("user_1", "org_b")))).status).toBe(503);
  });

  it("the server-session adapter behaves identically", async () => {
    const { resolveTenantDecisionFromSession } = await import("../selection");
    reset({ rows: [ACTIVE_A, { ...ACTIVE_B, status: "SUSPENDED" }] });
    const jar = { get: () => ({ value: envelope("user_1", "org_b") }) };
    const decision = await resolveTenantDecisionFromSession(jar);
    expect(decision.granted, "the shell must not silently show A either").toBe(false);
  });
});

/* ── F3 ──────────────────────────────────────────────────────────────────── */

describe("F3 — the cookie writer cannot produce a value its own reader rejects", () => {
  /*
   * R1 MEASURED: two 191-character ids encode to 538 characters, and `decode`
   * refused anything over 512. `{"encodedLength":538,"roundTrip":null}` — the
   * writer produced a cookie the reader threw away on the very next request.
   */
  const collected: Array<{ name: string; value: string }> = [];
  const res = () => ({
    cookies: { set: (name: string, value: string) => collected.push({ name, value }) },
  });

  it("round-trips ids at the contract's maximum length", async () => {
    const MAX = 191; // TRUSTED_VALUE_MAX_LENGTH in the merged contract
    const userId = "u".repeat(MAX);
    const organizationId = "o".repeat(MAX);

    collected.length = 0;
    cookieModule.writeStoredSelection(res() as never, userId, organizationId);
    const written = collected.at(-1)!.value;

    const read = cookieModule.readStoredSelectionFromJar(
      { get: () => ({ value: written }) },
      userId,
    );
    expect(read, `a ${written.length}-character envelope must survive its own reader`).toEqual({
      kind: "selection",
      organizationId,
    });
  });

  it("round-trips multibyte and JSON-escaped ids", async () => {
    // The merged contract admits any code point that is not control, bidi or
    // whitespace, so a character count is not a byte count.
    for (const [userId, organizationId] of [
      ["ü".repeat(191), "é".repeat(191)],
      ["漢".repeat(191), "字".repeat(191)],
      ['"'.repeat(191), "\\".repeat(191)],
    ]) {
      collected.length = 0;
      cookieModule.writeStoredSelection(res() as never, userId, organizationId);
      const written = collected.at(-1)!.value;
      expect(
        cookieModule.readStoredSelectionFromJar({ get: () => ({ value: written }) }, userId),
        `${written.length} chars must round-trip`,
      ).toEqual({ kind: "selection", organizationId });
    }
  });

  it("still refuses an unbounded or malformed value", async () => {
    // The bound is raised to fit the real contract, not removed.
    const absurd = "A".repeat(64_000);
    // "none", not a selection: an unreadable value is treated as no intent at
    // all, so it can neither grant nor lock the reader out.
    expect(cookieModule.readStoredSelectionFromJar({ get: () => ({ value: absurd }) }, "u")).toEqual({
      kind: "none",
    });
    expect(cookieModule.readStoredSelectionFromJar({ get: () => ({ value: "!!!" }) }, "u")).toEqual({
      kind: "none",
    });
  });
});

/* ── F4 ──────────────────────────────────────────────────────────────────── */

describe("F4 — the PUT body is not consumed before the caller is authenticated", () => {
  /*
   * R1 MEASURED: an anonymous request with an acceptable Origin produced
   * `bodyReads = 1` and then 401. An Origin header is not authentication, so an
   * unauthenticated caller could make the server read a body it had no reason
   * to read.
   */
  it("no session reads zero body bytes", async () => {
    reset({ userId: null, rows: [ACTIVE_A, ACTIVE_B] });
    const res = await PUT(req(undefined, { organizationId: "org_a" }));
    expect(res.status).toBe(401);
    expect(h.bodyReads, "R1 read the body first").toBe(0);
    expect(h.findManyCalls, "and must not query either").toBe(0);
  });

  it("cross-origin is still refused before the body, and before identity", async () => {
    trustedOrigin = false;
    reset({ rows: [ACTIVE_A] });
    const res = await PUT(req(undefined, { organizationId: "org_a" }));
    expect(res.status).toBe(403);
    expect(h.bodyReads).toBe(0);
    expect(h.findManyCalls).toBe(0);
  });

  it("an authenticated caller's body is read exactly once", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const res = await PUT(req(undefined, { organizationId: "org_b" }));
    expect(res.status).toBe(200);
    expect(h.bodyReads).toBe(1);
  });

  it("an oversized body is refused without writing a cookie", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    const res = await PUT(req(undefined, { organizationId: "x".repeat(100_000) }));
    expect(res.status).not.toBe(200);
    expect(res.headers.get("set-cookie") ?? "").not.toContain(TENANT_SELECTION_COOKIE);
  });

  it("an outage is still an outage on the write path", async () => {
    reset({ membershipThrows: true });
    const res = await PUT(req(undefined, { organizationId: "org_a" }));
    expect(res.status).toBe(503);
  });
});

/* ── the resolver is still only asked once ───────────────────────────────── */

describe("no double resolution was introduced by the fixes", () => {
  it("GET resolves memberships exactly once", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    await GET(req(envelope("user_1", "org_a")));
    expect(h.findManyCalls).toBe(1);
  });

  it("PUT resolves memberships exactly once", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    await PUT(req(undefined, { organizationId: "org_b" }));
    expect(h.findManyCalls).toBe(1);
  });

  it("resolveTenantDecision resolves memberships exactly once", async () => {
    reset({ rows: [ACTIVE_A, ACTIVE_B] });
    await resolveTenantDecision(req(envelope("user_1", "org_b")));
    expect(h.findManyCalls).toBe(1);
  });
});
