import { NextResponse, type NextRequest } from "next/server";
import { rotateRefreshToken, issueTokens } from "@/lib/auth/token-session";
import { setAuthCookies }                   from "@/lib/auth/token-session";
import { REFRESH_TOKEN_COOKIE }             from "@/lib/auth/config";

export async function POST(req: NextRequest) {
  const plainToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!plainToken) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }

  const result = await rotateRefreshToken(plainToken);

  if (!result.ok) {
    const res = NextResponse.json(
      { error: result.error === "expired" ? "Session expired" : "Invalid session" },
      { status: 401 }
    );
    // Clear stale cookies
    res.cookies.set(REFRESH_TOKEN_COOKIE, "", { maxAge: 0 });
    return res;
  }

  // Issue new tokens and set cookies
  const { accessToken, refreshToken } = await issueTokens(result.user, false);

  const response = NextResponse.json({ ok: true, user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role } });
  const isProduction = process.env.NODE_ENV === "production";

  response.cookies.set("hermes_at", accessToken, {
    httpOnly: true,
    sameSite: "strict",
    path:     "/",
    secure:   isProduction,
    maxAge:   60 * 60 * 8,
  });
  response.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "strict",
    path:     "/api/auth/refresh",
    secure:   isProduction,
    maxAge:   60 * 60 * 24 * 7,
  });

  return response;
}
