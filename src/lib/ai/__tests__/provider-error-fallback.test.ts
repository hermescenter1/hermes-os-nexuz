import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * These tests simulate the `openai`/`@anthropic-ai/sdk` packages actually
 * being installed (via vitest's virtual module mock — no real package is
 * required on disk) so the adapters' real-call branch — timeout/error
 * handling and the "never throw" contract — can be exercised end-to-end,
 * not just the "package absent" fallback covered in providers.test.ts.
 *
 * `vi.resetModules()` + a fresh dynamic `import()` per test is required
 * because both adapters cache their constructed client in a module-level
 * variable; a fresh module instance is the only way to get a clean cache
 * under a different mock per test.
 */

const ENV_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  // vi.resetModules() clears the import cache so each test's dynamic
  // import("../providers/...") gets a fresh module instance (fresh
  // module-level client cache); each test below registers its own
  // vi.doMock(...) factory immediately before importing, which replaces
  // any prior registration for that specifier — no explicit vi.unmock
  // needed (and vi.unmock is hoisted, so it can't usefully run per-test
  // from inside a hook; see https://vitest.dev/guide/mocking/modules).
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("openaiProvider — simulated SDK present, call throws", () => {
  it("degrades to a mock 'provider_error' response instead of throwing", async () => {
    vi.doMock("openai", () => ({
      default: class {
        chat = {
          completions: {
            create: async () => {
              throw new Error("simulated upstream 500");
            },
          },
        };
      },
    }));
    process.env.OPENAI_API_KEY = "sk-test";

    const { openaiProvider } = await import("../providers/openai");
    const res = await openaiProvider.ask({ task: "structuredOutput", prompt: "x" });

    expect(res.metadata.mock).toBe(true);
    expect(res.metadata.reason).toBe("provider_error");
    expect(res.metadata.errorMessage).toBe("simulated upstream 500");
    expect(res.content).toContain("[mock:openai]");
  });
});

describe("openaiProvider — simulated SDK present, call succeeds", () => {
  it("returns a real (non-mock) response with the completion text", async () => {
    vi.doMock("openai", () => ({
      default: class {
        chat = {
          completions: {
            create: async () => ({
              choices: [{ message: { content: "real completion text" } }],
            }),
          },
        };
      },
    }));
    process.env.OPENAI_API_KEY = "sk-test";

    const { openaiProvider } = await import("../providers/openai");
    const res = await openaiProvider.ask({ task: "structuredOutput", prompt: "x" });

    expect(res.metadata.mock).toBe(false);
    expect(res.provider).toBe("openai");
    expect(res.content).toBe("real completion text");
    expect(typeof res.metadata.model).toBe("string");
  });
});

describe("claudeProvider — simulated SDK present, call throws", () => {
  it("degrades to a mock 'provider_error' response instead of throwing", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: async () => {
            throw new Error("simulated upstream 500");
          },
        };
      },
    }));
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    const { claudeProvider } = await import("../providers/claude");
    const res = await claudeProvider.ask({ task: "engineeringReasoning", prompt: "x" });

    expect(res.metadata.mock).toBe(true);
    expect(res.metadata.reason).toBe("provider_error");
    expect(res.metadata.errorMessage).toBe("simulated upstream 500");
    expect(res.content).toContain("[mock:claude]");
  });
});

describe("claudeProvider — simulated SDK present, call succeeds", () => {
  it("returns a real (non-mock) response with the completion text", async () => {
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: class {
        messages = {
          create: async () => ({
            content: [{ type: "text", text: "real claude completion" }],
          }),
        };
      },
    }));
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";

    const { claudeProvider } = await import("../providers/claude");
    const res = await claudeProvider.ask({ task: "engineeringReasoning", prompt: "x" });

    expect(res.metadata.mock).toBe(false);
    expect(res.provider).toBe("claude");
    expect(res.content).toBe("real claude completion");
  });
});
