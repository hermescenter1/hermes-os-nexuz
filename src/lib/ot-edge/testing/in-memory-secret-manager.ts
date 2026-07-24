// PHASE 94D0A — an in-memory WritableSecretManager, FOR TESTS ONLY.
//
// This exercises the writable contract without any external system. It is NOT a
// production secret store: a process restart loses everything, and there is no
// encryption at rest. Two guards keep it out of production:
//   1. its factory throws when NODE_ENV === "production";
//   2. it lives under `testing/` and is wired into no application composition.
//
// It is the reference behaviour a real adapter (Vault/AWS/…) must match, and
// the substrate the contract's tests run against.

import { randomBytes } from "node:crypto";
import {
  SecretManagerError,
  isWritableSecretManager,
  type SecretBytes,
  type SecretMetadata,
  type SecretReference,
  type WritableSecretManager,
} from "../secret-manager";

interface Entry {
  bytes: Uint8Array | null;
  version: number;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
}

const metaOf = (reference: SecretReference, entry: Entry): SecretMetadata => ({
  reference,
  version: entry.version,
  createdAt: entry.createdAt,
  rotatedAt: entry.rotatedAt,
  revokedAt: entry.revokedAt,
});

/** Copy bytes on the way in and out, so a caller can never mutate the store. */
const copy = (bytes: SecretBytes): Uint8Array => Uint8Array.from(bytes);

/** Zero a buffer before dropping it — defence, not a guarantee under a GC. */
function wipe(bytes: Uint8Array | null): void {
  if (bytes) bytes.fill(0);
}

export function createInMemorySecretManager(now: () => string = () => new Date().toISOString()): WritableSecretManager {
  // Hard production guard. A test-only store must never be selectable at runtime.
  if (process.env.NODE_ENV === "production") {
    throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  }

  const store = new Map<string, Entry>();

  const manager: WritableSecretManager = {
    writable: true,

    async create(secret: SecretBytes): Promise<SecretMetadata> {
      // Opaque reference: 16 CSPRNG bytes, base64url. Carries no secret.
      const reference = randomBytes(16).toString("base64url") as SecretReference;
      const entry: Entry = { bytes: copy(secret), version: 1, createdAt: now(), rotatedAt: null, revokedAt: null };
      store.set(reference, entry);
      return metaOf(reference, entry);
    },

    async resolve(reference: SecretReference): Promise<SecretBytes> {
      const entry = store.get(reference);
      if (!entry) throw new SecretManagerError("REFERENCE_NOT_FOUND");
      if (entry.revokedAt || !entry.bytes) throw new SecretManagerError("SECRET_REVOKED");
      return copy(entry.bytes);
    },

    async rotate(reference: SecretReference, expectedVersion: number, next: SecretBytes): Promise<SecretMetadata> {
      const entry = store.get(reference);
      if (!entry) throw new SecretManagerError("REFERENCE_NOT_FOUND");
      if (entry.revokedAt) throw new SecretManagerError("SECRET_REVOKED");
      // Compare-and-swap, done synchronously with no await between the read and
      // the write, so two concurrent rotations from the same expected version
      // cannot both succeed — the second sees the bumped version and conflicts.
      if (entry.version !== expectedVersion) throw new SecretManagerError("VERSION_CONFLICT");
      wipe(entry.bytes);
      entry.bytes = copy(next);
      entry.version += 1;
      entry.rotatedAt = now();
      return metaOf(reference, entry);
    },

    async revoke(reference: SecretReference): Promise<SecretMetadata> {
      const entry = store.get(reference);
      if (!entry) throw new SecretManagerError("REFERENCE_NOT_FOUND");
      wipe(entry.bytes);
      entry.bytes = null;
      entry.revokedAt = entry.revokedAt ?? now();
      return metaOf(reference, entry);
    },

    async delete(reference: SecretReference): Promise<void> {
      // Idempotent: deleting an absent reference is a no-op, so cleanup can be
      // retried safely without a spurious CLEANUP_FAILED.
      const entry = store.get(reference);
      if (entry) wipe(entry.bytes);
      store.delete(reference);
    },
  };

  // Fail fast if the shape ever drifts from the capability contract.
  if (!isWritableSecretManager(manager)) throw new SecretManagerError("PROVIDER_UNAVAILABLE");
  return manager;
}
