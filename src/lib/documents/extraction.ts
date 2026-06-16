import { extensionOf } from "./validation";

/**
 * Text extraction (Phase 16C).
 *
 * Supports plain-text-shaped files only: .txt, .md/.markdown, and generic
 * text/plain. PDF and DOCX are explicitly NOT extracted — no parser
 * package is installed (out of scope this phase) — `isExtractable()`
 * returns false for them, and the caller (processing.ts) marks the
 * document `status: "failed"` with a safe, enumerated reason rather than
 * attempting (and risking) a parse.
 *
 * Never throws: `extractText()` always resolves to an `ExtractionResult`,
 * even on a decoding failure.
 */

const EXTRACTABLE_EXTENSIONS = new Set(["txt", "md", "markdown"]);

export interface ExtractionResult {
  ok: boolean;
  text?: string;
  /** present when ok is false — a safe, enumerated reason:
   *  "unsupported_extraction_type" | "empty_content" | "extraction_failed" */
  reason?: string;
}

/** Whether `extractText()` can do anything useful with this file, based on
 *  its extension. Checked BEFORE reading the file in processing.ts, so an
 *  unsupported type never even reaches a buffer-decode attempt. */
export function isExtractable(filename: string): boolean {
  return EXTRACTABLE_EXTENSIONS.has(extensionOf(filename));
}

/**
 * Decodes a buffer as UTF-8 plain text. Only ever called after
 * `isExtractable()` has already confirmed the file's extension is one of
 * the supported plain-text types — this function does not itself inspect
 * mime type/extension, so it stays a single-purpose, easily-testable unit.
 */
export function extractText(buf: Buffer, filename: string): ExtractionResult {
  if (!isExtractable(filename)) {
    return { ok: false, reason: "unsupported_extraction_type" };
  }
  try {
    const text = buf.toString("utf8");
    if (!text.trim()) {
      return { ok: false, reason: "empty_content" };
    }
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "extraction_failed" };
  }
}
