/**
 * Phase 97 — Processing Inventory (Article 30 RoPA) domain logic.
 *
 * Pure, deterministic, I/O-free helpers used by the compliance API routes and the
 * offline evaluation harness:
 *   - Zod validation of create/update input (organizationId is DELIBERATELY absent
 *     from every schema — the acting organization is always derived server-side;
 *     Zod strips any client-supplied organizationId so it can never widen scope);
 *   - normalisation to a fail-closed database write payload;
 *   - deterministic evidence-completeness classification that never invents a
 *     lawful basis, retention duration or approval, and reports incomplete/legal-
 *     review-required rather than "compliant".
 */

import { z } from "zod";
import {
  LEGAL_BASIS_CLASSIFICATIONS,
  PROCESSING_ACTIVITY_STATUSES,
  PROCESSING_APPROVAL_STATES,
  LEGAL_BASIS_STATUSES,
  RISK_CLASSIFICATIONS,
  type DbProcessingActivity,
} from "./types";

const MAX_LIST_ITEMS = 100;
const MAX_ITEM_LEN = 200;

const stringList = z
  .array(z.string().trim().min(1).max(MAX_ITEM_LEN))
  .max(MAX_LIST_ITEMS);

/**
 * Fields an authorised user may set. `organizationId`, `id`, timestamps and
 * `createdBy`/`updatedBy` are NOT accepted from the client — Zod's default strip
 * behaviour drops any such key silently, so a request body can never assign a
 * foreign tenant or forge audit attribution.
 */
const baseShape = {
  name:                  z.string().trim().min(1).max(200),
  purpose:               z.string().trim().min(1).max(2000),
  description:           z.string().trim().max(5000).optional(),
  legalBasis:            z.enum(LEGAL_BASIS_CLASSIFICATIONS).optional(),
  legalBasisStatus:      z.enum(LEGAL_BASIS_STATUSES as [string, ...string[]]).optional(),
  dataSubjectCategories: stringList.optional(),
  dataCategories:        stringList.optional(),
  recipients:            stringList.optional(),
  internalRecipients:    stringList.optional(),
  externalRecipients:    stringList.optional(),
  subprocessors:         stringList.optional(),
  sourceSystems:         stringList.optional(),
  destinationSystems:    stringList.optional(),
  storageLocations:      stringList.optional(),
  thirdCountries:        stringList.optional(),
  retentionPeriod:       z.string().trim().max(200).optional(),
  retentionPolicyRef:    z.string().trim().max(200).optional(),
  specialCategory:       z.boolean().optional(),
  automatedDecision:     z.boolean().optional(),
  internationalTransfer: z.boolean().optional(),
  riskClassification:    z.enum(RISK_CLASSIFICATIONS as [string, ...string[]]).optional(),
  dataOwner:             z.string().trim().max(200).optional(),
  systemOwner:           z.string().trim().max(200).optional(),
  status:                z.enum(PROCESSING_ACTIVITY_STATUSES as [string, ...string[]]).optional(),
  approvalState:         z.enum(PROCESSING_APPROVAL_STATES as [string, ...string[]]).optional(),
  reviewDate:            z.string().datetime().optional(),
};

export const createProcessingActivitySchema = z.object(baseShape).strict();
export const updateProcessingActivitySchema = z.object(baseShape).strict().partial();

export type CreateProcessingActivityInput = z.infer<typeof createProcessingActivitySchema>;
export type UpdateProcessingActivityInput = z.infer<typeof updateProcessingActivitySchema>;

/**
 * Build the CREATE database payload with fail-closed defaults. When a lawful
 * basis is supplied its status becomes CONFIGURED only if the caller also marked
 * it so; otherwise it stays LEGAL_REVIEW_REQUIRED. Nothing is inferred.
 */
export function toCreateData(input: CreateProcessingActivityInput): Record<string, unknown> {
  return {
    name:                  input.name,
    purpose:               input.purpose,
    description:           input.description ?? null,
    legalBasis:            input.legalBasis ?? "",
    legalBasisStatus:      input.legalBasisStatus ?? "LEGAL_REVIEW_REQUIRED",
    dataSubjectCategories: input.dataSubjectCategories ?? [],
    dataCategories:        input.dataCategories ?? [],
    recipients:            input.recipients ?? [],
    internalRecipients:    input.internalRecipients ?? [],
    externalRecipients:    input.externalRecipients ?? [],
    subprocessors:         input.subprocessors ?? [],
    sourceSystems:         input.sourceSystems ?? [],
    destinationSystems:    input.destinationSystems ?? [],
    storageLocations:      input.storageLocations ?? [],
    thirdCountries:        input.thirdCountries ?? [],
    retentionPeriod:       input.retentionPeriod ?? null,
    retentionPolicyRef:    input.retentionPolicyRef ?? null,
    specialCategory:       input.specialCategory ?? false,
    automatedDecision:     input.automatedDecision ?? false,
    internationalTransfer: input.internationalTransfer ?? false,
    riskClassification:    input.riskClassification ?? "REVIEW_REQUIRED",
    dataOwner:             input.dataOwner ?? null,
    systemOwner:           input.systemOwner ?? null,
    status:                input.status ?? "DRAFT",
    approvalState:         input.approvalState ?? "PENDING_REVIEW",
    reviewDate:            input.reviewDate ? new Date(input.reviewDate) : null,
  };
}

/** Build the PATCH payload — only the keys actually present are written. */
export function toUpdateData(input: UpdateProcessingActivityInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const assign = (k: keyof UpdateProcessingActivityInput, v: unknown) => {
    if (input[k] !== undefined) data[k as string] = v;
  };
  assign("name", input.name);
  assign("purpose", input.purpose);
  assign("description", input.description ?? null);
  assign("legalBasis", input.legalBasis);
  assign("legalBasisStatus", input.legalBasisStatus);
  assign("dataSubjectCategories", input.dataSubjectCategories);
  assign("dataCategories", input.dataCategories);
  assign("recipients", input.recipients);
  assign("internalRecipients", input.internalRecipients);
  assign("externalRecipients", input.externalRecipients);
  assign("subprocessors", input.subprocessors);
  assign("sourceSystems", input.sourceSystems);
  assign("destinationSystems", input.destinationSystems);
  assign("storageLocations", input.storageLocations);
  assign("thirdCountries", input.thirdCountries);
  assign("retentionPeriod", input.retentionPeriod ?? null);
  assign("retentionPolicyRef", input.retentionPolicyRef ?? null);
  assign("specialCategory", input.specialCategory);
  assign("automatedDecision", input.automatedDecision);
  assign("internationalTransfer", input.internationalTransfer);
  assign("riskClassification", input.riskClassification);
  assign("dataOwner", input.dataOwner ?? null);
  assign("systemOwner", input.systemOwner ?? null);
  assign("status", input.status);
  assign("approvalState", input.approvalState);
  assign("reviewDate", input.reviewDate ? new Date(input.reviewDate) : (input.reviewDate === undefined ? undefined : null));
  return data;
}

// ── Evidence completeness (fail-closed) ───────────────────────────────────────

export type ProcessingEvidenceStatus =
  | "CONTROL_EVIDENCE_COMPLETE"
  | "CONTROL_EVIDENCE_INCOMPLETE"
  | "LEGAL_REVIEW_REQUIRED"
  | "OWNER_CONFIGURATION_REQUIRED";

export interface ProcessingEvidence {
  status:   ProcessingEvidenceStatus;
  missing:  string[]; // owner-configurable gaps
  blocking: string[]; // legal-review gaps
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/**
 * Deterministically classify how complete a processing activity's control
 * evidence is. NEVER returns COMPLETE unless every required classification has
 * been positively set by an authorised user — an un-reviewed lawful basis, an
 * un-triaged risk, or a pending approval each keep it out of COMPLETE. This is
 * the fail-closed rule the evidence-pack generator relies on.
 */
export function classifyProcessingActivityEvidence(a: {
  name?: string | null;
  purpose?: string | null;
  legalBasis?: string | null;
  legalBasisStatus?: string | null;
  riskClassification?: string | null;
  approvalState?: string | null;
  dataSubjectCategories?: unknown;
  dataCategories?: unknown;
  retentionPeriod?: string | null;
  retentionPolicyRef?: string | null;
}): ProcessingEvidence {
  const missing: string[] = [];
  const blocking: string[] = [];

  if (!a.name || !a.name.trim()) missing.push("name");
  if (!a.purpose || !a.purpose.trim()) missing.push("purpose");
  if (toStringArray(a.dataSubjectCategories).length === 0) missing.push("dataSubjectCategories");
  if (toStringArray(a.dataCategories).length === 0) missing.push("personalDataCategories");
  if (!(a.retentionPeriod && a.retentionPeriod.trim()) && !(a.retentionPolicyRef && a.retentionPolicyRef.trim())) {
    missing.push("retention");
  }

  // Lawful basis is a legal classification. It is COMPLETE only when an
  // authorised user marked its status CONFIGURED AND supplied a recognised basis.
  const basisStatus = a.legalBasisStatus ?? "LEGAL_REVIEW_REQUIRED";
  const basisRecognised = !!a.legalBasis && (LEGAL_BASIS_CLASSIFICATIONS as readonly string[]).includes(a.legalBasis);
  if (basisStatus !== "CONFIGURED" || !basisRecognised) blocking.push("legalBasis");

  const risk = a.riskClassification ?? "REVIEW_REQUIRED";
  if (risk === "REVIEW_REQUIRED" || !(RISK_CLASSIFICATIONS as readonly string[]).includes(risk)) {
    blocking.push("riskClassification");
  }

  if ((a.approvalState ?? "PENDING_REVIEW") !== "APPROVED") blocking.push("approval");

  let status: ProcessingEvidenceStatus;
  if (missing.length === 0 && blocking.length === 0) {
    status = "CONTROL_EVIDENCE_COMPLETE";
  } else if (blocking.includes("legalBasis")) {
    status = "LEGAL_REVIEW_REQUIRED";
  } else if (missing.length > 0) {
    status = "OWNER_CONFIGURATION_REQUIRED";
  } else {
    status = "CONTROL_EVIDENCE_INCOMPLETE";
  }
  return { status, missing, blocking };
}

/** Project a DB row to a tenant-admin DTO with Json fields coerced to arrays. */
export function toProcessingActivityDto(row: DbProcessingActivity) {
  const evidence = classifyProcessingActivityEvidence(row);
  return {
    id:                    row.id,
    name:                  row.name,
    purpose:               row.purpose,
    description:           row.description,
    legalBasis:            row.legalBasis,
    legalBasisStatus:      row.legalBasisStatus,
    dataSubjectCategories: toStringArray(row.dataSubjectCategories),
    dataCategories:        toStringArray(row.dataCategories),
    recipients:            toStringArray(row.recipients),
    internalRecipients:    toStringArray(row.internalRecipients),
    externalRecipients:    toStringArray(row.externalRecipients),
    subprocessors:         toStringArray(row.subprocessors),
    sourceSystems:         toStringArray(row.sourceSystems),
    destinationSystems:    toStringArray(row.destinationSystems),
    storageLocations:      toStringArray(row.storageLocations),
    thirdCountries:        toStringArray(row.thirdCountries),
    retentionPeriod:       row.retentionPeriod,
    retentionPolicyRef:    row.retentionPolicyRef,
    specialCategory:       row.specialCategory,
    automatedDecision:     row.automatedDecision,
    internationalTransfer: row.internationalTransfer,
    riskClassification:    row.riskClassification,
    dataOwner:             row.dataOwner,
    systemOwner:           row.systemOwner,
    status:                row.status,
    approvalState:         row.approvalState,
    reviewDate:            row.reviewDate,
    isActive:              row.isActive,
    createdAt:             row.createdAt,
    updatedAt:             row.updatedAt,
    evidenceStatus:        evidence.status,
    evidenceMissing:       evidence.missing,
    evidenceBlocking:      evidence.blocking,
  };
}
