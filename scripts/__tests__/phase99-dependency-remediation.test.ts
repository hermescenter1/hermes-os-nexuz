/**
 * PHASE 99 — dependency-remediation retest evidence.
 *
 * These assertions are the retest referenced by findings P99-DEP-001..007. A
 * dependency finding is only closed when the advisory is actually gone from the
 * resolved lockfile — not when `npm audit` happened to be quiet on somebody's
 * machine — so this reads the committed lockfile and checks the resolved version
 * of every package that carried a HIGH advisory, including EVERY copy of it.
 *
 * Three of the fixes are not reachable by a version bump alone and are held by an
 * npm `overrides` entry: next pins postcss exactly and declares sharp as an
 * optional dependency whose range excludes the fixed line, and prisma pins
 * mysql2 to an exact version below the fixed line. The overrides are
 * asserted here too, because deleting one would silently reintroduce both
 * advisories while every version spec still looked current.
 *
 * Pure filesystem reads. No network, no install, no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..");
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
const HIGH_ADVISORY_FIXES = [
  { finding: "P99-DEP-001", name: "brace-expansion", vulnerable: "<=1.1.17 || 3.0.0 - 5.0.8", minimumByLine: { "1": "1.1.18", "5": "5.0.9" } },
  { finding: "P99-DEP-002", name: "fast-uri", minimum: "3.1.6" },
  { finding: "P99-DEP-003", name: "js-yaml", minimum: "4.3.1" },
  { finding: "P99-DEP-004", name: "next", minimum: "15.5.23" },
  { finding: "P99-DEP-005", name: "postcss", minimum: "8.5.23" },
  { finding: "P99-DEP-006", name: "sharp", minimum: "0.35.0" },
  { finding: "P99-DEP-007", name: "undici", minimum: "7.28.1" },
  { finding: "P99-DEP-013", name: "browserslist", minimum: "4.28.7" },
  { finding: "P99-DEP-014", name: "mysql2", minimum: "3.24.0" },
];

describe("PHASE 99 — every HIGH dependency advisory is gone from the resolved lockfile", () => {
  for (const advisory of HIGH_ADVISORY_FIXES) {
    it(`${advisory.finding} — ${advisory.name} resolves above the fixed boundary in every copy`, () => {
      const versions = resolvedVersions(advisory.name);
      expect(versions.length, `${advisory.name} is not present in the lockfile at all`).toBeGreaterThan(0);

      for (const v of versions) {
        if (advisory.minimumByLine) {
          // brace-expansion has two vulnerable ranges on two major lines, so the
          // boundary depends on which line this copy is on.
          const line = v.split(".")[0];
          const minimum = advisory.minimumByLine[line as keyof typeof advisory.minimumByLine];
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

describe("PHASE 99 — the overrides holding the transitive fixes are present", () => {
  it("pins postcss, sharp and mysql2, which no version spec can otherwise reach", () => {
    // next pins postcss exactly and declares sharp as an optional dependency on a
    // range that excludes the fixed line, so removing either override silently
    // reintroduces P99-DEP-005 and P99-DEP-006.
    expect(pkg.overrides?.postcss, "postcss override missing").toBeDefined();
    expect(pkg.overrides?.sharp, "sharp override missing").toBeDefined();
    expect(gte(pkg.overrides!.postcss, "8.5.23")).toBe(true);
    expect(gte(pkg.overrides!.sharp, "0.35.0")).toBe(true);
    // prisma pins mysql2 EXACTLY (3.15.3 at prisma@7.8.0, unchanged through
    // 7.10.0), so the fixed line is unreachable by any version spec and the
    // override is the whole fix. Deleting it silently reintroduces the
    // credential-leak advisory while prisma still looks current.
    expect(pkg.overrides?.mysql2, "mysql2 override missing").toBeDefined();
    expect(gte(pkg.overrides!.mysql2, "3.24.0")).toBe(true);
  });

  it("keeps next on the remediated patch release", () => {
    expect(pkg.dependencies?.next).toBeDefined();
    expect(gte(pkg.dependencies!.next.replace(/^[^0-9]*/, ""), "15.5.23")).toBe(true);
  });
});

describe("PHASE 99 — the committed dependency-review artifact agrees", () => {
  it("reports no CRITICAL and no HIGH, and no unmappable severity", () => {
    const review = readJson("docs/security/phase99-dependency-review.json") as {
      totals: { all: Record<string, number>; productionOnly: Record<string, number> };
    };
    expect(review.totals.all.CRITICAL).toBe(0);
    expect(review.totals.all.HIGH).toBe(0);
    expect(review.totals.all.UNKNOWN).toBe(0);
    expect(review.totals.productionOnly.CRITICAL).toBe(0);
    expect(review.totals.productionOnly.HIGH).toBe(0);
  });
});
