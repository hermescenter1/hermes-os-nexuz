import { NextResponse, type NextRequest } from "next/server";
import { authenticate }          from "@/lib/auth/service";
import { signSession }           from "@/lib/auth/crypto";
import { SESSION_COOKIE, isAuthConfigured, ACCESS_TOKEN_COOKIE, MAX_FAILED_ATTEMPTS, LOCK_DURATION } from "@/lib/auth/config";
import { getCurrentUser }        from "@/lib/auth/session";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";
import { signAccessToken }       from "@/lib/auth/jwt";
import { setAuthCookies, clearAuthCookies } from "@/lib/auth/token-session";
import { checkRateLimit, retryAfter }       from "@/lib/auth/rate-limiter";
import { getPrisma }             from "@/lib/db/prisma";
import { isRole }                from "@/lib/auth/roles";

/**
 * /api/auth — credentials login/logout + session check (Phase 12A / Phase 28).
 * Phase 28 additions: JWT access token, brute-force protection, remember-me.
 * Backward compat: existing /api/auth behavior preserved for legacy clients.
 */

async function updateLoginMeta(userId: string, failed: boolean): Promise<void> {
  const db = await getPrisma();
  if (!db) return;
  try {
    const userModel = (db as Record<string, unknown>).user as {
      update: (a: unknown) => Promise<unknown>;
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
    };
    if (failed) {
      const user = await userModel.findUnique({ where: { id: userId } });
      if (user) {
        const attempts = (user.failedLoginAttempts as number) + 1;
        const data: Record<string, unknown> = { failedLoginAttempts: attempts };
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          data.lockedUntil = new Date(Date.now() + LOCK_DURATION * 1000);
        }
        await userModel.update({ where: { id: userId }, data });
      }
    } else {
      await userModel.update({
        where: { id: userId },
        data:  { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
    }
  } catch { /* best-effort */ }
}

async function isAccountLocked(email: string): Promise<boolean> {
  const db = await getPrisma();
  if (!db) return false;
  try {
    const userModel = (db as Record<string, unknown>).user as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
    };
    const user = await userModel.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.lockedUntil) return false;
    return new Date(user.lockedUntil as string) > new Date();
  } catch { return false; }
}

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ authConfigured: isAuthConfigured(), user });
}

export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "auth-not-configured", authConfigured: false },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const action = String(body.action ?? "login");

  // ── Logout ────────────────────────────────────────────────────────────────
  if (action === "logout") {
    const user = await getCurrentUser();
    if (user) {
      await recordAuditEvent({
        userId:     user.id,
        action:     "auth.logout",
        entityType: "auth",
        entityId:   user.id,
        metadata:   { email: user.email },
      });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
    res.cookies.set(ACCESS_TOKEN_COOKIE, "", { maxAge: 0, path: "/" });
    res.cookies.set("hermes_rt", "", { maxAge: 0, path: "/api/auth/refresh" });
    return res;
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit("login", ip)) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later.",
        retryAfterSeconds: retryAfter("login", ip) },
      { status: 429 }
    );
  }

  const email      = String(body.email ?? "").trim();
  const password   = String(body.password ?? "");
  const rememberMe = Boolean(body.rememberMe ?? false);

  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  // Check account lock
  if (await isAccountLocked(email)) {
    return NextResponse.json(
      { error: "Account temporarily locked due to too many failed attempts. Please try again in 15 minutes." },
      { status: 423 }
    );
  }

  const user = await authenticate(email, password);

  if (!user) {
    // Best-effort: try to find userId for brute-force tracking
    const db = await getPrisma();
    if (db) {
      const um = (db as Record<string, unknown>).user as { findUnique: (a: unknown) => Promise<Record<string, unknown> | null> };
      const found = await um.findUnique({ where: { email: email.toLowerCase() } }).catch(() => null);
      if (found) await updateLoginMeta(String(found.id), true);
    }

    await recordAuditEvent({
      action:     AUDIT_ACTIONS.LOGIN_FAILURE,
      entityType: "auth",
      metadata:   { email },
    });
    return NextResponse.json({ error: "invalid-credentials" }, { status: 401 });
  }

  await updateLoginMeta(user.id, false);

  await recordAuditEvent({
    userId:     user.id,
    action:     AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityType: "auth",
    entityId:   user.id,
    metadata:   { email: user.email, role: user.role, rememberMe },
  });

  // Issue legacy HMAC session cookie (backward compat)
  const sessionToken = signSession({
    userId: user.id,
    email:  user.email,
    role:   user.role,
    name:   user.name,
    iat:    Date.now(),
  });

  // Issue JWT access token + refresh token (Phase 28)
  const accessToken = await signAccessToken({
    sub:   user.id,
    email: user.email,
    role:  isRole(user.role) ? user.role : "customer",
    name:  user.name,
  });

  const isProduction = process.env.NODE_ENV === "production";
  const sessionMaxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8;

  const res = NextResponse.json({ ok: true, user });

  // Legacy session cookie
  res.cookies.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path:     "/",
    secure:   isProduction,
    maxAge:   sessionMaxAge,
  });

  // JWT access token (Phase 28)
  res.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "strict",
    path:     "/",
    secure:   isProduction,
    maxAge:   60 * 60 * 8,
  });

  return res;
}
