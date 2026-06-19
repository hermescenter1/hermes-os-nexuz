/**
 * Organization invitation service (Phase 32).
 *
 * Token security: opaque 64-char hex token generated with crypto.randomBytes.
 * Tokens are NEVER returned in list APIs.
 * accept/reject are gated by token + authenticated user email match only.
 */

import { randomBytes }                  from "node:crypto";
import { getPrisma }                    from "@/lib/db/prisma";
import { recordAuditEvent, ORG_AUDIT }  from "@/lib/audit/audit-service";
import { addMember }                    from "./members";
import type { InvitationRecord, InvitationCreatedRecord, OrgRole, InvitationStatus } from "./types";

const INVITATION_TTL_DAYS = 7;

type InvModel = {
  findMany:  (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:    (a: unknown) => Promise<Record<string, unknown>>;
  update:    (a: unknown) => Promise<Record<string, unknown>>;
  updateMany:(a: unknown) => Promise<unknown>;
};

type UserModel = {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
};

async function model(): Promise<InvModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).organizationInvitation as InvModel) : null;
}

async function userModel(): Promise<UserModel | null> {
  const db = await getPrisma();
  return db ? ((db as Record<string, unknown>).user as UserModel) : null;
}

function rowToInvitation(r: Record<string, unknown>, includeToken = false): InvitationRecord {
  const base: InvitationRecord = {
    id:             String(r.id),
    organizationId: String(r.organizationId),
    email:          String(r.email),
    role:           String(r.role)   as OrgRole,
    status:         String(r.status) as InvitationStatus,
    invitedById:    r.invitedById ? String(r.invitedById) : null,
    expiresAt:      new Date(r.expiresAt as string).toISOString(),
    createdAt:      new Date(r.createdAt as string).toISOString(),
    updatedAt:      new Date(r.updatedAt as string).toISOString(),
  };
  if (includeToken) {
    return { ...base, token: String(r.token) } as InvitationCreatedRecord;
  }
  return base;
}

function newExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITATION_TTL_DAYS);
  return d;
}

/** List pending invitations for an org (tokens never returned). */
export async function listInvitations(orgId: string): Promise<InvitationRecord[]> {
  const m = await model();
  if (!m) return [];
  try {
    const rows = await m.findMany({
      where:   { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => rowToInvitation(r, false));
  } catch { return []; }
}

export interface InviteMemberInput {
  organizationId: string;
  email:          string;
  role:           OrgRole;
  invitedById?:   string;
}

/** Invite a user by email. Returns the record including token (show once). */
export async function inviteMember(
  input: InviteMemberInput,
): Promise<{ ok: true; invitation: InvitationCreatedRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Invalid email address" };
  }

  // Expire any existing pending invitation for the same email in this org
  await m.updateMany({
    where: { organizationId: input.organizationId, email, status: "PENDING" },
    data:  { status: "EXPIRED", updatedAt: new Date() },
  });

  const token = randomBytes(32).toString("hex");

  try {
    const row = await m.create({
      data: {
        organizationId: input.organizationId,
        email,
        role:        input.role,
        token,
        status:      "PENDING",
        invitedById: input.invitedById ?? null,
        expiresAt:   newExpiry(),
        createdAt:   new Date(),
        updatedAt:   new Date(),
      },
    });

    await recordAuditEvent({
      userId:     input.invitedById,
      action:     ORG_AUDIT.MEMBER_INVITED,
      entityType: "OrganizationInvitation",
      entityId:   String(row.id),
      metadata:   { orgId: input.organizationId, email, role: input.role },
    });

    return { ok: true, invitation: rowToInvitation(row, true) as InvitationCreatedRecord };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Accept an invitation.
 * Gate: token must match AND authenticated user's email must match invitation email.
 * This is the one exception to org-scope auth — user is not yet a member.
 */
export async function acceptInvitation(
  token:            string,
  authenticatedEmail: string,
  userId:           string,
): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const row = await m.findFirst({ where: { token } });
  if (!row) return { ok: false, error: "Invitation not found" };
  if (String(row.status) !== "PENDING") {
    return { ok: false, error: `Invitation is already ${row.status}` };
  }
  if (new Date(row.expiresAt as string) < new Date()) {
    await m.update({ where: { id: String(row.id) }, data: { status: "EXPIRED", updatedAt: new Date() } });
    return { ok: false, error: "Invitation has expired" };
  }
  if (String(row.email).toLowerCase() !== authenticatedEmail.toLowerCase()) {
    return { ok: false, error: "This invitation was sent to a different email address" };
  }

  const orgId = String(row.organizationId);
  const role  = String(row.role) as OrgRole;

  const addResult = await addMember({
    organizationId: orgId,
    userId,
    role,
    invitedById: row.invitedById ? String(row.invitedById) : undefined,
    actorUserId: userId,
  });
  if (!addResult.ok) return { ok: false, error: addResult.error };

  await m.update({
    where: { id: String(row.id) },
    data:  { status: "ACCEPTED", updatedAt: new Date() },
  });

  await recordAuditEvent({
    userId,
    action:     ORG_AUDIT.INVITATION_ACCEPTED,
    entityType: "OrganizationInvitation",
    entityId:   String(row.id),
    metadata:   { orgId, role },
  });

  return { ok: true, orgId };
}

/**
 * Reject an invitation.
 * Same token + email gate as accept.
 */
export async function rejectInvitation(
  token:              string,
  authenticatedEmail: string,
  userId:             string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const row = await m.findFirst({ where: { token } });
  if (!row) return { ok: false, error: "Invitation not found" };
  if (String(row.status) !== "PENDING") {
    return { ok: false, error: `Invitation is already ${row.status}` };
  }
  if (String(row.email).toLowerCase() !== authenticatedEmail.toLowerCase()) {
    return { ok: false, error: "This invitation was sent to a different email address" };
  }

  await m.update({
    where: { id: String(row.id) },
    data:  { status: "REJECTED", updatedAt: new Date() },
  });

  await recordAuditEvent({
    userId,
    action:     ORG_AUDIT.INVITATION_REJECTED,
    entityType: "OrganizationInvitation",
    entityId:   String(row.id),
    metadata:   { orgId: String(row.organizationId) },
  });

  return { ok: true };
}

/** Resend: invalidates old token, issues a fresh token + expiry. */
export async function resendInvitation(
  invitationId:  string,
  organizationId: string,
  actorUserId?:  string,
): Promise<{ ok: true; invitation: InvitationCreatedRecord } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const row = await m.findFirst({
    where: { id: invitationId, organizationId },
  });
  if (!row) return { ok: false, error: "Invitation not found" };
  if (String(row.status) !== "PENDING" && String(row.status) !== "EXPIRED") {
    return { ok: false, error: "Only PENDING or EXPIRED invitations can be resent" };
  }

  const newToken = randomBytes(32).toString("hex");

  const updated = await m.update({
    where: { id: invitationId },
    data:  { token: newToken, status: "PENDING", expiresAt: newExpiry(), updatedAt: new Date() },
  });

  await recordAuditEvent({
    userId:     actorUserId,
    action:     ORG_AUDIT.INVITATION_RESENT,
    entityType: "OrganizationInvitation",
    entityId:   invitationId,
    metadata:   { orgId: organizationId },
  });

  return { ok: true, invitation: rowToInvitation(updated, true) as InvitationCreatedRecord };
}

/** Revoke a pending invitation. */
export async function revokeInvitation(
  invitationId:   string,
  organizationId: string,
  actorUserId?:   string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const m = await model();
  if (!m) return { ok: false, error: "Database unavailable" };

  const row = await m.findFirst({ where: { id: invitationId, organizationId } });
  if (!row) return { ok: false, error: "Invitation not found" };

  await m.update({
    where: { id: invitationId },
    data:  { status: "EXPIRED", updatedAt: new Date() },
  });

  await recordAuditEvent({
    userId:     actorUserId,
    action:     ORG_AUDIT.INVITATION_REVOKED,
    entityType: "OrganizationInvitation",
    entityId:   invitationId,
    metadata:   { orgId: organizationId },
  });

  return { ok: true };
}

/** Look up user email from userId for the accept/reject gate. */
export async function getUserEmail(userId: string): Promise<string | null> {
  const um = await userModel();
  if (!um) return null;
  try {
    const user = await um.findUnique({ where: { id: userId } });
    return user ? String(user.email) : null;
  } catch { return null; }
}
