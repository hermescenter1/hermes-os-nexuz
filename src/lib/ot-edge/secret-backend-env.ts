// PHASE 95 — the single source of truth for the OT secret-backend environment
// variable NAMES (never values). Both the runtime resolver (secret-backend.ts)
// and the readiness surface (secret-backend-health.ts) read from this list, so
// the "what makes the backend configured" contract can never drift between them.
//
// This module holds names only. It reads no environment, performs no I/O, and is
// safe to import anywhere server-side.

export const SECRET_BACKEND_ENV = {
  /** Must equal exactly "openbao" to enable the writable backend. */
  toggle: "OT_SECRET_BACKEND",
  /** Every variable that must be present for an ENABLED backend to start. */
  required: [
    "OPENBAO_ENDPOINT",
    "OPENBAO_KV_MOUNT",
    "OPENBAO_KV_PREFIX",
    "OPENBAO_APPROLE_MOUNT",
    "OPENBAO_APPROLE_ROLE_ID_FILE",
    "OPENBAO_APPROLE_SECRET_ID_FILE",
  ] as const,
  /** Optional bounded-client tuning (defaults apply when unset). */
  optional: [
    "OPENBAO_EXPIRY_SKEW_SECONDS",
    "OPENBAO_REQUEST_TIMEOUT_MS",
    "OPENBAO_MAX_RESPONSE_BYTES",
    "OPENBAO_ALLOW_INSECURE_LOOPBACK",
  ] as const,
} as const;
