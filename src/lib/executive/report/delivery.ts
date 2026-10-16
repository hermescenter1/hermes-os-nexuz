/**
 * EXECUTIVE DASHBOARD row 10 — the delivery ledger.
 *
 * One row per (organization, business day, report version, recipient),
 * written at the moment the recipient is told, carrying the role and status
 * they held AT THAT MOMENT and the rule that admitted them.
 *
 * WHY. `OrganizationMember` overwrites role and status in place and keeps no
 * history; `Notification` records neither, and carries no organization at
 * all. "Was this recipient entitled to be told, when they were told?" could
 * therefore only be inferred from today's membership plus the code that
 * filtered it. This makes it a record.
 *
 * NOTHING IS RECONSTRUCTED. There is no backfill in this module and no
 * migration writes a row. The absence of a delivery for an older report means
 * "not recorded", never "nobody was told".
 *
 * NO PII. A recipient is a `userId`; no name, e-mail or telephone is copied
 * here, and the authority is the role and status strings only.
 */

/**
 * The rule under which a delivery was decided, frozen into every row.
 *
 * Bump this whenever the ALLOWLIST or the meaning of the filter changes, so a
 * later widening cannot be read backwards onto a delivery decided under the
 * narrower rule. `allowedRoles` records the exact set as well, because a
 * version string alone tells a later reader nothing about what it contained.
 */
export const DELIVERY_RULES_VERSION = "notify-roles-1";

/** A member as the notification query returns them, with their authority. */
export interface RecipientAuthority {
  readonly userId: string;
  readonly role: string;
  readonly status: string;
}

export interface DeliveryRecord {
  readonly organizationId: string;
  readonly businessDate: string;
  readonly reportVersion: number;
  readonly recipient: RecipientAuthority;
  readonly allowedRoles: readonly string[];
  readonly notificationId: string | null;
}

/** The Prisma delegate this module needs, and nothing more. */
export interface DeliveryDelegate {
  create(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>;
}

/** A unique-constraint violation — the delivery was already recorded. */
function isAlreadyRecorded(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "P2002";
}

/**
 * Record one delivery.
 *
 * Returns "RECORDED" when this call wrote the row, "ALREADY" when an earlier
 * one did, and "FAILED" when the write could not be made. The caller uses
 * "ALREADY" as its idempotency answer: the unique constraint, not a prior
 * read, is what decides, so two replicas racing for the same recipient
 * cannot both send.
 */
export async function recordDelivery(
  deliveries: DeliveryDelegate,
  record: DeliveryRecord,
): Promise<"RECORDED" | "ALREADY" | "FAILED"> {
  // Sorted and joined so the stored value does not depend on the order the
  // allowlist happened to be written in.
  const allowedRoles = [...record.allowedRoles].sort().join(",");
  try {
    await deliveries.create({
      data: {
        organizationId: record.organizationId,
        businessDate: record.businessDate,
        reportVersion: record.reportVersion,
        userId: record.recipient.userId,
        roleAtSend: record.recipient.role,
        statusAtSend: record.recipient.status,
        rulesVersion: DELIVERY_RULES_VERSION,
        allowedRoles,
        notificationId: record.notificationId,
      },
    });
    return "RECORDED";
  } catch (err) {
    return isAlreadyRecorded(err) ? "ALREADY" : "FAILED";
  }
}

/**
 * Which recipients of this report version have already been recorded.
 *
 * Read inside the same organization scope as everything else: the query is
 * keyed by organizationId first, so it can never see another tenant's
 * deliveries.
 */
export async function recordedRecipients(
  deliveries: DeliveryDelegate,
  scope: { organizationId: string; businessDate: string; reportVersion: number },
): Promise<Set<string>> {
  try {
    const rows = await deliveries.findMany({
      where: {
        organizationId: scope.organizationId,
        businessDate: scope.businessDate,
        reportVersion: scope.reportVersion,
      },
      select: { userId: true },
    });
    return new Set(
      rows.map(r => String(r.userId)).filter(u => u !== ""),
    );
  } catch {
    // An unreadable ledger must not be read as "nobody was told": the caller
    // still attempts each recipient, and the unique constraint remains the
    // thing that prevents a second notification.
    return new Set();
  }
}
