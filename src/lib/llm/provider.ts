import type { GatewayResult, LlmProvider } from "./gateway";

/**
 * Anthropic provider implementation behind the AI Gateway abstraction.
 * Key stays server-side; all failures map to normalized gateway errors;
 * every success carries usage metadata (tokens + latency).
 */

interface AnthropicContentBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function call(
  body: Record<string, unknown>,
  model: string,
  timeoutMs: number
): Promise<GatewayResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { ok: false, error: { code: "no_provider", message: "no API key configured" } };
  }
  const started = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, ...body }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        error: { code: "upstream_error", message: `provider returned ${res.status}` },
      };
    }
    const data = (await res.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("");
    if (!text.trim()) {
      return { ok: false, error: { code: "bad_response", message: "empty completion" } };
    }
    return {
      ok: true,
      text,
      usage: {
        provider: "anthropic",
        model,
        latencyMs,
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      },
    };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return {
      ok: false,
      error: timedOut
        ? { code: "timeout", message: `provider exceeded ${timeoutMs}ms` }
        : { code: "upstream_error", message: e instanceof Error ? e.message : "network error" },
    };
  }
}

export const anthropicProvider: LlmProvider & {
  chat(
    messages: { role: string; content: string }[],
    maxTokens: number,
    timeoutMs: number
  ): Promise<GatewayResult>;
} = {
  id: "anthropic",

  available() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  async complete(model, req) {
    return call(
      {
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      },
      model,
      req.timeoutMs
    );
  },

  async chat(messages, maxTokens, timeoutMs) {
    return call(
      { max_tokens: maxTokens, messages },
      "claude-sonnet-4-20250514",
      timeoutMs
    );
  },
};
