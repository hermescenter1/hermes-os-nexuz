import { caseRepository } from "@/lib/storage/case-repository";
import { knowledgeRepository } from "@/lib/storage/knowledge-repository";
import type { StoredCase, StoredArticle } from "@/lib/storage/types";
import type { EngineeringCase } from "./cases";
import type { KnowledgeLib } from "./knowledge";
import { ALL_DOMAINS } from "./knowledge";
import { VENDORS, type VendorId } from "./vendors";
import type { BrainDomainId } from "@/lib/services/types";

/**
 * PostgreSQL → Brain-reasoning adapter (Phase 11B-A).
 *
 * Bridges the durable `EngineeringCase`/`KnowledgeArticle` repositories
 * (`src/lib/storage/*`) into the shapes `pipeline.ts`, `brain-core.ts`, and
 * `retrieval-engine.ts` already consume (`EngineeringCase`, `KnowledgeLib`
 * from the static JSON corpus). Nothing here is imported by those static
 * loaders — this is a one-way, additive bridge, not a replacement.
 *
 * Validation, not casting: `StoredCase.vendor`/`StoredCase.domain` and
 * `StoredArticle.domain` are free-text strings from the Studio form, never
 * validated server-side by `/api/cases` or `/api/knowledge`. Records whose
 * vendor/domain isn't a recognized id are dropped here rather than cast,
 * because an invalid `BrainDomainId` would otherwise reach untyped
 * `DOMAIN_LIBS[...]`/`DOMAIN_NEIGHBORS[...]` lookups downstream.
 *
 * Locale shim: `StoredCase` is single-locale (no `fa` fields), but
 * `cause-ranking.ts` unconditionally indexes `case.fa` on every matched case.
 * The mapped `fa` block mirrors `en` so Persian-locale requests never throw —
 * documented as a content-fidelity limitation, not a translation.
 */

const VENDOR_IDS = new Set<string>(VENDORS.map((v) => v.id));
const DOMAIN_IDS = new Set<string>(ALL_DOMAINS);

function isVendorId(v: string): v is VendorId {
  return VENDOR_IDS.has(v);
}

function isDomainId(d: string): d is BrainDomainId {
  return DOMAIN_IDS.has(d);
}

/** Maps a published case row to the pipeline's EngineeringCase shape, or
 *  null when the vendor/domain isn't a recognized id (filtered, not cast). */
export function toEngineeringCase(c: StoredCase): EngineeringCase | null {
  if (!isVendorId(c.vendor) || !isDomainId(c.domain)) return null;
  const content = {
    symptoms: c.problem,
    rootCause: c.rootCause,
    resolution: c.correctiveActions[0] ?? c.rootCause,
    rootCauses: [c.rootCause, ...c.secondaryCauses],
    verificationSteps: c.verificationSteps,
    correctiveActions: c.correctiveActions,
  };
  return {
    id: c.id,
    vendor: c.vendor,
    category: c.domain,
    keywords: c.tags,
    en: content,
    fa: content,
  };
}

/** Maps a published article row to the pipeline's KnowledgeLib shape, or
 *  null when the domain isn't a recognized id (filtered, not cast). */
export function toKnowledgeLib(a: StoredArticle): KnowledgeLib | null {
  if (!isDomainId(a.domain)) return null;
  return {
    id: a.id,
    category: a.domain,
    domains: [a.domain],
    keywords: a.tags,
    ...(a.vendor ? { vendor: a.vendor } : {}),
    futureEmbeddingReady: true,
  };
}

export interface PublishedCorpus {
  cases: EngineeringCase[];
  knowledge: KnowledgeLib[];
}

const EMPTY_CORPUS: PublishedCorpus = { cases: [], knowledge: [] };

/**
 * Fetches `status: "published"` rows from both repositories and maps them
 * into the reasoning pipeline's shapes. Best-effort: any failure (no
 * DATABASE_URL, Prisma unavailable, query error) resolves to an empty
 * corpus so callers can always merge it unconditionally — the static JSON
 * fallback is never at risk.
 */
export async function getPublishedCorpus(): Promise<PublishedCorpus> {
  try {
    const [storedCases, storedArticles] = await Promise.all([
      caseRepository().list(),
      knowledgeRepository().list(),
    ]);
    const cases = storedCases
      .filter((c) => c.status === "published")
      .map(toEngineeringCase)
      .filter((c): c is EngineeringCase => c !== null);
    const knowledge = storedArticles
      .filter((a) => a.status === "published")
      .map(toKnowledgeLib)
      .filter((l): l is KnowledgeLib => l !== null);
    return { cases, knowledge };
  } catch {
    return EMPTY_CORPUS;
  }
}

/** Merges DB-published cases into the static pool, deduping by id (the
 *  published record wins on a collision). Returns the original array
 *  reference unchanged when there is nothing to merge. */
export function mergeCases(
  staticCases: EngineeringCase[],
  extra?: EngineeringCase[]
): EngineeringCase[] {
  if (!extra || extra.length === 0) return staticCases;
  const extraIds = new Set(extra.map((c) => c.id));
  return [...staticCases.filter((c) => !extraIds.has(c.id)), ...extra];
}

/** Merges DB-published knowledge libraries into the static pool, deduping by
 *  id (the published record wins on a collision). Returns the original
 *  array reference unchanged when there is nothing to merge. */
export function mergeKnowledge(
  staticKnowledge: KnowledgeLib[],
  extra?: KnowledgeLib[]
): KnowledgeLib[] {
  if (!extra || extra.length === 0) return staticKnowledge;
  const extraIds = new Set(extra.map((l) => l.id));
  return [...staticKnowledge.filter((l) => !extraIds.has(l.id)), ...extra];
}
