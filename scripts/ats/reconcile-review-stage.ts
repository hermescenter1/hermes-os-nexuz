#!/usr/bin/env tsx
/**
 * ATS review-visibility hotfix — the reconciliation runner.
 *
 * A thin CLI over `src/lib/ats/reconcile-review-stage.ts`, which holds the
 * logic and the tests. Written in TypeScript and run with `tsx` (the same
 * runner `npm run db:seed` uses) so it imports the real audit adapter instead
 * of re-implementing the audit shape in a loose .mjs.
 *
 *   npm run ats:reconcile:review-stage
 *       DRY RUN. Scans and prints what it WOULD do. Writes nothing.
 *
 *   npm run ats:reconcile:review-stage -- --organization <orgId>
 *   npm run ats:reconcile:review-stage -- --application <appId>
 *   npm run ats:reconcile:review-stage -- --limit 50 --json
 *
 *   npm run ats:reconcile:review-stage -- --commit --actor <userId> \
 *       --reason "incident 2026-10-05: review completed, stage not advanced"
 *       APPLIES the repair. `--actor` is mandatory, because
 *       `recruitment.application.status_transition` is a human action and the
 *       audit row must name the operator who authorised it.
 *
 * Environment: DATABASE_URL (required — without it the library returns
 * storeUnavailable and this exits 3 rather than pretending to have scanned).
 *
 * Exit codes: 0 nothing to do or repair complete · 1 some rows failed to write
 * · 2 bad invocation · 3 no store.
 *
 * It prints identifiers and statuses only: no candidate name, e-mail, phone or
 * résumé text ever reaches this output, which is likely to be pasted into an
 * incident record.
 */

import { reconcileReviewStage, type ReconcileReport } from "../../src/lib/ats/reconcile-review-stage";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1 || i === argv.length - 1) return undefined;
  const v = argv[i + 1];
  return v.startsWith("--") ? undefined : v;
};

function fail(message: string): never {
  console.error(`[ats-reconcile] ${message}`);
  process.exit(2);
}

const commit = flag("commit");
const actor = value("actor");
const asJson = flag("json");
const limitRaw = value("limit");
const limit = limitRaw === undefined ? undefined : Number(limitRaw);

if (limitRaw !== undefined && (!Number.isInteger(limit) || (limit as number) < 1)) {
  fail("--limit must be a positive integer");
}
if (commit && !actor) {
  fail("--commit requires --actor <userId>: this transition is recorded as a human action");
}
if (!commit && actor) {
  fail("--actor is only meaningful with --commit");
}

async function main(): Promise<void> {
  let report: ReconcileReport;
  try {
    report = await reconcileReviewStage({
      commit,
      actorUserId: actor ?? null,
      actorRole: value("role") ?? "OPERATOR",
      organizationId: value("organization"),
      applicationId: value("application"),
      limit,
      reason: value("reason"),
    });
  } catch (err) {
    console.error(`[ats-reconcile] refused: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  if (report.storeUnavailable) {
    console.error("[ats-reconcile] no database: set DATABASE_URL. Nothing was scanned.");
    process.exit(3);
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `[ats-reconcile] mode=${report.committed ? "COMMIT" : "DRY-RUN"} scanned=${report.scanned} ` +
        `eligible=${report.eligible} applied=${report.applied} skipped=${report.skipped}`,
    );
    for (const i of report.items) {
      const verdict = i.applied ? "APPLIED" : i.eligible ? "WOULD-APPLY" : `SKIP:${i.skipped}`;
      console.log(
        `  ${verdict} org=${i.organizationId} application=${i.applicationId ?? "-"} ` +
          `review=${i.reviewId} cycle=${i.cycle ?? "-"} from=${i.fromStatus ?? "-"}`,
      );
    }
    if (!report.committed && report.eligible > 0) {
      console.log("[ats-reconcile] DRY RUN — nothing was written. Re-run with --commit --actor <userId> to apply.");
    }
  }

  const writeFailures = report.items.filter((i) => i.skipped === "WRITE_FAILED").length;
  process.exit(writeFailures > 0 ? 1 : 0);
}

void main();
