import { resolveDocumentEmbeddingProvider } from "./embedding-provider";
import { getChunkVectorStore, isUsableChunkSearchScope, type ChunkSearchScope } from "./chunk-vector-store";
import type { BrainOwner } from "@/lib/storage/types";

/**
 * Semantic document search (Phase 16D).
 *
 * Embeds the query with the SAME provider chunks were embedded with
 * (resolved from DOCUMENT_EMBEDDINGS_PROVIDER — see embedding-provider.ts)
 * and runs a cosine-similarity search
 * over stored chunk embeddings via `chunk-vector-store.ts`. Callers: the
 * admin `/api/documents/search` route and the flag-gated (Phase 17D,
 * HERMES_DOCUMENT_RAG_ENABLED) document evidence layer of `/api/brain`.
 *
 * F-1 (security): every search is confined to ONE tenant. The scope is a
 * REQUIRED argument and must come from `resolveDocumentSearchScope()` over
 * the server-resolved owner. With no usable scope the search returns no
 * matches BEFORE the embedding provider is called, so the question never
 * leaves the host either.
 *
 * Never throws: resolves to an empty `matches` array on any failure
 * (embedding error, no database, query error) rather than rejecting.
 */

export interface DocumentSearchMatch {
  chunkId: string;
  documentId: string;
  position: number;
  text: string;
  score: number;
}

export interface DocumentSearchResult {
  matches: DocumentSearchMatch[];
}

export type DocumentSearchScope = ChunkSearchScope;

/**
 * Derives the document search scope from a server-resolved owner
 * (`resolveBrainOwner()`), failing closed: no owner (anonymous), an AMBIGUOUS
 * multi-org context, or a personal (org-less) context all yield `null`, which
 * `searchDocuments` treats as "search nothing". Never accepts a client value.
 */
export function resolveDocumentSearchScope(owner: BrainOwner | null | undefined): DocumentSearchScope | null {
  if (!owner || owner.ambiguous) return null;
  const scope = { orgId: owner.orgId ?? "" };
  return isUsableChunkSearchScope(scope) ? scope : null;
}

export async function searchDocuments(
  query: string,
  scope: DocumentSearchScope | null,
  topK = 5
): Promise<DocumentSearchResult> {
  if (!isUsableChunkSearchScope(scope)) return { matches: [] };
  const trimmed = query.trim();
  if (!trimmed) return { matches: [] };

  try {
    const queryEmbedding = await resolveDocumentEmbeddingProvider().embed({ chunkId: "__query__", text: trimmed });
    const results = await getChunkVectorStore().search(queryEmbedding.vector, topK, scope);
    return {
      matches: results.map((r) => ({
        chunkId: r.chunk.id,
        documentId: r.chunk.documentId,
        position: r.chunk.position,
        text: r.chunk.text,
        score: r.score,
      })),
    };
  } catch {
    return { matches: [] };
  }
}
