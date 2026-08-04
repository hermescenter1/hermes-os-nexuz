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

export interface SourceDefinition {
  name:           string;
  schemaVersion:  string;
  includedFields: string[];
  /** Documented, for the manifest — NOT selected. */
  excludedFields: string[];
  redactionRules: string[];
  collect: (db: ExportPrisma, subject: ExportSubject) => Promise<Record<string, unknown>[]>;
}

export interface CollectedSource {
  name:           string;
  schemaVersion:  string;
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

export const EXPORT_SOURCES: SourceDefinition[] = [
  {
    name: "user_profile",
    schemaVersion: "1.0",
    includedFields: ["id", "name", "email", "emailVerified", "createdAt"],
    excludedFields: ["passwordHash", "tokenVersion", "failedLoginAttempts", "lockedUntil", "role"],
    redactionRules: ["credentials-excluded", "security-state-excluded"],
    collect: (db, subject) => emptyIfNoUser(subject, () =>
      db.user.findMany({
        where: { id: subject.userId },
        select: { id: true, name: true, email: true, emailVerified: true, createdAt: true },
      })),
  },
  {
    name: "organization_membership",
    schemaVersion: "1.0",
    includedFields: ["role", "status", "joinedAt", "createdAt"],
    excludedFields: ["invitedById", "departmentId"],
    redactionRules: ["safe-projection"],
    collect: (db, subject) =>
      subject.userId && subject.organizationId
        ? db.organizationMember.findMany({
            where: { userId: subject.userId, organizationId: subject.organizationId },
            select: { role: true, status: true, joinedAt: true, createdAt: true },
          })
        : Promise.resolve([]),
  },
  {
    name: "privacy_requests",
    schemaVersion: "1.0",
    includedFields: ["requestType", "status", "description", "locale", "createdAt", "completedAt"],
    excludedFields: ["ipAddress", "userAgent", "reviewedBy", "responseNote", "assignedById", "email"],
    redactionRules: ["network-metadata-excluded", "internal-review-notes-excluded"],
    collect: (db, subject) => emptyIfNoUser(subject, () =>
      db.privacyRequest.findMany({
        where: { userId: subject.userId, organizationId: subject.organizationId },
        select: { requestType: true, status: true, description: true, locale: true, createdAt: true, completedAt: true },
      })),
  },
  {
    name: "legal_acceptances",
    schemaVersion: "1.0",
    includedFields: ["documentType", "documentVersion", "legalDocumentId", "locale", "sourceClass", "createdAt", "withdrawnAt"],
    excludedFields: ["ipAddress", "userAgent", "correlationId"],
    redactionRules: ["network-metadata-excluded"],
    collect: (db, subject) => emptyIfNoUser(subject, () =>
      db.legalAcceptance.findMany({
        where: { userId: subject.userId },
        select: { documentType: true, documentVersion: true, legalDocumentId: true, locale: true, sourceClass: true, createdAt: true, withdrawnAt: true },
      })),
  },
  {
    name: "consent_records",
    schemaVersion: "1.0",
    includedFields: ["consentType", "consentVersion", "granted", "locale", "createdAt"],
    excludedFields: ["ipAddress", "userAgent", "metadata"],
    redactionRules: ["network-metadata-excluded", "raw-metadata-excluded"],
    collect: (db, subject) => emptyIfNoUser(subject, () =>
      db.consentRecord.findMany({
        where: { userId: subject.userId, organizationId: subject.organizationId },
        select: { consentType: true, consentVersion: true, granted: true, locale: true, createdAt: true },
      })),
  },
];

/** Collect every allow-listed source for the subject. Deterministic ordering. */
export async function collectExportSources(db: ExportPrisma, subject: ExportSubject): Promise<CollectedSource[]> {
  const out: CollectedSource[] = [];
  for (const src of [...EXPORT_SOURCES].sort((a, b) => a.name.localeCompare(b.name))) {
    const records = await src.collect(db, subject);
    out.push({
      name: src.name,
      schemaVersion: src.schemaVersion,
      includedFields: src.includedFields,
      excludedFields: src.excludedFields,
      redactionRules: src.redactionRules,
      records,
    });
  }
  return out;
}
