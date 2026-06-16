import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

const ENV_KEYS = [
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
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

async function createDocument(): Promise<{ id: string; storageKey: string }> {
  const { documentRepository } = await import("@/lib/documents/document-repository");
  const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
  const doc = await documentRepository().create({
    title: "RT Doc",
    sourceType: "manual",
    originalFilename: "rt.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10,
    storageProvider: "local",
    storageKey: "",
    metadata: { tags: [] },
    chunkCount: 0,
    status: "uploaded",
  });
  const storageKey = `documents/${doc.id}/original.pdf`;
  await getDocumentObjectStorage().put({ key: storageKey, body: "fake pdf bytes" });
  await documentRepository().update(doc.id, { storageKey });
  return { id: doc.id, storageKey };
}

function idRequest(id: string, method: string): { req: Request; params: Promise<{ id: string }> } {
  return {
    req: new Request(`http://localhost/api/documents/${id}`, { method }),
    params: Promise.resolve({ id }),
  };
}

describe("/api/documents/[id] GET", () => {
  it("rejects when not authenticated", async () => {
    mockUser(null);
    const { GET } = await import("../route");
    const { req, params } = idRequest("whatever", "GET");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown id", async () => {
    mockUser("admin");
    const { GET } = await import("../route");
    const { req, params } = idRequest("does-not-exist", "GET");
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it("returns the document for a known id", async () => {
    mockUser("admin");
    const { id } = await createDocument();
    const { GET } = await import("../route");
    const { req, params } = idRequest(id, "GET");
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document.id).toBe(id);
    expect(body.document.title).toBe("RT Doc");
  });
});

describe("/api/documents/[id] DELETE", () => {
  it("rejects a non-admin role", async () => {
    mockUser("engineer");
    const { id } = await createDocument();
    const { DELETE } = await import("../route");
    const { req, params } = idRequest(id, "DELETE");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown id", async () => {
    mockUser("admin");
    const { DELETE } = await import("../route");
    const { req, params } = idRequest("does-not-exist", "DELETE");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(404);
  });

  it("deletes the file and the metadata row", async () => {
    mockUser("admin");
    const { id, storageKey } = await createDocument();
    const { getDocumentObjectStorage } = await import("@/lib/documents/object-storage");
    expect(await getDocumentObjectStorage().exists(storageKey)).toBe(true);

    const { DELETE } = await import("../route");
    const { req, params } = idRequest(id, "DELETE");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);

    const { documentRepository } = await import("@/lib/documents/document-repository");
    expect(await documentRepository().get(id)).toBeNull();
    expect(await getDocumentObjectStorage().exists(storageKey)).toBe(false);
  });

  it("never leaks raw error text", async () => {
    mockUser("admin");
    const { id } = await createDocument();
    const { DELETE } = await import("../route");
    const { req, params } = idRequest(id, "DELETE");
    const res = await DELETE(req, { params });
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/stack|ENOENT|at Object\./i);
  });
});
