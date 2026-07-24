import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SecretManagerError,
  isWritableSecretManager,
  type SecretReference,
} from "../secret-manager";
import { createInMemorySecretManager } from "../testing/in-memory-secret-manager";
import { envSecretProvider } from "../envelope-signature";

/**
 * PHASE 94D0A — the writable secret-manager contract.
 *
 * The in-memory provider is the substrate; the assertions are about the
 * CONTRACT — opaque references, byte secrets, versioned CAS rotation, revoke
 * and idempotent delete — and about the invariant that no secret byte ever
 * reaches a reference, metadata, an error or a log.
 */

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const SECRET = bytes("super-secret-key-material-0123456789abcdef");

describe("94D0A — create and resolve", () => {
  it("create returns an opaque reference and version 1", async () => {
    const m = createInMemorySecretManager();
    const meta = await m.create(SECRET);
    expect(typeof meta.reference).toBe("string");
    expect(meta.version).toBe(1);
    expect(meta.rotatedAt).toBeNull();
    expect(meta.revokedAt).toBeNull();
    expect(meta.createdAt).toBeTruthy();
    // The reference contains no secret material.
    expect(meta.reference).not.toContain(text(SECRET));
  });

  it("resolve returns the original bytes, and a defensive copy", async () => {
    const m = createInMemorySecretManager();
    const { reference } = await m.create(SECRET);
    const got = await m.resolve(reference);
    expect(text(got)).toBe(text(SECRET));
    // Mutating the returned bytes must not corrupt the store.
    got.fill(0);
    expect(text(await m.resolve(reference))).toBe(text(SECRET));
  });

  it("metadata never contains secret bytes", async () => {
    const m = createInMemorySecretManager();
    const meta = await m.create(SECRET);
    // No field of the metadata is or contains the secret.
    expect(JSON.stringify(meta)).not.toContain(text(SECRET));
    expect(Object.keys(meta).sort()).toEqual(["createdAt", "reference", "revokedAt", "rotatedAt", "version"]);
  });

  it("resolve throws REFERENCE_NOT_FOUND for an unknown reference", async () => {
    const m = createInMemorySecretManager();
    await expect(m.resolve("nope" as SecretReference)).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
  });
});

describe("94D0A — versioned rotation", () => {
  it("rotation requires the expected version and bumps it", async () => {
    const m = createInMemorySecretManager();
    const { reference, version } = await m.create(SECRET);
    const next = bytes("rotated-key-material-fedcba9876543210");
    const meta = await m.rotate(reference, version, next);
    expect(meta.version).toBe(2);
    expect(meta.rotatedAt).toBeTruthy();
    expect(text(await m.resolve(reference))).toBe(text(next));
  });

  it("a stale rotation conflicts", async () => {
    const m = createInMemorySecretManager();
    const { reference } = await m.create(SECRET);
    await m.rotate(reference, 1, bytes("v2"));
    // Rotating again from the now-stale version 1 must conflict.
    await expect(m.rotate(reference, 1, bytes("v3"))).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("the old secret is inactive after rotation", async () => {
    const m = createInMemorySecretManager();
    const { reference } = await m.create(SECRET);
    await m.rotate(reference, 1, bytes("v2-active"));
    // Only the current version resolves; the original is gone.
    expect(text(await m.resolve(reference))).toBe("v2-active");
    expect(text(await m.resolve(reference))).not.toBe(text(SECRET));
  });

  it("concurrent rotation has exactly one winner", async () => {
    const m = createInMemorySecretManager();
    const { reference } = await m.create(SECRET);
    const results = await Promise.allSettled([
      m.rotate(reference, 1, bytes("a")),
      m.rotate(reference, 1, bytes("b")),
      m.rotate(reference, 1, bytes("c")),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(2);
    for (const r of lost) {
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "VERSION_CONFLICT" });
    }
    // The store advanced by exactly one version.
    const meta = await m.rotate(reference, 2, bytes("final"));
    expect(meta.version).toBe(3);
  });
});

describe("94D0A — revoke and delete", () => {
  it("revoke prevents resolution", async () => {
    const m = createInMemorySecretManager();
    const { reference } = await m.create(SECRET);
    const meta = await m.revoke(reference);
    expect(meta.revokedAt).toBeTruthy();
    await expect(m.resolve(reference)).rejects.toMatchObject({ code: "SECRET_REVOKED" });
    // A revoked secret cannot be rotated back into service.
    await expect(m.rotate(reference, meta.version, bytes("x"))).rejects.toMatchObject({ code: "SECRET_REVOKED" });
  });

  it("delete removes the entry", async () => {
    const m = createInMemorySecretManager();
    const { reference } = await m.create(SECRET);
    await m.delete(reference);
    await expect(m.resolve(reference)).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
  });

  it("cleanup is idempotent", async () => {
    const m = createInMemorySecretManager();
    const { reference } = await m.create(SECRET);
    await m.delete(reference);
    // A second delete is a no-op, not a CLEANUP_FAILED — so a failed activation
    // can retry cleanup safely.
    await expect(m.delete(reference)).resolves.toBeUndefined();
    await expect(m.delete("never-existed" as SecretReference)).resolves.toBeUndefined();
  });
});

describe("94D0A — no secret leaks into references, metadata, errors or logs", () => {
  it("errors carry a code and a fixed message, never a secret", async () => {
    const m = createInMemorySecretManager();
    const { reference } = await m.create(SECRET);
    await m.revoke(reference);
    try {
      await m.resolve(reference);
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretManagerError);
      const serialized = JSON.stringify({ msg: (error as Error).message, code: (error as SecretManagerError).code });
      expect(serialized).not.toContain(text(SECRET));
      // No provider internal in the message either.
      expect((error as Error).message).not.toContain(reference);
    }
  });

  it("the module source logs nothing and defines no plaintext-string secret type", () => {
    // Source-level: neither file logs, and the secret type is Uint8Array bytes.
    for (const file of ["src/lib/ot-edge/secret-manager.ts", "src/lib/ot-edge/testing/in-memory-secret-manager.ts"]) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");
      expect(src, `${file} must not log`).not.toMatch(/console\.|logger\./);
    }
    // The contract's secret type is bytes.
    const contract = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/secret-manager.ts"), "utf8");
    expect(contract).toMatch(/type SecretBytes = Uint8Array/);
  });
});

describe("94D0A — capability detection and compatibility", () => {
  it("detects the writable manager structurally, not by name", () => {
    expect(isWritableSecretManager(createInMemorySecretManager())).toBe(true);
    expect(isWritableSecretManager({})).toBe(false);
    expect(isWritableSecretManager(null)).toBe(false);
    // A partial shape (missing rotate/revoke) is not writable.
    expect(isWritableSecretManager({ writable: true, create() {}, resolve() {} })).toBe(false);
  });

  it("the existing read-only SecretProvider is not mistaken for writable", () => {
    // It has `resolve` but no `writable` marker and no create/rotate — so a
    // future enrollment flow will correctly see it as non-provisionable.
    expect(isWritableSecretManager(envSecretProvider)).toBe(false);
    expect(typeof envSecretProvider.resolve).toBe("function");
  });

  it("the in-memory provider is test-only: it refuses to construct in production", () => {
    const saved = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      expect(() => createInMemorySecretManager()).toThrow(SecretManagerError);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = saved;
    }
  });

  it("the in-memory provider is wired into no application composition", () => {
    // Only tests may import it. Source-scan the app composition module.
    const composition = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/http/composition.ts"), "utf8");
    expect(composition).not.toMatch(/in-memory-secret-manager|createInMemorySecretManager/);
  });
});
