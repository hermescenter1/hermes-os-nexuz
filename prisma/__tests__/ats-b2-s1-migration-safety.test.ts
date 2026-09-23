/**
 * ATS-B2 / ATS-S1 — migration and schema safety.
 *
 * Static assertions over the committed SQL and the Prisma schema. Nothing here
 * connects to a database. Modelled on phase102-migration-safety.test.ts and
 * phase104b12-schema-sql-parity.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = process.cwd();
const MIGRATION = "20260923000000_ats_b2_s1_orchestration_and_review";

const sql = readFileSync(join(REPO, "prisma/migrations", MIGRATION, "migration.sql"), "utf8");
const schema = readFileSync(resolve(REPO, "prisma/schema.prisma"), "utf8");

const body = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const statements = body
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const NEW_TABLES = ["AtsJobCriterion", "AtsAiReview", "AtsReviewDecision", "AtsReviewOutbox"] as const;

function model(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(m, `model ${name}`).not.toBeNull();
  return m![0];
}

describe("B2/S1 — the migration is additive and non-destructive", () => {
  it("sorts strictly after every existing migration", () => {
    const dirs = readdirSync(join(REPO, "prisma/migrations")).filter((d) => /^\d{14}_/.test(d)).sort();
    expect(dirs[dirs.length - 1]).toBe(MIGRATION);
  });

  it("contains no destructive statement and no data rewrite", () => {
    for (const s of statements) {
      expect(s).not.toMatch(/^(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/i);
      expect(s).not.toMatch(/\bDROP\s+(COLUMN|TABLE|TYPE|INDEX|CONSTRAINT)\b/i);
      expect(s).not.toMatch(/\bALTER\s+COLUMN\b/i);
    }
  });

  it("performs only CREATE TYPE / ALTER TYPE ADD VALUE / ADD COLUMN / CREATE TABLE / CREATE INDEX / ADD CONSTRAINT", () => {
    for (const s of statements) {
      expect(s).toMatch(
        /^(CREATE TYPE|ALTER TYPE "AtsApplicationStatus" ADD VALUE IF NOT EXISTS|ALTER TABLE "AtsApplication" ADD COLUMN|CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE "(AtsJobCriterion|AtsAiReview|AtsReviewDecision|AtsReviewOutbox)" ADD CONSTRAINT)/,
      );
    }
  });

  it("appends the two stage-gate values idempotently", () => {
    expect(sql).toContain(`ALTER TYPE "AtsApplicationStatus" ADD VALUE IF NOT EXISTS 'AI_REVIEW_PENDING'`);
    expect(sql).toContain(`ALTER TYPE "AtsApplicationStatus" ADD VALUE IF NOT EXISTS 'PENDING_HUMAN_APPROVAL'`);
    expect(schema).toMatch(/enum AtsApplicationStatus \{[\s\S]*AI_REVIEW_PENDING[\s\S]*PENDING_HUMAN_APPROVAL[\s\S]*\}/);
  });

  it("every new AtsApplication column is nullable or carries a structural default only", () => {
    const alter = statements.find((s) => s.startsWith('ALTER TABLE "AtsApplication" ADD COLUMN'))!;
    const cols = alter.split("ADD COLUMN").slice(1).map((c) => c.trim().replace(/,$/, ""));
    expect(cols).toHaveLength(9);
    for (const c of cols) {
      if (/NOT NULL/.test(c)) {
        // the only NOT NULL column is the review-cycle counter, defaulted to 0
        expect(c).toMatch(/^"aiReviewCycle" INTEGER NOT NULL DEFAULT 0$/);
      }
    }
  });

  it("creates exactly the four S1 tables", () => {
    const created = statements
      .filter((s) => s.startsWith("CREATE TABLE"))
      .map((s) => /CREATE TABLE "(\w+)"/.exec(s)![1]);
    expect(created.sort()).toEqual([...NEW_TABLES].sort());
  });
});

describe("B2/S1 — tenant ownership is structural, not conventional", () => {
  it("AtsApplication gains the composite tenant target (organizationId, id) on BOTH sides", () => {
    expect(model("AtsApplication")).toContain("@@unique([organizationId, id])");
    expect(sql).toContain('CREATE UNIQUE INDEX "AtsApplication_organizationId_id_key" ON "AtsApplication"("organizationId", "id")');
  });

  it("every S1 child row carries the tenant in a COMPOSITE foreign key to the application", () => {
    for (const t of ["AtsAiReview", "AtsReviewDecision", "AtsReviewOutbox"] as const) {
      expect(model(t)).toContain(
        `fields: [organizationId, applicationId], references: [organizationId, id], onDelete: Cascade, onUpdate: Cascade, map: "${t}_application_tenant_fkey"`,
      );
      expect(sql).toContain(
        `ALTER TABLE "${t}" ADD CONSTRAINT "${t}_application_tenant_fkey" FOREIGN KEY ("organizationId", "applicationId") REFERENCES "AtsApplication"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
    }
    expect(model("AtsJobCriterion")).toContain(
      'fields: [organizationId, jobId], references: [organizationId, id], onDelete: Cascade, onUpdate: Cascade, map: "AtsJobCriterion_job_tenant_fkey"',
    );
    expect(sql).toContain(
      'ALTER TABLE "AtsJobCriterion" ADD CONSTRAINT "AtsJobCriterion_job_tenant_fkey" FOREIGN KEY ("organizationId", "jobId") REFERENCES "AtsJob"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
  });

  it("no single-column FK to AtsApplication(id) or AtsJob(id) exists for any new table", () => {
    expect(body).not.toMatch(/REFERENCES "AtsApplication"\("id"\)/);
    expect(body).not.toMatch(/REFERENCES "AtsJob"\("id"\)/);
  });

  it("every new table is owned by an organization and dies with it", () => {
    for (const t of NEW_TABLES) {
      // `\s*$` with the m flag: the schema is checked out with CRLF on Windows.
      expect(model(t)).toMatch(/organizationId\s+String\s*$/m);
      expect(sql).toContain(
        `ALTER TABLE "${t}" ADD CONSTRAINT "${t}_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      );
    }
    for (const rel of ["atsJobCriteria       AtsJobCriterion[]", "atsAiReviews         AtsAiReview[]", "atsReviewDecisions   AtsReviewDecision[]", "atsReviewOutbox      AtsReviewOutbox[]"]) {
      expect(model("Organization")).toContain(rel);
    }
  });
});

describe("B2/S1 — the stage gate is a property of the data", () => {
  it("a decision row cannot exist without an actor, a reason, both statuses and a correlation id", () => {
    const d = model("AtsReviewDecision");
    for (const col of ["actorUserId    String", "actorRole      String", "reason         String", "correlationId  String"]) {
      expect(d).toContain(col);
    }
    expect(d).toContain("fromStatus     AtsApplicationStatus");
    expect(d).toContain("toStatus       AtsApplicationStatus");
    expect(sql).toMatch(/"reason" TEXT NOT NULL/);
    expect(sql).toMatch(/"actorUserId" TEXT NOT NULL/);
    expect(sql).toMatch(/"correlationId" TEXT NOT NULL/);
  });

  it("an AI review stores every version label and the full report", () => {
    const r = model("AtsAiReview");
    for (const col of ["extractorVersion String", "rubricVersion    String", "promptVersion    String", "policyVersion    String", "report           Json"]) {
      expect(r).toContain(col);
    }
    expect(r).toContain("@@unique([organizationId, applicationId, cycle])");
  });

  it("the review outbox is exactly-once at the source", () => {
    expect(model("AtsReviewOutbox")).toContain("@@unique([organizationId, applicationId, kind, cycle])");
    expect(sql).toContain('CREATE UNIQUE INDEX "AtsReviewOutbox_organizationId_applicationId_kind_cycle_key"');
    expect(model("AtsReviewOutbox")).toContain("@@index([status, nextAttemptAt])");
  });

  it("the public reference is unique and nullable — never the row id", () => {
    expect(model("AtsApplication")).toMatch(/publicReference\s+String\?/);
    expect(model("AtsApplication")).toContain("@@unique([publicReference])");
  });
});
