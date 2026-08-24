// PHASE 101-R — the ONE runtime bridge between the sealed Phase 101 corpus and
// the Industrial Brain product surface.
//
// WHAT THIS MODULE IS FOR
// Phase 101 shipped a sealed engineering corpus and a structural, provenance-
// preserving diagnostic engine, and nothing in the product imported either of
// them. This module is the single seam that closes that gap. Every product
// surface that wants Phase 101 reasoning goes through here, so there is exactly
// one place where exposure, locale handling and result shaping are decided.
//
// THE CORPUS IS THE ONLY SOURCE OF TRUTH
// Nothing here restates corpus content. Titles, narratives, node labels,
// domains, provenance and safe-action guidance are read from the sealed
// registry at call time. A consumer that pasted a scenario text into a
// component or a translation catalogue would be publishing a copy that drifts
// the moment the corpus is revised, so the copied-corpus contract test makes
// that a test failure rather than a review comment.
//
// DETERMINISM
// `diagnose` is pure — no clock, no randomness, no network, no provider call —
// and every ordering it produces is derived from stable identity keys. The same
// case id therefore yields an identical result on every request and in every
// process, which is what makes the reasoning auditable after the shift it
// describes.
//
// SAFETY POSTURE
// This bridge is read-only over declarative engineering metadata. It opens no
// industrial connection, evaluates no control logic and emits no command,
// acknowledgement or write. `SAFE_ACTION` nodes are verification steps
// addressed to a qualified human being; they are surfaced as guidance and are
// never presented as something the platform can perform.

import { createHash } from "node:crypto";

import { CORPUS, corpusIndex, corpusStats } from "../corpus";
import {
  diagnose,
  DIAGNOSTIC_ENGINE_VERSION,
  type DiagnosticResult,
  type EvidenceCitation,
  type Hypothesis,
  type SafeActionRecommendation,
} from "../diagnostics";
import { localized, type KnowledgeLocale, type ReferenceSystem } from "../types";
import { PUBLIC_SCENARIO_IDS, resolvePublicScenario } from "./exposure";
import { defaultPublicCaseId, parseCaseQuery, type CaseQueryResult } from "./case-query";
import { assertServerOnly } from "./server-boundary";

assertServerOnly("industrial-knowledge/runtime/bridge");

/**
 * Result vocabulary, re-exported so a consumer needs exactly ONE import.
 *
 * A surface that reached into `../diagnostics` for its types would also be able
 * to reach into `../corpus` for its data, and the exposure allowlist would stop
 * being the only way in. Re-exporting keeps the seam a single module wide.
 */
export type { DiagnosticResult, EvidenceCitation, Hypothesis, SafeActionRecommendation };

/* ── Locale handling ──────────────────────────────────────────────────────── */

/** UI locales the product ships. */
export type BridgeLocale = "en" | "de" | "fa";

/**
 * Locales the Phase 101 corpus is AUTHORED in.
 *
 * Deliberately narrower than the product UI locales. Every reference system
 * carries hand-authored English and Persian engineering text and no German, so
 * a German reader gets German chrome around English engineering prose. That is
 * stated in the result (`corpusTextLocale`) and disclosed in the UI rather than
 * hidden: machine-translating plant terminology would be a fabrication, and
 * silently serving English without saying so would be worse.
 */
export const CORPUS_TEXT_LOCALES: readonly KnowledgeLocale[] = ["en", "fa"];

export function corpusTextLocaleFor(locale: BridgeLocale): KnowledgeLocale {
  return locale === "fa" ? "fa" : "en";
}

/**
 * TRUE when corpus prose is served in a language other than the UI language.
 *
 * Drives the disclosure the German surface shows. Derived from the authored
 * locale set rather than a literal `locale === "de"`, so activating a fourth
 * UI locale cannot quietly start serving undisclosed English.
 */
export function isCorpusTextForeign(locale: BridgeLocale): boolean {
  return corpusTextLocaleFor(locale) !== (locale as KnowledgeLocale);
}

/* ── Result shapes ────────────────────────────────────────────────────────── */

/** Provenance of the reference system a case belongs to. */
export interface ReferenceSystemSummary {
  id: string;
  name: string;
  domain: string;
  platform: string;
  sourceType: string;
  version: string;
  revision: number;
  /** SHA-256 of the sealed system canonical form. */
  checksum: string;
  /** Attribution carried in the data itself, not only in documentation. */
  origin: string;
}

export interface ReferenceCaseSummary {
  caseId: string;
  title: string;
  narrative: string;
  system: ReferenceSystemSummary;
  /** How many observations this case supplies to the engine. */
  observationCount: number;
  /** Language the engineering prose above is actually authored in. */
  corpusTextLocale: KnowledgeLocale;
}

/**
 * Why a diagnosis could not be produced — a SINGLE value, deliberately.
 *
 * Every rejection collapses here: an unknown id, an id that exists but is
 * unpublished, an oversized string, a repeated parameter, a control character.
 * The parser knows which of those happened and the tests assert on it, but the
 * caller is told only that no diagnosis is available.
 *
 * Distinguishing them would be an oracle. "Malformed" versus "not available"
 * already separates well-formed ids from noise, and once an attacker can see
 * that line they can walk the id grammar and read the corpus membership off the
 * status code — which is precisely the enumeration the allowlist exists to
 * prevent. One state, no oracle.
 */
export type ReferenceDiagnosisFailure = "NOT_AVAILABLE";

export type ReferenceDiagnosisOutcome =
  | {
      status: "OK";
      case: ReferenceCaseSummary;
      diagnosis: DiagnosticResult;
      /** Identity of the corpus and engine that produced this result. */
      fingerprint: BridgeFingerprint;
    }
  | { status: ReferenceDiagnosisFailure };

/** Identity of the knowledge and reasoning behind a result. All derived. */
export interface BridgeFingerprint {
  engineVersion: string;
  systems: number;
  nodes: number;
  edges: number;
  scenarios: number;
  artifacts: number;
  /** Scenarios reachable from the anonymous surface. */
  publicCases: number;
  /** SHA-256 over the sealed system checksums, in id order. */
  corpusChecksum: string;
}

/* ── Fingerprint ──────────────────────────────────────────────────────────── */

let cachedFingerprint: BridgeFingerprint | null = null;

/**
 * Counts and identity of the corpus this build actually consumes.
 *
 * Every number is derived from the registry. Nothing is pinned to a literal,
 * because a hard-coded total is a claim about the corpus rather than a
 * measurement of it, and would keep reporting ten systems after the eleventh
 * was added.
 */
export function bridgeFingerprint(): BridgeFingerprint {
  if (cachedFingerprint) return cachedFingerprint;

  const stats = corpusStats();
  const checksums = [...CORPUS]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((system: ReferenceSystem) => `${system.id}:${system.checksum}`)
    .join("\n");

  cachedFingerprint = {
    engineVersion: DIAGNOSTIC_ENGINE_VERSION,
    systems: stats.systems,
    nodes: stats.nodes,
    edges: stats.edges,
    scenarios: stats.scenarios,
    artifacts: stats.artifacts,
    publicCases: PUBLIC_SCENARIO_IDS.length,
    corpusChecksum: createHash("sha256").update(checksums, "utf8").digest("hex"),
  };
  return cachedFingerprint;
}

/* ── Catalogue ────────────────────────────────────────────────────────────── */

function summariseSystem(system: ReferenceSystem, locale: KnowledgeLocale): ReferenceSystemSummary {
  return {
    id: system.id,
    name: localized(system.name, locale),
    domain: localized(system.domain, locale),
    platform: system.platform,
    sourceType: system.sourceType,
    version: system.version,
    revision: system.revision,
    checksum: system.checksum,
    origin: system.origin,
  };
}

function summariseCase(caseId: string, locale: BridgeLocale): ReferenceCaseSummary | null {
  const resolved = resolvePublicScenario(caseId);
  if (!resolved) return null;
  const textLocale = corpusTextLocaleFor(locale);
  return {
    caseId: resolved.scenario.id,
    title: localized(resolved.scenario.title, textLocale),
    narrative: localized(resolved.scenario.narrative, textLocale),
    system: summariseSystem(resolved.system, textLocale),
    observationCount: resolved.scenario.observations.length,
    corpusTextLocale: textLocale,
  };
}

/**
 * The curated cases an anonymous visitor may run, in allowlist order.
 *
 * Order is the authored allowlist order rather than a sort, so the catalogue is
 * stable across requests and across corpus growth: appending a system must not
 * silently reshuffle the demonstration a reader is looking at.
 */
export function listPublicReferenceCases(locale: BridgeLocale): ReferenceCaseSummary[] {
  const cases: ReferenceCaseSummary[] = [];
  for (const caseId of PUBLIC_SCENARIO_IDS) {
    const summary = summariseCase(caseId, locale);
    // `assertExposureIntegrity` already proved every id resolves at module
    // load, so a null here would mean the registry changed underneath us.
    if (summary) cases.push(summary);
  }
  return cases;
}

/**
 * Re-exported from the query parser so a surface still needs ONE import.
 *
 * It lives next to the parser because "which case when none was named" is a
 * question about the query, not about the corpus.
 */
export { defaultPublicCaseId, parseCaseQuery };
export type { CaseQueryRejection, CaseQueryResult } from "./case-query";

/* ── Diagnosis ────────────────────────────────────────────────────────────── */

export interface ReferenceDiagnosisRequest {
  /**
   * The RAW `?case=` value, exactly as it arrived: a string, an array when the
   * parameter was repeated, or absent. Deliberately untyped-ish, so a caller
   * cannot narrow it before the parser has seen it and hand the bridge a value
   * that was already coerced.
   */
  caseParam: string | string[] | undefined | null;
  locale: BridgeLocale;
  /** Maximum hypotheses to rank. Clamped to [1, MAX_HYPOTHESES]. */
  maxHypotheses?: number;
}

export const MAX_HYPOTHESES = 5;
const DEFAULT_HYPOTHESES = 4;

function clampHypotheses(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_HYPOTHESES;
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_HYPOTHESES);
}

/**
 * Run the Phase 101 structural engine over one curated public reference case.
 *
 * Fail-closed at every step: a malformed id is rejected before any lookup, an
 * id outside the public allowlist is indistinguishable from one that does not
 * exist, and the scenario `groundTruth` — the benchmark answer key — is never
 * read here, so it cannot reach a response by accident.
 */
export function runPublicReferenceDiagnosis(
  request: ReferenceDiagnosisRequest,
): ReferenceDiagnosisOutcome {
  // An ABSENT parameter is not a rejection — it is a visitor who has not chosen
  // yet, and gets the default case. Every OTHER rejection reason collapses into
  // the one fail-closed state, so a repeated parameter, an oversized string, an
  // unknown id and an unpublished id are indistinguishable from here on.
  const parsed: CaseQueryResult = request.caseParam === undefined || request.caseParam === null
    ? { ok: true, caseId: defaultPublicCaseId() }
    : parseCaseQuery(request.caseParam);
  if (!parsed.ok) return { status: "NOT_AVAILABLE" };

  // `resolvePublicScenario` consults the PUBLISHED index and nothing else, so
  // an unpublished scenario is never resolved on a request path — not resolved
  // and then rejected, simply never looked up.
  const resolved = resolvePublicScenario(parsed.caseId);
  if (!resolved) return { status: "NOT_AVAILABLE" };

  const summary = summariseCase(parsed.caseId, request.locale);
  if (!summary) return { status: "NOT_AVAILABLE" };

  const diagnosis = diagnose(corpusIndex(), {
    // Only the observations are handed to the engine. `groundTruth` stays
    // behind: scoring the engine against the answer key is the benchmark job,
    // and showing it here would demonstrate the corpus, not the reasoning.
    observations: resolved.scenario.observations,
    locale: summary.corpusTextLocale,
    maxHypotheses: clampHypotheses(request.maxHypotheses),
  });

  return { status: "OK", case: summary, diagnosis, fingerprint: bridgeFingerprint() };
}
