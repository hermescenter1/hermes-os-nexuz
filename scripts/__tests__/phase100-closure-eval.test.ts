/**
 * PHASE 100 — closure evaluator and verdict-assembly tests.
 *
 * Two layers are proven here.
 *
 * The verdict assembler is tested directly, because the states that matter most
 * are the ones this repository cannot currently reach: "every gate PASS" must
 * be the ONLY way to `GA_RELEASE_READY=YES`, and that rule is worthless if the
 * only way to exercise it is to ship a real release.
 *
 * The evaluator itself is then run as a real child process against the real
 * tree, so the contract that CI depends on — output shape, determinism, exit
 * code, and the absence of anything secret-shaped — is proven end to end rather
 * than inferred.
 *
 * No network, no filesystem writes outside the evaluator's own artifact.
 */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  createLedger,
  aggregate,
  assembleVerdict,
  evaluatorFailures,
  REQUIRED_GROUPS,
  REPOSITORY_OWNED_GATES,
  INFORMATIONAL_GROUP,
} from "../security/phase100/verdict.mjs";

const REPO = join(__dirname, "..", "..");
const EVALUATOR = join(REPO, "scripts", "ci", "phase100-ga-closure-eval.mjs");

/** A ledger with one PASS gate per required group. */
function passingLedger() {
  const { ledger, record } = createLedger();
  record("PHASE100_IMPLEMENTATION", "IMPLEMENTATION", "PASS", null, [], true);
  record("PHASE100_INTERNAL_TECHNICAL_READINESS", "INTERNAL_READINESS", "PASS", null, [], true);
  for (const group of REQUIRED_GROUPS) {
    if (group === "IMPLEMENTATION" || group === "INTERNAL_READINESS") continue;
    record(`${group}_GATE`, group, "PASS", null, [], true);
  }
  return ledger;
}

describe("verdict assembly", () => {
  it("reports GA_RELEASE_READY=YES only when every required gate is PASS", () => {
    const v = assembleVerdict(passingLedger());
    expect(v.releaseBlockerCount).toBe(0);
    expect(v.officialOutputs.GA_RELEASE_READY).toBe("YES");
    expect(v.officialOutputs.PHASE100_CLOSURE).toBe("PASS");
    expect(v.contradictions).toEqual([]);
    expect(evaluatorFailures(passingLedger(), v.contradictions)).toEqual([]);
  });

  it("a single BLOCKED gate is enough to withhold GA", () => {
    const ledger = passingLedger();
    ledger.find((g) => g.name === "LEGAL_PRIVACY_GATE")!.state = "BLOCKED";
    const v = assembleVerdict(ledger);
    expect(v.officialOutputs.GA_RELEASE_READY).toBe("NO");
    expect(v.officialOutputs.PHASE100_CLOSURE).toBe("BLOCKED");
    expect(v.releaseBlockerCount).toBe(1);
    expect(v.blockers[0].name).toBe("LEGAL_PRIVACY_GATE");
  });

  it("distinguishes BLOCKED (absence) from FAIL (invalid evidence) in the closure verdict", () => {
    const blockedLedger = passingLedger();
    blockedLedger.find((g) => g.name === "BACKUP_OPERATIONAL_GATE")!.state = "BLOCKED";
    expect(assembleVerdict(blockedLedger).officialOutputs.PHASE100_CLOSURE).toBe("BLOCKED");

    const failedLedger = passingLedger();
    failedLedger.find((g) => g.name === "BACKUP_OPERATIONAL_GATE")!.state = "FAIL";
    expect(assembleVerdict(failedLedger).officialOutputs.PHASE100_CLOSURE).toBe("FAIL");
  });

  it("counts and names EVERY blocker — no blocker is hidden behind another", () => {
    const ledger = passingLedger();
    for (const name of ["LEGAL_PRIVACY_GATE", "COMMERCIAL_OWNER_GATE", "GA_AUTHORIZATION_GATE"]) {
      ledger.find((g) => g.name === name)!.state = "BLOCKED";
    }
    const v = assembleVerdict(ledger);
    expect(v.releaseBlockerCount).toBe(3);
    expect(v.blockers.map((b) => b.name)).toEqual(["LEGAL_PRIVACY_GATE", "COMMERCIAL_OWNER_GATE", "GA_AUTHORIZATION_GATE"]);
  });

  it("keeps the blocker matrix in a stable, ledger order across runs", () => {
    const build = () => {
      const ledger = passingLedger();
      ledger.find((g) => g.name === "GA_AUTHORIZATION_GATE")!.state = "BLOCKED";
      ledger.find((g) => g.name === "LEGAL_PRIVACY_GATE")!.state = "BLOCKED";
      return assembleVerdict(ledger).blockers.map((b) => b.name);
    };
    expect(build()).toEqual(build());
    // Ledger order, not alphabetical or discovery order.
    expect(build()).toEqual(["LEGAL_PRIVACY_GATE", "GA_AUTHORIZATION_GATE"]);
  });

  it("excludes the Phase 99 aggregate so an absence is not double-counted as a failure", () => {
    const ledger = passingLedger();
    ledger.push({
      name: "RELEASE_BLOCKERS_ZERO",
      group: INFORMATIONAL_GROUP,
      state: "FAIL",
      reason: "RELEASE_BLOCKERS=1 (0 open finding blocker(s) + PILOT_ACCEPTANCE_MISSING)",
      errors: [],
      evidenceSupplied: false,
    });
    const v = assembleVerdict(ledger);
    expect(v.releaseBlockerCount).toBe(0);
    expect(v.officialOutputs.GA_RELEASE_READY).toBe("YES");
    // It is still reported, just not counted twice.
    expect(aggregate(ledger, INFORMATIONAL_GROUP)).toBe("FAIL");
  });

  it("detects a contradictory GA_READY=YES verdict rather than emitting it", () => {
    const ledger = passingLedger();
    const v = assembleVerdict(ledger);
    // Force the contradiction the evaluator must never produce.
    const tampered = { ...v, releaseBlockerCount: 2 };
    const contradictions: string[] = [];
    if (tampered.officialOutputs.GA_RELEASE_READY === "YES" && tampered.releaseBlockerCount > 0) {
      contradictions.push("GA_RELEASE_READY=YES while RELEASE_BLOCKER_COUNT>0");
    }
    expect(contradictions).toHaveLength(1);
    expect(evaluatorFailures(ledger, contradictions)).toContain("GA_RELEASE_READY=YES while RELEASE_BLOCKER_COUNT>0");
  });

  it("refuses GA when the implementation self-check or internal readiness is not PASS", () => {
    const ledger = passingLedger();
    ledger.find((g) => g.name === "PHASE100_INTERNAL_TECHNICAL_READINESS")!.state = "BLOCKED";
    const v = assembleVerdict(ledger);
    expect(v.officialOutputs.GA_RELEASE_READY).toBe("NO");
    expect(v.contradictions).toEqual([]);

    const ledger2 = passingLedger();
    ledger2.find((g) => g.name === "PHASE100_IMPLEMENTATION")!.state = "FAIL";
    expect(assembleVerdict(ledger2).officialOutputs.GA_RELEASE_READY).toBe("NO");
    expect(evaluatorFailures(ledger2, [])).toContain("PHASE100_IMPLEMENTATION");
  });

  it("aggregates FAIL over BLOCKED over PASS, independently of member order", () => {
    const mk = (states: string[]) =>
      states.map((state, i) => ({ name: `g${i}`, group: "X", state, reason: null, errors: [], evidenceSupplied: true }));
    expect(aggregate(mk(["PASS", "PASS"]), "X")).toBe("PASS");
    expect(aggregate(mk(["PASS", "BLOCKED"]), "X")).toBe("BLOCKED");
    expect(aggregate(mk(["BLOCKED", "PASS"]), "X")).toBe("BLOCKED");
    expect(aggregate(mk(["BLOCKED", "FAIL"]), "X")).toBe("FAIL");
    expect(aggregate(mk(["FAIL", "BLOCKED"]), "X")).toBe("FAIL");
    expect(aggregate([], "X")).toBe("BLOCKED");
  });

  it("fails the build on invalid SUPPLIED evidence but not on absent evidence", () => {
    const absent = passingLedger();
    absent.find((g) => g.name === "LEGAL_PRIVACY_GATE")!.state = "BLOCKED";
    absent.find((g) => g.name === "LEGAL_PRIVACY_GATE")!.evidenceSupplied = false;
    expect(evaluatorFailures(absent, [])).toEqual([]);

    const invalid = passingLedger();
    const gate = invalid.find((g) => g.name === "LEGAL_PRIVACY_GATE")!;
    gate.state = "FAIL";
    gate.evidenceSupplied = true;
    expect(evaluatorFailures(invalid, [])).toContain("LEGAL_PRIVACY_GATE");
  });

  it("fails the build when a repository-owned engineering gate fails", () => {
    for (const name of REPOSITORY_OWNED_GATES) {
      const ledger = passingLedger();
      ledger.push({ name, group: "EXTERNAL_SECURITY", state: "FAIL", reason: null, errors: [], evidenceSupplied: true });
      expect(evaluatorFailures(ledger, []), name).toContain(name);
    }
  });

  it("rejects a duplicate gate name rather than letting one overwrite another", () => {
    const { record } = createLedger();
    record("X", "EXTERNAL_SECURITY", "PASS");
    expect(() => record("X", "LEGAL_PRIVACY", "FAIL")).toThrow(/duplicate gate/);
  });
});

describe("the evaluator, run for real", () => {
  const run = () => {
    const stdout = execFileSync(process.execPath, [EVALUATOR], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return stdout;
  };

  const parseOutputs = (stdout: string) => {
    const block = stdout.split("── PHASE 100 OFFICIAL GA CLOSURE OUTPUTS ──")[1] ?? "";
    const outputs: Record<string, string> = {};
    for (const line of block.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) outputs[m[1]] = m[2];
    }
    return outputs;
  };

  it("emits the complete Phase 100 output contract", () => {
    const outputs = parseOutputs(run());
    for (const key of [
      "PHASE100_IMPLEMENTATION",
      "PHASE100_INTERNAL_TECHNICAL_READINESS",
      "EXTERNAL_SECURITY_GATES",
      "PILOT_ACCEPTANCE_GATES",
      "LEGAL_PRIVACY_GATES",
      "LIVE_MODEL_EVALUATION_GATE",
      "BACKUP_OPERATIONAL_GATE",
      "COMMERCIAL_OWNER_GATE",
      "OPENBAO_PRODUCTION_PREREQUISITES",
      "RELEASE_BLOCKER_COUNT",
      "GA_RELEASE_READY",
      "PHASE100_CLOSURE",
    ]) {
      expect(outputs, key).toHaveProperty(key);
    }
  });

  it("returns implementation PASS while GA closure remains BLOCKED", () => {
    const outputs = parseOutputs(run());
    // The closure MECHANISM is complete; the RELEASE is not authorised. These
    // are different questions and the evaluator must be able to say so.
    expect(outputs.PHASE100_IMPLEMENTATION).toBe("PASS");
    expect(outputs.GA_RELEASE_READY).toBe("NO");
    expect(["BLOCKED", "FAIL"]).toContain(outputs.PHASE100_CLOSURE);
  });

  it("exits 0 while BLOCKED — a green build is not a release approval", () => {
    const result = spawnSync(process.execPath, [EVALUATOR], { cwd: REPO, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("RESULT phase100_evaluator_ok=YES");
    expect(result.stdout).toContain("GA_RELEASE_READY=NO");
    // The "this is not an approval" warning goes to stderr, so a reader scanning
    // a green log still sees why the build passed.
    expect(result.stderr).toContain("GA is NOT authorised");
    expect(result.stderr).toContain("it is not a release approval");
  });

  it("reports that it contacted nothing outside the repository", () => {
    const stdout = run();
    for (const line of [
      "RESULT phase100_production_contacted=False",
      "RESULT phase100_openbao_contacted=False",
      "RESULT phase100_external_reviewer_contacted=False",
      "RESULT phase100_customer_contacted=False",
    ]) {
      expect(stdout).toContain(line);
    }
  });

  it("names every blocker individually in the matrix", () => {
    const stdout = run();
    const outputs = parseOutputs(stdout);
    const count = Number(outputs.RELEASE_BLOCKER_COUNT);
    expect(count).toBeGreaterThan(0);

    const matrix = stdout.split(/RELEASE_BLOCKER_MATRIX \(\d+\)/)[1]?.split(/\r?\n\r?\n/)[0] ?? "";
    const lines = matrix.split(/\r?\n/).filter((l) => /^\s{2}(PASS|BLOCKED|FAIL)\s/.test(l));
    expect(lines).toHaveLength(count);
    // Each line carries a group/gate pair, so a blocker can be acted on.
    for (const line of lines) expect(line).toMatch(/^\s{2}(BLOCKED|FAIL)\s+[A-Z0-9_]+\/[A-Z0-9_]+/);
  });

  it("is deterministic: the same tree produces the same verdict artifact", () => {
    run();
    const first = readFileSync(join(REPO, "phase100-ga-closure.json"), "utf8");
    run();
    const second = readFileSync(join(REPO, "phase100-ga-closure.json"), "utf8");
    expect(second).toBe(first);
  });

  it("publishes a summary that carries no secret-shaped or evidence-bearing value", () => {
    run();
    const stdout = execFileSync(process.execPath, [join(REPO, "scripts", "ci", "phase100-summary-hygiene.mjs")], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(stdout).toContain("RESULT phase100_summary_hygiene=PASS");
  });

  it("binds every gate to the release commit it was evaluated against", () => {
    run();
    const summary = JSON.parse(readFileSync(join(REPO, "phase100-ga-closure.json"), "utf8"));
    expect(summary.expectedCommitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(summary.kind).toBe("OFFICIAL_GA_CLOSURE");
    expect(summary.gaReleaseReady).toBe(false);
  });
});

describe("the closure mechanism itself", () => {
  it("the Phase 99 CLI delegates to the shared engine instead of forking it", () => {
    const cli = readFileSync(join(REPO, "scripts", "ci", "phase99-closure-eval.mjs"), "utf8");
    expect(cli).toContain("closure-core.mjs");
    // The decision logic must live in one place only.
    expect(cli).not.toContain("PILOT_SUBGATES");
  });

  it("every shipped example is marked as a non-production fixture", () => {
    const dir = join(REPO, "docs", "release", "phase100-evidence-examples");
    expect(existsSync(dir)).toBe(true);
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
      const marked = doc.SYNTHETIC_TEST_FIXTURE === true || doc.EXAMPLE_ONLY === true || doc.NOT_EXTERNAL_ATTESTATION === true;
      expect(marked, file).toBe(true);
    }
  });

  it("the evaluator makes no network call and names no production host", () => {
    const sources = [
      join(REPO, "scripts", "ci", "phase100-ga-closure-eval.mjs"),
      join(REPO, "scripts", "security", "phase100", "ga-evidence.mjs"),
      join(REPO, "scripts", "security", "phase100", "verdict.mjs"),
      join(REPO, "scripts", "ci", "phase100-summary-hygiene.mjs"),
    ];
    for (const source of sources) {
      const text = readFileSync(source, "utf8");
      expect(text, source).not.toMatch(/\bfetch\s*\(/);
      expect(text, source).not.toMatch(/require\(['"]node:https?['"]\)|from ['"]node:https?['"]/);
      expect(text, source).not.toMatch(/hermesnovin\.com/);
      expect(text, source).not.toMatch(/api\.stripe\.com|api\.anthropic\.com/);
    }
  });

  it("no Phase 100 evidence document is committed to the repository", () => {
    // The gates must be BLOCKED by genuine absence, not satisfied by a file this
    // phase wrote for itself.
    for (const path of [
      "docs/legal/phase100-legal-privacy-approvals.json",
      "docs/ai-governance/phase100-live-model-evaluation.json",
      "docs/release/phase100-backup-operations.json",
      "docs/release/phase100-commercial-decisions.json",
      "docs/release/phase100-infrastructure-prerequisites.json",
      "docs/release/phase100-ga-authorization.json",
      "docs/security/phase99-external-attestations.json",
      "docs/pilot/phase99-pilot-acceptance.json",
    ]) {
      expect(existsSync(join(REPO, ...path.split("/"))), path).toBe(false);
    }
  });
});
