// PHASE 94 — signed, replay-resistant gateway metadata envelope.
//
// This validates the ENVELOPE around metadata a gateway may submit. It does not
// open a protocol connection, and there is no downstream path from an accepted
// envelope to a device write — the only payload types are metadata imports and
// read-only telemetry.
//
// SECRETS. The envelope carries a `signingKeyRef` — an opaque REFERENCE to a
// secret held in the platform's secret store. Neither this module nor the
// database ever holds the signing material itself.
//
// ORDERING. Checks run cheapest-and-most-decisive first: a disabled gateway or
// an org mismatch is rejected before any hashing, so a hostile caller cannot
// use this endpoint as a hashing oracle or a timing probe for tenant existence.

import { z } from "zod";
import {
  SIGNATURE_ALGORITHMS,
  verifyEnvelopeSignature,
  type SecretProvider,
} from "./envelope-signature";

export const ENVELOPE_VERSION = "1.0" as const;

export const ENVELOPE_LIMITS = {
  /** Maximum payload bytes carried by one envelope. */
  maxPayloadBytes: 2 * 1024 * 1024,
  /** An envelope older (or newer) than this is refused, in milliseconds. */
  maxClockSkewMs: 5 * 60 * 1000,
  /** How long an accepted nonce must be remembered. */
  nonceRetentionMs: 15 * 60 * 1000,
  maxNonceLength: 128,
  minNonceLength: 16,
} as const;

export const PAYLOAD_TYPES = [
  "PROJECT_METADATA",
  "TAG_METADATA",
  "ALARM_METADATA",
  "NETWORK_METADATA",
  "READ_ONLY_TELEMETRY",
] as const;
export type PayloadType = (typeof PAYLOAD_TYPES)[number];

/** The capability a gateway must declare to submit each payload type. */
export const PAYLOAD_CAPABILITY: Record<PayloadType, string> = {
  PROJECT_METADATA: "PROJECT_METADATA_IMPORT",
  TAG_METADATA: "TAG_METADATA_IMPORT",
  ALARM_METADATA: "ALARM_METADATA_IMPORT",
  NETWORK_METADATA: "NETWORK_METADATA_IMPORT",
  READ_ONLY_TELEMETRY: "READ_ONLY_TELEMETRY",
};

export const GatewayEnvelopeSchema = z
  .object({
    envelopeVersion: z.literal(ENVELOPE_VERSION),
    organizationId: z.string().trim().min(1).max(64),
    /** The gateway's external hardware identifier. */
    gatewayId: z.string().trim().min(1).max(191),
    /** ISO-8601 instant the gateway stamped. Untrusted; validated for skew. */
    timestamp: z.string().datetime(),
    nonce: z.string().trim().min(ENVELOPE_LIMITS.minNonceLength).max(ENVELOPE_LIMITS.maxNonceLength),
    idempotencyKey: z.string().trim().min(1).max(128),
    payloadType: z.enum(PAYLOAD_TYPES),
    /** SHA-256 hex of the payload the gateway sent. */
    payloadChecksum: z.string().regex(/^[a-f0-9]{64}$/, "payloadChecksum must be sha256 hex"),
    /** Opaque reference to the signing secret. NEVER the secret itself. */
    signingKeyRef: z.string().trim().min(1).max(191),
    signatureAlgorithm: z.enum(SIGNATURE_ALGORITHMS),
    /** base64url HMAC over the canonical signed bytes. Proof of possession. */
    signature: z.string().trim().min(16).max(512),
  })
  .strict();

export type GatewayEnvelope = z.infer<typeof GatewayEnvelopeSchema>;

export type EnvelopeRejection =
  | "MALFORMED"
  | "GATEWAY_UNKNOWN"
  | "GATEWAY_DISABLED"
  | "ORGANIZATION_MISMATCH"
  | "CAPABILITY_MISSING"
  | "STALE_TIMESTAMP"
  | "REPLAYED_NONCE"
  | "CHECKSUM_MISMATCH"
  | "SIGNATURE_REF_MISMATCH"
  | "SIGNATURE_INVALID"
  | "PAYLOAD_TOO_LARGE";

/** What the caller must look up before validation; never fetched in here. */
export interface GatewayRecord {
  gatewayId: string;
  organizationId: string;
  disabled: boolean;
  lifecycle: string;
  capabilities: readonly string[];
  signingKeyRef: string | null;
  simulatorMode: boolean;
}

export interface EnvelopeCheckInput {
  envelope: GatewayEnvelope;
  gateway: GatewayRecord | null;
  /** Actual SHA-256 of the received payload, computed by the caller. */
  actualPayloadChecksum: string;
  payloadByteLength: number;
  /** True when this (gatewayId, nonce) pair was already recorded. */
  nonceAlreadySeen: boolean;
  /** Injected so validation stays a pure function of its inputs. */
  now: Date;
  /** Whether simulator envelopes are permitted in this environment. */
  simulatorAllowed: boolean;
}

export type EnvelopeCheck =
  | { ok: true; envelope: GatewayEnvelope }
  | { ok: false; rejection: EnvelopeRejection };

/**
 * Non-cryptographic pre-checks. Pure — the caller performs every lookup and
 * passes the clock in, so the same inputs always produce the same verdict.
 *
 * NOT SUFFICIENT ON ITS OWN. Possession of the signing secret is proven by
 * `verifyGatewayEnvelope`, which runs these gates first and then the HMAC.
 * Call that function from routes; this one is exported for unit testing and
 * for callers that have already verified the signature.
 *
 * A rejection names the CATEGORY only. It never reveals whether a gateway
 * exists in another tenant: both "unknown gateway" and "wrong organization"
 * are answered identically by the caller (404), so this cannot be used to
 * enumerate other tenants' gateways.
 */
export function checkGatewayEnvelope(input: EnvelopeCheckInput): EnvelopeCheck {
  const { envelope, gateway, now } = input;

  // 1. Existence + tenancy, before any expensive work.
  if (!gateway) return { ok: false, rejection: "GATEWAY_UNKNOWN" };
  if (gateway.organizationId !== envelope.organizationId) {
    return { ok: false, rejection: "ORGANIZATION_MISMATCH" };
  }

  // 2. Lifecycle: a disabled or revoked gateway is silent regardless of payload.
  if (gateway.disabled || gateway.lifecycle === "DISABLED" || gateway.lifecycle === "REVOKED") {
    return { ok: false, rejection: "GATEWAY_DISABLED" };
  }
  if (gateway.simulatorMode && !input.simulatorAllowed) {
    return { ok: false, rejection: "GATEWAY_DISABLED" };
  }

  // 3. Capability: absent capability = operation refused.
  const required = PAYLOAD_CAPABILITY[envelope.payloadType];
  if (!gateway.capabilities.includes(required)) {
    return { ok: false, rejection: "CAPABILITY_MISSING" };
  }

  // 4. Signing-key reference must match the one bound to this gateway.
  if (!gateway.signingKeyRef || gateway.signingKeyRef !== envelope.signingKeyRef) {
    return { ok: false, rejection: "SIGNATURE_REF_MISMATCH" };
  }

  // 5. Size, before hashing comparisons.
  if (input.payloadByteLength > ENVELOPE_LIMITS.maxPayloadBytes) {
    return { ok: false, rejection: "PAYLOAD_TOO_LARGE" };
  }

  // 6. Freshness. Skew is bounded in BOTH directions: a far-future timestamp
  //    would otherwise let an attacker mint an envelope that stays valid.
  const stamped = Date.parse(envelope.timestamp);
  if (!Number.isFinite(stamped)) return { ok: false, rejection: "MALFORMED" };
  if (Math.abs(now.getTime() - stamped) > ENVELOPE_LIMITS.maxClockSkewMs) {
    return { ok: false, rejection: "STALE_TIMESTAMP" };
  }

  // 7. Replay.
  if (input.nonceAlreadySeen) return { ok: false, rejection: "REPLAYED_NONCE" };

  // 8. Integrity, last: only a caller that passed every other gate learns
  //    whether their checksum matched.
  if (!constantTimeEquals(envelope.payloadChecksum, input.actualPayloadChecksum)) {
    return { ok: false, rejection: "CHECKSUM_MISMATCH" };
  }

  return { ok: true, envelope };
}

/**
 * Length-independent, content-constant-time comparison for hex digests.
 * Avoids leaking how many leading characters matched.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** When an accepted nonce may be forgotten. */
export function nonceExpiry(now: Date): Date {
  return new Date(now.getTime() + ENVELOPE_LIMITS.nonceRetentionMs);
}

/** SHA-256 hex of a payload string. */
export async function payloadChecksum(payload: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/** HTTP status for each rejection. Unknown/mismatch both 404: no existence leak. */
export const REJECTION_STATUS: Record<EnvelopeRejection, number> = {
  MALFORMED: 400,
  GATEWAY_UNKNOWN: 404,
  ORGANIZATION_MISMATCH: 404,
  GATEWAY_DISABLED: 403,
  CAPABILITY_MISSING: 403,
  SIGNATURE_REF_MISMATCH: 403,
  SIGNATURE_INVALID: 403,
  STALE_TIMESTAMP: 422,
  REPLAYED_NONCE: 409,
  CHECKSUM_MISMATCH: 422,
  PAYLOAD_TOO_LARGE: 413,
};

/**
 * The authoritative check: structural gates, then cryptographic proof.
 *
 * ORDER MATTERS. Cheap, decisive gates (tenancy, lifecycle, capability, size,
 * freshness, replay) run before any HMAC work, so an unauthenticated prober
 * cannot use this endpoint as a signing oracle or a timing probe. The
 * signature is verified LAST, and every signature-layer failure — unknown key
 * reference, unsupported algorithm, bad MAC — collapses into a single
 * SIGNATURE_INVALID so a prober cannot enumerate valid key references.
 */
export async function verifyGatewayEnvelope(
  input: EnvelopeCheckInput & { signature: string; secrets: SecretProvider },
): Promise<EnvelopeCheck> {
  const pre = checkGatewayEnvelope(input);
  if (!pre.ok) return pre;

  const verdict = await verifyEnvelopeSignature(
    {
      envelopeVersion: input.envelope.envelopeVersion,
      organizationId: input.envelope.organizationId,
      gatewayId: input.envelope.gatewayId,
      timestamp: input.envelope.timestamp,
      nonce: input.envelope.nonce,
      idempotencyKey: input.envelope.idempotencyKey,
      payloadType: input.envelope.payloadType,
      payloadChecksum: input.envelope.payloadChecksum,
      signingKeyRef: input.envelope.signingKeyRef,
      signatureAlgorithm: input.envelope.signatureAlgorithm,
    },
    input.signature,
    input.secrets,
    // The SERVER's registered reference — `checkGatewayEnvelope` has already
    // proven the envelope's own reference matches it, and the secret is
    // dereferenced from this copy, never from caller-supplied text.
    input.gateway?.signingKeyRef ?? "",
  );

  return verdict === "VALID"
    ? { ok: true, envelope: input.envelope }
    : { ok: false, rejection: "SIGNATURE_INVALID" };
}
