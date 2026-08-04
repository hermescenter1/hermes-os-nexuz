import { getPrisma }               from "@/lib/db/prisma";
import { randomUUID }              from "node:crypto";
import type {
  PrivacyRequestType,
  PrivacyRequestStatus,
  LegalDocumentType,
  CookieConsentPreferences,
  DbCookieConsent,
  DbConsentRecord,
  DbPrivacyRequest,
  DbLegalDocument,
  DbLegalAcceptance,
  DbDataExportRequest,
  DbDataDeletionRequest,
  DbProcessingActivity,
  DbRetentionPolicy,
  DbLegalHold,
  ComplianceStats,
} from "./types";

type AnyModel = Record<string, (...args: unknown[]) => Promise<unknown>>;

async function m() {
  const db = await getPrisma();
  if (!db) {
    console.error("[compliance/db] DB unavailable. HERMES_STORAGE_MODE=" + (process.env.HERMES_STORAGE_MODE ?? "auto") + " DATABASE_URL=" + (process.env.DATABASE_URL ? "set" : "missing"));
    return null;
  }
  const d = db as Record<string, unknown>;
  return {
    consent:    d.consentRecord    as AnyModel,
    cookie:     d.cookieConsent    as AnyModel,
    privacy:    d.privacyRequest   as AnyModel,
    legal:      d.legalDocument    as AnyModel,
    acceptance: d.legalAcceptance  as AnyModel,
    export:     d.dataExportRequest   as AnyModel,
    deletion:   d.dataDeletionRequest as AnyModel,
    activity:   d.processingActivity  as AnyModel,
    retention:  d.retentionPolicy     as AnyModel,
    hold:       d.legalHold           as AnyModel,
  };
}

// ── Cookie Consent ────────────────────────────────────────────────────────────

export async function upsertCookieConsent(data: {
  sessionId:      string;
  userId?:        string | null;
  preferences:    CookieConsentPreferences;
  ipAddress?:     string;
  userAgent?:     string;
  locale?:        string;
  consentVersion?: string;
}): Promise<DbCookieConsent | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.cookie.upsert({
      where:  { sessionId: data.sessionId },
      create: {
        id:             randomUUID(),
        sessionId:      data.sessionId,
        userId:         data.userId ?? null,
        necessary:      data.preferences.necessary,
        analytics:      data.preferences.analytics,
        marketing:      data.preferences.marketing,
        preferences:    data.preferences.preferences,
        ipAddress:      data.ipAddress ?? null,
        userAgent:      data.userAgent ?? null,
        locale:         data.locale ?? "en",
        consentVersion: data.consentVersion ?? "1.0",
        updatedAt:      new Date(),
      },
      update: {
        userId:         data.userId ?? undefined,
        necessary:      data.preferences.necessary,
        analytics:      data.preferences.analytics,
        marketing:      data.preferences.marketing,
        preferences:    data.preferences.preferences,
        ipAddress:      data.ipAddress ?? undefined,
        userAgent:      data.userAgent ?? undefined,
        locale:         data.locale ?? undefined,
        consentVersion: data.consentVersion ?? undefined,
        updatedAt:      new Date(),
      },
    } as unknown)) as DbCookieConsent;
  } catch (err) {
    console.error("[compliance/db] upsertCookieConsent failed for sessionId=" + data.sessionId + ":", err);
    return null;
  }
}

export async function getCookieConsent(sessionId: string): Promise<DbCookieConsent | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.cookie.findUnique({ where: { sessionId } } as unknown)) as DbCookieConsent | null;
  } catch (err) {
    console.error("[compliance/db] getCookieConsent failed for sessionId=" + sessionId + ":", err);
    return null;
  }
}

// ── Consent Records ───────────────────────────────────────────────────────────

export async function createConsentRecord(data: {
  userId?:        string | null;
  candidateId?:   string | null;
  organizationId?: string | null;
  consentType:    string;
  consentVersion?: string;
  granted:        boolean;
  locale?:        string;
  ipAddress?:     string;
  userAgent?:     string;
  metadata?:      Record<string, unknown>;
}): Promise<DbConsentRecord | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.consent.create({
      data: {
        id:             randomUUID(),
        userId:         data.userId ?? null,
        candidateId:    data.candidateId ?? null,
        organizationId: data.organizationId ?? null,
        consentType:    data.consentType,
        consentVersion: data.consentVersion ?? "1.0",
        granted:        data.granted,
        locale:         data.locale ?? "en",
        ipAddress:      data.ipAddress ?? null,
        userAgent:      data.userAgent ?? null,
        metadata:       data.metadata ?? {},
      },
    } as unknown)) as DbConsentRecord;
  } catch { return null; }
}

export async function getUserConsentHistory(userId: string): Promise<DbConsentRecord[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.consent.findMany({
      where:   { userId },
      orderBy: { createdAt: "desc" },
    } as unknown)) as DbConsentRecord[];
  } catch { return []; }
}

// ── Privacy Requests ──────────────────────────────────────────────────────────

export async function createPrivacyRequest(data: {
  userId?:        string | null;
  candidateId?:   string | null;
  organizationId?: string | null;
  requestType:    PrivacyRequestType;
  email:          string;
  description?:   string;
  locale?:        string;
  ipAddress?:     string;
  userAgent?:     string;
}): Promise<DbPrivacyRequest | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.privacy.create({
      data: {
        id:             randomUUID(),
        userId:         data.userId ?? null,
        candidateId:    data.candidateId ?? null,
        organizationId: data.organizationId ?? null,
        requestType:    data.requestType,
        status:         "PENDING",
        email:          data.email,
        description:    data.description ?? null,
        locale:         data.locale ?? "en",
        ipAddress:      data.ipAddress ?? null,
        userAgent:      data.userAgent ?? null,
        metadata:       {},
        updatedAt:      new Date(),
      },
    } as unknown)) as DbPrivacyRequest;
  } catch { return null; }
}

export async function getPrivacyRequests(opts?: {
  organizationId?: string;
  status?:         PrivacyRequestStatus;
  take?:           number;
}): Promise<DbPrivacyRequest[]> {
  const db = await m();
  if (!db) return [];
  try {
    const where: Record<string, unknown> = {};
    if (opts?.organizationId) where.organizationId = opts.organizationId;
    if (opts?.status)         where.status         = opts.status;
    return (await db.privacy.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take:    opts?.take ?? 100,
    } as unknown)) as DbPrivacyRequest[];
  } catch { return []; }
}

export async function updatePrivacyRequestStatus(
  id: string,
  status: PrivacyRequestStatus,
  reviewedBy?: string,
  responseNote?: string,
): Promise<DbPrivacyRequest | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.privacy.update({
      where: { id },
      data: {
        status,
        reviewedBy:   reviewedBy ?? null,
        reviewedAt:   new Date(),
        completedAt:  status === "COMPLETED" ? new Date() : undefined,
        responseNote: responseNote ?? null,
        updatedAt:    new Date(),
      },
    } as unknown)) as DbPrivacyRequest;
  } catch { return null; }
}

/**
 * SECURITY (compliance hotfix) — read a single PrivacyRequest ONLY within the
 * caller's authoritative organization. Returns null for a foreign or unknown id
 * without disclosing which case it is, so the route can answer a uniform 404.
 */
export async function getPrivacyRequestForOrg(
  id: string,
  organizationId: string,
): Promise<DbPrivacyRequest | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.privacy.findFirst({
      where: { id, organizationId },
    } as unknown)) as DbPrivacyRequest | null;
  } catch { return null; }
}

/**
 * SECURITY (compliance hotfix) — status mutation whose database predicate is
 * tenant-scoped: the `updateMany` filter carries BOTH the request id AND the
 * authoritative organization id, so a request belonging to another tenant is
 * never matched, let alone written. Returns the affected-row count; the caller
 * asserts exactly one row changed and otherwise answers a non-disclosing 404.
 * The tenant condition lives in the query, never in application code that could
 * be bypassed.
 */
export async function updatePrivacyRequestStatusForOrg(params: {
  id:             string;
  organizationId: string;
  status:         PrivacyRequestStatus;
  reviewedBy:     string;
  responseNote?:  string | null;
}): Promise<{ affected: number }> {
  const db = await m();
  if (!db) return { affected: 0 };
  try {
    const result = (await db.privacy.updateMany({
      where: { id: params.id, organizationId: params.organizationId },
      data: {
        status:       params.status,
        reviewedBy:   params.reviewedBy,
        reviewedAt:   new Date(),
        completedAt:  params.status === "COMPLETED" ? new Date() : undefined,
        responseNote: params.responseNote ?? null,
        updatedAt:    new Date(),
      },
    } as unknown)) as { count?: number };
    return { affected: typeof result?.count === "number" ? result.count : 0 };
  } catch { return { affected: 0 }; }
}

/**
 * SECURITY (Phase 97) — the platform TRIAGE queue: privacy requests that have no
 * organization yet (`organizationId: null`). Reserved for the strict platform
 * boundary. A tenant admin's queries always pin THEIR org id, so an unassigned
 * request never appears in any tenant list — enforced by the predicate here and
 * by every tenant-scoped read carrying a concrete organizationId.
 */
export async function listUnassignedPrivacyRequests(take = 200): Promise<DbPrivacyRequest[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.privacy.findMany({
      where:   { organizationId: null },
      orderBy: { createdAt: "asc" },
      take,
    } as unknown)) as DbPrivacyRequest[];
  } catch { return []; }
}

/** Read a single UNASSIGNED privacy request (platform boundary only). */
export async function getUnassignedPrivacyRequest(id: string): Promise<DbPrivacyRequest | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.privacy.findFirst({
      where: { id, organizationId: null },
    } as unknown)) as DbPrivacyRequest | null;
  } catch { return null; }
}

/**
 * SECURITY (Phase 97) — assign an UNASSIGNED request to an organization. The
 * write predicate carries `organizationId: null`, so the assignment succeeds only
 * while the request is still unassigned: an already-assigned request (belonging to
 * any tenant) is never matched, so this can neither reassign nor hijack. Returns
 * the affected-row count; the caller asserts exactly one row changed.
 */
export async function assignPrivacyRequestToOrg(params: {
  id:             string;
  organizationId: string;
  assignedById:   string;
  status?:        PrivacyRequestStatus;
  deadlines?: {
    acknowledgementDueAt:      Date | null;
    identityVerificationDueAt: Date | null;
    responseDueAt:             Date | null;
    extensionDueAt:            Date | null;
  };
}): Promise<{ affected: number }> {
  const db = await m();
  if (!db) return { affected: 0 };
  try {
    const result = (await db.privacy.updateMany({
      where: { id: params.id, organizationId: null },
      data: {
        organizationId:            params.organizationId,
        assignedById:              params.assignedById,
        assignedAt:                new Date(),
        status:                    params.status ?? "TRIAGED",
        acknowledgementDueAt:      params.deadlines?.acknowledgementDueAt ?? undefined,
        identityVerificationDueAt: params.deadlines?.identityVerificationDueAt ?? undefined,
        responseDueAt:             params.deadlines?.responseDueAt ?? undefined,
        extensionDueAt:            params.deadlines?.extensionDueAt ?? undefined,
        updatedAt:                 new Date(),
      },
    } as unknown)) as { count?: number };
    return { affected: typeof result?.count === "number" ? result.count : 0 };
  } catch { return { affected: 0 }; }
}

// ── Legal Documents ───────────────────────────────────────────────────────────

export async function getLatestLegalDocument(
  documentType: LegalDocumentType,
  locale = "en",
): Promise<DbLegalDocument | null> {
  const db = await m();
  if (!db) return null;
  try {
    const docs = (await db.legal.findMany({
      where:   { documentType, locale, isPublished: true },
      orderBy: { version: "desc" },
      take:    1,
    } as unknown)) as DbLegalDocument[];
    return docs[0] ?? null;
  } catch { return null; }
}

/**
 * SECURITY (compliance hotfix) — the ONLY query behind the anonymous public
 * legal-document endpoint. Every constraint is enforced IN THE DATABASE so no
 * post-retrieval check can be bypassed:
 *   - `organizationId: null` — platform-global templates ONLY; a published
 *     tenant-owned document can never surface anonymously.
 *   - `isPublished: true`   — drafts are never public.
 *   - effective NOW         — `effectiveDate` is null OR already elapsed, so a
 *     future-dated newer version is excluded from selection and the newest
 *     CURRENTLY-EFFECTIVE version wins (no 404 while an older effective version
 *     still exists).
 * The organization scope is fixed to null here and never taken from the client.
 */
export async function getLatestPublicLegalDocument(
  documentType: LegalDocumentType,
  locale = "en",
  now: Date = new Date(),
): Promise<DbLegalDocument | null> {
  const db = await m();
  if (!db) return null;
  try {
    const docs = (await db.legal.findMany({
      where: {
        documentType,
        locale,
        isPublished:    true,
        organizationId: null,
        OR: [{ effectiveDate: null }, { effectiveDate: { lte: now } }],
      },
      orderBy: { version: "desc" },
      take:    1,
    } as unknown)) as DbLegalDocument[];
    return docs[0] ?? null;
  } catch { return null; }
}

export async function getAllLegalDocuments(organizationId?: string): Promise<DbLegalDocument[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.legal.findMany({
      where:   organizationId ? { organizationId } : {},
      orderBy: [{ documentType: "asc" }, { version: "desc" }],
    } as unknown)) as DbLegalDocument[];
  } catch { return []; }
}

/**
 * SECURITY (compliance hotfix) — documents belonging to a SPECIFIC tenant only.
 * The predicate pins `organizationId`, so a tenant administrator can never read
 * another organization's documents (published or draft) through the admin API.
 */
export async function getLegalDocumentsForOrg(organizationId: string): Promise<DbLegalDocument[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.legal.findMany({
      where:   { organizationId },
      orderBy: [{ documentType: "asc" }, { version: "desc" }],
    } as unknown)) as DbLegalDocument[];
  } catch { return []; }
}

/**
 * SECURITY (compliance hotfix) — platform-global legal templates only
 * (`organizationId: null`). Reserved for the strictest platform-admin boundary;
 * tenant administrators never receive these.
 */
export async function getGlobalLegalDocuments(): Promise<DbLegalDocument[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.legal.findMany({
      where:   { organizationId: null },
      orderBy: [{ documentType: "asc" }, { version: "desc" }],
    } as unknown)) as DbLegalDocument[];
  } catch { return []; }
}

export async function createLegalDocument(data: {
  documentType:  LegalDocumentType;
  version:       string;
  title:         string;
  content:       string;
  locale?:       string;
  effectiveDate?: Date;
  organizationId?: string | null;
  createdBy?:    string;
}): Promise<DbLegalDocument | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.legal.create({
      data: {
        id:            randomUUID(),
        documentType:  data.documentType,
        version:       data.version,
        title:         data.title,
        content:       data.content,
        locale:        data.locale ?? "en",
        isPublished:   false,
        effectiveDate: data.effectiveDate ?? null,
        organizationId: data.organizationId ?? null,
        createdBy:     data.createdBy ?? null,
        updatedAt:     new Date(),
      },
    } as unknown)) as DbLegalDocument;
  } catch { return null; }
}

export async function publishLegalDocument(id: string): Promise<DbLegalDocument | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.legal.update({
      where: { id },
      data:  { isPublished: true, publishedAt: new Date(), updatedAt: new Date() },
    } as unknown)) as DbLegalDocument;
  } catch { return null; }
}

// ── Legal Acceptance ──────────────────────────────────────────────────────────

export async function recordLegalAcceptance(data: {
  legalDocumentId: string;
  userId?:         string | null;
  candidateId?:    string | null;
  organizationId?: string | null;
  ipAddress?:      string;
  userAgent?:      string;
  locale?:         string;
}): Promise<DbLegalAcceptance | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.acceptance.create({
      data: {
        id:              randomUUID(),
        legalDocumentId: data.legalDocumentId,
        userId:          data.userId ?? null,
        candidateId:     data.candidateId ?? null,
        organizationId:  data.organizationId ?? null,
        ipAddress:       data.ipAddress ?? null,
        userAgent:       data.userAgent ?? null,
        locale:          data.locale ?? "en",
      },
    } as unknown)) as DbLegalAcceptance;
  } catch { return null; }
}

export async function hasAcceptedDocument(
  legalDocumentId: string,
  userId?: string,
  candidateId?: string,
): Promise<boolean> {
  const db = await m();
  if (!db) return false;
  const where: Record<string, unknown> = { legalDocumentId };
  if (userId)      where.userId      = userId;
  if (candidateId) where.candidateId = candidateId;
  try {
    const row = await db.acceptance.findFirst({ where } as unknown);
    return row !== null;
  } catch { return false; }
}

// ── Data Export / Deletion Requests ──────────────────────────────────────────

export async function createDataExportRequest(data: {
  userId?:        string | null;
  email:          string;
  locale?:        string;
  ipAddress?:     string;
  organizationId?: string | null;
}): Promise<DbDataExportRequest | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.export.create({
      data: {
        id:             randomUUID(),
        userId:         data.userId ?? null,
        email:          data.email,
        status:         "PENDING",
        locale:         data.locale ?? "en",
        ipAddress:      data.ipAddress ?? null,
        organizationId: data.organizationId ?? null,
        metadata:       {},
        updatedAt:      new Date(),
      },
    } as unknown)) as DbDataExportRequest;
  } catch { return null; }
}

export async function createDataDeletionRequest(data: {
  userId?:        string | null;
  email:          string;
  reason?:        string;
  locale?:        string;
  ipAddress?:     string;
  organizationId?: string | null;
}): Promise<DbDataDeletionRequest | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.deletion.create({
      data: {
        id:             randomUUID(),
        userId:         data.userId ?? null,
        email:          data.email,
        status:         "PENDING",
        reason:         data.reason ?? null,
        locale:         data.locale ?? "en",
        ipAddress:      data.ipAddress ?? null,
        organizationId: data.organizationId ?? null,
        metadata:       {},
        updatedAt:      new Date(),
      },
    } as unknown)) as DbDataDeletionRequest;
  } catch { return null; }
}

export async function getDataRequests(organizationId?: string): Promise<{
  exports:   DbDataExportRequest[];
  deletions: DbDataDeletionRequest[];
}> {
  const db = await m();
  if (!db) return { exports: [], deletions: [] };
  const where = organizationId ? { organizationId } : {};
  try {
    const [exports, deletions] = await Promise.all([
      db.export.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 } as unknown),
      db.deletion.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 } as unknown),
    ]);
    return {
      exports:   exports   as DbDataExportRequest[],
      deletions: deletions as DbDataDeletionRequest[],
    };
  } catch { return { exports: [], deletions: [] }; }
}

// ── Processing Inventory (Article 30 RoPA) — Phase 97 ─────────────────────────
//
// SECURITY — every read and write is tenant-scoped IN THE DATABASE PREDICATE. A
// single-row read uses `findFirst({ id, organizationId })` and a mutation uses
// `updateMany({ where: { id, organizationId } })` + an affected-row assertion by
// the caller, so a processing activity belonging to another tenant is never
// matched, disclosed or written. The organizationId is always the server-derived
// authoritative scope — never a client-supplied value.

export async function listProcessingActivitiesForOrg(
  organizationId: string,
  take = 200,
): Promise<DbProcessingActivity[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.activity.findMany({
      where:   { organizationId },
      orderBy: { updatedAt: "desc" },
      take,
    } as unknown)) as DbProcessingActivity[];
  } catch { return []; }
}

export async function getProcessingActivityForOrg(
  id: string,
  organizationId: string,
): Promise<DbProcessingActivity | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.activity.findFirst({
      where: { id, organizationId },
    } as unknown)) as DbProcessingActivity | null;
  } catch { return null; }
}

export async function createProcessingActivityForOrg(params: {
  organizationId: string;
  createdBy:      string;
  data:           Record<string, unknown>;
}): Promise<DbProcessingActivity | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.activity.create({
      data: {
        id:             randomUUID(),
        organizationId: params.organizationId, // authoritative scope, never from client
        createdBy:      params.createdBy,
        updatedBy:      params.createdBy,
        updatedAt:      new Date(),
        ...params.data,
      },
    } as unknown)) as DbProcessingActivity;
  } catch { return null; }
}

export async function updateProcessingActivityForOrg(params: {
  id:             string;
  organizationId: string;
  updatedBy:      string;
  data:           Record<string, unknown>;
}): Promise<{ affected: number }> {
  const db = await m();
  if (!db) return { affected: 0 };
  try {
    const result = (await db.activity.updateMany({
      // tenant condition lives in the query — both id AND authoritative org id.
      where: { id: params.id, organizationId: params.organizationId },
      data: {
        ...params.data,
        // These are set server-side and can never be overridden by params.data
        // because they follow the spread.
        updatedBy: params.updatedBy,
        updatedAt: new Date(),
      },
    } as unknown)) as { count?: number };
    return { affected: typeof result?.count === "number" ? result.count : 0 };
  } catch { return { affected: 0 }; }
}

// ── Retention Policies (Phase 97) — org-scoped, planning only ─────────────────

export async function listRetentionPoliciesForOrg(organizationId: string, take = 200): Promise<DbRetentionPolicy[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.retention.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take } as unknown)) as DbRetentionPolicy[];
  } catch { return []; }
}

export async function getRetentionPolicyForOrg(id: string, organizationId: string): Promise<DbRetentionPolicy | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.retention.findFirst({ where: { id, organizationId } } as unknown)) as DbRetentionPolicy | null;
  } catch { return null; }
}

export async function createRetentionPolicyForOrg(params: {
  organizationId: string; createdBy: string; data: Record<string, unknown>;
}): Promise<DbRetentionPolicy | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.retention.create({
      data: {
        id:             randomUUID(),
        organizationId: params.organizationId,
        createdBy:      params.createdBy,
        updatedBy:      params.createdBy,
        updatedAt:      new Date(),
        ...params.data,
      },
    } as unknown)) as DbRetentionPolicy;
  } catch { return null; }
}

export async function updateRetentionPolicyForOrg(params: {
  id: string; organizationId: string; updatedBy: string; data: Record<string, unknown>;
}): Promise<{ affected: number }> {
  const db = await m();
  if (!db) return { affected: 0 };
  try {
    const result = (await db.retention.updateMany({
      where: { id: params.id, organizationId: params.organizationId },
      data:  { ...params.data, updatedBy: params.updatedBy, updatedAt: new Date() },
    } as unknown)) as { count?: number };
    return { affected: typeof result?.count === "number" ? result.count : 0 };
  } catch { return { affected: 0 }; }
}

// ── Legal Holds (Phase 97) — org-scoped ───────────────────────────────────────

export async function listLegalHoldsForOrg(organizationId: string, take = 200): Promise<DbLegalHold[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.hold.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take } as unknown)) as DbLegalHold[];
  } catch { return []; }
}

/** ACTIVE holds only — used by the (dry-run) retention planner. */
export async function listActiveLegalHoldsForOrg(organizationId: string): Promise<DbLegalHold[]> {
  const db = await m();
  if (!db) return [];
  try {
    return (await db.hold.findMany({ where: { organizationId, status: "ACTIVE" }, take: 1000 } as unknown)) as DbLegalHold[];
  } catch { return []; }
}

export async function getLegalHoldForOrg(id: string, organizationId: string): Promise<DbLegalHold | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.hold.findFirst({ where: { id, organizationId } } as unknown)) as DbLegalHold | null;
  } catch { return null; }
}

export async function createLegalHoldForOrg(params: {
  organizationId: string; createdBy: string; data: Record<string, unknown>;
}): Promise<DbLegalHold | null> {
  const db = await m();
  if (!db) return null;
  try {
    return (await db.hold.create({
      data: {
        id:             randomUUID(),
        organizationId: params.organizationId,
        createdBy:      params.createdBy,
        updatedBy:      params.createdBy,
        updatedAt:      new Date(),
        ...params.data,
      },
    } as unknown)) as DbLegalHold;
  } catch { return null; }
}

export async function updateLegalHoldForOrg(params: {
  id: string; organizationId: string; updatedBy: string; data: Record<string, unknown>;
}): Promise<{ affected: number }> {
  const db = await m();
  if (!db) return { affected: 0 };
  try {
    const result = (await db.hold.updateMany({
      where: { id: params.id, organizationId: params.organizationId },
      data:  { ...params.data, updatedBy: params.updatedBy, updatedAt: new Date() },
    } as unknown)) as { count?: number };
    return { affected: typeof result?.count === "number" ? result.count : 0 };
  } catch { return { affected: 0 }; }
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getComplianceStats(organizationId?: string): Promise<ComplianceStats | null> {
  const db = await m();
  if (!db) return null;
  const orgFilter = organizationId ? { organizationId } : {};
  try {
    const [
      totalPrivacyRequests,
      pendingRequests,
      completedRequests,
      totalConsentRecords,
      totalCookieConsents,
      totalExportRequests,
      totalDeletionRequests,
      totalLegalDocuments,
      publishedLegalDocuments,
    ] = await Promise.all([
      db.privacy.count({ where: orgFilter } as unknown),
      db.privacy.count({ where: { ...orgFilter, status: "PENDING" } } as unknown),
      db.privacy.count({ where: { ...orgFilter, status: "COMPLETED" } } as unknown),
      db.consent.count({ where: orgFilter } as unknown),
      db.cookie.count({} as unknown),
      db.export.count({ where: orgFilter } as unknown),
      db.deletion.count({ where: orgFilter } as unknown),
      db.legal.count({ where: orgFilter } as unknown),
      db.legal.count({ where: { ...orgFilter, isPublished: true } } as unknown),
    ]);
    return {
      totalPrivacyRequests:    totalPrivacyRequests    as number,
      pendingRequests:         pendingRequests         as number,
      completedRequests:       completedRequests       as number,
      totalConsentRecords:     totalConsentRecords     as number,
      totalCookieConsents:     totalCookieConsents     as number,
      totalExportRequests:     totalExportRequests     as number,
      totalDeletionRequests:   totalDeletionRequests   as number,
      totalLegalDocuments:     totalLegalDocuments     as number,
      publishedLegalDocuments: publishedLegalDocuments as number,
    };
  } catch { return null; }
}
