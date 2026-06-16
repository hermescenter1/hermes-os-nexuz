import { describe, it, expect } from "vitest";
import { createInMemoryVectorStore, cosineSimilarity } from "../vector-store";
import type { RagChunk, RagEmbedding } from "../types";

function chunk(id: string, metadata?: Record<string, unknown>): RagChunk {
  return { id, documentId: "d1", sourceType: "test", text: id, position: 0, metadata };
}
function embedding(chunkId: string, vector: number[]): RagEmbedding {
  return { chunkId, vector, dimensions: vector.length, model: "test" };
}

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });
  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is -1 for exactly opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
  it("is 0 (not NaN) for a zero vector", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
  it("is 0 (not NaN) for mismatched dimensions", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
  it("scales correctly for non-unit vectors of the same direction", () => {
    expect(cosineSimilarity([2, 0], [10, 0])).toBeCloseTo(1);
  });
});

describe("createInMemoryVectorStore", () => {
  it("returns ranked results by cosine similarity, highest first", async () => {
    const store = createInMemoryVectorStore();
    await store.add(chunk("close"), embedding("close", [1, 0]));
    await store.add(chunk("far"), embedding("far", [0, 1]));
    await store.add(chunk("opposite"), embedding("opposite", [-1, 0]));

    const results = await store.search({ vector: [1, 0], topK: 10 });
    expect(results.map((r) => r.chunk.id)).toEqual(["close", "far", "opposite"]);
    expect(results[0].score).toBeCloseTo(1);
    expect(results[2].score).toBeCloseTo(-1);
  });

  it("respects topK", async () => {
    const store = createInMemoryVectorStore();
    for (let i = 0; i < 10; i++) {
      await store.add(chunk(`c${i}`), embedding(`c${i}`, [1, i]));
    }
    const results = await store.search({ vector: [1, 0], topK: 3 });
    expect(results.length).toBe(3);
  });

  it("filters by metadata equality before ranking", async () => {
    const store = createInMemoryVectorStore();
    await store.add(chunk("plc-1", { domain: "plc" }), embedding("plc-1", [1, 0]));
    await store.add(chunk("scada-1", { domain: "scada" }), embedding("scada-1", [1, 0]));
    await store.add(chunk("plc-2", { domain: "plc" }), embedding("plc-2", [0, 1]));

    const results = await store.search({ vector: [1, 0], topK: 10, filters: { domain: "plc" } });
    expect(results.map((r) => r.chunk.id).sort()).toEqual(["plc-1", "plc-2"]);
  });

  it("has no persistence — a fresh store is always empty", async () => {
    const store = createInMemoryVectorStore();
    const results = await store.search({ vector: [1, 0], topK: 10 });
    expect(results).toEqual([]);
  });

  it("clear() empties a populated store", async () => {
    const store = createInMemoryVectorStore();
    await store.add(chunk("a"), embedding("a", [1, 0]));
    await store.clear?.();
    const results = await store.search({ vector: [1, 0], topK: 10 });
    expect(results).toEqual([]);
  });

  it("two stores never share state", async () => {
    const storeA = createInMemoryVectorStore();
    const storeB = createInMemoryVectorStore();
    await storeA.add(chunk("only-in-a"), embedding("only-in-a", [1, 0]));
    const resultsB = await storeB.search({ vector: [1, 0], topK: 10 });
    expect(resultsB).toEqual([]);
  });
});
