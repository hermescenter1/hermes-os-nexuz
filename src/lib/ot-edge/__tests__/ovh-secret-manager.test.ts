import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SecretManagerError, isWritableSecretManager, type SecretReference } from "../secret-manager";
import { createOvhSecretManager, type OvhSecretManagerConfig } from "../ovh-secret-manager";

/**
 * PHASE 94D0B — the OVH KMS adapter, exercised against a MOCK fetch only.
 *
 * No live request, no real token. The assertions cover the wire contract
 * (host/path/method/CAS/auth), the byte handling (secret only inside request
 * data, strict base64url round trip), the error mapping, and the security
 * invariants (no leak of token/bytes/reference, path traversal and arbitrary
 * host rejected, malformed responses fail closed).
 */

const ENDPOINT = "https://eu-west-rbx.okms.ovh.net";
const OKMS = "okms-123";
const TOKEN = "SECRET-BEARER-TOKEN-do-not-leak";
const SECRET = new TextEncoder().encode("32-bytes-of-signing-key-material!");
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

/** A deterministic CSPRNG stub so the path id is predictable in assertions. */
const fixedRandom = (fill = 7) => (n: number) => new Uint8Array(n).fill(fill);

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Build an adapter over a scripted fetch, recording every request. */
function harness(
  responder: (rec: Recorded) => { status: number; body?: unknown; ok?: boolean },
  over: Partial<OvhSecretManagerConfig> = {},
) {
  const calls: Recorded[] = [];
  const token = vi.fn(async () => TOKEN);
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const rec: Recorded = {
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(rec);
    const r = responder(rec);
    return {
      ok: r.ok ?? (r.status >= 200 && r.status < 300),
      status: r.status,
      json: async () => r.body,
    } as Response;
  });

  const manager = createOvhSecretManager({
    endpoint: ENDPOINT,
    okmsId: OKMS,
    pathPrefix: "hermes/ot",
    tokenProvider: token,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    randomBytes: fixedRandom(),
    ...over,
  });
  return { manager, calls, token, fetchImpl };
}

const writeOk = (version: number) => ({ status: 200, body: { data: { version, created_time: "2026-05-06T07:08:09Z" } } });
const readActive = (bytes: Uint8Array, version = 1) => ({
  status: 200,
  body: { data: { data: { b: b64(bytes) }, metadata: { version, created_time: "2026-05-06T07:08:09Z", deletion_time: "", destroyed: false } } },
});
const readRevoked = (version = 1) => ({
  status: 404,
  body: { data: { data: null, metadata: { version, created_time: "2026-05-06T07:08:09Z", deletion_time: "2026-05-06T09:00:00Z", destroyed: false } } },
});
const readAbsent = () => ({ status: 404, body: { errors: [] } });

describe("94D0B — create", () => {
  it("POSTs to the exact host/path with cas 0 and a Bearer header", async () => {
    const { manager, calls } = harness(() => writeOk(1));
    const meta = await manager.create(SECRET);

    const c = calls[0];
    expect(c.method).toBe("POST");
    expect(c.url).toBe(`${ENDPOINT}/api/${OKMS}/v1/secret/data/hermes/ot/${b64(new Uint8Array(18).fill(7))}`);
    expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect((c.body as { options: { cas: number } }).options.cas).toBe(0);
    // The secret appears ONLY inside the request data, base64url-encoded.
    expect((c.body as { data: { b: string } }).data.b).toBe(b64(SECRET));
    expect(meta.version).toBe(1);
    expect(meta.reference.startsWith("ovhkms:v1:")).toBe(true);
    // The reference carries no secret and no token.
    expect(meta.reference).not.toContain(b64(SECRET));
    expect(meta.reference).not.toContain(TOKEN);
  });

  it("maps a cas rejection to VERSION_CONFLICT", async () => {
    const { manager } = harness(() => ({ status: 400, body: { errors: ["cas"] } }));
    await expect(manager.create(SECRET)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});

describe("94D0B — resolve", () => {
  it("round-trips the exact bytes via strict base64url", async () => {
    const { manager, calls } = harness((rec) => (rec.method === "POST" ? writeOk(1) : readActive(SECRET)));
    const { reference } = await manager.create(SECRET);
    const got = await manager.resolve(reference);
    expect(Array.from(got)).toEqual(Array.from(SECRET));
    expect(calls[1].method).toBe("GET");
  });

  it("fails closed on a malformed response body", async () => {
    const { manager } = harness((rec) => (rec.method === "POST" ? writeOk(1) : { status: 200, body: { nonsense: true } }));
    const { reference } = await manager.create(SECRET);
    await expect(manager.resolve(reference)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("maps a revoked version to SECRET_REVOKED, and a truly-missing path to REFERENCE_NOT_FOUND", async () => {
    const revoked = harness((rec) => (rec.method === "POST" ? writeOk(1) : readRevoked()));
    const { reference } = await revoked.manager.create(SECRET);
    await expect(revoked.manager.resolve(reference)).rejects.toMatchObject({ code: "SECRET_REVOKED" });

    const absent = harness((rec) => (rec.method === "POST" ? writeOk(1) : readAbsent()));
    const ref2 = (await absent.manager.create(SECRET)).reference;
    await expect(absent.manager.resolve(ref2)).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
  });
});

describe("94D0B — rotate", () => {
  it("PATCHes with the expected version as cas", async () => {
    const { manager, calls } = harness((rec) => (rec.method === "PATCH" ? writeOk(2) : writeOk(1)));
    const created = await manager.create(SECRET);
    const next = new TextEncoder().encode("rotated-key-material-abcdefabcdef");
    const meta = await manager.rotate(created.reference, created.version, next);

    const patch = calls.find((c) => c.method === "PATCH")!;
    expect((patch.body as { options: { cas: number } }).options.cas).toBe(1);
    expect((patch.body as { data: { b: string } }).data.b).toBe(b64(next));
    expect(meta.version).toBe(2);
    expect(meta.rotatedAt).toBeTruthy();
  });

  it("maps a stale cas to VERSION_CONFLICT", async () => {
    const { manager } = harness((rec) => (rec.method === "PATCH" ? { status: 400, body: { errors: ["cas"] } } : writeOk(1)));
    const created = await manager.create(SECRET);
    await expect(manager.rotate(created.reference, 1, SECRET)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("concurrent rotation has exactly one winner", async () => {
    // The mock advances a shared version; the losers see a cas mismatch (400).
    let stored = 1;
    const { manager } = harness((rec) => {
      if (rec.method === "POST") return writeOk(1);
      if (rec.method === "PATCH") {
        const cas = (rec.body as { options: { cas: number } }).options.cas;
        if (cas !== stored) return { status: 400, body: { errors: ["cas"] } };
        stored += 1;
        return writeOk(stored);
      }
      return readActive(SECRET);
    });
    const created = await manager.create(SECRET);
    const results = await Promise.allSettled([
      manager.rotate(created.reference, 1, SECRET),
      manager.rotate(created.reference, 1, SECRET),
      manager.rotate(created.reference, 1, SECRET),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(2);
  });
});

describe("94D0B — revoke and delete", () => {
  it("DELETEs the data path then reports authoritative revoked metadata", async () => {
    const { manager, calls } = harness((rec) => {
      if (rec.method === "POST") return writeOk(1);
      if (rec.method === "DELETE") return { status: 204, ok: true };
      return readRevoked();
    });
    const created = await manager.create(SECRET);
    const meta = await manager.revoke(created.reference);
    expect(meta.revokedAt).toBe("2026-05-06T09:00:00Z");
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.url).toContain("/v1/secret/data/");
  });

  it("delete removes metadata and is idempotent on 404", async () => {
    const del404 = harness((rec) => (rec.method === "POST" ? writeOk(1) : { status: 404, ok: false }));
    const created = await del404.manager.create(SECRET);
    await expect(del404.manager.delete(created.reference)).resolves.toBeUndefined();
    const call = del404.calls.find((c) => c.method === "DELETE")!;
    expect(call.url).toContain("/v1/secret/metadata/");

    const del500 = harness((rec) => (rec.method === "POST" ? writeOk(1) : { status: 500, ok: false }));
    const ref2 = (await del500.manager.create(SECRET)).reference;
    await expect(del500.manager.delete(ref2)).rejects.toMatchObject({ code: "CLEANUP_FAILED" });
  });
});

describe("94D0B — security invariants", () => {
  it("rejects a path-traversal or foreign reference", async () => {
    const { manager, calls } = harness(() => writeOk(1));
    for (const bad of ["ovhkms:v1:../../etc/passwd", "ovhkms:v1:a/b", "ovhkms:v2:xxxxxxxxxxxxxxxx", "not-a-ref", "gwc:profile-1"]) {
      await expect(manager.resolve(bad as SecretReference)).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    }
    // None of the invalid references produced a request.
    expect(calls).toHaveLength(0);
  });

  it("rejects an arbitrary or non-https endpoint at construction", () => {
    for (const endpoint of ["http://eu-west-rbx.okms.ovh.net", "https://evil.com", "https://okms.ovh.net.evil.com", "not a url"]) {
      expect(() => harness(() => writeOk(1), { endpoint })).toThrow(SecretManagerError);
    }
  });

  it("never leaks the token or secret bytes into a thrown error", async () => {
    const { manager } = harness((rec) => (rec.method === "POST" ? writeOk(1) : { status: 500, ok: false }));
    const { reference } = await manager.create(SECRET);
    try {
      await manager.resolve(reference);
      expect.fail("should throw");
    } catch (error) {
      const serialized = `${(error as Error).message}${(error as Error).stack ?? ""}`;
      expect(serialized).not.toContain(TOKEN);
      expect(serialized).not.toContain(b64(SECRET));
    }
  });

  it("requests a fresh token per request and caches none", async () => {
    const { manager, token } = harness((rec) => (rec.method === "POST" ? writeOk(1) : readActive(SECRET)));
    const { reference } = await manager.create(SECRET);
    await manager.resolve(reference);
    // One token fetch for the create, one for the resolve — never reused.
    expect(token).toHaveBeenCalledTimes(2);
  });

  it("does not mutate the caller's byte buffer", async () => {
    const { manager } = harness(() => writeOk(1));
    const original = Uint8Array.from(SECRET);
    await manager.create(SECRET);
    expect(Array.from(SECRET)).toEqual(Array.from(original));
  });

  it("satisfies the writable capability contract", () => {
    const { manager } = harness(() => writeOk(1));
    expect(isWritableSecretManager(manager)).toBe(true);
  });

  it("the adapter source contains no console or logger call", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/ovh-secret-manager.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    expect(src).not.toMatch(/console\.|logger\./);
    // And no process.env read inside the adapter.
    expect(src).not.toMatch(/process\.env/);
  });

  it("is wired into no application composition", () => {
    const composition = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/http/composition.ts"), "utf8");
    expect(composition).not.toMatch(/ovh-secret-manager|createOvhSecretManager/);
  });
});
