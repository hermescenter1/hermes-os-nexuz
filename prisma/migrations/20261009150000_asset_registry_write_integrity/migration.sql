-- Enterprise Asset Registry write integrity.
--
-- Fail before changing constraints if historical rows would violate the new
-- tenant-safe keys. The operator must inspect and repair those rows explicitly;
-- this migration never guesses an owner or silently rewrites plant structure.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RegistryAsset"
    WHERE "organizationId" IS NOT NULL
    GROUP BY "organizationId", "assetNumber"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'RegistryAsset contains duplicate asset numbers inside an organization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RegistryAsset" a
    LEFT JOIN "IndustrialSite" s
      ON s."id" = a."siteId" AND s."organizationId" = a."organizationId"
    WHERE a."siteId" IS NOT NULL AND s."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'RegistryAsset contains a missing or cross-tenant site relation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RegistryAsset" a
    LEFT JOIN "AssetLocation" l
      ON l."id" = a."locationId" AND l."organizationId" = a."organizationId"
    WHERE a."locationId" IS NOT NULL AND l."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'RegistryAsset contains a missing or cross-tenant location relation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RegistryAsset" a
    LEFT JOIN "RegistryAsset" p
      ON p."id" = a."parentAssetId" AND p."organizationId" = a."organizationId"
    WHERE a."parentAssetId" IS NOT NULL AND p."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'RegistryAsset contains a missing or cross-tenant parent relation';
  END IF;
END $$;

CREATE UNIQUE INDEX "IndustrialSite_organizationId_id_key"
  ON "IndustrialSite"("organizationId", "id");
CREATE UNIQUE INDEX "AssetLocation_organizationId_id_key"
  ON "AssetLocation"("organizationId", "id");
CREATE UNIQUE INDEX "RegistryAsset_organizationId_id_key"
  ON "RegistryAsset"("organizationId", "id");
CREATE UNIQUE INDEX "RegistryAsset_organizationId_assetNumber_key"
  ON "RegistryAsset"("organizationId", "assetNumber");

ALTER TABLE "RegistryAsset"
  DROP CONSTRAINT "RegistryAsset_locationId_fkey",
  DROP CONSTRAINT "RegistryAsset_parentAssetId_fkey";

ALTER TABLE "RegistryAsset"
  ADD CONSTRAINT "RegistryAsset_organizationId_siteId_fkey"
    FOREIGN KEY ("organizationId", "siteId")
    REFERENCES "IndustrialSite"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RegistryAsset_organizationId_locationId_fkey"
    FOREIGN KEY ("organizationId", "locationId")
    REFERENCES "AssetLocation"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RegistryAsset_organizationId_parentAssetId_fkey"
    FOREIGN KEY ("organizationId", "parentAssetId")
    REFERENCES "RegistryAsset"("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
