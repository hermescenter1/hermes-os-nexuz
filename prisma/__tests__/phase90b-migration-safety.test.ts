import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * PHASE 90B — migration and schema safety for the knowledge-surface ownership
 * extension (EngineeringMemory / UnknownAnalysis / Project owner columns, an
 * EngineeringCase published-corpus index, and AuditLog tenancy/traceability
 * columns).
 *
 * Static assertions over the committed SQL and schema only. They run in CI with
 * no database: nothing here connects to, reads from or mutates a real database.
 */

const REPO = process.cwd();
const MINE = "20260813000000_phase90b_knowledge_tenant_ownership";
const MIGRATION_DIR = join(REPO, "prisma/migrations", MINE);
const sql = readFileSync(join(MIGRATION_DIR, "migration.sql"), "utf8");
const schema = readFileSync(resolve(REPO, "prisma/schema.prisma"), "utf8");

/** Statements with comments stripped — comments legitimately mention "destroy". */
const statements = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

describe("90B — the migration is additive and non-destructive", () => {
  it("contains no destructive operation", () => {
    for (const stmt of statements) {
      expect(stmt, `destructive statement: ${stmt}`).not.toMatch(
        /\b(DROP|DELETE|TRUNCATE|RENAME)\b/i,
      );
    }
  });

  it("adds no NOT NULL column and no DEFAULT (legacy rows stay valid, no backfill)", () => {
    for (const stmt of statements) {
      if (/ADD COLUMN/i.test(stmt)) {
        expect(stmt, `column must be nullable: ${stmt}`).not.toMatch(/NOT\s+NULL/i);
        expect(stmt, "no DEFAULT needed for a nullable add").not.toMatch(/DEFAULT/i);
      }
    }
  });

  it("performs only ADD COLUMN and CREATE INDEX, never ALTER COLUMN", () => {
    for (const stmt of statements) {
      expect(stmt, `unexpected operation: ${stmt}`).toMatch(
        /^(ALTER TABLE "\w+" ADD COLUMN|CREATE INDEX)/i,
      );
    }
    for (const stmt of statements.filter((s) => /^ALTER TABLE/i.test(s))) {
      expect(stmt).not.toMatch(/ALTER COLUMN|SET NOT NULL|DROP NOT NULL|TYPE /i);
    }
  });

  it("every added owner column is a nullable TEXT", () => {
    const added = [...sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN "(\w+)" (\w+)/g)];
    expect(added.length).toBeGreaterThan(0);
    for (const [, , , type] of added) {
      expect(type).toBe("TEXT");
    }
  });

  it("touches only the intended tables (knowledge surface + audit)", () => {
    const tables = new Set(
      statements.flatMap((s) =>
        [...s.matchAll(/"(\w+)"\s*\(|TABLE "(\w+)"/g)].map((m) => m[1] ?? m[2]),
      ),
    );
    expect([...tables].sort()).toEqual(
      ["AuditLog", "EngineeringCase", "EngineeringMemory", "Project", "UnknownAnalysis"],
    );
  });
});

describe("90B — schema and migration stay semantically aligned", () => {
  const ownedModels = ["EngineeringMemory", "UnknownAnalysis", "Project"] as const;

  function modelBlock(name: string): string {
    const m = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
    expect(m, `model ${name} not found`).toBeTruthy();
    return m![1];
  }

  it.each(ownedModels)("%s declares both ownership columns as nullable + SQL adds them", (model) => {
    const block = modelBlock(model);
    for (const col of ["userId", "organizationId"]) {
      expect(block, `${model}.${col} must exist and be optional`).toMatch(
        new RegExp(`^\\s+${col}\\s+String\\?\\s*$`, "m"),
      );
      expect(sql).toContain(`ALTER TABLE "${model}" ADD COLUMN "${col}" TEXT;`);
    }
  });

  it.each(ownedModels)("%s declares the two tenant-aware ownership indexes verbatim in SQL", (model) => {
    for (const cols of [["userId", "createdAt"], ["organizationId", "createdAt"]]) {
      const quoted = cols.map((c) => `"${c}"`).join(", ");
      expect(sql, `missing index on ${model}(${cols.join(", ")})`).toContain(
        `ON "${model}"(${quoted});`,
      );
    }
  });

  it("EngineeringCase gains a (status, createdAt) index for the public published read", () => {
    expect(schema).toMatch(/model EngineeringCase \{[\s\S]*@@index\(\[status, createdAt\]\)[\s\S]*\n\}/);
    expect(sql).toContain(`ON "EngineeringCase"("status", "createdAt");`);
  });

  it("AuditLog gains nullable organizationId / outcome / correlationId + an org index", () => {
    const block = modelBlock("AuditLog");
    for (const col of ["organizationId", "outcome", "correlationId"]) {
      expect(block, `AuditLog.${col} must exist and be optional`).toMatch(
        new RegExp(`^\\s+${col}\\s+String\\?\\s*$`, "m"),
      );
      expect(sql).toContain(`ALTER TABLE "AuditLog" ADD COLUMN "${col}" TEXT;`);
    }
    expect(sql).toContain(`ON "AuditLog"("organizationId");`);
  });

  it("the migration adds nothing the schema does not declare", () => {
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/g)) {
      const [, table, col] = m;
      expect(modelBlock(table), `${table}.${col} is in SQL but not in the schema`).toMatch(
        new RegExp(`^\\s+${col}\\s`, "m"),
      );
    }
  });

  it("applies after every migration that predates it (ordering invariant)", () => {
    const dirs = readdirSync(join(REPO, "prisma/migrations"))
      .filter((d) => /^\d{14}_/.test(d))
      .sort();
    const idx = dirs.indexOf(MINE);
    expect(idx, "Phase 90B migration is missing").toBeGreaterThan(-1);
    expect(idx, "Phase 90B must not sort before the pre-existing migrations").toBeGreaterThan(0);
    // In particular it must sort strictly after the original Phase 90 migration.
    expect("20260812000000_phase90_brain_tenant_ownership" < MINE).toBe(true);
    for (const earlier of dirs.slice(0, idx)) expect(earlier < MINE).toBe(true);
  });
});
