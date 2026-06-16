import { describe, it, expect } from "vitest";
import { mockEmbeddingProvider } from "../embedding-provider";
import { MOCK_EMBEDDING_DIMENSIONS } from "../config";

describe("mockEmbeddingProvider", () => {
  it("is deterministic — identical text produces an identical vector", async () => {
    const a = await mockEmbeddingProvider.embed({ chunkId: "c1", text: "motor overcurrent fault" });
    const b = await mockEmbeddingProvider.embed({ chunkId: "c2", text: "motor overcurrent fault" });
    expect(a.vector).toEqual(b.vector);
  });

  it("produces a fixed dimension regardless of input length", async () => {
    const short = await mockEmbeddingProvider.embed({ chunkId: "c1", text: "x" });
    const long = await mockEmbeddingProvider.embed({ chunkId: "c2", text: "x".repeat(5000) });
    expect(short.vector.length).toBe(MOCK_EMBEDDING_DIMENSIONS);
    expect(long.vector.length).toBe(MOCK_EMBEDDING_DIMENSIONS);
    expect(short.dimensions).toBe(MOCK_EMBEDDING_DIMENSIONS);
    expect(mockEmbeddingProvider.dimensions).toBe(MOCK_EMBEDDING_DIMENSIONS);
  });

  it("produces a different vector for different text", async () => {
    const a = await mockEmbeddingProvider.embed({ chunkId: "c1", text: "PLC scan time drift" });
    const b = await mockEmbeddingProvider.embed({ chunkId: "c1", text: "SCADA tag freeze" });
    expect(a.vector).not.toEqual(b.vector);
  });

  it("never calls out — resolves synchronously fast and makes no network access", async () => {
    const start = Date.now();
    await mockEmbeddingProvider.embed({ chunkId: "c1", text: "deterministic and offline" });
    expect(Date.now() - start).toBeLessThan(50);
  });

  it("echoes the given chunkId back on the result", async () => {
    const res = await mockEmbeddingProvider.embed({ chunkId: "abc-123", text: "hello" });
    expect(res.chunkId).toBe("abc-123");
  });

  it("every component is within [-1, 1]", async () => {
    const res = await mockEmbeddingProvider.embed({ chunkId: "c1", text: "bounds check" });
    for (const v of res.vector) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
