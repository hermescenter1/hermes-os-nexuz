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
