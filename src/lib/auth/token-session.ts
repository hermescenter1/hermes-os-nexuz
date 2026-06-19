/**
 * JWT-based session management (Phase 28).
 * Handles access token + refresh token issuance, verification, and rotation.
 * Server-side only.
 */

import { cookies } from "next/headers";
import { getPrisma } from "@/lib/db/prisma";
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
import type { Role } from "./roles";

export interface TokenUser {
  id:    string;
  email: string;
  role:  Role;
  name:  string;
}

// ── Issue tokens ─────────────────────────────────────────────────────────────

export async function issueTokens(
  user:       TokenUser,
  rememberMe: boolean
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await signAccessToken({
    sub:   user.id,
    email: user.email,
    role:  user.role,
    name:  user.name,
  });

  const refreshToken = generateRefreshToken();
  const tokenHash    = hashRefreshToken(refreshToken);
  const ttl          = rememberMe ? REFRESH_TOKEN_TTL_LONG : REFRESH_TOKEN_TTL;
  const expiresAt    = new Date(Date.now() + ttl * 1000);

  const db = await getPrisma();
  if (db) {
    try {
      const rtModel = (db as Record<string, unknown>).refreshToken as {
        create: (a: unknown) => Promise<unknown>;
      };
      await rtModel.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
    } catch (err) {
      console.error("[token-session] refresh token persist error:", err);
    }
  }

  return { accessToken, refreshToken };
}

// ── Set cookies ──────────────────────────────────────────────────────────────

export async function setAuthCookies(
  user:       TokenUser,
  rememberMe: boolean
): Promise<void> {
  const { accessToken, refreshToken } = await issueTokens(user, rememberMe);
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

  return {
    id:    payload.sub,
    email: payload.email,
    role:  payload.role,
    name:  payload.name,
  };
}

// ── Rotate refresh token ──────────────────────────────────────────────────────

export type RefreshResult =
  | { ok: true; user: TokenUser }
  | { ok: false; error: "invalid" | "expired" | "revoked" | "db-unavailable" };

export async function rotateRefreshToken(plainToken: string): Promise<RefreshResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  try {
    const tokenHash = hashRefreshToken(plainToken);

    const rtModel = (db as Record<string, unknown>).refreshToken as {
      findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
      update:     (a: unknown) => Promise<unknown>;
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

    // Revoke old token
    await rtModel.update({ where: { tokenHash }, data: { revokedAt: new Date() } });

    const tokenUser: TokenUser = {
      id:    String(user.id),
      email: String(user.email),
      role:  String(user.role) as Role,
      name:  String(user.name),
    };

    return { ok: true, user: tokenUser };
  } catch (err) {
    console.error("[token-session] rotate error:", err);
    return { ok: false, error: "db-unavailable" };
  }
}

// ── Revoke all tokens for user ────────────────────────────────────────────────

export async function revokeAllTokens(userId: string): Promise<void> {
  const db = await getPrisma();
  if (!db) return;
  try {
    const rtModel = (db as Record<string, unknown>).refreshToken as {
      updateMany: (a: unknown) => Promise<unknown>;
    };
    await rtModel.updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
  } catch (err) {
    console.error("[token-session] revoke-all error:", err);
  }
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
