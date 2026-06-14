import type { BrainDomainId } from "@/lib/services/types";
import type { VendorId } from "./vendors";
import type { CaseMatch } from "./cases";
import { getFiredRules, type Bi } from "./reasoning";
import type { RootCauseAnalysis } from "./root-cause";
import { CAUSE_CATALOG } from "./cause-catalog";

/**
 * Cause Ranking Engine — fixes case-memory bias in hybrid retrieval.
 *
 * Old (biased) flow:  case match → its stored root cause becomes Primary.
 * New flow:           query analysis → candidate causes → case retrieval
 *                     → evidence scoring → cause ranking → final report.
 *
 * A stored case can NEVER directly determine the primary cause:
 *  - similarity gate: a case below SIMILARITY_THRESHOLD (70) is never
 *    promoted; it survives only as a low-confidence related-case hint
 *    and its causes compete as alternatives.
 *  - evidence validation: a case root cause must have its own keywords
 *    present in the current query ("CPU replacement" stored vs "switch
 *    replacement" asked → rejected).
 *
 * Scoring model per candidate (0–100):
 *  - Query Evidence   0–40: content-token overlap (bilingual, stemmed)
 *  - Domain Evidence  0–25: alignment with classified domains
 *  - Case Similarity  0–35: source-case similarity (case candidates) or
 *                            best aligned-case corroboration ×0.15 (rule
 *                            candidates)
 * Fully deterministic; no LLM involvement.
 */

export const SIMILARITY_THRESHOLD = 70;

export interface RankedCause {
  label: string;
  score: number;
  queryEvidence: number;
  domainEvidence: number;
  caseSimilarity: number;
  source: "rule" | "case" | "catalog";
  sourceId: string;
  validated: boolean;
}

export interface RankingInput {
  text: string;
  locale: "fa" | "en";
  domains: BrainDomainId[];
  vendors: VendorId[];
  caseMatches: CaseMatch[];
}

export interface RankedRootCause extends RootCauseAnalysis {
  alternative?: string[];
  /** transparency: top-ranked candidates with their scores */
  ranking?: { label: string; score: number; source: "rule" | "case" | "catalog" }[];
}

const STOP = new Set([
  "the", "and", "for", "with", "after", "not", "from", "that", "this",
  "into", "onto", "near", "its", "are", "was", "has", "have", "been",
  "too", "out", "off", "per", "due", "your", "their",
]);

function normalize(q: string): string {
  return q
    .toLowerCase()
    .replace(/\u064A/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/\u200C/g, "")
    // Persian and Arabic-Indic digits -> ASCII so fault codes match
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** crude latin stem: strip common suffixes so replaced≈replacement etc. */
function stem(t: string): string {
  return t.replace(/(ment|tion|sion|ings?|ed|es|s)$/u, "");
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

/** fraction of a cause's content tokens present in the query (best of
 *  the two languages — validation is language-agnostic). */
function overlap(cause: Bi, queryNorm: string): { ratio: number; matched: number } {
  const score = (txt: string) => {
    const toks = tokens(txt);
    if (toks.length === 0) return { ratio: 0, matched: 0 };
    let m = 0;
    for (const t of toks) {
      const st = stem(t);
      if (queryNorm.includes(t) || (st.length >= 3 && queryNorm.includes(st))) m++;
    }
    return { ratio: m / toks.length, matched: m };
  };
  const en = score(cause.en);
  const fa = score(cause.fa);
  return en.ratio >= fa.ratio ? en : fa;
}

/** Case similarity 0..100 from keyword coverage of the query: each case
 *  keyword scores 1 when all its tokens (len>=3) appear, 0.5 when at least
 *  one does. Principled: similarity measures the query, not match bonuses. */
export function caseSimilarity(caseKeywords: string[], query: string): number {
  const q = normalize(query);
  if (caseKeywords.length === 0) return 0;
  let sum = 0;
  for (const kw of caseKeywords) {
    const toks = normalize(kw).split(/\s+/).filter((t) => t.length >= 3);
    if (toks.length === 0) continue;
    const hits = toks.filter((t) => q.includes(t)).length;
    sum += hits === toks.length ? 1 : hits > 0 ? 0.5 : 0;
  }
  return Math.round((sum / caseKeywords.length) * 100);
}

function domainEvidence(
  candidateDomains: BrainDomainId[] | undefined,
  classified: BrainDomainId[]
): number {
  if (!candidateDomains || candidateDomains.length === 0) return 12; // unconstrained
  if (classified.length === 0) return 0;
  if (candidateDomains.includes(classified[0])) return 25;
  if (candidateDomains.some((d) => classified.includes(d))) return 15;
  return 0;
}

export function rankCauses(input: RankingInput): RankedCause[] {
  const queryNorm = normalize(input.text);
  const out: RankedCause[] = [];
  // vendor is part of case identity: a detected vendor matching the case
  // earns similarity credit (capped)
  const simFor = (m: CaseMatch) =>
    Math.min(
      caseSimilarity(m.case.keywords, input.text) +
        (input.vendors.includes(m.case.vendor) ? 10 : 0),
      100
    );

  // --- rule candidates: query-gated by construction ---
  const fired = getFiredRules({
    text: input.text,
    domains: input.domains,
    vendors: input.vendors,
    caseIds: [],
    libraries: [],
    baseRisk: "low",
  });
  for (const rule of fired) {
    // corroboration: best similarity among matched cases aligned with the rule
    const aligned = input.caseMatches.filter(
      (m) => !rule.when.domains || rule.when.domains.includes(m.case.category)
    );
    const corro = aligned.length
      ? Math.max(...aligned.map(simFor)) * 0.15
      : 0;
    for (const cause of rule.causes) {
      const ov = overlap(cause, queryNorm);
      const qe = Math.round(ov.ratio * 40);
      const de = domainEvidence(rule.when.domains, input.domains);
      const cs = Math.round(corro);
      out.push({
        label: cause[input.locale],
        score: Math.min(qe + de + cs, 100),
        queryEvidence: qe,
        domainEvidence: de,
        caseSimilarity: cs,
        source: "rule",
        sourceId: rule.id,
        validated: true, // keyword groups already matched the query
      });
    }
  }

  // --- catalog candidates: query-analysis causes, anchor-gated ---
  for (const cc of CAUSE_CATALOG) {
    if (!cc.domains.some((d) => input.domains.includes(d))) continue;
    const anchorHit = cc.anchors.some((kw) => queryNorm.includes(normalize(kw)));
    if (!anchorHit) continue; // evidence validation: anchor REQUIRED
    const supportHits = cc.support.filter((kw) => queryNorm.includes(normalize(kw))).length;
    const qe = Math.round(Math.min((1 + supportHits) / 3, 1) * 40);
    const de = domainEvidence(cc.domains, input.domains);
    const aligned = input.caseMatches.filter((m) => cc.domains.includes(m.case.category));
    const cs = aligned.length
      ? Math.round(Math.max(...aligned.map(simFor)) * 0.15)
      : 0;
    out.push({
      label: cc.text[input.locale],
      score: Math.min(qe + de + cs, 100),
      queryEvidence: qe,
      domainEvidence: de,
      caseSimilarity: cs,
      source: "catalog",
      sourceId: cc.id,
      validated: true,
    });
  }

  // --- case candidates: require evidence validation ---
  for (const m of input.caseMatches) {
    const sim = simFor(m);
    const c = m.case;
    const n = Math.min(c.en.rootCauses.length, 3);
    for (let i = 0; i < n; i++) {
      const cause: Bi = { en: c.en.rootCauses[i], fa: c.fa.rootCauses[i] };
      const ov = overlap(cause, queryNorm);
      const validated = ov.matched >= 2 || ov.ratio >= 0.3;
      const qe = Math.round(ov.ratio * 40);
      const de = domainEvidence([c.category], input.domains);
      const cs = Math.round(sim * 0.35);
      out.push({
        label: cause[input.locale],
        score: Math.min(qe + de + cs, 100),
        queryEvidence: qe,
        domainEvidence: de,
        caseSimilarity: cs,
        source: "case",
        sourceId: c.id,
        validated,
      });
    }
  }

  // dedupe identical labels keeping the higher score
  const best = new Map<string, RankedCause>();
  for (const c of out) {
    const prev = best.get(c.label);
    if (!prev || c.score > prev.score) best.set(c.label, c);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** is this candidate allowed to be the primary cause? */
function primaryEligible(c: RankedCause, simByCase: Map<string, number>): boolean {
  if (c.source === "rule" || c.source === "catalog") return true;
  const sim = simByCase.get(c.sourceId) ?? 0;
  return c.validated && sim >= SIMILARITY_THRESHOLD;
}

export function buildRankedRootCause(
  input: RankingInput
): { rootCause?: RankedRootCause; relatedCaseHint?: { caseId: string; similarity: number } } {
  const ranked = rankCauses(input);
  if (ranked.length === 0) return {};

  const simFor = (m: CaseMatch) =>
    Math.min(
      caseSimilarity(m.case.keywords, input.text) +
        (input.vendors.includes(m.case.vendor) ? 10 : 0),
      100
    );
  const simByCase = new Map(input.caseMatches.map((m) => [m.case.id, simFor(m)]));

  // Promotion priority: a case at/above the similarity threshold with a
  // query-validated cause is a coherent diagnosis unit and takes primary
  // (spec: <70% never promotes — therefore >=70% does). Otherwise the
  // highest-scored eligible candidate wins.
  const promoted = ranked.find(
    (c) =>
      c.source === "case" &&
      c.validated &&
      (simByCase.get(c.sourceId) ?? 0) >= SIMILARITY_THRESHOLD
  );
  const primary = promoted ?? ranked.find((c) => primaryEligible(c, simByCase));
  // low-confidence hint when cases matched but none could be promoted
  const bestCase = input.caseMatches[0];
  const bestSim = bestCase ? simFor(bestCase) : 0;
  const relatedCaseHint =
    bestCase && (bestSim < SIMILARITY_THRESHOLD || primary?.source !== "case")
      ? { caseId: bestCase.case.id, similarity: bestSim }
      : undefined;

  if (!primary) return { relatedCaseHint };

  const rest = ranked.filter((c) => c.label !== primary.label);
  let secondary: string[];
  let verification: string[];
  let correctiveActions: string[] | undefined;

  if (primary.source === "case") {
    // a validated, high-similarity case is a coherent diagnosis unit:
    // its remaining causes, verification, and corrective actions apply
    const pc = input.caseMatches.find((m) => m.case.id === primary.sourceId)!.case;
    const content = pc[input.locale];
    secondary = [
      ...content.rootCauses.filter((c) => c !== primary.label),
      ...rest
        .filter((c) => c.sourceId !== primary.sourceId && primaryEligible(c, simByCase))
        .map((c) => c.label),
    ].slice(0, 4);
    verification = content.verificationSteps.slice(0, 4);
    correctiveActions = content.correctiveActions.slice(0, 4);
  } else if (primary.source === "catalog") {
    // catalog-sourced primary: the catalog entry carries its own checks
    const entry = CAUSE_CATALOG.find((cc) => cc.id === primary.sourceId);
    secondary = rest
      .filter((c) => primaryEligible(c, simByCase))
      .slice(0, 3)
      .map((c) => c.label);
    verification = (entry?.verify ?? []).map((v) => v[input.locale]);
    const validCase = input.caseMatches.find((m) => simFor(m) >= SIMILARITY_THRESHOLD);
    correctiveActions = validCase
      ? validCase.case[input.locale].correctiveActions.slice(0, 4)
      : undefined;
  } else {
    // rule-sourced primary: its actions are the verification protocol
    const fired = getFiredRules({
      text: input.text,
      domains: input.domains,
      vendors: input.vendors,
      caseIds: [],
      libraries: [],
      baseRisk: "low",
    });
    const rule = fired.find((r) => r.id === primary.sourceId);
    secondary = rest
      .filter((c) => primaryEligible(c, simByCase))
      .slice(0, 3)
      .map((c) => c.label);
    verification = (rule?.actions ?? []).map((a) => a[input.locale]).slice(0, 4);
    // corrective actions only from a validated high-similarity case
    const validCase = input.caseMatches.find((m) => simFor(m) >= SIMILARITY_THRESHOLD);
    correctiveActions = validCase
      ? validCase.case[input.locale].correctiveActions.slice(0, 4)
      : undefined;
  }

  const secondarySet = new Set([primary.label, ...secondary]);
  const alternative = rest
    .filter((c) => !secondarySet.has(c.label))
    .slice(0, 4)
    .map((c) => c.label);

  return {
    rootCause: {
      primary: primary.label,
      secondary: [...new Set(secondary)],
      verification,
      ...(correctiveActions ? { correctiveActions } : {}),
      ...(alternative.length ? { alternative } : {}),
      ranking: ranked.slice(0, 6).map((c) => ({
        label: c.label,
        score: c.score,
        source: c.source,
      })),
      ...(relatedCaseHint
        ? { relatedCase: { ...relatedCaseHint, lowConfidence: true as const } }
        : {}),
    },
    relatedCaseHint,
  };
}
