import { promises as fs } from "fs";
import path from "path";
import { getDocumentStorageProvider, getLocalDocumentStorageDir } from "./config";
import type { DocumentStorageProvider } from "./types";

/**
 * Object storage abstraction (Phase 16A).
 *
 * Target architecture (per the Phase 16 audit): metadata in PostgreSQL,
 * vectors in pgvector, raw files in MinIO/S3-compatible object storage.
 * This module is the seam — one interface, three providers selected by
 * `getDocumentStorageProvider()`. Nothing in the app calls this yet (no
 * upload route exists — Phase 16B).
 *
 * Why "local" is real but "minio"/"s3" are not: every other provider
 * abstraction in this codebase (AI, embeddings) safely degrades to a MOCK
 * substitute when the real backend is unavailable, because a mock chat
 * completion or a mock embedding is still a structurally valid, harmless
 * stand-in. There is no equivalent safe substitute for "store this file" —
 * a store that silently pretends to save a file it didn't save is a worse
 * failure (silent data loss) than a loud, immediate error. So `minio`/`s3`
 * (no SDK installed, Phase 16B) throw a clear, descriptive error the
 * moment a method is actually invoked, rather than degrading. "local" has
 * no such gap: it's a real, working implementation using Node's built-in
 * `fs` — no package install required — so it never needs to degrade.
 */

export interface ObjectPutInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}

export interface ObjectPutResult {
  key: string;
  sizeBytes: number;
}

export interface ObjectStorage {
  provider: DocumentStorageProvider;
  put(input: ObjectPutInput): Promise<ObjectPutResult>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/**
 * Strips any path-traversal/absolute-path component from a caller-supplied
 * key before it ever reaches the filesystem. Object storage keys must
 * always be server-generated (never derived from a client filename — see
 * the Phase 16 audit's security findings), but this is a second,
 * independent guard: even a server-side bug that lets a stray `../` or a
 * leading `/` through cannot escape the storage root.
 */
function sanitizeKey(key: string): string {
  const normalized = key.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((p) => p.length > 0 && p !== "." && p !== "..");
  return parts.join("/");
}

function createLocalObjectStorage(): ObjectStorage {
  function resolvePath(key: string): string {
    const root = path.resolve(process.cwd(), getLocalDocumentStorageDir());
    return path.join(root, sanitizeKey(key));
  }

  return {
    provider: "local",
    async put({ key, body }): Promise<ObjectPutResult> {
      const filePath = resolvePath(key);
      const buf = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buf);
      return { key: sanitizeKey(key), sizeBytes: buf.length };
    },
    async get(key): Promise<Buffer | null> {
      try {
        return await fs.readFile(resolvePath(key));
      } catch {
        return null; // missing file is a normal, expected outcome — not an error
      }
    },
    async delete(key): Promise<void> {
      try {
        await fs.unlink(resolvePath(key));
      } catch {
        /* already gone, or never existed — delete is idempotent */
      }
    },
    async exists(key): Promise<boolean> {
      try {
        await fs.access(resolvePath(key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Architecture-only provider for "minio" and "s3" — no SDK installed in
 * Phase 16A. Every method REJECTS (not throws synchronously) only when
 * actually called — each is `async` specifically so the error surfaces as
 * a rejected promise, matching the `ObjectStorage` interface's contract
 * exactly, the same way a real network failure from an actual SDK call
 * would. Constructing the store (`getDocumentObjectStorage()`) never
 * throws or rejects, so code that merely resolves a provider reference
 * (e.g. to read `.provider` for display) is unaffected.
 */
function createUnimplementedObjectStorage(provider: "minio" | "s3"): ObjectStorage {
  const fail = (op: string): never => {
    throw new Error(
      `Document storage provider "${provider}" is not yet implemented (Phase 16B) — attempted ${op}(). ` +
        `Set HERMES_DOCUMENT_STORAGE_PROVIDER=local for a working store today.`
    );
  };
  return {
    provider,
    put: async () => fail("put"),
    get: async () => fail("get"),
    delete: async () => fail("delete"),
    exists: async () => fail("exists"),
  };
}

/**
 * Resolves the configured provider. Does NOT silently fall back to
 * "local" when "minio"/"s3" is selected but unimplemented — an operator
 * who explicitly configured S3 for a Cloud SaaS deployment must see a
 * loud failure, not have their files quietly written to local disk.
 */
export function getDocumentObjectStorage(): ObjectStorage {
  const provider = getDocumentStorageProvider();
  if (provider === "local") return createLocalObjectStorage();
  return createUnimplementedObjectStorage(provider);
}
