import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * PHASE 90-93A — migration and schema safety.
 *
 * These are static assertions over the committed SQL and schema. They run in
 * CI with no database: nothing here connects to, reads from or mutates a real
 * database.
 */

const REPO = process.cwd();
const MIGRATION_DIR = join(REPO, "prisma/migrations/20260812000000_phase90_brain_tenant_ownership");
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

describe("90 — the migration is additive and non-destructive", () => {
  it("contains no destructive operation", () => {
    for (const stmt of statements) {
      expect(stmt, `destructive statement: ${stmt}`).not.toMatch(
        /\b(DROP|DELETE|TRUNCATE|RENAME)\b/i,
      );
    }
  });

  it("adds no NOT NULL column (existing rows stay valid without a backfill)", () => {
    for (const stmt of statements) {
      if (/ADD COLUMN/i.test(stmt)) {
        expect(stmt, `column must be nullable: ${stmt}`).not.toMatch(/NOT\s+NULL/i);
        expect(stmt, "no DEFAULT needed for a nullable add").not.toMatch(/DEFAULT/i);
      }
    }
  });

  it("performs only ADD COLUMN and CREATE INDEX", () => {
    for (const stmt of statements) {
      expect(stmt, `unexpected operation: ${stmt}`).toMatch(
        /^(ALTER TABLE "\w+" ADD COLUMN|CREATE INDEX)/i,
      );
    }
    // ALTER TABLE here must never change an existing column's type/nullability.
    for (const stmt of statements.filter((s) => /^ALTER TABLE/i.test(s))) {
      expect(stmt).not.toMatch(/ALTER COLUMN|SET NOT NULL|DROP NOT NULL|TYPE /i);
    }
  });

  it("touches only the two Industrial Brain tables", () => {
    const tables = new Set(
      statements.flatMap((s) => [...s.matchAll(/"(\w+)"\s*\(|TABLE "(\w+)"/g)].map((m) => m[1] ?? m[2])),
    );
    expect([...tables].sort()).toEqual(["AnalysisRecord", "EngineeringCase"]);
  });
});

describe("90 — schema and migration stay semantically aligned", () => {
  const models = ["AnalysisRecord", "EngineeringCase"] as const;

  function modelBlock(name: string): string {
    const m = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
    expect(m, `model ${name} not found`).toBeTruthy();
    return m![1];
  }

  it.each(models)("%s declares both ownership columns as nullable", (model) => {
    const block = modelBlock(model);
    for (const col of ["userId", "organizationId"]) {
      expect(block, `${model}.${col} must exist and be optional`).toMatch(
        new RegExp(`^\\s+${col}\\s+String\\?\\s*$`, "m"),
      );
      expect(sql).toContain(`ALTER TABLE "${model}" ADD COLUMN "${col}" TEXT;`);
    }
  });

  it.each(models)("%s indexes in the schema exist verbatim in the SQL", (model) => {
    const indexes = [...modelBlock(model).matchAll(/@@index\(\[([^\]]+)\]\)/g)].map((m) =>
      m[1].split(",").map((c) => c.trim()),
    );
    expect(indexes.length, `${model} should declare the two ownership indexes`).toBe(2);
    for (const cols of indexes) {
      const quoted = cols.map((c) => `"${c}"`).join(", ");
      expect(sql, `missing index on ${model}(${cols.join(", ")})`).toContain(
        `ON "${model}"(${quoted});`,
      );
    }
  });

  it("the migration adds nothing the schema does not declare", () => {
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/g)) {
      const [, table, col] = m;
      expect(modelBlock(table), `${table}.${col} is in SQL but not in the schema`).toMatch(
        new RegExp(`^\\s+${col}\\s`, "m"),
      );
    }
  });

  it("applies after every migration that predates it", () => {
    // The original assertion was "this is the newest migration" — true when it
    // was written, but it necessarily breaks the moment a later phase lands
    // (Phase 94 did). The invariant it actually protects is ORDERING: Phase 90
    // must still sort after the migrations already applied before it.
    const MINE = "20260812000000_phase90_brain_tenant_ownership";
    const dirs = readdirSync(join(REPO, "prisma/migrations"))
      .filter((d) => /^\d{14}_/.test(d))
      .sort();
    const idx = dirs.indexOf(MINE);
    expect(idx, "Phase 90 migration is missing").toBeGreaterThan(-1);
    expect(idx, "Phase 90 must not sort before the pre-existing migrations").toBeGreaterThan(0);
    for (const earlier of dirs.slice(0, idx)) expect(earlier < MINE).toBe(true);
  });
});

describe("90-93A — no insecure NULL-owner fallback survives in code", () => {
  const read = (p: string) =>
    readFileSync(resolve(REPO, p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("ordinary read predicates never select NULL owners", () => {
    const code = read("src/lib/storage/owner-scope.ts");
    const fn = code.slice(code.indexOf("export function ownerWhere"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "ownerWhere must not match unattributed rows").not.toMatch(/userId:\s*null/);
    expect(body, "and must never return an empty (match-all) predicate").not.toMatch(/return\s*\{\s*\}/);
  });

  it("the quarantine predicate is exported separately for admin use only", () => {
    const code = read("src/lib/storage/owner-scope.ts");
    expect(code).toMatch(/export function legacyQuarantineWhere/);
    // …and no repository calls it: quarantined rows stay out of ordinary reads.
    for (const p of ["src/lib/storage/analysis-repository.ts", "src/lib/storage/case-repository.ts"]) {
      expect(read(p), `${p} must not read the quarantine`).not.toMatch(/legacyQuarantineWhere/);
    }
  });

  it("the published-corpus read is the only unscoped path, and is status-filtered", () => {
    const code = read("src/lib/storage/case-repository.ts");
    const fn = code.slice(code.indexOf("export async function listPublishedCases"));
    expect(fn).toMatch(/status: "published"/);
    expect(fn).toMatch(/MAX_PUBLISHED_ROWS/);
  });
});
