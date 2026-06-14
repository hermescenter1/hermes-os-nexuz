import { KNOWLEDGE, CATEGORIES } from "@/lib/industrial/knowledge";
import { CASES } from "@/lib/industrial/cases";
import type {
  KnowledgeArticle,
  KnowledgeBrowseData,
  KnowledgeService,
  ServiceResult,
} from "./types";

/**
 * V1: loads the structured JSON libraries (7 category files, 30 libraries)
 * via the registry loader. Phase 2: re-pointed at the Knowledge Cloud
 * service (Postgres-backed) behind the same interface. No vector search,
 * no embeddings, no RAG — keyword matching only, by design in V1.
 */

function toArticle(id: string): KnowledgeArticle {
  return {
    id,
    titleKey: `knowledge.${id}.name`,
    summaryKey: `knowledge.${id}.summary`,
  };
}

export const knowledgeService: KnowledgeService & {
  categories(): Promise<ServiceResult<{ category: string; libraries: KnowledgeArticle[] }[]>>;
  byIds(ids: string[]): Promise<ServiceResult<KnowledgeArticle[]>>;
  /** Step 8: full metadata for the Knowledge Cloud browser. */
  browse(): Promise<ServiceResult<KnowledgeBrowseData>>;
} = {
  async browse() {
    return {
      ok: true,
      data: {
        libraries: KNOWLEDGE.map((l) => ({
          id: l.id,
          category: l.category,
          domains: l.domains,
          keywords: l.keywords,
          vendor: l.vendor,
          futureEmbeddingReady: l.futureEmbeddingReady,
          titleKey: `knowledge.${l.id}.name`,
          summaryKey: `knowledge.${l.id}.summary`,
        })),
        cases: CASES.map((c) => ({
          id: c.id,
          vendor: c.vendor,
          domain: c.category,
          keywords: c.keywords,
        })),
      },
    };
  },

  async search(query) {
    const q = query.toLowerCase().replace(/\u200C/g, "");
    const matches = KNOWLEDGE.filter(
      (lib) =>
        lib.id.toLowerCase().includes(q) ||
        lib.keywords.some((k) => k.toLowerCase().replace(/\u200C/g, "").includes(q))
    ).map((l) => toArticle(l.id));
    return { ok: true, data: matches };
  },

  /** All libraries grouped by their 7 categories, in registry order. */
  async categories() {
    const data = CATEGORIES.map((category) => ({
      category,
      libraries: KNOWLEDGE.filter((l) => l.category === category).map((l) =>
        toArticle(l.id)
      ),
    }));
    return { ok: true, data };
  },

  /** Resolve a set of library ids (e.g. from a BrainAnalysis) to articles. */
  async byIds(ids) {
    const known = new Set(KNOWLEDGE.map((l) => l.id));
    return { ok: true, data: ids.filter((id) => known.has(id)).map(toArticle) };
  },
};
