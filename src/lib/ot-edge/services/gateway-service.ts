// PHASE 94B4.1 — post-authentication envelope ingestion.
//
// WHAT CHANGED AND WHY
// Through 94B4 this service performed authentication itself: it resolved the
// gateway inside a HUMAN tenant context, then checked lifecycle, capability,
// freshness, checksum and the HMAC. That only worked because an administrator's
// browser session supplied the tenant — the exact defect 94B4.1 removes.
//
// Authentication now lives in `machine-context.ts` and yields a branded
// `GatewayMachineContext`. This service begins AFTER it. The ordering guarantee
// that used to depend on reading the function top to bottom — no nonce is
// reserved before the signature verifies — is now enforced by the type system:
// `ingest` cannot be called without a context only a verified HMAC can produce.
//
// No protocol connection is opened, and an accepted envelope can only reach a
// metadata import — there is no path from here to a device write.

import type { GatewayMachineContext, MachineAuthRejection } from "../machine-context";
import { ENVELOPE_LIMITS, type GatewayEnvelope } from "../gateway-envelope";
import { record as recordMetric, type MetricSink } from "../metrics";
import type { GatewayNonceRepository } from "../persistence/ports";
import { svcFail, svcOk, OT_AUDIT, type AuditPort, type ServiceResult } from "./core";

export interface EnvelopeAcknowledgement {
  accepted: true;
  payloadType: string;
  /** Echoed so a gateway can correlate; carries no secret. */
  receivedAt: string;
}

export interface GatewayServiceDeps {
  nonces: GatewayNonceRepository;
  audit: AuditPort;
  metrics: MetricSink;
  now?: () => Date;
  /** Invoked only for an envelope that passed every gate. */
  onAccepted?: (env: GatewayEnvelope) => Promise<void>;
}

/** The metric each internal rejection category reports under. */
const REJECTION_METRIC: Partial<Record<MachineAuthRejection, Parameters<typeof recordMetric>[1]>> = {
  STALE: "ot_envelope_timestamp_rejected",
  INVALID_AUTH: "ot_envelope_signature_invalid",
};

export function createGatewayEnvelopeService(deps: GatewayServiceDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * Record a failed authentication.
     *
     * NO TENANT IS KNOWN — that is what a failed authentication means — so the
     * record carries the rejection CATEGORY and, at most, a gateway identifier
     * the server itself resolved. Nothing attacker-supplied is stored: no
     * signature, nonce, idempotency key, checksum or payload byte.
     */
    async rejected(rejection: MachineAuthRejection, gatewayId: string | null): Promise<void> {
      const metric = REJECTION_METRIC[rejection];
      if (metric) recordMetric(deps.metrics, metric, 1, { outcome: "rejected" });
      await deps.audit.record({
        action: OT_AUDIT.GATEWAY_ENVELOPE_REJECTED,
        actorId: null,
        entityType: "EdgeGatewayProfile",
        entityId: gatewayId,
        metadata: { rejection },
      });
    },

    /**
     * Accept an already-authenticated envelope.
     *
     * The signature verified before this became reachable, so the nonce
     * reservation below is the first write in the whole flow — and the only one
     * an unauthenticated caller could ever have provoked, which is to say none.
     */
    async ingest(
      ctx: GatewayMachineContext,
      env: GatewayEnvelope,
    ): Promise<ServiceResult<EnvelopeAcknowledgement>> {
      // 1. Consume the nonce. The unique index is the sole authority: the
      //    insert decides, so two concurrent copies of one envelope cannot both
      //    win a read-then-write race.
      const reserved = await deps.nonces.reserveForMachine(ctx, {
        gatewayId: ctx.gatewayId,
        nonce: env.nonce,
        expiresAt: new Date(now().getTime() + ENVELOPE_LIMITS.nonceRetentionMs),
      });
      if (!reserved.ok) return svcFail("INTERNAL_FAILURE");
      if (reserved.value === "DUPLICATE") {
        recordMetric(deps.metrics, "ot_envelope_replay_conflict", 1, { outcome: "conflict" });
        await deps.audit.record({
          action: OT_AUDIT.GATEWAY_ENVELOPE_REJECTED,
          actorId: null,
          entityType: "EdgeGatewayProfile",
          entityId: ctx.gatewayId,
          metadata: {
            organizationId: ctx.organizationId,
            gatewayId: ctx.gatewayId,
            rejection: "REPLAYED_NONCE",
          },
        });
        return svcFail("REPLAY_DETECTED");
      }

      // 2. Hand off to the application service for this payload type.
      if (deps.onAccepted) await deps.onAccepted(env);

      recordMetric(deps.metrics, "ot_envelope_accepted", 1, { payloadType: env.payloadType });
      await deps.audit.record({
        action: OT_AUDIT.GATEWAY_ENVELOPE_ACCEPTED,
        // A gateway is not a user. The trail records the machine as the entity
        // and leaves the human actor genuinely empty, rather than borrowing
        // whichever administrator happened to provision it.
        actorId: null,
        entityType: "EdgeGatewayProfile",
        entityId: ctx.gatewayId,
        metadata: {
          organizationId: ctx.organizationId,
          ...(ctx.siteId ? { siteId: ctx.siteId } : {}),
          gatewayId: ctx.gatewayId,
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
