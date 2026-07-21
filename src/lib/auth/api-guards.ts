/**
 * Shared API route guards (Phase 82C).
 *
 * The same gate Phase 82A//82B inlined into /api/cases and /api/knowledge,
 * extracted so the legacy storage routes (unknown / analysis / memory /
 * projects) don't repeat it a dozen times. No new auth semantics — exactly
 * getCurrentUser() + can(role, "authoring"), the capability that gates every
 * studio/engineering surface consuming these APIs.
 */

import { NextResponse } from "next/server";
import { logAuthFailure, logAuthzDenial } from "@/lib/logger/security-events";
import { getCurrentUser, type CurrentUser } from "./session";
import { can } from "./roles";

export type AuthoringGate =
  | { ok: true; user: CurrentUser }
  | { ok: false; response: NextResponse };

/**
 * 401 without a session, 403 without the "authoring" capability.
 *
 * PHASE 90: both denial paths now emit a structured security event so refused
 * attempts are visible in the log stream. The event names the operation and the
 * reason — never the protected resource's contents.
 */
export async function requireAuthoring(operation = "authoring"): Promise<AuthoringGate> {
  const user = await getCurrentUser();
  if (!user) {
    logAuthFailure({ operation, reason: "no_session" });
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 }),
    };
  }
  if (!can(user.role, "authoring")) {
    logAuthzDenial({ operation, reason: "insufficient_role", userId: user.id, role: user.role });
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Insufficient permissions." }, { status: 403 }),
    };
  }
  return { ok: true, user };
}

/** True when the current session holds the "authoring" capability — for
 *  public GETs that stay 200 but return empty collections to everyone else. */
export async function hasAuthoring(): Promise<boolean> {
  const user = await getCurrentUser();
  return can(user?.role, "authoring");
}
