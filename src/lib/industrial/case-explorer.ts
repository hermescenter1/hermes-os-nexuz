import { CASES, type EngineeringCase } from "@/lib/industrial/cases";
import { computeConfidence } from "@/lib/industrial/confidence";
import { VENDORS } from "@/lib/industrial/vendors";
import { ALL_DOMAINS } from "@/lib/industrial/knowledge";

/**
 * Case Explorer data (Phase B; Phase 11B-B adds the published-DB merge).
 *
 * Read-only projection over the existing cases.json corpus. No database,
 * no analysis flow — this is the same data the Case Engine matches against,
 * presented for browsing.
 *
 * Per-case "confidence" is computed deterministically from the case's own
 * structural signals (a known vendor, the case itself as corroboration, and
 * the depth of its evidence), reusing the platform confidence engine so the
 * number means the same thing it does in a live analysis. It is a property
 * of the case record, not a live score.
 *
 * Phase 11B-B: this module is bundled into the client-side
 * `CaseExplorerClient` (alongside the static SSG case detail page), so it
 * must never import `case-repository.ts`/Prisma. Published rows are
 * supplied by the caller (fetched client-side from the existing `/api/cases`
 * route) and mapped here with the same vendor/domain validation rule used by
 * `db-bridge.ts`'s server-side adapter — duplicated, not imported, because
 * of that client/server boundary.
 */

export interface CaseListRow {
  id: string;
  vendor: string;
  domain: string;
  keywords: string[];
  confidence: number; // 0..100
}

function caseConfidence(c: EngineeringCase): number {
  const evidenceCount =
    c.en.rootCauses.length +
    c.en.verificationSteps.length +
    c.en.correctiveActions.length;
  const { score } = computeConfidence({
    domainConfidence: 0.85, // a curated case has a clear domain
    vendorConfidence: 1, // exactly one known vendor per case
    caseMatches: 1, // the case itself corroborates
    evidenceCount,
  });
  return score;
}

export const CASE_ROWS: CaseListRow[] = CASES.map((c) => ({
  id: c.id,
  vendor: c.vendor,
  domain: c.category,
  keywords: c.keywords,
  confidence: caseConfidence(c),
}));

export const CASE_VENDORS: string[] = [...new Set(CASES.map((c) => c.vendor))].sort();
export const CASE_DOMAINS: string[] = [...new Set(CASES.map((c) => c.category))].sort();

export const CASE_METRICS = {
  total: CASES.length,
  vendors: CASE_VENDORS.length,
  domains: CASE_DOMAINS.length,
} as const;

export function getCase(id: string): EngineeringCase | undefined {
  return CASES.find((c) => c.id === id);
}

export function caseConfidenceFor(id: string): number {
  const c = getCase(id);
  return c ? caseConfidence(c) : 0;
}

/* ---------------- Phase 11B-B: published-DB merge (client-safe) ---------------- */

const VENDOR_IDS = new Set<string>(VENDORS.map((v) => v.id));
const DOMAIN_IDS = new Set<string>(ALL_DOMAINS);

/** Display row for a published case, decorated with the literal text
 *  CaseExplorerClient needs to render a card (static rows get the
 *  equivalent text from `CASES` + i18n instead). */
export interface DisplayCaseRow extends CaseListRow {
  title: string;
  rootCause: string;
  corrective: string;
  source: "static" | "published";
}

export interface PublishedCaseInput {
  id: string;
  vendor: string;
  domain: string;
  title: string;
  rootCause: string;
  correctiveActions: string[];
  tags: string[];
  confidence: number;
}

/**
 * Maps a published case (fetched client-side from `/api/cases`, already
 * filtered to `status: "published"`) into a display row. Returns null for
 * an unrecognized vendor/domain — the Studio form constrains these
 * client-side but `/api/cases` does not validate them server-side, so an
 * invalid value is dropped rather than shown.
 */
export function publishedRowFor(c: PublishedCaseInput): DisplayCaseRow | null {
  if (!VENDOR_IDS.has(c.vendor) || !DOMAIN_IDS.has(c.domain)) return null;
  return {
    id: c.id,
    vendor: c.vendor,
    domain: c.domain,
    keywords: c.tags,
    confidence: c.confidence,
    title: c.title,
    rootCause: c.rootCause,
    corrective: c.correctiveActions[0] ?? c.rootCause,
    source: "published",
  };
}

/** Unique sorted vendor ids across a (possibly merged) row set. */
export function vendorsOf(rows: { vendor: string }[]): string[] {
  return [...new Set(rows.map((r) => r.vendor))].sort();
}

/** Unique sorted domain ids across a (possibly merged) row set. */
export function domainsOf(rows: { domain: string }[]): string[] {
  return [...new Set(rows.map((r) => r.domain))].sort();
}

/** Recomputed totals over a (possibly merged) row set — same shape as
 *  CASE_METRICS but for an arbitrary list. */
export function metricsFor(rows: { vendor: string; domain: string }[]): {
  total: number;
  vendors: number;
  domains: number;
} {
  return {
    total: rows.length,
    vendors: vendorsOf(rows).length,
    domains: domainsOf(rows).length,
  };
}
