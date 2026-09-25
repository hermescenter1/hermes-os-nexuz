/**
 * PHASE 112 — The deterministic Industrial Brain, registered as a replay-capable
 * reasoning engine.
 *
 * Wraps `analyzeIndustrialFault` (a pure, DB/provider/LLM-free rule engine) and
 * gives it a STABLE registered identity + exact version. The analyzer's own
 * `engineVersion` string literal and its nondeterministic `processingMs` are NOT
 * used as the engine identity or in the semantic digest:
 *   - engine identity/version come from the constants below (bump ENGINE_VERSION
 *     when the analyzer's semantics change; an unregistered version fails closed
 *     as ENGINE_VERSION_UNAVAILABLE on execution replay);
 *   - the SEMANTIC output excludes `processingMs` (documented projection), so an
 *     execution replay never mismatches on wall-clock time.
 */
import { analyzeIndustrialFault } from "@/lib/industrial-brain/analyzer";
import type { IndustrialBrainAnalysis, IndustrialFaultInput } from "@/lib/industrial-brain/types";
import { AnalyzeRequestSchema } from "@/lib/industrial-brain/request-contract";
import { REASONING_RUN_SCHEMA_VERSION } from "./types";
import type { EngineManifest, EngineOutput, ReasoningEngine } from "./types";

/** Stable registered identity. */
export const INDUSTRIAL_BRAIN_ENGINE_ID = "hermes-industrial-brain";
/** Exact registered version — bump on any analyzer semantic change. */
export const INDUSTRIAL_BRAIN_ENGINE_VERSION = "1.0.0";
/** The analyzer's rule set identity. */
export const INDUSTRIAL_BRAIN_RULE_PACK_VERSION = "industrial-brain-rules/1.0.0";

/** Drop keys whose value is `undefined` so the result is canonicalizable. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * The semantic projection: everything the analysis means, built by ALLOWLIST so
 * exactly which fields enter the semantic digest is explicit. It omits the only
 * non-semantic runtime field (`processingMs`, wall-clock elapsed time).
 * `engineVersion` is a constant literal in the analyzer output and deterministic,
 * so it is kept.
 */
export type SemanticAnalysis = Omit<IndustrialBrainAnalysis, "processingMs">;

export function semanticProjection(analysis: IndustrialBrainAnalysis): SemanticAnalysis {
  return {
    summary: analysis.summary,
    summaryFa: analysis.summaryFa,
    classification: analysis.classification,
    alarms: analysis.alarms,
    signalMatrix: analysis.signalMatrix,
    reasoningMap: analysis.reasoningMap,
    uncertainty: analysis.uncertainty,
    risk: analysis.risk,
    likelyCauses: analysis.likelyCauses,
    evidenceGaps: analysis.evidenceGaps,
    inspectionChecklist: analysis.inspectionChecklist,
    recommendedActions: analysis.recommendedActions,
    relatedKnowledge: analysis.relatedKnowledge,
    confidence: analysis.confidence,
    engineVersion: analysis.engineVersion,
  };
}

export class IndustrialBrainEngine implements ReasoningEngine {
  readonly engineId = INDUSTRIAL_BRAIN_ENGINE_ID;
  readonly engineVersion = INDUSTRIAL_BRAIN_ENGINE_VERSION;

  manifest(): EngineManifest {
    return {
      engineId: this.engineId,
      engineVersion: this.engineVersion,
      rulePackVersion: INDUSTRIAL_BRAIN_RULE_PACK_VERSION,
      // The deterministic analyzer consults no case corpus, graph, document
      // corpus, model or provider — these are explicitly not-applicable (null),
      // never defaulted to a misleading "latest"/"current"/"unknown".
      caseCorpusVersion: null,
      caseCorpusChecksum: null,
      graphRevision: null,
      graphChecksum: null,
      documentCorpusChecksum: null,
      modelProvider: null,
      modelVersion: null,
      modelConfigVersion: null,
      schemaVersion: REASONING_RUN_SCHEMA_VERSION,
    };
  }

  /**
   * Normalize validated raw input into the frozen, canonicalizable input.
   * Re-parses with the ONE canonical request contract so normalization is
   * deterministic and independent of how the raw body was shaped.
   */
  normalize(rawInput: unknown): unknown {
    const parsed = AnalyzeRequestSchema.parse(rawInput);
    return stripUndefined(parsed as Record<string, unknown>);
  }

  /** Deterministically execute over a normalized input. No side effects. */
  execute(normalizedInput: unknown): EngineOutput {
    const analysis = analyzeIndustrialFault(normalizedInput as IndustrialFaultInput);
    return {
      semanticOutput: semanticProjection(analysis),
      rawOutput: analysis,
      evidence: {
        signalMatrix: analysis.signalMatrix,
        alarms: analysis.alarms,
        evidenceNodes: analysis.reasoningMap.evidenceNodes,
      },
      reasoningMap: analysis.reasoningMap,
      uncertainty: analysis.uncertainty,
      safeAction: {
        recommendedActions: analysis.recommendedActions,
        inspectionChecklist: analysis.inspectionChecklist,
        risk: analysis.risk,
      },
    };
  }
}
