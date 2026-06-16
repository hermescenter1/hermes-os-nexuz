import type { AIProvider, AIRequestInput, AIResponse } from "../types";
import { getAnthropicModel } from "../config";
import { mockResponse, loadOptionalPackage, withTimeout } from "./shared";

/**
 * Claude provider adapter (Phase 12-A mock → Phase 12-B real capability).
 *
 * Routed to for `engineeringReasoning` tasks in hybrid/real mode (see
 * `router.ts`). Falls back to a mock response — never throws — when:
 *   - no `ANTHROPIC_API_KEY` is configured ("missing_api_key")
 *   - the `@anthropic-ai/sdk` package isn't installed ("sdk_not_installed")
 *   - the call times out ("timeout") or the SDK throws ("provider_error")
 *   - the SDK returns an empty completion ("empty_response")
 *
 * The `@anthropic-ai/sdk` package is NOT a dependency of this project (the
 * existing `src/lib/llm/provider.ts` gateway calls the Anthropic REST API
 * directly via `fetch` instead — this adapter is independent of that one,
 * per Phase 12-B's "do not wire into /api/brain yet" instruction). It is
 * loaded via `loadOptionalPackage()` with a variable specifier (see
 * shared.ts) so neither `npx tsc --noEmit` nor `npm run build` requires it
 * to exist. Install it with `npm install @anthropic-ai/sdk` to enable real
 * calls; no code change is needed afterward.
 */

const PACKAGE_NAME = "@anthropic-ai/sdk";
const TIMEOUT_MS = 20_000;

/** Minimal shape of what this adapter needs from the `@anthropic-ai/sdk`
 *  package's client. Declared locally (not imported from the package's own
 *  types, since it isn't installed) so this file type-checks with or
 *  without it. */
interface AnthropicMessageResponse {
  content?: { type?: string; text?: string }[];
}
interface AnthropicClientLike {
  messages: {
    create(args: Record<string, unknown>): Promise<AnthropicMessageResponse>;
  };
}
interface AnthropicModuleLike {
  default: new (opts: { apiKey: string }) => AnthropicClientLike;
}

// Cached across calls within one process — same rationale as openai.ts.
let cachedClient: AnthropicClientLike | null | undefined;

async function getClient(apiKey: string): Promise<AnthropicClientLike | null> {
  if (cachedClient !== undefined) return cachedClient;
  const mod = await loadOptionalPackage<AnthropicModuleLike>(PACKAGE_NAME);
  if (!mod) {
    cachedClient = null;
    return null;
  }
  try {
    const Ctor = mod.default ?? (mod as unknown as AnthropicModuleLike["default"]);
    cachedClient = new Ctor({ apiKey });
  } catch {
    cachedClient = null;
  }
  return cachedClient;
}

export const claudeProvider: AIProvider = {
  id: "claude",
  async ask(input: AIRequestInput): Promise<AIResponse> {
    // Read the key live (never cached) so callers/tests can configure it at
    // request time. Never logged, never echoed back in any response field.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return mockResponse("claude", input, "missing_api_key");
    }

    const client = await getClient(apiKey);
    if (!client) {
      return mockResponse("claude", input, "sdk_not_installed", {
        requiredPackage: PACKAGE_NAME,
        installCommand: `npm install ${PACKAGE_NAME}`,
      });
    }

    const model = getAnthropicModel();
    try {
      const result = await withTimeout(
        client.messages.create({
          model,
          max_tokens: 1024,
          ...(input.context ? { system: input.context } : {}),
          messages: [{ role: "user", content: input.prompt }],
        }),
        TIMEOUT_MS
      );
      if (!result.ok) {
        return mockResponse("claude", input, "timeout", { timeoutMs: TIMEOUT_MS });
      }
      const text = (result.value.content ?? [])
        .map((b) => (b.type === "text" ? b.text ?? "" : ""))
        .join("");
      if (!text.trim()) {
        return mockResponse("claude", input, "empty_response");
      }
      return {
        provider: "claude",
        content: text,
        metadata: {
          resolvedProvider: "claude",
          taskKind: input.task,
          mock: false,
          model,
        },
      };
    } catch (e) {
      // Never throw a provider error into the app — degrade to mock. The
      // message is included for diagnostics; it is never the API key (the
      // SDK's own errors don't echo credentials back).
      return mockResponse("claude", input, "provider_error", {
        errorMessage: e instanceof Error ? e.message : "unknown error",
      });
    }
  },
};
