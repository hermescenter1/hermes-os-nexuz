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

/**
 * The ledger's idempotency key, named in the migration that creates it.
 *
 * Prisma reports a unique violation differently depending on how it reaches
 * PostgreSQL: through the pg driver adapter `meta.target` is the CONSTRAINT
 * NAME, and through the binary engine it is the list of FIELD NAMES. Both
 * forms are recognised, and nothing else is.
 */
const LEDGER_MODEL = "ExecutiveReportDelivery";
const LEDGER_UNIQUE_INDEX = "ExecutiveReportDelivery_org_date_version_user_key";
/** Sorted, so the comparison does not depend on the order Prisma lists them. */
const LEDGER_UNIQUE_FIELDS = ["businessDate", "organizationId", "reportVersion", "userId"];

/** Whatever Prisma said the conflict was about, as one printable token. */
function describeConflict(meta: Record<string, unknown> | null): string {
  if (!meta) return "unknown";
  const target = meta.target;
  if (typeof target === "string") return target;
  if (Array.isArray(target)) return target.join("+");
  if (typeof meta.constraint === "string") return meta.constraint;
  return "unknown";
}

/**
 * Is this unique violation the one that means "already delivered"?
 *
 * ONLY this table's (organization, business date, version, recipient) key
 * means that. Treating EVERY P2002 as "already delivered" was wrong and
 * silently harmful: a unique violation raised by the `Notification` insert —
 * a primary-key collision, or any constraint a later release adds there —
 * would be read as "this person was already told", the recipient would be
 * skipped for ever, and nothing would be recorded. That is the same
 * permanent, silent loss the single transaction exists to prevent, arriving
 * through the error path instead.
 *
 * FAIL CLOSED. A conflict this function cannot positively identify is NOT
 * "already delivered"; the caller treats it as a retryable failure. The cost
 * of being wrong in that direction is a repeated attempt that the unique
 * index rejects anyway — never a duplicate notification, and never a
 * recipient dropped in silence.
 */
function isLedgerIdempotencyConflict(err: unknown): boolean {
  const e = err as { code?: unknown; meta?: unknown } | null;
  if (!e || e.code !== "P2002") return false;
  const meta = (e.meta ?? null) as Record<string, unknown> | null;
  if (!meta) return false;
  // When Prisma names the model, it has to be this one.
  if (typeof meta.modelName === "string" && meta.modelName !== LEDGER_MODEL) return false;
  for (const candidate of [meta.target, meta.constraint]) {
    if (typeof candidate === "string" && candidate === LEDGER_UNIQUE_INDEX) return true;
    if (!Array.isArray(candidate)) continue;
    const names = candidate.filter((x): x is string => typeof x === "string");
    if (names.length !== candidate.length) continue;
    if (names.length === 1 && names[0] === LEDGER_UNIQUE_INDEX) return true;
    const sorted = [...names].sort();
    if (
      sorted.length === LEDGER_UNIQUE_FIELDS.length &&
      sorted.every((n, i) => n === LEDGER_UNIQUE_FIELDS[i])
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Why a delivery failed, as a short machine token for the log.
 *
 * Schema identifiers and Prisma error codes only — never a recipient, an
 * organization or a message.
 */
function failureReason(err: unknown): string {
  const e = err as { code?: unknown; meta?: unknown; message?: unknown } | null;
  if (e?.code === "P2002") {
    return `UNIQUE_CONFLICT_ELSEWHERE:${describeConflict((e.meta ?? null) as Record<string, unknown> | null)}`;
  }
  if (typeof e?.code === "string" && e.code !== "") return `ERROR:${e.code}`;
  return "ERROR";
}

export type DeliveryOutcome =
  /**
   * Durable. `sideEffectFailed` says the logger line, the real-time push or
   * the usage record did not get through — reported separately BECAUSE the
   * delivery itself still happened. Downgrading it to FAILED would make a
   * later pass retry a recipient who was already told, and the only thing
   * standing between that and a duplicate announcement would be the unique
   * index refusing the retry.
   */
  | { kind: "SENT"; notificationId: string | null; sideEffectFailed: boolean }
  | { kind: "ALREADY" }
  | { kind: "FAILED"; reason: string };

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
 * back would tell a client about a notification that does not exist.
 *
 * It never throws, and it is called from OUTSIDE the try that decides the
 * outcome, so there is no path by which a failed push can turn a delivery
 * that is already on disk into FAILED. The failure is not swallowed either:
 * it is logged on its own line and returned, so the caller can report it
 * separately from the delivery's own verdict.
 *
 * @returns the error, or null when every side effect got through.
 */
function afterCommit(row: Record<string, unknown>, organizationId: string): Error | null {
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
    // Resolved explicitly: an unhandled rejection from a metering call must
    // not reach the worker's process, and must not escape this report either.
    void Promise.resolve(
      recordUsage(organizationId, "notifications_created", 1, notification.userId),
    ).catch((err: unknown) => {
      logger.error("[executive.delivery] usage metering failed AFTER a durable delivery.", {
        organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return null;
  } catch (err) {
    // Reported, never fatal: the delivery is already on disk.
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("[executive.delivery] a side effect failed AFTER a durable delivery.", {
      organizationId,
      error: error.message,
    });
    return error;
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
  /**
   * The committed result, or null if the transaction never got there. It is
   * assigned INSIDE the try and used OUTSIDE it, so the side effects run on
   * a path where nothing they do can change the outcome.
   */
  let committed: { notificationId: string; row: Record<string, unknown> } | null = null;
  try {
    committed = await client.$transaction(async tx => {
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
      return { notificationId: id, row: notification as Record<string, unknown> };
    });
  } catch (err) {
    // ONLY this table's idempotency key means "already delivered". Every
    // other conflict — including a unique violation raised by the
    // `Notification` insert — is a retryable failure, because nothing was
    // recorded and nobody was told.
    if (isLedgerIdempotencyConflict(err)) return { kind: "ALREADY" };
    return { kind: "FAILED", reason: failureReason(err) };
  }

  // OUTSIDE the try, deliberately. Both rows are on disk; from here on the
  // only question is whether the side effects got through, and the answer to
  // that can never turn this into FAILED.
  const sideEffect = afterCommit(committed.row, record.organizationId);
  return {
    kind: "SENT",
    notificationId: committed.notificationId,
    sideEffectFailed: sideEffect !== null,
  };
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
