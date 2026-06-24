-- Phase 48: Industrial Asset Intelligence — additive asset type extensions
--
-- Adds VFD (Variable Frequency Drive) and VALVE to the IndustrialAssetType enum.
-- PostgreSQL ALTER TYPE ADD VALUE is non-transactional but idempotent with
-- IF NOT EXISTS. Existing rows are unaffected; no data migration needed.

ALTER TYPE "IndustrialAssetType" ADD VALUE IF NOT EXISTS 'VFD';
ALTER TYPE "IndustrialAssetType" ADD VALUE IF NOT EXISTS 'VALVE';
