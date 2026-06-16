/**
 * Document Ingestion Foundation — domain types (Phase 16A).
 *
 * Mirrors `src/lib/storage/types.ts`'s shape (plain TS interfaces, no Prisma
 * import, so the session build never requires the generated client) and
 * deliberately stays separate from `src/lib/rag/types.ts` — a `Document` is
 * a source FILE with lifecycle/storage concerns; a `RagDocument`/`RagChunk`
 * is the transient, in-memory shape the RAG pipeline chunks/embeds. Once
 * Phase 16B's worker exists, it will read a `Document` row and produce
 * `RagChunk[]` from it — the two type families meet there, not here.
 */

/**
 * Lifecycle of a document from upload through indexing. A single linear
 * field (not a bitset/multi-flag) so "what state is this document in" is
 * always one unambiguous answer — consistent with every other status field
 * in this codebase (CaseStatus, ArticleStatus, UnknownStatus).
 *
 *   uploaded -> extracting -> extracted -> chunking -> chunked
 *            -> embedding -> embedded -> indexed
 *   (any stage) -> failed
 *   indexed -> archived
 */
export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "extracted"
  | "chunking"
  | "chunked"
  | "embedding"
  | "embedded"
  | "indexed"
  | "failed"
  | "archived";

export const DOCUMENT_STATUSES: DocumentStatus[] = [
  "uploaded",
  "extracting",
  "extracted",
  "chunking",
  "chunked",
  "embedding",
  "embedded",
  "indexed",
  "failed",
  "archived",
];

/** Terminal statuses — a document here will not transition further without
 *  an explicit re-index (failed) or restore (archived). Used by future
 *  status-transition validation (Phase 16B), not enforced anywhere yet. */
export const TERMINAL_DOCUMENT_STATUSES: DocumentStatus[] = ["indexed", "failed", "archived"];

/** The industrial document categories Phase 16's audit identified as
 *  ingestion targets. An open string union (not `string`) so a typo is a
 *  type error, but new categories are a one-line addition here, not a
 *  schema migration (the column itself is a plain `String`). */
export type DocumentSourceType =
  | "manual"
  | "datasheet"
  | "commissioning_report"
  | "engineering_report"
  | "troubleshooting_note"
  | "safety_procedure"
  | "maintenance_procedure"
  | "factory_knowledge";

export const DOCUMENT_SOURCE_TYPES: DocumentSourceType[] = [
  "manual",
  "datasheet",
  "commissioning_report",
  "engineering_report",
  "troubleshooting_note",
  "safety_procedure",
  "maintenance_procedure",
  "factory_knowledge",
];

/**
 * Where a document's raw bytes (and extracted text) physically live.
 *   - "local": real, working today (Node `fs`, no package install) — Local
 *     Dev and Factory Edge's zero-cloud-dependency default.
 *   - "minio" / "s3": architecture only in Phase 16A — no SDK installed;
 *     see object-storage.ts for why these throw rather than silently
 *     degrade when actually used.
 */
export type DocumentStorageProvider = "local" | "minio" | "s3";

export const DOCUMENT_STORAGE_PROVIDERS: DocumentStorageProvider[] = ["local", "minio", "s3"];

/** Operator-supplied context. `tags`/`extra` are never relied on for
 *  retrieval-correctness — they're descriptive, not authoritative (the
 *  same posture `RagChunk.metadata` already takes). */
export interface DocumentMetadata {
  vendor?: string;
  domain?: string;
  tags: string[];
  extra?: Record<string, unknown>;
}

/**
 * A per-stage progress snapshot, distinct from the single `DocumentStatus`
 * field on `Document` itself — lets a future worker/UI show "12 of 40
 * chunks embedded" without overloading the status enum with counts.
 */
export interface DocumentIngestionStatus {
  status: DocumentStatus;
  /** present only when status === "failed" — a safe, enumerated reason
   *  (e.g. "extraction_failed", "embedding_failed"), never a raw
   *  parser/SDK/SQL error message or stack trace */
  error?: string;
  chunkCount: number;
  embeddedChunkCount: number;
  updatedAt: string;
}

/**
 * A lightweight pointer to a chunk that belongs to a Document — NOT the
 * full `RagChunk`/embedding (those live in the `DocumentChunk` table,
 * reachable only via raw SQL through `vector-store-pgvector.ts`, by
 * design). This is the shape a future Document-facing API/repository
 * surfaces — "which chunk ids exist for this document" — without ever
 * touching the embedding column.
 */
export interface DocumentChunkReference {
  chunkId: string;
  documentId: string;
  position: number;
  /** present only when extraction recorded page/section info */
  page?: number;
}

/**
 * A chunk's TEXT, persisted before any embedding exists (Phase 16C).
 *
 * Deliberately a SEPARATE model from `DocumentChunk` (Phase 14C/the
 * pgvector table): `DocumentChunk.embedding` is a NOT NULL pgvector
 * column, so that table cannot represent a chunk that has no embedding
 * yet. `DocumentTextChunk` is the sibling table for the
 * extraction/chunking stage — Phase 16D's embedding step is expected to
 * read these rows and write the corresponding `DocumentChunk` (pgvector)
 * row once a real embedding provider is wired in; the two tables are
 * pipeline stages, not duplicates.
 */
export interface DocumentTextChunk {
  id: string;
  documentId: string;
  /** 0-based position within the document, stable and deterministic
   *  (produced by `chunkDocument()` — see `src/lib/rag/chunking.ts`) */
  position: number;
  text: string;
  charCount: number;
  /** absent — no tokenizer is installed; "if available" per the Phase 16C
   *  spec, and one currently isn't */
  tokenCount?: number;
  /** `RagChunk.metadata.contentHash`, lifted to its own column — see
   *  chunking.ts's `hashString()` */
  contentHash?: string;
  metadata: Record<string, unknown>;
  /** "chunked" today; Phase 16D may add an "embedded" value once this
   *  row's embedding has been written to `DocumentChunk` */
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The document record itself. Field shape intentionally mirrors the
 * `Document` Prisma model 1:1 (see prisma/schema.prisma) — this is the
 * plain-TS projection both the session and database repository
 * implementations return, exactly like `StoredCase`/`StoredArticle` already
 * do for their models.
 */
export interface Document {
  id: string;
  title: string;
  sourceType: DocumentSourceType;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageProvider: DocumentStorageProvider;
  /** object-storage pointer to the raw uploaded file — never the bytes
   *  themselves; see object-storage.ts */
  storageKey: string;
  /** object-storage pointer to extracted plain text, once extraction has
   *  run (Phase 16B) — absent until then */
  extractedTextKey?: string;
  /** content hash of the raw file, for re-index skip-if-unchanged
   *  (Phase 16B/C) — absent until first hashed */
  contentHash?: string;
  metadata: DocumentMetadata;
  status: DocumentStatus;
  /** present only when status === "failed" — a safe, enumerated reason,
   *  never a raw parser/SDK/SQL error message or stack trace */
  error?: string;
  chunkCount: number;
  /** Phase 16C: set whenever a /process call completes (success or
   *  failure) — distinct from `updatedAt`, which changes on ANY update
   *  (including the upload flow's own internal storageKey-set step) */
  lastProcessedAt?: string;
  /** User.id of the uploader, when auth is configured */
  uploadedBy?: string;
  /** unused in this single-tenant phase; present so a future multi-tenant
   *  retrofit is a data backfill, not a schema migration */
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}
