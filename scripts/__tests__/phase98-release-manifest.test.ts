import { describe, it, expect } from "vitest";
import {
  buildReleaseManifest,
  releaseManifestSha256,
  validateReleaseManifest,
} from "../dr/release-manifest.mjs";
import {
  parseSemVer,
  compareSemVer,
  validateChangelogHasVersion,
  extractUnreleasedSection,
  validateTagPolicy,
} from "../dr/version-changelog.mjs";

/**
 * PHASE 98 — release manifest & version/changelog policy (pure, deterministic).
 *
 * Proves: manifest canonicalization is stable regardless of field insertion
 * order; the secret scan blocks credentialed values from ever entering a
 * published manifest; a release without a proven previous-good commit or a
 * required health-endpoint gate is refused; and the tag policy blocks version
 * drift between the manifest and the tag, plus tags not reachable from main.
 */

const GOOD_SHA_A = "a".repeat(40);
const GOOD_SHA_B = "b".repeat(40);

function baseFields(overrides: Record<string, unknown> = {}) {
  return {
    releaseVersion: "1.2.3",
    targetGitSha: GOOD_SHA_A,
    previousGoodGitSha: GOOD_SHA_B,
    createdAt: "2026-08-07T00:00:00.000Z",
    applicationImageRef: "registry.example.com/hermes/app@sha256:" + "c".repeat(64),
    schemaFingerprint: "d".repeat(64),
    migrationList: ["20260807000000_init.sql"],
    migrationHashes: { "20260807000000_init.sql": "e".repeat(64) },
    migrationClassification: "ADDITIVE",
    migrationRehearsalResult: "PASS",
    preMigrationBackupRequired: true,
    appRollbackClassification: "SAFE_ROLLBACK",
    configurationManifestHash: "f".repeat(64),
    releaseChecklistVersion: "1.0",
    changelogEntryPresent: true,
    releaseStrategy: "BLUE_GREEN",
    requiredHealthEndpoints: ["/api/health"],
    ...overrides,
  };
}

describe("RELEASE_MANIFEST — canonicalization is deterministic", () => {
  it("produces the same SHA-256 regardless of field insertion order", () => {
    const a = buildReleaseManifest(baseFields());
    const fields = baseFields();
    // Rebuild the same logical object with reversed key insertion order.
    const reversedEntries = Object.entries(fields).reverse();
    const reordered: Record<string, unknown> = {};
    for (const [k, v] of reversedEntries) reordered[k] = v;
    const b = buildReleaseManifest(reordered);

    expect(releaseManifestSha256(a)).toBe(releaseManifestSha256(b));
  });

  it("returns exactly the fixed field set with null/empty defaults for missing optional fields", () => {
    const m = buildReleaseManifest({ targetGitSha: GOOD_SHA_A, previousGoodGitSha: GOOD_SHA_B, releaseVersion: "1.0.0" });
    expect(m.manifestVersion).toBe("1.0");
    expect(m.applicationImageRef).toBeNull();
    expect(m.migrationList).toEqual([]);
    expect(m.migrationHashes).toEqual({});
    expect(m.preMigrationBackupRequired).toBe(false);
    expect(m.changelogEntryPresent).toBe(false);
    expect(m.requiredHealthEndpoints).toEqual([]);
  });
});

describe("RELEASE_MANIFEST — validation gates", () => {
  it("a well-formed manifest passes validation", () => {
    const m = buildReleaseManifest(baseFields());
    const result = validateReleaseManifest(m);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("CONFIG_SECRET_VALUE_IN_MANIFEST: a manifest with credentials in a value fails the secret scan", () => {
    const m = buildReleaseManifest(
      baseFields({
        // Simulate an accidental credentialed connection string leaking into the manifest.
        configurationManifestHash: "postgres://hermes:supersecretpassword@db.internal:5432/hermes_db",
      }),
    );
    const result = validateReleaseManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("CONFIG_SECRET_VALUE_IN_MANIFEST");
  });

  it("CONFIG_SECRET_VALUE_IN_MANIFEST: a raw secret keyword anywhere in the manifest is blocked", () => {
    const m = buildReleaseManifest(baseFields({ releaseChecklistVersion: "contains SECRET=oops" }));
    const result = validateReleaseManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("CONFIG_SECRET_VALUE_IN_MANIFEST");
  });

  it("does not flag allowlisted 40-hex SHA fields as secrets", () => {
    const m = buildReleaseManifest(baseFields());
    const result = validateReleaseManifest(m);
    expect(result.errors).not.toContain("CONFIG_SECRET_VALUE_IN_MANIFEST");
  });

  it("RELEASE_WITHOUT_PREVIOUS_GOOD_SHA: null previousGoodGitSha is rejected", () => {
    const m = buildReleaseManifest(baseFields({ previousGoodGitSha: null }));
    const result = validateReleaseManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("RELEASE_WITHOUT_PREVIOUS_GOOD_SHA");
  });

  it("RELEASE_WITHOUT_HEALTH_GATE: empty requiredHealthEndpoints is rejected", () => {
    const m = buildReleaseManifest(baseFields({ requiredHealthEndpoints: [] }));
    const result = validateReleaseManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("RELEASE_WITHOUT_HEALTH_GATE");
  });

  it("RELEASE_WITHOUT_ROLLBACK_CLASSIFICATION: missing classification is rejected", () => {
    const m = buildReleaseManifest(baseFields({ appRollbackClassification: null }));
    const result = validateReleaseManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("RELEASE_WITHOUT_ROLLBACK_CLASSIFICATION");
  });

  it("INVALID_TARGET_GIT_SHA: a non-hex or wrong-length target SHA is rejected", () => {
    const m = buildReleaseManifest(baseFields({ targetGitSha: "not-a-sha" }));
    const result = validateReleaseManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("INVALID_TARGET_GIT_SHA");
  });

  it("MISSING_RELEASE_VERSION: missing releaseVersion is rejected", () => {
    const m = buildReleaseManifest(baseFields({ releaseVersion: null }));
    const result = validateReleaseManifest(m);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("MISSING_RELEASE_VERSION");
  });
});

describe("VERSION_SEMVER — parsing and comparison", () => {
  it("accepts a well-formed vMAJOR.MINOR.PATCH tag", () => {
    const p = parseSemVer("v1.2.3");
    expect(p.valid).toBe(true);
    expect(p).toMatchObject({ major: 1, minor: 2, patch: 3 });
  });

  it.each(["1.2", "v1.2.3-rc1", "1.2.3", "vx.y.z"])("rejects malformed tag %s", (tag) => {
    expect(parseSemVer(tag).valid).toBe(false);
  });

  it("compares versions numerically across all components", () => {
    expect(compareSemVer("v1.2.3", "v1.2.4")).toBe(-1);
    expect(compareSemVer("v1.3.0", "v1.2.9")).toBe(1);
    expect(compareSemVer("v2.0.0", "v1.9.9")).toBe(1);
    expect(compareSemVer("v1.2.3", "v1.2.3")).toBe(0);
  });
});

describe("CHANGELOG — version section detection", () => {
  it("finds a `## [1.2.3]` section", () => {
    const text = "# Changelog\n\n## [1.2.3]\n\n- did a thing\n\n## [1.2.2]\n\n- older\n";
    const result = validateChangelogHasVersion(text, "v1.2.3");
    expect(result.ok).toBe(true);
    expect(result.sectionFound).toBe(true);
  });

  it("misses an absent version", () => {
    const text = "# Changelog\n\n## [1.2.2]\n\n- older\n";
    const result = validateChangelogHasVersion(text, "v1.2.3");
    expect(result.ok).toBe(false);
    expect(result.sectionFound).toBe(false);
  });

  it("extracts the Unreleased section up to the next header", () => {
    const text = "# Changelog\n\n## [Unreleased]\n\n- pending change\n\n## [1.2.2]\n\n- older\n";
    const section = extractUnreleasedSection(text);
    expect(section).toContain("pending change");
    expect(section).not.toContain("older");
  });

  it("returns null when there is no Unreleased section", () => {
    const text = "# Changelog\n\n## [1.2.2]\n\n- older\n";
    expect(extractUnreleasedSection(text)).toBeNull();
  });
});

describe("VERSION_TAG_POLICY — release-tag gate", () => {
  const changelog = "# Changelog\n\n## [1.2.3]\n\n- release notes\n";

  it("passes for a well-formed, reachable, changelog-backed, manifest-matching tag", () => {
    const result = validateTagPolicy({
      tag: "v1.2.3",
      commitSha: GOOD_SHA_A,
      reachableFromMain: true,
      changelogText: changelog,
      manifestVersion: "1.2.3",
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("MANIFEST_VERSION_MISMATCH: blocks a tag whose version mismatches the manifest version", () => {
    const result = validateTagPolicy({
      tag: "v1.2.3",
      commitSha: GOOD_SHA_A,
      reachableFromMain: true,
      changelogText: changelog,
      manifestVersion: "1.2.4",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("VERSION_TAG_POLICY:MANIFEST_VERSION_MISMATCH");
  });

  it("TAG_NOT_REACHABLE_FROM_MAIN: blocks a tag not reachable from main", () => {
    const result = validateTagPolicy({
      tag: "v1.2.3",
      commitSha: GOOD_SHA_A,
      reachableFromMain: false,
      changelogText: changelog,
      manifestVersion: "1.2.3",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("VERSION_TAG_POLICY:TAG_NOT_REACHABLE_FROM_MAIN");
  });

  it("INVALID_SEMVER and INVALID_COMMIT_SHA are reported together for a doubly-malformed tag", () => {
    const result = validateTagPolicy({
      tag: "1.2.3",
      commitSha: "not-a-sha",
      reachableFromMain: true,
      changelogText: changelog,
      manifestVersion: "1.2.3",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("VERSION_TAG_POLICY:INVALID_SEMVER");
    expect(result.errors).toContain("VERSION_TAG_POLICY:INVALID_COMMIT_SHA");
  });

  it("NO_MATCHING_CHANGELOG_SECTION: blocks a tag with no changelog section", () => {
    const result = validateTagPolicy({
      tag: "v9.9.9",
      commitSha: GOOD_SHA_A,
      reachableFromMain: true,
      changelogText: changelog,
      manifestVersion: "9.9.9",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("VERSION_TAG_POLICY:NO_MATCHING_CHANGELOG_SECTION");
  });
});
