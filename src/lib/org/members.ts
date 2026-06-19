/**
 * Organization member management service (Phase 32).
 *
 * Critical invariant enforced here:
 *   The last remaining OWNER of an organization can never be removed,
 *   suspended, or downgraded. Ownership must be transferred first.
 */

import { getPrisma }                    from "@/lib/db/prisma";
import { recordAuditEvent, ORG_AUDIT }  from "@/lib/audit/audit-service";
import type { MemberRecord, OrgRole, MemberStatus } from "./types";

type MemberModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  findUnique:(a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
  delete:    (a: unknown) => Promise<Record<string, unknown>>;
  count:     (a: unknown) => Promise<number>;
};

async function model(): Promise<MemberModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).organizationMember as MemberModel) : null;
}

function rowToMember(r: Record<string, unknown>): MemberRecord {
  const user = r.user as Record<string, unknown> | undefined;
  return {
    id:             String(r.id),
    organizationId: String(r.organizationId),
    userId:         String(r.userId),
    role:           String(r.role)   as OrgRole,
    status:         String(r.status) as MemberStatus,
    departmentId:   r.departmentId   ? String(r.departmentId) : null,
    invitedById:    r.invitedById    ? String(r.invitedById)  : null,
    joinedAt:       r.joinedAt       ? new Date(r.joinedAt as string).toISOString() : null,
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
    user: user ? { id: String(user.id), name: String(user.name), email: String(user.email) } : undefined,
  };
}

/** Check if the member is the last OWNER — if so, block removal/suspension/downgrade. */
async function guardLastOwner(
  m:      MemberModel,
  orgId:  string,
  memberId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await m.findUnique({ where: { id: memberId } });
  if (!member || String(member.role) !== "OWNER") return { ok: true };

  const ownerCount = await m.count({
    where: { organizationId: orgId, role: "OWNER", status: "ACTIVE" },
  });
  if (ownerCount <= 1) {
    return { ok: false, error: "Cannot remove, suspend, or downgrade the last OWNER. Transfer ownership first." };
  }
  return { ok: true };
}

/** List all members of an organization. */
export async function listMembers(orgId: string): Promise<MemberRecord[]> {
  const m = await model();
  if (!m) return [];
  try {
    const rows = await m.findMany({
      where:   { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return rows.map(rowToMember);
  } catch { return []; }
}

export interface AddMemberInput {
  organizationId: string;
  userId:         string;
  role:           OrgRole;
  invitedById?:   string;
  actorUserId?:   string;
}

/** Add a user directly as a member (e.g. when accepting an invitation). */
export async function addMember(
  input: AddMemberInput,
): Promise<{ ok: true; member: MemberRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const existing = await m.findFirst({
    where: { organizationId: input.organizationId, userId: input.userId },
  });
  if (existing) return { ok: false, error: "User is already a member of this organization" };

  try {
    const row = await m.create({
      data: {
        organizationId: input.organizationId,
        userId:         input.userId,
        role:           input.role,
        status:         "ACTIVE",
        invitedById:    input.invitedById ?? null,
        joinedAt:       new Date(),
        createdAt:      new Date(),
        updatedAt:      new Date(),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const member = rowToMember(row);

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     ORG_AUDIT.MEMBER_ADDED,
      entityType: "OrganizationMember",
      entityId:   member.id,
      metadata:   { orgId: input.organizationId, userId: input.userId, role: input.role },
    });

    return { ok: true, member };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface ChangeMemberRoleInput {
  organizationId: string;
  memberId:       string;
  newRole:        OrgRole;
  actorUserId?:   string;
}

/** Change a member's role. Enforces last-owner safeguard. */
export async function changeMemberRole(
  input: ChangeMemberRoleInput,
): Promise<{ ok: true; member: MemberRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  if (input.newRole !== "OWNER") {
    const guard = await guardLastOwner(m, input.organizationId, input.memberId);
    if (!guard.ok) return guard;
  }

  const prevRow = await m.findFirst({
    where: { id: input.memberId, organizationId: input.organizationId },
  });
  if (!prevRow) return { ok: false, error: "Member not found" };

  try {
    const row = await m.update({
      where:   { id: input.memberId },
      data:    { role: input.newRole, updatedAt: new Date() },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const member = rowToMember(row);

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     ORG_AUDIT.MEMBER_ROLE_CHANGED,
      entityType: "OrganizationMember",
      entityId:   member.id,
      metadata:   { orgId: input.organizationId, prevRole: String(prevRow.role), newRole: input.newRole },
    });

    return { ok: true, member };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface ChangeMemberStatusInput {
  organizationId: string;
  memberId:       string;
  newStatus:      MemberStatus;
  actorUserId?:   string;
}

/** Change a member's status (ACTIVE / SUSPENDED). Enforces last-owner safeguard on suspension. */
export async function changeMemberStatus(
  input: ChangeMemberStatusInput,
): Promise<{ ok: true; member: MemberRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  if (input.newStatus === "SUSPENDED") {
    const guard = await guardLastOwner(m, input.organizationId, input.memberId);
    if (!guard.ok) return guard;
  }

  try {
    const row = await m.update({
      where:   { id: input.memberId },
      data:    { status: input.newStatus, updatedAt: new Date() },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const member = rowToMember(row);

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     ORG_AUDIT.MEMBER_STATUS_CHANGED,
      entityType: "OrganizationMember",
      entityId:   member.id,
      metadata:   { orgId: input.organizationId, newStatus: input.newStatus },
    });

    return { ok: true, member };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface RemoveMemberInput {
  organizationId: string;
  memberId:       string;
  actorUserId?:   string;
}

/** Remove a member. Enforces last-owner safeguard. */
export async function removeMember(
  input: RemoveMemberInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const guard = await guardLastOwner(m, input.organizationId, input.memberId);
  if (!guard.ok) return guard;

  const existing = await m.findFirst({
    where: { id: input.memberId, organizationId: input.organizationId },
  });
  if (!existing) return { ok: false, error: "Member not found" };

  try {
    await m.delete({ where: { id: input.memberId } });

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     ORG_AUDIT.MEMBER_REMOVED,
      entityType: "OrganizationMember",
      entityId:   input.memberId,
      metadata:   { orgId: input.organizationId, userId: String(existing.userId) },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface TransferOwnershipInput {
  organizationId: string;
  fromMemberId:   string;
  toMemberId:     string;
  actorUserId?:   string;
}

/** Transfer OWNER role: promote toMember to OWNER, downgrade fromMember to ADMIN. */
export async function transferOwnership(
  input: TransferOwnershipInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const toMember = await m.findFirst({
    where: { id: input.toMemberId, organizationId: input.organizationId },
  });
  if (!toMember) return { ok: false, error: "Target member not found in this organization" };

  try {
    await m.update({
      where: { id: input.fromMemberId },
      data:  { role: "ADMIN", updatedAt: new Date() },
    });
    await m.update({
      where: { id: input.toMemberId },
      data:  { role: "OWNER", updatedAt: new Date() },
    });

    await recordAuditEvent({
      userId:     input.actorUserId,
      action:     ORG_AUDIT.OWNERSHIP_TRANSFERRED,
      entityType: "Organization",
      entityId:   input.organizationId,
      metadata:   { fromMemberId: input.fromMemberId, toMemberId: input.toMemberId },
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
