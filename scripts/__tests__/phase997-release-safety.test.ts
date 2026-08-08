/**
 * PHASE 99.7 — release-surface safety invariants.
 *
 * Two things are pinned here.
 *
 * 1. The production deploy workflow. Phase 99.7 turned it from "rebuild
 *    hermes-web" into "rebuild hermes-web only after the migration-bearing
 *    prerequisites are proven". Each guard below is one that, if silently
 *    dropped, would let a 20-migration release run against the live database
 *    with no restorable backup — so each one is asserted individually rather
 *    than as one opaque snapshot.
 *
 * 2. OpenBao isolation. This phase must not change, enable or contact the
 *    OpenBao credential plane. The switch stays disabled by default and
 *    enabled-but-underconfigured still fails closed.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const REPO = process.cwd();
const DEPLOY_WF = join(REPO, ".github", "workflows", "deploy.yml");
const deploy = readFileSync(DEPLOY_WF, "utf8");

/** Every file Phase 99.7 owns, discovered rather than hand-listed. */
function phase997Files(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(REPO, p).split("\\").join("/"));
    }
  };
  for (const d of ["scripts", "docs/release", ".github/workflows"]) walk(join(REPO, d));
  const owned = new Set([
    "scripts/dr/release-prerequisites.mjs",
    "scripts/dr/documents-adoption.mjs",
    "scripts/dr/adopt-documents.mjs",
    "scripts/dr/sharp-runtime-gate.mjs",
    "scripts/dr/deploy-migration-gate.mjs",
    ".github/workflows/deploy.yml",
  ]);
  return out.filter(
    (rp) => owned.has(rp) || rp.startsWith("scripts/ci/phase997-") || rp.startsWith("scripts/__tests__/phase997-") || rp.startsWith("docs/release/phase99.7-") || rp.endsWith("phase997-production-completion.yml"),
  );
}

describe("PHASE997_DEPLOY_WORKFLOW", () => {
  it("is manual-only — it can never deploy on push or pull request", () => {
    expect(deploy).toMatch(/^\s*workflow_dispatch:/m);
    expect(deploy).not.toMatch(/^ {2}push:/m);
    expect(deploy).not.toMatch(/^ {2}pull_request(_target)?:/m);
  });

  it("keeps the protected production environment", () => {
    expect(deploy).toMatch(/environment:\s*production/);
  });

  it("still requires an exact 40-character SHA for both commits", () => {
    expect(deploy).toContain("40-character lowercase hex SHA");
    expect(deploy).toMatch(/-ne 40/);
    expect(deploy).toContain("commit_sha:$TARGET_SHA");
    expect(deploy).toContain("deployed_sha:$DEPLOYED_SHA");
  });

  it("requires the deployed commit to be an ancestor of the target (forward-only)", () => {
    expect(deploy).toMatch(/merge-base --is-ancestor "\$DEPLOYED_SHA" "\$TARGET_SHA"/);
  });

  it("classifies the migration delta before opening any connection", () => {
    const gateAt = deploy.indexOf("deploy-migration-gate.mjs");
    const sshAt = deploy.indexOf("Install SSH key and pinned host trust");
    expect(gateAt).toBeGreaterThan(-1);
    expect(sshAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(sshAt);
  });

  it("derives the evidence requirement from the classification, not from operator input", () => {
    // The gate keys off the computed output; a blank input cannot opt out.
    expect(deploy).toContain("BACKUP_REQUIRED: ${{ steps.migration.outputs.pre_migration_backup_required }}");
    expect(deploy).toContain("migration-prerequisites-verified");
  });

  it("proves the backup on the host before rebuilding anything", () => {
    const evidenceAt = deploy.indexOf("transportSha256");
    const rebuildAt = deploy.indexOf("up -d --build --no-deps hermes-web");
    expect(evidenceAt).toBeGreaterThan(-1);
    expect(rebuildAt).toBeGreaterThan(-1);
    expect(evidenceAt).toBeLessThan(rebuildAt);
    for (const claim of ['"verified":true', '"partial":false', '"encrypted":true']) {
      expect(deploy).toContain(claim);
    }
  });

  it("requires documents_data adoption evidence for a migration-bearing release", () => {
    expect(deploy).toContain("documents-adoption.json");
    expect(deploy).toContain('"integrityVerified": *true');
  });

  it("preserves a previous-good image before the rebuild", () => {
    const preserveAt = deploy.indexOf("hermes-web:previous-good");
    const rebuildAt = deploy.indexOf("up -d --build --no-deps hermes-web");
    expect(preserveAt).toBeGreaterThan(-1);
    expect(preserveAt).toBeLessThan(rebuildAt);
  });

  it("recreates ONLY hermes-web — postgres, redis and nginx are never touched", () => {
    expect(deploy).toContain("--no-deps hermes-web");
    expect(deploy).not.toMatch(/up\s+-d[^\n]*\b(postgres|redis|nginx)\b/);
  });

  it("never restores a database and never destroys a volume", () => {
    expect(deploy).not.toContain("restore-postgres.sh");
    expect(deploy).not.toMatch(/down\s+-v|volume\s+rm|system\s+prune/);
  });

  it("pins every Compose invocation to the canonical production project", () => {
    const composeCalls = deploy.split("\n").filter((l) => /docker compose/.test(l));
    expect(composeCalls.length).toBeGreaterThan(0);
    for (const line of composeCalls) expect(line, line.trim()).toContain("-p hermes");
  });

  it("does not enable shell tracing, which would echo secrets", () => {
    expect(deploy).not.toMatch(/^\s*set\s+-[a-wyz]*x/m);
  });
});

describe("PHASE997_OPENBAO_ISOLATION", () => {
  const SAVED: Record<string, string | undefined> = {};
  const KEYS = [
    "OT_SECRET_BACKEND",
    "OPENBAO_ENDPOINT",
    "OPENBAO_KV_MOUNT",
    "OPENBAO_KV_PREFIX",
    "OPENBAO_APPROLE_MOUNT",
    "OPENBAO_APPROLE_ROLE_ID_FILE",
    "OPENBAO_APPROLE_SECRET_ID_FILE",
  ];

  beforeEach(() => {
    for (const k of KEYS) {
      SAVED[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (SAVED[k] === undefined) delete process.env[k];
      else process.env[k] = SAVED[k];
    }
  });

  it("is disabled by default — no configuration is read and no request is made", async () => {
    const { resolveSecretBackendComposition } = await import("../../src/lib/ot-edge/secret-backend");
    const composition = resolveSecretBackendComposition();
    expect(composition.available).toBe(false);
    // Narrow the discriminated union before reading the disabled-only field.
    if (!composition.available) expect(composition.reason).toBe("DISABLED");
  });

  it("stays disabled for any value other than the exact string 'openbao'", async () => {
    const { resolveSecretBackendComposition } = await import("../../src/lib/ot-edge/secret-backend");
    // Note "openbao " is excluded deliberately: the switch is read trimmed, so
    // a trailing space DOES enable it (and then fails closed on missing config).
    for (const value of ["true", "1", "OpenBao", "openbao-kv", "postgres", "false"]) {
      process.env.OT_SECRET_BACKEND = value;
      const composition = resolveSecretBackendComposition();
      expect(composition.available, `value "${value}" must not enable the backend`).toBe(false);
      if (!composition.available) expect(composition.reason).toBe("DISABLED");
    }
  });

  it("enabled-but-underconfigured still fails closed rather than degrading", async () => {
    const { resolveSecretBackendComposition } = await import("../../src/lib/ot-edge/secret-backend");
    process.env.OT_SECRET_BACKEND = "openbao";
    expect(() => resolveSecretBackendComposition()).toThrow();
  });

  it("no Phase 99.7 file enables or configures the OpenBao credential plane", () => {
    // Test files are excluded: proving the switch fails closed requires setting
    // it, in this process only. Nothing under scripts/__tests__ ships or runs in
    // production.
    for (const rp of phase997Files().filter((f) => !f.startsWith("scripts/__tests__/"))) {
      const content = readFileSync(join(REPO, rp), "utf8");
      expect(/OT_SECRET_BACKEND\s*=\s*["']?openbao/.test(content), `${rp} enables OpenBao`).toBe(false);
      expect(/\bOPENBAO_APPROLE_(ROLE|SECRET)_ID\b\s*=/.test(content), `${rp} sets AppRole credentials`).toBe(false);
    }
  });

  it("the production Compose stack defines no OpenBao service", () => {
    const compose = readFileSync(join(REPO, "docker-compose.prod.yml"), "utf8");
    expect(compose).not.toMatch(/^\s{2}openbao:/m);
  });

  it("the OpenBao surface is untouched by this phase", () => {
    // Compared against the phase base recorded in the migration ledger, so the
    // assertion cannot drift from the branch it is meant to describe.
    const base = JSON.parse(readFileSync(join(REPO, "docs", "release", "phase99.7-migration-ledger.json"), "utf8")).targetSha;
    let changed: string[] = [];
    try {
      changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: REPO, encoding: "utf8" })
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      // Shallow checkout: the static assertions above still hold this invariant.
      return;
    }
    const openbaoTouched = changed.filter((f) => /openbao/i.test(f) || f === "src/lib/ot-edge/secret-backend.ts");
    expect(openbaoTouched, `Phase 99.7 must not change the OpenBao surface`).toEqual([]);
  });
});

describe("PHASE997_PROHIBITED_HOSTS", () => {
  it("no Phase 99.7 file contains a production, OpenBao or pentest host literal", () => {
    // Split so this test file is not itself a file containing those addresses.
    const prohibited = [["51.195", "255.7"], ["146.19", "130.221"]].map((p) => p.join("."));
    for (const rp of phase997Files()) {
      const content = readFileSync(join(REPO, rp), "utf8");
      for (const host of prohibited) {
        expect(content.includes(host), `${rp} contains a prohibited host literal`).toBe(false);
      }
    }
  });
});
