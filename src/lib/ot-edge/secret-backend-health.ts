// PHASE 95 — truthful, bounded readiness/health for the OT machine-credential
// secret backend.
//
// Two honest surfaces, neither of which mutates secret state or emits anything
// sensitive:
//
//   1. readSecretBackendReadiness() — a CONFIGURATION-only classification derived
//      from the environment. It performs ZERO network calls. Disabled resolves
//      to `disabled`; a fully configured backend resolves to
//      `configured_not_checked` (NEVER `healthy` — the console does not run a
//      live probe, so it must not claim health it hasn't observed); an enabled
//      but incompletely configured backend resolves to `degraded`.
//
//   2. classifySecretBackendOutcome() — a pure classifier that maps the result
//      of a REAL credential operation (the enrollment path) to a health status.
//      This is the only way `healthy` / `authentication_failed` / `tls_failed` /
//      `unreachable` are produced, so those states always reflect a real call.
//
// OUTPUT CONTRACT: a status, a fixed non-sensitive reason code, and a `checked`
// flag. Never a token, role/secret id, reference, endpoint, path or upstream
// message. Reasons are a closed vocabulary, so they are safe to log and to
// render in an operator console.

import { SECRET_BACKEND_ENV } from "./secret-backend-env";

// Server-only. Reading credential configuration must never reach a client
// bundle; importing this in a browser throws at load. The message names the
// module only — never a value.
if (typeof window !== "undefined") {
  throw new Error("secret-backend-health is server-only and must not be imported by client code");
}

/** The bounded, low-cardinality health vocabulary. */
export type SecretBackendHealthStatus =
  | "disabled"
  | "configured_not_checked"
  | "healthy"
  | "degraded"
  | "authentication_failed"
  | "tls_failed"
  | "unreachable";

/** A fixed, non-sensitive reason vocabulary — never a message, token or path. */
export type SecretBackendHealthReason =
  | "misconfigured"
  | "authentication"
  | "tls"
  | "network"
  | "provider"
  | null;

export interface SecretBackendHealth {
  readonly status: SecretBackendHealthStatus;
  /** A closed-vocabulary reason code, or null when there is nothing to explain. */
  readonly reason: SecretBackendHealthReason;
  /** True only when a REAL OpenBao call informed this status. */
  readonly checked: boolean;
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Classify the secret backend from configuration alone — NO network call.
 *
 * `disabled` unless `OT_SECRET_BACKEND === "openbao"`. When enabled, every
 * required variable must be present, otherwise the backend cannot start and the
 * status is `degraded` with reason `misconfigured`. A complete configuration is
 * `configured_not_checked`: valid on paper, but never asserted `healthy` without
 * a real probe (which this function deliberately does not perform).
 */
export function readSecretBackendReadiness(): SecretBackendHealth {
  if (readEnv(SECRET_BACKEND_ENV.toggle) !== "openbao") {
    return { status: "disabled", reason: null, checked: false };
  }
  const complete = SECRET_BACKEND_ENV.required.every((name) => readEnv(name) !== null);
  if (!complete) {
    return { status: "degraded", reason: "misconfigured", checked: false };
  }
  return { status: "configured_not_checked", reason: null, checked: false };
}

/** The kind of a REAL credential-operation failure, classified by the caller. */
export type SecretBackendOutcome =
  | { ok: true }
  | { ok: false; kind: "authentication" | "tls" | "network" | "provider" };

/**
 * Map a REAL operation outcome to a health status. This is the only producer of
 * the reachable/authenticated states, so those always reflect a real call
 * (`checked: true`). Never inspects or echoes secret material.
 */
export function classifySecretBackendOutcome(outcome: SecretBackendOutcome): SecretBackendHealth {
  if (outcome.ok) return { status: "healthy", reason: null, checked: true };
  switch (outcome.kind) {
    case "authentication":
      return { status: "authentication_failed", reason: "authentication", checked: true };
    case "tls":
      return { status: "tls_failed", reason: "tls", checked: true };
    case "network":
      return { status: "unreachable", reason: "network", checked: true };
    case "provider":
    default:
      return { status: "degraded", reason: "provider", checked: true };
  }
}
