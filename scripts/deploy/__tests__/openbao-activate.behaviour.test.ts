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

// The sudo/docker/id shims live in plain .sh fixtures (kept out of the .ts source
// so their shell `${…}` never collides with JS template interpolation).
const SHIMS = ["sudo", "docker", "id"];

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
  for (const s of SHIMS) {
    writeFileSync(join(bin, s), readFileSync(resolve(__dirname, "fixtures", `${s}.sh`), "utf8"));
    chmodSync(join(bin, s), 0o755);
  }
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

// Env that makes the marker-absent base path PROVE disabled, and the active
// path VERIFY, so a test only overrides what it wants to break.
const BASE_DISABLED = { MOCK_MARKER_PRESENT: "absent", MOCK_EXEC_BACKEND: "disabled", MOCK_EXEC_SECRETS: "absent" };
const ACTIVE_OK = { MOCK_EXEC_BACKEND: "openbao", MOCK_EXEC_SECRETS: "present", MOCK_HOSTS: "10.0.0.5 openbao hermes" };

describe.skipIf(isWindows)("95 — openbao-activate.sh behaviour", () => {
  it("script refuses to run as root", () => {
    const r = run({ MOCK_ID_U: "0" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/non-root deploy user/);
    expect(r.calls).toHaveLength(0);
  });

  // ── privilege / marker ─────────────────────────────────────────────────────
  it("sudo -n unavailable → fail closed", () => {
    const r = run({ MOCK_SUDO: "deny" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/sudo -n/);
    expect(r.calls).toHaveLength(0);
  });
  it("marker present but no sudo → fail closed (never treated as absent)", () => {
    const r = run({ MOCK_MARKER_PRESENT: "present", MOCK_SUDO: "deny" });
    expect(r.status).toBe(1);
    expect(r.calls).toHaveLength(0);
  });
  it("marker unreadable → fail closed", () => {
    const r = run({ MOCK_MARKER_PRESENT: "present", MOCK_MARKER_READABLE: "0" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cannot read marker/);
    expect(r.calls).toHaveLength(0);
  });
  it("marker malformed → fail closed", () => {
    const r = run({ MOCK_MARKER_CONTENT: "GARBAGE_LINE" });
    expect(r.status).toBe(1);
    expect(r.calls).toHaveLength(0);
  });

  // ── marker-absent base path (must PROVE disabled) ──────────────────────────
  it("1. marker absent + proven disabled → exit 0, base only", () => {
    const r = run(BASE_DISABLED);
    expect(r.status).toBe(0);
    expect(r.calls).toContain("up:base");
    expect(r.calls).not.toContain("up:active");
    expect(r.stderr).not.toMatch(/BASE_STATE_UNVERIFIED/);
  });
  it("2. marker absent + base up FAILS → exit 1, no success claim", () => {
    const r = run({ ...BASE_DISABLED, MOCK_BASE_UP_RC: "1" });
    expect(r.status).toBe(1);
    expect(r.stdout).not.toMatch(/Base deploy verified/);
  });
  it("3. marker absent + container still OT_SECRET_BACKEND=openbao → BASE_STATE_UNVERIFIED", () => {
    const r = run({ MOCK_MARKER_PRESENT: "absent", MOCK_EXEC_BACKEND: "openbao" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/BASE_STATE_UNVERIFIED/);
  });
  it("4. marker absent + OpenBao mount remains → BASE_STATE_UNVERIFIED", () => {
    const r = run({ ...BASE_DISABLED, MOCK_RB_MOUNTS: "/run/secrets/openbao_role_id" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/BASE_STATE_UNVERIFIED/);
  });

  // ── credential path integrity ──────────────────────────────────────────────
  it("5. source path with a symlinked/non-canonical parent → fail closed", () => {
    const r = run({ ...ACTIVE_OK, MOCK_REALPATH_MUTATE_MATCH: "role-id" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/symlink or non-canonical/);
    expect(r.calls).toHaveLength(0);
  });
  it("6. runtime directory mode not 0710 → fail closed", () => {
    const r = run({ ...ACTIVE_OK, MOCK_RTDIR_MODE: "750" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/runtime directory mode is not exactly 0710/);
  });
  it("7. runtime directory not root:root → fail closed", () => {
    const r = run({ ...ACTIVE_OK, MOCK_RTDIR_OWNER: "alice:alice" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/runtime directory is not root:root/);
  });
  it("8. role and secret in different parents → fail closed", () => {
    const r = run({
      ...ACTIVE_OK,
      MOCK_MARKER_CONTENT: [
        "OPENBAO_ROLE_ID_HOST_FILE=/etc/hermes-openbao/rt1/role-id",
        "OPENBAO_SECRET_ID_HOST_FILE=/etc/hermes-openbao/rt2/secret-id",
        "OPENBAO_CA_HOST_FILE=/etc/hermes-openbao/ca.crt",
        "OPENBAO_PRIVATE_IP=10.0.0.5",
        "OPENBAO_RUNTIME_GID=6000",
      ].join("\n"),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/same runtime directory/);
  });

  // ── deploy-user isolation ──────────────────────────────────────────────────
  it("9. deploy user is a member of the runtime GID → fail closed", () => {
    const r = run({ ...ACTIVE_OK, MOCK_ID_G: "1000 6000" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/member of the runtime secret group/);
    expect(r.calls).toHaveLength(0);
  });

  // ── canonical vs runtime copy ──────────────────────────────────────────────
  it("10. runtime RoleID copy differs from canonical → fail closed", () => {
    const r = run({ ...ACTIVE_OK, MOCK_CMP_ROLE: "differ" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not match the canonical/);
  });
  it("11. runtime SecretID copy differs from canonical → fail closed", () => {
    const r = run({ ...ACTIVE_OK, MOCK_CMP_SECRET: "differ" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/does not match the canonical/);
  });

  // ── CA trust anchor ────────────────────────────────────────────────────────
  it("12. CA not root-owned → fail closed", () => {
    const r = run({ ...ACTIVE_OK, MOCK_CA_OWNER: "alice:alice" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/CA file is not owned root:root/);
  });
  it("13a. CA empty → fail closed", () => {
    const r = run({ ...ACTIVE_OK, MOCK_CA_EMPTY: "1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/CA file is empty/);
  });
  it("13b. CA not a parseable PEM → fail closed", () => {
    const r = run({ ...ACTIVE_OK, MOCK_CA_PEM_INVALID: "1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/parseable PEM/);
  });
  it("13c. openssl unavailable → fail closed", () => {
    const r = run({ ...ACTIVE_OK, MOCK_OPENSSL_MISSING: "1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/openssl is unavailable/);
  });

  // ── active runtime proof ───────────────────────────────────────────────────
  it("14. active mount is RW=true → active verify fails → rollback", () => {
    const r = run({
      ...ACTIVE_OK,
      MOCK_ACTIVE_MOUNTS: "/run/secrets/openbao_role_id=true=/etc/hermes-openbao/runtime/role-id",
    });
    expect(r.status).toBe(1);
    expect(r.calls).toContain("up:active");
    expect(r.calls).toContain("up:base"); // rollback
  });
  it("15. container UID is not 1001 → active verify fails → rollback", () => {
    const r = run({ ...ACTIVE_OK, MOCK_CTR_UID: "1000" });
    expect(r.status).toBe(1);
    expect(r.calls).toContain("up:active");
    expect(r.calls).toContain("up:base");
  });
  it("15b. container GID is not the runtime GID → rollback", () => {
    const r = run({ ...ACTIVE_OK, MOCK_CTR_GID: "9999" });
    expect(r.status).toBe(1);
    expect(r.calls).toContain("up:base");
  });

  // ── original activation/rollback scenarios ─────────────────────────────────
  it("active compose up failure → rollback, exit 1", () => {
    const r = run({ ...ACTIVE_OK, MOCK_ACTIVE_UP_RC: "1", MOCK_EXEC_BACKEND: "disabled", MOCK_EXEC_SECRETS: "absent" });
    expect(r.status).toBe(1);
    expect(r.calls).toContain("up:active");
    expect(r.calls).toContain("up:base");
  });
  it("wrong host IP → active verify fails → rollback", () => {
    const r = run({ MOCK_EXEC_BACKEND: "openbao", MOCK_EXEC_SECRETS: "present", MOCK_HOSTS: "10.9.9.9 openbao" });
    expect(r.status).toBe(1);
    expect(r.calls).toContain("up:base");
  });
  it("rollback that stays OT_SECRET_BACKEND=openbao → ROLLBACK_UNVERIFIED, no success claim", () => {
    const r = run({ MOCK_EXEC_BACKEND: "openbao", MOCK_EXEC_SECRETS: "present", MOCK_HOSTS: "10.9.9.9 openbao" });
    expect(r.stderr).toMatch(/ROLLBACK_UNVERIFIED/);
    expect(r.stderr).not.toMatch(/Rollback complete: backend disabled/);
  });

  // ── 16. full happy path ────────────────────────────────────────────────────
  it("16. full happy path → exit 0, config + active up, no rollback", () => {
    const r = run(ACTIVE_OK);
    expect(r.status).toBe(0);
    expect(r.calls).toContain("config");
    expect(r.calls).toContain("up:active");
    expect(r.calls).not.toContain("up:base");
  });
});
