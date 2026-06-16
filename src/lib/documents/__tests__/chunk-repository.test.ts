import { describe, it, expect, beforeEach } from "vitest";
import { documentTextChunkRepository } from "../chunk-repository";

beforeEach(() => {
  (globalThis as unknown as { __hermesDocumentTextChunks?: unknown[] }).__hermesDocumentTextChunks = [];
});

function chunk(documentId: string, position: number, text = "chunk text") {
  return { documentId, position, text, charCount: text.length, metadata: {} };
}

describe("documentTextChunkRepository — session mode", () => {
  it("createMany then listByDocumentId, sorted by position", async () => {
    const r = documentTextChunkRepository();
    await r.createMany([chunk("d1", 1, "second"), chunk("d1", 0, "first")]);
    const rows = await r.listByDocumentId("d1");
    expect(rows.map((c) => c.text)).toEqual(["first", "second"]);
  });

  it("createMany assigns ids and timestamps", async () => {
    const r = documentTextChunkRepository();
    const [created] = await r.createMany([chunk("d1", 0)]);
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.updatedAt).toBeTruthy();
    expect(created.status).toBe("chunked");
  });

  it("list() returns chunks across all documents", async () => {
    const r = documentTextChunkRepository();
    await r.createMany([chunk("d1", 0)]);
    await r.createMany([chunk("d2", 0)]);
    const all = await r.list();
    expect(all.length).toBe(2);
  });

  it("listByDocumentId only returns chunks for that document", async () => {
    const r = documentTextChunkRepository();
    await r.createMany([chunk("d1", 0)]);
    await r.createMany([chunk("d2", 0)]);
    expect((await r.listByDocumentId("d1")).length).toBe(1);
    expect((await r.listByDocumentId("d2")).length).toBe(1);
    expect((await r.listByDocumentId("d3")).length).toBe(0);
  });

  it("deleteByDocumentId removes only that document's chunks and returns the count", async () => {
    const r = documentTextChunkRepository();
    await r.createMany([chunk("d1", 0), chunk("d1", 1)]);
    await r.createMany([chunk("d2", 0)]);
    const removed = await r.deleteByDocumentId("d1");
    expect(removed).toBe(2);
    expect(await r.listByDocumentId("d1")).toEqual([]);
    expect((await r.listByDocumentId("d2")).length).toBe(1);
  });

  it("deleteByDocumentId on a document with no chunks returns 0", async () => {
    const r = documentTextChunkRepository();
    expect(await r.deleteByDocumentId("does-not-exist")).toBe(0);
  });

  it("preserves contentHash and metadata when provided", async () => {
    const r = documentTextChunkRepository();
    const [created] = await r.createMany([
      { documentId: "d1", position: 0, text: "x", charCount: 1, contentHash: "abc123", metadata: { foo: "bar" } },
    ]);
    expect(created.contentHash).toBe("abc123");
    expect(created.metadata).toEqual({ foo: "bar" });
  });
});
