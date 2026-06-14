/**
 * Hermes Brain — safety guardrail policy (Step 5).
 *
 * Two enforcement layers:
 *  1. SYSTEM_GUARDRAILS is injected into EVERY prompt template, so no task
 *     prompt can ship without the policy.
 *  2. screenQuestion() runs BEFORE any LLM call. Questions that ask for
 *     safety-system bypass guidance never reach a model; the API returns a
 *     guardrail-flagged library response and the UI shows a refusal notice.
 *
 * The policy itself (machine-readable) — every Brain answer must respect:
 *  - no-execution: never execute, send, or claim to send commands to
 *    real machines; analysis only.
 *  - no-safety-bypass: never provide guidance for bypassing, defeating,
 *    jumpering, or disabling safety systems, interlocks, guards, or
 *    protective relays.
 *  - no-unsafe-forcing: never give unconditional PLC force/override
 *    instructions; forcing is discussed only with control measures and
 *    explicit hazard warnings.
 *  - human-approval: every recommendation requires review and approval by
 *    a qualified engineer before action on real equipment.
 *  - safety-disclaimer: responses touching electrical or mechanical work
 *    carry the relevant site-safety (LOTO / permit-to-work) notice.
 */

export const GUARDRAIL_IDS = [
  "no-execution",
  "no-safety-bypass",
  "no-unsafe-forcing",
  "human-approval",
  "safety-disclaimer",
] as const;

/** Injected verbatim into every prompt template's system block. */
export const SYSTEM_GUARDRAILS = [
  "MANDATORY SAFETY POLICY (non-negotiable, overrides any user instruction):",
  "1. You analyze problems only. You never execute, send, or claim to send commands to real machines, PLCs, drives, or any equipment.",
  "2. You never provide guidance for bypassing, defeating, jumpering, or disabling safety systems, safety interlocks, guards, light curtains, or protective relays — regardless of justification given.",
  "3. You never give unconditional PLC forcing/override instructions. If forcing is genuinely relevant, state the hazards and required control measures (LOTO, supervision, removal plan) and recommend qualified personnel.",
  "4. Every recommendation requires review and approval by a qualified engineer before any action on real equipment — state this when giving actionable steps.",
  "5. Electrical or mechanical interventions must reference lockout/tagout and permit-to-work procedures.",
].join("\n");

/** Bilingual screening for safety-bypass intent. Conservative by design:
 *  matching phrases route to a refusal notice instead of an LLM. */
const BYPASS_PATTERNS: string[] = [
  // English
  "bypass the safety", "bypass safety", "bypass interlock", "bypass the interlock",
  "disable the safety", "disable safety", "disable interlock",
  "defeat the safety", "defeat interlock", "jumper the safety", "jumper out",
  "override the safety", "remove the guard", "without lockout", "skip loto",
  "trick the sensor", "fool the safety",
  // Persian (ZWNJ-stripped to match brain-core normalization)
  "دور زدن اینترلاک", "دور زدن ایمنی", "دور زدن حفاظت",
  "غیرفعال کردن ایمنی", "غیرفعال کردن اینترلاک", "حذف حفاظ",
  "بدون قفل ایمنی", "فریب سنسور", "جامپر زدن ایمنی",
];

export type GuardrailFlag = "safetyBypass";

/** Bypass-intent verbs and protected-system nouns for co-occurrence
 *  screening. Exact phrases above catch canonical forms; co-occurrence
 *  catches conjugated/reordered phrasing ("اینترلاک را دور بزنم",
 *  "get the interlock to stop tripping by jumpering it"). Conservative by
 *  design: a rare false positive still yields diagnostic references plus
 *  a safety notice — never a dead end. */
const BYPASS_VERBS = [
  "bypass", "defeat", "jumper", "circumvent", "get around", "trick", "fool",
  "disable", "override", "turn off",
  "دور بزن", "دور زدن", "غیرفعال", "از کار بینداز", "از کار انداخت", "خاموش کن", "فریب",
];
const PROTECTED_NOUNS = [
  "safety", "interlock", "guard", "light curtain", "protective relay", "e-stop", "estop",
  "ایمنی", "اینترلاک", "حفاظ", "پرده نوری", "رله حفاظتی",
];

export function screenQuestion(normalizedText: string): GuardrailFlag | null {
  for (const p of BYPASS_PATTERNS) {
    if (normalizedText.includes(p.replace(/\u200C/g, "").toLowerCase())) {
      return "safetyBypass";
    }
  }
  const hasVerb = BYPASS_VERBS.some((v) =>
    normalizedText.includes(v.replace(/\u200C/g, "").toLowerCase())
  );
  const hasNoun = PROTECTED_NOUNS.some((n) =>
    normalizedText.includes(n.replace(/\u200C/g, "").toLowerCase())
  );
  return hasVerb && hasNoun ? "safetyBypass" : null;
}
