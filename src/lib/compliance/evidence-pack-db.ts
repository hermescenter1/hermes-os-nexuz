/**
 * Phase 97 — governed compliance evidence-pack persistence (tenant scoped).
 *
 * Generation runs in ONE interactive REPEATABLE READ transaction so every governed
 * record is read from a single consistent database snapshot. `snapshotAt` is
 * transaction_timestamp() (the snapshot start — this is snapshot IDENTITY, deliberately
 * different from the post-lock clock_timestamp() used for LIFECYCLE evidence times, which
 * must never predate a lock wait). Items are SAFE projections only; the canonical manifest
 * (recursively key-sorted JSON, Date→ISO, deterministic item order, deduped) is hashed to
 * a lowercase SHA-256 so identical evidence always yields an identical hash and a stored
 * pack's hash never changes when the source data later changes. READY manifests + items
 * are immutable (DB triggers); only a governed revocation may follow. Nothing here contacts
 * a customer, regulator, provider, email or webhook; no legal deadline / duty is computed.
 *
 * READY means the manifest generated consistently — NEVER legal compliance or certification.
 */
import { getPrisma } from "@/lib/db/prisma";
import { randomUUID, createHash } from "node:crypto";
import { stableStringify } from "./export-package";
import type { DbComplianceEvidencePack, DbComplianceEvidencePackItem } from "./types";
import {
  EVIDENCE_SCHEMA_VERSION, foldReadiness, type EvidenceScopeType, type EvidenceReadiness,
} from "./evidence-governance";
import {
  type SafeEvidenceItem,
  projectProcessingActivity, projectRetentionPolicy, projectLegalHold, projectSubprocessor,
  projectDataTransfer, projectLegalDocument, projectComplianceIncident, projectProviderPolicy,
  projectEntitlementOverride, projectPrivacyRequest, projectDataExportRequest, projectDataDeletionRequest,
  projectCountAggregate, projectUnsupported,
} from "./evidence-projections";

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;
type TxRaw = Record<string, AnyModel> & {
  $queryRawUnsafe: <T = unknown>(sql: string, ...values: unknown[]) => Promise<T>;
};
type TxClient = { $transaction: <T>(fn: (tx: TxRaw) => Promise<T>, opts?: { isolationLevel?: string }) => Promise<T> };

export type EvidenceTarget = {
  incidentId: string | null;
  processingActivityId: string | null;
  privacyRequestId: string | null;
};

export type EvidenceReason =
  | "NOT_FOUND" | "INVALID_SCOPE" | "TARGET_NOT_FOUND" | "GENERATION_FAILED"
  | "NOT_REVOCABLE" | "CONFLICT";

class EvidenceError extends Error {
  constructor(public reason: EvidenceReason) { super(reason); this.name = "EvidenceError"; }
}
class RaceLost extends Error {}

function errCode(err: unknown): string { return String((err as { code?: string })?.code ?? ""); }
function errMsg(err: unknown): string { return String((err as { message?: string })?.message ?? ""); }
function isUniqueViolation(err: unknown): boolean { return errCode(err) === "P2002" || /unique constraint|duplicate key/i.test(errMsg(err)); }
function isSerializationError(err: unknown): boolean { return errCode(err) === "40001" || /could not serialize|deadlock detected|40001|40P01/i.test(errMsg(err)); }

function sha256hex(value: unknown): string { return createHash("sha256").update(stableStringify(value)).digest("hex"); }
function strcmp(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function present(v: unknown): boolean { return v !== null && v !== undefined && !(typeof v === "string" && v.trim() === ""); }

// ── Reads (non-tx; always org-predicated) ─────────────────────────────────────

async function pack(): Promise<AnyModel | null> {
  const db = await getPrisma(); if (!db) return null;
  return (db as Record<string, unknown>).complianceEvidencePack as AnyModel;
}
async function itemModel(): Promise<AnyModel | null> {
  const db = await getPrisma(); if (!db) return null;
  return (db as Record<string, unknown>).complianceEvidencePackItem as AnyModel;
}

export async function listEvidencePacksForOrg(organizationId: string, opts: { take?: number; skip?: number } = {}): Promise<DbComplianceEvidencePack[]> {
  const m = await pack(); if (!m) return [];
  try {
    return (await m.findMany({
      where: { organizationId }, orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(opts.take ?? 100, 1), 200), skip: Math.max(opts.skip ?? 0, 0),
    } as unknown)) as DbComplianceEvidencePack[];
  } catch { return []; }
}
export async function countEvidencePacksForOrg(organizationId: string): Promise<number> {
  const m = await pack(); if (!m) return 0;
  try { return Number(await m.count({ where: { organizationId } } as unknown)); } catch { return 0; }
}
export async function getEvidencePackForOrg(id: string, organizationId: string): Promise<DbComplianceEvidencePack | null> {
  const m = await pack(); if (!m) return null;
  try { return (await m.findFirst({ where: { id, organizationId } } as unknown)) as DbComplianceEvidencePack | null; }
  catch { return null; }
}
export async function getEvidencePackItemsForOrg(evidencePackId: string, organizationId: string): Promise<DbComplianceEvidencePackItem[]> {
  const m = await itemModel(); if (!m) return [];
  try {
    return (await m.findMany({ where: { evidencePackId, organizationId }, orderBy: { sequence: "asc" }, take: 5000 } as unknown)) as DbComplianceEvidencePackItem[];
  } catch { return []; }
}
async function getPackByIdemKey(organizationId: string, idempotencyKey: string): Promise<DbComplianceEvidencePack | null> {
  const m = await pack(); if (!m) return null;
  try { return (await m.findFirst({ where: { organizationId, idempotencyKey } } as unknown)) as DbComplianceEvidencePack | null; }
  catch { return null; }
}

// ── Safe evidence reads (SELECT safe columns ONLY; org-predicated) ─────────────

// Per-record reads are DETERMINISTIC (orderBy id) and NON-SILENTLY bounded: fetching
// cap+1 detects truncation so an over-cap tenant yields a closed truncation marker (never
// a silently-incomplete READY snapshot, and never a hash that depends on an arbitrary
// subset). Aggregates use groupBy/count so they are exact regardless of size.
const RECORD_CAP = 5000;
async function selectRecords(tx: TxRaw, model: string, where: Record<string, unknown>, select: Record<string, true>): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const rows = (await (tx[model] as AnyModel).findMany({ where, select, orderBy: { id: "asc" }, take: RECORD_CAP + 1 } as unknown)) as Record<string, unknown>[];
  const truncated = rows.length > RECORD_CAP;
  return { rows: truncated ? rows.slice(0, RECORD_CAP) : rows, truncated };
}
function projectRecords(items: SafeEvidenceItem[], res: { rows: Record<string, unknown>[]; truncated: boolean }, entityType: string, project: (r: Record<string, unknown>) => SafeEvidenceItem): void {
  for (const r of res.rows) items.push(project(r));
  if (res.truncated) items.push(projectUnsupported(entityType, "EVIDENCE_CAP_EXCEEDED"));
}
async function groupCount(tx: TxRaw, model: string, where: Record<string, unknown>, by: string): Promise<{ total: number; byStatus: Record<string, number> }> {
  const rows = (await (tx[model] as AnyModel).groupBy({ by: [by], where, _count: { _all: true } } as unknown)) as Array<Record<string, unknown>>;
  const byStatus: Record<string, number> = {}; let total = 0;
  for (const r of rows) { const k = String(r[by] ?? "UNKNOWN"); const c = Number((r._count as { _all?: number })?._all ?? 0); byStatus[k] = c; total += c; }
  return { total, byStatus };
}
async function rowCount(tx: TxRaw, model: string, where: Record<string, unknown>): Promise<number> {
  return Number(await (tx[model] as AnyModel).count({ where } as unknown));
}
function anyOpen(byStatus: Record<string, number>, terminal: string[]): boolean {
  return Object.keys(byStatus).some((k) => !terminal.includes(k) && byStatus[k] > 0);
}

async function readOrganizationScope(tx: TxRaw, org: string, now: Date): Promise<SafeEvidenceItem[]> {
  const items: SafeEvidenceItem[] = [];
  const where = { organizationId: org };

  projectRecords(items, await selectRecords(tx, "processingActivity", where, { id: true, legalBasisStatus: true, approvalState: true, status: true, riskClassification: true, specialCategory: true, automatedDecision: true, internationalTransfer: true, isActive: true, reviewDate: true, updatedAt: true }), "PROCESSING_ACTIVITY", projectProcessingActivity);
  projectRecords(items, await selectRecords(tx, "retentionPolicy", where, { id: true, dataClass: true, targetResource: true, retentionTrigger: true, retentionDays: true, action: true, approvalState: true, legalHoldAware: true, dryRunOnly: true, enabled: true, updatedAt: true }), "RETENTION_POLICY", projectRetentionPolicy);
  projectRecords(items, await selectRecords(tx, "legalHold", where, { id: true, reasonClass: true, scopeType: true, status: true, approvedBy: true, updatedAt: true }), "LEGAL_HOLD", (r) => projectLegalHold({ ...r, hasApproval: present(r.approvedBy) }));
  projectRecords(items, await selectRecords(tx, "subprocessor", where, { id: true, serviceCategory: true, lifecycle: true, contractReviewStatus: true, privacyReviewStatus: true, securityReviewStatus: true, approvedProviderScopeHash: true, approvedProviderPolicyVersion: true, updatedAt: true }), "SUBPROCESSOR", projectSubprocessor);
  projectRecords(items, await selectRecords(tx, "dataTransfer", where, { id: true, sourceJurisdiction: true, destinationJurisdiction: true, transferCategory: true, transferMechanismStatus: true, legalReviewStatus: true, riskReviewStatus: true, lifecycle: true, subprocessorId: true, updatedAt: true }), "DATA_TRANSFER", (r) => projectDataTransfer({ ...r, hasSubprocessor: present(r.subprocessorId) }));
  projectRecords(items, await selectRecords(tx, "complianceIncident", where, { id: true, incidentType: true, severity: true, lifecycle: true, assessmentStatus: true, sourceClass: true, summaryCode: true, decisionVersion: true, decisionEvidenceHash: true, openBlockerCount: true, ownerId: true, updatedAt: true }), "COMPLIANCE_INCIDENT", (r) => projectComplianceIncident({ ...r, hasOwner: present(r.ownerId) }));
  projectRecords(items, await selectRecords(tx, "legalDocument", where, { id: true, documentType: true, version: true, locale: true, isPublished: true, lifecycle: true, effectiveDate: true, publishedAt: true, updatedAt: true }), "LEGAL_DOCUMENT", (r) => projectLegalDocument({ ...r, hasEffectiveDate: present(r.effectiveDate), hasPublishedAt: present(r.publishedAt) }));
  projectRecords(items, await selectRecords(tx, "aiProviderPolicy", where, { id: true, providerRegistryId: true, enabled: true, policyVersion: true, allowedDataClasses: true, allowedWorkflows: true, approvedBy: true, expiresAt: true, updatedAt: true }), "PROVIDER_POLICY", (r) => projectProviderPolicy({
    ...r, hasApproval: present(r.approvedBy),
    isExpired: r.expiresAt instanceof Date ? r.expiresAt.getTime() <= now.getTime() : false,
    allowedDataClassCount: Array.isArray(r.allowedDataClasses) ? r.allowedDataClasses.length : 0,
    allowedWorkflowCount: Array.isArray(r.allowedWorkflows) ? r.allowedWorkflows.length : 0,
  }));
  projectRecords(items, await selectRecords(tx, "organizationEntitlementOverride", where, { id: true, entitlementKey: true, decision: true, limitOverride: true, revokedAt: true, expiresAt: true, updatedAt: true }), "ENTITLEMENT_OVERRIDE", (r) => projectEntitlementOverride({
    ...r, hasLimitOverride: present(r.limitOverride), isRevoked: present(r.revokedAt),
    isExpired: r.expiresAt instanceof Date ? r.expiresAt.getTime() <= now.getTime() : false,
  }));

  // Aggregates — exact counts via groupBy/count (never a capped/unordered row fetch).
  const pr = await groupCount(tx, "privacyRequest", where, "status");
  items.push(projectCountAggregate({ entityType: "PRIVACY_REQUEST_AGGREGATE", evidenceCode: "PRIVACY_REQUEST_LIFECYCLE_AGGREGATE", total: pr.total, byStatus: pr.byStatus, status: anyOpen(pr.byStatus, ["COMPLETED", "REJECTED", "CANCELLED"]) ? "REVIEW_REQUIRED" : "COMPLETE" }));
  const cs = await groupCount(tx, "consentRecord", where, "granted");
  const consentBy: Record<string, number> = {};
  for (const [k, v] of Object.entries(cs.byStatus)) consentBy[k === "true" ? "GRANTED" : k === "false" ? "WITHDRAWN" : k] = v;
  items.push(projectCountAggregate({ entityType: "CONSENT_AGGREGATE", evidenceCode: "CONSENT_EVIDENCE_AGGREGATE", total: cs.total, byStatus: consentBy, status: cs.total > 0 ? "COMPLETE" : "INSUFFICIENT_EVIDENCE" }));
  const ex = await groupCount(tx, "dataExportRequest", where, "lifecycle");
  items.push(projectCountAggregate({ entityType: "DATA_EXPORT_AGGREGATE", evidenceCode: "SUBJECT_EXPORT_GOVERNANCE_AGGREGATE", total: ex.total, byStatus: ex.byStatus, status: anyOpen(ex.byStatus, ["DELIVERED", "COMPLETED", "REVOKED", "FAILED"]) ? "REVIEW_REQUIRED" : "COMPLETE" }));
  const del = await groupCount(tx, "dataDeletionRequest", where, "lifecycle");
  items.push(projectCountAggregate({ entityType: "DATA_DELETION_AGGREGATE", evidenceCode: "SUBJECT_ERASURE_GOVERNANCE_AGGREGATE", total: del.total, byStatus: del.byStatus, status: anyOpen(del.byStatus, ["COMPLETED", "EXECUTED", "REJECTED"]) ? "REVIEW_REQUIRED" : "COMPLETE" }));
  const auditTotal = await rowCount(tx, "auditLog", { organizationId: org, action: { startsWith: "compliance." } });
  items.push(projectCountAggregate({ entityType: "AUDIT_AGGREGATE", evidenceCode: "COMPLIANCE_AUDIT_AGGREGATE", total: auditTotal, byStatus: {}, status: auditTotal > 0 ? "COMPLETE" : "INSUFFICIENT_EVIDENCE" }));

  return items;
}

async function readIncidentScope(tx: TxRaw, org: string, incidentId: string): Promise<SafeEvidenceItem[]> {
  const items: SafeEvidenceItem[] = [];
  const inc = (await (tx.complianceIncident as AnyModel).findFirst({ where: { id: incidentId, organizationId: org }, select: { id: true, incidentType: true, severity: true, lifecycle: true, assessmentStatus: true, sourceClass: true, summaryCode: true, decisionVersion: true, decisionEvidenceHash: true, openBlockerCount: true, ownerId: true, updatedAt: true } } as unknown)) as Record<string, unknown> | null;
  if (!inc) throw new EvidenceError("TARGET_NOT_FOUND");
  items.push(projectComplianceIncident({ ...inc, hasOwner: present(inc.ownerId) }));
  const act = await groupCount(tx, "complianceIncidentAction", { organizationId: org, complianceIncidentId: incidentId }, "status");
  items.push(projectCountAggregate({ entityType: "COMPLIANCE_INCIDENT_ACTION_AGGREGATE", evidenceCode: "INCIDENT_ACTION_AGGREGATE", total: act.total, byStatus: act.byStatus, status: (act.byStatus.OPEN ?? 0) > 0 ? "REVIEW_REQUIRED" : "COMPLETE" }));
  const eventTotal = await rowCount(tx, "complianceIncidentEvent", { organizationId: org, complianceIncidentId: incidentId });
  items.push(projectCountAggregate({ entityType: "COMPLIANCE_INCIDENT_TIMELINE_AGGREGATE", evidenceCode: "INCIDENT_TIMELINE_AGGREGATE", total: eventTotal, byStatus: {}, status: eventTotal > 0 ? "COMPLETE" : "INSUFFICIENT_EVIDENCE" }));
  projectRecords(items, await selectRecords(tx, "legalHold", { organizationId: org, scopeType: "INCIDENT", incidentId }, { id: true, reasonClass: true, scopeType: true, status: true, approvedBy: true, updatedAt: true }), "LEGAL_HOLD", (r) => projectLegalHold({ ...r, hasApproval: present(r.approvedBy) }));
  return items;
}

async function readProcessingActivityScope(tx: TxRaw, org: string, activityId: string): Promise<SafeEvidenceItem[]> {
  const items: SafeEvidenceItem[] = [];
  const pa = (await (tx.processingActivity as AnyModel).findFirst({ where: { id: activityId, organizationId: org }, select: { id: true, legalBasisStatus: true, approvalState: true, status: true, riskClassification: true, specialCategory: true, automatedDecision: true, internationalTransfer: true, isActive: true, reviewDate: true, updatedAt: true } } as unknown)) as Record<string, unknown> | null;
  if (!pa) throw new EvidenceError("TARGET_NOT_FOUND");
  items.push(projectProcessingActivity(pa));
  projectRecords(items, await selectRecords(tx, "dataTransfer", { organizationId: org, processingActivityId: activityId }, { id: true, sourceJurisdiction: true, destinationJurisdiction: true, transferCategory: true, transferMechanismStatus: true, legalReviewStatus: true, riskReviewStatus: true, lifecycle: true, subprocessorId: true, updatedAt: true }), "DATA_TRANSFER", (r) => projectDataTransfer({ ...r, hasSubprocessor: present(r.subprocessorId) }));
  projectRecords(items, await selectRecords(tx, "legalHold", { organizationId: org, processingActivityId: activityId }, { id: true, reasonClass: true, scopeType: true, status: true, approvedBy: true, updatedAt: true }), "LEGAL_HOLD", (r) => projectLegalHold({ ...r, hasApproval: present(r.approvedBy) }));
  return items;
}

async function readPrivacyRequestScope(tx: TxRaw, org: string, requestId: string): Promise<SafeEvidenceItem[]> {
  const items: SafeEvidenceItem[] = [];
  const req = (await (tx.privacyRequest as AnyModel).findFirst({ where: { id: requestId, organizationId: org }, select: { id: true, requestType: true, status: true, locale: true, identityVerifiedAt: true, updatedAt: true } } as unknown)) as Record<string, unknown> | null;
  if (!req) throw new EvidenceError("TARGET_NOT_FOUND");
  items.push(projectPrivacyRequest({ ...req, hasIdentityVerification: present(req.identityVerifiedAt) }));
  projectRecords(items, await selectRecords(tx, "dataExportRequest", { organizationId: org, privacyRequestId: requestId }, { id: true, lifecycle: true, subjectClass: true, approvedBy: true, contentHash: true, packageHash: true, schemaVersion: true, failureCode: true, updatedAt: true }), "DATA_EXPORT_REQUEST", (r) => projectDataExportRequest({ ...r, hasApproval: present(r.approvedBy), hasContentHash: present(r.contentHash), hasPackageHash: present(r.packageHash), hasFailure: present(r.failureCode) }));
  projectRecords(items, await selectRecords(tx, "dataDeletionRequest", { organizationId: org, privacyRequestId: requestId }, { id: true, lifecycle: true, subjectClass: true, approvedBy: true, planHash: true, approvedPlanHash: true, planVersion: true, blockedReasonCode: true, failureCode: true, updatedAt: true }), "DATA_DELETION_REQUEST", (r) => projectDataDeletionRequest({ ...r, hasApproval: present(r.approvedBy), hasPlan: present(r.planHash), hasApprovedPlan: present(r.approvedPlanHash), hasFailure: present(r.failureCode) }));
  return items;
}

async function readScopeEvidence(tx: TxRaw, org: string, scope: EvidenceScopeType, target: EvidenceTarget, now: Date): Promise<SafeEvidenceItem[]> {
  switch (scope) {
    case "ORGANIZATION": return readOrganizationScope(tx, org, now);
    case "INCIDENT": return readIncidentScope(tx, org, String(target.incidentId));
    case "PROCESSING_ACTIVITY": return readProcessingActivityScope(tx, org, String(target.processingActivityId));
    case "PRIVACY_REQUEST": return readPrivacyRequestScope(tx, org, String(target.privacyRequestId));
    default: return [projectUnsupported(String(scope), "UNSUPPORTED_SCOPE")];
  }
}

// ── Canonical manifest + deterministic hashing ────────────────────────────────

export interface EvidenceManifest {
  schemaVersion: string; organizationId: string; scopeType: string;
  target: EvidenceTarget; readiness: EvidenceReadiness; itemCount: number;
  items: Array<{ sequence: number; entityType: string; entityId: string | null; evidenceCode: string; evidenceStatus: string; sourceVersion: string | null; sourceUpdatedAt: string | null; evidenceHash: string; safeMetadata: Record<string, unknown> }>;
}

export function buildEvidenceManifest(organizationId: string, scopeType: EvidenceScopeType, target: EvidenceTarget, raw: SafeEvidenceItem[]): { manifest: EvidenceManifest; manifestHash: string; readiness: EvidenceReadiness } {
  const hashed = raw.map((it) => ({
    it,
    iso: it.sourceUpdatedAt ? it.sourceUpdatedAt.toISOString() : null,
    hash: sha256hex({ entityType: it.entityType, entityId: it.entityId, evidenceCode: it.evidenceCode, evidenceStatus: it.evidenceStatus, sourceVersion: it.sourceVersion, sourceUpdatedAt: it.sourceUpdatedAt ? it.sourceUpdatedAt.toISOString() : null, safeMetadata: it.safeMetadata }),
  }));
  const seen = new Set<string>();
  const deduped = hashed.filter((h) => (seen.has(h.hash) ? false : (seen.add(h.hash), true)));
  deduped.sort((a, b) =>
    strcmp(a.it.entityType, b.it.entityType) || strcmp(a.it.evidenceCode, b.it.evidenceCode)
    || strcmp(a.it.entityId ?? "", b.it.entityId ?? "") || strcmp(a.hash, b.hash));
  const items = deduped.map((h, i) => ({
    sequence: i + 1, entityType: h.it.entityType, entityId: h.it.entityId, evidenceCode: h.it.evidenceCode,
    evidenceStatus: h.it.evidenceStatus, sourceVersion: h.it.sourceVersion, sourceUpdatedAt: h.iso,
    evidenceHash: h.hash, safeMetadata: h.it.safeMetadata,
  }));
  const readiness = foldReadiness(items.map((i) => i.evidenceStatus));
  const manifest: EvidenceManifest = { schemaVersion: EVIDENCE_SCHEMA_VERSION, organizationId, scopeType, target, readiness, itemCount: items.length, items };
  return { manifest, manifestHash: sha256hex(manifest), readiness };
}

// ── Create (idempotent REQUESTED record) ──────────────────────────────────────

export async function createEvidencePackForOrg(params: {
  organizationId: string; actorId: string; idempotencyKey: string; scopeType: EvidenceScopeType; target: EvidenceTarget;
}): Promise<{ ok: true; row: DbComplianceEvidencePack; created: boolean } | { ok: false; reason: EvidenceReason }> {
  const client = await getPrisma(); if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const m = tx.complianceEvidencePack as AnyModel;
      const existing = (await m.findFirst({ where: { organizationId: params.organizationId, idempotencyKey: params.idempotencyKey } })) as DbComplianceEvidencePack | null;
      if (existing) return { ok: true as const, row: existing, created: false };
      const id = randomUUID();
      await m.create({
        data: {
          id, organizationId: params.organizationId, lifecycle: "REQUESTED", readiness: "REVIEW_REQUIRED",
          scopeType: params.scopeType, schemaVersion: EVIDENCE_SCHEMA_VERSION, idempotencyKey: params.idempotencyKey,
          targetIncidentId: params.target.incidentId, targetProcessingActivityId: params.target.processingActivityId,
          targetPrivacyRequestId: params.target.privacyRequestId,
          requestedBy: params.actorId, itemCount: 0, updatedAt: new Date(),
        },
      });
      const fresh = (await m.findFirst({ where: { id, organizationId: params.organizationId } })) as DbComplianceEvidencePack;
      return { ok: true as const, row: fresh, created: true };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      const row = await getPackByIdemKey(params.organizationId, params.idempotencyKey);
      if (row) return { ok: true, row, created: false };
    }
    if (errCode(err) === "P2003" || /foreign key/i.test(errMsg(err))) return { ok: false, reason: "TARGET_NOT_FOUND" };
    if (errCode(err) === "P2004" || /check constraint/i.test(errMsg(err))) return { ok: false, reason: "INVALID_SCOPE" };
    return { ok: false, reason: "CONFLICT" };
  }
}

// ── Generate (REPEATABLE READ snapshot; atomic finalization) ──────────────────

export async function generateEvidencePackForOrg(params: {
  id: string; organizationId: string; actorId: string;
}): Promise<{ ok: true; row: DbComplianceEvidencePack } | { ok: false; reason: EvidenceReason }> {
  const client = await getPrisma(); if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    await c.$transaction(async (tx) => {
      // Lock the pack; under REPEATABLE READ a concurrent finalize surfaces as a
      // serialization error (handled below) — never a second finalization.
      const locked = (await tx.$queryRawUnsafe<Array<{ lifecycle: string; scopeType: string; targetIncidentId: string | null; targetProcessingActivityId: string | null; targetPrivacyRequestId: string | null }>>(
        `SELECT "lifecycle", "scopeType", "targetIncidentId", "targetProcessingActivityId", "targetPrivacyRequestId"
           FROM "ComplianceEvidencePack" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
        params.id, params.organizationId,
      )) ?? [];
      const row = locked[0];
      if (!row) throw new EvidenceError("NOT_FOUND");
      if (row.lifecycle !== "REQUESTED") return; // already GENERATING/READY/FAILED/REVOKED/EXPIRED — idempotent no-op

      const snapRows = (await tx.$queryRawUnsafe<Array<{ now: Date }>>(`SELECT transaction_timestamp() AS "now"`)) ?? [];
      const snapshotAt = snapRows[0]?.now instanceof Date ? snapRows[0].now : new Date(snapRows[0]?.now as unknown as string);
      const target: EvidenceTarget = { incidentId: row.targetIncidentId, processingActivityId: row.targetProcessingActivityId, privacyRequestId: row.targetPrivacyRequestId };

      const raw = await readScopeEvidence(tx, params.organizationId, row.scopeType as EvidenceScopeType, target, snapshotAt);
      const { manifest, manifestHash, readiness } = buildEvidenceManifest(params.organizationId, row.scopeType as EvidenceScopeType, target, raw);

      for (const it of manifest.items) {
        await (tx.complianceEvidencePackItem as AnyModel).create({
          data: {
            id: randomUUID(), organizationId: params.organizationId, evidencePackId: params.id, sequence: it.sequence,
            entityType: it.entityType, entityId: it.entityId, evidenceCode: it.evidenceCode, evidenceStatus: it.evidenceStatus,
            evidenceHash: it.evidenceHash, sourceVersion: it.sourceVersion, sourceUpdatedAt: it.sourceUpdatedAt ? new Date(it.sourceUpdatedAt) : null,
            safeMetadata: it.safeMetadata,
          },
        });
      }
      const genRows = (await tx.$queryRawUnsafe<Array<{ now: Date }>>(`SELECT clock_timestamp() AS "now"`)) ?? [];
      const generatedAt = genRows[0]?.now instanceof Date ? genRows[0].now : new Date(genRows[0]?.now as unknown as string);
      const upd = (await (tx.complianceEvidencePack as AnyModel).updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: "REQUESTED" },
        data: { lifecycle: "READY", readiness, manifestHash, manifestJson: manifest, itemCount: manifest.items.length, snapshotAt, generatedBy: params.actorId, generatedAt, updatedAt: generatedAt },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) throw new RaceLost();
    }, { isolationLevel: "RepeatableRead" });
  } catch (err) {
    if (err instanceof RaceLost || isSerializationError(err)) {
      const row = await getEvidencePackForOrg(params.id, params.organizationId);
      return row ? { ok: true, row } : { ok: false, reason: "NOT_FOUND" };
    }
    if (err instanceof EvidenceError && err.reason === "NOT_FOUND") return { ok: false, reason: "NOT_FOUND" };
    // Genuine generation failure — record a CLOSED failure code in a separate transaction.
    const code = err instanceof EvidenceError ? err.reason : "GENERATION_FAILED";
    await markFailed(params.id, params.organizationId, code);
    return { ok: false, reason: "GENERATION_FAILED" };
  }
  const row = await getEvidencePackForOrg(params.id, params.organizationId);
  return row ? { ok: true, row } : { ok: false, reason: "NOT_FOUND" };
}

async function markFailed(id: string, organizationId: string, failureCode: string): Promise<void> {
  const client = await getPrisma(); if (!client) return;
  const c = client as unknown as TxClient;
  try {
    await c.$transaction(async (tx) => {
      const genRows = (await tx.$queryRawUnsafe<Array<{ now: Date }>>(`SELECT clock_timestamp() AS "now"`)) ?? [];
      const now = genRows[0]?.now instanceof Date ? genRows[0].now : new Date(genRows[0]?.now as unknown as string);
      await (tx.complianceEvidencePack as AnyModel).updateMany({
        where: { id, organizationId, lifecycle: { in: ["REQUESTED", "GENERATING"] } },
        data: { lifecycle: "FAILED", failureCode: failureCode.slice(0, 64), updatedAt: now },
      });
    });
  } catch { /* best-effort; never throws */ }
}

// ── Revoke (READY → REVOKED; evidence preserved) ──────────────────────────────

export async function revokeEvidencePackForOrg(params: {
  id: string; organizationId: string; actorId: string;
}): Promise<{ ok: true; row: DbComplianceEvidencePack } | { ok: false; reason: EvidenceReason }> {
  const client = await getPrisma(); if (!client) return { ok: false, reason: "CONFLICT" };
  const c = client as unknown as TxClient;
  try {
    return await c.$transaction(async (tx) => {
      const locked = (await tx.$queryRawUnsafe<Array<{ lifecycle: string }>>(
        `SELECT "lifecycle" FROM "ComplianceEvidencePack" WHERE "id" = $1 AND "organizationId" = $2 FOR UPDATE`,
        params.id, params.organizationId,
      )) ?? [];
      const row = locked[0];
      if (!row) return { ok: false as const, reason: "NOT_FOUND" };
      if (row.lifecycle !== "READY") return { ok: false as const, reason: "NOT_REVOCABLE" };
      const genRows = (await tx.$queryRawUnsafe<Array<{ now: Date }>>(`SELECT clock_timestamp() AS "now"`)) ?? [];
      const now = genRows[0]?.now instanceof Date ? genRows[0].now : new Date(genRows[0]?.now as unknown as string);
      const upd = (await (tx.complianceEvidencePack as AnyModel).updateMany({
        where: { id: params.id, organizationId: params.organizationId, lifecycle: "READY" },
        data: { lifecycle: "REVOKED", revokedBy: params.actorId, revokedAt: now, updatedAt: now },
      })) as { count?: number };
      if ((upd?.count ?? 0) !== 1) return { ok: false as const, reason: "CONFLICT" };
      const fresh = (await (tx.complianceEvidencePack as AnyModel).findFirst({ where: { id: params.id, organizationId: params.organizationId } })) as DbComplianceEvidencePack;
      return { ok: true as const, row: fresh };
    });
  } catch (err) {
    if (isSerializationError(err)) return { ok: false, reason: "CONFLICT" };
    return { ok: false, reason: "CONFLICT" };
  }
}
