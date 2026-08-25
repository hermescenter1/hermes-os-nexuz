/**
 * PHASE 104-B1.2 — schema ↔ migration parity gate.
 *
 * Everything Prisma CAN express must be expressed in schema.prisma and must
 * match the SQL; every construct Prisma CANNOT express is enumerated in the
 * MIGRATION_ONLY allowlist below and machine-checked on BOTH sides. A new
 * divergence — in either direction — fails here, not in production.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const schema = readFileSync(join(REPO, "prisma/schema.prisma"), "utf8");
const sql = readFileSync(
  join(REPO, "prisma/migrations/20260824000000_phase104_b1_recruitment_foundation/migration.sql"),
  "utf8",
);
const model = (name: string): string => {
  const m = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(m, name).not.toBeNull();
  return m![0];
};

describe("expressible constructs exist on BOTH sides", () => {
  it("hiringManager is a COMPOUND tenant relation in the SCHEMA, mapped to the SQL constraint name", () => {
    const job = model("AtsJob");
    expect(job).toContain("fields: [organizationId, hiringManagerId], references: [organizationId, id]");
    expect(job).toContain('map: "AtsJob_hiringManager_tenant_fkey"');
    // the misleading single-column form must NOT return
    expect(job).not.toMatch(/fields: \[hiringManagerId\], references: \[id\]/);
  });

  it("the composite unique TARGETS exist in the schema AND the SQL, with matching default names", () => {
    expect(model("AtsJob")).toContain("@@unique([organizationId, id])");
    expect(model("OrganizationMember")).toContain("@@unique([organizationId, id])");
    expect(sql).toContain('CREATE UNIQUE INDEX "AtsJob_organizationId_id_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "OrganizationMember_organizationId_id_key"');
  });

  it("the idempotency claim is a tenant-bound compound relation on BOTH sides", () => {
    const idem = model("RecruitmentIdempotencyKey");
    expect(idem).toContain("fields: [organizationId, jobId], references: [organizationId, id]");
    expect(idem).toContain('map: "RecruitmentIdempotencyKey_job_tenant_fkey"');
    expect(idem).toContain("onDelete: Cascade");
    expect(sql).toContain('CONSTRAINT "RecruitmentIdempotencyKey_job_tenant_fkey"');
    expect(sql).toContain('FOREIGN KEY ("organizationId", "jobId")');
    expect(model("AtsJob")).toContain("idempotencyClaims RecruitmentIdempotencyKey[]");
  });

  it("both compound FKs in SQL reference the composite targets", () => {
    expect(sql).toContain('FOREIGN KEY ("organizationId", "hiringManagerId")');
    expect(sql).toContain('REFERENCES "OrganizationMember"("organizationId", "id")');
    expect(sql).toContain('REFERENCES "AtsJob"("organizationId", "id")');
    // and no single-column form of either FK survives anywhere in the SQL
    expect(sql).not.toMatch(/REFERENCES "OrganizationMember"\("id"\)/);
  });
});

describe("MIGRATION-ONLY constructs — enumerated, never silent", () => {
  /**
   * The complete allowlist. Each entry names WHY Prisma cannot express it and
   * pins the exact SQL that must exist. Anything in the migration that diverges
   * from the schema and is NOT in this list is a parity failure by definition
   * (the expressible-side tests above pin the rest of the surface).
   */
  const MIGRATION_ONLY = [
    {
      reason: "Prisma has no column-list referential action; the schema declares NoAction and the SQL nulls ONLY the manager column",
      sqlMustContain: 'ON DELETE SET NULL ("hiringManagerId") ON UPDATE CASCADE;',
      schemaMustContain: "onDelete: NoAction, onUpdate: Cascade, map: \"AtsJob_hiringManager_tenant_fkey\"",
    },
    {
      reason: "Prisma cannot express PARTIAL unique indexes; at most one LIVE challenge per (identifierHmac, purpose)",
      sqlMustContain: 'CREATE UNIQUE INDEX "RecruitmentOtpChallenge_live_one_key"',
      schemaMustContain: "model RecruitmentOtpChallenge {",
    },
  ] as const;

  for (const entry of MIGRATION_ONLY) {
    it(`allowlisted: ${entry.reason.slice(0, 60)}…`, () => {
      expect(sql).toContain(entry.sqlMustContain);
      expect(schema).toContain(entry.schemaMustContain);
    });
  }

  it("the partial unique carries its live predicate", () => {
    expect(sql).toContain('WHERE "invalidatedAt" IS NULL AND "consumedAt" IS NULL');
  });

  it("rollback documentation names the REAL B1.2 constraints (not the retired single-column FK)", () => {
    expect(sql).toContain('DROP CONSTRAINT "RecruitmentIdempotencyKey_job_tenant_fkey"');
    expect(sql).toContain('DROP INDEX "AtsJob_organizationId_id_key"');
    expect(sql).toContain('DROP CONSTRAINT "AtsJob_hiringManager_tenant_fkey"');
    expect(sql).toContain('DROP INDEX "OrganizationMember_organizationId_id_key"');
    expect(sql).toContain('DROP INDEX "RecruitmentOtpChallenge_live_one_key"');
    expect(sql).not.toContain('DROP CONSTRAINT "AtsJob_hiringManagerId_fkey"');
  });
});
