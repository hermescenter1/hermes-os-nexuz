/**
 * ATS-S1 — who may trigger a review pass.
 *
 * Mirrors `src/lib/industrial/metering-worker-auth.ts`: a bearer token from
 * ATS_REVIEW_WORKER_TOKEN (compared in constant time) for the scheduled
 * process, or a signed-in platform administrator for a manual pass. Nothing
 * else. The trigger is not tenant-scoped — a pass delivers every due row of
 * every organization, each under its own organizationId predicate.
 */

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { ENV } from "../policy";

function tokenMatches(req: NextRequest): boolean {
  const expected = process.env[ENV.REVIEW_WORKER_TOKEN];
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type ReviewWorkerAuth = { ok: true } | { ok: false; status: 401 | 403; error: string };

export async function authorizeReviewWorker(req: NextRequest): Promise<ReviewWorkerAuth> {
  if (tokenMatches(req)) return { ok: true };
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  if (!can(user.role, "admin")) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true };
}
