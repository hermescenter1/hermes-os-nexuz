import { describe, it, expect } from "vitest";
import { documentRepository } from "../document-repository";

/**
 * Session-mode contract test, mirroring
 * src/lib/storage/__tests__/persistence.test.ts's style exactly. No
 * DATABASE_URL is configured anywhere in this suite, so these exercise the
 * in-process store — the same code path the database implementation falls
 * back to on any Prisma failure.
 */

function baseInput() {
  return {
    title: "RT Manual",
    sourceType: "manual" as const,
    originalFilename: "manual.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    storageProvider: "local" as const,
    storageKey: "documents/rt-1/original.pdf",
    metadata: { tags: ["test"] },
    chunkCount: 0,
  };
}

describe("documentRepository — session mode CRUD", () => {
  it("create -> list -> get", async () => {
    const r = documentRepository();
    const d = await r.create(baseInput());
    expect(d.id).toBeTruthy();
    expect(d.status).toBe("uploaded"); // default applied
    expect((await r.list()).some((x) => x.id === d.id)).toBe(true);
    expect((await r.get(d.id))?.title).toBe("RT Manual");
  });

  it("create defaults status to 'uploaded' when omitted", async () => {
    const r = documentRepository();
    const d = await r.create(baseInput());
    expect(d.status).toBe("uploaded");
  });

  it("create respects an explicit status", async () => {
    const r = documentRepository();
    const d = await r.create({ ...baseInput(), status: "indexed" });
    expect(d.status).toBe("indexed");
  });

  it("update walks the status lifecycle", async () => {
    const r = documentRepository();
    const d = await r.create(baseInput());
    expect((await r.update(d.id, { status: "extracting" }))?.status).toBe("extracting");
    expect((await r.update(d.id, { status: "chunked" }))?.status).toBe("chunked");
    expect((await r.update(d.id, { status: "indexed", chunkCount: 12 }))?.chunkCount).toBe(12);
  });

  it("update can record a failure reason", async () => {
    const r = documentRepository();
    const d = await r.create(baseInput());
    const failed = await r.update(d.id, { status: "failed", error: "extraction_failed" });
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("extraction_failed");
  });

  it("update returns null for an unknown id", async () => {
    const r = documentRepository();
    expect(await r.update("does-not-exist", { status: "failed" })).toBeNull();
  });

  it("delete removes the record", async () => {
    const r = documentRepository();
    const d = await r.create(baseInput());
    expect(await r.delete(d.id)).toBe(true);
    expect(await r.get(d.id)).toBeNull();
  });

  it("delete returns false for an unknown id", async () => {
    const r = documentRepository();
    expect(await r.delete("does-not-exist")).toBe(false);
  });

  it("findByTitle finds an exact (case-insensitive) match", async () => {
    const r = documentRepository();
    const d = await r.create(baseInput());
    expect((await r.findByTitle?.("rt manual"))?.id).toBe(d.id);
  });

  it("get returns null for an unknown id", async () => {
    const r = documentRepository();
    expect(await r.get("does-not-exist")).toBeNull();
  });

  it("preserves metadata (vendor/domain/tags) through create and update", async () => {
    const r = documentRepository();
    const d = await r.create({
      ...baseInput(),
      metadata: { vendor: "siemens", domain: "plc", tags: ["s7-1500", "manual"] },
    });
    expect(d.metadata.vendor).toBe("siemens");
    expect(d.metadata.tags).toEqual(["s7-1500", "manual"]);
  });
});
