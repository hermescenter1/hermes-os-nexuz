import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * PHASE 95 — behavioural tests for scripts/deploy/openbao-activate.sh.
 *
 * Network-free and host-free: `sudo` and `docker` are shimmed on PATH; the real
 * marker/credentials/OpenBao/production are NEVER touched. Each case drives the
 * script through env flags and asserts exit code + recorded compose calls + the
 * fail-closed / rollback behaviour. POSIX-only (needs bash + PATH shims).
 */

const isWindows = process.platform === "win32";
const script = resolve(__dirname, "..", "openbao-activate.sh");

// The sudo/docker shims live in plain .sh fixtures (kept out of the .ts source so
// their shell `${…}` never collides with JS template interpolation).
const SUDO_SHIM = readFileSync(resolve(__dirname, "fixtures", "sudo.sh"), "utf8");
const DOCKER_SHIM = readFileSync(resolve(__dirname, "fixtures", "docker.sh"), "utf8");

let bin: string;
const GOOD_MARKER = [
  "OPENBAO_ROLE_ID_HOST_FILE=/etc/hermes-openbao/runtime/role-id",
  "OPENBAO_SECRET_ID_HOST_FILE=/etc/hermes-openbao/runtime/secret-id",
  "OPENBAO_CA_HOST_FILE=/etc/hermes-openbao/ca.crt",
  "OPENBAO_PRIVATE_IP=10.0.0.5",
  "OPENBAO_RUNTIME_GID=6000",
].join("\n");

beforeAll(() => {
  if (isWindows) return;
  bin = mkdtempSync(join(tmpdir(), "p95bin-"));
  writeFileSync(join(bin, "sudo"), SUDO_SHIM);
  writeFileSync(join(bin, "docker"), DOCKER_SHIM);
  chmodSync(join(bin, "sudo"), 0o755);
  chmodSync(join(bin, "docker"), 0o755);
});
afterAll(() => {
  if (!isWindows && bin) rmSync(bin, { recursive: true, force: true });
});

function run(env: Record<string, string>) {
  const callsFile = join(bin, `calls-${Math.random().toString(36).slice(2)}`);
  writeFileSync(callsFile, "");
  const res = spawnSync("bash", [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      // Prepend the shim dir so the mocked sudo/docker win over any real ones.
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      OPENBAO_REPO_ROOT: "/opt/hermes-os-nexuz",
      OPENBAO_MARKER: "/etc/hermes-openbao/activation.env",
      MOCK_CALLS: callsFile,
      MOCK_MARKER_CONTENT: GOOD_MARKER,
      ...env,
    },
    timeout: 30_000,
  });
  const calls = readFileSync(callsFile, "utf8").trim().split("\n").filter(Boolean);
  rmSync(callsFile, { force: true });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "", calls };
}

describe.skipIf(isWindows)("95 — openbao-activate.sh behaviour", () => {
  it("1. marker absent → base-only deploy (backend disabled), exit 0", () => {
    const r = run({ MOCK_MARKER_PRESENT: "absent" });
    expect(r.status).toBe(0);
    expect(r.calls).toContain("up:base");
    expect(r.calls).not.toContain("up:active");
  });

  it("2. marker exists but deploy user has no sudo → fail closed, no deploy", () => {
    const r = run({ MOCK_MARKER_PRESENT: "present", MOCK_SUDO: "deny" });
    expect(r.status).toBe(1);
    expect(r.calls).toHaveLength(0);
  });

  it("3. sudo -n unavailable → fail closed", () => {
    const r = run({ MOCK_SUDO: "deny" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/sudo -n/);
    expect(r.calls).toHaveLength(0);
  });

  it("4. marker unreadable → fail closed (no deploy)", () => {
    const r = run({ MOCK_MARKER_PRESENT: "present", MOCK_MARKER_READABLE: "0" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cannot read marker/);
    expect(r.calls).toHaveLength(0);
  });

  it("5. marker malformed → fail closed (no deploy)", () => {
    const r = run({ MOCK_MARKER_CONTENT: "GARBAGE LINE ; rm -rf /" });
    expect(r.status).toBe(1);
    expect(r.calls).toHaveLength(0);
  });

  it("6. active compose up failure → base rollback invoked, exit 1", () => {
    // The active `up` fails; the fresh base container is (correctly) disabled.
    const r = run({ MOCK_ACTIVE_UP_RC: "1", MOCK_EXEC_BACKEND: "disabled", MOCK_EXEC_SECRETS: "absent" });
    expect(r.status).toBe(1);
    expect(r.calls).toContain("up:active");
    expect(r.calls).toContain("up:base"); // rollback
  });

  it("7. active verification failure → base rollback invoked, exit 1", () => {
    // active up ok, but the in-container backend check fails.
    const r = run({ MOCK_EXEC_BACKEND: "disabled" });
    expect(r.status).toBe(1);
    expect(r.calls).toContain("up:active");
    expect(r.calls).toContain("up:base");
  });

  it("8. rollback but OT_SECRET_BACKEND=openbao remains → ROLLBACK_UNVERIFIED, no success claim", () => {
    // Reach rollback via a wrong host mapping; during rollback the backend still reads openbao.
    const r = run({ MOCK_HOSTS: "10.9.9.9 openbao", MOCK_EXEC_BACKEND: "openbao" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/ROLLBACK_UNVERIFIED/);
    expect(r.stderr).not.toMatch(/backend disabled, mounts absent/);
  });

  it("9. rollback but OpenBao mounts remain → ROLLBACK_UNVERIFIED", () => {
    const r = run({
      MOCK_HOSTS: "10.9.9.9 openbao", // force active-verify failure → rollback
      MOCK_EXEC_BACKEND: "disabled",
      MOCK_EXEC_SECRETS: "absent",
      MOCK_RB_MOUNTS: "/run/secrets/openbao_role_id",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/ROLLBACK_UNVERIFIED/);
  });

  it("10. /etc/hosts maps openbao to the WRONG IP → active verify fails → rollback", () => {
    const r = run({ MOCK_HOSTS: "10.9.9.9 openbao", MOCK_EXEC_BACKEND: "openbao", MOCK_EXEC_SECRETS: "present" });
    expect(r.status).toBe(1);
    expect(r.calls).toContain("up:active");
    expect(r.calls).toContain("up:base"); // rollback triggered by exact host-mapping check
  });

  it("happy path: valid marker + healthy verified activation → exit 0, no rollback", () => {
    const r = run({
      MOCK_HOSTS: "10.0.0.5 openbao hermes",
      MOCK_EXEC_BACKEND: "openbao",
      MOCK_EXEC_SECRETS: "present",
      MOCK_HEALTH: "healthy",
    });
    expect(r.status).toBe(0);
    expect(r.calls).toContain("config");
    expect(r.calls).toContain("up:active");
    expect(r.calls).not.toContain("up:base"); // no rollback
  });
});
