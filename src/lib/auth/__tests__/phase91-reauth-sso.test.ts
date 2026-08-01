import { describe, it, expect, vi, afterEach } from "vitest";
import { hashPassword } from "@/lib/auth/crypto";

/**
 * PHASE 91 — privileged-operation reauthentication and SSO readiness.
 *
 * requireRecentAuth returns a single stable failure code for wrong/missing
 * password AND unknown account, so it can never be used as a credential oracle.
 * resolveSsoConfiguration ships fail-closed and only reports readiness when a
 * complete configuration is present — it never fakes a provider.
 */

const STORED = hashPassword("correct-horse"); // legacy scrypt hash — no argon2 native needed

function dbWithUser(user: Record<string, unknown> | null) {
  return { user: { findUnique: async () => user } };
}

afterEach(() => {
  vi.doUnmock("@/lib/db/prisma");
  vi.restoreAllMocks();
});

async function loadReauth(db: unknown) {
  vi.resetModules();
  vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
  return import("@/lib/auth/reauth");
}

describe("Phase 91 — requireRecentAuth", () => {
  it("correct password → ok", async () => {
    const { requireRecentAuth } = await loadReauth(dbWithUser({ id: "u1", passwordHash: STORED }));
    expect(await requireRecentAuth("u1", "correct-horse")).toEqual({ ok: true });
  });

  it("wrong password → 401 REAUTH_REQUIRED", async () => {
    const { requireRecentAuth } = await loadReauth(dbWithUser({ id: "u1", passwordHash: STORED }));
    const r = await requireRecentAuth("u1", "wrong");
    expect(r).toEqual({ ok: false, status: 401, code: "REAUTH_REQUIRED" });
  });

  it("missing password → 401 REAUTH_REQUIRED (no DB hit needed)", async () => {
    const { requireRecentAuth } = await loadReauth(dbWithUser({ id: "u1", passwordHash: STORED }));
    expect((await requireRecentAuth("u1", undefined)).ok).toBe(false);
    expect((await requireRecentAuth("u1", "")).ok).toBe(false);
  });

  it("unknown account → SAME code as a wrong password (no enumeration)", async () => {
    const { requireRecentAuth } = await loadReauth(dbWithUser(null));
    const r = await requireRecentAuth("ghost", "anything");
    expect(r).toEqual({ ok: false, status: 401, code: "REAUTH_REQUIRED" });
  });

  it("no database → 503 REAUTH_UNAVAILABLE (fails closed, not open)", async () => {
    const { requireRecentAuth } = await loadReauth(null);
    const r = await requireRecentAuth("u1", "correct-horse");
    expect(r).toEqual({ ok: false, status: 503, code: "REAUTH_UNAVAILABLE" });
  });
});

describe("Phase 91 — SSO readiness (fail-closed)", () => {
  const KEYS = ["SSO_PROTOCOL", "SSO_ISSUER", "SSO_CLIENT_ID", "SSO_METADATA_URL"];
  let saved: Record<string, string | undefined> = {};

  function setEnv(env: Record<string, string | undefined>) {
    saved = {};
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  }
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it("no configuration → disabled and incomplete", async () => {
    setEnv({});
    const { resolveSsoConfiguration, isSsoConfigured } = await import("@/lib/auth/sso/config");
    expect(resolveSsoConfiguration()).toEqual({ enabled: false, protocol: null, issuer: null, complete: false });
    expect(isSsoConfigured()).toBe(false);
  });

  it("unknown protocol → disabled", async () => {
    setEnv({ SSO_PROTOCOL: "ldap", SSO_ISSUER: "x", SSO_METADATA_URL: "y" });
    const { isSsoConfigured } = await import("@/lib/auth/sso/config");
    expect(isSsoConfigured()).toBe(false);
  });

  it("oidc missing clientId → disabled (incomplete)", async () => {
    setEnv({ SSO_PROTOCOL: "oidc", SSO_ISSUER: "https://idp", SSO_METADATA_URL: "https://idp/.well-known" });
    const { resolveSsoConfiguration } = await import("@/lib/auth/sso/config");
    const cfg = resolveSsoConfiguration();
    expect(cfg.enabled).toBe(false);
    expect(cfg.protocol).toBe("oidc");
  });

  it("complete oidc → enabled", async () => {
    setEnv({ SSO_PROTOCOL: "oidc", SSO_ISSUER: "https://idp", SSO_CLIENT_ID: "cid", SSO_METADATA_URL: "https://idp/.well-known" });
    const { isSsoConfigured } = await import("@/lib/auth/sso/config");
    expect(isSsoConfigured()).toBe(true);
  });

  it("complete saml → enabled", async () => {
    setEnv({ SSO_PROTOCOL: "saml", SSO_ISSUER: "urn:idp", SSO_METADATA_URL: "https://idp/metadata" });
    const { isSsoConfigured } = await import("@/lib/auth/sso/config");
    expect(isSsoConfigured()).toBe(true);
  });
});
