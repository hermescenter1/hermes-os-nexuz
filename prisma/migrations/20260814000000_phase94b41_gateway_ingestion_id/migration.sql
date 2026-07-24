-- PHASE 94B4.1 — machine authentication identifier for edge gateways.
-- Additive and non-destructive: one nullable column plus its unique index.
-- Existing profiles receive NULL and therefore cannot ingest until an operator
-- provisions an ingestion identifier, which is the safe default.

-- AlterTable
ALTER TABLE "EdgeGatewayProfile" ADD COLUMN "ingestionId" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "EdgeGatewayProfile_ingestionId_key" ON "EdgeGatewayProfile"("ingestionId");
