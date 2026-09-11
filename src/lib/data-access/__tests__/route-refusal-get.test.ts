/**
 * PHASE 110-A2.1 — the four CMMS collection reads must answer a refusal, not
 * throw one.
 *
 * WHAT THIS EXISTS TO CATCH, MEASURED BEFORE IT WAS FIXED. The write paths and
 * the task-by-id read map a `DataScopeError` through `refusalResponse`. The four
 * COLLECTION reads did not: they called the layer directly and returned
 * `NextResponse.json(rows)`. A refusal therefore escaped the handler, and what
 * the caller received was the framework's unhandled-error page — no `code`, no
 * `correlationId`, and 500 for every one of the five refusals, including the two
 * that are not server faults at all.
 *
 * The five codes and the statuses they must carry come from the platform's own
 * `REFUSAL_STATUS`, so these routes answer the same way the rest of the
 * application already does for the same conditions.
 *
 * Each route is driven as the real exported handler with only its two
 * dependencies replaced: the session helper, so a real user is present, and the
 * data layer, so it raises the refusal under test.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { DataScopeError, type DataScopeRefusal } from "../tenant-scope";

/** code → the status the platform contract already assigns it. */
const EXPECTED: ReadonlyArray<readonly [DataScopeRefusal, number]> = [
  ["AUTHENTICATION_REQUIRED", 401],
  ["ORGANIZATION_CONTEXT_REQUIRED", 409],
  ["ORGANIZATION_SELECTION_REQUIRED", 409],
  ["ORGANIZATION_CONTEXT_UNAVAILABLE", 503],
  ["INTERNAL_ERROR", 500],
];

/** route module → the layer module it reads through, and the function it calls. */
const ROUTES = [
  { name: "GET /api/cmms/tasks", route: "@/app/api/cmms/tasks/route", fn: "getTasks" },
  { name: "GET /api/cmms/plans", route: "@/app/api/cmms/plans/route", fn: "getPlans" },
  { name: "GET /api/cmms/failures", route: "@/app/api/cmms/failures/route", fn: "getFailures" },
  { name: "GET /api/cmms/downtime", route: "@/app/api/cmms/downtime/route", fn: "getDowntime" },
] as const;

const request = (url: string) => new Request(url, { method: "GET" });

function mockDeps(throwing: { fn: string; make: () => unknown } | null) {
  vi.doMock("@/lib/auth/session", () => ({
    getCurrentUser: async () => ({ id: "u1", email: "owner@a20.test", name: "A20", role: "admin" }),
  }));
  vi.doMock("@/lib/cmms/db", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    if (!throwing) return actual;
    return { ...actual, [throwing.fn]: async () => { throw throwing.make(); } };
  });
}

describe("A2.1 — a refusal from the layer becomes a response, on every collection read", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.doUnmock("@/lib/auth/session");
    vi.doUnmock("@/lib/cmms/db");
    vi.resetModules();
  });

  for (const r of ROUTES) {
    for (const [code, status] of EXPECTED) {
      it(`${r.name} answers ${status} for ${code}`, async () => {
        vi.resetModules();
        mockDeps({ fn: r.fn, make: () => new DataScopeError(code, code === "INTERNAL_ERROR" ? "abc123xyz" : undefined) });

        const mod = await import(r.route);
        const res = await (mod as { GET: (req: Request) => Promise<Response> }).GET(
          request("http://localhost:3000/api/cmms/x"),
        );

        expect(res.status, "the status must come from the refusal, not from a crash").toBe(status);

        const body = await res.json();
        expect(body.code, "a client must be able to branch without parsing English").toBe(code);
        expect(typeof body.error).toBe("string");

        /*
         * No driver text, no host, no SQL, no identifier of a row.
         *
         * The SQL patterns are anchored on real statement shapes. A first
         * version matched the bare word "SELECT ", which flagged the refusal
         * sentence "Select the organization for this request." — a false
         * positive in the TEST, not a leak in the product, so the pattern was
         * tightened rather than the message changed.
         */
        const text = JSON.stringify(body);
        expect(text).not.toMatch(/prisma\.[a-z]|postgres(ql)?:\/\/|127\.0\.0\.1/i);
        expect(text).not.toMatch(/SELECT\s+[\w"*.]+\s+FROM|INSERT\s+INTO|UPDATE\s+"?\w+"?\s+SET/i);

        if (code === "INTERNAL_ERROR") {
          expect(body.correlationId, "a 500 must be traceable to one log line").toBe("abc123xyz");
        }
      });
    }

    it(`${r.name} does NOT swallow an unknown error — it reaches the boundary`, async () => {
      vi.resetModules();
      mockDeps({ fn: r.fn, make: () => new TypeError("something nobody mapped") });

      const mod = await import(r.route);
      await expect(
        (mod as { GET: (req: Request) => Promise<Response> }).GET(request("http://localhost:3000/api/cmms/x")),
      ).rejects.toThrow(/something nobody mapped/);
    });
  }
});
