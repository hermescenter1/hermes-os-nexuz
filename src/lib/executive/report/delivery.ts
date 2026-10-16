import { logger } from "@/lib/logger";
import { getSseManager } from "@/lib/realtime/sse-manager";
import { recordUsage } from "@/lib/billing/usage";
import { rowToNotification } from "@/lib/notifications/repository";

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

/** The two delegates one delivery writes to, inside one transaction. */
export interface DeliveryTx {
  executiveReportDelivery: { create(args: unknown): Promise<unknown> };
  notification: { create(args: unknown): Promise<{ id?: unknown } | null> };
}

/** The client, narrowed to what this module uses. */
export interface DeliveryClient {
  $transaction<T>(fn: (tx: DeliveryTx) => Promise<T>): Promise<T>;
  executiveReportDelivery?: { findMany(args: unknown): Promise<Array<Record<string, unknown>>> };
}

export interface NotificationContent {
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly metadata: Record<string, unknown>;
}

/** A unique-constraint violation — someone else recorded this delivery. */
function isAlreadyRecorded(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "P2002";
}

export type DeliveryOutcome =
  | { kind: "SENT"; notificationId: string | null }
  | { kind: "ALREADY" }
  | { kind: "FAILED" };

/**
 * What the notification SERVICE does after a successful create, done here
 * after the transaction commits instead.
 *
 * This path no longer goes through the service — the notification has to be
 * written inside the same transaction as the ledger row — but none of the
 * service's behaviour may be lost on the way. The logger line, the real-time
 * push and the usage record are all reproduced, using the service's own
 * mapper so a consumer sees exactly the same shape.
 *
 * AFTER COMMIT, deliberately: a broadcast for a transaction that then rolled
 * back would tell a client about a notification that does not exist. Every
 * step is best-effort and swallows its own failure — a push that cannot be
 * delivered must not undo a delivery that was.
 */
function afterCommit(row: Record<string, unknown>, organizationId: string): void {
  try {
    const notification = rowToNotification(row);
    logger.info("[notifications] created.", {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
    });
    getSseManager().broadcastToUser(notification.userId, {
      type: "notification.created",
      notification,
    });
    void recordUsage(organizationId, "notifications_created", 1, notification.userId);
  } catch {
    // Never let a side effect fail a delivery that is already durable.
  }
}

/**
 * Tell one recipient, and record that they were told — ATOMICALLY.
 *
 * WHY ONE TRANSACTION, and not a claim followed by a send. Claiming first and
 * sending second has a window: a crash between the two leaves a ledger row
 * saying the person was told, so every later pass reads ALREADY and the
 * notification is lost for ever. Sending first and recording second has the
 * mirror window: a notification nobody can account for.
 *
 * So both rows are written in one transaction, and the notification's id is
 * frozen into the ledger row. Either both exist or neither does.
 *
 *   · the notification is created FIRST so its id can be stored;
 *   · the ledger row carries that id;
 *   · if the ledger write loses the unique constraint — another replica won
 *     the race — the whole transaction rolls back, including the
 *     notification. Exactly one replica sends;
 *   · any other failure rolls back too, and the caller is told FAILED, so a
 *     later pass tries again;
 *   · a crash AFTER commit is harmless: both rows are durable, and the next
 *     pass reads ALREADY because the person really was told.
 */
export async function deliverOnce(
  client: DeliveryClient,
  record: DeliveryRecord,
  content: NotificationContent,
): Promise<DeliveryOutcome> {
  // Sorted and joined so the stored value does not depend on the order the
  // allowlist happened to be written in.
  const allowedRoles = [...record.allowedRoles].sort().join(",");
  let createdRow: Record<string, unknown> | null = null;
  try {
    const notificationId = await client.$transaction(async tx => {
      const notification = await tx.notification.create({
        data: {
          userId: record.recipient.userId,
          type: content.type,
          title: content.title,
          message: content.message,
          metadata: content.metadata,
        },
      });
      // A create that produced no row is a failed send, and it must take the
      // whole transaction down: a ledger row claiming someone was told, with
      // no notification behind it, is the state this design exists to make
      // unreachable.
      if (!notification || typeof notification.id !== "string" || notification.id === "") {
        throw new Error("the notification was not created");
      }
      const id = notification.id;
      createdRow = notification as Record<string, unknown>;
      await tx.executiveReportDelivery.create({
        data: {
          organizationId: record.organizationId,
          businessDate: record.businessDate,
          reportVersion: record.reportVersion,
          userId: record.recipient.userId,
          roleAtSend: record.recipient.role,
          statusAtSend: record.recipient.status,
          rulesVersion: DELIVERY_RULES_VERSION,
          allowedRoles,
          notificationId: id,
        },
      });
      return id;
    });
    // Only now, with both rows durable.
    if (createdRow) afterCommit(createdRow, record.organizationId);
    return { kind: "SENT", notificationId };
  } catch (err) {
    return isAlreadyRecorded(err) ? { kind: "ALREADY" } : { kind: "FAILED" };
  }
}

/**
 * Which recipients of this report version have already been recorded.
 *
 * Scoped by organizationId first, so it can never see another tenant's
 * deliveries. This is an optimisation only: the unique constraint inside
 * `deliverOnce` is what actually prevents a second notification, because two
 * replicas can read this set at the same moment.
 */
export async function recordedRecipients(
  deliveries: { findMany(args: unknown): Promise<Array<Record<string, unknown>>> },
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
    return new Set(rows.map(r => String(r.userId)).filter(u => u !== ""));
  } catch {
    // An unreadable ledger must not be read as "nobody was told": the caller
    // still attempts each recipient, and the unique constraint remains the
    // thing that prevents a second notification.
    return new Set();
  }
}
