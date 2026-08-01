import { NextResponse, type NextRequest } from "next/server";
import { rotateRefreshToken } from "@/lib/auth/token-session";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
} from "@/lib/auth/config";

/**
 * POST /api/auth/refresh — rotate the refresh token atomically.
 *
 * PHASE 91 — claim-old and create-successor happen inside one transaction in
 * rotateRefreshToken, which returns the freshly signed access token, the new
 * refresh token, and the successor `sid`. This route no longer issues tokens in
 * a second, non-atomic step. Persistence/DB failures fail closed (503) WITHOUT
 * clearing the still-valid refresh cookie (rotation rolled back — State A).
 */
export async function POST(req: NextRequest) {
  const plainToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!plainToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  const result = await rotateRefreshToken(plainToken);

  if (!result.ok) {
    if (result.error === "db-unavailable" || result.error === "persist-failed") {
      // Transaction did not commit — the old refresh token is still valid
      // server-side. Do NOT clear it; the client may retry.
      return NextResponse.json({ error: "SESSION_PERSISTENCE_UNAVAILABLE" }, { status: 503 });
    }
    // invalid / expired / revoked — the refresh token is genuinely dead.
    const res = NextResponse.json(
      { error: result.error === "expired" ? "Session expired" : "Invalid session" },
      { status: 401 },
    );
    res.cookies.set(REFRESH_TOKEN_COOKIE, "", { maxAge: 0, path: "/api/auth/refresh" });
    return res;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({
    ok: true,
    user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role },
  });

  response.cookies.set(ACCESS_TOKEN_COOKIE, result.accessToken, {
    httpOnly: true, sameSite: "strict", path: "/", secure: isProduction, maxAge: ACCESS_TOKEN_TTL,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, result.refreshToken, {
    httpOnly: true, sameSite: "strict", path: "/api/auth/refresh", secure: isProduction, maxAge: REFRESH_TOKEN_TTL,
  });

  return response;
}
