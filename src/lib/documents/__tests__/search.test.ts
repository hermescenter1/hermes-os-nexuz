import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { searchDocuments } from "../search";
import { documentTextChunkRepository } from "../chunk-repository";
import { embedDocumentChunks } from "../embedding";

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
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function seed(documentId: string, texts: string[]) {
  await documentTextChunkRepository().createMany(
    texts.map((text, i) => ({ documentId, position: i, text, charCount: text.length, metadata: {} }))
  );
  await embedDocumentChunks(documentId);
}

// ─── degenerate inputs ────────────────────────────────────────────────────────

describe("searchDocuments — degenerate inputs", () => {
  it("returns empty matches for an empty string query", async () => {
    expect(await searchDocuments("")).toEqual({ matches: [] });
  });

  it("returns empty matches for a whitespace-only query", async () => {
    expect(await searchDocuments("   ")).toEqual({ matches: [] });
  });

  it("returns empty matches when no chunks exist at all", async () => {
    expect(await searchDocuments("motor fault")).toEqual({ matches: [] });
  });

  it("returns empty matches when chunks exist but none are embedded", async () => {
    // Create a chunk without embedding it
    await documentTextChunkRepository().createMany([
      { documentId: "d1", position: 0, text: "unembedded chunk text", charCount: 21, metadata: {} },
    ]);
    expect(await searchDocuments("unembedded chunk text")).toEqual({ matches: [] });
  });
});

// ─── with embedded chunks ─────────────────────────────────────────────────────

describe("searchDocuments — with embedded chunks", () => {
  it("returns matches with the required shape fields", async () => {
    await seed("doc-1", ["siemens s7-1500 cpu watchdog fault"]);
    const { matches } = await searchDocuments("siemens s7-1500 cpu watchdog fault");
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
    const { matches } = await searchDocuments("siemens plc s7-1500 watchdog fault");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].text).toBe("siemens plc s7-1500 watchdog fault");
    expect(matches[0].score).toBeCloseTo(1.0, 5);
  });

  it("results are ordered by score descending", async () => {
    await seed("doc-3", [
      "motor overheating fault thermal protection",
      "ethernet network communication timeout",
    ]);
    const { matches } = await searchDocuments("motor overheating fault thermal protection");
    if (matches.length >= 2) {
      expect(matches[0].score).toBeGreaterThanOrEqual(matches[1].score);
    }
  });

  it("topK parameter limits the number of matches returned", async () => {
    await seed("doc-4", ["chunk a", "chunk b", "chunk c", "chunk d", "chunk e"]);
    const { matches: two } = await searchDocuments("chunk a", 2);
    expect(two.length).toBeLessThanOrEqual(2);
    const { matches: one } = await searchDocuments("chunk a", 1);
    expect(one.length).toBe(1);
  });

  it("default topK is 5 — returns at most 5 matches for a large chunk set", async () => {
    await seed(
      "doc-5",
      Array.from({ length: 10 }, (_, i) => `industrial document chunk number ${i}`)
    );
    const { matches } = await searchDocuments("industrial document chunk");
    expect(matches.length).toBeLessThanOrEqual(5);
  });

  it("documentId is preserved on each match — caller can look up the source document", async () => {
    await seed("doc-6", ["control system commissioning procedure"]);
    const { matches } = await searchDocuments("control system commissioning procedure");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].documentId).toBe("doc-6");
  });
});

// ─── safe failure behavior ────────────────────────────────────────────────────

describe("searchDocuments — safe failure contract", () => {
  it("never throws — always resolves to an object with a matches array", async () => {
    await expect(searchDocuments("anything whatsoever")).resolves.toHaveProperty("matches");
    await expect(searchDocuments("")).resolves.toHaveProperty("matches");
  });

  it("matches is always an array, never null or undefined", async () => {
    const result = await searchDocuments("motor overtemperature");
    expect(Array.isArray(result.matches)).toBe(true);
  });
});
