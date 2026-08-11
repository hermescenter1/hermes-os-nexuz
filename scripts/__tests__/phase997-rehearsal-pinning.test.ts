/**
 * PHASE 99.7 — the rehearsal's HISTORICAL TARGET is pinned, not HEAD.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The Phase 99.7 rehearsal is evidence for ONE production transition that has
 * already happened: 911a2d7 (49 migrations) → cbfa292 (69 migrations). It used
 * to materialise `HEAD` as its target, which quietly made that evidence a
 * property of the current branch rather than of the commits it names. The
 * moment Phase 102 appended migration #70, the rehearsal materialised 70 and
 * failed its own 69-migration contract — the first real CI run on PR #59 failed
 * exactly there.
 *
 * The target is now the pinned {@link TARGET_SHA}, imported from the integrity
 * contract rather than restated. This suite is the lock on that: it drives the
 * REAL `materializeMigrationSet` against REAL git, so a working tree holding 70
 * migrations still has to produce the historical 69, and it fails if anyone
 * repoints the default at `HEAD` or reintroduces an environment override.
 *
 * Nothing here starts a container: the rehearsal only runs its Docker path when
 * invoked as the process entry point, which is why importing it is safe.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  TARGET_REF,
  materializeMigrationSet,
} from "../ci/phase997-migration-rehearsal.mjs";
import {
  BASELINE_SHA,
  TARGET_SHA,
  EXPECTED_BASELINE_COUNT,
  EXPECTED_DELTA,
  EXPECTED_TARGET_COUNT,
  migrationIdentity,
  verifyHistoricalPreservation,
} from "../ci/phase997-migration-integrity.mjs";

const REPO = process.cwd();
const REHEARSAL_SOURCE = "scripts/ci/phase997-migration-rehearsal.mjs";
const PHASE997_WORKFLOW = ".github/workflows/phase997-production-completion.yml";
const LEDGER_PATH = "docs/release/phase99.7-migration-ledger.json";

/**
 * The Phase 99.7 ledger's content digest, over LINE-ENDING-NORMALISED bytes.
 *
 * Pinned as a literal on purpose: this is the "byte-for-byte unchanged"
 * assertion, and deriving it from the file it is supposed to protect would
 * assert nothing. Normalisation is the only concession — a CRLF checkout of an
 * unmodified file must not read as a modification.
 */
const PHASE997_LEDGER_SHA256 = "9fb24fdba914c7992a47e850edfbce2b8d816d81017d0aa3c09e8684d2401b77";

const git = (args: string[]) =>
  execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** Migration directory names at an arbitrary ref, straight from git. */
function migrationNamesAt(ref: string): string[] {
  const out: string[] = [];
  for (const line of git(["ls-tree", "-r", "--name-only", ref, "prisma/migrations/"]).split("\n")) {
    const m = /^prisma\/migrations\/([^/]+)\/migration\.sql$/.exec(line.trim());
    if (m) out.push(m[1]);
  }
  return out.sort();
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const rehearsalSource = readFileSync(join(REPO, REHEARSAL_SOURCE), "utf8");
const liveRehearsalSource = stripComments(rehearsalSource);

// The REAL materialisation of the pinned target, done once — it spawns one git
// process per migration and every test below reads the same result.
let work: string;
let target: { schemaPath: string; migrationNames: string[] };

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "hermes-p997-pin-"));
  target = materializeMigrationSet(TARGET_REF, join(work, "target"));
}, 120_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

// ── 1. The target ref itself ─────────────────────────────────────────────────

describe("PHASE997_REHEARSAL_TARGET_IS_PINNED", () => {
  it("is the canonical Phase 99.7 target commit, not HEAD", () => {
    expect(TARGET_REF).toBe(TARGET_SHA);
    expect(TARGET_REF).toBe("cbfa2923318827ee42614c07f2e3861a3db8ed99");
    expect(TARGET_REF).toMatch(/^[0-9a-f]{40}$/);
    // A pinned SHA and the current HEAD must be different objects, otherwise
    // this test would pass for the wrong reason on a branch that happens to sit
    // on cbfa292.
    expect(git(["rev-parse", "HEAD"]).trim()).not.toBe(TARGET_REF);
  });

  it("reuses the integrity contract's constant instead of restating the SHA", () => {
    expect(liveRehearsalSource).toContain("export const TARGET_REF = TARGET_SHA;");
    // Exactly one place in the rehearsal may name the commit — the import.
    expect(liveRehearsalSource).not.toContain("cbfa2923318827ee42614c07f2e3861a3db8ed99");
    expect(liveRehearsalSource).toMatch(
      /import\s*\{[^}]*\bTARGET_SHA\b[^}]*\}\s*from\s*"\.\/phase997-migration-integrity\.mjs"/,
    );
  });

  it("has no HEAD default and no environment override", () => {
    expect(liveRehearsalSource).not.toContain("PHASE997_TARGET_REF");
    expect(liveRehearsalSource).not.toMatch(/TARGET_REF\s*=\s*[^;]*\bHEAD\b/);
    // Nothing may read an env var to choose the historical target.
    expect(liveRehearsalSource).not.toMatch(/TARGET_REF\s*=\s*process\.env/);
  });

  it("asserts the pinning at runtime, so a future edit fails the rehearsal itself", () => {
    expect(liveRehearsalSource).toContain("REHEARSAL_TARGET_REF_PINNED");
    expect(liveRehearsalSource).toMatch(/TARGET_REF === TARGET_SHA/);
  });
});

// ── 2. A 70-migration working tree still rehearses the historical 69 ─────────

describe("PHASE997_REHEARSAL_MATERIALISES_HISTORY", () => {
  it("the working tree really does hold 70 migrations", () => {
    // The premise of this whole suite: if the tree ever went back to 69 these
    // tests would pass without proving anything.
    expect(migrationNamesAt("HEAD").length).toBe(EXPECTED_TARGET_COUNT + 1);
  });

  it("materialises exactly the historical 69 from the pinned target", () => {
    expect(target.migrationNames.length).toBe(EXPECTED_TARGET_COUNT);
    expect(EXPECTED_BASELINE_COUNT + EXPECTED_DELTA).toBe(EXPECTED_TARGET_COUNT);
  });

  it("excludes the Phase 102 migration that HEAD carries", () => {
    const phase102 = "20260821000000_phase102_media_video_hub";
    expect(migrationNamesAt("HEAD")).toContain(phase102);
    expect(target.migrationNames).not.toContain(phase102);
  });

  it("materialising HEAD instead would break the 69-migration contract", () => {
    // The exact arithmetic that failed the first real CI run: this is why the
    // default may never go back to HEAD.
    const headCount = migrationNamesAt("HEAD").length;
    expect(headCount).not.toBe(EXPECTED_TARGET_COUNT);
    expect(target.migrationNames.length).toBe(EXPECTED_TARGET_COUNT);
  });

  it("the baseline end is pinned too", () => {
    expect(BASELINE_SHA).toMatch(/^[0-9a-f]{40}$/);
    expect(migrationNamesAt(BASELINE_SHA).length).toBe(EXPECTED_BASELINE_COUNT);
    expect(liveRehearsalSource).toContain('materializeOrFail("REHEARSAL_BASELINE_REACHABLE", BASELINE_SHA');
  });
});

// ── 3. Historical mutation and deletion remain detected ─────────────────────

describe("PHASE997_REHEARSAL_HISTORICAL_INTEGRITY", () => {
  const ledger = JSON.parse(readFileSync(join(REPO, LEDGER_PATH), "utf8"));

  it("every materialised migration matches the immutable ledger checksum", () => {
    const materialised: Record<string, string> = {};
    for (const name of target.migrationNames) {
      materialised[name] = migrationIdentity(
        readFileSync(join(work, "target", "prisma", "migrations", name, "migration.sql"), "utf8"),
      );
    }
    expect(Object.keys(materialised).sort()).toEqual(Object.keys(ledger.migrationChecksums).sort());
    for (const [name, digest] of Object.entries(materialised)) {
      expect(ledger.migrationChecksums[name], `checksum drift in ${name}`).toBe(digest);
    }
  });

  it("a mutated or deleted historical migration is still detected", () => {
    const historical: Record<string, string> = ledger.migrationChecksums;
    const first = Object.keys(historical).sort()[0];

    const mutated = { ...historical, [first]: "f".repeat(64) };
    expect(verifyHistoricalPreservation(historical, mutated).mutated).toEqual([first]);

    const deleted: Record<string, string> = { ...historical };
    delete deleted[first];
    expect(verifyHistoricalPreservation(historical, deleted).missing).toEqual([first]);

    // And the untouched real tree still preserves it.
    expect(verifyHistoricalPreservation(historical, { ...historical }).ok).toBe(true);
  });

  it("the Phase 99.7 ledger is byte-for-byte unchanged", () => {
    const raw = readFileSync(join(REPO, LEDGER_PATH), "utf8");
    const digest = createHash("sha256").update(raw.split("\r\n").join("\n"), "utf8").digest("hex");
    expect(digest).toBe(PHASE997_LEDGER_SHA256);
    // The figures that digest protects, stated so a failure says WHAT changed.
    expect(ledger.baselineMigrationCount).toBe(49);
    expect(ledger.targetMigrationCount).toBe(69);
    expect(ledger.newMigrationCount).toBe(20);
    expect(ledger.targetSha).toBe(TARGET_SHA);
    expect(Object.keys(ledger.migrationChecksums)).toHaveLength(69);
  });
});

// ── 4. Fail-closed on shallow history ───────────────────────────────────────

describe("PHASE997_REHEARSAL_FAILS_CLOSED_ON_SHALLOW_HISTORY", () => {
  it("materialising an unreachable commit throws rather than returning an empty set", () => {
    const dir = mkdtempSync(join(tmpdir(), "hermes-p997-missing-"));
    try {
      expect(() => materializeMigrationSet("0".repeat(40), join(dir, "nope"))).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the rehearsal reports an unreachable end as a named failing check", () => {
    expect(liveRehearsalSource).toContain("REHEARSAL_BASELINE_REACHABLE");
    expect(liveRehearsalSource).toContain("REHEARSAL_TARGET_REACHABLE");
    expect(liveRehearsalSource).toContain("fetch-depth: 0");
  });

  it("the verdict is printed from the finally block, which every early return runs", () => {
    // Scoped to the finally block's OWN text. An unscoped
    // /finally\s*\{[\s\S]*finish\(\)/ would be satisfied by the `function
    // finish()` DECLARATION further down the file, so it would still pass with
    // the call deleted — the exact vacuous-assertion trap this test exists to
    // avoid. The early returns above live inside the `try`, so a `finish()`
    // moved out of the finally (its shape before this fix) would print no
    // verdict at all and exit 0 on a shallow clone.
    const start = liveRehearsalSource.lastIndexOf("} finally {");
    expect(start, "main() must still have a finally block").toBeGreaterThan(-1);
    const finallyBlock = liveRehearsalSource.slice(start, liveRehearsalSource.indexOf("\n  }", start));
    expect(finallyBlock).toContain("finish();");
    expect(finallyBlock).toContain("rmSync(work");
  });

  it("CI checks out full history for the rehearsal job", () => {
    const wf = readFileSync(join(REPO, PHASE997_WORKFLOW), "utf8");
    const job = wf.slice(wf.indexOf("phase997-migration-rehearsal:"));
    expect(job).toContain("fetch-depth: 0");
    expect(job).toContain("rehearse:phase997:migrations");
  });

  it("BEHAVIOURAL: a shallow checkout fails closed — verdict printed, exit code 1", () => {
    // Source greps cannot prove this. So the real script is executed in a
    // throwaway git repository whose history does NOT contain the pinned
    // commits — exactly what a `fetch-depth: 1` CI checkout looks like — and the
    // process's actual stdout and exit code are inspected.
    //
    // Under the regression this guards (moving `finish()` out of the `finally`),
    // the early return would skip the verdict entirely and the process would
    // exit 0: a green CI job that rehearsed nothing.
    const sandbox = mkdtempSync(join(tmpdir(), "hermes-p997-shallow-"));
    try {
      // The rehearsal's relative-import closure, at their real paths.
      for (const rel of [
        "scripts/ci/phase997-migration-rehearsal.mjs",
        "scripts/ci/phase997-migration-integrity.mjs",
        "scripts/ci/lib/disposable-pg.mjs",
        "scripts/dr/migration-gate.mjs",
        "scripts/dr/canonical-json.mjs",
        "scripts/dr/migration-sql-classify.mjs",
      ]) {
        const dest = join(sandbox, rel);
        mkdirSync(dirname(dest), { recursive: true });
        copyFileSync(join(REPO, rel), dest);
      }
      // A real repository with a real commit — but not OUR history, so the
      // pinned SHAs are unreachable rather than the whole git call failing.
      const inSandbox = (args: string[]) =>
        execFileSync("git", args, { cwd: sandbox, encoding: "utf8", stdio: "pipe" });
      inSandbox(["init", "--quiet"]);
      inSandbox(["config", "user.email", "rehearsal@test.invalid"]);
      inSandbox(["config", "user.name", "rehearsal"]);
      inSandbox(["add", "-A"]);
      inSandbox(["commit", "--quiet", "-m", "sandbox"]);

      let status = 0;
      let stdout = "";
      try {
        stdout = execFileSync(
          process.execPath,
          [join(sandbox, "scripts", "ci", "phase997-migration-rehearsal.mjs")],
          { cwd: sandbox, encoding: "utf8", stdio: "pipe" },
        );
      } catch (err) {
        const e = err as { status?: number; stdout?: string };
        status = e.status ?? -1;
        stdout = String(e.stdout ?? "");
      }

      expect(stdout, "the unreachable baseline must be named").toContain(
        "RESULT REHEARSAL_BASELINE_REACHABLE=FAIL",
      );
      expect(stdout, "the verdict must still be printed").toContain(
        "RESULT phase997_migration_rehearsal=FAIL",
      );
      expect(status, "a rehearsal that proved nothing must not exit 0").toBe(1);
      // And it must never have reached Docker.
      expect(stdout).not.toContain("[disposable-pg] starting");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 120_000);

  it("importing the rehearsal never starts a container", () => {
    // The Docker path is behind the entry-point guard; without it, this very
    // test file would have launched postgres on import.
    expect(liveRehearsalSource).toContain("invokedDirectly");
    expect(liveRehearsalSource).toMatch(/if \(invokedDirectly\)/);
  });
});
