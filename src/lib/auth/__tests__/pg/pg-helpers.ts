/**
 * Phase 91 PostgreSQL integration-test helpers.
 *
 * These run against a REAL PostgreSQL database with the REAL Prisma client
 * (HERMES_STORAGE_MODE=database + DATABASE_URL). Nothing here mocks getPrisma or
 * uses vi.mock. Only run under the dedicated postgres vitest config in CI.
 *
 * Secret hygiene: never log a plaintext token, token hash, cookie, password, or
 * the DATABASE_URL. Helpers return opaque row ids and booleans only.
 */

import { getPrisma } from "@/lib/db/prisma";
import { generateRefreshToken, hashRefreshToken } from "@/lib/auth/jwt-server";

export const PG_ENABLED =
  process.env.HERMES_STORAGE_MODE === "database" && !!process.env.DATABASE_URL;

/** Real Prisma client (never mocked). */
export async function client(): Promise<Record<string, unknown> & {
  $executeRawUnsafe: (sql: string, ...args: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T = unknown>(sql: string, ...args: unknown[]) => Promise<T>;
  user: Record<string, (a: unknown) => Promise<unknown>>;
  refreshToken: Record<string, (a: unknown) => Promise<unknown>>;
}> {
  const db = await getPrisma();
  if (!db) throw new Error("PG integration test requires a real Prisma client");
  return db as never;
}

const PREFIX = "pgit-";

/** Remove all test-scoped rows and any leaked integration-test trigger. */
export async function reset(): Promise<void> {
  const db = await client();
  // Defensive: a crashed rollback test could leave the temporary trigger behind,
  // which would break every later insert. Always clear it first.
  await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS phase91_block ON "RefreshToken"`);
  await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS phase91_block_insert()`);
  await db.$executeRawUnsafe(`DELETE FROM "RefreshToken" WHERE "userId" LIKE '${PREFIX}%'`);
  await db.$executeRawUnsafe(`DELETE FROM "User" WHERE "id" LIKE '${PREFIX}%'`);
}

export async function mkUser(suffix: string, tokenVersion = 0): Promise<string> {
  const db = await client();
  const id = `${PREFIX}${suffix}`;
  await (db.user.create as (a: unknown) => Promise<unknown>)({
    data: {
      id,
      name: suffix,
      email: `${id}@phase91.test`,
      passwordHash: "x:notarealhash",
      tokenVersion,
    },
  });
  return id;
}

export interface MkRefresh {
  userId: string;
  gen?: number;
  revoked?: boolean;
  ttlMs?: number;
  deviceInfo?: string | null;
}

/** Create a refresh/session row and return { sid, plain }. */
export async function mkRefresh(opts: MkRefresh): Promise<{ sid: string; plain: string }> {
  const db = await client();
  const plain = generateRefreshToken();
  const row = (await (db.refreshToken.create as (a: unknown) => Promise<Record<string, unknown>>)({
    data: {
      userId: opts.userId,
      tokenHash: hashRefreshToken(plain),
      expiresAt: new Date(Date.now() + (opts.ttlMs ?? 7 * 24 * 3600_000)),
      revokedAt: opts.revoked ? new Date() : null,
      userTokenVersion: opts.gen ?? 0,
      deviceInfo: opts.deviceInfo ?? null,
    },
  })) as Record<string, unknown>;
  return { sid: String(row.id), plain };
}

export async function userGeneration(userId: string): Promise<number> {
  const db = await client();
  const u = (await (db.user.findUnique as (a: unknown) => Promise<Record<string, unknown> | null>)({
    where: { id: userId }, select: { tokenVersion: true },
  })) as Record<string, unknown> | null;
  return Number(u?.tokenVersion ?? -1);
}

export async function rowById(sid: string): Promise<Record<string, unknown> | null> {
  const db = await client();
  return (await (db.refreshToken.findUnique as (a: unknown) => Promise<Record<string, unknown> | null>)({
    where: { id: sid },
  })) as Record<string, unknown> | null;
}

/** Rows for a user that are not revoked and not expired (candidate "active" rows). */
export async function unrevokedUnexpired(userId: string): Promise<Record<string, unknown>[]> {
  const db = await client();
  return (await (db.refreshToken.findMany as (a: unknown) => Promise<Record<string, unknown>[]>)({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
  })) as Record<string, unknown>[];
}

export async function successorRows(userId: string, excludeHashOfPlain: string): Promise<Record<string, unknown>[]> {
  const db = await client();
  const rows = (await (db.refreshToken.findMany as (a: unknown) => Promise<Record<string, unknown>[]>)({
    where: { userId },
  })) as Record<string, unknown>[];
  const excluded = hashRefreshToken(excludeHashOfPlain);
  return rows.filter((r) => String(r.tokenHash) !== excluded);
}
