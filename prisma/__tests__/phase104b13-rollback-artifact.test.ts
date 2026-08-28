/**
 * PHASE 104-B1.3 §3.4 — the rollback artifact is exact, ordered and honest.
 *
 * The B1.2 ledger still named `AtsJob_hiringManagerId_fkey`, a constraint this
 * migration never created — a rollback copied from it would have failed on its
 * first statement. This gate pins the artifact against the MIGRATION it
 * reverses, so the two cannot drift again.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const DIR = "prisma/migrations/20260824000000_phase104_b1_recruitment_foundation";
const migration = readFileSync(join(REPO, DIR, "migration.sql"), "utf8");
const rollback = readFileSync(join(REPO, DIR, "rollback.sql"), "utf8");

const statements = (sql: string) =>
  sql.split(";").map((s) => s.replace(/--[^\n]*/g, "").trim()).filter((s) => s.length > 0);

const RETIRED_NAMES = ["AtsJob_hiringManagerId_fkey"];

/** Everything the migration CREATES, derived — never hand-listed. */
const created = {
  tables: [...migration.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]),
  types: [...migration.matchAll(/CREATE TYPE "(\w+)"/g)].map((m) => m[1]),
  indexes: [...migration.matchAll(/CREATE (?:UNIQUE )?INDEX "(\w+)"/g)].map((m) => m[1]),
  constraints: [...migration.matchAll(/ADD CONSTRAINT "(\w+)"/g)].map((m) => m[1]),
  columns: [...migration.matchAll(/ALTER TABLE "AtsJob" ADD COLUMN "(\w+)"/g)].map((m) => m[1]),
};

describe("§3.4 — retired names are gone", () => {
  it("NO EXECUTABLE statement names a retired constraint", () => {
    // Scoped to statements on purpose: the artifact's own header documents
    // that the retired name was retired, and a gate that fired on its own
    // documentation would push the record toward silence.
    for (const st of statements(rollback)) {
      for (const name of RETIRED_NAMES) {
        expect(st, `${name} in: ${st.slice(0, 60)}`).not.toContain(name);
      }
    }
  });

  it("the retired name survives ONLY as documentation, and the real one is executable", () => {
    expect(rollback).toContain("AtsJob_hiringManagerId_fkey"); // the historical note
    expect(statements(rollback).some((st) => st.includes('DROP CONSTRAINT "AtsJob_hiringManager_tenant_fkey"'))).toBe(true);
  });

  it("the migration itself never created those retired names either", () => {
    for (const name of RETIRED_NAMES) {
      expect(migration, name).not.toContain(name);
    }
  });
});

describe("§3.4 — every created object is dropped, by its REAL name", () => {
  it("drops both composite tenant constraints", () => {
    expect(created.constraints).toContain("AtsJob_hiringManager_tenant_fkey");
    expect(created.constraints).toContain("RecruitmentIdempotencyKey_job_tenant_fkey");
    for (const c of created.constraints) {
      // a constraint on a table this rollback DROPS goes with the table; only
      // constraints on pre-existing tables need their own statement
      const owner = new RegExp(`ALTER TABLE "(\\w+)" ADD CONSTRAINT "${c}"`).exec(migration)?.[1];
      if (owner && created.tables.includes(owner)) continue;
      expect(rollback, `constraint ${c} (on pre-existing table ${owner})`).toContain(`DROP CONSTRAINT "${c}"`);
    }
  });

  it("drops every index the migration created, including the partial live-unique", () => {
    expect(created.indexes).toContain("RecruitmentOtpChallenge_live_one_key");
    for (const i of created.indexes) {
      // an index belonging to a dropped TABLE goes with the table
      const ownedByDroppedTable = new RegExp(`INDEX "${i}"\\s*\\n?\\s*ON "(\\w+)"`).exec(migration);
      const owner = ownedByDroppedTable?.[1];
      if (owner && created.tables.includes(owner)) continue;
      expect(rollback, `index ${i}`).toContain(`DROP INDEX "${i}"`);
    }
  });

  it("drops every table and every enum type the migration created", () => {
    for (const t of created.tables) expect(rollback, `table ${t}`).toContain(`DROP TABLE "${t}"`);
    for (const y of created.types) expect(rollback, `type ${y}`).toContain(`DROP TYPE "${y}"`);
  });

  it("drops every AtsJob column the migration added", () => {
    expect(created.columns.length).toBeGreaterThanOrEqual(14);
    for (const c of created.columns) expect(rollback, `column ${c}`).toContain(`DROP COLUMN "${c}"`);
  });
});

describe("§3.4 — the ordering is executable", () => {
  const st = statements(rollback);
  const idx = (needle: string) => st.findIndex((s) => s.includes(needle));

  it("dependants come before dependencies", () => {
    // the composite FK references the composite unique index → FK first
    expect(idx('DROP CONSTRAINT "AtsJob_hiringManager_tenant_fkey"'))
      .toBeLessThan(idx('DROP INDEX "OrganizationMember_organizationId_id_key"'));
    expect(idx('DROP CONSTRAINT "RecruitmentIdempotencyKey_job_tenant_fkey"'))
      .toBeLessThan(idx('DROP INDEX "AtsJob_organizationId_id_key"'));
    // the enum type is used by a column/table → the user goes first
    expect(idx('DROP TABLE "AtsJobTranslation"')).toBeLessThan(idx('DROP TYPE "AtsJobLanguage"'));
    expect(idx('DROP COLUMN "recordNature"')).toBeLessThan(idx('DROP TYPE "ConsentRecordNature"'));
    // the hiringManagerId column is dropped only after its constraint
    expect(idx('DROP CONSTRAINT "AtsJob_hiringManager_tenant_fkey"'))
      .toBeLessThan(idx('DROP COLUMN "hiringManagerId"'));
  });

  it("contains no DML — a rollback rewrites structure, never rows", () => {
    for (const s of st) expect(s, s.slice(0, 60)).not.toMatch(/^(UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
  });

  it("restores ONLY the one legitimate pre-B1 default, never the three defects", () => {
    expect(rollback).toContain('ALTER COLUMN "isPublic" SET DEFAULT true');
    expect(rollback).not.toMatch(/"locationType" SET DEFAULT/);
    expect(rollback).not.toMatch(/"salaryCurrency" SET DEFAULT/);
    expect(rollback).not.toMatch(/"workAuthorization" SET DEFAULT/);
  });
});
