/**
 * Phase 97 Part H — closed erasure-target registry.
 *
 * There is NO dynamic Prisma-model crawl, NO PostgreSQL table discovery and NO
 * "erase every column". Each target is an explicit definition that queries ONLY by
 * the authoritative subject + organization predicate with an explicit safe `select`,
 * so another tenant's or subject's rows, and every credential/secret/session/token,
 * are never even read. Unknown targets do not exist — the registry is closed and
 * fails closed. Security credentials are handled by dedicated security-revocation
 * workflows, never by this generic privacy erasure planner.
 */

export type ErasureClassification =
  | "DELETE_ALLOWED"
  | "ANONYMISE_REQUIRED"
  | "RETENTION_REQUIRED"
  | "LEGAL_HOLD"
  | "DEPENDENCY_BLOCKED"
  | "MANUAL_REVIEW_REQUIRED"
  | "NOT_SUBJECT_DATA";

export const ERASURE_CLASSIFICATIONS: ErasureClassification[] = [
  "DELETE_ALLOWED", "ANONYMISE_REQUIRED", "RETENTION_REQUIRED", "LEGAL_HOLD",
  "DEPENDENCY_BLOCKED", "MANUAL_REVIEW_REQUIRED", "NOT_SUBJECT_DATA",
];

export type ExecutionStrategy = "DELETE" | "ANONYMISE" | "NONE";

/** The closed registry version — part of the execution preflight (a registry change
 *  after approval makes an approved plan stale). Bump on any target-set change.
 *
 *  1.0 -> 1.1 (Phase 102 §8): added `media_saves` + `media_watch_progress` — the two
 *  new subject-attributable Media tables. This is a DELIBERATE, consequential bump:
 *  `runErasurePreflight` (erasure-executor.ts) compares this value against every
 *  job's `registryVersion` and fails closed with ERASURE_REGISTRY_MISMATCH on any
 *  difference, so the bump immediately invalidates every erasure plan that was
 *  approved before these tables existed. That is the CORRECT outcome, not a bug: a
 *  plan approved under registry 1.0 cannot honestly claim to have accounted for
 *  media favourites/watch history, so it must be re-planned and re-approved under
 *  1.1 before it may execute. */
export const ERASURE_REGISTRY_VERSION = "1.1";

export interface ErasureSubject {
  userId:         string | null;
  candidateId:    string | null;
  organizationId: string | null;
}

type Finder = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  count?:   (args: unknown) => Promise<number>;
};
export type ErasurePrisma = Record<string, Finder>;

/** Hold-matching inputs for a single record (see retention-engine.holdCovers). */
export interface HoldMatchInputs {
  subjectId?:    string | null;
  resourceType?: string | null;
  resourceId?:   string | null;
  timestamp?:    Date | null;
}

/** A collected record — identifiers + classification inputs ONLY. NEVER raw content
 *  (no email/free-text/IP/UA/token/body). `evidence` is an ids/enums-only projection. */
export interface ErasureTargetRecord {
  recordId:              string;
  ownedByUserId:         string | null;
  ownedByOrganizationId: string | null;   // null == a global subject-owned row
  holdInputs:            HoldMatchInputs;
  dependency:            { blocked: boolean; codes: string[] };
  evidence:              Record<string, unknown>;
}

export interface ErasureTargetDefinition {
  name:                    string;
  schemaVersion:           string;
  dataCategory:            string;
  scope:                   "GLOBAL_SUBJECT" | "CURRENT_ORGANIZATION";
  defaultClassification:   ErasureClassification;
  primaryIdField:          string;
  allowedExecutionStrategy: ExecutionStrategy;
  /** Documented sensitive fields that must NEVER be selected/exported/deleted here. */
  excludedSensitiveFields: string[];
  /** How to find an approved RetentionPolicy for this target (dataClass+resource). */
  retentionLookup:         { dataClass: string; targetResource: string } | null;
  collect:                 (db: ErasurePrisma, subject: ErasureSubject) => Promise<ErasureTargetRecord[]>;
}

// Credential/secret/session material that must NEVER be read, exported or deleted by
// the generic erasure planner. Selecting only the explicit safe fields already
// guarantees this; the list is a defence-in-depth contract asserted by tests.
export const FORBIDDEN_ERASURE_FIELDS = [
  "passwordHash", "password", "tokenVersion", "resetToken", "verificationToken",
  "accessToken", "refreshToken", "sessionId", "apiKey", "secret", "signingKey",
  "privateKey", "clientSecret", "webhookSecret", "cookie", "authorization",
] as const;

// Models a generic erasure planner must NEVER target — handled by dedicated security
// revocation / evidence workflows, not deletable through this planner.
export const FORBIDDEN_ERASURE_TARGETS = [
  "user_credentials", "sessions", "access_tokens", "refresh_tokens", "api_keys",
  "openbao_credentials", "encryption_keys", "database_secrets", "provider_credentials",
  "audit_log",
] as const;

const emptyIfNoUser = <T,>(subject: ErasureSubject, fn: () => Promise<T[]>): Promise<T[]> =>
  subject.userId ? fn() : Promise.resolve([]);

export const ERASURE_TARGET_REGISTRY: ErasureTargetDefinition[] = [
  {
    // Subject consent state — subject-owned, org-scoped; deletion is technically
    // possible with no known blocker (DELETE_ALLOWED is not legal authorisation).
    name: "consent_records",
    schemaVersion: "1.0",
    dataCategory: "consent",
    scope: "CURRENT_ORGANIZATION",
    defaultClassification: "DELETE_ALLOWED",
    primaryIdField: "id",
    allowedExecutionStrategy: "DELETE",
    excludedSensitiveFields: ["ipAddress", "userAgent", "metadata"],
    retentionLookup: { dataClass: "consent", targetResource: "consent_records" },
    collect: (db, s) => emptyIfNoUser(s, async () => {
      const rows = await db.consentRecord.findMany({
        where: { userId: s.userId, organizationId: s.organizationId },
        select: { id: true, createdAt: true },
        orderBy: { id: "asc" },
      });
      return rows.map((r) => ({
        recordId: String(r.id),
        ownedByUserId: s.userId, ownedByOrganizationId: s.organizationId,
        holdInputs: { subjectId: s.userId, resourceType: "consent_record", resourceId: String(r.id), timestamp: (r.createdAt as Date) ?? null },
        dependency: { blocked: false, codes: [] },
        evidence: { recordId: String(r.id) },
      }));
    }),
  },
  {
    // Organization membership — subject-owned, org-scoped. Deletable unless the
    // subject is the SOLE active OWNER of the organization (operational dependency).
    name: "organization_membership",
    schemaVersion: "1.0",
    dataCategory: "membership",
    scope: "CURRENT_ORGANIZATION",
    defaultClassification: "DELETE_ALLOWED",
    primaryIdField: "id",
    allowedExecutionStrategy: "DELETE",
    excludedSensitiveFields: ["invitedById"],
    retentionLookup: { dataClass: "membership", targetResource: "organization_membership" },
    collect: (db, s) => emptyIfNoUser(s, async () => {
      const rows = await db.organizationMember.findMany({
        where: { userId: s.userId, organizationId: s.organizationId, status: "ACTIVE" },
        select: { id: true, role: true, createdAt: true },
        orderBy: { id: "asc" },
      });
      // Sole-owner dependency: an OWNER membership is DEPENDENCY_BLOCKED when it is
      // the only active OWNER of the organization (deleting it would orphan the org).
      let ownerCount = -1;
      const out: ErasureTargetRecord[] = [];
      for (const r of rows) {
        let blocked = false; const codes: string[] = [];
        if (r.role === "OWNER" && s.organizationId) {
          if (ownerCount < 0) {
            ownerCount = (db.organizationMember.count
              ? await db.organizationMember.count({ where: { organizationId: s.organizationId, role: "OWNER", status: "ACTIVE" } })
              : (await db.organizationMember.findMany({ where: { organizationId: s.organizationId, role: "OWNER", status: "ACTIVE" }, select: { id: true } })).length);
          }
          if (ownerCount <= 1) { blocked = true; codes.push("SOLE_ORGANIZATION_OWNER"); }
        }
        out.push({
          recordId: String(r.id),
          ownedByUserId: s.userId, ownedByOrganizationId: s.organizationId,
          holdInputs: { subjectId: s.userId, resourceType: "organization_membership", resourceId: String(r.id), timestamp: (r.createdAt as Date) ?? null },
          dependency: { blocked, codes },
          evidence: { recordId: String(r.id), role: String(r.role) },
        });
      }
      return out;
    }),
  },
  {
    // Legal acceptances — preservation-sensitive legal evidence (proof of consent to
    // policies). Default RETENTION_REQUIRED; never destructively erased here.
    name: "legal_acceptances",
    schemaVersion: "1.0",
    dataCategory: "legal_evidence",
    scope: "CURRENT_ORGANIZATION",
    defaultClassification: "RETENTION_REQUIRED",
    primaryIdField: "id",
    allowedExecutionStrategy: "NONE",
    excludedSensitiveFields: ["ipAddress", "userAgent", "correlationId"],
    retentionLookup: { dataClass: "legal_evidence", targetResource: "legal_acceptances" },
    collect: (db, s) => emptyIfNoUser(s, async () => {
      const rows = await db.legalAcceptance.findMany({
        where: { userId: s.userId, OR: [{ organizationId: null }, { organizationId: s.organizationId }] },
        select: { id: true, organizationId: true, createdAt: true },
        orderBy: { id: "asc" },
      });
      return rows.map((r) => ({
        recordId: String(r.id),
        ownedByUserId: s.userId, ownedByOrganizationId: (r.organizationId as string | null) ?? null,
        holdInputs: { subjectId: s.userId, resourceType: "legal_acceptance", resourceId: String(r.id), timestamp: (r.createdAt as Date) ?? null },
        dependency: { blocked: false, codes: [] },
        evidence: { recordId: String(r.id) },
      }));
    }),
  },
  {
    // The subject's own privacy-request execution artifacts — the request record
    // itself is compliance evidence and must remain, but direct subject identifiers
    // (email/ip/ua) can be replaced through an explicit anonymisation strategy.
    name: "privacy_request_artifacts",
    schemaVersion: "1.0",
    dataCategory: "privacy_request",
    scope: "CURRENT_ORGANIZATION",
    defaultClassification: "ANONYMISE_REQUIRED",
    primaryIdField: "id",
    allowedExecutionStrategy: "ANONYMISE",
    excludedSensitiveFields: ["email", "ipAddress", "userAgent", "description", "responseNote"],
    retentionLookup: { dataClass: "privacy_request", targetResource: "privacy_request_artifacts" },
    collect: (db, s) => emptyIfNoUser(s, async () => {
      const rows = await db.privacyRequest.findMany({
        where: { userId: s.userId, organizationId: s.organizationId },
        select: { id: true, createdAt: true },
        orderBy: { id: "asc" },
      });
      return rows.map((r) => ({
        recordId: String(r.id),
        ownedByUserId: s.userId, ownedByOrganizationId: s.organizationId,
        holdInputs: { subjectId: s.userId, resourceType: "privacy_request", resourceId: String(r.id), timestamp: (r.createdAt as Date) ?? null },
        dependency: { blocked: false, codes: [] },
        evidence: { recordId: String(r.id) },
      }));
    }),
  },
  {
    // PHASE 102 §8 — a subject's favourited media. Subject-owned and org-scoped.
    // There is no legal basis to retain someone's favourites list, and nothing else
    // depends on it operationally, so DELETE is the honest action.
    //
    // `mediaAssetId` is excluded from evidence deliberately: WHICH videos a person
    // saved is the sensitive fact here, not that a row existed. An erasure evidence
    // record is retained after execution, so copying the asset linkage into it would
    // preserve exactly the viewing preference the subject asked to have erased.
    name: "media_saves",
    schemaVersion: "1.0",
    dataCategory: "media_engagement",
    scope: "CURRENT_ORGANIZATION",
    defaultClassification: "DELETE_ALLOWED",
    primaryIdField: "id",
    allowedExecutionStrategy: "DELETE",
    excludedSensitiveFields: ["mediaAssetId"],
    retentionLookup: { dataClass: "media_engagement", targetResource: "media_saves" },
    collect: (db, s) => emptyIfNoUser(s, async () => {
      const rows = await db.mediaSave.findMany({
        where: { userId: s.userId, organizationId: s.organizationId },
        select: { id: true, createdAt: true },
        orderBy: { id: "asc" },
      });
      return rows.map((r) => ({
        recordId: String(r.id),
        ownedByUserId: s.userId, ownedByOrganizationId: s.organizationId,
        holdInputs: { subjectId: s.userId, resourceType: "media_save", resourceId: String(r.id), timestamp: (r.createdAt as Date) ?? null },
        dependency: { blocked: false, codes: [] },
        evidence: { recordId: String(r.id) },
      }));
    }),
  },
  {
    // PHASE 102 §8 — a subject's private watch history (position, progress, completion).
    // Behavioural data with no retention basis; the history is meant to die with the
    // account, which is why MediaWatchProgress.userId cascades rather than nulling.
    //
    // Every behavioural column is excluded from evidence: position/progress/completion
    // and the asset linkage together reconstruct what a person watched and how far they
    // got. Only the opaque row id and its timestamp may appear.
    name: "media_watch_progress",
    schemaVersion: "1.0",
    dataCategory: "media_engagement",
    scope: "CURRENT_ORGANIZATION",
    defaultClassification: "DELETE_ALLOWED",
    primaryIdField: "id",
    allowedExecutionStrategy: "DELETE",
    excludedSensitiveFields: ["mediaAssetId", "positionSeconds", "progressPct", "completedAt", "lastWatchedAt"],
    retentionLookup: { dataClass: "media_engagement", targetResource: "media_watch_progress" },
    collect: (db, s) => emptyIfNoUser(s, async () => {
      const rows = await db.mediaWatchProgress.findMany({
        where: { userId: s.userId, organizationId: s.organizationId },
        select: { id: true, createdAt: true },
        orderBy: { id: "asc" },
      });
      return rows.map((r) => ({
        recordId: String(r.id),
        ownedByUserId: s.userId, ownedByOrganizationId: s.organizationId,
        holdInputs: { subjectId: s.userId, resourceType: "media_watch_progress", resourceId: String(r.id), timestamp: (r.createdAt as Date) ?? null },
        dependency: { blocked: false, codes: [] },
        evidence: { recordId: String(r.id) },
      }));
    }),
  },
  {
    // The shared global User identity row. A single tenant's erasure request cannot
    // unilaterally delete/anonymise a row shared across organizations, so the system
    // cannot safely determine an org-scoped action → MANUAL_REVIEW_REQUIRED.
    name: "user_profile",
    schemaVersion: "1.0",
    dataCategory: "identity",
    scope: "GLOBAL_SUBJECT",
    defaultClassification: "MANUAL_REVIEW_REQUIRED",
    primaryIdField: "id",
    allowedExecutionStrategy: "NONE",
    excludedSensitiveFields: ["passwordHash", "tokenVersion", "failedLoginAttempts", "lockedUntil"],
    retentionLookup: null,
    collect: (db, s) => emptyIfNoUser(s, async () => {
      const rows = await db.user.findMany({
        where: { id: s.userId },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      return rows.map((r) => ({
        recordId: String(r.id),
        ownedByUserId: s.userId, ownedByOrganizationId: null,
        holdInputs: { subjectId: s.userId, resourceType: "user_profile", resourceId: String(r.id), timestamp: null },
        dependency: { blocked: false, codes: [] },
        evidence: { recordId: String(r.id) },
      }));
    }),
  },
];

export const ERASURE_TARGET_NAMES = ERASURE_TARGET_REGISTRY.map((t) => t.name);
export function getErasureTarget(name: string): ErasureTargetDefinition | null {
  return ERASURE_TARGET_REGISTRY.find((t) => t.name === name) ?? null;
}

/** Collect every registered target's records for a subject. Unknown targets can
 *  never be produced — the registry is closed. Targets are returned in a stable
 *  (name-sorted) order so the plan is deterministic. */
export async function collectErasureTargets(db: ErasurePrisma, subject: ErasureSubject): Promise<Array<{ target: ErasureTargetDefinition; records: ErasureTargetRecord[] }>> {
  const out: Array<{ target: ErasureTargetDefinition; records: ErasureTargetRecord[] }> = [];
  for (const target of [...ERASURE_TARGET_REGISTRY].sort((a, b) => a.name.localeCompare(b.name))) {
    const records = await target.collect(db, subject);
    out.push({ target, records });
  }
  return out;
}
