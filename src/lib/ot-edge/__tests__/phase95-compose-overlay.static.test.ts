import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * PHASE 95 — static contract for the disabled-by-default production OpenBao
 * wiring. Asserts that the BASE production Compose never activates the backend,
 * and that the opt-in overlay delivers credentials READ-ONLY, by reference only,
 * behind an explicit operator gate — with no secret value committed.
 */

const root = resolve(__dirname, "..", "..", "..", "..");
const base = readFileSync(resolve(root, "docker-compose.prod.yml"), "utf8");
const overlay = readFileSync(resolve(root, "docker-compose.prod.openbao.yml"), "utf8");

describe("95 — base production Compose stays disabled-by-default", () => {
  it("never activates the OT secret backend", () => {
    expect(base).not.toMatch(/OT_SECRET_BACKEND/);
    expect(base.toLowerCase()).not.toContain("openbao");
  });
});

describe("95 — production OpenBao overlay contract", () => {
  it("keeps the canonical Compose project name", () => {
    expect(overlay).toMatch(/^name:\s*hermes\s*$/m);
  });

  it("delivers credentials through Docker file-secrets (read-only by construction)", () => {
    // The service consumes named secrets; Compose bind-mounts them read-only at
    // /run/secrets/<name>. No writable bind mount of a credential is present.
    expect(overlay).toMatch(/^\s*secrets:/m);
    expect(overlay).toMatch(/-\s*openbao_role_id/);
    expect(overlay).toMatch(/-\s*openbao_secret_id/);
    expect(overlay).toMatch(/-\s*openbao_ca/);
    // No writable credential bind mount (a ":ro"-less host:container file map).
    expect(overlay).not.toMatch(/-\s*[^\s#]+:\/run\/secrets\/[^\s:]+\s*$/m);
  });

  it("points the app at the read-only in-container secret paths", () => {
    expect(overlay).toMatch(/OPENBAO_APPROLE_ROLE_ID_FILE:\s*\/run\/secrets\/openbao_role_id/);
    expect(overlay).toMatch(/OPENBAO_APPROLE_SECRET_ID_FILE:\s*\/run\/secrets\/openbao_secret_id/);
    expect(overlay).toMatch(/NODE_EXTRA_CA_CERTS:\s*\/run\/secrets\/openbao_ca/);
  });

  it("requires explicit host paths (:? gate) — no silent-default activation", () => {
    expect(overlay).toMatch(/\$\{OPENBAO_ROLE_ID_HOST_FILE:\?/);
    expect(overlay).toMatch(/\$\{OPENBAO_SECRET_ID_HOST_FILE:\?/);
    expect(overlay).toMatch(/\$\{OPENBAO_CA_HOST_FILE:\?/);
  });

  it("embeds no secret VALUE (only names and host-path references)", () => {
    // A committed role_id/secret_id would be a long opaque token literal. The
    // overlay may reference names and /run/secrets paths, never a value.
    expect(overlay).not.toMatch(/role_id\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/i);
    expect(overlay).not.toMatch(/secret_id\s*[:=]\s*["']?[A-Za-z0-9._-]{20,}/i);
    // No inline PEM / private key material.
    expect(overlay).not.toContain("BEGIN ");
  });
});
