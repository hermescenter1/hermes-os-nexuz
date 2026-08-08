/**
 * Phase 97 — governed compliance evidence packs: closed vocabularies + the
 * deterministic, fail-closed readiness fold (pure, I/O-free).
 *
 * READY is a manifest-generation state, NEVER a claim of legal compliance or
 * certification. Readiness is a fail-closed aggregate of per-item evidence states; it is
 * never a percentage score, and an unknown / missing / malformed value is treated as the
 * MOST cautious state, never silently dropped.
 */

export const EVIDENCE_SCHEMA_VERSION = "1.0";

export const EVIDENCE_PACK_LIFECYCLES = ["REQUESTED", "GENERATING", "READY", "FAILED", "REVOKED", "EXPIRED"] as const;
export type EvidencePackLifecycle = (typeof EVIDENCE_PACK_LIFECYCLES)[number];

export const EVIDENCE_READINESS = ["COMPLETE", "REVIEW_REQUIRED", "CONFIGURATION_REQUIRED", "INSUFFICIENT_EVIDENCE"] as const;
export type EvidenceReadiness = (typeof EVIDENCE_READINESS)[number];

export const EVIDENCE_SCOPE_TYPES = ["ORGANIZATION", "INCIDENT", "PROCESSING_ACTIVITY", "PRIVACY_REQUEST"] as const;
export type EvidenceScopeType = (typeof EVIDENCE_SCOPE_TYPES)[number];

/** Closed source-record classifications projected into a pack. */
export const EVIDENCE_ENTITY_TYPES = [
  "PROCESSING_ACTIVITY",
  "PRIVACY_REQUEST",
  "PRIVACY_REQUEST_AGGREGATE",
  "CONSENT_AGGREGATE",
  "LEGAL_DOCUMENT",
  "RETENTION_POLICY",
  "LEGAL_HOLD",
  "DATA_EXPORT_REQUEST",
  "DATA_EXPORT_AGGREGATE",
  "DATA_DELETION_REQUEST",
  "DATA_DELETION_AGGREGATE",
  "SUBPROCESSOR",
  "DATA_TRANSFER",
  "COMPLIANCE_INCIDENT",
  "COMPLIANCE_INCIDENT_ACTION_AGGREGATE",
  "COMPLIANCE_INCIDENT_TIMELINE_AGGREGATE",
  "PROVIDER_POLICY",
  "ENTITLEMENT_OVERRIDE",
  "AUDIT_AGGREGATE",
  "UNSUPPORTED",
] as const;
export type EvidenceEntityType = (typeof EVIDENCE_ENTITY_TYPES)[number];

export function isEvidenceScopeType(v: unknown): v is EvidenceScopeType {
  return typeof v === "string" && (EVIDENCE_SCOPE_TYPES as readonly string[]).includes(v);
}
export function isEvidenceReadiness(v: unknown): v is EvidenceReadiness {
  return typeof v === "string" && (EVIDENCE_READINESS as readonly string[]).includes(v);
}
export function isSafeSchemaVersion(v: unknown): v is string {
  return typeof v === "string" && /^[0-9]+\.[0-9]+$/.test(v);
}

/**
 * Deterministic fail-closed precedence:
 *   CONFIGURATION_REQUIRED  >  INSUFFICIENT_EVIDENCE  >  REVIEW_REQUIRED  >  COMPLETE
 * The pack readiness is the single most-cautious state across all items. An empty pack
 * (no governed evidence) is INSUFFICIENT_EVIDENCE — never a silent COMPLETE. Any value
 * outside the closed vocabulary is treated as CONFIGURATION_REQUIRED (never dropped).
 */
const READINESS_RANK: Record<EvidenceReadiness, number> = {
  COMPLETE: 0,
  REVIEW_REQUIRED: 1,
  INSUFFICIENT_EVIDENCE: 2,
  CONFIGURATION_REQUIRED: 3,
};

export function normalizeReadiness(v: unknown): EvidenceReadiness {
  return isEvidenceReadiness(v) ? v : "CONFIGURATION_REQUIRED";
}

export function foldReadiness(statuses: ReadonlyArray<unknown>): EvidenceReadiness {
  if (statuses.length === 0) return "INSUFFICIENT_EVIDENCE";
  let worst: EvidenceReadiness = "COMPLETE";
  for (const s of statuses) {
    const n = normalizeReadiness(s);
    if (READINESS_RANK[n] > READINESS_RANK[worst]) worst = n;
  }
  return worst;
}
