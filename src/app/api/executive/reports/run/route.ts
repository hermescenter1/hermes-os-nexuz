/**
 * POST /api/executive/reports/run — drive one nightly-report pass.
 *
 * This is the SCHEDULER'S entrypoint, not a user surface. It is gated by
 * `authorizeExecutiveReportWorker` — the same two-key shape the metering
 * worker and `/api/metrics` use (a constant-time bearer token that exists only
 * in the environment, or a platform admin session) but on its OWN variable,
 * `EXECUTIVE_REPORT_WORKER_TOKEN`.
 *
 * A dedicated credential rather than the metering one: sharing a key would
 * mean that handing a scheduler the right to produce management reports also
 * hands it the right to drive billing metering. With no token configured and
 * no admin session this answers 401 and never falls open — a report trigger
 * anybody could call is a way to make a tenant's figures, and the notification
 * announcing them, appear on demand.
 *
 * The pass itself is bounded, idempotent and leased; see
 * `src/lib/executive/report/worker.ts`. Calling this twice in a minute is safe
 * and cheap: the second call either loses the lease or finds every night
 * already reported.
 */

import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { securityError } from "@/lib/security/request-guards";
import { authorizeExecutiveReportWorker } from "@/lib/executive/report/auth";
import { runReportPass, DEFAULT_MAX_ORGANIZATIONS } from "@/lib/executive/report/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A ceiling the caller cannot raise, so one request cannot become a long job. */
const MAX_BATCH = 200;

/** The shape of an organization id as the cursor carries it. */
const ORGANIZATION_CURSOR = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(req: NextRequest) {
  const auth = await authorizeExecutiveReportWorker(req);
  if (!auth.ok) return securityError({ error: auth.error }, auth.status);

  const raw = new URL(req.url).searchParams.get("max");
  let max = DEFAULT_MAX_ORGANIZATIONS;
  if (raw !== null) {
    const parsed = Number(raw);
    // A present but unusable value is refused rather than silently defaulted:
    // an operator who asked for a batch size deserves to know it was ignored.
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_BATCH) {
      return securityError({ error: "INVALID_REQUEST" }, 400);
    }
    max = parsed;
  }

  // The cursor the runner got back from the previous pass. An organization id
  // is opaque here — only compared, never used to read anything on its own —
  // but it is still shape-checked so the query cannot receive arbitrary text.
  const after = new URL(req.url).searchParams.get("after");
  if (after !== null && !ORGANIZATION_CURSOR.test(after)) {
    return securityError({ error: "INVALID_REQUEST" }, 400);
  }

  try {
    const pass = await runReportPass({
      nowMs: Date.now(),
      // Opaque per-process identity. Never a hostname: a lease holder must not
      // become a way to enumerate infrastructure.
      holder: `exec-report-${randomUUID()}`,
      maxOrganizations: max,
      afterOrganizationId: after,
    });
    return securityError(pass as unknown as Record<string, unknown>, 200);
  } catch {
    return securityError({ error: "SERVICE_UNAVAILABLE" }, 503);
  }
}
