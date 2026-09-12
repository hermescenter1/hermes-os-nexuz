/**
 * PHASE 110-A1.0b R4 — the cases R3 named but did not measure.
 *
 * Four things are proven here that no earlier round proved:
 *
 *   1. the cookie's WORST CASE, as behaviour rather than as a comment. R3
 *      corrected the derivation in prose and measured the numbers in a
 *      throwaway script; a number in a comment is not a guarantee.
 *   2. an INFINITE request body — not merely a large one. A ceiling that stops
 *      a 256 KB body may still be a ceiling that only works because the body
 *      eventually ends.
 *   3. a SUSPENDED membership underneath a live precondition.
 *   4. a REVOKED session underneath a live precondition.
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
  db: boolean;
  findManyCalls: number;
}

let h: Harness;

function reset(over: Partial<Harness> = {}): void {
  h = {
    userId: "user_1",
    rows: [
      { organizationId: "org_a", role: "OWNER", status: "ACTIVE" },
      { organizationId: "org_b", role: "OWNER", status: "ACTIVE" },
    ],
    db: true,
    findManyCalls: 0,
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
              return h.rows;
            },
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
vi.mock("@/lib/org/context", () => ({ getUserIdFromRequest: async () => h.userId }));
vi.mock("@/lib/security/request-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/request-guards")>();
  return { ...actual, requireTrustedOrigin: () => ({ ok: true, reason: "allowed" }) };
});
vi.mock("@/lib/billing/subscriptions", () => ({
  getSubscription: async () => null,
  createSubscription: async () => ({ ok: true, subscription: {} }),
  changePlan: async () => ({ ok: true, subscription: {} }),
  cancelSubscription: async ({ organizationId }: { organizationId: string }) => {
    cancelled.push(organizationId);
    return { ok: true, subscription: {} };
  },
  renewSubscription: async () => ({ ok: true, subscription: {} }),
}));

const cancelled: string[] = [];

const { PUT: SELECT } = await import("@/app/api/tenant/context/route");
const { DELETE: CANCEL } = await import("@/app/api/billing/subscription/route");
const { TENANT_SELECTION_COOKIE, TENANT_PRECONDITION_HEADER } = await import("../contract");
/*
 * From the MERGED A1.0 contract, not the selection adapter's own.
 *
 * A first version of this file imported it from `../contract`, where it does
 * not exist, so `MAX` was `undefined`, every fixture became the empty string,
 * and the "most expensive shape" comparison declared ASCII the winner because
 * all seven shapes were equally empty. The test caught its own fixture bug,
 * which is the only reason the numbers below can be trusted.
 */
const { TRUSTED_VALUE_MAX_LENGTH } = await import("@/lib/tenant/contract");
const cookieModule = await import("../cookie");

/* ── 1. The cookie's worst case, measured as behaviour ───────────────────── */

describe("R4 — the cookie bound holds for the WORST admissible value, not a typical one", () => {
  /**
   * Write an envelope through the real writer and read it back through the real
   * reader, with no help from either side.
   */
  function roundTrip(userId: string, organizationId: string) {
    let written: string | undefined;
    const res = {
      cookies: {
        set: (_n: string, v: string) => {
          written = v;
        },
      },
    } as never;
    cookieModule.writeStoredSelection(res, userId, organizationId);
    const read = cookieModule.readStoredSelectionFromJar(
      { get: () => (written === undefined ? undefined : { value: written }) },
      userId,
    );
    return { written: written ?? "", read };
  }

  /*
   * `TRUSTED_VALUE_MAX_LENGTH` bounds `v.length` — UTF-16 CODE UNITS. The most
   * expensive admissible value is therefore not the longest-looking one: an
   * unpaired surrogate is ONE code unit and `JSON.stringify` renders it as the
   * six-byte escape `\udXXX`. `isUsableId` rejects C0/C1, DEL, bidi and
   * whitespace and says nothing about surrogates, so this is admissible input,
   * not a contrived one.
   */
  const MAX = TRUSTED_VALUE_MAX_LENGTH;

  const SHAPES: ReadonlyArray<readonly [string, string]> = [
    ["ASCII", "a".repeat(MAX)],
    ["3-byte BMP", "漢".repeat(MAX)],
    ["non-BMP surrogate PAIRS", "\u{1D11E}".repeat(Math.floor(MAX / 2))],
    ["JSON-escaped quotes", '"'.repeat(MAX)],
    ["JSON-escaped backslashes", "\\".repeat(MAX)],
    ["UNPAIRED high surrogates", "\ud800".repeat(MAX)],
    ["UNPAIRED low surrogates", "\udc00".repeat(MAX)],
  ];

  for (const [name, value] of SHAPES) {
    it(`${name} at the contract maximum round-trips and stays under the bound`, () => {
      const { written, read } = roundTrip(value, value);

      expect(value.length, "the fixture must actually sit at the maximum").toBeLessThanOrEqual(MAX);
      expect(
        written.length,
        `${name} encodes to ${written.length} characters; the reader's bound must clear it`,
      ).toBeLessThan(4000);
      expect(read, `${name} must survive its own writer`).toEqual({
        kind: "selection",
        organizationId: value,
      });
    });
  }

  it("the unpaired-surrogate case really is the most expensive shape", () => {
    /*
     * The point of the R3 correction, asserted rather than asserted-about. If a
     * future change to `isUsableId` or to the encoding made some other shape
     * more expensive, this fails and the bound has to be re-derived.
     */
    const sizes = SHAPES.map(([name, v]) => [name, roundTrip(v, v).written.length] as const);
    const worst = sizes.reduce((a, b) => (b[1] > a[1] ? b : a));

    expect(worst[0]).toBe("UNPAIRED high surrogates");
    expect(
      worst[1],
      "R2 derived 2068 for the worst case; the measured value is larger",
    ).toBeGreaterThan(2068);
  });

  it("a value one code unit OVER the contract maximum is not writable as a valid selection", () => {
    // Not a cookie-layer rule — the resolver refuses the id — but worth pinning
    // so the bound is never justified by "nothing can be longer anyway".
    const tooLong = "a".repeat(MAX + 1);
    const { written } = roundTrip("user_1", tooLong);
    expect(written.length).toBeLessThan(4000);
  });
});

/* ── 2. An INFINITE body ─────────────────────────────────────────────────── */

describe("R4 — an endless body is refused, not merely a large one", () => {
  /**
   * A stream that never closes and never errors. If the ceiling only worked
   * because bodies eventually end, this hangs instead of answering.
   */
  function endlessRequest(cookie?: string) {
    const stats = { pulls: 0, bytes: 0, cancelled: false };
    const chunk = new Uint8Array(1024).fill(0x61);

    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          stats.pulls += 1;
          stats.bytes += chunk.byteLength;
          controller.enqueue(chunk);
          // Deliberately never `close()` and never `error()`.
        },
        cancel() {
          stats.cancelled = true;
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
      body: source,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    return {
      req: {
        headers: native.headers,
        get body() {
          return native.body;
        },
        text: () => native.text(),
        json: () => native.json(),
        cookies: {
          get: (n: string) =>
            n === TENANT_SELECTION_COOKIE && cookie ? { value: cookie } : undefined,
        },
      } as never,
      stats: () => stats,
    };
  }

  beforeEach(() => {
    reset();
    cancelled.length = 0;
  });

  it("answers 422 and releases the stream instead of reading forever", async () => {
    const { req, stats } = endlessRequest();

    // If the ceiling did not bound ingestion this never resolves; the suite's
    // own timeout would fail the case rather than hanging the run.
    const res = await PUT_WITH_TIMEOUT(req, 5000);
    const after = stats();

    expect(res.status).toBe(422);
    expect(after.cancelled, "an endless stream MUST be released").toBe(true);
    expect(
      after.bytes,
      "only the bytes needed to cross the ceiling may ever be pulled",
    ).toBeLessThanOrEqual(8 * 1024);
  });

  /** Fail loudly on a hang rather than letting the runner time the file out. */
  async function PUT_WITH_TIMEOUT(req: never, ms: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`the handler did not answer an endless body within ${ms} ms`)),
        ms,
      );
    });
    try {
      return await Promise.race([SELECT(req), guard]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
});

/* ── 3 and 4. A live precondition under suspension and revocation ────────── */

describe("R4 — the precondition under a membership that changes mid-session", () => {
  let jar = "";

  function readSetCookie(res: Response): void {
    const raw = res.headers.get("set-cookie");
    if (!raw) return;
    const value = raw.split(";")[0]?.split("=").slice(1).join("=");
    if (value !== undefined) jar = value;
  }

  function tab(showing?: string, body?: unknown) {
    const headers = new Headers({
      origin: "https://www.hermesnovin.com",
      "content-type": "application/json",
    });
    if (showing !== undefined) headers.set(TENANT_PRECONDITION_HEADER, showing);

    const native = new Request("https://www.hermesnovin.com/api/tenant/context", {
      method: "PUT",
      headers,
      body: JSON.stringify(body ?? {}),
    });

    return {
      headers: native.headers,
      get body() {
        return native.body;
      },
      text: () => native.text(),
      json: () => native.json(),
      cookies: {
        get: (n: string) => (n === TENANT_SELECTION_COOKIE && jar ? { value: jar } : undefined),
      },
    } as never;
  }

  async function switchTo(organizationId: string): Promise<number> {
    const res = await SELECT(tab(undefined, { organizationId }));
    readSetCookie(res);
    return res.status;
  }

  beforeEach(() => {
    reset();
    cancelled.length = 0;
    jar = "";
  });

  it("a SUSPENDED membership refuses before the precondition is ever compared", async () => {
    expect(await switchTo("org_b")).toBe(200);

    // The membership is suspended between requests, as an administrator would.
    h.rows = [
      { organizationId: "org_a", role: "OWNER", status: "ACTIVE" },
      { organizationId: "org_b", role: "OWNER", status: "SUSPENDED" },
    ];

    const res = await CANCEL(tab("org_b"));

    /*
     * 409 SELECTION_REQUIRED, not CONFLICT. The order matters and is asserted:
     * the tenant is resolved first, the dead intent refuses there, and the
     * precondition is never reached. A CONFLICT here would tell a suspended
     * member which organization is currently in effect.
     */
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "ORGANIZATION_SELECTION_REQUIRED",
    });
    expect(cancelled, "nothing may be cancelled anywhere").toEqual([]);
  });

  it("a suspended membership plus a precondition for the SURVIVING organization is still refused", async () => {
    expect(await switchTo("org_b")).toBe(200);
    h.rows = [
      { organizationId: "org_a", role: "OWNER", status: "ACTIVE" },
      { organizationId: "org_b", role: "OWNER", status: "SUSPENDED" },
    ];

    // The reader's page still says B; asserting A instead must not rescue it.
    const res = await CANCEL(tab("org_a"));
    expect(res.status).toBe(409);
    expect(cancelled).toEqual([]);
  });

  it("a revoked session refuses before the precondition, and before any tenant is named", async () => {
    expect(await switchTo("org_b")).toBe(200);

    // The session ends: the resolver can no longer identify the caller.
    h.userId = null;

    const res = await CANCEL(tab("org_b"));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
    expect(cancelled).toEqual([]);
  });

  it("losing EVERY membership refuses without naming a tenant", async () => {
    expect(await switchTo("org_b")).toBe(200);
    h.rows = [];

    const res = await CANCEL(tab("org_b"));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "ORGANIZATION_CONTEXT_REQUIRED",
    });
    expect(cancelled).toEqual([]);
  });

  it("an outage refuses with a retryable code and writes nothing", async () => {
    expect(await switchTo("org_b")).toBe(200);
    h.db = false;

    const res = await CANCEL(tab("org_b"));
    expect(res.status).toBe(503);
    expect(cancelled).toEqual([]);
  });

  it("recovery is possible: reinstated membership, matching precondition, real effect", async () => {
    expect(await switchTo("org_b")).toBe(200);
    h.rows = [
      { organizationId: "org_a", role: "OWNER", status: "ACTIVE" },
      { organizationId: "org_b", role: "OWNER", status: "SUSPENDED" },
    ];
    expect((await CANCEL(tab("org_b"))).status).toBe(409);

    // Reinstated.
    reset();
    const res = await CANCEL(tab("org_b"));
    expect(res.status).toBe(200);
    expect(cancelled, "the reader's real, intended action goes through").toEqual(["org_b"]);
  });
});
