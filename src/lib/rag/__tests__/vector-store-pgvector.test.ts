import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createPgVectorStore } from "../vector-store-pgvector";
import type { RagChunk, RagEmbedding } from "../types";

/**
 * No real PostgreSQL/pgvector is available in this test environment (no
 * DATABASE_URL configured anywhere in the suite) — these tests verify the
 * documented degrade behavior: `getPrisma()` returns null without
 * DATABASE_URL, so every method here must resolve safely instead of
 * throwing or hanging. Exercising a real pgvector query requires a live
 * Postgres instance with the table/extension provisioned (Phase 14C+).
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
