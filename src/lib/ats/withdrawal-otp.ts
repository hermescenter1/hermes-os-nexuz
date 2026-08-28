/**
 * PHASE 104-B1 — withdrawal one-time-code service (no public route yet).
 *
 * Contract (45-recruitment-privacy-contract.md §12/§15):
 *
 *   OTP_CODE_FORMAT                    8-digit numeric
 *   OTP_TTL_SECONDS                    600
 *   OTP_MAX_ATTEMPTS                   5 (exceeding INVALIDATES the code)
 *   OTP_RESEND_COOLDOWN_SECONDS        60
 *   OTP_MAX_ISSUES_PER_IDENTIFIER_HOUR 5
 *   OTP_MAX_ISSUES_PER_IP_HOUR         20
 *
 *   * CSPRNG generation only;
 *   * storage is HMAC-SHA-256 under a VERSIONED server secret — plaintext is
 *     never stored, never logged, never returned;
 *   * the identifier reaches storage and the limiter ONLY as a keyed HMAC;
 *   * verification is constant-time over digests;
 *   * a reissue invalidates the previous code immediately;
 *   * consumption is atomic — the code row is consumed inside the same
 *     transaction that flips whatever the verification unlocks;
 *   * no email, code or token in any URL, log line or error message;
 *   * every refusal is the same generic shape (enumeration-resistant).
 *
 * Stage B1 ships the SERVICE and its storage only. No route imports it yet,
 * and no email is sent from anywhere in this module.
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { getPrisma } from "@/lib/db/prisma";

export const OTP_CODE_DIGITS = 8;
export const OTP_TTL_SECONDS = 600;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ISSUES_PER_IDENTIFIER_PER_HOUR = 5;
/**
 * B1.1 TRUTH FLAGS: the per-IP ceiling is a CONTRACT CONSTANT for the future
 * route layer — this module receives no IP and enforces nothing per-IP.
 *
 *   OTP_IP_CEILING_IMPLEMENTED = NO
 *   B2_ROUTE_LAYER_BLOCKER     = YES
 */
export const OTP_MAX_ISSUES_PER_IP_PER_HOUR = 20;
export const OTP_IP_CEILING_IMPLEMENTED = false;
export const OTP_B2_ROUTE_LAYER_BLOCKER = true;
export const OTP_PURPOSE_WITHDRAWAL = "WITHDRAWAL";

/**
 * The versioned secret. Resolution order is newest-first; the version label is
 * stored beside each digest so an old challenge verifies under the secret that
 * signed it. Absence of every secret is a hard fail-closed: no challenge can
 * be issued or verified.
 */
const SECRET_ENV_VERSIONS = ["RECRUITMENT_OTP_SECRET_V2", "RECRUITMENT_OTP_SECRET_V1"] as const;

/**
 * B1.1 — the IDENTIFIER HMAC uses a DEDICATED, STABLE secret, independent of
 * code-secret rotation. Deriving it from the newest code secret was a
 * rotation bug: enabling V2 changed every identifierHmac, so a live V1
 * challenge could never be FOUND again even though its code digest was still
 * verifiable under the stored V1 version. Lookups must be rotation-stable;
 * only the code digest rotates.
 */
const IDENTIFIER_SECRET_ENV = "RECRUITMENT_OTP_IDENTIFIER_SECRET";

function resolveIdentifierSecret(): string | null {
  return process.env[IDENTIFIER_SECRET_ENV] || null;
}

function resolveSecret(version?: string): { version: string; secret: string } | null {
  if (version) {
    const value = process.env[version];
    return value ? { version, secret: value } : null;
  }
  for (const name of SECRET_ENV_VERSIONS) {
    const value = process.env[name];
    if (value) return { version: name, secret: value };
  }
  return null;
}

export function hmacIdentifier(rawIdentifier: string, secret: string): string {
  const normalized = rawIdentifier.trim().toLowerCase();
  return createHmac("sha256", secret).update(`id:${normalized}`, "utf8").digest("hex");
}

function hmacCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(`otp:${code}`, "utf8").digest("hex");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

type OtpModel = {
  create: (a: unknown) => Promise<{ id: string }>;
  findFirst: (a: unknown) => Promise<OtpRow | null>;
  updateMany: (a: unknown) => Promise<{ count: number }>;
  count: (a: unknown) => Promise<number>;
};
interface OtpRow {
  id: string;
  codeHmac: string;
  secretVersion: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  invalidatedAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
}
type OtpTx = {
  recruitmentOtpChallenge: OtpModel;
  /** the per-identifier serialization primitive (pg_advisory_xact_lock) */
  $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};
type OtpTxClient = { $transaction: <T>(fn: (tx: OtpTx) => Promise<T>) => Promise<T> };

async function client(): Promise<(OtpTxClient & { recruitmentOtpChallenge: OtpModel }) | null> {
  const prisma = (await getPrisma()) as unknown as (OtpTxClient & { recruitmentOtpChallenge?: OtpModel }) | null;
  return prisma?.recruitmentOtpChallenge ? (prisma as OtpTxClient & { recruitmentOtpChallenge: OtpModel }) : null;
}

/** Internal refusal marker — never leaves the module; callers only ever see
 *  the generic { issued: false }. */
class OtpRefusal extends Error {}

/** Generic, enumeration-resistant outcome — the ONLY vocabulary callers see. */
export type OtpIssueResult = { issued: true; challengeId: string } | { issued: false };
export type OtpVerifyResult = { verified: true } | { verified: false };

/**
 * Issue a fresh challenge for (identifier, purpose). Invalidates every prior
 * live challenge first (reissue kills the old code). The plaintext code is
 * handed ONLY to the caller-supplied `deliver` callback and never returned,
 * stored or logged.
 */
export async function issueWithdrawalOtp(args: {
  identifier: string;
  deliver: (code: string) => Promise<void>;
  now?: Date;
}): Promise<OtpIssueResult> {
  const resolved = resolveSecret();
  if (!resolved) return { issued: false };
  const idSecret = resolveIdentifierSecret();
  if (!idSecret) return { issued: false };
  const db = await client();
  if (!db) return { issued: false };
  const now = args.now ?? new Date();
  const idHmac = hmacIdentifier(args.identifier, idSecret);

  // CSPRNG 8-digit code. randomInt is crypto-strength and unbiased.
  const code = String(randomInt(0, 10 ** OTP_CODE_DIGITS)).padStart(OTP_CODE_DIGITS, "0");

  try {
    const challengeId = await db.$transaction(async (tx) => {
      /*
       * B1.2 — issuance is SERIALIZED per (identifierHmac, purpose).
       *
       * The transaction-scoped advisory lock makes every concurrent issuer
       * for the same identifier queue here, so the hourly ceiling, the
       * resend cooldown, the reissue-invalidation and the insert all observe
       * one another in strict order — no phantom window between a count and
       * a create. The lock releases automatically at commit/rollback.
       *
       * Defense in depth: even with every application check raced away, the
       * DATABASE's partial unique index
       * RecruitmentOtpChallenge_live_one_key ("identifierHmac","purpose")
       * WHERE live guarantees at most ONE live challenge; the loser of a
       * true race surfaces as a unique violation and refuses generically.
       */
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${idHmac + ":" + OTP_PURPOSE_WITHDRAWAL}))`;

      // Per-identifier issue ceiling (per hour), under the lock.
      const hourAgo = new Date(now.getTime() - 3600_000);
      const recent = await tx.recruitmentOtpChallenge.count({
        where: { identifierHmac: idHmac, purpose: OTP_PURPOSE_WITHDRAWAL, createdAt: { gte: hourAgo } },
      });
      if (recent >= OTP_MAX_ISSUES_PER_IDENTIFIER_PER_HOUR) throw new OtpRefusal();

      // Resend cooldown, under the same lock.
      const cooldownEdge = new Date(now.getTime() - OTP_RESEND_COOLDOWN_SECONDS * 1000);
      const withinCooldown = await tx.recruitmentOtpChallenge.count({
        where: { identifierHmac: idHmac, purpose: OTP_PURPOSE_WITHDRAWAL, createdAt: { gte: cooldownEdge } },
      });
      if (withinCooldown > 0) throw new OtpRefusal();

      // Reissue invalidates every previous live challenge immediately.
      await tx.recruitmentOtpChallenge.updateMany({
        where: {
          identifierHmac: idHmac,
          purpose: OTP_PURPOSE_WITHDRAWAL,
          invalidatedAt: null,
          consumedAt: null,
        },
        data: { invalidatedAt: now },
      });
      const row = await tx.recruitmentOtpChallenge.create({
        data: {
          identifierHmac: idHmac,
          purpose: OTP_PURPOSE_WITHDRAWAL,
          codeHmac: hmacCode(code, resolved.secret),
          secretVersion: resolved.version,
          attempts: 0,
          maxAttempts: OTP_MAX_ATTEMPTS,
          expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
          // written explicitly from the service clock so cooldown/ceiling
          // arithmetic and tests share ONE time source
          createdAt: now,
        },
        select: { id: true },
      });
      return row.id;
    });

    try {
      await args.deliver(code);
    } catch {
      // B1.1 — a failed delivery must not leave a LIVE, undelivered challenge
      // behind: invalidate it immediately and refuse generically.
      await db.recruitmentOtpChallenge.updateMany({
        where: { id: challengeId, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      return { issued: false };
    }
    return { issued: true, challengeId };
  } catch {
    return { issued: false };
  }
}

/**
 * Verify and CONSUME a code atomically. `onConsumed` runs inside the same
 * transaction that stamps `consumedAt`, so the session/verification transition
 * and the consumption cannot diverge. Every failure — unknown identifier,
 * wrong code, expired, invalidated, over-attempts — returns the same shape.
 */
export async function verifyAndConsumeWithdrawalOtp(args: {
  identifier: string;
  code: string;
  onConsumed?: (tx: unknown) => Promise<void>;
  now?: Date;
}): Promise<OtpVerifyResult> {
  const anyCodeSecret = resolveSecret();
  if (!anyCodeSecret) return { verified: false };
  const idSecret = resolveIdentifierSecret();
  if (!idSecret) return { verified: false };
  const db = await client();
  if (!db) return { verified: false };
  const now = args.now ?? new Date();

  if (!/^\d{8}$/.test(args.code)) return { verified: false };

  try {
    // Stable identifier lookup — rotation-proof (see IDENTIFIER_SECRET_ENV).
    const idHmac = hmacIdentifier(args.identifier, idSecret);
    const row = await db.recruitmentOtpChallenge.findFirst({
      where: {
        identifierHmac: idHmac,
        purpose: OTP_PURPOSE_WITHDRAWAL,
        invalidatedAt: null,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return { verified: false };

    if (row.attempts >= row.maxAttempts) {
      await db.recruitmentOtpChallenge.updateMany({
        where: { id: row.id, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      return { verified: false };
    }

    const rowSecret = resolveSecret(row.secretVersion);
    const expected = rowSecret ? hmacCode(args.code, rowSecret.secret) : "";
    const match = rowSecret ? constantTimeEqualHex(expected, row.codeHmac) : false;

    if (!match) {
      // Count the attempt; hitting the ceiling invalidates.
      const bumped = await db.recruitmentOtpChallenge.updateMany({
        where: { id: row.id, consumedAt: null, invalidatedAt: null },
        data: { attempts: { increment: 1 } },
      });
      if (bumped.count > 0 && row.attempts + 1 >= row.maxAttempts) {
        await db.recruitmentOtpChallenge.updateMany({
          where: { id: row.id, invalidatedAt: null },
          data: { invalidatedAt: now },
        });
      }
      return { verified: false };
    }

    // Atomic consume: the guarded updateMany is the lock — only ONE concurrent
    // verifier can flip consumedAt, and the caller's transition runs in the
    // same transaction.
    const consumed = await db.$transaction(async (tx) => {
      const res = await tx.recruitmentOtpChallenge.updateMany({
        where: { id: row.id, consumedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (res.count !== 1) return false;
      if (args.onConsumed) await args.onConsumed(tx);
      return true;
    });

    return consumed ? { verified: true } : { verified: false };
  } catch {
    return { verified: false };
  }
}
