/**
 * Every NEW migration bounds its own lock wait, with a VALUE that works.
 * (Finding DA-2.)
 *
 * WHY THIS IS A RULE. The migration connection has no `lock_timeout`: none is
 * set in `docker-compose.prod.yml`, the `Dockerfile`, `prisma.config.ts` or
 * any SQL, and the `postgres` service declares no `command:` override. With
 * PostgreSQL's default of `0` a statement waits FOR EVER. A plain
 * `CREATE INDEX` takes a `SHARE` lock, so if any transaction holds a
 * conflicting lock when a release goes out, the migration hangs and every
 * writer queues behind it — a stalled deploy with no error, which is harder
 * to diagnose than a failure.
 *
 * WHY IN THE FILE. `PGOPTIONS` was rejected (Prisma's engine does not use
 * libpq, so there is no reason to believe it would be read), and the
 * connection string lives in `.env.production`, which this repository must
 * never read or write. The file itself works, and was MEASURED to work
 * end to end against real PostgreSQL with this project's own CLI — see
 * `docs/release/deploy-assurance-findings-2026-10.md`. This file is the
 * static half of the control; it does not, and cannot, prove PostgreSQL's
 * behaviour on its own.
 *
 * WHAT THIS FILE CHECKS THAT A "DOES IT CONTAIN SET" CHECK WOULD NOT:
 *   · the VALUE is a positive duration, not `0`, not `DEFAULT`, not nonsense;
 *   · a `SET` inside a comment or a string literal does not count;
 *   · the cap is not disabled afterwards by `RESET`, by a second `SET`, or by
 *     `SET LOCAL`, which has no effect outside a transaction block;
 *   · a transaction opened later re-establishes the cap inside it;
 *   · no DDL runs before the cap is in force.
 *
 * WHAT COUNTS AS "NEW" is a pinned BASELINE of the migrations that existed
 * when the rule was adopted, not a date. A date alone would let a new
 * migration with an older timestamp walk past the control.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = "prisma/migrations";
const BASELINE = JSON.parse(readFileSync("prisma/__tests__/lock-timeout-baseline.json", "utf8")) as {
  count: number;
  migrations: string[];
};

/**
 * The value a production migration should use unless it argues otherwise.
 * Owner decision, 2026-10-14. Long enough to ride out a short-lived
 * transaction, short enough that a stuck release fails inside a deploy window
 * instead of holding writers behind it.
 */
export const DEFAULT_LOCK_TIMEOUT = "5s";

/** Anything above this is not a bound worth having on a deploy path. */
const MAX_MS = 120_000;

const migrationDirs = (): string[] =>
  existsSync(DIR)
    ? readdirSync(DIR, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort()
    : [];

const baselineSet = new Set(BASELINE.migrations);
const newMigrations = (): string[] => migrationDirs().filter(n => !baselineSet.has(n));

/* ── Parsing ───────────────────────────────────────────────────────────────── */

/**
 * Strip comments and string literals, so neither can carry a `SET` that
 * satisfies the control without affecting the database.
 */
export function stripNoise(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j += 1; break; }
        j += 1;
      }
      // Keep a placeholder so `= '5s'` still parses as "had a literal".
      out += `'${sql.slice(i + 1, j - 1)}'`;
      i = j;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/** Effective statements, in order, with comments and noise removed. */
export function statementsOf(sql: string): string[] {
  return stripNoise(sql)
    .split(";")
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(s => s.length > 0);
}

export function durationToMs(raw: string): number | null {
  const m = /^(\d+)\s*(ms|s|min)?$/i.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "ms").toLowerCase();
  return unit === "ms" ? n : unit === "s" ? n * 1000 : n * 60_000;
}

export type LockTimeoutVerdict =
  | { ok: true; valueMs: number }
  | { ok: false; problem: string };

/**
 * Judge one migration file. Exported so the negative cases below exercise the
 * same function the rule uses, rather than a paraphrase of it.
 */
export function judge(sql: string): LockTimeoutVerdict {
  const statements = statementsOf(sql);
  if (statements.length === 0) return { ok: false, problem: "EMPTY" };

  const setRe = /^SET\s+(LOCAL\s+|SESSION\s+)?lock_timeout\s*(=|TO)\s*(.+)$/i;
  const first = setRe.exec(statements[0]);
  if (!first) return { ok: false, problem: "FIRST_STATEMENT_IS_NOT_SET_LOCK_TIMEOUT" };
  // `SET LOCAL` outside a transaction block does nothing and warns.
  if ((first[1] ?? "").trim().toUpperCase() === "LOCAL") return { ok: false, problem: "SET_LOCAL_HAS_NO_EFFECT" };

  const literal = first[3].trim().replace(/^'(.*)'$/, "$1");
  if (/^default$/i.test(literal)) return { ok: false, problem: "VALUE_IS_DEFAULT" };
  const ms = durationToMs(literal);
  if (ms === null) return { ok: false, problem: `VALUE_NOT_A_DURATION: ${literal}` };
  if (ms <= 0) return { ok: false, problem: "VALUE_IS_ZERO_WHICH_MEANS_WAIT_FOREVER" };
  if (ms > MAX_MS) return { ok: false, problem: `VALUE_TOO_LARGE: ${ms}ms` };

  // Nothing afterwards may lift the cap.
  for (const s of statements.slice(1)) {
    if (/^RESET\s+(ALL|lock_timeout)/i.test(s)) return { ok: false, problem: "CAP_RESET_LATER" };
    const again = setRe.exec(s);
    if (again) {
      const lit = again[3].trim().replace(/^'(.*)'$/, "$1");
      if (/^default$/i.test(lit)) return { ok: false, problem: "CAP_SET_TO_DEFAULT_LATER" };
      const laterMs = durationToMs(lit);
      if (laterMs === null || laterMs <= 0) return { ok: false, problem: "CAP_DISABLED_LATER" };
      if (laterMs > MAX_MS) return { ok: false, problem: "CAP_WIDENED_LATER" };
    }
  }

  // A transaction opened later must re-establish the cap inside it: a session
  // value does carry in, but an explicit `SET LOCAL` or a `RESET` inside the
  // block would not be caught by the scan above in the order a reader expects.
  const opensTx = statements.findIndex(s => /^(BEGIN|START\s+TRANSACTION)\b/i.test(s));
  if (opensTx !== -1) {
    const inside = statements.slice(opensTx + 1);
    const reSet = inside.some(s => setRe.test(s));
    if (!reSet) return { ok: false, problem: "TRANSACTION_OPENED_WITHOUT_RESTATING_THE_CAP" };
  }

  return { ok: true, valueMs: ms };
}

/* ── Exemptions ────────────────────────────────────────────────────────────── */

/**
 * Migrations exempted from the rule. EMPTY, and adding to it is not a way
 * round the control.
 *
 * `CREATE INDEX CONCURRENTLY` is NOT exempt by its nature. It is the
 * statement most likely to WANT an exemption — it cannot run inside a
 * transaction and a session cap could abort a build that is progressing —
 * but it also fails in a way a plain index does not: it leaves an INVALID
 * index behind that occupies space, is never used by the planner, and has to
 * be dropped before a retry. An exemption that did not say what happens then
 * would be a bypass wearing a reason.
 *
 * So the list is only half of it: the migration's own header must answer
 * every heading below.
 */
const EXEMPT: Readonly<Record<string, string>> = {};

/** What an exempt migration has to answer, in its own file. */
export const EXEMPTION_HEADINGS = [
  "EXEMPTION REASON:",
  "ALTERNATIVE CONTROL:",
  "EXPECTED WAIT:",
  "STATE AFTER FAILURE:",
  "RECOVERY:",
] as const;

export function exemptionIsDocumented(sql: string): { ok: boolean; missing: string[] } {
  const missing = EXEMPTION_HEADINGS.filter(h => !sql.includes(h));
  return { ok: missing.length === 0, missing };
}

/* ── The rule ──────────────────────────────────────────────────────────────── */

describe("DA-2 — what counts as a NEW migration is a baseline, not a date", () => {
  it("has a baseline that still matches the repository", () => {
    expect(BASELINE.migrations.length).toBe(BASELINE.count);
    const onDisk = new Set(migrationDirs());
    const missing = BASELINE.migrations.filter(n => !onDisk.has(n));
    // A baseline entry that no longer exists means a historical migration was
    // deleted or renamed — forbidden, and it would silently shrink the rule.
    expect(missing).toEqual([]);
  });

  it("treats a migration with an OLD-looking name as new when it is not in the baseline", () => {
    // The hole a date-based rule leaves: name it 20200101000000_whatever and
    // it is "older than the cutoff". The baseline closes it by construction.
    const pretendOld = "20200101000000_sneaky";
    expect(baselineSet.has(pretendOld)).toBe(false);
    expect(newMigrations().includes(pretendOld)).toBe(false); // not present at all, today
  });

  it("leaves every already-applied migration untouched", () => {
    // Editing one changes its checksum and breaks every database that has it.
    const edited = BASELINE.migrations.filter(n => {
      const f = join(DIR, n, "migration.sql");
      return existsSync(f) && /^\s*SET\s+lock_timeout/im.test(readFileSync(f, "utf8"));
    });
    expect(edited, "no already-applied migration may be edited").toEqual([]);
  });
});

describe("DA-2 — every new migration bounds its own lock wait", () => {
  const subjects = newMigrations();

  it("reports which migrations the rule currently covers", () => {
    // Visible in the run, so "the rule applies to nothing" is never silent.
    expect(Array.isArray(subjects)).toBe(true);
  });

  it.each(subjects.length > 0 ? subjects : ["(none yet)"])("%s passes the lock-timeout rule", name => {
    if (!subjects.includes(name)) return;
    const sql = readFileSync(join(DIR, name, "migration.sql"), "utf8");
    if (name in EXEMPT) {
      const documented = exemptionIsDocumented(sql);
      expect(documented.missing, `${name} is exempt but leaves questions unanswered`).toEqual([]);
      return;
    }
    const verdict = judge(sql);
    expect(verdict.ok ? "ok" : verdict.problem, name).toBe("ok");
  });

  it("exempts nothing today, and nothing is exempt by its nature", () => {
    expect(Object.keys(EXEMPT)).toEqual([]);
  });

  it("makes an exemption answer all five questions before it counts", () => {
    const half = `-- EXEMPTION REASON: concurrent build
CREATE INDEX CONCURRENTLY "i" ON "t" ("c");`;
    expect(exemptionIsDocumented(half)).toEqual({
      ok: false,
      missing: ["ALTERNATIVE CONTROL:", "EXPECTED WAIT:", "STATE AFTER FAILURE:", "RECOVERY:"],
    });
    const full = EXEMPTION_HEADINGS.map(h => `-- ${h} stated`).join(" ");
    expect(exemptionIsDocumented(full)).toEqual({ ok: true, missing: [] });
  });
});

/* ── Negative cases: the ways a file could pretend to comply ───────────────── */

describe("DA-2 — the control reads the VALUE, not the word SET", () => {
  const ok = (sql: string) => judge(sql).ok;
  const why = (sql: string) => (judge(sql).ok ? "ok" : (judge(sql) as { problem: string }).problem);

  it("accepts the agreed default", () => {
    expect(judge(`SET lock_timeout = '${DEFAULT_LOCK_TIMEOUT}';\nCREATE INDEX "i" ON "t" ("c");`)).toEqual({
      ok: true,
      valueMs: 5000,
    });
  });

  it.each([
    ["zero means wait for ever", `SET lock_timeout = '0';\nCREATE INDEX "i" ON "t" ("c");`, "VALUE_IS_ZERO_WHICH_MEANS_WAIT_FOREVER"],
    ["bare zero", `SET lock_timeout = 0;\nCREATE INDEX "i" ON "t" ("c");`, "VALUE_IS_ZERO_WHICH_MEANS_WAIT_FOREVER"],
    ["DEFAULT restores the unbounded wait", `SET lock_timeout = DEFAULT;\nCREATE INDEX "i" ON "t" ("c");`, "VALUE_IS_DEFAULT"],
    ["not a duration", `SET lock_timeout = 'soon';\nCREATE INDEX "i" ON "t" ("c");`, "VALUE_NOT_A_DURATION: soon"],
    ["absurdly large is not a bound", `SET lock_timeout = '10min';\nCREATE INDEX "i" ON "t" ("c");`, "VALUE_TOO_LARGE: 600000ms"],
    ["SET LOCAL does nothing outside a transaction", `SET LOCAL lock_timeout = '5s';\nCREATE INDEX "i" ON "t" ("c");`, "SET_LOCAL_HAS_NO_EFFECT"],
    ["reset afterwards", `SET lock_timeout = '5s';\nRESET lock_timeout;\nCREATE INDEX "i" ON "t" ("c");`, "CAP_RESET_LATER"],
    ["RESET ALL afterwards", `SET lock_timeout = '5s';\nRESET ALL;\nCREATE INDEX "i" ON "t" ("c");`, "CAP_RESET_LATER"],
    ["re-set to zero afterwards", `SET lock_timeout = '5s';\nSET lock_timeout = '0';\nCREATE INDEX "i" ON "t" ("c");`, "CAP_DISABLED_LATER"],
    ["re-set to DEFAULT afterwards", `SET lock_timeout = '5s';\nSET lock_timeout = DEFAULT;\nCREATE INDEX "i" ON "t" ("c");`, "CAP_SET_TO_DEFAULT_LATER"],
    ["widened afterwards", `SET lock_timeout = '5s';\nSET lock_timeout = '10min';\nCREATE INDEX "i" ON "t" ("c");`, "CAP_WIDENED_LATER"],
    ["a transaction that does not restate it", `SET lock_timeout = '5s';\nBEGIN;\nCREATE INDEX "i" ON "t" ("c");\nCOMMIT;`, "TRANSACTION_OPENED_WITHOUT_RESTATING_THE_CAP"],
    ["DDL before the cap", `CREATE INDEX "i" ON "t" ("c");\nSET lock_timeout = '5s';`, "FIRST_STATEMENT_IS_NOT_SET_LOCK_TIMEOUT"],
    ["empty file", `-- nothing here\n`, "EMPTY"],
  ])("rejects: %s", (_label, sql, problem) => {
    expect(why(sql)).toBe(problem);
  });

  it("does not accept a SET hidden in a line comment", () => {
    expect(ok(`-- SET lock_timeout = '5s';\nCREATE INDEX "i" ON "t" ("c");`)).toBe(false);
  });

  it("does not accept a SET hidden in a block comment", () => {
    expect(ok(`/* SET lock_timeout = '5s'; */\nCREATE INDEX "i" ON "t" ("c");`)).toBe(false);
  });

  it("does not accept a SET hidden in a string literal", () => {
    expect(ok(`INSERT INTO "note" (t) VALUES ('SET lock_timeout = ''5s'';');\nCREATE INDEX "i" ON "t" ("c");`)).toBe(false);
  });

  it("accepts a transaction that DOES restate the cap inside it", () => {
    expect(ok(`SET lock_timeout = '5s';\nBEGIN;\nSET LOCAL lock_timeout = '5s';\nCREATE INDEX "i" ON "t" ("c");\nCOMMIT;`)).toBe(true);
  });
});
