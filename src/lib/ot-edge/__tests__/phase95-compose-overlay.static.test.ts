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
const activate = readFileSync(resolve(root, "scripts/deploy/openbao-activate.sh"), "utf8");
// The activation/rollback logic lives in the dedicated script the workflow calls;
// the two together are the deploy pipeline.
const pipeline = `${deploy}\n${activate}`;

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

describe("95 — deploy workflow calls the verifiable activation script", () => {
  it("the workflow requires sudo -n and delegates to the activation script", () => {
    expect(deploy).toMatch(/sudo -n true/);
    expect(deploy).toContain("bash scripts/deploy/openbao-activate.sh");
    // The heavy activation logic is no longer inlined in the YAML heredoc.
    expect(deploy).not.toMatch(/done <<< "\$marker_content"/);
  });
});

describe("95 — activation script: privileged, fail-closed, runtime-verifiable", () => {
  it("references the marker and both compose files", () => {
    expect(activate).toContain("/etc/hermes-openbao/activation.env");
    expect(activate).toContain("-f docker-compose.prod.yml -f docker-compose.prod.openbao.yml");
  });

  it("requires passwordless sudo and validates marker state PRIVILEGED (no ambiguous bare -e)", () => {
    expect(activate).toMatch(/sudo -n true/);
    expect(activate).toMatch(/sudo -n test -e "\$MARKER"/);
    expect(activate).toMatch(/sudo -n stat /);
    expect(activate).toMatch(/sudo -n cat -- "\$MARKER"/);
    // A bare/unprivileged `[ ! -e "$MARKER" ]` (permission-ambiguous) is gone.
    expect(pipeline).not.toMatch(/\[\s+(?:!\s+)?-e\s+"\$MARKER"\s*\]/);
    // Marker is never sourced/eval'd.
    expect(activate).not.toMatch(/\bsource\s+[^\n]*\$MARKER/);
    expect(activate).not.toMatch(/\beval\s+[^\n]*\$MARKER/);
    expect(activate).not.toMatch(/^\s*\.\s+"?\$MARKER/m);
  });

  it("marker-absent path is base-only; marker-present path configs both files", () => {
    expect(activate).toMatch(/if ! marker_present; then/);
    expect(activate).toMatch(/deploy_base_disabled/);
    expect(activate).toMatch(/docker compose -p hermes -f docker-compose\.prod\.yml -f docker-compose\.prod\.openbao\.yml --env-file \.env\.production config >\/dev\/null/);
  });

  it("GAP 2 — the active up is guarded and its failure triggers rollback", () => {
    expect(activate).toMatch(/activation_failed/);
    expect(activate).toMatch(/if ! docker compose -p hermes -f docker-compose\.prod\.yml -f docker-compose\.prod\.openbao\.yml --env-file \.env\.production up /);
    expect(activate).toMatch(/rollback_base/);
  });

  it("GAP 3 — rollback PROVES the backend is disabled (env + all three mounts absent)", () => {
    expect(activate).toMatch(/verify_rollback_disabled/);
    expect(activate).toMatch(/OT_SECRET_BACKEND[^\n]*!= openbao/);
    for (const name of ["openbao_role_id", "openbao_secret_id", "openbao_ca"]) {
      expect(activate).toMatch(new RegExp(`! -e /run/secrets/${name}`));
    }
    // The final container must carry NO OpenBao bind mount.
    expect(activate).toMatch(/\/run\/secrets\/openbao_/);
    expect(activate).toMatch(/ROLLBACK_UNVERIFIED/);
  });

  it("GAP 4 — host mapping is proven EXACTLY against the private IP, not a word match", () => {
    expect(activate).not.toMatch(/grep -qw openbao \/etc\/hosts/);
    expect(activate).toMatch(/verify_host_mapping/);
    expect(activate).toMatch(/awk -v ip="\$PRIVATE_IP"/);
  });

  it("never prints a secret, marker value, or the private IP, and reads no credential CONTENT", () => {
    expect(activate).not.toMatch(/cat\s+[^\n]*\/run\/secrets/);
    // No echo/log of the parsed values or the IP.
    expect(activate).not.toMatch(/echo[^\n]*\$PRIVATE_IP/);
    expect(activate).not.toMatch(/echo[^\n]*\$ROLE_ID_HOST_FILE/);
    // Credential presence checked with test flags only.
    expect(activate).toMatch(/-r \/run\/secrets\/openbao_role_id/);
  });

  it("still validates the marker fail-closed (root:root, no symlink, exact 0440, RFC1918)", () => {
    expect(activate).toMatch(/root:root/);
    expect(activate).toMatch(/test ! -L "\$MARKER"/);
    expect(activate).toMatch(/grants 'other' permissions/);
    expect(activate).toMatch(/unknown marker key/);
    expect(activate).toMatch(/duplicate marker key/);
    expect(activate).toMatch(/not exactly 0440/);
    expect(activate).toMatch(/private-range address/);
  });
});
