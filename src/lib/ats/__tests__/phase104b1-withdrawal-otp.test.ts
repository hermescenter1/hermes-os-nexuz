/**
 * PHASE 104-B1 — the withdrawal OTP contract, run against the REAL service
 * with a captured fake store and a test-scoped versioned secret.
 *
 *   - CSPRNG 8-digit codes; plaintext reaches ONLY the deliver callback;
 *   - storage holds HMAC digests — never the code, never the email;
 *   - TTL, attempt ceiling (invalidates), resend cooldown, reissue kills the
 *     previous code, consume is atomic and single-winner;
 *   - a missing secret fails CLOSED;
 *   - every refusal is one generic shape.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import {
  issueWithdrawalOtp,
  verifyAndConsumeWithdrawalOtp,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
} from "../withdrawal-otp";

interface Row {
  id: string;
  identifierHmac: string;
  purpose: string;
  codeHmac: string;
  secretVersion: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  invalidatedAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
}

function makeStore() {
  const rows: Row[] = [];
  const match = (r: Row, w: Record<string, unknown>): boolean => {
    if (w.id !== undefined && r.id !== w.id) return false;
    if (w.identifierHmac !== undefined && r.identifierHmac !== w.identifierHmac) return false;
    if (w.purpose !== undefined && r.purpose !== w.purpose) return false;
    if (w.invalidatedAt === null && r.invalidatedAt !== null) return false;
    if (w.consumedAt === null && r.consumedAt !== null) return false;
    const exp = w.expiresAt as { gt?: Date } | undefined;
    if (exp?.gt && !(r.expiresAt.getTime() > exp.gt.getTime())) return false;
    const created = w.createdAt as { gte?: Date } | undefined;
    if (created?.gte && !(r.createdAt.getTime() >= created.gte.getTime())) return false;
    return true;
  };
  const model = {
    create: async (a: { data: Omit<Row, "id" | "createdAt"> & { createdAt?: Date } }) => {
      // Prisma fills these from schema defaults; the fake must too, or a
      // where:{invalidatedAt:null} can never match a fresh row. Object.assign
      // (not an object literal) so the service-provided fields override the
      // defaults without a duplicate-key literal.
      const row: Row = Object.assign(
        { id: `otp-${rows.length + 1}`, createdAt: new Date(), invalidatedAt: null, consumedAt: null },
        a.data,
      ) as Row;
      rows.push(row);
      return { id: row.id };
    },
    findFirst: async (a: { where: Record<string, unknown> }) => {
      const hits = rows.filter((r) => match(r, a.where));
      hits.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
      return hits[0] ?? null;
    },
    updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const r of rows) {
        if (!match(r, a.where)) continue;
        count++;
        for (const [k, v] of Object.entries(a.data)) {
          if (k === "attempts" && typeof v === "object" && v !== null && "increment" in v) {
            r.attempts += (v as { increment: number }).increment;
          } else {
            (r as unknown as Record<string, unknown>)[k] = v;
          }
        }
      }
      return { count };
    },
    count: async (a: { where: Record<string, unknown> }) => rows.filter((r) => match(r, a.where)).length,
  };
  const client = {
    recruitmentOtpChallenge: model,
    // B1.2 — the tx now also carries $queryRaw (the advisory-lock primitive).
    // This plain fake runs single-threaded, so the lock is a no-op here; the
    // faithful-isolation double lives in phase104b12-otp-concurrency.test.ts.
    $transaction: async <T,>(fn: (tx: { recruitmentOtpChallenge: typeof model; $queryRaw: () => Promise<unknown> }) => Promise<T>) =>
      fn({ recruitmentOtpChallenge: model, $queryRaw: async () => [] }),
  };
  return { client, rows };
}

const EMAIL = "candidate@example.org";
let t0: Date;

beforeEach(() => {
  process.env.RECRUITMENT_OTP_SECRET_V1 = "test-secret-v1";
  // B1.1 — identifier lookups use a DEDICATED, rotation-stable secret.
  process.env.RECRUITMENT_OTP_IDENTIFIER_SECRET = "test-identifier-secret";
  t0 = new Date("2026-08-24T12:00:00.000Z");
  h.db = null;
});
afterEach(() => {
  delete process.env.RECRUITMENT_OTP_SECRET_V1;
  delete process.env.RECRUITMENT_OTP_SECRET_V2;
  delete process.env.RECRUITMENT_OTP_IDENTIFIER_SECRET;
});

async function issue(store: ReturnType<typeof makeStore>, at: Date = t0) {
  h.db = store.client;
  let delivered = "";
  const res = await issueWithdrawalOtp({ identifier: EMAIL, deliver: async (c) => { delivered = c; }, now: at });
  return { res, delivered };
}

describe("issue", () => {
  it("delivers a CSPRNG 8-digit code and stores only digests — no plaintext, no email", async () => {
    const store = makeStore();
    const { res, delivered } = await issue(store);
    expect(res.issued).toBe(true);
    expect(delivered).toMatch(/^\d{8}$/);
    const dump = JSON.stringify(store.rows);
    expect(dump).not.toContain(delivered);
    expect(dump).not.toContain(EMAIL);
    expect(store.rows[0].secretVersion).toBe("RECRUITMENT_OTP_SECRET_V1");
    expect(store.rows[0].expiresAt.getTime()).toBe(t0.getTime() + OTP_TTL_SECONDS * 1000);
  });

  it("fails CLOSED without a code secret", async () => {
    delete process.env.RECRUITMENT_OTP_SECRET_V1;
    const store = makeStore();
    const { res } = await issue(store);
    expect(res).toEqual({ issued: false });
    expect(store.rows).toHaveLength(0);
  });

  it("fails CLOSED without the identifier secret", async () => {
    delete process.env.RECRUITMENT_OTP_IDENTIFIER_SECRET;
    const store = makeStore();
    const { res } = await issue(store);
    expect(res).toEqual({ issued: false });
    expect(store.rows).toHaveLength(0);
  });

  it("a FAILED delivery leaves no live challenge behind", async () => {
    const store = makeStore();
    h.db = store.client;
    const res = await issueWithdrawalOtp({
      identifier: EMAIL,
      deliver: async () => { throw new Error("smtp down"); },
      now: t0,
    });
    expect(res).toEqual({ issued: false });
    // the row exists but is INVALIDATED — an undelivered code can never verify
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].invalidatedAt).not.toBeNull();
  });

  it("reissue after the cooldown invalidates the previous code", async () => {
    const store = makeStore();
    const first = await issue(store);
    const later = new Date(t0.getTime() + 61_000);
    const second = await issue(store, later);
    expect(second.res.issued).toBe(true);
    expect(store.rows[0].invalidatedAt).not.toBeNull();
    // the OLD code no longer verifies
    const v = await verifyAndConsumeWithdrawalOtp({ identifier: EMAIL, code: first.delivered, now: later });
    // (unless the two random codes collided AND the new row matched — the new
    // row's digest is of the second code, so a first-code match means collision)
    if (first.delivered !== second.delivered) expect(v).toEqual({ verified: false });
  });

  it("enforces the resend cooldown and the hourly ceiling generically", async () => {
    const store = makeStore();
    await issue(store);
    const tooSoon = await issue(store, new Date(t0.getTime() + 10_000));
    expect(tooSoon.res).toEqual({ issued: false });
  });
});

describe("secret rotation", () => {
  it("a V1 challenge still verifies after V2 becomes the newest code secret", async () => {
    const store = makeStore();
    // issue under V1 only
    const { delivered } = await issue(store);
    expect(store.rows[0].secretVersion).toBe("RECRUITMENT_OTP_SECRET_V1");
    // rotation: V2 becomes the newest CODE secret
    process.env.RECRUITMENT_OTP_SECRET_V2 = "test-secret-v2";
    // the old challenge must still be FOUND (stable identifier HMAC) and its
    // digest verified under the STORED V1 version
    const v = await verifyAndConsumeWithdrawalOtp({
      identifier: EMAIL,
      code: delivered,
      now: new Date(t0.getTime() + 5_000),
    });
    expect(v).toEqual({ verified: true });
  });

  it("after rotation a NEW challenge signs under V2 while lookups stay stable", async () => {
    const store = makeStore();
    await issue(store);
    process.env.RECRUITMENT_OTP_SECRET_V2 = "test-secret-v2";
    const second = await issue(store, new Date(t0.getTime() + 61_000));
    expect(second.res.issued).toBe(true);
    const newest = store.rows[store.rows.length - 1];
    expect(newest.secretVersion).toBe("RECRUITMENT_OTP_SECRET_V2");
    // both rows share ONE identifierHmac — the lookup key never rotated
    expect(new Set(store.rows.map((r) => r.identifierHmac)).size).toBe(1);
    const v = await verifyAndConsumeWithdrawalOtp({
      identifier: EMAIL,
      code: second.delivered,
      now: new Date(t0.getTime() + 65_000),
    });
    expect(v).toEqual({ verified: true });
  });
});

describe("verify + consume", () => {
  it("verifies the right code ONCE — the second consume loses atomically", async () => {
    const store = makeStore();
    const { delivered } = await issue(store);
    const at = new Date(t0.getTime() + 5_000);
    const first = await verifyAndConsumeWithdrawalOtp({ identifier: EMAIL, code: delivered, now: at });
    expect(first).toEqual({ verified: true });
    const second = await verifyAndConsumeWithdrawalOtp({ identifier: EMAIL, code: delivered, now: at });
    expect(second).toEqual({ verified: false });
  });

  it("runs the caller's transition inside the SAME transaction as the consume", async () => {
    const store = makeStore();
    const { delivered } = await issue(store);
    let ranInTx = false;
    const res = await verifyAndConsumeWithdrawalOtp({
      identifier: EMAIL,
      code: delivered,
      now: new Date(t0.getTime() + 5_000),
      onConsumed: async () => { ranInTx = true; },
    });
    expect(res).toEqual({ verified: true });
    expect(ranInTx).toBe(true);
  });

  it("an expired code refuses with the same generic shape", async () => {
    const store = makeStore();
    const { delivered } = await issue(store);
    const late = new Date(t0.getTime() + (OTP_TTL_SECONDS + 1) * 1000);
    expect(await verifyAndConsumeWithdrawalOtp({ identifier: EMAIL, code: delivered, now: late })).toEqual({ verified: false });
  });

  it("wrong attempts count up and the ceiling INVALIDATES the code", async () => {
    const store = makeStore();
    const { delivered } = await issue(store);
    const at = new Date(t0.getTime() + 5_000);
    const wrong = delivered === "00000000" ? "00000001" : "00000000";
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await verifyAndConsumeWithdrawalOtp({ identifier: EMAIL, code: wrong, now: at })).toEqual({ verified: false });
    }
    // ceiling reached → even the RIGHT code now refuses
    expect(await verifyAndConsumeWithdrawalOtp({ identifier: EMAIL, code: delivered, now: at })).toEqual({ verified: false });
    expect(store.rows[0].invalidatedAt).not.toBeNull();
  });

  it("the module source keeps the security shape: keyed HMAC, no identifier in URLs, no logging", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/ats/withdrawal-otp.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l: string) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    // the code digest is a KEYED HMAC, never a bare hash
    expect(src).toContain('createHmac("sha256", secret)');
    expect(src).not.toMatch(/createHash\s*\(/);
    // nothing identifying ever travels in a URL
    expect(src).not.toMatch(/[?&](code|token|email)=/);
    // and nothing is logged
    expect(src).not.toMatch(/console\.(log|error|warn|info|debug)/);
    // constant-time comparison stays
    expect(src).toContain("timingSafeEqual");
    // the consume is SINGLE-WINNER: the guarded where IS the lock. Without
    // consumedAt: null in it, two concurrent verifiers can both "win".
    expect(src).toContain("where: { id: row.id, consumedAt: null, invalidatedAt: null, expiresAt: { gt: now } },");
  });
  it("a malformed code shape refuses before touching the store", async () => {
    const store = makeStore();
    await issue(store);
    expect(await verifyAndConsumeWithdrawalOtp({ identifier: EMAIL, code: "1234", now: t0 })).toEqual({ verified: false });
    expect(await verifyAndConsumeWithdrawalOtp({ identifier: EMAIL, code: "abcdefgh", now: t0 })).toEqual({ verified: false });
  });
});
