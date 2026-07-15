/**
 * Phase 86C4B2B1D-SECURITY-6 — Public Copilot demo endpoint.
 *
 * The public /{locale}/copilot, /brain and /library pages must keep working
 * anonymously, but the real Brain (/api/brain) is now authenticated because it
 * reads the global analysis history and can trigger LLM/RAG execution and
 * database/memory writes. This endpoint serves the SAME response shapes those
 * pages consume, using ONLY the deterministic, in-process reasoning core:
 *
 *   - POST runs the pure pipeline (domain/vendor detection → deterministic
 *     reasoning → keyword retrieval → confidence) on the caller's OWN
 *     question and returns a `BrainAnalysis` marked `demo: true`. It never
 *     reads the LLM/RAG/memory feature flags, never calls a provider, never
 *     touches Prisma, the analysis repository, the unknown repository, the
 *     in-process analysis-memory ring, or the engineering-memory service — so
 *     it performs no external inference and writes nothing.
 *   - GET returns deterministic, empty demo statistics (no history) in the
 *     `{ recent, recentLibraries, stats, caseDatabase, storageMode }` shape,
 *     so no other user's questions are ever exposed.
 *
 * All imported helpers (runPipeline, runReasoning, runRetrieval,
 * computeConfidence, summarizeEvidence, screenQuestion, computeMemoryStats)
 * are pure and have no database/LLM dependencies. Responses are no-store and
 * carry no user/tenant/secret fields.
 */
import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/industrial/pipeline";
import { runReasoning, summarizeEvidence } from "@/lib/industrial/reasoning";
import { computeConfidence, vendorCertainty } from "@/lib/industrial/confidence";
import { runRetrieval } from "@/lib/retrieval/retrieval-engine";
import { screenQuestion } from "@/lib/llm/guardrails";
import { CASES } from "@/lib/industrial/cases";
import { computeMemoryStats } from "@/lib/industrial/memory";
import type { BrainAnalysis } from "@/lib/services/types";
import type { Citation } from "@/lib/services/rag-types";
import en from "../../../../../messages/en.json";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

const MAX_QUESTION = 2000;
const MIN_QUESTION = 8;

type KnowledgeNs = Record<
  string,
  { name: string; summary: string; p1: string; p2: string; p3: string; c1: string; c2: string }
>;

function normalizeForScreen(q: string): string {
  return q.toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, "");
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
 * GET /api/copilot/demo — deterministic, history-free demo statistics.
 * Anonymous-safe: no database, no analysis history, no cross-user data.
 */
export function GET(): NextResponse {
  return NextResponse.json(
    {
      recent: [],
      recentLibraries: [],
      stats: computeMemoryStats([]),
      caseDatabase: { cases: CASES.length },
      storageMode: "demo",
      demo: true,
      note: "Demo mode: deterministic local analysis only — no history, no database, no external model.",
    },
    { headers: NO_STORE },
  );
}

/**
 * POST /api/copilot/demo — deterministic analysis of the caller's question.
 * Anonymous-safe: no LLM/RAG, no persistence, no memory writes.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let body: { question?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  const question = (body.question ?? "").trim().slice(0, MAX_QUESTION);
  const locale = body.locale === "fa" ? "fa" : "en";
  if (question.length < MIN_QUESTION) {
    return NextResponse.json({ error: "question too short" }, { status: 400, headers: NO_STORE });
  }

  // Deterministic pipeline only — no corpus (no database), no LLM/RAG/memory.
  const pipe = runPipeline(question, locale);
  const guardrail = screenQuestion(normalizeForScreen(question));

  if (pipe.unknown) {
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
    return NextResponse.json({ ...analysis, demo: true }, { headers: NO_STORE });
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
    locale,
  );

  const analysis: BrainAnalysis = {
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
    }),
  };

  return NextResponse.json({ ...analysis, demo: true }, { headers: NO_STORE });
}
