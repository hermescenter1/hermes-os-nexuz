import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Document } from "@/lib/documents/types";
import { seedSessionDocument } from "@/lib/documents/__tests__/tenant-fixtures";
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
  orgActorCalls,
  type GuardState,
} from "./org-guard-harness";

/**
 * Phase 16B / F-2 — /api/documents route tests.
 *
 * The org guards are mocked through `org-guard-harness.ts` (they need a real
 * signed session and a database); everything behind them is real, including
 * the "local" object-storage provider, which writes genuine files to an OS
 * temp directory — never the repo's own .data/documents.
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-doc-route-"));
  process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR = tempDir;
  // Session-mode in-process store is a globalThis singleton shared across
  // test files in this worker — start every test from a clean slate.
  (globalThis as unknown as { __hermesDocumentDrafts?: unknown[] }).__hermesDocumentDrafts = [];
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

function drafts(): Document[] {
  return (globalThis as unknown as { __hermesDocumentDrafts?: Document[] }).__hermesDocumentDrafts ?? [];
}

function pdfFile(name = "manual.pdf", content = "%PDF-1.4 fake content"): File {
  return new File([content], name, { type: "application/pdf" });
}

function uploadRequest(fields: Record<string, string | File>, origin?: string | null) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return docRequest("/api/documents", { method: "POST", body: fd, origin });
}

const listRequest = (query = "") => docRequest(`/api/documents${query}`, { method: "GET", origin: null });

async function loadRoute(state: GuardState) {
  await mockGuards(state);
  return import("../route");
}

async function storedFiles(): Promise<string[]> {
  const root = path.join(tempDir, "documents");
  try {
    return await fs.readdir(root);
  } catch {
    return [];
  }
}

// ─── guard chain ──────────────────────────────────────────────────────────────

describe("/api/documents — guard chain refuses before any side effect", () => {
  const cases: Array<[string, GuardState, number, string]> = [
    ["unauthenticated", { kind: "refused", code: "AUTHENTICATION_REQUIRED" }, 401, "AUTHENTICATION_REQUIRED"],
    ["ambiguous organization", { kind: "refused", code: "ORGANIZATION_SELECTION_REQUIRED" }, 409, "ORGANIZATION_SELECTION_REQUIRED"],
    ["no organization", { kind: "refused", code: "ORGANIZATION_CONTEXT_REQUIRED" }, 409, "ORGANIZATION_CONTEXT_REQUIRED"],
    ["write without the tenant precondition", { kind: "refused", code: "ORGANIZATION_PRECONDITION_REQUIRED" }, 428, "ORGANIZATION_PRECONDITION_REQUIRED"],
    ["tenant precondition conflict", { kind: "refused", code: "ORGANIZATION_CONTEXT_CONFLICT" }, 409, "ORGANIZATION_CONTEXT_CONFLICT"],
    ["authenticated non-member", { kind: "nonMember" }, 403, "ORGANIZATION_SCOPE_REQUIRED"],
  ];

  for (const [name, state, status, code] of cases) {
    it(`POST: ${name} → ${status} ${code}; nothing stored, nothing audited`, async () => {
      const { POST } = await loadRoute(state);
      const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }));
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(code);
      expect(drafts()).toHaveLength(0);
      expect(await storedFiles()).toEqual([]);
      expect(auditEvents()).toEqual([]);
    });

    it(`GET: ${name} → ${status} ${code}; no documents disclosed`, async () => {
      seedSessionDocument("doc-a", ORG_A);
      const { GET } = await loadRoute(state);
      const res = await GET(listRequest());
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body.error).toBe(code);
      expect(body.documents).toBeUndefined();
    });
  }

  it("POST: a cross-site Origin is refused (403) for a cookie session; nothing stored", async () => {
    const { POST } = await loadRoute(member("OWNER"));
    const res = await POST(
      uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }, "https://attacker.example")
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
    expect(drafts()).toHaveLength(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("POST: a missing Origin is refused (403) for a cookie session", async () => {
    const { POST } = await loadRoute(member("OWNER"));
    const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }, null));
    expect(res.status).toBe(403);
    expect(drafts()).toHaveLength(0);
  });

  for (const role of ["VIEWER", "BILLING_ADMIN", "MEMBER"]) {
    it(`POST: ${role} lacks manage_documents → 403 forbidden; nothing stored`, async () => {
      const { POST } = await loadRoute(member(role));
      const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("forbidden");
      expect(drafts()).toHaveLength(0);
      expect(await storedFiles()).toEqual([]);
    });
  }

  it("GET: MEMBER lacks view_documents → 403 forbidden", async () => {
    seedSessionDocument("doc-a", ORG_A);
    const { GET } = await loadRoute(member("MEMBER"));
    const res = await GET(listRequest());
    expect(res.status).toBe(403);
    expect((await res.json()).documents).toBeUndefined();
  });

  it("membership is checked against the SERVER-resolved organization only", async () => {
    const { POST } = await loadRoute(member("OWNER"));
    await POST(
      uploadRequest({ title: "T", sourceType: "manual", organizationId: ORG_B, tenantId: ORG_B, file: pdfFile() })
    );
    expect(orgActorCalls).toEqual([ORG_A]);
  });
});

// ─── upload ownership ─────────────────────────────────────────────────────────

describe("/api/documents POST — ownership comes from the server, never the body", () => {
  for (const role of ["OWNER", "ADMIN", "MANAGER", "ENGINEER"]) {
    it(`${role} (manage_documents) uploads into the active organization`, async () => {
      const { POST } = await loadRoute(member(role));
      const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.document.tenantId).toBe(ORG_A);
      expect(body.document.uploadedBy).toBe(USER_A);
    });
  }

  it("ignores forged tenantId / organizationId / orgId / uploadedBy form fields", async () => {
    const { POST } = await loadRoute(member("ENGINEER"));
    const res = await POST(
      uploadRequest({
        title: "Forged",
        sourceType: "manual",
        tenantId: ORG_B,
        organizationId: ORG_B,
        orgId: ORG_B,
        uploadedBy: "user-attacker",
        file: pdfFile(),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document.tenantId).toBe(ORG_A);
    expect(body.document.uploadedBy).toBe(USER_A);
    expect(JSON.stringify(body.document.metadata)).not.toContain(ORG_B);

    // The stored row, not only the response, carries the server-derived owner.
    const [stored] = drafts();
    expect(stored.tenantId).toBe(ORG_A);
    expect(stored.uploadedBy).toBe(USER_A);
  });

  it("writes an upload audit event carrying the organization and the uploader", async () => {
    const { POST } = await loadRoute(member("ENGINEER"));
    const res = await POST(uploadRequest({ title: "Audited", sourceType: "manual", file: pdfFile() }));
    const { document } = await res.json();
    const uploads = auditEvents().filter((e) => e.action === "document.uploaded");
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({ organizationId: ORG_A, userId: USER_A, entityId: document.id });
  });
});

// ─── upload behaviour (Phase 16B, preserved) ─────────────────────────────────

describe("/api/documents POST — valid upload", () => {
  it("creates a Document row, writes the real file, and returns 201", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
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
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }));
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/stack|ENOENT|at Object\./i);
  });
});

describe("/api/documents POST — validation", () => {
  it("rejects a missing title", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(uploadRequest({ sourceType: "manual", file: pdfFile() }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("title_required");
  });

  it("rejects a missing/invalid sourceType", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(uploadRequest({ title: "T", sourceType: "invoice", file: pdfFile() }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_source_type");
  });

  it("rejects an unsupported file type", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const exe = new File(["MZ"], "tool.exe", { type: "application/x-msdownload" });
    const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: exe }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unsupported_file_type");
  });

  it("rejects a request with no file at all", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(uploadRequest({ title: "T", sourceType: "manual" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("file_required");
    expect(drafts()).toHaveLength(0);
  });
});

describe("/api/documents POST — storage failure never leaks raw provider errors", () => {
  beforeEach(() => {
    process.env.HERMES_DOCUMENT_STORAGE_PROVIDER = "minio"; // not implemented (Phase 16A)
  });

  it("returns a safe, enumerated error code, marks the document failed, audits in the org", async () => {
    const { POST } = await loadRoute(member("ADMIN"));
    const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file: pdfFile() }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("storage_write_failed");
    expect(body.document.status).toBe("failed");
    expect(body.document.error).toBe("storage_write_failed");
    expect(body.document.tenantId).toBe(ORG_A);
    const text = JSON.stringify(body);
    expect(text).not.toContain("not yet implemented");
    expect(text).not.toContain("Phase 16B");
    const failed = auditEvents().filter((e) => e.action === "document.upload_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ organizationId: ORG_A, userId: USER_A });
  });
});

// ─── list isolation ───────────────────────────────────────────────────────────

describe("/api/documents GET — tenant-scoped, bounded list", () => {
  it("returns only the active organization's documents — never another org's or unassigned ones", async () => {
    seedSessionDocument("doc-a", ORG_A);
    seedSessionDocument("doc-b", ORG_B);
    seedSessionDocument("doc-null", null);
    const { GET } = await loadRoute(member("VIEWER"));
    const res = await GET(listRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents.map((d: Document) => d.id)).toEqual(["doc-a"]);
  });

  it("an ORG_B member sees ORG_B's documents and not ORG_A's", async () => {
    seedSessionDocument("doc-a", ORG_A);
    seedSessionDocument("doc-b", ORG_B);
    const { GET } = await loadRoute(member("VIEWER", ORG_B));
    const body = await (await GET(listRequest())).json();
    expect(body.documents.map((d: Document) => d.id)).toEqual(["doc-b"]);
  });

  it("a ?organizationId= query parameter cannot widen the list", async () => {
    seedSessionDocument("doc-a", ORG_A);
    seedSessionDocument("doc-b", ORG_B);
    const { GET } = await loadRoute(member("VIEWER"));
    const body = await (await GET(listRequest(`?organizationId=${ORG_B}&tenantId=${ORG_B}`))).json();
    expect(body.documents.map((d: Document) => d.id)).toEqual(["doc-a"]);
  });

  it("returns the documents created via POST", async () => {
    const { POST, GET } = await loadRoute(member("ADMIN"));
    await POST(uploadRequest({ title: "Doc A", sourceType: "manual", file: pdfFile("a.pdf") }));
    const res = await GET(listRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.documents.some((d: { title: string }) => d.title === "Doc A")).toBe(true);
  });

  it("is bounded: 50 by default, at most 100 whatever the client asks", async () => {
    for (let i = 0; i < 120; i += 1) seedSessionDocument(`doc-${i}`, ORG_A);
    const { GET } = await loadRoute(member("VIEWER"));
    expect((await (await GET(listRequest())).json()).documents).toHaveLength(50);
    expect((await (await GET(listRequest("?limit=500"))).json()).documents).toHaveLength(100);
    expect((await (await GET(listRequest("?limit=7"))).json()).documents).toHaveLength(7);
    expect((await (await GET(listRequest("?limit=-3"))).json()).documents).toHaveLength(50);
    expect((await (await GET(listRequest("?limit=abc"))).json()).documents).toHaveLength(50);
  });
});

// ─── cursor paging ────────────────────────────────────────────────────────────

describe("/api/documents GET — keyset cursor paging", () => {
  async function allPages(GET: (req: ReturnType<typeof listRequest>) => Promise<Response>, limit: number) {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 50; guard += 1) {
      const q: string = `?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const body = await (await GET(listRequest(q))).json();
      ids.push(...body.documents.map((d: Document) => d.id));
      cursor = body.nextCursor;
      if (!cursor) return ids;
    }
    throw new Error("paging did not terminate");
  }

  it("walks every own document exactly once, newest first, and ends with nextCursor null", async () => {
    for (let i = 0; i < 23; i += 1) seedSessionDocument(`doc-${String(i).padStart(2, "0")}`, ORG_A);
    for (let i = 0; i < 5; i += 1) seedSessionDocument(`foreign-${i}`, ORG_B);
    seedSessionDocument("doc-null", null);
    const { GET } = await loadRoute(member("VIEWER"));
    const ids = await allPages(GET, 10);
    expect(ids).toHaveLength(23);
    expect(new Set(ids).size).toBe(23);
    expect(ids.every((id) => id.startsWith("doc-") && id !== "doc-null")).toBe(true);
  });

  it("a single page reports nextCursor null", async () => {
    seedSessionDocument("doc-a", ORG_A);
    const { GET } = await loadRoute(member("VIEWER"));
    const body = await (await GET(listRequest())).json();
    expect(body.nextCursor).toBeNull();
  });

  it("a cursor is values, not a lookup: another organization's cursor only pages MY documents", async () => {
    for (let i = 0; i < 4; i += 1) seedSessionDocument(`a-${i}`, ORG_A);
    for (let i = 0; i < 4; i += 1) seedSessionDocument(`b-${i}`, ORG_B);
    const routeA = await loadRoute(member("VIEWER"));
    const pageA = await (await routeA.GET(listRequest("?limit=2"))).json();
    expect(pageA.nextCursor).toEqual(expect.any(String));

    vi.resetModules();
    const routeB = await loadRoute(member("VIEWER", ORG_B));
    const body = await (await routeB.GET(listRequest(`?cursor=${encodeURIComponent(pageA.nextCursor)}`))).json();
    expect(body.documents.every((d: Document) => d.tenantId === ORG_B)).toBe(true);
  });

  for (const bad of ["not-a-cursor!", "e30", "x".repeat(600), Buffer.from('{"t":"yesterday","i":"x"}').toString("base64url")]) {
    it(`refuses a malformed cursor (${bad.slice(0, 12)}…) with 400 invalid_cursor`, async () => {
      seedSessionDocument("doc-a", ORG_A);
      const { GET } = await loadRoute(member("VIEWER"));
      const res = await GET(listRequest(`?cursor=${encodeURIComponent(bad)}`));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_cursor");
      expect(body.documents).toBeUndefined();
    });
  }
});

// ─── content signature (magic bytes) ──────────────────────────────────────────

describe("/api/documents POST — the bytes must match the extension", () => {
  const cases: Array<[string, File]> = [
    ["an executable renamed .pdf", new File(["MZ\x90\x00binary"], "manual.pdf", { type: "application/pdf" })],
    ["a zip that is not a .pdf", new File(["PK\x03\x04rest"], "manual.pdf", { type: "application/pdf" })],
    ["a .docx that is not a ZIP container", new File(["%PDF-1.4 hidden"], "spec.docx", { type: "application/octet-stream" })],
    ["a .txt carrying a NUL byte", new File(["text\x00more"], "notes.txt", { type: "text/plain" })],
    ["a .md that is really a PDF", new File(["%PDF-1.7 x"], "readme.md", { type: "text/markdown" })],
    ["a .txt that is not UTF-8", new File([new Uint8Array([0x68, 0xff, 0xfe, 0x69])], "notes.txt", { type: "text/plain" })],
  ];
  for (const [name, file] of cases) {
    it(`rejects ${name} (400 file_signature_mismatch); nothing stored`, async () => {
      const { POST } = await loadRoute(member("ENGINEER"));
      const res = await POST(uploadRequest({ title: "T", sourceType: "manual", file }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("file_signature_mismatch");
      expect(drafts()).toHaveLength(0);
      expect(await storedFiles()).toEqual([]);
    });
  }

  it("accepts a real signature even when the browser declared application/octet-stream, and stores the canonical type", async () => {
    const { POST } = await loadRoute(member("ENGINEER"));
    const md = new File(["# Pump manual\n\nکاربرد پمپ"], "pump.md", { type: "application/octet-stream" });
    const res = await POST(uploadRequest({ title: "MD", sourceType: "manual", file: md }));
    expect(res.status).toBe(201);
    expect((await res.json()).document.mimeType).toBe("text/markdown");
  });

  it("records the canonical MIME type, never the declared one", async () => {
    const { POST } = await loadRoute(member("ENGINEER"));
    const docx = new File(["PK\x03\x04docx-body"], "spec.docx", { type: "application/octet-stream" });
    const res = await POST(uploadRequest({ title: "DOCX", sourceType: "manual", file: docx }));
    expect(res.status).toBe(201);
    expect((await res.json()).document.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });
});

// ─── whole-library figures (server side, independent of paging) ───────────────

describe("/api/documents GET — stats are computed on the server for the whole library", () => {
  function setStatus(id: string, status: Document["status"]) {
    const row = drafts().find((d) => d.id === id);
    if (!row) throw new Error(`no seeded row ${id}`);
    row.status = status;
  }

  it("counts every own document, not only the loaded page; other tenants and NULL rows are excluded", async () => {
    for (let i = 0; i < 120; i += 1) seedSessionDocument(`doc-${String(i).padStart(3, "0")}`, ORG_A);
    for (let i = 0; i < 30; i += 1) setStatus(`doc-${String(i).padStart(3, "0")}`, "indexed");
    for (let i = 30; i < 37; i += 1) setStatus(`doc-${String(i).padStart(3, "0")}`, "failed");
    for (let i = 0; i < 9; i += 1) seedSessionDocument(`foreign-${i}`, ORG_B);
    for (let i = 0; i < 9; i += 1) setStatus(`foreign-${i}`, "failed");
    seedSessionDocument("doc-null", null);
    setStatus("doc-null", "indexed");

    const { GET } = await loadRoute(member("VIEWER"));
    const body = await (await GET(listRequest())).json();
    expect(body.documents).toHaveLength(50);
    expect(body.stats).toEqual({ total: 120, indexed: 30, failed: 7 });
  });

  it("a later page carries no stats (the first page is the only source)", async () => {
    for (let i = 0; i < 5; i += 1) seedSessionDocument(`doc-${i}`, ORG_A);
    const { GET } = await loadRoute(member("VIEWER"));
    const first = await (await GET(listRequest("?limit=2"))).json();
    expect(first.stats).toEqual({ total: 5, indexed: 0, failed: 0 });
    const second = await (await GET(listRequest(`?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`))).json();
    expect(second.stats).toBeUndefined();
  });

  it("an empty library reports zeros, not missing figures", async () => {
    seedSessionDocument("foreign-x", ORG_B);
    const { GET } = await loadRoute(member("VIEWER"));
    expect((await (await GET(listRequest())).json()).stats).toEqual({ total: 0, indexed: 0, failed: 0 });
  });

  it("a refused caller gets no figures at all", async () => {
    seedSessionDocument("doc-a", ORG_A);
    const { GET } = await loadRoute(member("MEMBER"));
    const body = await (await GET(listRequest())).json();
    expect(body.stats).toBeUndefined();
  });
});

// ─── "MZ" is text, a PE header is not ─────────────────────────────────────────

describe("/api/documents POST — a leading MZ alone does not make a text file binary", () => {
  it("accepts a real .txt that starts with MZ (e.g. a model number)", async () => {
    const { POST } = await loadRoute(member("ENGINEER"));
    const txt = new File(["MZ-80 service notes\nCheck the drive belt."], "mz80.txt", { type: "text/plain" });
    const res = await POST(uploadRequest({ title: "MZ-80", sourceType: "manual", file: txt }));
    expect(res.status).toBe(201);
    expect((await res.json()).document.mimeType).toBe("text/plain");
  });

  it("still rejects a DOS/PE executable renamed .txt (NUL bytes after MZ)", async () => {
    const { POST } = await loadRoute(member("ENGINEER"));
    const pe = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])], "tool.txt", {
      type: "text/plain",
    });
    const res = await POST(uploadRequest({ title: "PE", sourceType: "manual", file: pe }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("file_signature_mismatch");
    expect(drafts()).toHaveLength(0);
  });
});
