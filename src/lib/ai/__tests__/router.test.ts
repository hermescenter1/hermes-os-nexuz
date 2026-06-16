import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { aiRouter, resolveProvider, routeAIRequest } from "../router";
import { getAIProviderMode } from "../config";

const ENV_KEYS = ["AI_PROVIDER_MODE", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function clearAllEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

describe("getAIProviderMode (config)", () => {
  it("defaults to mock when nothing is configured", () => {
    clearAllEnv();
    expect(getAIProviderMode()).toBe("mock");
  });

  it("defaults to hybrid when any provider key is present", () => {
    clearAllEnv();
    process.env.OPENAI_API_KEY = "sk-test";
    expect(getAIProviderMode()).toBe("hybrid");
  });

  it("AI_PROVIDER_MODE overrides the computed default either direction", () => {
    clearAllEnv();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AI_PROVIDER_MODE = "mock";
    expect(getAIProviderMode()).toBe("mock");

    delete process.env.OPENAI_API_KEY;
    process.env.AI_PROVIDER_MODE = "real";
    expect(getAIProviderMode()).toBe("real");
  });

  it("ignores an invalid override and falls back to the computed default", () => {
    clearAllEnv();
    process.env.AI_PROVIDER_MODE = "not-a-real-mode";
    expect(getAIProviderMode()).toBe("mock");
  });
});

describe("resolveProvider (routing table)", () => {
  it("mock mode always resolves to local, regardless of task", () => {
    expect(resolveProvider("mock", "engineeringReasoning")).toBe("local");
    expect(resolveProvider("mock", "structuredOutput")).toBe("local");
    expect(resolveProvider("mock", "deterministic")).toBe("local");
    expect(resolveProvider("mock", "general")).toBe("local");
  });

  it("hybrid mode routes engineering reasoning to claude", () => {
    expect(resolveProvider("hybrid", "engineeringReasoning")).toBe("claude");
  });
  it("hybrid mode routes structured output to openai", () => {
    expect(resolveProvider("hybrid", "structuredOutput")).toBe("openai");
  });
  it("hybrid mode routes deterministic tasks to local", () => {
    expect(resolveProvider("hybrid", "deterministic")).toBe("local");
  });
  it("hybrid mode routes unclassified (general) tasks to local as a safe default", () => {
    expect(resolveProvider("hybrid", "general")).toBe("local");
  });

  it("real mode uses the identical per-task table as hybrid", () => {
    expect(resolveProvider("real", "engineeringReasoning")).toBe("claude");
    expect(resolveProvider("real", "structuredOutput")).toBe("openai");
    expect(resolveProvider("real", "deterministic")).toBe("local");
  });
});

describe("aiRouter.ask — mock mode", () => {
  it("forces local for every task and never reports mock: false", async () => {
    clearAllEnv();
    process.env.AI_PROVIDER_MODE = "mock";
    // Even with keys present, mock mode must not attempt a real call.
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    for (const task of ["engineeringReasoning", "structuredOutput", "deterministic", "general"] as const) {
      const res = await aiRouter.ask({ task, prompt: "x" });
      expect(res.provider).toBe("local");
      expect(res.metadata.resolvedProvider).toBe("local");
      expect(res.metadata.mock).toBe(true);
      expect(res.metadata.reason).toBe("forced_mock");
      expect(res.metadata.routingMode).toBe("mock");
    }
  });
});

describe("aiRouter.ask — hybrid mode (no keys configured)", () => {
  it("delegates an engineering-reasoning request to claude (which mocks, no key)", async () => {
    clearAllEnv();
    process.env.AI_PROVIDER_MODE = "hybrid";
    const res = await aiRouter.ask({ task: "engineeringReasoning", prompt: "why did it trip?" });
    expect(res.provider).toBe("hybrid");
    expect(res.metadata.resolvedProvider).toBe("claude");
    expect(res.metadata.routingMode).toBe("hybrid");
    expect(res.metadata.mock).toBe(true);
    expect(res.metadata.reason).toBe("missing_api_key");
    expect(res.content).toContain("[mock:claude]");
  });

  it("delegates a structured-output request to openai (which mocks, no key)", async () => {
    clearAllEnv();
    process.env.AI_PROVIDER_MODE = "hybrid";
    const res = await aiRouter.ask({ task: "structuredOutput", prompt: "return JSON" });
    expect(res.metadata.resolvedProvider).toBe("openai");
    expect(res.metadata.reason).toBe("missing_api_key");
    expect(res.content).toContain("[mock:openai]");
  });

  it("delegates a deterministic request to local", async () => {
    clearAllEnv();
    process.env.AI_PROVIDER_MODE = "hybrid";
    const res = await aiRouter.ask({ task: "deterministic", prompt: "compute checksum" });
    expect(res.metadata.resolvedProvider).toBe("local");
    expect(res.content).toContain("[mock:local]");
  });

  it("routeAIRequest is equivalent to aiRouter.ask", async () => {
    clearAllEnv();
    process.env.AI_PROVIDER_MODE = "hybrid";
    const res = await routeAIRequest({ task: "deterministic", prompt: "x" });
    expect(res.metadata.resolvedProvider).toBe("local");
  });
});

describe("aiRouter.ask — real mode (no keys configured)", () => {
  it("reports the concrete provider directly, not 'hybrid', and still degrades safely", async () => {
    clearAllEnv();
    process.env.AI_PROVIDER_MODE = "real";
    const res = await aiRouter.ask({ task: "engineeringReasoning", prompt: "diagnose this" });
    expect(res.provider).toBe("claude");
    expect(res.metadata.resolvedProvider).toBe("claude");
    expect(res.metadata.routingMode).toBe("real");
    expect(res.metadata.mock).toBe(true);
  });
});

describe("unified AIResponse shape", () => {
  it("every mode/task combination returns the same top-level shape", async () => {
    clearAllEnv();
    for (const mode of ["mock", "real", "hybrid"] as const) {
      process.env.AI_PROVIDER_MODE = mode;
      for (const task of ["engineeringReasoning", "structuredOutput", "deterministic", "general"] as const) {
        const res = await aiRouter.ask({ task, prompt: "shape check" });
        expect(typeof res.provider).toBe("string");
        expect(typeof res.content).toBe("string");
        expect(typeof res.metadata).toBe("object");
        expect(typeof res.metadata.resolvedProvider).toBe("string");
        expect(typeof res.metadata.taskKind).toBe("string");
        expect(typeof res.metadata.mock).toBe("boolean");
      }
    }
  });
});
