import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runRagPipeline } from "../rag-pipeline";
import type { RagDocument } from "../types";

const ENV_KEYS = ["HERMES_RAG_ENABLED", "HERMES_RAG_MODE", "HERMES_EMBEDDING_PROVIDER"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const docs: RagDocument[] = [
  { id: "d1", sourceType: "knowledge", text: "PLC scan time drift caused by network congestion." },
  { id: "d2", sourceType: "knowledge", text: "Motor overcurrent trips during acceleration ramp." },
];

describe("runRagPipeline — disabled by default", () => {
  it("returns enabled:false with no results, touching nothing else", async () => {
    // HERMES_RAG_ENABLED intentionally left unset.
    const res = await runRagPipeline({ documents: docs, query: { text: "PLC drift" } });
    expect(res).toEqual({
      enabled: false,
      results: [],
      mode: "mock",
      embeddingProvider: "mock",
    });
  });

  it("stays disabled for any non-'true' value", async () => {
    process.env.HERMES_RAG_ENABLED = "false";
    const res = await runRagPipeline({ documents: docs, query: { text: "PLC drift" } });
    expect(res.enabled).toBe(false);
    expect(res.results).toEqual([]);
  });
});

describe("runRagPipeline — enabled (mock mode, mock embeddings)", () => {
  it("chunks, embeds, and searches end-to-end, ranking the most relevant document first", async () => {
    process.env.HERMES_RAG_ENABLED = "true";
    const res = await runRagPipeline({
      documents: docs,
      query: { text: "PLC scan time drift caused by network congestion.", topK: 2 },
    });

    expect(res.enabled).toBe(true);
    expect(res.mode).toBe("mock");
    expect(res.embeddingProvider).toBe("mock");
    expect(res.reason).toBeUndefined();
    expect(res.results.length).toBeGreaterThan(0);
    // The query is verbatim doc d1's text, so it must rank first.
    expect(res.results[0].chunk.documentId).toBe("d1");
    expect(res.results[0].score).toBeCloseTo(1, 5);
  });

  it("reports the configured mode/embeddingProvider even though Phase 14A always executes via mock", async () => {
    process.env.HERMES_RAG_ENABLED = "true";
    process.env.HERMES_RAG_MODE = "pgvector";
    process.env.HERMES_EMBEDDING_PROVIDER = "openai";
    const res = await runRagPipeline({ documents: docs, query: { text: "PLC drift" } });
    expect(res.mode).toBe("pgvector");
    expect(res.embeddingProvider).toBe("openai");
    // still produced real (mock) results — neither value crashed or no-opped
    expect(res.enabled).toBe(true);
    expect(res.results.length).toBeGreaterThan(0);
  });

  it("respects topK and metadata filters end-to-end", async () => {
    process.env.HERMES_RAG_ENABLED = "true";
    const tagged: RagDocument[] = [
      { id: "p1", sourceType: "knowledge", text: "PLC fault one", metadata: { domain: "plc" } },
      { id: "s1", sourceType: "knowledge", text: "SCADA fault one", metadata: { domain: "scada" } },
    ];
    const res = await runRagPipeline({
      documents: tagged,
      query: { text: "fault", topK: 5, filters: { domain: "plc" } },
    });
    expect(res.results.every((r) => r.chunk.metadata?.domain === "plc")).toBe(true);
  });

  it("returns [] when given no documents at all", async () => {
    process.env.HERMES_RAG_ENABLED = "true";
    const res = await runRagPipeline({ documents: [], query: { text: "anything" } });
    expect(res.enabled).toBe(true);
    expect(res.results).toEqual([]);
    expect(res.reason).toBeUndefined();
  });
});

describe("runRagPipeline — never throws", () => {
  it("a document with undefined/empty text degrades gracefully (no chunks), not an error", async () => {
    // chunkText's own defensive guard (`!text -> []`) handles this before
    // it can ever throw — confirms the chunking layer's defensiveness is
    // real, not just relied upon via the pipeline's outer try/catch.
    process.env.HERMES_RAG_ENABLED = "true";
    const noText = [{ id: "bad", sourceType: "knowledge", text: undefined }] as unknown as RagDocument[];

    const res = await runRagPipeline({ documents: noText, query: { text: "x" } });
    expect(res.enabled).toBe(true);
    expect(res.results).toEqual([]);
    expect(res.reason).toBeUndefined();
  });

  it("resolves to a safe fallback result when the query itself is malformed", async () => {
    process.env.HERMES_RAG_ENABLED = "true";
    const malformedQuery = { text: undefined } as unknown as { text: string };

    await expect(
      runRagPipeline({ documents: docs, query: malformedQuery })
    ).resolves.toMatchObject({ enabled: true, results: [], reason: "pipeline_error" });
  });

  it("resolves to a safe fallback result when documents isn't iterable at all", async () => {
    process.env.HERMES_RAG_ENABLED = "true";
    // A plain object (unlike a string or array) is genuinely not iterable —
    // `for...of` over it throws "is not iterable" inside the pipeline.
    const notIterable = { not: "an array or string" } as unknown as RagDocument[];

    await expect(
      runRagPipeline({ documents: notIterable, query: { text: "x" } })
    ).resolves.toMatchObject({ enabled: true, results: [], reason: "pipeline_error" });
  });

  it("never rejects regardless of input shape", async () => {
    process.env.HERMES_RAG_ENABLED = "true";
    const cases = [
      { documents: null as unknown as RagDocument[], query: { text: "x" } },
      { documents: docs, query: null as unknown as { text: string } },
    ];
    for (const c of cases) {
      await expect(runRagPipeline(c)).resolves.toBeDefined();
    }
  });
});
