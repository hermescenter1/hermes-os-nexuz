/**
 * PHASE 99 — dependency-remediation retest evidence, aligned with the GOVERNED
 * dependency-audit contract.
 *
 * Two kinds of evidence are kept here, and they are deliberately different:
 *
 *   A. The HIGH advisories remediated in Phase 99 (P99-DEP-001..014) are still
 *      gone from the resolved lockfile — in EVERY copy — and the three fixes that
 *      a version bump alone cannot reach are still held by their `overrides`
 *      entries. Pure filesystem reads; deleting an override reintroduces an
 *      advisory while every version spec still looks current, so it is asserted.
 *
 *   B. The CURRENT governed-audit contract holds against the LIVE `npm audit`,
 *      evaluated through the real gate (`scripts/ci/dependency-audit-gate.mjs`):
 *        - production dependencies carry exactly 0 CRITICAL and 0 HIGH,
 *        - the full tree carries exactly 0 CRITICAL,
 *        - every remaining full-tree HIGH maps to EXACTLY ONE approved, in-force,
 *          dev-only, production-unreachable exception — matched by advisory id and
 *          dependency path, never by a bare count,
 *        - no manifest entry is stale,
 *        - and the gate's own verdict on the live state is PASS.
 *      A new, runtime, expired, unknown or unexcepted HIGH must turn this RED,
 *      proven in C by mutating the residual shape through the real evaluator.
 *
 * Why this replaced the old final assertion: the previous version read the
 * committed `phase99-dependency-review.json` and checked `totals.all.HIGH === 0`.
 * Under the governed contract the full tree intentionally carries dated dev-only
 * HIGH acceptances (braces `GHSA-vfj7-8cjw-p6xm` and its inheritors), so a static
 * artifact claiming zero HIGH is not the source of truth and can silently go
 * stale. The live audit + committed manifest + real gate are used instead, which
 * cannot be quiet while a real advisory is present.
 *
 * Part B runs `npm audit` and therefore needs network + an installed tree; an
 * unreadable audit FAILS (fail-closed), it is never skipped. Parts A and C are
 * pure (filesystem / synthetic), no network, no install, no database writes.
 */
import { describe, it, expect, beforeAll } from "vitest";
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = (p: string): any => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const lock = readJson("package-lock.json") as {
  lockfileVersion?: number;
  packages: Record<string, { version?: string }>;
};
const pkg = readJson("package.json") as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

/** Every resolved copy of a package name anywhere in the tree. */
function resolvedVersions(name: string): string[] {
  const out: string[] = [];
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path || !entry?.version) continue;
    const leaf = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    if (leaf === name) out.push(entry.version);
  }
  return out;
}

/** Numeric semver compare, sufficient for the release lines in play here. */
function gte(a: string, b: string): boolean {
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

const sortedCopy = (a: string[]): string[] => [...a].sort();
const sameSet = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sa = sortedCopy(a);
  const sb = sortedCopy(b);
  return sa.every((x, i) => x === sb[i]);
};

/* ───────────────────────── A. Phase-99 remediation evidence ───────────────── */

/**
 * Each entry is the advisory's own fixed boundary, so the assertion states the
 * security fact rather than "whatever we happen to have installed".
 */
const HIGH_ADVISORY_FIXES = [
  { finding: "P99-DEP-001", name: "brace-expansion", minimumByLine: { "1": "1.1.18", "5": "5.0.9" } as Record<string, string> },
  { finding: "P99-DEP-002", name: "fast-uri", minimum: "3.1.6" },
  { finding: "P99-DEP-003", name: "js-yaml", minimum: "4.3.1" },
  { finding: "P99-DEP-004", name: "next", minimum: "15.5.23" },
  { finding: "P99-DEP-005", name: "postcss", minimum: "8.5.23" },
  { finding: "P99-DEP-006", name: "sharp", minimum: "0.35.0" },
  { finding: "P99-DEP-007", name: "undici", minimum: "7.28.1" },
  { finding: "P99-DEP-013", name: "browserslist", minimum: "4.28.7" },
  { finding: "P99-DEP-014", name: "mysql2", minimum: "3.24.0" },
] as const;

describe("PHASE 99 — every remediated HIGH advisory is gone from the resolved lockfile", () => {
  for (const advisory of HIGH_ADVISORY_FIXES) {
    it(`${advisory.finding} — ${advisory.name} resolves above the fixed boundary in every copy`, () => {
      const versions = resolvedVersions(advisory.name);
      expect(versions.length, `${advisory.name} is not present in the lockfile at all`).toBeGreaterThan(0);

      for (const v of versions) {
        if ("minimumByLine" in advisory && advisory.minimumByLine) {
          // brace-expansion has two vulnerable ranges on two major lines, so the
          // boundary depends on which line this copy is on.
          const line = v.split(".")[0];
          const minimum = advisory.minimumByLine[line];
          expect(minimum, `${advisory.name}@${v} is on an unreviewed major line`).toBeDefined();
          expect(gte(v, minimum), `${advisory.name}@${v} is below the fixed ${minimum}`).toBe(true);
        } else {
          const minimum = (advisory as { minimum: string }).minimum;
          expect(gte(v, minimum), `${advisory.name}@${v} is below the fixed ${minimum}`).toBe(true);
        }
      }
    });
  }

  it("resolves a single copy of next, postcss, sharp and mysql2 — no vulnerable nested duplicate survives", () => {
    for (const name of ["next", "postcss", "sharp", "mysql2"]) {
      expect(resolvedVersions(name), `${name} resolves to more than one version`).toHaveLength(1);
    }
  });
});

describe("PHASE 99 — the overrides holding the transitive fixes are present", () => {
  it("pins postcss, sharp and mysql2, which no version spec can otherwise reach", () => {
    expect(pkg.overrides?.postcss, "postcss override missing").toBeDefined();
    expect(pkg.overrides?.sharp, "sharp override missing").toBeDefined();
    expect(gte(pkg.overrides!.postcss, "8.5.23")).toBe(true);
    expect(gte(pkg.overrides!.sharp, "0.35.0")).toBe(true);
    expect(pkg.overrides?.mysql2, "mysql2 override missing").toBeDefined();
    expect(gte(pkg.overrides!.mysql2, "3.24.0")).toBe(true);
  });

  it("keeps next on the remediated patch release", () => {
    expect(pkg.dependencies?.next).toBeDefined();
    expect(gte(pkg.dependencies!.next.replace(/^[^0-9]*/, ""), "15.5.23")).toBe(true);
  });
});

/* ───────────── B. The governed contract against the LIVE audit ─────────────── */

describe("PHASE 99 — the governed audit contract holds against the live npm audit", () => {
  const manifest = readJson(MANIFEST_RELATIVE_PATH) as {
    exceptions: Array<{ package: string; advisoryIds: string[]; paths: string[]; devOnly: boolean; expires: string }>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lockIndex = indexLockfile(lock) as any;
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

  it("observes a readable full and production audit (an unreadable audit fails closed, it is not skipped)", () => {
    expect(lockIndex.ok, (lockIndex.errors ?? []).join("; ")).toBe(true);
    expect(full.ok, (full.errors ?? []).join("; ")).toBe(true);
    expect(prod.ok, (prod.errors ?? []).join("; ")).toBe(true);
  });

  it("production dependencies carry exactly 0 CRITICAL and 0 HIGH", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(prod.rows.filter((r: any) => r.severity === "CRITICAL").map((r: any) => r.package)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(prod.rows.filter((r: any) => r.severity === "HIGH").map((r: any) => r.package)).toEqual([]);
  });

  it("the full dependency tree carries exactly 0 CRITICAL", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(full.rows.filter((r: any) => r.severity === "CRITICAL").map((r: any) => r.package)).toEqual([]);
  });

  it("every full-tree HIGH maps to exactly one approved dev-only, production-unreachable, unexpired exception — by advisory id and path, not by count", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highs = full.rows.filter((r: any) => r.severity === "HIGH");
    expect(highs.length, "expected at least one accepted dev-only HIGH to exercise the contract").toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prodPackages = new Set(prod.rows.map((r: any) => r.package));

    for (const r of highs) {
      const matches = manifest.exceptions.filter(
        (e) => String(e.package).toLowerCase() === String(r.package).toLowerCase() && sameSet(e.advisoryIds, r.advisoryIds),
      );
      expect(matches.length, `HIGH ${r.package} [${r.advisoryIds.join(",")}] is not approved by exactly one exception`).toBe(1);
      const e = matches[0];

      // advisory id + dependency path mapping
      expect(sameSet(e.paths, r.paths), `path set mismatch for ${r.package}: audit=${r.paths} manifest=${e.paths}`).toBe(true);
      // dev-only, proven twice: manifest flag AND lockfile dev:true on every node
      expect(e.devOnly, `${r.package} exception is not devOnly`).toBe(true);
      for (const p of r.paths as string[]) {
        expect(lockIndex.nodes.get(p)?.dev, `${p} is not dev:true in the lockfile`).toBe(true);
      }
      // production-unreachable
      expect(prodPackages.has(r.package), `${r.package} is reachable from production`).toBe(false);
      // an in-range fix would make the exception obsolete
      expect(r.fixAvailableInRange, `${r.package} now has an in-range fix and must be remediated, not excepted`).toBe(false);
      // expiry is inclusive
      expect(NOW <= String(e.expires), `${r.package} exception expired on ${e.expires} (evaluated ${NOW})`).toBe(true);
    }
  });

  it("no exception is stale — every manifest entry is claimed by a current HIGH", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const highs = full.rows.filter((r: any) => r.severity === "HIGH");
    for (const e of manifest.exceptions) {
      const claimed = highs.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => String(r.package).toLowerCase() === String(e.package).toLowerCase() && sameSet(e.advisoryIds, r.advisoryIds),
      );
      expect(claimed, `exception for ${e.package} [${e.advisoryIds.join(",")}] matches no current HIGH (stale)`).toBe(true);
    }
  });

  it("the real gate's verdict on the live committed state is PASS, with no blocks and no failures", () => {
    expect(verdict.blocks, JSON.stringify(verdict.blocks)).toHaveLength(0);
    expect(verdict.failures, JSON.stringify(verdict.failures)).toHaveLength(0);
    expect(verdict.verdict).toBe("PASS");
  });
});

/* ───────────── C. The contract fails closed (synthetic, deterministic) ─────── */

describe("PHASE 99 — the governed contract fails closed on every weakening", () => {
  const BRACES = "GHSA-vfj7-8cjw-p6xm";
  const MAJOR_FIX = { name: "tailwindcss", version: "4.0.0", isSemVerMajor: true };
  const NOW = "2026-10-15"; // inside the exception window (expires 2026-11-02)

  type RawVuln = { severity: string; via: unknown[]; nodes?: string[]; fixAvailable?: unknown };
  const payload = (vulns: Record<string, RawVuln>) => ({
    auditReportVersion: 2,
    vulnerabilities: vulns,
    metadata: { vulnerabilities: {} },
  });
  const advObj = (url: string, severity = "high") => ({ source: 1, name: "braces", dependency: "braces", title: "stack exhaustion", url, severity, range: "*" });
  const bracesHigh = (): RawVuln => ({
    severity: "high",
    via: [advObj(`https://github.com/advisories/${BRACES}`)],
    nodes: ["node_modules/braces"],
    fixAvailable: MAJOR_FIX,
  });

  const lockOf = (entries: Array<{ path: string; name: string; dev?: boolean }>) => {
    const nodes = new Map<string, { dev: boolean; name: string; version: string }>();
    for (const e of entries) nodes.set(e.path, { dev: e.dev ?? true, name: e.name, version: "1.0.0" });
    return { ok: true, nodes, errors: [] as string[] };
  };
  const BRACES_LOCK = lockOf([{ path: "node_modules/braces", name: "braces" }]);

  const bracesEntry = (o: Record<string, unknown> = {}) => ({
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

  it("baseline control: the approved residual shape PASSES, so the RED cases below isolate the mutation", () => {
    const v = evaluateAuditGate({
      full: extractAuditRows(payload({ braces: bracesHigh() })),
      prod: cleanProd(),
      manifest: manifestWith([bracesEntry()]),
      lockfile: BRACES_LOCK,
      now: NOW,
    });
    expect(v.verdict, JSON.stringify(v.failures ?? v.blocks)).toBe("PASS");
  });

  it("a NEW unapproved HIGH (novel advisory, no manifest entry) fails", () => {
    const full = extractAuditRows(
      payload({
        braces: bracesHigh(),
        "evil-pkg": {
          severity: "high",
          via: [advObj("https://github.com/advisories/GHSA-aaaa-bbbb-cccc")],
          nodes: ["node_modules/evil-pkg"],
          fixAvailable: false,
        },
      }),
    );
    const v = evaluateAuditGate({
      full,
      prod: cleanProd(),
      manifest: manifestWith([bracesEntry()]),
      lockfile: lockOf([
        { path: "node_modules/braces", name: "braces" },
        { path: "node_modules/evil-pkg", name: "evil-pkg" },
      ]),
      now: NOW,
    });
    expect(v.verdict).toBe("FAIL");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(v.failures.some((f: any) => f.code === "UNAPPROVED_HIGH" && f.package === "evil-pkg")).toBe(true);
  });

  it("a RUNTIME (production-reachable) HIGH fails even though its advisory id is in the manifest", () => {
    const v = evaluateAuditGate({
      full: extractAuditRows(payload({ braces: bracesHigh() })),
      prod: extractAuditRows(payload({ braces: bracesHigh() })), // reachable in production
      manifest: manifestWith([bracesEntry()]),
      lockfile: BRACES_LOCK,
      now: NOW,
    });
    expect(v.verdict).toBe("FAIL");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(v.failures.some((f: any) => f.code === "PRODUCTION_HIGH_OR_CRITICAL")).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(v.failures.some((f: any) => f.code === "APPROVED_ADVISORY_REACHABLE_FROM_PRODUCTION")).toBe(true);
  });

  it("an EXPIRED exception fails", () => {
    const v = evaluateAuditGate({
      full: extractAuditRows(payload({ braces: bracesHigh() })),
      prod: cleanProd(),
      manifest: manifestWith([bracesEntry({ expires: "2026-10-02" })]),
      lockfile: BRACES_LOCK,
      now: NOW, // 2026-10-15 > 2026-10-02
    });
    expect(v.verdict).toBe("FAIL");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(v.failures.some((f: any) => f.code === "EXCEPTION_EXPIRED" && f.package === "braces")).toBe(true);
  });

  it("an UNKNOWN / unmappable severity BLOCKS rather than passing", () => {
    const full = extractAuditRows(payload({ foo: { severity: "catastrophic", via: [], nodes: ["node_modules/foo"] } }));
    expect(full.ok).toBe(false);
    const v = evaluateAuditGate({
      full,
      prod: cleanProd(),
      manifest: manifestWith([bracesEntry()]),
      lockfile: BRACES_LOCK,
      now: NOW,
    });
    expect(v.verdict).toBe("BLOCKED");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(v.blocks.some((b: any) => b.code === "FULL_AUDIT_UNREADABLE")).toBe(true);
  });

  it("removing the exception for a real HIGH leaves it unexcepted and fails", () => {
    const v = evaluateAuditGate({
      full: extractAuditRows(payload({ braces: bracesHigh() })),
      prod: cleanProd(),
      manifest: manifestWith([]), // no exceptions at all
      lockfile: BRACES_LOCK,
      now: NOW,
    });
    expect(v.verdict).toBe("FAIL");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(v.failures.some((f: any) => f.code === "UNAPPROVED_HIGH" && f.package === "braces")).toBe(true);
  });

  it("an in-range fix makes the exception obsolete and fails (no silent re-admission)", () => {
    const v = evaluateAuditGate({
      full: extractAuditRows(payload({ braces: { ...bracesHigh(), fixAvailable: true } })),
      prod: cleanProd(),
      manifest: manifestWith([bracesEntry()]),
      lockfile: BRACES_LOCK,
      now: NOW,
    });
    expect(v.verdict).toBe("FAIL");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(v.failures.some((f: any) => f.code === "SAFE_COMPATIBLE_VERSION_NOW_EXISTS" && f.package === "braces")).toBe(true);
  });
});
