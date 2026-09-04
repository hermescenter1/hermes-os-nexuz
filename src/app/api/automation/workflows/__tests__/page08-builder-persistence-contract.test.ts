/**
 * PAGE 08 — WORKFLOW BUILDER — persistence contract.
 *
 * This file previously pinned the defect: conditions, actions and a changed
 * trigger were dropped while the caller received 201/200. It now pins the
 * closure.
 *
 * Invariants asserted here:
 *   CONDITIONS_REACH_PERSISTENCE       = 1
 *   ACTIONS_REACH_PERSISTENCE          = 1
 *   ACTION_ORDER_PRESERVED             = 1
 *   TRIGGER_MUTABLE_ON_UPDATE          = 1
 *   SILENT_DISCARD_REPORTED_AS_SUCCESS = 0
 *   CREATE_ATOMICITY                   = 1
 *   UPDATE_ATOMICITY                   = 1
 *   CREDENTIAL_CONFIG_ACCEPTED         = 0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = Record<string, unknown> & { id: string };

let user: { id: string; email: string; name: string; role: string } | null = null;
let workflows: Row[] = [];
let conditions: Row[] = [];
let actions: Row[] = [];
let seq = 0;
/** Set to make the next child createMany throw, to exercise rollback. */
let failChildWrite = false;
/** Set to make the scalar updateMany throw, to exercise error classification. */
let failScalarWrite = false;
/** Set to make getPrisma() return null, as it does outside database mode. */
let dbUnavailable = false;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const nextId = (p: string) => `${p}-${++seq}`;

function models() {
  return {
    workflowDefinition: {
      /**
       * A Prisma nested write is one implicit transaction, so the parent must
       * not survive a failing child. Modelling that faithfully is what makes
       * the atomicity assertion meaningful: had the route created the parent
       * and its children in separate calls, this mock would leave the orphan
       * behind and the test would fail.
       */
      create: async ({ data, include }: { data: Record<string, unknown>; include?: unknown }) => {
        const { conditions: nc, actions: na, ...scalars } = data as Record<string, unknown> & {
          conditions?: { create: Record<string, unknown>[] };
          actions?: { create: Record<string, unknown>[] };
        };
        const snapshot = { w: clone(workflows), c: clone(conditions), a: clone(actions) };
        try {
          const row = { id: nextId("wf"), createdAt: new Date(), updatedAt: new Date(), ...scalars } as Row;
          workflows.push(row);
          for (const c of nc?.create ?? []) {
            if (failChildWrite) throw new Error("child write failed");
            conditions.push({ id: nextId("c"), workflowId: row.id, createdAt: new Date(), updatedAt: new Date(), ...c });
          }
          for (const a of na?.create ?? []) {
            if (failChildWrite) throw new Error("child write failed");
            actions.push({ id: nextId("a"), workflowId: row.id, createdAt: new Date(), updatedAt: new Date(), ...a });
          }
          return include ? withChildren(row) : row;
        } catch (err) {
          workflows = snapshot.w;
          conditions = snapshot.c;
          actions = snapshot.a;
          throw err;
        }
      },
      updateMany: async ({ where, data }: { where: { id: string; deletedAt: null }; data: Record<string, unknown> }) => {
        if (failScalarWrite) throw new Error("scalar write failed");
        const matched = workflows.filter(r => r.id === where.id && !r.deletedAt);
        matched.forEach(r => Object.assign(r, data));
        return { count: matched.length };
      },
      findFirst: async ({ where, include }: { where: { id: string }; include?: unknown }) => {
        const row = workflows.find(r => r.id === where.id && !r.deletedAt);
        if (!row) return null;
        return include ? withChildren(row) : row;
      },
    },
    workflowCondition: {
      deleteMany: async ({ where }: { where: { workflowId: string } }) => {
        conditions = conditions.filter(c => c.workflowId !== where.workflowId);
        return { count: 0 };
      },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        if (failChildWrite) throw new Error("child write failed");
        for (const c of data) conditions.push({ id: nextId("c"), createdAt: new Date(), updatedAt: new Date(), ...c } as Row);
        return { count: data.length };
      },
    },
    workflowAction: {
      deleteMany: async ({ where }: { where: { workflowId: string } }) => {
        actions = actions.filter(a => a.workflowId !== where.workflowId);
        return { count: 0 };
      },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        if (failChildWrite) throw new Error("child write failed");
        for (const a of data) actions.push({ id: nextId("a"), createdAt: new Date(), updatedAt: new Date(), ...a } as Row);
        return { count: data.length };
      },
    },
  };
}

function withChildren(row: Row) {
  return {
    ...row,
    conditions: conditions.filter(c => c.workflowId === row.id),
    actions: actions
      .filter(a => a.workflowId === row.id)
      .sort((x, y) => Number(x.order) - Number(y.order)),
  };
}

function makeDb() {
  const m = models();
  return {
    ...m,
    /** Real all-or-nothing semantics: state is restored if the callback throws. */
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = { w: clone(workflows), c: clone(conditions), a: clone(actions) };
      try {
        return await fn(m);
      } catch (err) {
        workflows = snapshot.w;
        conditions = snapshot.c;
        actions = snapshot.a;
        throw err;
      }
    },
  };
}

const MOCKED = ["@/lib/auth/session", "@/lib/db/prisma"];

beforeEach(() => {
  vi.resetModules();
  user = { id: "eng-1", email: "engineer@hermesnovin.test", name: "Engineer", role: "admin" };
  workflows = []; conditions = []; actions = []; seq = 0;
  failChildWrite = false; failScalarWrite = false; dbUnavailable = false;
  vi.doMock("@/lib/auth/session", () => ({ getCurrentUser: async () => user }));
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => (dbUnavailable ? null : makeDb()) }));
});

afterEach(() => {
  for (const m of MOCKED) vi.doUnmock(m);
  vi.restoreAllMocks();
});

const json = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const post = (body: unknown) => json("http://localhost/api/automation/workflows", "POST", body);
const patch = (id: string, body: unknown) =>
  json(`http://localhost/api/automation/workflows/${id}`, "PATCH", body);

async function createWorkflowVia(body: unknown) {
  const { POST } = await import("../route");
  const res = await POST(post(body));
  return { res, body: (await res.json()) as Record<string, unknown> };
}

async function patchWorkflowVia(id: string, body: unknown) {
  const { PATCH } = await import("../[id]/route");
  const res = await PATCH(patch(id, body), { params: Promise.resolve({ id }) });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

/** A complete workflow, exactly as the builder holds it. */
const FULL = {
  name: "Line 2 Downtime Escalation",
  description: "Escalate when line 2 stops",
  triggerType: "INDUSTRIAL_ASSET_RISK_HIGH",
  conditions: [
    { type: "HEALTH_SCORE_BELOW", value: "40" },
    { type: "PRIORITY_IS", value: "CRITICAL" },
  ],
  actions: [
    { type: "CREATE_MAINTENANCE_ALERT", config: { priority: "CRITICAL", message: "Inspect line 2" } },
    { type: "CREATE_NOTIFICATION", config: { message: "Line 2 escalation raised" } },
    { type: "CREATE_AUDIT_LOG", config: { severity: "CRITICAL", event: "line2_escalation" } },
  ],
};

describe("PAGE 08 — create persists the whole workflow", () => {
  it("CONDITIONS_REACH_PERSISTENCE = 1", async () => {
    const { res } = await createWorkflowVia(FULL);
    expect(res.status).toBe(201);
    expect(conditions).toHaveLength(2);
    expect(conditions.map(c => c.type)).toEqual(["HEALTH_SCORE_BELOW", "PRIORITY_IS"]);
    expect(conditions[0].value).toBe("40");
  });

  it("ACTIONS_REACH_PERSISTENCE = 1", async () => {
    await createWorkflowVia(FULL);
    expect(actions).toHaveLength(3);
    expect(actions.map(a => a.type)).toEqual([
      "CREATE_MAINTENANCE_ALERT", "CREATE_NOTIFICATION", "CREATE_AUDIT_LOG",
    ]);
  });

  it("ACTION_ORDER_PRESERVED = 1 — dense 1-based order from array position", async () => {
    await createWorkflowVia(FULL);
    expect(actions.map(a => a.order)).toEqual([1, 2, 3]);
  });

  it("persists action config verbatim", async () => {
    await createWorkflowVia(FULL);
    expect(actions[0].config).toEqual({ priority: "CRITICAL", message: "Inspect line 2" });
  });

  it("persists the trigger and templateId", async () => {
    await createWorkflowVia({ ...FULL, templateId: "tpl-06" });
    expect(workflows[0].triggerType).toBe("INDUSTRIAL_ASSET_RISK_HIGH");
    expect(workflows[0].templateId).toBe("tpl-06");
  });

  it("returns the persisted children to the caller", async () => {
    const { body } = await createWorkflowVia(FULL);
    expect((body.conditions as unknown[])).toHaveLength(2);
    expect((body.actions as unknown[])).toHaveLength(3);
  });

  it("still creates a workflow with no conditions and no actions", async () => {
    const { res } = await createWorkflowVia({ name: "Bare", triggerType: "MANUAL" });
    expect(res.status).toBe(201);
    expect(workflows).toHaveLength(1);
    expect(conditions).toHaveLength(0);
    expect(actions).toHaveLength(0);
  });

  it("CREATE_ATOMICITY = 1 — a failing child leaves no parent behind", async () => {
    failChildWrite = true;
    const { res } = await createWorkflowVia(FULL);
    expect(res.status).toBe(202);
    expect(workflows).toHaveLength(0);
    expect(conditions).toHaveLength(0);
    expect(actions).toHaveLength(0);
  });
});

describe("PAGE 08 — update persists the whole workflow", () => {
  async function seed() {
    const { body } = await createWorkflowVia(FULL);
    return String(body.id);
  }

  it("conditions changed and persisted", async () => {
    const id = await seed();
    const { res } = await patchWorkflowVia(id, {
      conditions: [{ type: "STATUS_IS", value: "STOPPED" }],
    });
    expect(res.status).toBe(200);
    expect(conditions).toHaveLength(1);
    expect(conditions[0].type).toBe("STATUS_IS");
    expect(conditions[0].value).toBe("STOPPED");
  });

  it("removed conditions actually disappear", async () => {
    const id = await seed();
    await patchWorkflowVia(id, { conditions: [] });
    expect(conditions).toHaveLength(0);
  });

  it("actions changed and persisted", async () => {
    const id = await seed();
    await patchWorkflowVia(id, {
      actions: [{ type: "CREATE_TASK", config: { title: "Inspect" } }],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("CREATE_TASK");
    expect(actions[0].config).toEqual({ title: "Inspect" });
  });

  it("removed actions actually disappear — no stale rows", async () => {
    const id = await seed();
    await patchWorkflowVia(id, { actions: [] });
    expect(actions).toHaveLength(0);
  });

  it("ACTION_ORDER changed and persisted", async () => {
    const id = await seed();
    await patchWorkflowVia(id, {
      actions: [
        { type: "CREATE_AUDIT_LOG", config: { event: "first_now" } },
        { type: "CREATE_MAINTENANCE_ALERT", config: { priority: "HIGH" } },
      ],
    });
    const ordered = [...actions].sort((a, b) => Number(a.order) - Number(b.order));
    expect(ordered.map(a => a.type)).toEqual(["CREATE_AUDIT_LOG", "CREATE_MAINTENANCE_ALERT"]);
    expect(ordered.map(a => a.order)).toEqual([1, 2]);
  });

  it("TRIGGER_MUTABLE_ON_UPDATE = 1 — a changed trigger is written, not dropped", async () => {
    const id = await seed();
    const { res } = await patchWorkflowVia(id, { triggerType: "CRM_CUSTOMER_AT_RISK" });
    expect(res.status).toBe(200);
    expect(workflows[0].triggerType).toBe("CRM_CUSTOMER_AT_RISK");
  });

  it("an omitted collection is left alone (PATCH semantics)", async () => {
    const id = await seed();
    await patchWorkflowVia(id, { name: "Renamed only" });
    expect(workflows[0].name).toBe("Renamed only");
    expect(conditions).toHaveLength(2);
    expect(actions).toHaveLength(3);
  });

  it("a status-only transition keeps the children", async () => {
    const id = await seed();
    await patchWorkflowVia(id, { status: "ACTIVE" });
    expect(workflows[0].status).toBe("ACTIVE");
    expect(actions).toHaveLength(3);
  });

  it("UPDATE_ATOMICITY = 1 — a failing child write rolls back the scalars too", async () => {
    const id = await seed();
    failChildWrite = true;
    const { res } = await patchWorkflowVia(id, {
      name: "Should not survive",
      actions: [{ type: "CREATE_TASK", config: { title: "x" } }],
    });
    expect(res.status).toBe(500);
    expect(workflows[0].name).toBe(FULL.name);
    expect(actions).toHaveLength(3);
    expect(actions.map(a => a.type)).toEqual([
      "CREATE_MAINTENANCE_ALERT", "CREATE_NOTIFICATION", "CREATE_AUDIT_LOG",
    ]);
  });
});

describe("PAGE 08 — SILENT_DISCARD_REPORTED_AS_SUCCESS = 0", () => {
  it("rejects an unknown field on create instead of stripping it", async () => {
    const { res } = await createWorkflowVia({ ...FULL, notAField: "x" });
    expect(res.status).toBe(400);
    expect(workflows).toHaveLength(0);
  });

  it("rejects a client-chosen initial status instead of ignoring it", async () => {
    const { res } = await createWorkflowVia({ name: "X", triggerType: "MANUAL", status: "ACTIVE" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown field on update instead of stripping it", async () => {
    const { body } = await createWorkflowVia(FULL);
    const { res } = await patchWorkflowVia(String(body.id), { name: "ok", nope: 1 });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown key inside an action instead of stripping it", async () => {
    const { res } = await createWorkflowVia({
      name: "X", triggerType: "MANUAL",
      actions: [{ type: "CREATE_TASK", config: { title: "t" }, order: 7 }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unusable trigger instead of failing at the database", async () => {
    const { res } = await createWorkflowVia({ name: "X", triggerType: "NOT_A_TRIGGER" });
    expect(res.status).toBe(400);
    expect(workflows).toHaveLength(0);
  });

  it("rejects an unusable action type", async () => {
    const { res } = await createWorkflowVia({
      name: "X", triggerType: "MANUAL",
      actions: [{ type: "RUN_ARBITRARY_CODE", config: {} }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unusable condition type", async () => {
    const { res } = await createWorkflowVia({
      name: "X", triggerType: "MANUAL",
      conditions: [{ type: "SOMETHING_ELSE", value: "1" }],
    });
    expect(res.status).toBe(400);
  });
});

describe("PAGE 08 — credential-bearing config is refused at the boundary", () => {
  /** Synthetic values only. */
  const CASES: Array<[string, string]> = [
    ["apiKey", "SYNTHETIC_A"], ["api_key", "SYNTHETIC_B"], ["token", "SYNTHETIC_C"],
    ["accessToken", "SYNTHETIC_D"], ["refreshToken", "SYNTHETIC_E"], ["secret", "SYNTHETIC_F"],
    ["clientSecret", "SYNTHETIC_G"], ["password", "SYNTHETIC_H"],
    ["authorization", "SYNTHETIC_I"], ["Authorization", "SYNTHETIC_J"],
  ];

  for (const [key, value] of CASES) {
    it(`CREDENTIAL_CONFIG_ACCEPTED = 0 for ${key}`, async () => {
      const { res } = await createWorkflowVia({
        name: "X", triggerType: "MANUAL",
        actions: [{ type: "SEND_WEBHOOK", config: { [key]: value } }],
      });
      expect(res.status).toBe(400);
      expect(actions).toHaveLength(0);
    });
  }

  it("never echoes the rejected value back to the caller", async () => {
    const { res, body } = await createWorkflowVia({
      name: "X", triggerType: "MANUAL",
      actions: [{ type: "SEND_WEBHOOK", config: { apiKey: "SYNTHETIC_ECHO_PROBE" } }],
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(body)).not.toContain("SYNTHETIC_ECHO_PROBE");
  });

  it("refuses a nested object rather than storing an unbounded document", async () => {
    const { res } = await createWorkflowVia({
      name: "X", triggerType: "MANUAL",
      actions: [{ type: "SEND_WEBHOOK", config: { headers: { Authorization: "Bearer SYNTHETIC" } } }],
    });
    expect(res.status).toBe(400);
  });

  it("keeps accepting the safe operational config the engine actually reads", async () => {
    const { res } = await createWorkflowVia({
      name: "X", triggerType: "MANUAL",
      actions: [{ type: "CREATE_SUPPORT_TICKET", config: { priority: "HIGH", title: "Line 2", category: "ops" } }],
    });
    expect(res.status).toBe(201);
    expect(actions[0].config).toEqual({ priority: "HIGH", title: "Line 2", category: "ops" });
  });
});

/**
 * A write that did not happen must not be reported as a workflow that does not
 * exist. Only a genuinely absent (or soft-deleted) workflow may answer 404.
 */
describe("PAGE 08 — PATCH error classification", () => {
  async function seed() {
    const { body } = await createWorkflowVia(FULL);
    return String(body.id);
  }

  it("PATCH_NOT_FOUND_STATUS = 404 for a workflow that does not exist", async () => {
    const { res, body } = await patchWorkflowVia("wf-missing", { name: "x" });
    expect(res.status).toBe(404);
    expect(body.error).toBe("not_found");
  });

  it("answers 404 for a soft-deleted workflow rather than resurrecting it", async () => {
    const id = await seed();
    workflows[0].deletedAt = new Date();
    const { res, body } = await patchWorkflowVia(id, { name: "revived?" });
    expect(res.status).toBe(404);
    expect(body.error).toBe("not_found");
    expect(workflows[0].name).toBe(FULL.name);
  });

  it("PATCH_PERSISTENCE_FAILURE_NOT_404 — a failed scalar write answers 500", async () => {
    const id = await seed();
    failScalarWrite = true;
    const { res, body } = await patchWorkflowVia(id, { name: "x" });
    expect(res.status).toBe(500);
    expect(body.error).toBe("update_failed");
  });

  it("PATCH_PERSISTENCE_FAILURE_NOT_404 — a failed child write answers 500", async () => {
    const id = await seed();
    failChildWrite = true;
    const { res, body } = await patchWorkflowVia(id, { actions: [{ type: "CREATE_TASK", config: {} }] });
    expect(res.status).toBe(500);
    expect(body.error).toBe("update_failed");
  });

  it("answers 503 when the database is not available at all", async () => {
    dbUnavailable = true;
    const { res, body } = await patchWorkflowVia("wf-1", { name: "x" });
    expect(res.status).toBe(503);
    expect(body.error).toBe("service_unavailable");
  });

  it("leaks no SQL, Prisma internals or connection detail in any failure body", async () => {
    const id = await seed();
    const bodies: string[] = [];

    failScalarWrite = true;
    bodies.push(JSON.stringify((await patchWorkflowVia(id, { name: "x" })).body));
    failScalarWrite = false;

    failChildWrite = true;
    bodies.push(JSON.stringify((await patchWorkflowVia(id, { actions: [] , conditions: [{ type: "ALWAYS" }] })).body));
    failChildWrite = false;

    dbUnavailable = true;
    bodies.push(JSON.stringify((await patchWorkflowVia(id, { name: "x" })).body));

    for (const b of bodies) {
      for (const leak of ["prisma", "Prisma", "postgres", "postgresql://", "DATABASE_URL", "SELECT", "UPDATE ", "stack", "at Object."]) {
        expect(b, `${leak} in ${b}`).not.toContain(leak);
      }
      // The token vocabulary is the only thing a client ever sees.
      expect(["not_found", "service_unavailable", "update_failed"]).toContain(JSON.parse(b).error);
    }
  });

  it("activate and pause classify the same way", async () => {
    const id = await seed();
    const { POST } = await import("../[id]/activate/route");
    failScalarWrite = true;
    const res = await POST(
      new Request(`http://localhost/api/automation/workflows/${id}/activate`, { method: "POST" }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json() as { error: string }).error).toBe("update_failed");
  });
});
