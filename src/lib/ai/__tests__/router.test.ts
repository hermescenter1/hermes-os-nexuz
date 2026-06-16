import { describe, it, expect } from "vitest";
import { aiRouter, resolveProvider, routeAIRequest } from "../router";
import { openaiProvider } from "../providers/openai";
import { claudeProvider } from "../providers/claude";
import { localProvider } from "../providers/local";

describe("AI provider adapters (Phase 12-A — mock only)", () => {
  it("each adapter returns a mock response carrying its own provider id", async () => {
    for (const provider of [openaiProvider, claudeProvider, localProvider]) {
      const res = await provider.ask({ task: "general", prompt: "hello" });
      expect(res.provider).toBe(provider.id);
      expect(res.metadata.mock).toBe(true);
      expect(res.metadata.resolvedProvider).toBe(provider.id);
      expect(res.content).toContain("hello");
    }
  });
});

describe("resolveProvider (hybrid routing table)", () => {
  it("routes engineering reasoning to claude", () => {
    expect(resolveProvider("hybrid", "engineeringReasoning")).toBe("claude");
  });
  it("routes structured output to openai", () => {
    expect(resolveProvider("hybrid", "structuredOutput")).toBe("openai");
  });
  it("routes deterministic tasks to local", () => {
    expect(resolveProvider("hybrid", "deterministic")).toBe("local");
  });
  it("routes unclassified (general) tasks to local as a safe default", () => {
    expect(resolveProvider("hybrid", "general")).toBe("local");
  });
  it("a fixed mode always wins over the task kind", () => {
    expect(resolveProvider("openai", "engineeringReasoning")).toBe("openai");
    expect(resolveProvider("claude", "deterministic")).toBe("claude");
    expect(resolveProvider("local", "structuredOutput")).toBe("local");
  });
});

describe("aiRouter.ask (hybrid mode is the default)", () => {
  it("delegates an engineering-reasoning request to claude", async () => {
    const res = await aiRouter.ask({ task: "engineeringReasoning", prompt: "why did it trip?" });
    expect(res.provider).toBe("hybrid");
    expect(res.metadata.resolvedProvider).toBe("claude");
    expect(res.metadata.routingMode).toBe("hybrid");
    expect(res.content).toContain("[mock:claude]");
  });

  it("delegates a structured-output request to openai", async () => {
    const res = await aiRouter.ask({ task: "structuredOutput", prompt: "return JSON" });
    expect(res.metadata.resolvedProvider).toBe("openai");
    expect(res.content).toContain("[mock:openai]");
  });

  it("delegates a deterministic request to local", async () => {
    const res = await aiRouter.ask({ task: "deterministic", prompt: "compute checksum" });
    expect(res.metadata.resolvedProvider).toBe("local");
    expect(res.content).toContain("[mock:local]");
  });

  it("routeAIRequest is equivalent to aiRouter.ask", async () => {
    const res = await routeAIRequest({ task: "deterministic", prompt: "x" });
    expect(res.metadata.resolvedProvider).toBe("local");
  });
});
