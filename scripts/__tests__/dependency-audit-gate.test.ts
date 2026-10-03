/**
 * GOVERNED DEPENDENCY AUDIT GATE — negative, adversarial and mutation tests.
 *
 * This gate is the only thing standing between "a HIGH advisory with no safe
 * release" and "somebody writes `--audit-level=critical` and moves on". Its value
 * is therefore almost entirely in what it REFUSES, so most tests below assert a
 * failure or a block, and the few PASS tests are pinned to the exact approved set.
 *
 * Four layers are proven:
 *
 *   1. the pure evaluator, against synthetic `npm audit --json` payloads, so
 *      every refusal path is reachable without waiting for a real advisory;
 *   2. the child-process boundary — exit codes, signals, spawn errors, timeouts,
 *      truncated output and stderr, none of which may produce a PASS;
 *   3. the committed exception manifest, which must be narrow, dated, owned,
 *      dev-only, one-to-one and free of wildcards or path tricks;
 *   4. the wiring — that CI calls the gate rather than deciding from a raw
 *      `npm audit` exit code, and that the gate has not been quietly weakened.
 *
 * No network and no filesystem writes.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACCEPTED_LABEL,
  MANIFEST_RELATIVE_PATH,
  MANIFEST_SCHEMA_VERSION,
  AUDIT_TIMEOUT_MS,
  extractAuditRows,
  indexLockfile,
  isAcceptableDependencyPath,
  validateManifest,
  evaluateAuditGate,
  normalizeAuditSeverity,
  runAudit,
} from "../ci/dependency-audit-gate.mjs";

const REPO = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(REPO, ...rel.split("/")), "utf8");

/** The committed manifest's shape, so the mutation tests stay type-checked. */
interface ExceptionEntry {
  advisoryIds: string[];
  package: string;
  paths: string[];
  inheritedFrom: string[];
  devOnly: boolean;
  owner: string;
  reason: string;
  created: string;
  expires: string;
  futureRemediation: string;
  [key: string]: unknown;
}
interface ExceptionManifest {
  schemaVersion: number;
  exceptions: ExceptionEntry[];
  [key: string]: unknown;
}

const MANIFEST = JSON.parse(read(MANIFEST_RELATIVE_PATH)) as ExceptionManifest;
const TODAY = "2026-10-03";

/** Values that name no real Gregorian date. Most are well-shaped yyyy-mm-dd. */
const INVALID_CALENDAR_DATES = [
  "2026-00-00",
  "0000-00-00",
  "2026-13-01",
  "2026-01-00",
  "2026-02-29",
  "2026-02-30",
  "2026-04-31",
  "2026-11-31",
  "2026-1-02",
];

/** The one root advisory the whole residual set rests on. */
const BRACES_ADVISORY = "GHSA-vfj7-8cjw-p6xm";
const BRACES_URL = `https://github.com/advisories/${BRACES_ADVISORY}`;
const OTHER_URL = "https://github.com/advisories/GHSA-aaaa-bbbb-cccc";

interface RawVuln {
  severity: string;
  via: unknown[];
  nodes?: string[];
  fixAvailable?: unknown;
}

/** Build an `npm audit --json`-shaped payload from a map of packages. */
function auditPayload(vulns: Record<string, RawVuln>) {
  return { auditReportVersion: 2, vulnerabilities: vulns, metadata: { vulnerabilities: {} } };
}

/** The root advisory object npm nests inside `via`. */
const advisory = (severity: string, url = BRACES_URL) => ({
  source: 1234567,
  name: "braces",
  dependency: "braces",
  title: "stack exhaustion",
  url,
  severity,
  range: "*",
});

const MAJOR_FIX_TW = { name: "tailwindcss", version: "4.3.3", isSemVerMajor: true };
const MAJOR_FIX_ESLINT = { name: "eslint-config-next", version: "14.2.35", isSemVerMajor: true };

/**
 * The exact residual shape this repository has after the approved upgrades:
 * one root advisory in `braces`, inherited by six dev-only parents.
 */
function approvedResidualAudit() {
  return auditPayload({
    braces: { severity: "high", via: [advisory("high")], nodes: ["node_modules/braces"], fixAvailable: MAJOR_FIX_TW },
    micromatch: { severity: "high", via: ["braces"], nodes: ["node_modules/micromatch"], fixAvailable: MAJOR_FIX_TW },
    chokidar: { severity: "high", via: ["braces"], nodes: ["node_modules/chokidar"], fixAvailable: MAJOR_FIX_TW },
    "fast-glob": {
      severity: "high",
      via: ["micromatch"],
      nodes: ["node_modules/@next/eslint-plugin-next/node_modules/fast-glob", "node_modules/fast-glob"],
      fixAvailable: MAJOR_FIX_ESLINT,
    },
    tailwindcss: { severity: "high", via: ["chokidar", "fast-glob", "micromatch"], nodes: ["node_modules/tailwindcss"], fixAvailable: MAJOR_FIX_TW },
    "@next/eslint-plugin-next": { severity: "high", via: ["fast-glob"], nodes: ["node_modules/@next/eslint-plugin-next"], fixAvailable: MAJOR_FIX_ESLINT },
    "eslint-config-next": { severity: "high", via: ["@next/eslint-plugin-next"], nodes: ["node_modules/eslint-config-next"], fixAvailable: MAJOR_FIX_ESLINT },
    hono: { severity: "moderate", via: [advisory("moderate", "https://github.com/advisories/GHSA-54fx-42gc-7vw4")], nodes: ["node_modules/hono"], fixAvailable: true },
  });
}

/** A production payload with only moderates, which is the approved state. */
function cleanProductionAudit() {
  return auditPayload({
    hono: { severity: "moderate", via: [advisory("moderate", "https://github.com/advisories/GHSA-54fx-42gc-7vw4")], nodes: ["node_modules/hono"], fixAvailable: true },
  });
}

/** Every path the approved residual set occupies, all dev-only in the lockfile. */
const DEV_PATHS = [
  "node_modules/braces",
  "node_modules/micromatch",
  "node_modules/chokidar",
  "node_modules/fast-glob",
  "node_modules/@next/eslint-plugin-next/node_modules/fast-glob",
  "node_modules/tailwindcss",
  "node_modules/@next/eslint-plugin-next",
  "node_modules/eslint-config-next",
];

function lockPayload(over: Record<string, { dev?: boolean; version?: string }> = {}) {
  const packages: Record<string, { dev: boolean; version: string }> = { "": { dev: false, version: "0.0.0" } };
  for (const p of DEV_PATHS) packages[p] = { dev: true, version: "1.0.0" };
  packages["node_modules/hono"] = { dev: false, version: "4.0.0" };
  packages["node_modules/some-new-package"] = { dev: true, version: "1.0.0" };
  packages["node_modules/pg"] = { dev: false, version: "8.0.0" };
  for (const [k, v] of Object.entries(over)) packages[k] = { dev: v.dev ?? true, version: v.version ?? "1.0.0" };
  return { lockfileVersion: 3, packages };
}

function run(
  fullRaw: unknown,
  prodRaw: unknown,
  manifest: unknown = MANIFEST,
  now = TODAY,
  lockRaw: unknown = lockPayload(),
) {
  return evaluateAuditGate({
    full: extractAuditRows(fullRaw),
    prod: extractAuditRows(prodRaw),
    manifest,
    lockfile: indexLockfile(lockRaw),
    now,
  });
}

const codes = (r: { failures: { code: string }[] }) => r.failures.map((f) => f.code);
const blockCodes = (r: { blocks: { code: string }[] }) => r.blocks.map((b) => b.code);

describe("severity vocabulary is closed", () => {
  it("maps the words npm actually emits", () => {
    expect(normalizeAuditSeverity("critical")).toBe("CRITICAL");
    expect(normalizeAuditSeverity("high")).toBe("HIGH");
    expect(normalizeAuditSeverity("moderate")).toBe("MODERATE");
    expect(normalizeAuditSeverity("low")).toBe("LOW");
  });

  it("refuses to guess an unknown word", () => {
    for (const bad of ["severe", "blocker", "medium", "", null, 7, undefined]) {
      expect(normalizeAuditSeverity(bad as never)).toBeNull();
    }
  });

  it("treats an unknown severity as unreadable rather than ignorable", () => {
    const res = extractAuditRows(auditPayload({ x: { severity: "spicy", via: [advisory("high")], nodes: ["node_modules/x"] } }));
    expect(res.ok).toBe(false);
  });
});

describe("the gate passes ONLY for the exact approved residual dev-only set", () => {
  it("passes on the approved set and labels it accepted, never fixed", () => {
    const r = run(approvedResidualAudit(), cleanProductionAudit());
    expect(r.failures).toEqual([]);
    expect(r.verdict).toBe("PASS");
    expect(r.accepted).toHaveLength(7);
    for (const a of r.accepted) {
      expect(a.status).toBe(ACCEPTED_LABEL);
      expect(a.advisoryIds).toEqual([BRACES_ADVISORY]);
    }
    expect(r).toMatchObject({
      summary: {
        production: { critical: 0, high: 0 },
        full: { critical: 0, high: 7 },
        staleExceptions: 0,
        expiredExceptions: 0,
        productionExceptions: 0,
        unapprovedHigh: 0,
      },
    });
  });

  it("resolves all seven accepted findings to exactly one root advisory", () => {
    const r = run(approvedResidualAudit(), cleanProductionAudit());
    const all = new Set(r.accepted.flatMap((a: { advisoryIds: string[] }) => a.advisoryIds));
    expect([...all]).toEqual([BRACES_ADVISORY]);
  });

  it("keeps moderate and low findings visible instead of hiding them", () => {
    const r = run(approvedResidualAudit(), cleanProductionAudit());
    expect(r.advisory.find((a: { package: string }) => a.package === "hono")).toMatchObject({
      severity: "MODERATE",
      productionReachable: true,
    });
  });

  it("never reports an accepted finding as fixed", () => {
    expect(ACCEPTED_LABEL).toBe("ACCEPTED_TEMPORARY_DEV_ONLY_RISK");
    expect(read("scripts/ci/dependency-audit-gate.mjs")).not.toMatch(/\bFIXED\b/);
  });
});

describe("A. a stale or orphaned exception FAILS, it never warns", () => {
  /**
   * A realistic upstream fix: the finding disappears AND every `via` reference to
   * it disappears with it. (Removing the row while a parent still references it
   * is a malformed payload, which BLOCKS — proven separately below.)
   */
  const dropFinding = (name: string) => {
    const full = approvedResidualAudit();
    delete (full.vulnerabilities as Record<string, unknown>)[name];
    for (const v of Object.values(full.vulnerabilities as Record<string, RawVuln>)) {
      v.via = v.via.filter((x) => x !== name);
    }
    return full;
  };

  it("fails when one approved finding disappears but its entry remains", () => {
    const full = dropFinding("chokidar");
    const r = run(full, cleanProductionAudit());
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("STALE_OR_ORPHANED_EXCEPTION");
    expect(r.failures.find((f: { code: string }) => f.code === "STALE_OR_ORPHANED_EXCEPTION")).toMatchObject({ package: "chokidar" });
    expect(r).toMatchObject({ summary: { staleExceptions: 1 } });
    expect(r.accepted.map((a: { package: string }) => a.package)).not.toContain("chokidar");
  });

  it("blocks instead of failing when a parent still references the removed row", () => {
    // Distinct case: a payload that references a package it does not define is
    // malformed, and the gate must refuse to decide rather than read the missing
    // row as "no advisory here".
    const full = approvedResidualAudit();
    delete (full.vulnerabilities as Record<string, unknown>).chokidar;
    const r = run(full, cleanProductionAudit());
    expect(r.verdict).toBe("BLOCKED");
    expect(blockCodes(r)).toContain("FULL_AUDIT_UNREADABLE");
  });

  it("fails on a completely safe lockfile while the manifest still has entries", () => {
    // The best possible dependency state — nothing high at all — must still FAIL
    // until the obsolete authorizations are deleted.
    const r = run(auditPayload({}), auditPayload({}));
    expect(r.verdict).toBe("FAIL");
    expect(codes(r).filter((c) => c === "STALE_OR_ORPHANED_EXCEPTION")).toHaveLength(7);
    expect(r.accepted).toEqual([]);
  });

  it("passes again only once the obsolete exceptions are deleted", () => {
    const empty = { schemaVersion: MANIFEST_SCHEMA_VERSION, exceptions: [] };
    const r = run(auditPayload({}), auditPayload({}), empty);
    expect(r.failures).toEqual([]);
    expect(r.verdict).toBe("PASS");
    expect(r.accepted).toEqual([]);
  });

  it("cannot let a reintroduced vulnerable version reuse a dormant authorization", () => {
    // 1. upstream fixes it: the entry is now stale and CI fails.
    const fixed = run(auditPayload({}), auditPayload({}));
    expect(codes(fixed)).toContain("STALE_OR_ORPHANED_EXCEPTION");

    // 2. the obsolete entries are deleted, so CI goes green.
    const cleaned = { schemaVersion: MANIFEST_SCHEMA_VERSION, exceptions: [] };
    expect(run(auditPayload({}), auditPayload({}), cleaned).verdict).toBe("PASS");

    // 3. the vulnerable version comes back. With the authorization gone it is an
    //    ordinary unapproved HIGH — it inherits nothing.
    const back = run(approvedResidualAudit(), cleanProductionAudit(), cleaned);
    expect(back.verdict).toBe("FAIL");
    expect(codes(back).filter((c) => c === "UNAPPROVED_HIGH")).toHaveLength(7);
    expect(back.accepted).toEqual([]);
  });

  it("never prints PASS together with a stale exception", () => {
    for (const r of [run(auditPayload({}), auditPayload({})), run(dropFinding("braces"), cleanProductionAudit())]) {
      if (codes(r).includes("STALE_OR_ORPHANED_EXCEPTION")) expect(r.verdict).not.toBe("PASS");
    }
  });

  it("reports stale exceptions in the summary so CI output is unambiguous", () => {
    const r = run(auditPayload({}), auditPayload({}));
    expect(r).toMatchObject({ summary: { staleExceptions: 7, acceptedDevOnlyHigh: 0 } });
  });
});

describe("A. matching is exactly one-to-one", () => {
  it("fails when two entries claim the same finding", () => {
    const manifest = structuredClone(MANIFEST);
    // A second entry for the same package and advisory set, differing only in a
    // field the duplicate check does not key on.
    const clone = structuredClone(manifest.exceptions[0]);
    clone.paths = ["node_modules/braces"];
    manifest.exceptions.push(clone);
    const r = run(approvedResidualAudit(), cleanProductionAudit(), manifest);
    expect(r.verdict).toBe("FAIL");
    // The structural duplicate check bites first, and the claim check backs it up.
    expect(codes(r)).toContain("MANIFEST_INVALID");
  });

  it("fails when an entry would match an expanded path set", () => {
    const full = approvedResidualAudit();
    full.vulnerabilities.braces.nodes = ["node_modules/braces", "node_modules/micromatch/node_modules/braces"];
    const r = run(full, cleanProductionAudit(), MANIFEST, TODAY, lockPayload({ "node_modules/micromatch/node_modules/braces": { dev: true } }));
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("DEPENDENCY_PATH_CHANGED");
    expect(r.accepted.map((a: { package: string }) => a.package)).not.toContain("braces");
  });

  it("fails when an entry matches nothing because the package was renamed upstream", () => {
    const full = approvedResidualAudit();
    delete (full.vulnerabilities as Record<string, unknown>).tailwindcss;
    const r = run(full, cleanProductionAudit());
    expect(codes(r)).toContain("STALE_OR_ORPHANED_EXCEPTION");
  });

  it("accepts each finding exactly once, so counts cannot drift", () => {
    const r = run(approvedResidualAudit(), cleanProductionAudit());
    const names = r.accepted.map((a: { package: string }) => a.package);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toHaveLength(MANIFEST.exceptions.length);
  });
});

describe("it fails for a new unapproved HIGH", () => {
  it("fails when a package nobody approved turns high", () => {
    const full = approvedResidualAudit();
    full.vulnerabilities["some-new-package"] = {
      severity: "high",
      via: [advisory("high", OTHER_URL)],
      nodes: ["node_modules/some-new-package"],
      fixAvailable: false,
    };
    const r = run(full, cleanProductionAudit());
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("UNAPPROVED_HIGH");
  });

  it("fails when an APPROVED package acquires an additional advisory", () => {
    const full = approvedResidualAudit();
    full.vulnerabilities.braces.via = [advisory("high"), advisory("high", OTHER_URL)];
    const r = run(full, cleanProductionAudit());
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("UNAPPROVED_ADVISORY_ID");
  });

  it("does not merge distinct advisory identifiers into one acceptance", () => {
    const rows = extractAuditRows(
      auditPayload({
        braces: { severity: "high", via: [advisory("high"), advisory("high", OTHER_URL)], nodes: ["node_modules/braces"], fixAvailable: false },
      }),
    );
    expect(rows.rows[0].advisoryIds).toEqual([BRACES_ADVISORY, "GHSA-aaaa-bbbb-cccc"].sort());
  });

  it("does not lose a new root advisory introduced deep in the chain", () => {
    const full = approvedResidualAudit();
    // A second root arrives under micromatch; tailwindcss inherits through it.
    full.vulnerabilities.micromatch.via = ["braces", "newdep"];
    full.vulnerabilities.newdep = { severity: "high", via: [advisory("high", OTHER_URL)], nodes: ["node_modules/newdep"], fixAvailable: false };
    const rows = extractAuditRows(full);
    const tw = rows.rows.find((x: { package: string }) => x.package === "tailwindcss");
    expect(tw?.advisoryIds).toContain("GHSA-aaaa-bbbb-cccc");
    const r = run(full, cleanProductionAudit(), MANIFEST, TODAY, lockPayload({ "node_modules/newdep": { dev: true } }));
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("UNAPPROVED_ADVISORY_ID");
  });

  it("fails when a new parent joins an approved propagation chain", () => {
    const full = approvedResidualAudit();
    full.vulnerabilities.tailwindcss.via = ["chokidar", "fast-glob", "micromatch", "readdirp"];
    full.vulnerabilities.readdirp = { severity: "high", via: ["braces"], nodes: ["node_modules/readdirp"], fixAvailable: MAJOR_FIX_TW };
    const r = run(full, cleanProductionAudit(), MANIFEST, TODAY, lockPayload({ "node_modules/readdirp": { dev: true } }));
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("PROPAGATION_CHAIN_CHANGED");
  });
});

describe("it fails for any CRITICAL, which is never exceptionable", () => {
  it("fails on a critical even though a matching exception exists", () => {
    const full = approvedResidualAudit();
    full.vulnerabilities.braces.severity = "critical";
    const r = run(full, cleanProductionAudit());
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("FULL_TREE_CRITICAL");
    // It is also not accepted, and its now-unmatched entry is reported stale.
    expect(r.accepted.map((a: { package: string }) => a.package)).not.toContain("braces");
    expect(codes(r)).toContain("STALE_OR_ORPHANED_EXCEPTION");
  });

  it("fails on a production critical", () => {
    const prod = cleanProductionAudit();
    prod.vulnerabilities["pg"] = { severity: "critical", via: [advisory("critical", "https://github.com/advisories/GHSA-dddd-eeee-ffff")], nodes: ["node_modules/pg"], fixAvailable: true };
    const r = run(approvedResidualAudit(), prod);
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("PRODUCTION_HIGH_OR_CRITICAL");
  });
});

describe("it fails when an approved advisory reaches production", () => {
  it("fails when an excepted dev package appears in the production graph", () => {
    const prod = cleanProductionAudit();
    prod.vulnerabilities.braces = { severity: "high", via: [advisory("high")], nodes: ["node_modules/braces"], fixAvailable: false };
    const r = run(approvedResidualAudit(), prod);
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("PRODUCTION_HIGH_OR_CRITICAL");
    expect(codes(r)).toContain("APPROVED_ADVISORY_REACHABLE_FROM_PRODUCTION");
    expect(r.accepted.map((a: { package: string }) => a.package)).not.toContain("braces");
  });

  it("fails when the lockfile stops marking an accepted path dev-only", () => {
    // Second, independent proof of `devOnly`: the production audit can be clean
    // while the lockfile shows the node is no longer dev-scoped.
    const r = run(approvedResidualAudit(), cleanProductionAudit(), MANIFEST, TODAY, lockPayload({ "node_modules/braces": { dev: false } }));
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("DEV_ONLY_NOT_PROVEN_BY_LOCKFILE");
  });

  it("refuses a manifest that tries to mark an exception non-dev-only", () => {
    const manifest = structuredClone(MANIFEST);
    manifest.exceptions[0].devOnly = false;
    const r = run(approvedResidualAudit(), cleanProductionAudit(), manifest);
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("MANIFEST_INVALID");
  });
});

describe("paths are corroborated against the installed lockfile graph", () => {
  it("fails when an accepted path is absent from the lockfile", () => {
    const lock = lockPayload();
    delete (lock.packages as Record<string, unknown>)["node_modules/micromatch"];
    const r = run(approvedResidualAudit(), cleanProductionAudit(), MANIFEST, TODAY, lock);
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("PATH_NOT_IN_LOCKFILE");
  });

  it("fails when the package installed at a path is not the reported package", () => {
    const full = approvedResidualAudit();
    full.vulnerabilities.braces.nodes = ["node_modules/chokidar"];
    const manifest = structuredClone(MANIFEST);
    const entry = manifest.exceptions.find((e) => e.package === "braces")!;
    entry.paths = ["node_modules/chokidar"];
    const r = run(full, cleanProductionAudit(), manifest, TODAY);
    expect(r.verdict).toBe("FAIL");
    // Two entries now claim node_modules/chokidar, which the manifest rejects,
    // and the path/package mismatch is caught as well.
    expect(codes(r).some((c) => c === "PATH_PACKAGE_MISMATCH" || c === "MANIFEST_INVALID")).toBe(true);
  });

  it("blocks on an unreadable or unsupported lockfile instead of passing", () => {
    for (const bad of [null, {}, { lockfileVersion: 2, packages: {} }, { lockfileVersion: 3 }, { lockfileVersion: 3, packages: {} }]) {
      const r = run(approvedResidualAudit(), cleanProductionAudit(), MANIFEST, TODAY, bad);
      expect(r.verdict).toBe("BLOCKED");
      expect(blockCodes(r)).toContain("LOCKFILE_UNREADABLE");
    }
  });

  it("derives the installed package name from the last node_modules segment", () => {
    const idx = indexLockfile(lockPayload());
    expect(idx.nodes.get("node_modules/@next/eslint-plugin-next/node_modules/fast-glob")).toMatchObject({ name: "fast-glob", dev: true });
    expect(idx.nodes.get("node_modules/@next/eslint-plugin-next")).toMatchObject({ name: "@next/eslint-plugin-next" });
  });

  it("agrees with the REAL committed lockfile for every accepted path", () => {
    const idx = indexLockfile(JSON.parse(read("package-lock.json")));
    expect(idx.ok).toBe(true);
    for (const e of MANIFEST.exceptions) {
      for (const p of e.paths) {
        expect(idx.nodes.has(p), `${p} must exist in the installed lockfile graph`).toBe(true);
        expect(idx.nodes.get(p)).toMatchObject({ name: e.package, dev: true });
      }
    }
  });
});

describe("it fails for a changed or unapproved dependency path", () => {
  it("fails when the observed path differs from the approved one", () => {
    const full = approvedResidualAudit();
    full.vulnerabilities.braces.nodes = ["node_modules/some-new-package"];
    const r = run(full, cleanProductionAudit());
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("DEPENDENCY_PATH_CHANGED");
  });

  it("fails when an approved path disappears but the finding remains", () => {
    const full = approvedResidualAudit();
    full.vulnerabilities["fast-glob"].nodes = ["node_modules/fast-glob"];
    const r = run(full, cleanProductionAudit());
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("DEPENDENCY_PATH_CHANGED");
  });

  it("refuses a path shape it will not interpret, rather than normalizing it", () => {
    for (const bad of [
      "node_modules/../etc/passwd",
      "node_modules\\braces",
      "node_modules//braces",
      "node_modules/braces/",
      "./node_modules/braces",
      "/node_modules/braces",
      "node_modules/.",
      "node_modules/*",
      " node_modules/braces",
      "braces",
      "",
    ]) {
      expect(isAcceptableDependencyPath(bad), `${JSON.stringify(bad)} must be rejected`).toBe(false);
    }
    expect(isAcceptableDependencyPath("node_modules/braces")).toBe(true);
    expect(isAcceptableDependencyPath("node_modules/@next/eslint-plugin-next/node_modules/fast-glob")).toBe(true);
  });

  it("blocks when a HIGH finding reports a path shape it will not interpret", () => {
    const full = approvedResidualAudit();
    full.vulnerabilities.braces.nodes = ["node_modules/../braces"];
    const r = run(full, cleanProductionAudit());
    expect(r.verdict).toBe("BLOCKED");
    expect(blockCodes(r)).toContain("FULL_AUDIT_UNREADABLE");
  });
});

describe("expiry semantics are explicit and inclusive", () => {
  it("passes before the expiry date", () => {
    expect(run(approvedResidualAudit(), cleanProductionAudit(), MANIFEST, "2026-10-04").verdict).toBe("PASS");
  });

  it("still passes ON the expiry date, which is inclusive", () => {
    expect(MANIFEST.exceptions[0].expires).toBe("2026-11-02");
    expect(run(approvedResidualAudit(), cleanProductionAudit(), MANIFEST, "2026-11-02").verdict).toBe("PASS");
  });

  it("fails on the first day after expiry", () => {
    const r = run(approvedResidualAudit(), cleanProductionAudit(), MANIFEST, "2026-11-03");
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("EXCEPTION_EXPIRED");
    expect(r).toMatchObject({ summary: { expiredExceptions: 7, acceptedDevOnlyHigh: 0 } });
  });

  it("documents the inclusive rule in the gate itself", () => {
    expect(read("scripts/ci/dependency-audit-gate.mjs")).toMatch(/`expires` is INCLUSIVE/);
  });

  it("blocks on an invalid evaluation date instead of guessing", () => {
    for (const bad of ["not-a-date", "2026-13-99T00:00:00Z", "", null, 20261103, "2026-11-3"]) {
      const r = run(approvedResidualAudit(), cleanProductionAudit(), MANIFEST, bad as never);
      expect(r.verdict, String(bad)).toBe("BLOCKED");
      expect(blockCodes(r)).toContain("INVALID_EVALUATION_DATE");
    }
  });

  it("blocks on an evaluation date that is not a real calendar date", () => {
    // Several of these match yyyy-mm-dd and sort BEFORE the expiry as strings, so
    // a shape-only check would have let them PASS.
    for (const bad of [
      ...INVALID_CALENDAR_DATES,
      " 2026-11-02",
      "2026-11-02 ",
      "\t2026-11-02",
      "2026-11-02\n",
      null,
      // `undefined` is covered below by calling evaluateAuditGate directly, since
      // run()'s default parameter would substitute TODAY for it.
      20261102,
      {},
      ["2026-11-02"],
    ]) {
      const r = run(approvedResidualAudit(), cleanProductionAudit(), MANIFEST, bad as never);
      expect(r.verdict, JSON.stringify(bad)).toBe("BLOCKED");
      expect(blockCodes(r)).toContain("INVALID_EVALUATION_DATE");
      expect(r.accepted).toEqual([]);
      expect(r.summary).toBeNull();
    }
  });

  it("recognises real calendar dates, including a leap day and the far future", () => {
    for (const ok of ["2024-02-29", "2026-01-01", "2026-11-02"]) {
      const r = run(approvedResidualAudit(), cleanProductionAudit(), MANIFEST, ok);
      expect(blockCodes(r), ok).toEqual([]);
      expect(r.verdict, ok).toBe("PASS");
    }
    // Valid, so it is evaluated — and it is long after the expiry.
    const far = run(approvedResidualAudit(), cleanProductionAudit(), MANIFEST, "9999-12-31");
    expect(blockCodes(far)).toEqual([]);
    expect(far.verdict).toBe("FAIL");
    expect(codes(far)).toContain("EXCEPTION_EXPIRED");
  });

  it("blocks on a manifest expiry that is not a real calendar date, and never accepts", () => {
    for (const bad of [...INVALID_CALENDAR_DATES, "2026-99-99", " 2026-11-02", "2026-11-02 ", null, 20261102]) {
      for (const now of [TODAY, "2026-12-31"]) {
        const m = structuredClone(MANIFEST);
        m.exceptions[0].expires = bad as never;
        const r = run(approvedResidualAudit(), cleanProductionAudit(), m, now);
        expect(r.verdict, `${JSON.stringify(bad)} @ ${now}`).toBe("BLOCKED");
        expect(blockCodes(r)).toContain("MANIFEST_INVALID");
        expect(r.accepted).toEqual([]);
      }
    }
  });

  it("blocks on a missing manifest expiry or creation date", () => {
    for (const field of ["expires", "created"]) {
      const m = structuredClone(MANIFEST);
      delete m.exceptions[0][field];
      const r = run(approvedResidualAudit(), cleanProductionAudit(), m);
      expect(r.verdict, field).toBe("BLOCKED");
      expect(blockCodes(r)).toContain("MANIFEST_INVALID");
    }
  });

  it("accepts a real leap-day expiry in the manifest", () => {
    const m = structuredClone(MANIFEST);
    for (const e of m.exceptions) e.expires = "2028-02-29";
    expect(run(approvedResidualAudit(), cleanProductionAudit(), m).verdict).toBe("PASS");
  });

  it("blocks when no evaluation date is supplied at all", () => {
    // Called directly, so the test helper's default cannot stand in for it.
    const r = evaluateAuditGate({
      full: extractAuditRows(approvedResidualAudit()),
      prod: extractAuditRows(cleanProductionAudit()),
      manifest: MANIFEST,
      lockfile: indexLockfile(lockPayload()),
      now: undefined,
    });
    expect(r.verdict).toBe("BLOCKED");
    expect(blockCodes(r)).toContain("INVALID_EVALUATION_DATE");
  });
});

describe("it fails when a safe compatible version starts to exist", () => {
  it("fails the moment npm reports an in-range fix for an excepted advisory", () => {
    const full = approvedResidualAudit();
    full.vulnerabilities.braces.fixAvailable = true;
    const r = run(full, cleanProductionAudit());
    expect(r.verdict).toBe("FAIL");
    expect(codes(r)).toContain("SAFE_COMPATIBLE_VERSION_NOW_EXISTS");
  });

  it("does not treat a major-only fix as a compatible fix", () => {
    expect(codes(run(approvedResidualAudit(), cleanProductionAudit()))).not.toContain("SAFE_COMPATIBLE_VERSION_NOW_EXISTS");
  });
});

describe("it BLOCKS rather than passes on unusable audit output", () => {
  it("blocks on a null or array payload", () => {
    for (const bad of [null, [], "not json at all", 42]) {
      expect(extractAuditRows(bad).ok).toBe(false);
    }
  });

  it("blocks on an unknown schema, not just invalid JSON", () => {
    for (const shape of [{}, { vulnerabilities: null }, { vulnerabilities: [] }, { auditReportVersion: 2 }, { vulnerabilities: {}, metadata: { vulnerabilities: 7 } }]) {
      expect(extractAuditRows(shape).ok).toBe(false);
    }
  });

  it("blocks when the full or production audit is unusable", () => {
    expect(blockCodes(run(null, cleanProductionAudit()))).toContain("FULL_AUDIT_UNREADABLE");
    expect(blockCodes(run(approvedResidualAudit(), "truncated {"))).toContain("PRODUCTION_AUDIT_UNREADABLE");
  });

  it("refuses an unknown `via` package reference instead of losing an advisory", () => {
    const res = extractAuditRows(
      auditPayload({ tailwindcss: { severity: "high", via: ["ghost-package"], nodes: ["node_modules/tailwindcss"], fixAvailable: false } }),
    );
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toContain("ghost-package");
  });

  it("refuses a via entry that is neither an advisory object nor a package name", () => {
    const res = extractAuditRows(
      auditPayload({ braces: { severity: "high", via: [42], nodes: ["node_modules/braces"], fixAvailable: false } }),
    );
    expect(res.ok).toBe(false);
  });

  it("refuses an advisory URL that is not a GHSA identifier", () => {
    const res = extractAuditRows(
      auditPayload({ braces: { severity: "high", via: [advisory("high", "https://example.com/whatever")], nodes: ["node_modules/braces"], fixAvailable: false } }),
    );
    expect(res.ok).toBe(false);
  });

  it("resolves a very deep chain without hanging and without losing the root", () => {
    const vulns: Record<string, RawVuln> = {
      root: { severity: "high", via: [advisory("high", OTHER_URL)], nodes: ["node_modules/root"], fixAvailable: false },
    };
    const DEPTH = 200;
    for (let i = 0; i < DEPTH; i++) {
      vulns[`p${i}`] = { severity: "high", via: [i === 0 ? "root" : `p${i - 1}`], nodes: [`node_modules/p${i}`], fixAvailable: false };
    }
    const started = Date.now();
    const res = extractAuditRows(auditPayload(vulns));
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(res.ok).toBe(true);
    expect(res.rows.find((r: { package: string }) => r.package === `p${DEPTH - 1}`)?.advisoryIds).toEqual(["GHSA-aaaa-bbbb-cccc"]);
  });

  it("carries two distinct roots separately rather than collapsing them", () => {
    const res = extractAuditRows(
      auditPayload({
        a: { severity: "high", via: [advisory("high", BRACES_URL)], nodes: ["node_modules/a"], fixAvailable: false },
        b: { severity: "high", via: [advisory("high", OTHER_URL)], nodes: ["node_modules/b"], fixAvailable: false },
        c: { severity: "high", via: ["a", "b"], nodes: ["node_modules/c"], fixAvailable: false },
      }),
    );
    expect(res.rows.find((r: { package: string }) => r.package === "c")?.advisoryIds).toEqual(
      ["GHSA-aaaa-bbbb-cccc", BRACES_ADVISORY].sort(),
    );
  });

  it("terminates on a cyclic via chain instead of hanging", () => {
    const res = extractAuditRows(
      auditPayload({
        a: { severity: "high", via: ["b"], nodes: ["node_modules/a"], fixAvailable: false },
        b: { severity: "high", via: ["a"], nodes: ["node_modules/b"], fixAvailable: false },
      }),
    );
    // No advisory is reachable, so the shape is refused rather than accepted.
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/resolves to no advisory identifier/);
  });

  it("never emits PASS together with a failure or a block", () => {
    const cases = [
      run(null, cleanProductionAudit()),
      run(approvedResidualAudit(), cleanProductionAudit(), { schemaVersion: 1, exceptions: [] }),
      run(auditPayload({}), auditPayload({})),
    ];
    for (const r of cases) expect(r.verdict).not.toBe("PASS");
  });
});

describe("D. the child-process boundary cannot produce a false PASS", () => {
  const stub = (res: Record<string, unknown>) => () => res;
  const okJson = JSON.stringify(auditPayload({}));

  it("accepts exit 0 with valid JSON", () => {
    const r = runAudit([], { spawn: stub({ status: 0, stdout: okJson, stderr: "" }) });
    expect(r.ok).toBe(true);
  });

  it("accepts exit 1, which only means findings were present", () => {
    const r = runAudit([], { spawn: stub({ status: 1, stdout: JSON.stringify(approvedResidualAudit()), stderr: "" }) });
    expect(r.ok).toBe(true);
    expect(r.rows.length).toBeGreaterThan(0);
  });

  it("blocks on an exit status above 1", () => {
    for (const status of [2, 9, 127]) {
      const r = runAudit([], { spawn: stub({ status, stdout: okJson, stderr: "" }) });
      expect(r.ok).toBe(false);
      expect(r.errors.join(" ")).toContain(`status ${status}`);
    }
  });

  it("blocks on signal termination even with usable stdout", () => {
    const r = runAudit([], { spawn: stub({ status: null, signal: "SIGKILL", stdout: okJson, stderr: "" }) });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("SIGKILL");
  });

  it("blocks on a spawn error", () => {
    const r = runAudit([], { spawn: stub({ error: Object.assign(new Error("nope"), { code: "ENOENT" }), stdout: "", stderr: "" }) });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("ENOENT");
  });

  it("blocks on a timeout, which spawnSync reports as a signal plus ETIMEDOUT", () => {
    const r = runAudit([], { spawn: stub({ status: null, signal: "SIGTERM", error: Object.assign(new Error("t"), { code: "ETIMEDOUT" }), stdout: "", stderr: "" }) });
    expect(r.ok).toBe(false);
  });

  it("passes a finite timeout so CI cannot hang forever", () => {
    const seen: Record<string, unknown>[] = [];
    runAudit([], {
      spawn: (_cmd: string, _args: string[], opts: Record<string, unknown>) => {
        seen.push(opts);
        return { status: 0, stdout: okJson, stderr: "" };
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ timeout: AUDIT_TIMEOUT_MS });
    expect(AUDIT_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("blocks on empty, whitespace-only or truncated stdout", () => {
    for (const stdout of ["", "   \n", "{\"vulnerabilities\":", "}"]) {
      expect(runAudit([], { spawn: stub({ status: 1, stdout, stderr: "" }) }).ok).toBe(false);
    }
  });

  it("ignores stderr entirely, so it cannot inject a verdict", () => {
    const r = runAudit([], {
      spawn: stub({ status: 0, stdout: okJson, stderr: JSON.stringify(approvedResidualAudit()) + "\nPASS\n" }),
    });
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([]);
  });

  it("blocks when no exit status is reported at all", () => {
    expect(runAudit([], { spawn: stub({ status: null, stdout: okJson, stderr: "" }) }).ok).toBe(false);
    expect(runAudit([], { spawn: (() => undefined) as never }).ok).toBe(false);
  });
});

describe("the manifest cannot be widened", () => {
  const broken = (mutate: (m: ExceptionManifest) => void) => {
    const m = structuredClone(MANIFEST);
    mutate(m);
    return validateManifest(m);
  };

  it("rejects a wildcard package name", () => {
    for (const bad of ["*", "brace*", "?races"]) {
      expect(broken((m) => { m.exceptions[0].package = bad; }).ok).toBe(false);
    }
  });

  it("rejects a padded package name", () => {
    expect(broken((m) => { m.exceptions[0].package = " braces"; }).ok).toBe(false);
  });

  it("rejects a wildcard advisory identifier", () => {
    expect(broken((m) => { m.exceptions[0].advisoryIds = ["GHSA-*"]; }).ok).toBe(false);
  });

  it("rejects a repeated advisory identifier", () => {
    expect(broken((m) => { m.exceptions[0].advisoryIds = [BRACES_ADVISORY, BRACES_ADVISORY.toUpperCase()]; }).ok).toBe(false);
  });

  it("rejects every path trick", () => {
    for (const bad of ["node_modules/*", "*", "src/lib", "node_modules/../x", "node_modules//braces", "node_modules/braces/", "./node_modules/braces"]) {
      expect(broken((m) => { m.exceptions[0].paths = [bad]; }).ok, bad).toBe(false);
    }
  });

  it("rejects a repeated path inside one entry", () => {
    expect(broken((m) => { m.exceptions[0].paths = ["node_modules/braces", "node_modules/braces"]; }).ok).toBe(false);
  });

  it("rejects two entries claiming the same installed path, in any case spelling", () => {
    const v = broken((m) => {
      const clone = structuredClone(m.exceptions[0]);
      clone.package = "micromatch";
      clone.paths = ["NODE_MODULES/BRACES".toLowerCase()];
      m.exceptions.push(clone);
    });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/already claimed|duplicates/);
  });

  it("rejects an empty advisory or path list", () => {
    expect(broken((m) => { m.exceptions[0].advisoryIds = []; }).ok).toBe(false);
    expect(broken((m) => { m.exceptions[0].paths = []; }).ok).toBe(false);
  });

  it("rejects a missing owner, reason or expiry", () => {
    for (const field of ["owner", "reason", "expires", "created", "futureRemediation", "devOnly", "inheritedFrom", "advisoryIds", "paths", "package"]) {
      const v = broken((m) => { delete m.exceptions[0][field]; });
      expect(v.ok, `${field} must be required`).toBe(false);
      expect(v.errors.join(" ")).toContain(field);
    }
  });

  it("rejects a hand-wave reason", () => {
    expect(broken((m) => { m.exceptions[0].reason = "later"; }).ok).toBe(false);
  });

  it("rejects a non-ISO or reversed date pair", () => {
    expect(broken((m) => { m.exceptions[0].expires = "02/11/2026"; }).ok).toBe(false);
    expect(broken((m) => { m.exceptions[0].expires = m.exceptions[0].created; }).ok).toBe(false);
    expect(broken((m) => { m.exceptions[0].expires = "2026-09-01"; }).ok).toBe(false);
  });

  it("marks a date that is not on the calendar as uninterpretable, not merely wrong", () => {
    for (const bad of [...INVALID_CALENDAR_DATES, "2026-99-99"]) {
      for (const field of ["expires", "created"] as const) {
        const v = broken((m) => { m.exceptions[0][field] = bad; });
        expect(v.ok, `${field} ${bad}`).toBe(false);
        expect(v.uninterpretable.join(" "), `${field} ${bad}`).toContain(`exceptions[0].${field}`);
      }
    }
    // An interpretable but disallowed pair stays an ordinary FAIL, not a BLOCK.
    expect(broken((m) => { m.exceptions[0].expires = "2026-09-01"; }).uninterpretable).toEqual([]);
  });

  it("rejects a duplicate entry, including a case-shifted package name", () => {
    expect(broken((m) => { m.exceptions.push(structuredClone(m.exceptions[0])); }).errors.join(" ")).toContain("duplicates");
    const v = broken((m) => {
      const clone = structuredClone(m.exceptions[0]);
      clone.package = "BRACES";
      clone.paths = ["node_modules/braces-other"];
      m.exceptions.push(clone);
    });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("duplicates");
  });

  it("rejects a wrong schema version or a non-array exception list", () => {
    expect(broken((m) => { m.schemaVersion = 99; }).ok).toBe(false);
    expect(broken((m) => { m.exceptions = {} as never; }).ok).toBe(false);
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest([] as never).ok).toBe(false);
  });
});

describe("the committed manifest is narrow, owned and dated", () => {
  it("validates as written", () => {
    const v = validateManifest(MANIFEST);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    expect(MANIFEST.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
  });

  it("accepts exactly the seven dev-only packages of one root advisory", () => {
    expect(MANIFEST.exceptions).toHaveLength(7);
    expect(MANIFEST.exceptions.map((e) => e.package).sort()).toEqual([
      "@next/eslint-plugin-next",
      "braces",
      "chokidar",
      "eslint-config-next",
      "fast-glob",
      "micromatch",
      "tailwindcss",
    ]);
    for (const e of MANIFEST.exceptions) {
      expect(e.advisoryIds).toEqual([BRACES_ADVISORY]);
      expect(e.devOnly).toBe(true);
      expect(e.owner).toBe("ZHARFA Engineering");
      expect(e.created).toBe("2026-10-03");
      expect(e.expires).toBe("2026-11-02");
      expect(e.futureRemediation).toContain("dependency-audit-governance");
    }
  });

  it("names no production dependency", () => {
    const prodDeps = new Set(Object.keys(JSON.parse(read("package.json")).dependencies ?? {}));
    for (const e of MANIFEST.exceptions) {
      expect(prodDeps.has(e.package), `${e.package} is a production dependency`).toBe(false);
    }
  });

  it("carries no secret-shaped or environment data", () => {
    const raw = read(MANIFEST_RELATIVE_PATH);
    expect(raw).not.toMatch(/(password|secret|token|api[_-]?key|postgres(ql)?:\/\/|redis:\/\/)/i);
    expect(raw).not.toMatch(/process\.env/);
  });
});

describe("the wiring cannot be quietly weakened", () => {
  const ci = read(".github/workflows/ci.yml");
  // YAML comments are prose and may legitimately quote the old command while
  // explaining why it was replaced; only EXECUTED lines are the contract.
  const ciRuns = ci
    .split("\n")
    .filter((l) => /^\s*(run:|-\s)/.test(l) && !/^\s*#/.test(l))
    .join("\n");
  const gate = read("scripts/ci/dependency-audit-gate.mjs");
  const gateCode = gate.split("\n").filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join("\n");
  const pkg = JSON.parse(read("package.json"));

  it("makes CI call the governed gate", () => {
    expect(pkg.scripts["gate:dependency-audit"]).toBe("node scripts/ci/dependency-audit-gate.mjs");
    expect(ciRuns).toContain("npm run gate:dependency-audit");
  });

  it("stops CI from deciding straight from a raw audit exit code", () => {
    expect(ciRuns).not.toMatch(/npm audit --audit-level/);
    expect(ciRuns).not.toMatch(/npm audit\b(?![^\n]*--json)/);
  });

  it("keeps the required status-check job name unchanged", () => {
    // `main`'s branch ruleset requires exactly this context; renaming the JOB
    // would silently stop the required check from ever reporting.
    expect(ci).toContain("Validate (prisma, types, lint, test, build)");
  });

  it("keeps the gate auditing the FULL tree, not just production", () => {
    expect(gateCode).toContain("runAudit([])");
    expect(gateCode).toContain('runAudit(["--omit=dev"])');
  });

  it("uses no audit-level flag, ignore file or suppression switch anywhere", () => {
    for (const forbidden of ["--audit-level", "--force", "audit-ignore", "nsprc", "auditLevel"]) {
      expect(gateCode, `${forbidden} must not appear in executable gate code`).not.toContain(forbidden);
    }
    expect(ciRuns).not.toContain("npm audit fix");
  });

  it("exits 2 for BLOCKED and 1 for FAIL, so neither can read as success", () => {
    expect(gate).toMatch(/verdict === "BLOCKED"[\s\S]{0,200}process\.exit\(2\)/);
    expect(gate).toMatch(/verdict === "FAIL"[\s\S]{0,200}process\.exit\(1\)/);
  });

  it("treats a stale exception as a failure, not a warning", () => {
    expect(gateCode).toContain("STALE_OR_ORPHANED_EXCEPTION");
    // The old behaviour pushed it onto `warnings`; prove it is a failure now.
    expect(gateCode).toMatch(/failures\.push\(\{\s*code:\s*"STALE_OR_ORPHANED_EXCEPTION"/);
    expect(gateCode).not.toMatch(/warnings\.push\(\{\s*code:\s*"STALE_EXCEPTION"/);
  });
});

describe("the real CLI never prints PASS or exits 0 when it cannot decide", () => {
  /**
   * The REAL gate runs in a child process with only its inputs replaced: the two
   * `npm audit` spawns, the manifest, the lockfile and the clock. Fixtures travel
   * in environment variables and the preload is a data: URL, so this stays free
   * of network access and filesystem writes.
   */
  const PRELOAD = `data:text/javascript,${encodeURIComponent(`
    import cp from "node:child_process";
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    const env = process.env;
    const realSpawn = cp.spawnSync, realRead = fs.readFileSync, realExists = fs.existsSync;
    const fixtureFor = (p) =>
      String(p).endsWith("dependency-audit-exceptions.json") ? env.GATE_FIX_MANIFEST
      : String(p).endsWith("package-lock.json") ? env.GATE_FIX_LOCK
      : undefined;
    cp.spawnSync = (cmd, args, opts) => cmd === "npm"
      ? { status: 1, signal: null, error: null, stderr: "", stdout: args.includes("--omit=dev") ? env.GATE_FIX_PROD : env.GATE_FIX_FULL }
      : realSpawn(cmd, args, opts);
    fs.readFileSync = (p, ...rest) => fixtureFor(p) ?? realRead(p, ...rest);
    fs.existsSync = (p) => fixtureFor(p) !== undefined || realExists(p);
    syncBuiltinESMExports();
    Date.prototype.toISOString = function () { return env.GATE_FIX_TODAY + "T00:00:00.000Z"; };
  `)}`;

  function runCli(today: string, manifest: unknown = MANIFEST) {
    const res = spawnSync(process.execPath, ["--import", PRELOAD, join(REPO, "scripts", "ci", "dependency-audit-gate.mjs")], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 60_000,
      env: {
        ...process.env,
        GATE_FIX_FULL: JSON.stringify(approvedResidualAudit()),
        GATE_FIX_PROD: JSON.stringify(cleanProductionAudit()),
        GATE_FIX_MANIFEST: JSON.stringify(manifest),
        GATE_FIX_LOCK: JSON.stringify(lockPayload()),
        GATE_FIX_TODAY: today,
      },
    });
    return { status: res.status, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
  }

  it("control: exits 0 and prints PASS for the approved set on the expiry date", () => {
    const r = runCli("2026-11-02");
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain("] PASS");
    expect(r.out).toContain(ACCEPTED_LABEL);
  }, 60_000);

  it("control: exits 1 without PASS on the first day after expiry", () => {
    const r = runCli("2026-11-03");
    expect(r.status, r.out).toBe(1);
    expect(r.out).toContain("EXCEPTION_EXPIRED");
    expect(r.out).not.toMatch(/\bPASS\b/);
  }, 60_000);

  it("exits 2 without PASS on an evaluation date that is not on the calendar", () => {
    const r = runCli("2026-02-30");
    expect(r.status, r.out).toBe(2);
    expect(r.out).toContain("BLOCK INVALID_EVALUATION_DATE");
    expect(r.out).not.toMatch(/\bPASS\b/);
    expect(r.out).not.toContain(ACCEPTED_LABEL);
  }, 60_000);

  it("exits 2 without PASS on a manifest expiry that is not on the calendar", () => {
    const m = structuredClone(MANIFEST);
    for (const e of m.exceptions) e.expires = "2026-99-99";
    const r = runCli(TODAY, m);
    expect(r.status, r.out).toBe(2);
    expect(r.out).toContain("BLOCK MANIFEST_INVALID");
    expect(r.out).not.toMatch(/\bPASS\b/);
    expect(r.out).not.toContain(ACCEPTED_LABEL);
  }, 60_000);
});
