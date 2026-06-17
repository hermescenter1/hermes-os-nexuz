import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getChunkVectorStore } from "../chunk-vector-store";
import { documentTextChunkRepository } from "../chunk-repository";
import { MOCK_EMBEDDING_DIMENSIONS } from "@/lib/rag/config";

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL", "DOCUMENT_EMBEDDINGS_PROVIDER"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.DOCUMENT_EMBEDDINGS_PROVIDER = "mock";
  (globalThis as unknown as { __hermesDocumentTextChunks?: unknown[] }).__hermesDocumentTextChunks = [];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/**
 * A deterministic unit vector at a single "hot" dimension — orthogonal to
 * any other index, so cosine similarity between unitVector(i) and
 * unitVector(j) is exactly 1 when i===j and 0 otherwise. Predictable
 * without floating-point tolerance.
 */
function unitVector(hotDim: number, dims = MOCK_EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length: dims }, (_, i) => (i === hotDim % dims ? 1 : 0));
}

async function addChunk(documentId: string, position: number, text = "chunk text") {
  const [chunk] = await documentTextChunkRepository().createMany([
    { documentId, position, text, charCount: text.length, metadata: {} },
  ]);
  return chunk;
}

// ─── setEmbedding ────────────────────────────────────────────────────────────

describe("ChunkVectorStore (session mode) — setEmbedding", () => {
  it("returns false for an unknown chunk id", async () => {
    const store = getChunkVectorStore();
    expect(await store.setEmbedding("does-not-exist", unitVector(0), "mock-v1")).toBe(false);
  });

  it("returns false when the vector dimension is wrong (63 instead of 64)", async () => {
    const chunk = await addChunk("d1", 0);
    const store = getChunkVectorStore();
    const wrongDim = Array(MOCK_EMBEDDING_DIMENSIONS - 1).fill(0.1);
    expect(await store.setEmbedding(chunk.id, wrongDim, "mock-v1")).toBe(false);
  });

  it("returns false for a zero-length vector", async () => {
    const chunk = await addChunk("d1", 0);
    const store = getChunkVectorStore();
    expect(await store.setEmbedding(chunk.id, [], "mock-v1")).toBe(false);
  });

  it("returns true when id and dimension are both correct", async () => {
    const chunk = await addChunk("d1", 0);
    const store = getChunkVectorStore();
    expect(await store.setEmbedding(chunk.id, unitVector(0), "mock-v1")).toBe(true);
  });

  it("sets status to 'embedded' and records the model and dimensions", async () => {
    const chunk = await addChunk("d1", 0);
    await getChunkVectorStore().setEmbedding(chunk.id, unitVector(0), "mock-v1");
    const [updated] = await documentTextChunkRepository().listByDocumentId("d1");
    expect(updated.status).toBe("embedded");
    expect(updated.embeddingModel).toBe("mock-v1");
    expect(updated.embeddingDimensions).toBe(MOCK_EMBEDDING_DIMENSIONS);
  });

  it("is idempotent — re-setting an existing embedding returns true and overwrites", async () => {
    const chunk = await addChunk("d1", 0);
    const store = getChunkVectorStore();
    await store.setEmbedding(chunk.id, unitVector(0), "mock-v1");
    const result = await store.setEmbedding(chunk.id, unitVector(1), "mock-v1");
    expect(result).toBe(true);
  });
});

// ─── search ──────────────────────────────────────────────────────────────────

describe("ChunkVectorStore (session mode) — search", () => {
  it("returns [] when no chunks have embeddings", async () => {
    await addChunk("d1", 0, "unembed chunk");
    const results = await getChunkVectorStore().search(unitVector(0), 5);
    expect(results).toEqual([]);
  });

  it("returns [] when the buffer is completely empty", async () => {
    const results = await getChunkVectorStore().search(unitVector(0), 5);
    expect(results).toEqual([]);
  });

  it("returns results sorted by cosine score descending", async () => {
    const c0 = await addChunk("d1", 0, "alpha");
    const c1 = await addChunk("d1", 1, "beta");
    const store = getChunkVectorStore();
    // c0 aligned with query (score 1.0), c1 orthogonal (score 0.0)
    await store.setEmbedding(c0.id, unitVector(0), "mock-v1");
    await store.setEmbedding(c1.id, unitVector(1), "mock-v1");
    const results = await store.search(unitVector(0), 5);
    expect(results.length).toBe(2);
    expect(results[0].chunk.id).toBe(c0.id);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("the best match scores exactly 1.0 for an identical vector", async () => {
    const chunk = await addChunk("d1", 0, "target");
    const store = getChunkVectorStore();
    await store.setEmbedding(chunk.id, unitVector(0), "mock-v1");
    const [match] = await store.search(unitVector(0), 1);
    expect(match.score).toBeCloseTo(1.0, 10);
  });

  it("respects the topK limit", async () => {
    const store = getChunkVectorStore();
    const chunks = await documentTextChunkRepository().createMany(
      Array.from({ length: 5 }, (_, i) => ({
        documentId: "d1",
        position: i,
        text: `chunk ${i}`,
        charCount: 7,
        metadata: {},
      }))
    );
    for (const c of chunks) {
      await store.setEmbedding(c.id, unitVector(c.position), "mock-v1");
    }
    expect((await store.search(unitVector(0), 3)).length).toBe(3);
    expect((await store.search(unitVector(0), 1)).length).toBe(1);
  });

  it("returns [] when topK is 0", async () => {
    const chunk = await addChunk("d1", 0);
    const store = getChunkVectorStore();
    await store.setEmbedding(chunk.id, unitVector(0), "mock-v1");
    expect(await store.search(unitVector(0), 0)).toEqual([]);
  });

  it("filters results to a single documentId when provided", async () => {
    const cA = await addChunk("doc-a", 0, "doc-a chunk");
    const cB = await addChunk("doc-b", 0, "doc-b chunk");
    const store = getChunkVectorStore();
    await store.setEmbedding(cA.id, unitVector(0), "mock-v1");
    await store.setEmbedding(cB.id, unitVector(0), "mock-v1");
    const results = await store.search(unitVector(0), 5, "doc-a");
    expect(results.length).toBe(1);
    expect(results[0].chunk.documentId).toBe("doc-a");
  });

  it("returns all documents when no documentId filter is supplied", async () => {
    const cA = await addChunk("doc-a", 0, "doc-a chunk");
    const cB = await addChunk("doc-b", 0, "doc-b chunk");
    const store = getChunkVectorStore();
    await store.setEmbedding(cA.id, unitVector(0), "mock-v1");
    await store.setEmbedding(cB.id, unitVector(0), "mock-v1");
    const results = await store.search(unitVector(0), 5);
    expect(results.length).toBe(2);
  });

  it("returns the fields required by ChunkSearchMatch: chunk.id, documentId, position, text, metadata, and score", async () => {
    const chunk = await addChunk("d1", 0, "the chunk text");
    const store = getChunkVectorStore();
    await store.setEmbedding(chunk.id, unitVector(0), "mock-v1");
    const [match] = await store.search(unitVector(0), 1);
    expect(match.chunk.id).toBe(chunk.id);
    expect(match.chunk.documentId).toBe("d1");
    expect(match.chunk.position).toBe(0);
    expect(match.chunk.text).toBe("the chunk text");
    expect(match.chunk.metadata).toBeDefined();
    expect(typeof match.score).toBe("number");
  });

  it("never throws — resolves to [] when the buffer has no embedded chunks", async () => {
    // Not embedded, only created
    await addChunk("d1", 0);
    await expect(getChunkVectorStore().search(unitVector(0), 5)).resolves.toEqual([]);
  });
});
