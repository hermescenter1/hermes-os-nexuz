import type { AiGateway } from "./types";

/**
 * V1: thin client over the BFF /api/ai route, which holds the key
 * server-side. Returns a clear error when no key is configured —
 * features must degrade to structured-library behavior, never pretend.
 * Phase 2: same interface, re-pointed at the FastAPI AI Gateway.
 */
export const aiGateway: AiGateway = {
  async chat(messages) {
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          data?.error?.code && data?.error?.message
            ? `ai[${data.error.code}]: ${data.error.message}`
            : `ai: HTTP ${res.status}`;
        return { ok: false, error: msg };
      }
      return { ok: true, data: data.text as string };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "ai: network error" };
    }
  },
};
