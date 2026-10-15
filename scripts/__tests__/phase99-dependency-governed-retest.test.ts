/**
 * PHASE 99 — ADDITIVE governed-dependency retest evidence.
 *
 * The historical Phase 99 retest (`scripts/__tests__/phase99-dependency-remediation.test.ts`)
 * and the finding register that pins its sha256 (`docs/security/phase99-findings.json`,
 * P99-DEP-001..007/013/014) are HISTORICAL records and are deliberately left
 * byte-identical. They prove what Phase 99 remediated; they do not describe the
 * governed state that followed.
 *
 * This file verifies the additive record that does:
 * `docs/security/phase99-dependency-governed-retest.json`. That record states, and
 * this test proves against the repository and the LIVE audit, that:
 *
 *   - the historical retest is untouched (its sha256 equals the recorded one, and
 *     equals the evidenceHash every pinning finding still carries),
 *   - the governed contract was recorded against a stated base commit,
 *   - production dependencies carry exactly 0 CRITICAL and 0 HIGH,
 *   - the full tree carries 0 CRITICAL,
 *   - exactly the recorded dev-only HIGH acceptances exist — the same set the
 *     exception manifest approves and the real gate accepts, matched by package,
 *     advisory id, dependency path, propagation chain and expiry,
 *   - and the remediation summary tells the truth: those HIGH findings are NOT
 *     fixed, only accepted temporarily until a stated date.
 *
 * Any mismatch, new HIGH, runtime HIGH, critical, expired exception or changed
 * dependency path fails closed. The live section runs `npm audit` through the real
 * gate (network + installed tree); an unreadable audit FAILS, it is never skipped.
 * The mutation sections are pure and deterministic.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  MANIFEST_RELATIVE_PATH,
  extractAuditRows,
  indexLockfile,
  evaluateAuditGate,
  runAudit,
} from "../ci/dependency-audit-gate.mjs";

const ROOT = resolve(__dirname, "..", "..");
const EVIDENCE_PATH = "docs/security/phase99-dependency-governed-retest.json";
const REGISTER_PATH = "docs/security/phase99-findings.json";
const SELF_PATH = "scripts/__tests__/phase99-dependency-governed-retest.test.ts";

const readText = (p: string): string => readFileSync(resolve(ROOT, p), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = (p: string): any => JSON.parse(readText(p));
/** Same normalisation as scripts/ci/phase99-security-readiness-eval.mjs. */
const sha256Normalised = (body: string): string => createHash("sha256").update(body.replace(/\r\n/g, "\n")).digest("hex");

const sorted = (a: readonly string[]): string[] => [...a].map(String).sort();
const sameList = (a: readonly string[], b: readonly string[]): boolean => {
  const sa = sorted(a);
  const sb = sorted(b);
  return sa.length === sb.length && sa.every((x, i) => x === sb[i]);
};

/* ───────────────────────────── the pure verifier ───────────────────────────── */

interface AcceptedEntry {
  package: string;
  advisoryIds: string[];
  paths: string[];
  inheritedFrom: string[];
  devOnly?: boolean;
  expires: string;
}

interface GovernedEvidence {
  schemaVersion: number;
  baseCommit: string;
  historicalRetest: { path: string; sha256: string; registerEvidenceHash: string; findings: string[] };
  governedRetest: { path: string; sha256: string };
  productionAudit: { critical: number; high: number };
  fullTreeAudit: { critical: number };
  acceptedDevOnlyHighCount: number;
  acceptedDevOnlyHigh: AcceptedEntry[];
  expires: string;
  notFixed: boolean;
  remediationSummary: string;
}

interface VerifyInputs {
  evidence: GovernedEvidence;
  registerFindings: Array<{ findingId: string; retestReference?: string | null; evidenceHash?: string | null }>;
  manifestExceptions: AcceptedEntry[];
  historicalRetestSha: string;
  governedRetestSha: string;
  verdict: {
    verdict: string;
    failures?: Array<{ code: string }>;
    blocks?: Array<{ code: string }>;
    accepted: AcceptedEntry[];
    summary: { production: { critical: number; high: number }; full: { critical: number } } | null;
  };
  devByPath: (path: string) => boolean | undefined;
  now: string;
}

const keyOf = (e: { package: string }) => String(e.package).toLowerCase();
const sameEntry = (a: AcceptedEntry, b: AcceptedEntry) =>
  keyOf(a) === keyOf(b) &&
  sameList(a.advisoryIds, b.advisoryIds) &&
  sameList(a.paths, b.paths) &&
  sameList(a.inheritedFrom, b.inheritedFrom) &&
  String(a.expires) === String(b.expires);

/** Every way the additive evidence can disagree with reality. Empty means it holds. */
function verifyGovernedEvidence(i: VerifyInputs): string[] {
  const p: string[] = [];
  const ev = i.evidence;

  if (ev.schemaVersion !== 1) p.push("SCHEMA_VERSION");
  if (!/^[0-9a-f]{40}$/.test(String(ev.baseCommit))) p.push("BASE_COMMIT_INVALID");

  // The historical record must be untouched.
  if (i.historicalRetestSha !== ev.historicalRetest.sha256) p.push("HISTORICAL_RETEST_CHANGED");
  if (ev.historicalRetest.registerEvidenceHash !== ev.historicalRetest.sha256) p.push("HISTORICAL_HASH_INCONSISTENT");
  const pinning = i.registerFindings.filter((f) => f.retestReference === ev.historicalRetest.path);
  if (!sameList(pinning.map((f) => f.findingId), ev.historicalRetest.findings)) p.push("REGISTER_FINDINGS_MISMATCH");
  for (const f of pinning) {
    if (f.evidenceHash !== ev.historicalRetest.registerEvidenceHash) p.push(`REGISTER_HASH_MISMATCH:${f.findingId}`);
  }

  // The additive retest itself must be the one this record was written for.
  if (i.governedRetestSha !== ev.governedRetest.sha256) p.push("GOVERNED_RETEST_CHANGED");

  // The real gate must agree, with no failure and no block.
  if (i.verdict.verdict !== "PASS") {
    const codes = [...(i.verdict.failures ?? []), ...(i.verdict.blocks ?? [])].map((x) => x.code);
    p.push(`GATE_NOT_PASS:${i.verdict.verdict}:${[...new Set(codes)].sort().join(",")}`);
  }
  const s = i.verdict.summary;
  if (!s) {
    p.push("GATE_SUMMARY_MISSING");
  } else {
    if (s.production.critical !== 0 || s.production.high !== 0) p.push("PRODUCTION_NOT_CLEAN");
    if (s.production.critical !== ev.productionAudit.critical || s.production.high !== ev.productionAudit.high) {
      p.push("PRODUCTION_AUDIT_MISMATCH");
    }
    if (s.full.critical !== 0 || ev.fullTreeAudit.critical !== 0) p.push("FULL_TREE_CRITICAL");
  }
  if (ev.productionAudit.critical !== 0 || ev.productionAudit.high !== 0) p.push("RECORDED_PRODUCTION_NOT_CLEAN");

  // Exactly the recorded acceptances — no more, no fewer, no drift.
  const rec = ev.acceptedDevOnlyHigh;
  if (rec.length !== ev.acceptedDevOnlyHighCount) p.push("RECORDED_COUNT_INCONSISTENT");
  if (i.verdict.accepted.length !== rec.length) p.push("ACCEPTED_COUNT_MISMATCH");
  if (i.manifestExceptions.length !== rec.length) p.push("MANIFEST_COUNT_MISMATCH");
  if (new Set(rec.map(keyOf)).size !== rec.length) p.push("RECORDED_DUPLICATE_PACKAGE");

  for (const r of rec) {
    const live = i.verdict.accepted.find((a) => keyOf(a) === keyOf(r));
    if (!live) p.push(`NOT_ACCEPTED_BY_GATE:${r.package}`);
    else if (!sameList(live.paths, r.paths)) p.push(`DEPENDENCY_PATH_CHANGED:${r.package}`);
    else if (!sameEntry(live, r)) p.push(`ACCEPTANCE_DRIFT:${r.package}`);

    const man = i.manifestExceptions.find((m) => keyOf(m) === keyOf(r));
    if (!man) p.push(`NOT_IN_MANIFEST:${r.package}`);
    else if (!sameEntry(man, r) || man.devOnly !== true) p.push(`MANIFEST_MISMATCH:${r.package}`);

    if (r.devOnly !== true) p.push(`NOT_DEV_ONLY:${r.package}`);
    for (const path of r.paths) {
      if (i.devByPath(path) !== true) p.push(`NOT_DEV_IN_LOCKFILE:${path}`);
    }
    if (String(r.expires) !== String(ev.expires)) p.push(`EXPIRY_MISMATCH:${r.package}`);
    if (String(i.now) > String(r.expires)) p.push(`EXCEPTION_EXPIRED:${r.package}`);
  }
  for (const a of i.verdict.accepted) {
    if (!rec.some((r) => keyOf(r) === keyOf(a))) p.push(`UNRECORDED_ACCEPTANCE:${a.package}`);
  }

  // The summary must not claim a fix that did not happen.
  const text = String(ev.remediationSummary);
  if (ev.notFixed !== true) p.push("NOT_FIXED_FLAG_MISSING");
  if (!/\bNOT fixed\b/.test(text)) p.push("SUMMARY_DOES_NOT_STATE_NOT_FIXED");
  if (!/temporar/i.test(text)) p.push("SUMMARY_DOES_NOT_STATE_TEMPORARY");
  if (!text.includes(String(ev.expires))) p.push("SUMMARY_DOES_NOT_STATE_EXPIRY");
  if (/\b(are|is|were|was|been)\s+(fixed|resolved|remediated)\b/i.test(text)) p.push("SUMMARY_CLAIMS_FIX");

  return p;
}

/* ─────────────────────────── committed inputs ─────────────────────────── */

const evidence = readJson(EVIDENCE_PATH) as GovernedEvidence;
const register = readJson(REGISTER_PATH) as { findings: VerifyInputs["registerFindings"] };
const manifest = readJson(MANIFEST_RELATIVE_PATH) as { exceptions: AcceptedEntry[] };
const lockJson = readJson("package-lock.json");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lockIndex = indexLockfile(lockJson) as any;
const historicalRetestSha = sha256Normalised(readText(evidence.historicalRetest.path));
const governedRetestSha = sha256Normalised(readText(SELF_PATH));
const devByPath = (path: string): boolean | undefined => lockIndex.nodes?.get(path)?.dev;

/* ──────────────── A. the committed record is internally sound ─────────────── */

describe("PHASE 99 governed retest — the additive record and the historical record", () => {
  it("leaves the historical retest and its register pins untouched", () => {
    expect(historicalRetestSha).toBe(evidence.historicalRetest.sha256);
    expect(evidence.historicalRetest.registerEvidenceHash).toBe(evidence.historicalRetest.sha256);
    const pinning = register.findings.filter((f) => f.retestReference === evidence.historicalRetest.path);
    expect(sorted(pinning.map((f) => f.findingId))).toEqual(sorted(evidence.historicalRetest.findings));
    for (const f of pinning) expect(f.evidenceHash, f.findingId).toBe(evidence.historicalRetest.sha256);
  });

  it("is the record written for this exact retest file", () => {
    expect(evidence.governedRetest.path).toBe(SELF_PATH);
    expect(governedRetestSha).toBe(evidence.governedRetest.sha256);
  });

  it("names a base commit, a clean production audit and a full tree with no critical", () => {
    expect(evidence.baseCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(evidence.productionAudit).toEqual({ critical: 0, high: 0 });
    expect(evidence.fullTreeAudit.critical).toBe(0);
  });

  it("records exactly the manifest's dev-only acceptances, one per package, with one shared expiry", () => {
    expect(evidence.acceptedDevOnlyHigh).toHaveLength(evidence.acceptedDevOnlyHighCount);
    expect(evidence.acceptedDevOnlyHigh).toHaveLength(manifest.exceptions.length);
    for (const r of evidence.acceptedDevOnlyHigh) {
      const m = manifest.exceptions.find((e) => keyOf(e) === keyOf(r));
      expect(m, `${r.package} is recorded but not in the manifest`).toBeDefined();
      expect(sameEntry(m!, r), `${r.package} differs from the manifest`).toBe(true);
      expect(r.devOnly).toBe(true);
      expect(r.expires).toBe(evidence.expires);
      for (const path of r.paths) expect(devByPath(path), `${path} is not dev:true in the lockfile`).toBe(true);
    }
  });

  it("says plainly that the accepted HIGH findings are NOT fixed, only accepted until the expiry", () => {
    expect(evidence.notFixed).toBe(true);
    expect(evidence.remediationSummary).toMatch(/\bNOT fixed\b/);
    expect(evidence.remediationSummary).toMatch(/temporar/i);
    expect(evidence.remediationSummary).toContain(evidence.expires);
    expect(evidence.remediationSummary).not.toMatch(/\b(are|is|were|was|been)\s+(fixed|resolved|remediated)\b/i);
  });
});

/* ─────────────── B. the record holds against the LIVE audit ─────────────── */

describe("PHASE 99 governed retest — the record holds against the live npm audit", () => {
  const NOW = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let full: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prod: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let verdict: any;

  beforeAll(() => {
    full = runAudit([]);
    prod = runAudit(["--omit=dev"]);
    verdict = evaluateAuditGate({ full, prod, manifest, lockfile: lockIndex, now: NOW });
  }, 180_000);

  it("observes a readable full and production audit (fail-closed, never skipped)", () => {
    expect(lockIndex.ok, (lockIndex.errors ?? []).join("; ")).toBe(true);
    expect(full.ok, (full.errors ?? []).join("; ")).toBe(true);
    expect(prod.ok, (prod.errors ?? []).join("; ")).toBe(true);
  });

  it("production carries 0 CRITICAL and 0 HIGH, and the full tree 0 CRITICAL", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sev = (rows: any[], s: string) => rows.filter((r) => r.severity === s).map((r) => r.package);
    expect(sev(prod.rows, "CRITICAL")).toEqual([]);
    expect(sev(prod.rows, "HIGH")).toEqual([]);
    expect(sev(full.rows, "CRITICAL")).toEqual([]);
  });

  it("every live HIGH is a recorded, approved, dev-only, production-unreachable acceptance", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highs = full.rows.filter((r: any) => r.severity === "HIGH");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prodPackages = new Set(prod.rows.map((r: any) => r.package));
    expect(highs.length).toBe(evidence.acceptedDevOnlyHigh.length);
    for (const h of highs) {
      const r = evidence.acceptedDevOnlyHigh.find((e) => keyOf(e) === keyOf(h));
      expect(r, `live HIGH ${h.package} is not in the recorded evidence`).toBeDefined();
      expect(sameList(h.advisoryIds, r!.advisoryIds), `${h.package} advisory ids drifted`).toBe(true);
      expect(sameList(h.paths, r!.paths), `${h.package} dependency path changed`).toBe(true);
      expect(prodPackages.has(h.package), `${h.package} is reachable from production`).toBe(false);
      expect(h.fixAvailableInRange, `${h.package} now has an in-range fix`).toBe(false);
    }
  });

  it("the additive evidence verifies against the live gate verdict with zero problems", () => {
    const problems = verifyGovernedEvidence({
      evidence,
      registerFindings: register.findings,
      manifestExceptions: manifest.exceptions,
      historicalRetestSha,
      governedRetestSha,
      verdict,
      devByPath,
      now: NOW,
    });
    expect(problems).toEqual([]);
  });
});

/* ────────── C. the verifier fails closed on every evidence mismatch ────────── */

describe("PHASE 99 governed retest — the evidence verifier fails closed", () => {
  const NOW = "2026-10-15";
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

  /** A PASS verdict exactly as the gate would report the recorded state. */
  const recordedVerdict = (): VerifyInputs["verdict"] => ({
    verdict: "PASS",
    failures: [],
    blocks: [],
    accepted: clone(evidence.acceptedDevOnlyHigh),
    summary: { production: { critical: 0, high: 0 }, full: { critical: 0 } },
  });
  const base = (): VerifyInputs => ({
    evidence: clone(evidence),
    registerFindings: clone(register.findings),
    manifestExceptions: clone(manifest.exceptions),
    historicalRetestSha,
    governedRetestSha,
    verdict: recordedVerdict(),
    devByPath,
    now: NOW,
  });
  const has = (problems: string[], prefix: string) => problems.some((x) => x.startsWith(prefix));

  it("baseline control: the committed record verifies cleanly", () => {
    expect(verifyGovernedEvidence(base())).toEqual([]);
  });

  it("a changed historical retest is a mismatch", () => {
    const i = base();
    i.historicalRetestSha = "0".repeat(64);
    expect(has(verifyGovernedEvidence(i), "HISTORICAL_RETEST_CHANGED")).toBe(true);
  });

  it("a re-pinned register hash is a mismatch", () => {
    const i = base();
    i.registerFindings = i.registerFindings.map((f) =>
      f.retestReference === evidence.historicalRetest.path ? { ...f, evidenceHash: "f".repeat(64) } : f,
    );
    expect(has(verifyGovernedEvidence(i), "REGISTER_HASH_MISMATCH")).toBe(true);
  });

  it("an edited governed retest is a mismatch", () => {
    const i = base();
    i.governedRetestSha = "1".repeat(64);
    expect(has(verifyGovernedEvidence(i), "GOVERNED_RETEST_CHANGED")).toBe(true);
  });

  it("a NEW HIGH accepted outside the record fails", () => {
    const i = base();
    i.verdict.accepted.push({ package: "evil-pkg", advisoryIds: ["GHSA-aaaa-bbbb-cccc"], paths: ["node_modules/evil-pkg"], inheritedFrom: [], expires: evidence.expires });
    const p = verifyGovernedEvidence(i);
    expect(has(p, "UNRECORDED_ACCEPTANCE:evil-pkg")).toBe(true);
    expect(has(p, "ACCEPTED_COUNT_MISMATCH")).toBe(true);
  });

  it("a RUNTIME HIGH (production not clean) fails", () => {
    const i = base();
    i.verdict.summary!.production.high = 1;
    expect(has(verifyGovernedEvidence(i), "PRODUCTION_NOT_CLEAN")).toBe(true);
  });

  it("a CRITICAL anywhere fails", () => {
    const i = base();
    i.verdict.summary!.full.critical = 1;
    expect(has(verifyGovernedEvidence(i), "FULL_TREE_CRITICAL")).toBe(true);
  });

  it("an EXPIRED exception fails", () => {
    const i = base();
    i.now = "2026-11-03";
    expect(has(verifyGovernedEvidence(i), "EXCEPTION_EXPIRED")).toBe(true);
  });

  it("a changed dependency path fails", () => {
    const i = base();
    i.verdict.accepted[0] = { ...i.verdict.accepted[0], paths: ["node_modules/somewhere-else"] };
    expect(has(verifyGovernedEvidence(i), "DEPENDENCY_PATH_CHANGED")).toBe(true);
  });

  it("a gate that did not PASS fails", () => {
    const i = base();
    i.verdict.verdict = "FAIL";
    i.verdict.failures = [{ code: "UNAPPROVED_HIGH" }];
    expect(has(verifyGovernedEvidence(i), "GATE_NOT_PASS:FAIL:UNAPPROVED_HIGH")).toBe(true);
  });

  it("a record that drops one acceptance, or disagrees with the manifest, fails", () => {
    const dropped = base();
    dropped.evidence.acceptedDevOnlyHigh.pop();
    dropped.evidence.acceptedDevOnlyHighCount -= 1;
    expect(has(verifyGovernedEvidence(dropped), "ACCEPTED_COUNT_MISMATCH")).toBe(true);

    const drift = base();
    drift.manifestExceptions[0] = { ...drift.manifestExceptions[0], expires: "2026-12-31" };
    expect(has(verifyGovernedEvidence(drift), "MANIFEST_MISMATCH")).toBe(true);
  });

  it("a summary that claims a fix, or hides the expiry, fails", () => {
    const claims = base();
    claims.evidence.remediationSummary = "The seven HIGH findings are fixed.";
    const p = verifyGovernedEvidence(claims);
    expect(has(p, "SUMMARY_CLAIMS_FIX")).toBe(true);
    expect(has(p, "SUMMARY_DOES_NOT_STATE_NOT_FIXED")).toBe(true);
    expect(has(p, "SUMMARY_DOES_NOT_STATE_EXPIRY")).toBe(true);
  });
});

/* ─────────── D. the real gate fails closed on the same weakenings ─────────── */

describe("PHASE 99 governed retest — the real gate fails closed", () => {
  const BRACES = "GHSA-vfj7-8cjw-p6xm";
  const MAJOR_FIX = { name: "tailwindcss", version: "4.0.0", isSemVerMajor: true };
  const NOW = "2026-10-15";

  type RawVuln = { severity: string; via: unknown[]; nodes?: string[]; fixAvailable?: unknown };
  const payload = (vulns: Record<string, RawVuln>) => ({ auditReportVersion: 2, vulnerabilities: vulns, metadata: { vulnerabilities: {} } });
  const adv = (url: string, severity = "high") => ({ source: 1, name: "braces", dependency: "braces", title: "stack exhaustion", url, severity, range: "*" });
  const bracesHigh = (nodes = ["node_modules/braces"]): RawVuln => ({
    severity: "high",
    via: [adv(`https://github.com/advisories/${BRACES}`)],
    nodes,
    fixAvailable: MAJOR_FIX,
  });
  const lockOf = (entries: Array<{ path: string; name: string }>) => {
    const nodes = new Map<string, { dev: boolean; name: string; version: string }>();
    for (const e of entries) nodes.set(e.path, { dev: true, name: e.name, version: "1.0.0" });
    return { ok: true, nodes, errors: [] as string[] };
  };
  const BRACES_LOCK = lockOf([{ path: "node_modules/braces", name: "braces" }]);
  const entry = (o: Record<string, unknown> = {}) => ({
    advisoryIds: [BRACES],
    package: "braces",
    paths: ["node_modules/braces"],
    inheritedFrom: [] as string[],
    devOnly: true,
    owner: "ZHARFA Engineering",
    reason: "no safe published version exists in the current compatible line",
    created: "2026-10-03",
    expires: "2026-11-02",
    futureRemediation: "docs/security/dependency-audit-governance.md#future-remediation-lanes",
    ...o,
  });
  const manifestWith = (exceptions: unknown[]) => ({ schemaVersion: 1, exceptions });
  const cleanProd = () => extractAuditRows(payload({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const codes = (v: any): string[] => [...(v.failures ?? []), ...(v.blocks ?? [])].map((f: any) => f.code);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gate = (o: { full?: any; prod?: any; manifest?: any; lockfile?: any; now?: string } = {}) =>
    evaluateAuditGate({
      full: o.full ?? extractAuditRows(payload({ braces: bracesHigh() })),
      prod: o.prod ?? cleanProd(),
      manifest: o.manifest ?? manifestWith([entry()]),
      lockfile: o.lockfile ?? BRACES_LOCK,
      now: o.now ?? NOW,
    });

  it("baseline control: the approved residual shape PASSES", () => {
    expect(gate().verdict).toBe("PASS");
  });

  it("a new unapproved HIGH fails", () => {
    const v = gate({
      full: extractAuditRows(payload({
        braces: bracesHigh(),
        "evil-pkg": { severity: "high", via: [adv("https://github.com/advisories/GHSA-aaaa-bbbb-cccc")], nodes: ["node_modules/evil-pkg"], fixAvailable: false },
      })),
      lockfile: lockOf([{ path: "node_modules/braces", name: "braces" }, { path: "node_modules/evil-pkg", name: "evil-pkg" }]),
    });
    expect(v.verdict).toBe("FAIL");
    expect(codes(v)).toContain("UNAPPROVED_HIGH");
  });

  it("a runtime HIGH fails even though its advisory id is approved", () => {
    const v = gate({ prod: extractAuditRows(payload({ braces: bracesHigh() })) });
    expect(v.verdict).toBe("FAIL");
    expect(codes(v)).toContain("PRODUCTION_HIGH_OR_CRITICAL");
    expect(codes(v)).toContain("APPROVED_ADVISORY_REACHABLE_FROM_PRODUCTION");
  });

  it("a CRITICAL in the dev tree fails and no exception can reach it", () => {
    const v = gate({
      full: extractAuditRows(payload({ braces: { ...bracesHigh(), severity: "critical", via: [adv(`https://github.com/advisories/${BRACES}`, "critical")] } })),
    });
    expect(v.verdict).toBe("FAIL");
    expect(codes(v)).toContain("FULL_TREE_CRITICAL");
  });

  it("an expired exception fails", () => {
    const v = gate({ manifest: manifestWith([entry({ expires: "2026-10-02" })]) });
    expect(v.verdict).toBe("FAIL");
    expect(codes(v)).toContain("EXCEPTION_EXPIRED");
  });

  it("a changed dependency path fails", () => {
    const v = gate({
      full: extractAuditRows(payload({ braces: bracesHigh(["node_modules/x/node_modules/braces"]) })),
      lockfile: lockOf([{ path: "node_modules/x/node_modules/braces", name: "braces" }]),
    });
    expect(v.verdict).toBe("FAIL");
    expect(codes(v)).toContain("DEPENDENCY_PATH_CHANGED");
  });

  it("an unknown severity BLOCKS", () => {
    const full = extractAuditRows(payload({ foo: { severity: "catastrophic", via: [], nodes: ["node_modules/foo"] } }));
    expect(full.ok).toBe(false);
    const v = gate({ full });
    expect(v.verdict).toBe("BLOCKED");
    expect(codes(v)).toContain("FULL_AUDIT_UNREADABLE");
  });

  it("a removed exception leaves the HIGH unapproved", () => {
    const v = gate({ manifest: manifestWith([]) });
    expect(v.verdict).toBe("FAIL");
    expect(codes(v)).toContain("UNAPPROVED_HIGH");
  });
});
