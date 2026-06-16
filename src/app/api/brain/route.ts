import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/industrial/pipeline";
import { runReasoning, summarizeEvidence } from "@/lib/industrial/reasoning";
import { computeConfidence, vendorCertainty } from "@/lib/industrial/confidence";
import { runRetrieval } from "@/lib/retrieval/retrieval-engine";
import { isDatabaseMode } from "@/lib/storage/storage-mode";
import { analysisRepository } from "@/lib/storage/analysis-repository";
import { unknownRepository } from "@/lib/storage/unknown-repository";
import { CASES } from "@/lib/industrial/cases";
import { analysisMemory, computeMemoryStats, type AnalysisRecord } from "@/lib/industrial/memory";
import { getPublishedCorpus } from "@/lib/industrial/db-bridge";
import { completeTask, gatewayAvailable } from "@/lib/llm/gateway";
import { buildPrompt, taskForDomain } from "@/lib/llm/prompts";
import { screenQuestion } from "@/lib/llm/guardrails";
import type { BrainAnalysis, BrainDomainId, ReasoningMode } from "@/lib/services/types";
import type { Citation } from "@/lib/services/rag-types";
import type { StoredAnalysis } from "@/lib/storage/types";
import en from "../../../../messages/en.json";

export const dynamic = "force-dynamic";

type KnowledgeNs = Record<
  string,
  { name: string; summary: string; p1: string; p2: string; p3: string; c1: string; c2: string }
>;

function normalizeForScreen(q: string): string {
  return q.toLowerCase().replace(/\u064A/g, "\u06CC").replace(/\u0643/g, "\u06A9").replace(/\u200C/g, "");
}

function buildCitations(libraryIds: string[]): Citation[] {
  const kn = (en as { knowledge: KnowledgeNs }).knowledge;
  return libraryIds
    .filter((id) => Boolean(kn[id]))
    .map((id, i) => ({
      id: String(i + 1),
      sourceId: id,
      sourceType: "library" as const,
      snippetKey: `knowledge.${id}.summary`,
    }));
}

/**
 * Hermes Brain BFF — Step 6: the multi-step reasoning pipeline runs every
 * request (domain detection → knowledge retrieval incl. vendor context and
 * engineering cases → cause analysis → risk analysis → recommendation →
 * final report), every analysis is recorded to the Analysis Memory Engine,
 * and the response is a strict SUPERSET of the Step 5 contract — the
 * existing UI keeps working untouched. ANALYSIS ONLY, as before.
 */
export async function POST(req: Request) {
  let body: { question?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const question = (body.question ?? "").trim().slice(0, 2000);
  const locale = body.locale === "fa" ? "fa" : "en";
  if (question.length < 8) {
    return NextResponse.json({ error: "question too short" }, { status: 400 });
  }

  // Phase 11B-A: in database mode, merge PostgreSQL-published cases/knowledge
  // into the reasoning pipeline and retrieval engine. Best-effort — any
  // repository failure resolves to an empty corpus (see getPublishedCorpus),
  // so the static JSON fallback is never at risk.
  const corpus = isDatabaseMode() ? await getPublishedCorpus() : undefined;
  const pipe = runPipeline(question, locale, corpus);
  const guardrail = screenQuestion(normalizeForScreen(question));
  if (pipe.unknown) {
    // Unknown layer: retrieval disabled — no libraries, citations,
    // reasoning, root cause, or LLM call. Guardrail screening already ran.
    const analysis: BrainAnalysis = {
      mode: "library",
      domains: [],
      libraries: [],
      citations: [],
      confidence: pipe.confidence,
      safety: pipe.safety,
      ...(guardrail ? { guardrail } : {}),
      vendors: pipe.vendors,
      riskLevel: "unknown",
      evidence: { score: 0, caseMatches: [], cases: [] },
      pipeline: { steps: pipe.steps },
      humanApprovalRequired: true,
      confidenceReport: computeConfidence({
        domainConfidence: pipe.confidence,
        vendorConfidence: vendorCertainty(pipe.vendors.length),
        caseMatches: 0,
        evidenceCount: 0,
      }),
      unknown: true,
    };
    analysisMemory.record({
      question,
      locale,
      domains: [],
      libraries: [],
      mode: "library",
      ...(guardrail ? { guardrail } : {}),
      vendors: pipe.vendors,
      caseMatches: [],
      safety: pipe.safety,
      confidence: pipe.confidence,
      evidenceScore: 0,
      ...(pipe.vendors.length > 0 ? { vendor: pipe.vendors[0] } : {}),
      ...(pipe.suggested ? { suggestedDomains: pipe.suggested } : {}),
      unknown: true,
    });
    // Phase 11B: in database mode, persist the analysis record and an Unknown
    // triage row to PostgreSQL. Session mode keeps the in-process behavior.
    if (isDatabaseMode()) {
      try {
        await analysisRepository().create({
          query: question,
          locale,
          mode: "library",
          domains: [],
          vendors: pipe.vendors,
          cases: [],
          knowledge: [],
          confidence: pipe.confidence,
          riskLevel: "unknown",
          isUnknown: true,
        });
        await unknownRepository().create({
          query: question,
          locale,
          confidence: pipe.confidence,
          suggestedDomains: (pipe.suggested ?? []).map((s) => s.id),
          suggestedVendors: pipe.vendors,
          status: "open",
        });
      } catch {
        /* best-effort persistence */
      }
    }
    return NextResponse.json(analysis);
  }

  const reasoning = runReasoning(
    {
      text: question,
      domains: pipe.domains.map((d) => d.id),
      vendors: pipe.vendors,
      caseIds: pipe.caseMatches.map((m) => m.case.id),
      libraries: pipe.libraries,
      baseRisk: pipe.riskLevel === "unknown" ? "low" : pipe.riskLevel,
    },
    locale
  );

  let analysis: BrainAnalysis = {
    mode: "library",
    domains: pipe.domains,
    libraries: pipe.libraries,
    citations: buildCitations(pipe.libraries),
    confidence: pipe.confidence,
    safety: guardrail
      ? pipe.safety === "general"
        ? "mechanical"
        : pipe.safety
      : pipe.safety,
    ...(guardrail ? { guardrail } : {}),
    vendors: pipe.vendors,
    // Step 8B: risk assessment reflects the reasoning engine's escalation
    // (never lower than the pipeline's base risk — same type, compatible).
    riskLevel: reasoning.riskLevel,
    evidence: {
      score: pipe.evidenceScore,
      caseMatches: pipe.caseMatches.map((m) => m.case.id),
      cases: pipe.caseMatches.map((m) => ({
        id: m.case.id,
        vendor: m.case.vendor,
        category: m.case.category,
      })),
    },
    pipeline: { steps: pipe.steps },
    reasoning,
    probableCauses: reasoning.probableCauses,
    recommendedActions: reasoning.recommendedActions,
    evidenceSummary: summarizeEvidence(reasoning, locale),
    humanApprovalRequired: true,
    ...(pipe.rootCause ? { rootCause: pipe.rootCause } : {}),
    confidenceReport: computeConfidence({
      domainConfidence: pipe.confidence,
      vendorConfidence: vendorCertainty(pipe.vendors.length),
      caseMatches: pipe.caseMatches.length,
      evidenceCount: reasoning.evidence.length,
    }),
    retrieval: runRetrieval({
      text: question,
      domains: pipe.domains.map((d) => d.id),
      vendors: pipe.vendors,
      extraCases: corpus?.cases,
      extraKnowledge: corpus?.knowledge,
    }),
  };

  if (!guardrail && gatewayAvailable()) {
    const kn = (en as { knowledge: KnowledgeNs }).knowledge;
    const libContext = pipe.libraries
      .map((id) => {
        const l = kn[id];
        return l
          ? `## [${id}] ${l.name}\n${l.summary}\n- ${l.p1}\n- ${l.p2}\n- ${l.p3}\nChecks: ${l.c1} / ${l.c2}`
          : "";
      })
      .filter(Boolean);
    // Vendor-matched engineering cases ground the model in field evidence.
    const caseContext = pipe.caseMatches.map(({ case: c }) =>
      [
        `## [${c.id}] Engineering case — vendor: ${c.vendor}`,
        `Symptoms: ${c.en.symptoms}`,
        `Root cause: ${c.en.rootCause}`,
        `Resolution: ${c.en.resolution}`,
      ].join("\n")
    );
    const reasoningContext = [
      "## Deterministic reasoning engine output (treat as primary hypotheses; do not contradict without stating why)",
      `Probable causes: ${reasoning.probableCauses.join(" | ")}`,
      `Recommended actions: ${reasoning.recommendedActions.join(" | ")}`,
      `Risk level: ${reasoning.riskLevel}`,
    ].join("\n");
    const context = [reasoningContext, ...caseContext, ...libContext].join("\n\n");

    const task = taskForDomain(pipe.domains[0].id);
    const { system, user } = buildPrompt(task, locale, question, context);
    const result = await completeTask({ task, locale, system, user });

    if (result.ok) {
      try {
        const clean = result.text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean) as BrainAnalysis["llm"];
        if (
          parsed &&
          typeof parsed.summary === "string" &&
          typeof parsed.cause === "string" &&
          Array.isArray(parsed.analysis) &&
          Array.isArray(parsed.checks)
        ) {
          analysis = {
            ...analysis,
            mode: "llm",
            confidence: Math.min(pipe.confidence + 0.05, 0.92),
            llm: parsed,
            usage: result.usage,
          };
        }
      } catch {
        /* malformed -> structured library fallback (already populated) */
      }
    }
  }

  // Analysis Memory Engine: persist every analysis with learning metadata.
  analysisMemory.record({
    question,
    locale,
    domains: pipe.domains,
    libraries: pipe.libraries,
    caseMatches: pipe.caseMatches.map((m) => m.case.id),
    vendors: pipe.vendors,
    mode: analysis.mode,
    safety: analysis.safety,
    ...(guardrail ? { guardrail } : {}),
    confidence: analysis.confidence,
    evidenceScore: pipe.evidenceScore,
    ...(pipe.rootCause ? { primaryCause: pipe.rootCause.primary } : {}),
    ...(pipe.caseMatches.length > 0 ? { caseId: pipe.caseMatches[0].case.id } : {}),
    ...(pipe.vendors.length > 0 ? { vendor: pipe.vendors[0] } : {}),
    unknown: false,
  });

  // Phase 11B: durable analysis history. In database mode this persists to
  // PostgreSQL; in session mode the in-process ring above already holds it,
  // so we skip the repo write to avoid double-storing the same record.
  if (isDatabaseMode()) {
    try {
      await analysisRepository().create({
        query: question,
        locale,
        mode: analysis.mode,
        domains: pipe.domains.map((d) => d.id),
        vendors: pipe.vendors,
        cases: pipe.caseMatches.map((m) => m.case.id),
        knowledge: pipe.libraries,
        confidence: analysis.confidence,
        riskLevel: analysis.riskLevel ?? "low",
        isUnknown: false,
      });
    } catch {
      /* history persistence is best-effort; never blocks the response */
    }
  }

  return NextResponse.json(analysis, { headers: { "Cache-Control": "no-store" } });
}

/** Phase 11B-B: maps a durable StoredAnalysis row into the AnalysisRecord
 *  shape GET already returns. Lossy in a few fields StoredAnalysis doesn't
 *  carry (safety, guardrail, a separately-tracked evidenceScore) — those
 *  fall back to a neutral default rather than breaking the response shape. */
function rowToAnalysisRecord(row: StoredAnalysis): AnalysisRecord {
  return {
    id: row.id,
    ts: new Date(row.createdAt).getTime(),
    question: row.query,
    locale: row.locale === "fa" ? "fa" : "en",
    domains: row.domains.map((id) => ({ id: id as BrainDomainId, score: 1 })),
    libraries: row.knowledge,
    caseMatches: row.cases,
    vendors: row.vendors,
    mode: row.mode as ReasoningMode,
    safety: "general",
    confidence: row.confidence,
    evidenceScore: row.confidence,
    unknown: row.isUnknown,
  };
}

function recentLibrariesOf(records: AnalysisRecord[]): string[] {
  const recentLibraries: string[] = [];
  for (const r of records) {
    for (const lib of r.libraries) {
      if (!recentLibraries.includes(lib)) recentLibraries.push(lib);
    }
  }
  return recentLibraries;
}

/**
 * Memory inspection on the SAME route (no new routes per Step 6 rules):
 * GET /api/brain returns recent analysis records and aggregate stats.
 *
 * Phase 11B-B: in database mode this reads the durable history written by
 * POST (analysisRepository) instead of the in-process ring buffer, so
 * "recent"/"stats" survive a server restart. Any repository failure falls
 * back to the session-memory path below — never a hard error.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const n = Math.min(Number(url.searchParams.get("n") ?? 20) || 20, 50);

  if (isDatabaseMode()) {
    try {
      const rows = await analysisRepository().list();
      const all = rows.map(rowToAnalysisRecord);
      const recent = all.slice(0, n);
      return NextResponse.json(
        {
          recent,
          recentLibraries: recentLibrariesOf(recent),
          stats: computeMemoryStats(all),
          caseDatabase: { cases: CASES.length },
          storageMode: "database",
          note: "Database mode: history is durable in PostgreSQL (AnalysisRecord) and survives restarts.",
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      /* fall through to the session-memory path below */
    }
  }

  const recent = analysisMemory.recent(n);
  return NextResponse.json(
    {
      recent,
      recentLibraries: recentLibrariesOf(recent),
      stats: analysisMemory.stats(),
      caseDatabase: { cases: CASES.length },
      storageMode: "session",
      note: "Session mode: history is process-lifetime only (in-memory) — set DATABASE_URL to persist it across restarts.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
