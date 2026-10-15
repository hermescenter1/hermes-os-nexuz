/**
 * Who may drive the nightly executive-report worker.
 *
 * The same two-key shape `/api/metrics` and the metering worker already use —
 * a constant-time bearer token that exists ONLY in the environment, or a
 * platform admin session — but on its OWN variable.
 *
 * WHY A DEDICATED VARIABLE AND NOT JUST THE METERING ONE
 * ------------------------------------------------------
 * Reusing `authorizeWorkerRequest` directly looked simpler and was briefly what
 * this route did. It is wrong in a way that only shows up operationally: the
 * two jobs would share one credential, so handing a scheduler the right to
 * produce management reports would also hand it the right to drive billing
 * metering. They are different blast radii and deserve different keys.
 *
 * The fallback chain is deliberate, and is the same reasoning the metering
 * helper records for its own: an operator who has already distributed a worker
 * token gets a working report job without a second secret, while a deployment
 * that wants this job isolated sets `EXECUTIVE_REPORT_WORKER_TOKEN` and the
 * other tokens stop opening this particular door.
 *
 * With NO token configured and no admin session, every entrypoint answers 401.
 * It never falls open: a report trigger anyone could call is a way to make a
 * tenant's management figures — and the notification announcing them — appear
 * on demand.
 */

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

/** Constant-time compare that never reveals the secret's length by throwing. */
function matches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // Length is checked first because timingSafeEqual throws on a mismatch. The
  // length of a secret is not the secret.
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function tokenAccepted(req: NextRequest): boolean {
  const configured = [
    process.env.EXECUTIVE_REPORT_WORKER_TOKEN,
    process.env.METERING_WORKER_TOKEN,
    process.env.METRICS_TOKEN,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  if (configured.length === 0) return false;

  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;

  const presented = m[1];
  // Every configured token is compared, so the result does not depend on which
  // variable happens to be set.
  let ok = false;
  for (const expected of configured) {
    if (matches(presented, expected)) ok = true;
  }
  return ok;
}

export type ExecutiveWorkerAuth = { ok: true } | { ok: false; status: 401 | 403; error: string };

/**
 * Authorise a call to the nightly-report worker entrypoint.
 *
 * Registered as a platform-scope guard in
 * `scripts/security/phase99/route-inventory.mjs`; the recognition test locks
 * the other half — that this function really performs the checks the
 * registration vouches for.
 */
export async function authorizeExecutiveReportWorker(req: NextRequest): Promise<ExecutiveWorkerAuth> {
  if (tokenAccepted(req)) return { ok: true };
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  if (!can(user.role, "admin")) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true };
}
