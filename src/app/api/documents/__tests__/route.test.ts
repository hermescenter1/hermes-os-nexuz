import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

/**
 * Phase 16B — /api/documents route tests.
 *
 * Auth is mocked via `vi.doMock("@/lib/auth/session", ...)` rather than
 * exercising real cookies/JWTs (which need an actual request-scoped
 * `next/headers` context this test environment doesn't provide) —
 * `isAuthConfigured()` only needs ADMIN_EMAIL/ADMIN_PASSWORD env vars set,
 * a pure check with no cookie dependency.
 *
 * The "local" object-storage provider is genuinely exercised (real files,
 * in an OS temp directory — never the repo's own .data/documents), the
 * same technique as src/lib/documents/__tests__/object-storage.test.ts.
 */

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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-doc-route-"));
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
  // Session-mode in-process store is a globalThis singleton shared across
  // test files in this worker — start every test from a clean slate.
  (globalThis as unknown as { __hermesDocumentDrafts?: unknown[] }).__hermesDocumentDrafts = [];
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

function pdfFile(name = "manual.pdf", content = "%PDF-1.4 fake content"): File {
  return new File([content], name, { type: "application/pdf" });
}

function uploadRequest(fields: Record<string, string | File>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost/api/documents", { method: "POST", body: fd });
}

describe("/api/documents POST — authorization", () => {
  it("rejects when auth is not configured at all", async () => {
    const { POST } = await import("../route");
    const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("auth not configured");
  });

  it("rejects an unauthenticated request (401)", async () => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser(null);
    const { POST } = await import("../route");
    const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }));
    expect(res.status).toBe(401);
  });

  it("rejects a non-admin role (403), e.g. engineer", async () => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser("engineer");
    const { POST } = await import("../route");
    const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }));
    expect(res.status).toBe(403);
  });

  it("rejects viewer too", async () => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser("viewer");
    const { POST } = await import("../route");
    const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }));
    expect(res.status).toBe(403);
  });
});

describe("/api/documents POST — admin, valid upload", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser("admin");
  });

  it("creates a Document row, writes the real file, and returns 201", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      uploadRequest({
        title: "S7-1500 Manual",
        sourceType: "manual",
        vendor: "siemens",
        tags: "plc, manual",
        file: pdfFile("s7-1500.pdf"),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document.title).toBe("S7-1500 Manual");
    expect(body.document.status).toBe("uploaded");
    expect(body.document.storageProvider).toBe("local");
    expect(body.document.storageKey).toContain(body.document.id);
    expect(body.document.metadata.vendor).toBe("siemens");
    expect(body.document.metadata.tags).toEqual(["plc", "manual"]);
    expect(typeof body.document.contentHash).toBe("string");

    // the file genuinely landed on disk under the real Document id
    const written = await fs.readFile(
      path.join(tempDir, "documents", body.document.id, "original.pdf"),
      "utf8"
    );
    expect(written).toContain("fake content");
  });

  it("never leaks raw error text in any response", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() })
    );
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/stack|ENOENT|at Object\./i);
  });
});

describe("/api/documents POST — validation", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    mockUser("admin");
  });

  it("rejects a missing title", async () => {
    const { POST } = await import("../route");
    const res = await POST(uploadRequest({ sourceType: "manual", file: pdfFile() }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("title_required");
  });

  it("rejects a missing/invalid sourceType", async () => {
    const { POST } = await import("../route");
    const res = await POST(uploadRequest({ title: "T", sourceType: "invoice", file: pdfFile() }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_source_type");
  });

  it("rejects an unsupported file type", async () => {
    const { POST } = await import("../route");
    const exe = new File(["MZ"], "tool.exe", { type: "application/x-msdownload" });
    const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: exe }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_file_type");
  });

  it("rejects a request with no file at all", async () => {
    const { POST } = await import("../route");
    const fd = new FormData();
    fd.set("title", "T");
    fd.set("sourceType", "manual");
    const res = await POST(new Request("http://localhost/api/documents", { method: "POST", body: fd }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("file_required");
  });
});

describe("/api/documents POST — storage failure never leaks raw provider errors", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "minio"; // not implemented (Phase 16A)
    mockUser("admin");
  });

  it("returns a safe, enumerated error code and marks the document failed", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() })
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("storage_write_failed");
    expect(body.document.status).toBe("failed");
    expect(body.document.error).toBe("storage_write_failed");
    const text = JSON.stringify(body);
    expect(text).not.toContain("not yet implemented");
    expect(text).not.toContain("Phase 16B");
  });
});

describe("/api/documents GET — list", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = "a@test.com";
    process.env.ADMIN_PASSWORD = "x";
  });

  it("rejects non-admins the same way POST does", async () => {
    mockUser("viewer");
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the documents created via POST", async () => {
    mockUser("admin");
    const { POST, GET } = await import("../route");
    await POST(uploadRequest({ title: "Doc A", sourceType: "manual", file: pdfFile("a.pdf") }));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.documents)).toBe(true);
    expect(body.documents.some((d: { title: string }) => d.title === "Doc A")).toBe(true);
  });
});
