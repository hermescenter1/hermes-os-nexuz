// PHASE 94D0C — an OpenBao (Vault KV v2) adapter for the WritableSecretManager
// contract from 94D0A.
//
// Structurally a sibling of the OVH adapter, differing where the OpenBao API
// does: it authenticates with `X-Vault-Token`, its paths are `/v1/{mount}/...`,
// it rotates with a JSON merge-patch, and it distinguishes a revoked latest
// version from a never-existent path by reading the METADATA endpoint after a
// data-read 404 (OpenBao returns 404 on a soft-deleted read without version
// metadata in the body, so the version state must be read separately).
//
// It is NOT wired into production composition and reads no process.env — every
// dependency is injected, so it is fully testable with a mock fetch. The strict
// base64url helper is intentionally self-contained rather than imported, to
// avoid changing the OVH adapter's surface.
//
// SECURITY POSTURE (identical intent to the OVH adapter)
//   - native fetch only; token requested per-request, never cached/logged;
//   - secret bytes appear only inside a request `data.value`, base64url; resolve
//     returns a fresh Uint8Array and never mutates the caller's buffer;
//   - references are opaque `bao:v1:{csprng}` with a traversal-proof charset;
//   - https required, except an explicit loopback lab mode; every request URL
//     is asserted to stay on the configured origin;
//   - malformed responses FAIL CLOSED; no upstream body reaches an error.

import {
  SecretManagerError,
  type SecretBytes,
  type SecretMetadata,
  type SecretReference,
  type WritableSecretManager,
} from "./secret-manager";

export interface OpenBaoSecretManagerConfig {
  /** Base address, e.g. `https://bao.internal:8200` or `http://127.0.0.1:8200`. */
  endpoint: string;
  /** KV v2 mount, e.g. `hermes-lab`. */
  mountPath: string;
  /** Path namespace under the mount. */
  pathPrefix: string;
  /** Fresh token per request; never cached by the adapter. */
  tokenProvider: () => Promise<string>;
  fetchImpl: typeof fetch;
  /** CSPRNG bytes for the opaque path id. */
  randomBytes: (n: number) => Uint8Array;
  /** Permit http ONLY for 127.0.0.1/localhost/[::1] — for local integration. */
  allowInsecureLoopback?: boolean;
}

const REFERENCE_PREFIX = "bao:v1:";
const PATH_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_/-]{0,127}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
/** The single key under which secret bytes live inside the KV2 `data` object. */
const SECRET_KEY = "value";

/* ── strict base64url ───────────────────────────────────────────────────── */

const encodeBytes = (bytes: SecretBytes): string => Buffer.from(bytes).toString("base64url");

function decodeBytes(encoded: unknown): Uint8Array {
  if (typeof encoded !== "string" || !BASE64URL_PATTERN.test(encoded)) {
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }
  const buffer = Buffer.from(encoded, "base64url");
  if (buffer.toString("base64url") !== encoded) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  return new Uint8Array(buffer);
}

/* ── Adapter ────────────────────────────────────────────────────────────── */

export function createOpenBaoSecretManager(config: OpenBaoSecretManagerConfig): WritableSecretManager {
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
  const mount = config.mountPath.replace(/^\/+|\/+$/g, "");
  const prefix = config.pathPrefix.replace(/^\/+|\/+$/g, "");
  for (const segment of [mount, prefix]) {
    if (!SEGMENT_PATTERN.test(segment) || segment.includes("..")) {
      throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    }
  }

  function urlFor(kind: "data" | "metadata", pathId: string): string {
    const built = `${origin}/v1/${mount}/${kind}/${prefix}/${pathId}`;
    if (new URL(built).origin !== origin) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    return built;
  }

  function pathIdOf(reference: SecretReference): string {
    if (typeof reference !== "string" || !reference.startsWith(REFERENCE_PREFIX)) {
      throw new SecretManagerError("REFERENCE_NOT_FOUND");
    }
    const pathId = reference.slice(REFERENCE_PREFIX.length);
    if (!PATH_ID_PATTERN.test(pathId)) throw new SecretManagerError("REFERENCE_NOT_FOUND");
    return pathId;
  }

  async function headers(contentType?: string): Promise<Record<string, string>> {
    const token = await config.tokenProvider(); // per-request, never cached
    const h: Record<string, string> = { "X-Vault-Token": token, Accept: "application/json" };
    if (contentType) h["Content-Type"] = contentType;
    return h;
  }

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

  /** KV2 write response `data`: `{ version, created_time }`. */
  function writeMeta(reference: SecretReference, body: Record<string, unknown> | null, rotated: boolean): SecretMetadata {
    const data = body?.data as Record<string, unknown> | undefined;
    const version = typeof data?.version === "number" ? data.version : NaN;
    const createdTime = typeof data?.created_time === "string" ? data.created_time : "";
    if (!Number.isInteger(version) || version < 1 || !createdTime) {
      throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    }
    return { reference, version, createdAt: createdTime, rotatedAt: rotated ? createdTime : null, revokedAt: null };
  }

  /** Read the metadata endpoint and describe the CURRENT version's state. */
  async function metadataState(
    pathId: string,
  ): Promise<{ kind: "revoked"; version: number; createdAt: string; revokedAt: string } | { kind: "absent" }> {
    const response = await send(urlFor("metadata", pathId), { method: "GET", headers: await headers() });
    if (response.status === 404) return { kind: "absent" };
    if (response.status >= 500 || !response.ok) throw new SecretManagerError("PROVIDER_UNAVAILABLE");

    const body = await parseBody(response);
    const data = body?.data as Record<string, unknown> | undefined;
    const current = typeof data?.current_version === "number" ? data.current_version : NaN;
    const versions = data?.versions as Record<string, Record<string, unknown>> | undefined;
    if (!Number.isInteger(current) || !versions) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    const version = versions[String(current)];
    if (!version) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    const deletionTime = typeof version.deletion_time === "string" ? version.deletion_time : "";
    const createdAt = typeof version.created_time === "string" ? version.created_time : "";
    if (version.destroyed === true) return { kind: "absent" };
    if (deletionTime) return { kind: "revoked", version: current, createdAt, revokedAt: deletionTime };
    // Metadata says the current version is live but the data read 404'd — an
    // inconsistent state; fail closed rather than guess.
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
        headers: await headers("application/json"),
        body: JSON.stringify({ data: { [SECRET_KEY]: encodeBytes(secret) }, options: { cas: 0 } }),
      });
      if (response.status === 400) throw new SecretManagerError("VERSION_CONFLICT");
      if (!response.ok) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
      return writeMeta(reference, await parseBody(response), false);
    },

    async resolve(reference: SecretReference): Promise<SecretBytes> {
      const pathId = pathIdOf(reference);
      const response = await send(urlFor("data", pathId), { method: "GET", headers: await headers() });
      if (response.status >= 500) throw new SecretManagerError("PROVIDER_UNAVAILABLE");

      if (response.ok) {
        const body = await parseBody(response);
        const data = body?.data as Record<string, unknown> | undefined;
        const metadata = data?.metadata as Record<string, unknown> | undefined;
        const inner = data?.data as Record<string, unknown> | null | undefined;
        const deletionTime = typeof metadata?.deletion_time === "string" ? metadata.deletion_time : "";
        if (metadata?.destroyed === true) throw new SecretManagerError("REFERENCE_NOT_FOUND");
        if (deletionTime) throw new SecretManagerError("SECRET_REVOKED");
        if (inner && typeof inner === "object") {
          return decodeBytes((inner as Record<string, unknown>)[SECRET_KEY]);
        }
        throw new SecretManagerError("PROVIDER_UNAVAILABLE");
      }
      if (response.status === 404) {
        // Distinguish a soft-deleted (revoked) latest from a path that never
        // existed by consulting the metadata endpoint.
        const state = await metadataState(pathId);
        throw new SecretManagerError(state.kind === "revoked" ? "SECRET_REVOKED" : "REFERENCE_NOT_FOUND");
      }
      throw new SecretManagerError("PROVIDER_UNAVAILABLE");
    },

    async rotate(reference: SecretReference, expectedVersion: number, next: SecretBytes): Promise<SecretMetadata> {
      const pathId = pathIdOf(reference);
      const response = await send(urlFor("data", pathId), {
        method: "PATCH",
        headers: await headers("application/merge-patch+json"),
        body: JSON.stringify({ data: { [SECRET_KEY]: encodeBytes(next) }, options: { cas: expectedVersion } }),
      });
      if (response.status === 400) throw new SecretManagerError("VERSION_CONFLICT");
      if (response.status === 404) throw new SecretManagerError("REFERENCE_NOT_FOUND");
      if (!response.ok) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
      return writeMeta(reference, await parseBody(response), true);
    },

    async revoke(reference: SecretReference): Promise<SecretMetadata> {
      const pathId = pathIdOf(reference);
      const response = await send(urlFor("data", pathId), { method: "DELETE", headers: await headers() });
      if (response.status === 404) throw new SecretManagerError("REFERENCE_NOT_FOUND");
      if (!response.ok && response.status !== 204) throw new SecretManagerError("PROVIDER_UNAVAILABLE");

      const state = await metadataState(pathId);
      if (state.kind === "revoked") {
        return { reference, version: state.version, createdAt: state.createdAt, rotatedAt: null, revokedAt: state.revokedAt };
      }
      throw new SecretManagerError("REFERENCE_NOT_FOUND");
    },

    async delete(reference: SecretReference): Promise<void> {
      const pathId = pathIdOf(reference);
      const response = await send(urlFor("metadata", pathId), { method: "DELETE", headers: await headers() });
      if (response.status === 404 || response.ok || response.status === 204) return;
      throw new SecretManagerError("CLEANUP_FAILED");
    },
  };

  return manager;
}
