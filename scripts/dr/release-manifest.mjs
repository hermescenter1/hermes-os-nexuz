/**
 * Hermes OS — Phase 98 release manifest (deterministic, secret-free).
 *
 * A release manifest is the single source of truth published alongside a
 * production release: the exact target commit, the previous known-good commit
 * (so a rollback target always exists), the migration set actually applied,
 * the rollback classification for the application layer and the health
 * endpoints that must be green before the release is considered live. It is
 * hashed with the shared canonical-JSON codec so two structurally-equal
 * manifests always produce the same digest regardless of field order.
 *
 * The manifest must NEVER carry secret material (passwords, tokens, private
 * keys, credentialed connection strings). `validateReleaseManifest` performs a
 * best-effort recursive secret scan as a hard release gate.
 *
 * @typedef {Object} ReleaseManifest
 * @property {string} manifestVersion
 * @property {string|null} releaseVersion
 * @property {string|null} targetGitSha
 * @property {string|null} previousGoodGitSha
 * @property {string|null} createdAt
 * @property {string|null} applicationImageRef
 * @property {string|null} schemaFingerprint
 * @property {string[]} migrationList
 * @property {Record<string,string>} migrationHashes
 * @property {string|null} migrationClassification
 * @property {string|null} migrationRehearsalResult
 * @property {boolean} preMigrationBackupRequired
 * @property {string|null} appRollbackClassification
 * @property {string|null} configurationManifestHash
 * @property {string|null} releaseChecklistVersion
 * @property {boolean} changelogEntryPresent
 * @property {string|null} releaseStrategy
 * @property {string[]} requiredHealthEndpoints
 */

import { canonicalSha256 } from "./canonical-json.mjs";

/** Keys on which a 40-hex-looking value is expected and must NOT be treated as a secret. */
const HEX_ALLOWLISTED_KEYS = new Set([
  "targetGitSha",
  "previousGoodGitSha",
  "schemaFingerprint",
  "configurationManifestHash",
]);

/**
 * Build a release manifest with exactly the fixed field set. Missing optional
 * fields default to `null` (or an empty array/object/`false` where the field
 * is inherently a collection or boolean). Never includes secret values —
 * callers must pass only public/derived identifiers (SHAs, hashes, refs).
 *
 * @param {Partial<ReleaseManifest>} fields
 * @returns {ReleaseManifest}
 */
export function buildReleaseManifest(fields = {}) {
  return {
    manifestVersion: fields.manifestVersion ?? "1.0",
    releaseVersion: fields.releaseVersion ?? null,
    targetGitSha: fields.targetGitSha ?? null,
    previousGoodGitSha: fields.previousGoodGitSha ?? null,
    createdAt: fields.createdAt ?? null,
    // A source SHA alone does not prove a reproducible build artifact — only an
    // actual image digest/ref may populate this field.
    applicationImageRef: fields.applicationImageRef ?? null,
    schemaFingerprint: fields.schemaFingerprint ?? null,
    migrationList: fields.migrationList ?? [],
    migrationHashes: fields.migrationHashes ?? {},
    migrationClassification: fields.migrationClassification ?? null,
    migrationRehearsalResult: fields.migrationRehearsalResult ?? null,
    preMigrationBackupRequired: fields.preMigrationBackupRequired ?? false,
    appRollbackClassification: fields.appRollbackClassification ?? null,
    configurationManifestHash: fields.configurationManifestHash ?? null,
    releaseChecklistVersion: fields.releaseChecklistVersion ?? null,
    changelogEntryPresent: fields.changelogEntryPresent ?? false,
    releaseStrategy: fields.releaseStrategy ?? null,
    requiredHealthEndpoints: fields.requiredHealthEndpoints ?? [],
  };
}

/**
 * @param {ReleaseManifest} manifest
 * @returns {string} lowercase hex SHA-256 of the canonical manifest
 */
export function releaseManifestSha256(manifest) {
  return canonicalSha256(manifest);
}

const HEX40_RE = /^[0-9a-f]{40}$/;
const HEXBLOB40_RE = /[0-9a-fA-F]{40,}/;
const BASE64BLOB40_RE = /[A-Za-z0-9+/]{40,}={0,2}/;
const CREDENTIALED_URL_RE = /postgres(?:ql)?:\/\/[^:/?#\s]+:[^@/?#\s]+@/i;
const SECRET_KEYWORD_RE = /(PASSWORD|SECRET|TOKEN|PRIVATE KEY)/i;
const SECRET_KEY_NAME_RE = /(key|secret|token|password)/i;

/**
 * @param {ReleaseManifest} manifest
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateReleaseManifest(manifest) {
  const errors = [];

  if (typeof manifest?.targetGitSha !== "string" || !HEX40_RE.test(manifest.targetGitSha)) {
    errors.push("INVALID_TARGET_GIT_SHA");
  }

  if (manifest?.previousGoodGitSha === null || manifest?.previousGoodGitSha === undefined) {
    // A release without a known previous-good commit has no proven rollback
    // target and must be blocked.
    errors.push("RELEASE_WITHOUT_PREVIOUS_GOOD_SHA");
  } else if (typeof manifest.previousGoodGitSha !== "string" || !HEX40_RE.test(manifest.previousGoodGitSha)) {
    errors.push("INVALID_PREVIOUS_GOOD_GIT_SHA");
  }

  if (!manifest?.releaseVersion) {
    errors.push("MISSING_RELEASE_VERSION");
  }

  if (!Array.isArray(manifest?.requiredHealthEndpoints) || manifest.requiredHealthEndpoints.length === 0) {
    errors.push("RELEASE_WITHOUT_HEALTH_GATE");
  }

  if (!manifest?.appRollbackClassification) {
    errors.push("RELEASE_WITHOUT_ROLLBACK_CLASSIFICATION");
  }

  if (containsSecretLikeValue(manifest, [])) {
    errors.push("CONFIG_SECRET_VALUE_IN_MANIFEST");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Recursively walk a value looking for secret-shaped strings. Returns true on
 * the first match found (the caller only needs a single boolean gate).
 *
 * @param {unknown} value
 * @param {(string|number)[]} path
 * @returns {boolean}
 */
function containsSecretLikeValue(value, path) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    return isSecretLikeString(value, path[path.length - 1]);
  }
  if (Array.isArray(value)) {
    return value.some((v, i) => containsSecretLikeValue(v, [...path, i]));
  }
  if (typeof value === "object") {
    return Object.keys(value).some((k) => containsSecretLikeValue(value[k], [...path, k]));
  }
  return false;
}

/**
 * @param {string} str
 * @param {string|number|undefined} keyName
 * @returns {boolean}
 */
function isSecretLikeString(str, keyName) {
  if (SECRET_KEYWORD_RE.test(str)) return true;
  if (CREDENTIALED_URL_RE.test(str)) return true;

  const isAllowlistedKey = typeof keyName === "string" && HEX_ALLOWLISTED_KEYS.has(keyName);
  const looksLikeKeyName = typeof keyName === "string" && SECRET_KEY_NAME_RE.test(keyName);

  if (looksLikeKeyName && !isAllowlistedKey) {
    if (HEXBLOB40_RE.test(str) || BASE64BLOB40_RE.test(str)) return true;
  }

  return false;
}
