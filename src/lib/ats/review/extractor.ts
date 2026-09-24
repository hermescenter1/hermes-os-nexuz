/**
 * ATS-S1 — deterministic evidence extraction.
 *
 * Pure: same input, same `now` → byte-identical output. No model, no network,
 * no randomness. It reads exactly the Stage-1 fields (resumeText,
 * fitStatement, keySkills, yearsExperience, currentLocation, linkedinUrl) and
 * NOTHING that could carry a protected attribute — the candidate's name and
 * contact details are never passed in.
 *
 * Every claim carries a source, a span, a quote and a confidence. Absence of
 * evidence is reported as absence, never as a negative fact.
 */

import type { RoleCriterion } from "./catalog";
import type { Evidence, EvidenceSource } from "./report-schema";
import { scanForInjection } from "./prompt-guard";

export interface ExtractionInput {
  resumeText: string | null;
  fitStatement: string | null;
  keySkills: readonly string[];
  yearsExperience: number | null;
  currentLocation: string | null;
  linkedinUrl: string | null;
}

export interface CriterionEvidence {
  criterion: RoleCriterion;
  evidence: Evidence[];
}

export interface YearsObservation {
  form: Evidence | null;
  /** Every "N years" mention found in text, with its numeric value. */
  mentions: { years: number; evidence: Evidence }[];
}

export interface ExtractionResult {
  criteria: CriterionEvidence[];
  years: YearsObservation;
  location: Evidence | null;
  injection: { suspected: boolean; evidence: Evidence[] };
  sources: { resumeText: boolean; fitStatement: boolean; keySkills: boolean };
}

const QUOTE_RADIUS = 60;
const MAX_HITS_PER_KEYWORD_PER_SOURCE = 3;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-bounded, case-insensitive, whitespace-flexible keyword pattern. */
function keywordPattern(keyword: string): RegExp {
  const parts = keyword.trim().split(/\s+/).map(escapeRegExp);
  const core = parts.join("\\s+");
  // Boundaries that work for Latin, digits and Persian letters alike.
  return new RegExp(`(?<![\\p{L}\\p{N}])${core}(?![\\p{L}\\p{N}])`, "giu");
}

function quoteAround(text: string, start: number, end: number): string {
  const from = Math.max(0, start - QUOTE_RADIUS);
  const to = Math.min(text.length, end + QUOTE_RADIUS);
  const raw = text.slice(from, to).replace(/\s+/g, " ").trim();
  return raw.length > 200 ? raw.slice(0, 197) + "..." : raw;
}

function textEvidence(
  source: EvidenceSource,
  text: string,
  start: number,
  end: number,
  confidence: Evidence["confidence"],
  meta: { now: string; extractorVersion: string },
): Evidence {
  return {
    source,
    span: { start, end },
    quote: quoteAround(text, start, end),
    confidence,
    extractedAt: meta.now,
    extractorVersion: meta.extractorVersion,
  };
}

function findKeyword(
  source: EvidenceSource,
  text: string,
  keyword: string,
  confidence: Evidence["confidence"],
  meta: { now: string; extractorVersion: string },
): Evidence[] {
  const out: Evidence[] = [];
  const re = keywordPattern(keyword);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && out.length < MAX_HITS_PER_KEYWORD_PER_SOURCE) {
    out.push(textEvidence(source, text, m.index, m.index + m[0].length, confidence, meta));
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

const YEARS_PATTERN = /(\d{1,2})\s*\+?\s*(?:years?|yrs?|سال)\b/giu;

export function extractEvidence(
  input: ExtractionInput,
  criteria: readonly RoleCriterion[],
  meta: { now: Date; extractorVersion: string },
): ExtractionResult {
  const m = { now: meta.now.toISOString(), extractorVersion: meta.extractorVersion };
  const resume = input.resumeText ?? "";
  const fit = input.fitStatement ?? "";
  const skillsText = input.keySkills.join(", ");

  const criteriaOut: CriterionEvidence[] = criteria.map((criterion) => {
    const evidence: Evidence[] = [];
    for (const kw of criterion.keywords) {
      if (!kw.trim()) continue;
      if (resume) evidence.push(...findKeyword("resumeText", resume, kw, "HIGH", m));
      if (fit) evidence.push(...findKeyword("fitStatement", fit, kw, "MEDIUM", m));
      // A self-declared skill is evidence of a claim, not of proficiency.
      if (skillsText) evidence.push(...findKeyword("keySkills", skillsText, kw, "MEDIUM", m));
    }
    return { criterion, evidence };
  });

  const years: YearsObservation = { form: null, mentions: [] };
  if (typeof input.yearsExperience === "number" && Number.isInteger(input.yearsExperience)) {
    years.form = {
      source: "yearsExperience",
      span: null,
      quote: String(input.yearsExperience),
      confidence: "HIGH",
      extractedAt: m.now,
      extractorVersion: m.extractorVersion,
    };
  }
  for (const [source, text] of [["resumeText", resume], ["fitStatement", fit]] as const) {
    if (!text) continue;
    const re = new RegExp(YEARS_PATTERN.source, YEARS_PATTERN.flags);
    let hit: RegExpExecArray | null;
    let count = 0;
    while ((hit = re.exec(text)) !== null && count < 8) {
      const n = Number(hit[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 60) {
        years.mentions.push({
          years: n,
          evidence: textEvidence(source, text, hit.index, hit.index + hit[0].length, "MEDIUM", m),
        });
        count++;
      }
    }
  }

  const location: Evidence | null = input.currentLocation
    ? {
        source: "currentLocation",
        span: null,
        quote: input.currentLocation.slice(0, 200),
        confidence: "HIGH",
        extractedAt: m.now,
        extractorVersion: m.extractorVersion,
      }
    : null;

  const injectionEvidence: Evidence[] = [];
  let suspected = false;
  for (const [source, text] of [["resumeText", resume], ["fitStatement", fit]] as const) {
    if (!text) continue;
    const scan = scanForInjection(text);
    if (scan.suspected) suspected = true;
    for (const h of scan.hits.slice(0, 5)) {
      injectionEvidence.push(textEvidence(source, text, h.start, h.end, "HIGH", m));
    }
  }

  return {
    criteria: criteriaOut,
    years,
    location,
    injection: { suspected, evidence: injectionEvidence },
    sources: { resumeText: resume.length > 0, fitStatement: fit.length > 0, keySkills: input.keySkills.length > 0 },
  };
}
