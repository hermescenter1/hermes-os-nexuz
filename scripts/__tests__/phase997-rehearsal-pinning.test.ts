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
 * failed its own 69-migration contract.
 *
 * WHY IT IS HERMETIC
 * ------------------
 * An earlier version of this suite proved the pinning by materialising the REAL
 * cbfa292 out of the enclosing checkout. That reached for a historical commit,
 * and `npm test` runs in four workflows that check out SHALLOW (ci, phase97,
 * phase98, phase99 — none has a reason to fetch history). All four went red on
 * a step that had nothing to do with them.
 *
 * So this suite touches the enclosing repository's git history NOWHERE. It
 * builds its own throwaway repositories with SYNTHETIC commit history and
 * drives the real implementation against them, and it runs the real script as a
 * subprocess to observe verdicts, exit codes and cleanup. Everything it proves,
 * it proves by execution.
 *
 * Real-history proof — that the actual cbfa292 tree holds the actual 69
 * migrations with their ledgered checksums — belongs to
 * `npm run gate:phase997:migrations` and to the rehearsal itself, which run
 * only in the Phase 99.7 and Phase 102 assurance workflows under
 * `fetch-depth: 0` and still fail closed when that history is absent.
 *
 * Nothing here is skipped or conditional: every assertion runs everywhere.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
} from "../ci/phase997-migration-integrity.mjs";

/** Only ever used to READ FILES — never as a git repository. */
const REPO = process.cwd();
const REHEARSAL_SOURCE = "scripts/ci/phase997-migration-rehearsal.mjs";
const PHASE997_WORKFLOW = ".github/workflows/phase997-production-completion.yml";
const LEDGER_PATH = "docs/release/phase99.7-migration-ledger.json";

/**
 * The Phase 99.7 ledger's content digest, over LINE-ENDING-NORMALISED bytes.
 *
 * Pinned as a literal on purpose: this is the "byte-for-byte unchanged"
 * assertion, and deriving it from the file it protects would assert nothing.
 */
const PHASE997_LEDGER_SHA256 = "9fb24fdba914c7992a47e850edfbce2b8d816d81017d0aa3c09e8684d2401b77";

/** The temp-directory prefix the rehearsal creates its working tree under. */
const REHEARSAL_TMP_PREFIX = "hermes-p997-mig-";

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Source is read as text, with LF endings, so mutations apply on any checkout. */
const rehearsalSource = readFileSync(join(REPO, REHEARSAL_SOURCE), "utf8").split("\r\n").join("\n");
const liveRehearsalSource = stripComments(rehearsalSource);

// ── Synthetic repositories ───────────────────────────────────────────────────

interface SyntheticRepo {
  readonly root: string;
  readonly baselineSha: string;
  readonly targetSha: string;
  readonly headSha: string;
  readonly baselineNames: string[];
  readonly targetNames: string[];
  readonly headNames: string[];
}

/**
 * Build a throwaway git repository shaped like this one — a Prisma schema and a
 * `prisma/migrations/<name>/migration.sql` tree — with three commits that
 * mirror the real situation: a baseline, a release target, and a LATER commit
 * that appends one more migration.
 *
 * That third commit is the whole point: it is the synthetic stand-in for Phase
 * 102 appending migration #70, and it is what lets this suite prove that
 * materialising the pinned target ignores whatever HEAD has grown since.
 */
function buildSyntheticRepo(label: string): SyntheticRepo {
  const root = mkdtempSync(join(tmpdir(), `hermes-p997-synth-${label}-`));
  const git = (args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();

  mkdirSync(join(root, "prisma", "migrations"), { recursive: true });
  writeFileSync(join(root, "prisma", "schema.prisma"), `// synthetic ${label}\n`, "utf8");
  writeFileSync(join(root, "prisma", "migrations", "migration_lock.toml"), 'provider = "postgresql"\n', "utf8");

  const addMigration = (name: string) => {
    mkdirSync(join(root, "prisma", "migrations", name), { recursive: true });
    writeFileSync(
      join(root, "prisma", "migrations", name, "migration.sql"),
      `-- ${name}\nCREATE TABLE "${name}" (id text);\n`,
      "utf8",
    );
  };

  git(["init", "--quiet"]);
  git(["config", "user.email", "rehearsal@test.invalid"]);
  git(["config", "user.name", "rehearsal"]);

  const baselineNames = [`2020010100000${label === "b" ? 1 : 0}_synthetic_baseline_a`, "20200102000000_synthetic_baseline_b"];
  for (const n of baselineNames) addMigration(n);
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "baseline"]);
  const baselineSha = git(["rev-parse", "HEAD"]);

  const targetOnly = ["20200201000000_synthetic_target_a", "20200202000000_synthetic_target_b"];
  for (const n of targetOnly) addMigration(n);
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "target"]);
  const targetSha = git(["rev-parse", "HEAD"]);

  // The "Phase 102" of this synthetic world.
  const later = "20200301000000_synthetic_later_release";
  addMigration(later);
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "later release"]);
  const headSha = git(["rev-parse", "HEAD"]);

  const targetNames = [...baselineNames, ...targetOnly].sort();
  return {
    root,
    baselineSha,
    targetSha,
    headSha,
    baselineNames: [...baselineNames].sort(),
    targetNames,
    headNames: [...targetNames, later].sort(),
  };
}

/** Run a callback with a synthetic repo and a scratch directory, then clean up. */
function withSyntheticRepo<T>(label: string, fn: (repo: SyntheticRepo, scratch: string) => T): T {
  const repo = buildSyntheticRepo(label);
  const scratch = mkdtempSync(join(tmpdir(), `hermes-p997-out-${label}-`));
  try {
    return fn(repo, scratch);
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ── The rehearsal, executed as a subprocess in an isolated repository ────────

interface SubprocessRun {
  readonly status: number;
  readonly stdout: string;
  readonly leakedTempDirs: string[];
}

/** The rehearsal's relative-import closure, at their real paths. */
const IMPORT_CLOSURE = [
  "scripts/ci/phase997-migration-rehearsal.mjs",
  "scripts/ci/phase997-migration-integrity.mjs",
  "scripts/ci/lib/disposable-pg.mjs",
  "scripts/dr/migration-gate.mjs",
  "scripts/dr/canonical-json.mjs",
  "scripts/dr/migration-sql-classify.mjs",
];

const rehearsalTempDirs = () =>
  readdirSync(tmpdir()).filter((e) => e.startsWith(REHEARSAL_TMP_PREFIX));

/**
 * Copy the rehearsal (optionally MUTATED) into a fresh repository with
 * synthetic history, run it, and report what the process actually did.
 *
 * The synthetic repository is a real git repository — so `git` itself works —
 * but it does not contain 911a2d7 or cbfa292. That is precisely the shape of a
 * `fetch-depth: 1` CI checkout, which is the condition the rehearsal must fail
 * closed on.
 *
 * Mutations are applied to the COPY only; the repository's own file is never
 * touched.
 */
function runRehearsalInSandbox(
  mutate: (source: string) => string = (s) => s,
  // Extra variables merged over the real environment. Deliberately NOT
  // `NodeJS.ProcessEnv`: this repository augments that type with a required
  // NODE_ENV, so a partial overlay is not assignable to it.
  env: Record<string, string> = {},
): SubprocessRun {
  const repo = buildSyntheticRepo("run");
  try {
    for (const rel of IMPORT_CLOSURE) {
      const dest = join(repo.root, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(REPO, rel), dest);
    }
    const mutated = mutate(rehearsalSource);
    writeFileSync(join(repo.root, REHEARSAL_SOURCE), mutated, "utf8");

    const g = (args: string[]) => execFileSync("git", args, { cwd: repo.root, encoding: "utf8", stdio: "pipe" });
    g(["add", "-A"]);
    g(["commit", "--quiet", "-m", "rehearsal under test"]);

    const before = new Set(rehearsalTempDirs());
    let status = 0;
    let stdout = "";
    try {
      stdout = execFileSync(process.execPath, [join(repo.root, REHEARSAL_SOURCE)], {
        cwd: repo.root,
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, ...env },
      });
    } catch (err) {
      const e = err as { status?: number; stdout?: string };
      status = e.status ?? -1;
      stdout = String(e.stdout ?? "");
    }
    const leakedTempDirs = rehearsalTempDirs().filter((d) => !before.has(d));
    // Never let a mutation's leak escape this test.
    for (const d of leakedTempDirs) rmSync(join(tmpdir(), d), { recursive: true, force: true });
    return { status, stdout, leakedTempDirs };
  } finally {
    rmSync(repo.root, { recursive: true, force: true });
  }
}

// ── 1. The pinned target, from constants alone ──────────────────────────────

describe("PHASE997_REHEARSAL_TARGET_IS_PINNED", () => {
  it("is the canonical Phase 99.7 target commit", () => {
    expect(TARGET_REF).toBe(TARGET_SHA);
    expect(TARGET_REF).toBe("cbfa2923318827ee42614c07f2e3861a3db8ed99");
    expect(TARGET_REF).toMatch(/^[0-9a-f]{40}$/);
    expect(BASELINE_SHA).toMatch(/^[0-9a-f]{40}$/);
    expect(BASELINE_SHA).not.toBe(TARGET_SHA);
  });

  it("reuses the integrity contract's constant instead of restating the SHA", () => {
    expect(liveRehearsalSource).toContain("export const TARGET_REF = TARGET_SHA;");
    // Exactly one place in the rehearsal may name the commit — the import.
    expect(liveRehearsalSource).not.toContain("cbfa2923318827ee42614c07f2e3861a3db8ed99");
    expect(liveRehearsalSource).toMatch(
      /import\s*\{[^}]*\bTARGET_SHA\b[^}]*\}\s*from\s*"\.\/phase997-migration-integrity\.mjs"/,
    );
  });

  it("the default target is a commit, never HEAD, and no environment override exists", () => {
    expect(liveRehearsalSource).not.toContain("PHASE997_TARGET_REF");
    expect(liveRehearsalSource).not.toMatch(/TARGET_REF\s*=\s*[^;]*\bHEAD\b/);
    expect(liveRehearsalSource).not.toMatch(/TARGET_REF\s*=\s*process\.env/);
  });

  it("asserts the pinning at runtime, so a future edit fails the rehearsal itself", () => {
    expect(liveRehearsalSource).toContain("REHEARSAL_TARGET_REF_PINNED");
    expect(liveRehearsalSource).toMatch(/TARGET_REF === TARGET_SHA/);
  });

  it("the counts this rehearsal asserts are the immutable 49 / 69 / 20", () => {
    expect(EXPECTED_BASELINE_COUNT).toBe(49);
    expect(EXPECTED_TARGET_COUNT).toBe(69);
    expect(EXPECTED_DELTA).toBe(20);
    expect(EXPECTED_BASELINE_COUNT + EXPECTED_DELTA).toBe(EXPECTED_TARGET_COUNT);
    // And the rehearsal consumes them rather than restating any of them.
    for (const literal of [" 49", " 69", " 20"]) {
      expect(liveRehearsalSource.includes(`=== ${literal.trim()}`), `hard-coded ${literal.trim()}`).toBe(false);
    }
  });
});

// ── 2. Materialisation, proven against synthetic history ────────────────────

describe("PHASE997_MATERIALISES_THE_REQUESTED_COMMIT", () => {
  it("materialises a pinned commit even when HEAD has grown past it", () => {
    withSyntheticRepo("a", (repo, scratch) => {
      const target = materializeMigrationSet(repo.targetSha, join(scratch, "target"), {
        repoRoot: repo.root,
      });
      const head = materializeMigrationSet("HEAD", join(scratch, "head"), { repoRoot: repo.root });

      // The pinned commit yields exactly its own set...
      expect(target.migrationNames).toEqual(repo.targetNames);
      // ...and the later release's migration is NOT in it, though HEAD has it.
      expect(head.migrationNames).toEqual(repo.headNames);
      expect(head.migrationNames.length).toBe(target.migrationNames.length + 1);
      expect(target.migrationNames).not.toContain("20200301000000_synthetic_later_release");
      expect(head.migrationNames).toContain("20200301000000_synthetic_later_release");
    });
  });

  it("materialising HEAD would break a fixed-count contract — the exact CI failure", () => {
    withSyntheticRepo("a", (repo, scratch) => {
      const pinnedCount = materializeMigrationSet(repo.targetSha, join(scratch, "t"), {
        repoRoot: repo.root,
      }).migrationNames.length;
      const headCount = materializeMigrationSet("HEAD", join(scratch, "h"), {
        repoRoot: repo.root,
      }).migrationNames.length;
      // A rehearsal asserting `pinnedCount` while materialising HEAD fails.
      expect(headCount).not.toBe(pinnedCount);
    });
  });

  it("also materialises the baseline end of the transition", () => {
    withSyntheticRepo("a", (repo, scratch) => {
      const baseline = materializeMigrationSet(repo.baselineSha, join(scratch, "b"), {
        repoRoot: repo.root,
      });
      expect(baseline.migrationNames).toEqual(repo.baselineNames);
      expect(baseline.migrationNames.length).toBeLessThan(repo.targetNames.length);
      expect(readFileSync(baseline.schemaPath, "utf8")).toContain("synthetic");
    });
  });

  it("an unreachable commit throws rather than yielding an empty set", () => {
    withSyntheticRepo("a", (repo, scratch) => {
      expect(() =>
        materializeMigrationSet("0".repeat(40), join(scratch, "missing"), { repoRoot: repo.root }),
      ).toThrow();
    });
  });

  it("MUTATION: the injected repoRoot is honoured, not decoration", () => {
    // Two independent synthetic repositories whose migration names differ. If
    // `repoRoot` were ignored, both calls would read the enclosing checkout and
    // could not return these synthetic names at all.
    withSyntheticRepo("a", (repoA, scratchA) => {
      withSyntheticRepo("b", (repoB, scratchB) => {
        const a = materializeMigrationSet(repoA.targetSha, join(scratchA, "a"), { repoRoot: repoA.root });
        const b = materializeMigrationSet(repoB.targetSha, join(scratchB, "b"), { repoRoot: repoB.root });
        expect(a.migrationNames).toEqual(repoA.targetNames);
        expect(b.migrationNames).toEqual(repoB.targetNames);
        expect(a.migrationNames).not.toEqual(b.migrationNames);
        // repoA's commit is meaningless in repoB — proof the root really moved.
        expect(() =>
          materializeMigrationSet(repoA.targetSha, join(scratchB, "cross"), { repoRoot: repoB.root }),
        ).toThrow();
      });
    });
  });
});

// ── 3. Fail-closed behaviour, observed from the process itself ──────────────

describe("PHASE997_REHEARSAL_FAILS_CLOSED", () => {
  it("a checkout without the pinned history prints a verdict and exits 1", () => {
    const run = runRehearsalInSandbox();
    expect(run.stdout).toContain("RESULT REHEARSAL_TARGET_REF_PINNED=PASS");
    expect(run.stdout, "the unreachable pinned commit must be named").toContain(
      "RESULT REHEARSAL_BASELINE_REACHABLE=FAIL",
    );
    expect(run.stdout, "the fix is to fetch history — say so").toContain("fetch-depth: 0");
    expect(run.stdout, "the verdict must still be printed").toContain(
      "RESULT phase997_migration_rehearsal=FAIL",
    );
    expect(run.status, "a rehearsal that proved nothing must not exit 0").toBe(1);
    // It must never have reached Docker.
    expect(run.stdout).not.toContain("[disposable-pg] starting");
  }, 120_000);

  it("cleans up its working tree on the failure path", () => {
    const run = runRehearsalInSandbox();
    expect(run.leakedTempDirs, "the rehearsal leaked a temp directory").toEqual([]);
  }, 120_000);

  it("MUTATION: removing the cleanup is caught", () => {
    // Proves the assertion above is sensitive rather than vacuously true.
    const removeCleanup = (s: string) => {
      const mutated = s.replace("      rmSync(work, { recursive: true, force: true });", "");
      expect(mutated, "cleanup mutation did not apply").not.toBe(s);
      return mutated;
    };
    const run = runRehearsalInSandbox(removeCleanup);
    expect(run.leakedTempDirs.length).toBeGreaterThan(0);
  }, 120_000);

  it("MUTATION: a verdict-free success is caught", () => {
    // The early returns live inside the `try`, so a `finish()` moved out of the
    // `finally` never runs on them: no verdict, exit 0, green CI having
    // rehearsed nothing. This is the shape the fix replaced.
    const moveFinishOut = (s: string) => {
      const mutated = s.replace("    finish();\n  }\n}", "  }\n  finish();\n}");
      expect(mutated, "finish() mutation did not apply").not.toBe(s);
      return mutated;
    };
    const run = runRehearsalInSandbox(moveFinishOut);
    expect(run.stdout).not.toContain("RESULT phase997_migration_rehearsal=");
    expect(run.status).toBe(0);
  }, 120_000);

  it("MUTATION: reverting the target to HEAD is caught at runtime", () => {
    const revertToHead = (s: string) => {
      const mutated = s.replace(
        "export const TARGET_REF = TARGET_SHA;",
        'export const TARGET_REF = "HEAD";',
      );
      expect(mutated, "HEAD mutation did not apply").not.toBe(s);
      return mutated;
    };
    const run = runRehearsalInSandbox(revertToHead);
    expect(run.stdout).toContain("RESULT REHEARSAL_TARGET_REF_PINNED=FAIL");
    expect(run.stdout).toContain("RESULT phase997_migration_rehearsal=FAIL");
    expect(run.status).toBe(1);
  }, 120_000);

  it("no environment variable can repoint the historical target", () => {
    // The override this fix deleted, offered back to the process.
    const run = runRehearsalInSandbox(undefined, {
      PHASE997_TARGET_REF: "HEAD",
      PHASE997_TARGET_SHA: "HEAD",
      TARGET_REF: "HEAD",
    });
    expect(run.stdout).toContain("RESULT REHEARSAL_TARGET_REF_PINNED=PASS");
    // Still refuses, because the PINNED baseline is what it went looking for.
    expect(run.stdout).toContain("RESULT REHEARSAL_BASELINE_REACHABLE=FAIL");
    expect(run.stdout).toContain(`cannot materialise ${BASELINE_SHA.slice(0, 12)}`);
    expect(run.status).toBe(1);
  }, 120_000);

  it("the verdict is printed from the finally block, which every early return runs", () => {
    // Scoped to the finally block's OWN text. An unscoped
    // /finally\s*\{[\s\S]*finish\(\)/ would be satisfied by the `function
    // finish()` DECLARATION further down the file and would still pass with the
    // call deleted — a vacuous assertion.
    const start = liveRehearsalSource.lastIndexOf("} finally {");
    expect(start, "main() must still have a finally block").toBeGreaterThan(-1);
    const finallyBlock = liveRehearsalSource.slice(start, liveRehearsalSource.indexOf("\n  }", start));
    expect(finallyBlock).toContain("finish();");
    expect(finallyBlock).toContain("rmSync(work");
  });

  it("importing the rehearsal never starts a container", () => {
    expect(liveRehearsalSource).toContain("invokedDirectly");
    expect(liveRehearsalSource).toMatch(/if \(invokedDirectly\)/);
  });
});

// ── 4. The immutable ledger is read, never written ──────────────────────────

describe("PHASE997_LEDGER_IS_IMMUTABLE_HERE", () => {
  const ledger = JSON.parse(readFileSync(join(REPO, LEDGER_PATH), "utf8"));

  it("is byte-for-byte unchanged", () => {
    const raw = readFileSync(join(REPO, LEDGER_PATH), "utf8");
    const digest = createHash("sha256").update(raw.split("\r\n").join("\n"), "utf8").digest("hex");
    expect(digest).toBe(PHASE997_LEDGER_SHA256);
  });

  it("still records the 49 -> 69 transition with a delta of 20", () => {
    expect(ledger.baselineSha).toBe(BASELINE_SHA);
    expect(ledger.targetSha).toBe(TARGET_SHA);
    expect(ledger.baselineMigrationCount).toBe(EXPECTED_BASELINE_COUNT);
    expect(ledger.targetMigrationCount).toBe(EXPECTED_TARGET_COUNT);
    expect(ledger.newMigrationCount).toBe(EXPECTED_DELTA);
    expect(ledger.historicalMutationCount).toBe(0);
    expect(Object.keys(ledger.migrationChecksums)).toHaveLength(EXPECTED_TARGET_COUNT);
  });

  it("the rehearsal never writes or regenerates it", () => {
    expect(liveRehearsalSource).not.toContain("phase99.7-migration-ledger");
    expect(liveRehearsalSource).not.toContain("--write");
    // Its only writes go into the throwaway materialisation tree.
    for (const write of liveRehearsalSource.match(/writeFileSync\([^,]+/g) ?? []) {
      expect(write, "a write that is not into the temp tree").toMatch(/join\((prismaDir|migrationsDir)/);
    }
  });

  it("a sandbox run cannot have touched it", () => {
    const before = readFileSync(join(REPO, LEDGER_PATH), "utf8");
    runRehearsalInSandbox();
    expect(readFileSync(join(REPO, LEDGER_PATH), "utf8")).toBe(before);
  }, 120_000);
});

// ── 5. Real-history proof stays in the integration path ─────────────────────

describe("PHASE997_REAL_HISTORY_PROOF_IS_WIRED", () => {
  it("CI checks out full history for the rehearsal job", () => {
    const wf = readFileSync(join(REPO, PHASE997_WORKFLOW), "utf8");
    const job = wf.slice(wf.indexOf("phase997-migration-rehearsal:"));
    expect(job).toContain("fetch-depth: 0");
    expect(job).toContain("rehearse:phase997:migrations");
  });

  it("the integrity gate that proves the real 69-set also runs under full history", () => {
    const wf = readFileSync(join(REPO, PHASE997_WORKFLOW), "utf8");
    const offline = wf.slice(wf.indexOf("phase997-offline:"), wf.indexOf("phase997-migration-rehearsal:"));
    expect(offline).toContain("fetch-depth: 0");
    expect(offline).toContain("gate:phase997:migrations");
  });

  it("the Phase 102 workflow runs both migration gates under full history", () => {
    const wf = readFileSync(join(REPO, ".github/workflows/phase102-media-hub-assurance.yml"), "utf8");
    const offline = wf.slice(0, wf.indexOf("phase102-postgres:"));
    expect(offline).toContain("fetch-depth: 0");
    expect(offline).toContain("gate:phase997:migrations");
    expect(offline).toContain("gate:phase102:migrations");
  });

  it("this suite itself reads no history from the enclosing repository", () => {
    // The regression that made four unrelated shallow-checkout jobs fail. The
    // only git this file runs is against repositories it created itself.
    const self = readFileSync(join(REPO, "scripts/__tests__/phase997-rehearsal-pinning.test.ts"), "utf8");
    const live = stripComments(self);
    expect(live).not.toMatch(/cwd:\s*REPO/);
    // Assembled at runtime: spelling the forbidden option out as a literal
    // would plant it in this file and make the assertion fail on itself.
    expect(live).not.toContain(["repoRoot", "REPO"].join(": "));
    // Scanned by index, not by regex: a non-greedy `\)` stops at the FIRST
    // closing paren, which for `materializeMigrationSet(sha, join(a, b), {…})`
    // is `join`'s — the window would end before the options object and the
    // assertion would inspect nothing.
    // Assembled, not spelled: a literal needle would match ITSELF here and the
    // window after it would (correctly) contain no repoRoot.
    const CALL = `materializeMigrationSet${"("}`;
    let calls = 0;
    for (let i = live.indexOf(CALL); i !== -1; i = live.indexOf(CALL, i + 1)) {
      expect(live.slice(i, i + 200), "every materialisation must name a synthetic repoRoot").toContain(
        "repoRoot: repo",
      );
      calls += 1;
    }
    expect(calls, "the materialisation contract must actually be exercised").toBeGreaterThanOrEqual(6);
    // And no assertion is skipped to make that true.
    expect(live).not.toMatch(/\b(it|describe|test)\.(skip|skipIf|runIf|todo)\b/);
  });
});
