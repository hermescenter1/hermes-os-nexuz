import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SecretManagerError, type SecretReference } from "../secret-manager";
import {
  createOpenBaoRuntimeComposition,
  type OpenBaoRuntimeConfig,
} from "../openbao-runtime-composition";

/**
 * PHASE 94D0E — the server-only OpenBao runtime composition factory.
 *
 * A single mock `fetch` routes BOTH the AppRole login endpoint and the KV2
 * data/metadata endpoints, so the tests prove the two pieces are composed
 * correctly: one login serves many KV requests, expiry and clear() force a
 * re-login, concurrent KV calls share a single login, and every fail-closed
 * guarantee holds. No network, no real OpenBao.
 */

const ENDPOINT = "https://bao.internal:8200";
const MOUNT = "hermes-lab";
const PREFIX = "phase94d0e";
const AUTH_MOUNT = "approle";
const ROLE_ID = "role-1111-2222-3333";
const SECRET_ID = "secret-id-do-not-leak-9999";
const TOKEN = "hvs.CLIENT-TOKEN-do-not-leak";
const SECRET = new TextEncoder().encode("32-bytes-of-signing-key-material!");
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const PATH_ID = b64(new Uint8Array(18).fill(7));
const REFERENCE = ("bao:v1:" + PATH_ID) as SecretReference;

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}
type Reply = { status: number; body?: unknown; ok?: boolean };

const json = (r: Reply): Response =>
  ({ ok: r.ok ?? (r.status >= 200 && r.status < 300), status: r.status, json: async () => r.body }) as Response;

const kvWriteOk = (version: number): Reply => ({ status: 200, body: { data: { version, created_time: "2026-05-06T07:08:09Z" } } });
const kvReadActive = (bytes: Uint8Array): Reply => ({
  status: 200,
  body: { data: { data: { value: b64(bytes) }, metadata: { version: 1, created_time: "2026-05-06T07:08:09Z", deletion_time: "", destroyed: false } } },
});

const isLogin = (url: string) => url.endsWith(`/v1/auth/${AUTH_MOUNT}/login`);

function harness(opts: {
  enabled?: boolean;
  start?: number;
  skew?: number;
  lease?: number;
  loginReply?: (loginNumber: number) => Reply;
  kv?: (rec: Recorded) => Reply;
  over?: Partial<OpenBaoRuntimeConfig>;
} = {}) {
  const calls: Recorded[] = [];
  let clockMs = opts.start ?? 1_000_000;
  const advanceSeconds = (seconds: number) => {
    clockMs += seconds * 1000;
  };
  let logins = 0;
  const roleId = vi.fn(async () => ROLE_ID);
  const secretId = vi.fn(async () => SECRET_ID);

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const rec: Recorded = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(rec);
    if (isLogin(rec.url)) {
      logins += 1;
      const reply = opts.loginReply
        ? opts.loginReply(logins)
        : { status: 200, body: { auth: { client_token: logins === 1 ? TOKEN : `${TOKEN}-${logins}`, lease_duration: opts.lease ?? 100, renewable: true } } };
      return json(reply);
    }
    return json(opts.kv ? opts.kv(rec) : rec.method === "POST" ? kvWriteOk(1) : kvReadActive(SECRET));
  });

  const runtime = createOpenBaoRuntimeComposition({
    enabled: opts.enabled ?? true,
    endpoint: ENDPOINT,
    mountPath: MOUNT,
    pathPrefix: PREFIX,
    authMount: AUTH_MOUNT,
    roleIdProvider: roleId,
    secretIdProvider: secretId,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    clock: () => clockMs,
    randomBytes: (n: number) => new Uint8Array(n).fill(7),
    expirySkewSeconds: opts.skew ?? 10,
    allowInsecureLoopback: false,
    ...opts.over,
  });

  const kvCalls = () => calls.filter((c) => !isLogin(c.url));
  const loginCalls = () => calls.filter((c) => isLogin(c.url));
  return { runtime, calls, roleId, secretId, advanceSeconds, kvCalls, loginCalls, loginCount: () => logins };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("94D0E — disabled mode", () => {
  it("returns a typed unavailable result and performs zero provider/network calls", () => {
    const { runtime, calls, roleId, secretId } = harness({ enabled: false });
    expect(runtime.available).toBe(false);
    if (runtime.available) throw new Error("expected unavailable");
    expect(runtime.reason).toBe("DISABLED");
    expect("secretManager" in runtime).toBe(false);
    expect(calls).toHaveLength(0);
    expect(roleId).not.toHaveBeenCalled();
    expect(secretId).not.toHaveBeenCalled();
  });

  it("treats missing/invalid enabled as disabled (no fallback)", () => {
    for (const bad of [{}, { enabled: undefined }, { enabled: "yes" }, { enabled: 1 }, null]) {
      const runtime = createOpenBaoRuntimeComposition(bad as unknown as OpenBaoRuntimeConfig);
      expect(runtime.available).toBe(false);
    }
  });
});

describe("94D0E — enabled mode composes AppRole + KV2", () => {
  it("logs in via AppRole, then writes to KV2 with the issued token", async () => {
    const { runtime, calls, loginCalls, kvCalls } = harness();
    if (!runtime.available) throw new Error("expected available");
    const meta = await runtime.secretManager.create(SECRET);

    // Login happened first, then the KV write.
    expect(isLogin(calls[0].url)).toBe(true);
    const login = loginCalls()[0];
    expect(login.method).toBe("POST");
    expect(login.url).toBe(`${ENDPOINT}/v1/auth/${AUTH_MOUNT}/login`);
    expect(login.body).toEqual({ role_id: ROLE_ID, secret_id: SECRET_ID });
    expect(login.headers["X-Vault-Token"]).toBeUndefined();

    const write = kvCalls()[0];
    expect(write.method).toBe("POST");
    expect(write.url).toBe(`${ENDPOINT}/v1/${MOUNT}/data/${PREFIX}/${PATH_ID}`);
    expect(write.headers["X-Vault-Token"]).toBe(TOKEN);
    expect((write.body as { options: { cas: number } }).options.cas).toBe(0);
    expect(meta.reference.startsWith("bao:v1:")).toBe(true);
  });

  it("serves subsequent KV requests from one login while the token is valid", async () => {
    const { runtime, loginCount, roleId } = harness();
    if (!runtime.available) throw new Error("expected available");
    await runtime.secretManager.create(SECRET);
    await runtime.secretManager.resolve(REFERENCE);
    await runtime.secretManager.resolve(REFERENCE);
    expect(loginCount()).toBe(1);
    expect(roleId).toHaveBeenCalledTimes(1);
  });

  it("re-authenticates once the token has expired", async () => {
    const { runtime, advanceSeconds, loginCount, kvCalls } = harness({ lease: 100, skew: 10 });
    if (!runtime.available) throw new Error("expected available");
    await runtime.secretManager.resolve(REFERENCE); // login 1, token valid until +90s
    advanceSeconds(91);
    await runtime.secretManager.resolve(REFERENCE); // expired → login 2
    expect(loginCount()).toBe(2);
    // The second KV read carried the refreshed token.
    expect(kvCalls()[1].headers["X-Vault-Token"]).toBe(`${TOKEN}-2`);
  });

  it("clearAuthenticationCache() forces the next KV request to re-login", async () => {
    const { runtime, loginCount } = harness();
    if (!runtime.available) throw new Error("expected available");
    await runtime.secretManager.resolve(REFERENCE);
    expect(loginCount()).toBe(1);
    runtime.clearAuthenticationCache();
    await runtime.secretManager.resolve(REFERENCE);
    expect(loginCount()).toBe(2);
  });

  it("shares a single AppRole login across concurrent KV calls", async () => {
    const { runtime, loginCount, roleId, kvCalls } = harness();
    if (!runtime.available) throw new Error("expected available");
    await Promise.all([
      runtime.secretManager.resolve(REFERENCE),
      runtime.secretManager.resolve(REFERENCE),
      runtime.secretManager.resolve(REFERENCE),
    ]);
    expect(loginCount()).toBe(1);
    expect(roleId).toHaveBeenCalledTimes(1);
    expect(kvCalls()).toHaveLength(3);
  });

  it("does not cache a failed login and retries on the next KV request", async () => {
    const { runtime, loginCount, roleId } = harness({
      loginReply: (n) => (n === 1 ? { status: 500, ok: false } : { status: 200, body: { auth: { client_token: TOKEN, lease_duration: 100, renewable: true } } }),
    });
    if (!runtime.available) throw new Error("expected available");
    await expect(runtime.secretManager.resolve(REFERENCE)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    // Second attempt logs in afresh and succeeds.
    await expect(runtime.secretManager.resolve(REFERENCE)).resolves.toBeInstanceOf(Uint8Array);
    expect(loginCount()).toBe(2);
    expect(roleId).toHaveBeenCalledTimes(2);
  });
});

describe("94D0E — fail closed", () => {
  it("throws a fixed error on malformed configuration when enabled", () => {
    const base = (): OpenBaoRuntimeConfig => ({
      enabled: true,
      endpoint: ENDPOINT,
      mountPath: MOUNT,
      pathPrefix: PREFIX,
      authMount: AUTH_MOUNT,
      roleIdProvider: async () => ROLE_ID,
      secretIdProvider: async () => SECRET_ID,
      fetchImpl: (async () => json(kvWriteOk(1))) as unknown as typeof fetch,
      clock: () => 1_000_000,
      randomBytes: (n: number) => new Uint8Array(n).fill(7),
      expirySkewSeconds: 10,
    });
    const broken: Array<Partial<OpenBaoRuntimeConfig>> = [
      { endpoint: "" },
      { endpoint: "http://bao.internal:8200" }, // non-loopback http rejected by the adapter/provider
      { mountPath: "" },
      { pathPrefix: "" },
      { authMount: "../secret" },
      { expirySkewSeconds: -1 },
      { expirySkewSeconds: Number.NaN },
      // AppRole credentials as plain strings are refused — must be async functions.
      { roleIdProvider: ROLE_ID as unknown as () => Promise<string> },
      { secretIdProvider: SECRET_ID as unknown as () => Promise<string> },
      { fetchImpl: undefined as unknown as typeof fetch },
      { clock: undefined as unknown as () => number },
      { randomBytes: undefined as unknown as (n: number) => Uint8Array },
    ];
    for (const patch of broken) {
      expect(() => createOpenBaoRuntimeComposition({ ...base(), ...patch })).toThrow(SecretManagerError);
    }
  });

  it("exposes no fallback provider — the code imports only OpenBao pieces", () => {
    // Comments deliberately DOCUMENT the absent fallbacks (env HMAC, PostgreSQL,
    // in-memory, root token, process.env); strip them so the scan judges only
    // executable code.
    const src = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/openbao-runtime-composition.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    for (const forbidden of [
      /envSecretProvider/,
      /envelope-signature/,
      /@prisma\/client/,
      /PrismaClient/,
      /getPrisma/,
      /InMemory/i,
      /root[_-]?token/i,
      /process\.env/,
    ]) {
      expect(src, `must not reference ${forbidden}`).not.toMatch(forbidden);
    }
  });
});

describe("94D0E — security invariants", () => {
  it("never leaks the token, role id or secret id into a thrown error", async () => {
    const { runtime } = harness({ loginReply: () => ({ status: 500, ok: false }) });
    if (!runtime.available) throw new Error("expected available");
    try {
      await runtime.secretManager.resolve(REFERENCE);
      expect.fail("should throw");
    } catch (error) {
      const s = `${(error as Error).message}${(error as Error).stack ?? ""}`;
      expect(s).not.toContain(TOKEN);
      expect(s).not.toContain(ROLE_ID);
      expect(s).not.toContain(SECRET_ID);
    }
  });

  it("the available result exposes only secretManager and clearAuthenticationCache", () => {
    const { runtime } = harness();
    if (!runtime.available) throw new Error("expected available");
    expect(Object.keys(runtime).sort()).toEqual(["available", "clearAuthenticationCache", "secretManager"]);
    expect("clear" in runtime).toBe(false);
    expect("getToken" in runtime).toBe(false);
  });

  it("the source has no console/logger call and no process.env read", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/openbao-runtime-composition.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    expect(src).not.toMatch(/console\.|logger\./);
    expect(src).not.toMatch(/process\.env/);
  });

  it("is a server-only module — importing it into a browser bundle throws", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {} as unknown as Window & typeof globalThis);
    await expect(import("../openbao-runtime-composition")).rejects.toThrow(/server-only/);
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("carries no client directive", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/openbao-runtime-composition.ts"), "utf8");
    expect(src).not.toMatch(/["']use client["']/);
  });

  it("is wired into no production composition", () => {
    const composition = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/http/composition.ts"), "utf8");
    expect(composition).not.toMatch(/openbao-runtime-composition|createOpenBaoRuntimeComposition/);
  });
});
