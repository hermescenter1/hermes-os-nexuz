import { KNOWLEDGE, CATEGORIES, ALL_DOMAINS } from "@/lib/industrial/knowledge";
import { CASES } from "@/lib/industrial/cases";
import { VENDORS } from "@/lib/industrial/vendors";
import type {
  BrainDomainId,
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
 *
 * Phase 11B-B: `browse()` additionally merges PostgreSQL-published cases and
 * knowledge articles (fetched via the existing `/api/cases` and
 * `/api/knowledge` routes — never imported directly, since this module is
 * bundled into the client-side `LibraryClient`). Session mode and any fetch
 * failure leave the static-only result untouched.
 */

const VENDOR_IDS = new Set<string>(VENDORS.map((v) => v.id));
const DOMAIN_IDS = new Set<string>(ALL_DOMAINS);

function isDomainId(d: string): d is BrainDomainId {
  return DOMAIN_IDS.has(d);
}

type BrowseLibrary = KnowledgeBrowseData["libraries"][number];
type BrowseCase = KnowledgeBrowseData["cases"][number];

interface StoredCaseRow {
  id: string;
  vendor: string;
  domain: string;
  title: string;
  problem: string;
  tags: string[];
  status: string;
}

interface StoredArticleRow {
  id: string;
  domain: string;
  vendor?: string;
  title: string;
  summary: string;
  tags: string[];
  status: string;
}

function publishedLibrary(a: StoredArticleRow): BrowseLibrary | null {
  if (!isDomainId(a.domain)) return null;
  return {
    id: a.id,
    category: a.domain,
    domains: [a.domain],
    keywords: a.tags,
    ...(a.vendor ? { vendor: a.vendor } : {}),
    futureEmbeddingReady: true,
    title: a.title,
    summary: a.summary,
  };
}

function publishedCase(c: StoredCaseRow): BrowseCase | null {
  if (!VENDOR_IDS.has(c.vendor) || !isDomainId(c.domain)) return null;
  return {
    id: c.id,
    vendor: c.vendor,
    domain: c.domain,
    keywords: c.tags,
    title: c.title,
    summary: c.problem,
  };
}

/** Best-effort fetch of published rows from the existing storage API routes.
 *  Returns an empty pair on any failure or when not in database mode — the
 *  caller always merges unconditionally, so the static corpus is never at
 *  risk. Never imports the repositories directly (client-bundle safety). */
async function fetchPublished(): Promise<{ cases: BrowseCase[]; libraries: BrowseLibrary[] }> {
  try {
    const [caseRes, knowledgeRes] = await Promise.all([
      fetch("/api/cases", { cache: "no-store" }),
      fetch("/api/knowledge", { cache: "no-store" }),
    ]);
    if (!caseRes.ok || !knowledgeRes.ok) return { cases: [], libraries: [] };
    const caseJson = (await caseRes.json()) as { storageMode?: string; cases?: StoredCaseRow[] };
    const knowledgeJson = (await knowledgeRes.json()) as {
      storageMode?: string;
      articles?: StoredArticleRow[];
    };
    if (caseJson.storageMode !== "database" && knowledgeJson.storageMode !== "database") {
      return { cases: [], libraries: [] };
    }
    const cases = (caseJson.cases ?? [])
      .filter((c) => c.status === "published")
      .map(publishedCase)
      .filter((c): c is BrowseCase => c !== null);
    const libraries = (knowledgeJson.articles ?? [])
      .filter((a) => a.status === "published")
      .map(publishedLibrary)
      .filter((l): l is BrowseLibrary => l !== null);
    return { cases, libraries };
  } catch {
    return { cases: [], libraries: [] };
  }
}

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
    const staticLibraries: BrowseLibrary[] = KNOWLEDGE.map((l) => ({
      id: l.id,
      category: l.category,
      domains: l.domains,
      keywords: l.keywords,
      keywordsDe: l.keywordsDe,
      vendor: l.vendor,
      futureEmbeddingReady: l.futureEmbeddingReady,
      titleKey: `knowledge.${l.id}.name`,
      summaryKey: `knowledge.${l.id}.summary`,
    }));
    const staticCases: BrowseCase[] = CASES.map((c) => ({
      id: c.id,
      vendor: c.vendor,
      domain: c.category,
      keywords: c.keywords,
    }));

    // Phase 11B-B: merge PostgreSQL-published records. Best-effort and
    // additive — an empty result (session mode, or any fetch/parse failure)
    // leaves the static-only lists exactly as before.
    const published = await fetchPublished();
    const libraryIds = new Set(published.libraries.map((l) => l.id));
    const caseIds = new Set(published.cases.map((c) => c.id));

    return {
      ok: true,
      data: {
        libraries: [
          ...staticLibraries.filter((l) => !libraryIds.has(l.id)),
          ...published.libraries,
        ],
        cases: [...staticCases.filter((c) => !caseIds.has(c.id)), ...published.cases],
      },
    };
  },

  async search(query, locale) {
    const q = query.toLowerCase().replace(/\u200C/g, "");
    // 87L.6F: German terms are additive and locale-scoped. For any other
    // locale (including the default) this is exactly the pre-existing filter,
    // so EN/FA result sets and ordering are unchanged.
    const de = locale === "de";
    const matches = KNOWLEDGE.filter(
      (lib) =>
        lib.id.toLowerCase().includes(q) ||
        lib.keywords.some((k) => k.toLowerCase().replace(/\u200C/g, "").includes(q)) ||
        (de && lib.keywordsDe.some((k) => k.toLowerCase().replace(/\u200C/g, "").includes(q)))
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
