/**
 * Storage repository types (Phase 11A).
 *
 * Plain TS shapes mirroring the Prisma models, used by both the session and
 * database repository implementations so callers are storage-agnostic. These
 * intentionally do NOT import Prisma types — the session path must compile
 * with no generated client.
 */

export type CaseStatus = "draft" | "ready" | "published";
export type ArticleStatus = "draft" | "review" | "published";
export type UnknownStatus = "open" | "resolved" | "converted" | "library";

export interface StoredCase {
  id: string;
  title: string;
  vendor: string;
  domain: string;
  problem: string;
  rootCause: string;
  secondaryCauses: string[];
  verificationSteps: string[];
  correctiveActions: string[];
  safetyNotes: string;
  tags: string[];
  confidence: number;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoredArticle {
  id: string;
  title: string;
  domain: string;
  vendor?: string;
  summary: string;
  content: string;
  failureModes: string[];
  diagnosticGuidance: string[];
  verificationSteps: string[];
  correctiveActions: string[];
  safetyNotes: string;
  tags: string[];
  confidence: number;
  status: ArticleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAnalysis {
  id: string;
  query: string;
  locale: string;
  mode: string;
  domains: string[];
  vendors: string[];
  cases: string[];
  knowledge: string[];
  confidence: number;
  riskLevel: string;
  isUnknown: boolean;
  createdAt: string;
}

export interface StoredUnknown {
  id: string;
  query: string;
  locale: string;
  confidence: number;
  suggestedDomains: string[];
  suggestedVendors: string[];
  status: UnknownStatus;
  createdAt: string;
  updatedAt: string;
}

// ---- Phase 18A: Engineering Memory ----

export type MemoryOutcome = "unknown" | "success" | "partial" | "failed";

export interface StoredMemory {
  id: string;
  query: string;
  domain: string;
  analysisSummary: string;
  confidence: number;
  relatedCaseIds: string[];
  relatedDocumentIds: string[];
  outcome: MemoryOutcome;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMemoryFeedback {
  id: string;
  memoryId: string;
  outcome: MemoryOutcome;
  notes?: string;
  submittedBy?: string;
  createdAt: string;
}

/** Common repository contract — full CRUD, storage-agnostic. */
export interface Repository<T, TCreate> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(input: TCreate): Promise<T>;
  update(id: string, patch: Partial<TCreate>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  /** Phase 11B: find by exact title for duplicate prevention. */
  findByTitle?(title: string): Promise<T | null>;
}
