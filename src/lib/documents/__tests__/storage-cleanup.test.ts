import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { ORG_A, ORG_B, resetSessionDocuments } from "./tenant-fixtures";

/**
 * F-2 FU-F2-R2-3 — removal of a deleted document's stored files.
 *
 * Session mode with the REAL local object-storage provider in an OS temp
 * directory. A removal failure is produced for real — a non-empty directory
 * sitting at the object's path makes unlink fail with EPERM/EISDIR — never by
 * mocking the code under test.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL", "HERMES_DOCUMENT_STORAGE_PROVIDER", "HERMES_LOCAL_DOCUMENT_STORAGE_DIR"] as const;
let saved: Record<string, string | undefined>;
let tempDir: string;

type Row = {
  id: string;
  organizationId: string;
  documentId: string;
  objectKeys: string[];
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  nextAttemptAt: string;
};

beforeEach(async () => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-doc-cleanup-"));
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
  resetSessionDocuments();
  (globalThis as unknown as { __hermesDocumentTextChunks?: unknown[] }).__hermesDocumentTextChunks = [];
  (globalThis as unknown as { __hermesDocumentStorageCleanups?: unknown[] }).__hermesDocumentStorageCleanups = [];
  vi.resetModules();
});

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
});

const rows = () =>
  (globalThis as unknown as { __hermesDocumentStorageCleanups?: Row[] }).__hermesDocumentStorageCleanups ?? [];
const onDisk = async (key: string) =>
  fs
    .access(path.join(tempDir, key))
    .then(() => true)
    .catch(() => false);

async function put(key: string) {
  await fs.mkdir(path.dirname(path.join(tempDir, key)), { recursive: true });
  await fs.writeFile(path.join(tempDir, key), "bytes");
}

async function block(key: string) {
  const dir = path.join(tempDir, key);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "lock"), "x");
  return () => fs.rm(dir, { recursive: true, force: true });
}

/** A stored, processed document owned by `org`: original + extracted text + one chunk. */
async function storedDocument(org: string) {
  const { documentRepositoryForOrganization } = await import("../document-repository");
  const { documentTextChunkRepository } = await import("../chunk-repository");
  const repo = documentRepositoryForOrganization(org);
  const doc = await repo.create({
    title: "Doc",
    sourceType: "manual",
    originalFilename: "d.pdf",
    mimeType: "application/pdf",
    sizeBytes: 5,
    storageProvider: "local",
    storageKey: "",
    metadata: { tags: [] },
    chunkCount: 0,
    status: "uploaded",
    uploadedBy: "user-a",
  });
  const storageKey = `documents/${doc.id}/original.pdf`;
  const extractedTextKey = `documents/${doc.id}/extracted.txt`;
  await put(storageKey);
  await put(extractedTextKey);
  await repo.update(doc.id, { storageKey, extractedTextKey });
  await documentTextChunkRepository().createMany([
    { documentId: doc.id, position: 0, text: "chunk", charCount: 5, metadata: {} },
  ]);
  return { repo, id: doc.id, storageKey, extractedTextKey };
}

describe("cleanup keys — only the document's own prefix", () => {
  it("collects the original, the extracted text and the canonical extracted key; drops anything else", async () => {
    const { cleanupKeysFor } = await import("../storage-cleanup");
    expect(
      cleanupKeysFor({ id: "doc1", storageKey: "documents/doc1/original.pdf", extractedTextKey: null })
    ).toEqual({ keys: ["documents/doc1/extracted.txt", "documents/doc1/original.pdf"], skipped: 0 });
    expect(
      cleanupKeysFor({ id: "doc1", storageKey: "documents/doc2/original.pdf", extractedTextKey: "../../etc/passwd" })
    ).toEqual({ keys: ["documents/doc1/extracted.txt"], skipped: 2 });
    expect(cleanupKeysFor({ id: "../x", storageKey: "documents/../x/original.pdf" })).toEqual({ keys: [], skipped: 0 });
  });

  it.each([
    ["documents/doc1/original.pdf", true],
    ["documents/doc1/sub/file.txt", true],
    ["documents/doc1/", false],
    ["documents/doc1/../doc2/original.pdf", false],
    ["documents/doc2/original.pdf", false],
    ["documents/doc10/original.pdf", false],
    ["/documents/doc1/original.pdf", false],
    ["documents\\doc1\\original.pdf", false],
    ["documents/doc1/./x", false],
  ])("isKeyWithinDocumentPrefix(%s) → %s", async (key, expected) => {
    const { isKeyWithinDocumentPrefix } = await import("../storage-cleanup");
    expect(isKeyWithinDocumentPrefix(key, "doc1")).toBe(expected);
  });

  it("backs off exponentially and caps at one hour", async () => {
    const { retryDelayMs } = await import("../storage-cleanup");
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(retryDelayMs(50)).toBe(60 * 60_000);
  });
});

describe("deleteWithStorageCleanup + runDocumentStorageCleanup (session)", () => {
  it("deletes row and chunks at once, enqueues one row, then removes BOTH objects", async () => {
    const { repo, id, storageKey, extractedTextKey } = await storedDocument(ORG_A);
    const result = await repo.deleteWithStorageCleanup(id);
    expect(result).toMatchObject({ deleted: true, skippedKeys: 0 });
    expect(await repo.get(id)).toBeNull();
    const { documentTextChunkRepository } = await import("../chunk-repository");
    expect(await documentTextChunkRepository().listByDocumentId(id)).toEqual([]);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ organizationId: ORG_A, documentId: id, status: "PENDING" });
    // Nothing removed yet — the removal is a separate, post-commit step.
    expect(await onDisk(storageKey)).toBe(true);

    const { runDocumentStorageCleanup } = await import("../storage-cleanup");
    expect(await runDocumentStorageCleanup((result as { cleanupId: string }).cleanupId)).toBe("done");
    expect(await onDisk(storageKey)).toBe(false);
    expect(await onDisk(extractedTextKey)).toBe(false);
    expect(rows()[0].status).toBe("DONE");
  });

  it("another organization's document is not deleted and nothing is enqueued", async () => {
    const { id, storageKey } = await storedDocument(ORG_B);
    const { documentRepositoryForOrganization } = await import("../document-repository");
    expect(await documentRepositoryForOrganization(ORG_A).deleteWithStorageCleanup(id)).toEqual({ deleted: false });
    expect(await documentRepositoryForOrganization(ORG_B).get(id)).not.toBeNull();
    expect(rows()).toEqual([]);
    expect(await onDisk(storageKey)).toBe(true);
  });

  it("a failed removal stays PENDING with a code and back-off; nothing is marked removed", async () => {
    const { repo, id, storageKey } = await storedDocument(ORG_A);
    await fs.rm(path.join(tempDir, `documents/${id}/extracted.txt`));
    const unblock = await block(`documents/${id}/extracted.txt`);
    const del = (await repo.deleteWithStorageCleanup(id)) as { cleanupId: string };
    const { runDocumentStorageCleanup, runDocumentStorageCleanupPass } = await import("../storage-cleanup");
    const t0 = new Date();
    expect(await runDocumentStorageCleanup(del.cleanupId, t0)).toBe("pending");
    expect(rows()[0]).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "storage_remove_failed" });
    expect(Date.parse(rows()[0].nextAttemptAt)).toBe(t0.getTime() + 30_000);
    expect(await onDisk(storageKey)).toBe(true);

    // Not retried before the back-off elapses.
    expect(await runDocumentStorageCleanupPass({ limit: 10, now: new Date(t0.getTime() + 29_000) })).toEqual({
      claimed: 0,
      done: 0,
      retrying: 0,
    });
    // Still failing → attempts 2, doubled back-off.
    const t1 = new Date(t0.getTime() + 30_000);
    expect(await runDocumentStorageCleanupPass({ limit: 10, now: t1 })).toEqual({ claimed: 1, done: 0, retrying: 1 });
    expect(rows()[0]).toMatchObject({ attempts: 2 });
    expect(Date.parse(rows()[0].nextAttemptAt)).toBe(t1.getTime() + 60_000);

    // Obstacle gone → removed, DONE.
    await unblock();
    const t2 = new Date(t1.getTime() + 60_000);
    expect(await runDocumentStorageCleanupPass({ limit: 10, now: t2 })).toEqual({ claimed: 1, done: 1, retrying: 0 });
    expect(await onDisk(storageKey)).toBe(false);
    expect(rows()[0]).toMatchObject({ status: "DONE", lastErrorCode: null });
  });

  it("is idempotent: objects already gone count as removed", async () => {
    const { repo, id, storageKey, extractedTextKey } = await storedDocument(ORG_A);
    await fs.rm(path.join(tempDir, storageKey));
    await fs.rm(path.join(tempDir, extractedTextKey));
    const del = (await repo.deleteWithStorageCleanup(id)) as { cleanupId: string };
    const { runDocumentStorageCleanup } = await import("../storage-cleanup");
    expect(await runDocumentStorageCleanup(del.cleanupId)).toBe("done");
    expect(await runDocumentStorageCleanup(del.cleanupId)).toBe("done"); // second call: already DONE
  });

  it("two concurrent runs of one row: exactly one claims it", async () => {
    const { repo, id } = await storedDocument(ORG_A);
    const del = (await repo.deleteWithStorageCleanup(id)) as { cleanupId: string };
    const { runDocumentStorageCleanup } = await import("../storage-cleanup");
    const now = new Date();
    const outcomes = await Promise.all([runDocumentStorageCleanup(del.cleanupId, now), runDocumentStorageCleanup(del.cleanupId, now)]);
    expect(outcomes.sort()).toEqual(["done", "not_claimed"]);
  });

  it("re-deletes chunks inserted after the delete committed (a racing processing run)", async () => {
    const { repo, id } = await storedDocument(ORG_A);
    const del = (await repo.deleteWithStorageCleanup(id)) as { cleanupId: string };
    const { documentTextChunkRepository } = await import("../chunk-repository");
    await documentTextChunkRepository().createMany([
      { documentId: id, position: 0, text: "late chunk", charCount: 10, metadata: {} },
    ]);
    const { runDocumentStorageCleanup } = await import("../storage-cleanup");
    expect(await runDocumentStorageCleanup(del.cleanupId)).toBe("done");
    expect(await documentTextChunkRepository().listByDocumentId(id)).toEqual([]);
  });

  it("never deletes a key outside the row's document prefix, even if one is forged into a row", async () => {
    await put("documents/victim/original.pdf");
    const { createSessionCleanupRow, runDocumentStorageCleanup } = await import("../storage-cleanup");
    const row = createSessionCleanupRow({
      organizationId: ORG_A,
      documentId: "attacker",
      objectKeys: ["documents/victim/original.pdf", "documents/attacker/../victim/original.pdf"],
    });
    expect(await runDocumentStorageCleanup(row.id)).toBe("done");
    expect(await onDisk("documents/victim/original.pdf")).toBe(true);
  });

  it("an unavailable provider leaves the row PENDING with a provider code", async () => {
    const { repo, id } = await storedDocument(ORG_A);
    const del = (await repo.deleteWithStorageCleanup(id)) as { cleanupId: string };
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "minio"; // not implemented
    const { runDocumentStorageCleanup } = await import("../storage-cleanup");
    expect(await runDocumentStorageCleanup(del.cleanupId)).toBe("pending");
    expect(rows()[0]).toMatchObject({ status: "PENDING", lastErrorCode: "storage_provider_unavailable" });
  });

  it("an organization-scoped pass touches only that organization's rows", async () => {
    const { createSessionCleanupRow, runDocumentStorageCleanupPass } = await import("../storage-cleanup");
    createSessionCleanupRow({ organizationId: ORG_A, documentId: "a1", objectKeys: ["documents/a1/original.pdf"] });
    createSessionCleanupRow({ organizationId: ORG_B, documentId: "b1", objectKeys: ["documents/b1/original.pdf"] });
    const later = new Date(Date.now() + 1000);
    expect(await runDocumentStorageCleanupPass({ limit: 10, organizationId: ORG_A, now: later })).toEqual({
      claimed: 1,
      done: 1,
      retrying: 0,
    });
    expect(rows().find((r) => r.documentId === "a1")?.status).toBe("DONE");
    expect(rows().find((r) => r.documentId === "b1")?.status).toBe("PENDING");
  });

  it("a document can only ever be enqueued once", async () => {
    const { createSessionCleanupRow } = await import("../storage-cleanup");
    createSessionCleanupRow({ organizationId: ORG_A, documentId: "once", objectKeys: [] });
    expect(() => createSessionCleanupRow({ organizationId: ORG_A, documentId: "once", objectKeys: [] })).toThrow();
  });
});
