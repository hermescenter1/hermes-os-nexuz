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
} from "../../../__tests__/org-guard-harness";

/**
 * Phase 16C / F-2 — POST /api/documents/[id]/process route tests.
 *
 * Ownership is proven before `processDocument` runs: a foreign or unassigned
 * document is answered 404 and is never extracted, chunked or embedded.
 */

const ENV_KEYS = [
  "HERMES_STORAGE_MODE",
  "DATABASE_URL",
  "HERMES_LOCAL_DOCUMENT_STORAGE_DIR",
  "DOCUMENT_EMBEDDINGS_PROVIDER",
] as const;
let saved: Record<string, string | undefined>;
let tempDir: string;

beforeEach(async () => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-doc-process-route-"));
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
  process.env.DOCUMENT_EMBEDDINGS_PROVIDER = "mock";
  (globalThis as unknown as { __hermesDocumentDrafts?: unknown[] }).__hermesDocumentDrafts = [];
  (globalThis as unknown as { __hermesDocumentTextChunks?: unknown[] }).__hermesDocumentTextChunks = [];
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

/** A stored document owned by `owner` (`null` = a legacy unassigned row). */
async function createDocument(owner: string | null, filename: string, content: string) {
  const { documentRepository, documentRepositoryForOrganization } = await import(
    "@/lib/documents/document-repository"
  );
  const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
  const fields = {
    title: "RT Doc",
    sourceType: "manual" as const,
    originalFilename: filename,
    mimeType: "text/plain",
    sizeBytes: content.length,
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
  const storageKey = `documents/${doc.id}/original${path.extname(filename)}`;
  await getDocumentObjectStorage().put({ key: storageKey, body: content });
  await documentRepository().update(doc.id, { storageKey });
  return doc.id;
}

function stored(id: string): Document | undefined {
  return ((globalThis as unknown as { __hermesDocumentDrafts?: Document[] }).__hermesDocumentDrafts ?? []).find(
    (d) => d.id === id
  );
}

async function chunkCount(documentId: string): Promise<number> {
  const { documentTextChunkRepository } = await import("@/lib/documents/chunk-repository");
  return (await documentTextChunkRepository().listByDocumentId(documentId)).length;
}

function processRequest(id: string, origin?: string | null) {
  return {
    req: docRequest(`/api/documents/${id}/process`, { method: "POST", origin }),
    ctx: { params: Promise.resolve({ id }) },
  };
}

async function loadRoute(state: GuardState) {
  await mockGuards(state);
  return import("../route");
}

const TEXT = "Some manual content. ".repeat(30);

describe("/api/documents/[id]/process — guard chain", () => {
  const refusals: Array<[string, GuardState, number]> = [
    ["unauthenticated", { kind: "refused", code: "AUTHENTICATION_REQUIRED" }, 401],
    ["ambiguous organization", { kind: "refused", code: "ORGANIZATION_SELECTION_REQUIRED" }, 409],
    ["no organization", { kind: "refused", code: "ORGANIZATION_CONTEXT_REQUIRED" }, 409],
    ["write without the tenant precondition", { kind: "refused", code: "ORGANIZATION_PRECONDITION_REQUIRED" }, 428],
    ["non-member", { kind: "nonMember" }, 403],
    ["VIEWER (no manage_documents)", member("VIEWER"), 403],
    ["BILLING_ADMIN (no manage_documents)", member("BILLING_ADMIN"), 403],
  ];

  for (const [name, state, status] of refusals) {
    it(`${name} → ${status}; the document is not processed`, async () => {
      const id = await createDocument(ORG_A, "notes.txt", TEXT);
      const { POST } = await loadRoute(state);
      const { req, ctx } = processRequest(id);
      expect((await POST(req, ctx)).status).toBe(status);
      expect(stored(id)?.status).toBe("uploaded");
      expect(await chunkCount(id)).toBe(0);
      expect(auditEvents()).toEqual([]);
    });
  }

  it("a cross-site Origin is refused (403); the document is not processed", async () => {
    const id = await createDocument(ORG_A, "notes.txt", TEXT);
    const { POST } = await loadRoute(member("OWNER"));
    const { req, ctx } = processRequest(id, "https://attacker.example");
    expect((await POST(req, ctx)).status).toBe(403);
    expect(await chunkCount(id)).toBe(0);
  });
});

describe("/api/documents/[id]/process — tenant-scoped", () => {
  for (const [name, owner] of [["another organization's", ORG_B], ["an unassigned (NULL tenant)", null]] as const) {
    it(`${name} document → 404; never extracted, chunked or embedded; no audit`, async () => {
      const id = await createDocument(owner, "notes.txt", TEXT);
      const { POST } = await loadRoute(member("OWNER"));
      const { req, ctx } = processRequest(id);
      const res = await POST(req, ctx);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe("not_found");
      expect(stored(id)?.status).toBe("uploaded");
      expect(await chunkCount(id)).toBe(0);
      expect(auditEvents()).toEqual([]);
    });
  }

  it("returns 404 for an unknown document", async () => {
    const { POST } = await loadRoute(member("OWNER"));
    const { req, ctx } = processRequest("does-not-exist");
    expect((await POST(req, ctx)).status).toBe(404);
  });

  it("processes an owned TXT document end-to-end and audits in the organization", async () => {
    const id = await createDocument(ORG_A, "notes.txt", TEXT);
    const { POST } = await loadRoute(member("ENGINEER"));
    const { req, ctx } = processRequest(id);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.document.status).toBe("indexed");
    expect(body.chunkCount).toBeGreaterThan(0);
    const processed = auditEvents().filter((e) => e.action === "document.processed");
    expect(processed).toHaveLength(1);
    expect(processed[0]).toMatchObject({ organizationId: ORG_A, userId: USER_A, entityId: id });
  });

  it("returns 200 with a failed document status for an unsupported PDF — never a 5xx", async () => {
    const id = await createDocument(ORG_A, "manual.pdf", "%PDF-1.4 fake");
    const { POST } = await loadRoute(member("ADMIN"));
    const { req, ctx } = processRequest(id);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.document.status).toBe("failed");
    expect(body.document.error).toBe("unsupported_extraction_type");
    const failed = auditEvents().filter((e) => e.action === "document.process_failed");
    expect(failed[0]).toMatchObject({ organizationId: ORG_A });
  });

  it("never leaks raw internal error text in any response", async () => {
    const id = await createDocument(ORG_A, "manual.pdf", "%PDF-1.4 fake");
    const { POST } = await loadRoute(member("ADMIN"));
    const { req, ctx } = processRequest(id);
    const text = JSON.stringify(await (await POST(req, ctx)).json());
    expect(text).not.toMatch(/stack|ENOENT|at Object\.|at processDocument/i);
  });
});
