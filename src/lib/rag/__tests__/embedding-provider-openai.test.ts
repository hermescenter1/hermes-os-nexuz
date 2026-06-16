import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_EMBEDDING_MODEL"] as const;
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

describe("openaiEmbeddingProvider — missing API key", () => {
  it("falls back to the mock embedding and never throws", async () => {
    const { openaiEmbeddingProvider } = await import("../embedding-provider-openai");
    const res = await openaiEmbeddingProvider.embed({ chunkId: "c1", text: "hello" });
    expect(res.mock).toBe(true);
    expect(res.reason).toBe("missing_api_key");
    expect(res.chunkId).toBe("c1");
    expect(Array.isArray(res.vector)).toBe(true);
  });
});

describe("openaiEmbeddingProvider — key present, package not installed", () => {
  it("falls back to the mock embedding, never throws, never leaks the key", async () => {
    process.env.OPENAI_API_KEY = "sk-test-fake-key-not-real";
    const { openaiEmbeddingProvider } = await import("../embedding-provider-openai");
    const res = await openaiEmbeddingProvider.embed({ chunkId: "c1", text: "hello" });
    expect(res.mock).toBe(true);
    expect(res.reason).toBe("sdk_not_installed");
    expect(JSON.stringify(res)).not.toContain("sk-test-fake-key-not-real");
  });
});

describe("openaiEmbeddingProvider — declared dimensions", () => {
  it("reports the real model's dimension regardless of the mock's own dimension", async () => {
    const { openaiEmbeddingProvider } = await import("../embedding-provider-openai");
    const { OPENAI_EMBEDDING_DIMENSIONS } = await import("../config");
    expect(openaiEmbeddingProvider.dimensions).toBe(OPENAI_EMBEDDING_DIMENSIONS);
  });
});

describe("openaiEmbeddingProvider — simulated SDK present", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("degrades to mock with reason 'provider_error' when the SDK throws", async () => {
    vi.doMock("openai", () => ({
      default: class {
        embeddings = {
          create: async () => {
            throw new Error("simulated upstream 500");
          },
        };
      },
    }));
    process.env.OPENAI_API_KEY = "sk-test";

    const { openaiEmbeddingProvider } = await import("../embedding-provider-openai");
    const res = await openaiEmbeddingProvider.embed({ chunkId: "c1", text: "hello" });

    expect(res.mock).toBe(true);
    expect(res.reason).toBe("provider_error");
  });

  it("returns a real (non-mock) embedding when the SDK succeeds", async () => {
    vi.doMock("openai", () => ({
      default: class {
        embeddings = {
          create: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
        };
      },
    }));
    process.env.OPENAI_API_KEY = "sk-test";

    const { openaiEmbeddingProvider } = await import("../embedding-provider-openai");
    const res = await openaiEmbeddingProvider.embed({ chunkId: "c1", text: "hello" });

    expect(res.mock).toBe(false);
    expect(res.vector).toEqual([0.1, 0.2, 0.3]);
    expect(res.dimensions).toBe(3);
    expect(res.chunkId).toBe("c1");
  });

  it("degrades to mock with reason 'empty_response' when the SDK returns no embedding", async () => {
    vi.doMock("openai", () => ({
      default: class {
        embeddings = {
          create: async () => ({ data: [] }),
        };
      },
    }));
    process.env.OPENAI_API_KEY = "sk-test";

    const { openaiEmbeddingProvider } = await import("../embedding-provider-openai");
    const res = await openaiEmbeddingProvider.embed({ chunkId: "c1", text: "hello" });

    expect(res.mock).toBe(true);
    expect(res.reason).toBe("empty_response");
  });
});
