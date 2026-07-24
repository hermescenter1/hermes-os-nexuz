import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  reserveNonce,
  reserveImport,
  isUniqueViolation,
  prunableBefore,
  UNIQUE_VIOLATION,
} from "../reservations";
import { ENVELOPE_LIMITS } from "../gateway-envelope";

/**
 * PHASE 94B — durable replay / idempotency reservation.
 *
 * The fake below reproduces the ONE property that matters: a unique constraint
 * rejects the second writer. Testing against it proves the reservation relies
 * on the database as arbiter rather than on a read-then-write check, which is
 * what makes it correct under concurrency and across replicas.
 */

class UniqueViolation extends Error {
  code = UNIQUE_VIOLATION;
}

/** A table with a composite unique key, mimicking Postgres semantics. */
function fakeTable<T extends Record<string, unknown>>(uniqueKeys: string[][]) {
  const rows: T[] = [];
  const keyOf = (row: Record<string, unknown>, cols: string[]) =>
    cols.map((c) => String(row[c])).join("\u0000");

  return {
    rows,
    async create({ data }: { data: T }) {
      for (const cols of uniqueKeys) {
        const k = keyOf(data, cols);
        if (rows.some((r) => keyOf(r, cols) === k)) throw new UniqueViolation();
      }
      rows.push(data);
      return data;
    },
    async findFirst({ where }: { where: Record<string, unknown> }) {
      return (
        rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null
      );
    },
  };
}

const NOW = new Date("2026-07-21T12:00:00.000Z");
const NONCE_INPUT = {
  organizationId: "org-1",
  gatewayId: "gw-1",
  nonce: "n".repeat(32),
  expiresAt: new Date(NOW.getTime() + ENVELOPE_LIMITS.nonceRetentionMs),
};

describe("94B — nonce reservation is durable and race-free", () => {
  it("reserves an unseen nonce", async () => {
    const t = fakeTable<typeof NONCE_INPUT>([["gatewayId", "nonce"]]);
    expect(await reserveNonce(t, NONCE_INPUT)).toBe("RESERVED");
    expect(t.rows).toHaveLength(1);
  });

  it("rejects the same nonce a second time — that is a replay", async () => {
    const t = fakeTable<typeof NONCE_INPUT>([["gatewayId", "nonce"]]);
    await reserveNonce(t, NONCE_INPUT);
    expect(await reserveNonce(t, NONCE_INPUT)).toBe("DUPLICATE");
    expect(t.rows, "no second row is written").toHaveLength(1);
  });

  it("concurrent duplicate submissions: exactly one wins", async () => {
    const t = fakeTable<typeof NONCE_INPUT>([["gatewayId", "nonce"]]);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserveNonce(t, NONCE_INPUT)),
    );
    expect(results.filter((r) => r === "RESERVED")).toHaveLength(1);
    expect(results.filter((r) => r === "DUPLICATE")).toHaveLength(19);
    expect(t.rows).toHaveLength(1);
  });

  it("the same nonce from a DIFFERENT gateway is not a replay", async () => {
    const t = fakeTable<typeof NONCE_INPUT>([["gatewayId", "nonce"]]);
    await reserveNonce(t, NONCE_INPUT);
    expect(await reserveNonce(t, { ...NONCE_INPUT, gatewayId: "gw-2" })).toBe("RESERVED");
  });

  it("a non-uniqueness error is propagated, never swallowed as DUPLICATE", async () => {
    const broken = { async create() { throw new Error("connection lost"); } };
    await expect(reserveNonce(broken, NONCE_INPUT)).rejects.toThrow("connection lost");
  });

  it("recognises both Prisma and raw Postgres unique-violation codes", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueViolation(new Error("x"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it("retention bounds growth only — it cannot admit a replay", () => {
    // A nonce is prunable only once it is older than the retention window, and
    // retention exceeds the skew window, so anything prunable would already be
    // rejected as STALE_TIMESTAMP before replay is consulted.
    expect(ENVELOPE_LIMITS.nonceRetentionMs).toBeGreaterThan(ENVELOPE_LIMITS.maxClockSkewMs);
    const cutoff = prunableBefore(NOW, ENVELOPE_LIMITS.nonceRetentionMs);
    expect(cutoff.getTime()).toBe(NOW.getTime() - ENVELOPE_LIMITS.nonceRetentionMs);
    const newestPrunableAge = NOW.getTime() - cutoff.getTime();
    expect(newestPrunableAge).toBeGreaterThan(ENVELOPE_LIMITS.maxClockSkewMs);
  });
});

describe("94B — import idempotency is durable", () => {
  type Row = { organizationId: string; idempotencyKey: string; checksum: string; status: string };
  const table = () =>
    fakeTable<Row>([["organizationId", "idempotencyKey"], ["organizationId", "checksum"]]);

  const INPUT = {
    organizationId: "org-1",
    idempotencyKey: "idem-1",
    checksum: "c".repeat(64),
    data: { organizationId: "org-1", idempotencyKey: "idem-1", checksum: "c".repeat(64), status: "PENDING" },
  };

  it("reserves a first-time import", async () => {
    const t = table();
    const r = await reserveImport(t, INPUT);
    expect(r.outcome).toBe("RESERVED");
    expect(t.rows).toHaveLength(1);
  });

  it("a retried idempotency key returns the ORIGINAL row, not a second import", async () => {
    const t = table();
    await reserveImport(t, INPUT);
    const r = await reserveImport(t, INPUT);
    expect(r.outcome).toBe("DUPLICATE_KEY");
    if (r.outcome === "DUPLICATE_KEY") expect(r.existing?.idempotencyKey).toBe("idem-1");
    expect(t.rows, "the import executes at most once").toHaveLength(1);
  });

  it("distinguishes the same CONTENT under a new key from a retried key", async () => {
    const t = table();
    await reserveImport(t, INPUT);
    const r = await reserveImport(t, {
      ...INPUT,
      idempotencyKey: "idem-2",
      data: { ...INPUT.data, idempotencyKey: "idem-2" },
    });
    expect(r.outcome).toBe("DUPLICATE_CONTENT");
    if (r.outcome === "DUPLICATE_CONTENT") expect(r.existing?.checksum).toBe(INPUT.checksum);
  });

  it("concurrent duplicate submissions execute the import exactly once", async () => {
    const t = table();
    const results = await Promise.all(Array.from({ length: 12 }, () => reserveImport(t, INPUT)));
    expect(results.filter((r) => r.outcome === "RESERVED")).toHaveLength(1);
    expect(t.rows).toHaveLength(1);
  });

  it("a different tenant may use the same idempotency key", async () => {
    const t = table();
    await reserveImport(t, INPUT);
    const r = await reserveImport(t, {
      ...INPUT,
      organizationId: "org-2",
      data: { ...INPUT.data, organizationId: "org-2" },
    });
    expect(r.outcome).toBe("RESERVED");
  });

  it("the reservation row starts non-terminal, so a failure cannot look completed", async () => {
    const t = table();
    await reserveImport(t, INPUT);
    expect(t.rows[0].status).not.toBe("APPLIED");
    expect(["PENDING", "VALIDATING"]).toContain(t.rows[0].status);
  });
});

describe("94B — the database is the authority, not process memory", () => {
  const src = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/reservations.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");

  it("keeps no module-level cache of seen nonces or keys", () => {
    expect(src).not.toMatch(/new Set\(/);
    expect(src).not.toMatch(/new Map\(/);
    expect(src, "no mutable module state").not.toMatch(/^\s*(let|var)\s/m);
  });

  it("decides by attempting the write, never by read-then-write", () => {
    // A findFirst-before-create would race: two requests could both read
    // "absent" and both insert.
    const reserveNonceBody = src.slice(src.indexOf("export async function reserveNonce"));
    const body = reserveNonceBody.slice(0, reserveNonceBody.indexOf("\n}"));
    expect(body).toMatch(/create\(/);
    expect(body, "must not pre-check existence").not.toMatch(/findFirst|findUnique|count\(/);
  });
});
