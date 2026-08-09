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

  it("proves the backup on the host before building anything", () => {
    const evidenceAt = deploy.indexOf("transportSha256");
    const buildAt = deploy.indexOf("build hermes-web");
    expect(evidenceAt).toBeGreaterThan(-1);
    expect(buildAt).toBeGreaterThan(-1);
    expect(evidenceAt).toBeLessThan(buildAt);
    for (const claim of ['"verified":true', '"partial":false', '"encrypted":true']) {
      expect(deploy).toContain(claim);
    }
  });

  it("requires documents_data adoption evidence for a migration-bearing release", () => {
    expect(deploy).toContain("documents-adoption.json");
    expect(deploy).toContain('"integrityVerified": *true');
  });

  it("fails closed on a dirty server worktree BEFORE checkout", () => {
    const dirtyAt = deploy.indexOf("the server worktree at /opt/hermes-os-nexuz is dirty");
    const checkoutAt = deploy.indexOf('git checkout --detach "$TARGET_SHA"');
    expect(dirtyAt).toBeGreaterThan(-1);
    expect(checkoutAt).toBeGreaterThan(-1);
    expect(dirtyAt).toBeLessThan(checkoutAt);
    expect(deploy).toContain("git status --porcelain");
  });

  it("proves the build context is exactly TARGET_SHA after checkout, before build", () => {
    const checkoutAt = deploy.indexOf('git checkout --detach "$TARGET_SHA"');
    const headProofAt = deploy.indexOf("post-checkout HEAD does not equal TARGET_SHA");
    const postCleanAt = deploy.indexOf("dirty after checkout");
    const buildAt = deploy.indexOf("build hermes-web");
    expect(headProofAt).toBeGreaterThan(checkoutAt);
    expect(postCleanAt).toBeGreaterThan(checkoutAt);
    expect(headProofAt).toBeLessThan(buildAt);
    expect(postCleanAt).toBeLessThan(buildAt);
    expect(deploy).toContain("git rev-parse HEAD");
  });

  it("treats a missing previous-good image as a HARD failure, never a warning", () => {
    expect(deploy).toContain("no running hermes-web container found");
    expect(deploy).not.toContain("WARNING: no running hermes-web");
    // The refusal is a real exit, inside the previous-good block.
    const block = deploy.slice(deploy.indexOf("Preserve the previous-good image"), deploy.indexOf('git checkout --detach "$TARGET_SHA"'));
    expect(block).toContain("no previous-good rollback target exists");
    expect(block.match(/exit 1/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("verifies the preserved tag resolves to exactly the pre-cutover image ID", () => {
    expect(deploy).toContain("docker inspect -f '{{.Image}}'");
    expect(deploy).toContain("docker image inspect -f '{{.Id}}'");
    expect(deploy).toContain("does not resolve to the pre-cutover image");
    const preserveAt = deploy.indexOf("hermes-web:previous-good");
    const buildAt = deploy.indexOf("build hermes-web");
    expect(preserveAt).toBeGreaterThan(-1);
    expect(preserveAt).toBeLessThan(buildAt);
  });

  it("applies migrations explicitly with the pinned migrator BEFORE replacing hermes-web", () => {
    const buildWebAt = deploy.indexOf("build hermes-web");
    const migrateRunAt = deploy.indexOf("--profile migrate run --rm -T hermes-migrate");
    const upAt = deploy.indexOf("up -d --no-deps hermes-web");
    expect(buildWebAt).toBeGreaterThan(-1);
    expect(migrateRunAt).toBeGreaterThan(-1);
    expect(upAt).toBeGreaterThan(-1);
    // build web -> migrate -> replace web, strictly in that order.
    expect(buildWebAt).toBeLessThan(migrateRunAt);
    expect(migrateRunAt).toBeLessThan(upAt);
    // The migrator is the pinned target-derived stage, not a network-fetched CLI.
    expect(deploy).toContain("--profile migrate build hermes-migrate");
    expect(deploy).not.toMatch(/npx\s+prisma/);
  });

  it("verifies the migration outcome before replacing hermes-web", () => {
    const statusAt = deploy.indexOf("migrate status");
    const countAt = deploy.indexOf("_prisma_migrations");
    const upAt = deploy.indexOf("up -d --no-deps hermes-web");
    expect(statusAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(-1);
    expect(statusAt).toBeLessThan(upAt);
    expect(countAt).toBeLessThan(upAt);
    // The expected count is wired from the runner's git-only classification and
    // validated as an integer before it crosses the SSH boundary.
    expect(deploy).toContain("TARGET_MIGRATION_COUNT: ${{ steps.migration.outputs.target_migration_count }}");
    expect(deploy).toContain('case "$TARGET_MIGRATION_COUNT" in');
    expect(deploy).toContain("applied migration count");
    expect(deploy).toContain("unfinished or rolled back");
  });

  it("recreates ONLY hermes-web — postgres, redis and nginx are never touched", () => {
    expect(deploy).toContain("up -d --no-deps hermes-web");
    expect(deploy).not.toMatch(/up\s+-d[^\n]*\b(postgres|redis|nginx|hermes-migrate)\b/);
  });

  it("passes the canonical env file to EVERY compose invocation (NEXT_PUBLIC interpolation)", () => {
    // Without --env-file, the NEXT_PUBLIC_* build args silently interpolate to
    // empty strings — the exact regression this test exists to prevent.
    const composeCalls = deploy.split("\n").filter((l) => /docker compose/.test(l));
    expect(composeCalls.length).toBeGreaterThan(0);
    for (const line of composeCalls) expect(line, line.trim()).toContain("--env-file .env.production");
    // And the file's existence is a precondition on the host.
    expect(deploy).toContain(".env.production is missing");
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

describe("PHASE997_MIGRATOR_STAGE", () => {
  const dockerfile = readFileSync(join(REPO, "Dockerfile"), "utf8");
  const compose = readFileSync(join(REPO, "docker-compose.prod.yml"), "utf8");

  it("the Dockerfile has a pinned migrator stage with the Prisma CLI", () => {
    expect(dockerfile).toMatch(/FROM node:20-alpine AS migrator/);
    // The CLI comes from the checkout's own lockfile install (deps stage), so
    // the migrator can never be a network-fetched `npx prisma@latest`.
    expect(dockerfile).toContain("COPY --from=deps /app/node_modules ./node_modules");
    expect(dockerfile).toContain('CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]');
  });

  it("the runner remains the LAST stage, so a bare docker build still targets it", () => {
    const stages = [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gm)].map((m) => m[1]);
    expect(stages[stages.length - 1]).toBe("runner");
    expect(stages).toContain("migrator");
  });

  it("the runner never migrates on boot — its CMD is the server only", () => {
    const runnerStage = dockerfile.slice(dockerfile.indexOf("AS runner"));
    expect(runnerStage).toContain('CMD ["node", "server.js"]');
    expect(runnerStage).not.toContain("migrate deploy");
  });

  it("hermes-migrate is profile-gated in the production compose — `up -d` never starts it", () => {
    // Slice from the service definition to the NEXT top-level service after it
    // ("postgres:" also appears earlier inside hermes-web's depends_on).
    const start = compose.indexOf("\n  hermes-migrate:");
    expect(start).toBeGreaterThan(-1);
    const service = compose.slice(start, compose.indexOf("\n  postgres:", start));
    expect(service).toContain('profiles: ["migrate"]');
    expect(service).toContain("target: migrator");
    expect(service).toContain("env_file: .env.production");
    expect(service).toContain("hermes_internal");
    expect(service).toContain("service_healthy");
    // No published ports, no restart policy that could resurrect it.
    expect(service).not.toContain("ports:");
    expect(service).not.toContain("restart:");
  });
});

describe("PHASE997_GATE_0D_A_CONTRACT", () => {
  const checker = readFileSync(join(REPO, "scripts", "production-compose-project-static-check.mjs"), "utf8");

  it("recognises a Compose invocation inside a command substitution", () => {
    // With a whitespace-only boundary, `X="$(docker compose … )"` was not seen
    // as an invocation at all, so an UNPINNED command wrapped in `$( )` skipped
    // every Tier 1 check. Re-derive the regex from the source and prove it.
    const match = /const COMPOSE_INVOCATION = (\/.*\/);/.exec(checker);
    expect(match, "COMPOSE_INVOCATION not found").not.toBeNull();
    const src = match![1];
    const body = src.slice(1, src.lastIndexOf("/"));
    const re = new RegExp(body);

    expect(re.test('APPLIED="$(docker compose -p hermes -f docker-compose.prod.yml ps -q hermes-web)"')).toBe(true);
    expect(re.test("docker compose -p hermes -f docker-compose.prod.yml ps hermes-web")).toBe(true);
    expect(re.test("  docker compose -p hermes up -d")).toBe(true);
    // The bare filename in prose is still NOT an invocation.
    expect(re.test("see docker-compose.prod.yml for the service list")).toBe(false);
  });

  it("still forbids destructive and unpinned migration tooling", () => {
    expect(checker).toContain("FORBIDDEN_DESTRUCTIVE_MIGRATION");
    expect(checker).toContain("FORBIDDEN_UNPINNED_CLI");
    expect(checker).toContain("FORBIDDEN_DB_PUSH");
    // The blanket ban that made the required migrator impossible is gone, but
    // only the safe subcommands are permitted.
    expect(checker).toMatch(/prisma\\s\+migrate\\s\+\(dev\|reset\|resolve\|diff\)/);
  });

  it("constrains every newly-permitted subcommand", () => {
    for (const code of [
      "DEPLOY_BUILD_TARGET",
      "DEPLOY_BUILD_NEVER_DATA_SERVICE",
      "DEPLOY_RUN_MIGRATOR_ONLY",
      "DEPLOY_RUN_EPHEMERAL",
      "DEPLOY_RUN_PROFILE_GATED",
      "DEPLOY_EXEC_TARGET",
      "DEPLOY_EXEC_NON_INTERACTIVE",
      "DEPLOY_EXEC_READ_ONLY",
      "DEPLOY_EXEC_IS_QUERY",
      "DEPLOY_UP_NEVER_MIGRATOR",
      "DEPLOY_ENV_FILE",
    ]) {
      expect(checker, `${code} missing from Gate 0D-A`).toContain(code);
    }
  });

  it("positively requires the migration contract, in order", () => {
    for (const code of [
      "DEPLOY_MIGRATOR_PRESENT",
      "DEPLOY_MIGRATION_STATUS_VERIFIED",
      "DEPLOY_MIGRATION_COUNT_VERIFIED",
      "DEPLOY_MIGRATE_BEFORE_CUTOVER",
      "DEPLOY_VERIFY_BEFORE_CUTOVER",
    ]) {
      expect(checker, `${code} missing from Gate 0D-A`).toContain(code);
    }
  });

  it("keeps every original safety property", () => {
    for (const code of [
      "COMPOSE_TOP_LEVEL_NAME",
      "DEPLOY_PROJECT_PIN",
      "DEPLOY_SINGLE_PROJECT_FLAG",
      "DEPLOY_UP_NO_DEPS",
      "DEPLOY_UP_TARGET",
      "FORBIDDEN_COMPOSE_DOWN",
      "FORBIDDEN_VOLUME_RM",
      "FORBIDDEN_SYSTEM_PRUNE",
      "FORBIDDEN_GIT_PULL",
      "FORBIDDEN_DERIVED_PROJECT",
      "GATE0A_READ_ONLY_PERMISSIONS",
      "GATE0A_STRICT_HOST_KEY",
    ]) {
      expect(checker, `${code} was removed from Gate 0D-A`).toContain(code);
    }
  });
});

describe("PHASE997_PINNED_BUILD_TOOLING", () => {
  const dockerfile = readFileSync(join(REPO, "Dockerfile"), "utf8");
  const compose = readFileSync(join(REPO, "docker-compose.prod.yml"), "utf8");

  it("no build step can fall back to a network-resolved CLI", () => {
    // `npx` is correct when resolution succeeds and dangerous when it fails: an
    // observed build on a degraded layer cache logged npm about to install
    // prisma@7.9.1 while this repository pins 7.8.0. The image version must be
    // an artifact of package-lock.json, never of what the registry served.
    const npxRunLines = dockerfile.split("\n").filter((l) => /^\s*RUN\b/.test(l) && /\bnpx\b/.test(l));
    expect(npxRunLines, `RUN steps using npx: ${npxRunLines.join(" | ")}`).toEqual([]);
  });

  it("generates the Prisma client with the pinned local CLI", () => {
    expect(dockerfile).toContain("node node_modules/prisma/build/index.js generate");
  });

  it("ships a dedicated migrator stage, and runner remains the final stage", () => {
    expect(dockerfile).toMatch(/FROM\s+\S+\s+AS\s+migrator/i);
    const stages = [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gim)].map((m) => m[1]);
    // A bare `docker build .` and the compose build both target the LAST stage.
    expect(stages[stages.length - 1]).toBe("runner");
  });

  it("the migrator applies migrations with the pinned local CLI", () => {
    const migratorBlock = dockerfile.slice(dockerfile.search(/FROM\s+\S+\s+AS\s+migrator/i), dockerfile.search(/FROM\s+\S+\s+AS\s+runner/i));
    expect(migratorBlock).toContain("node_modules/prisma/build/index.js");
    expect(migratorBlock).toMatch(/"migrate",\s*"deploy"/);
    // It must not run as root.
    expect(migratorBlock).toMatch(/USER\s+migrator/);
  });

  it("the runner image never migrates on boot", () => {
    const runnerBlock = dockerfile.slice(dockerfile.search(/FROM\s+\S+\s+AS\s+runner/i));
    expect(runnerBlock).toContain('CMD ["node", "server.js"]');
    expect(runnerBlock).not.toMatch(/migrate\s+deploy/);
  });

  it("the migrator compose service is profile-gated so `up -d` never starts it", () => {
    expect(compose).toMatch(/^ {2}hermes-migrate:/m);
    const svc = compose.slice(compose.search(/^ {2}hermes-migrate:/m), compose.search(/^ {2}postgres:/m));
    expect(svc).toMatch(/profiles:\s*\["migrate"\]/);
    expect(svc).toContain("target: migrator");
    // It must hold no published port.
    expect(svc).not.toMatch(/^\s+ports:/m);
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
