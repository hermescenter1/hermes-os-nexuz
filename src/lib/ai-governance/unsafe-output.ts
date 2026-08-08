// PHASE 95 — centralized industrial output safety policy.
//
// Deterministic-authoritative. The LLM can never downgrade a safety class or
// remove an approval requirement. Any generated content that instructs or
// facilitates defeating a safety function is HARD-BLOCKED (output withheld,
// status BLOCKED). Risky-but-reviewable content is gated behind
// humanApprovalRequired=true and must NOT be shown as an action-ready imperative.
// LLM output is paraphrase-only and can only RAISE, never LOWER, the risk gate.

import type { IndustrialOutputClass } from "./types";

/** Explicit safety-defeat phrases (any order handled by co-occurrence below). */
const HARD_BLOCK_PATTERNS: RegExp[] = [
  /\bdefeat\b.{0,15}\b(lockout|tagout|loto)\b/i,
  /\benerg(?:ise|ize)\b.{0,25}\bwithout\b.{0,20}\b(procedure|permit|loto)\b/i,
  /(?:نادیده گرفتن|حذف|دفعت).{0,15}(?:قفل ایمنی|قفل و برچسب)/,
];

/** Verbs that describe DEFEATING/altering a protective function (FA/EN/DE). */
const UNSAFE_VERBS = [
  "bypass", "defeat", "jumper", "override", "disable", "force",
  "download", "overwrite", "modify",
  "دور بز", "دور زد", "دور زدن", "دورزدن", "غیرفعال", "بایپس", "بای پس", "جامپر", "حذف",
  "umgehen", "überbrücken", "uberbrucken", "deaktivieren", "außer kraft", "ausser kraft", "aufheben",
];
/** Protected safety functions (FA/EN/DE). */
const PROTECTED_NOUNS = [
  "interlock", "permissive", "e-stop", "estop", "emergency stop", "guard", "light curtain",
  "protective relay", "trip", "alarm", "sis", "safety plc", "safety logic", "safety instrumented",
  "اینترلاک", "ایمنی", "حفاظ", "توقف اضطراری", "پرده نوری", "رله حفاظتی", "سیس", "سیستم ایمنی",
  "verriegelung", "not-aus", "notaus", "schutz", "sicherheit", "sicherheits-sps", "lichtvorhang",
];

/** Strip Persian ZWNJ so conjugated/spaced forms match a single vocabulary. */
function foldForMatch(text: string): string {
  return text.replace(/‌/g, "").toLowerCase();
}

/** Output classes that always require human approval before any action wording. */
const APPROVAL_REQUIRED_CLASSES: readonly IndustrialOutputClass[] = [
  "OPERATIONAL",
  "CONTROL_ACTION",
  "SAFETY_RELATED",
  "SIS_OR_SAFETY_PLC",
  "DESTRUCTIVE",
  "IRREVERSIBLE",
];

export interface UnsafeScreenResult {
  hardBlocked: boolean;
  matched: number;
}

/** Screen arbitrary generated text for safety-defeat instructions. Combines
 *  explicit phrases with an order-independent unsafe-verb × protected-noun
 *  co-occurrence check across Persian / English / German. */
export function screenUnsafeContent(text: string): UnsafeScreenResult {
  const raw = typeof text === "string" ? text : "";
  const folded = foldForMatch(raw);
  let matched = HARD_BLOCK_PATTERNS.reduce((n, re) => (re.test(raw) || re.test(folded) ? n + 1 : n), 0);

  const hasVerb = UNSAFE_VERBS.some((v) => folded.includes(foldForMatch(v)));
  const hasNoun = PROTECTED_NOUNS.some((n) => folded.includes(foldForMatch(n)));
  if (hasVerb && hasNoun) matched += 1;

  return { hardBlocked: matched > 0, matched };
}

export type UnsafeDecisionStatus = "ALLOW" | "REVIEW_REQUIRED" | "BLOCKED";

export interface UnsafeOutputDecision {
  status: UnsafeDecisionStatus;
  /** Deterministic requirement — the LLM can never set this false. */
  humanApprovalRequired: boolean;
  outputClass: IndustrialOutputClass;
  reason: string | null;
}

/**
 * Enforce the policy. `deterministicClass` and `deterministicApproval` come from
 * the authoritative engine. `candidateText` is any text about to be shown
 * (deterministic or LLM-rephrased). Rules:
 *  - safety-defeat content ⇒ BLOCKED.
 *  - approval-required class OR deterministic approval flag ⇒ REVIEW_REQUIRED,
 *    approval preserved true.
 *  - otherwise ALLOW, but approval requirement is the max of both inputs.
 */
export function enforceUnsafeOutputPolicy(
  deterministicClass: IndustrialOutputClass,
  deterministicApproval: boolean,
  candidateText: string,
): UnsafeOutputDecision {
  const screen = screenUnsafeContent(candidateText);
  if (screen.hardBlocked) {
    return {
      status: "BLOCKED",
      humanApprovalRequired: true,
      outputClass: deterministicClass,
      reason: "safety_defeat_content",
    };
  }
  const needsApproval =
    deterministicApproval || APPROVAL_REQUIRED_CLASSES.includes(deterministicClass);
  if (needsApproval) {
    return {
      status: "REVIEW_REQUIRED",
      humanApprovalRequired: true,
      outputClass: deterministicClass,
      reason: "approval_required_class",
    };
  }
  return {
    status: "ALLOW",
    humanApprovalRequired: false,
    outputClass: deterministicClass,
    reason: null,
  };
}
