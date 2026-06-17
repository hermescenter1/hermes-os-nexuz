import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { processDocument } from "../processing";
import { documentRepository } from "../document-repository";
import { documentTextChunkRepository } from "../chunk-repository";
import { getDocumentObjectStorage } from "../object-storage";

const ENV_KEYS = [
  "HERMES_STORAGE_MODE",
  "DATABASE_URL",
  "HERMES_LOCAL_DOCUMENT_STORAGE_DIR",
] as const;
let saved: Record<string, string | undefined>;
let tempDir: string;

beforeEach(async () => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-doc-processing-"));
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
  (globalThis as unknown as { __hermesDocumentDrafts?: unknown[] }).__hermesDocumentDrafts = [];
  (globalThis as unknown as { __hermesDocumentTextChunks?: unknown[] }).__hermesDocumentTextChunks = [];
});

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function makeDocument(filename: string, content: string) {
  const repo = documentRepository();
  const doc = await repo.create({
    title: "RT Doc",
    sourceType: "manual",
    originalFilename: filename,
    mimeType: "text/plain",
    sizeBytes: content.length,
    storageProvider: "local",
    storageKey: "",
    metadata: { tags: [] },
    chunkCount: 0,
    status: "uploaded",
  });
  const storageKey = `documents/${doc.id}/original${path.extname(filename)}`;
  await getDocumentObjectStorage().put({ key: storageKey, body: content });
  return (await repo.update(doc.id, { storageKey }))!;
}

describe("processDocument — not found", () => {
  it("returns null for an unknown document id", async () => {
    expect(await processDocument("does-not-exist")).toBeNull();
  });
});

describe("processDocument — TXT success", () => {
  it("walks the status lifecycle to 'indexed' and creates chunks", async () => {
    const doc = await makeDocument("notes.txt", "Hello world. ".repeat(50));
    const result = await processDocument(doc.id);
    expect(result?.ok).toBe(true);
    expect(result?.document.status).toBe("indexed");
    expect(result?.document.error).toBeUndefined();
    expect(result?.document.lastProcessedAt).toBeTruthy();
    expect(result!.chunkCount).toBeGreaterThan(0);
    expect(result?.document.chunkCount).toBe(result!.chunkCount);

    const chunks = await documentTextChunkRepository().listByDocumentId(doc.id);
    expect(chunks.length).toBe(result!.chunkCount);
    expect(chunks[0].text.length).toBeGreaterThan(0);
    expect(chunks[0].charCount).toBe(chunks[0].text.length);
  });

  it("writes the extracted text to object storage and records extractedTextKey", async () => {
    const doc = await makeDocument("notes.txt", "extracted content here");
    const result = await processDocument(doc.id);
    expect(result?.document.extractedTextKey).toBe(`documents/${doc.id}/extracted.txt`);
    const stored = await getDocumentObjectStorage().get(result!.document.extractedTextKey!);
    expect(stored?.toString("utf8")).toBe("extracted content here");
  });

  it("re-processing replaces chunks rather than accumulating them", async () => {
    const doc = await makeDocument("notes.txt", "some content to chunk".repeat(10));
    await processDocument(doc.id);
    const firstCount = (await documentTextChunkRepository().listByDocumentId(doc.id)).length;
    await processDocument(doc.id);
    const secondCount = (await documentTextChunkRepository().listByDocumentId(doc.id)).length;
    expect(secondCount).toBe(firstCount);
  });
});

describe("processDocument — Markdown success", () => {
  it("extracts and chunks a markdown file", async () => {
    const doc = await makeDocument("notes.md", "# Title\n\nSome content. ".repeat(20));
    const result = await processDocument(doc.id);
    expect(result?.ok).toBe(true);
    expect(result?.document.status).toBe("indexed");
    expect(result!.chunkCount).toBeGreaterThan(0);
  });
});

describe("processDocument — PDF unsupported, safe failure", () => {
  it("marks the document failed with a safe reason, never attempting extraction", async () => {
    const doc = await makeDocument("manual.pdf", "%PDF-1.4 fake binary content");
    const result = await processDocument(doc.id);
    expect(result?.ok).toBe(false);
    expect(result?.document.status).toBe("failed");
    expect(result?.document.error).toBe("unsupported_extraction_type");
    expect(result?.document.lastProcessedAt).toBeTruthy();
    expect(result!.chunkCount).toBe(0);

    // the original file is left untouched for a future real parser
    expect(await getDocumentObjectStorage().exists(doc.storageKey)).toBe(true);
  });
});

describe("processDocument — missing file, safe failure", () => {
  it("marks the document failed when the stored file is gone", async () => {
    const repo = documentRepository();
    const doc = await repo.create({
      title: "Ghost",
      sourceType: "manual",
      originalFilename: "ghost.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
      storageProvider: "local",
      storageKey: "documents/never-written/original.txt", // never put()
      metadata: { tags: [] },
      chunkCount: 0,
      status: "uploaded",
    });
    const result = await processDocument(doc.id);
    expect(result?.ok).toBe(false);
    expect(result?.document.status).toBe("failed");
    expect(result?.document.error).toBe("file_not_found");
  });
});

describe("processDocument — empty file, safe failure", () => {
  it("marks the document failed for whitespace-only content", async () => {
    const doc = await makeDocument("blank.txt", "   \n  ");
    const result = await processDocument(doc.id);
    expect(result?.ok).toBe(false);
    expect(result?.document.error).toBe("empty_content");
  });
});
