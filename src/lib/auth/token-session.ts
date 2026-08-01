/**
 * JWT-based session management (Phase 28).
 * Handles access token + refresh token issuance, verification, and rotation.
 * Server-side only.
 */

import { cookies, headers } from "next/headers";
import { getPrisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import {
  signAccessToken,
  verifyAccessToken,
  type AccessTokenPayload,
} from "./jwt";
import {
  generateRefreshToken,
  hashRefreshToken,
} from "./jwt-server";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  REFRESH_TOKEN_TTL_LONG,
} from "./config";
import { isPayloadSessionActive, revokeAllSessions } from "./session-store";
import type { Role } from "./roles";

export interface TokenUser {
  id:    string;
  email: string;
  role:  Role;
  name:  string;
}

// ── Issue tokens ─────────────────────────────────────────────────────────────

/**
 * Issue an access + refresh pair.
 *
 * PHASE 91 — the refresh-token row is created FIRST so its id can be embedded in
 * the access token as the opaque session id (`sid`). The access token therefore
 * always references a concrete, revocable server-side session record. `sid` is
 * null only when no database is configured (session mode), in which case the
 * access token is issued without one and behaves like a legacy (non-revocable)
 * token — acceptable because session mode has no persistence to revoke against.
 */
export async function issueTokens(
  user:       TokenUser,
  rememberMe: boolean,
  deviceInfo?: string | null,
  tokenVersion?: number,
): Promise<{ accessToken: string; refreshToken: string; sid: string | null }> {
  const refreshToken = generateRefreshToken();
  const tokenHash    = hashRefreshToken(refreshToken);
  const ttl          = rememberMe ? REFRESH_TOKEN_TTL_LONG : REFRESH_TOKEN_TTL;
  const expiresAt    = new Date(Date.now() + ttl * 1000);

  let sid: string | null = null;
  const db = await getPrisma();
  if (db) {
    try {
      const rtModel = (db as Record<string, unknown>).refreshToken as {
        create: (a: unknown) => Promise<Record<string, unknown>>;
      };
      // Stamp the session with the owner's current generation. On a rotation the
      // caller passes the version it authorized (so a session minted in the
      // revoke-vs-rotate window carries the OLD version and dies); on a fresh
      // login we read it (race-free — login is not rotating a revoked chain).
      let ver = tokenVersion;
      if (ver === undefined) {
        const um = (db as Record<string, unknown>).user as {
          findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
        };
        const u = await um.findUnique({ where: { id: user.id }, select: { tokenVersion: true } });
        ver = Number((u as { tokenVersion?: number } | null)?.tokenVersion ?? 0);
      }
      const row = await rtModel.create({
        data: { userId: user.id, tokenHash, expiresAt, deviceInfo: deviceInfo ?? null, userTokenVersion: ver },
      });
      sid = row && row.id != null ? String(row.id) : null;
    } catch (err) {
      logger.error("[token-session] refresh token persist error", { error: String(err) });
    }
  }

  const accessToken = await signAccessToken({
    sub:   user.id,
    email: user.email,
    role:  user.role,
    name:  user.name,
    sid:   sid ?? undefined,
  });

  return { accessToken, refreshToken, sid };
}

/** Best-effort User-Agent capture for the session inventory. Never throws. */
async function currentDeviceInfo(): Promise<string | null> {
  try {
    const h = await headers();
    const ua = h.get("user-agent");
    return ua ? ua.slice(0, 256) : null;
  } catch {
    return null;
  }
}

// ── Set cookies ──────────────────────────────────────────────────────────────

export async function setAuthCookies(
  user:       TokenUser,
  rememberMe: boolean
): Promise<void> {
  const { accessToken, refreshToken } = await issueTokens(user, rememberMe, await currentDeviceInfo());
  const store = await cookies();

  const isProduction = process.env.NODE_ENV === "production";
  const rtTtl        = rememberMe ? REFRESH_TOKEN_TTL_LONG : REFRESH_TOKEN_TTL;

  store.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "strict",
    path:     "/",
    secure:   isProduction,
    maxAge:   ACCESS_TOKEN_TTL,
  });

  store.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "strict",
    path:     "/api/auth/refresh",
    secure:   isProduction,
    maxAge:   rtTtl,
  });
}

// ── Clear cookies ─────────────────────────────────────────────────────────────

export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_TOKEN_COOKIE,  "", { maxAge: 0, path: "/" });
  store.set(REFRESH_TOKEN_COOKIE, "", { maxAge: 0, path: "/api/auth/refresh" });
}

// ── Read current user from access token ──────────────────────────────────────

export async function getTokenUser(): Promise<TokenUser | null> {
  const store = await cookies();
  const token = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  // PHASE 91 — enforce session revocation on the access-token identity path too
  // (getCurrentUserUnified → getTokenUser is the gate on /api/candidate/* and any
  // caller that resolves identity without going through requireOrgActor). Legacy
  // tokens without a sid are unaffected.
  if (!(await isPayloadSessionActive(payload))) return null;

  return {
    id:    payload.sub,
    email: payload.email,
    role:  payload.role,
    name:  payload.name,
  };
}

// ── Rotate refresh token ──────────────────────────────────────────────────────

export type RefreshResult =
  | { ok: true; user: TokenUser; tokenVersion: number }
  | { ok: false; error: "invalid" | "expired" | "revoked" | "db-unavailable" };

export async function rotateRefreshToken(plainToken: string): Promise<RefreshResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  try {
    const tokenHash = hashRefreshToken(plainToken);

    const rtModel = (db as Record<string, unknown>).refreshToken as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
      update:     (a: unknown) => Promise<unknown>;
      updateMany: (a: unknown) => Promise<{ count: number }>;
      create:     (a: unknown) => Promise<unknown>;
    };
    const userModel = (db as Record<string, unknown>).user as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
    };

    const rt = await rtModel.findUnique({
      where: { tokenHash },
    });

    if (!rt)                               return { ok: false, error: "invalid" };
    if (rt.revokedAt)                      return { ok: false, error: "revoked" };
    if (new Date(rt.expiresAt as string) < new Date()) return { ok: false, error: "expired" };

    const user = await userModel.findUnique({ where: { id: String(rt.userId) } });
    if (!user) return { ok: false, error: "invalid" };

    // PHASE 91 — generation gate. If a "revoke all sessions" (password reset,
    // suspend, remove) bumped the owner's tokenVersion after this chain was
    // minted, refuse to rotate. Together with stamping the freshly issued row
    // with this same authorized version, this closes the revoke-vs-rotate window:
    // a refresh that slips past the bulk revoke still cannot outrun the version.
    const userVer = Number((user as { tokenVersion?: number }).tokenVersion ?? 0);
    const rowVer  = Number((rt as { userTokenVersion?: number }).userTokenVersion ?? 0);
    if (rowVer !== userVer) return { ok: false, error: "revoked" };

    // PHASE 91 — atomic single-use claim. Two requests replaying the SAME refresh
    // token both pass the read above (revokedAt is still null), but only the first
    // conditional update flips revokedAt and observes count === 1; the loser sees
    // count === 0 and is rejected as a replay. Without this the old code did an
    // unconditional update, so concurrent replays could each mint a fresh token
    // family. This is the rotation-replay defence.
    const claim = await rtModel.updateMany({
      where: { tokenHash, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
    if (!claim || claim.count !== 1) return { ok: false, error: "revoked" };

    const tokenUser: TokenUser = {
      id:    String(user.id),
      email: String(user.email),
      role:  String(user.role) as Role,
      name:  String(user.name),
    };

    return { ok: true, user: tokenUser, tokenVersion: userVer };
  } catch (err) {
    logger.error("[token-session] rotate error", { error: String(err) });
    return { ok: false, error: "db-unavailable" };
  }
}

// ── Revoke all tokens for user ────────────────────────────────────────────────

/**
 * Backward-compatible alias for the canonical race-proof kill switch. Delegates
 * to revokeAllSessions so callers get the tokenVersion bump for free.
 */
export async function revokeAllTokens(userId: string): Promise<void> {
  await revokeAllSessions(userId);
}

// ── Unified getCurrentUser (checks JWT first, then legacy HMAC session) ───────

import { getCurrentUser as getLegacyUser } from "./session";

export async function getCurrentUserUnified(): Promise<TokenUser | null> {
  const tokenUser = await getTokenUser();
  if (tokenUser) return tokenUser;

  const legacy = await getLegacyUser();
  if (legacy) return legacy;

  return null;
}

// re-export type AccessTokenPayload for callers that need it
export type { AccessTokenPayload };
