/**
 * Server-side active organization (HRIS-0.5A).
 *
 * Trust chain for every ERP request:
 *   signed access token (verifyAccessToken)
 *     -> session row still active (isPayloadSessionActive, sid = RefreshToken id)
 *     -> ActiveOrganizationSelection keyed by that sid (optional pointer)
 *     -> ACTIVE OrganizationMember for (userId, organizationId), re-read now.
 *
 * The selection is a pointer, never a grant. A missing, foreign, deleted or
 * inactive organization makes the pointer stale: it is removed and the request
 * answers 404. No client-supplied organizationId is read anywhere on this path.
 */

import { cookies } from "next/headers";
import { getPrisma } from "@/lib/db/prisma";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { isPayloadSessionActive } from "@/lib/auth/session-store";
import type { OrgRole } from "@/lib/org/types";
import { ErpError, type ErpScope } from "./tenant";

export type SessionIdentity = { userId: string; sessionId: string | null };

type MemberRow = { id: string; organizationId: string; role: string };

type ActiveOrgTx = {
  activeOrganizationSelection: {
    findUnique(args: unknown): Promise<{ organizationId: string } | null>;
    upsert(args: unknown): Promise<unknown>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  auditLog: { create(args: unknown): Promise<unknown> };
};

type ActiveOrgDb = ActiveOrgTx & {
  organizationMember: {
    findMany(args: unknown): Promise<MemberRow[]>;
    findFirst(args: unknown): Promise<MemberRow | null>;
  };
  $transaction<R>(fn: (tx: ActiveOrgTx) => Promise<R>): Promise<R>;
};

async function db(): Promise<ActiveOrgDb> {
  const prisma = (await getPrisma()) as unknown as ActiveOrgDb | null;
  if (!prisma?.organizationMember || !prisma.activeOrganizationSelection) {
    throw new ErpError(503, "SERVICE_UNAVAILABLE");
  }
  return prisma;
}

/**
 * Reads the caller from the signed access-token cookie. Returns null for any
 * unsigned, expired, revoked, or legacy-less-than-session token. A legacy token
 * without `sid` yields sessionId null: it can resolve a single membership but
 * can never hold a selection.
 */
export async function readSessionIdentity(
  token: string | null | undefined,
): Promise<SessionIdentity | null> {
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;
  if (!(await isPayloadSessionActive(payload))) return null;
  return { userId: payload.sub, sessionId: payload.sid ?? null };
}

/** Resolves the caller's identity from the request cookies (server components and route handlers). */
export async function currentSessionIdentity(): Promise<SessionIdentity | null> {
  const store = await cookies();
  return readSessionIdentity(store.get(ACCESS_TOKEN_COOKIE)?.value);
}

export type ActiveOrganizationResult =
  | { ok: true; scope: ErpScope }
  | { ok: false; error: ErpError };

function scopeFrom(row: MemberRow, userId: string): ErpScope {
  const role = row.role as OrgRole;
  return {
    userId,
    organizationId: row.organizationId,
    memberId: row.id,
    role,
    canViewCompensation: role === "OWNER",
  };
}

/**
 * The only way an ERP request learns its organization. Membership is re-read on
 * every call. Deterministic rules:
 *   - a valid selection whose ACTIVE membership still exists -> that organization;
 *   - a stale selection (foreign, deleted, inactive) -> selection removed, 404;
 *   - no selection and exactly one ACTIVE membership -> that membership;
 *   - no selection and several memberships -> 428 ACTIVE_ORGANIZATION_REQUIRED
 *     (the first membership is never guessed);
 *   - no ACTIVE membership at all -> 404.
 */
export async function resolveActiveOrganization(identity: SessionIdentity): Promise<ActiveOrganizationResult> {
  try {
    const prisma = await db();

    // A selection is checked directly against its own organization. The membership
    // set is never listed here, so a user with many memberships cannot push the
    // selected one out of a window.
    if (identity.sessionId) {
      const selection = await prisma.activeOrganizationSelection.findUnique({
        where: { sessionId: identity.sessionId },
        select: { organizationId: true },
      });
      if (selection) {
        const row = await prisma.organizationMember.findFirst({
          where: { organizationId: selection.organizationId, userId: identity.userId, status: "ACTIVE" },
          select: { id: true, organizationId: true, role: true },
        });
        if (!row) {
          await prisma.activeOrganizationSelection.deleteMany({ where: { sessionId: identity.sessionId } });
          return { ok: false, error: new ErpError(404, "NOT_FOUND") };
        }
        return { ok: true, scope: scopeFrom(row, identity.userId) };
      }
    }

    // Two rows are enough to tell "none", "exactly one" and "several" apart.
    const rows = await prisma.organizationMember.findMany({
      where: { userId: identity.userId, status: "ACTIVE" },
      select: { id: true, organizationId: true, role: true },
      take: 2,
    });
    if (rows.length === 0) return { ok: false, error: new ErpError(404, "NOT_FOUND") };
    if (rows.length === 1) return { ok: true, scope: scopeFrom(rows[0], identity.userId) };
    return { ok: false, error: new ErpError(428, "ACTIVE_ORGANIZATION_REQUIRED") };
  } catch (err) {
    if (err instanceof ErpError) return { ok: false, error: err };
    // Never surface the driver message or host.
    return { ok: false, error: new ErpError(503, "SERVICE_UNAVAILABLE") };
  }
}

/** Server-side context for the current request (cookies). */
export async function getActiveOrganizationContext(): Promise<ActiveOrganizationResult> {
  const identity = await currentSessionIdentity();
  if (!identity) return { ok: false, error: new ErpError(401, "AUTHENTICATION_REQUIRED") };
  return resolveActiveOrganization(identity);
}

/**
 * Records the caller's choice for THIS session. The caller must hold an ACTIVE
 * membership of the organization at this moment; otherwise the organization is
 * reported as not found (no existence oracle) and nothing is written.
 * The selection and its audit row commit in one transaction. The audit row names
 * the organization only, never the session id.
 */
export async function activateOrganization(args: {
  userId: string;
  sessionId: string;
  organizationId: string;
  correlationId: string;
}): Promise<ActiveOrganizationResult> {
  try {
    const prisma = await db();
    const row = await prisma.organizationMember.findFirst({
      where: { organizationId: args.organizationId, userId: args.userId, status: "ACTIVE" },
      select: { id: true, organizationId: true, role: true },
    });
    if (!row) return { ok: false, error: new ErpError(404, "NOT_FOUND") };
    await prisma.$transaction(async tx => {
      await tx.activeOrganizationSelection.upsert({
        where: { sessionId: args.sessionId },
        create: { sessionId: args.sessionId, userId: args.userId, organizationId: args.organizationId },
        update: { userId: args.userId, organizationId: args.organizationId },
      });
      await tx.auditLog.create({
        data: {
          userId: args.userId,
          organizationId: args.organizationId,
          action: "erp.active_organization.select",
          entityType: "Organization",
          entityId: args.organizationId,
          outcome: "SUCCESS",
          correlationId: args.correlationId,
          metadata: { changedFields: ["organizationId"] },
        },
      });
    });
    return { ok: true, scope: scopeFrom(row, args.userId) };
  } catch (err) {
    if (err instanceof ErpError) return { ok: false, error: err };
    return { ok: false, error: new ErpError(503, "SERVICE_UNAVAILABLE") };
  }
}
