import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";
import { createOpenBaoSecretManager } from "../openbao-secret-manager";
import type { SecretReference, WritableSecretManager } from "../secret-manager";

/**
 * PHASE 94D0C — LIVE OpenBao integration, opt-in.
 *
 * Skipped unless `OPENBAO_LIVE=1` and `BAO_ADDR` + `BAO_TOKEN` are present, so
 * an ordinary `npm test` never touches a network. When enabled it drives the
 * full credential lifecycle against a real OpenBao/Vault KV v2 mount through the
 * ACTUAL TypeScript adapter (Vitest transforms it — the `.mjs` launcher never
 * imports `.ts` directly).
 *
 * It prints nothing: assertions never interpolate the token, secret, reference
 * or path, so a failure surfaces only a stage name and a fixed code.
 */

const LIVE = process.env.OPENBAO_LIVE === "1" && !!process.env.BAO_ADDR && !!process.env.BAO_TOKEN;
const MOUNT = process.env.BAO_MOUNT ?? "hermes-lab";
const PREFIX = process.env.BAO_PREFIX ?? "phase94d0c";

/** True only for https, or http on an explicit loopback host. */
function endpointIsSafe(addr: string): { safe: boolean; loopback: boolean } {
  try {
    const url = new URL(addr);
    const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname);
    if (url.protocol === "https:") return { safe: true, loopback: false };
    if (url.protocol === "http:" && loopback) return { safe: true, loopback: true };
    return { safe: false, loopback };
  } catch {
    return { safe: false, loopback: false };
  }
}

describe.skipIf(!LIVE)("94D0C — live OpenBao lifecycle", () => {
  let manager: WritableSecretManager;

  beforeAll(() => {
    const { safe, loopback } = endpointIsSafe(process.env.BAO_ADDR as string);
    // Refuse non-loopback HTTP — never send a token in the clear off-box.
    if (!safe) throw new Error("unsafe endpoint");
    manager = createOpenBaoSecretManager({
      endpoint: process.env.BAO_ADDR as string,
      mountPath: MOUNT,
      pathPrefix: PREFIX,
      tokenProvider: async () => process.env.BAO_TOKEN as string,
      fetchImpl: fetch,
      randomBytes: (n: number) => new Uint8Array(randomBytes(n)),
      allowInsecureLoopback: loopback,
    });
  });

  it("runs create → rotate → revoke → delete with the contract's guarantees", async () => {
    const secret = new Uint8Array(randomBytes(32));
    const rotated = new Uint8Array(randomBytes(32));
    let reference: SecretReference | null = null;

    try {
      const created = await manager.create(secret);
      reference = created.reference;
      expect(created.version).toBe(1);

      const v1 = await manager.resolve(reference);
      // Compare without printing either buffer.
      expect(Buffer.from(v1).equals(Buffer.from(secret))).toBe(true);

      const rot = await manager.rotate(reference, created.version, rotated);
      expect(rot.version).toBe(created.version + 1);

      // A stale CAS must conflict.
      await expect(manager.rotate(reference, created.version, rotated)).rejects.toMatchObject({
        code: "VERSION_CONFLICT",
      });

      const v2 = await manager.resolve(reference);
      expect(Buffer.from(v2).equals(Buffer.from(rotated))).toBe(true);

      await manager.revoke(reference);
      await expect(manager.resolve(reference)).rejects.toMatchObject({ code: "SECRET_REVOKED" });

      await manager.delete(reference);
      const gone = reference;
      reference = null;
      await expect(manager.resolve(gone)).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    } finally {
      // Best-effort permanent cleanup; never throws out of the test.
      if (reference) {
        await manager.delete(reference).catch(() => undefined);
      }
    }
  });
});
