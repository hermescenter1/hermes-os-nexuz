// PHASE 94B4.1 — cryptographic machine authentication for edge gateways.
//
// WHY THIS EXISTS
// Phase 94B4 protected envelope ingestion with `manage_ot_gateway`, a HUMAN
// permission. In practice that meant a physical gateway could only submit
// telemetry while carrying an organization administrator's browser session —
// which is not machine authentication, and would have handed every gateway an
// administrator identity. This module replaces that with the only credential a
// gateway actually holds: its HMAC signature over the envelope.
//
// THE CREDENTIAL IS THE SIGNATURE, NOT THE IDENTIFIER
// `ingestionId` is a lookup handle. Knowing it proves nothing and grants
// nothing; it only selects which record a signature is checked against. Because
// an unauthenticated caller supplies it, the lookup that resolves it is the one
// query in this codebase that is deliberately not organization-scoped — the
// organization is the OUTPUT of authentication, never an input to it.
//
// NO HUMAN IDENTITY IS EVER FABRICATED
// `GatewayMachineContext` has no userId and no role. A gateway authenticates as
// a gateway, is never an ADMIN, and its context cannot be passed to any
// human-authorized service, because those take `OtServiceContext` instead.
//
// WHY THIS LIVES IN THE DOMAIN LAYER AND NOT UNDER http/
// The persistence adapters implement the lookup this module declares. If the
// type lived beside the route helpers, the persistence layer would have to
// import `next/server` to satisfy it.

import { createHash, randomBytes } from "node:crypto";
import {
  GatewayEnvelopeSchema,
  ENVELOPE_LIMITS,
  PAYLOAD_CAPABILITY,
  type GatewayEnvelope,
} from "./gateway-envelope";
import { verifyEnvelopeSignature, type SecretProvider } from "./envelope-signature";

/** Brand: this context can only be produced by a successful HMAC verification. */
declare const MACHINE_AUTHENTICATED: unique symbol;

/**
 * The authenticated identity of a machine.
 *
 * Every field is derived from the server's own gateway record. There is no
 * userId, no role and no human permission set — a gateway's authority is
 * exactly the capability list an operator provisioned for it.
 */
export interface GatewayMachineContext {
  readonly [MACHINE_AUTHENTICATED]: true;
  readonly gatewayId: string;
  readonly organizationId: string;
  readonly siteId: string | null;
  readonly capabilities: readonly string[];
  readonly lifecycle: string;
  /** Correlates the audit and log lines produced by one ingestion. */
  readonly requestId: string | null;
}

/**
 * The minimum record needed to authenticate a gateway.
 *
 * Deliberately narrow: no organization name, no user, no tenant configuration,
 * no gateway metadata. A pre-authentication lookup must not become a way to
 * read tenant data by guessing identifiers.
 */
export interface GatewayAuthRecord {
  gatewayId: string;
  ingestionId: string;
  organizationId: string;
  siteId: string | null;
  lifecycle: string;
  disabled: boolean;
  simulatorMode: boolean;
  capabilities: string[];
  signingKeyRef: string | null;
}

/** Resolves an ingestion identifier to its auth record, or null. */
export type GatewayAuthLookup = (ingestionId: string) => Promise<GatewayAuthRecord | null>;

/**
 * The shape of an ingestion identifier.
 *
 * Checked before the database is touched so a malformed or oversized value
 * never reaches a query, and so the column's 64-character bound is enforced in
 * the application as well as in the schema.
 */
export const INGESTION_ID_PATTERN = /^[A-Za-z0-9_-]{24,64}$/;

/**
 * Mint an ingestion identifier.
 *
 * Server-generated and high-entropy on purpose. `IndustrialGateway.gatewayId`
 * is globally unique but operator-supplied — typically a serial number — and
 * therefore guessable; it is unsuitable as the handle an unauthenticated
 * endpoint accepts. 32 bytes of CSPRNG output, base64url-encoded, is not.
 */
export function generateIngestionId(): string {
  return randomBytes(32).toString("base64url").slice(0, 43);
}

/**
 * Why a request was refused.
 *
 * Used INTERNALLY only, for metrics and audit. The HTTP layer collapses every
 * value to one generic response, so a prober cannot tell an unknown gateway
 * from a bad signature.
 */
export type MachineAuthRejection =
  | "MALFORMED"
  | "OVERSIZED"
  | "INVALID_AUTH"
  | "STALE"
  | "CAPABILITY";

export type MachineAuthResult =
  | { ok: true; ctx: GatewayMachineContext; envelope: GatewayEnvelope }
  | { ok: false; rejection: MachineAuthRejection; gatewayId: string | null };

export interface MachineAuthInput {
  /** The opaque handle presented by the machine, from a request header. */
  ingestionId: string | null;
  envelope: unknown;
  /** The exact bytes whose checksum the envelope commits to. */
  payload: string;
  /** The gateway id from the route path; must match the envelope. */
  pathGatewayId: string;
  lookup: GatewayAuthLookup;
  secrets: SecretProvider;
  now: Date;
  simulatorAllowed: boolean;
  requestId: string | null;
}

/**
 * Authenticate a machine request.
 *
 * ORDER IS THE SECURITY PROPERTY. Cheap structural gates run first; the HMAC —
 * the only expensive step — runs last, so an unauthenticated caller cannot use
 * this endpoint as a CPU oracle. Just as importantly, this function performs no
 * writes at all: the caller reserves a nonce only after `ok: true`, so a failed
 * authentication can neither burn a nonce nor pre-consume one a legitimate
 * gateway is about to use.
 */
export async function authenticateGateway(input: MachineAuthInput): Promise<MachineAuthResult> {
  // 1. Structure. An envelope that is not an envelope is refused before
  //    anything reads a field from it.
  const parsed = GatewayEnvelopeSchema.safeParse(input.envelope);
  if (!parsed.success) return { ok: false, rejection: "MALFORMED", gatewayId: null };
  const env = parsed.data;

  // 2. The path is authoritative: an envelope naming a different gateway than
  //    the URL is refused before any lookup.
  if (env.gatewayId !== input.pathGatewayId) {
    return { ok: false, rejection: "MALFORMED", gatewayId: null };
  }

  // 3. Size, before anything hashes the payload.
  if (Buffer.byteLength(input.payload, "utf8") > ENVELOPE_LIMITS.maxPayloadBytes) {
    return { ok: false, rejection: "OVERSIZED", gatewayId: null };
  }

  // 4. Handle shape, before the database is touched.
  const handle = input.ingestionId ?? "";
  if (!INGESTION_ID_PATTERN.test(handle)) {
    return { ok: false, rejection: "INVALID_AUTH", gatewayId: null };
  }

  // 5. Resolve the gateway GLOBALLY by its opaque handle. The organization is
  //    read FROM this record — never from the request.
  const gw = await input.lookup(handle);
  // An unknown gateway and every later authentication failure share one
  // rejection value, so existence is never disclosed.
  if (!gw) return { ok: false, rejection: "INVALID_AUTH", gatewayId: null };

  // 6. The handle and the named gateway must describe the same device.
  if (gw.gatewayId !== env.gatewayId) {
    return { ok: false, rejection: "INVALID_AUTH", gatewayId: null };
  }

  // 7. Lifecycle. A revoked or disabled gateway is refused exactly like an
  //    unknown one.
  if (gw.disabled || gw.lifecycle === "DISABLED" || gw.lifecycle === "REVOKED") {
    return { ok: false, rejection: "INVALID_AUTH", gatewayId: gw.gatewayId };
  }
  if (gw.simulatorMode && !input.simulatorAllowed) {
    return { ok: false, rejection: "INVALID_AUTH", gatewayId: gw.gatewayId };
  }

  // 8. Capability — a gateway may only send what it was provisioned to send.
  const required = PAYLOAD_CAPABILITY[env.payloadType];
  if (!gw.capabilities.includes(required)) {
    return { ok: false, rejection: "CAPABILITY", gatewayId: gw.gatewayId };
  }

  // 9. Freshness, bounded in BOTH directions: a far-future stamp would
  //    otherwise mint an envelope that stays valid indefinitely.
  const stamped = Date.parse(env.timestamp);
  if (!Number.isFinite(stamped)) {
    return { ok: false, rejection: "MALFORMED", gatewayId: gw.gatewayId };
  }
  if (Math.abs(input.now.getTime() - stamped) > ENVELOPE_LIMITS.maxClockSkewMs) {
    return { ok: false, rejection: "STALE", gatewayId: gw.gatewayId };
  }

  // 10. Integrity of the payload the signature commits to. Verified before the
  //     MAC so a mismatched body costs a hash rather than a full verification.
  const actual = createHash("sha256").update(Buffer.from(input.payload, "utf8")).digest("hex");
  if (actual !== env.payloadChecksum) {
    return { ok: false, rejection: "INVALID_AUTH", gatewayId: gw.gatewayId };
  }

  // 11. THE CREDENTIAL. The secret is dereferenced from the SERVER's registered
  //     reference; the envelope's own `signingKeyRef` is compared, never used to
  //     select a secret, so a gateway cannot point at another gateway's key.
  const verdict = await verifyEnvelopeSignature(
    {
      envelopeVersion: env.envelopeVersion,
      organizationId: env.organizationId,
      gatewayId: env.gatewayId,
      timestamp: env.timestamp,
      nonce: env.nonce,
      idempotencyKey: env.idempotencyKey,
      payloadType: env.payloadType,
      payloadChecksum: env.payloadChecksum,
      signingKeyRef: env.signingKeyRef,
      signatureAlgorithm: env.signatureAlgorithm,
    },
    env.signature,
    input.secrets,
    gw.signingKeyRef ?? "",
  );
  if (verdict !== "VALID") {
    return { ok: false, rejection: "INVALID_AUTH", gatewayId: gw.gatewayId };
  }

  // 12. The envelope's claimed organization must agree with the authenticated
  //     record. It is CHECKED, never trusted — the record is the authority, and
  //     the returned context carries the record's value regardless.
  if (env.organizationId !== gw.organizationId) {
    return { ok: false, rejection: "INVALID_AUTH", gatewayId: gw.gatewayId };
  }

  return { ok: true, envelope: env, ctx: machineContext(gw, input.requestId) };
}

/**
 * The ONLY producer of a machine context.
 *
 * Private to this module: exported construction would let a route assemble a
 * context from request JSON, which is exactly what the brand prevents.
 */
function machineContext(gw: GatewayAuthRecord, requestId: string | null): GatewayMachineContext {
  const ctx: Omit<GatewayMachineContext, typeof MACHINE_AUTHENTICATED> = {
    gatewayId: gw.gatewayId,
    organizationId: gw.organizationId,
    siteId: gw.siteId,
    capabilities: [...gw.capabilities],
    lifecycle: gw.lifecycle,
    requestId,
  };
  return ctx as GatewayMachineContext;
}
