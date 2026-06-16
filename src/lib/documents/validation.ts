import path from "path";
import { DOCUMENT_SOURCE_TYPES, type DocumentSourceType } from "./types";
import { MAX_DOCUMENT_SIZE_BYTES } from "./config";

/**
 * Upload validation (Phase 16B).
 *
 * Kept independent of the route handler so each rule is unit-testable in
 * isolation without constructing a real `Request`/`FormData`. Every
 * function returns a safe, enumerated `reason` code — never a message
 * that echoes raw user input back unsanitized, consistent with this
 * codebase's "never leak raw internals" discipline elsewhere (AI Router,
 * RAG pipeline).
 */

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

const OK: ValidationResult = { ok: true };

export function isDocumentSourceType(value: string): value is DocumentSourceType {
  return (DOCUMENT_SOURCE_TYPES as string[]).includes(value);
}

export function validateSourceType(value: string): ValidationResult {
  if (!value) return { ok: false, reason: "source_type_required" };
  if (!isDocumentSourceType(value)) return { ok: false, reason: "invalid_source_type" };
  return OK;
}

export function validateTitle(title: string): ValidationResult {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false, reason: "title_required" };
  if (trimmed.length > 200) return { ok: false, reason: "title_too_long" };
  return OK;
}

/**
 * Filename sanity check ONLY — the display name stored on the Document
 * row. Never used to derive the actual storage path; that is always
 * server-generated from the Document's own id (see object-storage.ts),
 * so even an invalid filename here can never cause a path-traversal
 * write. This rejects empty/absurd/traversal-shaped *display* names.
 */
export function validateFilename(filename: string): ValidationResult {
  const trimmed = filename.trim();
  if (!trimmed) return { ok: false, reason: "filename_required" };
  if (trimmed.length > 255) return { ok: false, reason: "filename_too_long" };
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    return { ok: false, reason: "filename_invalid" };
  }
  return OK;
}

export function extensionOf(filename: string): string {
  return path.extname(filename).replace(/^\./, "").toLowerCase();
}

/** PDF, TXT, Markdown, and DOCX — DOCX is accepted for storage even though
 *  no parser exists yet (Phase 16B doesn't extract anything from ANY type
 *  yet), per this phase's explicit scope. */
const ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "md", "markdown", "docx"]);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Browsers/OS file pickers commonly report this generic type for
  // .md/.docx — the extension check (required regardless) is what
  // actually gates these, this MIME type alone is never sufficient.
  "application/octet-stream",
]);

export function validateFileType(mimeType: string, filename: string): ValidationResult {
  const ext = extensionOf(filename);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: "unsupported_file_type" };
  }
  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
    return { ok: false, reason: "unsupported_file_type" };
  }
  return OK;
}

export function validateFileSize(sizeBytes: number): ValidationResult {
  if (sizeBytes <= 0) return { ok: false, reason: "file_empty" };
  if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) return { ok: false, reason: "file_too_large" };
  return OK;
}

/** Splits a free-form comma-separated tags string into a clean array —
 *  same convention the Studios already use for their own tags fields. */
export function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
