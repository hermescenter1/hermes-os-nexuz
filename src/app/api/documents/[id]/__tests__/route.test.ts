import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Document } from "@/lib/documents/types";
import {
  ORG_A,
  ORG_B,
  USER_A,
  member,
  mockGuards,
  unmockGuards,
  docRequest,
  resetAudit,
  auditEvents,
  type GuardState,
} from "../../__tests__/org-guard-harness";

/**
 * Phase 16B/16C / F-2 — /api/documents/[id] route tests.
 *
 * Every document is created through the organization-scoped repository, so
 * the fixtures carry a real owner. A document owned by another organization
 * or by none (NULL `tenantId`) must be indistinguishable from an id that does
 * not exist, and DELETE must leave it — file, chunks and row — untouched.
 */

const ENV_KEYS = [
  "HERMES_STORAGE_MODE",
  "DATABASE_URL",
  "HERMES_DOCUMENT_STORAGE_PROVIDER",
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-doc-id-route-"));
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
  (globalThis as unknown as { __hermesDocumentDrafts?: unknown[] }).__hermesDocumentDrafts = [];
  (globalThis as unknown as { __hermesDocumentTextChunks?: unknown[] }).__hermesDocumentTextChunks = [];
  (globalThis as unknown as { __hermesDocumentStorageCleanups?: unknown[] }).__hermesDocumentStorageCleanups = [];
  resetAudit();
  vi.resetModules();
});

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  unmockGuards();
});

/** Creates a document owned by `owner` (`null` = a legacy unassigned row) with a real file and one chunk. */
async function createDocument(owner: string | null): Promise<{ id: string; storageKey: string }> {
  const { documentRepository, documentRepositoryForOrganization } = await import(
    "@/lib/documents/document-repository"
  );
  const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
  const { documentTextChunkRepository } = await import("@/lib/documents/chunk-repository");
  const fields = {
    title: "RT Doc",
    sourceType: "manual" as const,
    originalFilename: "rt.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10,
    storageProvider: "local" as const,
    storageKey: "",
    metadata: { tags: [] },
    chunkCount: 0,
    status: "uploaded" as const,
  };
  const doc =
    owner === null
      ? await documentRepository().create(fields)
      : await documentRepositoryForOrganization(owner).create({ ...fields, uploadedBy: "seed-user" });
  const storageKey = `documents/${doc.id}/original.pdf`;
  await getDocumentObjectStorage().put({ key: storageKey, body: "fake pdf bytes" });
  await documentRepository().update(doc.id, { storageKey });
  await documentTextChunkRepository().createMany([
    { documentId: doc.id, position: 0, text: "chunk text", charCount: 10, metadata: {} },
  ]);
  return { id: doc.id, storageKey };
}

type CleanupRow = {
  id: string;
  organizationId: string;
  documentId: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  nextAttemptAt: string;
};

function cleanupRows(): CleanupRow[] {
  return (
    (globalThis as unknown as { __hermesDocumentStorageCleanups?: CleanupRow[] }).__hermesDocumentStorageCleanups ?? []
  );
}

/** Writes the extracted-text object a processing run would have produced. */
async function putExtracted(id: string): Promise<string> {
  const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
  const key = `documents/${id}/extracted.txt`;
  await getDocumentObjectStorage().put({ key, body: "extracted text" });
  return key;
}

/**
 * Makes `documents/<id>/extracted.txt` un-removable: a non-empty DIRECTORY
 * at that path makes unlink fail with EPERM/EISDIR — a real storage failure,
 * not a mocked one. Returns a function that clears the obstacle.
 */
async function blockExtracted(id: string): Promise<() => Promise<void>> {
  const dir = path.join(tempDir, "documents", id, "extracted.txt");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "lock"), "x");
  return () => fs.rm(dir, { recursive: true, force: true });
}

function drafts(): Document[] {
  return (globalThis as unknown as { __hermesDocumentDrafts?: Document[] }).__hermesDocumentDrafts ?? [];
}

async function chunkCount(documentId: string): Promise<number> {
  const { documentTextChunkRepository } = await import("@/lib/documents/chunk-repository");
  return (await documentTextChunkRepository().listByDocumentId(documentId)).length;
}

function idRequest(id: string, method: string, origin?: string | null) {
  return {
    req: docRequest(`/api/documents/${id}`, { method, origin: method === "GET" ? null : origin }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

async function loadRoute(state: GuardState) {
  await mockGuards(state);
  return import("../route");
}

// ─── guard chain ──────────────────────────────────────────────────────────────

describe("/api/documents/[id] — guard chain", () => {
  const refusals: Array<[string, GuardState, number]> = [
    ["unauthenticated", { kind: "refused", code: "AUTHENTICATION_REQUIRED" }, 401],
    ["ambiguous organization", { kind: "refused", code: "ORGANIZATION_SELECTION_REQUIRED" }, 409],
    ["no organization", { kind: "refused", code: "ORGANIZATION_CONTEXT_REQUIRED" }, 409],
    ["non-member", { kind: "nonMember" }, 403],
  ];

  for (const [name, state, status] of refusals) {
    it(`GET/DELETE: ${name} → ${status}, and the document survives`, async () => {
      const { id, storageKey } = await createDocument(ORG_A);
      const { GET, DELETE } = await loadRoute(state);
      const g = idRequest(id, "GET");
      expect((await GET(g.req, g.ctx)).status).toBe(status);
      const d = idRequest(id, "DELETE");
      const res = await DELETE(d.req, d.ctx);
      expect(res.status).toBe(status);
      expect(JSON.stringify(await res.json())).not.toContain("RT Doc");

      const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
      expect(await getDocumentObjectStorage().exists(storageKey)).toBe(true);
      expect(drafts().some((x) => x.id === id)).toBe(true);
      expect(auditEvents()).toEqual([]);
    });
  }

  it("DELETE: VIEWER lacks manage_documents → 403; nothing deleted", async () => {
    const { id, storageKey } = await createDocument(ORG_A);
    const { DELETE } = await loadRoute(member("VIEWER"));
    const { req, ctx } = idRequest(id, "DELETE");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
    const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
    expect(await getDocumentObjectStorage().exists(storageKey)).toBe(true);
    expect(await chunkCount(id)).toBe(1);
  });

  it("DELETE: a cross-site Origin is refused (403); nothing deleted", async () => {
    const { id } = await createDocument(ORG_A);
    const { DELETE } = await loadRoute(member("OWNER"));
    const { req, ctx } = idRequest(id, "DELETE", "https://attacker.example");
    expect((await DELETE(req, ctx)).status).toBe(403);
    expect(drafts().some((x) => x.id === id)).toBe(true);
  });

  it("GET: MEMBER lacks view_documents → 403", async () => {
    const { id } = await createDocument(ORG_A);
    const { GET } = await loadRoute(member("MEMBER"));
    const { req, ctx } = idRequest(id, "GET");
    expect((await GET(req, ctx)).status).toBe(403);
  });
});

// ─── GET ──────────────────────────────────────────────────────────────────────

describe("/api/documents/[id] GET — tenant-scoped", () => {
  it("returns the document for an id the active organization owns", async () => {
    const { id } = await createDocument(ORG_A);
    const { GET } = await loadRoute(member("VIEWER"));
    const { req, ctx } = idRequest(id, "GET");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document.id).toBe(id);
    expect(body.document.title).toBe("RT Doc");
    expect(body.document.tenantId).toBe(ORG_A);
  });

  it("answers another organization's document exactly like an unknown id (404 not_found)", async () => {
    const { id: foreign } = await createDocument(ORG_B);
    const { GET } = await loadRoute(member("OWNER"));
    const f = idRequest(foreign, "GET");
    const u = idRequest("does-not-exist", "GET");
    const foreignRes = await GET(f.req, f.ctx);
    const unknownRes = await GET(u.req, u.ctx);
    expect(foreignRes.status).toBe(404);
    expect(unknownRes.status).toBe(404);
    expect(await foreignRes.json()).toEqual(await unknownRes.json());
  });

  it("an unassigned (NULL tenant) document is invisible (404)", async () => {
    const { id } = await createDocument(null);
    const { GET } = await loadRoute(member("OWNER"));
    const { req, ctx } = idRequest(id, "GET");
    expect((await GET(req, ctx)).status).toBe(404);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe("/api/documents/[id] DELETE — tenant-scoped, fail closed", () => {
  it("deletes the original AND the extracted text, the chunks and the row, and audits in the organization", async () => {
    const { id, storageKey } = await createDocument(ORG_A);
    const extractedKey = await putExtracted(id);
    const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
    expect(await getDocumentObjectStorage().exists(storageKey)).toBe(true);
    expect(await getDocumentObjectStorage().exists(extractedKey)).toBe(true);

    const { DELETE } = await loadRoute(member("ENGINEER"));
    const { req, ctx } = idRequest(id, "DELETE");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: true, storageCleanup: "done" });

    expect(drafts().some((x) => x.id === id)).toBe(false);
    expect(await getDocumentObjectStorage().exists(storageKey)).toBe(false);
    expect(await getDocumentObjectStorage().exists(extractedKey)).toBe(false);
    expect(await chunkCount(id)).toBe(0);
    expect(cleanupRows()).toEqual([
      expect.objectContaining({ organizationId: ORG_A, documentId: id, status: "DONE", attempts: 0 }),
    ]);
    const deletions = auditEvents().filter((e) => e.action === "document.deleted");
    expect(deletions).toHaveLength(1);
    expect(deletions[0]).toMatchObject({ organizationId: ORG_A, userId: USER_A, entityId: id });
    expect((deletions[0] as unknown as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      storageCleanup: "done",
    });
  });

  it("a storage failure still deletes the row and chunks, reports storageCleanup=pending, and is retried later", async () => {
    const { id, storageKey } = await createDocument(ORG_A);
    const unblock = await blockExtracted(id);
    const { DELETE } = await loadRoute(member("ENGINEER"));
    const { req, ctx } = idRequest(id, "DELETE");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: true, storageCleanup: "pending" });

    // The database side committed: no row, no chunks …
    expect(drafts().some((x) => x.id === id)).toBe(false);
    expect(await chunkCount(id)).toBe(0);
    // … and the removal is recorded as NOT done, with a code and a back-off.
    const [row] = cleanupRows();
    expect(row).toMatchObject({ documentId: id, status: "PENDING", attempts: 1, lastErrorCode: "storage_remove_failed" });
    expect(Date.parse(row.nextAttemptAt)).toBeGreaterThan(Date.now());
    const deletion = auditEvents().find((e) => e.action === "document.deleted") as unknown as {
      metadata: Record<string, unknown>;
    };
    expect(deletion.metadata).toMatchObject({ storageCleanup: "pending" });

    // Retry after the obstacle is gone and the back-off has elapsed.
    await unblock();
    const { runDocumentStorageCleanupPass } = await import("@/lib/documents/storage-cleanup");
    const later = new Date(Date.parse(row.nextAttemptAt) + 1);
    expect(await runDocumentStorageCleanupPass({ limit: 10, now: later })).toEqual({ claimed: 1, done: 1, retrying: 0 });
    const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
    expect(await getDocumentObjectStorage().exists(storageKey)).toBe(false);
    expect(cleanupRows()[0]).toMatchObject({ status: "DONE", attempts: 1, lastErrorCode: null });
  });

  it("the inline retry after a delete touches only THIS organization's pending cleanups", async () => {
    const { createSessionCleanupRow } = await import("@/lib/documents/storage-cleanup");
    const past = new Date(Date.now() - 60_000).toISOString();
    const rowA = createSessionCleanupRow({ organizationId: ORG_A, documentId: "gone-a", objectKeys: ["documents/gone-a/original.pdf"] });
    const rowB = createSessionCleanupRow({ organizationId: ORG_B, documentId: "gone-b", objectKeys: ["documents/gone-b/original.pdf"] });
    rowA.nextAttemptAt = past;
    rowB.nextAttemptAt = past;

    const { id } = await createDocument(ORG_A);
    const { DELETE } = await loadRoute(member("OWNER"));
    const { req, ctx } = idRequest(id, "DELETE");
    expect((await DELETE(req, ctx)).status).toBe(200);

    expect(cleanupRows().find((r) => r.documentId === "gone-a")?.status).toBe("DONE");
    expect(cleanupRows().find((r) => r.documentId === "gone-b")?.status).toBe("PENDING");
  });

  for (const [name, owner] of [["another organization's", ORG_B], ["an unassigned (NULL tenant)", null]] as const) {
    it(`${name} document → 404; file, chunks and row untouched; no audit`, async () => {
      const { id, storageKey } = await createDocument(owner);
      const { DELETE } = await loadRoute(member("OWNER"));
      const { req, ctx } = idRequest(id, "DELETE");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("not_found");

      const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
      expect(await getDocumentObjectStorage().exists(storageKey)).toBe(true);
      expect(await chunkCount(id)).toBe(1);
      expect(drafts().some((x) => x.id === id)).toBe(true);
      expect(auditEvents()).toEqual([]);
      expect(cleanupRows()).toEqual([]); // no cleanup is ever enqueued for a foreign document
    });
  }

  it("returns 404 for an unknown id", async () => {
    const { DELETE } = await loadRoute(member("OWNER"));
    const { req, ctx } = idRequest("does-not-exist", "DELETE");
    expect((await DELETE(req, ctx)).status).toBe(404);
  });

  it("never leaks raw error text", async () => {
    const { id } = await createDocument(ORG_A);
    const { DELETE } = await loadRoute(member("OWNER"));
    const { req, ctx } = idRequest(id, "DELETE");
    const text = JSON.stringify(await (await DELETE(req, ctx)).json());
    expect(text).not.toMatch(/stack|ENOENT|at Object\./i);
  });
});
