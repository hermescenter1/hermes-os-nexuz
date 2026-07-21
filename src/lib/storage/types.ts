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
  /** PHASE 90 — tenant ownership; null on legacy pre-phase rows. Derived from
   *  the authenticated server context, never from client input. */
  userId?: string | null;
  organizationId?: string | null;
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
  /**
   * PHASE 90 — tenant ownership. Null on rows written before this phase
   * (the legacy shared pool). Never accepted from client input: both values
   * are derived from the authenticated server-side context at write time.
   */
  userId?: string | null;
  organizationId?: string | null;
}

/**
 * PHASE 90 — the trusted server-side owner of a Brain resource.
 *
 * Always built from the authenticated session (never from a request body or
 * query string). `orgId` is null for users with no organization membership;
 * such a user is scoped to their own `userId` alone.
 */
export interface BrainOwner {
  userId: string;
  orgId: string | null;
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

// ---- Phase 19A: Project Intelligence ----

export type ProjectStatus = "active" | "archived" | "completed";

export interface StoredProject {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

// ---- Phase 18A/18C: Engineering Memory ----

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
  /** Phase 19A: optional project association; undefined = no project context. */
  projectId?: string;
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

/** A memory record with its full feedback history loaded.
 *  Defined here (not in memory-service.ts) so memory-learning.ts and
 *  memory-retrieval.ts can both import it without circular dependencies. */
export type MemoryWithFeedback = StoredMemory & {
  feedback: StoredMemoryFeedback[];
};

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
