import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Document } from "../types";
import { ORG_A, ORG_B, resetSessionDocuments, seedSessionDocument } from "./tenant-fixtures";

/**
 * F-2 — the organization-scoped document repository, in both storage modes.
 *
 * Session mode runs the real in-process store. Database mode replaces
 * `getPrisma` with a recording fake so the test can assert the tenant
 * predicate is IN every query, and can exercise the silent session fallback
 * the repository keeps for a failing database. The same properties are proven
 * against real PostgreSQL in `pg/document-tenant-ownership.pg.test.ts`.
 */

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetSessionDocuments();
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.doUnmock("@/lib/db/prisma");
});

function input(over: Record<string, unknown> = {}) {
  return {
    title: "Scoped",
    sourceType: "manual" as const,
    originalFilename: "s.pdf",
    mimeType: "application/pdf",
    sizeBytes: 3,
    storageProvider: "local" as const,
    storageKey: "",
    metadata: { tags: [] },
    chunkCount: 0,
    status: "uploaded" as const,
    uploadedBy: "user-a",
    ...over,
  };
}

const drafts = () =>
  (globalThis as unknown as { __hermesDocumentDrafts?: Document[] }).__hermesDocumentDrafts ?? [];

describe("documentRepositoryForOrganization — session mode", () => {
  it("create() fixes the organization even if a tenantId is smuggled in", async () => {
    const { documentRepositoryForOrganization } = await import("../document-repository");
    const smuggled = input({ tenantId: ORG_B }) as ReturnType<typeof input>;
    const doc = await documentRepositoryForOrganization(ORG_A).create(smuggled);
    expect(doc.tenantId).toBe(ORG_A);
    expect(doc.uploadedBy).toBe("user-a");
  });

  it("list/get/update/delete never reach another organization's or an unassigned document", async () => {
    seedSessionDocument("doc-a", ORG_A);
    seedSessionDocument("doc-b", ORG_B);
    seedSessionDocument("doc-null", null);
    const { documentRepositoryForOrganization } = await import("../document-repository");
    const repo = documentRepositoryForOrganization(ORG_A);

    expect((await repo.listPage()).documents.map((d) => d.id)).toEqual(["doc-a"]);
    expect(await repo.get("doc-b")).toBeNull();
    expect(await repo.get("doc-null")).toBeNull();
    expect(await repo.update("doc-b", { title: "hijacked" })).toBeNull();
    expect(await repo.delete("doc-b")).toBe(false);
    expect(await repo.delete("doc-null")).toBe(false);
    expect(drafts().find((d) => d.id === "doc-b")?.title).toBe("doc-b");
    expect(drafts().map((d) => d.id).sort()).toEqual(["doc-a", "doc-b", "doc-null"]);
  });

  it("update() strips ownership keys smuggled past the type", async () => {
    seedSessionDocument("doc-a", ORG_A);
    const { documentRepositoryForOrganization } = await import("../document-repository");
    const patch = { title: "renamed", tenantId: ORG_B, uploadedBy: "attacker", id: "doc-x" } as unknown as {
      title: string;
    };
    const updated = await documentRepositoryForOrganization(ORG_A).update("doc-a", patch);
    expect(updated).toMatchObject({ id: "doc-a", title: "renamed", tenantId: ORG_A });
    expect(updated?.uploadedBy).not.toBe("attacker");
  });
});

describe("documentRepositoryForOrganization — database mode", () => {
  type Call = { op: string; args: Record<string, unknown> };

  async function load(model: Record<string, (args: Record<string, unknown>) => Promise<unknown>>) {
    process.env.HERMES_STORAGE_MODE = "database";
    const calls: Call[] = [];
    const recorded = Object.fromEntries(
      Object.entries(model).map(([op, fn]) => [
        op,
        async (args: Record<string, unknown>) => {
          calls.push({ op, args });
          return fn(args);
        },
      ])
    );
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => ({ document: recorded }) }));
    const mod = await import("../document-repository");
    return { repo: mod.documentRepositoryForOrganization(ORG_A), calls };
  }

  const row = (over: Record<string, unknown> = {}) => ({
    ...input(),
    id: "doc-db",
    tenantId: ORG_A,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

  it("puts the tenant predicate inside every query and bounds the list", async () => {
    const { repo, calls } = await load({
      findMany: async () => [],
      findFirst: async () => null,
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
      create: async (a) => row(a.data as Record<string, unknown>),
    });
    await repo.listPage({ limit: 1000 });
    await repo.listPage({ limit: 5, cursor: { createdAt: "2026-09-24T10:00:00.000Z", id: "doc-k" } });
    await repo.get("doc-x");
    await repo.update("doc-x", { title: "t" });
    await repo.delete("doc-x");
    await repo.create(input({ tenantId: ORG_B }) as ReturnType<typeof input>);

    const byOp = (op: string) => calls.find((c) => c.op === op)!.args;
    const [firstPage, afterCursor] = calls.filter((c) => c.op === "findMany").map((c) => c.args);
    // limit clamped to 100; one extra row only proves a next page exists.
    expect(firstPage).toEqual({
      where: { tenantId: ORG_A },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 101,
    });
    // The cursor becomes a keyset predicate INSIDE the tenant-filtered query.
    expect(afterCursor).toEqual({
      where: {
        tenantId: ORG_A,
        OR: [
          { createdAt: { lt: new Date("2026-09-24T10:00:00.000Z") } },
          { createdAt: new Date("2026-09-24T10:00:00.000Z"), id: { lt: "doc-k" } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
    });
    expect(byOp("findFirst")).toMatchObject({ where: { id: "doc-x", tenantId: ORG_A } });
    expect(byOp("updateMany")).toMatchObject({ where: { id: "doc-x", tenantId: ORG_A } });
    expect(byOp("updateMany").data).not.toHaveProperty("tenantId");
    expect(byOp("deleteMany")).toMatchObject({ where: { id: "doc-x", tenantId: ORG_A } });
    expect((byOp("create").data as Record<string, unknown>).tenantId).toBe(ORG_A);
  });

  it("a row that fell back to the session store at create() still receives its storageKey", async () => {
    const { repo } = await load({
      create: async () => {
        throw new Error("db down");
      },
      updateMany: async () => ({ count: 0 }),
      findFirst: async () => null,
      deleteMany: async () => ({ count: 0 }),
    });
    const doc = await repo.create(input());
    expect(doc.tenantId).toBe(ORG_A);
    const updated = await repo.update(doc.id, { storageKey: `documents/${doc.id}/original.pdf` });
    expect(updated?.storageKey).toBe(`documents/${doc.id}/original.pdf`);
    expect(await repo.delete(doc.id)).toBe(true);
  });

  it("the session fallback is tenant-filtered too: a foreign session row is never reached", async () => {
    seedSessionDocument("doc-b", ORG_B);
    const { repo } = await load({
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
      findFirst: async () => null,
    });
    expect(await repo.update("doc-b", { title: "hijacked" })).toBeNull();
    expect(await repo.delete("doc-b")).toBe(false);
    expect(drafts().find((d) => d.id === "doc-b")?.title).toBe("doc-b");
  });
});

describe("documentRepositoryForOrganization — session paging", () => {
  it("pages newest-first with a cursor, never repeats a row, and ends with nextCursor null", async () => {
    for (let i = 0; i < 7; i += 1) seedSessionDocument(`doc-${i}`, ORG_A);
    seedSessionDocument("doc-b", ORG_B);
    const { documentRepositoryForOrganization } = await import("../document-repository");
    const { decodeDocumentListCursor } = await import("../list-cursor");
    const repo = documentRepositoryForOrganization(ORG_A);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await repo.listPage({ limit: 3, cursor: cursor ? decodeDocumentListCursor(cursor) : null });
      seen.push(...page.documents.map((d) => d.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(seen).not.toContain("doc-b");
  });
});

describe("documentRepositoryForOrganization — whole-library stats", () => {
  it("session mode: counts only this organization's rows, by status", async () => {
    seedSessionDocument("a-1", ORG_A);
    seedSessionDocument("a-2", ORG_A);
    seedSessionDocument("a-3", ORG_A);
    seedSessionDocument("b-1", ORG_B);
    seedSessionDocument("n-1", null);
    const rows = drafts();
    rows.find((d) => d.id === "a-1")!.status = "indexed";
    rows.find((d) => d.id === "a-2")!.status = "failed";
    rows.find((d) => d.id === "b-1")!.status = "failed";
    rows.find((d) => d.id === "n-1")!.status = "indexed";
    const { documentRepositoryForOrganization } = await import("../document-repository");
    expect(await documentRepositoryForOrganization(ORG_A).stats()).toEqual({ total: 3, indexed: 1, failed: 1 });
  });

  it("database mode: one tenant-filtered groupBy on status, summed into the figures", async () => {
    process.env.HERMES_STORAGE_MODE = "database";
    const calls: unknown[] = [];
    vi.doMock("@/lib/db/prisma", () => ({
      getPrisma: async () => ({
        document: {
          groupBy: async (args: unknown) => {
            calls.push(args);
            return [
              { status: "indexed", _count: { _all: 40 } },
              { status: "failed", _count: { _all: 2 } },
              { status: "uploaded", _count: { _all: 458 } },
            ];
          },
        },
      }),
    }));
    const { documentRepositoryForOrganization } = await import("../document-repository");
    expect(await documentRepositoryForOrganization(ORG_A).stats()).toEqual({ total: 500, indexed: 40, failed: 2 });
    expect(calls).toEqual([{ by: ["status"], where: { tenantId: ORG_A }, _count: { _all: true } }]);
  });
});
