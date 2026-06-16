import type { AIProvider, AIRequestInput, AIResponse } from "../types";
import { getOpenAIModel } from "../config";
import { mockResponse, loadOptionalPackage, withTimeout } from "./shared";

/**
 * OpenAI provider adapter (Phase 12-A mock → Phase 12-B real capability).
 *
 * Routed to for `structuredOutput` tasks in hybrid/real mode (see
 * `router.ts`). Falls back to a mock response — never throws — when:
 *   - no `OPENAI_API_KEY` is configured ("missing_api_key")
 *   - the `openai` package isn't installed ("sdk_not_installed")
 *   - the call times out ("timeout") or the SDK throws ("provider_error")
 *   - the SDK returns an empty completion ("empty_response")
 *
 * The `openai` package is NOT a dependency of this project. It is loaded
 * via `loadOptionalPackage()` with a variable specifier (see shared.ts) so
 * neither `npx tsc --noEmit` nor `npm run build` requires it to exist.
 * Install it with `npm install openai` to enable real calls; no code
 * change is needed afterward.
 */

const PACKAGE_NAME = "openai";
const TIMEOUT_MS = 20_000;

/** Minimal shape of what this adapter needs from the `openai` package's
 *  client. Declared locally (not imported from the package's own types,
 *  since it isn't installed) so this file type-checks with or without it. */
interface OpenAIChatResponse {
  choices?: { message?: { content?: string | null } }[];
}
interface OpenAIClientLike {
  chat: {
    completions: {
      create(args: Record<string, unknown>): Promise<OpenAIChatResponse>;
    };
  };
}
interface OpenAIModuleLike {
  default: new (opts: { apiKey: string }) => OpenAIClientLike;
}

// Cached across calls within one process — undefined means "not yet
// attempted", null means "attempted and unavailable" (missing package or
// construction failure). Avoids re-importing the SDK on every request.
let cachedClient: OpenAIClientLike | null | undefined;

async function getClient(apiKey: string): Promise<OpenAIClientLike | null> {
  if (cachedClient !== undefined) return cachedClient;
  const mod = await loadOptionalPackage<OpenAIModuleLike>(PACKAGE_NAME);
  if (!mod) {
    cachedClient = null;
    return null;
  }
  try {
    const Ctor = mod.default ?? (mod as unknown as OpenAIModuleLike["default"]);
    cachedClient = new Ctor({ apiKey });
  } catch {
    cachedClient = null;
  }
  return cachedClient;
}

export const openaiProvider: AIProvider = {
  id: "openai",
  async ask(input: AIRequestInput): Promise<AIResponse> {
    // Read the key live (never cached) so callers/tests can configure it at
    // request time. Never logged, never echoed back in any response field.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return mockResponse("openai", input, "missing_api_key");
    }

    const client = await getClient(apiKey);
    if (!client) {
      return mockResponse("openai", input, "sdk_not_installed", {
        requiredPackage: PACKAGE_NAME,
        installCommand: `npm install ${PACKAGE_NAME}`,
      });
    }

    const model = getOpenAIModel();
    try {
      const result = await withTimeout(
        client.chat.completions.create({
          model,
          messages: [
            ...(input.context ? [{ role: "system", content: input.context }] : []),
            { role: "user", content: input.prompt },
          ],
        }),
        TIMEOUT_MS
      );
      if (!result.ok) {
        return mockResponse("openai", input, "timeout", { timeoutMs: TIMEOUT_MS });
      }
      const text = result.value.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) {
        return mockResponse("openai", input, "empty_response");
      }
      return {
        provider: "openai",
        content: text,
        metadata: {
          resolvedProvider: "openai",
          taskKind: input.task,
          mock: false,
          model,
        },
      };
    } catch (e) {
      // Never throw a provider error into the app — degrade to mock. The
      // message is included for diagnostics; it is never the API key (the
      // SDK's own errors don't echo credentials back).
      return mockResponse("openai", input, "provider_error", {
        errorMessage: e instanceof Error ? e.message : "unknown error",
      });
    }
  },
};
