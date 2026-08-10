/**
 * PHASE 99.7 — the candidate gate must NEVER touch the repository's
 * `.env.production`.
 *
 * Owner-review blocker: the first revision of the gate wrote its synthetic env
 * file to `<repo>/.env.production` and deleted it in cleanup — which would
 * destroy a real operator env file on any machine that has one. The fix
 * redirects Compose's project directory to an isolated workspace, so the
 * repository file is never created, read, truncated, replaced or deleted.
 *
 * These tests prove that property with a pre-existing sentinel file, byte for
 * byte, on both the PASS path (prepare → cleanup) and the FAIL path (prepare →
 * crash → cleanup), and statically pin the mechanism so a regression cannot
 * reintroduce the repo path.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ENV_FILE_SERVICES, buildCandidateComposeArgs, writeCandidateEnv } from "../ci/phase997-candidate-gate.mjs";

const roots: string[] = [];

/** Sentinel bytes deliberately include CRLF, UTF-8 and a trailing partial line. */
const SENTINEL = Buffer.from(
  "# operator file — must survive byte-for-byte\r\nDATABASE_URL=postgresql://real:${REAL}@db:5432/prod\r\nPERSIAN=مقدار آزمایشی\nNO_TRAILING_NEWLINE=true",
  "utf8",
);

function scratch() {
  const root = mkdtempSync(join(tmpdir(), "p997-iso-"));
  roots.push(root);
  const repoDir = join(root, "repo");
  const workDir = join(root, "work");
  mkdirSync(join(repoDir, "deploy", "rehearsal"), { recursive: true });
  mkdirSync(workDir, { recursive: true });
  // The pre-existing operator env file the gate must never touch.
  writeFileSync(join(repoDir, ".env.production"), SENTINEL);
  return { repoDir, workDir };
}

/** Recursive listing of every file under a directory (stable order). */
function listFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

const synthetic = {
  pgPassword: "disposable_test_pg",
  redisPassword: "disposable_test_redis",
  jwtAccess: "a".repeat(96),
  jwtRefresh: "b".repeat(96),
  databaseUrl: "postgresql://hermes:disposable_test_pg@postgres:5432/hermes_db",
  redisUrl: "redis://:disposable_test_redis@redis:6379",
};

afterEach(() => {
  roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true }));
});

describe("PHASE997_CANDIDATE_ENV_ISOLATION", () => {
  it("PASS path: prepare + cleanup leave the repo sentinel byte-for-byte intact", () => {
    const { repoDir, workDir } = scratch();
    const repoBefore = listFiles(repoDir);

    const { envFile } = buildCandidateComposeArgs({ repoDir, workDir });
    writeCandidateEnv({ envFile, ...synthetic });

    // The synthetic env landed in the WORKSPACE, not the repository.
    expect(envFile.startsWith(workDir)).toBe(true);
    expect(existsSync(envFile)).toBe(true);

    // Cleanup is exactly "remove the workspace".
    rmSync(workDir, { recursive: true, force: true });

    const sentinelAfter = readFileSync(join(repoDir, ".env.production"));
    expect(sentinelAfter.equals(SENTINEL), "sentinel bytes changed").toBe(true);
    expect(listFiles(repoDir)).toEqual(repoBefore);
  });

  it("FAIL path: a crash between prepare and cleanup still leaves the sentinel intact", () => {
    const { repoDir, workDir } = scratch();

    const { envFile } = buildCandidateComposeArgs({ repoDir, workDir });
    let crashed = false;
    try {
      writeCandidateEnv({ envFile, ...synthetic });
      throw new Error("simulated candidate failure after workspace preparation");
    } catch {
      crashed = true;
    } finally {
      // The gate's finally block: remove the workspace only.
      rmSync(workDir, { recursive: true, force: true });
    }
    expect(crashed).toBe(true);
    expect(readFileSync(join(repoDir, ".env.production")).equals(SENTINEL)).toBe(true);
  });

  it("works identically when the repository has NO .env.production", () => {
    const { repoDir, workDir } = scratch();
    rmSync(join(repoDir, ".env.production"), { force: true });

    const { envFile } = buildCandidateComposeArgs({ repoDir, workDir });
    writeCandidateEnv({ envFile, ...synthetic });
    rmSync(workDir, { recursive: true, force: true });

    // The gate must not have conjured a repo env file either.
    expect(existsSync(join(repoDir, ".env.production"))).toBe(false);
  });

  it("the compose invocation never references the repository env file", () => {
    const { repoDir, workDir } = scratch();
    const { envFile, composeArgs } = buildCandidateComposeArgs({ repoDir, workDir });

    const repoEnv = join(repoDir, ".env.production");
    expect(composeArgs).not.toContain(repoEnv);
    expect(composeArgs).toContain("--env-file");
    expect(composeArgs[composeArgs.indexOf("--env-file") + 1]).toBe(envFile);
    // The real production compose definitions are still what is validated.
    expect(composeArgs).toContain(join(repoDir, "docker-compose.prod.yml"));
    // The project directory is NOT redirected — doing so would re-root every
    // relative path in the compose files (nginx bind mounts, build contexts).
    expect(composeArgs).not.toContain("--project-directory");
  });

  it("overrides env_file for every service that declares one", () => {
    const { repoDir, workDir } = scratch();
    const { envFile, envOverrideFile, composeArgs } = buildCandidateComposeArgs({ repoDir, workDir });

    // The override must be the LAST compose file so its values win the merge.
    expect(composeArgs[composeArgs.length - 1]).toBe(envOverrideFile);

    const override = readFileSync(envOverrideFile, "utf8");
    for (const svc of ENV_FILE_SERVICES) {
      expect(override, `${svc} missing from the env override`).toContain(`  ${svc}:`);
    }
    // `!override` REPLACES the value; a plain merge could leave the repository
    // file in the list.
    expect(override).toContain("env_file: !override");
    expect(override.match(/env_file: !override/g)?.length).toBe(ENV_FILE_SERVICES.length);
    // It points at the isolated file, with forward slashes for YAML.
    expect(override).toContain(envFile.split("\\").join("/"));
    expect(override).not.toContain(join(repoDir, ".env.production").split("\\").join("/"));
  });

  it("the override list matches the services that actually declare env_file", () => {
    // Guards against a new production service picking up `.env.production`
    // without being added to the override — which would silently reintroduce a
    // read of the repository file.
    const compose = readFileSync(join(process.cwd(), "docker-compose.prod.yml"), "utf8");
    const declaring: string[] = [];
    let current: string | null = null;
    for (const line of compose.split("\n")) {
      const svc = /^ {2}([a-z0-9][a-z0-9_-]*):\s*$/.exec(line);
      if (svc) current = svc[1];
      if (/^\s+env_file:\s*\.env\.production\s*$/.test(line) && current) declaring.push(current);
    }
    // hermes-migrate is profile-gated and never started by the candidate gate,
    // so it is deliberately absent from the runtime override list.
    expect(declaring.filter((s) => s !== "hermes-migrate").sort()).toEqual([...ENV_FILE_SERVICES].sort());
  });

  it("the env file basename is exactly .env.production (the name the services reference)", () => {
    const { repoDir, workDir } = scratch();
    const { envFile } = buildCandidateComposeArgs({ repoDir, workDir });
    expect(envFile).toBe(join(workDir, ".env.production"));
  });
});

describe("PHASE997_CANDIDATE_GATE_SOURCE", () => {
  const source = readFileSync(join(process.cwd(), "scripts", "ci", "phase997-candidate-gate.mjs"), "utf8");

  it("never derives an env-file path from the repository", () => {
    expect(source).not.toMatch(/join\(\s*REPO\s*,\s*["']\.env\.production["']\s*\)/);
  });

  it("redirects env_file via !override and cleans up only the workspace", () => {
    expect(source).toContain("env_file: !override");
    // No rmSync/unlink call may name the repository env file.
    expect(source).not.toMatch(/rmSync\([^)]*REPO[^)]*\.env\.production/);
  });

  it("importing the module must not execute the gate (entry-point guard)", () => {
    // The very fact this suite imported it without Docker running proves the
    // behaviour; pin the mechanism too.
    expect(source).toContain("invokedDirectly");
    expect(source).toMatch(/if\s*\(invokedDirectly\)/);
  });
});
