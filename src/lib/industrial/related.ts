import { KNOWLEDGE, type KnowledgeLib } from "./knowledge";
import { CASES, type EngineeringCase } from "./cases";

/**
 * Related Articles Engine (Step 9) — deterministic relatedness, no
 * embeddings: shared category, shared domains, shared vendor, and keyword
 * overlap produce a score. Pure functions over the in-repo corpus; the
 * same signatures later accept a vector-similarity backend (Phase 2)
 * without changing callers.
 */

function keywordOverlap(a: string[], b: string[]): number {
  const setB = new Set(b.map((k) => k.toLowerCase()));
  let n = 0;
  for (const k of a) if (setB.has(k.toLowerCase())) n++;
  return n;
}

export function relatedArticles(id: string, limit = 4): KnowledgeLib[] {
  const base = KNOWLEDGE.find((l) => l.id === id);
  if (!base) return [];
  return KNOWLEDGE.filter((l) => l.id !== id)
    .map((l) => {
      let score = 0;
      if (l.category === base.category) score += 2;
      score += l.domains.filter((d) => base.domains.includes(d)).length * 2;
      if (base.vendor && l.vendor === base.vendor) score += 2;
      score += keywordOverlap(l.keywords, base.keywords);
      return { lib: l, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.lib);
}

/** Engineering Case Links: cases relevant to an article. */
export function relatedCases(id: string, limit = 3): EngineeringCase[] {
  const base = KNOWLEDGE.find((l) => l.id === id);
  if (!base) return [];
  return CASES.map((c) => {
    let score = 0;
    if (base.domains.includes(c.category)) score += 2;
    if (base.vendor && c.vendor === base.vendor) score += 3;
    score += keywordOverlap(c.keywords, base.keywords);
    return { c, score };
  })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

/** Vendor Knowledge Center data: a vendor's libraries and field cases. */
export function vendorContent(vendorId: string): {
  libraries: KnowledgeLib[];
  cases: EngineeringCase[];
} {
  return {
    libraries: KNOWLEDGE.filter((l) => l.vendor === vendorId),
    cases: CASES.filter((c) => c.vendor === vendorId),
  };
}
