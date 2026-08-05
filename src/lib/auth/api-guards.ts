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
import { resolveBrainOwner } from "@/lib/storage/brain-owner";
import type { BrainOwner } from "@/lib/storage/types";

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

export type WritableOwnerGate =
  | { ok: true; owner: BrainOwner }
  | { ok: false; response: NextResponse };

/**
 * PHASE 90B — resolves a WRITE-CAPABLE Brain owner, or a fail-closed response.
 * A write may only ever be attributed to a single, unambiguous tenant, so this
 * refuses — BEFORE any create/update/audit — the two cases that would otherwise
 * produce an unattributed or misattributed row:
 *
 *   - null owner (context unavailable) => 503 { code: OWNER_CONTEXT_UNAVAILABLE }
 *   - ambiguous (>1 active org, none selected) => 409 { code: ACTIVE_ORGANIZATION_REQUIRED }
 *
 * The body carries only a stable machine code and a generic message — no
 * internal detail (membership list, org ids, error text) is disclosed. Callers
 * still run their own auth gate first; this resolves the write scope, and the
 * owner-scope layer independently throws if a create is ever attempted without
 * a writable owner (defence in depth).
 */
export async function requireWritableOwner(): Promise<WritableOwnerGate> {
  const owner = await resolveBrainOwner();
  if (!owner) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Owner context is temporarily unavailable.", code: "OWNER_CONTEXT_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  if (owner.ambiguous) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "An active organization must be selected.", code: "ACTIVE_ORGANIZATION_REQUIRED" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  return { ok: true, owner };
}
