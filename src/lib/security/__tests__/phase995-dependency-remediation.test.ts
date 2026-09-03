/**
 * PHASE 99.5 — dependency-remediation retest evidence.
 *
 * These assertions are the retest for the seven Phase 99 HIGH dependency
 * findings forward-ported onto main, plus `nanoid`, which carried a HIGH
 * advisory on main that Phase 99 never saw. A dependency finding is only closed
 * when the advisory is actually gone from the resolved lockfile — not when
 * `npm audit` happened to be quiet on somebody's machine — so this reads the
 * committed lockfile and checks the resolved version of every package that
 * carried a HIGH advisory, including EVERY copy of it.
 *
 * Two of the fixes are not reachable by a version bump alone and are held by an
 * npm `overrides` entry: next pins postcss exactly, and declares sharp as an
 * optional dependency whose range excludes the fixed line. The overrides are
 * asserted here too, because deleting one would silently reintroduce both
 * advisories while every version spec still looked current.
 *
 * Pure filesystem reads. No network, no install, no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const readJson = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const lock = readJson("package-lock.json") as {
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

/**
 * Each entry is the advisory's own fixed boundary, so the assertion states the
 * security fact rather than "whatever we happen to have installed".
 */
const HIGH_ADVISORY_FIXES: Array<{
  finding: string;
  name: string;
  minimum?: string;
  minimumByLine?: Record<string, string>;
}> = [
  { finding: "P99-DEP-001", name: "brace-expansion", minimumByLine: { "1": "1.1.18", "5": "5.0.9" } },
  { finding: "P99-DEP-002", name: "fast-uri", minimum: "3.1.6" },
  { finding: "P99-DEP-003", name: "js-yaml", minimum: "4.3.1" },
  { finding: "P99-DEP-004", name: "next", minimum: "15.5.23" },
  { finding: "P99-DEP-005", name: "postcss", minimum: "8.5.23" },
  { finding: "P99-DEP-006", name: "sharp", minimum: "0.35.0" },
  { finding: "P99-DEP-007", name: "undici", minimum: "7.28.1" },
  // Not a Phase 99 finding: this advisory landed on the main line afterwards and
  // is remediated here so the branch leaves zero HIGH behind.
  { finding: "P995-DEP-008", name: "nanoid", minimum: "3.3.18" },
  { finding: "P995-DEP-009", name: "browserslist", minimum: "4.28.7" },
  { finding: "P995-DEP-010", name: "mysql2", minimum: "3.24.0" },
];

describe("PHASE 99.5 — every HIGH dependency advisory is gone from the resolved lockfile", () => {
  for (const advisory of HIGH_ADVISORY_FIXES) {
    it(`${advisory.finding} — ${advisory.name} resolves above the fixed boundary in every copy`, () => {
      const versions = resolvedVersions(advisory.name);
      expect(versions.length, `${advisory.name} is not present in the lockfile at all`).toBeGreaterThan(0);

      for (const v of versions) {
        if (advisory.minimumByLine) {
          // brace-expansion has two vulnerable ranges on two major lines, so the
          // boundary depends on which line this copy is on.
          const line = v.split(".")[0];
          const minimum = advisory.minimumByLine[line];
          expect(minimum, `${advisory.name}@${v} is on an unreviewed major line`).toBeDefined();
          expect(gte(v, minimum!), `${advisory.name}@${v} is below the fixed ${minimum}`).toBe(true);
        } else {
          expect(gte(v, advisory.minimum!), `${advisory.name}@${v} is below the fixed ${advisory.minimum}`).toBe(true);
        }
      }
    });
  }

  it("resolves a single copy of next, postcss, sharp and mysql2 — no vulnerable nested duplicate survives", () => {
    // The whole point of the overrides is deduplication onto the fixed line. A
    // second copy would mean something still pulls a vulnerable version.
    for (const name of ["next", "postcss", "sharp", "mysql2"]) {
      expect(resolvedVersions(name), `${name} resolves to more than one version`).toHaveLength(1);
    }
  });
});

describe("PHASE 99.5 — the overrides holding the transitive fixes are present", () => {
  it("pins postcss, sharp and mysql2, which no version spec can otherwise reach", () => {
    // next pins postcss exactly and declares sharp as an optional dependency on a
    // range that excludes the fixed line, so removing either override silently
    // reintroduces P99-DEP-005 and P99-DEP-006.
    expect(pkg.overrides?.postcss, "postcss override missing").toBeDefined();
    expect(pkg.overrides?.sharp, "sharp override missing").toBeDefined();
    expect(gte(pkg.overrides!.postcss, "8.5.23")).toBe(true);
    expect(gte(pkg.overrides!.sharp, "0.35.0")).toBe(true);
    // prisma pins mysql2 EXACTLY, so no version spec can reach the fixed
    // line and the override is the whole fix.
    expect(pkg.overrides?.mysql2, "mysql2 override missing").toBeDefined();
    expect(gte(pkg.overrides!.mysql2, "3.24.0")).toBe(true);
  });

  it("keeps next on the remediated patch release", () => {
    expect(pkg.dependencies?.next).toBeDefined();
    expect(gte(pkg.dependencies!.next.replace(/^[^0-9]*/, ""), "15.5.23")).toBe(true);
  });
});
