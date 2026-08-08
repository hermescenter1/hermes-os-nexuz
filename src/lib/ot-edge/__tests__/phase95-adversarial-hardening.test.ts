import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, writeFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createOpenBaoSecretManager,
  type OpenBaoSecretManagerConfig,
} from "../openbao-secret-manager";
import {
  createOpenBaoAppRoleTokenProvider,
  type OpenBaoAppRoleTokenProviderConfig,
} from "../openbao-approle-token-provider";
import { readCredentialFile } from "../secret-backend";
import { SecretManagerError, type SecretReference } from "../secret-manager";

/**
 * PHASE 95 — adversarial hardening tests for the OpenBao credential-plane
 * client: redirect rejection, request timeout, response-size bound, bounded-
 * config validation, KV v1/v2 mismatch, recursive-retry prevention, and secure
 * credential-file reads (symlink / missing / empty / non-regular). These close
 * the gaps left by the Phase 94 mock harnesses (which never modelled 3xx,
 * timeouts, Content-Length, or file I/O).
 */

const ENDPOINT = "https://bao.internal:8200";
const MOUNT = "hermes-lab";
const PREFIX = "phase95";
const TOKEN = "hvs.SECRET-VAULT-TOKEN-do-not-leak";
const AUTH_MOUNT = "approle";
const ROLE_ID = "role-id-do-not-leak";
const SECRET_ID = "secret-id-do-not-leak";
const SECRET = new Uint8Array(32).fill(9);

interface Init {
  redirect?: string;
  signal?: unknown;
  method?: string;
}

/** A fake Response with an optional Content-Length header (mirrors the shape the
 *  adapter reads: `{ ok, status, json, headers.get }`). */
function fakeResponse(status: number, body: unknown, contentLength?: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-length" && contentLength !== undefined
          ? String(contentLength)
          : null,
    },
  } as unknown as Response;
}

function manager(
  fetchImpl: (url: string, init: Init) => Promise<Response>,
  over: Partial<OpenBaoSecretManagerConfig> = {},
) {
  return createOpenBaoSecretManager({
    endpoint: ENDPOINT,
    mountPath: MOUNT,
    pathPrefix: PREFIX,
    tokenProvider: async () => TOKEN,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    randomBytes: (n: number) => new Uint8Array(n).fill(7),
    ...over,
  });
}

function tokenProvider(
  fetchImpl: (url: string, init: Init) => Promise<Response>,
  over: Partial<OpenBaoAppRoleTokenProviderConfig> = {},
) {
  return createOpenBaoAppRoleTokenProvider({
    endpoint: ENDPOINT,
    authMount: AUTH_MOUNT,
    roleIdProvider: async () => ROLE_ID,
    secretIdProvider: async () => SECRET_ID,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    clock: () => 1_000_000,
    expirySkewSeconds: 10,
    ...over,
  });
}

const loginOk = () =>
  fakeResponse(200, { auth: { client_token: TOKEN, lease_duration: 100 } });
const writeOk = () => fakeResponse(200, { data: { version: 1, created_time: "2026-01-01T00:00:00Z" } });

/* ── redirects are rejected (redirect: "error") ──────────────────────────── */

describe("95 — redirects rejected", () => {
  it("the KV adapter sets redirect: 'error' on every request", async () => {
    const seen: Init[] = [];
    const m = manager(async (_url, init) => {
      seen.push(init);
      return writeOk();
    });
    await m.create(SECRET);
    expect(seen).toHaveLength(1);
    expect(seen[0].redirect).toBe("error");
  });

  it("the token provider sets redirect: 'error' on login", async () => {
    const seen: Init[] = [];
    const p = tokenProvider(async (_url, init) => {
      seen.push(init);
      return loginOk();
    });
    await p.getToken();
    expect(seen[0].redirect).toBe("error");
  });

  it("a 3xx that native fetch rejects (redirect:error) maps to PROVIDER_UNAVAILABLE", async () => {
    // Native fetch throws a TypeError on a redirect when redirect:"error"; the
    // adapter must map any such throw to the fixed fail-closed code.
    const m = manager(async () => {
      throw new TypeError("redirect");
    });
    await expect(m.create(SECRET)).rejects.toBeInstanceOf(SecretManagerError);
    await expect(m.create(SECRET)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});

/* ── request timeout is bounded ──────────────────────────────────────────── */

describe("95 — request timeout", () => {
  it("aborts a hung KV request via the injected timeout and fails closed", async () => {
    let sawSignal = false;
    const m = manager(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          sawSignal = signal instanceof AbortSignal;
          signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
      { timeoutMs: 5 },
    );
    await expect(m.create(SECRET)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(sawSignal).toBe(true);
  });

  it("aborts a hung login via the injected timeout and fails closed", async () => {
    const p = tokenProvider(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
      { timeoutMs: 5 },
    );
    await expect(p.getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});

/* ── response-size bound (declared Content-Length) ───────────────────────── */

describe("95 — response-size bound", () => {
  it("rejects a KV response that declares more than maxResponseBytes", async () => {
    const m = manager(async () => fakeResponse(200, { data: { version: 1, created_time: "x" } }, 5_000_000), {
      maxResponseBytes: 1024,
    });
    await expect(m.create(SECRET)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("accepts a KV response within the bound", async () => {
    const m = manager(async () => fakeResponse(200, { data: { version: 1, created_time: "2026-01-01T00:00:00Z" } }, 64), {
      maxResponseBytes: 1024,
    });
    await expect(m.create(SECRET)).resolves.toMatchObject({ version: 1 });
  });

  it("rejects an oversized login response", async () => {
    const p = tokenProvider(
      async () => fakeResponse(200, { auth: { client_token: TOKEN, lease_duration: 100 } }, 5_000_000),
      { maxResponseBytes: 1024 },
    );
    await expect(p.getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});

/* ── bounded-config validation fails closed ──────────────────────────────── */

describe("95 — bounded-config validation", () => {
  const bad = [0, -1, 1.5, 120_001];
  for (const value of bad) {
    it(`rejects timeoutMs=${value} at construction (KV adapter)`, () => {
      expect(() => manager(async () => writeOk(), { timeoutMs: value })).toThrow(SecretManagerError);
    });
    it(`rejects timeoutMs=${value} at construction (token provider)`, () => {
      expect(() => tokenProvider(async () => loginOk(), { timeoutMs: value })).toThrow(SecretManagerError);
    });
  }
  for (const value of [0, -1, 2.5, 1_048_577]) {
    it(`rejects maxResponseBytes=${value} at construction (KV adapter)`, () => {
      expect(() => manager(async () => writeOk(), { maxResponseBytes: value })).toThrow(SecretManagerError);
    });
  }
  it("accepts valid in-range bounds", () => {
    expect(() => manager(async () => writeOk(), { timeoutMs: 1, maxResponseBytes: 1 })).not.toThrow();
    expect(() => manager(async () => writeOk(), { timeoutMs: 120_000, maxResponseBytes: 1_048_576 })).not.toThrow();
  });
});

/* ── KV v1/v2 mismatch fails closed ──────────────────────────────────────── */

describe("95 — KV v1/v2 mismatch", () => {
  it("a KV v1-shaped read (no nested data/metadata) fails closed", async () => {
    // KV v1 returns `{ data: { value } }`; the v2 adapter expects
    // `{ data: { data: { value }, metadata } }`. The mismatch must not be read
    // as a secret — it fails closed.
    const created = await manager(async () => writeOk()).create(SECRET);
    const ref = created.reference;
    const m = manager(async () => fakeResponse(200, { data: { value: "AAAA" } }));
    await expect(m.resolve(ref as SecretReference)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});

/* ── recursive-retry prevention (single login attempt) ───────────────────── */

describe("95 — recursive-retry prevention", () => {
  it("a single getToken() makes exactly one login attempt on failure (no loop)", async () => {
    let calls = 0;
    const p = tokenProvider(async () => {
      calls += 1;
      return fakeResponse(503, { errors: ["down"] });
    });
    await expect(p.getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(calls).toBe(1);
  });
});

/* ── secure credential-file reads ────────────────────────────────────────── */

describe("95 — readCredentialFile hardening", () => {
  let dir: string;
  const dirPromise = mkdtemp(join(tmpdir(), "hermes-cred-")).then((d) => (dir = d));

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("reads and trims a plain regular file", async () => {
    await dirPromise;
    const p = join(dir, "role_id");
    await writeFile(p, "  the-role-id\n", { mode: 0o600 });
    expect(await readCredentialFile(p)).toBe("the-role-id");
  });

  it("rejects an empty file (fail closed)", async () => {
    await dirPromise;
    const p = join(dir, "empty");
    await writeFile(p, "   \n", { mode: 0o600 });
    await expect(readCredentialFile(p)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("rejects a missing file (fail closed)", async () => {
    await dirPromise;
    await expect(readCredentialFile(join(dir, "nope"))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("rejects a directory (not a regular file)", async () => {
    await dirPromise;
    const p = join(dir, "adir");
    await mkdir(p);
    await expect(readCredentialFile(p)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("rejects a symlinked credential file", async () => {
    await dirPromise;
    const target = join(dir, "target");
    const link = join(dir, "link");
    await writeFile(target, "secret\n", { mode: 0o600 });
    let symlinkSupported = true;
    try {
      await symlink(target, link);
    } catch {
      // Windows without privilege / dev mode cannot create symlinks — the
      // rejection path is exercised on POSIX CI instead.
      symlinkSupported = false;
    }
    if (symlinkSupported) {
      await expect(readCredentialFile(link)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    } else {
      expect(symlinkSupported).toBe(false);
    }
  });
});
