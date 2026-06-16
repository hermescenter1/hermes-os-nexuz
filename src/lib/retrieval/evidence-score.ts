import type { EngineeringCase } from "@/lib/industrial/cases";
import type { KnowledgeLib } from "@/lib/industrial/knowledge";
import type { BrainDomainId } from "@/lib/services/types";
import type { ScoredCase, ScoredKnowledge, ScoreBreakdown } from "./retrieval-types";

/**
 * Evidence scoring (Phase 10).
 *
 * Deterministic, documented point models — identical input yields identical
 * scores. No LLM, no randomness.
 *
 * Case (max 100):    exact domain +30, vendor +30, keyword overlap +20,
 *                    root-cause similarity +20
 * Knowledge (max 100): domain +40, vendor +20, keyword overlap +20,
 *                      tag overlap +20
 *
 * Note on knowledge "tags": the V1 KnowledgeLib carries `keywords` but no
 * dedicated tags array, so tag overlap reuses the library keywords as its
 * tag set. When Phase 2 adds a real tags field, only `tagSet()` changes.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\u064A/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/\u200C/g, "");
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
}

/** Fraction of candidate terms that appear in the query text (0..1). */
function overlapRatio(queryText: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const q = normalize(queryText);
  let hits = 0;
  for (const term of terms) {
    const n = normalize(term);
    if (n.length >= 2 && q.includes(n)) hits++;
  }
  return hits / terms.length;
}

/** Token overlap between the query and a candidate's root-cause text (0..1). */
function tokenOverlap(queryText: string, text: string): number {
  const qt = new Set(tokens(queryText));
  const ct = tokens(text);
  if (ct.length === 0 || qt.size === 0) return 0;
  let hits = 0;
  for (const t of ct) if (qt.has(t)) hits++;
  return hits / ct.length;
}

/**
 * Domain adjacency: physically-coupled domains that should lend partial
 * evidence credit to one another. A "drive overcurrent" query often
 * classifies as electrical, yet a drives case is highly relevant — so an
 * adjacent-domain case earns half the exact-domain points rather than zero.
 */
const DOMAIN_NEIGHBORS: Partial<Record<BrainDomainId, BrainDomainId[]>> = {
  drives: ["electrical", "motors"],
  motors: ["electrical", "drives"],
  electrical: ["drives", "motors"],
  plc: ["otNetwork", "scada"],
  scada: ["hmi", "plc"],
  hmi: ["scada"],
  otNetwork: ["plc", "cybersecurity"],
  cybersecurity: ["otNetwork"],
  analogIo: ["sensors"],
  digitalIo: ["sensors"],
  sensors: ["analogIo", "digitalIo"],
};

function domainPointsFor(caseDomain: BrainDomainId, detected: BrainDomainId[]): number {
  if (detected.includes(caseDomain)) return 30; // exact
  const neighbors = DOMAIN_NEIGHBORS[caseDomain] ?? [];
  if (neighbors.some((n) => detected.includes(n))) return 15; // adjacent
  return 0;
}

export function scoreCase(
  c: EngineeringCase,
  queryText: string,
  domains: BrainDomainId[],
  vendors: string[]
): ScoredCase {
  const breakdown: ScoreBreakdown[] = [];

  // Exact domain +30, adjacent domain +15
  const domainPts = domainPointsFor(c.category, domains);
  breakdown.push({ label: "domain", points: domainPts });

  // Vendor match +30
  const vendorPts = vendors.includes(c.vendor) ? 30 : 0;
  breakdown.push({ label: "vendor", points: vendorPts });

  // Keyword overlap +20 (scaled by fraction of case keywords present)
  const kwPts = Math.round(overlapRatio(queryText, c.keywords) * 20);
  breakdown.push({ label: "keywords", points: kwPts });

  // Root-cause similarity +20 (token overlap against the case's root causes)
  const rcText = [c.en.rootCauses.join(" "), c.en.rootCause].join(" ");
  const rcPts = Math.round(tokenOverlap(queryText, rcText) * 20);
  breakdown.push({ label: "rootCause", points: rcPts });

  const score = Math.min(domainPts + vendorPts + kwPts + rcPts, 100);
  return { kind: "case", id: c.id, vendor: c.vendor, domain: c.category, score, breakdown };
}

export function scoreKnowledge(
  lib: KnowledgeLib,
  queryText: string,
  domains: BrainDomainId[],
  vendors: string[]
): ScoredKnowledge {
  const breakdown: ScoreBreakdown[] = [];

  // Domain match +40 (any of the library's domains is a detected domain),
  // adjacent domain +20 — mirrors the case adjacency model.
  const exact = lib.domains.some((d) => domains.includes(d));
  const adjacent =
    !exact &&
    lib.domains.some((d) => (DOMAIN_NEIGHBORS[d] ?? []).some((n) => domains.includes(n)));
  const domainPts = exact ? 40 : adjacent ? 20 : 0;
  breakdown.push({ label: "domain", points: domainPts });

  // Vendor match +20
  const vendorPts = lib.vendor && vendors.includes(lib.vendor) ? 20 : 0;
  breakdown.push({ label: "vendor", points: vendorPts });

  // Keyword overlap +20
  const kwPts = Math.round(overlapRatio(queryText, lib.keywords) * 20);
  breakdown.push({ label: "keywords", points: kwPts });

  // Tag overlap +20 — V1 reuses keywords as the tag set (see header note).
  // Scored from the query's own tokens against the library keyword set so it
  // is a distinct signal from the substring keyword overlap above.
  const tagPts = Math.round(tokenOverlap(queryText, lib.keywords.join(" ")) * 20);
  breakdown.push({ label: "tags", points: tagPts });

  const score = Math.min(domainPts + vendorPts + kwPts + tagPts, 100);
  return {
    kind: "knowledge",
    id: lib.id,
    ...(lib.vendor ? { vendor: lib.vendor } : {}),
    domain: lib.category,
    score,
    breakdown,
  };
}
