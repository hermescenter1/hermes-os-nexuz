import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const ENV_KEYS = [
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-doc-process-route-"));
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
  (globalThis as unknown as { __hermesDocumentDrafts?: unknown[] }).__hermesDocumentDrafts = [];
  (globalThis as unknown as { __hermesDocumentTextChunks?: unknown[] }).__hermesDocumentTextChunks = [];
  process.env.ADMIN_EMAIL = "a@test.com";
  process.env.ADMIN_PASSWORD = "x";
  vi.resetModules();
});

afterEach(async () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.doUnmock("@/lib/auth/session");
});

function mockUser(role: "admin" | "engineer" | "viewer" | null) {
  vi.doMock("@/lib/auth/session", () => ({
    getCurrentUser: async () =>
      role ? { id: "u1", email: "u@test.com", name: "Test User", role } : null,
  }));
}

async function createDocument(filename: string, content: string) {
  const { documentRepository } = await import("@/lib/documents/document-repository");
  const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
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
  await repo.update(doc.id, { storageKey });
  return doc.id;
}

function processRequest(id: string): { req: Request; params: Promise<{ id: string }> } {
  return {
    req: new Request(`http://localhost/api/documents/${id}/process`, { method: "POST" }),
    params: Promise.resolve({ id }),
  };
}

describe("/api/documents/[id]/process — authorization", () => {
  it("rejects when auth is not configured", async () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    const { POST } = await import("../route");
    const { req, params } = processRequest("whatever");
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    mockUser(null);
    const { POST } = await import("../route");
    const { req, params } = processRequest("whatever");
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin role", async () => {
    mockUser("engineer");
    const { POST } = await import("../route");
    const { req, params } = processRequest("whatever");
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });
});

describe("/api/documents/[id]/process — admin", () => {
  it("returns 404 for an unknown document", async () => {
    mockUser("admin");
    const { POST } = await import("../route");
    const { req, params } = processRequest("does-not-exist");
    const res = await POST(req, { params });
    expect(res.status).toBe(404);
  });

  it("processes a TXT document end-to-end and returns the resulting status/chunkCount", async () => {
    mockUser("admin");
    const id = await createDocument("notes.txt", "Some manual content. ".repeat(30));
    const { POST } = await import("../route");
    const { req, params } = processRequest(id);
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.document.status).toBe("indexed");
    expect(body.chunkCount).toBeGreaterThan(0);
  });

  it("returns 200 with a failed document status for an unsupported PDF — never a 5xx", async () => {
    mockUser("admin");
    const id = await createDocument("manual.pdf", "%PDF-1.4 fake");
    const { POST } = await import("../route");
    const { req, params } = processRequest(id);
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.document.status).toBe("failed");
    expect(body.document.error).toBe("unsupported_extraction_type");
  });

  it("never leaks raw internal error text in any response", async () => {
    mockUser("admin");
    const id = await createDocument("manual.pdf", "%PDF-1.4 fake");
    const { POST } = await import("../route");
    const { req, params } = processRequest(id);
    const res = await POST(req, { params });
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/stack|ENOENT|at Object\.|at processDocument/i);
  });
});
