/**
 * PHASE 104-B1.2 — OTP issuance under REAL concurrency semantics.
 *
 * The plain fake in phase104b1-withdrawal-otp.test.ts runs single-threaded and
 * proves the sequential contract. THIS double reproduces the isolation
 * properties the service actually relies on in PostgreSQL:
 *
 *   - $queryRaw(pg_advisory_xact_lock …) is a QUEUEING per-key mutex held to
 *     the end of the transaction (commit releases it);
 *   - reads inside a transaction see COMMITTED rows only (read committed);
 *   - writes stage in the transaction and apply at commit;
 *   - the partial unique index (identifierHmac, purpose) WHERE live is
 *     enforced at apply time — a true race loses with P2002.
 *
 * Proofs:
 *   1. two CONCURRENT issues → exactly ONE issued, at most one live challenge,
 *      and the second issuer never even attempts a create (the serialized
 *      cooldown check refuses first) — createAttempts === 1;
 *   2. a superseded (invalidated) code never verifies;
 *   3. the concurrent ceiling cannot be overshot;
 *   4. mutation M33 (drop the advisory-lock line) turns proof 1 red via the
 *      createAttempts pin;
 *   5. delivery failure still invalidates fail-closed (covered in the plain
 *      suite; the store here shares the semantics).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import { issueWithdrawalOtp, verifyAndConsumeWithdrawalOtp } from "../withdrawal-otp";

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

/** A queueing mutex — the advisory-lock double. */
class KeyedLock {
  private chains = new Map<string, Promise<void>>();
  async acquire(key: string): Promise<() => void> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => { release = r; });
    this.chains.set(key, prev.then(() => next));
    await prev;
    return release;
  }
}

function makeIsolatedStore() {
  const committed: Row[] = [];
  const lock = new KeyedLock();
  let seq = 0;
  const stats = { createAttempts: 0, committedCreates: 0, uniqueViolations: 0 };

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

  function makeTx() {
    const staged: { creates: Row[]; updates: { where: Record<string, unknown>; data: Record<string, unknown> }[] } =
      { creates: [], updates: [] };
    const releases: (() => void)[] = [];
    const tx = {
      $queryRaw: async (_s: TemplateStringsArray, ...values: unknown[]) => {
        // the advisory lock: queue on the interpolated key, hold to commit
        releases.push(await lock.acquire(String(values[0] ?? "global")));
        return [];
      },
      recruitmentOtpChallenge: {
        // READ COMMITTED: counts/reads see committed rows only
        count: async (a: { where: Record<string, unknown> }) => committed.filter((r) => match(r, a.where)).length,
        findFirst: async (a: { where: Record<string, unknown> }) => {
          const hits = committed.filter((r) => match(r, a.where));
          hits.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
          return hits[0] ?? null;
        },
        updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const count = committed.filter((r) => match(r, a.where)).length;
          staged.updates.push(a);
          return { count };
        },
        create: async (a: { data: Omit<Row, "id" | "createdAt"> & { createdAt?: Date } }) => {
          stats.createAttempts++;
          const row: Row = Object.assign(
            { id: `otp-${++seq}`, createdAt: new Date(), invalidatedAt: null, consumedAt: null },
            a.data,
          ) as Row;
          staged.creates.push(row);
          return { id: row.id };
        },
      },
    };
    const commit = () => {
      // apply updates, then creates; enforce the LIVE partial unique at apply
      for (const u of staged.updates) {
        for (const r of committed) {
          if (!match(r, u.where)) continue;
          for (const [k, v] of Object.entries(u.data)) {
            if (k === "attempts" && typeof v === "object" && v !== null && "increment" in v) {
              r.attempts += (v as { increment: number }).increment;
            } else (r as unknown as Record<string, unknown>)[k] = v;
          }
        }
      }
      for (const row of staged.creates) {
        const liveDup = committed.some(
          (r) => r.identifierHmac === row.identifierHmac && r.purpose === row.purpose &&
                 r.invalidatedAt === null && r.consumedAt === null,
        );
        if (liveDup && row.invalidatedAt === null && row.consumedAt === null) {
          stats.uniqueViolations++;
          const err = Object.assign(new Error("unique"), { code: "P2002" });
          throw err;
        }
        committed.push(row);
        stats.committedCreates++;
      }
      staged.creates.length = 0;
      staged.updates.length = 0;
    };
    const releaseAll = () => { for (const r of releases.splice(0)) r(); };
    return { tx, commit, releaseAll };
  }

  const client = {
    recruitmentOtpChallenge: {
      // client-level reads/writes used by verify(): committed view, immediate
      count: async (a: { where: Record<string, unknown> }) => committed.filter((r) => match(r, a.where)).length,
      findFirst: async (a: { where: Record<string, unknown> }) => {
        const hits = committed.filter((r) => match(r, a.where));
        hits.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
        return hits[0] ?? null;
      },
      updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const r of committed) {
          if (!match(r, a.where)) continue;
          count++;
          for (const [k, v] of Object.entries(a.data)) {
            if (k === "attempts" && typeof v === "object" && v !== null && "increment" in v) {
              r.attempts += (v as { increment: number }).increment;
            } else (r as unknown as Record<string, unknown>)[k] = v;
          }
        }
        return { count };
      },
      create: async () => { throw new Error("client-level create must not happen"); },
    },
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const { tx, commit, releaseAll } = makeTx();
      try {
        const out = await fn(tx);
        commit();
        return out;
      } finally {
        releaseAll(); // lock releases at commit OR rollback, like PostgreSQL
      }
    },
  };
  return { client, committed, stats };
}

const EMAIL = "candidate@example.org";
const t0 = new Date("2026-08-24T12:00:00.000Z");
const liveRows = (rows: Row[]) => rows.filter((r) => r.invalidatedAt === null && r.consumedAt === null);

beforeEach(() => {
  process.env.RECRUITMENT_OTP_SECRET_V1 = "test-secret-v1";
  process.env.RECRUITMENT_OTP_IDENTIFIER_SECRET = "test-identifier-secret";
  h.db = null;
});
afterEach(() => {
  delete process.env.RECRUITMENT_OTP_SECRET_V1;
  delete process.env.RECRUITMENT_OTP_SECRET_V2;
  delete process.env.RECRUITMENT_OTP_IDENTIFIER_SECRET;
});

describe("B1.2 — concurrent issuance is serialized per identifier", () => {
  it("two SIMULTANEOUS issues → exactly one issued, ≤1 live challenge, and the loser never reaches create", async () => {
    const store = makeIsolatedStore();
    h.db = store.client;
    const codes: string[] = [];
    const [a, b] = await Promise.all([
      issueWithdrawalOtp({ identifier: EMAIL, deliver: async (c) => { codes.push(c); }, now: t0 }),
      issueWithdrawalOtp({ identifier: EMAIL, deliver: async (c) => { codes.push(c); }, now: t0 }),
    ]);
    const issuedCount = [a, b].filter((r) => r.issued).length;
    expect(issuedCount).toBe(1);
    expect(liveRows(store.committed)).toHaveLength(1);
    // the serialized cooldown check refuses BEFORE create — one attempt only.
    // (Without the advisory lock both racers would attempt a create and one
    // would die on the partial unique index — mutation M33 pins this.)
    expect(store.stats.createAttempts).toBe(1);
    expect(store.stats.uniqueViolations).toBe(0);
    expect(codes).toHaveLength(1);
  });

  it("the hourly ceiling cannot be overshot by concurrency", async () => {
    const store = makeIsolatedStore();
    h.db = store.client;
    // five sequential issues spaced past the cooldown fill the ceiling
    for (let i = 0; i < 5; i++) {
      const at = new Date(t0.getTime() + i * 61_000);
      const r = await issueWithdrawalOtp({ identifier: EMAIL, deliver: async () => {}, now: at });
      expect(r.issued).toBe(true);
    }
    // a concurrent burst afterwards must ALL refuse
    const later = new Date(t0.getTime() + 6 * 61_000);
    const burst = await Promise.all(
      Array.from({ length: 3 }, () => issueWithdrawalOtp({ identifier: EMAIL, deliver: async () => {}, now: later })),
    );
    expect(burst.every((r) => r.issued === false)).toBe(true);
    expect(store.stats.committedCreates).toBe(5);
  });

  it("a superseded code NEVER verifies once a newer challenge exists", async () => {
    const store = makeIsolatedStore();
    h.db = store.client;
    let first = "";
    await issueWithdrawalOtp({ identifier: EMAIL, deliver: async (c) => { first = c; }, now: t0 });
    let second = "";
    const at2 = new Date(t0.getTime() + 61_000);
    const r2 = await issueWithdrawalOtp({ identifier: EMAIL, deliver: async (c) => { second = c; }, now: at2 });
    expect(r2.issued).toBe(true);
    expect(liveRows(store.committed)).toHaveLength(1);
    if (first !== second) {
      const v = await verifyAndConsumeWithdrawalOtp({ identifier: EMAIL, code: first, now: at2 });
      expect(v).toEqual({ verified: false });
    }
    const v2 = await verifyAndConsumeWithdrawalOtp({ identifier: EMAIL, code: second, now: new Date(at2.getTime() + 5000) });
    expect(v2).toEqual({ verified: true });
  });
});
