import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { localEmbeddingProvider } from "../embedding-provider-local";

const ENV_KEYS = ["HERMES_LOCAL_EMBEDDING_URL"] as const;
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
  vi.unstubAllGlobals();
});

describe("localEmbeddingProvider — no server configured", () => {
  it("falls back to the mock embedding and never throws", async () => {
    const res = await localEmbeddingProvider.embed({ chunkId: "c1", text: "hello" });
    expect(res.mock).toBe(true);
    expect(res.reason).toBe("missing_api_key");
    expect(res.chunkId).toBe("c1");
  });
});

describe("localEmbeddingProvider — server configured but unreachable", () => {
  it("degrades to mock with reason 'provider_error' on a genuine network failure", async () => {
    // A port nothing is listening on — guaranteed connection failure, no
    // mocking required, exercises the real fetch/catch path end-to-end.
    process.env.HERMES_LOCAL_EMBEDDING_URL = "http://127.0.0.1:1";
    const res = await localEmbeddingProvider.embed({ chunkId: "c1", text: "hello" });
    expect(res.mock).toBe(true);
    expect(res.reason).toBe("provider_error");
  }, 20_000);
});

describe("localEmbeddingProvider — simulated server present", () => {
  it("returns a real (non-mock) embedding when the server responds with a vector", async () => {
    process.env.HERMES_LOCAL_EMBEDDING_URL = "http://local-embedding-test.invalid";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: [0.4, 0.5, 0.6] }),
      })
    );

    const res = await localEmbeddingProvider.embed({ chunkId: "c1", text: "hello" });
    expect(res.mock).toBe(false);
    expect(res.vector).toEqual([0.4, 0.5, 0.6]);
    expect(res.dimensions).toBe(3);
    expect(res.model).toBe("local");
  });

  it("degrades to mock with reason 'empty_response' when the server returns no vector", async () => {
    process.env.HERMES_LOCAL_EMBEDDING_URL = "http://local-embedding-test.invalid";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    );

    const res = await localEmbeddingProvider.embed({ chunkId: "c1", text: "hello" });
    expect(res.mock).toBe(true);
    expect(res.reason).toBe("empty_response");
  });

  it("degrades to mock with reason 'provider_error' on a non-2xx response", async () => {
    process.env.HERMES_LOCAL_EMBEDDING_URL = "http://local-embedding-test.invalid";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    );

    const res = await localEmbeddingProvider.embed({ chunkId: "c1", text: "hello" });
    expect(res.mock).toBe(true);
    expect(res.reason).toBe("provider_error");
  });
});
