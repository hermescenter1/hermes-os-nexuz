import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openaiProvider } from "../providers/openai";
import { claudeProvider } from "../providers/claude";
import { localProvider } from "../providers/local";

const ENV_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_MODEL", "ANTHROPIC_MODEL"] as const;
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

describe("openaiProvider — missing API key", () => {
  it("falls back to a mock response and never throws", async () => {
    const res = await openaiProvider.ask({ task: "structuredOutput", prompt: "hello" });
    expect(res.provider).toBe("openai");
    expect(res.metadata.mock).toBe(true);
    expect(res.metadata.reason).toBe("missing_api_key");
    expect(res.content).toContain("[mock:openai]");
    expect(res.content).toContain("hello");
  });
});

describe("claudeProvider — missing API key", () => {
  it("falls back to a mock response and never throws", async () => {
    const res = await claudeProvider.ask({ task: "engineeringReasoning", prompt: "hello" });
    expect(res.provider).toBe("claude");
    expect(res.metadata.mock).toBe(true);
    expect(res.metadata.reason).toBe("missing_api_key");
    expect(res.content).toContain("[mock:claude]");
  });
});

describe("openaiProvider — key present, package not installed", () => {
  it("falls back to mock with the required install command, never throws", async () => {
    process.env.OPENAI_API_KEY = "sk-test-fake-key-not-real";
    const res = await openaiProvider.ask({ task: "structuredOutput", prompt: "hello" });
    expect(res.metadata.mock).toBe(true);
    expect(res.metadata.reason).toBe("sdk_not_installed");
    expect(res.metadata.requiredPackage).toBe("openai");
    expect(res.metadata.installCommand).toBe("npm install openai");
    // the fake key must never appear anywhere in the response
    expect(JSON.stringify(res)).not.toContain("sk-test-fake-key-not-real");
  });
});

describe("claudeProvider — key present, package not installed", () => {
  it("falls back to mock with the required install command, never throws", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-fake-key-not-real";
    const res = await claudeProvider.ask({ task: "engineeringReasoning", prompt: "hello" });
    expect(res.metadata.mock).toBe(true);
    expect(res.metadata.reason).toBe("sdk_not_installed");
    expect(res.metadata.requiredPackage).toBe("@anthropic-ai/sdk");
    expect(res.metadata.installCommand).toBe("npm install @anthropic-ai/sdk");
    expect(JSON.stringify(res)).not.toContain("sk-ant-test-fake-key-not-real");
  });
});

describe("localProvider", () => {
  it("is always a mock and never reads any key", async () => {
    const res = await localProvider.ask({ task: "deterministic", prompt: "x" });
    expect(res.provider).toBe("local");
    expect(res.metadata.mock).toBe(true);
  });
});

describe("unified AIResponse shape across all three adapters", () => {
  it("every adapter returns provider/content/metadata with the same field types", async () => {
    for (const provider of [openaiProvider, claudeProvider, localProvider]) {
      const res = await provider.ask({ task: "general", prompt: "shape check" });
      expect(res.provider).toBe(provider.id);
      expect(typeof res.content).toBe("string");
      expect(res.metadata.resolvedProvider).toBe(provider.id);
      expect(res.metadata.taskKind).toBe("general");
      expect(typeof res.metadata.mock).toBe("boolean");
    }
  });
});
