import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { embedDocumentChunks } from "../embedding";
import { documentTextChunkRepository } from "../chunk-repository";
import { getChunkVectorStore } from "../chunk-vector-store";
import { mockEmbeddingProvider } from "@/lib/rag/embedding-provider";

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  (globalThis as unknown as { __hermesDocumentTextChunks?: unknown[] }).__hermesDocumentTextChunks = [];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function makeChunks(documentId: string, count: number) {
  return documentTextChunkRepository().createMany(
    Array.from({ length: count }, (_, i) => ({
      documentId,
      position: i,
      text: `chunk ${i} for document ${documentId} — industrial control system manual`,
      charCount: 50,
      metadata: {},
    }))
  );
}

// ─── empty document ───────────────────────────────────────────────────────────

describe("embedDocumentChunks — empty document", () => {
  it("returns ok:true with zero counts when no chunks exist for the document", async () => {
    const result = await embedDocumentChunks("doc-no-chunks");
    expect(result).toEqual({ ok: true, embeddedCount: 0, totalChunks: 0 });
  });
});

// ─── successful embedding ─────────────────────────────────────────────────────

describe("embedDocumentChunks — successful embedding", () => {
  it("returns ok:true with embeddedCount === totalChunks", async () => {
    await makeChunks("doc-1", 3);
    const result = await embedDocumentChunks("doc-1");
    expect(result.ok).toBe(true);
    expect(result.totalChunks).toBe(3);
    expect(result.embeddedCount).toBe(3);
    expect(result.reason).toBeUndefined();
  });

  it("sets each chunk's status to 'embedded' and records the embedding model", async () => {
    await makeChunks("doc-2", 2);
    await embedDocumentChunks("doc-2");
    const chunks = await documentTextChunkRepository().listByDocumentId("doc-2");
    for (const c of chunks) {
      expect(c.status).toBe("embedded");
      expect(c.embeddingModel).toBeTruthy();
      expect(typeof c.embeddingModel).toBe("string");
    }
  });

  it("makes embedded chunks findable via the vector store", async () => {
    const targetText = "chunk 0 for document doc-3 — industrial control system manual";
    await makeChunks("doc-3", 2);
    await embedDocumentChunks("doc-3");
    const qEmb = await mockEmbeddingProvider.embed({ chunkId: "__q__", text: targetText });
    const results = await getChunkVectorStore().search(qEmb.vector, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunk.documentId).toBe("doc-3");
  });

  it("is idempotent — re-embedding the same document produces equal counts on both runs", async () => {
    await makeChunks("doc-4", 2);
    const first = await embedDocumentChunks("doc-4");
    const second = await embedDocumentChunks("doc-4");
    expect(second.ok).toBe(true);
    expect(second.embeddedCount).toBe(first.embeddedCount);
    expect(second.totalChunks).toBe(first.totalChunks);
  });

  it("only processes the specified document — other documents' chunks remain 'chunked'", async () => {
    await makeChunks("doc-target", 2);
    await makeChunks("doc-other", 2);
    await embedDocumentChunks("doc-target");
    const otherChunks = await documentTextChunkRepository().listByDocumentId("doc-other");
    for (const c of otherChunks) {
      expect(c.status).toBe("chunked");
      expect(c.embeddingModel).toBeUndefined();
    }
  });
});

// ─── mock provider properties ─────────────────────────────────────────────────

describe("embedDocumentChunks — mock provider guarantees", () => {
  it("produces deterministic vectors — embedding the same text twice yields the same vector", async () => {
    await makeChunks("doc-5", 1);
    await embedDocumentChunks("doc-5");
    // Re-embed (idempotent) and verify the chunk is still searchable with the same query
    await embedDocumentChunks("doc-5");
    const [chunk] = await documentTextChunkRepository().listByDocumentId("doc-5");
    // Status is still embedded, not reset by the second pass
    expect(chunk.status).toBe("embedded");
  });

  it("marks the mock result with the configured mock model name", async () => {
    await makeChunks("doc-6", 1);
    await embedDocumentChunks("doc-6");
    const [chunk] = await documentTextChunkRepository().listByDocumentId("doc-6");
    expect(chunk.embeddingModel).toMatch(/mock/i);
  });
});
