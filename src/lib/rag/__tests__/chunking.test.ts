import { describe, it, expect } from "vitest";
import { chunkText, chunkDocument, stableChunkId, hashString } from "../chunking";

describe("chunkText — determinism / stability", () => {
  it("produces identical output across repeated calls on the same input", () => {
    const text = "A".repeat(1234);
    const a = chunkText(text, { maxChunkSize: 100, overlap: 20 });
    const b = chunkText(text, { maxChunkSize: 100, overlap: 20 });
    expect(a).toEqual(b);
  });

  it("returns [] for empty or whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("returns a single chunk when text is shorter than maxChunkSize", () => {
    const text = "short text";
    const chunks = chunkText(text, { maxChunkSize: 500, overlap: 50 });
    expect(chunks).toEqual([text]);
  });

  it("never loops infinitely or produces an empty slice for pathological options", () => {
    const text = "x".repeat(50);
    // overlap >= size would stall a naive sliding window; must be clamped.
    const chunks = chunkText(text, { maxChunkSize: 10, overlap: 999 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
  });
});

describe("chunkText — overlap", () => {
  it("each chunk's trailing overlap matches the next chunk's leading text", () => {
    const text = "0123456789".repeat(10); // 100 chars, predictable
    const size = 20;
    const overlap = 5;
    const chunks = chunkText(text, { maxChunkSize: size, overlap });
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length - 1; i++) {
      const tailOfCurrent = chunks[i].slice(-overlap);
      const headOfNext = chunks[i + 1].slice(0, overlap);
      expect(tailOfCurrent).toBe(headOfNext);
    }
  });

  it("produces non-overlapping, contiguous chunks when overlap is 0", () => {
    const text = "abcdefghij".repeat(5); // 50 chars
    const chunks = chunkText(text, { maxChunkSize: 10, overlap: 0 });
    expect(chunks.join("")).toBe(text);
  });
});

describe("chunkDocument", () => {
  const doc = {
    id: "doc-1",
    sourceType: "knowledge",
    text: "Lorem ipsum dolor sit amet, ".repeat(20),
    metadata: { domain: "plc", vendor: "siemens" },
  };

  it("produces stable, deterministic chunk ids across repeated calls", () => {
    const a = chunkDocument(doc, { maxChunkSize: 80, overlap: 10 });
    const b = chunkDocument(doc, { maxChunkSize: 80, overlap: 10 });
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(a).toEqual(b);
  });

  it("ids follow the documentId::chunk::position pattern and match stableChunkId", () => {
    const chunks = chunkDocument(doc, { maxChunkSize: 80, overlap: 10 });
    chunks.forEach((c, i) => {
      expect(c.id).toBe(stableChunkId(doc.id, i));
      expect(c.position).toBe(i);
      expect(c.documentId).toBe(doc.id);
      expect(c.sourceType).toBe(doc.sourceType);
    });
  });

  it("preserves the source document's metadata on every chunk, plus a contentHash", () => {
    const chunks = chunkDocument(doc, { maxChunkSize: 80, overlap: 10 });
    for (const c of chunks) {
      expect(c.metadata?.domain).toBe("plc");
      expect(c.metadata?.vendor).toBe("siemens");
      expect(c.metadata?.contentHash).toBe(hashString(c.text));
    }
  });

  it("returns [] for a document with empty text", () => {
    expect(chunkDocument({ id: "empty", sourceType: "knowledge", text: "" })).toEqual([]);
  });
});

describe("hashString", () => {
  it("is deterministic for identical input", () => {
    expect(hashString("hello world")).toBe(hashString("hello world"));
  });
  it("differs for different input", () => {
    expect(hashString("hello world")).not.toBe(hashString("hello world!"));
  });
});
