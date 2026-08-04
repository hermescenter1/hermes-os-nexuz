/**
 * Phase 97 Part G — Governed subject data export lifecycle (pure, I/O-free).
 *
 * A closed state machine for the CHILD export job. The authoritative parent is
 * the PrivacyRequest; this job never broadens the parent's subject or org. Legacy
 * rows land in the fail-closed REVIEW_REQUIRED state (no invented approval).
 * Execution is disabled by default and expiry is configuration-driven — no
 * statutory/product duration is assumed.
 */

export type ExportLifecycle =
  | "REVIEW_REQUIRED"
  | "REQUESTED" | "AUTHORISED" | "COLLECTING" | "REDACTING" | "PACKAGING" | "READY"
  | "EXPIRED" | "FAILED" | "REVOKED" | "CANCELLED";

export const EXPORT_LIFECYCLES: ExportLifecycle[] = [
  "REVIEW_REQUIRED", "REQUESTED", "AUTHORISED", "COLLECTING", "REDACTING", "PACKAGING",
  "READY", "EXPIRED", "FAILED", "REVOKED", "CANCELLED",
];

/** Lifecycle states that count as an ACTIVE job (block a new job for the parent). */
export const ACTIVE_EXPORT_LIFECYCLES: ExportLifecycle[] = [
  "REQUESTED", "AUTHORISED", "COLLECTING", "REDACTING", "PACKAGING", "READY",
];
export const TERMINAL_EXPORT_LIFECYCLES: ExportLifecycle[] = ["EXPIRED", "FAILED", "REVOKED", "CANCELLED"];

export const EXPORT_TRANSITIONS: Record<ExportLifecycle, ExportLifecycle[]> = {
  REVIEW_REQUIRED: ["CANCELLED"], // legacy fail-closed — never auto-authorised
  REQUESTED:  ["AUTHORISED", "CANCELLED", "FAILED"],
  AUTHORISED: ["COLLECTING", "CANCELLED", "FAILED"],
  COLLECTING: ["REDACTING", "FAILED", "CANCELLED"],
  REDACTING:  ["PACKAGING", "FAILED", "CANCELLED"],
  PACKAGING:  ["READY", "FAILED", "CANCELLED"],
  READY:      ["EXPIRED", "REVOKED"],
  EXPIRED:    [],
  FAILED:     [],
  REVOKED:    [],
  CANCELLED:  [],
};

/** Permission class for the API-callable transitions (executor steps are internal). */
export type ExportAction = "manage" | "approve";
const TRANSITION_ACTION: Record<string, ExportAction> = {
  "REQUESTED->AUTHORISED":       "approve",
  "REQUESTED->CANCELLED":        "manage",
  "AUTHORISED->CANCELLED":       "manage",
  "READY->REVOKED":              "manage",
  "REVIEW_REQUIRED->CANCELLED":  "manage",
};

/** The internal executor steps (AUTHORISED→…→READY) — NOT directly API-callable. */
const EXECUTOR_STEPS = new Set(["AUTHORISED->COLLECTING", "COLLECTING->REDACTING", "REDACTING->PACKAGING", "PACKAGING->READY"]);

/** PrivacyRequest types whose fulfilment may produce a subject-data export. */
export const EXPORT_COMPATIBLE_REQUEST_TYPES = ["DATA_EXPORT", "ACCESS_REQUEST"];
/** Parent PrivacyRequest lifecycle states that are approved for export fulfilment. */
export const EXPORT_APPROVED_PARENT_STATES = ["APPROVED", "PARTIALLY_APPROVED", "FULFILMENT_IN_PROGRESS"];

export interface ParentExportEligibility {
  ok: boolean;
  code?: "PARENT_TYPE_INCOMPATIBLE" | "PARENT_NOT_APPROVED" | "IDENTITY_NOT_VERIFIED";
}
/** Fail-closed eligibility of a parent PrivacyRequest for an export child job. */
export function assessParentExportEligibility(parent: {
  requestType: string; status: string; identityVerifiedAt: Date | null;
}): ParentExportEligibility {
  if (!EXPORT_COMPATIBLE_REQUEST_TYPES.includes(parent.requestType)) return { ok: false, code: "PARENT_TYPE_INCOMPATIBLE" };
  if (!EXPORT_APPROVED_PARENT_STATES.includes(parent.status)) return { ok: false, code: "PARENT_NOT_APPROVED" };
  if (!parent.identityVerifiedAt) return { ok: false, code: "IDENTITY_NOT_VERIFIED" };
  return { ok: true };
}

export function isKnownExportLifecycle(s: string): s is ExportLifecycle {
  return (EXPORT_LIFECYCLES as string[]).includes(s);
}
export function isActiveExportLifecycle(s: string): boolean {
  return (ACTIVE_EXPORT_LIFECYCLES as string[]).includes(s);
}
export function isTerminalExportLifecycle(s: string): boolean {
  return (TERMINAL_EXPORT_LIFECYCLES as string[]).includes(s);
}
export function canTransitionExport(from: string, to: string): boolean {
  if (from === to) return false;
  const allowed = EXPORT_TRANSITIONS[from as ExportLifecycle];
  return Array.isArray(allowed) && (allowed as string[]).includes(to);
}
/** The API permission a transition needs, null if not an API-callable transition. */
export function exportTransitionAction(from: string, to: string): ExportAction | null {
  if (!canTransitionExport(from, to)) return null;
  return TRANSITION_ACTION[`${from}->${to}`] ?? null;
}
export function isExecutorStep(from: string, to: string): boolean {
  return EXECUTOR_STEPS.has(`${from}->${to}`);
}

// ── Execution posture (disabled by default) ───────────────────────────────────

export function isExportExecutionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COMPLIANCE_EXPORT_EXECUTION_ENABLED === "true";
}

// ── Expiry policy (configuration-driven, fail-closed) ─────────────────────────

export type ExportExpiryStatus = "CONFIGURED" | "CONFIGURATION_REQUIRED";
export interface ExportExpiryConfig { retentionDays?: number }
export interface ResolvedExportExpiry { status: ExportExpiryStatus; expiresAt: Date | null }

export function readExportExpiryPolicyConfig(env: Record<string, string | undefined> = process.env): ExportExpiryConfig {
  const raw = env.COMPLIANCE_EXPORT_RETENTION_DAYS;
  if (raw === undefined) return {};
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? { retentionDays: n } : {};
}

/** Resolve the export expiry. Without a configured retention there is NO expiry
 *  and NO download capability may be issued (CONFIGURATION_REQUIRED). */
export function resolveExportExpiry(config: ExportExpiryConfig | null | undefined, readyAt: Date): ResolvedExportExpiry {
  const days = config?.retentionDays;
  if (!days || !Number.isInteger(days) || days <= 0) return { status: "CONFIGURATION_REQUIRED", expiresAt: null };
  const d = new Date(readyAt.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return { status: "CONFIGURED", expiresAt: d };
}
