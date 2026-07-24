// PHASE 94D0A — the writable secret-manager CONTRACT.
//
// This is an abstraction ONLY. It connects to no Vault/AWS/Azure/GCP, wires
// into no application composition, and implements no enrollment. It exists so a
// future phase can provision per-gateway machine credentials against a real
// external secret manager without storing forgeable key material in PostgreSQL.
//
// WHY A NEW CONTRACT AND NOT AN EXTENSION OF `SecretProvider`
// The existing `SecretProvider` (envelope-signature.ts) is resolve-only and
// keyed on `signingKeyRef: string`. It is left exactly as-is — every machine-
// auth path keeps working. This contract adds the create/rotate/revoke/delete
// surface a writable store needs, and deliberately models secret material as
// raw BYTES (`Uint8Array`), never a string: a `Uint8Array` cannot be silently
// interpolated into a log line, a URL, or a JSON body the way a string can.
//
// WHAT NEVER CROSSES THIS BOUNDARY
//   - A reference never contains secret bytes — it is an opaque handle.
//   - Metadata never contains secret bytes — only reference/version/timestamps.
//   - An error never contains secret bytes or provider internals — only a code.
// Only `resolve` returns bytes, because returning the key is its entire job.

/** Secret material, as raw bytes. Never a string — see the header. */
export type SecretBytes = Uint8Array;

/**
 * An opaque reference to a stored secret.
 *
 * Branded so it cannot be confused with an arbitrary string, and constructed
 * only inside a provider. It carries no secret material and is safe to persist
 * (in a Gateway row) and to pass around; it is NOT a credential.
 */
export type SecretReference = string & { readonly __secretReference: unique symbol };

/** Metadata about a stored secret. Contains no bytes, ever. */
export interface SecretMetadata {
  reference: SecretReference;
  /** Monotonic per-reference version. Used for compare-and-swap on rotate. */
  version: number;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
}

/* ── Errors — a code only, never bytes or provider internals ─────────────── */

export type SecretManagerErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "REFERENCE_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "SECRET_REVOKED"
  | "CLEANUP_FAILED";

const ERROR_MESSAGE: Record<SecretManagerErrorCode, string> = {
  PROVIDER_UNAVAILABLE: "The secret manager is unavailable.",
  REFERENCE_NOT_FOUND: "No secret exists for the reference.",
  VERSION_CONFLICT: "The expected version did not match the active version.",
  SECRET_REVOKED: "The secret has been revoked.",
  CLEANUP_FAILED: "The secret could not be removed.",
};

export class SecretManagerError extends Error {
  readonly code: SecretManagerErrorCode;
  constructor(code: SecretManagerErrorCode) {
    // Fixed message per code — no interpolation of bytes, references or any
    // provider internal. The code is the whole contract.
    super(ERROR_MESSAGE[code]);
    this.name = "SecretManagerError";
    this.code = code;
  }
}

/* ── The writable contract ──────────────────────────────────────────────── */

/**
 * A secret store that can create, resolve, rotate, revoke and delete secrets.
 *
 * `writable: true` is a capability MARKER, not a name — enrollment detects
 * writability structurally (see `isWritableSecretManager`) rather than guessing
 * from a class or provider name.
 */
export interface WritableSecretManager {
  readonly writable: true;

  /** Store new secret bytes; returns the opaque reference and version 1. */
  create(secret: SecretBytes): Promise<SecretMetadata>;

  /**
   * Return the ACTIVE secret bytes for a reference.
   * Throws `REFERENCE_NOT_FOUND` if unknown/deleted, `SECRET_REVOKED` if revoked.
   */
  resolve(reference: SecretReference): Promise<SecretBytes>;

  /**
   * Replace the secret, gated on `expectedVersion` (compare-and-swap).
   * Throws `VERSION_CONFLICT` if the active version differs, so exactly one of
   * two concurrent rotations wins. After success the prior version is inactive.
   */
  rotate(reference: SecretReference, expectedVersion: number, next: SecretBytes): Promise<SecretMetadata>;

  /** Mark the secret revoked; subsequent `resolve` throws `SECRET_REVOKED`. */
  revoke(reference: SecretReference): Promise<SecretMetadata>;

  /** Remove the entry. Idempotent: deleting an absent reference is a no-op. */
  delete(reference: SecretReference): Promise<void>;
}

/**
 * Capability detection.
 *
 * A future enrollment flow calls this to decide whether provisioning is
 * possible — structurally, not by provider name. The existing read-only
 * `SecretProvider` (which has only `resolve` and no `writable` marker) returns
 * false here, so the two can never be confused.
 */
export function isWritableSecretManager(value: unknown): value is WritableSecretManager {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.writable === true &&
    typeof candidate.create === "function" &&
    typeof candidate.resolve === "function" &&
    typeof candidate.rotate === "function" &&
    typeof candidate.revoke === "function" &&
    typeof candidate.delete === "function"
  );
}
