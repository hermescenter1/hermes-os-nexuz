/**
 * ERP tenant data access (HRIS-0.5).
 *
 * Scope of this module: teams, team members, resources, and module status.
 * Every query carries `organizationId` from a resolved ErpScope. A row whose
 * organizationId is NULL matches no query here, so legacy unassigned rows are
 * invisible (fail closed).
 *
 * Removed in this change: every MOCK_* fallback and the fake-success 202
 * response. When the database is unavailable the functions throw ErpError 503.
 * The operational modules (projects, tasks, inventory, work orders, approvals,
 * KPIs, overview) live in operations.ts and follow the same scope rules.
 */

import { getPrisma } from "@/lib/db/prisma";
import { runIdempotentWrite, type IdempotencyDelegate, type IdempotentSuccess } from "@/lib/idempotency/transactional";
import { ErpError, type ErpScope } from "./tenant";
import { CHILD_DETAIL_PAGE, cursorArgs, pageOf, type ChildListQuery, type ChildPage } from "./pagination";
import type { ErpResource, ErpTeam, ErpTeamFull, ErpTeamMember } from "./types";
import type { MemberCandidateQuery } from "./ops-schemas";
import type {
  ListQuery,
  ResourceCreateInput,
  ResourceUpdateInput,
  TeamCreateInput,
  TeamMemberAddInput,
  TeamUpdateInput,
} from "./schemas";

export interface ErpCtx {
  scope: ErpScope;
  /** Request correlation id, copied into the audit row. */
  correlationId: string;
  /** Raw Idempotency-Key header value for creates. Never stored. */
  idempotencyKey?: string | null;
}

type Row = Record<string, unknown> & { id: string };

interface Delegate {
  findMany(args: unknown): Promise<Row[]>;
  findFirst(args: unknown): Promise<Row | null>;
  create(args: unknown): Promise<Row>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
  count(args: unknown): Promise<number>;
}

interface ErpTx {
  erpTeam: Delegate;
  erpTeamMember: Delegate;
  erpResource: Delegate;
  organizationMember: Delegate;
  auditLog: { create(args: unknown): Promise<unknown> };
  idempotencyKey: IdempotencyDelegate;
}

type ErpClient = ErpTx & {
  $transaction<R>(fn: (tx: ErpTx) => Promise<R>): Promise<R>;
};

async function client(): Promise<ErpClient> {
  const prisma = await getPrisma();
  if (!prisma) throw new ErpError(503, "SERVICE_UNAVAILABLE");
  return prisma as unknown as ErpClient;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

function toTeam(row: Row): ErpTeam {
  return {
    id: row.id,
    organizationId: (row.organizationId as string | null) ?? null,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    leadId: (row.leadId as string | null) ?? null,
    capacity: row.capacity as number,
    version: row.version as number,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/** Reads the member's name and email with the member row, in the same query (no per-row lookup). */
const MEMBER_INCLUDE = { member: { select: { user: { select: { name: true, email: true } } } } } as const;

function toMember(row: Row): ErpTeamMember {
  const user = (row.member as { user?: { name?: unknown; email?: unknown } | null } | null | undefined)?.user;
  return {
    id: row.id,
    teamId: row.teamId as string,
    userId: row.userId as string,
    role: row.role as string,
    availability: row.availability as number,
    joinedAt: iso(row.joinedAt),
    name: typeof user?.name === "string" ? user.name : null,
    email: typeof user?.email === "string" ? user.email : null,
  };
}

/** A resource as seen by this caller. For non-owners `costRate` is null and `financialsVisible` is false. */
export interface ErpResourceView extends ErpResource {
  financialsVisible: boolean;
}

/** `costRate` is returned only to holders of view_erp_compensation. */
function toResource(row: Row, canViewCompensation: boolean): ErpResourceView {
  return {
    id: row.id,
    organizationId: (row.organizationId as string | null) ?? null,
    name: row.name as string,
    type: row.type as ErpResource["type"],
    description: (row.description as string | null) ?? null,
    costRate: canViewCompensation ? ((row.costRate as number | null) ?? null) : null,
    currency: row.currency as string,
    isAvailable: row.isAvailable as boolean,
    projectId: (row.projectId as string | null) ?? null,
    workOrderId: (row.workOrderId as string | null) ?? null,
    version: row.version as number,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    financialsVisible: canViewCompensation,
  };
}

/**
 * Audit row written inside the same transaction as the mutation. `before` and
 * `after` carry only non-sensitive fields. A sensitive field (costRate) is
 * reported by name, never by value.
 */
async function audit(
  tx: ErpTx,
  ctx: ErpCtx,
  args: { action: string; entityType: string; entityId: string; changedFields: string[]; before?: object; after?: object },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: ctx.scope.userId,
      organizationId: ctx.scope.organizationId,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      outcome: "SUCCESS",
      correlationId: ctx.correlationId,
      metadata: {
        changedFields: args.changedFields,
        before: args.before ?? null,
        after: args.after ?? null,
      },
    },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

function assertCompensationAccess(ctx: ErpCtx, touched: boolean): void {
  if (touched && !ctx.scope.canViewCompensation) throw new ErpError(403, "FORBIDDEN");
}

function idempotencyFailure(reason: "KEY_INVALID" | "KEY_REUSED"): never {
  if (reason === "KEY_INVALID") throw new ErpError(400, "IDEMPOTENCY_KEY_INVALID");
  throw new ErpError(409, "IDEMPOTENCY_KEY_REUSED");
}

async function requireKey(ctx: ErpCtx): Promise<string> {
  if (!ctx.idempotencyKey) throw new ErpError(400, "IDEMPOTENCY_KEY_INVALID");
  return ctx.idempotencyKey;
}

// ── Module status (no internals) ─────────────────────────────────────────────

/** Whether the tenant-scoped ERP modules can reach the database. */
export async function getErpDatabaseStatus(): Promise<"available" | "unavailable"> {
  try {
    const prisma = (await getPrisma()) as unknown as { $queryRawUnsafe?: (q: string) => Promise<unknown> } | null;
    if (!prisma?.$queryRawUnsafe) return "unavailable";
    await prisma.$queryRawUnsafe("SELECT 1");
    return "available";
  } catch {
    return "unavailable";
  }
}

// ── Teams ────────────────────────────────────────────────────────────────────

export async function listTeams(ctx: ErpCtx, q: Pick<ListQuery, "limit" | "cursor">): Promise<ChildPage<ErpTeam>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  if (q.cursor) {
    const anchor = await c.erpTeam.findFirst({ where: { id: q.cursor, organizationId } });
    if (!anchor) throw new ErpError(400, "INVALID_REQUEST");
  }
  const rows = await c.erpTeam.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...cursorArgs(q.cursor),
  });
  return pageOf(rows, q.limit, toTeam);
}

/** A team with its first page of members. `memberCount` is a database count over every member. */
export interface ErpTeamDetailView extends Omit<ErpTeamFull, "members"> {
  members: ChildPage<ErpTeamMember>;
  memberCount: number;
}

export async function getTeam(ctx: ErpCtx, id: string): Promise<ErpTeamDetailView> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const row = await c.erpTeam.findFirst({ where: { id, organizationId } });
  if (!row) throw new ErpError(404, "NOT_FOUND");
  const [members, memberCount] = await Promise.all([
    c.erpTeamMember.findMany({
      where: { teamId: id, organizationId },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      take: CHILD_DETAIL_PAGE + 1,
      include: MEMBER_INCLUDE,
    }),
    c.erpTeamMember.count({ where: { teamId: id, organizationId } }),
  ]);
  return { ...toTeam(row), members: pageOf(members, CHILD_DETAIL_PAGE, toMember), memberCount };
}

/** Next page of a team's members. The team must belong to the caller's organization. */
export async function listTeamMembers(ctx: ErpCtx, teamId: string, q: ChildListQuery): Promise<ChildPage<ErpTeamMember>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const team = await c.erpTeam.findFirst({ where: { id: teamId, organizationId } });
  if (!team) throw new ErpError(404, "NOT_FOUND");
  if (q.cursor) {
    const anchor = await c.erpTeamMember.findFirst({ where: { id: q.cursor, teamId, organizationId } });
    if (!anchor) throw new ErpError(400, "INVALID_REQUEST");
  }
  const rows = await c.erpTeamMember.findMany({
    where: { teamId, organizationId },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: MEMBER_INCLUDE,
  });
  return pageOf(rows, q.limit, toMember);
}

export interface MemberCandidate {
  userId: string;
  name: string | null;
  email: string | null;
}

/**
 * Active members of the caller's organization who are not yet in this team: the
 * add-member picker. Searchable by name or email. The team must belong to the caller's
 * organization. A cursor must name a row of this same filtered list.
 */
export async function listMemberCandidates(ctx: ErpCtx, teamId: string, q: MemberCandidateQuery): Promise<ChildPage<MemberCandidate>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const team = await c.erpTeam.findFirst({ where: { id: teamId, organizationId } });
  if (!team) throw new ErpError(404, "NOT_FOUND");
  const term = q.q && q.q.length > 0 ? q.q : null;
  const where = {
    organizationId,
    status: "ACTIVE" as const,
    erpTeamMembers: { none: { teamId } },
    ...(term
      ? {
          user: {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { email: { contains: term, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };
  if (q.cursor) {
    const anchor = await c.organizationMember.findFirst({ where: { ...where, id: q.cursor }, select: { id: true } });
    if (!anchor) throw new ErpError(400, "INVALID_REQUEST");
  }
  const rows = await c.organizationMember.findMany({
    where,
    select: { id: true, userId: true, user: { select: { name: true, email: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...cursorArgs(q.cursor),
  });
  return pageOf(rows, q.limit, row => {
    const user = row.user as { name?: unknown; email?: unknown } | null | undefined;
    return {
      userId: row.userId as string,
      name: typeof user?.name === "string" ? user.name : null,
      email: typeof user?.email === "string" ? user.email : null,
    };
  });
}

export async function createTeam(ctx: ErpCtx, input: TeamCreateInput): Promise<IdempotentSuccess<ErpTeam>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const outcome = await runIdempotentWrite<ErpTeam, ErpTx>({
    store: c,
    organizationId,
    actorUserId: ctx.scope.userId,
    operation: "erp.team.create",
    rawKey: await requireKey(ctx),
    payload: input,
    write: async tx => {
      const row = await tx.erpTeam.create({
        data: { organizationId, name: input.name, description: input.description ?? null, capacity: input.capacity ?? 0 },
      });
      await audit(tx, ctx, { action: "erp.team.create", entityType: "ErpTeam", entityId: row.id, changedFields: ["name", "description", "capacity"], after: { name: input.name } });
      return { resultType: "ErpTeam", resultId: row.id, value: toTeam(row) };
    },
    replay: async (_type, id) => {
      const row = await c.erpTeam.findFirst({ where: { id, organizationId } });
      return row ? toTeam(row) : null;
    },
  });
  if (outcome.kind === "refused") idempotencyFailure(outcome.reason);
  return outcome;
}

export async function updateTeam(ctx: ErpCtx, id: string, input: TeamUpdateInput): Promise<ErpTeam> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.description !== undefined) changes.description = input.description;
  if (input.capacity !== undefined) changes.capacity = input.capacity;
  const changedFields = Object.keys(changes);

  return c.$transaction(async tx => {
    const before = await tx.erpTeam.findFirst({ where: { id, organizationId } });
    if (!before) throw new ErpError(404, "NOT_FOUND");
    if (before.version !== input.version) throw new ErpError(409, "VERSION_CONFLICT");

    const res = await tx.erpTeam.updateMany({
      where: { id, organizationId, version: input.version },
      data: { ...changes, version: { increment: 1 } },
    });
    if (res.count === 0) throw new ErpError(409, "VERSION_CONFLICT");

    const after = await tx.erpTeam.findFirst({ where: { id, organizationId } });
    if (!after) throw new ErpError(404, "NOT_FOUND");
    await audit(tx, ctx, {
      action: "erp.team.update",
      entityType: "ErpTeam",
      entityId: id,
      changedFields,
      before: { name: before.name, description: before.description, capacity: before.capacity },
      after: { name: after.name, description: after.description, capacity: after.capacity },
    });
    return toTeam(after);
  });
}

export async function addTeamMember(ctx: ErpCtx, teamId: string, input: TeamMemberAddInput): Promise<IdempotentSuccess<ErpTeamMember>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  let outcome;
  try {
    outcome = await runIdempotentWrite<ErpTeamMember, ErpTx>({
      store: c,
      organizationId,
      actorUserId: ctx.scope.userId,
      operation: "erp.team.member.add",
      rawKey: await requireKey(ctx),
      payload: { teamId, ...input },
      write: async tx => {
        const team = await tx.erpTeam.findFirst({ where: { id: teamId, organizationId } });
        if (!team) throw new ErpError(404, "NOT_FOUND");
        // Only an ACTIVE member of THIS organization can join a team.
        const membership = await tx.organizationMember.findFirst({
          where: { organizationId, userId: input.userId, status: "ACTIVE" },
        });
        if (!membership) throw new ErpError(422, "MEMBER_NOT_IN_ORGANIZATION");
        const exists = await tx.erpTeamMember.findFirst({ where: { organizationId, teamId, userId: input.userId } });
        if (exists) throw new ErpError(409, "ALREADY_MEMBER");

        const row = await tx.erpTeamMember.create({
          data: { organizationId, teamId, userId: input.userId, role: input.role, availability: input.availability },
        });
        await audit(tx, ctx, {
          action: "erp.team.member.add",
          entityType: "ErpTeamMember",
          entityId: row.id,
          changedFields: ["userId", "role", "availability"],
          after: { teamId, role: input.role, availability: input.availability },
        });
        return { resultType: "ErpTeamMember", resultId: row.id, value: toMember(row) };
      },
      replay: async (_type, id) => {
        const row = await c.erpTeamMember.findFirst({ where: { id, organizationId } });
        return row ? toMember(row) : null;
      },
    });
  } catch (err) {
    // Two requests racing to add the same member: the loser's transaction rolls
    // back on the (teamId, userId) unique constraint. That is a conflict, not an outage.
    if (isUniqueViolation(err)) throw new ErpError(409, "ALREADY_MEMBER");
    throw err;
  }
  if (outcome.kind === "refused") idempotencyFailure(outcome.reason);
  return outcome;
}

/**
 * Removes a member. DELETE carries no Idempotency-Key: the parent team must belong
 * to the caller's organization (404 otherwise, whatever the member row says), and
 * a member that is already gone answers `removed: false`, so a retry is a 204 too.
 * Only the first effective removal writes an audit row.
 */
export async function removeTeamMember(ctx: ErpCtx, teamId: string, userId: string): Promise<{ removed: boolean }> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  return c.$transaction(async tx => {
    const team = await tx.erpTeam.findFirst({ where: { id: teamId, organizationId } });
    if (!team) throw new ErpError(404, "NOT_FOUND");
    const res = await tx.erpTeamMember.deleteMany({ where: { teamId, userId, organizationId } });
    if (res.count === 0) return { removed: false };
    await audit(tx, ctx, {
      action: "erp.team.member.remove",
      entityType: "ErpTeamMember",
      entityId: teamId,
      changedFields: ["userId"],
      before: { teamId },
    });
    return { removed: true };
  });
}

// ── Resources ────────────────────────────────────────────────────────────────

export async function listResources(ctx: ErpCtx, q: ListQuery): Promise<ChildPage<ErpResourceView>> {
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  if (q.cursor) {
    const anchor = await c.erpResource.findFirst({ where: { id: q.cursor, organizationId } });
    if (!anchor) throw new ErpError(400, "INVALID_REQUEST");
  }
  const rows = await c.erpResource.findMany({
    where: { organizationId, ...(q.type ? { type: q.type } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...cursorArgs(q.cursor),
  });
  return pageOf(rows, q.limit, r => toResource(r, ctx.scope.canViewCompensation));
}

export async function getResource(ctx: ErpCtx, id: string): Promise<ErpResourceView> {
  const c = await client();
  const row = await c.erpResource.findFirst({ where: { id, organizationId: ctx.scope.organizationId } });
  if (!row) throw new ErpError(404, "NOT_FOUND");
  return toResource(row, ctx.scope.canViewCompensation);
}

export async function createResource(ctx: ErpCtx, input: ResourceCreateInput): Promise<IdempotentSuccess<ErpResourceView>> {
  assertCompensationAccess(ctx, input.costRate !== undefined);
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const outcome = await runIdempotentWrite<ErpResourceView, ErpTx>({
    store: c,
    organizationId,
    actorUserId: ctx.scope.userId,
    operation: "erp.resource.create",
    rawKey: await requireKey(ctx),
    payload: input,
    write: async tx => {
      const row = await tx.erpResource.create({
        data: {
          organizationId,
          name: input.name,
          type: input.type,
          description: input.description ?? null,
          costRate: input.costRate ?? null,
        },
      });
      await audit(tx, ctx, {
        action: "erp.resource.create",
        entityType: "ErpResource",
        entityId: row.id,
        // Field names only for sensitive data: never the costRate value.
        changedFields: ["name", "type", "description", ...(input.costRate !== undefined ? ["costRate"] : [])],
        after: { type: input.type },
      });
      return { resultType: "ErpResource", resultId: row.id, value: toResource(row, ctx.scope.canViewCompensation) };
    },
    replay: async (_type, id) => {
      const row = await c.erpResource.findFirst({ where: { id, organizationId } });
      return row ? toResource(row, ctx.scope.canViewCompensation) : null;
    },
  });
  if (outcome.kind === "refused") idempotencyFailure(outcome.reason);
  return outcome;
}

export async function updateResource(ctx: ErpCtx, id: string, input: ResourceUpdateInput): Promise<ErpResourceView> {
  assertCompensationAccess(ctx, input.costRate !== undefined);
  const c = await client();
  const organizationId = ctx.scope.organizationId;
  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.type !== undefined) changes.type = input.type;
  if (input.description !== undefined) changes.description = input.description;
  if (input.costRate !== undefined) changes.costRate = input.costRate;
  if (input.isAvailable !== undefined) changes.isAvailable = input.isAvailable;
  const changedFields = Object.keys(changes);

  return c.$transaction(async tx => {
    const before = await tx.erpResource.findFirst({ where: { id, organizationId } });
    if (!before) throw new ErpError(404, "NOT_FOUND");
    if (before.version !== input.version) throw new ErpError(409, "VERSION_CONFLICT");

    const res = await tx.erpResource.updateMany({
      where: { id, organizationId, version: input.version },
      data: { ...changes, version: { increment: 1 } },
    });
    if (res.count === 0) throw new ErpError(409, "VERSION_CONFLICT");

    const after = await tx.erpResource.findFirst({ where: { id, organizationId } });
    if (!after) throw new ErpError(404, "NOT_FOUND");
    await audit(tx, ctx, {
      action: "erp.resource.update",
      entityType: "ErpResource",
      entityId: id,
      changedFields,
      before: { type: before.type, isAvailable: before.isAvailable },
      after: { type: after.type, isAvailable: after.isAvailable },
    });
    return toResource(after, ctx.scope.canViewCompensation);
  });
}
