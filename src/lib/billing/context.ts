/**
 * Billing request context (Phase 31).
 *
 * Resolves the authenticated user's organization from the DB.
 * The JWT contains userId/role but NOT organizationId, so we look up
 * OrganizationMember on each request. Result is not cached — billing routes
 * must re-derive context per request for correct authorization.
 */

import type { NextRequest }    from "next/server";
import { getAuthRole }         from "@/lib/auth/rbac-server";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import type { OrgContext, OrgRole } from "./types";

type MemberModel = {
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
};

/**
 * Returns the billing context for the request, or null if the user is
 * unauthenticated or has no organization membership.
 */
export async function getOrgContext(req: NextRequest): Promise<OrgContext | null> {
  const role = await getAuthRole(req);
  if (!role) return null;

  // Extract userId from access token
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload) return null;
  const userId = payload.sub;

  const db = await getPrisma();
  if (!db) return null;

  try {
    const memberModel = (db as Record<string, unknown>).organizationMember as MemberModel;
    const member = await memberModel.findFirst({
      // PHASE 90: only an ACTIVE membership grants organization context.
      // Previously any row matched, so a SUSPENDED member kept full billing
      // and org-scoped access until their row was deleted.
      where:   { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" }, // prefer earliest membership (owner)
      select:  { organizationId: true, role: true },
    });
    if (!member) return null;

    return {
      userId,
      orgId: String(member.organizationId),
      role:  String(member.role) as OrgRole,
    };
  } catch {
    return null;
  }
}

/** Ensure request has a valid billing context or return a 401/403 response payload. */
export async function requireOrgContext(
  req: NextRequest,
): Promise<{ ctx: OrgContext } | { error: string; status: number }> {
  const ctx = await getOrgContext(req);
  if (!ctx) return { error: "Authentication required or no organization found", status: 401 };
  return { ctx };
}
