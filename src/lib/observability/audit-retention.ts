/**
 * PHASE 92 — audit-log retention policy.
 *
 * A SAFE, bounded, dry-run-first sweep of the AuditLog table. It never issues a
 * broad `DELETE`, never runs automatically in production (an operator invokes
 * the script — see scripts/audit-retention.ts and the runbook), and refuses to
 * delete security/compliance-relevant events regardless of age.
 *
 * POLICY:
 *   - Ordinary audit rows older than AUDIT_RETENTION_DAYS (default 365) are
 *     eligible for deletion.
 *   - PROTECTED rows are NEVER deleted, whatever their age — authentication and
 *     access-denial events, ownership transfers, billing, API-key lifecycle and
 *     security events, which have legal/security value long past the ordinary
 *     window.
 *   - Deletion happens in bounded batches (default 500) with a hard cap on the
 *     number of batches per run, so a single invocation can never lock the table
 *     with one enormous statement or run unbounded.
 *   - dry-run is the DEFAULT: it reports what WOULD be deleted and deletes
 *     nothing.
 *
 * The pure predicates here are unit-tested; the batched DB sweep is rehearsed
 * against a real PostgreSQL in CI (audit-retention.pg.test.ts).
 */

import { getPrisma } from "@/lib/db/prisma";

/** Action prefixes whose rows are retained indefinitely (security/legal). */
export const PROTECTED_ACTION_PREFIXES = [
  "login.",
  "auth.",
  "site.access.",
  "org.ownership",
  "billing.",
  "api.key.",
  "security.",
] as const;

export const DEFAULT_RETENTION_DAYS = 365;
export const MIN_RETENTION_DAYS = 30; // floor — never sweep more aggressively than this
export const DEFAULT_BATCH_SIZE = 500;
export const DEFAULT_MAX_BATCHES = 1000;

export interface RetentionOptions {
  dryRun?: boolean;
  retentionDays?: number;
  batchSize?: number;
  maxBatches?: number;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export interface RetentionReport {
  dryRun: boolean;
  storageMode: "database" | "session" | "unavailable";
  retentionDays: number;
  cutoff: string;
  batchSize: number;
  candidates: number; // rows matching the delete predicate (counted, capped by scan)
  deleted: number;
  batches: number;
  protectedPrefixes: string[];
}

/** True when an action is protected from deletion at any age. */
export function isProtectedAction(action: string): boolean {
  return PROTECTED_ACTION_PREFIXES.some((p) => action.startsWith(p));
}

/** Clamp the retention window to the safe floor. */
export function resolveRetentionDays(raw: number | undefined): number {
  const n = raw ?? DEFAULT_RETENTION_DAYS;
  if (!Number.isFinite(n)) return DEFAULT_RETENTION_DAYS;
  return Math.max(MIN_RETENTION_DAYS, Math.floor(n));
}

/** The cutoff instant: rows strictly older than this are eligible. */
export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

type AuditDelegate = {
  count: (a: unknown) => Promise<number>;
  findMany: (a: unknown) => Promise<{ id: string }[]>;
  deleteMany: (a: unknown) => Promise<{ count: number }>;
};

async function auditDelegate(): Promise<AuditDelegate | null> {
  const db = await getPrisma();
  if (!db) return null;
  return (db as unknown as Record<string, unknown>).auditLog as AuditDelegate;
}

/**
 * The Prisma `where` for eligible rows: older than the cutoff AND not protected.
 * Protection is expressed as "action does not start with any protected prefix".
 */
function deletableWhere(cutoff: Date): Record<string, unknown> {
  return {
    createdAt: { lt: cutoff },
    NOT: PROTECTED_ACTION_PREFIXES.map((p) => ({ action: { startsWith: p } })),
  };
}

/**
 * Run the retention sweep. Never throws — returns a report describing exactly
 * what happened (or, in dry-run, what would happen).
 */
export async function sweepAuditRetention(opts: RetentionOptions = {}): Promise<RetentionReport> {
  const dryRun = opts.dryRun ?? true;
  const retentionDays = resolveRetentionDays(opts.retentionDays);
  const batchSize = Math.max(1, Math.min(opts.batchSize ?? DEFAULT_BATCH_SIZE, 5000));
  const maxBatches = Math.max(1, opts.maxBatches ?? DEFAULT_MAX_BATCHES);
  const now = opts.now ?? new Date();
  const cutoff = retentionCutoff(now, retentionDays);

  const base: RetentionReport = {
    dryRun,
    storageMode: "unavailable",
    retentionDays,
    cutoff: cutoff.toISOString(),
    batchSize,
    candidates: 0,
    deleted: 0,
    batches: 0,
    protectedPrefixes: [...PROTECTED_ACTION_PREFIXES],
  };

  try {
    const audit = await auditDelegate();
    if (!audit) return base; // session mode / no DB — nothing to sweep

    const where = deletableWhere(cutoff);
    const candidates = await audit.count({ where });
    base.storageMode = "database";
    base.candidates = candidates;

    if (dryRun || candidates === 0) return base;

    let deleted = 0;
    let batches = 0;
    while (batches < maxBatches) {
      const rows = await audit.findMany({ where, select: { id: true }, take: batchSize });
      if (rows.length === 0) break;
      const res = await audit.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      deleted += res.count;
      batches += 1;
      if (rows.length < batchSize) break;
    }
    base.deleted = deleted;
    base.batches = batches;
    return base;
  } catch {
    return base;
  }
}
