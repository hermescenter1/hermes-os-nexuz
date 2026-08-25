/**
 * PHASE 104-B1 — recruitment foundation: schema and migration shape.
 *
 * Source-of-truth assertions over `prisma/schema.prisma` and the B1 migration
 * SQL. They pin the DECISIONS, not the formatting:
 *
 *   - owner-gated columns are nullable with NO invented default;
 *   - the misleading onsite/USD/citizen defaults are gone and the migration
 *     drops them WITHOUT rewriting stored rows (no UPDATE/backfill DML);
 *   - requisitionKey is org-scoped unique and still nullable (stage 1 of the
 *     five-stage plan);
 *   - publishedAt exists and is never backfilled from createdAt;
 *   - the translation model is Option A: one lifecycle on AtsJob, locale rows
 *     unique per (jobId, language), skills keyed by code, never positional;
 *   - ConsentRecord gains a TYPED recordNature;
 *   - the idempotency and OTP stores exist with their unique scopes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const schema = readFileSync(join(REPO, "prisma/schema.prisma"), "utf8");
const MIGRATION = "20260824000000_phase104_b1_recruitment_foundation";
const sql = readFileSync(join(REPO, "prisma/migrations", MIGRATION, "migration.sql"), "utf8");

function model(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
  expect(m, `model ${name} must exist`).not.toBeNull();
  return m![0];
}

describe("B1 — AtsJob columns", () => {
  const job = model("AtsJob");

  it("retires the misleading defaults: locationType and salaryCurrency are nullable, no default", () => {
    expect(job).toMatch(/locationType\s+String\?/);
    expect(job).toMatch(/salaryCurrency\s+String\?/);
    expect(job).not.toMatch(/locationType[^\n]*@default/);
    expect(job).not.toMatch(/salaryCurrency[^\n]*@default/);
  });

  it("every B1 column is present, nullable and default-free", () => {
    for (const col of [
      "requisitionKey", "externalKey", "slug", "employmentType", "contractType",
      "hiringManagerId", "addressLocality", "addressRegion", "addressCountry",
      "workingHoursSchedule", "educationRequirement", "minimumExperience",
    ]) {
      expect(job, col).toMatch(new RegExp(`${col}\\s+String\\?`));
      expect(job, `${col} must not carry a default`).not.toMatch(new RegExp(`${col}[^\\n]*@default`));
    }
    expect(job).toMatch(/numberOfOpenings\s+Int\?/);
    expect(job).not.toMatch(/numberOfOpenings[^\n]*@default/);
    expect(job).toMatch(/publishedAt\s+DateTime\?/);
    expect(job).not.toMatch(/publishedAt[^\n]*@default/);
  });

  it("isPublic carries NO default — publication is always an explicit write", () => {
    // B1.1: @default(true) meant an INSERT without a publication decision was
    // silently PUBLIC. The column stays NOT NULL, so such an INSERT now fails.
    expect(job).toMatch(/isPublic\s+Boolean(?!\s*@default)/);
    expect(job).not.toMatch(/isPublic[^\n]*@default/);
    expect(sql).toContain('ALTER TABLE "AtsJob" ALTER COLUMN "isPublic" DROP DEFAULT;');
  });

  it("requisitionKey is unique in ORGANIZATION scope, and still nullable", () => {
    expect(job).toContain("@@unique([organizationId, requisitionKey])");
    expect(job).toMatch(/requisitionKey\s+String\?/);
  });

  it("the hiring-manager link is a COMPOSITE tenant FK enforced by the DATABASE", () => {
    // B1.1 — "the relation targets OrganizationMember" proved nothing about
    // tenancy: a single-column FK accepts org B's member on org A's job. The
    // constraint that matters is the composite one, and it lives in SQL
    // (phase102 release-blocker-6 precedent).
    expect(job).toMatch(/hiringManager\s+OrganizationMember\?/);
    expect(sql).toContain('CREATE UNIQUE INDEX "OrganizationMember_organizationId_id_key"');
    expect(sql).toContain('FOREIGN KEY ("organizationId", "hiringManagerId")');
    expect(sql).toContain('REFERENCES "OrganizationMember"("organizationId", "id")');
    // referential action: SET NULL with a COLUMN LIST — the tenant column is
    // never nulled by a member deletion
    expect(sql).toContain('ON DELETE SET NULL ("hiringManagerId")');
    expect(sql).not.toMatch(/REFERENCES "OrganizationMember"\("id"\)/);
  });

  it("the idempotency claim is bound to a job of its OWN organization by a composite FK", () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "AtsJob_organizationId_id_key"');
    expect(sql).toContain('FOREIGN KEY ("organizationId", "jobId")');
    expect(sql).toContain('REFERENCES "AtsJob"("organizationId", "id")');
  });
});

describe("B1 — AtsCandidate", () => {
  it("workAuthorization no longer fabricates citizen", () => {
    const candidate = model("AtsCandidate");
    expect(candidate).toMatch(/workAuthorization\s+String\?/);
    expect(candidate).not.toMatch(/workAuthorization[^\n]*@default/);
    // pin the MECHANISM (no default), not the word — comments may cite it
    expect(candidate).not.toMatch(/@default("citizen")/);
  });
});

describe("B1 — AtsJobTranslation (Option A)", () => {
  const t = model("AtsJobTranslation");

  it("one lifecycle: translation rows have no status/publication fields", () => {
    expect(t).not.toMatch(/\bstatus\b/);
    expect(t).not.toMatch(/isPublic/);
    expect(t).not.toMatch(/publishedAt/);
  });

  it("is unique per (jobId, language) with the three-language enum", () => {
    expect(t).toContain("@@unique([jobId, language])");
    expect(schema).toMatch(/enum AtsJobLanguage \{\s*EN\s*DE\s*FA\s*\}/);
  });

  it("carries the full localized contract", () => {
    for (const col of [
      "title", "shortSummary", "description", "departmentLabel",
      "responsibilities", "requirements", "preferredExperience",
      "localizedSkills", "seoTitle", "seoDescription",
    ]) {
      expect(t, col).toContain(col);
    }
    // skills are keyed by code (an object), never positional
    expect(t).toMatch(/localizedSkills\s+Json\s+@default\("\{\}"\)/);
  });
});

describe("B1 — ConsentRecord.recordNature", () => {
  it("is a typed enum column, nullable only for unknown historical rows", () => {
    expect(schema).toMatch(/enum ConsentRecordNature \{\s*ACKNOWLEDGEMENT\s*ATTESTATION\s*CONSENT\s*\}/);
    expect(model("ConsentRecord")).toMatch(/recordNature\s+ConsentRecordNature\?/);
  });
});

describe("B1 — idempotency and OTP stores", () => {
  it("RecruitmentIdempotencyKey claims atomically under (organizationId, jobId, keyHash)", () => {
    const m = model("RecruitmentIdempotencyKey");
    expect(m).toContain("@@unique([organizationId, jobId, keyHash])");
    expect(m).toContain("payloadHash");
    expect(m).toContain("expiresAt");
    // never the raw key
    expect(m).not.toMatch(/\brawKey\b|\bkey\s+String/);
  });

  it("RecruitmentOtpChallenge stores digests and typed lifecycle fields only", () => {
    const m = model("RecruitmentOtpChallenge");
    for (const col of ["identifierHmac", "codeHmac", "secretVersion", "attempts", "maxAttempts", "expiresAt", "invalidatedAt", "consumedAt"]) {
      expect(m, col).toContain(col);
    }
    expect(m).not.toMatch(/\bcode\s+String/);
    expect(m).not.toMatch(/\bemail\b/);
  });
});

describe("B1 — migration SQL discipline", () => {
  it("drops the misleading defaults without touching stored rows", () => {
    expect(sql).toContain('ALTER TABLE "AtsJob" ALTER COLUMN "locationType" DROP DEFAULT');
    expect(sql).toContain('ALTER TABLE "AtsJob" ALTER COLUMN "salaryCurrency" DROP DEFAULT');
    expect(sql).toContain('ALTER TABLE "AtsCandidate" ALTER COLUMN "workAuthorization" DROP DEFAULT');
  });

  it("is purely additive DDL: no UPDATE, DELETE, INSERT or backfill anywhere", () => {
    const statements = sql
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("--"));
    for (const line of statements) {
      expect(line, line).not.toMatch(/^(UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
    }
    // and no executable statement derives publishedAt from createdAt
    // (the file's own documentation may cite the rule):
    for (const line of statements) {
      expect(line, line).not.toMatch(/publishedAt.*createdAt/i);
    }
  });

  it("adds requisitionKey NULLABLE — the NOT NULL conversion belongs to a later, backfilled stage", () => {
    expect(sql).toContain('ADD COLUMN "requisitionKey" TEXT;');
    expect(sql).not.toMatch(/"requisitionKey" TEXT NOT NULL/);
  });
});
