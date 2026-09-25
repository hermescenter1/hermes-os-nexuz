/**
 * ATS-B2 / ATS-S1 — recruitment policy and configuration, in ONE place.
 *
 * Everything here is either a VERSION LABEL (stored beside every record it
 * governs, so a report can be reproduced) or an ENVIRONMENT-RESOLVED setting
 * with a fail-closed default. Nothing here is a business duration: retention
 * is read from the organization's APPROVED RetentionPolicy at intake, never
 * from a constant (see `intake.ts`).
 *
 * Dependency-free on purpose — importable from a route, a worker, a client
 * bundle and a test without dragging Prisma along.
 */

/** The privacy-notice / attestation text version an applicant acknowledges. */
export const RECRUITMENT_CONSENT_VERSION = "2026-09-ats-b2";

/** Version labels stamped on every AI review row. */
export const ATS_EXTRACTOR_VERSION = "deterministic-1.0";
export const ATS_RUBRIC_VERSION = "hermes-5-roles-1.0";
export const ATS_PROMPT_VERSION = "ats-review-prompt-1.0";
export const ATS_POLICY_VERSION = "stage-gate-1.0";

/** Environment variable NAMES (values are never read here). */
export const ENV = {
  /** HMAC secret binding an idempotency claim to its payload. REQUIRED for intake. */
  IDEMPOTENCY_SECRET: "RECRUITMENT_IDEMPOTENCY_SECRET",
  /** "deterministic" (default) | "router". */
  AI_REVIEW_PROVIDER: "ATS_AI_REVIEW_PROVIDER",
  /** Literal "true" allows candidate text to reach an external model. Default: not allowed. */
  AI_EXTERNAL_PROCESSING_ALLOWED: "ATS_AI_EXTERNAL_PROCESSING_ALLOWED",
  /** Bearer token for the review-worker trigger route. */
  REVIEW_WORKER_TOKEN: "ATS_REVIEW_WORKER_TOKEN",
} as const;

export type AtsAiReviewProviderMode = "deterministic" | "router";

/**
 * Which review provider runs. Anything that is not the literal "router" is
 * deterministic — a typo cannot turn on an external call.
 */
export function getAiReviewProviderMode(): AtsAiReviewProviderMode {
  return process.env[ENV.AI_REVIEW_PROVIDER]?.trim().toLowerCase() === "router" ? "router" : "deterministic";
}

/**
 * Whether candidate-supplied text may be sent to an external model at all.
 * Default false: the deterministic path never leaves the process, and the
 * router path is refused — not degraded, refused — without this policy flag.
 */
export function isExternalAiProcessingAllowed(): boolean {
  return process.env[ENV.AI_EXTERNAL_PROCESSING_ALLOWED]?.trim().toLowerCase() === "true";
}

/** The idempotency fingerprint secret, or null when intake must refuse. */
export function getIdempotencySecret(): string | null {
  const v = process.env[ENV.IDEMPOTENCY_SECRET];
  return typeof v === "string" && v.length >= 16 ? v : null;
}

/**
 * Attributes that must NEVER become a criterion, a keyword or a scoring
 * input. The rubric test scans every criterion label and keyword against
 * this list; the extractor never reads a field that could carry one.
 */
export const PROTECTED_ATTRIBUTE_TERMS = [
  "age",
  "date of birth",
  "birthday",
  "gender",
  "sex",
  "male",
  "female",
  "ethnicity",
  "race",
  "religion",
  "photo",
  "picture",
  "marital",
  "married",
  "single",
  "pregnan",
  "nationality",
  "surname",
  "family name",
  "last name",
  "disability",
] as const;

/**
 * ATS-M1 — the RUNTIME protected-characteristic scan for criteria that people
 * type (position management), in the three site languages.
 *
 * Why it is not the S1 test's regex: that one matches a term as a word PREFIX
 * (`(?<![a-z])age`), which is right for the fixed catalogue — it fails closed
 * on anything close — but would refuse ordinary engineering vocabulary typed
 * into a form ("agent", "agency", "single-phase motor", "photovoltaic").
 * Here an English term must be a whole word (with an optional -s / -es / -d /
 * -ed ending, so "ages" and "aged" are caught), except the stems in
 * {@link EN_STEMS}, which match any word they begin. Persian and German terms
 * are compared as whole TOKENS (ZWNJ separates tokens), multi-word terms as
 * consecutive tokens, and the German / Persian STEMS below catch inflected
 * forms. Anything that matches is refused, never rewritten: the author must
 * remove it.
 *
 * Persian text is normalised first (Arabic ي/ك → Persian ی/ک), so a term typed
 * on an Arabic keyboard layout cannot slip past.
 */
const EN_STEMS: ReadonlySet<string> = new Set(["pregnan"]);
const HYPHEN_COMPOUND_TERMS: ReadonlySet<string> = new Set(["single", "man"]);

export const PROTECTED_ATTRIBUTE_TERMS_FA = [
  "سن",
  "جنسیت",
  "جنس",
  "مذهب",
  "دین",
  "قومیت",
  "نژاد",
  "ملیت",
  "تابعیت",
  "تأهل",
  "تاهل",
  "متأهل",
  "متاهل",
  "مجرد",
  "بارداری",
  "باردار",
  "معلولیت",
  "عکس",
  "تاریخ تولد",
  "نام خانوادگی",
] as const;

export const PROTECTED_ATTRIBUTE_TERMS_DE = [
  "alter",
  "geschlecht",
  "religion",
  "konfession",
  "ethnie",
  "herkunft",
  "nationalität",
  "staatsangehörigkeit",
  "familienstand",
  "verheiratet",
  "ledig",
  "schwanger",
  "schwangerschaft",
  "behinderung",
  "foto",
  "lichtbild",
  "geburtsdatum",
] as const;

/**
 * Runtime-only additions. They are NOT part of PROTECTED_ATTRIBUTE_TERMS,
 * whose prefix scan over the fixed catalogue would read "men" inside
 * "mentoring"; here every English term is a whole word.
 */
const PROTECTED_ATTRIBUTE_TERMS_EN_EXTRA = [
  "men",
  "women",
  "man",
  "woman",
  "ladies",
  "gentlemen",
  "young",
  "younger",
  "youngest",
  "unmarried",
  "citizenship",
  "photograph",
  "headshot",
  "sexual orientation",
  "ethnic",
  "religious",
] as const;

/**
 * German and Persian STEMS: a token that BEGINS with one of these is a hit, so
 * inflected forms are caught ("ledige", "männlichen", "Altersgrenze",
 * "مذهبی", "متأهلین"). Terms that would over-match as a prefix ("alter" in
 * "Alternative", "سن" in "سنجش", "دین" in "دینامیک", "foto" in "Fotografie")
 * stay whole-token only in the lists above.
 */
const DE_STEMS = [
  "männlich",
  "weiblich",
  "ledig",
  "verheirat",
  "schwanger",
  "behinder",
  "geschlecht",
  "rasse",
  "konfession",
  "religi",
  "ethni",
  "herkunft",
  "nationalität",
  "staatsangehörig",
  "familienstand",
  "geburtsdatum",
  "lichtbild",
  "bewerbungsfoto",
  "staatsbürger",
  "alters",
  "höchstalter",
  "mindestalter",
] as const;
const DE_WHOLE_EXTRA = ["mann", "männer", "frau", "frauen", "fotos", "jung", "junge", "jünger", "jüngere"] as const;

const FA_STEMS = [
  "جنسیت",
  "نژاد",
  "مذهب",
  "قومیت",
  "ملیت",
  "تابعیت",
  "تأهل",
  "تاهل",
  "متأهل",
  "متاهل",
  "مجرد",
  "باردار",
  "معلول",
] as const;
const FA_WHOLE_EXTRA = ["مرد", "مردان", "زن", "زنان", "آقا", "آقایان", "آقایون", "خانم", "خانمها", "بانوان", "مذکر", "مونث", "مؤنث", "متولد", "سنین", "جوان", "جوانان"] as const;

/**
 * Established TECHNICAL phrases that contain a protected word but describe
 * equipment or software, not a person. They are removed before the scan so a
 * realistic PLC / SCADA / software criterion or interview question can be
 * saved; the list is explicit and reviewed — nothing is exempted by pattern.
 */
const TECHNICAL_PHRASES = [
  "single point of failure",
  "single points of failure",
  "single sign-on",
  "single sign on",
  "single-mode",
  "single mode",
  "single board computer",
  "single-board computer",
  "single phase",
  "single-phase",
  "man hours",
  "man-hours",
  "man hour",
  "race conditions",
  "race condition",
  "data races",
  "data race",
  "male connectors",
  "female connectors",
  "male connector",
  "female connector",
  "male plug",
  "female plug",
  "male socket",
  "female socket",
  "male thread",
  "female thread",
  "male header",
  "female header",
  "asset age",
  "equipment age",
  "machine age",
  "plant age",
  "battery age",
  "oil age",
  "age of the asset",
  "age of the equipment",
  "age of assets",
  "age of equipment",
  "alter der anlagen",
  "alter der anlage",
  "alter der maschine",
  "alter der ausrüstung",
  "alter des geräts",
  "سن تجهیزات",
  "سن دستگاه",
  "سن ماشین آلات",
  "سن ماشین\u200cآلات",
  "سن دارایی",
  "عکس\u200cالعمل\u200cها",
  "عکس\u200cالعمل",
  "عکس العمل",
] as const;

function normalizeForScan(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/\u064A/g, "\u06CC")
      .replace(/\u0643/g, "\u06A9")
      // Arabic-script diacritics and tatweel carry no meaning for the scan
      // ("سنّ" is "سن"), so they cannot be used to slip a term past it.
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
  );
}

function stripTechnicalPhrases(normalized: string): string {
  let out = normalized;
  for (const phrase of TECHNICAL_PHRASES) out = out.split(normalizeForScan(phrase)).join(" ");
  return out;
}

/**
 * Tokens for the Persian / German comparison. ZWNJ (U+200C) separates a
 * Persian stem from its plural or suffix ("خانم‌ها" → "خانم", "ها"), so it is
 * a separator here, like whitespace and punctuation.
 */
function tokensOf(text: string): string[] {
  return normalizeForScan(text)
    .split(/[\s\p{P}\p{S}\u200c]+/u)
    .filter(Boolean);
}

function containsTokenSequence(tokens: readonly string[], phrase: string): boolean {
  const want = tokensOf(phrase);
  if (want.length === 0) return false;
  for (let i = 0; i + want.length <= tokens.length; i++) {
    if (want.every((w, j) => tokens[i + j] === w)) return true;
  }
  return false;
}

/**
 * The protected terms `text` contains, in the order of the term lists; an
 * empty array means the text is clean. Deterministic and dependency-free.
 */
export function findProtectedTerms(text: string): string[] {
  if (typeof text !== "string" || text.trim().length === 0) return [];
  const lower = stripTechnicalPhrases(normalizeForScan(text));
  const tokens = tokensOf(lower);
  const hits: string[] = [];
  for (const term of [...PROTECTED_ATTRIBUTE_TERMS, ...PROTECTED_ATTRIBUTE_TERMS_EN_EXTRA]) {
    // "-y" nouns pluralise as "-ies" ("disability" / "disabilities").
    const stem = term.endsWith("y") ? term.slice(0, -1) : term;
    const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
    const escaped = term.endsWith("y") ? `${escapedStem}(?:y|ies)` : escapedStem;
    // "single-phase motor", "single-page application" and "man-hours" are
    // engineering vocabulary, so for those terms ONLY a following hyphen marks
    // a compound. Every other term stays refused before a hyphen ("age-limit").
    const boundary = HYPHEN_COMPOUND_TERMS.has(term) ? "(?![a-z-])" : "(?![a-z])";
    // Plural and participle endings: "ages", "aged", "photos".
    const tail = EN_STEMS.has(term) ? "" : `(?:s|es|d|ed)?${boundary}`;
    if (new RegExp(`(?<![a-z])${escaped}${tail}`, "i").test(lower)) hits.push(term);
  }
  for (const term of [...PROTECTED_ATTRIBUTE_TERMS_FA, ...PROTECTED_ATTRIBUTE_TERMS_DE, ...DE_WHOLE_EXTRA, ...FA_WHOLE_EXTRA]) {
    if (containsTokenSequence(tokens, term)) hits.push(term);
  }
  for (const stem of [...DE_STEMS, ...FA_STEMS]) {
    if (tokens.some((t) => t.startsWith(stem)) && !hits.includes(stem)) hits.push(stem);
  }
  return [...new Set(hits)];
}
