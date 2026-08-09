/**
 * PHASE 99 — the Academy request scope.
 *
 * The Academy list endpoint always resolved the caller's active organization
 * before reading courses, but the `[id]` detail endpoints did not resolve
 * anything at all: they looked a record up by primary key and returned it. That
 * left another tenant's UNPUBLISHED course and its assessment content readable
 * by any anonymous caller holding an id.
 *
 * The scope resolution lived inline in the list route, so there was nothing for
 * the detail routes to reuse. Extracting it here gives all three endpoints one
 * definition of "who is asking and which organization are they in", which is the
 * precondition for a correct tenant predicate.
 */

import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma } from "@/lib/db/prisma";

export interface AcademyScope {
  userId: string;
  orgId: string;
}

/**
 * Resolve the caller's user id and active organization from the access token.
 *
 * Returns null when there is no valid token or no ACTIVE membership — callers
 * must treat that as "no access", never as "no filter". The organization is
 * taken from the membership row, never from the request.
 */
export async function resolveAcademyScope(req: NextRequest): Promise<AcademyScope | null> {
  const at = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!at) return null;
  const payload = await verifyAccessToken(at);
  if (!payload?.sub) return null;
  const orgId = await resolveActiveOrgIdForUser(payload.sub);
  return orgId ? { userId: payload.sub, orgId } : null;
}

/**
 * The single "which organization is this user in" query.
 *
 * Extracted so the API routes and the PUBLIC Academy course PAGE
 * (`@/lib/academy/page-access`) resolve the caller's organization identically —
 * a page that computed the org differently from the endpoint it renders against
 * would drift into either a broken shell or, worse, a second authorization
 * opinion. Returns null when there is no client or no ACTIVE membership;
 * callers must treat that as "no access", never as "no filter".
 */
export async function resolveActiveOrgIdForUser(userId: string): Promise<string | null> {
  const db = await getPrisma();
  if (!db) return null;
  const memberModel = (db as Record<string, unknown>).organizationMember as {
    findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  };
  const row = await memberModel.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  return row ? String(row.organizationId) : null;
}

/** Roles allowed to see unpublished Academy content within their own org. */
export function canSeeUnpublishedAcademyContent(role: string | null): boolean {
  return role === "admin" || role === "superadmin";
}
