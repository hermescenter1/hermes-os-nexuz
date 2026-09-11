/**
 * PHASE 109-C-UI.2-R8 — who may drive the metering worker.
 *
 * The same two-key shape `/api/metrics` already uses, and deliberately not a
 * new one: a constant-time bearer token configured ONLY in the environment, or
 * a platform admin session. Neither is ever derived from the request.
 *
 * The token is read from `METERING_WORKER_TOKEN`, falling back to
 * `METRICS_TOKEN`. The fallback is not laziness — it means an operator who has
 * already configured a scraper token gets a working worker without a second
 * secret to distribute, while a deployment that wants the worker on its own
 * credential can set the dedicated variable and the scraper token stops opening
 * this door.
 *
 * With NEITHER configured and no admin session, every entrypoint answers 401.
 * It never falls open — a worker trigger that anyone could call is a way to
 * make someone else's billing rows appear on demand.
 */

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

function tokenMatches(req: NextRequest): boolean {
  const expected = process.env.METERING_WORKER_TOKEN ?? process.env.METRICS_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(expected);
  // Length is compared first because timingSafeEqual throws on a mismatch; the
  // length of a secret is not the secret.
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type WorkerAuthResult = { ok: true } | { ok: false; status: 401 | 403; error: string };

export async function authorizeWorkerRequest(req: NextRequest): Promise<WorkerAuthResult> {
  if (tokenMatches(req)) return { ok: true };
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  if (!can(user.role, "admin")) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true };
}
