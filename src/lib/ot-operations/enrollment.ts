// PHASE 94 — the browser's door to the machine-credential enrollment endpoints.
//
// Deliberately SEPARATE from `mutations.ts`. That module is the metadata-only
// onboarding client and is contract-locked (94C2) to POST/PATCH and four
// endpoints, with the words "credential"/"DELETE"/"rotate"/"revoke" forbidden —
// so the metadata surface can never grow a destructive or credential capability
// by accident. Enrollment IS that capability, so it lives here on its own, next
// to its own static test.
//
// The one-time credential is returned by the server exactly once. This module
// hands it straight back to the caller; it never stores it, never logs it, and
// never puts it in a URL. The enrollment POSTs carry NO request body (there is
// nothing for the client to send — the server generates the secret), so there is
// no Content-Type and no payload here to leak.

export type EnrollmentFailureCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SECRET_BACKEND_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "FAILED";

export class EnrollmentError extends Error {
  readonly code: EnrollmentFailureCode;
  readonly status: number;
  constructor(code: EnrollmentFailureCode, status: number) {
    // For a stack trace only. The UI renders a localized string chosen by
    // `code`; the server's fixed English message is never surfaced.
    super(`OT enrollment failed (${code})`);
    this.name = "EnrollmentError";
    this.code = code;
    this.status = status;
  }
}

/**
 * The one-time enrollment/rotation result.
 *
 * The server returns `credential` and `signingKeyRef` ONCE. The caller shows
 * them and discards them; they are never retrievable again.
 */
export interface EnrollmentCredentialResult {
  gatewayId: string;
  signingKeyRef: string;
  credential: string;
  signatureAlgorithm: string;
  version: number;
  issuedAt: string;
}

/** Map a response onto the enrollment vocabulary — the CODE decides, not status. */
function classify(status: number, code: unknown): EnrollmentFailureCode {
  switch (code) {
    case "UNAUTHENTICATED":
      return "UNAUTHENTICATED";
    case "FORBIDDEN":
    case "CAPABILITY_NOT_ALLOWED":
      return "FORBIDDEN";
    case "NOT_FOUND":
      return "NOT_FOUND";
    case "CONFLICT":
      return "CONFLICT";
    case "SECRET_BACKEND_UNAVAILABLE":
      return "SECRET_BACKEND_UNAVAILABLE";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "TRANSIENT_FAILURE":
      return "UNAVAILABLE";
    default:
      break;
  }
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "UNAVAILABLE";
  return "FAILED";
}

async function call<T>(path: string, method: "POST" | "DELETE"): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    throw new EnrollmentError("FAILED", 0);
  }

  const parsed = (await response.json().catch(() => null)) as
    | { ok?: boolean; data?: unknown; code?: unknown }
    | null;

  if (!response.ok || parsed?.ok !== true) {
    throw new EnrollmentError(classify(response.status, parsed?.code), response.status);
  }
  return parsed.data as T;
}

const base = (id: string) => `/api/ot/gateways/${encodeURIComponent(id)}/enrollment`;

/** Issue a NEW machine credential. The result is shown once and never again. */
export function enrollGateway(id: string): Promise<EnrollmentCredentialResult> {
  return call<EnrollmentCredentialResult>(base(id), "POST");
}

/** Rotate the credential, returning the replacement once; the old one is retired. */
export function rotateGatewayCredential(id: string): Promise<EnrollmentCredentialResult> {
  return call<EnrollmentCredentialResult>(`${base(id)}/rotate`, "POST");
}

/** Revoke the credential. Fail-closed and idempotent; no secret is returned. */
export function revokeGatewayCredential(id: string): Promise<{ gatewayId: string }> {
  return call<{ gatewayId: string }>(`${base(id)}/revoke`, "POST");
}

/** Delete the enrollment (secret + reference). Idempotent; no secret is returned. */
export function deleteGatewayEnrollment(id: string): Promise<{ gatewayId: string }> {
  return call<{ gatewayId: string }>(base(id), "DELETE");
}
