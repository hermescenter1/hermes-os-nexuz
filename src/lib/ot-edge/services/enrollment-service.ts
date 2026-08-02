// PHASE 94 — secure gateway machine-credential enrollment.
//
// This is the closure of the OT edge secret story: registration (Phase 94B)
// created a metadata profile and an ingestion handle but had NO way to issue the
// HMAC signing secret a gateway needs. The building blocks existed but were
// unwired — a `WritableSecretManager` contract, an OpenBao adapter, an AppRole
// provider and a fail-closed runtime composition. This service wires them into a
// create / rotate / revoke / delete lifecycle with the invariants the platform
// requires:
//
//   - The plaintext secret exists ONLY as bounded in-memory bytes. It is stored
//     in the external secret manager, never in PostgreSQL, and is returned to
//     the operator EXACTLY ONCE (the enrollment/rotation response). PostgreSQL
//     holds only the opaque reference and non-secret lifecycle metadata.
//   - Create/rotate/revoke/delete are atomic-or-compensating. A failed secret
//     creation leaves no enrolled row; a failed database commit deletes the
//     secret that was just created; rotation never invalidates the working
//     credential until the replacement is committed; revocation fails closed.
//   - Tenant + site scope and permission are enforced upstream (the route kit)
//     and again at the database (every repo call is context-scoped). A foreign
//     id is indistinguishable from a missing one.
//   - No secret value, reference, version secret, token or provider internal is
//     ever logged, audited, metered or returned outside the one-time response.

import { randomBytes as defaultRandomBytes } from "node:crypto";
import type { OtServiceContext } from "../service-context";
import type { GatewayProfileRepository, GatewayEnrollmentRecord } from "../persistence/ports";
import type { SecretReference, WritableSecretManager } from "../secret-manager";
import { record as recordMetric, type MetricSink } from "../metrics";
import {
  OT_AUDIT,
  fromRepo,
  svcFail,
  svcOk,
  type AuditPort,
  type ServiceResult,
} from "./core";

/** Bytes of entropy for a signing secret. 32 bytes = 256-bit HMAC key. */
const SECRET_BYTES = 32;

export const SIGNATURE_ALGORITHM = "HMAC-SHA256" as const;

/**
 * The one-time enrollment/rotation result.
 *
 * `credential` and `signingKeyRef` appear NOWHERE else — not in a list, not in a
 * detail read, not in an audit row. The device is configured with both: the
 * reference travels in every envelope (an identifier), the credential is the
 * HMAC key (the secret) and is never retrievable again.
 */
export interface EnrollmentCredential {
  /** Parent IndustrialGateway.id — for the operator's reference. */
  gatewayId: string;
  /** Opaque reference the device must echo in every envelope. */
  signingKeyRef: string;
  /** The HMAC key, base64url. Shown ONCE; never persisted in plaintext. */
  credential: string;
  signatureAlgorithm: typeof SIGNATURE_ALGORITHM;
  /** Monotonic per-gateway version (1 on first enrollment). */
  version: number;
  issuedAt: string;
}

export interface EnrollmentOutcome {
  gatewayId: string;
}

export interface EnrollmentService {
  enroll(ctx: OtServiceContext, id: string): Promise<ServiceResult<EnrollmentCredential>>;
  rotate(ctx: OtServiceContext, id: string): Promise<ServiceResult<EnrollmentCredential>>;
  revoke(ctx: OtServiceContext, id: string): Promise<ServiceResult<EnrollmentOutcome>>;
  remove(ctx: OtServiceContext, id: string): Promise<ServiceResult<EnrollmentOutcome>>;
}

type EnrollmentRepo = Pick<
  GatewayProfileRepository,
  | "findEnrollment"
  | "attachSigningReference"
  | "swapSigningReference"
  | "revokeSigningReference"
  | "clearSigningReference"
>;

export interface EnrollmentServiceDeps {
  gateways: EnrollmentRepo;
  /** The writable backend, or null when it is disabled — see secret-backend.ts. */
  secretManager: WritableSecretManager | null;
  audit: AuditPort;
  metrics: MetricSink;
  /** Injected for deterministic tests; defaults to Node's CSPRNG. */
  randomBytes?: (n: number) => Uint8Array;
  /** Injected for deterministic tests; defaults to the wall clock. */
  clock?: () => Date;
}

export function createEnrollmentService(deps: EnrollmentServiceDeps): EnrollmentService {
  const randomBytes = deps.randomBytes ?? ((n: number) => new Uint8Array(defaultRandomBytes(n)));
  const clock = deps.clock ?? (() => new Date());

  function audit(
    ctx: OtServiceContext,
    rec: GatewayEnrollmentRecord,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    // The audit port allow-lists keys and drops non-scalars, so this can only
    // ever emit organizationId/siteId/gatewayId plus the outcome scalars.
    return deps.audit.record({
      action: action as (typeof OT_AUDIT)[keyof typeof OT_AUDIT],
      actorId: ctx.userId,
      entityType: "EdgeGatewayProfile",
      entityId: rec.id,
      metadata: {
        organizationId: rec.organizationId,
        ...(rec.siteId ? { siteId: rec.siteId } : {}),
        gatewayId: rec.gatewayId,
        ...metadata,
      },
    });
  }

  /** Delete a just-created external secret after a failed DB commit / CAS. */
  async function compensate(
    ctx: OtServiceContext,
    rec: GatewayEnrollmentRecord,
    reference: string,
    operation: string,
  ): Promise<void> {
    let outcome = "compensated";
    try {
      // secretManager is guaranteed non-null on any path that created a secret.
      await deps.secretManager!.delete(reference as SecretReference);
    } catch {
      // The secret could not be removed. It is unreferenced (the DB write did
      // not commit), so it authenticates nothing — but flag it for operators.
      outcome = "cleanup_failed";
    }
    await audit(ctx, rec, OT_AUDIT.GATEWAY_ENROLLMENT_FAILED, { outcome, operation });
    recordMetric(deps.metrics, "ot_enrollment_failed", 1, { outcome: "error" });
  }

  async function issue(
    ctx: OtServiceContext,
    id: string,
    mode: "enroll" | "rotate",
  ): Promise<ServiceResult<EnrollmentCredential>> {
    const found = await deps.gateways.findEnrollment(ctx, id);
    if (!found.ok) return fromRepo(found);
    const rec = found.value;

    if (mode === "enroll") {
      if (rec.signingKeyRef) {
        // Already enrolled — the operator must rotate, not re-enroll.
        await audit(ctx, rec, OT_AUDIT.GATEWAY_ENROLLMENT_FAILED, { outcome: "already_enrolled", operation: "enroll" });
        recordMetric(deps.metrics, "ot_enrollment_failed", 1, { outcome: "conflict" });
        return svcFail("CONFLICT");
      }
    } else {
      if (!rec.signingKeyRef) return svcFail("CONFLICT", "not enrolled");
      if (rec.signingKeyRevokedAt) return svcFail("CONFLICT", "revoked");
    }

    if (!deps.secretManager) {
      await audit(ctx, rec, OT_AUDIT.GATEWAY_ENROLLMENT_FAILED, { outcome: "backend_unavailable", operation: mode });
      recordMetric(deps.metrics, "ot_enrollment_failed", 1, { outcome: "error" });
      return svcFail("SECRET_BACKEND_UNAVAILABLE");
    }

    // Generate the secret as bounded bytes. It is wiped before this call
    // returns, whatever path is taken below.
    const raw = randomBytes(SECRET_BYTES);
    let reference: string;
    try {
      const meta = await deps.secretManager.create(raw);
      reference = meta.reference;
    } catch {
      raw.fill(0);
      await audit(ctx, rec, OT_AUDIT.GATEWAY_ENROLLMENT_FAILED, { outcome: "create_failed", operation: mode });
      recordMetric(deps.metrics, "ot_enrollment_failed", 1, { outcome: "error" });
      return svcFail("SECRET_BACKEND_UNAVAILABLE");
    }

    const now = clock();
    const version = mode === "enroll" ? 1 : (rec.signingKeyVersion ?? 1) + 1;

    // Commit the reference to PostgreSQL. This is the atomic point: before it,
    // the old credential (if any) still works; after it, the new one is live.
    let applied: boolean;
    try {
      const res =
        mode === "enroll"
          ? await deps.gateways.attachSigningReference(ctx, id, { reference, version, enrolledAt: now })
          : await deps.gateways.swapSigningReference(ctx, id, {
              expectedReference: rec.signingKeyRef as string,
              reference,
              version,
              rotatedAt: now,
            });
      if (!res.ok) {
        raw.fill(0);
        await compensate(ctx, rec, reference, mode);
        return fromRepo(res);
      }
      applied = res.value.applied;
    } catch {
      raw.fill(0);
      await compensate(ctx, rec, reference, mode);
      return svcFail("TRANSIENT_FAILURE");
    }

    if (!applied) {
      // CAS precondition failed: a concurrent enroll/rotate won, or the state
      // changed (e.g. revoked) under us. Roll back the orphaned secret.
      raw.fill(0);
      await compensate(ctx, rec, reference, mode);
      return svcFail("CONFLICT");
    }

    // Committed. Encode the one-time credential, then wipe the bytes.
    const credential = Buffer.from(raw).toString("base64url");
    raw.fill(0);

    // Rotation: the OLD secret is no longer referenced. Delete it best-effort —
    // a failure here does not undo the successful rotation.
    if (mode === "rotate" && rec.signingKeyRef) {
      try {
        await deps.secretManager.delete(rec.signingKeyRef as SecretReference);
      } catch {
        await audit(ctx, rec, OT_AUDIT.GATEWAY_ENROLLMENT_FAILED, { outcome: "cleanup_failed", operation: "rotate" });
      }
    }

    if (mode === "enroll") {
      await audit(ctx, rec, OT_AUDIT.GATEWAY_ENROLLMENT_CREATED, { outcome: "created", version });
      recordMetric(deps.metrics, "ot_enrollment_created", 1, { outcome: "ok" });
    } else {
      await audit(ctx, rec, OT_AUDIT.GATEWAY_CREDENTIAL_ROTATED, { outcome: "rotated", version });
      recordMetric(deps.metrics, "ot_enrollment_rotated", 1, { outcome: "ok" });
    }

    return svcOk({
      gatewayId: rec.gatewayId,
      signingKeyRef: reference,
      credential,
      signatureAlgorithm: SIGNATURE_ALGORITHM,
      version,
      issuedAt: now.toISOString(),
    });
  }

  return {
    enroll(ctx, id) {
      return issue(ctx, id, "enroll");
    },

    rotate(ctx, id) {
      return issue(ctx, id, "rotate");
    },

    async revoke(ctx, id) {
      const found = await deps.gateways.findEnrollment(ctx, id);
      if (!found.ok) return fromRepo(found);
      const rec = found.value;
      if (!rec.signingKeyRef) return svcFail("CONFLICT", "not enrolled");
      if (rec.signingKeyRevokedAt) {
        // Idempotent: already revoked.
        return svcOk({ gatewayId: rec.gatewayId });
      }

      const now = clock();
      // The database revocation is authoritative and does NOT require the secret
      // backend: REVOKED lifecycle blocks every envelope on its own, so an
      // operator can always revoke even if the backend is down — fail closed.
      let applied: boolean;
      try {
        const res = await deps.gateways.revokeSigningReference(ctx, id, {
          expectedReference: rec.signingKeyRef,
          revokedAt: now,
        });
        if (!res.ok) return fromRepo(res);
        applied = res.value.applied;
      } catch {
        recordMetric(deps.metrics, "ot_enrollment_failed", 1, { outcome: "error" });
        return svcFail("TRANSIENT_FAILURE");
      }

      if (!applied) {
        // Something changed concurrently; re-read to confirm the end state.
        const re = await deps.gateways.findEnrollment(ctx, id);
        if (re.ok && re.value.signingKeyRevokedAt) return svcOk({ gatewayId: rec.gatewayId });
        return svcFail("CONFLICT");
      }

      // Defence in depth: revoke in the store too, so a resolution attempt fails
      // closed. Best-effort — DB lifecycle already blocks auth.
      if (deps.secretManager) {
        try {
          await deps.secretManager.revoke(rec.signingKeyRef as SecretReference);
        } catch {
          await audit(ctx, rec, OT_AUDIT.GATEWAY_ENROLLMENT_FAILED, { outcome: "cleanup_failed", operation: "revoke" });
        }
      }

      await audit(ctx, rec, OT_AUDIT.GATEWAY_CREDENTIAL_REVOKED, { outcome: "revoked" });
      recordMetric(deps.metrics, "ot_enrollment_revoked", 1, { outcome: "ok" });
      return svcOk({ gatewayId: rec.gatewayId });
    },

    async remove(ctx, id) {
      const found = await deps.gateways.findEnrollment(ctx, id);
      if (!found.ok) return fromRepo(found);
      const rec = found.value;
      if (!rec.signingKeyRef) {
        // Idempotent: nothing enrolled to delete.
        return svcOk({ gatewayId: rec.gatewayId });
      }

      // Delete the external secret FIRST (idempotent). Once gone the reference
      // can never resolve, so authentication fails closed even if the DB clear
      // below has to be retried.
      if (deps.secretManager) {
        try {
          await deps.secretManager.delete(rec.signingKeyRef as SecretReference);
        } catch {
          recordMetric(deps.metrics, "ot_enrollment_failed", 1, { outcome: "error" });
          return svcFail("TRANSIENT_FAILURE");
        }
      }

      try {
        const res = await deps.gateways.clearSigningReference(ctx, id, { expectedReference: rec.signingKeyRef });
        if (!res.ok) return fromRepo(res);
      } catch {
        return svcFail("TRANSIENT_FAILURE");
      }

      await audit(ctx, rec, OT_AUDIT.GATEWAY_ENROLLMENT_DELETED, { outcome: "deleted" });
      recordMetric(deps.metrics, "ot_enrollment_deleted", 1, { outcome: "ok" });
      return svcOk({ gatewayId: rec.gatewayId });
    },
  };
}
