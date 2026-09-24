import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { searchDocuments, resolveDocumentSearchScope } from "../search";
import { documentTextChunkRepository } from "../chunk-repository";
import { embedDocumentChunks } from "../embedding";
import { ORG_A, ORG_B, SCOPE_A, SCOPE_B, resetSessionDocuments, seedSessionDocument } from "./tenant-fixtures";

const ENV_KEYS = ["HERMES_STORAGE_MODE", "DATABASE_URL", "DOCUMENT_EMBEDDINGS_PROVIDER"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.DOCUMENT_EMBEDDINGS_PROVIDER = "mock";
  (globalThis as unknown as { __hermesDocumentTextChunks?: unknown[] }).__hermesDocumentTextChunks = [];
  resetSessionDocuments();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// F-1: search is tenant-scoped through the parent Document row — seed the
// owning document (ORG_A unless stated) before its chunks.
async function seed(documentId: string, texts: string[], tenantId: string | null = ORG_A) {
  seedSessionDocument(documentId, tenantId);
  await documentTextChunkRepository().createMany(
    texts.map((text, i) => ({ documentId, position: i, text, charCount: text.length, metadata: {} }))
  );
  await embedDocumentChunks(documentId);
}

// ─── degenerate inputs ────────────────────────────────────────────────────────

describe("searchDocuments — degenerate inputs", () => {
  it("returns empty matches for an empty string query", async () => {
    expect(await searchDocuments("", SCOPE_A)).toEqual({ matches: [] });
  });

  it("returns empty matches for a whitespace-only query", async () => {
    expect(await searchDocuments("   ", SCOPE_A)).toEqual({ matches: [] });
  });

  it("returns empty matches when no chunks exist at all", async () => {
    expect(await searchDocuments("motor fault", SCOPE_A)).toEqual({ matches: [] });
  });

  it("returns empty matches when chunks exist but none are embedded", async () => {
    // Create a chunk without embedding it
    seedSessionDocument("d1", ORG_A);
    await documentTextChunkRepository().createMany([
      { documentId: "d1", position: 0, text: "unembedded chunk text", charCount: 21, metadata: {} },
    ]);
    expect(await searchDocuments("unembedded chunk text", SCOPE_A)).toEqual({ matches: [] });
  });
});

// ─── with embedded chunks ─────────────────────────────────────────────────────

describe("searchDocuments — with embedded chunks", () => {
  it("returns matches with the required shape fields", async () => {
    await seed("doc-1", ["siemens s7-1500 cpu watchdog fault"]);
    const { matches } = await searchDocuments("siemens s7-1500 cpu watchdog fault", SCOPE_A);
    expect(matches.length).toBeGreaterThan(0);
    const [m] = matches;
    expect(typeof m.chunkId).toBe("string");
    expect(m.documentId).toBe("doc-1");
    expect(typeof m.position).toBe("number");
    expect(typeof m.text).toBe("string");
    expect(typeof m.score).toBe("number");
    expect(m.score).toBeGreaterThan(0);
  });

  it("exact-text query places the matching chunk first with score ~1.0", async () => {
    await seed("doc-2", [
      "siemens plc s7-1500 watchdog fault",
      "abb inverter overcurrent protection trip",
    ]);
    const { matches } = await searchDocuments("siemens plc s7-1500 watchdog fault", SCOPE_A);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].text).toBe("siemens plc s7-1500 watchdog fault");
    expect(matches[0].score).toBeCloseTo(1.0, 5);
  });

  it("results are ordered by score descending", async () => {
    await seed("doc-3", [
      "motor overheating fault thermal protection",
      "ethernet network communication timeout",
    ]);
    const { matches } = await searchDocuments("motor overheating fault thermal protection", SCOPE_A);
    if (matches.length >= 2) {
      expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score);
    }
  });

  it("topK parameter limits the number of matches returned", async () => {
    await seed("doc-4", ["chunk a", "chunk b", "chunk c", "chunk d", "chunk e"]);
    const { matches: two } = await searchDocuments("chunk a", SCOPE_A, 2);
    expect(two.length).toBeLessThanOrEqual(2);
    const { matches: one } = await searchDocuments("chunk a", SCOPE_A, 1);
    expect(one.length).toBe(1);
  });

  it("default topK is 5 — returns at most 5 matches for a large chunk set", async () => {
    await seed(
      "doc-5",
      Array.from({ length: 10 }, (_, i) => `industrial document chunk number ${i}`)
    );
    const { matches } = await searchDocuments("industrial document chunk", SCOPE_A);
    expect(matches.length).toBeLessThanOrEqual(5);
  });

  it("documentId is preserved on each match — caller can look up the source document", async () => {
    await seed("doc-6", ["control system commissioning procedure"]);
    const { matches } = await searchDocuments("control system commissioning procedure", SCOPE_A);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].documentId).toBe("doc-6");
  });
});

// ─── safe failure behavior ────────────────────────────────────────────────────

describe("searchDocuments — safe failure contract", () => {
  it("never throws — always resolves to an object with a matches array", async () => {
    await expect(searchDocuments("anything whatsoever", SCOPE_A)).resolves.toHaveProperty("matches");
    await expect(searchDocuments("", SCOPE_A)).resolves.toHaveProperty("matches");
  });

  it("matches is always an array, never null or undefined", async () => {
    const result = await searchDocuments("motor overtemperature", SCOPE_A);
    expect(Array.isArray(result.matches)).toBe(true);
  });
});

// ─── F-1: tenant isolation ────────────────────────────────────────────────────

describe("searchDocuments — F-1 tenant isolation", () => {
  const CANARY_B = "canary tenant b confidential commissioning text 9d2e";

  it("returns only the caller tenant's chunks — tenant B text never reaches tenant A", async () => {
    await seed("doc-a", ["canary tenant b confidential commissioning text"], ORG_A);
    await seed("doc-b", [CANARY_B], ORG_B);
    const { matches } = await searchDocuments(CANARY_B, SCOPE_A);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.documentId === "doc-a")).toBe(true);
    expect(JSON.stringify(matches)).not.toContain("9d2e");
  });

  it("tenant B sees its own chunk", async () => {
    await seed("doc-b", [CANARY_B], ORG_B);
    const { matches } = await searchDocuments(CANARY_B, SCOPE_B);
    expect(matches.map((m) => m.documentId)).toEqual(["doc-b"]);
  });

  it("NULL-tenant (legacy) documents are invisible to every tenant", async () => {
    await seed("doc-legacy", ["legacy manual text"], null);
    expect(await searchDocuments("legacy manual text", SCOPE_A)).toEqual({ matches: [] });
    expect(await searchDocuments("legacy manual text", SCOPE_B)).toEqual({ matches: [] });
  });

  it("a null or unusable scope returns no matches", async () => {
    await seed("doc-a", ["some tenant a text"], ORG_A);
    expect(await searchDocuments("some tenant a text", null)).toEqual({ matches: [] });
    expect(await searchDocuments("some tenant a text", { orgId: "" })).toEqual({ matches: [] });
  });
});

describe("searchDocuments — F-1 no scope means no embedding call (R4)", () => {
  afterEach(() => {
    vi.doUnmock("../embedding-provider");
    vi.resetModules();
  });

  it("never calls the embedding provider without a usable scope", async () => {
    const embed = vi.fn(async () => ({ chunkId: "__query__", vector: [1], model: "spy", dimensions: 1 }));
    vi.resetModules();
    vi.doMock("../embedding-provider", () => ({
      resolveDocumentEmbeddingProvider: () => ({ id: "spy", embed }),
    }));
    const { searchDocuments: scopedSearch } = await import("../search");
    expect(await scopedSearch("question text", null)).toEqual({ matches: [] });
    expect(await scopedSearch("question text", { orgId: "" })).toEqual({ matches: [] });
    expect(embed).not.toHaveBeenCalled();
  });
});

describe("resolveDocumentSearchScope — derived only from the server-resolved owner", () => {
  it("anonymous (null / undefined owner) yields no scope", () => {
    expect(resolveDocumentSearchScope(null)).toBeNull();
    expect(resolveDocumentSearchScope(undefined)).toBeNull();
  });

  it("an ambiguous multi-org owner yields no scope, even if an orgId is present", () => {
    expect(resolveDocumentSearchScope({ userId: "u1", orgId: ORG_A, ambiguous: true })).toBeNull();
  });

  it("a personal (org-less) owner yields no scope", () => {
    expect(resolveDocumentSearchScope({ userId: "u1", orgId: null })).toBeNull();
    expect(resolveDocumentSearchScope({ userId: "u1", orgId: "" })).toBeNull();
  });

  it("a single-org owner yields exactly that organization", () => {
    expect(resolveDocumentSearchScope({ userId: "u1", orgId: ORG_A })).toEqual({ orgId: ORG_A });
  });
});
