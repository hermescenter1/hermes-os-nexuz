/**
 * GET  /api/auth/sessions — list the caller's own active sessions.
 * POST /api/auth/sessions — { action: "revoke-others", password } — reauth-gated
 *                           revocation of every session except the current one.
 *
 * PHASE 91. Owner-scoped: a caller only ever sees or affects their OWN sessions.
 * Sessions are surfaced by their opaque id (never the token hash) plus coarse
 * metadata. All identity is server-derived from the access token; nothing here
 * trusts a client-supplied user id.
 */

import { NextResponse, type NextRequest } from "next/server";
import { resolveRequestSession } from "@/lib/auth/request-session";
import { listUserSessions, revokeOtherSessions } from "@/lib/auth/session-store";
import { requireRecentAuth } from "@/lib/auth/reauth";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { resolveRequestId } from "@/lib/logger/correlation";

export async function GET(req: NextRequest) {
  const session = await resolveRequestSession(req);
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const sessions = await listUserSessions(session.userId, session.sid);
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

  // Destroying every other session is destructive — require a fresh password.
  const reauth = await requireRecentAuth(session.userId, body.password);
  if (!reauth.ok) return NextResponse.json({ error: reauth.code }, { status: reauth.status });

  const revoked = await revokeOtherSessions(session.userId, session.sid);

  await recordAuditEvent({
    userId:        session.userId,
    action:        "auth.sessions.revoke_others",
    entityType:    "session",
    entityId:      session.userId,
    outcome:       "success",
    correlationId: resolveRequestId(req),
    metadata:      { revoked },
  });

  return NextResponse.json({ ok: true, revoked });
}
