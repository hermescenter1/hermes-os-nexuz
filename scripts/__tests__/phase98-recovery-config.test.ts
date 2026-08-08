import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REDIS_PERSISTENCE_DECISION,
  classifyRedisInventory,
  assertRedisLossSecurityFailmode,
  REDIS_DATA_SITES,
} from "../dr/redis-recovery-policy.mjs";
import { buildRecoverySet, validateRecoverySet, recoverySetSha256 } from "../dr/recovery-set.mjs";
import { renderInventory, validateInventory, inventorySha256 } from "../dr/config-inventory.mjs";
import { scanForSecrets } from "../dr/secret-scan.mjs";

const root = process.cwd();
const SHA40 = "a".repeat(40);

describe("REDIS_RECOVERY_POLICY", () => {
  it("decision is REBUILD_FROM_AUTHORITATIVE_STATE with no authoritative-only / unknown state", () => {
    const r = classifyRedisInventory();
    expect(REDIS_PERSISTENCE_DECISION).toBe("REBUILD_FROM_AUTHORITATIVE_STATE");
    expect(r.hasAuthoritativeOnly).toBe(false);
    expect(r.unknownCount).toBe(0);
    expect(r.decision).toBe("REBUILD_FROM_AUTHORITATIVE_STATE");
    expect(r.ok).toBe(true);
  });

  it("REDIS_LOSS_SECURITY_FAILMODE: no site fails open on Redis loss", () => {
    const r = assertRedisLossSecurityFailmode();
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it("fails closed if an authoritative-only site is introduced (UNKNOWN or authoritative)", () => {
    const withAuth = [...REDIS_DATA_SITES, { site: "x", keyNamespace: "x:", stores: "x", ttl: false, durableSourceOfTruth: true, reconstructable: false, lossFailMode: "data loss", classification: "AUTHORITATIVE_STATE" }];
    const r = classifyRedisInventory(withAuth);
    expect(r.hasAuthoritativeOnly).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.decision).toBe("RECOVER_FROM_AOF_BACKUP");
  });

  it("UNKNOWN classification forces a non-rebuild decision", () => {
    const withUnknown = [...REDIS_DATA_SITES, { site: "y", keyNamespace: "y:", stores: "y", ttl: true, durableSourceOfTruth: false, reconstructable: true, lossFailMode: "degrade", classification: "UNKNOWN" }];
    expect(classifyRedisInventory(withUnknown).ok).toBe(false);
  });
});

describe("RECOVERY_SET", () => {
  const base = {
    postgres: { name: "hermes_postgres_x.hbk", transportSha256: "b".repeat(64), snapshotAt: "2026-08-07T00:00:00.000Z" },
    uploads: { name: "hermes_uploads_x.hbk", transportSha256: "c".repeat(64), snapshotAt: "2026-08-07T00:05:00.000Z", fileCount: 12, manifestSha256: "d".repeat(64) },
    applicationGitSha: SHA40,
    releaseManifestHash: "e".repeat(64),
    configurationManifestHash: "f".repeat(64),
    schemaFingerprint: "0".repeat(64),
    backupKeyId: "hermes-backup-2026-08",
    recoverySetCreatedAt: "2026-08-07T00:06:00.000Z",
  };

  it("builds a hashable set, computes snapshot skew, and validates clean", () => {
    const set = buildRecoverySet(base);
    expect(set.maxSnapshotSkewMs).toBe(5 * 60 * 1000);
    expect(set.consistencyModel).toBe("INDEPENDENT_SNAPSHOTS_NOT_TRANSACTIONAL");
    expect(recoverySetSha256(set)).toMatch(/^[0-9a-f]{64}$/);
    expect(validateRecoverySet(set).ok).toBe(true);
  });

  it("rejects key material masquerading as backupKeyId", () => {
    const set = buildRecoverySet({ ...base, backupKeyId: "a".repeat(64) });
    const r = validateRecoverySet(set);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/BACKUP_KEY_IN_RECOVERY_SET/);
  });

  it("rejects an embedded credentialed URL (no secret values allowed)", () => {
    const set = buildRecoverySet(base);
    // @ts-expect-error inject a forbidden field for the test
    set.leak = "postgresql://hermes:supersecret@postgres:5432/hermes_db";
    expect(validateRecoverySet(set).ok).toBe(false);
  });
});

describe("CONFIGURATION_INVENTORY", () => {
  const inv = renderInventory();
  const envExample = readFileSync(join(root, ".env.production.example"), "utf8");

  it("documents every key present in .env.production.example", () => {
    const r = validateInventory(inv, envExample);
    if (!r.ok) console.error(r.errors);
    expect(r.ok).toBe(true);
  });

  it("CONFIGURATION_SECRET_REDACTION: inventory has no secret values, only names", () => {
    expect(scanForSecrets(inv)).toEqual([]);
    // Every secret env key is present by NAME with secret:true and an external recovery source.
    const dbUrl = inv.env.find((e) => e.key === "DATABASE_URL");
    expect(dbUrl?.secret).toBe(true);
    expect(dbUrl?.sourceClass).toBe("SECRET_EXTERNAL");
  });

  it("CONFIGURATION_SOURCE_CLASSIFICATION: no UNKNOWN owner and every non-repo item has a recovery source", () => {
    for (const item of [...inv.env, ...inv.surfaces, ...inv.volumes]) {
      expect(item.ownerRole && item.ownerRole !== "UNKNOWN").toBeTruthy();
      if (item.sourceClass !== "REPOSITORY_MANAGED") {
        expect(item.recoverySource && item.recoverySource !== "UNKNOWN").toBeTruthy();
      }
    }
  });

  it("includes the Phase 98 additive documents_data volume and backup key names", () => {
    expect(inv.volumes.map((v) => v.name)).toContain("documents_data");
    expect(inv.env.map((e) => e.key)).toContain("HERMES_BACKUP_KEY_FILE");
    expect(inv.env.map((e) => e.key)).toContain("HERMES_BACKUP_KEY_ID");
    expect(inventorySha256()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails closed when the env template adds an undocumented key", () => {
    const r = validateInventory(inv, envExample + "\nSOME_NEW_UNDOCUMENTED_KEY=x\n");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/SOME_NEW_UNDOCUMENTED_KEY/);
  });
});
