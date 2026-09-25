/**
 * ATS-M1 — migration and schema safety for position management and the
 * organization ATS settings.
 *
 * Static assertions over the committed SQL and the Prisma schema; nothing here
 * connects to a database. Modelled on ats-b2-s1-migration-safety.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = process.cwd();
const MIGRATION = "20260924000000_ats_m1_position_management";

const sql = readFileSync(join(REPO, "prisma/migrations", MIGRATION, "migration.sql"), "utf8").replace(/\r\n/g, "\n");
const schema = readFileSync(resolve(REPO, "prisma/schema.prisma"), "utf8").replace(/\r\n/g, "\n");

const body = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const statements = body
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

function model(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(m, `model ${name}`).not.toBeNull();
  return m![0];
}

describe("ATS-M1 — the migration is additive and non-destructive", () => {
  it("is the newest migration and sorts strictly after every predecessor", () => {
    const dirs = readdirSync(join(REPO, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d)).sort();
    expect(dirs[dirs.length - 1]).toBe(MIGRATION);
    for (const d of dirs.slice(0, -1)) expect(d.slice(0, 14) < MIGRATION.slice(0, 14), d).toBe(true);
  });

  it("contains no destructive statement and no data rewrite", () => {
    expect(statements.length).toBeGreaterThan(5);
    for (const s of statements) {
      expect(s).not.toMatch(/^(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i);
      expect(s).not.toMatch(/\bDROP\s+(COLUMN|TABLE|TYPE|INDEX|CONSTRAINT|DEFAULT)\b/i);
      expect(s).not.toMatch(/\bALTER\s+COLUMN\b/i);
      expect(s).not.toMatch(/\bRENAME\b/i);
    }
  });

  it("performs only ADD VALUE / ADD COLUMN / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT", () => {
    for (const s of statements) {
      expect(s).toMatch(
        /^(ALTER TYPE "AtsJobStatus" ADD VALUE IF NOT EXISTS|ALTER TABLE "(AtsJob|RetentionPolicy)" ADD COLUMN|CREATE TABLE "(AtsOrganizationSettings|AtsManagementIdempotencyKey)"|CREATE (UNIQUE )?INDEX|ALTER TABLE "(AtsOrganizationSettings|AtsManagementIdempotencyKey)" ADD CONSTRAINT)/,
      );
    }
  });

  it("appends PAUSED and ARCHIVED idempotently and keeps the legacy ON_HOLD", () => {
    expect(sql).toContain(`ALTER TYPE "AtsJobStatus" ADD VALUE IF NOT EXISTS 'PAUSED'`);
    expect(sql).toContain(`ALTER TYPE "AtsJobStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED'`);
    expect(schema).toMatch(/enum AtsJobStatus \{[\s\S]*ON_HOLD[\s\S]*PAUSED[\s\S]*ARCHIVED[\s\S]*?\}/);
    // Nothing in the migration USES a new value (ADD VALUE is non-transactional).
    const withoutAddValue = body.replace(/ALTER TYPE "AtsJobStatus" ADD VALUE IF NOT EXISTS '(PAUSED|ARCHIVED)'/g, "");
    expect(withoutAddValue).not.toMatch(/'(PAUSED|ARCHIVED)'/);
  });

  it("every new AtsJob column is nullable or carries a structural default only", () => {
    const alter = statements.find((s) => s.startsWith('ALTER TABLE "AtsJob" ADD COLUMN'))!;
    const cols = alter.split("ADD COLUMN").slice(1).map((c) => c.trim().replace(/,$/, "").replace(/\s+/g, " "));
    expect(cols).toHaveLength(16);
    const notNull = cols.filter((c) => /NOT NULL/.test(c)).sort();
    expect(notNull).toEqual([
      `"evidenceRequirements" JSONB NOT NULL DEFAULT '[]'`,
      `"salaryConfidential" BOOLEAN NOT NULL DEFAULT false`,
      `"version" INTEGER NOT NULL DEFAULT 0`,
    ]);
    // Publication columns are NOT touched: no default ever makes a job public or open.
    expect(alter).not.toMatch(/"isPublic"|"status"|"publishedAt"|"deletedAt"/);
  });

  it("the RetentionPolicy change is one nullable column", () => {
    const alter = statements.filter((s) => s.startsWith('ALTER TABLE "RetentionPolicy"'));
    expect(alter).toEqual(['ALTER TABLE "RetentionPolicy" ADD COLUMN     "effectiveFrom" TIMESTAMP(3)']);
  });

  it("creates exactly the two M1 tables, each owned by an organization and dying with it", () => {
    const created = statements.filter((s) => s.startsWith("CREATE TABLE")).map((s) => /CREATE TABLE "(\w+)"/.exec(s)![1]);
    expect(created.sort()).toEqual(["AtsManagementIdempotencyKey", "AtsOrganizationSettings"]);
    for (const t of created) {
      expect(sql).toContain(
        `ALTER TABLE "${t}" ADD CONSTRAINT "${t}_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
    }
    expect(sql).toContain('CREATE UNIQUE INDEX "AtsOrganizationSettings_organizationId_key"');
    expect(sql).toMatch(/CREATE UNIQUE INDEX "AtsManagementIdempotencyKey_organizationId_operation_keyHas_key"/);
  });
});

describe("ATS-M1 — safety properties are properties of the data", () => {
  it("settings fail closed: external AI off, deterministic provider, intake closed", () => {
    const s = model("AtsOrganizationSettings");
    expect(s).toMatch(/externalAiProcessingEnabled\s+Boolean\s+@default\(false\)/);
    expect(s).toMatch(/aiProviderMode\s+String\s+@default\("deterministic"\)/);
    expect(s).toMatch(/applicationIntakeEnabled\s+Boolean\s+@default\(false\)/);
    expect(sql).toContain(`"externalAiProcessingEnabled" BOOLEAN NOT NULL DEFAULT false`);
    expect(sql).toContain(`"applicationIntakeEnabled" BOOLEAN NOT NULL DEFAULT false`);
    expect(sql).toContain(`"aiProviderMode" TEXT NOT NULL DEFAULT 'deterministic'`);
  });

  it("settings store no secret and no switch for the human approval gate", () => {
    const s = model("AtsOrganizationSettings").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(s).not.toMatch(/secret|token|password|apiKey|credential/i);
    expect(s).not.toMatch(/humanApproval|evidenceRequired|skipReview|autoReject|autoAccept/i);
  });

  it("idempotency claims store hashes only, never a raw key", () => {
    const m = model("AtsManagementIdempotencyKey");
    expect(m).toContain("keyHash");
    expect(m).toContain("payloadHash");
    expect(m).not.toMatch(/^\s+key\s+String/m);
    expect(m).toContain("@@unique([organizationId, operation, keyHash])");
  });

  it("the application → job foreign key still refuses a hard delete (NO ACTION, never CASCADE)", () => {
    const b1 = readFileSync(join(REPO, "prisma/migrations/20260731000000_phase58b_ats_persistence/migration.sql"), "utf8");
    const fk = b1.replace(/\r\n/g, "\n").match(/ADD CONSTRAINT "AtsApplication_jobId_fkey"[\s\S]*?;/)![0];
    expect(fk).not.toMatch(/ON DELETE (CASCADE|SET NULL)/);
    // No later migration redefines it (comments excluded — the M1 header names it).
    const dirs = readdirSync(join(REPO, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d));
    const touching = dirs.filter((d) => {
      const text = readFileSync(join(REPO, "prisma/migrations", d, "migration.sql"), "utf8")
        .split(/\r?\n/)
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n");
      return text.includes("AtsApplication_jobId_fkey");
    });
    expect(touching).toEqual(["20260731000000_phase58b_ats_persistence"]);
    expect(model("AtsApplication")).toMatch(/job\s+AtsJob\s+@relation\(fields: \[jobId\], references: \[id\]\)/);
  });
});
