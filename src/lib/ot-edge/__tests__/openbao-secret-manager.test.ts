import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SecretManagerError, isWritableSecretManager, type SecretReference } from "../secret-manager";
import { createOpenBaoSecretManager, type OpenBaoSecretManagerConfig } from "../openbao-secret-manager";

/**
 * PHASE 94D0C — the OpenBao (Vault KV v2) adapter, against a MOCK fetch only.
 *
 * Covers the wire contract (paths/methods/headers/CAS), byte handling (strict
 * base64url round trip, secret only inside request data), the revoked-vs-missing
 * distinction via the metadata endpoint, error mapping, and the security
 * invariants (no leak, traversal + unsafe endpoint rejected, fail closed).
 */

const ENDPOINT = "https://bao.internal:8200";
const MOUNT = "hermes-lab";
const PREFIX = "phase94d0c";
const TOKEN = "hvs.SECRET-VAULT-TOKEN-do-not-leak";
const SECRET = new TextEncoder().encode("32-bytes-of-signing-key-material!");
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const PATH_ID = b64(new Uint8Array(18).fill(7));

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function harness(
  responder: (rec: Recorded) => { status: number; body?: unknown; ok?: boolean },
  over: Partial<OpenBaoSecretManagerConfig> = {},
) {
  const calls: Recorded[] = [];
  const token = vi.fn(async () => TOKEN);
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const rec: Recorded = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(rec);
    const r = responder(rec);
    return { ok: r.ok ?? (r.status >= 200 && r.status < 300), status: r.status, json: async () => r.body } as Response;
  });

  const manager = createOpenBaoSecretManager({
    endpoint: ENDPOINT,
    mountPath: MOUNT,
    pathPrefix: PREFIX,
    tokenProvider: token,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    randomBytes: (n: number) => new Uint8Array(n).fill(7),
    ...over,
  });
  return { manager, calls, token };
}

const writeOk = (version: number) => ({ status: 200, body: { data: { version, created_time: "2026-05-06T07:08:09Z" } } });
const readActive = (bytes: Uint8Array, version = 1) => ({
  status: 200,
  body: { data: { data: { value: b64(bytes) }, metadata: { version, created_time: "2026-05-06T07:08:09Z", deletion_time: "", destroyed: false } } },
});
const metaRevoked = (version = 1) => ({
  status: 200,
  body: { data: { current_version: version, versions: { [String(version)]: { created_time: "2026-05-06T07:08:09Z", deletion_time: "2026-05-06T09:00:00Z", destroyed: false } } } },
});
const notFound = () => ({ status: 404, body: { errors: [] } });

describe("94D0C — create and resolve", () => {
  it("POSTs the exact path with cas 0 and X-Vault-Token; secret only in data", async () => {
    const { manager, calls } = harness(() => writeOk(1));
    const meta = await manager.create(SECRET);
    const c = calls[0];
    expect(c.method).toBe("POST");
    expect(c.url).toBe(`${ENDPOINT}/v1/${MOUNT}/data/${PREFIX}/${PATH_ID}`);
    expect(c.headers["X-Vault-Token"]).toBe(TOKEN);
    expect(c.headers.Authorization).toBeUndefined();
    expect((c.body as { options: { cas: number } }).options.cas).toBe(0);
    expect((c.body as { data: { value: string } }).data.value).toBe(b64(SECRET));
    expect(meta.reference.startsWith("bao:v1:")).toBe(true);
    expect(meta.reference).not.toContain(b64(SECRET));
    expect(meta.reference).not.toContain(TOKEN);
    expect(meta.version).toBe(1);
  });

  it("round-trips exact bytes via strict base64url", async () => {
    const { manager } = harness((rec) => (rec.method === "POST" ? writeOk(1) : readActive(SECRET)));
    const { reference } = await manager.create(SECRET);
    expect(Array.from(await manager.resolve(reference))).toEqual(Array.from(SECRET));
  });

  it("fails closed on a malformed read body", async () => {
    const { manager } = harness((rec) => (rec.method === "POST" ? writeOk(1) : { status: 200, body: { nope: 1 } }));
    const { reference } = await manager.create(SECRET);
    await expect(manager.resolve(reference)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("maps a cas rejection on create to VERSION_CONFLICT", async () => {
    const { manager } = harness(() => ({ status: 400, body: { errors: ["cas"] } }));
    await expect(manager.create(SECRET)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});

describe("94D0C — revoked-vs-missing distinction via metadata", () => {
  it("data 404 + metadata deleted current version → SECRET_REVOKED", async () => {
    const { manager, calls } = harness((rec) => {
      if (rec.method === "POST") return writeOk(1);
      if (rec.url.includes("/metadata/")) return metaRevoked();
      return notFound(); // data GET 404
    });
    const { reference } = await manager.create(SECRET);
    await expect(manager.resolve(reference)).rejects.toMatchObject({ code: "SECRET_REVOKED" });
    // The metadata endpoint was consulted, on the same origin.
    expect(calls.some((c) => c.url === `${ENDPOINT}/v1/${MOUNT}/metadata/${PREFIX}/${PATH_ID}`)).toBe(true);
  });

  it("data 404 + no metadata → REFERENCE_NOT_FOUND", async () => {
    const { manager } = harness((rec) => (rec.method === "POST" ? writeOk(1) : notFound()));
    const { reference } = await manager.create(SECRET);
    await expect(manager.resolve(reference)).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
  });
});

describe("94D0C — rotate", () => {
  it("PATCHes with merge-patch content type and expected-version cas", async () => {
    const { manager, calls } = harness((rec) => (rec.method === "PATCH" ? writeOk(2) : writeOk(1)));
    const created = await manager.create(SECRET);
    const next = new TextEncoder().encode("rotated-key-material-abcdefabcdef");
    const meta = await manager.rotate(created.reference, created.version, next);
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.headers["Content-Type"]).toBe("application/merge-patch+json");
    expect((patch.body as { options: { cas: number } }).options.cas).toBe(1);
    expect((patch.body as { data: { value: string } }).data.value).toBe(b64(next));
    expect(meta.version).toBe(2);
    expect(meta.rotatedAt).toBeTruthy();
  });

  it("maps a stale cas to VERSION_CONFLICT and a missing path to REFERENCE_NOT_FOUND", async () => {
    const stale = harness((rec) => (rec.method === "PATCH" ? { status: 400, body: { errors: ["cas"] } } : writeOk(1)));
    const c1 = await stale.manager.create(SECRET);
    await expect(stale.manager.rotate(c1.reference, 1, SECRET)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const missing = harness((rec) => (rec.method === "PATCH" ? notFound() : writeOk(1)));
    const c2 = await missing.manager.create(SECRET);
    await expect(missing.manager.rotate(c2.reference, 1, SECRET)).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
  });
});

describe("94D0C — revoke and delete", () => {
  it("DELETEs data then reports authoritative revoked metadata", async () => {
    const { manager, calls } = harness((rec) => {
      if (rec.method === "POST") return writeOk(1);
      if (rec.method === "DELETE") return { status: 204, ok: true };
      return metaRevoked(); // metadata GET
    });
    const created = await manager.create(SECRET);
    const meta = await manager.revoke(created.reference);
    expect(meta.revokedAt).toBe("2026-05-06T09:00:00Z");
    const del = calls.find((c) => c.method === "DELETE")!;
    expect(del.url).toBe(`${ENDPOINT}/v1/${MOUNT}/data/${PREFIX}/${PATH_ID}`);
  });

  it("delete removes metadata and is idempotent on 404, but maps 5xx to CLEANUP_FAILED", async () => {
    const ok = harness((rec) => (rec.method === "POST" ? writeOk(1) : { status: 404, ok: false }));
    const c1 = await ok.manager.create(SECRET);
    await expect(ok.manager.delete(c1.reference)).resolves.toBeUndefined();
    expect(ok.calls.find((c) => c.method === "DELETE")!.url).toBe(`${ENDPOINT}/v1/${MOUNT}/metadata/${PREFIX}/${PATH_ID}`);

    const fail = harness((rec) => (rec.method === "POST" ? writeOk(1) : { status: 500, ok: false }));
    const c2 = await fail.manager.create(SECRET);
    await expect(fail.manager.delete(c2.reference)).rejects.toMatchObject({ code: "CLEANUP_FAILED" });
  });
});

describe("94D0C — security invariants", () => {
  it("rejects traversal and foreign references without a request", async () => {
    const { manager, calls } = harness(() => writeOk(1));
    for (const bad of ["bao:v1:../../secret", "bao:v1:a/b", "ovhkms:v1:xxxxxxxxxxxxxxxx", "bao:v2:x", "nope"]) {
      await expect(manager.resolve(bad as SecretReference)).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
    }
    expect(calls).toHaveLength(0);
  });

  it("rejects http unless loopback+allowInsecureLoopback, and rejects a foreign host", () => {
    // https always fine.
    expect(() => harness(() => writeOk(1), { endpoint: "https://bao.internal:8200" })).not.toThrow();
    // plain http on a non-loopback host is rejected.
    expect(() => harness(() => writeOk(1), { endpoint: "http://bao.internal:8200" })).toThrow(SecretManagerError);
    // http loopback rejected without the explicit flag.
    expect(() => harness(() => writeOk(1), { endpoint: "http://127.0.0.1:8200" })).toThrow(SecretManagerError);
    // http loopback allowed only with the flag.
    expect(() => harness(() => writeOk(1), { endpoint: "http://127.0.0.1:8200", allowInsecureLoopback: true })).not.toThrow();
    // malformed endpoint rejected.
    expect(() => harness(() => writeOk(1), { endpoint: "not a url" })).toThrow(SecretManagerError);
  });

  it("never leaks the token or secret into a thrown error", async () => {
    const { manager } = harness((rec) => (rec.method === "POST" ? writeOk(1) : { status: 500, ok: false }));
    const { reference } = await manager.create(SECRET);
    try {
      await manager.resolve(reference);
      expect.fail("should throw");
    } catch (error) {
      const s = `${(error as Error).message}${(error as Error).stack ?? ""}`;
      expect(s).not.toContain(TOKEN);
      expect(s).not.toContain(b64(SECRET));
    }
  });

  it("requests a fresh token per request and does not mutate the caller buffer", async () => {
    const { manager, token } = harness((rec) => (rec.method === "POST" ? writeOk(1) : readActive(SECRET)));
    const original = Uint8Array.from(SECRET);
    const { reference } = await manager.create(SECRET);
    await manager.resolve(reference);
    expect(token).toHaveBeenCalledTimes(2);
    expect(Array.from(SECRET)).toEqual(Array.from(original));
  });

  it("satisfies the writable capability contract", () => {
    expect(isWritableSecretManager(harness(() => writeOk(1)).manager)).toBe(true);
  });

  it("the adapter source has no console/logger call and no process.env read", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/openbao-secret-manager.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    expect(src).not.toMatch(/console\.|logger\./);
    expect(src).not.toMatch(/process\.env/);
  });

  it("is wired into no application composition", () => {
    const composition = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/http/composition.ts"), "utf8");
    expect(composition).not.toMatch(/openbao-secret-manager|createOpenBaoSecretManager/);
  });
});
