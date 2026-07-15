import type { BrainAnalysis, BrainService } from "./types";

/**
 * V1: calls the Next.js BFF, which classifies rule-based and optionally
 * enriches via the AI Gateway. Phase 2: same interface, re-pointed at the
 * FastAPI AI Gateway service.
 *
 * Phase 86C4B2B1D-SECURITY-6: this service backs the PUBLIC /copilot, /brain
 * and /library pages, so it targets the anonymous-safe /api/copilot/demo
 * endpoint (deterministic local analysis, no history, no database, no external
 * model, no writes). The authenticated /api/brain — which exposes global
 * analysis history and can run LLM/RAG and persist records — is consumed
 * directly by the protected dashboard/intelligence surfaces instead.
 */
const DEMO_ENDPOINT = "/api/copilot/demo";

export const brainService: BrainService = {
  async memory(n = 5) {
    try {
      const res = await fetch(`${DEMO_ENDPOINT}?n=${n}`, { cache: "no-store" });
      if (!res.ok) return { ok: false, error: `brain memory: HTTP ${res.status}` };
      const data = await res.json();
      const seen = new Set<string>();
      const recentLibraries: string[] = [];
      for (const rec of data.recent ?? []) {
        for (const lib of rec.libraries ?? []) {
          if (!seen.has(lib)) {
            seen.add(lib);
            recentLibraries.push(lib);
          }
        }
      }
      return { ok: true, data: { stats: data.stats, recentLibraries } };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "brain memory: network error" };
    }
  },

  async analyze(question, locale) {
    try {
      const res = await fetch(DEMO_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, locale }),
      });
      if (!res.ok) return { ok: false, error: `brain: HTTP ${res.status}` };
      const data = (await res.json()) as BrainAnalysis;
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "brain: network error" };
    }
  },
};
