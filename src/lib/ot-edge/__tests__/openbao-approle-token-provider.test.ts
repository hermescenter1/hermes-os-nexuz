import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SecretManagerError } from "../secret-manager";
import {
  createOpenBaoAppRoleTokenProvider,
  type OpenBaoAppRoleTokenProviderConfig,
} from "../openbao-approle-token-provider";

/**
 * PHASE 94D0D — the OpenBao AppRole token provider, against a MOCK fetch and a
 * MOCK clock only.
 *
 * Covers the login wire contract (path/method/headers/body), in-memory caching
 * with an expiry skew, refresh after expiry, single shared in-flight login,
 * failed-login-never-cached, clear(), and the security invariants (fail closed
 * on malformed / non-2xx / network, unsafe endpoint + traversal rejected, no
 * token/role/secret leak, no console/logger, no process.env).
 */

const ENDPOINT = "https://bao.internal:8200";
const AUTH_MOUNT = "approle";
const ROLE_ID = "role-1111-2222-3333-4444";
const SECRET_ID = "secret-id-do-not-leak-9999";
const TOKEN = "hvs.CLIENT-TOKEN-do-not-leak";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status: number; body?: unknown; ok?: boolean };

function harness(opts: {
  responder?: (rec: Recorded, callNumber: number) => Reply;
  start?: number;
  expirySkewSeconds?: number;
  over?: Partial<OpenBaoAppRoleTokenProviderConfig>;
} = {}) {
  const calls: Recorded[] = [];
  let clockMs = opts.start ?? 1_000_000;
  const advanceSeconds = (seconds: number) => {
    clockMs += seconds * 1000;
  };

  const roleId = vi.fn(async () => ROLE_ID);
  const secretId = vi.fn(async () => SECRET_ID);
  const defaultReply: Reply = { status: 200, body: { auth: { client_token: TOKEN, lease_duration: 100, renewable: true } } };

  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const rec: Recorded = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(rec);
    const r = opts.responder ? opts.responder(rec, calls.length) : defaultReply;
    return { ok: r.ok ?? (r.status >= 200 && r.status < 300), status: r.status, json: async () => r.body } as Response;
  });

  const provider = createOpenBaoAppRoleTokenProvider({
    endpoint: ENDPOINT,
    authMount: AUTH_MOUNT,
    roleIdProvider: roleId,
    secretIdProvider: secretId,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    clock: () => clockMs,
    expirySkewSeconds: opts.expirySkewSeconds ?? 10,
    ...opts.over,
  });
  return { provider, calls, roleId, secretId, advanceSeconds };
}

describe("94D0D — successful login and wire contract", () => {
  it("POSTs the exact login path and body, with no token header", async () => {
    const { provider, calls, roleId, secretId } = harness();
    const token = await provider.getToken();
    expect(token).toBe(TOKEN);
    expect(typeof token).toBe("string");

    const c = calls[0];
    expect(c.method).toBe("POST");
    expect(c.url).toBe(`${ENDPOINT}/v1/auth/${AUTH_MOUNT}/login`);
    expect(c.headers["Content-Type"]).toBe("application/json");
    expect(c.headers["X-Vault-Token"]).toBeUndefined();
    expect(c.headers.Authorization).toBeUndefined();
    // Body carries exactly role_id and secret_id — nothing else.
    expect(c.body).toEqual({ role_id: ROLE_ID, secret_id: SECRET_ID });
    expect(Object.keys(c.body as object).sort()).toEqual(["role_id", "secret_id"]);
    expect(roleId).toHaveBeenCalledTimes(1);
    expect(secretId).toHaveBeenCalledTimes(1);
  });
});

describe("94D0D — caching and refresh", () => {
  it("serves the cached token before expiry without re-logging in", async () => {
    const { provider, calls, roleId, secretId } = harness({ expirySkewSeconds: 10 });
    await provider.getToken();
    await provider.getToken(); // still within lease(100) - skew(10)
    expect(calls).toHaveLength(1);
    expect(roleId).toHaveBeenCalledTimes(1);
    expect(secretId).toHaveBeenCalledTimes(1);
  });

  it("re-authenticates after the skewed lease expires", async () => {
    let n = 0;
    const { provider, calls, advanceSeconds } = harness({
      responder: () => {
        n += 1;
        return { status: 200, body: { auth: { client_token: `${TOKEN}-${n}`, lease_duration: 100, renewable: true } } };
      },
    });
    const first = await provider.getToken();
    advanceSeconds(89); // still cached (100 - 10 = 90)
    expect(await provider.getToken()).toBe(first);
    advanceSeconds(2); // now past 90s → expired
    const second = await provider.getToken();
    expect(second).not.toBe(first);
    expect(calls).toHaveLength(2);
  });

  it("honours expirySkewSeconds at the boundary", async () => {
    const { provider, calls, advanceSeconds } = harness({ expirySkewSeconds: 30 }); // cached until +70s
    await provider.getToken();
    advanceSeconds(69);
    await provider.getToken();
    expect(calls).toHaveLength(1);
    advanceSeconds(2); // 71s > 70s
    await provider.getToken();
    expect(calls).toHaveLength(2);
  });

  it("requests role/secret ids only when a login is required", async () => {
    const { provider, roleId, secretId } = harness();
    await provider.getToken();
    await provider.getToken(); // cache hit
    expect(roleId).toHaveBeenCalledTimes(1);
    expect(secretId).toHaveBeenCalledTimes(1);
  });
});

describe("94D0D — concurrency and clear", () => {
  it("shares a single in-flight login across concurrent callers", async () => {
    const { provider, calls, roleId } = harness();
    const [a, b] = await Promise.all([provider.getToken(), provider.getToken()]);
    expect(a).toBe(TOKEN);
    expect(b).toBe(TOKEN);
    expect(calls).toHaveLength(1);
    expect(roleId).toHaveBeenCalledTimes(1);
  });

  it("clear() drops the cached token so the next call re-logs in", async () => {
    const { provider, calls } = harness();
    await provider.getToken();
    provider.clear();
    await provider.getToken();
    expect(calls).toHaveLength(2);
  });
});

describe("94D0D — failure handling", () => {
  it("never caches a failed login and re-authenticates on the next call", async () => {
    let attempt = 0;
    const { provider, calls, roleId } = harness({
      responder: () => {
        attempt += 1;
        return attempt === 1 ? { status: 500, ok: false } : { status: 200, body: { auth: { client_token: TOKEN, lease_duration: 100, renewable: true } } };
      },
    });
    await expect(provider.getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    const token = await provider.getToken();
    expect(token).toBe(TOKEN);
    expect(calls).toHaveLength(2);
    // A retry is a fresh login → ids requested again.
    expect(roleId).toHaveBeenCalledTimes(2);
  });

  it("maps 4xx, 5xx and network errors to PROVIDER_UNAVAILABLE", async () => {
    const four = harness({ responder: () => ({ status: 403, ok: false }) });
    await expect(four.provider.getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    const five = harness({ responder: () => ({ status: 503, ok: false }) });
    await expect(five.provider.getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    const net = harness({
      over: {
        fetchImpl: (async () => {
          throw new Error("ECONNREFUSED");
        }) as unknown as typeof fetch,
      },
    });
    await expect(net.provider.getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("fails closed on malformed / empty-token / invalid-lease responses", async () => {
    const cases: Reply[] = [
      { status: 200, body: { nope: 1 } },
      { status: 200, body: { auth: {} } },
      { status: 200, body: { auth: { client_token: "", lease_duration: 100 } } },
      { status: 200, body: { auth: { client_token: TOKEN } } },
      { status: 200, body: { auth: { client_token: TOKEN, lease_duration: 0 } } },
      { status: 200, body: { auth: { client_token: TOKEN, lease_duration: -5 } } },
      { status: 200, body: { auth: { client_token: TOKEN, lease_duration: 1.5 } } },
    ];
    for (const reply of cases) {
      const { provider } = harness({ responder: () => reply });
      await expect(provider.getToken()).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    }
  });
});

describe("94D0D — endpoint and mount safety", () => {
  it("requires https unless loopback + allowInsecureLoopback", () => {
    expect(() => harness({ over: { endpoint: "https://bao.internal:8200" } })).not.toThrow();
    expect(() => harness({ over: { endpoint: "http://bao.internal:8200" } })).toThrow(SecretManagerError);
    expect(() => harness({ over: { endpoint: "http://127.0.0.1:8200" } })).toThrow(SecretManagerError);
    expect(() => harness({ over: { endpoint: "http://127.0.0.1:8200", allowInsecureLoopback: true } })).not.toThrow();
    expect(() => harness({ over: { endpoint: "not a url" } })).toThrow(SecretManagerError);
  });

  it("rejects a traversal or malformed auth mount", () => {
    for (const mount of ["../secret", "approle/../root", "..", "bad mount", ""]) {
      expect(() => harness({ over: { authMount: mount } })).toThrow(SecretManagerError);
    }
  });

  it("rejects a negative or non-finite expiry skew", () => {
    expect(() => harness({ over: { expirySkewSeconds: -1 } })).toThrow(SecretManagerError);
    expect(() => harness({ over: { expirySkewSeconds: Number.NaN } })).toThrow(SecretManagerError);
  });
});

describe("94D0D — no leakage and source hygiene", () => {
  it("never leaks the token, role id or secret id into a thrown error", async () => {
    const { provider } = harness({ responder: () => ({ status: 500, ok: false }) });
    try {
      await provider.getToken();
      expect.fail("should throw");
    } catch (error) {
      const s = `${(error as Error).message}${(error as Error).stack ?? ""}`;
      expect(s).not.toContain(TOKEN);
      expect(s).not.toContain(ROLE_ID);
      expect(s).not.toContain(SECRET_ID);
    }
  });

  it("resolves to a bare token string, never metadata", async () => {
    const { provider } = harness();
    const token = await provider.getToken();
    expect(typeof token).toBe("string");
    expect(token).not.toContain("lease_duration");
    expect(token).not.toContain("renewable");
  });

  it("the source has no console/logger call and no process.env read", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/openbao-approle-token-provider.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    expect(src).not.toMatch(/console\.|logger\./);
    expect(src).not.toMatch(/process\.env/);
  });

  it("is wired into no application composition", () => {
    const composition = readFileSync(resolve(process.cwd(), "src/lib/ot-edge/http/composition.ts"), "utf8");
    expect(composition).not.toMatch(/openbao-approle-token-provider|createOpenBaoAppRoleTokenProvider/);
  });
});
