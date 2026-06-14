import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/industrial/pipeline";
import { runReasoning, summarizeEvidence } from "@/lib/industrial/reasoning";
import { computeConfidence, vendorCertainty } from "@/lib/industrial/confidence";
import { CASES } from "@/lib/industrial/cases";
import { analysisMemory } from "@/lib/industrial/memory";
import { completeTask, gatewayAvailable } from "@/lib/llm/gateway";
import { buildPrompt, taskForDomain } from "@/lib/llm/prompts";
import { screenQuestion } from "@/lib/llm/guardrails";
import type { BrainAnalysis } from "@/lib/services/types";
import type { Citation } from "@/lib/services/rag-types";
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

  const pipe = runPipeline(question, locale);
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
      unknown: true,
    });
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

  return NextResponse.json(analysis, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Memory inspection on the SAME route (no new routes per Step 6 rules):
 * GET /api/brain returns recent analysis records and aggregate stats.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const n = Math.min(Number(url.searchParams.get("n") ?? 20) || 20, 50);
  const recent = analysisMemory.recent(n);
  const recentLibraries: string[] = [];
  for (const r of recent) {
    for (const lib of r.libraries) {
      if (!recentLibraries.includes(lib)) recentLibraries.push(lib);
    }
  }
  return NextResponse.json(
    {
      recent,
      recentLibraries,
      stats: analysisMemory.stats(),
      caseDatabase: { cases: CASES.length },
      note: "V1 memory is process-lifetime (no database permitted yet); MemoryStore is the Phase 2 Postgres seam.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
