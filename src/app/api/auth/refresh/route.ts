import { NextResponse, type NextRequest } from "next/server";
import { rotateRefreshToken } from "@/lib/auth/token-session";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} from "@/lib/auth/config";
import { resolveRequestId } from "@/lib/logger/correlation";
import { logInfraFailure } from "@/lib/logger/security-events";
import { recordSecurityEvent } from "@/lib/observability/security-monitor";
import { incCounter } from "@/lib/observability/metrics";
import { recordAuditEvent } from "@/lib/audit/audit-service";

/**
 * POST /api/auth/refresh — rotate the refresh token atomically.
 *
 * PHASE 91 — claim-old and create-successor happen inside one transaction in
 * rotateRefreshToken, which returns the freshly signed access token, the new
 * refresh token, and the successor `sid`. This route no longer issues tokens in
 * a second, non-atomic step. Persistence/DB failures fail closed (503) WITHOUT
 * clearing the still-valid refresh cookie (rotation rolled back — State A).
 *
 * PHASE 92 — observability. This route previously emitted no correlation id,
 * no security event and no audit row, so a refresh-token REPLAY (the highest
 * -signal auth event we have) was invisible to an operator. It now:
 *   - resolves/echoes a correlation id (X-Request-ID) on every response;
 *   - records a taxonomy security event for replay/expiry/invalid outcomes
 *     (a `revoked` rotation is a single-use replay signal — critical);
 *   - writes a correlated audit row on success;
 *   - increments the session-operation counters.
 * All observability calls are fail-safe and never change the HTTP contract.
 */
export async function POST(req: NextRequest) {
  const reqId = resolveRequestId(req);
  const plainToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!plainToken) {
    recordSecurityEvent({ event: "session_invalid", correlationId: reqId, operation: "auth.refresh", reason: "no_refresh_cookie", outcome: "failed" });
    return NextResponse.json({ error: "No refresh token" }, { status: 401, headers: { "X-Request-ID": reqId } });
  }

  const result = await rotateRefreshToken(plainToken);

  if (!result.ok) {
    if (result.error === "db-unavailable" || result.error === "persist-failed") {
      // Transaction did not commit — the old refresh token is still valid
      // server-side. Do NOT clear it; the client may retry.
      logInfraFailure("database", "auth.refresh", new Error(`rotation ${result.error}`), reqId);
      return NextResponse.json(
        { error: "SESSION_PERSISTENCE_UNAVAILABLE" },
        { status: 503, headers: { "X-Request-ID": reqId } },
      );
    }
    // invalid / expired / revoked — the refresh token is genuinely dead.
    // A `revoked` outcome during rotation means the single-use token was already
    // claimed: a replay/reuse of a rotated refresh token — the strongest signal.
    if (result.error === "revoked") {
      recordSecurityEvent({ event: "refresh_replay", correlationId: reqId, operation: "auth.refresh", reason: "reused_refresh_token", outcome: "denied" });
    } else if (result.error === "expired") {
      recordSecurityEvent({ event: "session_expired", correlationId: reqId, operation: "auth.refresh", reason: "expired", outcome: "failed" });
    } else {
      recordSecurityEvent({ event: "session_invalid", correlationId: reqId, operation: "auth.refresh", reason: "invalid", outcome: "failed" });
    }
    const res = NextResponse.json(
      { error: result.error === "expired" ? "Session expired" : "Invalid session" },
      { status: 401, headers: { "X-Request-ID": reqId } },
    );
    res.cookies.set(REFRESH_TOKEN_COOKIE, "", { maxAge: 0, path: "/api/auth/refresh" });
    return res;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json(
    {
      ok: true,
      user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role },
    },
    { headers: { "X-Request-ID": reqId } },
  );

  response.cookies.set(ACCESS_TOKEN_COOKIE, result.accessToken, {
    httpOnly: true, sameSite: "strict", path: "/", secure: isProduction, maxAge: ACCESS_TOKEN_TTL,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, result.refreshToken, {
    httpOnly: true, sameSite: "strict", path: "/api/auth/refresh", secure: isProduction, maxAge: REFRESH_TOKEN_TTL,
  });

  // Successful rotation: a new successor session was issued. Correlated audit +
  // operational counter (identity is server-derived from the rotation result).
  incCounter("session_operations_total", { operation: "rotated" });
  void recordAuditEvent({
    userId: result.user.id,
    action: "auth.refresh",
    entityType: "session",
    entityId: result.sid,
    outcome: "success",
    correlationId: reqId,
  });

  return response;
}
