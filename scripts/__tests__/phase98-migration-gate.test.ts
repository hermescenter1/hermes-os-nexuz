import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyMigrationSql } from "../dr/migration-sql-classify.mjs";
import { computeMigrationChecksums, evaluateMigrationGate } from "../dr/migration-gate.mjs";

/**
 * PHASE 98 — Prisma migration release gate (pure, filesystem-scoped fixtures).
 *
 * Proves the two fail-closed invariants that must never be bypassed:
 *   - a mutated/missing HISTORICAL migration blocks deploy unconditionally
 *   - an UNKNOWN/BREAKING new migration blocks deploy unconditionally
 * and that additive/forward-only migrations are classified correctly and
 * always require a pre-migration backup except when there is nothing new
 * to apply at all.
 */

const tmpDirs: string[] = [];

function makeMigrationsDir(migrations: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "phase98-migrations-"));
  tmpDirs.push(dir);
  for (const [name, sql] of Object.entries(migrations)) {
    const mDir = join(dir, name);
    mkdirSync(mDir, { recursive: true });
    writeFileSync(join(mDir, "migration.sql"), sql, "utf8");
  }
  return dir;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("classifyMigrationSql", () => {
  it("detects TRUNCATE as breaking", () => {
    const { classification, hits } = classifyMigrationSql(`TRUNCATE "User";`);
    expect(classification).toBe("BREAKING_OR_UNKNOWN");
    expect(hits.some((h) => h.pattern === "TRUNCATE" && h.severity === "breaking")).toBe(true);
  });

  it("detects RENAME COLUMN as breaking", () => {
    const { classification, hits } = classifyMigrationSql(
      `ALTER TABLE "User" RENAME COLUMN "name" TO "fullName";`,
    );
    expect(classification).toBe("BREAKING_OR_UNKNOWN");
    expect(hits.some((h) => h.pattern === "RENAME COLUMN")).toBe(true);
  });

  it("detects ADD FOREIGN KEY as forward-only", () => {
    const { classification, hits } = classifyMigrationSql(
      `ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id");`,
    );
    expect(classification).toBe("FORWARD_ONLY_REQUIRES_BACKUP");
    expect(hits.some((h) => h.pattern === "ADD CONSTRAINT ... FOREIGN KEY")).toBe(true);
  });

  it("detects an unbounded UPDATE (no WHERE) as forward-only", () => {
    const { classification, hits } = classifyMigrationSql(`UPDATE "User" SET "role" = 'member';`);
    expect(classification).toBe("FORWARD_ONLY_REQUIRES_BACKUP");
    expect(hits.some((h) => h.pattern === "UPDATE without WHERE (unbounded)")).toBe(true);
  });

  it("does NOT flag an UPDATE that has a WHERE clause", () => {
    const { classification, hits } = classifyMigrationSql(
      `UPDATE "User" SET "role" = 'member' WHERE "role" IS NULL;`,
    );
    expect(classification).toBe("ADDITIVE_COMPATIBLE");
    expect(hits.length).toBe(0);
  });

  it("strips line comments before matching — a DROP TABLE only inside a comment is not breaking", () => {
    const sql = [
      `-- do not DROP TABLE "User" here, this is just documentation`,
      `CREATE TABLE "Widget" ("id" TEXT NOT NULL PRIMARY KEY);`,
    ].join("\n");
    const { classification, hits } = classifyMigrationSql(sql);
    expect(classification).toBe("ADDITIVE_COMPATIBLE");
    expect(hits.length).toBe(0);
  });

  it("strips block comments before matching", () => {
    const sql = `/* legacy note: we used to DROP TABLE "Old" but removed that step */\nCREATE TABLE "New" ("id" TEXT NOT NULL PRIMARY KEY);`;
    const { classification, hits } = classifyMigrationSql(sql);
    expect(classification).toBe("ADDITIVE_COMPATIBLE");
    expect(hits.length).toBe(0);
  });

  it("classifies ADD COLUMN ... NOT NULL without DEFAULT as forward-only", () => {
    const { classification, hits } = classifyMigrationSql(
      `ALTER TABLE "User" ADD COLUMN "tenantId" TEXT NOT NULL;`,
    );
    expect(classification).toBe("FORWARD_ONLY_REQUIRES_BACKUP");
    expect(hits.some((h) => h.pattern === "ADD COLUMN ... NOT NULL without DEFAULT")).toBe(true);
  });

  it("does NOT flag ADD COLUMN ... NOT NULL when a DEFAULT is present", () => {
    const { classification, hits } = classifyMigrationSql(
      `ALTER TABLE "User" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'legacy';`,
    );
    expect(classification).toBe("ADDITIVE_COMPATIBLE");
    expect(hits.length).toBe(0);
  });

  it("classifies a plain DROP INDEX as non-breaking (ignored)", () => {
    const { classification, hits } = classifyMigrationSql(`DROP INDEX "User_email_idx";`);
    expect(classification).toBe("ADDITIVE_COMPATIBLE");
    expect(hits.length).toBe(0);
  });
});

describe("computeMigrationChecksums", () => {
  it("hashes each migration.sql, sorted by folder name", () => {
    const dir = makeMigrationsDir({
      "20260101000000_init": `CREATE TABLE "A" ("id" TEXT NOT NULL PRIMARY KEY);`,
      "20260102000000_second": `CREATE TABLE "B" ("id" TEXT NOT NULL PRIMARY KEY);`,
    });
    const checksums = computeMigrationChecksums(dir);
    expect(Object.keys(checksums)).toEqual(["20260101000000_init", "20260102000000_second"]);
    expect(checksums["20260101000000_init"]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("evaluateMigrationGate", () => {
  it("NO_MIGRATION: identical base and target -> no backup required, not blocked", () => {
    const dir = makeMigrationsDir({
      "20260101000000_init": `CREATE TABLE "A" ("id" TEXT NOT NULL PRIMARY KEY);`,
    });
    const base = computeMigrationChecksums(dir);
    const decision = evaluateMigrationGate({ migrationsDir: dir, releaseBaseChecksums: base });

    expect(decision.migrationClassification).toBe("NO_MIGRATION");
    expect(decision.newMigrations).toEqual([]);
    expect(decision.missingMigrations).toEqual([]);
    expect(decision.mutatedMigrations).toEqual([]);
    expect(decision.historicalMutation).toBe(false);
    expect(decision.preMigrationBackupRequired).toBe(false);
    expect(decision.deployBlocked).toBe(false);
  });

  it("ADDITIVE_COMPATIBLE: a purely additive new migration is not blocked but still requires backup", () => {
    const dir = makeMigrationsDir({
      "20260101000000_init": `CREATE TABLE "A" ("id" TEXT NOT NULL PRIMARY KEY);`,
    });
    const base = computeMigrationChecksums(dir);

    mkdirSync(join(dir, "20260102000000_add_widget"), { recursive: true });
    writeFileSync(
      join(dir, "20260102000000_add_widget", "migration.sql"),
      `CREATE TABLE "Widget" ("id" TEXT NOT NULL PRIMARY KEY);\nALTER TABLE "A" ADD COLUMN "y" TEXT;`,
      "utf8",
    );

    const decision = evaluateMigrationGate({ migrationsDir: dir, releaseBaseChecksums: base });

    expect(decision.migrationClassification).toBe("ADDITIVE_COMPATIBLE");
    expect(decision.newMigrations).toEqual(["20260102000000_add_widget"]);
    expect(decision.historicalMutation).toBe(false);
    expect(decision.deployBlocked).toBe(false);
    expect(decision.preMigrationBackupRequired).toBe(true);
  });

  it("FORWARD_ONLY_REQUIRES_BACKUP: ADD COLUMN ... NOT NULL without DEFAULT", () => {
    const dir = makeMigrationsDir({
      "20260101000000_init": `CREATE TABLE "A" ("id" TEXT NOT NULL PRIMARY KEY);`,
    });
    const base = computeMigrationChecksums(dir);

    mkdirSync(join(dir, "20260102000000_add_required_col"), { recursive: true });
    writeFileSync(
      join(dir, "20260102000000_add_required_col", "migration.sql"),
      `ALTER TABLE "A" ADD COLUMN "tenantId" TEXT NOT NULL;`,
      "utf8",
    );

    const decision = evaluateMigrationGate({ migrationsDir: dir, releaseBaseChecksums: base });

    expect(decision.migrationClassification).toBe("FORWARD_ONLY_REQUIRES_BACKUP");
    expect(decision.deployBlocked).toBe(false);
    expect(decision.preMigrationBackupRequired).toBe(true);
  });

  it("BREAKING_OR_UNKNOWN: a DROP TABLE migration blocks deploy", () => {
    const dir = makeMigrationsDir({
      "20260101000000_init": `CREATE TABLE "A" ("id" TEXT NOT NULL PRIMARY KEY);`,
    });
    const base = computeMigrationChecksums(dir);

    mkdirSync(join(dir, "20260102000000_drop_a"), { recursive: true });
    writeFileSync(join(dir, "20260102000000_drop_a", "migration.sql"), `DROP TABLE "A";`, "utf8");

    const decision = evaluateMigrationGate({ migrationsDir: dir, releaseBaseChecksums: base });

    expect(decision.migrationClassification).toBe("BREAKING_OR_UNKNOWN");
    expect(decision.deployBlocked).toBe(true);
    expect(decision.preMigrationBackupRequired).toBe(true);
  });

  it("HISTORICAL_MIGRATION_MUTATION: a base migration's checksum changed in the target -> blocked", () => {
    const dir = makeMigrationsDir({
      "20260101000000_init": `CREATE TABLE "A" ("id" TEXT NOT NULL PRIMARY KEY);`,
    });
    const base = computeMigrationChecksums(dir);

    // Mutate the already-applied migration's SQL in place (simulating tampering
    // with an append-only history).
    writeFileSync(
      join(dir, "20260101000000_init", "migration.sql"),
      `CREATE TABLE "A" ("id" TEXT NOT NULL PRIMARY KEY, "extra" TEXT);`,
      "utf8",
    );

    const decision = evaluateMigrationGate({ migrationsDir: dir, releaseBaseChecksums: base });

    expect(decision.mutatedMigrations).toEqual(["20260101000000_init"]);
    expect(decision.historicalMutation).toBe(true);
    expect(decision.deployBlocked).toBe(true);
  });

  it("historical mutation via a MISSING base migration also blocks deploy", () => {
    const dir = makeMigrationsDir({
      "20260101000000_init": `CREATE TABLE "A" ("id" TEXT NOT NULL PRIMARY KEY);`,
      "20260102000000_second": `CREATE TABLE "B" ("id" TEXT NOT NULL PRIMARY KEY);`,
    });
    const base = computeMigrationChecksums(dir);

    // Target only has "init" — "second" has vanished from history.
    const target = { "20260101000000_init": base["20260101000000_init"] };

    const decision = evaluateMigrationGate({
      migrationsDir: dir,
      releaseBaseChecksums: base,
      targetChecksums: target,
    });

    expect(decision.missingMigrations).toEqual(["20260102000000_second"]);
    expect(decision.historicalMutation).toBe(true);
    expect(decision.deployBlocked).toBe(true);
  });
});
