import { documentRepository } from "./document-repository";
import { documentTextChunkRepository } from "./chunk-repository";
import { getDocumentObjectStorage } from "./object-storage";
import { isExtractable, extractText } from "./extraction";
import { chunkDocument } from "@/lib/rag/chunking";
import type { Document } from "./types";
import type { RagDocument } from "@/lib/rag/types";

/**
 * Document processing pipeline (Phase 16C).
 *
 * load metadata -> read file from object storage -> extract text (if
 * supported) -> chunk via the EXISTING RAG chunking engine
 * (`src/lib/rag/chunking.ts`, unchanged) -> persist `DocumentTextChunk`
 * rows. Advances `Document.status` through "extracting" -> "extracted" ->
 * "chunking" -> "chunked", persisting each transition (not just the final
 * state), so the row is observably mid-flight if anything ever reads it
 * concurrently.
 *
 * NO embeddings, NO pgvector writes — `DocumentTextChunk` has no embedding
 * column at all (see types.ts/schema.prisma). That is Phase 16D's job.
 *
 * Never throws: every exit path returns a `ProcessResult`. Any unexpected
 * exception is caught and mapped to `status: "failed", error:
 * "processing_failed"` — the caller (the API route) never needs its own
 * try/catch around this function's logic, only a defense-in-depth one.
 */

export interface ProcessResult {
  ok: boolean;
  document: Document;
  chunkCount: number;
}

const now = () => new Date().toISOString();

async function fail(documentId: string, reason: string): Promise<ProcessResult> {
  const repo = documentRepository();
  const updated = await repo.update(documentId, {
    status: "failed",
    error: reason,
    lastProcessedAt: now(),
  });
  // `updated` is only null if the document vanished between the caller's
  // existence check and here — fall back to a minimal stand-in rather
  // than throwing, since this function's whole contract is "never throws".
  const document = updated ?? ((await repo.get(documentId)) as Document);
  return { ok: false, document, chunkCount: document?.chunkCount ?? 0 };
}

/** Returns null when the document doesn't exist — the caller (the route)
 *  maps that to 404. Every other outcome (success or a documented
 *  failure) is a `ProcessResult`, never a thrown error. */
export async function processDocument(documentId: string): Promise<ProcessResult | null> {
  const repo = documentRepository();
  const document = await repo.get(documentId);
  if (!document) return null;

  try {
    // Note: we don't try to "clear" a stale `error` from a prior failed
    // run here — Prisma's update() treats an `undefined` field value as
    // "don't touch this column", not "set it to null", so that wouldn't
    // actually work against a real database anyway. A stale `error`
    // sitting unused while `status` is no longer "failed" is harmless:
    // every consumer (the admin UI, the route response) only displays
    // `error` when `status === "failed"`.
    await repo.update(documentId, { status: "extracting" });

    const buf = await getDocumentObjectStorage().get(document.storageKey);
    if (!buf) {
      return await fail(documentId, "file_not_found");
    }

    if (!isExtractable(document.originalFilename)) {
      // PDF/DOCX/anything else not yet supported — no parser is
      // installed, and none is attempted. A clear, safe, enumerated
      // reason is recorded; the raw file is left untouched in storage so
      // a future phase's real parser can still process it later.
      return await fail(documentId, "unsupported_extraction_type");
    }

    const extraction = extractText(buf, document.originalFilename);
    if (!extraction.ok || !extraction.text) {
      return await fail(documentId, extraction.reason ?? "extraction_failed");
    }

    // Persist the extracted text as its own object-storage blob (sibling
    // to the original file) so a future re-chunk doesn't need to
    // re-extract — same design the Phase 16 audit recommended.
    const extractedTextKey = `documents/${documentId}/extracted.txt`;
    await getDocumentObjectStorage().put({
      key: extractedTextKey,
      body: extraction.text,
      contentType: "text/plain",
    });
    await repo.update(documentId, { status: "extracted", extractedTextKey });

    await repo.update(documentId, { status: "chunking" });

    const ragDoc: RagDocument = {
      id: documentId,
      sourceType: document.sourceType,
      text: extraction.text,
      metadata: {
        ...(document.metadata.vendor ? { vendor: document.metadata.vendor } : {}),
        ...(document.metadata.domain ? { domain: document.metadata.domain } : {}),
      },
    };
    const chunks = chunkDocument(ragDoc);

    const chunkRepo = documentTextChunkRepository();
    // Replace, never accumulate — a re-process (e.g. after a fix) must
    // not leave stale chunks from a prior run alongside the new ones.
    await chunkRepo.deleteByDocumentId(documentId);
    if (chunks.length > 0) {
      await chunkRepo.createMany(
        chunks.map((c) => ({
          documentId,
          position: c.position,
          text: c.text,
          charCount: c.text.length,
          ...(typeof c.metadata?.contentHash === "string"
            ? { contentHash: c.metadata.contentHash as string }
            : {}),
          metadata: c.metadata ?? {},
        }))
      );
    }

    const updated = await repo.update(documentId, {
      status: "chunked",
      chunkCount: chunks.length,
      lastProcessedAt: now(),
    });

    return { ok: true, document: updated ?? document, chunkCount: chunks.length };
  } catch {
    // Never let an unforeseen exception (storage hiccup, chunking bug,
    // anything) escape as a rejected promise — degrade to a safe,
    // generic failure instead.
    return await fail(documentId, "processing_failed");
  }
}
