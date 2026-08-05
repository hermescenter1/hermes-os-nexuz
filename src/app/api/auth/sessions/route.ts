/**
 * GET  /api/auth/sessions — list the caller's own active sessions.
 * POST /api/auth/sessions — { action: "revoke-others", password } — reauth-gated,
 *                           atomic revocation of every session except the current.
 *
 * PHASE 91. Owner-scoped: a caller only ever sees or affects their OWN sessions.
 * Sessions are surfaced by their opaque id (never the token hash) plus coarse
 * metadata. All identity is server-derived from the access token; nothing here
 * trusts a client-supplied user id. The store-unavailable case is a 503, kept
 * distinct from a genuinely empty inventory.
 */

import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestSession } from "@/lib/auth/request-session";
import { listUserSessions, revokeAllOtherSessionsAtomically } from "@/lib/auth/session-store";
import { requireRecentAuth } from "@/lib/auth/reauth";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { resolveRequestId } from "@/lib/logger/correlation";

export async function GET(req: NextRequest) {
  const session = await resolveRequestSession(req);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const sessions = await listUserSessions(session.userId, session.sid);
  // PHASE 91 failure contract: null = store unavailable (503), [] = genuinely no
  // sessions (200). Never conflate the two, never leak a database message.
  if (sessions === null) {
    return NextResponse.json({ error: "SESSION_STORE_UNAVAILABLE" }, { status: 503 });
  }
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const session = await resolveRequestSession(req);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action !== "revoke-others") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  // Revoking every other device requires a real, sid-bound current session AND a
  // fresh password (destructive, privileged operation).
  if (!session.sid) {
    return NextResponse.json({ error: "SESSION_STORE_UNAVAILABLE" }, { status: 503 });
  }
  const reauth = await requireRecentAuth(session.userId, body.password);
  if (!reauth.ok) return NextResponse.json({ error: reauth.code }, { status: reauth.status });

  const result = await revokeAllOtherSessionsAtomically(session.userId, session.sid);
  if (!result.ok) {
    // kept_invalid → the caller's own session is no longer valid (re-authenticate);
    // unavailable → store down. Neither leaks internal detail.
    const status = result.error === "kept_invalid" ? 401 : 503;
    const code   = result.error === "kept_invalid" ? "SESSION_INVALID" : "SESSION_STORE_UNAVAILABLE";
    return NextResponse.json({ error: code }, { status });
  }

  await recordAuditEvent({
    userId:        session.userId,
    action:        "auth.sessions.revoke_others",
    entityType:    "session",
    entityId:      session.userId,
    outcome:       "success",
    correlationId: resolveRequestId(req),
    metadata:      { revoked: result.revoked, generation: result.generation },
  });

  return NextResponse.json({ ok: true, revoked: result.revoked });
}
