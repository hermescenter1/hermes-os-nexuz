// PHASE 94B3.3 — end-to-end gateway envelope processing.
//
// THE ORDERING IS THE SECURITY PROPERTY
// The nonce is reserved ONLY after the signature verifies. Reserving earlier
// would let an unauthenticated caller burn nonces — flooding the table and,
// worse, letting them pre-consume a nonce a legitimate gateway is about to use,
// turning a replay guard into a denial-of-service lever.
//
// Everything a prober could use to distinguish outcomes is collapsed: an
// unknown gateway, a gateway in another tenant, a bad reference and a bad MAC
// all produce the same shaped rejection.
//
// No protocol connection is opened, and an accepted envelope can only reach a
// metadata import — there is no path from here to a device write.

import { createHash } from "node:crypto";
import type { OtServiceContext } from "../service-context";
import {
  GatewayEnvelopeSchema,
  ENVELOPE_LIMITS,
  PAYLOAD_CAPABILITY,
  type GatewayEnvelope,
} from "../gateway-envelope";
import { verifyEnvelopeSignature, type SecretProvider } from "../envelope-signature";
import { record as recordMetric, type MetricSink } from "../metrics";
import type { GatewayNonceRepository, GatewayProfileRepository } from "../persistence/ports";
import { svcFail, svcOk, OT_AUDIT, type AuditPort, type ServiceResult } from "./core";

export interface EnvelopeAcknowledgement {
  accepted: true;
  payloadType: string;
  /** Echoed so a gateway can correlate; carries no secret. */
  receivedAt: string;
}

export interface GatewayServiceDeps {
  gateways: GatewayProfileRepository;
  nonces: GatewayNonceRepository;
  secrets: SecretProvider;
  audit: AuditPort;
  metrics: MetricSink;
  now?: () => Date;
  simulatorAllowed?: boolean;
  /** Invoked only for an envelope that passed every gate. */
  onAccepted?: (env: GatewayEnvelope) => Promise<void>;
}

export function createGatewayEnvelopeService(deps: GatewayServiceDeps) {
  const now = deps.now ?? (() => new Date());

  /** One shape for every rejection, so outcomes cannot be distinguished. */
  async function reject(
    ctx: OtServiceContext,
    gatewayId: string | null,
    rejection: string,
    code: Parameters<typeof svcFail>[0],
    metric?: Parameters<typeof recordMetric>[1],
  ) {
    if (metric) recordMetric(deps.metrics, metric, 1, { outcome: "rejected" });
    await deps.audit.record({
      action: OT_AUDIT.GATEWAY_ENVELOPE_REJECTED,
      actorId: ctx.userId,
      entityType: "EdgeGatewayProfile",
      entityId: gatewayId,
      // The CATEGORY only. None of the attacker-supplied envelope values —
      // signature, nonce, checksum, payload — reach the audit record.
      metadata: { organizationId: ctx.organizationId, rejection },
    });
    return svcFail(code);
  }

  return {
    async process(
      ctx: OtServiceContext,
      rawEnvelope: unknown,
      payloadBytes: Uint8Array | string,
    ): Promise<ServiceResult<EnvelopeAcknowledgement>> {
      const parsed = GatewayEnvelopeSchema.safeParse(rawEnvelope);
      if (!parsed.success) return reject(ctx, null, "MALFORMED", "VALIDATION_FAILED");
      const env = parsed.data;

      // 1. Tenancy. The organization comes from the TRUSTED context; the
      //    envelope's own claim must agree with it.
      if (env.organizationId !== ctx.organizationId) {
        return reject(ctx, null, "GATEWAY_UNKNOWN", "NOT_FOUND");
      }

      // 2. Resolve within the tenant. Unknown and foreign are the same answer.
      const cfg = await deps.gateways.findSigningConfiguration(ctx, env.gatewayId);
      if (!cfg.ok) return reject(ctx, null, "GATEWAY_UNKNOWN", "NOT_FOUND");
      const gw = cfg.value;

      // 3. Lifecycle.
      if (gw.disabled || gw.lifecycle === "DISABLED" || gw.lifecycle === "REVOKED") {
        return reject(ctx, env.gatewayId, "GATEWAY_DISABLED", "FORBIDDEN");
      }
      if (gw.simulatorMode && !deps.simulatorAllowed) {
        return reject(ctx, env.gatewayId, "GATEWAY_DISABLED", "FORBIDDEN");
      }

      // 4. Capability.
      const required = PAYLOAD_CAPABILITY[env.payloadType];
      if (!gw.capabilities.includes(required)) {
        return reject(ctx, env.gatewayId, "CAPABILITY_MISSING", "CAPABILITY_NOT_ALLOWED");
      }

      // 5. Size.
      const bytes =
        typeof payloadBytes === "string" ? Buffer.byteLength(payloadBytes, "utf8") : payloadBytes.byteLength;
      if (bytes > ENVELOPE_LIMITS.maxPayloadBytes) {
        return reject(ctx, env.gatewayId, "PAYLOAD_TOO_LARGE", "PAYLOAD_TOO_LARGE");
      }

      // 6. Freshness, bounded in BOTH directions — a far-future stamp would
      //    otherwise mint a long-lived envelope.
      const stamped = Date.parse(env.timestamp);
      if (!Number.isFinite(stamped)) return reject(ctx, env.gatewayId, "MALFORMED", "VALIDATION_FAILED");
      if (Math.abs(now().getTime() - stamped) > ENVELOPE_LIMITS.maxClockSkewMs) {
        return reject(ctx, env.gatewayId, "STALE_TIMESTAMP", "STALE_TIMESTAMP", "ot_envelope_timestamp_rejected");
      }

      // 7. Checksum of the ACTUAL payload.
      const actual = createHash("sha256")
        .update(typeof payloadBytes === "string" ? Buffer.from(payloadBytes, "utf8") : Buffer.from(payloadBytes))
        .digest("hex");
      if (actual !== env.payloadChecksum) {
        return reject(ctx, env.gatewayId, "CHECKSUM_MISMATCH", "VALIDATION_FAILED", "ot_envelope_checksum_mismatch");
      }

      // 8-9. Signature. The secret is dereferenced from the SERVER's registered
      //      reference, never from the envelope's claim — the envelope may only
      //      assert which key it used, never select one.
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
        deps.secrets,
        gw.signingKeyRef ?? "",
      );
      if (verdict !== "VALID") {
        // Unknown reference and bad MAC collapse into one answer so a prober
        // cannot enumerate valid references.
        return reject(ctx, env.gatewayId, "SIGNATURE_INVALID", "SIGNATURE_INVALID", "ot_envelope_signature_invalid");
      }

      // 10. ONLY NOW is a nonce consumed. Everything above failed without
      //     writing a row, so an unauthenticated caller cannot burn nonces.
      const reserved = await deps.nonces.reserve(ctx, {
        gatewayId: env.gatewayId,
        nonce: env.nonce,
        expiresAt: new Date(now().getTime() + ENVELOPE_LIMITS.nonceRetentionMs),
      });
      if (!reserved.ok) return svcFail("INTERNAL_FAILURE");
      if (reserved.value === "DUPLICATE") {
        return reject(ctx, env.gatewayId, "REPLAYED_NONCE", "REPLAY_DETECTED", "ot_envelope_replay_conflict");
      }

      // 11-12. Hand off to the application service for the payload type.
      if (deps.onAccepted) await deps.onAccepted(env);

      recordMetric(deps.metrics, "ot_envelope_accepted", 1, { payloadType: env.payloadType });
      await deps.audit.record({
        action: OT_AUDIT.GATEWAY_ENVELOPE_ACCEPTED,
        actorId: ctx.userId,
        entityType: "EdgeGatewayProfile",
        entityId: env.gatewayId,
        metadata: {
          organizationId: ctx.organizationId,
          gatewayId: env.gatewayId,
          payloadType: env.payloadType,
        },
      });

      return svcOk({
        accepted: true,
        payloadType: env.payloadType,
        receivedAt: now().toISOString(),
      });
    },
  };
}

export type GatewayEnvelopeService = ReturnType<typeof createGatewayEnvelopeService>;
