/**
 * PHASE 99.7 — the release prerequisite gate must fail CLOSED.
 *
 * The property under test is not "the gate passes when everything is fine" — it
 * is that there is no way to reach `releaseAllowed: true` without producing the
 * evidence. Every test below removes exactly one piece of evidence from an
 * otherwise-complete release and asserts the release is refused.
 */

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  BACKUP_REQUIREMENTS,
  OWNER_CONFIGURATION_BLOCKED,
  emptyBackupEvidence,
  evaluateBackupPrerequisite,
  evaluateReleasePrerequisites,
  readBackupEvidence,
} from "../dr/release-prerequisites.mjs";

const SHA40_A = "a".repeat(40);
const SHA40_B = "b".repeat(40);

/** A backup evidence object with every requirement satisfied. */
function goodBackup() {
  return {
    ...emptyBackupEvidence(),
    keyFileConfigured: true,
    keyIdConfigured: true,
    keyFileReadable: true,
    keyFilePermissionsOk: true,
    encryptedArtifactPresent: true,
    verified: true,
    partial: false,
    encrypted: true,
    integrityVerified: true,
    artifactType: "postgres",
    keyId: "hermes-backup-2026",
  };
}

/** A release whose every prerequisite is proven. */
function goodRelease() {
  return {
    targetGitSha: SHA40_A,
    previousGoodGitSha: SHA40_B,
    previousGoodImagePreserved: true,
    migrationGate: {
      migrationClassification: "FORWARD_ONLY_REQUIRES_BACKUP",
      preMigrationBackupRequired: true,
      deployBlocked: false,
      historicalMutation: false,
      newMigrations: ["20260818000000_phase95_ai_governance"],
    },
    backup: goodBackup(),
    documentsAdoption: { resolved: true, outcome: "ADOPTED", integrityVerified: true },
    migrationRehearsal: { passed: true, idempotent: true },
    candidate: { passed: true, sharpRuntimeOk: true, localesOk: true },
  };
}

describe("PHASE997_BACKUP_PREREQUISITE", () => {
  it("passes only when every backup requirement holds", () => {
    const r = evaluateBackupPrerequisite(goodBackup());
    expect(r.blockers).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("a missing evidence object is treated exactly like a failed one", () => {
    for (const missing of [null, undefined, {}]) {
      const r = evaluateBackupPrerequisite(missing as never);
      expect(r.ok).toBe(false);
      // Every requirement is reported, so nothing is satisfied by omission.
      expect(r.blockers.length).toBe(BACKUP_REQUIREMENTS.length);
    }
  });

  const REQUIREMENT_CODES: string[] = BACKUP_REQUIREMENTS.map((entry) => entry[0] as string);

  it.each(REQUIREMENT_CODES)("blocks the release when %s", (code) => {
    // Rebuild the failing state for this specific requirement.
    const broken: Record<string, unknown> = goodBackup();
    const breakers: Record<string, () => void> = {
      BACKUP_KEY_FILE_NOT_CONFIGURED: () => (broken.keyFileConfigured = false),
      BACKUP_KEY_ID_NOT_CONFIGURED: () => (broken.keyIdConfigured = false),
      BACKUP_KEY_FILE_NOT_READABLE: () => (broken.keyFileReadable = false),
      BACKUP_KEY_FILE_PERMISSIONS_TOO_OPEN: () => (broken.keyFilePermissionsOk = false),
      ENCRYPTED_BACKUP_MISSING: () => (broken.encryptedArtifactPresent = false),
      BACKUP_NOT_ENCRYPTED: () => (broken.encrypted = false),
      BACKUP_NOT_VERIFIED: () => (broken.verified = false),
      BACKUP_IS_PARTIAL: () => (broken.partial = true),
      BACKUP_INTEGRITY_UNPROVEN: () => (broken.integrityVerified = false),
      BACKUP_ARTIFACT_TYPE_MISMATCH: () => (broken.artifactType = "uploads"),
    };
    breakers[code]();

    expect(evaluateBackupPrerequisite(broken).blockers).toContain(code);
    // …and the whole release is refused, not just the sub-gate.
    const decision = evaluateReleasePrerequisites({ ...goodRelease(), backup: broken });
    expect(decision.releaseAllowed).toBe(false);
    expect(decision.gates.ENCRYPTED_BACKUP).toBe("BLOCKED");
  });

  it("a truthy-but-wrong `partial` value never reads as complete", () => {
    // Only the literal `false` clears the gate; "false", 0 and undefined do not.
    for (const partial of ["false", 0, undefined, null]) {
      const r = evaluateBackupPrerequisite({ ...goodBackup(), partial } as never);
      expect(r.blockers).toContain("BACKUP_IS_PARTIAL");
    }
  });
});

describe("PHASE997_RELEASE_PREREQUISITES", () => {
  it("allows a release only when every gate is proven", () => {
    const d = evaluateReleasePrerequisites(goodRelease());
    expect(d.blockers).toEqual([]);
    expect(d.releaseAllowed).toBe(true);
  });

  it("an empty input is refused rather than defaulted into a pass", () => {
    const d = evaluateReleasePrerequisites({});
    expect(d.releaseAllowed).toBe(false);
    // An unknown migration gate must still force the backup requirement.
    expect(d.preMigrationBackupRequired).toBe(true);
    expect(d.blockers).toContain("MIGRATION_GATE_NOT_EVALUATED");
    expect(d.blockers).toContain("UNKNOWN_PREVIOUS_GOOD_RELEASE");
  });

  it.each([
    ["targetGitSha", { targetGitSha: null }, "TARGET_SHA_NOT_PINNED"],
    ["short targetGitSha", { targetGitSha: "abc123" }, "TARGET_SHA_NOT_PINNED"],
    ["previousGoodGitSha", { previousGoodGitSha: null }, "UNKNOWN_PREVIOUS_GOOD_RELEASE"],
    ["previous-good image", { previousGoodImagePreserved: false }, "PREVIOUS_GOOD_IMAGE_NOT_PRESERVED"],
    ["documents adoption", { documentsAdoption: null }, "DOCUMENTS_ADOPTION_UNRESOLVED"],
    ["migration rehearsal", { migrationRehearsal: { passed: true, idempotent: false } }, "MIGRATION_REHEARSAL_NOT_PASSED"],
    ["candidate", { candidate: { passed: true, sharpRuntimeOk: false, localesOk: true } }, "CANDIDATE_NOT_PASSED"],
  ])("blocks the release when the %s evidence is missing", (_label, override, expectedBlocker) => {
    const d = evaluateReleasePrerequisites({ ...goodRelease(), ...override });
    expect(d.releaseAllowed).toBe(false);
    expect(d.blockers).toContain(expectedBlocker);
  });

  it("historical migration mutation blocks the release unconditionally", () => {
    const d = evaluateReleasePrerequisites({
      ...goodRelease(),
      migrationGate: { ...goodRelease().migrationGate, historicalMutation: true },
    });
    expect(d.releaseAllowed).toBe(false);
    expect(d.blockers).toContain("HISTORICAL_MIGRATION_MUTATION");
    expect(d.gates.MIGRATION_INTEGRITY).toBe("BLOCKED");
  });

  it("a candidate that passed but whose sharp runtime is unproven is not a pass", () => {
    const d = evaluateReleasePrerequisites({
      ...goodRelease(),
      candidate: { passed: true, sharpRuntimeOk: false, localesOk: true },
    });
    expect(d.gates.CANDIDATE).toBe("BLOCKED");
  });

  it("documents adoption accepts a genuinely empty legacy source", () => {
    const d = evaluateReleasePrerequisites({
      ...goodRelease(),
      documentsAdoption: { resolved: true, outcome: "ZERO_DOCUMENTS", integrityVerified: true },
    });
    expect(d.releaseAllowed).toBe(true);
  });

  it("a NO_MIGRATION release does not require a backup but never fakes one", () => {
    const d = evaluateReleasePrerequisites({
      ...goodRelease(),
      migrationGate: { migrationClassification: "NO_MIGRATION", preMigrationBackupRequired: false, deployBlocked: false, historicalMutation: false, newMigrations: [] },
      backup: null,
    });
    expect(d.preMigrationBackupRequired).toBe(false);
    // Reported honestly as "not required and not proven" — never as PASS.
    expect(d.gates.ENCRYPTED_BACKUP).toBe("NOT_REQUIRED_NOT_PROVEN");
    expect(d.releaseAllowed).toBe(true);
  });

  it("off-host backup replication is owner configuration and is never reported as PASS", () => {
    const d = evaluateReleasePrerequisites({ ...goodRelease(), offHostBackupCopyProven: true } as never);
    expect(d.gates.OFF_HOST_BACKUP_COPY).toBe(OWNER_CONFIGURATION_BLOCKED);
    expect(d.ownerConfigurationBlocked).toContain("OFF_HOST_BACKUP_COPY");
  });
});

describe("PHASE997_BACKUP_EVIDENCE_READER", () => {
  const dirs: string[] = [];
  const makeDir = () => {
    const d = mkdtempSync(join(tmpdir(), "p997-backup-"));
    dirs.push(d);
    return d;
  };
  const cleanup = () => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));

  /** Write a `.hbk` + matching sidecar; returns the backup directory. */
  function writeBackup(overrides: Record<string, unknown> = {}, corruptArtifact = false) {
    const dir = makeDir();
    const backupDir = join(dir, "backups");
    mkdirSync(backupDir, { recursive: true });
    const artifact = join(backupDir, "hermes_postgres_20260808_000000.hbk");
    const bytes = Buffer.from("SYNTHETIC-CIPHERTEXT-NOT-A-REAL-BACKUP");
    writeFileSync(artifact, bytes);
    const transportSha256 = createHash("sha256").update(bytes).digest("hex");
    if (corruptArtifact) writeFileSync(artifact, Buffer.concat([bytes, Buffer.from("X")]));
    writeFileSync(
      `${artifact}.meta.json`,
      JSON.stringify({ artifactType: "postgres", verified: true, partial: false, encrypted: true, keyId: "synthetic", transportSha256, ...overrides }),
    );

    const keyFile = join(dir, "key.hex");
    // A SYNTHETIC, throwaway key value — never a real backup key.
    writeFileSync(keyFile, "0".repeat(63) + "1", { mode: 0o600 });
    try {
      chmodSync(keyFile, 0o600);
    } catch {
      /* Windows: mode bits are not meaningful */
    }
    return { backupDir, keyFile };
  }

  it("accepts a complete, verified, integrity-checked backup", () => {
    const { backupDir, keyFile } = writeBackup();
    const e = readBackupEvidence({ backupDir, keyFile, keyId: "synthetic" });
    expect(evaluateBackupPrerequisite(e).blockers).toEqual([]);
    cleanup();
  });

  it("never returns key material, only the non-secret key id", () => {
    const { backupDir, keyFile } = writeBackup();
    const e = readBackupEvidence({ backupDir, keyFile, keyId: "synthetic" });
    const serialized = JSON.stringify(e);
    expect(serialized).not.toContain("0".repeat(32));
    expect(e.keyId).toBe("synthetic");
    cleanup();
  });

  it("detects a tampered artifact through the transport digest", () => {
    const { backupDir, keyFile } = writeBackup({}, true);
    const e = readBackupEvidence({ backupDir, keyFile, keyId: "synthetic" });
    expect(e.integrityVerified).toBe(false);
    expect(e.errors).toContain("TRANSPORT_SHA256_MISMATCH");
    expect(evaluateBackupPrerequisite(e).blockers).toContain("BACKUP_INTEGRITY_UNPROVEN");
    cleanup();
  });

  it("refuses a backup whose verification record claims a partial artifact", () => {
    const { backupDir, keyFile } = writeBackup({ partial: true });
    const e = readBackupEvidence({ backupDir, keyFile, keyId: "synthetic" });
    expect(evaluateBackupPrerequisite(e).blockers).toContain("BACKUP_IS_PARTIAL");
    cleanup();
  });

  it("refuses a backup with no verification record at all", () => {
    const dir = mkdtempSync(join(tmpdir(), "p997-backup-"));
    dirs.push(dir);
    const backupDir = join(dir, "backups");
    mkdirSync(backupDir, { recursive: true });
    writeFileSync(join(backupDir, "orphan.hbk"), Buffer.from("no sidecar"));
    const e = readBackupEvidence({ backupDir, keyFile: undefined, keyId: undefined });
    expect(e.errors).toContain("VERIFICATION_RECORD_MISSING_OR_INVALID");
    expect(evaluateBackupPrerequisite(e).ok).toBe(false);
    cleanup();
  });

  it("refuses an empty backup directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "p997-backup-"));
    dirs.push(dir);
    mkdirSync(join(dir, "backups"), { recursive: true });
    const e = readBackupEvidence({ backupDir: join(dir, "backups") });
    expect(e.errors).toContain("NO_ENCRYPTED_BACKUP_FOUND");
    expect(evaluateBackupPrerequisite(e).blockers).toContain("ENCRYPTED_BACKUP_MISSING");
    cleanup();
  });

  it("refuses an artifact whose atomic publish never completed", () => {
    const { backupDir, keyFile } = writeBackup();
    writeFileSync(join(backupDir, "hermes_postgres_20260808_000000.hbk.partial"), Buffer.from("half"));
    const e = readBackupEvidence({ backupDir, keyFile, keyId: "synthetic" });
    expect(e.errors).toContain("PARTIAL_ARTIFACT_PRESENT");
    expect(evaluateBackupPrerequisite(e).ok).toBe(false);
    cleanup();
  });

  it("reports an unconfigured key file rather than assuming a default", () => {
    const { backupDir } = writeBackup();
    const e = readBackupEvidence({ backupDir });
    expect(e.keyFileConfigured).toBe(false);
    expect(e.keyIdConfigured).toBe(false);
    expect(evaluateBackupPrerequisite(e).blockers).toContain("BACKUP_KEY_FILE_NOT_CONFIGURED");
    cleanup();
  });
});
