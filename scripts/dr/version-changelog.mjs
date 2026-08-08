/**
 * Hermes OS — Phase 98 version tag & changelog policy.
 *
 * A production release tag must be a well-formed semantic version, must point
 * at a commit that is actually reachable from `main` (no releasing from a
 * stray branch), must have a matching changelog section, and its version must
 * match the release manifest's declared version — otherwise the manifest and
 * the tag could silently drift apart. All checks here are pure string/array
 * logic; the caller supplies `reachableFromMain` (computed via `git merge-base
 * --is-ancestor` or equivalent) since this module has no git access.
 */

const SEMVER_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * @param {string} tag e.g. "v1.2.3"
 * @returns {{ valid: boolean, major?: number, minor?: number, patch?: number, raw: string }}
 */
export function parseSemVer(tag) {
  if (typeof tag !== "string") return { valid: false, raw: String(tag) };
  const m = SEMVER_RE.exec(tag);
  if (!m) return { valid: false, raw: tag };
  return {
    valid: true,
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    raw: tag,
  };
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
export function compareSemVer(a, b) {
  const pa = parseSemVer(a);
  const pb = parseSemVer(b);
  if (!pa.valid || !pb.valid) {
    throw new Error("compareSemVer: both arguments must be valid vMAJOR.MINOR.PATCH tags");
  }
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
}

/**
 * Strip an optional leading "v" and return the bare "MAJOR.MINOR.PATCH".
 * @param {string} version
 * @returns {string}
 */
function bareVersion(version) {
  return typeof version === "string" && version.startsWith("v") ? version.slice(1) : String(version);
}

/**
 * @param {string} changelogText
 * @param {string} version e.g. "v1.2.3" or "1.2.3"
 * @returns {{ ok: boolean, sectionFound: boolean }}
 */
export function validateChangelogHasVersion(changelogText, version) {
  const bare = bareVersion(version);
  if (typeof changelogText !== "string" || changelogText.length === 0 || !bare) {
    return { ok: false, sectionFound: false };
  }
  const escaped = bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`^##\\s*\\[?v?${escaped}\\]?\\s*$`, "m");
  const sectionFound = headerRe.test(changelogText);
  return { ok: sectionFound, sectionFound };
}

/**
 * Return the text under a `## [Unreleased]` / `## Unreleased` header, up to
 * the next `## ` header (exclusive), or null if no such section exists.
 *
 * @param {string} changelogText
 * @returns {string|null}
 */
export function extractUnreleasedSection(changelogText) {
  if (typeof changelogText !== "string") return null;
  const startRe = /^##\s*\[?Unreleased\]?\s*$/m;
  const startMatch = startRe.exec(changelogText);
  if (!startMatch) return null;
  const from = startMatch.index + startMatch[0].length;
  const rest = changelogText.slice(from);
  const nextHeaderMatch = /^##\s/m.exec(rest);
  const section = nextHeaderMatch ? rest.slice(0, nextHeaderMatch.index) : rest;
  return section.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}

/**
 * @param {Object} params
 * @param {string} params.tag
 * @param {string} params.commitSha
 * @param {boolean} params.reachableFromMain
 * @param {string} params.changelogText
 * @param {string} params.manifestVersion
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateTagPolicy({ tag, commitSha, reachableFromMain, changelogText, manifestVersion }) {
  const errors = [];

  const parsedTag = parseSemVer(tag);
  if (!parsedTag.valid) {
    errors.push("VERSION_TAG_POLICY:INVALID_SEMVER");
  }

  if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/.test(commitSha)) {
    errors.push("VERSION_TAG_POLICY:INVALID_COMMIT_SHA");
  }

  if (reachableFromMain !== true) {
    errors.push("VERSION_TAG_POLICY:TAG_NOT_REACHABLE_FROM_MAIN");
  }

  if (parsedTag.valid) {
    const { ok: sectionFound } = validateChangelogHasVersion(changelogText, tag);
    if (!sectionFound) {
      errors.push("VERSION_TAG_POLICY:NO_MATCHING_CHANGELOG_SECTION");
    }
  }

  if (parsedTag.valid && bareVersion(tag) !== bareVersion(manifestVersion)) {
    errors.push("VERSION_TAG_POLICY:MANIFEST_VERSION_MISMATCH");
  }

  return { ok: errors.length === 0, errors };
}
