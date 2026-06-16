import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isRagEnabled, getRagMode, getEmbeddingProvider } from "../config";

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

describe("isRagEnabled", () => {
  it("defaults to false when unset", () => {
    expect(isRagEnabled()).toBe(false);
  });
  it("is true only for the literal string 'true'", () => {
    process.env.HERMES_RAG_ENABLED = "true";
    expect(isRagEnabled()).toBe(true);
  });
  it("is false for any other value, including 'TRUE ' with whitespace/case variants normalized", () => {
    process.env.HERMES_RAG_ENABLED = "TRUE";
    expect(isRagEnabled()).toBe(true); // case-insensitive by design
    process.env.HERMES_RAG_ENABLED = "yes";
    expect(isRagEnabled()).toBe(false);
    process.env.HERMES_RAG_ENABLED = "1";
    expect(isRagEnabled()).toBe(false);
  });
});

describe("getRagMode", () => {
  it("defaults to mock when unset", () => {
    expect(getRagMode()).toBe("mock");
  });
  it("accepts pgvector and external overrides", () => {
    process.env.HERMES_RAG_MODE = "pgvector";
    expect(getRagMode()).toBe("pgvector");
    process.env.HERMES_RAG_MODE = "external";
    expect(getRagMode()).toBe("external");
  });
  it("falls back to mock for an invalid value", () => {
    process.env.HERMES_RAG_MODE = "not-a-real-mode";
    expect(getRagMode()).toBe("mock");
  });
});

describe("getEmbeddingProvider", () => {
  it("defaults to mock when unset", () => {
    expect(getEmbeddingProvider()).toBe("mock");
  });
  it("accepts openai and local overrides", () => {
    process.env.HERMES_EMBEDDING_PROVIDER = "openai";
    expect(getEmbeddingProvider()).toBe("openai");
    process.env.HERMES_EMBEDDING_PROVIDER = "local";
    expect(getEmbeddingProvider()).toBe("local");
  });
  it("falls back to mock for an invalid value", () => {
    process.env.HERMES_EMBEDDING_PROVIDER = "not-a-real-provider";
    expect(getEmbeddingProvider()).toBe("mock");
  });
});
