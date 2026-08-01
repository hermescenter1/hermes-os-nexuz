/**
 * Server-side session store (Phase 91).
 *
 * The `RefreshToken` row is the server-authoritative session record. Its `id`
 * is the opaque session id (`sid`) carried by the access token and the legacy
 * session cookie. This module is the single place that decides whether a session
 * is still active and the only place that revokes one.
 *
 * Node-only (Prisma). NEVER import from middleware or Edge Runtime code.
 *
 * Security posture:
 *  - Fail CLOSED. A token that claims a `sid` we cannot positively confirm as
 *    active (missing row, revoked, expired, or DB unreachable) is treated as
 *    revoked. A transient database outage denies rather than grants — the
 *    opposite of a fail-open bypass.
 *  - Tokens WITHOUT a `sid` (issued before this phase, or in session mode with
 *    no database) never reach here; the caller's legacy path handles them so no
 *    forced logout occurs on upgrade.
 *  - Session summaries expose only the opaque id and coarse metadata. The refresh
 *    token hash is never read out.
 */

import { getPrisma } from "@/lib/db/prisma";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { logger } from "@/lib/logger";

export interface SessionSummary {
  /** Opaque session id (RefreshToken.id == the access token's `sid`). Not a secret. */
  id:         string;
  /** True when this is the session the current request authenticated with. */
  current:    boolean;
  deviceInfo: string | null;
  createdAt:  string;
  expiresAt:  string;
  lastUsedAt: string | null;
}

type RefreshModel = {
  findUnique: (a: unknown) => Promise<Record<string, unknown> | null>;
  findMany:   (a: unknown) => Promise<Record<string, unknown>[]>;
  update:     (a: unknown) => Promise<unknown>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
};

type UserModel = {
  update: (a: unknown) => Promise<unknown>;
};

type PrismaClientLike = Record<string, unknown> & {
  $transaction?: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
};

function refreshModel(db: unknown): RefreshModel {
  return (db as Record<string, unknown>).refreshToken as RefreshModel;
}

function userModel(db: unknown): UserModel {
  return (db as Record<string, unknown>).user as UserModel;
}

/**
 * Run `fn` in a real interactive transaction when supported (production Prisma);
 * minimal test doubles without `$transaction` run it directly. Atomicity in
 * production is provided by the database and exercised by the migration rehearsal.
 */
async function withTx<T>(db: PrismaClientLike, fn: (client: Record<string, unknown>) => Promise<T>): Promise<T> {
  if (typeof db.$transaction === "function") return db.$transaction((tx) => fn(tx as Record<string, unknown>));
  return fn(db);
}

/** Fire-and-forget, throttled "last active" write. Never throws, never blocks. */
function touchLastUsed(rt: RefreshModel, sid: string, currentLastUsed: unknown): void {
  const now  = Date.now();
  const last = currentLastUsed ? new Date(currentLastUsed as string).getTime() : 0;
  if (Number.isFinite(last) && now - last < 60_000) return; // at most one write per minute
  void rt.update({ where: { id: sid }, data: { lastUsedAt: new Date() } }).catch(() => { /* best-effort */ });
}

/**
 * Is the session referenced by `sid` still active?
 * Active = the row exists AND is not revoked AND is not past its expiry.
 * Fail-closed on any uncertainty (missing DB, error, unknown row).
 */
export async function isSessionActive(sid: string): Promise<boolean> {
  const db = await getPrisma();
  if (!db) return false; // fail closed — cannot confirm, so deny
  try {
    const rt  = refreshModel(db);
    const row = await rt.findUnique({
      where:   { id: sid },
      include: { user: { select: { tokenVersion: true } } },
    });
    if (!row) return false;
    if (row.revokedAt) return false;
    if (new Date(row.expiresAt as string) < new Date()) return false;
    // PHASE 91 — monotonic generation gate. A "revoke all sessions" bumps the
    // owner's User.tokenVersion; a session stamped with an older value is dead
    // even if it slipped in during the revoke-vs-rotate window. Defaults keep
    // pre-Phase-91 rows (both sides 0) valid.
    const rowVer  = Number(row.userTokenVersion ?? 0);
    const userVer = Number((row.user as { tokenVersion?: number } | undefined)?.tokenVersion ?? 0);
    if (rowVer !== userVer) return false;
    touchLastUsed(rt, sid, row.lastUsedAt);
    return true;
  } catch (err) {
    logger.error("[session-store] isSessionActive error", { error: String(err) });
    return false; // fail closed
  }
}

/**
 * Enforce the session binding of a verified token payload.
 * - `sid` present  → the referenced session must be active.
 * - `sid` absent   → legacy token, allowed (not individually revocable).
 */
export async function isPayloadSessionActive(payload: { sid?: string }): Promise<boolean> {
  if (!payload.sid) return true;
  return isSessionActive(payload.sid);
}

/**
 * Owner-scoped list of the user's active sessions. Never exposes the token hash.
 *
 * PHASE 91 failure contract, with an explicit mode distinction:
 *  - SESSION mode has no durable session store by design, so the caller
 *    genuinely has zero server-side sessions → `[]` (200), never 503.
 *  - DATABASE mode with no client / a query error is a real outage → `null`,
 *    so the caller answers 503. It never conflates "store down" with "you have
 *    no sessions", and never discloses a database message.
 */
export async function listUserSessions(
  userId:     string,
  currentSid: string | null = null,
): Promise<SessionSummary[] | null> {
  // Session mode: no durable store exists — that is the healthy steady state,
  // not an outage. Report an empty inventory rather than a spurious 503.
  if (getStorageMode() !== "database") return [];
  const db = await getPrisma();
  if (!db) return null; // database mode but store unavailable — caller must 503
  try {
    const rt   = refreshModel(db);
    const rows = await rt.findMany({
      where:   { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id:         String(r.id),
      current:    currentSid != null && String(r.id) === currentSid,
      deviceInfo: r.deviceInfo ? String(r.deviceInfo) : null,
      createdAt:  new Date(r.createdAt as string).toISOString(),
      expiresAt:  new Date(r.expiresAt as string).toISOString(),
      lastUsedAt: r.lastUsedAt ? new Date(r.lastUsedAt as string).toISOString() : null,
    }));
  } catch (err) {
    logger.error("[session-store] listUserSessions error", { error: String(err) });
    return null; // treat a store error as unavailable, not as "no sessions"
  }
}

/**
 * Revoke a single session, scoped to its owner.
 * Returns true only if a session owned by `userId` was actually revoked, so a
 * caller can never revoke — or even confirm the existence of — another user's
 * session (the route maps false → 404, no existence leak).
 */
export async function revokeSession(userId: string, sid: string): Promise<boolean> {
  const db = await getPrisma();
  if (!db) return false;
  try {
    const rt  = refreshModel(db);
    const res = await rt.updateMany({
      where: { id: sid, userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
    return Boolean(res) && res.count > 0;
  } catch (err) {
    logger.error("[session-store] revokeSession error", { error: String(err) });
    return false;
  }
}

/** Revoke every active session of the user except (optionally) the one to keep. Returns the count revoked. */
export async function revokeOtherSessions(userId: string, keepSid: string | null): Promise<number> {
  const db = await getPrisma();
  if (!db) return 0;
  try {
    const rt = refreshModel(db);
    const where: Record<string, unknown> = { userId, revokedAt: null };
    if (keepSid) where.id = { not: keepSid };
    const res = await rt.updateMany({ where, data: { revokedAt: new Date() } });
    return res?.count ?? 0;
  } catch (err) {
    logger.error("[session-store] revokeOtherSessions error", { error: String(err) });
    return 0;
  }
}

/**
 * Hard "kill switch": revoke EVERY session of the user (password reset, member
 * suspend/remove). This is the race-proof variant — it first bumps the owner's
 * `tokenVersion`, so any refresh already in flight either observes the new
 * version and refuses to rotate, or mints a session stamped with the OLD version
 * that `isSessionActive` then rejects. The subsequent bulk revoke handles the
 * common case in one statement. Returns the number of rows revoked.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const db = await getPrisma();
  if (!db) return 0;
  try {
    // Bump the generation FIRST — ordering matters for the race guarantee.
    await userModel(db).update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  } catch (err) {
    // If we cannot bump the generation we must not report success — fail closed.
    logger.error("[session-store] revokeAllSessions bump error", { error: String(err) });
    return 0;
  }
  try {
    const res = await refreshModel(db).updateMany({
      where: { userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    });
    return res?.count ?? 0;
  } catch (err) {
    // The generation bump already invalidated every existing session, so this is
    // best-effort cleanup of the revokedAt flags.
    logger.error("[session-store] revokeAllSessions revoke error", { error: String(err) });
    return 0;
  }
}

export type RevokeOthersResult =
  | { ok: true; revoked: number; generation: number }
  | { ok: false; error: "kept_invalid" | "unavailable" };

/**
 * PHASE 91 — self-service "log out every other device" done as ONE atomic,
 * generation-safe transaction. Keeping the current session alive while cutting
 * every other one is a security transition, not a bulk delete, so the whole
 * operation is serialised in a single transaction:
 *
 *   1. the kept session must belong to the caller, be active, unexpired, and at
 *      the current generation (else `kept_invalid` — no partial effect);
 *   2. bump User.tokenVersion (new generation);
 *   3. move the kept session to the new generation so the CALLER stays valid
 *      (the access token references the row by sid, and the row now matches);
 *   4. revoke every other session by id.
 *
 * Because the generation advances, any concurrent refresh of a non-kept session
 * is dead regardless of ordering: a successor it mints carries the OLD generation
 * (rejected by isSessionActive), or its rotate observes the new generation and
 * refuses. No non-kept session can remain active, and no cross-user row is
 * touched (every write is filtered by `userId`).
 */
export async function revokeAllOtherSessionsAtomically(
  userId:  string,
  keepSid: string,
): Promise<RevokeOthersResult> {
  const db = await getPrisma();
  if (!db) return { ok: false, error: "unavailable" };
  try {
    return await withTx(db as PrismaClientLike, async (c): Promise<RevokeOthersResult> => {
      const rt = refreshModel(c);
      const um = userModel(c) as UserModel & { update: (a: unknown) => Promise<Record<string, unknown>> };

      const kept = await rt.findUnique({
        where:   { id: keepSid },
        include: { user: { select: { tokenVersion: true } } },
      });
      // Owner-scoped + active + unexpired + current generation, or fail whole op.
      if (!kept || String(kept.userId) !== userId) return { ok: false, error: "kept_invalid" };
      if (kept.revokedAt)                          return { ok: false, error: "kept_invalid" };
      if (new Date(kept.expiresAt as string) < new Date()) return { ok: false, error: "kept_invalid" };
      const curVer = Number((kept.user as { tokenVersion?: number } | undefined)?.tokenVersion ?? 0);
      if (Number(kept.userTokenVersion ?? 0) !== curVer) return { ok: false, error: "kept_invalid" };

      const updatedUser = await um.update({
        where: { id: userId }, data: { tokenVersion: { increment: 1 } }, select: { tokenVersion: true },
      });
      const newGen = Number((updatedUser as { tokenVersion?: number })?.tokenVersion ?? curVer + 1);

      // Keep the caller alive by moving their row to the new generation.
      await rt.update({ where: { id: keepSid }, data: { userTokenVersion: newGen } });

      // Explicitly revoke all others (defence in depth on top of the generation gap).
      const res = await rt.updateMany({
        where: { userId, revokedAt: null, id: { not: keepSid } },
        data:  { revokedAt: new Date() },
      });
      return { ok: true, revoked: res?.count ?? 0, generation: newGen };
    });
  } catch (err) {
    logger.error("[session-store] revokeAllOtherSessionsAtomically error", { error: String(err) });
    return { ok: false, error: "unavailable" };
  }
}
