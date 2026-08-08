/**
 * Hermes OS — Phase 98 recovery set (metadata-only, hashable).
 *
 * A recovery set groups the artifacts needed to reconstruct the system at a point
 * in time — BY REFERENCE ONLY. It never contains secret values, `.env.production`
 * contents, or the backup encryption key: only non-secret identifiers, checksums
 * and timestamps. PostgreSQL and uploads are backed up independently and are NOT a
 * single distributed transaction; the set records each snapshot time and the
 * maximum skew so the RPO implication is explicit rather than a false claim of
 * cross-store transactional consistency.
 */

import { canonicalSha256 } from "./canonical-json.mjs";
import { scanForSecrets } from "./secret-scan.mjs";

export const RECOVERY_FORMAT_VERSION = 1;

/**
 * @param {object} f
 * @param {{ name:string, transportSha256:string, snapshotAt:string }} f.postgres
 * @param {{ name:string, transportSha256:string, snapshotAt:string, fileCount:number, manifestSha256:string }} f.uploads
 * @param {string} f.applicationGitSha
 * @param {string} f.releaseManifestHash
 * @param {string} f.configurationManifestHash
 * @param {string} f.schemaFingerprint
 * @param {string} f.backupKeyId              non-secret key identifier (NOT key material)
 * @param {string} f.recoverySetCreatedAt
 */
export function buildRecoverySet(f) {
  const postgresSnapshotAt = f.postgres?.snapshotAt ?? null;
  const uploadsSnapshotAt = f.uploads?.snapshotAt ?? null;
  const maxSnapshotSkewMs =
    postgresSnapshotAt && uploadsSnapshotAt
      ? Math.abs(Date.parse(postgresSnapshotAt) - Date.parse(uploadsSnapshotAt))
      : null;

  return {
    recoveryFormatVersion: RECOVERY_FORMAT_VERSION,
    recoverySetCreatedAt: f.recoverySetCreatedAt ?? null,
    applicationGitSha: f.applicationGitSha ?? null,
    releaseManifestHash: f.releaseManifestHash ?? null,
    configurationManifestHash: f.configurationManifestHash ?? null,
    schemaFingerprint: f.schemaFingerprint ?? null,
    backupKeyId: f.backupKeyId ?? null,
    postgres: f.postgres
      ? { name: f.postgres.name, transportSha256: f.postgres.transportSha256, snapshotAt: postgresSnapshotAt }
      : null,
    uploads: f.uploads
      ? {
          name: f.uploads.name,
          transportSha256: f.uploads.transportSha256,
          snapshotAt: uploadsSnapshotAt,
          fileCount: f.uploads.fileCount ?? null,
          manifestSha256: f.uploads.manifestSha256 ?? null,
        }
      : null,
    postgresSnapshotAt,
    uploadsSnapshotAt,
    maxSnapshotSkewMs,
    // Honest consistency statement — no cross-store transaction is provided.
    consistencyModel: "INDEPENDENT_SNAPSHOTS_NOT_TRANSACTIONAL",
  };
}

export function recoverySetSha256(set) {
  return canonicalSha256(set);
}

/**
 * @param {ReturnType<typeof buildRecoverySet>} set
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateRecoverySet(set) {
  const errors = [];
  const req = ["recoveryFormatVersion", "applicationGitSha", "releaseManifestHash", "configurationManifestHash"];
  for (const k of req) {
    if (set[k] == null || set[k] === "") errors.push(`missing ${k}`);
  }
  if (typeof set.applicationGitSha === "string" && !/^[0-9a-f]{40}$/.test(set.applicationGitSha)) {
    errors.push("applicationGitSha must be 40-char lowercase hex");
  }
  // backupKeyId is a short non-secret id — reject anything that looks like key material.
  if (typeof set.backupKeyId === "string" && /^[0-9a-fA-F]{64}$/.test(set.backupKeyId.trim())) {
    errors.push("BACKUP_KEY_IN_RECOVERY_SET: backupKeyId looks like 256-bit key material");
  }
  // No secret values anywhere.
  const leaks = scanForSecrets(set);
  for (const l of leaks) errors.push(`CONFIG_SECRET_VALUE_IN_RECOVERY_SET: ${l}`);
  return { ok: errors.length === 0, errors };
}
