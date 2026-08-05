// PHASE 94 — server-only resolution of the WRITABLE secret backend from the
// deployment environment, plus the read-only bridge the envelope verifier uses.
//
// This is the one place the (already-built, previously-unwired) OpenBao runtime
// composition is turned into something the OT service bundle can consume. It is
// deliberately FAIL-CLOSED and DISABLED BY DEFAULT:
//
//   - Unless `OT_SECRET_BACKEND` is exactly "openbao", the backend is disabled:
//     `manager` is null, no configuration is read, and NOT ONE network request
//     or credential read is performed. Existing behaviour (env-backed shared
//     signing keys) is preserved untouched.
//   - When enabled but under-configured, resolution THROWS. It never silently
//     degrades to PostgreSQL, an env HMAC key, an in-memory store or anonymous
//     access — the caller's readiness fails instead, which is the safe state.
//
// CONNECTIVITY: OpenBao is loopback-only on a separate host and there is no
// configured private transport from the application server to it (see the Phase
// 94 connectivity decision doc). Shipping this module DISABLED changes nothing
// at runtime; enabling it is an owner deployment decision that also requires a
// private transport (WireGuard/mTLS) and the AppRole credential files below.

import { randomBytes as nodeRandomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createOpenBaoRuntimeComposition,
  type OpenBaoRuntimeComposition,
} from "./openbao-runtime-composition";
import {
  SecretManagerError,
  type SecretReference,
  type WritableSecretManager,
} from "./secret-manager";
import type { SecretProvider } from "./envelope-signature";

// Server-only. Composing machine credentials must never reach a client bundle;
// importing this in a browser throws at load. The message names the module only.
if (typeof window !== "undefined") {
  throw new Error("secret-backend is server-only and must not be imported by client code");
}

export interface ResolvedSecretBackend {
  /** The writable manager, or null when the backend is disabled/unavailable. */
  readonly manager: WritableSecretManager | null;
}

function trimmedEnv(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Read an AppRole credential from a file at LOGIN time (not at import time), so
 * a role/secret id never sits in the process environment or a config literal.
 * A missing/empty file fails closed: the read throws, the AppRole login fails,
 * and no envelope can be verified against the writable backend.
 */
function fileReader(path: string): () => Promise<string> {
  return async () => {
    const raw = await readFile(path, "utf8");
    const value = raw.trim();
    if (!value) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    return value;
  };
}

/**
 * Resolve the OpenBao runtime composition from the environment.
 *
 * Disabled unless `OT_SECRET_BACKEND === "openbao"`. Enabled-but-invalid throws
 * a fixed, secret-free error (fail closed). Exported for tests; production goes
 * through the memoised `getSecretBackend`.
 */
export function resolveSecretBackendComposition(): OpenBaoRuntimeComposition {
  if (trimmedEnv("OT_SECRET_BACKEND") !== "openbao") {
    return { available: false, reason: "DISABLED" };
  }

  const endpoint = trimmedEnv("OPENBAO_ENDPOINT");
  const mountPath = trimmedEnv("OPENBAO_KV_MOUNT");
  const pathPrefix = trimmedEnv("OPENBAO_KV_PREFIX");
  const authMount = trimmedEnv("OPENBAO_APPROLE_MOUNT");
  const roleIdFile = trimmedEnv("OPENBAO_APPROLE_ROLE_ID_FILE");
  const secretIdFile = trimmedEnv("OPENBAO_APPROLE_SECRET_ID_FILE");

  // Enabled but under-configured FAILS CLOSED — never a fallback backend.
  if (!endpoint || !mountPath || !pathPrefix || !authMount || !roleIdFile || !secretIdFile) {
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }

  const skewRaw = trimmedEnv("OPENBAO_EXPIRY_SKEW_SECONDS");
  const expirySkewSeconds = skewRaw === null ? 30 : Number(skewRaw);
  if (!Number.isFinite(expirySkewSeconds) || expirySkewSeconds < 0) {
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }

  return createOpenBaoRuntimeComposition({
    enabled: true,
    endpoint,
    mountPath,
    pathPrefix,
    authMount,
    roleIdProvider: fileReader(roleIdFile),
    secretIdProvider: fileReader(secretIdFile),
    fetchImpl: fetch,
    clock: () => Date.now(),
    randomBytes: (n) => new Uint8Array(nodeRandomBytes(n)),
    expirySkewSeconds,
    // http is permitted ONLY for an explicit loopback lab; production is TLS.
    allowInsecureLoopback: trimmedEnv("OPENBAO_ALLOW_INSECURE_LOOPBACK") === "1",
  });
}

let cached: ResolvedSecretBackend | null = null;
let override: ResolvedSecretBackend | null = null;

/** Test seam: install a backend (e.g. an in-memory manager) or clear it. */
export function __setSecretBackendForTests(backend: ResolvedSecretBackend | null): void {
  override = backend;
  cached = null;
}

/**
 * The resolved backend for this process. Memoised: disabled resolves once to a
 * null manager and never touches the environment again; enabled builds one
 * runtime composition (the AppRole login itself is lazy, inside the manager).
 */
export function getSecretBackend(): ResolvedSecretBackend {
  if (override) return override;
  if (cached) return cached;
  const composition = resolveSecretBackendComposition();
  cached = { manager: composition.available ? composition.secretManager : null };
  return cached;
}

/**
 * Adapt a WritableSecretManager into the read-only SecretProvider the envelope
 * verifier consumes.
 *
 * The manager stores raw secret BYTES; the verifier and the gateway both use the
 * base64url encoding of those bytes as the HMAC key string, so this returns
 * exactly that. A revoked or missing reference resolves to null, which the
 * verifier maps to a single generic authorization failure — never a distinct
 * "revoked" vs "unknown" signal a prober could use.
 */
export function writableSecretProvider(manager: WritableSecretManager): SecretProvider {
  return {
    async resolve(signingKeyRef: string): Promise<string | null> {
      try {
        const bytes = await manager.resolve(signingKeyRef as SecretReference);
        return Buffer.from(bytes).toString("base64url");
      } catch {
        // REFERENCE_NOT_FOUND / SECRET_REVOKED / transport error → deny.
        return null;
      }
    },
  };
}

/**
 * The provider the envelope route uses.
 *
 * With no writable manager (backend disabled) this returns the env provider
 * unchanged, so the legacy shared-key path behaves exactly as before. With a
 * manager, env-backed `env:` references keep resolving through the env provider
 * and every other reference resolves through the writable manager. Order is
 * deterministic and neither path logs or returns anything but a secret or null.
 */
export function composeSecretProvider(
  env: SecretProvider,
  manager: WritableSecretManager | null,
): SecretProvider {
  if (!manager) return env;
  const writable = writableSecretProvider(manager);
  return {
    async resolve(signingKeyRef: string): Promise<string | null> {
      const fromEnv = await env.resolve(signingKeyRef);
      if (fromEnv) return fromEnv;
      return writable.resolve(signingKeyRef);
    },
  };
}
