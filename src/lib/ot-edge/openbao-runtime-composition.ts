// PHASE 94D0E — a SERVER-ONLY, fail-closed composition factory that wires the
// 94D0C OpenBao KV v2 adapter to the 94D0D AppRole token provider.
//
// This is the single place those two pieces are combined: the AppRole provider
// authenticates (role_id + secret_id → client token, cached in memory), and its
// `getToken` is injected as the adapter's per-request `tokenProvider`. The result
// exposes ONLY a `WritableSecretManager` and a cache-clear hook — never the
// token, role id or secret id.
//
// IT IS NOT WIRED INTO PRODUCTION RUNTIME. `resolveOtServices` (http/composition)
// still uses the read-only env secret provider; this factory is constructed by
// nobody in a production path. It exists so a later phase can enable it behind an
// already-resolved, validated configuration object.
//
// FAIL CLOSED — the whole point of this module
//   - `enabled` must be the literal `true` to compose anything; anything else
//     (false, missing, non-boolean) yields a typed UNAVAILABLE result with no
//     credential read and no network request.
//   - `enabled: true` with malformed configuration THROWS a fixed error. It never
//     falls back to an env HMAC key, PostgreSQL, an in-memory provider, a root
//     token, or anonymous access — the only backends are OpenBao AppRole + KV2.
//   - AppRole credentials are accepted ONLY as async provider functions, never as
//     plain config strings, so a secret can never sit in a config literal.

import { createOpenBaoSecretManager } from "./openbao-secret-manager";
import { createOpenBaoAppRoleTokenProvider } from "./openbao-approle-token-provider";
import { SecretManagerError, type WritableSecretManager } from "./secret-manager";

// Server-only guard. This module composes machine credentials and must never be
// bundled into client code; importing it in a browser bundle throws at load,
// exactly like Next's `server-only` package (which this repo does not vendor).
// The message names the module only — never a secret.
if (typeof window !== "undefined") {
  throw new Error("openbao-runtime-composition is server-only and must not be imported by client code");
}

/**
 * Already-resolved, safe configuration for the OpenBao runtime.
 *
 * Every dependency is injected — the module reads no `process.env`. AppRole
 * credentials are async provider functions, never raw strings, so the caller
 * decides where role/secret ids come from (an external secret source) and this
 * module never holds them at rest.
 */
export interface OpenBaoRuntimeConfig {
  /** Must be the literal `true` to compose; anything else stays disabled. */
  enabled: boolean;
  endpoint: string;
  mountPath: string;
  pathPrefix: string;
  authMount: string;
  /** Async source of the AppRole role id. NOT a plain string. */
  roleIdProvider: () => Promise<string>;
  /** Async source of the AppRole secret id. NOT a plain string. */
  secretIdProvider: () => Promise<string>;
  fetchImpl: typeof fetch;
  /** Current time in epoch milliseconds; injected for deterministic expiry. */
  clock: () => number;
  /** CSPRNG bytes for the adapter's opaque path ids. */
  randomBytes: (n: number) => Uint8Array;
  /** Re-authenticate this many seconds before the lease actually expires. */
  expirySkewSeconds: number;
  /** Permit http ONLY for loopback hosts — local integration only. */
  allowInsecureLoopback?: boolean;
}

/** The runtime is available: a writable secret manager plus a cache-clear hook. */
export interface OpenBaoRuntimeAvailable {
  readonly available: true;
  readonly secretManager: WritableSecretManager;
  /**
   * Drop the cached AppRole token IMMEDIATELY. The next KV request performs a
   * fresh AppRole login. Exposes nothing about the token itself.
   */
  clearAuthenticationCache(): void;
}

/** The runtime is not available. Carries a fixed reason, never a secret. */
export interface OpenBaoRuntimeUnavailable {
  readonly available: false;
  readonly reason: "DISABLED";
}

export type OpenBaoRuntimeComposition = OpenBaoRuntimeAvailable | OpenBaoRuntimeUnavailable;

/** Fail closed with a fixed, secret-free error. */
function assertConfig(condition: unknown): asserts condition {
  if (!condition) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
}

/**
 * Compose the OpenBao runtime, or report it unavailable — fail-closed either way.
 *
 * Disabled (`enabled !== true`) returns immediately: no provider function is
 * called, no request is made, and no fallback backend is constructed. Enabled
 * validates every field, builds ONE AppRole token provider, injects its
 * `getToken` into the KV2 adapter, and returns only the secret manager and the
 * cache-clear hook.
 */
export function createOpenBaoRuntimeComposition(config: OpenBaoRuntimeConfig): OpenBaoRuntimeComposition {
  // Opt-in is explicit: only the literal `true` composes. Missing/invalid
  // `enabled` is treated as disabled — the safe state — never as a reason to
  // fall back to some other credential source.
  if (config?.enabled !== true) {
    return { available: false, reason: "DISABLED" };
  }

  // Enabled: validate the shape before touching anything. AppRole credentials
  // must be async functions — a plain string here fails closed.
  assertConfig(typeof config.endpoint === "string" && config.endpoint.length > 0);
  assertConfig(typeof config.mountPath === "string" && config.mountPath.length > 0);
  assertConfig(typeof config.pathPrefix === "string" && config.pathPrefix.length > 0);
  assertConfig(typeof config.authMount === "string" && config.authMount.length > 0);
  assertConfig(typeof config.roleIdProvider === "function");
  assertConfig(typeof config.secretIdProvider === "function");
  assertConfig(typeof config.fetchImpl === "function");
  assertConfig(typeof config.clock === "function");
  assertConfig(typeof config.randomBytes === "function");
  assertConfig(Number.isFinite(config.expirySkewSeconds) && config.expirySkewSeconds >= 0);
  assertConfig(config.allowInsecureLoopback === undefined || typeof config.allowInsecureLoopback === "boolean");

  // One token provider for the whole runtime, so a single AppRole login is
  // shared across every KV request until the lease expires. Endpoint scheme and
  // mount/prefix format are validated inside these factories, which throw the
  // same fixed error on a bad value.
  const tokenProvider = createOpenBaoAppRoleTokenProvider({
    endpoint: config.endpoint,
    authMount: config.authMount,
    roleIdProvider: config.roleIdProvider,
    secretIdProvider: config.secretIdProvider,
    fetchImpl: config.fetchImpl,
    clock: config.clock,
    expirySkewSeconds: config.expirySkewSeconds,
    allowInsecureLoopback: config.allowInsecureLoopback,
  });

  const secretManager = createOpenBaoSecretManager({
    endpoint: config.endpoint,
    mountPath: config.mountPath,
    pathPrefix: config.pathPrefix,
    // The adapter calls this per request; the provider serves a cached token
    // until expiry, then re-authenticates. `getToken` is a closure, so a bare
    // reference keeps working without `this`.
    tokenProvider: tokenProvider.getToken,
    fetchImpl: config.fetchImpl,
    randomBytes: config.randomBytes,
    allowInsecureLoopback: config.allowInsecureLoopback,
  });

  return {
    available: true,
    secretManager,
    clearAuthenticationCache(): void {
      tokenProvider.clear();
    },
  };
}
