import { NextResponse } from "next/server";
import { requireAuthoring } from "@/lib/auth/api-guards";
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
import { aiRouter } from "@/lib/ai/router";
import { isAIRouterEnabled, getAIProviderMode } from "@/lib/ai/config";
import { withTimeout } from "@/lib/ai/providers/shared";
import { runRagPipeline } from "@/lib/rag/rag-pipeline";
import { isRagBrainEnabled, getRagMode, isDocumentRagEnabled, isMemoryBrainEnabled, isAutoMemoryEnabled, getAutoMemoryMinConfidence, isProjectIntelligenceEnabled } from "@/lib/rag/config";
import { searchDocuments } from "@/lib/documents/search";
import { getSimilarMemories, createEngineeringMemory, listEngineeringMemories } from "@/lib/memory/memory-service";
import { getProject } from "@/lib/memory/project-service";
import type {
  AIEnhancement,
  BrainAnalysis,
  BrainDomainId,
  ReasoningMode,
  RagEvidence,
  DocumentRagEvidence,
  MemoryEvidence,
  ProjectContext,
  SafetyKind,
} from "@/lib/services/types";
import type { PipelineResult } from "@/lib/industrial/pipeline";
import type { ReasoningResult } from "@/lib/industrial/reasoning";
import type { CaseMatch } from "@/lib/industrial/cases";
import type { RetrievalResult, ScoredKnowledge } from "@/lib/retrieval/retrieval-types";
import type { RagDocument } from "@/lib/rag/types";
import type { Citation } from "@/lib/services/rag-types";
import type { StoredAnalysis } from "@/lib/storage/types";
import en from "../../../../messages/en.json";

export const dynamic = "force-dynamic";

/**
 * Phase 86C4B2B1D-SECURITY-6 (+ amendment): /api/brain is the PRIVATE
 * engineering Brain.
 *
 * GET returns the GLOBAL analysis history — the AnalysisRecord model carries
 * NO ownership field (no userId/organizationId/tenantId/siteId/projectId), so
 * `analysisRepository.list()` cannot be filtered to the caller's scope without
 * a Prisma migration (out of scope). The records include raw user questions,
 * which are cross-user in database mode. POST executes the reasoning pipeline,
 * may invoke the LLM/RAG layers, and persists analysis history + Unknown
 * triage. Because the history is unscoped and the pipeline is a real
 * (potentially paid) execution, both methods are restricted to the existing
 * "authoring" capability (superadmin/admin/engineer) — the narrowest
 * established engineering capability, matching /api/analysis and the
 * SECURITY-5 brain APIs. This is Option C (engineering/authoring) of the
 * amendment; user/organization scoping (Options A/B) is impossible on the
 * current schema.
 *
 * requireAuthoring authenticates AND authorizes as the FIRST operation —
 * before any body parse, repository read, pipeline execution, LLM/RAG call, or
 * database/memory write. Anonymous -> 401, non-authoring -> 403. Broad-role
 * dashboard consumers (customer/vendor via /dashboard/copilot and the
 * executive overview) read the synthetic /api/copilot/demo instead, so real
 * cross-user history is never exposed to them. The public /copilot, /brain and
 * /library pages already use /api/copilot/demo.
 *
 * CSRF: session cookies are SameSite=strict (the sole cross-site write
 * mitigation — the project has no Origin-validation guard to reuse), so a
 * cross-site cookie-bearing POST is blocked at the cookie layer. This is not
 * presented as complete CSRF coverage; see the phase report's residual risk.
 */
function denyNoStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

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

const AI_ROUTER_TIMEOUT_MS = 15_000;

/**
 * Phase 13 — AI Provider Router enhancement layer.
 *
 * Builds the router's input from the deterministic analysis ALREADY
 * produced (question, locale, domains, vendors, safety classification,
 * deterministic root cause/probable causes/recommended actions, and the
 * retrieval evidence) and asks the router to enhance it. This function is
 * the only place that may call `aiRouter.ask()` from this route, and it
 * never throws and never returns provider error text:
 *   - the router's own adapters already never throw and always degrade to
 *     a clean mock on a missing key/SDK/timeout/provider error (Phase 12-B)
 *   - `withTimeout` is a second, outer safety net in case of an unforeseen
 *     hang anywhere in that chain
 *   - the try/catch below is a third backstop in case of an unforeseen
 *     exception (e.g. a future bug) — on any of these, the deterministic
 *     Brain response is returned exactly as if the flag were off.
 */
async function buildAIEnhancement(
  question: string,
  locale: "fa" | "en",
  pipe: PipelineResult,
  reasoning: ReasoningResult,
  retrieval: RetrievalResult | undefined,
  safety: SafetyKind
): Promise<AIEnhancement | null> {
  const mode = getAIProviderMode();
  try {
    const context = [
      `Domains: ${pipe.domains.map((d) => d.id).join(", ") || "none"}`,
      `Vendors: ${pipe.vendors.join(", ") || "none"}`,
      `Safety classification: ${safety}`,
      `Risk level: ${reasoning.riskLevel}`,
      `Deterministic root cause: ${pipe.rootCause?.primary ?? reasoning.probableCauses[0] ?? "unknown"}`,
      `Probable causes: ${reasoning.probableCauses.join(" | ") || "none"}`,
      `Recommended actions: ${reasoning.recommendedActions.join(" | ") || "none"}`,
      `Retrieval — top cases: ${
        retrieval?.topCases.map((c) => `${c.id} (score ${c.score})`).join(", ") || "none"
      }`,
      `Retrieval — top knowledge: ${
        retrieval?.topKnowledge.map((k) => `${k.id} (score ${k.score})`).join(", ") || "none"
      }`,
    ].join("\n");

    const outcome = await withTimeout(
      aiRouter.ask({ task: "engineeringReasoning", prompt: question, context, locale }),
      AI_ROUTER_TIMEOUT_MS
    );
    if (!outcome.ok) {
      // Outer timeout tripped — the router's own adapters already cap at
      // 20s and never throw, so this only fires on an unforeseen hang.
      return { enabled: true, provider: "none", mode, content: "", fallbackUsed: true };
    }

    const res = outcome.value;
    return {
      enabled: true,
      provider: res.provider,
      mode,
      // `content` is always either a real completion or the adapters' own
      // clean "[mock:<provider>] ..." text — never a raw error/stack trace
      // (see providers/openai.ts and providers/claude.ts's mockResponse()).
      content: res.content,
      fallbackUsed: Boolean(res.metadata.mock),
    };
  } catch {
    // Never let an AI Router failure affect the deterministic response.
    return { enabled: true, provider: "none", mode, content: "", fallbackUsed: true };
  }
}

/**
 * Phase 15 — RAG evidence layer.
 *
 * Builds RAG's input documents FROM the existing (already-computed, already
 * vetted) evidence — the pipeline's matched engineering cases and the
 * keyword retrieval's top-scored knowledge libraries — rather than
 * searching some separate, independent corpus. This keeps the call bounded
 * (at most a handful of documents, since both sources are already capped
 * to their own top-3) and means RAG is genuinely "an additional evidence
 * layer" on top of "existing retrieval", per the requirement, not a
 * parallel, ungrounded search.
 *
 * Case text is locale-aware (`c.en`/`c.fa`, both already on every
 * EngineeringCase). Knowledge text reuses the same English message-catalog
 * lookup (`kn[id]`) the legacy LLM gateway above already uses to ground its
 * prompts — English-only by design, matching that established convention,
 * not a Phase 15 regression.
 */
function buildRagDocuments(
  locale: "fa" | "en",
  caseMatches: CaseMatch[],
  topKnowledge: ScoredKnowledge[]
): RagDocument[] {
  const kn = (en as { knowledge: KnowledgeNs }).knowledge;

  const caseDocs: RagDocument[] = caseMatches.map(({ case: c }) => {
    const content = locale === "fa" ? c.fa : c.en;
    return {
      id: c.id,
      sourceType: "case",
      text: [content.symptoms, content.rootCause, content.resolution].join(". "),
      metadata: { vendor: c.vendor, domain: c.category },
    };
  });

  const knowledgeDocs: RagDocument[] = topKnowledge
    .map((k): RagDocument | null => {
      const lib = kn[k.id];
      if (!lib) return null;
      return {
        id: k.id,
        sourceType: "knowledge",
        text: [lib.name, lib.summary, lib.p1, lib.p2, lib.p3].join(". "),
        metadata: { domain: k.domain, vendor: k.vendor },
      };
    })
    .filter((d): d is RagDocument => d !== null);

  return [...caseDocs, ...knowledgeDocs];
}

/**
 * Calls `runRagPipeline()` and maps its result onto `RagEvidence`. Never
 * throws and never returns raw provider/vector-store error text:
 *   - `runRagPipeline()` itself already never throws and only ever
 *     surfaces the safe, enumerated `reason: "pipeline_error"` (Phase
 *     14A/B/C) — never a raw SDK/SQL error message
 *   - the try/catch below is a second backstop in case of an unforeseen
 *     exception (e.g. a future bug) — on any failure, the deterministic
 *     Brain response is returned exactly as if the flag were off, with
 *     `ragEvidence` reporting a safe, generic fallback instead.
 */
async function buildRagEvidence(
  question: string,
  locale: "fa" | "en",
  caseMatches: CaseMatch[],
  topKnowledge: ScoredKnowledge[]
): Promise<RagEvidence> {
  const mode = getRagMode();
  try {
    const documents = buildRagDocuments(locale, caseMatches, topKnowledge);
    const result = await runRagPipeline({
      documents,
      query: { text: question, topK: 5 },
    });
    return {
      enabled: result.enabled,
      mode: result.mode,
      results: result.results,
      // "fallback" here means the RAG layer itself was effectively
      // inactive for this call (disabled internally, or errored) — NOT
      // "ran fine but found nothing", which is just an empty `results`.
      fallbackUsed: !result.enabled || Boolean(result.reason),
      ...(result.reason ? { error: result.reason } : {}),
    };
  } catch {
    return { enabled: true, mode, results: [], fallbackUsed: true, error: "rag_pipeline_error" };
  }
}

/**
 * Phase 18D — Engineering Memory evidence layer.
 *
 * Queries the EngineeringMemory store with the same user question and surfaces
 * the top learning-adjusted matches as an additional evidence layer.
 * Like all prior optional layers, this function:
 *   - never throws and never returns raw error/stack trace text
 *   - `getSimilarMemories()` already never throws (internal try/catch in
 *     searchEngineeringMemories) — the try/catch below is a second backstop
 *   - on any failure the deterministic Brain response is returned exactly
 *     as if the flag were off, with `memoryEvidence` reporting a safe fallback.
 *
 * `domain` is derived from `pipe.domains[0]?.id` — memories in the same domain
 * receive a 30-point scoring boost (Phase 18B WEIGHTS.DOMAIN), making domain-
 * specific past analyses rank higher than cross-domain ones.
 */
async function buildMemoryEvidence(
  question: string,
  domain?: string,
  projectId?: string
): Promise<MemoryEvidence> {
  try {
    const matches = await getSimilarMemories(question, domain, 5, projectId);
    return { enabled: true, matches, fallbackUsed: false };
  } catch {
    return { enabled: true, matches: [], fallbackUsed: true, error: "memory_search_error" };
  }
}

/** Phase 18E — builds the analysisSummary string stored on the memory record.
 *  Caps causes and actions at 2 each to keep the summary concise. */
function buildMemorySummary(analysis: BrainAnalysis): string {
  const causes  = (analysis.probableCauses  ?? []).slice(0, 2);
  const actions = (analysis.recommendedActions ?? []).slice(0, 2);
  const parts: string[] = [];
  if (causes.length  > 0) parts.push(`Causes: ${causes.join("; ")}`);
  if (actions.length > 0) parts.push(`Actions: ${actions.join("; ")}`);
  if (analysis.riskLevel)  parts.push(`Risk: ${analysis.riskLevel}`);
  return parts.join(". ") || "Brain analysis completed.";
}

/**
 * Phase 18E — Automatic memory capture.
 *
 * Saves a completed Brain analysis as an EngineeringMemory record so future
 * queries can surface it via Phase 18D evidence retrieval (getSimilarMemories).
 *
 * Quality gates (all must pass before saving):
 *   - analysis has at least one detected domain (not unknown)
 *   - confidenceScore >= getAutoMemoryMinConfidence() (default 30)
 *   - exact query does not already exist in the memory store (dedup)
 *
 * Never throws from the caller's perspective: the POST handler wraps every
 * call in try/catch. Any uncaught throw propagates there and is swallowed,
 * leaving the Brain response completely unaffected (triple isolation: memory
 * service's own try/catch → listEngineeringMemories try/catch below →
 * POST handler's outer try/catch).
 */
async function autoSaveMemory(
  question: string,
  analysis: BrainAnalysis,
  projectId?: string
): Promise<void> {
  // Quality gate: unknown path already returns early above, but be defensive.
  if (analysis.unknown || analysis.domains.length === 0) return;

  const confidenceScore =
    analysis.confidenceReport?.score ?? Math.round(analysis.confidence * 100);
  if (confidenceScore < getAutoMemoryMinConfidence()) return;

  // Duplicate prevention: skip if the exact query is already stored.
  // If the list call itself fails, skip the save conservatively.
  let existing: { query: string }[] = [];
  try {
    existing = await listEngineeringMemories(0); // 0 = no limit, returns all
  } catch {
    return;
  }
  if (existing.some((m) => m.query === question)) return;

  // May throw — caught by the outer try/catch in the POST handler.
  await createEngineeringMemory({
    query: question,
    domain: analysis.domains[0].id,
    analysisSummary: buildMemorySummary(analysis),
    confidence: confidenceScore,
    relatedCaseIds: analysis.evidence?.caseMatches ?? [],
    relatedDocumentIds: [],
    outcome: "unknown",
    // Phase 19B: tag auto-captured memory with the project context from the
    // Brain request so future retrieval can apply the project-boost ranking.
    ...(projectId ? { projectId } : {}),
  });
}

/**
 * Phase 19C — Project reasoning context.
 *
 * Loads project metadata for the given projectId and counts how many
 * EngineeringMemory records are tagged with this project. Returns null when:
 *   - getProject returns null (project not found or any store error)
 *   - any unexpected exception (caught; caller swallows it)
 *
 * The memory count uses listEngineeringMemories(0) which already has its own
 * internal try/catch in the service layer. An additional try/catch here keeps
 * the count best-effort without silently breaking the project metadata itself.
 */
async function buildProjectContext(projectId: string): Promise<ProjectContext | null> {
  const project = await getProject(projectId); // never throws
  if (!project) return null;

  let relatedMemoriesCount = 0;
  try {
    const all = await listEngineeringMemories(0);
    relatedMemoriesCount = all.filter((m) => m.projectId === projectId).length;
  } catch {
    /* count stays 0 on failure — the rest of the context is still useful */
  }

  return {
    projectId: project.id,
    projectName: project.name,
    description: project.description,
    status: project.status,
    relatedMemoriesCount,
  };
}

/**
 * Phase 17D — Document pipeline semantic search layer.
 *
 * Queries the document pipeline's vector index (`DocumentTextChunk.embedding`)
 * with the same user question and surfaces the top matching chunks as an
 * additional evidence layer. Like the Phase 15 RAG layer, this function:
 *   - never throws and never returns raw error/stack trace text
 *   - `searchDocuments()` already catches all failures and returns [] — the
 *     try/catch below is a second backstop for any unforeseen exception
 *   - on any failure the deterministic Brain response is returned exactly
 *     as if the flag were off, with `documentRagEvidence` reporting a safe
 *     fallback rather than a raw error.
 */
async function buildDocumentRagEvidence(question: string): Promise<DocumentRagEvidence> {
  try {
    const result = await searchDocuments(question, 5);
    return {
      enabled: true,
      matches: result.matches,
      fallbackUsed: false,
    };
  } catch {
    return { enabled: true, matches: [], fallbackUsed: true, error: "document_rag_error" };
  }
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
  // Authorize (authoring capability) BEFORE parsing the body or running any
  // pipeline / LLM / RAG / repository read / write.
  const gate = await requireAuthoring();
  if (!gate.ok) return denyNoStore(gate.response);

  let body: { question?: string; locale?: string; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const question = (body.question ?? "").trim().slice(0, 2000);
  const locale = body.locale === "fa" ? "fa" : "en";
  // Phase 19B: optional project context — no validation needed; an unknown
  // projectId simply matches no stored memory's projectId and produces zero
  // project-boost hits, so it degrades silently to pre-19B behavior.
  const projectId =
    typeof body.projectId === "string" ? body.projectId.trim() || undefined : undefined;
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

  // Phase 13: optional AI Provider Router enhancement layer. Off by default
  // (HERMES_AI_ROUTER_ENABLED unset/not "true") — when off, this block does
  // not run at all and `analysis` is untouched, so the response is
  // byte-for-byte identical to before Phase 13. Skipped on a guardrail hit
  // for the same reason the LLM gateway above is skipped: a flagged
  // question should not receive additional model-generated content. Every
  // field already on `analysis` is preserved unchanged — this only ever
  // ADDS the `aiEnhancement` field, never replaces anything.
  if (isAIRouterEnabled() && !guardrail) {
    try {
      const enhancement = await buildAIEnhancement(
        question,
        locale,
        pipe,
        reasoning,
        analysis.retrieval,
        analysis.safety
      );
      if (enhancement) {
        analysis = { ...analysis, aiEnhancement: enhancement };
      }
    } catch {
      /* never let the AI Router affect the deterministic response */
    }
  }

  // Phase 15: optional RAG evidence layer. Off by default
  // (HERMES_RAG_BRAIN_ENABLED unset/not "true") — when off, this block does
  // not run at all and `analysis` is untouched, so the response is
  // byte-for-byte identical to before Phase 15. Skipped on a guardrail hit
  // for the same reason the AI enhancement above is skipped. Runs AFTER
  // the deterministic pipeline, reasoning, and existing (keyword)
  // retrieval have all already completed — `analysis.retrieval` is read,
  // never recomputed or replaced. This only ever ADDS the `ragEvidence`
  // field; every field already on `analysis` (including `retrieval`
  // itself) is preserved unchanged.
  if (isRagBrainEnabled() && !guardrail) {
    try {
      const ragEvidence = await buildRagEvidence(
        question,
        locale,
        pipe.caseMatches,
        analysis.retrieval?.topKnowledge ?? []
      );
      analysis = { ...analysis, ragEvidence };
    } catch {
      /* never let the RAG layer affect the deterministic response */
    }
  }

  // Phase 17D: optional document pipeline semantic search layer. Off by default
  // (HERMES_DOCUMENT_RAG_ENABLED unset/not "true") — when off, this block does
  // not run at all and `analysis` is untouched, so the response is
  // byte-for-byte identical to before Phase 17D. Skipped on a guardrail hit.
  // Runs after the deterministic pipeline and both optional evidence layers
  // above — purely additive, never replaces any field already on `analysis`.
  if (isDocumentRagEnabled() && !guardrail) {
    try {
      const documentRagEvidence = await buildDocumentRagEvidence(question);
      analysis = { ...analysis, documentRagEvidence };
    } catch {
      /* never let document search affect the deterministic response */
    }
  }

  // Phase 18D: optional engineering-memory evidence layer. Off by default
  // (HERMES_MEMORY_RAG_ENABLED unset/not "true") — when off, this block does
  // not run at all and `analysis` is untouched, so the response is
  // byte-for-byte identical to before Phase 18D. Skipped on a guardrail hit.
  // Runs last — purely additive, never replaces any field already on `analysis`.
  // Domain hint from pipe.domains[0]?.id gives a 30-point boost to same-domain
  // memories (Phase 18B WEIGHTS.DOMAIN), making past analyses for the detected
  // domain surface higher than cross-domain ones.
  if (isMemoryBrainEnabled() && !guardrail) {
    try {
      const memoryEvidence = await buildMemoryEvidence(
        question,
        pipe.domains[0]?.id,
        projectId
      );
      analysis = { ...analysis, memoryEvidence };
    } catch {
      /* never let memory evidence affect the deterministic response */
    }
  }

  // Phase 18E: automatic memory capture. Off by default
  // (HERMES_AUTO_MEMORY_ENABLED unset/not "true") — when off, this block
  // does not run at all and the Brain response is byte-for-byte identical
  // to before Phase 18E. Skipped on guardrail hits — flagged questions must
  // not be memorialized. Unknown questions return early above and never reach
  // this point. Any capture failure is silently swallowed — the Brain
  // response is never affected by memory persistence outcomes.
  if (isAutoMemoryEnabled() && !guardrail) {
    try {
      await autoSaveMemory(question, analysis, projectId);
    } catch {
      /* auto-capture failure must never affect the Brain response */
    }
  }

  // Phase 19C: optional project reasoning context. Off by default
  // (HERMES_PROJECT_INTELLIGENCE_ENABLED unset/not "true") — when off, this
  // block does not run and the Brain response is byte-for-byte identical to
  // before Phase 19C. Skipped when no projectId was provided, on guardrail
  // hits, and when the project cannot be found. Any failure is swallowed —
  // a missing or broken project must never affect the Brain response.
  if (isProjectIntelligenceEnabled() && projectId && !guardrail) {
    try {
      const projectContext = await buildProjectContext(projectId);
      if (projectContext) {
        analysis = { ...analysis, projectContext };
      }
    } catch {
      /* project context failure must never affect the Brain response */
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
  // Authorize (authoring capability) BEFORE touching the analysis repository
  // or memory ring — the global, unscoped history is engineering-internal.
  const gate = await requireAuthoring();
  if (!gate.ok) return denyNoStore(gate.response);

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
