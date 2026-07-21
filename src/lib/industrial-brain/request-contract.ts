// PHASE 93B — the ONE canonical request contract for Industrial Copilot
// analysis requests.
//
// Both sides of the wire import this module: the API route validates with
// `AnalyzeRequestSchema`, and the workspace form builds its body with
// `buildAnalyzeRequest`. Before this existed the two drifted apart and every
// submission failed:
//
//   * the form posted the page locale verbatim, so when German went live
//     `locale: "de"` hit a schema that accepted only `en|fa`;
//   * the two impact <select>s default to the empty option and a <select> is
//     ALWAYS present in FormData, so an untouched form posted
//     `safetyImpact: ""` into `z.enum([...]).optional()`, which rejects `""`
//     because it is not `undefined` — this broke Persian and English too.
//
// Validation is NOT relaxed here. Lengths, types and enums stay strict; only
// two legitimate compatibility cases are normalised: documented field aliases,
// and "the user left this control untouched" (`""`) meaning "not stated".

import { z } from "zod";
import { ACTIVE_LOCALES } from "@/i18n/locales";

/** Impact severities the analyzer understands. */
export const IMPACT_LEVELS = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

/**
 * UI locales accepted at the HTTP boundary — derived from the platform's
 * active-locale source, so activating a fourth locale can never resurrect this
 * bug. `locale` is a UI-language tag, not an engine mode: the deterministic
 * analyzer never reads it (it emits both `domain` and `domainFa` and lets the
 * UI choose), so accepting "de" does not claim that German analysis generation
 * exists.
 */
export const ANALYZE_LOCALES = ACTIVE_LOCALES;
export type AnalyzeLocale = (typeof ANALYZE_LOCALES)[number];

/** Default when a caller omits `locale`. Unchanged from the original contract. */
export const DEFAULT_ANALYZE_LOCALE = "en" as const;

/** Optional free text: absent, or present and within bounds. */
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/**
 * An impact select. Accepts a real level or `""` (the form's "select…" default)
 * and normalises `""` to `undefined` — exactly how the analyzer already treats
 * it (`input.safetyImpact ?? ""` then falls back to its default level), so this
 * changes no analysis output. Anything else is still rejected.
 */
const optionalImpact = z
  .union([z.enum(IMPACT_LEVELS), z.literal("")])
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const AnalyzeRequestSchema = z.object({
  problemTitle:     z.string().trim().min(3, "Problem title required").max(200),
  assetType:        optionalText(150),
  systemArea:       optionalText(150),
  plcPlatform:      optionalText(100),
  observedSymptoms: z.string().trim().min(5, "Describe at least one symptom").max(3000),
  recentChanges:    optionalText(1000),
  activeAlarms:     optionalText(1500),
  observedSignals:  optionalText(1000),
  hmiCommandState:  optionalText(500),
  plcOutputState:   optionalText(500),
  vfdMccState:      optionalText(500),
  interlockStatus:  optionalText(500),
  sensorFeedback:   optionalText(500),
  safetyImpact:     optionalImpact,
  productionImpact: optionalImpact,
  alreadyChecked:   optionalText(1000),
  additionalInfo:   optionalText(1000),
  locale:           z.enum(ANALYZE_LOCALES).optional().default(DEFAULT_ANALYZE_LOCALE),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

/** The minimum lengths the UI must respect to avoid a certain rejection. */
export const MIN_PROBLEM_TITLE = 3;
export const MIN_OBSERVED_SYMPTOMS = 5;

/**
 * Documented legacy aliases, applied only when the canonical field is absent.
 * Mapping happens before validation; the canonical schema still applies.
 */
const ALIASES: ReadonlyArray<readonly [canonical: string, legacy: string]> = [
  ["problemTitle", "title"],
  ["plcPlatform", "platform"],
  ["observedSymptoms", "symptoms"],
  ["activeAlarms", "alarms"],
];

export function applyFieldAliases(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const obj = { ...(raw as Record<string, unknown>) };
  for (const [canonical, legacy] of ALIASES) {
    if (obj[canonical] === undefined && typeof obj[legacy] === "string") {
      obj[canonical] = obj[legacy];
    }
  }
  return obj;
}

/** A field name safe to return to the client (never the rejected value). */
export type AnalyzeFieldName = keyof AnalyzeRequest;

const KNOWN_FIELDS = new Set(Object.keys(AnalyzeRequestSchema.shape));

/** First offending field name, when it is one of our own known fields. */
export function firstIssueField(issues: readonly z.core.$ZodIssue[]): string | undefined {
  const path = issues[0]?.path;
  const head = Array.isArray(path) ? path[0] : undefined;
  return typeof head === "string" && KNOWN_FIELDS.has(head) ? head : undefined;
}

/**
 * Build the request body from the workspace form.
 *
 * Guarantees the client cannot send a shape the server will certainly reject:
 * every value is a trimmed string, `locale` is a supported tag (an unknown UI
 * locale degrades to the default rather than producing a guaranteed 400), and
 * no `undefined`/`null`/object ever reaches JSON.stringify.
 */
export function buildAnalyzeRequest(
  entries: Iterable<[string, FormDataEntryValue]>,
  locale: string,
): Record<string, string> {
  const body: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== "string") continue; // never post a File/Blob
    body[key] = value.trim();
  }
  body.locale = isAnalyzeLocale(locale) ? locale : DEFAULT_ANALYZE_LOCALE;
  return body;
}

export function isAnalyzeLocale(value: string): value is AnalyzeLocale {
  return (ANALYZE_LOCALES as readonly string[]).includes(value);
}

/**
 * Client-side pre-flight mirroring the server's two hard minimums, so the
 * submit button cannot fire a request the backend is guaranteed to reject.
 * Returns the offending field, or null when the request is worth sending.
 */
export function findBlockingField(
  body: Record<string, string>,
): "problemTitle" | "observedSymptoms" | null {
  if ((body.problemTitle ?? "").trim().length < MIN_PROBLEM_TITLE) return "problemTitle";
  if ((body.observedSymptoms ?? "").trim().length < MIN_OBSERVED_SYMPTOMS) return "observedSymptoms";
  return null;
}
