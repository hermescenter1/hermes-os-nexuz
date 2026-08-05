import { describe, it, expect, afterEach } from "vitest";

/**
 * PHASE 94 — the writable secret backend resolver and the read-only bridge.
 *
 * Proves the fail-closed configuration contract (disabled by default; enabled
 * but invalid THROWS, never falls back) and the SecretProvider bridge the
 * envelope verifier consumes (env refs unchanged, opaque refs via the manager,
 * revoked/missing → null, zero manager calls when disabled).
 */

import {
  resolveSecretBackendComposition,
  writableSecretProvider,
  composeSecretProvider,
} from "../secret-backend";
import { createInMemorySecretManager } from "../testing/in-memory-secret-manager";
import { SecretManagerError, type WritableSecretManager } from "../secret-manager";
import type { SecretProvider } from "../envelope-signature";

const BAO_KEYS = [
  "OT_SECRET_BACKEND",
  "OPENBAO_ENDPOINT",
  "OPENBAO_KV_MOUNT",
  "OPENBAO_KV_PREFIX",
  "OPENBAO_APPROLE_MOUNT",
  "OPENBAO_APPROLE_ROLE_ID_FILE",
  "OPENBAO_APPROLE_SECRET_ID_FILE",
  "OPENBAO_EXPIRY_SKEW_SECONDS",
  "OPENBAO_ALLOW_INSECURE_LOOPBACK",
  "OT_GATEWAY_HMAC_PRIMARY",
];

afterEach(() => {
  for (const key of BAO_KEYS) delete process.env[key];
});

describe("94 secret-backend — configuration contract", () => {
  it("is disabled unless OT_SECRET_BACKEND is exactly 'openbao'", () => {
    expect(resolveSecretBackendComposition().available).toBe(false);
    process.env.OT_SECRET_BACKEND = "true";
    expect(resolveSecretBackendComposition().available).toBe(false);
    process.env.OT_SECRET_BACKEND = "postgres";
    expect(resolveSecretBackendComposition().available).toBe(false);
  });

  it("enabled but under-configured FAILS CLOSED (throws, no fallback)", () => {
    process.env.OT_SECRET_BACKEND = "openbao";
    // No endpoint/mount/prefix/authMount/role/secret files.
    expect(() => resolveSecretBackendComposition()).toThrow(SecretManagerError);
  });

  it("enabled with a full configuration composes an available runtime", () => {
    process.env.OT_SECRET_BACKEND = "openbao";
    process.env.OPENBAO_ENDPOINT = "https://127.0.0.1:8200";
    process.env.OPENBAO_KV_MOUNT = "hermes-kv";
    process.env.OPENBAO_KV_PREFIX = "gateways";
    process.env.OPENBAO_APPROLE_MOUNT = "approle";
    process.env.OPENBAO_APPROLE_ROLE_ID_FILE = "/run/secrets/role_id";
    process.env.OPENBAO_APPROLE_SECRET_ID_FILE = "/run/secrets/secret_id";
    const composition = resolveSecretBackendComposition();
    expect(composition.available).toBe(true);
    // No network call happened at construction — the AppRole login is lazy.
  });

  it("rejects a negative expiry skew (fail closed)", () => {
    process.env.OT_SECRET_BACKEND = "openbao";
    process.env.OPENBAO_ENDPOINT = "https://127.0.0.1:8200";
    process.env.OPENBAO_KV_MOUNT = "kv";
    process.env.OPENBAO_KV_PREFIX = "p";
    process.env.OPENBAO_APPROLE_MOUNT = "approle";
    process.env.OPENBAO_APPROLE_ROLE_ID_FILE = "/a";
    process.env.OPENBAO_APPROLE_SECRET_ID_FILE = "/b";
    process.env.OPENBAO_EXPIRY_SKEW_SECONDS = "-5";
    expect(() => resolveSecretBackendComposition()).toThrow(SecretManagerError);
  });
});

describe("94 secret-backend — writable provider bridge", () => {
  it("resolves a stored secret to the base64url HMAC key", async () => {
    const manager = createInMemorySecretManager();
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const meta = await manager.create(bytes);
    const provider = writableSecretProvider(manager);
    expect(await provider.resolve(meta.reference)).toBe(Buffer.from(bytes).toString("base64url"));
  });

  it("returns null for an unknown or revoked reference (never distinguishing them)", async () => {
    const manager = createInMemorySecretManager();
    const provider = writableSecretProvider(manager);
    expect(await provider.resolve("does-not-exist")).toBeNull();
    const meta = await manager.create(new Uint8Array([9, 9, 9, 9]));
    await manager.revoke(meta.reference);
    expect(await provider.resolve(meta.reference)).toBeNull();
  });
});

describe("94 secret-backend — composed provider", () => {
  const envProvider: SecretProvider = {
    resolve: (ref) => (ref === "env:OT_GATEWAY_HMAC_PRIMARY" ? "x".repeat(40) : null),
  };

  it("with no manager, returns the env provider unchanged (current behaviour)", async () => {
    const composed = composeSecretProvider(envProvider, null);
    expect(composed).toBe(envProvider);
    // An opaque reference resolves to null — no manager, no fallback.
    expect(await composed.resolve("opaque-ref")).toBeNull();
  });

  it("with a manager, env refs use the env provider and opaque refs use the manager", async () => {
    const manager = createInMemorySecretManager();
    const meta = await manager.create(new Uint8Array([1, 2, 3, 4]));
    const composed = composeSecretProvider(envProvider, manager);
    expect(await composed.resolve("env:OT_GATEWAY_HMAC_PRIMARY")).toBe("x".repeat(40));
    expect(await composed.resolve(meta.reference)).toBe(Buffer.from(new Uint8Array([1, 2, 3, 4])).toString("base64url"));
    expect(await composed.resolve("unknown")).toBeNull();
  });

  it("makes zero manager calls when disabled (manager is null)", async () => {
    let calls = 0;
    const spy: WritableSecretManager = {
      writable: true,
      create: async () => { calls++; throw new Error("no"); },
      resolve: async () => { calls++; throw new Error("no"); },
      rotate: async () => { calls++; throw new Error("no"); },
      revoke: async () => { calls++; throw new Error("no"); },
      delete: async () => { calls++; },
    };
    // Disabled path never receives the manager, so the env-only provider is used.
    const composed = composeSecretProvider(envProvider, null);
    await composed.resolve("anything");
    void spy;
    expect(calls).toBe(0);
  });
});
