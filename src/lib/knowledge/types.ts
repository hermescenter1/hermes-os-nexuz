import type { BrainDomainId } from "@/lib/services/types";

/**
 * Knowledge Studio types (Phase 9E — interfaces only, Phase 2 preparation).
 *
 * These describe the shape of an authored knowledge article so a future
 * persistence layer (Phase 2 Postgres / library ingestion) has a stable
 * contract to target. V1 holds instances of KnowledgeArticle in session
 * React state ONLY — there is no database, no file write, no backend.
 */

export type KnowledgeStatus = "draft" | "review" | "published";

/** Domains the Studio can author for — a curated subset of BrainDomainId. */
export type KnowledgeDomain = Extract<
  BrainDomainId,
  | "plc"
  | "scada"
  | "otNetwork"
  | "drives"
  | "motors"
  | "electrical"
  | "sensors"
  | "cybersecurity"
  | "maintenance"
>;

export const KNOWLEDGE_DOMAINS: KnowledgeDomain[] = [
  "plc",
  "scada",
  "otNetwork",
  "drives",
  "motors",
  "electrical",
  "sensors",
  "cybersecurity",
  "maintenance",
];

export interface KnowledgeArticle {
  id: string;
  title: string;
  domain: KnowledgeDomain | "";
  /** optional vendor id (VendorId), empty when vendor-agnostic */
  vendor: string;
  summary: string;
  /** main engineering content body */
  content: string;
  failureModes: string;
  diagnostics: string;
  verification: string;
  corrective: string;
  safety: string;
  tags: string;
  /** authoring confidence, 0..100 */
  confidence: number;
  status: KnowledgeStatus;
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 40 — Industrial Knowledge Engine types
// Additive to Phase 9E above; no existing exports changed.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Confidence display mapping for knowledge engine outputs.
 * confidenceWeight (0.0–1.0 internal float on IndustrialRootCause) → LOW/MEDIUM/HIGH.
 *   0.00–0.39 → LOW
 *   0.40–0.74 → MEDIUM
 *   0.75–1.00 → HIGH
 */
export type KnowledgeConfidence = "LOW" | "MEDIUM" | "HIGH";

export const CONFIDENCE_LOW_MAX    = 0.39;
export const CONFIDENCE_MEDIUM_MAX = 0.74;

export function confidenceFromWeight(w: number): KnowledgeConfidence {
  if (w <= CONFIDENCE_LOW_MAX)    return "LOW";
  if (w <= CONFIDENCE_MEDIUM_MAX) return "MEDIUM";
  return "HIGH";
}

// ── Search weight constants (named, documented) ───────────────────────────────
// Title-level matches score highest; content-level matches score lowest.
// Tie-breaker (applied after score): updatedAt DESC, then id ASC.

export const SEARCH_WEIGHT_TITLE_EXACT   = 100;
export const SEARCH_WEIGHT_TITLE_STARTS  = 80;
export const SEARCH_WEIGHT_TITLE_PARTIAL = 60;
export const SEARCH_WEIGHT_TOKEN_TITLE   = 40;
export const SEARCH_WEIGHT_FAILURE_MODE  = 35;
export const SEARCH_WEIGHT_CATEGORY      = 25;
export const SEARCH_WEIGHT_KEYWORD       = 15;
export const SEARCH_WEIGHT_CONTENT       = 10;
export const SEARCH_WEIGHT_RECENT_BONUS  = 5;
export const SEARCH_RECENT_DAYS          = 30;

// ── Root cause scoring bonuses ────────────────────────────────────────────────

export const RC_BONUS_DECLINING_HEALTH  = 0.20;
export const RC_BONUS_HIGH_ALARMS       = 0.15;
export const RC_BONUS_FAILURE_INDICATOR = 0.10;
export const RC_BONUS_ASSET_TYPE_MATCH  = 0.10;

// ── Procedure recommendation scoring ─────────────────────────────────────────

export const PROC_SCORE_FAILURE_MATCH    = 30;
export const PROC_SCORE_HIGH_PROBABILITY = 25;
export const PROC_SCORE_HIGH_PRIORITY_PM = 20;
export const PROC_SCORE_CATEGORY_MATCH   = 15;
export const PROC_SCORE_ASSET_TYPE_MATCH = 10;

export const KNOWLEDGE_ENGINE_VERSION = "ke_v1";

// ── Source / severity enums ───────────────────────────────────────────────────

export type KnowledgeSourceType =
  | "MANUAL"
  | "ENGINEERING_STANDARD"
  | "MAINTENANCE_HISTORY"
  | "FAILURE_ANALYSIS"
  | "VENDOR_DOCUMENTATION"
  | "INTERNAL_CASE";

export type FailureSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ── DB record shapes ──────────────────────────────────────────────────────────

export interface CategoryRecord {
  id:             string;
  organizationId: string;
  name:           string;
  description:    string | null;
  parentId:       string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface ArticleRecord {
  id:             string;
  organizationId: string;
  categoryId:     string | null;
  title:          string;
  titleNorm:      string;
  summary:        string;
  content:        string;
  keywords:       string[];
  sourceType:     KnowledgeSourceType;
  version:        number;
  status:         string;
  authorId:       string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface FailureModeRecord {
  id:             string;
  organizationId: string;
  categoryId:     string | null;
  name:           string;
  nameNorm:       string;
  description:    string;
  severity:       FailureSeverity;
  symptoms:       string[];
  assetTypes:     string[];
  keywords:       string[];
  sourceType:     KnowledgeSourceType;
  createdAt:      string;
  updatedAt:      string;
}

export interface RootCauseRecord {
  id:                 string;
  organizationId:     string;
  failureModeId:      string;
  description:        string;
  confidenceWeight:   number;
  confidence:         KnowledgeConfidence;
  supportingEvidence: string[];
  sourceType:         KnowledgeSourceType;
  createdAt:          string;
  updatedAt:          string;
}

export interface ProcedureStep {
  order:       number;
  description: string;
  safetyNote?: string;
}

export interface ProcedureRecord {
  id:             string;
  organizationId: string;
  categoryId:     string | null;
  title:          string;
  titleNorm:      string;
  description:    string;
  steps:          ProcedureStep[];
  assetTypes:     string[];
  estimatedHours: number | null;
  requiredRoles:  string[];
  safetyNotes:    string | null;
  sourceType:     KnowledgeSourceType;
  version:        number;
  status:         string;
  approvedById:   string | null;
  approvedAt:     string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface CaseRecord {
  id:             string;
  organizationId: string;
  title:          string;
  titleNorm:      string;
  symptoms:       string[];
  diagnosis:      string | null;
  resolution:     string | null;
  lessonsLearned: string | null;
  assetTypes:     string[];
  assetId:        string | null;
  siteId:         string | null;
  failureModeId:  string | null;
  keywords:       string[];
  status:         string;
  severity:       FailureSeverity;
  reportedById:   string | null;
  resolvedAt:     string | null;
  createdAt:      string;
  updatedAt:      string;
}

export interface AssetKnowledgeLinkRecord {
  id:             string;
  organizationId: string;
  assetId:        string;
  articleId:      string | null;
  failureModeId:  string | null;
  procedureId:    string | null;
  caseId:         string | null;
  notes:          string | null;
  createdAt:      string;
}

export type KnowledgeItemType = "article" | "failureMode" | "procedure" | "case";

export interface KnowledgeSearchResult {
  type:        KnowledgeItemType;
  id:          string;
  title:       string;
  summary:     string;
  score:       number;
  matchReason: string[];
  updatedAt:   string;
}

export interface KnowledgeEvidence {
  type:        "article" | "failureMode" | "procedure" | "case" | "predictive" | "telemetry" | "asset";
  recordId?:   string;
  assetId?:    string;
  description: string;
  sourceType?: KnowledgeSourceType;
}

export interface FailureKnowledgeResult {
  assetId:         string;
  failureModes:    FailureModeRecord[];
  rootCauses:      RootCauseRecord[];
  procedures:      ProcedureRecord[];
  relatedCases:    CaseRecord[];
  evidence:        KnowledgeEvidence[];
}

export interface RootCauseCandidate {
  rootCause:      RootCauseRecord;
  failureMode:    FailureModeRecord;
  candidateScore: number;
  confidence:     KnowledgeConfidence;
  scoringFactors: string[];
  evidence:       KnowledgeEvidence[];
}

export interface ProcedureRecommendation {
  procedure:  ProcedureRecord;
  score:      number;
  reason:     string[];
  confidence: KnowledgeConfidence;
  evidence:   KnowledgeEvidence[];
}

export interface KnowledgeContext {
  assetId:              string;
  relatedArticles:      Pick<ArticleRecord, "id" | "title" | "summary" | "status">[];
  relatedProcedures:    Pick<ProcedureRecord, "id" | "title" | "status" | "version">[];
  relatedFailureModes:  Pick<FailureModeRecord, "id" | "name" | "severity">[];
  openCases:            Pick<CaseRecord, "id" | "title" | "status" | "severity">[];
  linkedCount:          number;
}
