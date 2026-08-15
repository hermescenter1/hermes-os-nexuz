/**
 * SECURITY + WORKFLOW — PATCH /api/admin/sales/leads/[id] over a synthetic Prisma.
 *
 * Invariants asserted here:
 *   ANONYMOUS_DEMO_STATE_MUTATION            = 0
 *   NON_ADMIN_DEMO_STATE_MUTATION            = 0
 *   CLIENT_SUPPLIED_IDENTITY_ACCEPTED        = 0   (strict body, session actor)
 *   FORBIDDEN_TRANSITION_APPLIED             = 0
 *   STALE_TAB_OVERWRITES_NEWER_DECISION      = 0
 *   ACCESS_REQUEST_LEAD_MUTATED_BY_THIS_ROUTE= 0
 *   LEAD_PII_IN_AUDIT_METADATA               = 0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown> & { id: string };

let user: { id: string; email: string; name: string; role: string } | null = null;
let leads: Row[] = [];
let dbAvailable = true;
const auditCalls: Array<Record<string, unknown>> = [];
/** Runs between the workflow's read and its write, to simulate a real race. */
let raceHook: (() => void) | null = null;

function match(where: Record<string, unknown>, r: Row): boolean {
  for (const [k, v] of Object.entries(where)) {
    const cell = r[k];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if ("not" in (v as object)) {
        if (cell === (v as { not: unknown }).not) return false;
        continue;
      }
      return false;
    }
    if (cell !== v) return false;
  }
  return true;
}

function makeDb() {
  return {
    salesLead: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        leads.find((r) => match(where, r)) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        // The race window: another administrator commits between the handler's
        // read and this write.
        if (raceHook) { const h = raceHook; raceHook = null; h(); }
        const m = leads.filter((r) => match(where, r));
        m.forEach((r) => Object.assign(r, data));
        return { count: m.length };
      },
    },
  };
}

const MOCKED = ["@/lib/auth/session", "@/lib/db/prisma", "@/lib/audit/audit-service", "@/lib/logger"];

beforeEach(() => {
  vi.resetModules();
  user = { id: "admin-1", email: "admin@hermesnovin.test", name: "Admin", role: "admin" };
  leads = [];
  dbAvailable = true;
  raceHook = null;
  auditCalls.length = 0;
  vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => user }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => (dbAvailable ? makeDb() : null) }));
  vi.doMock("@/lib/audit/audit-service", () => ({
    recordAuditEvent: async (e: Record<string, unknown>) => { auditCalls.push(e); },
  }));
  vi.doMock("@/lib/logger", () => ({ logger: { error: () => {}, warn: () => {}, info: () => {} } }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

/** A demo lead as the PUBLIC form actually writes it. */
function demoLead(id: string, status = "NEW"): Row {
  return {
    id, status, source: "WEBSITE",
    fullName: "Factory Engineer", email: "ops@factory.test",
    phone: "+98-000-0000", company: "Test Steel Co",
    useCase: "SENSITIVE line-2 downtime narrative",
    message: "SENSITIVE internal note",
  };
}

/** An access request as /api/auth/access-request actually writes it. */
function accessLead(id: string, status = "NEW"): Row {
  return {
    id, status, source: "AUTH_ACCESS_REQUEST",
    fullName: "Visitor", email: "visitor@factory.test",
    message: "Registration / access request submitted via /auth/register.",
  };
}

function req(id: string, body: unknown, raw?: string) {
  return new NextRequest(`http://localhost/api/admin/sales/leads/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });
}

async function patch(id: string, body: unknown, raw?: string) {
  const { PATCH } = await import("../[id]/route");
  const res = await PATCH(req(id, body, raw), { params: Promise.resolve({ id }) });
  return { res, json: (await res.json()) as Record<string, unknown> };
}

const move = (id: string, from: string, to: string) =>
  patch(id, { status: to, expectedStatus: from });

// ── Authorization ────────────────────────────────────────────────────────────

describe("authorization", () => {
  it("rejects an anonymous caller with 401 and does not touch the row", async () => {
    user = null;
    leads = [demoLead("l1")];
    const { res, json } = await move("l1", "NEW", "REVIEWED");
    expect(res.status).toBe(401);
    expect(json.error).toBe("unauthorized");
    expect(leads[0].status).toBe("NEW");
    expect(auditCalls).toEqual([]);
  });

  it.each(["viewer", "customer", "engineer", "candidate", "vendor"])(
    "rejects the non-admin role %s with 403",
    async (role) => {
      user = { id: "u", email: "u@t.test", name: "U", role };
      leads = [demoLead("l1")];
      const { res, json } = await move("l1", "NEW", "REVIEWED");
      expect(res.status).toBe(403);
      expect(json.error).toBe("forbidden");
      expect(leads[0].status).toBe("NEW");
    },
  );

  it.each(["admin", "superadmin"])("permits the platform role %s", async (role) => {
    user = { id: "a", email: "a@t.test", name: "A", role };
    leads = [demoLead("l1")];
    const { res, json } = await move("l1", "NEW", "REVIEWED");
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(leads[0].status).toBe("REVIEWED");
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe("validation", () => {
  beforeEach(() => { leads = [demoLead("l1")]; });

  it("rejects an unknown target status", async () => {
    const { res, json } = await patch("l1", { status: "QUALIFIED", expectedStatus: "NEW" });
    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_body");
    expect(leads[0].status).toBe("NEW");
  });

  it("rejects an unknown expected status", async () => {
    const { res } = await patch("l1", { status: "REVIEWED", expectedStatus: "PENDING" });
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const { res, json } = await patch("l1", undefined, "{not json");
    expect(res.status).toBe(400);
    expect(json.error).toBe("invalid_body");
  });

  it("rejects a missing field", async () => {
    expect((await patch("l1", { status: "REVIEWED" })).res.status).toBe(400);
    expect((await patch("l1", {})).res.status).toBe(400);
  });

  it("rejects a non-string status (no type coercion)", async () => {
    expect((await patch("l1", { status: 1, expectedStatus: "NEW" })).res.status).toBe(400);
    expect((await patch("l1", { status: ["REVIEWED"], expectedStatus: "NEW" })).res.status).toBe(400);
  });

  it("refuses extra fields — no mass assignment of identity or content", async () => {
    for (const extra of [
      { userId: "someone-else" },
      { organizationId: "org-x" },
      { source: "AUTH_ACCESS_REQUEST" },
      { email: "attacker@evil.test" },
      { id: "l2" },
    ]) {
      const { res } = await patch("l1", { status: "REVIEWED", expectedStatus: "NEW", ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    expect(leads[0].status).toBe("NEW");
  });

  it("returns 404 for a nonexistent lead", async () => {
    const { res, json } = await move("nope", "NEW", "REVIEWED");
    expect(res.status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("fails closed with 503 when the database is unavailable", async () => {
    dbAvailable = false;
    const { res, json } = await move("l1", "NEW", "REVIEWED");
    expect(res.status).toBe(503);
    expect(json.error).toBe("service_unavailable");
  });
});

// ── State machine, driven through the HTTP surface ───────────────────────────

describe("state machine", () => {
  it("walks the full accepted lifecycle NEW -> REVIEWED -> CONTACTED -> APPROVED -> CLOSED", async () => {
    leads = [demoLead("l1")];
    for (const [from, to] of [
      ["NEW", "REVIEWED"], ["REVIEWED", "CONTACTED"],
      ["CONTACTED", "APPROVED"], ["APPROVED", "CLOSED"],
    ] as const) {
      const { res, json } = await move("l1", from, to);
      expect(res.status, `${from} -> ${to}`).toBe(200);
      expect(json.status).toBe(to);
      expect(json.previousStatus).toBe(from);
      expect(leads[0].status).toBe(to);
    }
  });

  it.each(["NEW", "REVIEWED", "CONTACTED"])("rejects from %s", async (from) => {
    leads = [demoLead("l1", from)];
    const { res, json } = await move("l1", from, "REJECTED");
    expect(res.status).toBe(200);
    expect(json.status).toBe("REJECTED");
    expect(leads[0].status).toBe("REJECTED");
  });

  it.each([
    ["NEW", "APPROVED"], ["NEW", "CONTACTED"], ["NEW", "CLOSED"],
    ["REVIEWED", "APPROVED"], ["REVIEWED", "CLOSED"],
    ["CONTACTED", "CLOSED"], ["APPROVED", "REJECTED"],
    ["NEW", "NEW"], ["APPROVED", "APPROVED"],
  ])("refuses the forbidden transition %s -> %s with 409", async (from, to) => {
    leads = [demoLead("l1", from)];
    const { res, json } = await move("l1", from, to);
    expect(res.status).toBe(409);
    expect(json.error).toBe("invalid_transition");
    expect(json.currentStatus).toBe(from);
    expect(leads[0].status).toBe(from);
    expect(auditCalls).toEqual([]);
  });

  it.each(["REJECTED", "CLOSED"])("never resurrects a %s lead", async (terminal) => {
    for (const to of ["NEW", "REVIEWED", "CONTACTED", "APPROVED", "CLOSED", "REJECTED"]) {
      leads = [demoLead("l1", terminal)];
      const { res } = await move("l1", terminal, to);
      expect(res.status, `${terminal} -> ${to}`).toBe(409);
      expect(leads[0].status).toBe(terminal);
    }
  });

  it("refuses to guess when the stored status is outside the vocabulary", async () => {
    leads = [demoLead("l1", "LEGACY_IMPORTED")];
    const { res, json } = await move("l1", "NEW", "REVIEWED");
    expect(res.status).toBe(409);
    expect(json.error).toBe("unknown_state");
    expect(leads[0].status).toBe("LEGACY_IMPORTED");
  });
});

// ── Concurrency ──────────────────────────────────────────────────────────────

describe("concurrency / stale state", () => {
  it("refuses a stale tab whose expectation no longer matches, and reports the truth", async () => {
    leads = [demoLead("l1", "CONTACTED")]; // another admin already advanced it
    const { res, json } = await move("l1", "NEW", "REVIEWED");
    expect(res.status).toBe(409);
    expect(json.error).toBe("stale_state");
    expect(json.currentStatus).toBe("CONTACTED");
    expect(leads[0].status).toBe("CONTACTED");
    expect(auditCalls).toEqual([]);
  });

  it("does not let a stale REJECT overwrite an already-APPROVED decision", async () => {
    leads = [demoLead("l1", "APPROVED")];
    const { res, json } = await move("l1", "CONTACTED", "REJECTED");
    expect(res.status).toBe(409);
    expect(json.currentStatus).toBe("APPROVED");
    expect(leads[0].status).toBe("APPROVED");
  });

  it("loses safely when another admin commits inside the read-write window", async () => {
    leads = [demoLead("l1", "NEW")];
    // Both tabs read NEW; the other one commits first, during our write.
    raceHook = () => { leads[0].status = "REJECTED"; };
    const { res, json } = await move("l1", "NEW", "REVIEWED");
    expect(res.status).toBe(409);
    expect(json.error).toBe("stale_state");
    expect(json.currentStatus).toBe("REJECTED");
    // The winner's decision stands.
    expect(leads[0].status).toBe("REJECTED");
    expect(auditCalls).toEqual([]);
  });

  it("only ever writes the row it was aimed at", async () => {
    leads = [demoLead("l1"), demoLead("l2"), demoLead("l3")];
    await move("l2", "NEW", "REVIEWED");
    expect(leads.map((l) => l.status)).toEqual(["NEW", "REVIEWED", "NEW"]);
  });
});

// ── The boundary against the account-access workflow ─────────────────────────

describe("demo vs access-request separation", () => {
  it("refuses to move an AUTH_ACCESS_REQUEST lead through the sales workflow", async () => {
    leads = [accessLead("a1")];
    const { res, json } = await move("a1", "NEW", "REVIEWED");
    expect(res.status).toBe(409);
    expect(json.error).toBe("access_request_lead");
    expect(leads[0].status).toBe("NEW");
    expect(auditCalls).toEqual([]);
  });

  it("refuses every target status for an access-request lead", async () => {
    for (const to of ["REVIEWED", "CONTACTED", "APPROVED", "REJECTED", "CLOSED"]) {
      leads = [accessLead("a1")];
      const { res, json } = await move("a1", "NEW", to);
      expect(res.status, to).toBe(409);
      expect(json.error).toBe("access_request_lead");
      expect(leads[0].status).toBe("NEW");
    }
  });

  it("approving a demo lead creates no invite and no user", async () => {
    // The synthetic db exposes ONLY salesLead. Any attempt to reach
    // accessInvite or user would throw, so a clean 200 is the proof.
    leads = [demoLead("l1", "CONTACTED")];
    const { res } = await move("l1", "CONTACTED", "APPROVED");
    expect(res.status).toBe(200);
    expect(leads[0].status).toBe("APPROVED");
    expect(leads[0].accessInviteId).toBeUndefined();
  });
});

// ── Audit ────────────────────────────────────────────────────────────────────

describe("audit trail", () => {
  it("records the transition with the server-derived actor and no lead PII", async () => {
    leads = [demoLead("l1", "CONTACTED")];
    await move("l1", "CONTACTED", "APPROVED");

    expect(auditCalls).toHaveLength(1);
    const ev = auditCalls[0];
    expect(ev.action).toBe("sales.lead.status_changed");
    expect(ev.entityType).toBe("sales_lead");
    expect(ev.entityId).toBe("l1");
    expect(ev.userId).toBe("admin-1");          // session, never the body
    expect(ev.outcome).toBe("success");
    expect(ev.metadata).toEqual({ fromStatus: "CONTACTED", toStatus: "APPROVED" });

    // No email, phone, company, use case or message anywhere in the event.
    const dump = JSON.stringify(ev);
    for (const leak of ["ops@factory.test", "+98-000-0000", "Test Steel Co", "SENSITIVE", "Factory Engineer"]) {
      expect(dump, `audit leaked ${leak}`).not.toContain(leak);
    }
  });

  it("emits exactly one event per successful transition and none per refusal", async () => {
    leads = [demoLead("l1")];
    await move("l1", "NEW", "REVIEWED");     // ok
    await move("l1", "NEW", "REVIEWED");     // stale — already REVIEWED
    await move("l1", "REVIEWED", "CLOSED");  // forbidden
    await move("l1", "REVIEWED", "CONTACTED"); // ok
    expect(auditCalls.map((e) => e.metadata)).toEqual([
      { fromStatus: "NEW", toStatus: "REVIEWED" },
      { fromStatus: "REVIEWED", toStatus: "CONTACTED" },
    ]);
  });

  it("carries a correlation id", async () => {
    leads = [demoLead("l1")];
    await move("l1", "NEW", "REVIEWED");
    expect(typeof auditCalls[0].correlationId).toBe("string");
    expect(String(auditCalls[0].correlationId).length).toBeGreaterThan(0);
  });
});
