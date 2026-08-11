/**
 * PHASE 102 — the applied-migration check reads PostgreSQL, not CLI prose.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The rehearsal used to assert the Phase 102 migration had been applied with
 *
 *     prisma migrate status | grep -q 20260821000000_phase102_media_video_hub
 *
 * `prisma migrate status` prints migration NAMES only in its PENDING branch; an
 * up-to-date database prints "Database schema is up to date!" and no names. So
 * that grep passed only when the migration had NOT been applied — an inverted
 * assertion that could never go green on a healthy database, and did not, the
 * first time the workflow ran.
 *
 * The replacement reads `_prisma_migrations` — Prisma's own record of what the
 * database has applied. This suite drives every failure mode of that evaluator
 * with synthetic rows (no database needed), proves the forbidden implementation
 * cannot come back, and proves the check refuses to point anywhere but a
 * disposable rehearsal database.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  EXPECTED_COMPLETED_MIGRATIONS,
  PHASE102_MIGRATION,
  assertDisposableDatabase,
  evaluateAppliedMigrations,
} from "../ci/phase102-applied-migration-check.mjs";
import { EXPECTED_TARGET_COUNT } from "../ci/phase102-migration-integrity.mjs";

const REPO = process.cwd();
const CHECK_SOURCE = "scripts/ci/phase102-applied-migration-check.mjs";
const WORKFLOW_DIR = ".github/workflows";
const PHASE102_WORKFLOW = join(WORKFLOW_DIR, "phase102-media-hub-assurance.yml");

const checkSource = readFileSync(join(REPO, CHECK_SOURCE), "utf8");
const liveCheckSource = checkSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

type Row = { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null };

const FINISHED = new Date("2026-08-21T00:00:00.000Z");

/** A healthy 70-row `_prisma_migrations` table: 69 historical + Phase 102. */
function healthyRows(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < EXPECTED_TARGET_COUNT - 1; i += 1) {
    rows.push({
      migration_name: `2026081${String(i).padStart(7, "0")}_historical_${i}`,
      finished_at: FINISHED,
      rolled_back_at: null,
    });
  }
  rows.push({ migration_name: PHASE102_MIGRATION, finished_at: FINISHED, rolled_back_at: null });
  return rows;
}

const labelsOf = (verdict: ReturnType<typeof evaluateAppliedMigrations>) =>
  Object.fromEntries(verdict.checks.map((c) => [c.label, c.ok]));

// ── 1. The contract constants ────────────────────────────────────────────────

describe("PHASE102_APPLIED_CONTRACT", () => {
  it("expects the canonical migration and the canonical total", () => {
    expect(PHASE102_MIGRATION).toBe("20260821000000_phase102_media_video_hub");
    expect(EXPECTED_COMPLETED_MIGRATIONS).toBe(70);
    // Derived from the Phase 102 integrity contract, never restated.
    expect(EXPECTED_COMPLETED_MIGRATIONS).toBe(EXPECTED_TARGET_COUNT);
    expect(liveCheckSource).toMatch(
      /import\s*\{[\s\S]*?EXPECTED_TARGET_COUNT[\s\S]*?\}\s*from\s*"\.\/phase102-migration-integrity\.mjs"/,
    );
  });
});

// ── 2. The forbidden implementation ─────────────────────────────────────────

describe("PHASE102_FORBIDS_MIGRATE_STATUS_GREP", () => {
  it("no workflow greps prisma migrate status for a migration name", () => {
    for (const file of readdirSync(join(REPO, WORKFLOW_DIR)).filter((f) => f.endsWith(".yml"))) {
      const wf = readFileSync(join(REPO, WORKFLOW_DIR, file), "utf8");
      expect(wf, `${file} greps for a migration name`).not.toMatch(
        /grep[^\n]*\d{14}_[a-z0-9_]+/,
      );
      // The specific shape that failed: status output captured, then grepped.
      expect(wf, `${file} pipes migrate status into a name grep`).not.toMatch(
        /migrate status[^\n]*\|[^\n]*grep/,
      );
      expect(wf, `${file} still tees migrate status to a grepped file`).not.toContain(
        "migrate-status.txt",
      );
    }
  });

  it("the Phase 102 rehearsal runs the database-truth gate instead", () => {
    const wf = readFileSync(join(REPO, PHASE102_WORKFLOW), "utf8");
    expect(wf).toContain("npm run gate:phase102:applied-migrations");
    // Ordering/set membership stays with the git-derived gate — the two checks
    // must not collapse into one source of truth.
    expect(wf).toContain("npm run gate:phase102:migrations");
  });

  it("the check itself never shells out to the Prisma CLI", () => {
    expect(liveCheckSource).not.toContain("migrate status");
    expect(liveCheckSource).not.toContain("execFileSync");
    expect(liveCheckSource).not.toContain("child_process");
  });

  it("is wired as a real npm script", () => {
    const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
    expect(pkg.scripts["gate:phase102:applied-migrations"]).toBe(
      "node scripts/ci/phase102-applied-migration-check.mjs",
    );
  });
});

// ── 3. The evaluator's mutation matrix ──────────────────────────────────────

describe("PHASE102_APPLIED_EVALUATOR", () => {
  it("passes on exactly one completed Phase 102 row in a 70-migration table", () => {
    const verdict = evaluateAppliedMigrations({ rows: healthyRows() });
    expect(verdict.checks.filter((c) => !c.ok)).toEqual([]);
    expect(verdict.ok).toBe(true);
    expect(verdict.completedCount).toBe(70);
  });

  it("fails when the Phase 102 migration is absent", () => {
    const rows = healthyRows().filter((r) => r.migration_name !== PHASE102_MIGRATION);
    const verdict = evaluateAppliedMigrations({ rows });
    expect(verdict.ok).toBe(false);
    const labels = labelsOf(verdict);
    expect(labels.PHASE102_MIGRATION_ROW_UNIQUE).toBe(false);
    expect(labels.PHASE102_MIGRATION_FINISHED).toBe(false);
    // And the total no longer reaches 70, so the count check fails too.
    expect(labels.PHASE102_COMPLETED_MIGRATION_COUNT).toBe(false);
  });

  it("fails when the Phase 102 migration is unfinished", () => {
    const rows = healthyRows().map((r) =>
      r.migration_name === PHASE102_MIGRATION ? { ...r, finished_at: null } : r,
    );
    const verdict = evaluateAppliedMigrations({ rows });
    expect(verdict.ok).toBe(false);
    const labels = labelsOf(verdict);
    expect(labels.PHASE102_MIGRATION_FINISHED).toBe(false);
    expect(labels.PHASE102_NO_FAILED_MIGRATION).toBe(false);
    expect(verdict.completedCount).toBe(69);
  });

  it("fails when the Phase 102 migration was rolled back", () => {
    const rows = healthyRows().map((r) =>
      r.migration_name === PHASE102_MIGRATION ? { ...r, rolled_back_at: FINISHED } : r,
    );
    const verdict = evaluateAppliedMigrations({ rows });
    expect(verdict.ok).toBe(false);
    const labels = labelsOf(verdict);
    expect(labels.PHASE102_MIGRATION_NOT_ROLLED_BACK).toBe(false);
    expect(labels.PHASE102_NO_FAILED_MIGRATION).toBe(false);
  });

  it("fails when the Phase 102 migration is recorded twice", () => {
    const rows = healthyRows();
    rows.push({ migration_name: PHASE102_MIGRATION, finished_at: FINISHED, rolled_back_at: null });
    const verdict = evaluateAppliedMigrations({ rows });
    expect(verdict.ok).toBe(false);
    const labels = labelsOf(verdict);
    expect(labels.PHASE102_MIGRATION_ROW_UNIQUE).toBe(false);
    expect(labels.PHASE102_MIGRATION_NAMES_UNIQUE).toBe(false);
    // A duplicate must never be laundered into "71 applied, close enough".
    expect(labels.PHASE102_COMPLETED_MIGRATION_COUNT).toBe(false);
  });

  it("fails when ANY other migration is unfinished or rolled back", () => {
    const unfinished = healthyRows().map((r, i) => (i === 3 ? { ...r, finished_at: null } : r));
    expect(labelsOf(evaluateAppliedMigrations({ rows: unfinished })).PHASE102_NO_FAILED_MIGRATION).toBe(false);

    const rolledBack = healthyRows().map((r, i) => (i === 7 ? { ...r, rolled_back_at: FINISHED } : r));
    expect(labelsOf(evaluateAppliedMigrations({ rows: rolledBack })).PHASE102_NO_FAILED_MIGRATION).toBe(false);
  });

  it("fails on any completed total other than 70", () => {
    const short = healthyRows().slice(0, 69);
    expect(labelsOf(evaluateAppliedMigrations({ rows: short })).PHASE102_COMPLETED_MIGRATION_COUNT).toBe(false);

    const long = [
      ...healthyRows(),
      { migration_name: "20260901000000_unexpected_extra", finished_at: FINISHED, rolled_back_at: null },
    ];
    const verdict = evaluateAppliedMigrations({ rows: long });
    expect(labelsOf(verdict).PHASE102_COMPLETED_MIGRATION_COUNT).toBe(false);
    expect(verdict.completedCount).toBe(71);
  });

  it("fails closed on an empty or non-array result", () => {
    expect(evaluateAppliedMigrations({ rows: [] }).ok).toBe(false);
    // A driver that returned something unexpected must not read as "healthy".
    expect(evaluateAppliedMigrations({ rows: undefined as unknown as Row[] }).ok).toBe(false);
  });

  it("treats undefined timestamps the same as NULL", () => {
    // Row shapes vary by driver; `undefined` must never count as "finished".
    const rows = healthyRows().map((r) =>
      r.migration_name === PHASE102_MIGRATION
        ? ({ ...r, finished_at: undefined } as unknown as Row)
        : r,
    );
    expect(labelsOf(evaluateAppliedMigrations({ rows })).PHASE102_MIGRATION_FINISHED).toBe(false);
  });
});

// ── 4. It can only ever run against a disposable database ───────────────────

describe("PHASE102_DISPOSABLE_DATABASE_GUARD", () => {
  it("accepts the CI service database and disposable rehearsal databases", () => {
    for (const url of [
      "postgresql://hermes_ci:phase102-ci-only-password@localhost:5432/hermes_phase102_ci",
      "postgresql://hermes_ci:pw@127.0.0.1:32768/hermes_ci",
      "postgresql://hermes_ci:pw@127.0.0.1:32768/hermes_p997_upgrade",
      "postgres://hermes_ci:pw@localhost:5432/hermes_phase102_ci",
      // IPv6 loopback, connection parameters, and a host whose casing differs —
      // all the same machine, none of them a reason to refuse.
      "postgresql://hermes_ci:pw@[::1]:5432/hermes_ci",
      "postgresql://hermes_ci:pw@localhost:5432/hermes_phase102_ci?schema=public&connection_limit=5",
      "postgresql://hermes_ci:pw@LOCALHOST:5432/hermes_ci",
    ]) {
      expect(assertDisposableDatabase(url), url).toMatchObject({ ok: true });
    }
  });

  it("cannot be smuggled past with URL-parsing tricks", () => {
    for (const url of [
      // The LAST @ wins, so a loopback-looking userinfo does not make the host
      // loopback.
      "postgresql://hermes:pw@localhost@evil.example.invalid:5432/hermes_ci",
      // A fragment cannot hide the real authority either.
      "postgresql://hermes:pw@evil.example.invalid#@localhost:5432/hermes_ci",
      // A Cyrillic homoglyph is not "localhost".
      "postgresql://hermes:pw@lОcalhost:5432/hermes_ci",
      // Wildcard and abbreviated forms are refused rather than guessed at.
      "postgresql://hermes:pw@0.0.0.0:5432/hermes_ci",
      "postgresql://hermes:pw@127.1:5432/hermes_ci",
      // No database at all, and a name that is not exactly a disposable one.
      "postgresql://hermes:pw@localhost:5432/",
      "postgresql://hermes:pw@localhost:5432/hermes_ci/",
      // libpq connection parameters that would redirect the connection to a
      // different server than the authority names.
      "postgresql://hermes:pw@localhost:5432/hermes_ci?host=db.example.invalid",
      "postgresql://hermes:pw@localhost:5432/hermes_ci?hostaddr=10.0.0.5",
    ]) {
      expect(assertDisposableDatabase(url).ok, url).toBe(false);
    }
  });

  it("is TOTAL — a malformed URL yields a refusal, never a thrown error", () => {
    // A pure guard that throws cannot be relied on to fail closed by a caller
    // that only inspects `.ok`.
    for (const url of [
      "postgresql://hermes:pw@localhost:5432/%",
      "postgresql://hermes:pw@localhost:5432/hermes_%zz",
    ]) {
      expect(() => assertDisposableDatabase(url), url).not.toThrow();
      expect(assertDisposableDatabase(url).ok, url).toBe(false);
    }
  });

  it("refuses a routable host, whatever the database is called", () => {
    // RFC 2606 reserved names only — a test fixture must never hint at real
    // infrastructure in a public repository.
    for (const url of [
      "postgresql://hermes:pw@db.example.invalid:5432/hermes_ci",
      "postgresql://hermes:pw@10.0.0.5:5432/hermes_phase102_ci",
      "postgresql://hermes:pw@postgres:5432/hermes_ci",
    ]) {
      expect(assertDisposableDatabase(url).ok, url).toBe(false);
    }
  });

  it("refuses a production-shaped database name, even on loopback", () => {
    for (const url of [
      "postgresql://hermes:pw@localhost:5432/hermes_db",
      "postgresql://hermes:pw@127.0.0.1:5432/hermes",
      "postgresql://hermes:pw@localhost:5432/postgres",
    ]) {
      expect(assertDisposableDatabase(url).ok, url).toBe(false);
    }
  });

  it("refuses an absent, malformed or non-postgres URL", () => {
    for (const url of [undefined, null, "", "   ", "not a url", "mysql://root@localhost/hermes_ci"]) {
      expect(assertDisposableDatabase(url as string).ok, String(url)).toBe(false);
    }
  });

  it("never returns the credential in its reason", () => {
    const secret = "s3cr3t-should-never-appear";
    for (const url of [
      `postgresql://hermes:${secret}@db.example.invalid:5432/hermes_db`,
      `postgresql://hermes:${secret}@localhost:5432/hermes_db`,
      `://broken:${secret}@`,
    ]) {
      const verdict = assertDisposableDatabase(url);
      expect(JSON.stringify(verdict), url).not.toContain(secret);
    }
  });

  it("the script refuses to query before the guard passes, and never logs the URL", () => {
    const guardIndex = liveCheckSource.indexOf("assertDisposableDatabase(process.env.DATABASE_URL)");
    const connectIndex = liveCheckSource.indexOf("new pg.Client(");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(connectIndex).toBeGreaterThan(guardIndex);
    // The refusal returns before a client is ever constructed.
    expect(liveCheckSource).toMatch(/if \(!target\.ok\) return finish\(true\)/);
    // Nothing prints the connection string.
    expect(liveCheckSource).not.toMatch(/console\.(log|error)\([^)]*DATABASE_URL/);
    expect(liveCheckSource).not.toMatch(/console\.(log|error)\([^)]*connectionString/);
  });

  it("issues exactly one read-only statement, with no interpolation", () => {
    const sql = /const APPLIED_MIGRATIONS_SQL =\s*([^;]+);/.exec(checkSource)?.[1] ?? "";
    expect(sql).toContain("SELECT");
    expect(sql).toContain("_prisma_migrations");
    expect(sql).not.toContain("${");
    for (const word of ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE"]) {
      expect(sql.toUpperCase(), word).not.toContain(word);
    }
    expect(liveCheckSource.match(/client\.query\(/g) ?? []).toHaveLength(1);
  });
});
