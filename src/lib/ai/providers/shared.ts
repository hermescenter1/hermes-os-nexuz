import type { AIRequestInput, AIResponse, ConcreteProviderId } from "../types";

/**
 * Shared provider safety helpers (Phase 12-B).
 *
 * Both `openai.ts` and `claude.ts` are built on these three primitives so
 * the "never throw, always degrade to mock" contract is implemented once,
 * not duplicated per adapter.
 */

/** The universal, never-throws fallback. Every adapter returns this
 *  whenever a real call isn't possible or isn't attempted — missing key,
 *  missing SDK, a forced mock mode, a timeout, or any provider error. */
export function mockResponse(
  provider: ConcreteProviderId,
  input: AIRequestInput,
  reason: string,
  extra: Record<string, unknown> = {}
): AIResponse {
  return {
    provider,
    content: `[mock:${provider}] ${input.prompt}`,
    metadata: {
      resolvedProvider: provider,
      taskKind: input.task,
      mock: true,
      reason,
      ...extra,
    },
  };
}

/**
 * Dynamically imports an optional package without webpack or `tsc`
 * attempting static module resolution against it — the specifier is
 * received as a parameter (a variable), never a literal at the call site.
 * TypeScript only performs module/type resolution for a dynamic `import()`
 * whose argument is a string LITERAL; with a variable argument it types the
 * result as `Promise<any>` and skips resolution entirely. The same rule
 * applies to webpack/esbuild's static dependency analysis. This is what
 * lets `openai`/`@anthropic-ai/sdk` stay genuinely optional: neither
 * `npx tsc --noEmit` nor `npm run build` ever needs them to exist.
 *
 * Returns null (never throws) when the package isn't installed or fails to
 * load for any other reason.
 */
export async function loadOptionalPackage<T = unknown>(packageName: string): Promise<T | null> {
  try {
    const mod = await import(packageName);
    return mod as T;
  } catch {
    return null;
  }
}

export type TimeoutResult<T> = { ok: true; value: T } | { ok: false; reason: "timeout" };

/** Races a promise against a timeout. Never rejects — a timed-out call
 *  resolves to `{ ok: false, reason: "timeout" }` for the caller to map to
 *  a mock response, exactly like any other provider failure. */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<TimeoutResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<TimeoutResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMs);
  });
  try {
    return await Promise.race([promise.then((value): TimeoutResult<T> => ({ ok: true, value })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
