// PHASE 94B3.3 — the application-service error vocabulary and the audit port.
//
// WHY A SECOND ERROR UNION
// The repository union describes what the DATABASE did; this one describes what
// the APPLICATION decided. They are deliberately separate: a repository
// CONFLICT can mean "replayed nonce" in one caller and "duplicate import" in
// another, and only the service knows which. `fromRepo` performs that widening
// once, so no service invents its own mapping.
//
// Nothing here ever carries a driver code, a constraint name, a signature, a
// nonce, an idempotency key or a byte of imported evidence.

import type { RepositoryError } from "../persistence/core";

export type ServiceErrorCode =
  | "UNAUTHENTICATED"
  // PHASE 107 STAGE 6-A — a valid session that has not selected an organization
  // (or a site) is not an unauthenticated one. Both used to answer 401, which
  // told a signed-in administrator their session had ended and offered a
  // sign-in link that could not possibly help. These are 409: the request is
  // well-formed and the caller is known; what is missing is context they can
  // supply. Neither code reveals whether any organization or site exists.
  | "ORGANIZATION_CONTEXT_REQUIRED"
  | "SITE_CONTEXT_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "UNSUPPORTED_FORMAT"
  | "PAYLOAD_TOO_LARGE"
  | "SIGNATURE_INVALID"
  | "STALE_TIMESTAMP"
  | "REPLAY_DETECTED"
  | "CAPABILITY_NOT_ALLOWED"
  | "TRANSIENT_FAILURE"
  // PHASE 94 — the writable secret backend required to issue/rotate a machine
  // credential is not available (disabled by configuration, or unreachable).
  // Distinct from TRANSIENT_FAILURE so a client can tell "retry later" from
  // "this deployment cannot provision credentials until an operator enables the
  // secret backend". It carries no detail about which backend or why.
  | "SECRET_BACKEND_UNAVAILABLE"
  | "INTERNAL_FAILURE";

export interface ServiceError {
  ok: false;
  code: ServiceErrorCode;
  /** A short, caller-safe hint. Never driver text, identifiers or evidence. */
  hint?: string;
}

export type ServiceResult<T> = { ok: true; value: T } | ServiceError;

export const svcFail = (code: ServiceErrorCode, hint?: string): ServiceError => ({
  ok: false,
  code,
  ...(hint ? { hint } : {}),
});

export const svcOk = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

/** Widen a repository failure into the application vocabulary. */
export function fromRepo(err: RepositoryError): ServiceError {
  switch (err.code) {
    case "NOT_FOUND":
      return svcFail("NOT_FOUND");
    case "FORBIDDEN":
      return svcFail("FORBIDDEN");
    case "CONFLICT":
      return svcFail("CONFLICT");
    case "VALIDATION_FAILED":
      return svcFail("VALIDATION_FAILED");
    case "TRANSIENT_FAILURE":
      return svcFail("TRANSIENT_FAILURE");
    default:
      return svcFail("INTERNAL_FAILURE");
  }
}

/* ── Audit port ─────────────────────────────────────────────────────────── */

export const OT_AUDIT = {
  GATEWAY_ENVELOPE_ACCEPTED: "OT_GATEWAY_ENVELOPE_ACCEPTED",
  GATEWAY_ENVELOPE_REJECTED: "OT_GATEWAY_ENVELOPE_REJECTED",
  // PHASE 94 — machine-credential enrollment lifecycle. Every event carries
  // only allow-listed scalar metadata (see AUDIT_ALLOWED_KEYS); no reference,
  // version secret, credential or provider internal ever reaches an audit row.
  GATEWAY_ENROLLMENT_CREATED: "OT_GATEWAY_ENROLLMENT_CREATED",
  GATEWAY_CREDENTIAL_ROTATED: "OT_GATEWAY_CREDENTIAL_ROTATED",
  GATEWAY_CREDENTIAL_REVOKED: "OT_GATEWAY_CREDENTIAL_REVOKED",
  GATEWAY_ENROLLMENT_DELETED: "OT_GATEWAY_ENROLLMENT_DELETED",
  GATEWAY_ENROLLMENT_FAILED: "OT_GATEWAY_ENROLLMENT_FAILED",
  IMPORT_STARTED: "ENGINEERING_IMPORT_STARTED",
  IMPORT_COMPLETED: "ENGINEERING_IMPORT_COMPLETED",
  IMPORT_FAILED: "ENGINEERING_IMPORT_FAILED",
  ANALYSIS_EXECUTED: "ENGINEERING_ANALYSIS_EXECUTED",
  FINDING_ACKNOWLEDGED: "ENGINEERING_FINDING_ACKNOWLEDGED",
  FINDING_ACCEPTED: "ENGINEERING_FINDING_ACCEPTED",
  FINDING_REJECTED: "ENGINEERING_FINDING_REJECTED",
  FINDING_RESOLVED: "ENGINEERING_FINDING_RESOLVED",
  FINDING_SUPERSEDED: "ENGINEERING_FINDING_SUPERSEDED",
} as const;

export type OtAuditAction = (typeof OT_AUDIT)[keyof typeof OT_AUDIT];

/**
 * The ONLY metadata keys an OT audit event may carry.
 *
 * An allow-LIST, applied by `sanitizeAuditMetadata` on the way out. A
 * deny-list would have to anticipate every field a future caller might pass —
 * including the manifest itself. This way a new key is invisible until someone
 * deliberately adds it here.
 */
export const AUDIT_ALLOWED_KEYS = Object.freeze([
  "organizationId",
  "siteId",
  "actorId",
  "importId",
  "projectId",
  "findingId",
  "gatewayId",
  "sourceType",
  "status",
  "state",
  "previousState",
  // PHASE 94 — enrollment lifecycle outcome ("created"/"rotated"/"revoked"/
  // "deleted"/"failed"/"compensated") and the monotonic credential version.
  // Both are non-secret scalars; neither is a reference or credential.
  "outcome",
  "version",
  "operation",
  "failureCategory",
  "rejection",
  "payloadType",
  "deviceCount",
  "tagCount",
  "alarmCount",
  "networkCount",
  "findingCount",
  "createdCount",
  "updatedCount",
  "supersededCount",
  "ruleCount",
  "ruleVersion",
  "durationMs",
] as const);

/** Values that must never reach an audit payload, whatever key carries them. */
export const AUDIT_FORBIDDEN_KEYS = Object.freeze([
  "manifest",
  "payload",
  "body",
  "envelope",
  "signature",
  "signingKeyRef",
  "secret",
  "nonce",
  "idempotencyKey",
  "checksum",
  "description",
  "message",
  "evidence",
  "stack",
  "error",
] as const);

const ALLOWED = new Set<string>(AUDIT_ALLOWED_KEYS);

/**
 * Strip an audit payload down to the allow-list.
 *
 * Scalars only: an object or array value is dropped even under an allowed key,
 * because a nested structure is exactly how a manifest would smuggle itself in.
 */
export function sanitizeAuditMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!ALLOWED.has(k)) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export interface AuditPort {
  record(input: {
    action: OtAuditAction;
    actorId: string | null;
    entityType: string;
    entityId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * The production port, backed by the platform's existing audit service.
 *
 * Sanitisation happens HERE rather than at each call site, so a service that
 * forgets cannot leak: everything funnels through one filter.
 */
export function createAuditPort(
  recordAuditEvent: (input: {
    userId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }) => Promise<void>,
): AuditPort {
  return {
    async record(input) {
      await recordAuditEvent({
        userId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: sanitizeAuditMetadata(input.metadata),
      });
    },
  };
}
