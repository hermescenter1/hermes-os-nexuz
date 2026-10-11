/**
 * Transaction plumbing for the Digital Twin services — Slice 1.
 *
 * The repository's Prisma accessor is deliberately loosely typed (it never
 * imports the generated client statically), so the services describe the few
 * model methods they use structurally, as the rest of the codebase does.
 *
 * Every mutation runs as: validate ownership → write → write the audit row, all
 * on ONE transaction client. An audit failure rolls the mutation back; a
 * rejected mutation commits nothing, audit included.
 *
 * AUDIT PUBLICATION. The audit ROW is written inside the transaction, but the
 * in-process audit buffer — which the audit readers fall back to when the database
 * cannot be read — is only appended to AFTER the transaction has committed. A
 * rolled-back mutation therefore leaves no row AND no buffered "success" event.
 * Publication is best-effort and never throws: the database commit is the
 * authority, and a buffer fault must not turn a committed mutation into an error.
 */

import { getPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import {
  persistAuditEventInTx,
  publishAuditEvent,
  type AuditEvent,
} from "@/lib/audit/audit-service";

export type Row = Record<string, unknown>;

export interface TwinModel {
  findMany:  (a: unknown) => Promise<Row[]>;
  findFirst: (a: unknown) => Promise<Row | null>;
  create:    (a: unknown) => Promise<Row>;
  update:    (a: unknown) => Promise<Row>;
  count:     (a: unknown) => Promise<number>;
}

export interface TwinTx {
  digitalTwinNode:     TwinModel;
  digitalTwinRelation: TwinModel;
  digitalTwinLayout:   TwinModel;
  assetTag:            TwinModel;
  industrialSite:      TwinModel;
  industrialAsset:     TwinModel;
  /**
   * Used ONLY for `pg_advisory_xact_lock`, which returns `void`. `$queryRaw` cannot
   * deserialise a `void` column through the pg driver adapter ("Failed to
   * deserialize column of type 'void'"), so the lock must go through `$executeRaw`,
   * which returns a row count and reads no column.
   */
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
}

interface TxHost {
  $transaction: <T>(
    fn: (tx: TwinTx) => Promise<T>,
    opts?: { maxWait?: number; timeout?: number },
  ) => Promise<T>;
}

/**
 * Audit events persisted on a live transaction, waiting for it to commit.
 * Keyed by the transaction client, which Prisma creates fresh per `$transaction`.
 */
const pendingAudit = new WeakMap<object, AuditEvent[]>();

/** `null` means "no database" (the same convention every twin service already used). */
export async function runTwinTransaction<T>(fn: (tx: TwinTx) => Promise<T>): Promise<T | null> {
  const prisma = await getPrisma();
  if (!prisma) return null;

  let committedEvents: AuditEvent[] = [];
  const result = await (prisma as unknown as TxHost).$transaction(
    async (tx) => {
      const pending: AuditEvent[] = [];
      pendingAudit.set(tx, pending);
      const out = await fn(tx);
      committedEvents = pending;
      return out;
    },
    { maxWait: 5000, timeout: 15000 },
  );

  // Reached ONLY if the transaction committed: a throw above (rollback, commit
  // failure, timeout) skips this call, so nothing is ever published for it.
  // The COMMIT is authoritative: from here on nothing may turn the already
  // committed mutation into a failure, so publication cannot throw.
  publishCommittedEventsBestEffort(committedEvents);
  return result;
}

/** Fixed code logged when a post-commit buffer publication fails. No payload, ever. */
export const POST_COMMIT_PUBLISH_FAILED_CODE = "DIGITAL_TWIN_POST_COMMIT_AUDIT_BUFFER_PUBLISH_FAILED";

/**
 * Publishes already-committed audit events to the in-process buffer, in order.
 *
 * DATABASE_COMMIT_IS_AUTHORITATIVE. The audit ROW is durable and the buffer is
 * only a fallback read path, so a publication failure (a frozen or replaced
 * buffer, a logger fault) must never reach the caller: the client would see a
 * failure for a mutation that is in fact committed and would retry it into a
 * duplicate. Each event is isolated so one failure does not drop the later ones.
 * This function never throws.
 */
function publishCommittedEventsBestEffort(events: readonly AuditEvent[]): void {
  for (const event of events) {
    try {
      publishAuditEvent(event);
    } catch {
      reportPublishFailure();
    }
  }
}

/**
 * Reports a failed publication with a fixed code and NO metadata: the event,
 * its payload and the caught error are deliberately not logged. A logger that
 * itself throws is swallowed — there is no further safe channel to report on.
 */
function reportPublishFailure(): void {
  try {
    logger.error(POST_COMMIT_PUBLISH_FAILED_CODE);
  } catch {
    /* nothing safer to fall back to: the committed result must still be returned */
  }
}

export interface TwinAuditInput {
  organizationId: string;
  userId:         string | null;
  action:         string;
  entityId:       string;
  siteId?:        string | null;
  /** Field NAMES and identifiers only — never submitted values. */
  details?:       Record<string, unknown>;
}

/**
 * The audit row, written on the mutation's own transaction. Throws on failure
 * (and therefore rolls the mutation back) — a twin change with no trail is not a
 * successful change. The event is queued for publication after COMMIT.
 */
export async function auditInTx(tx: TwinTx, input: TwinAuditInput): Promise<void> {
  const event = await persistAuditEventInTx(
    {
      userId:         input.userId,
      action:         input.action,
      entityType:     "digital_twin",
      entityId:       input.entityId,
      organizationId: input.organizationId,
      outcome:        "success",
      metadata: {
        organizationId: input.organizationId,
        ...(input.siteId ? { siteId: input.siteId } : {}),
        ...(input.details ?? {}),
      },
    },
    tx,
  );
  pendingAudit.get(tx)?.push(event);
}
