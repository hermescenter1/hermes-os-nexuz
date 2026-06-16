import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPgVectorStore } from "../vector-store-pgvector";
import { PGVECTOR_DIMENSIONS } from "../config";
import type { RagChunk, RagEmbedding } from "../types";

/**
 * No real PostgreSQL/pgvector is available in this test environment (no
 * DATABASE_URL configured anywhere in the suite) — most tests below verify
 * the documented degrade behavior: `getPrisma()` returns null without
 * DATABASE_URL, so every method here must resolve safely instead of
 * throwing or hanging. Exercising a real pgvector query requires a live
 * Postgres instance with the migration applied (intentionally not done in
 * this environment — see vector-store-pgvector.ts's header comment).
 *
 * The "dimension strategy" describe block below uses a mocked `getPrisma`
 * so the dimension guard's gating behavior (does it even attempt a query?)
 * is verifiable independently of whether a real database exists.
 */

const ENV_KEYS = ["DATABASE_URL", "HERMES_STORAGE_MODE"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function chunk(id: string): RagChunk {
  return { id, documentId: "d1", sourceType: "test", text: "hello", position: 0 };
}
function embedding(chunkId: string): RagEmbedding {
  return { chunkId, vector: [0.1, 0.2, 0.3], dimensions: 3, model: "test" };
}

describe("createPgVectorStore — no database configured", () => {
  it("add() resolves without throwing (safe no-op)", async () => {
    const store = createPgVectorStore();
    await expect(store.add(chunk("c1"), embedding("c1"))).resolves.toBeUndefined();
  });

  it("search() resolves to an empty array rather than throwing", async () => {
    const store = createPgVectorStore();
    const results = await store.search({ vector: [0.1, 0.2, 0.3], topK: 5 });
    expect(results).toEqual([]);
  });

  it("search() with metadata filters still resolves safely", async () => {
    const store = createPgVectorStore();
    const results = await store.search({
      vector: [0.1, 0.2, 0.3],
      topK: 5,
      filters: { domain: "plc" },
    });
    expect(results).toEqual([]);
  });

  it("add() then search() never crashes the calling pipeline", async () => {
    const store = createPgVectorStore();
    await store.add(chunk("c1"), embedding("c1"));
    const results = await store.search({ vector: [0.1, 0.2, 0.3], topK: 5 });
    expect(results).toEqual([]);
  });
});

describe("createPgVectorStore — explicit database mode but no real connection", () => {
  it("still degrades safely instead of throwing or hanging", async () => {
    process.env.HERMES_STORAGE_MODE = "database";
    process.env.DATABASE_URL = "postgresql://invalid:invalid@127.0.0.1:1/invalid";
    const store = createPgVectorStore();
    await expect(store.add(chunk("c1"), embedding("c1"))).resolves.toBeUndefined();
    await expect(store.search({ vector: [0.1, 0.2, 0.3], topK: 5 })).resolves.toEqual([]);
  }, 20_000);
});

describe("createPgVectorStore — dimension strategy (mocked database)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/db/prisma");
  });

  it("rejects (never even queries) an embedding whose dimensions don't match PGVECTOR_DIMENSIONS", async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(1);
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ $executeRawUnsafe: executeRawUnsafe, $queryRawUnsafe: vi.fn() }),
    }));

    const { createPgVectorStore: create } = await import("../vector-store-pgvector");
    const store = create();
    const wrongDimension: RagEmbedding = {
      chunkId: "c1",
      vector: Array(64).fill(0.1),
      dimensions: 64, // mock provider's dimension, not PGVECTOR_DIMENSIONS
      model: "mock-embedding-v1",
    };
    await store.add(chunk("c1"), wrongDimension);
    expect(executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("attempts the query for an embedding whose dimensions match PGVECTOR_DIMENSIONS", async () => {
    const executeRawUnsafe = vi.fn().mockResolvedValue(1);
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ $executeRawUnsafe: executeRawUnsafe, $queryRawUnsafe: vi.fn() }),
    }));

    const { createPgVectorStore: create } = await import("../vector-store-pgvector");
    const store = create();
    const correctDimension: RagEmbedding = {
      chunkId: "c1",
      vector: Array(PGVECTOR_DIMENSIONS).fill(0.1),
      dimensions: PGVECTOR_DIMENSIONS,
      model: "text-embedding-3-small",
    };
    await store.add(chunk("c1"), correctDimension);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it("rejects (never even queries) a search vector whose length doesn't match PGVECTOR_DIMENSIONS", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ $executeRawUnsafe: vi.fn(), $queryRawUnsafe: queryRawUnsafe }),
    }));

    const { createPgVectorStore: create } = await import("../vector-store-pgvector");
    const store = create();
    const results = await store.search({ vector: Array(64).fill(0.1), topK: 5 });
    expect(results).toEqual([]);
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("attempts the query for a search vector whose length matches PGVECTOR_DIMENSIONS", async () => {
    const queryRawUnsafe = vi.fn().mockResolvedValue([]);
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({ $executeRawUnsafe: vi.fn(), $queryRawUnsafe: queryRawUnsafe }),
    }));

    const { createPgVectorStore: create } = await import("../vector-store-pgvector");
    const store = create();
    await store.search({ vector: Array(PGVECTOR_DIMENSIONS).fill(0.1), topK: 5 });
    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
