-- PHASE 94 — secure gateway machine-credential enrollment lifecycle.
--
-- Additive and non-destructive: four nullable columns on EdgeGatewayProfile.
-- NONE of them hold secret material — the signing secret lives only in the
-- external writable secret manager, and the platform persists only the opaque
-- `signingKeyRef` (which already exists). These columns record enrollment
-- lifecycle metadata (a monotonic per-gateway version counter and the
-- issued/rotated/revoked timestamps) so operators and the audit trail can see a
-- credential's state without ever storing the credential.
--
-- Existing rows receive NULL and are correctly reported as "not enrolled" — the
-- safe default. No backfill, no data migration, no index changes.

-- AlterTable
ALTER TABLE "EdgeGatewayProfile" ADD COLUMN "signingKeyVersion" INTEGER;
ALTER TABLE "EdgeGatewayProfile" ADD COLUMN "signingKeyEnrolledAt" TIMESTAMP(3);
ALTER TABLE "EdgeGatewayProfile" ADD COLUMN "signingKeyRotatedAt" TIMESTAMP(3);
ALTER TABLE "EdgeGatewayProfile" ADD COLUMN "signingKeyRevokedAt" TIMESTAMP(3);
