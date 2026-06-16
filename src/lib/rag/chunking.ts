import { DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP } from "./config";
import type { RagChunk, RagDocument } from "./types";

/**
 * Deterministic chunking engine (Phase 14A).
 *
 * Character-based sliding window — no tokenizer, no external dependency.
 * Identical input (text + options) always produces identical output: same
 * slice boundaries, same chunk ids, every call, every process. This is a
 * hard requirement for embeddings to be reusable/cacheable later (Phase
 * 14B) — re-chunking the same content must never invalidate unrelated
 * chunks by shifting ids around.
 */

export interface ChunkOptions {
  maxChunkSize?: number;
  overlap?: number;
}

/**
 * Tiny deterministic string hash (djb2 variant) — used only for the
 * `contentHash` metadata field, not for security. No crypto dependency:
 * this is content-change detection, not a cryptographic guarantee.
 */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

/** Stable, deterministic chunk id for a given document + position. */
export function stableChunkId(documentId: string, position: number): string {
  return `${documentId}::chunk::${position}`;
}

/**
 * Splits text into overlapping slices. Returns [] for empty/whitespace-only
 * input. `maxChunkSize`/`overlap` are clamped to always-safe values (no
 * infinite loop, no zero/negative step) rather than throwing — chunking
 * itself stays defensive even though only the pipeline (rag-pipeline.ts)
 * carries the formal "never throws" contract.
 */
export function chunkText(text: string, options?: ChunkOptions): string[] {
  if (!text || text.trim() === "") return [];

  const size = Math.max(1, options?.maxChunkSize ?? DEFAULT_CHUNK_SIZE);
  const rawOverlap = options?.overlap ?? DEFAULT_CHUNK_OVERLAP;
  // Overlap must be strictly less than size, or the window never advances.
  const overlap = Math.max(0, Math.min(rawOverlap, size - 1));
  const step = size - overlap;

  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const slice = text.slice(i, i + size);
    if (slice.length === 0) break;
    chunks.push(slice);
    if (i + size >= text.length) break;
    i += step;
  }
  return chunks;
}

/**
 * Chunks a document into `RagChunk[]`, preserving the document's metadata
 * on every chunk and adding a per-chunk `contentHash` (for future
 * invalidation when source content changes — Phase 14B).
 */
export function chunkDocument(doc: RagDocument, options?: ChunkOptions): RagChunk[] {
  const pieces = chunkText(doc.text, options);
  return pieces.map((text, position) => ({
    id: stableChunkId(doc.id, position),
    documentId: doc.id,
    sourceType: doc.sourceType,
    text,
    position,
    metadata: {
      ...doc.metadata,
      contentHash: hashString(text),
    },
  }));
}
