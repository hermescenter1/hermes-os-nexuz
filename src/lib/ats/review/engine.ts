/**
 * ATS-S1 — the review engine: extraction → scoring → typed report.
 *
 * The DETERMINISTIC path is the product. It never leaves the process and is
 * fully reproducible from the stored inputs and version labels.
 *
 * The ROUTER path is optional and doubly gated: `ATS_AI_REVIEW_PROVIDER=router`
 * AND `ATS_AI_EXTERNAL_PROCESSING_ALLOWED=true`. When it runs, the model
 * receives sanitised candidate text inside a data fence, criterion LABELS
 * only, and is asked for advisory prose about evidence. Its output is
 * appended to `explanation` — never to a score, a gate, or the
 * recommendation, all of which are computed here. A mock/degraded response is
 * discarded, not stored as if it were a model's.
 */

import { ROLE_PROFILES, roleCodeFromCriterionCodes, type RoleCode, type RoleCriterion, type RoleProfile } from "./catalog";
import { extractEvidence, type ExtractionInput } from "./extractor";
import { scoreExtraction } from "./scorer";
import { buildAdvisoryPrompt, sanitizeCandidateText } from "./prompt-guard";
import { assertReport, type AiReviewReport, type CriterionMatch } from "./report-schema";
import {
  ATS_EXTRACTOR_VERSION,
  ATS_POLICY_VERSION,
  ATS_PROMPT_VERSION,
  ATS_RUBRIC_VERSION,
  getAiReviewProviderMode,
  isExternalAiProcessingAllowed,
} from "../policy";

export interface StoredCriterion {
  code: string;
  label: string;
  kind: "MUST_HAVE" | "NICE_TO_HAVE" | "DISQUALIFIER";
  dimension: string;
  weight: number;
  keywords: unknown;
  minYears: number | null;
  hardGate: boolean;
}

export interface ReviewInput extends ExtractionInput {
  criteria: readonly StoredCriterion[];
  roleTitle: string;
}

export type AdvisoryProvider = (prompt: string) => Promise<{ text: string; model: string } | null>;

export interface ReviewOptions {
  now: Date;
  /** Injected for tests; production resolves the router lazily. */
  advisory?: AdvisoryProvider;
}

export type ReviewOutcome =
  | { ok: true; report: AiReviewReport; provider: string; modelVersion: string | null }
  | { ok: false; code: "NO_CRITERIA" | "UNKNOWN_ROLE" | "REPORT_INVALID" };

function toRoleCriteria(stored: readonly StoredCriterion[], role: RoleCode): RoleCriterion[] {
  return stored.map((c) => ({
    code: c.code.startsWith(`${role}.`) ? c.code.slice(role.length + 1) : c.code,
    label: c.label,
    kind: c.kind,
    dimension: c.dimension as RoleCriterion["dimension"],
    weight: c.weight,
    keywords: Array.isArray(c.keywords) ? c.keywords.filter((k): k is string => typeof k === "string") : [],
    ...(typeof c.minYears === "number" ? { minYears: c.minYears } : {}),
    hardGate: c.hardGate,
  }));
}

const asMatch = (c: RoleCriterion, evidence: CriterionMatch["evidence"]): CriterionMatch => ({
  criterionCode: c.code,
  label: c.label,
  kind: c.kind,
  dimension: c.dimension,
  weight: c.weight,
  evidence,
});

function explain(profile: RoleProfile, report: Omit<AiReviewReport, "explanation" | "humanReview">): string {
  const matched = report.matchedSkills.map((m) => m.label);
  const missing = report.missingSkills.map((m) => m.label);
  const gates = report.hardGates.map((g) => `${g.label}: ${g.outcome}`);
  const lines = [
    `Role: ${profile.title.en}.`,
    report.overallScore === null
      ? "Overall score: not computable — no scorable criteria had evidence."
      : `Overall score ${report.overallScore}/100 with confidence ${report.confidence}/100.`,
    `Recommendation: ${report.recommendation} (advisory; a human decides).`,
    matched.length ? `Evidence found for: ${matched.join("; ")}.` : "No skill criteria had evidence in the supplied text.",
    missing.length ? `No evidence found for: ${missing.join("; ")}. Ask the candidate rather than assume.` : "",
    gates.length ? `Hard gates — ${gates.join("; ")}.` : "",
    report.experience.years.status === "OBSERVED"
      ? `Experience observed: ${report.experience.years.value} years (${report.experience.years.evidence.source}).`
      : "Experience: unknown — not supplied.",
    report.contradictions.length ? `Contradictions: ${report.contradictions.map((c) => c.note).join("; ")}.` : "",
    report.riskFlags.length ? `Risk flags: ${report.riskFlags.map((r) => r.code).join(", ")}.` : "",
    "Work authorization and salary expectations were not collected at this stage and are reported as unknown.",
  ].filter((l) => l.length > 0);
  return lines.join(" ");
}

export async function reviewApplication(input: ReviewInput, opts: ReviewOptions): Promise<ReviewOutcome> {
  if (input.criteria.length === 0) return { ok: false, code: "NO_CRITERIA" };
  const role = roleCodeFromCriterionCodes(input.criteria.map((c) => c.code));
  if (!role) return { ok: false, code: "UNKNOWN_ROLE" };
  const profile = ROLE_PROFILES[role];
  const criteria = toRoleCriteria(input.criteria, role);

  const x = extractEvidence(input, criteria, { now: opts.now, extractorVersion: ATS_EXTRACTOR_VERSION });
  const s = scoreExtraction(profile, x);
  const nowIso = opts.now.toISOString();

  const byDim = (dim: string, kinds: readonly string[]) =>
    x.criteria.filter((c) => c.criterion.dimension === dim && kinds.includes(c.criterion.kind));

  const matchedSkills = byDim("skill", ["MUST_HAVE", "NICE_TO_HAVE"])
    .filter((c) => c.evidence.length > 0)
    .map((c) => asMatch(c.criterion, c.evidence));
  const missingSkills = byDim("skill", ["MUST_HAVE", "NICE_TO_HAVE"])
    .filter((c) => c.evidence.length === 0)
    .map((c) => ({ criterionCode: c.criterion.code, label: c.criterion.label, kind: c.criterion.kind, dimension: c.criterion.dimension, ask: `Ask for concrete examples of: ${c.criterion.label}.` }));
  const matchedIn = (dim: string) =>
    byDim(dim, ["MUST_HAVE", "NICE_TO_HAVE"]).filter((c) => c.evidence.length > 0).map((c) => asMatch(c.criterion, c.evidence));
  const missingIn = (dim: string) =>
    byDim(dim, ["MUST_HAVE", "NICE_TO_HAVE"])
      .filter((c) => c.evidence.length === 0 && typeof c.criterion.minYears !== "number")
      .map((c) => ({ criterionCode: c.criterion.code, label: c.criterion.label, kind: c.criterion.kind, dimension: c.criterion.dimension, ask: `Ask for evidence of: ${c.criterion.label}.` }));

  const riskFlags: AiReviewReport["riskFlags"] = [];
  if (x.injection.suspected) riskFlags.push({ code: "PROMPT_INJECTION_SUSPECTED", note: "instruction-shaped content in candidate text; scores are unaffected by it", evidence: x.injection.evidence });
  if (!x.sources.resumeText) riskFlags.push({ code: "RESUME_TEXT_ABSENT", note: "no résumé text supplied; evidence limited to form fields", evidence: [] });
  if (s.experienceContradiction) riskFlags.push({ code: "EXPERIENCE_CONTRADICTION", note: s.experienceContradiction.note, evidence: [s.experienceContradiction.a, s.experienceContradiction.b] });
  if (!x.location) riskFlags.push({ code: "LOCATION_UNKNOWN", note: "no current location supplied", evidence: [] });
  riskFlags.push({ code: "WORK_AUTHORIZATION_NOT_COLLECTED", note: "not collected in Stage 1; must be asked before an offer", evidence: [] });
  riskFlags.push({ code: "SALARY_NOT_COLLECTED", note: "not collected in Stage 1; no salary fit is asserted", evidence: [] });
  if (s.hardGates.some((g) => g.outcome === "FAIL" && g.note.startsWith("explicit disqualifying"))) {
    riskFlags.push({ code: "DISQUALIFIER_EVIDENCE", note: "an explicit disqualifying statement was found; verify with the candidate", evidence: [] });
  }
  if (s.confidence < 40) riskFlags.push({ code: "LOW_EVIDENCE_COVERAGE", note: "little of the rubric had evidence; treat every score as provisional", evidence: [] });

  const partial: Omit<AiReviewReport, "explanation" | "humanReview"> = {
    schemaVersion: "ats-review-report-1",
    extractorVersion: ATS_EXTRACTOR_VERSION,
    rubricVersion: ATS_RUBRIC_VERSION,
    promptVersion: ATS_PROMPT_VERSION,
    policyVersion: ATS_POLICY_VERSION,
    provider: "deterministic",
    modelVersion: null,
    generatedAt: nowIso,
    roleCode: role,
    matchedSkills,
    missingSkills,
    experience: {
      years: s.yearsObserved,
      evidence: [...(x.years.form ? [x.years.form] : []), ...x.years.mentions.map((m) => m.evidence)],
    },
    education: matchedIn("education"),
    certifications: matchedIn("certification"),
    projects: matchedIn("project"),
    roleRelevance: matchedIn("role_relevance"),
    locationAvailability: x.location
      ? { status: "OBSERVED", value: x.location.quote, evidence: x.location }
      : { status: "UNKNOWN", reason: "no current location supplied" },
    workAuthorization: { status: "UNKNOWN", reason: "not collected in Stage 1" },
    salaryFit: { status: "NOT_COLLECTED", reason: "salary expectation is not collected in Stage 1" },
    contradictions: s.experienceContradiction
      ? [{ topic: "years of experience", a: s.experienceContradiction.a, b: s.experienceContradiction.b, note: s.experienceContradiction.note }]
      : [],
    missingEvidence: [...missingSkills, ...missingIn("education"), ...missingIn("certification"), ...missingIn("project"), ...missingIn("role_relevance")],
    riskFlags,
    hardGates: s.hardGates,
    dimensionScores: s.dimensionScores,
    overallScore: s.overallScore,
    confidence: s.confidence,
    recommendation: s.recommendation,
  };

  let explanation = explain(profile, partial);
  let provider = "deterministic";
  let modelVersion: string | null = null;

  if (getAiReviewProviderMode() === "router" && isExternalAiProcessingAllowed()) {
    const advisory = opts.advisory ?? (await defaultAdvisory());
    if (advisory && input.resumeText) {
      const prompt = buildAdvisoryPrompt({
        roleTitle: input.roleTitle,
        criterionLabels: criteria.map((c) => c.label),
        resumeText: input.resumeText,
        fitStatement: input.fitStatement,
      });
      try {
        const res = await advisory(prompt);
        if (res && res.text.trim()) {
          explanation = `${explanation} Model commentary (advisory, ${res.model}): ${sanitizeCandidateText(res.text).slice(0, 1500)}`;
          provider = `router:${res.model}`;
          modelVersion = res.model;
        }
      } catch {
        /* advisory failure never fails the review */
      }
    }
  }

  const candidate = {
    ...partial,
    provider,
    modelVersion,
    explanation: explanation.slice(0, 4000),
    humanReview: {
      status: "PENDING_HUMAN_APPROVAL" as const,
      note: "This report is advisory. No transition occurs without a recorded human decision." as const,
    },
  };

  try {
    return { ok: true, report: assertReport(candidate), provider, modelVersion };
  } catch {
    return { ok: false, code: "REPORT_INVALID" };
  }
}

/** The production advisory provider: the Phase 12 router, discarding mocks. */
async function defaultAdvisory(): Promise<AdvisoryProvider | null> {
  try {
    const { routeAIRequest } = await import("@/lib/ai/router");
    return async (prompt: string) => {
      const res = await routeAIRequest({ task: "structuredOutput", prompt });
      if (res.metadata.mock) return null;
      return { text: res.content, model: String(res.metadata.model ?? res.metadata.resolvedProvider) };
    };
  } catch {
    return null;
  }
}
