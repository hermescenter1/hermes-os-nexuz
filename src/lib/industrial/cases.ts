import casesData from "./knowledge-data/cases.json";
import type { BrainDomainId } from "@/lib/services/types";
import type { VendorId } from "./vendors";

/**
 * Engineering Case Database (Step 6) — structured industrial cases with
 * symptoms, root cause, resolution, vendor, and category. V1: in-repo JSON
 * matched by keywords; Phase 2: Postgres-backed with the same shape.
 * Bilingual content is stored per-case; nothing here is rendered in the V1
 * UI — English text grounds LLM prompts, Persian is ready for the future
 * case-browser surface.
 */

interface CaseContent {
  symptoms: string;
  rootCause: string;
  resolution: string;
  /** Step 8: ranked root causes, primary first */
  rootCauses: string[];
  /** Step 8: ordered verification steps */
  verificationSteps: string[];
  /** Step 8: corrective actions */
  correctiveActions: string[];
}

export interface EngineeringCase {
  id: string;
  vendor: VendorId;
  category: BrainDomainId;
  keywords: string[];
  en: CaseContent;
  fa: CaseContent;
}

export const CASES: EngineeringCase[] = (casesData as { cases: EngineeringCase[] }).cases;

// Build-time sanity: unique ids.
const ids = new Set<string>();
for (const c of CASES) {
  if (ids.has(c.id)) throw new Error(`duplicate case id: ${c.id}`);
  ids.add(c.id);
}

export interface CaseMatch {
  case: EngineeringCase;
  score: number;
}

/** Keyword/vendor/domain-weighted case matching against a normalized question. */
export function matchCases(
  normalizedText: string,
  domains: BrainDomainId[],
  vendors: VendorId[],
  limit = 3
): CaseMatch[] {
  return CASES.map((c) => {
    let score = 0;
    for (const k of c.keywords) {
      const kk = k.toLowerCase();
      if (normalizedText.includes(kk)) score += kk.length >= 5 ? 2 : 1;
    }
    if (score === 0) return { case: c, score: 0 }; // keywords gate the match
    if (vendors.includes(c.vendor)) score += 3;
    if (domains.includes(c.category)) score += 2;
    return { case: c, score };
  })
    .filter((m) => m.score >= 3) // require keyword hit + (vendor or domain) agreement
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
