/**
 * PHASE 92 — audit-log retention operator CLI.
 *
 * DRY-RUN BY DEFAULT. Reports how many AuditLog rows are eligible for deletion
 * (older than the retention window AND not security/compliance-protected) and
 * deletes NOTHING unless `--apply` is passed. Deletion is bounded (batched, with
 * a batch cap) so it can never issue one enormous DELETE or run unbounded.
 *
 * This script is invoked MANUALLY by an operator (or a deliberately-scheduled
 * maintenance job the operator owns) — Phase 92 does NOT schedule it and does
 * NOT run it against production. See docs/phase92-observability-runbook.md.
 *
 * Usage:
 *   node scripts/audit-retention.mjs                 # dry-run, 365-day window
 *   node scripts/audit-retention.mjs --apply         # actually delete
 *   AUDIT_RETENTION_DAYS=730 node scripts/audit-retention.mjs
 *   node scripts/audit-retention.mjs --apply --batch 1000 --max-batches 50
 *
 * Never prints DATABASE_URL, credentials or row contents — only counts.
 *
 * The protected prefixes + defaults below MUST stay in sync with
 * src/lib/observability/audit-retention.ts (the app-side, unit-tested source of
 * truth). The PostgreSQL rehearsal (audit-retention.pg.test.ts) exercises the
 * same policy against a real database.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const PROTECTED_ACTION_PREFIXES = [
  "login.",
  "auth.",
  "site.access.",
  "org.ownership",
  "billing.",
  "api.key.",
  "security.",
];
const DEFAULT_RETENTION_DAYS = 365;
const MIN_RETENTION_DAYS = 30;
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_BATCHES = 1000;

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const APPLY = process.argv.includes("--apply");
const RETENTION_DAYS = Math.max(
  MIN_RETENTION_DAYS,
  Math.floor(Number(process.env.AUDIT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS)) || DEFAULT_RETENTION_DAYS,
);
const BATCH = Math.max(1, Math.min(Number(arg("--batch", DEFAULT_BATCH_SIZE)) || DEFAULT_BATCH_SIZE, 5000));
const MAX_BATCHES = Math.max(1, Number(arg("--max-batches", DEFAULT_MAX_BATCHES)) || DEFAULT_MAX_BATCHES);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(JSON.stringify({ result: "FAIL", reason: "DATABASE_URL not set" }));
  process.exit(2);
}

const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
const where = {
  createdAt: { lt: cutoff },
  NOT: PROTECTED_ACTION_PREFIXES.map((p) => ({ action: { startsWith: p } })),
};

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

async function main() {
  const candidates = await prisma.auditLog.count({ where });
  const report = {
    mode: APPLY ? "apply" : "dry-run",
    retentionDays: RETENTION_DAYS,
    cutoff: cutoff.toISOString(),
    batchSize: BATCH,
    candidates,
    deleted: 0,
    batches: 0,
    protectedPrefixes: PROTECTED_ACTION_PREFIXES,
  };

  if (APPLY && candidates > 0) {
    let deleted = 0;
    let batches = 0;
    while (batches < MAX_BATCHES) {
      const rows = await prisma.auditLog.findMany({ where, select: { id: true }, take: BATCH });
      if (rows.length === 0) break;
      const res = await prisma.auditLog.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      deleted += res.count;
      batches += 1;
      if (rows.length < BATCH) break;
    }
    report.deleted = deleted;
    report.batches = batches;
  }

  console.log(JSON.stringify({ result: "OK", ...report }, null, 2));
}

main()
  .catch((err) => {
    console.error(JSON.stringify({ result: "FAIL", reason: err instanceof Error ? err.message : String(err) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
