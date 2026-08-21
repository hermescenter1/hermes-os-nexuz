// PHASE 101-R — the bounded parser for the `?case=` query parameter.
//
// WHY IT IS ITS OWN MODULE
// `searchParams` is caller-controlled and arrives untyped: a value may be
// absent, a string, or an ARRAY when the same parameter is repeated
// (`?case=a&case=b`). Reading `query.case` as though it were always a string is
// how an array reaches a `.trim()` call and becomes a 500. Parsing it in one
// place, with a result the caller cannot misread, keeps that judgement out of
// the component and puts it under test.
//
// PRECISE INSIDE, UNIFORM OUTSIDE
// The parser names exactly why it rejected something, because a test that
// cannot tell "too long" from "unknown id" cannot prove either. The SURFACE
// then collapses every rejection into one indistinguishable state — see
// `runPublicReferenceDiagnosis`. Internal precision, external uniformity: the
// reasons exist for the test suite, never for the response.

import {
  MAX_CASE_ID_LENGTH,
  PUBLIC_SCENARIO_IDS,
  isPubliclyExposed,
  isWellFormedCaseId,
} from "./exposure";

/**
 * Why a `?case=` value was refused.
 *
 * `NOT_PUBLIC` deliberately covers both "no such scenario" and "that scenario
 * exists but is unpublished". The parser never learns which, because it only
 * ever consults the published index — see `exposure.ts`.
 */
export type CaseQueryRejection =
  | "ABSENT"
  | "REPEATED"
  | "EMPTY"
  | "TOO_LONG"
  | "MALFORMED"
  | "NOT_PUBLIC";

export type CaseQueryResult =
  | { ok: true; caseId: string }
  | { ok: false; reason: CaseQueryRejection };

/**
 * Control characters and every Unicode separator, matched explicitly.
 *
 * `CASE_ID_PATTERN` in `exposure.ts` would already reject all of these, but
 * they are caught here first so that a control character is reported as one
 * rather than as a generic grammar failure — a NUL byte in a query string is
 * worth telling apart from a typo when reading a test failure.
 */
const CONTROL_OR_SEPARATOR = /[\p{C}\p{Z}]/u;

/**
 * Parse the raw `?case=` value.
 *
 * Order matters and is deliberate: shape, then size, then grammar, then
 * publication. Each step is cheaper and less trusting than the next, and the
 * value never becomes a lookup key until it has survived all three of the
 * cheap ones.
 */
export function parseCaseQuery(raw: string | string[] | undefined | null): CaseQueryResult {
  if (raw === undefined || raw === null) return { ok: false, reason: "ABSENT" };

  // A repeated parameter is refused rather than silently reduced to its first
  // value: picking one would answer a question the caller did not ask.
  if (Array.isArray(raw)) return { ok: false, reason: "REPEATED" };
  if (typeof raw !== "string") return { ok: false, reason: "MALFORMED" };

  // Bound the string BEFORE any scan, so an oversized value costs one length
  // read rather than a regex pass over megabytes of query.
  if (raw.length > MAX_CASE_ID_LENGTH) return { ok: false, reason: "TOO_LONG" };

  if (raw.trim().length === 0) return { ok: false, reason: "EMPTY" };
  // Compared against the RAW value, not a trimmed copy: a published id contains
  // no whitespace at all, so trimming would quietly accept " TIA-01-FS-01 " as
  // the same identifier and make the accepted set larger than the grammar says.
  if (CONTROL_OR_SEPARATOR.test(raw)) return { ok: false, reason: "MALFORMED" };
  if (!isWellFormedCaseId(raw)) return { ok: false, reason: "MALFORMED" };

  if (!isPubliclyExposed(raw)) return { ok: false, reason: "NOT_PUBLIC" };
  return { ok: true, caseId: raw };
}

/** The case a surface shows when the caller named none. */
export function defaultPublicCaseId(): string {
  return PUBLIC_SCENARIO_IDS[0];
}
