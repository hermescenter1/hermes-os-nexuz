// PHASE 101-R — the public exposure policy for the Phase 101 reference corpus.
//
// WHY THIS IS A SEPARATE MODULE
// The corpus holds 85 authored fault scenarios across ten reference systems.
// Publishing all of them on an anonymous route would turn a curated engineering
// demonstration into a bulk-enumerable dataset, so exposure is an explicit,
// reviewable decision rather than a side effect of the corpus growing.
//
// FAIL-CLOSED BY CONSTRUCTION
// The allowlist names scenarios that MAY be reached anonymously. Everything
// else — including every scenario added to the corpus after this file was
// written — is not publicly reachable until someone adds it here deliberately.
// `assertExposureIntegrity` runs at module load, so an allowlist entry naming a
// scenario the corpus no longer contains fails the import, the test run and the
// build, instead of degrading into a silent 404 in production.
//
// TWO INDEXES, AND WHY THE REQUEST PATH ONLY EVER TOUCHES ONE
// `PUBLIC_INDEX` holds the seven published scenarios. `FULL_INDEX` holds all
// eighty-five and exists ONLY to prove the allowlist still matches the corpus at
// module load, and to let tests derive the private set. A request never reaches
// `FULL_INDEX`: the caller-supplied id is looked up in `PUBLIC_INDEX` and
// nothing else, so there is no code path on which an unpublished scenario is
// resolved, read, or held in a variable while some later branch decides whether
// it was allowed. The gate is the lookup, not a check around the lookup.
//
// GROUND TRUTH IS NEVER EXPOSED
// A scenario `groundTruth` is the answer key the Phase 101 benchmark scores the
// engine against. It is deliberately unreachable through this bridge: a surface
// that showed it would be demonstrating the corpus, not the reasoning.

import { CORPUS } from "../corpus";
import type { FaultScenario, ReferenceSystem } from "../types";
import { assertServerOnly } from "./server-boundary";

assertServerOnly("industrial-knowledge/runtime/exposure");

/**
 * Scenario ids reachable from the anonymous public surface.
 *
 * Curated for breadth of engineering discipline rather than volume: PLC
 * sequence logic, field instrumentation, drives, supervisory telemetry and
 * distribution protection, so the demonstration shows cross-layer reasoning
 * instead of one fault class repeated.
 *
 * The set also has to be honest about the ENGINE, not only about the plant, so
 * it deliberately includes a case where the reasoning is weak: TIA-01-FS-06
 * carries contradicting observations and three escalation conditions, and is
 * the one a reader should look at to see the engine decline to be confident.
 */
export const PUBLIC_SCENARIO_IDS: readonly string[] = [
  "TIA-01-FS-01",
  "TIA-01-FS-06",
  "TIA-03-FS-01",
  "TIA-03-FS-02",
  "TIA-05-FS-01",
  "SCADA-01-FS-01",
  "SCADA-04-FS-01",
];

/**
 * Longest id a public case can possibly have — DERIVED, never pinned.
 *
 * A caller-supplied string longer than this cannot be a published case, so it
 * is rejected on length before the grammar is even considered. Deriving the
 * bound from the allowlist keeps it as tight as the data allows: a generous
 * round number would be a bound in name only, and would still be accepted years
 * after the ids it was sized for stopped existing.
 */
export const MAX_CASE_ID_LENGTH: number = PUBLIC_SCENARIO_IDS.reduce(
  (longest, id) => Math.max(longest, id.length),
  0,
);

/**
 * Shape a corpus scenario id is allowed to have.
 *
 * Applied BEFORE any lookup so an oversized or exotic string is rejected on its
 * own merits and never becomes a lookup key. Anchored, and built only from
 * ASCII upper-case, digits and single hyphens, so no control character,
 * whitespace, separator or non-ASCII codepoint can survive it.
 */
const CASE_ID_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function isWellFormedCaseId(value: string): boolean {
  return value.length > 0 && value.length <= MAX_CASE_ID_LENGTH && CASE_ID_PATTERN.test(value);
}

/** A scenario resolved back to the sealed system that owns it. */
export interface ResolvedScenario {
  system: ReferenceSystem;
  scenario: FaultScenario;
}

function buildFullIndex(): ReadonlyMap<string, ResolvedScenario> {
  const index = new Map<string, ResolvedScenario>();
  for (const system of CORPUS) {
    for (const scenario of system.scenarios) {
      const existing = index.get(scenario.id);
      if (existing) {
        // Corpus-unique ids are a Phase 101 invariant. A duplicate would make
        // "which system does this case belong to" a coin flip, and every
        // provenance claim downstream of it unverifiable.
        throw new Error(
          `duplicate fault-scenario id "${scenario.id}" in ${existing.system.id} and ${system.id}`,
        );
      }
      index.set(scenario.id, { system, scenario });
    }
  }
  return index;
}

/** Every scenario in the corpus. Integrity and test use only — see header. */
const FULL_INDEX = buildFullIndex();

/**
 * Prove the allowlist and the corpus still describe the same world.
 *
 * Drift in either direction is a defect: an allowlisted id the corpus dropped
 * would 404 anonymously, and a duplicate entry would publish the same case
 * twice under one identity.
 */
export function assertExposureIntegrity(): void {
  const seen = new Set<string>();
  for (const id of PUBLIC_SCENARIO_IDS) {
    if (!isWellFormedCaseId(id)) {
      throw new Error(`public scenario id "${id}" is not a well-formed corpus id`);
    }
    if (seen.has(id)) {
      throw new Error(`public scenario id "${id}" is listed twice`);
    }
    seen.add(id);
    if (!FULL_INDEX.has(id)) {
      throw new Error(`public scenario id "${id}" is not present in the Phase 101 corpus`);
    }
  }
}

assertExposureIntegrity();

/**
 * The ONLY index a request may consult.
 *
 * Built once from the allowlist after integrity has been proven. Because it
 * contains nothing but published scenarios, a lookup miss IS the authorization
 * decision — there is no separate permission check that could be reordered,
 * short-circuited or forgotten.
 */
const PUBLIC_INDEX: ReadonlyMap<string, ResolvedScenario> = new Map(
  PUBLIC_SCENARIO_IDS.map((id) => [id, FULL_INDEX.get(id)!] as const),
);

/**
 * Resolve a caller-supplied id against the published set, or null.
 *
 * This is the request path. It never touches `FULL_INDEX`, so an unpublished
 * scenario is not merely rejected — it is never looked up.
 */
export function resolvePublicScenario(scenarioId: string): ResolvedScenario | null {
  return PUBLIC_INDEX.get(scenarioId) ?? null;
}

export function isPubliclyExposed(scenarioId: string): boolean {
  return PUBLIC_INDEX.has(scenarioId);
}

/**
 * Every scenario id the corpus holds. Derived, never hard-coded.
 *
 * NOT for the request path — see the two-index note in the header. Tests use it
 * to derive the private set as a set difference, so no test ever has to copy a
 * private id or a line of private engineering text into its own source.
 */
export function allScenarioIds(): string[] {
  return [...FULL_INDEX.keys()].sort();
}

/** `ALL − PUBLIC`, derived. The set that must never reach a browser. */
export function privateScenarioIds(): string[] {
  return allScenarioIds().filter((id) => !PUBLIC_INDEX.has(id));
}

/**
 * A private scenario, for leakage tests only.
 *
 * Exposed as a function rather than data so the only way to obtain private
 * content is to go through the corpus at test time; nothing is ever transcribed
 * into a fixture that could drift away from — or outlive — the corpus.
 */
export function privateScenarioForTest(scenarioId: string): ResolvedScenario | null {
  return PUBLIC_INDEX.has(scenarioId) ? null : (FULL_INDEX.get(scenarioId) ?? null);
}
