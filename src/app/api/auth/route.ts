import { NextResponse, type NextRequest } from "next/server";
import { authenticate }          from "@/lib/auth/service";
import { signSession }           from "@/lib/auth/crypto";
import { SESSION_COOKIE, isAuthConfigured, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, REFRESH_TOKEN_TTL, REFRESH_TOKEN_TTL_LONG, MAX_FAILED_ATTEMPTS, LOCK_DURATION } from "@/lib/auth/config";
import { getCurrentUser }        from "@/lib/auth/session";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/audit/audit-service";
import { verifyAccessToken }     from "@/lib/auth/jwt";
import { issueTokens }           from "@/lib/auth/token-session";
import { revokeSession }         from "@/lib/auth/session-store";
import { hashArgon2, verifyArgon2 } from "@/lib/auth/argon2-wrapper";
import { checkRateLimit, retryAfter }       from "@/lib/auth/rate-limiter";
import { getPrisma }             from "@/lib/db/prisma";
import { isRole }                from "@/lib/auth/roles";
import { systemEmitter }         from "@/lib/events/system/emitter";

/**
 * PHASE 91 — constant-work password check for non-existent accounts.
 *
 * `authenticate()` only runs the (deliberately expensive) argon2 verify when the
 * email maps to a real user, so an unknown email returns measurably faster — a
 * timing oracle for account enumeration. When the account does not exist we burn
 * an equivalent argon2 verify against a fixed dummy hash so both paths cost the
 * same. The dummy hash is computed once and cached.
 */
let _dummyHash: string | null = null;
async function burnPasswordVerifyTime(password: string): Promise<void> {
  try {
    if (!_dummyHash) _dummyHash = await hashArgon2("hermes-enumeration-timing-guard");
    await verifyArgon2(_dummyHash, password);
  } catch { /* best-effort — never affects the response */ }
}

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
    // PHASE 91 — truly revoke the session server-side, not just clear the cookie.
    // Before this, a captured refresh token stayed valid after logout because the
    // row was never revoked. Revoke the session referenced by this request's
    // access token so the credential dies on the next protected request too.
    const at      = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
    const payload = at ? await verifyAccessToken(at) : null;
    if (payload?.sub && payload.sid) {
      await revokeSession(payload.sub, payload.sid);
    }

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
    res.cookies.set(REFRESH_TOKEN_COOKIE, "", { maxAge: 0, path: "/api/auth/refresh" });
    return res;
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!await checkRateLimit("login", ip)) {
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
      if (found) {
        await updateLoginMeta(String(found.id), true);
        systemEmitter.dispatch({ type: "login.failed", userId: String(found.id), email, ip });
      } else {
        // Unknown account: spend the same argon2 work a wrong-password attempt on
        // a real account would, so the two are indistinguishable by response time.
        await burnPasswordVerifyTime(password);
      }
    }

    await recordAuditEvent({
      action:     AUDIT_ACTIONS.LOGIN_FAILURE,
      entityType: "auth",
      metadata:   { email },
    });
    return NextResponse.json({ error: "invalid-credentials" }, { status: 401 });
  }

  await updateLoginMeta(user.id, false);

  systemEmitter.dispatch({ type: "login.success", userId: user.id, email: user.email, name: user.name, ip });

  await recordAuditEvent({
    userId:     user.id,
    action:     AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityType: "auth",
    entityId:   user.id,
    metadata:   { email: user.email, role: user.role, rememberMe },
  });

  // PHASE 91 — issue an access + refresh pair through the shared path so a
  // server-authoritative, revocable session record is created and its opaque id
  // (`sid`) is embedded in BOTH the access token and the legacy session cookie.
  // Before this, the primary login issued only a non-revocable 8h access token
  // and a 30d HMAC cookie with no server session behind them.
  const deviceInfo = req.headers.get("user-agent")?.slice(0, 256) ?? null;
  const { accessToken, refreshToken, sid } = await issueTokens(
    { id: user.id, email: user.email, role: isRole(user.role) ? user.role : "customer", name: user.name },
    rememberMe,
    deviceInfo,
  );

  // Legacy HMAC session cookie (backward compat), now bound to the same session.
  const sessionToken = signSession({
    userId: user.id,
    email:  user.email,
    role:   user.role,
    name:   user.name,
    iat:    Date.now(),
    sid:    sid ?? undefined,
  });

  const isProduction  = process.env.NODE_ENV === "production";
  const sessionMaxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
  const refreshMaxAge = rememberMe ? REFRESH_TOKEN_TTL_LONG : REFRESH_TOKEN_TTL;

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

  // Refresh token (Phase 91 — now also issued on the primary login path so the
  // session can be rotated and revoked). Scoped to the refresh endpoint only.
  res.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "strict",
    path:     "/api/auth/refresh",
    secure:   isProduction,
    maxAge:   refreshMaxAge,
  });

  return res;
}
