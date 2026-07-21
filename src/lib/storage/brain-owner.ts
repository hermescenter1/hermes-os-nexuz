/**
 * PHASE 90 — trusted resolution of the Industrial Brain resource owner.
 *
 * The owner is derived ONLY from the authenticated session cookie and the
 * caller's own membership row. Nothing here reads a request body, query string
 * or header that a client controls, so a caller cannot claim another tenant's
 * identity by supplying `userId` / `organizationId` / `orgId` in a payload.
 *
 * `orgId` is resolved the same way the billing context does — the caller's
 * earliest ACTIVE membership — and is null when the user belongs to no
 * organization (or when the database is unavailable), in which case the user is
 * scoped to their own `userId` alone. A SUSPENDED membership never contributes
 * an org scope, so a suspended member immediately loses access to their
 * organization's Brain history.
 */

import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import type { BrainOwner } from "./types";

type MemberModel = {
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
};

/**
 * The authenticated caller's Brain owner, or null when unauthenticated.
 * Callers must still run their authorization gate — this resolves identity,
 * it does not authorize.
 */
export async function resolveBrainOwner(): Promise<BrainOwner | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  return { userId: user.id, orgId: await activeOrgIdOf(user.id) };
}

/** Earliest ACTIVE membership's organization, or null. Never throws. */
async function activeOrgIdOf(userId: string): Promise<string | null> {
  try {
    const db = await getPrisma();
    if (!db) return null;
    const memberModel = (db as Record<string, unknown>).organizationMember as MemberModel;
    const member = await memberModel.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true },
    });
    return member ? String(member.organizationId) : null;
  } catch {
    // No database (session storage mode) or a transient failure: fall back to
    // user-only scope, which is strictly narrower than org scope.
    return null;
  }
}
