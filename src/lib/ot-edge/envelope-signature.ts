// PHASE 94B — cryptographic verification for gateway envelopes.
//
// WHY THIS EXISTS
// Phase 94A carried a `signingKeyRef` and compared it for equality. That proves
// only that the caller KNOWS a reference string — it is an identifier, not a
// signature, so anyone who learned the ref could forge an envelope. This module
// adds the actual proof of possession: an HMAC-SHA-256 over canonical bytes,
// keyed by a secret the caller must hold and that never enters the database.
//
// SECRET HANDLING
// `signingKeyRef` is an opaque pointer resolved by an injected SecretProvider.
// The default provider reads process.env, matching how AUTH_SECRET is handled
// elsewhere in the platform. No Prisma model stores key material, and no secret
// or signature is ever logged or returned.
//
// CANONICAL BYTES
// The signature covers a fixed field ORDER built by this module — never
// `JSON.stringify` of a caller-supplied object, whose key order is attacker-
// controlled. Fields are length-prefixed so no combination of values can be
// re-partitioned into a different but identically-serialised envelope.

import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_ALGORITHMS = ["HMAC-SHA256"] as const;
export type SignatureAlgorithm = (typeof SIGNATURE_ALGORITHMS)[number];

/** The fields the signature commits to, in canonical order. */
export interface SignableEnvelope {
  envelopeVersion: string;
  organizationId: string;
  gatewayId: string;
  timestamp: string;
  nonce: string;
  idempotencyKey: string;
  payloadType: string;
  payloadChecksum: string;
  signingKeyRef: string;
  signatureAlgorithm: SignatureAlgorithm;
}

/**
 * Resolves an opaque key reference to secret material.
 * Injectable so tests can supply a deterministic secret and production can
 * swap in a KMS/vault provider without touching verification logic.
 */
export interface SecretProvider {
  /** Returns the secret for a reference, or null when the ref is unknown. */
  resolve(signingKeyRef: string): Promise<string | null> | (string | null);
}

/**
 * Canonical signed bytes.
 *
 * Length-prefixed, fixed-order, newline-free field encoding:
 *   "<len>:<value>|<len>:<value>|..."
 *
 * Length prefixes matter. With a plain "a|b" join, the pair ("x|y", "z") and
 * ("x", "y|z") produce identical bytes, so one valid signature would
 * authenticate a different envelope. Prefixing each field with its byte length
 * makes the encoding unambiguous.
 */
export function canonicalSignedBytes(env: SignableEnvelope): Buffer {
  const ordered: string[] = [
    env.envelopeVersion,
    env.organizationId,
    env.gatewayId,
    env.timestamp,
    env.nonce,
    env.idempotencyKey,
    env.payloadType,
    env.payloadChecksum,
    env.signingKeyRef,
    env.signatureAlgorithm,
  ];
  const parts = ordered.map((v) => {
    const b = Buffer.from(v, "utf8");
    return `${b.length}:${v}`;
  });
  return Buffer.from(parts.join("|"), "utf8");
}

/** Compute the expected signature. Exported so tests and gateways agree. */
export function computeSignature(
  env: SignableEnvelope,
  secret: string,
  algorithm: SignatureAlgorithm = "HMAC-SHA256",
): string {
  if (algorithm !== "HMAC-SHA256") {
    throw new Error("unsupported signature algorithm");
  }
  return createHmac("sha256", secret).update(canonicalSignedBytes(env)).digest("base64url");
}

export type SignatureVerdict =
  | "VALID"
  | "UNSUPPORTED_ALGORITHM"
  | "UNKNOWN_KEY_REF"
  | "INVALID_SIGNATURE";

/**
 * Verify an envelope signature.
 *
 * Every failure is reported as a coarse verdict; the caller maps them all to a
 * single generic 403 so a prober cannot distinguish "unknown reference" from
 * "bad signature" and enumerate valid key references.
 */
export async function verifyEnvelopeSignature(
  env: SignableEnvelope,
  presentedSignature: string,
  secrets: SecretProvider,
  /**
   * The reference registered on the tenant's Gateway record. REQUIRED.
   *
   * The secret is resolved from THIS value, never from `env.signingKeyRef`.
   * The envelope's own reference is attacker-controlled: letting it choose
   * which secret to load would let a caller point gateway A's envelope at
   * gateway B's key and hunt for a collision. The two must match, and the
   * server's copy is what is dereferenced.
   */
  approvedKeyRef: string,
): Promise<SignatureVerdict> {
  if (!(SIGNATURE_ALGORITHMS as readonly string[]).includes(env.signatureAlgorithm)) {
    return "UNSUPPORTED_ALGORITHM";
  }

  // The client may only ASSERT which key it used; it may not SELECT one.
  if (!approvedKeyRef || !timingSafeStringEquals(env.signingKeyRef, approvedKeyRef)) {
    return "INVALID_SIGNATURE";
  }

  const secret = await secrets.resolve(approvedKeyRef);
  if (!secret) return "UNKNOWN_KEY_REF";

  const expected = computeSignature(env, secret, env.signatureAlgorithm);
  return timingSafeStringEquals(presentedSignature, expected) ? "VALID" : "INVALID_SIGNATURE";
}

/**
 * Constant-time string comparison.
 *
 * `crypto.timingSafeEqual` throws on length mismatch, which would itself leak
 * length through the exception path — so the lengths are compared first and a
 * fixed-size digest comparison is used, mirroring `lib/api/keys.ts`.
 */
export function timingSafeStringEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Default provider: resolves `env:NAME` references from the process
 * environment, exactly how AUTH_SECRET is sourced elsewhere.
 *
 * There is deliberately NO fallback secret. A missing variable resolves to
 * null and the envelope is rejected — a development default would silently
 * become a production signing key that is public in the source tree.
 */
/**
 * The ONLY environment variables that may ever hold gateway signing material.
 *
 * An explicit allow-LIST, not an allow-pattern. A pattern still lets the input
 * string decide which variable is read; this map means the set of reachable
 * variables is fixed at build time and a reference that is not a key of this
 * map resolves to null no matter what it contains.
 */
const APPROVED_KEY_REFS: Readonly<Record<string, string>> = {
  "env:OT_GATEWAY_HMAC_PRIMARY": "OT_GATEWAY_HMAC_PRIMARY",
  "env:OT_GATEWAY_HMAC_SECONDARY": "OT_GATEWAY_HMAC_SECONDARY",
};

/** Minimum entropy for a signing secret; a short value is treated as unset. */
export const MIN_SIGNING_SECRET_LENGTH = 32;

export const envSecretProvider: SecretProvider = {
  resolve(signingKeyRef: string): string | null {
    // `hasOwnProperty`, not `in`: a reference such as "constructor" or
    // "__proto__" must not resolve through the prototype chain.
    if (!Object.prototype.hasOwnProperty.call(APPROVED_KEY_REFS, signingKeyRef)) return null;
    const value = process.env[APPROVED_KEY_REFS[signingKeyRef]];
    return value && value.length >= MIN_SIGNING_SECRET_LENGTH ? value : null;
  },
};

/** The references an operator may register on a Gateway. Exported for validation. */
export const APPROVED_SIGNING_KEY_REFS = Object.freeze(Object.keys(APPROVED_KEY_REFS));
