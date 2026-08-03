import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * PHASE 95 — static contract for the disabled-by-default production OpenBao
 * wiring. Asserts (1) the BASE production Compose never activates the backend,
 * (2) the opt-in overlay delivers credentials via READ-ONLY bind mounts (NOT
 * Compose file-secrets, which cannot remap uid/gid/mode for a non-root
 * container) with a dedicated runtime GID and private-IP host mapping, no secret
 * value committed, and (3) the deploy workflow gates activation on a validated
 * marker, deploys BOTH compose files, and rolls back automatically — without
 * echoing any secret.
 */

const root = resolve(__dirname, "..", "..", "..", "..");
const base = readFileSync(resolve(root, "docker-compose.prod.yml"), "utf8");
const overlay = readFileSync(resolve(root, "docker-compose.prod.openbao.yml"), "utf8");
const deploy = readFileSync(resolve(root, ".github/workflows/deploy.yml"), "utf8");

describe("95 — base production Compose stays disabled-by-default", () => {
  it("never activates the OT secret backend", () => {
    expect(base).not.toMatch(/OT_SECRET_BACKEND/);
    expect(base.toLowerCase()).not.toContain("openbao");
  });
});

describe("95 — production OpenBao overlay contract (bind mounts, non-root runtime)", () => {
  it("keeps the canonical Compose project name", () => {
    expect(overlay).toMatch(/^name:\s*hermes\s*$/m);
  });

  it("does NOT use top-level Compose file secrets", () => {
    // A `file:`-sourced top-level secret cannot remap uid/gid/mode, so the
    // UID-1001 container could not read root-owned files. There must be no
    // top-level `secrets:` block and no `file:` secret source.
    expect(overlay).not.toMatch(/^secrets:/m);
    expect(overlay).not.toMatch(/^\s*file:\s*\$\{OPENBAO_/m);
  });

  it("mounts all three credentials as read-only binds with create_host_path:false", () => {
    const roBinds = overlay.match(/read_only:\s*true/g) ?? [];
    expect(roBinds.length).toBeGreaterThanOrEqual(3);
    const noCreate = overlay.match(/create_host_path:\s*false/g) ?? [];
    expect(noCreate.length).toBeGreaterThanOrEqual(3);
    // Each credential target is a bind at the fixed /run/secrets path.
    expect(overlay).toMatch(/target:\s*\/run\/secrets\/openbao_role_id/);
    expect(overlay).toMatch(/target:\s*\/run\/secrets\/openbao_secret_id/);
    expect(overlay).toMatch(/target:\s*\/run\/secrets\/openbao_ca/);
    expect(overlay).toMatch(/type:\s*bind/);
  });

  it("runs the container as UID 1001 with the MANDATORY runtime GID", () => {
    expect(overlay).toMatch(/user:\s*"1001:\$\{OPENBAO_RUNTIME_GID:\?[^}]*}"/);
  });

  it("adds extra_hosts openbao → the MANDATORY private IP (no hard-coded IP)", () => {
    expect(overlay).toMatch(/extra_hosts:/);
    expect(overlay).toMatch(/openbao=\$\{OPENBAO_PRIVATE_IP:\?[^}]*}/);
    // No literal IPv4 address is hard-coded anywhere in the overlay.
    expect(overlay).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
  });

  it("requires explicit host paths (:? gate) — no silent-default activation", () => {
    expect(overlay).toMatch(/\$\{OPENBAO_ROLE_ID_HOST_FILE:\?/);
    expect(overlay).toMatch(/\$\{OPENBAO_SECRET_ID_HOST_FILE:\?/);
    expect(overlay).toMatch(/\$\{OPENBAO_CA_HOST_FILE:\?/);
    expect(overlay).toMatch(/\$\{OPENBAO_RUNTIME_GID:\?/);
    expect(overlay).toMatch(/\$\{OPENBAO_PRIVATE_IP:\?/);
  });

  it("sets every required non-secret OpenBao environment value", () => {
    for (const [k, v] of [
      ["OT_SECRET_BACKEND", "openbao"],
      ["OPENBAO_ENDPOINT", "https://openbao:8200"],
      ["OPENBAO_KV_MOUNT", "hermes-kv"],
      ["OPENBAO_KV_PREFIX", "gateways"],
      ["OPENBAO_APPROLE_MOUNT", "approle"],
      ["OPENBAO_APPROLE_ROLE_ID_FILE", "/run/secrets/openbao_role_id"],
      ["OPENBAO_APPROLE_SECRET_ID_FILE", "/run/secrets/openbao_secret_id"],
      ["OPENBAO_EXPIRY_SKEW_SECONDS", "30"],
      ["OPENBAO_REQUEST_TIMEOUT_MS", "5000"],
      ["OPENBAO_MAX_RESPONSE_BYTES", "65536"],
      ["OPENBAO_ALLOW_INSECURE_LOOPBACK", "0"],
      ["NODE_EXTRA_CA_CERTS", "/run/secrets/openbao_ca"],
    ] as const) {
      expect(overlay).toContain(`${k}: "${v}"`);
    }
  });

  it("embeds no secret VALUE (only names, host-path references and fixed config)", () => {
    expect(overlay).not.toMatch(/role_id\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/i);
    expect(overlay).not.toMatch(/secret_id\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/i);
    expect(overlay).not.toContain("BEGIN ");
  });
});

describe("95 — deploy workflow: marker-gated activation, dual compose, rollback", () => {
  it("knows the activation marker and both compose files", () => {
    expect(deploy).toContain("/etc/hermes-openbao/activation.env");
    expect(deploy).toContain("-f docker-compose.prod.yml -f docker-compose.prod.openbao.yml");
  });

  it("cannot activate the backend without the overlay file", () => {
    // The only line that turns the backend on is the dual-file `up`; the overlay
    // filename must appear on every activating command.
    const upLines = deploy.split("\n").filter((l) => /compose .*up -d/.test(l));
    const activating = upLines.filter((l) => /prod\.openbao\.yml/.test(l));
    expect(activating.length).toBeGreaterThanOrEqual(1);
    // A base-only `up` (rollback / disabled path) also exists.
    expect(upLines.some((l) => !/prod\.openbao\.yml/.test(l))).toBe(true);
  });

  it("keeps the disabled path base-only when the marker is absent", () => {
    expect(deploy).toMatch(/marker absent[\s\S]*deploy_base/i);
    expect(deploy).toMatch(/if \[ ! -e "\$MARKER" \]/);
  });

  it("has an automatic rollback to base compose on activation failure", () => {
    expect(deploy).toMatch(/verify_active/);
    expect(deploy.toLowerCase()).toContain("rolling back to base compose");
    expect(deploy).toMatch(/Activation verification FAILED/);
  });

  it("validates the marker fail-closed (root-owned, no symlink, no other bits, allow-listed keys)", () => {
    expect(deploy).toMatch(/root:root/);
    expect(deploy).toMatch(/-L "\$MARKER"/);
    expect(deploy).toMatch(/grants 'other' permissions/);
    expect(deploy).toMatch(/unknown marker key/);
    expect(deploy).toMatch(/duplicate marker key/);
    // exact-0440 credential + RFC1918 private-IP checks
    expect(deploy).toMatch(/not exactly 0440/);
    expect(deploy).toMatch(/private-range address/);
  });

  it("never echoes a secret or reads credential CONTENT (only tests presence/mode)", () => {
    // No `cat`/`echo` of the credential files or /run/secrets material.
    expect(deploy).not.toMatch(/cat\s+[^\n]*\/run\/secrets/);
    expect(deploy).not.toMatch(/cat\s+"?\$(ROLE_ID_HOST_FILE|SECRET_ID_HOST_FILE)/);
    // The marker is parsed by an allow-listed read loop, never sourced/eval'd.
    expect(deploy).not.toMatch(/source\s+"?\$MARKER/);
    expect(deploy).not.toMatch(/eval\s+[^\n]*\$MARKER/);
    // Credential presence is checked with test flags, not by printing content.
    expect(deploy).toMatch(/-r \/run\/secrets\/openbao_role_id/);
  });
});
