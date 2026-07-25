// PHASE 94D0D — an OpenBao (Vault) AppRole token provider for the OpenBao
// secret-manager adapter from 94D0C.
//
// The 94D0C adapter takes an injected `tokenProvider: () => Promise<string>` and
// requests a fresh token per request. This module is a concrete implementation
// of that dependency: it logs in with an AppRole (role_id + secret_id), holds
// the resulting client token IN MEMORY ONLY, hands it out until just before the
// lease expires, and re-authenticates afterwards. `getToken` has exactly the
// shape the adapter's `tokenProvider` expects, so a future composition can wire
// `tokenProvider: provider.getToken` — but nothing here wires it.
//
// It is NOT wired into production composition and reads no process.env — every
// dependency (endpoint, mount, role/secret id sources, fetch, clock, skew) is
// injected, so it is fully testable with a mock fetch and a mock clock.
//
// SECURITY POSTURE (identical intent to the 94D0C adapter)
//   - native fetch only; the token lives in a closure variable, never persisted,
//     never returned as metadata — `getToken` resolves to the raw string only;
//   - role_id / secret_id are requested ONLY when a login is actually required,
//     appear only inside a single request body, and never in a log or an error;
//   - https required, except an explicit loopback lab mode; the login URL is
//     asserted to stay on the configured origin; the auth mount is traversal-proof;
//   - concurrent callers share ONE in-flight login; a failed login is never cached;
//   - malformed / non-2xx / network responses FAIL CLOSED; no upstream body,
//     token, role id or secret id ever reaches an error — only a fixed code.

import { SecretManagerError } from "./secret-manager";

export interface OpenBaoAppRoleTokenProviderConfig {
  /** Base address, e.g. `https://bao.internal:8200` or `http://127.0.0.1:8200`. */
  endpoint: string;
  /** AppRole auth mount, e.g. `approle`. */
  authMount: string;
  /** Fresh role id per login; requested only when a login is required. */
  roleIdProvider: () => Promise<string>;
  /** Fresh secret id per login; requested only when a login is required. */
  secretIdProvider: () => Promise<string>;
  fetchImpl: typeof fetch;
  /** Current time in epoch MILLISECONDS. Injected for deterministic expiry. */
  clock: () => number;
  /** Re-authenticate this many seconds BEFORE the lease actually expires. */
  expirySkewSeconds: number;
  /** Permit http ONLY for 127.0.0.1/localhost/[::1] — for local integration. */
  allowInsecureLoopback?: boolean;
}

export interface OpenBaoAppRoleTokenProvider {
  /**
   * A valid client token. Served from an in-memory cache until just before the
   * lease expires, otherwise obtained by a fresh AppRole login. Never resolves
   * to token metadata — only the raw token string.
   */
  getToken(): Promise<string>;
  /** Drop the cached token and its expiry immediately; the next call re-logs in. */
  clear(): void;
}

const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_/-]{0,127}$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function createOpenBaoAppRoleTokenProvider(
  config: OpenBaoAppRoleTokenProviderConfig,
): OpenBaoAppRoleTokenProvider {
  let origin: string;
  try {
    const url = new URL(config.endpoint);
    const loopback = LOOPBACK_HOSTS.has(url.hostname);
    const httpsOk = url.protocol === "https:";
    const httpLoopbackOk = url.protocol === "http:" && loopback && config.allowInsecureLoopback === true;
    if (!httpsOk && !httpLoopbackOk) throw new Error("endpoint");
    origin = url.origin;
  } catch {
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }

  const authMount = config.authMount.replace(/^\/+|\/+$/g, "");
  if (!SEGMENT_PATTERN.test(authMount) || authMount.includes("..")) {
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }
  if (!Number.isFinite(config.expirySkewSeconds) || config.expirySkewSeconds < 0) {
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }

  const loginUrl = `${origin}/v1/auth/${authMount}/login`;
  if (new URL(loginUrl).origin !== origin) throw new SecretManagerError("PROVIDER_UNAVAILABLE");

  // The only mutable state: a validated token with its computed expiry, and the
  // single in-flight login shared by concurrent callers. Both are in-memory.
  let cached: { token: string; expiresAtMs: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function send(init: RequestInit): Promise<Response> {
    try {
      return await config.fetchImpl(loginUrl, init);
    } catch {
      throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    }
  }

  async function parseBody(response: Response): Promise<Record<string, unknown> | null> {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async function login(): Promise<string> {
    // IDs are pulled only here — i.e. only when a login is actually required.
    const roleId = await config.roleIdProvider();
    const secretId = await config.secretIdProvider();
    if (typeof roleId !== "string" || roleId.length === 0 || typeof secretId !== "string" || secretId.length === 0) {
      throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    }

    // Measure the lease from just before the request; expirySkewSeconds is the
    // safety margin, so a slightly conservative issue time is intentional.
    const issuedAtMs = config.clock();
    const response = await send({
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
    });
    if (!response.ok) throw new SecretManagerError("PROVIDER_UNAVAILABLE");

    const body = await parseBody(response);
    const auth = body?.auth as Record<string, unknown> | undefined;
    // Consume ONLY client_token and lease_duration. `renewable` is deliberately
    // not acted upon: this provider re-authenticates on expiry rather than
    // renewing a lease, so a token's renewability never changes its handling.
    const token = typeof auth?.client_token === "string" ? auth.client_token : "";
    const lease = typeof auth?.lease_duration === "number" ? auth.lease_duration : NaN;
    if (token.length === 0) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    if (!Number.isInteger(lease) || lease <= 0) throw new SecretManagerError("PROVIDER_UNAVAILABLE");

    const ttlMs = Math.max(0, lease - config.expirySkewSeconds) * 1000;
    cached = { token, expiresAtMs: issuedAtMs + ttlMs };
    return token;
  }

  async function getToken(): Promise<string> {
    const current = cached;
    if (current && config.clock() < current.expiresAtMs) return current.token;
    // Expired or absent: share a single login across concurrent callers, and
    // never leave a failed login cached (self-clears in `finally`).
    if (inflight) return inflight;
    inflight = login().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function clear(): void {
    cached = null;
  }

  return { getToken, clear };
}
