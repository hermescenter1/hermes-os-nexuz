/**
 * REGRESSION — the anonymous demo intake still works, and the row it writes is
 * exactly the row the new admin review workflow expects to pick up.
 *
 * The admin state machine starts at NEW and refuses any source it does not own,
 * so the two literals written here ("WEBSITE" / "NEW") are a real contract
 * between the public writer and the admin reader. If either side drifts, demo
 * requests silently become unreviewable — which is the class of defect this
 * whole change exists to fix.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  ACCESS_REQUEST_SOURCE,
  isSalesLeadStatus,
  allowedTransitions,
} from "@/lib/sales/lead-status";

type Row = Record<string, unknown>;
let created: Row[] = [];
let dbAvailable = true;

const MOCKED = ["@/lib/db/prisma"];

beforeEach(() => {
  vi.resetModules();
  created = [];
  dbAvailable = true;
  process.env.JWT_ACCESS_SECRET = "test-secret-for-ip-hashing-only";
  vi.doMock("@/lib/db/prisma", () => ({
    getPrisma: async () =>
      dbAvailable
        ? { salesLead: { create: async ({ data }: { data: Row }) => { created.push(data); return data; } } }
        : null,
  }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

/** Each test gets a fresh client IP — the route rate-limits 5 per 10 minutes. */
let ipCounter = 0;
function post(body: unknown, raw?: string) {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/sales/leads", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": `203.0.113.${ipCounter % 250}`,
    },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

async function submit(body: unknown, raw?: string) {
  const { POST } = await import("../route");
  const res = await POST(post(body, raw));
  return { res, json: (await res.json()) as Record<string, unknown> };
}

const VALID = {
  fullName: "Factory Engineer",
  email: "OPS@Factory.TEST",
  company: "Test Steel Co",
  useCase: "Line 2 downtime analysis",
};

describe("public demo submission still works", () => {
  it("accepts an anonymous submission and stores it", async () => {
    const { res, json } = await submit(VALID);
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(created).toHaveLength(1);
  });

  it("writes exactly the source and status the admin workflow expects", async () => {
    await submit(VALID);
    const row = created[0];
    expect(row.source).toBe("WEBSITE");
    expect(row.status).toBe("NEW");

    // The admin machine must recognise the entry state and offer a way out of it.
    expect(isSalesLeadStatus(String(row.status))).toBe(true);
    expect(allowedTransitions("NEW")).toContain("REVIEWED");
    // ...and this row must NOT be claimed by the account-access workflow.
    expect(row.source).not.toBe(ACCESS_REQUEST_SOURCE);
  });

  it("never lets the client choose its own status or source", async () => {
    await submit({ ...VALID, status: "APPROVED", source: ACCESS_REQUEST_SOURCE });
    expect(created[0].status).toBe("NEW");
    expect(created[0].source).toBe("WEBSITE");
  });

  it("normalises the email and stores an ip hash, not an ip", async () => {
    await submit(VALID);
    expect(created[0].email).toBe("ops@factory.test");
    expect(String(created[0].ipHash)).not.toContain("203.0.113");
    expect(String(created[0].ipHash)).toMatch(/^[a-f0-9]{16}$/);
  });

  it("still rejects invalid input", async () => {
    expect((await submit({ fullName: "x", email: "nope" })).res.status).toBe(400);
    expect((await submit(undefined, "{broken")).res.status).toBe(400);
    expect(created).toHaveLength(0);
  });

  it("still swallows honeypot submissions without writing a row", async () => {
    const { res, json } = await submit({ ...VALID, _gotcha: "bot" });
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(created).toHaveLength(0);
  });

  it("still fails closed when the database is unavailable", async () => {
    dbAvailable = false;
    expect((await submit(VALID)).res.status).toBe(503);
  });

  it("exposes no mutation verb — the public route creates only", async () => {
    const mod = await import("../route");
    expect(typeof mod.POST).toBe("function");
    for (const verb of ["PATCH", "PUT", "DELETE", "GET"]) {
      expect(mod, `public route must not expose ${verb}`).not.toHaveProperty(verb);
    }
  });
});

describe("the access-request intake keeps its own source tag", () => {
  it("writes AUTH_ACCESS_REQUEST, which the sales workflow refuses", async () => {
    const { POST } = await import("@/app/api/auth/access-request/route");
    const req = new NextRequest("http://localhost/api/auth/access-request", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.251" },
      body: JSON.stringify({ fullName: "Visitor", email: "v@factory.test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(created).toHaveLength(1);
    expect(created[0].source).toBe(ACCESS_REQUEST_SOURCE);
    expect(created[0].status).toBe("NEW");
  });
});
