// PHASE 94D0B — an OVHcloud KMS (okms) adapter for the WritableSecretManager
// contract from 94D0A.
//
// This talks to OVH's KV2-compatible secret API. It is NOT wired into
// production composition and reads no process.env — every dependency (endpoint,
// okmsId, path prefix, token provider, fetch, CSPRNG) is injected, so it is
// fully testable with a mock fetch and cannot reach a real host in a test.
//
// SECURITY POSTURE
//   - native fetch only, no new dependency;
//   - the bearer token is requested immediately before each request and never
//     cached, never logged, never placed in an error;
//   - secret bytes appear ONLY inside a request `data` body, base64url-encoded,
//     and a fresh Uint8Array is returned from resolve — the caller's buffer is
//     never mutated;
//   - references are opaque `ovhkms:v1:{csprngPathId}` tokens: the path id is
//     CSPRNG-generated, contains no secret, and is charset-validated on every
//     use so a crafted reference cannot traverse paths or change hosts;
//   - the endpoint is validated to be an `https://*.okms.ovh.net` origin and
//     every request URL is asserted to stay on that origin;
//   - malformed API responses FAIL CLOSED (PROVIDER_UNAVAILABLE), and no
//     upstream response body ever reaches an error.

import {
  SecretManagerError,
  type SecretBytes,
  type SecretMetadata,
  type SecretReference,
  type WritableSecretManager,
} from "./secret-manager";

/** Everything the adapter needs, injected — nothing is read from the environment. */
export interface OvhSecretManagerConfig {
  /** Regional endpoint, e.g. `https://eu-west-rbx.okms.ovh.net`. */
  endpoint: string;
  /** The okms service id (path segment `/api/{okmsId}/...`). */
  okmsId: string;
  /** Path namespace under which this deployment stores secrets. */
  pathPrefix: string;
  /** Returns a fresh bearer token per request. Never cached by the adapter. */
  tokenProvider: () => Promise<string>;
  /** Injected fetch — the real one in production, a mock in tests. */
  fetchImpl: typeof fetch;
  /** CSPRNG bytes for the opaque path id. Injected for determinism in tests. */
  randomBytes: (n: number) => Uint8Array;
}

const REFERENCE_PREFIX = "ovhkms:v1:";
/** The path id is a base64url token: no `/`, `.` or `%`, so it is traversal-proof. */
const PATH_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const OKMS_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const PATH_PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_/-]{0,127}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;
/** The single key under which secret bytes live inside the KV2 `data` object. */
const SECRET_KEY = "b";

/* ── base64url, strict ──────────────────────────────────────────────────── */

const encodeBytes = (bytes: SecretBytes): string => Buffer.from(bytes).toString("base64url");

/** Decode, refusing anything that is not canonical base64url. Fails closed. */
function decodeBytes(encoded: unknown): Uint8Array {
  if (typeof encoded !== "string" || !BASE64URL_PATTERN.test(encoded)) {
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }
  const buffer = Buffer.from(encoded, "base64url");
  // Round-trip check: a non-canonical encoding would decode but not re-encode
  // to itself, so we reject it rather than trust a lenient decoder.
  if (buffer.toString("base64url") !== encoded) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  return new Uint8Array(buffer);
}

/* ── Adapter ────────────────────────────────────────────────────────────── */

export function createOvhSecretManager(config: OvhSecretManagerConfig): WritableSecretManager {
  // Validate configuration at construction — an arbitrary or non-OVH endpoint
  // is rejected here, before any request can be built.
  let origin: string;
  try {
    const url = new URL(config.endpoint);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".okms.ovh.net")) {
      throw new Error("endpoint");
    }
    origin = url.origin;
  } catch {
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }
  if (!OKMS_ID_PATTERN.test(config.okmsId)) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  const prefix = config.pathPrefix.replace(/^\/+|\/+$/g, "");
  if (!PATH_PREFIX_PATTERN.test(prefix) || prefix.includes("..")) {
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }

  /** Build a request URL and assert it never leaves the configured origin. */
  function urlFor(kind: "data" | "metadata", pathId: string): string {
    const built = `${origin}/api/${encodeURIComponent(config.okmsId)}/v1/secret/${kind}/${prefix}/${pathId}`;
    if (new URL(built).origin !== origin) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    return built;
  }

  /** Extract the CSPRNG path id from a reference, rejecting anything else. */
  function pathIdOf(reference: SecretReference): string {
    if (typeof reference !== "string" || !reference.startsWith(REFERENCE_PREFIX)) {
      throw new SecretManagerError("REFERENCE_NOT_FOUND");
    }
    const pathId = reference.slice(REFERENCE_PREFIX.length);
    if (!PATH_ID_PATTERN.test(pathId)) throw new SecretManagerError("REFERENCE_NOT_FOUND");
    return pathId;
  }

  async function authHeaders(json: boolean): Promise<Record<string, string>> {
    // Requested per request, never cached.
    const token = await config.tokenProvider();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  /** Any transport failure is provider-unavailable; the reason never leaks. */
  async function send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await config.fetchImpl(url, init);
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

  /** The KV2 write response `data`: `{ version, created_time }`. */
  function writeMeta(reference: SecretReference, body: Record<string, unknown> | null, rotated: boolean): SecretMetadata {
    const data = body?.data as Record<string, unknown> | undefined;
    const version = typeof data?.version === "number" ? data.version : NaN;
    const createdTime = typeof data?.created_time === "string" ? data.created_time : "";
    if (!Number.isInteger(version) || version < 1 || !createdTime) {
      throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    }
    return {
      reference,
      version,
      createdAt: createdTime,
      // On rotate the server's authoritative timestamp is the new version's
      // created_time; the consumer keeps the original createdAt of record.
      rotatedAt: rotated ? createdTime : null,
      revokedAt: null,
    };
  }

  type State =
    | { kind: "active"; bytes: Uint8Array; version: number; createdAt: string }
    | { kind: "revoked"; version: number; createdAt: string; revokedAt: string }
    | { kind: "absent" };

  /**
   * Read the current state of a secret from the KV2 data endpoint.
   *
   * KV2 returns the version metadata even when the latest version is soft-
   * deleted (a non-empty `deletion_time`), which is how "revoked" is told apart
   * from "never existed". Only documented KV2 fields are read; anything else
   * fails closed.
   */
  async function fetchState(pathId: string): Promise<State> {
    const response = await send(urlFor("data", pathId), { method: "GET", headers: await authHeaders(false) });
    if (response.status >= 500) throw new SecretManagerError("PROVIDER_UNAVAILABLE");

    const body = await parseBody(response);
    const data = body?.data as Record<string, unknown> | undefined;
    const metadata = data?.metadata as Record<string, unknown> | undefined;
    const inner = data?.data as Record<string, unknown> | null | undefined;

    // A genuine 404 with no usable metadata: the path never existed.
    if (response.status === 404 && !metadata) return { kind: "absent" };

    if (metadata) {
      const version = typeof metadata.version === "number" ? metadata.version : NaN;
      const createdAt = typeof metadata.created_time === "string" ? metadata.created_time : "";
      const deletionTime = typeof metadata.deletion_time === "string" ? metadata.deletion_time : "";
      const destroyed = metadata.destroyed === true;
      if (!Number.isInteger(version) || !createdAt) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
      if (destroyed) return { kind: "absent" };
      if (deletionTime) return { kind: "revoked", version, createdAt, revokedAt: deletionTime };
      if (response.ok && inner && typeof inner === "object") {
        return { kind: "active", bytes: decodeBytes((inner as Record<string, unknown>)[SECRET_KEY]), version, createdAt };
      }
    }
    // Anything else — an unexpected shape — fails closed.
    if (response.status === 404) return { kind: "absent" };
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }

  const manager: WritableSecretManager = {
    writable: true,

    async create(secret: SecretBytes): Promise<SecretMetadata> {
      const pathId = Buffer.from(config.randomBytes(18)).toString("base64url");
      if (!PATH_ID_PATTERN.test(pathId)) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
      const reference = (REFERENCE_PREFIX + pathId) as SecretReference;

      const response = await send(urlFor("data", pathId), {
        method: "POST",
        headers: await authHeaders(true),
        // cas: 0 — succeed only if this path has no existing version.
        body: JSON.stringify({ data: { [SECRET_KEY]: encodeBytes(secret) }, options: { cas: 0 } }),
      });
      if (response.status === 400) throw new SecretManagerError("VERSION_CONFLICT");
      if (!response.ok) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
      return writeMeta(reference, await parseBody(response), false);
    },

    async resolve(reference: SecretReference): Promise<SecretBytes> {
      const state = await fetchState(pathIdOf(reference));
      if (state.kind === "active") return state.bytes;
      if (state.kind === "revoked") throw new SecretManagerError("SECRET_REVOKED");
      throw new SecretManagerError("REFERENCE_NOT_FOUND");
    },

    async rotate(reference: SecretReference, expectedVersion: number, next: SecretBytes): Promise<SecretMetadata> {
      const pathId = pathIdOf(reference);
      const response = await send(urlFor("data", pathId), {
        method: "PATCH",
        headers: await authHeaders(true),
        // cas: expectedVersion — a stale expectation is a 400 → VERSION_CONFLICT.
        body: JSON.stringify({ data: { [SECRET_KEY]: encodeBytes(next) }, options: { cas: expectedVersion } }),
      });
      if (response.status === 400) throw new SecretManagerError("VERSION_CONFLICT");
      if (response.status === 404) throw new SecretManagerError("REFERENCE_NOT_FOUND");
      if (!response.ok) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
      return writeMeta(reference, await parseBody(response), true);
    },

    async revoke(reference: SecretReference): Promise<SecretMetadata> {
      const pathId = pathIdOf(reference);
      // Soft-delete the latest version (deactivate it).
      const response = await send(urlFor("data", pathId), { method: "DELETE", headers: await authHeaders(false) });
      if (response.status === 404) throw new SecretManagerError("REFERENCE_NOT_FOUND");
      if (!response.ok && response.status !== 204) throw new SecretManagerError("PROVIDER_UNAVAILABLE");

      // Authoritative metadata from the server: the read now reports the
      // version as deactivated, which also proves resolve will refuse it.
      const state = await fetchState(pathId);
      if (state.kind === "revoked") {
        return { reference, version: state.version, createdAt: state.createdAt, rotatedAt: null, revokedAt: state.revokedAt };
      }
      if (state.kind === "absent") throw new SecretManagerError("REFERENCE_NOT_FOUND");
      // Still active after a delete is an impossible state — fail closed.
      throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    },

    async delete(reference: SecretReference): Promise<void> {
      const pathId = pathIdOf(reference);
      // Permanently remove all versions AND metadata.
      const response = await send(urlFor("metadata", pathId), { method: "DELETE", headers: await authHeaders(false) });
      // 404 is idempotent success — already gone, retry-safe.
      if (response.status === 404 || response.ok || response.status === 204) return;
      throw new SecretManagerError("CLEANUP_FAILED");
    },
  };

  return manager;
}
