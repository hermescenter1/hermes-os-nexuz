/**
 * PHASE 100 — adversarial tests for evidence reading, attribution and coherence.
 *
 * Every test here corresponds to a defect that was actually present, not to a
 * hypothetical one. The four families:
 *
 *   A. Tri-state reading  — a supplied-but-unusable evidence document used to be
 *      indistinguishable from an absent one, so a corrupt file was reported as
 *      "no evidence recorded" on a GREEN build.
 *   C. Crash paths        — `{"attestations":{}}` reached `.find()` and threw;
 *      an evidence path that resolved to a directory threw EISDIR. Both killed
 *      the evaluator outright, which is the worst possible failure for a gate.
 *   D. Fail-open register — a non-array `findings` was coerced to `[]`, turning
 *      four repository-owned gates green on a corrupt register.
 *   E/F/G. Attribution, commercial coherence, residual acceptance.
 *
 * These tests write only to a per-test temporary directory and make no network
 * call. No real evidence document is created anywhere in the repository tree.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import {
  readEvidenceSource,
  readTextSource,
  malformedReason,
  malformedGateError,
  MALFORMED_CLASSIFICATIONS,
  MAX_EVIDENCE_BYTES,
} from "../security/phase100/evidence-source.mjs";
import {
  resolveEvidenceRoot,
  createEvidenceReader,
  evidenceRepositoryViolations,
  EVIDENCE_ROOT_ENV,
  EVIDENCE_DOCUMENTS,
} from "../security/phase100/evidence-root.mjs";
import { evaluateRegistry, FINDING_REGISTER_NOT_AN_ARRAY } from "../security/phase99/finding-contract.mjs";
import { evaluatePhase99Closure } from "../security/phase99/closure-core.mjs";
import {
  attributeInternalReadiness,
  attributionViolations,
  OWNER_ATTRIBUTED_READINESS_GROUPS,
  PHASE99_AGGREGATE_GATES,
} from "../security/phase100/readiness-attribution.mjs";
import { commercialCoherenceViolations, validateResidualRiskAcceptance } from "../security/phase100/ga-evidence.mjs";
import { assembleVerdict, INFORMATIONAL_GROUP } from "../security/phase100/verdict.mjs";

const temps: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hermes-p100-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  while (temps.length) {
    try {
      rmSync(temps.pop()!, { recursive: true, force: true });
    } catch {
      /* a test that made a path unreadable may leave it behind; harmless */
    }
  }
});

/** An environment with only the evidence-root variable overridden. */
function envWith(value: string): NodeJS.ProcessEnv {
  return { ...process.env, [EVIDENCE_ROOT_ENV]: value };
}
/** An environment with the evidence-root variable removed entirely. */
function envWithout(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env[EVIDENCE_ROOT_ENV];
  return env;
}
/** The closure engine's gate map, which is untyped at the .mjs boundary. */
function gatesOf(result: { gates: unknown }): Record<string, string> {
  return result.gates as Record<string, string>;
}

/** Write a file and return its absolute path. */
function file(dir: string, name: string, body: string | Buffer): string {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

// ── A. Tri-state evidence classification ─────────────────────────────────────

describe("A. evidence is classified, never coerced", () => {
  it("distinguishes absent from valid from malformed", () => {
    const dir = tempDir();
    expect(readEvidenceSource(join(dir, "nope.json")).status).toBe("ABSENT");
    expect(readEvidenceSource(file(dir, "ok.json", '{"a":1}')).status).toBe("VALID");
    expect(readEvidenceSource(file(dir, "bad.json", "{oops")).status).toBe("MALFORMED");
  });

  it("marks malformed evidence as SUPPLIED — absence is the only unsupplied state", () => {
    const dir = tempDir();
    // This is the whole point: a corrupt file is evidence that someone tried to
    // supply something, and it must fail the build rather than block it.
    expect(readEvidenceSource(file(dir, "bad.json", "{oops")).supplied).toBe(true);
    expect(readEvidenceSource(join(dir, "absent.json")).supplied).toBe(false);
  });

  it("accepts a UTF-8 BOM — several Windows editors write one and it is not a malformation", () => {
    const dir = tempDir();
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":1}', "utf8")]);
    const source = readEvidenceSource(file(dir, "bom.json", withBom));
    expect(source.status).toBe("VALID");
    expect(source.document).toEqual({ a: 1 });
  });

  it("NEVER forwards the JSON.parse message, which echoes file bytes", () => {
    const dir = tempDir();
    // V8 quotes the document in SyntaxError.message. If any of these strings can
    // reach the output, an attacker who can write the evidence file chooses what
    // the release log says.
    const payloads = [
      "not json BEGIN_ATTACKER_TOKEN more text",
      // Assembled rather than written literally: the point is that a
      // secret-SHAPED token in an evidence file never reaches the log, and a
      // literal one here would be flagged by the repository's own secret
      // scanners for no reason.
      `NaN /* ${"sk"}_${"live"}_deadbeefdeadbeef */`,
      "x at position 4242",
      '{"a": <script>alert(1)</script>}',
      String.fromCharCode(0, 1) + " binary-ish",
    ];
    for (const payload of payloads) {
      const source = readEvidenceSource(file(dir, "evil.json", payload));
      expect(source.status).toBe("MALFORMED");
      const rendered = [
        source.classification,
        malformedReason("EXTERNAL_ATTESTATIONS", source.classification!),
        malformedGateError("SOME_GATE", "EXTERNAL_ATTESTATIONS", source),
        JSON.stringify(source),
      ].join("\n");
      expect(rendered).not.toContain("BEGIN_ATTACKER_TOKEN");
      expect(rendered).not.toContain("sk_live_");
      expect(rendered).not.toContain("4242");
      expect(rendered).not.toContain("<script>");
      expect(rendered).not.toContain("position");
      // The document body is never retained either.
      expect(source.document).toBeNull();
      expect(source.text).toBeNull();
    }
  });

  it("emits only the closed classification vocabulary", () => {
    const dir = tempDir();
    const cases: (string | Buffer)[] = ["", "   \n  ", "{oops", "null", "42", '"a string"', "[1,2,3]", "true"];
    for (const body of cases) {
      const source = readEvidenceSource(file(dir, "c.json", body));
      expect(source.status).toBe("MALFORMED");
      expect(MALFORMED_CLASSIFICATIONS).toContain(source.classification);
    }
  });

  it("rejects an array and a bare scalar — evidence is a JSON OBJECT", () => {
    const dir = tempDir();
    expect(readEvidenceSource(file(dir, "arr.json", "[]")).classification).toBe("NOT_A_JSON_OBJECT");
    expect(readEvidenceSource(file(dir, "num.json", "42")).classification).toBe("NOT_A_JSON_OBJECT");
    expect(readEvidenceSource(file(dir, "null.json", "null")).classification).toBe("NOT_A_JSON_OBJECT");
  });

  it("rejects a directory supplied where a file belongs, without throwing EISDIR", () => {
    const dir = tempDir();
    const asDir = join(dir, "evidence.json");
    mkdirSync(asDir);
    // Before the fix this reached readFileSync and terminated the process.
    expect(() => readEvidenceSource(asDir)).not.toThrow();
    expect(readEvidenceSource(asDir).classification).toBe("PATH_IS_A_DIRECTORY");
    expect(readEvidenceSource(asDir).supplied).toBe(true);
    expect(() => readTextSource(asDir)).not.toThrow();
    expect(readTextSource(asDir).classification).toBe("PATH_IS_A_DIRECTORY");
  });

  it("rejects binary content that is not the sanitized text document it claims to be", () => {
    const dir = tempDir();
    const utf16 = Buffer.from('{"a":1}', "utf16le");
    expect(readEvidenceSource(file(dir, "u16.json", utf16)).classification).toBe("NOT_UTF8_TEXT");
  });

  it("rejects oversized evidence before reading it into memory", () => {
    const dir = tempDir();
    const huge = Buffer.alloc(MAX_EVIDENCE_BYTES + 1, 0x61);
    const source = readEvidenceSource(file(dir, "huge.json", huge));
    expect(source.status).toBe("MALFORMED");
    expect(source.classification).toBe("FILE_TOO_LARGE");
    expect(source.byteLength).toBe(MAX_EVIDENCE_BYTES + 1);
  });

  it("rejects a well-formed object whose top-level shape is wrong for its document", () => {
    const dir = tempDir();
    const shape = (d: any) => Array.isArray(d.findings);
    expect(readEvidenceSource(file(dir, "s.json", '{"findings":"x"}'), { shape }).classification).toBe("MALFORMED_DOCUMENT_SHAPE");
    expect(readEvidenceSource(file(dir, "s2.json", '{"findings":[]}'), { shape }).status).toBe("VALID");
  });

  it("an unreadable file is malformed, not absent", () => {
    const dir = tempDir();
    const path = file(dir, "locked.json", '{"a":1}');
    try {
      chmodSync(path, 0o000);
    } catch {
      return; // permission model unavailable; the directory case above still covers it
    }
    const source = readEvidenceSource(path);
    // Windows and root ignore the mode bits; either it reads cleanly or it is
    // malformed — what must never happen is "ABSENT", which would silently
    // downgrade a real file to a pending decision.
    expect(source.status === "VALID" || source.classification === "UNREADABLE_PATH").toBe(true);
    expect(source.status).not.toBe("ABSENT");
    try {
      chmodSync(path, 0o600);
    } catch {
      /* best effort */
    }
  });
});

// ── B. Evidence-root lifecycle ───────────────────────────────────────────────

describe("B. the evidence root has exactly two modes", () => {
  const repoRoot = join(__dirname, "..", "..");

  it("defaults to CONTRACT_TEST when no root is configured", () => {
    for (const env of [envWithout(), envWith(""), envWith("   ")]) {
      const r = resolveEvidenceRoot({ repoRoot, env });
      expect(r.mode).toBe("CONTRACT_TEST");
      expect(r.errors).toEqual([]);
    }
  });

  it("requires the owner root to be explicit, absolute and traversal-free", () => {
    const relative = resolveEvidenceRoot({ repoRoot, env: envWith("evidence") });
    expect(relative.mode).toBe("OWNER_CLOSURE");
    expect(relative.root).toBeNull();
    expect(relative.errors.join(" ")).toMatch(/absolute/);

    // Built by concatenation, not join(): join() would normalise the `..` away
    // and the test would stop testing traversal at all.
    const traversal = resolveEvidenceRoot({ repoRoot, env: envWith(`${tmpdir()}${sep}..${sep}evidence`) });
    expect(traversal.root).toBeNull();
    expect(traversal.errors.join(" ")).toMatch(/'\.\.' path segment/);
  });

  it("never silently falls back to CONTRACT_TEST when the owner asked for OWNER_CLOSURE", () => {
    // A silent fallback would report "no evidence" for evidence the owner
    // believes they supplied — the same class of lie this phase removes.
    const missing = resolveEvidenceRoot({ repoRoot, env: envWith(join(tmpdir(), "definitely-not-here-p100")) });
    expect(missing.mode).toBe("OWNER_CLOSURE");
    expect(missing.errors.length).toBeGreaterThan(0);
  });

  it("refuses a root that is a file, and a root inside the repository working tree", () => {
    const dir = tempDir();
    const asFile = file(dir, "root.txt", "x");
    expect(resolveEvidenceRoot({ repoRoot, env: envWith(asFile) }).errors.join(" ")).toMatch(/directory/);

    // Evidence in the tree is one `git add` away from being published.
    const inside = join(repoRoot, "scripts");
    const r = resolveEvidenceRoot({ repoRoot, env: envWith(inside) });
    expect(r.root).toBeNull();
    expect(r.errors.join(" ")).toMatch(/outside the repository/);
  });

  it("accepts a real owner root OUTSIDE the repository", () => {
    const dir = tempDir();
    const r = resolveEvidenceRoot({ repoRoot, env: envWith(dir) });
    expect(r.mode).toBe("OWNER_CLOSURE");
    expect(r.errors).toEqual([]);
    expect(r.root).toBeTruthy();
  });

  it("rejects a symlink that escapes the evidence root, checked AFTER realpath", () => {
    const root = tempDir();
    const outside = tempDir();
    const secret = file(outside, "elsewhere.json", '{"attestations":[]}');

    mkdirSync(join(root, "docs", "security"), { recursive: true });
    const linkPath = join(root, "docs", "security", "phase99-external-attestations.json");
    try {
      symlinkSync(secret, linkPath, "file");
    } catch {
      // Unprivileged Windows without Developer Mode cannot create symlinks. The
      // containment logic itself is platform-independent and is asserted below.
      return;
    }

    const resolved = resolveEvidenceRoot({ repoRoot, env: envWith(root) });
    const reader = createEvidenceReader({ repoRoot, mode: resolved.mode, root: resolved.root });
    const source = reader.readDocument("EXTERNAL_ATTESTATIONS");
    // Lexically the path is inside the root; only realpath reveals the escape.
    expect(source.status).toBe("MALFORMED");
    expect(source.classification).toBe("PATH_ESCAPES_EVIDENCE_ROOT");
  });

  it("rejects a traversing relative path inside a registered document path", () => {
    const root = tempDir();
    const resolved = resolveEvidenceRoot({ repoRoot, env: envWith(root) });
    const reader = createEvidenceReader({ repoRoot, mode: resolved.mode, root: resolved.root });
    expect(reader.evidencePath("../../escape.json").escaped).toBe(true);
    expect(reader.evidencePath("docs/release/phase100-ga-authorization.json").escaped).toBe(false);
  });

  it("reads repository-owned inputs from the repository even in OWNER_CLOSURE mode", () => {
    // The scope documents and the finding register are what evidence is judged
    // AGAINST. Letting the owner supply them would let them choose the scope
    // their own attestation is measured against, which is not a gate at all.
    const root = tempDir();
    const reader = createEvidenceReader({ repoRoot, mode: "OWNER_CLOSURE", root });
    const source = reader.readRepositorySource("docs/security/phase99-findings.json");
    expect(source.status).toBe("VALID");
    expect(Array.isArray((source.document as any).findings)).toBe(true);
  });

  it("keeps contract-test CI blocked: no evidence document is committed", () => {
    expect(evidenceRepositoryViolations({ repoRoot })).toEqual([]);
    const reader = createEvidenceReader({ repoRoot, mode: "CONTRACT_TEST", root: repoRoot });
    for (const documentId of Object.keys(EVIDENCE_DOCUMENTS)) {
      expect(reader.readDocument(documentId).status, documentId).toBe("ABSENT");
    }
  });

  it("supplying real evidence requires no source or test edit — only the env var", () => {
    const root = tempDir();
    mkdirSync(join(root, "docs", "release"), { recursive: true });
    writeFileSync(join(root, "docs", "release", "phase100-ga-authorization.json"), '{"authorization":{"decision":"AUTHORIZED"}}');
    const resolved = resolveEvidenceRoot({ repoRoot, env: envWith(root) });
    const reader = createEvidenceReader({ repoRoot, mode: resolved.mode, root: resolved.root });
    const source = reader.readDocument("GA_AUTHORIZATION");
    expect(source.status).toBe("VALID");
    // ...and the repository itself is still clean.
    expect(evidenceRepositoryViolations({ repoRoot })).toEqual([]);
  });
});

// ── C. Crash paths ───────────────────────────────────────────────────────────

describe("C. a malformed document produces a named failure, never a crash", () => {
  const io = (docs: Record<string, any>) => ({
    readText: (p: string) => (typeof docs[p] === "string" ? docs[p] : null),
    readJson: (p: string) => docs[p] ?? null,
    expectedCommitSha: "a".repeat(40),
    nowMs: Date.parse("2026-01-01T00:00:00Z"),
  });

  it('{"attestations":{}} does not throw a TypeError', () => {
    // `?? []` only fires for null/undefined, so an object reached `.find()`.
    const docs = { "docs/security/phase99-external-attestations.json": { attestations: {} } };
    expect(() => evaluatePhase99Closure(io(docs))).not.toThrow();
    const result = evaluatePhase99Closure(io(docs));
    expect(result.attestationsMalformed).toBe(true);
    for (const gate of ["INDEPENDENT_PENETRATION_TEST", "EXTERNAL_APPLICATION_SECURITY_REVIEW", "EXTERNAL_API_SECURITY_REVIEW"]) {
      expect(gatesOf(result)[gate], gate).toBe("FAIL");
      expect((result.reasons as Record<string, string>)[gate]).toMatch(/MALFORMED_EXTERNAL_ATTESTATIONS/);
    }
  });

  it("every non-array attestations value fails safely", () => {
    for (const value of [{}, "x", 42, true, { 0: "a", length: 1 }]) {
      const docs = { "docs/security/phase99-external-attestations.json": { attestations: value } };
      expect(() => evaluatePhase99Closure(io(docs)), JSON.stringify(value)).not.toThrow();
      expect(gatesOf(evaluatePhase99Closure(io(docs))).INDEPENDENT_PENETRATION_TEST).toBe("FAIL");
    }
  });

  it("a non-object acceptances value fails the finding register safely", () => {
    for (const value of ["x", 42, []]) {
      const docs = {
        "docs/security/phase99-findings.json": { findings: [] },
        "docs/security/phase99-risk-acceptances.json": { acceptances: value },
      };
      expect(() => evaluatePhase99Closure(io(docs))).not.toThrow();
      expect(gatesOf(evaluatePhase99Closure(io(docs))).FINDING_REGISTER, JSON.stringify(value)).toBe("FAIL");
    }
  });

  it("an evidence path that is a directory never terminates the evaluator", () => {
    const root = tempDir();
    // Create every registered evidence path as a DIRECTORY.
    for (const spec of Object.values(EVIDENCE_DOCUMENTS)) {
      mkdirSync(join(root, ...spec.path.split("/")), { recursive: true });
    }
    const reader = createEvidenceReader({ repoRoot: join(__dirname, "..", ".."), mode: "OWNER_CLOSURE", root });
    for (const documentId of Object.keys(EVIDENCE_DOCUMENTS)) {
      expect(() => reader.readDocument(documentId), documentId).not.toThrow();
      const source = reader.readDocument(documentId);
      expect(source.status).toBe("MALFORMED");
      expect(source.classification).toBe("PATH_IS_A_DIRECTORY");
    }
  });
});

// ── D. The finding register must never fail open ─────────────────────────────

describe("D. a non-array finding register is a FAILURE, not an empty register", () => {
  const MUTATIONS: [string, any][] = [
    ["string", "x"],
    ["object", {}],
    ["populated object", { P99INT001: { severity: "CRITICAL" } }],
    ["number", 42],
    ["zero", 0],
    ["null", null],
    ["missing", undefined],
    ["boolean", true],
  ];

  it("evaluateRegistry reports UNKNOWN counters, never zeroes", () => {
    for (const [label, findings] of MUTATIONS) {
      const result = evaluateRegistry(findings as any, {}, { nowMs: Date.now() });
      expect(result.ok, label).toBe(false);
      expect(result.errors, label).toContain(FINDING_REGISTER_NOT_AN_ARRAY);
      // The dangerous outcome is a ZERO here — zero reads as "clean".
      expect(result.summary.criticalOpen, label).toBeNull();
      expect(result.summary.highOpen, label).toBeNull();
      expect(result.summary.releaseBlockers, label).toBeNull();
      expect(result.summary.registerReadable, label).toBe(false);
    }
  });

  it("all four repository-owned gates FAIL for every non-array findings value", () => {
    const GATES = ["FINDING_REGISTER", "CRITICAL_FINDINGS_ZERO", "HIGH_FINDINGS_RESOLVED"];
    for (const [label, findings] of MUTATIONS) {
      const result = evaluatePhase99Closure({
        readText: () => null,
        readJson: (p: string) => (p === "docs/security/phase99-findings.json" ? { findings } : null),
        expectedCommitSha: "a".repeat(40),
        nowMs: Date.now(),
      });
      for (const gate of GATES) expect(gatesOf(result)[gate], `${label}/${gate}`).toBe("FAIL");
      // The Phase 100 OPEN_RELEASE_BLOCKING_FINDINGS_ZERO gate derives from this
      // counter; null makes it FAIL rather than PASS-on-zero.
      expect(result.registrySummary?.releaseBlockers ?? null, label).toBeNull();
      expect(result.registerReadable, label).toBe(false);
    }
  });

  it("a genuinely empty register still passes — the fix must not over-block", () => {
    const result = evaluateRegistry([], {}, { nowMs: Date.now() });
    expect(result.ok).toBe(true);
    expect(result.summary.criticalOpen).toBe(0);
    expect(result.summary.registerReadable).toBe(true);
  });

  it("the register's own shape guard rejects the same mutations at read time", () => {
    const dir = tempDir();
    const shape = (d: any) => Array.isArray(d.findings);
    for (const body of ['{"findings":"x"}', '{"findings":{}}', '{"findings":42}', '{"findings":null}', "{}"]) {
      expect(readEvidenceSource(file(dir, "f.json", body), { shape }).status, body).toBe("MALFORMED");
    }
  });
});

// ── E. Unique attribution ────────────────────────────────────────────────────

describe("E. every actionable blocker has exactly one identity", () => {
  const pilotLedger = () => [
    { name: "PILOT_CUSTOMER_SELECTED", group: "PILOT_ACCEPTANCE", state: "BLOCKED" },
    { name: "PILOT_UAT", group: "PILOT_ACCEPTANCE", state: "BLOCKED" },
    { name: "PILOT_WORKFLOW_VALIDATION", group: "PILOT_ACCEPTANCE", state: "BLOCKED" },
    { name: "PILOT_INCIDENT_SIMULATION", group: "PILOT_ACCEPTANCE", state: "BLOCKED" },
    { name: "PILOT_ONBOARDING", group: "PILOT_ACCEPTANCE", state: "BLOCKED" },
    { name: "PILOT_SUPPORT_PROCESS", group: "PILOT_ACCEPTANCE", state: "BLOCKED" },
  ];
  const stateOf = (ledger: any[]) => (gate: string) => ledger.find((g) => g.name === gate)?.state ?? null;

  it("does not count an owner-blocked readiness group a second time", () => {
    const ledger = pilotLedger();
    const r = attributeInternalReadiness({
      readinessState: "BLOCKED_OWNER",
      blockedOn: Object.keys(OWNER_ATTRIBUTED_READINESS_GROUPS),
      gateStateOf: stateOf(ledger),
    });
    expect(r.state).toBe("PASS");
    expect(r.unattributed).toEqual([]);
    // The fact is not discarded — it is attributed to the gates that own it.
    expect(Object.keys(r.attributedTo)).toHaveLength(5);
    expect(r.reason).toMatch(/counted once/);
  });

  it("keeps readiness BLOCKED when a blocked group is not attributable", () => {
    const r = attributeInternalReadiness({
      readinessState: "BLOCKED_OWNER",
      blockedOn: ["SOME_NEW_ENGINEERING_GROUP"],
      gateStateOf: stateOf(pilotLedger()),
    });
    expect(r.state).toBe("BLOCKED");
    expect(r.unattributed).toEqual(["SOME_NEW_ENGINEERING_GROUP"]);
    expect(r.errors.join(" ")).toMatch(/not attributable/);
  });

  it("keeps readiness BLOCKED when the gate that should inherit the fact has gone", () => {
    // If the covering gate disappears or turns PASS, the blocker is counted
    // NOWHERE — which is worse than counting it twice.
    const empty = attributeInternalReadiness({
      readinessState: "BLOCKED_OWNER",
      blockedOn: ["PILOT_UAT_READINESS"],
      gateStateOf: () => null,
    });
    expect(empty.state).toBe("BLOCKED");

    const allPass = attributeInternalReadiness({
      readinessState: "BLOCKED_OWNER",
      blockedOn: ["PILOT_UAT_READINESS"],
      gateStateOf: () => "PASS",
    });
    expect(allPass.state).toBe("BLOCKED");
    expect(allPass.errors.join(" ")).toMatch(/all of them are PASS/);
  });

  it("an unrunnable or failing readiness evaluator is a FAIL, never an attributed PASS", () => {
    expect(attributeInternalReadiness({ readinessState: "UNAVAILABLE", gateStateOf: () => null }).state).toBe("FAIL");
    expect(attributeInternalReadiness({ readinessState: "FAIL", gateStateOf: () => null }).state).toBe("FAIL");
  });

  it("detects a duplicated gate identity and a double-counted Phase 99 aggregate", () => {
    const dup = [
      { name: "PILOT_UAT", group: "PILOT_ACCEPTANCE", state: "BLOCKED" },
      { name: "PILOT_UAT", group: "PILOT_ACCEPTANCE", state: "BLOCKED" },
    ];
    expect(attributionViolations(dup, INFORMATIONAL_GROUP).join(" ")).toMatch(/DUPLICATE_GATE_IDENTITY/);

    for (const name of PHASE99_AGGREGATE_GATES) {
      const counted = [{ name, group: "EXTERNAL_SECURITY", state: "FAIL" }];
      expect(attributionViolations(counted, INFORMATIONAL_GROUP).join(" ")).toMatch(/DOUBLE_COUNTED_AGGREGATE/);
      const informational = [{ name, group: INFORMATIONAL_GROUP, state: "FAIL" }];
      expect(attributionViolations(informational, INFORMATIONAL_GROUP)).toEqual([]);
    }
  });

  it("flags an attributed blocker that is no longer counted anywhere", () => {
    const ledger = [{ name: "PILOT_UAT", group: "PILOT_ACCEPTANCE", state: "PASS" }];
    const v = attributionViolations(ledger, INFORMATIONAL_GROUP, { attributedTo: { PILOT_UAT_READINESS: ["PILOT_UAT"] } });
    expect(v.join(" ")).toMatch(/LOST_BLOCKER/);
  });

  it("removing exactly one absence reduces the blocker count by exactly one", () => {
    // Derived from the REAL published ledger, so the property is proven about
    // the shipped verdict rather than about a hand-built fixture.
    const summary = require(join(__dirname, "..", "..", "phase100-ga-closure.json"));
    const ledger = Object.entries(summary.gates as Record<string, string>).map(([name, state]) => ({
      name,
      group: summary.releaseBlockerMatrix.find((b: any) => b.gate === name)?.group ?? groupOf(name, summary),
      state,
      reason: null,
      errors: [],
      evidenceSupplied: false,
    }));

    const before = assembleVerdict(ledger).releaseBlockerCount;
    expect(before).toBeGreaterThan(0);

    for (const blocker of assembleVerdict(ledger).blockers) {
      const mutated = ledger.map((g) => (g.name === blocker.name ? { ...g, state: "PASS" } : g));
      const after = assembleVerdict(mutated).releaseBlockerCount;
      expect(after, `${blocker.name} must account for exactly one blocker`).toBe(before - 1);
    }
  });

  it("the published ledger contains no duplicate identity", () => {
    const summary = require(join(__dirname, "..", "..", "phase100-ga-closure.json"));
    const names = Object.keys(summary.gates);
    expect(new Set(names).size).toBe(names.length);
    expect(summary.gates.PHASE100_READINESS_ATTRIBUTION).toBe("PASS");
  });
});

/** The group a gate belongs to, for gates that are not in the blocker matrix. */
function groupOf(name: string, summary: any): string {
  if (summary.groups && name in summary.groups) return name;
  return name === "RELEASE_BLOCKERS_ZERO" ? INFORMATIONAL_GROUP : "IMPLEMENTATION";
}

// ── F. Commercial coherence ──────────────────────────────────────────────────

describe("F. a paid commercial GA must be internally coherent", () => {
  const coherent = () => ({
    pricing: { currencies: ["EUR"] },
    taxCurrencyRefund: { settlementCurrencies: ["EUR"] },
    paymentProvider: { provider: "STRIPE", mode: "LIVE", webhookEndpointConfigured: true, webhookSigningSecretConfigured: true },
    productionBillingActivation: { activationDecision: "ACTIVATED" },
  });

  it("accepts the one coherent commercial GA combination", () => {
    expect(commercialCoherenceViolations(coherent())).toEqual([]);
  });

  it("treats an absent document as nothing to contradict, not as a second blocker", () => {
    // The absence is already counted once, by the four commercial gates.
    expect(commercialCoherenceViolations(null)).toEqual([]);
    expect(commercialCoherenceViolations(undefined)).toEqual([]);
    expect(commercialCoherenceViolations({})).toEqual([]);
  });

  it("rejects billing ACTIVATED with no payment provider", () => {
    const doc = coherent();
    doc.paymentProvider.provider = "NONE";
    expect(commercialCoherenceViolations(doc).join(" ")).toMatch(/ACTIVATED while the payment provider is 'NONE'/);
  });

  it("rejects billing ACTIVATED in TEST mode", () => {
    const doc = coherent();
    doc.paymentProvider.mode = "TEST";
    expect(commercialCoherenceViolations(doc).join(" ")).toMatch(/test-mode configuration cannot carry live revenue/);
  });

  it("rejects a LIVE provider beside DEFERRED billing", () => {
    const doc = coherent();
    doc.productionBillingActivation.activationDecision = "DEFERRED";
    expect(commercialCoherenceViolations(doc).join(" ")).toMatch(/billing switched off/);
  });

  it("rejects ACTIVATED billing with unconfigured webhooks", () => {
    const noEndpoint = coherent();
    noEndpoint.paymentProvider.webhookEndpointConfigured = false;
    expect(commercialCoherenceViolations(noEndpoint).join(" ")).toMatch(/no configured webhook endpoint/);

    const noSecret = coherent();
    noSecret.paymentProvider.webhookSigningSecretConfigured = false;
    expect(commercialCoherenceViolations(noSecret).join(" ")).toMatch(/webhook signing secret/);
  });

  it("rejects a plan priced in a currency that is never settled", () => {
    const doc = coherent();
    doc.pricing.currencies = ["EUR", "IRR"];
    expect(commercialCoherenceViolations(doc).join(" ")).toMatch(/priced in IRR but it is not a settlement currency/);
  });

  it("reports every contradiction, not just the first", () => {
    const doc = coherent();
    doc.paymentProvider.provider = "NONE";
    doc.paymentProvider.mode = "TEST";
    doc.paymentProvider.webhookSigningSecretConfigured = false;
    expect(commercialCoherenceViolations(doc).length).toBeGreaterThanOrEqual(3);
  });
});

// ── G. Residual acceptance ───────────────────────────────────────────────────

describe("G. a residual acceptance must be a real, temporary, owned decision", () => {
  const NOW = Date.parse("2026-08-10T00:00:00Z");
  const valid = () => ({
    findingId: "P99-INT-042",
    severity: "MEDIUM",
    decision: "ACCEPT",
    ownerAuthorityRole: "Head of Engineering",
    reason: "The affected surface is reachable only by an authenticated tenant administrator.",
    compensatingControls: ["audit logging", "rate limiting"],
    acceptedAt: "2026-08-01",
    expiresAt: "2026-11-01",
    remediationOwnerRole: "Platform Engineering Lead",
    remediationPlanReference: "docs/security/remediation/P99-INT-042.md",
    targetRemediationDate: "2026-10-01",
    evidenceReference: "private://owner-channel/P99-INT-042",
    evidenceSha256: "b".repeat(64),
  });

  it("accepts a complete, well-timed acceptance", () => {
    const r = validateResidualRiskAcceptance(valid(), { nowMs: NOW, expectedFindingId: "P99-INT-042" });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("requires every element of a temporary acceptance", () => {
    for (const key of [
      "findingId",
      "severity",
      "reason",
      "compensatingControls",
      "ownerAuthorityRole",
      "remediationOwnerRole",
      "remediationPlanReference",
      "targetRemediationDate",
      "expiresAt",
      "evidenceSha256",
    ]) {
      const a: any = valid();
      delete a[key];
      expect(validateResidualRiskAcceptance(a, { nowMs: NOW }).ok, key).toBe(false);
    }
  });

  it("rejects an agent or automation as the owner or remediation authority", () => {
    for (const key of ["ownerAuthorityRole", "remediationOwnerRole"]) {
      for (const role of ["agent", "automation", "claude", "system", "AI"]) {
        const a: any = valid();
        a[key] = role;
        expect(validateResidualRiskAcceptance(a, { nowMs: NOW }).ok, `${key}=${role}`).toBe(false);
      }
    }
  });

  it("rejects an expired acceptance", () => {
    const a = { ...valid(), expiresAt: "2026-01-01" };
    expect(validateResidualRiskAcceptance(a, { nowMs: NOW }).errors.join(" ")).toMatch(/EXPIRED/);
  });

  it("rejects invalid remediation timing", () => {
    const afterExpiry = { ...valid(), targetRemediationDate: "2026-12-01" };
    expect(validateResidualRiskAcceptance(afterExpiry, { nowMs: NOW }).errors.join(" ")).toMatch(
      /INVALID_REMEDIATION_TIMING.*after expiresAt/,
    );

    const beforeAcceptance = { ...valid(), targetRemediationDate: "2026-07-01" };
    expect(validateResidualRiskAcceptance(beforeAcceptance, { nowMs: NOW }).errors.join(" ")).toMatch(/precedes acceptedAt/);

    const overdue = { ...valid(), acceptedAt: "2026-01-01", targetRemediationDate: "2026-02-01" };
    expect(validateResidualRiskAcceptance(overdue, { nowMs: NOW }).errors.join(" ")).toMatch(/overdue, not planned/);
  });

  it("rejects a blanket acceptance", () => {
    const cases: any[] = [
      { ...valid(), appliesToAll: true },
      { ...valid(), blanket: true },
      { ...valid(), findingId: "P99-INT-*" },
      { ...valid(), findingId: "ALL" },
      { ...valid(), findingIds: ["P99-INT-042", "P99-INT-043"] },
    ];
    for (const a of cases) {
      const r = validateResidualRiskAcceptance(a, { nowMs: NOW });
      expect(r.ok, JSON.stringify(a.findingId)).toBe(false);
      expect(r.errors.join(" ")).toMatch(/BLANKET_ACCEPTANCE|findingId invalid/);
    }
  });

  it("rejects placeholder content and an acceptance for the wrong finding", () => {
    const placeholder = { ...valid(), reason: "TBD — to be filled in by the owner later" };
    expect(validateResidualRiskAcceptance(placeholder, { nowMs: NOW }).ok).toBe(false);

    const wrongFinding = validateResidualRiskAcceptance(valid(), { nowMs: NOW, expectedFindingId: "P99-INT-999" });
    expect(wrongFinding.errors.join(" ")).toMatch(/EVIDENCE_TYPE_MISMATCH/);
  });

  it("refuses to cover a HIGH or CRITICAL finding — those have their own contract", () => {
    for (const severity of ["HIGH", "CRITICAL"]) {
      const a = { ...valid(), severity };
      expect(validateResidualRiskAcceptance(a, { nowMs: NOW }).ok, severity).toBe(false);
    }
  });

  it("an example fixture can never accept residual risk", () => {
    const a = { ...valid(), EXAMPLE_ONLY: true };
    const r = validateResidualRiskAcceptance(a, { nowMs: NOW });
    expect(r.synthetic).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("the five real unresolved MEDIUM findings remain unaccepted", () => {
    // This phase must not create acceptances. Today the acceptances file does
    // not exist at all, which is the strongest form of "unaccepted"; if an owner
    // later creates one, this still holds them to an EMPTY residual set until
    // they deliberately fill it in. Either way an agent must never write one.
    const repoRoot = join(__dirname, "..", "..");
    const path = join(repoRoot, "docs", "security", "phase99-risk-acceptances.json");
    const source = readEvidenceSource(path);
    expect(["ABSENT", "VALID"]).toContain(source.status);
    const residual = source.status === "VALID" ? ((source.document as any).residualAcceptances ?? {}) : {};
    expect(residual).toEqual({});

    // ...and the five findings they would have to cover are genuinely open.
    const registry = require(join(repoRoot, "docs", "security", "phase99-findings.json"));
    const RESOLVED = ["VERIFIED_FIXED", "RISK_ACCEPTED", "NOT_APPLICABLE"];
    const unresolved = registry.findings.filter(
      (f: any) => ["MEDIUM", "LOW", "INFO"].includes(f.severity) && !RESOLVED.includes(f.status),
    );
    expect(unresolved).toHaveLength(5);
    expect(unresolved.every((f: any) => f.severity === "MEDIUM")).toBe(true);
  });
});
