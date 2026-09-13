/**
 * PHASE 110-A1.0b R3 (R3-2) — a second tab must not act in a tenant it is not
 * showing.
 *
 * THE SCENARIO, TRACED THROUGH A REAL HANDLER
 * `BillingDashboard.handleCancel` sends `DELETE /api/billing/subscription` with
 * no body and no organization. The route calls `requireOrgContext(req)`, which
 * resolves the tenant from the selection cookie — and that cookie is shared by
 * every tab in the browser.
 *
 * So: two tabs on organization A. Tab 1 switches to B. Tab 2 still displays A's
 * plan, A's usage, A's invoices. The reader clicks Cancel in tab 2, and B's
 * subscription is cancelled. Every authorization check passes on the way, which
 * is the whole difficulty: the reader IS an authorized member of B. Nothing was
 * bypassed. The request was simply performed in a tenant nobody intended.
 *
 * The cases below drive the REAL selection endpoint to do the switching and the
 * REAL billing route to do the cancelling, over one shared cookie jar, and
 * count how many times the domain function was reached. A test that only
 * checked status codes would pass while the cancellation went through.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

interface Row {
  organizationId: string;
  role: string;
  status: string;
}

interface Harness {
  userId: string | null;
  rows: Row[];
  /** Organizations whose subscription was actually cancelled, in order. */
  cancelled: string[];
  /** Organizations whose subscription was actually renewed, in order. */
  renewed: string[];
}

let h: Harness;

function reset(): void {
  h = {
    userId: "user_1",
    rows: [
      { organizationId: "org_a", role: "OWNER", status: "ACTIVE" },
      { organizationId: "org_b", role: "OWNER", status: "ACTIVE" },
    ],
    cancelled: [],
    renewed: [],
  };
}

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: async () => ({
    organizationMember: { findMany: async () => h.rows },
    organization: {
      findUnique: async (a: { where: { id: string } }) => ({
        id: a.where.id,
        slug: `slug-${a.where.id}`,
      }),
    },
  }),
}));
vi.mock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => "database" }));
vi.mock("@/lib/org/context", () => ({ getUserIdFromRequest: async () => h.userId }));
vi.mock("@/lib/security/request-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/security/request-guards")>();
  return { ...actual, requireTrustedOrigin: () => ({ ok: true, reason: "allowed" }) };
});

/*
 * The billing domain, recorded rather than executed. These ARE the writes the
 * scenario is about — "did anything happen in the other organization?" is the
 * only question that matters, and it is answered by this list.
 */
vi.mock("@/lib/billing/subscriptions", () => ({
  getSubscription: async () => null,
  createSubscription: async () => ({ ok: true, subscription: {} }),
  changePlan: async () => ({ ok: true, subscription: {} }),
  cancelSubscription: async ({ organizationId }: { organizationId: string }) => {
    h.cancelled.push(organizationId);
    return { ok: true, subscription: {} };
  },
  renewSubscription: async ({ organizationId }: { organizationId: string }) => {
    h.renewed.push(organizationId);
    return { ok: true, subscription: {} };
  },
}));

const { PUT: SELECT } = await import("@/app/api/tenant/context/route");
const { DELETE: CANCEL, PUT: RENEW } = await import("@/app/api/billing/subscription/route");
const { TENANT_PRECONDITION_HEADER, TENANT_SELECTION_COOKIE } = await import("../contract");

/* ── One browser, one cookie jar, several tabs ───────────────────────────── */

/**
 * The shared cookie jar.
 *
 * This is the mechanism under test, not an incidental detail: every tab in a
 * browser reads and writes the same jar, which is exactly why one tab's choice
 * silently becomes another tab's tenant.
 */
let jar = "";

function readSetCookie(res: Response): void {
  const raw = res.headers.get("set-cookie");
  if (!raw) return;
  const value = raw.split(";")[0]?.split("=").slice(1).join("=");
  if (value !== undefined) jar = value;
}

/**
 * A request from one tab.
 *
 * `showing` is what that tab last RENDERED — its precondition. `undefined`
 * models a client that sends no precondition at all, which is every existing
 * caller and, deliberately, still allowed.
 */
function tab(showing?: string, body?: unknown) {
  const headers = new Headers({
    origin: "https://www.hermesnovin.com",
    "content-type": "application/json",
  });
  if (showing !== undefined) headers.set(TENANT_PRECONDITION_HEADER, showing);

  /*
   * A REAL request, not a string-returning double.
   *
   * The selection route reads its body through the repository's bounded reader,
   * which takes `req.body` as a stream. A double that only answers `text()`
   * would leave `body` null and every selection here would refuse as malformed
   * — which is what happened on the first run of this file, and is exactly the
   * class of harness artifact R3-1 was about.
   */
  const native = new Request("https://www.hermesnovin.com/api/tenant/context", {
    method: "PUT",
    headers,
    body: JSON.stringify(body ?? {}),
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
  jar = "";
});

describe("R3-2 — a stale tab cannot act in the organization it is not showing", () => {
  it("THE SCENARIO: two tabs on A, tab 1 switches to B, tab 2 cancels", async () => {
    // Both tabs render A.
    expect(await switchTo("org_a")).toBe(200);

    // Tab 1 switches the whole browser to B.
    expect(await switchTo("org_b")).toBe(200);

    // Tab 2 has not reloaded. It still shows A, and the reader clicks Cancel.
    const res = await CANCEL(tab("org_a"));

    expect(res.status, "409 conflict, not a silent success").toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "ORGANIZATION_CONTEXT_CONFLICT",
    });

    expect(
      h.cancelled,
      "NOTHING may be cancelled — least of all org_b, which the reader never asked about",
    ).toEqual([]);
  });

  it("the same request WITHOUT the precondition is now REFUSED — R6 closed the gap", async () => {
    /*
     * PHASE 110-A1.0b R6 INVERTED THIS CASE, and it is kept rather than deleted
     * so the change is visible.
     *
     * R3 asserted the opposite — that a header-less request still cancelled
     * organization B — and called it a measured compatibility boundary. That was
     * honest for R3 and is no longer acceptable for a WRITE: a stale tab that
     * sends nothing is exactly as dangerous as one that sends the wrong thing.
     * The server now answers 428 Precondition Required and nothing is cancelled.
     */
    expect(await switchTo("org_a")).toBe(200);
    expect(await switchTo("org_b")).toBe(200);

    const res = await CANCEL(tab(undefined));

    expect(res.status).toBe(428);
    expect(h.cancelled, "R3 measured ['org_b'] here").toEqual([]);
  });

  it("after a reload the same tab succeeds — the conflict is not a dead end", async () => {
    expect(await switchTo("org_a")).toBe(200);
    expect(await switchTo("org_b")).toBe(200);

    expect((await CANCEL(tab("org_a"))).status).toBe(409);
    expect(h.cancelled).toEqual([]);

    // The reader reloads. The page now renders B, so the tab asserts B.
    const res = await CANCEL(tab("org_b"));
    expect(res.status).toBe(200);
    expect(h.cancelled, "the reader's real, intended action goes through").toEqual(["org_b"]);
  });

  it("the reader may also switch BACK and act in A", async () => {
    expect(await switchTo("org_a")).toBe(200);
    expect(await switchTo("org_b")).toBe(200);
    expect(await switchTo("org_a")).toBe(200);

    expect((await CANCEL(tab("org_a"))).status).toBe(200);
    expect(h.cancelled).toEqual(["org_a"]);
  });

  it("a mutation already IN FLIGHT when the switch happens conflicts on arrival", async () => {
    /*
     * The delayed case. The request is composed while A is selected, the switch
     * lands first, and the mutation arrives afterwards. The precondition is
     * evaluated when the request is HANDLED, not when it was composed, so the
     * late arrival is refused rather than performed in B.
     */
    expect(await switchTo("org_a")).toBe(200);

    const composed = tab("org_a");            // built while A was in effect
    expect(await switchTo("org_b")).toBe(200); // the switch overtakes it
    const res = await CANCEL(composed);        // and only now does it arrive

    expect(res.status).toBe(409);
    expect(h.cancelled).toEqual([]);
  });

  it("a switch that happens DURING a pending read leaves no write behind", async () => {
    expect(await switchTo("org_a")).toBe(200);

    const pendingRenew = RENEW(tab("org_a"));
    expect(await switchTo("org_b")).toBe(200);
    const res = await pendingRenew;

    // Whichever order the runtime chose, the invariant is the same: nothing was
    // renewed in an organization the request did not name.
    if (res.status === 200) {
      expect(h.renewed).toEqual(["org_a"]);
    } else {
      expect(res.status).toBe(409);
      expect(h.renewed).toEqual([]);
    }
  });

  it("a precondition naming a FOREIGN organization is refused, and reveals nothing", async () => {
    expect(await switchTo("org_a")).toBe(200);

    const res = await CANCEL(tab("org_zzz_not_mine"));

    expect(res.status, "the same conflict as any other mismatch").toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: "ORGANIZATION_CONTEXT_CONFLICT",
    });
    expect(h.cancelled).toEqual([]);

    /*
     * A header cannot SELECT. It is compared against the tenant the server
     * already resolved and proven; a stranger's id matches nothing and simply
     * conflicts, exactly as one of the reader's own non-current organizations
     * would. The answer is identical either way, so the response cannot be used
     * to find out which organizations exist.
     */
  });

  it("an empty precondition is a mismatch, not a wildcard", async () => {
    expect(await switchTo("org_a")).toBe(200);

    const res = await CANCEL(tab(""));
    expect(res.status, "present-but-empty asserts a value, and it is wrong").toBe(409);
    expect(h.cancelled).toEqual([]);
  });

  it("a matching precondition changes nothing about an ordinary request", async () => {
    expect(await switchTo("org_a")).toBe(200);

    const withHeader = await CANCEL(tab("org_a"));
    expect(withHeader.status).toBe(200);
    expect(h.cancelled).toEqual(["org_a"]);
  });

  it("the precondition is not consulted before the tenant is resolved", async () => {
    /*
     * Order, asserted. An unauthenticated caller must still be refused as
     * unauthenticated — if the header were compared first, a signed-out request
     * carrying a plausible id would answer 409 and confirm which organization
     * the browser was last in.
     */
    reset();
    h.userId = null;

    const res = await CANCEL(tab("org_a"));
    expect(res.status).toBe(401);
    expect(h.cancelled).toEqual([]);
  });
});
