/**
 * Phase 86C4B2B1D-SECURITY / -SECURITY-2 — Framework dependency security
 * regression guard.
 *
 * The production deployment ran Next.js 15.1.6 / React 19.0.0, inside the
 * vulnerable ranges of the December 2025 React Server Components disclosure
 * chain (React flight-protocol RCE GHSA-9qr9-h5gf-34mp / CVE-2025-66478, the
 * react-server-dom advisories CVE-2025-55182/-55183/-55184/CVE-2025-67779,
 * and the January 2026 RSC DoS follow-up CVE-2026-23864). SECURITY-1 raised
 * the floor to 15.1.12, which closed that chain but left findings that were
 * never backported to 15.1.x: the middleware authorization bypass
 * CVE-2025-29927 / GHSA-f82v-jwr5-mffw (fixed in 15.2.3) and the 2026 Server
 * Components DoS advisories GHSA-q4gf-8mx6-v5v3 / GHSA-8h8q-6873-q5fj (fixed
 * in 15.5.15 / 15.5.16). SECURITY-2 therefore migrated to the maintained
 * 15.5.x backport line. This suite pins the remediation so vulnerable
 * versions can never silently return through a manifest or lockfile edit:
 *
 *   - Next.js must stay on the 15.5.x release line (>= 15.5.16 security
 *     floor, < 15.6.0), declared as an exact stable pin (no range that could
 *     re-admit 15.1.6 / 15.1.12 or any pre-15.5.16 release), and the
 *     lockfile must resolve the same version.
 *   - React and React DOM must remain exactly 19.0.7 (equal pins); moving
 *     off that version requires an approved compatibility stop-report. The
 *     per-line advisory floors (19.0.x -> 19.0.3, 19.1.x -> 19.1.4,
 *     19.2.x -> 19.2.3) are enforced as well.
 *   - next-intl must stay on the 4.x line at or above the 4.9.2 security
 *     floor (PHASE 86C4B2B1D-SECURITY-3): the open-redirect advisory
 *     GHSA-8f24-v5vv-gm5j is fixed in 4.9.1 and the prototype-pollution
 *     advisory GHSA-4c35-wcg5-mm9h in 4.9.2, so no vulnerable 3.x (or
 *     pre-4.9.2) declaration may return.
 *   - No react-server-dom-* package may be introduced as a direct
 *     dependency: the repository consumes the RSC runtime only through the
 *     copy bundled inside Next.js, so its patch level is governed by the
 *     Next.js floor above.
 *   - No npm override may target the framework packages, and no npm script
 *     may invoke remote "auto-fix" upgrade tooling.
 *
 * Only the release-line boundary, the minimum security floor and the
 * stable-release requirement are enforced for Next.js — newer 15.5.x patches
 * must remain installable without editing this test. The suite is fully
 * offline (reads package.json / package-lock.json only) and date-independent.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
  resolutions?: Record<string, unknown>;
  scripts?: Record<string, string>;
}

interface LockPackageEntry {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface Lockfile {
  lockfileVersion: number;
  packages: Record<string, LockPackageEntry>;
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
) as PackageManifest;

const lock = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"),
) as Lockfile;

/** Exact stable semver: digits only — rejects ranges and prereleases. */
const EXACT_STABLE = /^(\d+)\.(\d+)\.(\d+)$/;

interface Semver {
  major: number;
  minor: number;
  patch: number;
}

function parseExactStable(spec: string | undefined, label: string): Semver {
  expect(spec, `${label} must be declared`).toBeTypeOf("string");
  const m = EXACT_STABLE.exec(spec as string);
  expect(
    m,
    `${label} must be an exact stable x.y.z pin (got "${spec}") — ranges or ` +
      `prereleases could re-admit a vulnerable release`,
  ).not.toBeNull();
  const [, major, minor, patch] = m as RegExpExecArray;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
  };
}

function atLeast(v: Semver, floor: Semver): boolean {
  if (v.major !== floor.major || v.minor !== floor.minor) return false;
  return v.patch >= floor.patch;
}

/** >= floor within the same major line (minor may exceed the floor's). */
function atLeastInMajor(v: Semver, floor: Semver): boolean {
  if (v.major !== floor.major) return false;
  if (v.minor !== floor.minor) return v.minor > floor.minor;
  return v.patch >= floor.patch;
}

/** Security floors (minimums, never maximums). */
const NEXT_FLOOR: Semver = { major: 15, minor: 5, patch: 16 };
/** Approved React pin — changing it requires a compatibility stop-report. */
const APPROVED_REACT_VERSION = "19.0.7";
/**
 * next-intl 4.x security floor: GHSA-8f24-v5vv-gm5j fixed in 4.9.1,
 * GHSA-4c35-wcg5-mm9h fixed in 4.9.2 (audit evidence, SECURITY-3).
 */
const NEXT_INTL_FLOOR: Semver = { major: 4, minor: 9, patch: 2 };
const REACT_LINE_FLOORS: Record<string, Semver> = {
  "19.0": { major: 19, minor: 0, patch: 3 },
  "19.1": { major: 19, minor: 1, patch: 4 },
  "19.2": { major: 19, minor: 2, patch: 3 },
};

const RSC_PACKAGES = [
  "react-server-dom-webpack",
  "react-server-dom-turbopack",
  "react-server-dom-parcel",
] as const;

const FRAMEWORK_PACKAGES = [
  "next",
  "react",
  "react-dom",
  "next-intl",
  ...RSC_PACKAGES,
];

const declaredNext = pkg.dependencies?.next;
const declaredReact = pkg.dependencies?.react;
const declaredReactDom = pkg.dependencies?.["react-dom"];
const declaredNextIntl = pkg.dependencies?.["next-intl"];

const lockRoot = lock.packages[""];
const lockNext = lock.packages["node_modules/next"];
const lockReact = lock.packages["node_modules/react"];
const lockReactDom = lock.packages["node_modules/react-dom"];
const lockNextIntl = lock.packages["node_modules/next-intl"];

describe("framework dependency security — Next.js", () => {
  it("is not a known-vulnerable pre-15.5.16 release", () => {
    for (const vulnerable of ["15.1.6", "15.1.12"]) {
      expect(declaredNext).not.toBe(vulnerable);
      expect(lockNext?.version).not.toBe(vulnerable);
    }
  });

  it("declares an exact stable pin within the 15.5.x line, at or above the 15.5.16 security floor and below 15.6.0", () => {
    const v = parseExactStable(declaredNext, "dependencies.next");
    expect(v.major, "next must stay on major 15 in this phase").toBe(15);
    expect(
      v.minor,
      "next must stay on the 15.5.x release line (>= 15.5.16, < 15.6.0)",
    ).toBe(5);
    expect(
      atLeast(v, NEXT_FLOOR),
      `next ${declaredNext} is below the 15.5.16 security floor`,
    ).toBe(true);
  });

  it("resolves the lockfile root entry to the declared version", () => {
    expect(lockRoot?.dependencies?.next).toBe(declaredNext);
    expect(lockNext?.version).toBe(declaredNext);
  });

  it("resolves a lockfile next package at or above the security floor", () => {
    const v = parseExactStable(lockNext?.version, "package-lock next version");
    expect(v.major).toBe(15);
    expect(v.minor).toBe(5);
    expect(
      atLeast(v, NEXT_FLOOR),
      `locked next ${lockNext?.version} is below the 15.5.16 security floor`,
    ).toBe(true);
  });
});

describe("framework dependency security — React / React DOM", () => {
  it("declares both react and react-dom", () => {
    expect(declaredReact).toBeTypeOf("string");
    expect(declaredReactDom).toBeTypeOf("string");
  });

  it("pins react and react-dom to the same exact version, matching the lockfile", () => {
    expect(declaredReact).toBe(declaredReactDom);
    expect(lockRoot?.dependencies?.react).toBe(declaredReact);
    expect(lockRoot?.dependencies?.["react-dom"]).toBe(declaredReactDom);
    expect(lockReact?.version).toBe(declaredReact);
    expect(lockReactDom?.version).toBe(declaredReactDom);
  });

  it("stays on the approved react pin until a compatibility stop-report approves a change", () => {
    expect(declaredReact).toBe(APPROVED_REACT_VERSION);
    expect(declaredReactDom).toBe(APPROVED_REACT_VERSION);
    expect(lockReact?.version).toBe(APPROVED_REACT_VERSION);
    expect(lockReactDom?.version).toBe(APPROVED_REACT_VERSION);
  });

  it("meets the patched security floor of its minor release line", () => {
    for (const [label, spec] of [
      ["dependencies.react", declaredReact],
      ["dependencies.react-dom", declaredReactDom],
      ["locked react", lockReact?.version],
      ["locked react-dom", lockReactDom?.version],
    ] as const) {
      const v = parseExactStable(spec, label);
      const line = `${v.major}.${v.minor}`;
      const floor = REACT_LINE_FLOORS[line];
      expect(
        floor,
        `${label} is on release line ${line}, which has no recorded security ` +
          `floor — extend REACT_LINE_FLOORS from the official React advisory ` +
          `before adopting it`,
      ).toBeDefined();
      expect(
        atLeast(v, floor),
        `${label} ${spec} is below the ${line}.x security floor`,
      ).toBe(true);
    }
  });
});

describe("framework dependency security — next-intl", () => {
  it("is not a known-vulnerable 3.x release", () => {
    for (const vulnerable of ["3.26.3", "3.26.5"]) {
      expect(declaredNextIntl).not.toBe(vulnerable);
      expect(lockNextIntl?.version).not.toBe(vulnerable);
    }
    const v = parseExactStable(declaredNextIntl, "dependencies.next-intl");
    expect(
      v.major,
      "next-intl must not fall back to the vulnerable 3.x line",
    ).not.toBe(3);
  });

  it("declares an exact stable pin within the 4.x line at or above the 4.9.2 security floor", () => {
    const v = parseExactStable(declaredNextIntl, "dependencies.next-intl");
    expect(
      v.major,
      "next-intl must stay on major 4 (below 5) in this phase",
    ).toBe(4);
    expect(
      atLeastInMajor(v, NEXT_INTL_FLOOR),
      `next-intl ${declaredNextIntl} is below the 4.9.2 security floor`,
    ).toBe(true);
  });

  it("resolves the lockfile entries to the declared version", () => {
    expect(lockRoot?.dependencies?.["next-intl"]).toBe(declaredNextIntl);
    expect(lockNextIntl?.version).toBe(declaredNextIntl);
    const v = parseExactStable(lockNextIntl?.version, "locked next-intl");
    expect(v.major).toBe(4);
    expect(atLeastInMajor(v, NEXT_INTL_FLOOR)).toBe(true);
  });
});

describe("framework dependency security — react-server-dom packages", () => {
  it("adds no direct react-server-dom dependency (the RSC runtime is bundled inside next)", () => {
    for (const name of RSC_PACKAGES) {
      expect(pkg.dependencies?.[name], `${name} in dependencies`).toBeUndefined();
      expect(
        pkg.devDependencies?.[name],
        `${name} in devDependencies`,
      ).toBeUndefined();
      expect(
        pkg.optionalDependencies?.[name],
        `${name} in optionalDependencies`,
      ).toBeUndefined();
      expect(
        pkg.peerDependencies?.[name],
        `${name} in peerDependencies`,
      ).toBeUndefined();
      expect(
        lockRoot?.dependencies?.[name],
        `${name} in lockfile root dependencies`,
      ).toBeUndefined();
    }
  });
});

describe("framework dependency security — release channel and policy", () => {
  it("uses no prerelease channel for any framework package", () => {
    const channelMarkers = ["canary", "beta", "alpha", "rc"];
    for (const [label, spec] of [
      ["dependencies.next", declaredNext],
      ["dependencies.react", declaredReact],
      ["dependencies.react-dom", declaredReactDom],
      ["dependencies.next-intl", declaredNextIntl],
      ["locked next", lockNext?.version],
      ["locked react", lockReact?.version],
      ["locked react-dom", lockReactDom?.version],
      ["locked next-intl", lockNextIntl?.version],
    ] as const) {
      for (const marker of channelMarkers) {
        expect(
          (spec ?? "").includes(marker),
          `${label} "${spec}" must not reference the ${marker} channel`,
        ).toBe(false);
      }
    }
  });

  it("adds no npm override or resolution for the framework packages", () => {
    const collectKeys = (node: unknown, into: string[]): string[] => {
      if (node && typeof node === "object" && !Array.isArray(node)) {
        for (const [key, value] of Object.entries(node)) {
          into.push(key);
          collectKeys(value, into);
        }
      }
      return into;
    };
    const overrideKeys = [
      ...collectKeys(pkg.overrides ?? {}, []),
      ...collectKeys(pkg.resolutions ?? {}, []),
    ];
    // Override keys may carry version qualifiers ("react@19.0.0"), so match
    // on the bare package name before any "@" qualifier.
    const overriddenNames = overrideKeys.map((key) =>
      key.startsWith("@") ? key : key.split("@")[0],
    );
    for (const name of FRAMEWORK_PACKAGES) {
      expect(
        overriddenNames.includes(name),
        `package.json must not override "${name}" — security floors must be ` +
          `satisfied by real dependency versions, not forced resolutions`,
      ).toBe(false);
    }
  });

  it("adds no npm script that executes remote upgrade tooling", () => {
    const forbiddenFragments = [
      "fix-react2shell",
      "audit fix --force",
      "next@latest",
      "react@latest",
      "react-dom@latest",
    ];
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      for (const fragment of forbiddenFragments) {
        expect(
          command.includes(fragment),
          `script "${name}" must not invoke "${fragment}"`,
        ).toBe(false);
      }
    }
  });

  it("keeps the lockfile on the repository's lockfile version", () => {
    expect(lock.lockfileVersion).toBe(3);
  });
});

describe("framework dependency security — suite integrity", () => {
  const source = fs.readFileSync(
    path.join(
      ROOT,
      "src",
      "lib",
      "security",
      "__tests__",
      "framework-dependency-security.test.ts",
    ),
    "utf8",
  );

  it("contains no skipped, focused, or swallowed assertions", () => {
    // Tokens are assembled at runtime so this file never contains them as
    // contiguous source text and cannot flag itself.
    const modifiers = ["skip", "only"];
    const callees = ["describe", "it", "test"];
    for (const callee of callees) {
      for (const modifier of modifiers) {
        const token = [callee, modifier].join(".") + "(";
        expect(
          source.includes(token),
          `suite must not use ${token})`,
        ).toBe(false);
      }
    }
    const swallowToken = [".", "ca", "tch("].join("");
    expect(
      source.includes(swallowToken),
      "suite must not swallow failures via promise rejection handlers",
    ).toBe(false);
  });
});
