/**
 * PHASE 112 — schema ↔ migration parity + additivity gate.
 *
 * Everything Prisma CAN express is pinned on both sides; the MIGRATION-ONLY
 * constructs (CHECK constraints, immutability triggers) are enumerated and
 * machine-checked. The migration must be ADDITIVE (it touches no existing table)
 * and APPEND-ONLY (its timestamp follows the previous latest migration).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const schema = readFileSync(join(REPO, "prisma/schema.prisma"), "utf8");
const MIGRATION_DIR = "20260924000000_phase112_immutable_reasoning_run";
const sql = readFileSync(join(REPO, "prisma/migrations", MIGRATION_DIR, "migration.sql"), "utf8");

const model = (name: string): string => {
  const m = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(m, name).not.toBeNull();
  return m![0];
};

describe("expressible constructs exist on BOTH sides", () => {
  it("artifact + replay are TENANT-BOUND compound relations to the run", () => {
    const art = model("ReasoningRunArtifact");
    expect(art).toContain("fields: [organizationId, runId], references: [organizationId, id]");
    expect(art).toContain('map: "ReasoningRunArtifact_run_tenant_fkey"');
    const rep = model("ReasoningReplayAttempt");
    expect(rep).toContain("fields: [organizationId, runId], references: [organizationId, id]");
    expect(rep).toContain('map: "ReasoningReplayAttempt_run_tenant_fkey"');
    expect(sql).toContain('FOREIGN KEY ("organizationId", "runId") REFERENCES "ReasoningRun"("organizationId", "id")');
  });

  it("the run's parent lineage is a tenant-bound self relation", () => {
    const run = model("ReasoningRun");
    expect(run).toContain("fields: [organizationId, parentRunId], references: [organizationId, id]");
    expect(run).toContain('map: "ReasoningRun_parent_tenant_fkey"');
    expect(sql).toContain('FOREIGN KEY ("organizationId", "parentRunId") REFERENCES "ReasoningRun"("organizationId", "id")');
  });

  it("the composite unique targets + idempotency key exist on both sides", () => {
    const run = model("ReasoningRun");
    expect(run).toContain("@@unique([organizationId, id])");
    expect(run).toContain("@@unique([organizationId, idempotencyKey])");
    expect(sql).toContain('CREATE UNIQUE INDEX "ReasoningRun_organizationId_id_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "ReasoningRun_organizationId_idempotencyKey_key"');
    expect(model("ReasoningRunArtifact")).toContain("@@unique([organizationId, runId, kind])");
    expect(sql).toContain('CREATE UNIQUE INDEX "ReasoningRunArtifact_organizationId_runId_kind_key"');
  });

  it("site/asset FKs are RESTRICT (an immutable run's parent cannot be deleted out from under it)", () => {
    expect(sql).toContain('ADD CONSTRAINT "ReasoningRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "IndustrialSite"("id") ON DELETE RESTRICT');
    expect(sql).toContain('ADD CONSTRAINT "ReasoningRun_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "IndustrialAsset"("id") ON DELETE RESTRICT');
  });
});

describe("MIGRATION-ONLY constructs — enumerated, never silent", () => {
  const MIGRATION_ONLY = [
    { reason: "Prisma cannot express CHECK — digest lowercase SHA-256 hex", sqlMustContain: `CHECK ("outputDigest" ~ '^[0-9a-f]{64}$')` },
    { reason: "Prisma cannot express CHECK — positive byte size", sqlMustContain: `CHECK ("byteSize" > 0)` },
    { reason: "Prisma cannot express CHECK — terminal-state consistency", sqlMustContain: `"ReasoningRun_terminal_state_check"` },
    { reason: "Prisma cannot express triggers — run UPDATE rejected", sqlMustContain: `CREATE TRIGGER reasoning_run_no_update_trg` },
    { reason: "Prisma cannot express triggers — artifact UPDATE rejected", sqlMustContain: `CREATE TRIGGER reasoning_run_artifact_no_update_trg` },
    { reason: "Prisma cannot express triggers — replay UPDATE rejected", sqlMustContain: `CREATE TRIGGER reasoning_replay_attempt_no_update_trg` },
  ] as const;

  for (const entry of MIGRATION_ONLY) {
    it(`allowlisted: ${entry.reason}`, () => {
      expect(sql).toContain(entry.sqlMustContain);
    });
  }

  it("the UPDATE triggers fire BEFORE UPDATE and raise", () => {
    expect(sql).toContain('BEFORE UPDATE ON "ReasoningRun"');
    expect(sql).toContain('BEFORE UPDATE ON "ReasoningRunArtifact"');
    expect(sql).toContain('BEFORE UPDATE ON "ReasoningReplayAttempt"');
    expect(sql).toMatch(/RAISE EXCEPTION 'ReasoningRun is immutable/);
  });
});

describe("the migration is ADDITIVE and APPEND-ONLY", () => {
  it("touches no existing table (only Phase 112 tables are altered)", () => {
    // Executable SQL only — the ROLLBACK guidance lives in `--` comments and is
    // documentation, never applied.
    const executable = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    const alters = executable.match(/ALTER TABLE "([^"]+)"/g) ?? [];
    const allowed = new Set(["ReasoningRun", "ReasoningRunArtifact", "ReasoningReplayAttempt"]);
    for (const a of alters) {
      const name = a.match(/ALTER TABLE "([^"]+)"/)![1];
      expect(allowed.has(name), `unexpected ALTER on ${name}`).toBe(true);
    }
    // It must not drop or modify any existing table in executable SQL.
    expect(executable).not.toMatch(/DROP TABLE/);
    expect(executable).not.toMatch(/ALTER TABLE "(Organization|IndustrialSite|IndustrialAsset|AnalysisRecord|EngineeringCase)"/);
  });

  it("its timestamp follows the previous latest migration", () => {
    const dirs = readdirSync(join(REPO, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d)).sort();
    const idx = dirs.indexOf(MIGRATION_DIR);
    expect(idx).toBeGreaterThan(0);
    // Every earlier-sorted migration has a strictly smaller timestamp prefix.
    const ts = MIGRATION_DIR.slice(0, 14);
    expect(dirs[idx - 1].slice(0, 14) < ts).toBe(true);
    expect(dirs.at(-1)).toBe(MIGRATION_DIR); // it is the new latest
  });
});
