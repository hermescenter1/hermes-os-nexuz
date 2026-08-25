/**
 * PHASE 104-B1 — the idempotency contract, run against the REAL module with a
 * captured fake store.
 *
 *   - deterministic canonicalization (field order cannot change the digest);
 *   - the raw key is never stored — only its SHA-256;
 *   - same key + same payload   → REPLAY of the stored result, no second write;
 *   - same key + other payload  → PAYLOAD_MISMATCH, WRITE_COUNT=0;
 *   - the claim is the INSERT itself (P2002 loses), never check-then-insert;
 *   - an expired claim is treated as unseen;
 *   - the key FORMAT (base64url alphabet, 22..128 chars) is enforced before
 *     any store work — a format floor, never an entropy guarantee.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/prisma", () => ({ getPrisma: async () => h.db }));

import {
  canonicalizePayload,
  fingerprintPayload,
  hashKey,
  validateIdempotencyKey,
  claimIdempotencyKey,
  IDEMPOTENCY_KEY_MAX_BYTES,
} from "../idempotency";

interface Row {
  id: string;
  organizationId: string;
  jobId: string;
  keyHash: string;
  payloadHash: string;
  status: string;
  resultId: string | null;
  expiresAt: Date;
}

function makeStore(seed: Row[] = []) {
  const rows = [...seed];
  const stored: Record<string, unknown>[] = [];
  const model = {
    create: async (a: { data: Omit<Row, "id" | "resultId"> }) => {
      const dup = rows.find(
        (r) => r.organizationId === a.data.organizationId && r.jobId === a.data.jobId && r.keyHash === a.data.keyHash,
      );
      if (dup) throw Object.assign(new Error("dup"), { code: "P2002" });
      const row: Row = { id: `idem-${rows.length + 1}`, resultId: null, ...a.data };
      rows.push(row);
      stored.push(a.data);
      return { id: row.id };
    },
    findUnique: async (a: { where: { organizationId_jobId_keyHash: { organizationId: string; jobId: string; keyHash: string } } }) => {
      const k = a.where.organizationId_jobId_keyHash;
      return rows.find((r) => r.organizationId === k.organizationId && r.jobId === k.jobId && r.keyHash === k.keyHash) ?? null;
    },
    update: async (a: { where: { id: string }; data: Partial<Row> }) => {
      const row = rows.find((r) => r.id === a.where.id);
      if (row) Object.assign(row, a.data);
      return row;
    },
    delete: async (a: { where: { id: string } }) => {
      const i = rows.findIndex((r) => r.id === a.where.id);
      if (i >= 0) rows.splice(i, 1);
      return {};
    },
  };
  return { client: { recruitmentIdempotencyKey: model }, rows, stored };
}

const KEY = "9f2c1d3e4b5a6978a0b1c2d3e4f50617";
const now = new Date("2026-08-24T12:00:00.000Z");

beforeEach(() => {
  h.db = null;
});

describe("key validation", () => {
  it("enforces presence, the FORMAT floor (base64url, 22..128 chars) and the max length before any parsing", () => {
    expect(validateIdempotencyKey(null)).toEqual({ ok: false, reason: "MISSING" });
    expect(validateIdempotencyKey("short")).toEqual({ ok: false, reason: "TOO_SHORT" });
    expect(validateIdempotencyKey("x".repeat(IDEMPOTENCY_KEY_MAX_BYTES + 1))).toEqual({ ok: false, reason: "TOO_LONG" });
    // B1.1 — the contract is a validated FORMAT (base64url alphabet), stated
    // as a format minimum, never as an entropy guarantee
    expect(validateIdempotencyKey("!".repeat(30))).toEqual({ ok: false, reason: "BAD_FORMAT" });
    expect(validateIdempotencyKey("aaaa bbbb cccc dddd eee")).toEqual({ ok: false, reason: "BAD_FORMAT" });
    expect(validateIdempotencyKey(KEY)).toEqual({ ok: true });
  });
});

describe("canonical fingerprint", () => {
  it("is deterministic under field reordering, and differs for different payloads", () => {
    const a = canonicalizePayload({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } });
    const b = canonicalizePayload({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(fingerprintPayload(a, "s")).toBe(fingerprintPayload(b, "s"));
    expect(fingerprintPayload(canonicalizePayload({ x: 1 }), "s")).not.toBe(fingerprintPayload(a, "s"));
  });
});

describe("atomic claim", () => {
  const args = (payloadHash: string) => ({
    organizationId: "org-1",
    jobId: "job-1",
    rawKey: KEY,
    payloadHash,
    now,
  });

  it("claims by INSERT and stores only the key HASH, never the raw key", async () => {
    const store = makeStore();
    h.db = store.client;
    const res = await claimIdempotencyKey(args("ph-1"));
    expect(res).toEqual({ outcome: "CLAIMED", claimId: "idem-1" });
    expect(JSON.stringify(store.stored)).not.toContain(KEY);
    expect((store.stored[0] as { keyHash: string }).keyHash).toBe(hashKey(KEY));
  });

  it("same key + same payload replays the stored result with no second write", async () => {
    const store = makeStore([{
      id: "idem-0", organizationId: "org-1", jobId: "job-1",
      keyHash: hashKey(KEY), payloadHash: "ph-1", status: "COMPLETED",
      resultId: "app-1", expiresAt: new Date(now.getTime() + 3600_000),
    }]);
    h.db = store.client;
    const res = await claimIdempotencyKey(args("ph-1"));
    expect(res).toEqual({ outcome: "REPLAY", resultId: "app-1" });
    expect(store.stored).toHaveLength(0);
  });

  it("same key + DIFFERENT payload is refused with zero writes", async () => {
    const store = makeStore([{
      id: "idem-0", organizationId: "org-1", jobId: "job-1",
      keyHash: hashKey(KEY), payloadHash: "ph-1", status: "COMPLETED",
      resultId: "app-1", expiresAt: new Date(now.getTime() + 3600_000),
    }]);
    h.db = store.client;
    const res = await claimIdempotencyKey(args("ph-OTHER"));
    expect(res).toEqual({ outcome: "PAYLOAD_MISMATCH" });
    expect(store.stored).toHaveLength(0);
  });

  it("an in-flight claim answers PENDING, not a duplicate write", async () => {
    const store = makeStore([{
      id: "idem-0", organizationId: "org-1", jobId: "job-1",
      keyHash: hashKey(KEY), payloadHash: "ph-1", status: "CLAIMED",
      resultId: null, expiresAt: new Date(now.getTime() + 3600_000),
    }]);
    h.db = store.client;
    expect(await claimIdempotencyKey(args("ph-1"))).toEqual({ outcome: "PENDING" });
  });

  it("an EXPIRED claim is unseen: delete and re-claim", async () => {
    const store = makeStore([{
      id: "idem-0", organizationId: "org-1", jobId: "job-1",
      keyHash: hashKey(KEY), payloadHash: "ph-OLD", status: "COMPLETED",
      resultId: "app-old", expiresAt: new Date(now.getTime() - 1000),
    }]);
    h.db = store.client;
    const res = await claimIdempotencyKey(args("ph-NEW"));
    expect(res.outcome).toBe("CLAIMED");
  });

  it("claims by INSERT FIRST — check-then-insert would hand two racers the same claim", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/ats/idempotency.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l: string) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    const createAt = src.indexOf("m.create(");
    const lookupAt = src.indexOf("m.findUnique(");
    expect(createAt).toBeGreaterThan(-1);
    expect(lookupAt).toBeGreaterThan(-1);
    expect(createAt).toBeLessThan(lookupAt);
  });
  it("fails closed when the store is unavailable", async () => {
    h.db = null;
    expect(await claimIdempotencyKey(args("ph-1"))).toEqual({ outcome: "STORE_UNAVAILABLE" });
  });
});
