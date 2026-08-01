/**
 * JWT-based session management (Phase 28 · hardened Phase 91).
 * Handles access token + refresh token issuance, verification, and rotation.
 * Server-side only.
 *
 * PHASE 91 lifecycle guarantees:
 *  - Mode-aware issuance. In DATABASE mode every credential is backed by a
 *    successfully persisted server-authoritative session row (a real `sid`).
 *    Any persistence failure FAILS CLOSED (throws SessionPersistenceError → the
 *    route answers 503 SESSION_PERSISTENCE_UNAVAILABLE and issues NO cookies).
 *    A database-mode credential without a `sid` is impossible.
 *  - Only EXPLICIT session mode may mint a sid-less (legacy-style) credential.
 *  - Refresh rotation is atomic: claim-old + create-successor happen in ONE
 *    transaction, so the only reachable end states are "old still valid, no
 *    successor" or "old claimed, exactly one successor". No sid-less successor.
 *  - Login/rotation may pass the generation they observed; if a security
 *    kill-switch (password reset / suspend / remove) moved the owner's
 *    tokenVersion in the meantime, issuance fails closed (generation mismatch).
 */

import { cookies, headers } from "next/headers";
import { getPrisma } from "@/lib/db/prisma";
import { getStorageMode } from "@/lib/storage/storage-mode";
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

/**
 * Thrown when database-mode issuance cannot persist a server-authoritative
 * session. Carries only a stable code — never an internal database message.
 */
export class SessionPersistenceError extends Error {
  readonly code = "SESSION_PERSISTENCE_UNAVAILABLE" as const;
  readonly reason: string;
  constructor(reason: string) {
    super("session persistence unavailable");
    this.name = "SessionPersistenceError";
    this.reason = reason;
  }
}

// ── Prisma helpers (client OR interactive-transaction client) ────────────────

type PrismaClientLike = Record<string, unknown> & {
  $transaction?: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
};
type UserModel    = { findUnique: (a: unknown) => Promise<Record<string, unknown> | null>; update: (a: unknown) => Promise<Record<string, unknown>> };
type RefreshModel = {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  create:     (a: unknown) => Promise<Record<string, unknown>>;
  update:     (a: unknown) => Promise<unknown>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
};

/**
 * Run `fn` inside a real interactive transaction when the client supports one
 * (production Prisma). Minimal test doubles without `$transaction` execute `fn`
 * directly — the LOGIC is identical; only the atomicity guarantee is provided by
 * the real database, which the isolated-Postgres migration rehearsal exercises.
 */
async function withTx<T>(db: PrismaClientLike, fn: (client: Record<string, unknown>) => Promise<T>): Promise<T> {
  if (typeof db.$transaction === "function") {
    return db.$transaction((tx) => fn(tx as Record<string, unknown>));
  }
  return fn(db);
}

/**
 * Persist ONE server-authoritative session row and return its `sid`.
 * Fails closed (throws SessionPersistenceError) on every degraded condition:
 * user missing/removed, generation mismatch (kill-switch fired), create failure,
 * or a created row without an id.
 */
async function persistSessionRow(
  client: Record<string, unknown>,
  args: { userId: string; tokenHash: string; expiresAt: Date; deviceInfo: string | null; expectedVersion?: number; forcedVersion?: number },
): Promise<{ sid: string; tokenVersion: number }> {
  const userModel = client.user as UserModel;
  const rtModel   = client.refreshToken as RefreshModel;

  let stampVersion: number;
  if (args.forcedVersion !== undefined) {
    // Rotation: the successor MUST carry the version the rotation validated,
    // regardless of a concurrent bump — that bump is what kills the chain.
    stampVersion = args.forcedVersion;
  } else {
    const u = await userModel.findUnique({ where: { id: args.userId }, select: { id: true, tokenVersion: true } });
    if (!u || u.id == null) throw new SessionPersistenceError("user_missing");
    stampVersion = Number((u as { tokenVersion?: number }).tokenVersion ?? 0);
    // Login kill-switch race: if the caller observed a generation and it has
    // since moved, do not mint a valid session past the security event.
    if (args.expectedVersion !== undefined && args.expectedVersion !== stampVersion) {
      throw new SessionPersistenceError("generation_mismatch");
    }
  }

  let row: Record<string, unknown>;
  try {
    row = await rtModel.create({
      data: { userId: args.userId, tokenHash: args.tokenHash, expiresAt: args.expiresAt, deviceInfo: args.deviceInfo, userTokenVersion: stampVersion },
    });
  } catch (err) {
    throw new SessionPersistenceError("create_failed:" + String((err as Error)?.name ?? "error"));
  }
  const sid = row && row.id != null ? String(row.id) : null;
  if (!sid) throw new SessionPersistenceError("row_id_absent");
  return { sid, tokenVersion: stampVersion };
}

// ── Issue tokens ─────────────────────────────────────────────────────────────

export interface IssueOptions {
  deviceInfo?:     string | null;
  /** Generation observed at authentication time; a later bump fails closed (login race). */
  expectedVersion?: number;
}

/**
 * Issue an access + refresh pair.
 *
 * DATABASE mode: persists a session row first and embeds its id as the access
 * token's `sid`; throws SessionPersistenceError on any failure (never returns a
 * sid-less database-mode credential). SESSION mode: intentionally sid-less.
 */
export async function issueTokens(
  user:       TokenUser,
  rememberMe: boolean,
  opts:       IssueOptions = {},
): Promise<{ accessToken: string; refreshToken: string; sid: string | null }> {
  const refreshToken = generateRefreshToken();
  const tokenHash    = hashRefreshToken(refreshToken);
  const ttl          = rememberMe ? REFRESH_TOKEN_TTL_LONG : REFRESH_TOKEN_TTL;
  const expiresAt    = new Date(Date.now() + ttl * 1000);

  let sid: string | null = null;

  if (getStorageMode() === "database") {
    const db = await getPrisma();
    if (!db) throw new SessionPersistenceError("db_unavailable");
    const res = await withTx(db as PrismaClientLike, (c) =>
      persistSessionRow(c, { userId: user.id, tokenHash, expiresAt, deviceInfo: opts.deviceInfo ?? null, expectedVersion: opts.expectedVersion }),
    ).catch((e) => {
      if (e instanceof SessionPersistenceError) throw e;
      logger.error("[token-session] db-mode issue failed", { error: String(e) });
      throw new SessionPersistenceError("tx_failed");
    });
    sid = res.sid; // guaranteed non-null
  }
  // else: explicit session mode → sid intentionally absent (legacy-style token).

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

/**
 * Issue and set auth cookies. Propagates SessionPersistenceError in database
 * mode — the caller (e.g. self-registration) must map it to a 503 and set NO
 * cookies. Cookie writes only happen AFTER a successful issuance.
 */
export async function setAuthCookies(
  user:       TokenUser,
  rememberMe: boolean
): Promise<void> {
  const { accessToken, refreshToken } = await issueTokens(user, rememberMe, { deviceInfo: await currentDeviceInfo() });
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
  // (getCurrentUserUnified → getTokenUser gates /api/candidate/* and any caller
  // that resolves identity without going through requireOrgActor). Legacy tokens
  // without a sid are unaffected.
  if (!(await isPayloadSessionActive(payload))) return null;

  return {
    id:    payload.sub,
    email: payload.email,
    role:  payload.role,
    name:  payload.name,
  };
}

// ── Rotate refresh token (atomic) ─────────────────────────────────────────────

export type RotateResult =
  | { ok: true; user: TokenUser; accessToken: string; refreshToken: string; sid: string }
  | { ok: false; error: "invalid" | "expired" | "revoked" | "db-unavailable" | "persist-failed" };

/**
 * Atomically rotate a refresh token. Claim-old + create-successor run in ONE
 * transaction, so the reachable end states are exactly:
 *   A — old refresh still valid, no successor (any validation failure / rollback)
 *   B — old refresh claimed, exactly one persisted successor bound to a real sid
 * There is no "old revoked but successor missing" and no sid-less successor.
 */
export async function rotateRefreshToken(
  plainToken: string,
  opts: { rememberMe?: boolean; deviceInfo?: string | null } = {},
): Promise<RotateResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "db-unavailable" };

  const oldHash    = hashRefreshToken(plainToken);
  const newRefresh = generateRefreshToken();
  const newHash    = hashRefreshToken(newRefresh);
  const ttl        = opts.rememberMe ? REFRESH_TOKEN_TTL_LONG : REFRESH_TOKEN_TTL;
  const newExpires = new Date(Date.now() + ttl * 1000);

  type TxOutcome =
    | { kind: "invalid" | "expired" | "revoked" }
    | { kind: "ok"; user: TokenUser; sid: string };

  let outcome: TxOutcome;
  try {
    outcome = await withTx(db as PrismaClientLike, async (c): Promise<TxOutcome> => {
      const rtModel   = c.refreshToken as RefreshModel;
      const userModel = c.user as UserModel;

      const rt = await rtModel.findUnique({ where: { tokenHash: oldHash } });
      if (!rt)                                            return { kind: "invalid" };
      if (rt.revokedAt)                                   return { kind: "revoked" };
      if (new Date(rt.expiresAt as string) < new Date())  return { kind: "expired" };

      const user = await userModel.findUnique({ where: { id: String(rt.userId) } });
      if (!user)                                          return { kind: "invalid" };

      const userVer = Number((user as { tokenVersion?: number }).tokenVersion ?? 0);
      const rowVer  = Number((rt as { userTokenVersion?: number }).userTokenVersion ?? 0);
      // Generation gate: a kill-switch that ran after this chain was minted wins.
      if (rowVer !== userVer)                             return { kind: "revoked" };

      // Atomic single-use claim: only the first replay flips revokedAt (count 1).
      const claim = await rtModel.updateMany({ where: { tokenHash: oldHash, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!claim || claim.count !== 1)                    return { kind: "revoked" };

      // Successor carries the validated generation. A missing id throws →
      // rolls the whole transaction back → old refresh un-revoked (State A).
      const persisted = await persistSessionRow(c, {
        userId: String(rt.userId), tokenHash: newHash, expiresAt: newExpires,
        deviceInfo: opts.deviceInfo ?? null, forcedVersion: userVer,
      });

      const tokenUser: TokenUser = {
        id: String(user.id), email: String(user.email), role: String(user.role) as Role, name: String(user.name),
      };
      return { kind: "ok", user: tokenUser, sid: persisted.sid };
    });
  } catch (err) {
    // SessionPersistenceError (or any tx error) rolled the transaction back:
    // old refresh remains valid, no successor exists (State A).
    logger.error("[token-session] rotate tx failed", { error: String(err) });
    return { ok: false, error: "persist-failed" };
  }

  if (outcome.kind !== "ok") return { ok: false, error: outcome.kind };

  const accessToken = await signAccessToken({
    sub: outcome.user.id, email: outcome.user.email, role: outcome.user.role, name: outcome.user.name, sid: outcome.sid,
  });
  return { ok: true, user: outcome.user, accessToken, refreshToken: newRefresh, sid: outcome.sid };
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
