import { MOCK_EMBEDDING_DIMENSIONS } from "@/lib/rag/config";
import type { DocumentStorageProvider } from "./types";

/**
 * Document Ingestion Foundation — configuration (Phase 16A).
 *
 * Mirrors the resolution pattern already used by
 * `src/lib/storage/storage-mode.ts`, `src/lib/ai/config.ts`, and
 * `src/lib/rag/config.ts`: an explicit env override, otherwise a safe
 * default.
 *
 *   HERMES_DOCUMENT_STORAGE_PROVIDER  = local | minio | s3   (default: local)
 *   HERMES_LOCAL_DOCUMENT_STORAGE_DIR = filesystem root for the "local"
 *                                        provider (default: "<cwd>/.data/documents")
 *
 * Phase 16A note: "minio"/"s3" are architecture only — no SDK is installed
 * (explicitly out of scope this phase). Selecting either resolves to a
 * store whose methods throw a clear, descriptive error ONLY when actually
 * invoked (see object-storage.ts for why this one abstraction, unlike
 * every AI/embedding provider in this codebase, does NOT silently degrade
 * to a substitute — a "mock" file store would mean silently NOT storing
 * the file, a worse failure than a loud, immediate error). Nothing calls
 * `object-storage.ts` yet in this phase, so this distinction has no
 * observable effect today.
 */

const VALID_PROVIDERS: DocumentStorageProvider[] = ["local", "minio", "s3"];

export function getDocumentStorageProvider(): DocumentStorageProvider {
  const override = process.env.HERMES_DOCUMENT_STORAGE_PROVIDER?.trim().toLowerCase();
  if (override && (VALID_PROVIDERS as string[]).includes(override)) {
    return override as DocumentStorageProvider;
  }
  return "local";
}

const DEFAULT_LOCAL_STORAGE_DIR = ".data/documents";

/** Filesystem root the "local" provider reads/writes under. Relative paths
 *  resolve against `process.cwd()`. Git-ignored by default (see
 *  .gitignore) so exercising this locally never risks committing files. */
export function getLocalDocumentStorageDir(): string {
  return process.env.HERMES_LOCAL_DOCUMENT_STORAGE_DIR?.trim() || DEFAULT_LOCAL_STORAGE_DIR;
}

/**
 * Forward-looking constant for the future upload API (Phase 16B). Not
 * enforced anywhere in this phase — no upload route exists yet — but
 * defined now so 16B's size-cap check has a single, reviewed source of
 * truth to import rather than inventing a number at upload-route time.
 */
export const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * Phase 16D — `DocumentTextChunk.embedding`'s fixed pgvector width.
 *
 * Aliased to `MOCK_EMBEDDING_DIMENSIONS` (not a new literal) because the
 * mock embedding provider is the ONLY one this phase actually runs ("do
 * not install OpenAI SDK yet" / "do not require live OpenAI") — there is
 * no other dimension a chunk embedding could legitimately have today.
 * Activating a real provider later requires a NEW migration to resize (or
 * replace) this column, exactly like `rag/config.ts`'s `PGVECTOR_DIMENSIONS`
 * already documents for the unrelated `DocumentChunk` table.
 */
export const DOCUMENT_CHUNK_EMBEDDING_DIMENSIONS = MOCK_EMBEDDING_DIMENSIONS;
