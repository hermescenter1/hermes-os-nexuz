/**
 * End-to-end tests for the S1 delta relock checker: the real command line, in a real
 * child process, against copies of the real inputs.
 *
 *   node --test scripts/security/s1/__tests__/relock-delta.e2e.mjs
 *
 * Every case writes the inputs it needs into a temporary directory, runs
 * `node relock-delta-check.mjs check ...` and asserts the process exit code, so the
 * exit table is proven from the process boundary and not only from helper calls.
 * A crash must never look like a validation failure, and a validation failure must
 * name its own class. `S1_RELOCK_ROOT` points the checker at the repository when
 * this file runs from a mutated copy (the campaign sets it).
 */

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../relock-delta-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "relock-delta-check.mjs");
const ROOT = process.env.S1_RELOCK_ROOT ? resolve(process.env.S1_RELOCK_ROOT) : R.REPO_ROOT;
const PATHS = R.defaultPaths(ROOT);
const E = R.EXIT;

const lf = (s) => s.replace(/\r\n/g, "\n");
const DATA = JSON.parse(readFileSync(PATHS.data, "utf8"));
const MD = lf(readFileSync(PATHS.report, "utf8"));
const REGISTER = JSON.parse(readFileSync(PATHS.register, "utf8"));
const INVENTORY = JSON.parse(readFileSync(PATHS.inventory, "utf8"));
const ADJ = JSON.parse(readFileSync(PATHS.adjudications, "utf8"));

const DIR = mkdtempSync(join(tmpdir(), "relock-e2e-"));
after(() => rmSync(DIR, { recursive: true, force: true }));
let seq = 0;
const put = (text) => {
  const p = join(DIR, `f${(seq += 1)}`);
  writeFileSync(p, typeof text === "string" ? text : JSON.stringify(text));
  return p;
};
const clone = (x) => structuredClone(x);
const finding = (d, id) => d.findings.find((f) => f.findingId === id);

/** Run the command line with overrides for any input and return its exit status. */
function cli(mode, over = {}) {
  const args = [CLI, mode, `--root=${ROOT}`];
  const map = { data: over.data, report: over.report, register: over.register, inventory: over.inventory, adjudications: over.adjudications, record: over.record };
  for (const [k, v] of Object.entries(map)) if (v !== undefined) args.push(`--${k}=${v}`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", env });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

function expectExit(label, status, want) {
  assert.equal(status, want, `${label}: expected exit ${want}, got ${status}`);
}

test("e2e clean: the committed inputs pass with exit 0", () => {
  const r = cli("check");
  expectExit("clean", r.status, E.OK);
  assert.match(r.out, /relock provenance consistent/, "clean: expected the success line");
});

test("e2e usage: an unknown mode is a usage error", () => {
  expectExit("usage", cli("frobnicate").status, E.USAGE);
});

test("e2e missing file: an absent delta document is exit 3", () => {
  expectExit("missing file", cli("check", { data: join(DIR, "does-not-exist.json") }).status, E.MISSING_FILE);
});

test("e2e malformed json: unreadable JSON is exit 4", () => {
  expectExit("malformed json", cli("check", { data: put("{ not json") }).status, E.MALFORMED_JSON);
});

test("e2e unknown key: an unknown key is exit 5", () => {
  const d = clone(DATA);
  finding(d, "RL-001").severity = "LOW";
  expectExit("unknown key", cli("check", { data: put(d) }).status, E.SCHEMA);
});

test("e2e wrong source sha: a frozen source that is not the merge base is exit 6", () => {
  const d = clone(DATA);
  d.sources.frozenSourceSha = d.sources.securityHeadSha;
  expectExit("wrong source sha", cli("check", { data: put(d) }).status, E.SOURCES);
});

test("e2e wrong target sha: a target that is not the merge's first parent is exit 6", () => {
  const d = clone(DATA);
  d.sources.targetMainSha = d.sources.frozenSourceSha;
  expectExit("wrong target sha", cli("check", { data: put(d) }).status, E.SOURCES);
});

test("e2e wrong merge sha: a merge commit that is not in the repository is exit 6", () => {
  const d = clone(DATA);
  d.sources.integrationMergeSha = "0".repeat(40);
  expectExit("wrong merge sha", cli("check", { data: put(d) }).status, E.SOURCES);
});

test("e2e stale inventory: an inventory whose summary is not the tree's is exit 7", () => {
  const inv = clone(INVENTORY);
  inv.summary.textualOccurrences += 1;
  expectExit("stale inventory", cli("check", { inventory: put(inv) }).status, E.DERIVED_DRIFT);
});

test("e2e orphan adjudication: an adjudication naming no live call site is exit 7", () => {
  const adj = clone(ADJ);
  adj.adjudications.push({ ...adj.adjudications[0], callsiteId: "src/lib/nothing/here.ts#L1C1" });
  expectExit("orphan adjudication", cli("check", { adjudications: put(adj) }).status, E.DERIVED_DRIFT);
});

test("e2e projection mismatch: a severity that the register does not hold is exit 7", () => {
  const d = clone(DATA);
  d.canonicalProjection[0].severity = "LOW";
  expectExit("projection mismatch", cli("check", { data: put(d) }).status, E.DERIVED_DRIFT);
});

test("e2e missing finding: a register delta finding absent from the delta document is exit 8", () => {
  const d = clone(DATA);
  d.findings = d.findings.filter((f) => f.findingId !== "RR-004");
  d.canonicalProjection = d.canonicalProjection.filter((x) => x.findingId !== "RR-004");
  expectExit("missing finding", cli("check", { data: put(d) }).status, E.FINDINGS);
});

test("e2e duplicate finding: a finding declared twice is exit 8", () => {
  const d = clone(DATA);
  d.findings.push(clone(finding(d, "RL-001")));
  d.canonicalProjection.push(clone(d.canonicalProjection.find((x) => x.findingId === "RL-001")));
  expectExit("duplicate finding", cli("check", { data: put(d) }).status, E.FINDINGS);
});

test("e2e missing owner: a delta finding with no owner in the register is exit 8", () => {
  const reg = clone(REGISTER);
  reg.risks.find((r) => r.riskId === "R-65").sourceFindingIds = [];
  expectExit("missing owner", cli("check", { register: put(reg) }).status, E.FINDINGS);
});

test("e2e empty callsite linkage: a call-site-backed finding with no link is exit 8", () => {
  const d = clone(DATA);
  finding(d, "RL-007").relatedCallsiteIds = [];
  expectExit("empty callsite linkage", cli("check", { data: put(d) }).status, E.FINDINGS);
});

test("e2e stale evidence: an anchor that no longer exists is exit 8", () => {
  const d = clone(DATA);
  finding(d, "RL-001").evidence[0].anchor = "this text is nowhere in that file";
  expectExit("stale evidence", cli("check", { data: put(d) }).status, E.FINDINGS);
});

test("e2e path outside delta: delta evidence on an unchanged file is exit 11", () => {
  const d = clone(DATA);
  finding(d, "RL-002").evidence.find((e) => e.scope === "CONTEXT").scope = "DELTA";
  expectExit("path outside delta", cli("check", { data: put(d) }).status, E.PATH_OUTSIDE_DELTA);
});

test("e2e stale markdown: a report block that differs from the renderer is exit 9", () => {
  expectExit("stale markdown", cli("check", { report: put(MD.replace("| Frozen source |", "| Frozen  source |")) }).status, E.REPORT);
});

test("e2e generated block drift: a hand edit inside a generated block is exit 9", () => {
  expectExit("generated block drift", cli("check", { report: put(MD.replace(/\| STRICT_PRODUCT_PATHS \| \d+ \|/, "| STRICT_PRODUCT_PATHS | 1 |")) }).status, E.REPORT);
});

test("e2e record: a missing mutation record is exit 13", () => {
  // the report is made consistent with an absent record, so the record is the only thing wrong
  const report = put(MD.replace(R.extractBlock(MD, "mutations"), () => R.renderMutations(null)));
  expectExit("record", cli("check", { record: join(DIR, "no-record.json"), report }).status, E.RECORD);
});

test("e2e content: a secret-shaped string is exit 10", () => {
  const d = clone(DATA);
  finding(d, "RL-001").summary += ` ${"gh" + "p_" + "A".repeat(36)}`;
  expectExit("content", cli("check", { data: put(d) }).status, E.CONTENT);
});

test("e2e crash: an input that parses but breaks the checker is exit 70, never a validation code", () => {
  const r = cli("check", { inventory: put({}) });
  expectExit("crash", r.status, E.INTERNAL_ERROR);
  assert.match(r.err, /internal error/, "crash: expected the internal-error message");
});

test("e2e canonical: a document that is correct but not canonical is exit 12", () => {
  const text = readFileSync(PATHS.data, "utf8");
  const d = JSON.parse(text);
  expectExit("canonical", cli("check", { data: put(JSON.stringify(d)) }).status, E.NOT_CANONICAL);
});

test("e2e summary: the summary mode prints counters and exits 0", () => {
  const r = cli("summary");
  expectExit("summary", r.status, E.OK);
  assert.equal(JSON.parse(r.out).deltaFindings, DATA.findings.length, "summary: expected the finding count");
});

test("e2e generate is idempotent: regenerating the committed inputs changes no byte", () => {
  const data = put(readFileSync(PATHS.data, "utf8"));
  // a report with a stale generated block: generate must put it right, byte for byte
  const report = put(MD.replace("| Frozen source |", "| Frozen  source |"));
  const r = cli("generate", { data, report });
  expectExit("generate", r.status, E.OK);
  assert.equal(readFileSync(data, "utf8"), readFileSync(PATHS.data, "utf8"), "generate: expected the document to be unchanged");
  assert.equal(lf(readFileSync(report, "utf8")), MD, "generate: expected the report to be unchanged");
});

test("e2e identity fact: a pinned fact whose evidence was dropped is exit 8", () => {
  const d = clone(DATA);
  const f = finding(d, "RR-001");
  f.evidence = f.evidence.filter((e) => e.fact !== "RR-001.NO_CORRECTION_CALLER");
  const r = cli("check", { data: put(d) });
  expectExit("dropped fact", r.status, E.FINDINGS);
  assert.match(r.err, /IDENTITY_FACT_MISSING/, "dropped fact: expected the named violation");
});

test("e2e mechanism: an inverted mechanism sentence that keeps its keywords is exit 8", () => {
  const d = clone(DATA);
  const f = finding(d, "RR-001");
  f.summary = f.summary.replace("returns an empty list when that query throws", "returns a populated list when that query throws");
  const r = cli("check", { data: put(d) });
  expectExit("inverted mechanism", r.status, E.FINDINGS);
  assert.match(r.err, /IDENTITY_MECHANISM_HASH/, "inverted mechanism: expected the named violation");
});

test("e2e evidence rule: an absence that the committed tree contradicts is exit 8", () => {
  const d = clone(DATA);
  const f = finding(d, "RR-011");
  const item = f.evidence.find((e) => e.fact === "RR-011.INVENTORY_LACKS_PARTY");
  item.pattern = "export";
  const r = cli("check", { data: put(d) });
  expectExit("contradicted absence", r.status, E.FINDINGS);
  assert.match(r.err, /EVIDENCE_ABSENT_PATTERN|IDENTITY_FACT_CHANGED/, "contradicted absence: expected an evidence violation");
});

// ───────────── POSTREV-F1: the COMMITTED state is exercised, not only the untracked one ─────────────
//
// Every gate was green while the 17 artifacts were untracked and red the moment they were tracked (the scanner
// read the assurance tools). This test commits exactly the allowlisted artifacts into a throw-away clone,
// checks that commit out in a second clone and runs the gates there. It is bounded (two clones, no network),
// it never touches the repository under test, and it removes both clones afterwards.

import { cpSync, existsSync, mkdirSync } from "node:fs";

test("e2e committed state: committing exactly the artifacts keeps the scanner, the inventory and the relock gates green, and a fresh checkout changes nothing", { timeout: 900000 }, () => {
  const work = mkdtempSync(join(tmpdir(), "relock-committed-"));
  const git = (cwd, ...args) => {
    const r = spawnSync("git", ["-c", "core.longpaths=true", "-c", "core.autocrlf=false", "-c", "user.name=fixture", "-c", "user.email=fixture@example.com", ...args], { cwd, encoding: "utf8", maxBuffer: 1 << 28 });
    assert.equal(r.status, 0, `COMMITTED_GIT: git ${args.slice(0, 3).join(" ")} failed: ${(r.stderr || "").slice(0, 200)}`);
    return r.stdout;
  };
  const node = (cwd, ...args) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, args, { cwd, encoding: "utf8", env, maxBuffer: 1 << 28 });
    return { status: r.status, out: r.stdout, err: r.stderr };
  };
  try {
    const head = git(ROOT, "rev-parse", "HEAD").trim();
    const entries = R.worktreeStatus(ROOT).split("\0").filter(Boolean).map((l) => ({ status: l.slice(0, 2), path: l.slice(3) }));
    assert.deepEqual(entries.filter((e) => !R.isAllowlistedPath(e.path)), [], "COMMITTED_SUBJECT: only allowlisted artifacts differ from HEAD");

    // 1 — the simulated commit
    const m = join(work, "m");
    git(work, "clone", "--quiet", "--no-checkout", "--no-hardlinks", ROOT, m);
    git(m, "checkout", "--quiet", "-B", "committed", head);
    for (const e of entries) {
      const src = join(ROOT, e.path);
      if (existsSync(src)) {
        mkdirSync(join(m, e.path, ".."), { recursive: true });
        cpSync(src, join(m, e.path));
      }
    }
    if (entries.length) {
      git(m, "add", "--", ...entries.map((e) => e.path));
      const staged = git(m, "diff", "--cached", "--name-only").split("\n").filter(Boolean).sort();
      assert.deepEqual(staged, entries.map((e) => e.path).sort(), "COMMITTED_EXACT: exactly the artifacts are committed");
      git(m, "commit", "--quiet", "-m", "simulated commit of the artifacts");
    }
    const tracked = git(m, "ls-files", "--", "scripts/security/s0", "scripts/security/s1").split("\n").filter(Boolean);
    for (const p of ["scripts/security/s0/getprisma-callsite-inventory.mjs", "scripts/security/s1/relock-delta-check.mjs", "scripts/security/s1/risk-register-check.mjs"]) {
      assert.ok(tracked.includes(p), `COMMITTED_TRACKED: ${p} is tracked after the commit`);
    }

    // 2 — a fresh checkout of that commit
    const f = join(work, "f");
    git(work, "clone", "--quiet", "--no-hardlinks", m, f);
    assert.equal(git(f, "rev-parse", "HEAD").trim(), git(m, "rev-parse", "HEAD").trim(), "COMMITTED_FRESH: the fresh clone is at the simulated commit");
    const dirty = () => git(f, "status", "--porcelain", "-uall").trim();
    assert.equal(dirty(), "", "COMMITTED_CLEAN: a fresh checkout is clean");

    // 3 — the gates, on the committed state
    const S0 = "scripts/security/s0/getprisma-callsite-inventory.mjs";
    const blob = (p) => git(f, "show", `HEAD:${p}`);
    const inventoryBefore = blob("docs/security/s0-getprisma-callsite-inventory.json");
    const gen = node(f, S0, "generate");
    assert.equal(gen.status, 0, `COMMITTED_S0_GENERATE: ${gen.err.slice(0, 200)}`);
    assert.equal(readFileSync(join(f, "docs/security/s0-getprisma-callsite-inventory.json"), "utf8"), inventoryBefore, "COMMITTED_INVENTORY: the regenerated inventory is byte-identical to the committed blob");
    assert.equal(dirty(), "", "COMMITTED_CLEAN: generate changes no file");
    for (const [label, args] of [
      ["S0 check", [S0, "check"]],
      ["S0 coverage", [S0, "coverage"]],
      ["S1 check", ["scripts/security/s1/risk-register-check.mjs", "check"]],
      ["relock check", ["scripts/security/s1/relock-delta-check.mjs", "check"]],
      ["relock summary", ["scripts/security/s1/relock-delta-check.mjs", "summary"]],
    ]) {
      const r = node(f, ...args);
      assert.equal(r.status, 0, `COMMITTED_GATE: ${label} exit ${r.status}: ${(r.err || r.out).split("\n").slice(0, 3).join(" | ").slice(0, 300)}`);
    }
    const summary = JSON.parse(node(f, S0, "summary").out);
    assert.equal(summary.textualOccurrences, JSON.parse(inventoryBefore).summary.textualOccurrences, "COMMITTED_TEXTUAL: the committed tools add no textual occurrence");
    assert.equal(dirty(), "", "COMMITTED_CLEAN: the gates change no file");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test("e2e environment: when git cannot answer the checker exits 3 (a missing prerequisite), never 0 and never a validation code", () => {
  const empty = mkdtempSync(join(tmpdir(), "relock-nogit-"));
  try {
    const args = [CLI, "check", `--root=${empty}`, `--data=${PATHS.data}`, `--report=${PATHS.report}`, `--register=${PATHS.register}`, `--inventory=${PATHS.inventory}`, `--adjudications=${PATHS.adjudications}`, `--record=${PATHS.record}`];
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, args, { cwd: empty, encoding: "utf8", env });
    expectExit("no git", r.status, E.MISSING_FILE);
    assert.match(r.stderr, /git is required/, "ENV_NO_GIT: the failure names the prerequisite, not a finding");
    const validation = [E.SCHEMA, E.SOURCES, E.DERIVED_DRIFT, E.FINDINGS, E.REPORT, E.CONTENT, E.PATH_OUTSIDE_DELTA, E.NOT_CANONICAL, E.RECORD];
    assert.ok(!validation.includes(r.status) && r.status !== E.OK, "ENV_NOT_VALIDATION: an environment failure is neither success nor a validation code");
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});
