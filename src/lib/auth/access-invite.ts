/**
 * Access invite service (Phase 81C).
 * Server-side only.
 *
 * Flow: admin approves an AUTH_ACCESS_REQUEST SalesLead → a single-use,
 * expiring invite is created (SHA-256 token hash stored, plaintext returned
 * exactly once for the admin to copy) → the visitor opens the invite link,
 * sets a password, and only then is a User created — always with a
 * non-privileged role from the allowlist below. No public path creates
 * admin/superadmin accounts.
 */

import { getPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { generateInviteToken, hashInviteToken } from "./jwt-server";
import { hashArgon2 } from "./argon2-wrapper";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { ACCESS_INVITE_TTL } from "./config";

/** Roles an admin may grant via invite — privileged roles are never invitable. */
export const INVITABLE_ROLES = ["viewer", "customer", "engineer"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** Lowest safe default — matches User.role @default and registerUser(). */
export const DEFAULT_INVITE_ROLE: InvitableRole = "customer";

export function isInvitableRole(v: unknown): v is InvitableRole {
  return typeof v === "string" && (INVITABLE_ROLES as readonly string[]).includes(v);
}

// ── Prisma structural casts (matches password-reset.ts convention) ───────────

interface InviteModel {
  create:     (a: unknown) => Promise<Record<string, unknown>>;
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
}
interface LeadModel {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  update:     (a: unknown) => Promise<unknown>;
}
interface UserModel {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:     (a: unknown) => Promise<Record<string, unknown>>;
}

function models(db: unknown) {
  const d = db as Record<string, unknown>;
  return {
    invite: d.accessInvite as InviteModel,
    lead:   d.salesLead    as LeadModel,
    user:   d.user         as UserModel,
  };
}

// ── Create invite (admin approval) ───────────────────────────────────────────

export type CreateInviteResult =
  | { ok: true; plainToken: string; email: string; leadLocale: string | null; expiresAt: Date }
  | { ok: false; error: "not-found" | "not-access-request" | "rejected" | "db-unavailable" };

export async function createAccessInvite(
  leadId:      string,
  adminUserId: string,
  role:        InvitableRole = DEFAULT_INVITE_ROLE,
): Promise<CreateInviteResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  try {
    const { invite, lead } = models(db);

    const row = await lead.findUnique({ where: { id: leadId } });
    if (!row)                                       return { ok: false, error: "not-found" };
    if (row.source !== "AUTH_ACCESS_REQUEST")       return { ok: false, error: "not-access-request" };
    if (String(row.status) === "REJECTED")          return { ok: false, error: "rejected" };

    // A re-approval regenerates the link — retire any invite still pending
    await invite.updateMany({
      where: { sourceLeadId: leadId, status: "PENDING" },
      data:  { status: "REVOKED" },
    });

    const plainToken = generateInviteToken();
    const tokenHash  = hashInviteToken(plainToken);
    const expiresAt  = new Date(Date.now() + ACCESS_INVITE_TTL * 1000);
    const email      = String(row.email).toLowerCase();

    await invite.create({
      data: {
        email,
        fullName:        (row.fullName as string | null) ?? null,
        company:         (row.company as string | null) ?? null,
        role,
        tokenHash,
        status:          "PENDING",
        expiresAt,
        createdByUserId: adminUserId,
        sourceLeadId:    leadId,
      },
    });

    await lead.update({ where: { id: leadId }, data: { status: "APPROVED" } });

    await recordAuditEvent({
      userId:     adminUserId,
      action:     "auth.access_invite_created",
      entityType: "access_invite",
      entityId:   leadId,
      metadata:   { email, role },
    });

    return {
      ok: true,
      plainToken,
      email,
      leadLocale: (row.locale as string | null) ?? null,
      expiresAt,
    };
  } catch (err) {
    logger.error("[access-invite] create error", { error: String(err) });
    return { ok: false, error: "db-unavailable" };
  }
}

// ── Reject access request ────────────────────────────────────────────────────

export type RejectResult =
  | { ok: true }
  | { ok: false; error: "not-found" | "not-access-request" | "db-unavailable" };

export async function rejectAccessRequest(
  leadId:      string,
  adminUserId: string,
): Promise<RejectResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  try {
    const { invite, lead } = models(db);

    const row = await lead.findUnique({ where: { id: leadId } });
    if (!row)                                 return { ok: false, error: "not-found" };
    if (row.source !== "AUTH_ACCESS_REQUEST") return { ok: false, error: "not-access-request" };

    await lead.update({ where: { id: leadId }, data: { status: "REJECTED" } });
    // A rejected request must not leave a live invite behind
    await invite.updateMany({
      where: { sourceLeadId: leadId, status: "PENDING" },
      data:  { status: "REVOKED" },
    });

    await recordAuditEvent({
      userId:     adminUserId,
      action:     "auth.access_request_rejected",
      entityType: "sales_lead",
      entityId:   leadId,
      metadata:   {},
    });

    return { ok: true };
  } catch (err) {
    logger.error("[access-invite] reject error", { error: String(err) });
    return { ok: false, error: "db-unavailable" };
  }
}

// ── Preview (accept-invite page) ─────────────────────────────────────────────

/**
 * Safe to show to the token holder: possession of the single-use link the
 * admin issued is the authorization. Returns null for any invalid state —
 * missing, used, revoked, expired — without distinguishing which.
 */
export async function previewAccessInvite(
  plainToken: string,
): Promise<{ email: string; fullName: string | null } | null> {
  if (!plainToken || plainToken.length > 200) return null;
  const db = await getPrisma();
  if (!db) return null;

  try {
    const { invite } = models(db);
    const row = await invite.findUnique({ where: { tokenHash: hashInviteToken(plainToken) } });
    if (!row)                                           return null;
    if (row.status !== "PENDING" || row.usedAt)         return null;
    if (new Date(row.expiresAt as string) < new Date()) return null;
    return { email: String(row.email), fullName: (row.fullName as string | null) ?? null };
  } catch (err) {
    logger.error("[access-invite] preview error", { error: String(err) });
    return null;
  }
}

// ── Accept invite (user creation) ────────────────────────────────────────────

export type AcceptInviteResult =
  | { ok: true }
  | { ok: false; error: "invalid-invite" | "db-unavailable" };

export async function acceptAccessInvite(
  plainToken: string,
  password:   string,
): Promise<AcceptInviteResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  try {
    const { invite, user } = models(db);
    const tokenHash = hashInviteToken(plainToken);

    const row = await invite.findUnique({ where: { tokenHash } });
    if (!row)                                           return { ok: false, error: "invalid-invite" };
    if (row.status !== "PENDING" || row.usedAt)         return { ok: false, error: "invalid-invite" };
    if (new Date(row.expiresAt as string) < new Date()) return { ok: false, error: "invalid-invite" };

    // Defense in depth: even a tampered DB row never yields a privileged role
    const role = isInvitableRole(row.role) ? row.role : DEFAULT_INVITE_ROLE;
    const email = String(row.email).toLowerCase();

    // Same generic failure as a bad token — no email enumeration
    const existing = await user.findUnique({ where: { email } });
    if (existing) {
      await invite.updateMany({ where: { tokenHash }, data: { status: "REVOKED" } });
      return { ok: false, error: "invalid-invite" };
    }

    const passwordHash = await hashArgon2(password);

    // Claim before create: the conditional updateMany makes reuse race-safe —
    // exactly one caller can flip PENDING → ACCEPTED
    const claimed = await invite.updateMany({
      where: { tokenHash, status: "PENDING", usedAt: null },
      data:  { status: "ACCEPTED", usedAt: new Date() },
    });
    if (claimed.count !== 1) return { ok: false, error: "invalid-invite" };

    const created = await user.create({
      data: {
        name:  (row.fullName as string | null) || email.split("@")[0],
        email,
        passwordHash,
        role,
        // The invite link was issued by an admin for exactly this address;
        // accepting it is the verification (email sending is console-mode only)
        emailVerified:   true,
        emailVerifiedAt: new Date(),
      },
    });

    await recordAuditEvent({
      userId:     String(created.id),
      action:     "auth.access_invite_accepted",
      entityType: "user",
      entityId:   String(created.id),
      metadata:   { email, role, inviteId: String(row.id) },
    });

    return { ok: true };
  } catch (err) {
    logger.error("[access-invite] accept error", { error: String(err) });
    return { ok: false, error: "db-unavailable" };
  }
}
