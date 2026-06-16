import { describe, it, expect } from "vitest";
import { mockResponse, loadOptionalPackage, withTimeout } from "../providers/shared";

describe("mockResponse", () => {
  it("produces the unified AIResponse shape with the given reason", () => {
    const res = mockResponse("openai", { task: "structuredOutput", prompt: "hi" }, "missing_api_key");
    expect(res).toEqual({
      provider: "openai",
      content: "[mock:openai] hi",
      metadata: {
        resolvedProvider: "openai",
        taskKind: "structuredOutput",
        mock: true,
        reason: "missing_api_key",
      },
    });
  });

  it("merges extra diagnostic fields into metadata", () => {
    const res = mockResponse("claude", { task: "general", prompt: "x" }, "provider_error", {
      errorMessage: "boom",
    });
    expect(res.metadata.errorMessage).toBe("boom");
  });
});

describe("loadOptionalPackage", () => {
  it("resolves to null for a package that does not exist, without throwing", async () => {
    const mod = await loadOptionalPackage("definitely-not-a-real-package-xyz-12345");
    expect(mod).toBeNull();
  });
});

describe("withTimeout", () => {
  it("resolves with the value when the promise settles before the deadline", async () => {
    const res = await withTimeout(Promise.resolve("done"), 1000);
    expect(res).toEqual({ ok: true, value: "done" });
  });

  it("resolves to a timeout result when the promise is slower than the deadline", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("too late"), 200));
    const res = await withTimeout(slow, 20);
    expect(res).toEqual({ ok: false, reason: "timeout" });
  });
});
