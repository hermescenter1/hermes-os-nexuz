/**
 * PHASE 99 — the live dependency review never overwrites the committed record.
 *
 * `docs/security/phase99-dependency-review.json` is the historical Phase 99
 * record (cited by P99-DEP-*, asserted by the sha-pinned historical retest). CI
 * regenerates the review from the live audit into a SEPARATE file named by
 * PHASE99_DEPENDENCY_REVIEW_PATH, and the readiness evaluator reads exactly that
 * file. This proves, fail-closed:
 *
 *   A. the path rules (pure): unset -> the committed record; a valid relative
 *      .json path -> that path; everything else is refused, including the
 *      committed record itself under any spelling;
 *   B. the generator refuses a bad path BEFORE contacting the network, and the
 *      committed record is byte-identical afterwards;
 *   C. the readiness evaluator, run for real, evaluates exactly the named live
 *      file (HIGH -> owner block, as designed), keeps it inside the
 *      public-repository hygiene scan, and FAILS on a missing or invalid one with
 *      no fallback to the committed record. (Unset is exercised by the Phase 100
 *      closure tests, which run the evaluator with no variable.)
 *
 * Fixtures live under node_modules/.cache (git-ignored) and only the files this
 * test creates are removed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  COMMITTED_DEPENDENCY_REVIEW,
  DEPENDENCY_REVIEW_PATH_ENV,
  resolveDependencyReviewPath,
} from "../security/phase99/dependency-review-path.mjs";

const REPO = join(__dirname, "..", "..");
const GENERATOR = join(REPO, "scripts", "ci", "phase99-dependency-review.mjs");
const READINESS = join(REPO, "scripts", "ci", "phase99-security-readiness-eval.mjs");
const committedSha = () => createHash("sha256").update(readFileSync(join(REPO, ...COMMITTED_DEPENDENCY_REVIEW.split("/")))).digest("hex");

/** A child env with the variable set (or removed when value is undefined). */
function envWith(value: string | undefined): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env[DEPENDENCY_REVIEW_PATH_ENV];
  if (value !== undefined) env[DEPENDENCY_REVIEW_PATH_ENV] = value;
  return env;
}

/* ───────────────────────────── A. the path rules ───────────────────────────── */

describe("A. resolveDependencyReviewPath", () => {
  it("unset -> the committed historical record, not live", () => {
    expect(resolveDependencyReviewPath({})).toEqual({ ok: true, path: COMMITTED_DEPENDENCY_REVIEW, live: false });
  });

  it.each(["phase99-dependency-review.live.json", "out/review.json", "node_modules/.cache/x/review.json"])(
    "a valid relative .json path is used exactly: %s",
    (p) => {
      expect(resolveDependencyReviewPath({ [DEPENDENCY_REVIEW_PATH_ENV]: p })).toEqual({ ok: true, path: p, live: true });
    },
  );

  it.each([
    ["empty", ""],
    ["leading whitespace", " review.json"],
    ["trailing whitespace", "review.json "],
    ["backslash", "out\\review.json"],
    ["posix absolute", "/tmp/review.json"],
    ["drive absolute", "C:/review.json"],
    ["drive relative", "c:review.json"],
    ["parent escape", "../review.json"],
    ["inner parent escape", "out/../../review.json"],
    ["dot segment", "./review.json"],
    ["empty segment", "out//review.json"],
    ["not json", "review.txt"],
    ["the committed record", COMMITTED_DEPENDENCY_REVIEW],
    ["the committed record, other case", COMMITTED_DEPENDENCY_REVIEW.toUpperCase().replace(".JSON", ".json")],
  ])("refuses %s", (_label, value) => {
    const r = resolveDependencyReviewPath({ [DEPENDENCY_REVIEW_PATH_ENV]: value });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(DEPENDENCY_REVIEW_PATH_ENV);
  });
});

/* ─────────────── B. the generator refuses before any network ─────────────── */

describe("B. the generator refuses a bad output path before running npm audit", () => {
  // The generator runs from an ISOLATED copy, never from the repository: if the
  // refusal ever regressed, the real script would audit and overwrite the
  // committed record mid-test. In the sandbox a regression can only touch a decoy,
  // and an empty package.json stops `npm audit` there (no lockfile, no network).
  const sandbox = join(REPO, "node_modules", ".cache", "phase99-dependency-review-path-test", `sandbox-${process.pid}-${randomBytes(4).toString("hex")}`);
  const sandboxGenerator = join(sandbox, "scripts", "ci", "phase99-dependency-review.mjs");
  const decoy = join(sandbox, ...COMMITTED_DEPENDENCY_REVIEW.split("/"));
  const decoySha = () => createHash("sha256").update(readFileSync(decoy)).digest("hex");

  beforeAll(() => {
    const copy = (rel: string) => {
      const to = join(sandbox, ...rel.split("/"));
      mkdirSync(join(to, ".."), { recursive: true });
      writeFileSync(to, readFileSync(join(REPO, ...rel.split("/"))));
    };
    copy("scripts/ci/phase99-dependency-review.mjs");
    copy("scripts/security/phase99/normalization.mjs");
    copy("scripts/security/phase99/finding-contract.mjs");
    copy("scripts/security/phase99/dependency-review-path.mjs");
    copy(COMMITTED_DEPENDENCY_REVIEW);
    writeFileSync(join(sandbox, "package.json"), JSON.stringify({ name: "phase99-review-path-sandbox", version: "0.0.0", private: true }));
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it.each([
    ["a path escaping the repository", "../evil.json"],
    ["the committed historical record", COMMITTED_DEPENDENCY_REVIEW],
    ["an empty value", ""],
  ])("refuses %s (exit 2) and leaves the committed record byte-identical", (_label, value) => {
    const realBefore = committedSha();
    const decoyBefore = decoySha();
    const res = spawnSync(process.execPath, [sandboxGenerator], { cwd: sandbox, encoding: "utf8", env: envWith(value), timeout: 60_000 });
    expect(res.status).toBe(2);
    // Refused for the PATH — not for some later audit failure that also exits 2.
    expect(res.stderr).toContain(DEPENDENCY_REVIEW_PATH_ENV);
    // It stopped before the audit: nothing was written and no result was reported.
    expect(res.stdout).not.toMatch(/RESULT phase99_dependency_/);
    expect(decoySha()).toBe(decoyBefore);
    expect(committedSha()).toBe(realBefore);
  });

  it("the sandbox runs the same generator source as the repository", () => {
    expect(readFileSync(sandboxGenerator, "utf8")).toBe(readFileSync(GENERATOR, "utf8"));
  });
});

/* ───────────── C. the readiness evaluator, run for real ───────────── */

describe("C. the readiness evaluator evaluates exactly the named review", () => {
  const dir = join("node_modules", ".cache", "phase99-dependency-review-path-test");
  const tag = `${process.pid}-${randomBytes(4).toString("hex")}`;
  const dirtyRel = `${dir.split("\\").join("/")}/dirty-${tag}.json`;
  const created: string[] = [];

  const review = (high: number) => ({
    schemaVersion: 1,
    phase: "99",
    tool: "npm audit",
    note: "test fixture",
    generatedFrom: "package-lock.json",
    totals: {
      all: { CRITICAL: 0, HIGH: high, MEDIUM: 0, LOW: 0, INFO: 0, UNKNOWN: 0 },
      productionOnly: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, UNKNOWN: 0 },
    },
    packages: [],
  });
  const write = (rel: string, body: string) => {
    const abs = join(REPO, ...rel.split("/"));
    writeFileSync(abs, body);
    created.push(abs);
  };
  const runReadiness = (value: string | undefined) => {
    const res = spawnSync(process.execPath, [READINESS], { cwd: REPO, encoding: "utf8", env: envWith(value), timeout: 120_000 });
    const out = res.stdout ?? "";
    const state = (g: string) => new RegExp(`RESULT phase99_${g}=(\\S+)`).exec(out)?.[1];
    return { status: res.status, out, state };
  };

  beforeAll(() => {
    mkdirSync(join(REPO, dir), { recursive: true });
    // A secret-shaped line, assembled at runtime so this source file never holds it.
    const header = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    write(dirtyRel, JSON.stringify({ ...review(7), note: header }, null, 2) + "\n");
  });

  afterAll(() => {
    for (const f of created) if (existsSync(f)) rmSync(f);
  });

  // Each case below runs the real evaluator (~10 s), so the set is kept to the
  // three that can only be proven end-to-end. The unset case is exercised by the
  // Phase 100 closure tests, which run this evaluator with no variable set.
  it("evaluates exactly the named live file, and keeps it inside the hygiene scan", () => {
    const before = committedSha();
    const r = runReadiness(dirtyRel);
    // The named file was evaluated: its HIGH total is an owner block, as designed.
    expect(r.state("DEPENDENCY_REVIEW")).toBe("BLOCKED_OWNER");
    expect(r.out).toContain("7 HIGH advisories open");
    // A live review is a published artifact, so a secret-shaped line in it FAILS.
    expect(r.state("PUBLIC_REPO_DATA_HYGIENE")).toBe("FAIL");
    expect(r.out).toContain(dirtyRel);
    expect(r.out).toContain("PRIVATE_KEY");
    expect(r.status).not.toBe(0);
    expect(committedSha()).toBe(before);
  }, 180_000);

  it("FAILS on a missing live file instead of falling back to the committed record", () => {
    const r = runReadiness(`${dir.split("\\").join("/")}/missing-${tag}.json`);
    expect(r.state("DEPENDENCY_REVIEW")).toBe("FAIL");
    expect(r.out).toContain("missing or unreadable");
    expect(r.status).not.toBe(0);
  }, 180_000);

  it("FAILS on an invalid path", () => {
    const r = runReadiness("../outside.json");
    expect(r.state("DEPENDENCY_REVIEW")).toBe("FAIL");
    expect(r.out).toContain(DEPENDENCY_REVIEW_PATH_ENV);
    expect(r.status).not.toBe(0);
  }, 180_000);

});
