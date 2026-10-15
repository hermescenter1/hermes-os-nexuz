import { describe, expect, it } from "vitest";

import { AssetCreateSchema, AssetUpdateSchema } from "../validation";

const valid = {
  assetNumber: "MTR-L2-001",
  name: "Line 2 conveyor motor",
  assetType: "MOTOR",
};

describe("Enterprise Asset Registry validation", () => {
  it("accepts a minimal governed asset and trims identity fields", () => {
    const result = AssetCreateSchema.safeParse({ ...valid, assetNumber: "  MTR-L2-001  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.assetNumber).toBe("MTR-L2-001");
  });

  it("refuses tenant and server-owned fields instead of stripping them", () => {
    for (const extra of ["organizationId", "id", "createdBy", "updatedBy"]) {
      const result = AssetCreateSchema.safeParse({ ...valid, [extra]: "attacker-selected" });
      expect(result.success, extra).toBe(false);
    }
  });

  it("bounds health, life expectancy, tags, and technical specification size", () => {
    expect(AssetCreateSchema.safeParse({ ...valid, healthScore: 101 }).success).toBe(false);
    expect(AssetCreateSchema.safeParse({ ...valid, expectedLifeYears: 0 }).success).toBe(false);
    expect(AssetCreateSchema.safeParse({ ...valid, tags: Array.from({ length: 41 }, (_, i) => `tag-${i}`) }).success).toBe(false);
    expect(AssetCreateSchema.safeParse({ ...valid, technicalSpecs: { payload: "x".repeat(20_100) } }).success).toBe(false);
  });

  it("accepts ISO calendar dates and rejects ambiguous dates", () => {
    expect(AssetCreateSchema.safeParse({ ...valid, installationDate: "2026-10-09" }).success).toBe(true);
    expect(AssetCreateSchema.safeParse({ ...valid, installationDate: "09/10/2026" }).success).toBe(false);
  });

  it("requires a non-empty PATCH", () => {
    expect(AssetUpdateSchema.safeParse({}).success).toBe(false);
    expect(AssetUpdateSchema.safeParse({ status: "UNDER_MAINTENANCE" }).success).toBe(true);
  });
});
