/**
 * Phase 97 Part G — allow-listed export source registry.
 *
 * There is NO dynamic table discovery, NO raw schema crawl and NO "export every
 * column". Each source is an explicit definition with an explicit `select` of
 * only safe fields, so a secret column is never even read. The subject + org
 * predicate is always applied, so no other subject's or tenant's rows are
 * returned. Unknown sources do not exist — the registry is closed.
 */

export interface ExportSubject {
  userId:         string | null;
  candidateId:    string | null;
  organizationId: string | null;
}

type Finder = { findMany: (args: unknown) => Promise<Record<string, unknown>[]> };
export type ExportPrisma = Record<string, Finder>;

/**
 * Organization scope of a source. Any tenant-bearing source MUST enforce an
 * organization predicate in its query (asserted by a focused test), so a subject's
 * records from another organization are never included in this org's export.
 */
export type SourceScope = "GLOBAL_SUBJECT" | "CURRENT_ORGANIZATION" | "GLOBAL_OR_CURRENT_ORGANIZATION";

/** Scopes that read tenant-bearing rows and therefore require an org predicate. */
export const TENANT_BEARING_SCOPES: SourceScope[] = ["CURRENT_ORGANIZATION", "GLOBAL_OR_CURRENT_ORGANIZATION"];

export interface SourceDefinition {
  name:           string;
  schemaVersion:  string;
  scope:          SourceScope;
  includedFields: string[];
  /** Documented, for the manifest — NOT selected. */
  excludedFields: string[];
  redactionRules: string[];
  collect: (db: ExportPrisma, subject: ExportSubject) => Promise<Record<string, unknown>[]>;
}

export interface CollectedSource {
  name:           string;
  schemaVersion:  string;
  scope:          SourceScope;
  includedFields: string[];
  excludedFields: string[];
  redactionRules: string[];
  records:        Record<string, unknown>[];
}

// Secret / sensitive columns that must NEVER appear in any export. Selecting only
// the includedFields already guarantees this; the list is documented per source
// and asserted by tests as a defence-in-depth contract.
export const FORBIDDEN_EXPORT_FIELDS = [
  "passwordHash", "password", "tokenVersion", "resetToken", "verificationToken",
  "accessToken", "refreshToken", "sessionId", "apiKey", "secret", "signingKey",
  "privateKey", "clientSecret", "webhookSecret", "cookie", "authorization",
] as const;

const emptyIfNoUser = <T,>(subject: ExportSubject, fn: () => Promise<T[]>): Promise<T[]> =>
  subject.userId ? fn() : Promise.resolve([]);

// Stable, key-sorted serialization used to canonically order records so the
// package hash never depends on database return order (Finding 7).
function canonicalKey(r: Record<string, unknown>): string {
  const norm = (v: unknown): unknown => v instanceof Date ? v.toISOString() : (v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])])) : v);
  return JSON.stringify(norm(r));
}
export function canonicaliseRecords(records: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...records].sort((a, b) => canonicalKey(a).localeCompare(canonicalKey(b)));
}

export const EXPORT_SOURCES: SourceDefinition[] = [
  {
    name: "user_profile",
    schemaVersion: "1.0",
    scope: "GLOBAL_SUBJECT",
    includedFields: ["id", "name", "email", "emailVerified", "createdAt"],
    excludedFields: ["passwordHash", "tokenVersion", "failedLoginAttempts", "lockedUntil", "role"],
    redactionRules: ["credentials-excluded", "security-state-excluded"],
    collect: (db, subject) => emptyIfNoUser(subject, () =>
      db.user.findMany({
        where: { id: subject.userId },
        select: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
        orderBy: { id: "asc" },
      })),
  },
  {
    name: "organization_membership",
    schemaVersion: "1.0",
    scope: "CURRENT_ORGANIZATION",
    includedFields: ["role", "status", "joinedAt", "createdAt"],
    excludedFields: ["invitedById", "departmentId"],
    redactionRules: ["safe-projection"],
    collect: (db, subject) =>
      subject.userId && subject.organizationId
        ? db.organizationMember.findMany({
            where: { userId: subject.userId, organizationId: subject.organizationId },
            select: { role: true, status: true, joinedAt: true, createdAt: true },
            orderBy: [{ createdAt: "asc" }, { role: "asc" }],
          })
        : Promise.resolve([]),
  },
  {
    name: "privacy_requests",
    schemaVersion: "1.0",
    scope: "CURRENT_ORGANIZATION",
    includedFields: ["requestType", "status", "description", "locale", "createdAt", "completedAt"],
    excludedFields: ["ipAddress", "userAgent", "reviewedBy", "responseNote", "assignedById", "email"],
    redactionRules: ["network-metadata-excluded", "internal-review-notes-excluded"],
    collect: (db, subject) => emptyIfNoUser(subject, () =>
      db.privacyRequest.findMany({
        where: { userId: subject.userId, organizationId: subject.organizationId },
        select: { requestType: true, status: true, description: true, locale: true, createdAt: true, completedAt: true },
        orderBy: [{ createdAt: "asc" }, { requestType: "asc" }],
      })),
  },
  {
    name: "legal_acceptances",
    schemaVersion: "1.0",
    scope: "GLOBAL_OR_CURRENT_ORGANIZATION",
    includedFields: ["documentType", "documentVersion", "legalDocumentId", "locale", "sourceClass", "createdAt", "withdrawnAt"],
    excludedFields: ["ipAddress", "userAgent", "correlationId", "organizationId"],
    redactionRules: ["network-metadata-excluded", "foreign-tenant-acceptances-excluded"],
    // SECURITY (Finding 1): a multi-org subject's tenant acceptances from ANOTHER
    // organization must never enter this org's export. The org predicate is in the
    // DB query: global (organizationId NULL) OR the current authoritative org only.
    collect: (db, subject) => emptyIfNoUser(subject, () =>
      db.legalAcceptance.findMany({
        where: {
          userId: subject.userId,
          OR: [{ organizationId: null }, { organizationId: subject.organizationId }],
        },
        select: { documentType: true, documentVersion: true, legalDocumentId: true, locale: true, sourceClass: true, createdAt: true, withdrawnAt: true },
        orderBy: [{ createdAt: "asc" }, { legalDocumentId: "asc" }],
      })),
  },
  {
    name: "consent_records",
    schemaVersion: "1.0",
    scope: "CURRENT_ORGANIZATION",
    includedFields: ["consentType", "consentVersion", "granted", "locale", "createdAt"],
    excludedFields: ["ipAddress", "userAgent", "metadata"],
    redactionRules: ["network-metadata-excluded", "raw-metadata-excluded"],
    collect: (db, subject) => emptyIfNoUser(subject, () =>
      db.consentRecord.findMany({
        where: { userId: subject.userId, organizationId: subject.organizationId },
        select: { consentType: true, consentVersion: true, granted: true, locale: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { consentType: "asc" }],
      })),
  },
  {
    // PHASE 102 §8 — the subject's favourited media.
    //
    // Note the deliberate contrast with the `media_saves` ERASURE target, which
    // excludes `mediaAssetId` from its evidence. The two are not inconsistent: an
    // erasure evidence record is retained BY THE CONTROLLER after execution, so it
    // must not preserve the very preference being erased. A subject-access export is
    // delivered TO THE SUBJECT, and withholding which videos they saved would defeat
    // the purpose of the request. Same field, opposite direction, opposite answer.
    name: "media_saves",
    schemaVersion: "1.0",
    scope: "CURRENT_ORGANIZATION",
    includedFields: ["mediaAssetId", "createdAt"],
    excludedFields: ["id", "organizationId", "userId"],
    redactionRules: ["safe-projection", "internal-identifiers-excluded"],
    collect: (db, subject) => emptyIfNoUser(subject, () =>
      db.mediaSave.findMany({
        where: { userId: subject.userId, organizationId: subject.organizationId },
        select: { mediaAssetId: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { mediaAssetId: "asc" }],
      })),
  },
  {
    // PHASE 102 §8 — the subject's private watch history. Position, progress and
    // completion are the substance of the request, so they are included; only the
    // internal row/tenant identifiers are withheld.
    name: "media_watch_progress",
    schemaVersion: "1.0",
    scope: "CURRENT_ORGANIZATION",
    includedFields: ["mediaAssetId", "positionSeconds", "progressPct", "completedAt", "lastWatchedAt", "createdAt"],
    excludedFields: ["id", "organizationId", "userId"],
    redactionRules: ["safe-projection", "internal-identifiers-excluded"],
    collect: (db, subject) => emptyIfNoUser(subject, () =>
      db.mediaWatchProgress.findMany({
        where: { userId: subject.userId, organizationId: subject.organizationId },
        select: {
          mediaAssetId: true, positionSeconds: true, progressPct: true,
          completedAt: true, lastWatchedAt: true, createdAt: true,
        },
        orderBy: [{ createdAt: "asc" }, { mediaAssetId: "asc" }],
      })),
  },
];

/**
 * Collect every allow-listed source for the subject. Records are canonically
 * ordered (Finding 7) so the resulting package is deterministic regardless of
 * database return order.
 */
export async function collectExportSources(db: ExportPrisma, subject: ExportSubject): Promise<CollectedSource[]> {
  const out: CollectedSource[] = [];
  for (const src of [...EXPORT_SOURCES].sort((a, b) => a.name.localeCompare(b.name))) {
    const records = await src.collect(db, subject);
    out.push({
      name: src.name,
      schemaVersion: src.schemaVersion,
      scope: src.scope,
      includedFields: src.includedFields,
      excludedFields: src.excludedFields,
      redactionRules: src.redactionRules,
      records: canonicaliseRecords(records),
    });
  }
  return out;
}
