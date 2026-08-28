/**
 * PHASE 104 R1 (V-M7) — the application shell's organization context.
 *
 * `AppShell` used to hardcode `organizationName = null`, so the sidebar told an
 * ACTIVE OWNER of an organization that they had "No organization context". The
 * chip was truthful about its own wiring (there was no server source) but not
 * about the account, and the two are indistinguishable to the person reading it.
 *
 * This is the missing server source. It answers the same question, with the
 * same predicate, as the billing/API path in `lib/billing/context.ts`: the
 * caller's EARLIEST ACTIVE membership. It is display-only and widens nothing —
 * it reads the organization the user is already an ACTIVE member of, and the
 * caller's identity is established by the shell before this is called.
 *
 * Three outcomes, deliberately distinct, because collapsing them is exactly the
 * defect being fixed:
 *
 *   resolved     — there is an organization, and this is its name;
 *   none         — the account genuinely has no ACTIVE membership;
 *   unavailable  — the question could not be asked (no store in database mode,
 *                  or the query threw). Reporting this as "no organization"
 *                  would invent a fact about the account out of an outage, the
 *                  same mistake `resolveOrgContext` documents at length.
 */
import { getPrisma } from "@/lib/db/prisma";
import { getStorageMode } from "@/lib/storage/storage-mode";

export type ShellOrgContext =
  | { state: "resolved"; organizationId: string; organizationName: string }
  | { state: "none" }
  | { state: "unavailable" };

/** Minimal shape of the Prisma delegate this module uses. */
type MemberModel = {
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
};

export async function getShellOrgContext(
  userId: string | null | undefined,
): Promise<ShellOrgContext> {
  // No identity is not an outage and not an empty organization list: the shell
  // renders signed-out and has nothing to resolve.
  if (!userId) return { state: "none" };

  const db = await getPrisma();
  if (!db) {
    // In session mode there is no organization store at all, by design.
    return { state: getStorageMode() === "database" ? "unavailable" : "none" };
  }

  try {
    const memberModel = (db as unknown as Record<string, unknown>)
      .organizationMember as MemberModel;
    const member = await memberModel.findFirst({
      // Only an ACTIVE membership carries context — the same predicate the
      // API path uses, so the shell can never show an organization the API
      // would refuse.
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" }, // earliest membership, i.e. the owner's
      select: {
        organizationId: true,
        organization: { select: { name: true } },
      },
    });

    if (!member) return { state: "none" };

    const organization = member.organization as { name?: unknown } | null;
    const name = typeof organization?.name === "string" ? organization.name.trim() : "";
    // A membership row whose organization has no readable name is not a
    // resolved context; saying "none" would be wrong, so it is unavailable.
    if (!name) return { state: "unavailable" };

    return {
      state: "resolved",
      organizationId: String(member.organizationId),
      organizationName: name,
    };
  } catch {
    return { state: "unavailable" };
  }
}
