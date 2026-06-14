import type { BrainAnalysis, BrainService } from "./types";

/**
 * V1: calls the Next.js BFF, which classifies rule-based and optionally
 * enriches via the AI Gateway. Phase 2: same interface, re-pointed at the
 * FastAPI AI Gateway service.
 */
export const brainService: BrainService = {
  async memory(n = 5) {
    try {
      const res = await fetch(`/api/brain?n=${n}`, { cache: "no-store" });
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
      const res = await fetch("/api/brain", {
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
