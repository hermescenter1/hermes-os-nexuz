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
