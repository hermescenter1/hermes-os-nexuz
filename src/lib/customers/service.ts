/**
 * A tenant's customers — the data layer (Executive Management Center slice G).
 *
 * THE RULES EVERY FUNCTION HERE KEEPS
 *   * The organization is `ctx.organizationId`, resolved on the server from the
 *     session's active organization. It is in the WHERE clause of every read and
 *     every write; nothing here accepts an organization from a caller.
 *   * A record of another organization is NOT FOUND — never "forbidden", which
 *     would confirm it exists.
 *   * A pagination cursor must belong to the caller's organization. Prisma
 *     positions a cursor page by the cursor row's sort values, so a foreign id
 *     would tell the caller where another tenant's customer name sorts.
 *   * Every write is a transaction that also writes its audit event through the
 *     SAME client: a change whose audit fails is not committed. Audit metadata
 *     names the fields that changed and the state transitions, never contact
 *     details or free text.
 *   * Edits carry the version they read; a stale one is refused (409), so two
 *     people editing one customer cannot silently overwrite each other.
 *   * Nothing is deleted. A customer is archived; interactions are append-only.
 *
 * The database backs this up: both foreign keys into Party are composite
 * (organizationId, partyId), so a cross-tenant link cannot be stored at all.
 */

import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEventOrThrow } from "@/lib/audit/audit-service";
import { can } from "@/lib/org/rbac";
import type { OrganizationRole } from "@/lib/tenant/contract";
import {
  LIST_DEFAULT,
  type CustomerCreate,
  type CustomerListQuery,
  type CustomerUpdate,
  type InteractionCreate,
  type InteractionListQuery,
  type ProjectLink,
} from "./schemas";

/* ── Contracts ─────────────────────────────────────────────────────────────── */

export interface CustomerCtx {
  readonly organizationId: string;
  readonly userId: string;
  readonly correlationId: string;
}

export type CustomerErrorCode =
  | "NOT_FOUND"
  | "INVALID_CURSOR"
  | "DUPLICATE_NAME"
  | "VERSION_CONFLICT"
  | "ARCHIVED"
  | "OWNER_NOT_ELIGIBLE"
  | "OCCURRED_IN_FUTURE"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_LINKED_ELSEWHERE"
  | "SERVICE_UNAVAILABLE";

const STATUS_OF: Record<CustomerErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_CURSOR: 400,
  DUPLICATE_NAME: 409,
  VERSION_CONFLICT: 409,
  ARCHIVED: 409,
  OWNER_NOT_ELIGIBLE: 422,
  OCCURRED_IN_FUTURE: 422,
  PROJECT_NOT_FOUND: 404,
  PROJECT_LINKED_ELSEWHERE: 409,
  SERVICE_UNAVAILABLE: 503,
};

export class CustomerError extends Error {
  readonly status: number;
  constructor(
    readonly code: CustomerErrorCode,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "CustomerError";
    this.status = STATUS_OF[code];
  }
}

export type FollowUpState = "overdue" | "scheduled" | "none";

export interface CustomerView {
  readonly id: string;
  readonly status: "PROSPECT" | "ACTIVE" | "INACTIVE";
  readonly displayName: string;
  readonly legalName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly notes: string | null;
  readonly followUpOwnerId: string | null;
  readonly followUpOwnerName: string | null;
  readonly nextActionAt: string | null;
  readonly nextActionNote: string | null;
  readonly followUp: FollowUpState;
  readonly lastInteractionAt: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
}

export interface InteractionView {
  readonly id: string;
  readonly kind: "CALL" | "MEETING" | "EMAIL" | "VISIT" | "NOTE";
  readonly occurredAt: string;
  readonly summary: string;
  readonly recordedBy: string | null;
  readonly recordedByName: string | null;
  readonly createdAt: string;
}

export interface LinkedProjectsView {
  readonly projects: ReadonlyArray<{ id: string; name: string; status: string; startDate: string | null; endDate: string | null }>;
  /** Recorded cost of the linked projects, PER CURRENCY — never summed across currencies. */
  readonly recordedCost: ReadonlyArray<{ currency: string; amount: number }>;
  /** True when more projects are linked than are listed. */
  readonly truncated: boolean;
}

/* ── The database surface this module uses ─────────────────────────────────── */

type Row = Record<string, unknown>;
interface Delegate {
  findFirst(args: unknown): Promise<Row | null>;
  findMany(args: unknown): Promise<Row[]>;
  create(args: unknown): Promise<Row>;
  updateMany(args: unknown): Promise<{ count: number }>;
}
interface GroupDelegate {
  groupBy(args: unknown): Promise<Row[]>;
}
export interface CustomerTx {
  party: Delegate;
  partyInteraction: Delegate;
  organizationMember: Pick<Delegate, "findFirst" | "findMany">;
  erpProject: Pick<Delegate, "findFirst" | "findMany" | "updateMany">;
}
export interface CustomerDb extends CustomerTx {
  user: Pick<Delegate, "findMany">;
  erpProjectCost: GroupDelegate;
  $transaction<T>(fn: (tx: CustomerTx) => Promise<T>): Promise<T>;
}

async function defaultDb(): Promise<CustomerDb> {
  const client = (await getPrisma()) as unknown as CustomerDb | null;
  if (!client?.party) throw new CustomerError("SERVICE_UNAVAILABLE");
  return client;
}

/** Turns anything that is not a CustomerError into a 503 that leaks nothing. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof CustomerError) throw err;
    throw new CustomerError("SERVICE_UNAVAILABLE");
  }
}

/* ── Mapping ───────────────────────────────────────────────────────────────── */

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : new Date(String(v)).toISOString());
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function followUpOf(nextActionAt: unknown, nowMs: number): FollowUpState {
  const at = iso(nextActionAt);
  if (at === null) return "none";
  return Date.parse(at) < nowMs ? "overdue" : "scheduled";
}

function toView(row: Row, names: ReadonlyMap<string, string>, nowMs: number): CustomerView {
  const owner = str(row.followUpOwnerId);
  return {
    id: String(row.id),
    status: row.status as CustomerView["status"],
    displayName: String(row.displayName),
    legalName: str(row.legalName),
    email: str(row.email),
    phone: str(row.phone),
    city: str(row.city),
    country: str(row.country),
    notes: str(row.notes),
    followUpOwnerId: owner,
    followUpOwnerName: owner ? names.get(owner) ?? null : null,
    nextActionAt: iso(row.nextActionAt),
    nextActionNote: str(row.nextActionNote),
    followUp: followUpOf(row.nextActionAt, nowMs),
    lastInteractionAt: iso(row.lastInteractionAt),
    version: Number(row.version),
    createdAt: iso(row.createdAt) ?? "",
    updatedAt: iso(row.updatedAt) ?? "",
    archivedAt: iso(row.archivedAt),
  };
}

/** One bounded lookup for the display names of the users a page mentions. */
async function namesOf(db: CustomerDb, ids: ReadonlyArray<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => typeof v === "string" && v !== ""))];
  if (unique.length === 0) return new Map();
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true }, take: unique.length });
  return new Map(users.map(u => [String(u.id), typeof u.name === "string" && u.name ? u.name : String(u.id)]));
}

/* ── Reads ─────────────────────────────────────────────────────────────────── */

const scoped = (ctx: CustomerCtx) => ({ organizationId: ctx.organizationId, kind: "CUSTOMER" as const });

export async function listCustomers(
  ctx: CustomerCtx,
  query: CustomerListQuery,
  opts: { nowMs?: number; db?: CustomerDb } = {},
): Promise<Page<CustomerView>> {
  const nowMs = opts.nowMs ?? Date.now();
  return guarded(async () => {
    const db = opts.db ?? (await defaultDb());
    const limit = query.limit ?? LIST_DEFAULT;

    if (query.cursor) {
      const own = await db.party.findFirst({ where: { ...scoped(ctx), id: query.cursor }, select: { id: true } });
      if (!own) throw new CustomerError("INVALID_CURSOR");
    }

    const now = new Date(nowMs);
    const where: Record<string, unknown> = {
      ...scoped(ctx),
      archivedAt: query.archived === "only" ? { not: null } : null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.owner ? { followUpOwnerId: query.owner === "me" ? ctx.userId : query.owner } : {}),
      ...(query.followUp === "overdue"
        ? { nextActionAt: { lt: now } }
        : query.followUp === "scheduled"
          ? { nextActionAt: { gte: now } }
          : query.followUp === "none"
            ? { nextActionAt: null }
            : {}),
      ...(query.q
        ? {
            OR: [
              { displayName: { contains: query.q, mode: "insensitive" } },
              { legalName: { contains: query.q, mode: "insensitive" } },
              { email: { contains: query.q, mode: "insensitive" } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };

    const rows = await db.party.findMany({
      where,
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const names = await namesOf(db, page.map(r => str(r.followUpOwnerId)));
    return {
      items: page.map(r => toView(r, names, nowMs)),
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? String(page[page.length - 1].id) : null,
    };
  });
}

async function findOwn(db: CustomerTx, ctx: CustomerCtx, id: string): Promise<Row> {
  const row = await db.party.findFirst({ where: { ...scoped(ctx), id } });
  if (!row) throw new CustomerError("NOT_FOUND");
  return row;
}

export async function getCustomer(
  ctx: CustomerCtx,
  id: string,
  opts: { nowMs?: number; db?: CustomerDb } = {},
): Promise<CustomerView> {
  const nowMs = opts.nowMs ?? Date.now();
  return guarded(async () => {
    const db = opts.db ?? (await defaultDb());
    const row = await findOwn(db, ctx, id);
    return toView(row, await namesOf(db, [str(row.followUpOwnerId)]), nowMs);
  });
}

/* ── Writes ────────────────────────────────────────────────────────────────── */

/** The follow-up owner must be an ACTIVE member of THIS organization who may see customers. */
async function assertEligibleOwner(tx: CustomerTx, ctx: CustomerCtx, userId: string): Promise<void> {
  const member = await tx.organizationMember.findFirst({
    where: { organizationId: ctx.organizationId, userId, status: "ACTIVE" },
    select: { role: true },
  });
  if (!member || !can(String(member.role) as OrganizationRole, "view_customers")) {
    throw new CustomerError("OWNER_NOT_ELIGIBLE");
  }
}

async function assertUniqueName(tx: CustomerTx, ctx: CustomerCtx, displayName: string, exceptId?: string): Promise<void> {
  const clash = await tx.party.findFirst({
    where: {
      ...scoped(ctx),
      archivedAt: null,
      displayName: { equals: displayName, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new CustomerError("DUPLICATE_NAME", { existingId: String(clash.id) });
}

const EDITABLE = [
  "displayName",
  "legalName",
  "status",
  "email",
  "phone",
  "city",
  "country",
  "notes",
  "followUpOwnerId",
  "nextActionAt",
  "nextActionNote",
] as const;
type Editable = (typeof EDITABLE)[number];

function dataOf(input: Partial<Record<Editable, unknown>>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (input[key] === undefined) continue;
    data[key] = key === "nextActionAt" && input[key] !== null ? new Date(String(input[key])) : input[key];
  }
  return data;
}

export async function createCustomer(
  ctx: CustomerCtx,
  input: CustomerCreate,
  opts: { nowMs?: number; db?: CustomerDb } = {},
): Promise<CustomerView> {
  const nowMs = opts.nowMs ?? Date.now();
  return guarded(async () => {
    const db = opts.db ?? (await defaultDb());
    const row = await db.$transaction(async tx => {
      if (input.followUpOwnerId) await assertEligibleOwner(tx, ctx, input.followUpOwnerId);
      await assertUniqueName(tx, ctx, input.displayName);
      const created = await tx.party.create({
        data: {
          ...dataOf(input),
          organizationId: ctx.organizationId,
          kind: "CUSTOMER",
          status: input.status ?? "ACTIVE",
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });
      await recordAuditEventOrThrow(
        {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: "customer.create",
          entityType: "Party",
          entityId: String(created.id),
          outcome: "SUCCESS",
          correlationId: ctx.correlationId,
          metadata: {
            status: created.status,
            fields: EDITABLE.filter(k => input[k] !== undefined && input[k] !== null),
            followUpOwnerId: input.followUpOwnerId ?? null,
          },
        },
        tx,
      );
      return created;
    });
    return toView(row, await namesOf(db, [str(row.followUpOwnerId)]), nowMs);
  });
}

export async function updateCustomer(
  ctx: CustomerCtx,
  id: string,
  input: CustomerUpdate,
  opts: { nowMs?: number; db?: CustomerDb } = {},
): Promise<CustomerView> {
  const nowMs = opts.nowMs ?? Date.now();
  return guarded(async () => {
    const db = opts.db ?? (await defaultDb());
    await db.$transaction(async tx => {
      const current = await findOwn(tx, ctx, id);
      const currentVersion = Number(current.version);
      if (currentVersion !== input.expectedVersion) {
        throw new CustomerError("VERSION_CONFLICT", { currentVersion });
      }
      const wasArchived = current.archivedAt != null;
      const changes = dataOf(input);
      // An archived customer is read-only until restored; restoring is the only edit allowed.
      if (wasArchived && input.archived !== false) throw new CustomerError("ARCHIVED");

      if (input.followUpOwnerId && input.followUpOwnerId !== current.followUpOwnerId) {
        await assertEligibleOwner(tx, ctx, input.followUpOwnerId);
      }
      const nextName = typeof input.displayName === "string" ? input.displayName : String(current.displayName);
      if (typeof input.displayName === "string" || input.archived === false) {
        await assertUniqueName(tx, ctx, nextName, id);
      }
      // A note may only stand with a date — checked against the row as it will be.
      // Clearing the next action's date (the action is done) clears its note too.
      const nextActionAt = "nextActionAt" in changes ? changes.nextActionAt : current.nextActionAt;
      const nextActionNote = "nextActionNote" in changes ? changes.nextActionNote : current.nextActionNote;
      if (nextActionNote && !nextActionAt) changes.nextActionNote = null;

      if (input.archived === true) changes.archivedAt = new Date(nowMs);
      if (input.archived === false) changes.archivedAt = null;

      // Computed from the row as READ, before the write.
      const same = (a: unknown, b: unknown) =>
        a instanceof Date || b instanceof Date ? iso(a) === iso(b) : (a ?? null) === (b ?? null);
      const changed = EDITABLE.filter(k => k in changes && !same(changes[k], current[k]));
      const res = await tx.party.updateMany({
        where: { ...scoped(ctx), id, version: input.expectedVersion },
        data: { ...changes, version: input.expectedVersion + 1, updatedBy: ctx.userId },
      });
      if (res.count !== 1) throw new CustomerError("VERSION_CONFLICT", { currentVersion });

      await recordAuditEventOrThrow(
        {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: input.archived === true ? "customer.archive" : input.archived === false ? "customer.restore" : "customer.update",
          entityType: "Party",
          entityId: id,
          outcome: "SUCCESS",
          correlationId: ctx.correlationId,
          metadata: {
            changed,
            version: input.expectedVersion + 1,
            ...(changed.includes("status") ? { status: { from: current.status, to: changes.status } } : {}),
            ...(changed.includes("followUpOwnerId")
              ? { followUpOwnerId: { from: current.followUpOwnerId ?? null, to: changes.followUpOwnerId ?? null } }
              : {}),
          },
        },
        tx,
      );
    });
    return getCustomer(ctx, id, { nowMs, db });
  });
}

/* ── Interactions ──────────────────────────────────────────────────────────── */

/** A contact cannot be recorded as happening later than a small clock-skew allowance. */
export const FUTURE_SKEW_MS = 5 * 60_000;

export async function listInteractions(
  ctx: CustomerCtx,
  partyId: string,
  query: InteractionListQuery,
  opts: { db?: CustomerDb } = {},
): Promise<Page<InteractionView>> {
  return guarded(async () => {
    const db = opts.db ?? (await defaultDb());
    await findOwn(db, ctx, partyId);
    const limit = query.limit ?? LIST_DEFAULT;
    const where = { organizationId: ctx.organizationId, partyId };
    if (query.cursor) {
      const own = await db.partyInteraction.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } });
      if (!own) throw new CustomerError("INVALID_CURSOR");
    }
    const rows = await db.partyInteraction.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const names = await namesOf(db, page.map(r => str(r.recordedBy)));
    return {
      items: page.map(r => ({
        id: String(r.id),
        kind: r.kind as InteractionView["kind"],
        occurredAt: iso(r.occurredAt) ?? "",
        summary: String(r.summary),
        recordedBy: str(r.recordedBy),
        recordedByName: str(r.recordedBy) ? names.get(String(r.recordedBy)) ?? null : null,
        createdAt: iso(r.createdAt) ?? "",
      })),
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? String(page[page.length - 1].id) : null,
    };
  });
}

export async function addInteraction(
  ctx: CustomerCtx,
  partyId: string,
  input: InteractionCreate,
  opts: { nowMs?: number; db?: CustomerDb } = {},
): Promise<{ id: string; lastInteractionAt: string }> {
  const nowMs = opts.nowMs ?? Date.now();
  const occurredAt = new Date(input.occurredAt);
  if (occurredAt.getTime() > nowMs + FUTURE_SKEW_MS) throw new CustomerError("OCCURRED_IN_FUTURE");
  return guarded(async () => {
    const db = opts.db ?? (await defaultDb());
    return db.$transaction(async tx => {
      const party = await findOwn(tx, ctx, partyId);
      if (party.archivedAt != null) throw new CustomerError("ARCHIVED");
      const created = await tx.partyInteraction.create({
        data: {
          organizationId: ctx.organizationId,
          partyId,
          kind: input.kind,
          occurredAt,
          summary: input.summary,
          recordedBy: ctx.userId,
        },
      });
      // Only ever moves FORWARD: recording an older contact does not hide a newer one.
      await tx.party.updateMany({
        where: {
          ...scoped(ctx),
          id: partyId,
          OR: [{ lastInteractionAt: null }, { lastInteractionAt: { lt: occurredAt } }],
        },
        data: { lastInteractionAt: occurredAt },
      });
      await recordAuditEventOrThrow(
        {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: "customer.interaction.create",
          entityType: "PartyInteraction",
          entityId: String(created.id),
          outcome: "SUCCESS",
          correlationId: ctx.correlationId,
          metadata: { partyId, kind: input.kind, occurredAt: occurredAt.toISOString() },
        },
        tx,
      );
      const last = iso(party.lastInteractionAt);
      const newest = last && Date.parse(last) > occurredAt.getTime() ? last : occurredAt.toISOString();
      return { id: String(created.id), lastInteractionAt: newest };
    });
  });
}

/* ── Projects ──────────────────────────────────────────────────────────────── */

export const LINKED_PROJECTS_MAX = 50;

/** The organization's projects linked to this customer. Callers must hold view_erp. */
export async function linkedProjects(
  ctx: CustomerCtx,
  partyId: string,
  opts: { db?: CustomerDb } = {},
): Promise<LinkedProjectsView> {
  return guarded(async () => {
    const db = opts.db ?? (await defaultDb());
    await findOwn(db, ctx, partyId);
    const rows = await db.erpProject.findMany({
      where: { organizationId: ctx.organizationId, partyId, deletedAt: null },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: LINKED_PROJECTS_MAX + 1,
    });
    const listed = rows.slice(0, LINKED_PROJECTS_MAX);
    const ids = listed.map(r => String(r.id));
    const sums =
      ids.length === 0
        ? []
        : await db.erpProjectCost.groupBy({
            by: ["currency"],
            where: { organizationId: ctx.organizationId, projectId: { in: ids } },
            _sum: { amount: true },
            orderBy: { currency: "asc" },
          });
    return {
      projects: listed.map(r => ({
        id: String(r.id),
        name: String(r.name),
        status: String(r.status),
        startDate: iso(r.startDate),
        endDate: iso(r.endDate),
      })),
      recordedCost: sums.map(s => ({
        currency: String(s.currency),
        amount: Number((s._sum as { amount?: number | null } | undefined)?.amount ?? 0),
      })),
      truncated: rows.length > LINKED_PROJECTS_MAX,
    };
  });
}

/** Link or unlink one project. Callers must hold manage_customers AND manage_erp. */
export async function setProjectLink(
  ctx: CustomerCtx,
  partyId: string,
  input: ProjectLink,
  opts: { db?: CustomerDb } = {},
): Promise<{ projectId: string; partyId: string | null }> {
  return guarded(async () => {
    const db = opts.db ?? (await defaultDb());
    return db.$transaction(async tx => {
      const party = await findOwn(tx, ctx, partyId);
      if (input.linked && party.archivedAt != null) throw new CustomerError("ARCHIVED");
      const project = await tx.erpProject.findFirst({
        where: { id: input.projectId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, partyId: true },
      });
      if (!project) throw new CustomerError("PROJECT_NOT_FOUND");
      const linkedTo = str(project.partyId);
      if (input.linked && linkedTo && linkedTo !== partyId) throw new CustomerError("PROJECT_LINKED_ELSEWHERE");
      if (!input.linked && linkedTo !== partyId) {
        // Unlinking a project that is not linked to THIS customer changes nothing.
        return { projectId: input.projectId, partyId: linkedTo };
      }
      const next = input.linked ? partyId : null;
      await tx.erpProject.updateMany({
        where: { id: input.projectId, organizationId: ctx.organizationId },
        data: { partyId: next },
      });
      await recordAuditEventOrThrow(
        {
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          action: input.linked ? "customer.project.link" : "customer.project.unlink",
          entityType: "ErpProject",
          entityId: input.projectId,
          outcome: "SUCCESS",
          correlationId: ctx.correlationId,
          metadata: { partyId },
        },
        tx,
      );
      return { projectId: input.projectId, partyId: next };
    });
  });
}

/* ── Choices for the forms ─────────────────────────────────────────────────── */

export const OWNER_CHOICES_MAX = 100;

/**
 * The members who may be made follow-up owner: ACTIVE in this organization,
 * in a role that may see customers. The same rule `assertEligibleOwner`
 * enforces on write — this list only saves the user a refusal.
 */
export async function eligibleOwners(
  ctx: CustomerCtx,
  opts: { db?: CustomerDb } = {},
): Promise<Array<{ userId: string; name: string }>> {
  return guarded(async () => {
    const db = opts.db ?? (await defaultDb());
    const rows = await db.organizationMember.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MANAGER"] } },
      select: { userId: true, role: true },
      orderBy: { userId: "asc" },
      take: OWNER_CHOICES_MAX,
    });
    // Re-checked against the grant table, so this list cannot drift from the write rule.
    const ids = rows.filter(r => can(String(r.role) as OrganizationRole, "view_customers")).map(r => String(r.userId));
    const names = await namesOf(db, ids);
    return ids.map(id => ({ userId: id, name: names.get(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name));
  });
}

export const LINKABLE_PROJECTS_MAX = 100;

/** Projects of this organization that are free, or already linked to this customer. */
export async function linkableProjects(
  ctx: CustomerCtx,
  partyId: string,
  opts: { db?: CustomerDb } = {},
): Promise<Array<{ id: string; name: string; linked: boolean }>> {
  return guarded(async () => {
    const db = opts.db ?? (await defaultDb());
    await findOwn(db, ctx, partyId);
    const rows = await db.erpProject.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null, OR: [{ partyId: null }, { partyId }] },
      select: { id: true, name: true, partyId: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: LINKABLE_PROJECTS_MAX,
    });
    return rows.map(r => ({ id: String(r.id), name: String(r.name), linked: str(r.partyId) === partyId }));
  });
}
