import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20261009150000_asset_registry_write_integrity/migration.sql"),
  "utf8",
);

describe("asset registry write integrity migration", () => {
  it("fails closed on duplicate business identifiers", () => {
    expect(sql).toContain('GROUP BY "organizationId", "assetNumber"');
    expect(sql).toContain('HAVING COUNT(*) > 1');
    expect(sql).toContain('RegistryAsset_organizationId_assetNumber_key');
  });

  it("preflights every tenant-sensitive relation before replacing constraints", () => {
    for (const marker of [
      "cross-tenant site relation",
      "cross-tenant location relation",
      "cross-tenant parent relation",
    ]) expect(sql).toContain(marker);
  });

  it("binds site, location, and parent through organization-aware foreign keys", () => {
    expect(sql).toContain('FOREIGN KEY ("organizationId", "siteId")');
    expect(sql).toContain('FOREIGN KEY ("organizationId", "locationId")');
    expect(sql).toContain('FOREIGN KEY ("organizationId", "parentAssetId")');
    expect(sql.match(/ON DELETE RESTRICT ON UPDATE CASCADE/g)).toHaveLength(3);
  });
});
