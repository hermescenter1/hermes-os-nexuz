/**
 * ERP tenant gate (HRIS-0.5).
 *
 * Two gates, both mandatory for ERP tenant data:
 *   1. the platform `admin` capability (layout + middleware, unchanged);
 *   2. organization membership + an OrgPermission (this module).
 *
 * A platform admin who is not a member of the requested organization gets
 * nothing. An organization the caller does not belong to answers 404, the same
 * as an unknown id, so membership cannot be probed.
 */

import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import { securityError } from "@/lib/security/request-guards";
import type { OrgRole } from "@/lib/org/types";

export type ErpFailureCode =
  | "AUTHENTICATION_REQUIRED"
  | "ORGANIZATION_REQUIRED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "SERVICE_UNAVAILABLE"
  | "MODULE_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "ORIGIN_NOT_ALLOWED"
  | "IDEMPOTENCY_KEY_INVALID"
  | "IDEMPOTENCY_KEY_REUSED"
  | "VERSION_CONFLICT"
  | "MEMBER_NOT_IN_ORGANIZATION"
  | "ALREADY_MEMBER"
  | "ACTIVE_ORGANIZATION_REQUIRED"
  | "SESSION_REQUIRED";

/** A refusal or failure with a stable public code. Never carries internal detail. */
export class ErpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErpFailureCode,
  ) {
    super(code);
    this.name = "ErpError";
  }
}

export interface ErpScope {
  userId: string;
  organizationId: string;
  memberId: string;
  role: OrgRole;
  canViewCompensation: boolean;
}

type PrismaWithMembers = { organizationMember?: { findMany(args: unknown): Promise<Array<{ id: string; organizationId: string; role: string; organization?: { name: string } }>> } };

async function memberDelegate() {
  const prisma = (await getPrisma()) as PrismaWithMembers | null;
  const delegate = prisma?.organizationMember;
  return delegate && typeof delegate.findMany === "function" ? delegate : null;
}

/** Organizations the user is an active member of, for the organization chooser. */
export async function listErpMemberships(userId: string): Promise<Array<{ organizationId: string; name: string }>> {
  const members = await memberDelegate();
  if (!members) return [];
  const rows = await members.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, organizationId: true, role: true, organization: { select: { name: true } } },
  });
  return rows.map(r => ({ organizationId: r.organizationId, name: r.organization?.name ?? "" }));
}

/** Uniform JSON failure: stable code, no-store, no internals. */
export function erpFailure(err: unknown): NextResponse {
  const e = err instanceof ErpError ? err : new ErpError(503, "SERVICE_UNAVAILABLE");
  return securityError({ error: e.code }, e.status);
}
