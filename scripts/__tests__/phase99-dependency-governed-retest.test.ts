/**
 * PHASE 99 — ADDITIVE governed-dependency retest evidence, revision 2.
 *
 * The historical Phase 99 retest (`scripts/__tests__/phase99-dependency-remediation.test.ts`)
 * and the finding register that pins its sha256 (`docs/security/phase99-findings.json`,
 * P99-DEP-001..007/013/014) are HISTORICAL records and are deliberately left
 * byte-identical. So is revision 1 of this record,
 * `docs/security/phase99-dependency-governed-retest.json`, which recorded the
 * seven braces-chain acceptances that held from 2026-10-03 until 2026-11-02.
 *
 * This file verifies the additive record that follows them:
 * `docs/security/phase99-dependency-governed-retest-r2.json`. That record states,
 * and this test proves against the repository and the LIVE audit, that:
 *
 *   - the historical retest and revision 1 are untouched (each sha256 equals the
 *     recorded one, and the register pins still carry the historical hash),
 *   - production dependencies carry exactly 0 CRITICAL and 0 HIGH,
 *   - the full tree carries 0 CRITICAL and exactly the recorded number of HIGH,
 *   - exactly the recorded dev-only HIGH acceptances exist (now none), the same
 *     set the exception manifest approves and the real gate accepts,
 *   - the seven acceptances revision 1 recorded were deleted because their root
 *     advisory was WITHDRAWN upstream, not because anything was fixed: the
 *     advisory appears nowhere in the live audit, the manifest no longer names
 *     them, and the summary says plainly that they were NOT fixed,
 *   - and the HIGH findings this revision did clear (zod, undici, vite) are
 *     really gone: every resolved copy is at or above the safe boundary and none
 *     of their advisory ids appears in the live audit.
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
const EVIDENCE_PATH = "docs/security/phase99-dependency-governed-retest-r2.json";
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

/** Numeric semver compare, sufficient for the release lines in play here. */
const gte = (a: string, b: string): boolean => {
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
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

interface WithdrawnEntry {
  package: string;
  advisoryIds: string[];
  paths: string[];
  inheritedFrom: string[];
  versionsAtRecording: Record<string, string>;
  status: string;
}

interface RemediatedEntry {
  package: string;
  advisoryIds: string[];
  paths: string[];
  graph: "production" | "dev";
  before: string;
  after: string;
  minimumSafe: string;
}

interface GovernedEvidence {
  schemaVersion: number;
  revision: number;
  baseCommit: string;
  historicalRetest: { path: string; sha256: string; registerEvidenceHash: string; findings: string[] };
  supersededRecord: { path: string; sha256: string; acceptedDevOnlyHighCount: number; status: string };
  governedRetest: { path: string; sha256: string };
  productionAudit: { critical: number; high: number };
  fullTreeAudit: { critical: number; high: number };
  acceptedDevOnlyHighCount: number;
  acceptedDevOnlyHigh: AcceptedEntry[];
  expires: string | null;
  withdrawnAdvisory: { id: string; withdrawnAt: string };
  withdrawnAcceptances: WithdrawnEntry[];
  remediatedHigh: RemediatedEntry[];
  notFixed: boolean;
  remediationSummary: string;
}

interface LiveRow {
  package: string;
  severity: string;
  advisoryIds: string[];
}

interface VerifyInputs {
  evidence: GovernedEvidence;
  registerFindings: Array<{ findingId: string; retestReference?: string | null; evidenceHash?: string | null }>;
  manifestExceptions: AcceptedEntry[];
  supersededAccepted: AcceptedEntry[];
  historicalRetestSha: string;
  supersededRecordSha: string;
  governedRetestSha: string;
  verdict: {
    verdict: string;
    failures?: Array<{ code: string }>;
    blocks?: Array<{ code: string }>;
    accepted: AcceptedEntry[];
    summary: { production: { critical: number; high: number }; full: { critical: number; high: number } } | null;
  };
  liveRows: LiveRow[];
  devByPath: (path: string) => boolean | undefined;
  /** Every resolved version of a package name anywhere in the lockfile. */
  versionsOf: (name: string) => string[];
  now: string;
}

const keyOf = (e: { package: string }) => String(e.package).toLowerCase();
const sameEntry = (a: AcceptedEntry, b: AcceptedEntry) =>
  keyOf(a) === keyOf(b) &&
  sameList(a.advisoryIds, b.advisoryIds) &&
  sameList(a.paths, b.paths) &&
  sameList(a.inheritedFrom, b.inheritedFrom) &&
  String(a.expires) === String(b.expires);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLAIMS_FIX = /\b(are|is|were|was|been)\s+(fixed|resolved|remediated)\b/i;

/** Every way the additive evidence can disagree with reality. Empty means it holds. */
function verifyGovernedEvidence(i: VerifyInputs): string[] {
  const p: string[] = [];
  const ev = i.evidence;

  if (ev.schemaVersion !== 1) p.push("SCHEMA_VERSION");
  if (ev.revision !== 2) p.push("REVISION");
  if (!/^[0-9a-f]{40}$/.test(String(ev.baseCommit))) p.push("BASE_COMMIT_INVALID");

  // The historical records must be untouched.
  if (i.historicalRetestSha !== ev.historicalRetest.sha256) p.push("HISTORICAL_RETEST_CHANGED");
  if (ev.historicalRetest.registerEvidenceHash !== ev.historicalRetest.sha256) p.push("HISTORICAL_HASH_INCONSISTENT");
  const pinning = i.registerFindings.filter((f) => f.retestReference === ev.historicalRetest.path);
  if (!sameList(pinning.map((f) => f.findingId), ev.historicalRetest.findings)) p.push("REGISTER_FINDINGS_MISMATCH");
  for (const f of pinning) {
    if (f.evidenceHash !== ev.historicalRetest.registerEvidenceHash) p.push(`REGISTER_HASH_MISMATCH:${f.findingId}`);
  }
  if (i.supersededRecordSha !== ev.supersededRecord.sha256) p.push("SUPERSEDED_RECORD_CHANGED");
  if (ev.supersededRecord.path === EVIDENCE_PATH) p.push("SUPERSEDED_RECORD_IS_SELF");

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
    if (s.full.high !== ev.fullTreeAudit.high) p.push("FULL_TREE_HIGH_MISMATCH");
  }
  if (ev.productionAudit.critical !== 0 || ev.productionAudit.high !== 0) p.push("RECORDED_PRODUCTION_NOT_CLEAN");

  // Exactly the recorded acceptances — no more, no fewer, no drift.
  const rec = ev.acceptedDevOnlyHigh;
  if (rec.length !== ev.acceptedDevOnlyHighCount) p.push("RECORDED_COUNT_INCONSISTENT");
  if (ev.fullTreeAudit.high !== rec.length) p.push("RECORDED_HIGH_NOT_ALL_ACCEPTED");
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
  // An expiry with nothing to expire would be a dormant date waiting to be reused.
  if (rec.length === 0 && ev.expires !== null) p.push("EXPIRY_WITHOUT_ACCEPTANCE");
  if (rec.length > 0 && !ISO_DATE.test(String(ev.expires))) p.push("ACCEPTANCE_WITHOUT_EXPIRY");

  // The deleted acceptances: exactly revision 1's set, gone from the manifest and
  // from the live audit — because the advisory was withdrawn, not fixed.
  const wd = ev.withdrawnAcceptances;
  const wid = ev.withdrawnAdvisory.id;
  if (!/^GHSA-[a-z0-9-]+$/i.test(String(wid))) p.push("WITHDRAWN_ADVISORY_ID_INVALID");
  if (!ISO_DATE.test(String(ev.withdrawnAdvisory.withdrawnAt))) p.push("WITHDRAWN_DATE_INVALID");
  if (wd.length !== i.supersededAccepted.length || wd.length !== ev.supersededRecord.acceptedDevOnlyHighCount) {
    p.push("WITHDRAWN_COUNT_MISMATCH");
  }
  for (const w of wd) {
    const old = i.supersededAccepted.find((o) => keyOf(o) === keyOf(w));
    if (!old) p.push(`WITHDRAWN_NOT_IN_SUPERSEDED_RECORD:${w.package}`);
    else if (!sameList(old.advisoryIds, w.advisoryIds) || !sameList(old.paths, w.paths) || !sameList(old.inheritedFrom, w.inheritedFrom)) {
      p.push(`WITHDRAWN_DRIFT:${w.package}`);
    }
    if (!sameList(w.advisoryIds, [wid])) p.push(`WITHDRAWN_ADVISORY_MISMATCH:${w.package}`);
    if (!sameList(Object.keys(w.versionsAtRecording ?? {}), w.paths)) p.push(`WITHDRAWN_VERSIONS_INCOMPLETE:${w.package}`);
    if (i.manifestExceptions.some((m) => keyOf(m) === keyOf(w))) p.push(`WITHDRAWN_STILL_IN_MANIFEST:${w.package}`);
    if (w.status !== "STALE_EXCEPTION_DELETED_NOT_FIXED") p.push(`WITHDRAWN_STATUS:${w.package}`);
  }
  for (const o of i.supersededAccepted) {
    if (!wd.some((w) => keyOf(w) === keyOf(o))) p.push(`SUPERSEDED_ACCEPTANCE_UNACCOUNTED:${o.package}`);
  }
  if (i.liveRows.some((row) => row.advisoryIds.includes(wid))) p.push("WITHDRAWN_ADVISORY_STILL_LIVE");

  // The HIGH findings this revision cleared must really be gone.
  for (const m of ev.remediatedHigh) {
    const versions = i.versionsOf(m.package);
    if (versions.length === 0) p.push(`REMEDIATED_PACKAGE_ABSENT:${m.package}`);
    for (const v of versions) {
      if (!gte(v, m.minimumSafe)) p.push(`REMEDIATION_REGRESSED:${m.package}@${v}`);
    }
    if (!gte(m.after, m.minimumSafe) || gte(m.before, m.minimumSafe)) p.push(`REMEDIATION_RECORD_INCONSISTENT:${m.package}`);
    for (const id of m.advisoryIds) {
      if (i.liveRows.some((row) => row.advisoryIds.includes(id))) p.push(`REMEDIATED_ADVISORY_STILL_LIVE:${m.package}:${id}`);
    }
  }

  // The summary must not claim a fix that did not happen.
  const text = String(ev.remediationSummary);
  if (ev.notFixed !== true) p.push("NOT_FIXED_FLAG_MISSING");
  if (!/\bNOT fixed\b/.test(text)) p.push("SUMMARY_DOES_NOT_STATE_NOT_FIXED");
  if (!/\bwithdrawn\b/i.test(text) || !text.includes(String(wid))) p.push("SUMMARY_DOES_NOT_STATE_WITHDRAWAL");
  if (rec.length > 0) {
    if (!/temporar/i.test(text)) p.push("SUMMARY_DOES_NOT_STATE_TEMPORARY");
    if (!text.includes(String(ev.expires))) p.push("SUMMARY_DOES_NOT_STATE_EXPIRY");
  }
  if (CLAIMS_FIX.test(text)) p.push("SUMMARY_CLAIMS_FIX");

  return p;
}

/* ─────────────────────────── committed inputs ─────────────────────────── */

const evidence = readJson(EVIDENCE_PATH) as GovernedEvidence;
const superseded = readJson(evidence.supersededRecord.path) as { acceptedDevOnlyHigh: AcceptedEntry[] };
const register = readJson(REGISTER_PATH) as { findings: VerifyInputs["registerFindings"] };
const manifest = readJson(MANIFEST_RELATIVE_PATH) as { exceptions: AcceptedEntry[] };
const lockJson = readJson("package-lock.json") as { packages: Record<string, { version?: string }> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lockIndex = indexLockfile(lockJson) as any;
const historicalRetestSha = sha256Normalised(readText(evidence.historicalRetest.path));
const supersededRecordSha = sha256Normalised(readText(evidence.supersededRecord.path));
const governedRetestSha = sha256Normalised(readText(SELF_PATH));
const devByPath = (path: string): boolean | undefined => lockIndex.nodes?.get(path)?.dev;
const versionsOf = (name: string): string[] => {
  const out: string[] = [];
  for (const [path, entry] of Object.entries(lockJson.packages ?? {})) {
    if (!path || !entry?.version) continue;
    if (path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length) === name) out.push(entry.version);
  }
  return out;
};

/* ──────────────── A. the committed record is internally sound ─────────────── */

describe("PHASE 99 governed retest R2 — the additive record and the historical records", () => {
  it("leaves the historical retest and its register pins untouched", () => {
    expect(historicalRetestSha).toBe(evidence.historicalRetest.sha256);
    expect(evidence.historicalRetest.registerEvidenceHash).toBe(evidence.historicalRetest.sha256);
    const pinning = register.findings.filter((f) => f.retestReference === evidence.historicalRetest.path);
    expect(sorted(pinning.map((f) => f.findingId))).toEqual(sorted(evidence.historicalRetest.findings));
    for (const f of pinning) expect(f.evidenceHash, f.findingId).toBe(evidence.historicalRetest.sha256);
  });

  it("leaves revision 1 of this record byte-identical", () => {
    expect(evidence.supersededRecord.path).toBe("docs/security/phase99-dependency-governed-retest.json");
    expect(supersededRecordSha).toBe(evidence.supersededRecord.sha256);
    expect(superseded.acceptedDevOnlyHigh).toHaveLength(evidence.supersededRecord.acceptedDevOnlyHighCount);
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

  it("records exactly the manifest's acceptances — none — and therefore no expiry", () => {
    expect(evidence.acceptedDevOnlyHigh).toHaveLength(evidence.acceptedDevOnlyHighCount);
    expect(evidence.acceptedDevOnlyHigh).toHaveLength(manifest.exceptions.length);
    expect(evidence.acceptedDevOnlyHigh).toEqual([]);
    expect(evidence.expires).toBeNull();
  });

  it("accounts for every acceptance revision 1 recorded, as withdrawn and NOT fixed", () => {
    expect(sorted(evidence.withdrawnAcceptances.map((w) => w.package))).toEqual(sorted(superseded.acceptedDevOnlyHigh.map((a) => a.package)));
    for (const w of evidence.withdrawnAcceptances) {
      expect(w.advisoryIds).toEqual([evidence.withdrawnAdvisory.id]);
      expect(w.status).toBe("STALE_EXCEPTION_DELETED_NOT_FIXED");
      expect(manifest.exceptions.some((m) => keyOf(m) === keyOf(w)), `${w.package} is still in the manifest`).toBe(false);
    }
  });

  it("says plainly that the withdrawn findings are NOT fixed, and claims no fix", () => {
    expect(evidence.notFixed).toBe(true);
    expect(evidence.remediationSummary).toMatch(/\bNOT fixed\b/);
    expect(evidence.remediationSummary).toMatch(/\bwithdrawn\b/i);
    expect(evidence.remediationSummary).toContain(evidence.withdrawnAdvisory.id);
    expect(evidence.remediationSummary).not.toMatch(CLAIMS_FIX);
  });

  it("every cleared HIGH is at or above its safe boundary in every resolved copy", () => {
    expect(sorted(evidence.remediatedHigh.map((m) => m.package))).toEqual(["undici", "vite", "zod"]);
    for (const m of evidence.remediatedHigh) {
      const versions = versionsOf(m.package);
      expect(versions.length, `${m.package} is not in the lockfile`).toBeGreaterThan(0);
      for (const v of versions) expect(gte(v, m.minimumSafe), `${m.package}@${v} < ${m.minimumSafe}`).toBe(true);
    }
  });
});

/* ─────────────── B. the record holds against the LIVE audit ─────────────── */

describe("PHASE 99 governed retest R2 — the record holds against the live npm audit", () => {
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

  it("the withdrawn advisory and every cleared advisory are absent from the live audit", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const liveIds = new Set([...full.rows, ...prod.rows].flatMap((r: any) => r.advisoryIds as string[]));
    expect(liveIds.has(evidence.withdrawnAdvisory.id)).toBe(false);
    for (const m of evidence.remediatedHigh) {
      for (const id of m.advisoryIds) expect(liveIds.has(id), `${m.package} ${id} is still reported`).toBe(false);
    }
  });

  it("the additive evidence verifies against the live gate verdict with zero problems", () => {
    const problems = verifyGovernedEvidence({
      evidence,
      registerFindings: register.findings,
      manifestExceptions: manifest.exceptions,
      supersededAccepted: superseded.acceptedDevOnlyHigh,
      historicalRetestSha,
      supersededRecordSha,
      governedRetestSha,
      verdict,
      liveRows: [...full.rows, ...prod.rows],
      devByPath,
      versionsOf,
      now: NOW,
    });
    expect(problems).toEqual([]);
  });
});

/* ────────── C. the verifier fails closed on every evidence mismatch ────────── */

describe("PHASE 99 governed retest R2 — the evidence verifier fails closed", () => {
  const NOW = "2026-11-02";
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

  /** A PASS verdict exactly as the gate reports the recorded state. */
  const recordedVerdict = (): VerifyInputs["verdict"] => ({
    verdict: "PASS",
    failures: [],
    blocks: [],
    accepted: clone(evidence.acceptedDevOnlyHigh),
    summary: { production: { critical: 0, high: 0 }, full: { critical: 0, high: 0 } },
  });
  const base = (): VerifyInputs => ({
    evidence: clone(evidence),
    registerFindings: clone(register.findings),
    manifestExceptions: clone(manifest.exceptions),
    supersededAccepted: clone(superseded.acceptedDevOnlyHigh),
    historicalRetestSha,
    supersededRecordSha,
    governedRetestSha,
    verdict: recordedVerdict(),
    liveRows: [],
    devByPath,
    versionsOf,
    now: NOW,
  });
  const has = (problems: string[], prefix: string) => problems.some((x) => x.startsWith(prefix));

  /**
   * The same inputs with one dev-only acceptance in force, so the acceptance
   * rules (path, manifest, expiry, wording) stay proven while the real register
   * is empty. `node_modules/vitest` is a real dev-only lockfile node that no
   * other part of the record names.
   */
  const withOneAcceptance = (): VerifyInputs => {
    const i = base();
    const a: AcceptedEntry = {
      package: "vitest",
      advisoryIds: ["GHSA-aaaa-bbbb-cccc"],
      paths: ["node_modules/vitest"],
      inheritedFrom: [],
      devOnly: true,
      expires: "2026-12-01",
    };
    i.evidence.acceptedDevOnlyHigh = [clone(a)];
    i.evidence.acceptedDevOnlyHighCount = 1;
    i.evidence.fullTreeAudit.high = 1;
    i.evidence.expires = "2026-12-01";
    i.evidence.remediationSummary += " One HIGH is accepted temporarily until 2026-12-01.";
    i.manifestExceptions = [clone(a)];
    i.verdict.accepted = [clone(a)];
    i.verdict.summary!.full.high = 1;
    return i;
  };

  it("baseline control: the committed record verifies cleanly", () => {
    expect(verifyGovernedEvidence(base())).toEqual([]);
  });

  it("baseline control: a record with one well-formed acceptance verifies cleanly", () => {
    expect(verifyGovernedEvidence(withOneAcceptance())).toEqual([]);
  });

  it("a changed historical retest is a mismatch", () => {
    const i = base();
    i.historicalRetestSha = "0".repeat(64);
    expect(has(verifyGovernedEvidence(i), "HISTORICAL_RETEST_CHANGED")).toBe(true);
  });

  it("an edited revision 1 record is a mismatch", () => {
    const i = base();
    i.supersededRecordSha = "2".repeat(64);
    expect(has(verifyGovernedEvidence(i), "SUPERSEDED_RECORD_CHANGED")).toBe(true);
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
    i.verdict.accepted.push({ package: "evil-pkg", advisoryIds: ["GHSA-aaaa-bbbb-cccc"], paths: ["node_modules/evil-pkg"], inheritedFrom: [], expires: "2026-12-01" });
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

  it("an unrecorded dev HIGH in the full tree fails", () => {
    const i = base();
    i.verdict.summary!.full.high = 1;
    expect(has(verifyGovernedEvidence(i), "FULL_TREE_HIGH_MISMATCH")).toBe(true);
  });

  it("a gate that did not PASS fails", () => {
    const i = base();
    i.verdict.verdict = "FAIL";
    i.verdict.failures = [{ code: "UNAPPROVED_HIGH" }];
    expect(has(verifyGovernedEvidence(i), "GATE_NOT_PASS:FAIL:UNAPPROVED_HIGH")).toBe(true);
  });

  it("an expiry left behind with nothing to expire fails", () => {
    const i = base();
    i.evidence.expires = "2026-11-02";
    expect(has(verifyGovernedEvidence(i), "EXPIRY_WITHOUT_ACCEPTANCE")).toBe(true);
  });

  it("the withdrawn advisory reappearing in the live audit fails", () => {
    const i = base();
    i.liveRows = [{ package: "braces", severity: "HIGH", advisoryIds: [evidence.withdrawnAdvisory.id] }];
    expect(has(verifyGovernedEvidence(i), "WITHDRAWN_ADVISORY_STILL_LIVE")).toBe(true);
  });

  it("a withdrawn entry still in the manifest, or one dropped from the record, fails", () => {
    const kept = base();
    kept.manifestExceptions = [clone(superseded.acceptedDevOnlyHigh[0])];
    expect(has(verifyGovernedEvidence(kept), "WITHDRAWN_STILL_IN_MANIFEST")).toBe(true);

    const dropped = base();
    dropped.evidence.withdrawnAcceptances.pop();
    const p = verifyGovernedEvidence(dropped);
    expect(has(p, "WITHDRAWN_COUNT_MISMATCH")).toBe(true);
    expect(has(p, "SUPERSEDED_ACCEPTANCE_UNACCOUNTED")).toBe(true);
  });

  it("a withdrawn entry that drifts from revision 1 fails", () => {
    const i = base();
    i.evidence.withdrawnAcceptances[0].paths = ["node_modules/somewhere-else"];
    expect(has(verifyGovernedEvidence(i), "WITHDRAWN_DRIFT")).toBe(true);
  });

  it("a cleared package that falls back below its safe boundary fails", () => {
    const i = base();
    i.versionsOf = (name) => (name === "zod" ? ["4.4.3"] : versionsOf(name));
    expect(has(verifyGovernedEvidence(i), "REMEDIATION_REGRESSED:zod@4.4.3")).toBe(true);
  });

  it("a cleared advisory still reported live fails", () => {
    const i = base();
    const zod = evidence.remediatedHigh.find((m) => m.package === "zod")!;
    i.liveRows = [{ package: "zod", severity: "HIGH", advisoryIds: [zod.advisoryIds[0]] }];
    expect(has(verifyGovernedEvidence(i), "REMEDIATED_ADVISORY_STILL_LIVE:zod")).toBe(true);
  });

  it("an EXPIRED acceptance fails", () => {
    const i = withOneAcceptance();
    i.now = "2026-12-02";
    expect(has(verifyGovernedEvidence(i), "EXCEPTION_EXPIRED")).toBe(true);
  });

  it("a changed dependency path on an acceptance fails", () => {
    const i = withOneAcceptance();
    i.verdict.accepted[0] = { ...i.verdict.accepted[0], paths: ["node_modules/somewhere-else"] };
    expect(has(verifyGovernedEvidence(i), "DEPENDENCY_PATH_CHANGED")).toBe(true);
  });

  it("an acceptance that disagrees with the manifest, or has no expiry, fails", () => {
    const drift = withOneAcceptance();
    drift.manifestExceptions[0] = { ...drift.manifestExceptions[0], expires: "2026-12-31" };
    expect(has(verifyGovernedEvidence(drift), "MANIFEST_MISMATCH")).toBe(true);

    const undated = withOneAcceptance();
    undated.evidence.expires = null;
    expect(has(verifyGovernedEvidence(undated), "ACCEPTANCE_WITHOUT_EXPIRY")).toBe(true);
  });

  it("a summary that claims a fix, or hides the withdrawal, fails", () => {
    const claims = base();
    claims.evidence.remediationSummary = "The seven HIGH findings are fixed.";
    const p = verifyGovernedEvidence(claims);
    expect(has(p, "SUMMARY_CLAIMS_FIX")).toBe(true);
    expect(has(p, "SUMMARY_DOES_NOT_STATE_NOT_FIXED")).toBe(true);
    expect(has(p, "SUMMARY_DOES_NOT_STATE_WITHDRAWAL")).toBe(true);

    const hidden = withOneAcceptance();
    hidden.evidence.remediationSummary = evidence.remediationSummary;
    expect(has(verifyGovernedEvidence(hidden), "SUMMARY_DOES_NOT_STATE_EXPIRY")).toBe(true);
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
