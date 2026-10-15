import { describe, expect, it, vi } from "vitest";
import { canonicalIdempotencyKey, hashKey } from "../keys";
import { runIdempotentWrite, type IdempotencyDelegate, type IdempotencyStore } from "../transactional";

const KEY = "abcdefghijklmnopqrstuvwx";

function fakeStore() {
  const create = vi.fn<(args: unknown) => Promise<unknown>>(async () => ({}));
  const findUnique = vi.fn<(args: unknown) => Promise<null>>(async () => null);
  const delegate: IdempotencyDelegate = {
    findUnique: findUnique as IdempotencyDelegate["findUnique"],
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: create as IdempotencyDelegate["create"],
  };
  const store = {
    idempotencyKey: delegate,
    $transaction: async <R>(fn: (tx: { idempotencyKey: IdempotencyDelegate }) => Promise<R>) => fn({ idempotencyKey: delegate }),
  } as unknown as IdempotencyStore;
  return { store, create, findUnique };
}

describe("canonicalIdempotencyKey: trimmed once, at the boundary", () => {
  it("removes surrounding whitespace and keeps the inner characters", () => {
    expect(canonicalIdempotencyKey(`  ${KEY}  `)).toBe(KEY);
  });

  it("answers null for a missing, empty or whitespace-only key", () => {
    expect(canonicalIdempotencyKey(undefined)).toBeNull();
    expect(canonicalIdempotencyKey(null)).toBeNull();
    expect(canonicalIdempotencyKey("")).toBeNull();
    expect(canonicalIdempotencyKey("   ")).toBeNull();
  });
});

describe("runIdempotentWrite: the canonical key is the only key used", () => {
  it("refuses an untrimmed key before any read or write, so two spellings can never diverge", async () => {
    const { store, create, findUnique } = fakeStore();
    const write = vi.fn(async () => ({ resultType: "T", resultId: "1", value: "v" }));
    const outcome = await runIdempotentWrite({
      store,
      organizationId: "org-A",
      actorUserId: "u-1",
      operation: "erp.test",
      rawKey: `  ${KEY}  `,
      payload: { a: 1 },
      write,
      replay: async () => null,
    });
    expect(outcome).toEqual({ kind: "refused", reason: "KEY_INVALID" });
    expect(findUnique).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("stores and looks up the hash of the canonical key", async () => {
    const { store, create } = fakeStore();
    const canonical = canonicalIdempotencyKey(`  ${KEY}  `);
    expect(canonical).not.toBeNull();
    const outcome = await runIdempotentWrite({
      store,
      organizationId: "org-A",
      actorUserId: "u-1",
      operation: "erp.test",
      rawKey: canonical,
      payload: { a: 1 },
      write: async () => ({ resultType: "T", resultId: "1", value: "v" }),
      replay: async () => null,
    });
    expect(outcome.kind).toBe("created");
    const stored = create.mock.calls[0][0] as { data: { keyHash: string } };
    expect(stored.data.keyHash).toBe(hashKey(KEY));
  });
});
