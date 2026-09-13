/**
 * CMMS data access.
 *
 * PHASE 110-A2.0 — LIKE THE ASSET REGISTRY, THIS LAYER NEVER REACHED POSTGRESQL.
 *
 * It carried its own client accessor built on a bare `new PrismaClient()`, which
 * under Prisma 7 `driverAdapters` throws before it attempts a connection. Every
 * one of the 26 exports below therefore ran its `catch { /* fall through *\/ }`
 * and answered from a `MOCK_*` array — on every deployment, including one with a
 * working `DATABASE_URL`. Measured, not inferred: the A2.0 pack's
 * `probe-bare-client.log`.
 *
 * WHAT CHANGED
 *   1. `getPrisma()`, the repository's single accessor, with the pg adapter.
 *   2. Every query filtered by the organization the SERVER resolved. No export
 *      takes an organization id, so no URL, body or header can supply one, and
 *      a platform or holding-level role does not widen it.
 *   3. No mock, no `[]` on failure, no silent catch. An outage, a missing
 *      selection and a genuinely empty maintenance programme are three
 *      different answers.
 *
 * HOW EACH MODEL REACHES ITS ORGANIZATION — read from the schema, not assumed:
 *
 *   DIRECT column          Plan, Schedule, Task, Team, Technician, WorkCenter,
 *                          SparePart, Downtime, Failure, Calendar
 *   THROUGH A REQUIRED     History, Approval, Comment, Cost   (all via `task`)
 *   THROUGH A NULLABLE     Checklist, Notification            (via `task`)
 *   NO TENANT AT ALL       FailureCode
 *
 * THE NULLABLE TWO ARE FAIL-CLOSED, AND THAT HAS A COST WORTH NAMING.
 * `MaintenanceChecklist.taskId` and `MaintenanceNotification.taskId` are
 * optional. A row with a null `taskId` belongs to no task, therefore to no
 * organization, and this layer will not show it to any of them. It is not
 * assigned to the reader's organization to keep it visible — inventing an owner
 * is the one thing worse than hiding a row. How many such rows exist in a
 * populated database is unmeasured here and is a stated rollout precondition.
 *
 * FAILURE CODES ARE GLOBAL, DELIBERATELY.
 * `FailureCode` is a taxonomy — `code @unique`, a fixed set of categories and
 * severities — with no organization column and no relation to one. It is read
 * unscoped, and that is a decision rather than an oversight: see
 * `getFailureCodes` below, which carries the reasoning and is covered by its own
 * test. A schema that let a customer define private failure codes would make
 * this wrong; today's schema cannot express that.
 */

import type {
  MaintenancePlan, MaintenanceSchedule, MaintenanceTask,
  MaintenanceFailure, MaintenanceDowntime, MaintenanceSparePart,
  MaintenanceTechnician, MaintenanceTeam, MaintenanceWorkCenter,
  MaintenanceCost, MaintenanceChecklist, MaintenanceCalendarEvent,
  FailureCode, MaintenanceHistory, MaintenanceComment, MaintenanceApproval,
  MaintenanceNotification, CmmsDashboard,
} from "./types";
import { computeKpis, computeDowntimeTrend } from "./kpi";
import { isPrismaCode, requireDatabase, requireTenantScope, runScoped } from "@/lib/data-access/tenant-scope";
import type { CmmsWriteScope } from "@/lib/data-access/write-guard";
import {
  assertRelationsOwned, rejectUnsupportedFields,
  TASK_RELATIONS, PLAN_RELATIONS, FAILURE_RELATIONS, DOWNTIME_RELATIONS,
  type RelationCheck,
} from "@/lib/data-access/relation-ownership";

function ts(rows: unknown[]): unknown[] {
  return rows.map(r => {
    const obj = r as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      out[k] = v instanceof Date ? v.toISOString() : v;
    }
    return out;
  });
}

interface Model {
  findMany: (args: unknown) => Promise<unknown[]>;
  findFirst: (args: unknown) => Promise<unknown | null>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
}
const model = (db: Record<string, unknown>, name: string): Model => db[name] as unknown as Model;

/**
 * `$transaction`, bound to the client it came from.
 *
 * Prisma's `$transaction` reads private state off its receiver, so a detached
 * reference throws before any statement executes. Binding once, here, is the
 * one place that can be got wrong instead of five.
 */
type TxFn = (
  fn: (c: Record<string, unknown>) => Promise<unknown>,
  opts?: { isolationLevel?: string },
) => Promise<unknown>;

const withTx = (db: Record<string, unknown>): TxFn =>
  (db.$transaction as TxFn).bind(db) as TxFn;

/**
 * The three things every scoped call needs, obtained together.
 *
 * One helper rather than three lines repeated 26 times — and, more to the point,
 * one place where forgetting the tenant is impossible: there is no way to get a
 * database handle out of this module without also getting the organization.
 */
async function scope(operation: string) {
  const { organizationId } = await requireTenantScope();
  const db = await requireDatabase(operation);
  return { organizationId, db };
}

/**
 * PHASE 110-A2.3 — a WRITE uses the scope its route already verified.
 *
 * The five write functions below used to call `scope()` like every read, which
 * resolved the tenant a second time. That second resolution was the whole
 * problem: the route could check a precondition and a permission against one
 * organization and the write could then be performed in whatever the cookie said
 * at the moment the layer asked. Two resolutions are two answers.
 *
 * They now take the organization the route verified. There is no parameter here
 * that a request body could reach: `VerifiedWriteScope` is produced only by
 * `requireWriteScope`, from the session and the selection cookie, and the route
 * cannot construct one from anything a caller sent.
 *
 * Authorization therefore happens in exactly one place — `write-guard.ts`,
 * called by the route — and connects to the write by being the value the write
 * uses. A caller that skipped the guard has no scope to pass.
 */
async function writeScope(operation: string, verified: CmmsWriteScope) {
  const db = await requireDatabase(operation);
  return { organizationId: verified.organizationId, db };
}

/** A model whose own row carries `organizationId`. */
const own = (organizationId: string) => ({ organizationId });

/**
 * Create a row whose FOREIGN KEYS are proven to belong here too.
 *
 * The ownership checks and the insert run in ONE interactive transaction at
 * `Serializable`, so the checks and the insert see a single snapshot.
 *
 * WHAT THAT DOES NOT GUARANTEE — corrected in PHASE 110-A2.3-R1. An earlier
 * version of this comment said a concurrent attempt to move a referenced row
 * into another organization "becomes a serialization failure rather than a
 * silent success". That was measured FALSE in the A2.0 concurrency probe: with
 * two connections and a barrier, a plain AUTOCOMMIT `UPDATE` that re-parented
 * the referenced row committed, and so did this transaction. `Serializable`
 * protects against anomalies between serializable transactions; it does not
 * make an autocommit writer wait for this one. The window between the ownership
 * read and the insert is therefore real, and it is narrow rather than closed.
 *
 * The durable fix is a composite foreign key `(organizationId, id)`, a schema
 * change this slice forbids. The limit is recorded in `relation-ownership.ts`
 * and here, rather than papered over by an isolation level that does not close it.
 */
async function createOwned<T>(
  operation: string,
  organizationId: string,
  db: Record<string, unknown>,
  modelName: string,
  data: Partial<T>,
  relations: readonly RelationCheck[],
): Promise<T> {
  const payload = rejectUnsupportedFields(data as Record<string, unknown>);

  const row = await runScoped(operation, () =>
    /*
     * CALLED AS A METHOD, never detached.
     *
     * `const tx = db.$transaction; tx(...)` loses the receiver and Prisma raises
     * `TypeError: Cannot read properties of undefined (reading '_engineConfig')`
     * before a single statement runs. Every write in this layer returned 503
     * because of it, and the sanitiser — correctly — reduced the log line to
     * `TypeError`, so the cause had to be reproduced rather than read. See
     * `probe-transaction.log` in the A2.0 pack: detached throws, method call and
     * `.bind(db)` both succeed.
     */
    withTx(db)(
      async (c) => {
        await assertRelationsOwned(c, organizationId, payload, relations);
        return (c[modelName] as unknown as Model).create({
          data: { ...payload, organizationId } as never,
        });
      },
      { isolationLevel: "Serializable" },
    ),
  );
  return ts([row])[0] as T;
}

/**
 * A model that reaches its organization through its task.
 *
 * Used for both the required and the nullable relations. For the nullable ones
 * this is exactly the fail-closed behaviour described in the header: Prisma
 * renders `task: { organizationId }` as an inner join, so a row whose `taskId`
 * is null matches nothing.
 */
const viaTask = (organizationId: string) => ({ task: { organizationId } });

// ── Plans ─────────────────────────────────────────────────────────────────────

export async function getPlans(type?: string, active?: boolean): Promise<MaintenancePlan[]> {
  const { organizationId, db } = await scope("cmms.getPlans");
  const rows = await runScoped("cmms.getPlans", () =>
    model(db, "maintenancePlan").findMany({
      where: {
        ...(type   ? { maintenanceType: type as never }   : {}),
        ...(active !== undefined ? { isActive: active } : {}),
        ...own(organizationId),
      },
      /*
       * The counts are FILTERED, not bare. `_count: { select: { tasks: true } }`
       * counts every task pointing at this plan whatever organization it belongs
       * to, so a foreign row would show up in an Alpha screen as a number. A
       * leaked count is still a leak; it is only harder to notice than a leaked
       * row.
       */
      include: {
        _count: {
          select: {
            tasks: { where: own(organizationId) },
            schedules: { where: own(organizationId) },
          },
        },
      },
      orderBy: { nextDueAt: "asc" },
    }),
  );
  return ts(rows) as MaintenancePlan[];
}

/**
 * `findFirst` with the tenant IN the predicate.
 *
 * A CORRECTION. This comment first said a unique lookup "cannot carry a second
 * condition". It can: Prisma 7.8.0 generates `WhereUniqueInput` as
 * `Prisma.AtLeast<{ id?, organizationId?, … }>` — extendedWhereUnique, GA since
 * Prisma 5 — and `findUnique({ where: { id, organizationId } })` was verified
 * against a real database rather than read off a type. `findFirst` is a style
 * choice here, not a workaround.
 *
 * The property is what matters and both APIs give it: the organization is in
 * the predicate, so a foreign id matches nothing and is indistinguishable from
 * a missing one. Every `*ById` in this file follows the same rule.
 */
export async function getPlanById(id: string): Promise<MaintenancePlan | null> {
  const { organizationId, db } = await scope("cmms.getPlanById");
  const row = await runScoped("cmms.getPlanById", () =>
    model(db, "maintenancePlan").findFirst({
      where: { id, ...own(organizationId) },
      include: {
        _count: {
          select: {
            tasks: { where: own(organizationId) },
            schedules: { where: own(organizationId) },
          },
        },
      },
    }),
  );
  return row ? (ts([row])[0] as MaintenancePlan) : null;
}

/**
 * The organization is STAMPED from the server scope, and the caller's own
 * `organizationId` is discarded if it sent one.
 *
 * `data` arrives from a route body. Spreading it after the scope would let a
 * caller choose the tenant it is created in; spreading it before and then
 * re-stating the scope is what makes that impossible. Every `create` here does
 * it in this order for that reason.
 */
export async function createPlan(
  verified: CmmsWriteScope,
  data: Partial<MaintenancePlan>,
): Promise<MaintenancePlan> {
  const { organizationId, db } = await writeScope("cmms.createPlan", verified);
  return createOwned("cmms.createPlan", organizationId, db, "maintenancePlan", data, PLAN_RELATIONS);
}

// ── Schedules ─────────────────────────────────────────────────────────────────

export async function getSchedules(status?: string): Promise<MaintenanceSchedule[]> {
  const { organizationId, db } = await scope("cmms.getSchedules");
  const rows = await runScoped("cmms.getSchedules", () =>
    model(db, "maintenanceSchedule").findMany({
      where: { ...(status ? { status: status as never } : {}), ...own(organizationId) },
      orderBy: { scheduledDate: "asc" },
    }),
  );
  return ts(rows) as MaintenanceSchedule[];
}

// ── Tasks / Work Orders ───────────────────────────────────────────────────────

export async function getTasks(
  status?: string, type?: string, priority?: string, assetId?: string,
): Promise<MaintenanceTask[]> {
  const { organizationId, db } = await scope("cmms.getTasks");
  const rows = await runScoped("cmms.getTasks", () =>
    model(db, "maintenanceTask").findMany({
      where: {
        deletedAt: null,
        ...(status   ? { status:          status   as never } : {}),
        ...(type     ? { maintenanceType: type     as never } : {}),
        ...(priority ? { priority:        priority as never } : {}),
        ...(assetId  ? { assetId }                           : {}),
        ...own(organizationId),
      },
      orderBy: [{ priority: "desc" }, { scheduledDate: "asc" }],
    }),
  );
  return ts(rows) as MaintenanceTask[];
}

export async function getTaskById(id: string): Promise<MaintenanceTask | null> {
  const { organizationId, db } = await scope("cmms.getTaskById");
  const row = await runScoped("cmms.getTaskById", () =>
    model(db, "maintenanceTask").findFirst({ where: { id, ...own(organizationId) } }),
  );
  return row ? (ts([row])[0] as MaintenanceTask) : null;
}

export async function createTask(
  verified: CmmsWriteScope,
  data: Partial<MaintenanceTask>,
): Promise<MaintenanceTask> {
  const { organizationId, db } = await writeScope("cmms.createTask", verified);
  return createOwned("cmms.createTask", organizationId, db, "maintenanceTask", data, TASK_RELATIONS);
}

/**
 * ONE statement, with the tenant in the predicate, returning the row it wrote.
 *
 * WHAT THIS REPLACED, AND WHY. The first version did `updateMany({ where: { id,
 * organizationId } })` and then a separate `findFirst` to get the row back,
 * because I believed `update` could not carry a non-unique field. It can:
 * Prisma 7.8.0 generates `WhereUniqueInput` as
 * `Prisma.AtLeast<{ id?, organizationId?, … }>`, verified against a real
 * database in `probe-prisma-where.log`. The two-step had a failure the single
 * statement does not: if the second read failed, the write had already
 * happened and the caller was told the operation failed.
 *
 * THE CLAIM THIS SUPPORTS, EXACTLY: the gap where a SECOND READ could fail
 * after a successful write is gone.
 *
 * THE CLAIM IT DOES NOT SUPPORT: that a write can no longer succeed while its
 * response fails to arrive. A connection dropped after COMMIT and before the
 * response reaches the caller is outside anything this function can see, and
 * saying otherwise would be false. A caller that retries on an unclear outcome
 * must reconcile, not replay blindly.
 *
 * P2025 IS NOT AN OUTAGE. Prisma raises it when the predicate matches no row —
 * which here means the id does not exist, or it belongs to another
 * organization, or it has no owner at all. All three answer `null`, the same
 * answer, so the function is not an existence oracle. It is caught NARROWLY:
 * only when the error carries that code, and only around this one statement, so
 * a P2025 raised by some future nested operation is not blindly relabelled
 * "record not found".
 *
 * `organizationId` and `id` are stripped from the patch: a body cannot move a
 * row between organizations or rewrite its identity. The remaining foreign keys
 * are validated against this organization before the write, in the same
 * transaction, for the reason given in `relation-ownership.ts`.
 */
export async function updateTask(
  verified: CmmsWriteScope,
  id: string,
  data: Partial<MaintenanceTask>,
): Promise<MaintenanceTask | null> {
  const { organizationId, db } = await writeScope("cmms.updateTask", verified);
  const patch = rejectUnsupportedFields(data as Record<string, unknown>);

  /*
   * THE CLASSIFICATION IS `runScoped`'S, NOT THIS FUNCTION'S — corrected.
   *
   * This path used to end with its own `catch` that answered
   * ORGANIZATION_CONTEXT_UNAVAILABLE for anything that was not P2025. That is
   * the defect this slice removed from `runScoped` and then left standing here:
   * a cross-tenant `assetId` in a PATCH would have been reported as a database
   * outage, 503, and so would a `TypeError` of ours. One classifier decides
   * now: a deliberate refusal travels out untouched, an unreachable database is
   * 503, anything else is 500 with a correlation id.
   *
   * P2025 is handled INSIDE the callback, narrowly, because it is not a failure
   * at all here: the predicate matched no row, which means the id does not
   * exist, or belongs to another organization, or has no owner — one answer,
   * `null`, for all three, so this is not an existence oracle.
   */
  const NOT_FOUND = Symbol("not-found");

  const row = await runScoped("cmms.updateTask", async () => {
    try {
      // A method call, not a detached reference — see `withTx`.
      return await withTx(db)(
        async (c) => {
          await assertRelationsOwned(c, organizationId, patch, TASK_RELATIONS);
          return (c.maintenanceTask as unknown as Model).update({
            where: { id, ...own(organizationId) },
            data: patch as never,
          });
        },
        { isolationLevel: "Serializable" },
      );
    } catch (err) {
      if (isPrismaCode(err, "P2025")) return NOT_FOUND;
      throw err;
    }
  });

  if (row === NOT_FOUND) return null;
  return ts([row])[0] as MaintenanceTask;
}

// ── Failures ──────────────────────────────────────────────────────────────────

export async function getFailures(severity?: string, category?: string): Promise<MaintenanceFailure[]> {
  const { organizationId, db } = await scope("cmms.getFailures");
  const rows = await runScoped("cmms.getFailures", () =>
    model(db, "maintenanceFailure").findMany({
      where: {
        ...(severity ? { severity: severity as never } : {}),
        ...(category ? { category: category as never } : {}),
        ...own(organizationId),
      },
      include: { causes: true, correctiveActions: true },
      orderBy: { occurredAt: "desc" },
    }),
  );
  return ts(rows) as MaintenanceFailure[];
}

export async function getFailureById(id: string): Promise<MaintenanceFailure | null> {
  const { organizationId, db } = await scope("cmms.getFailureById");
  const row = await runScoped("cmms.getFailureById", () =>
    model(db, "maintenanceFailure").findFirst({
      where: { id, ...own(organizationId) },
      include: { causes: true, correctiveActions: true },
    }),
  );
  return row ? (ts([row])[0] as MaintenanceFailure) : null;
}

export async function createFailure(
  verified: CmmsWriteScope,
  data: Partial<MaintenanceFailure>,
): Promise<MaintenanceFailure> {
  const { organizationId, db } = await writeScope("cmms.createFailure", verified);
  return createOwned("cmms.createFailure", organizationId, db, "maintenanceFailure", data, FAILURE_RELATIONS);
}

// ── Downtime ──────────────────────────────────────────────────────────────────

export async function getDowntime(assetId?: string, reason?: string): Promise<MaintenanceDowntime[]> {
  const { organizationId, db } = await scope("cmms.getDowntime");
  const rows = await runScoped("cmms.getDowntime", () =>
    model(db, "maintenanceDowntime").findMany({
      where: {
        ...(assetId ? { assetId } : {}),
        ...(reason  ? { reason: reason as never } : {}),
        ...own(organizationId),
      },
      orderBy: { startedAt: "desc" },
    }),
  );
  return ts(rows) as MaintenanceDowntime[];
}

export async function createDowntime(
  verified: CmmsWriteScope,
  data: Partial<MaintenanceDowntime>,
): Promise<MaintenanceDowntime> {
  const { organizationId, db } = await writeScope("cmms.createDowntime", verified);
  return createOwned("cmms.createDowntime", organizationId, db, "maintenanceDowntime", data, DOWNTIME_RELATIONS);
}

// ── Checklists ────────────────────────────────────────────────────────────────

/**
 * Reached through the task, which is NULLABLE.
 *
 * A checklist with no `taskId` — a free-standing template, for instance — has no
 * owner this layer can prove, so it is not returned to anybody. That is the
 * fail-closed decision stated in the header: a row of unknown ownership is
 * hidden, never assigned. Making templates first-class would need an owning
 * column, which is a schema change and out of this slice.
 */
export async function getChecklists(taskId?: string, isTemplate?: boolean): Promise<MaintenanceChecklist[]> {
  const { organizationId, db } = await scope("cmms.getChecklists");
  const rows = await runScoped("cmms.getChecklists", () =>
    model(db, "maintenanceChecklist").findMany({
      where: {
        ...(taskId ? { taskId } : {}),
        ...(isTemplate !== undefined ? { isTemplate } : {}),
        ...viaTask(organizationId),
      },
      include: { items: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
  );
  return ts(rows) as MaintenanceChecklist[];
}

// ── Spare Parts ───────────────────────────────────────────────────────────────

export async function getSpareParts(category?: string, lowStock?: boolean): Promise<MaintenanceSparePart[]> {
  const { organizationId, db } = await scope("cmms.getSpareParts");
  const rows = await runScoped("cmms.getSpareParts", () =>
    model(db, "maintenanceSparePart").findMany({
      where: { isActive: true, ...(category ? { category } : {}), ...own(organizationId) },
      orderBy: { name: "asc" },
    }),
  );
  const parts = ts(rows) as MaintenanceSparePart[];
  return lowStock ? parts.filter(p => p.stockQty <= p.minStockQty) : parts;
}

// ── Costs ─────────────────────────────────────────────────────────────────────

export async function getCosts(taskId?: string, category?: string): Promise<MaintenanceCost[]> {
  const { organizationId, db } = await scope("cmms.getCosts");
  const rows = await runScoped("cmms.getCosts", () =>
    model(db, "maintenanceCost").findMany({
      where: {
        ...(taskId   ? { taskId }   : {}),
        ...(category ? { category } : {}),
        ...viaTask(organizationId),
      },
      orderBy: { date: "desc" },
    }),
  );
  return ts(rows) as MaintenanceCost[];
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export async function getCalendarEvents(
  from?: string, to?: string,
): Promise<MaintenanceCalendarEvent[]> {
  const { organizationId, db } = await scope("cmms.getCalendarEvents");
  const rows = await runScoped("cmms.getCalendarEvents", () =>
    model(db, "maintenanceCalendar").findMany({
      where: {
        ...(from ? { startDate: { gte: new Date(from) } } : {}),
        ...(to   ? { endDate:   { lte: new Date(to)   } } : {}),
        ...own(organizationId),
      },
      orderBy: { startDate: "asc" },
    }),
  );
  return ts(rows) as MaintenanceCalendarEvent[];
}

// ── History ───────────────────────────────────────────────────────────────────

export async function getHistory(taskId?: string, limit = 50): Promise<MaintenanceHistory[]> {
  const { organizationId, db } = await scope("cmms.getHistory");
  const rows = await runScoped("cmms.getHistory", () =>
    model(db, "maintenanceHistory").findMany({
      where: { ...(taskId ? { taskId } : {}), ...viaTask(organizationId) },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  );
  return ts(rows) as MaintenanceHistory[];
}

// ── Technicians ───────────────────────────────────────────────────────────────

export async function getTechnicians(): Promise<MaintenanceTechnician[]> {
  const { organizationId, db } = await scope("cmms.getTechnicians");
  const rows = await runScoped("cmms.getTechnicians", () =>
    model(db, "maintenanceTechnician").findMany({
      where: own(organizationId),
      orderBy: { name: "asc" },
    }),
  );
  return ts(rows) as MaintenanceTechnician[];
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function getTeams(): Promise<MaintenanceTeam[]> {
  const { organizationId, db } = await scope("cmms.getTeams");
  const rows = await runScoped("cmms.getTeams", () =>
    model(db, "maintenanceTeam").findMany({
      where: own(organizationId),
      orderBy: { name: "asc" },
    }),
  );
  return ts(rows) as MaintenanceTeam[];
}

// ── Work Centers ──────────────────────────────────────────────────────────────

export async function getWorkCenters(): Promise<MaintenanceWorkCenter[]> {
  const { organizationId, db } = await scope("cmms.getWorkCenters");
  const rows = await runScoped("cmms.getWorkCenters", () =>
    model(db, "maintenanceWorkCenter").findMany({
      where: { isActive: true, ...own(organizationId) },
      orderBy: { name: "asc" },
    }),
  );
  return ts(rows) as MaintenanceWorkCenter[];
}

// ── Failure Codes ─────────────────────────────────────────────────────────────

/**
 * GLOBAL BY DECISION, not by omission.
 *
 * `FailureCode` is a reference taxonomy: `code @unique`, a closed set of
 * categories and severities that classify a failure rather than describe one.
 * It carries no `organizationId` and no relation to `Organization`, so there is
 * nothing to scope to — and adding one would be a schema change this slice
 * forbids.
 *
 * That is not the same as saying the constant is safe because the table exists.
 * The reasoning is about what the rows ARE: a shared vocabulary, identical for
 * every customer, containing nothing any customer entered. If the product ever
 * lets an organization define its own failure codes, this becomes tenant data
 * and this function becomes wrong; the test that covers it asserts the global
 * read deliberately, so that change will fail loudly rather than leak quietly.
 *
 * It still requires a resolved tenant. A caller with no organization is refused
 * here as everywhere else — reading the taxonomy is a signed-in operation.
 */
export async function getFailureCodes(): Promise<FailureCode[]> {
  await requireTenantScope();
  const db = await requireDatabase("cmms.getFailureCodes");
  const rows = await runScoped("cmms.getFailureCodes", () =>
    model(db, "failureCode").findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
  );
  return ts(rows) as FailureCode[];
}

// ── Comments ──────────────────────────────────────────────────────────────────

export async function getComments(taskId: string): Promise<MaintenanceComment[]> {
  const { organizationId, db } = await scope("cmms.getComments");
  const rows = await runScoped("cmms.getComments", () =>
    model(db, "maintenanceComment").findMany({
      where: { taskId, ...viaTask(organizationId) },
      orderBy: { createdAt: "asc" },
    }),
  );
  return ts(rows) as MaintenanceComment[];
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export async function getApprovals(taskId?: string): Promise<MaintenanceApproval[]> {
  const { organizationId, db } = await scope("cmms.getApprovals");
  const rows = await runScoped("cmms.getApprovals", () =>
    model(db, "maintenanceApproval").findMany({
      where: { ...(taskId ? { taskId } : {}), ...viaTask(organizationId) },
      orderBy: { createdAt: "desc" },
    }),
  );
  return ts(rows) as MaintenanceApproval[];
}

// ── Notifications ─────────────────────────────────────────────────────────────

/**
 * Also reached through the nullable task relation — see `getChecklists`.
 *
 * `userId` narrows further but is NOT the tenant boundary: a user id in a query
 * string is a caller-supplied value, and the organization predicate is what
 * makes the answer safe regardless of what is passed here.
 */
export async function getNotifications(userId?: string): Promise<MaintenanceNotification[]> {
  const { organizationId, db } = await scope("cmms.getNotifications");
  const rows = await runScoped("cmms.getNotifications", () =>
    model(db, "maintenanceNotification").findMany({
      where: { ...(userId ? { userId } : {}), isRead: false, ...viaTask(organizationId) },
      orderBy: { sentAt: "desc" },
    }),
  );
  return ts(rows) as MaintenanceNotification[];
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * Composed from four scoped reads, so the aggregate inherits their scope.
 *
 * An aggregate is the easiest place for a leak to survive review: a wrong total
 * looks like a number, not like another organization's data, because the rows
 * that produced it are never displayed. There is no separate query here to
 * forget — every input is one of the functions above.
 */
export async function getDashboard(): Promise<CmmsDashboard> {
  const [tasks, failures, downtime, plans] = await Promise.all([
    getTasks(),
    getFailures(),
    getDowntime(),
    getPlans(),
  ]);

  void plans; // used for future plan compliance

  const kpis = computeKpis(tasks, failures, downtime);
  const downtimeTrend = computeDowntimeTrend(downtime);

  const tasksByStatus: Record<string, number> = {};
  const tasksByType:   Record<string, number> = {};
  const tasksByPriority: Record<string, number> = {};

  for (const t of tasks) {
    tasksByStatus[t.status]           = (tasksByStatus[t.status]           ?? 0) + 1;
    tasksByType[t.maintenanceType]    = (tasksByType[t.maintenanceType]    ?? 0) + 1;
    tasksByPriority[t.priority]       = (tasksByPriority[t.priority]       ?? 0) + 1;
  }

  const now = Date.now();
  const recentTasks  = [...tasks]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);
  const recentFailures = [...failures]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 5);
  const upcomingTasks = tasks
    .filter(t => {
      const sd = t.scheduledDate ? new Date(t.scheduledDate).getTime() : 0;
      return sd >= now && ["PLANNED","SCHEDULED"].includes(t.status);
    })
    .sort((a, b) => {
      const da = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
      const db2 = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
      return da - db2;
    })
    .slice(0, 5);

  const costTrend: { month: string; amount: number }[] = [];

  return {
    kpis,
    tasksByStatus,
    tasksByType,
    tasksByPriority,
    recentTasks,
    recentFailures,
    upcomingTasks,
    downtimeTrend,
    costTrend,
  };
}
