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

/**
 * F-2 — the MIME type a stored document is RECORDED with, derived from the
 * already-validated extension. The client's declared type (often
 * `application/octet-stream` for .md/.docx) is checked against the allow-list
 * above but never persisted and never used to serve the file.
 */
const CANONICAL_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function canonicalDocumentMimeType(filename: string): string {
  return CANONICAL_MIME_BY_EXTENSION[extensionOf(filename)] ?? "application/octet-stream";
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — every OOXML (.docx) container
/**
 * Leading bytes of binary formats a text upload must not carry: PDF, ZIP and
 * ELF (0x7F "ELF"). Deliberately NOT "MZ": those two bytes are ordinary text —
 * "MZ-80 service notes" is a valid industrial document — and a real PE/DOS
 * executable is still refused, because its header always contains NUL bytes
 * (see the NUL rule below).
 */
const BINARY_MAGICS = [PDF_MAGIC, ZIP_MAGIC, [0x7f, 0x45, 0x4c, 0x46]];

function startsWith(bytes: Uint8Array, magic: readonly number[]): boolean {
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

/**
 * F-2 — content signature check (magic bytes), run on the bytes actually
 * received, AFTER the extension/MIME allow-list. The declared type is
 * client-controlled and therefore never sufficient on its own:
 *
 *   pdf            must start with `%PDF-`
 *   docx           must start with the ZIP local-file-header `PK\x03\x04`
 *                  (the container only — the OOXML parts are not inspected;
 *                  no DOCX parser exists yet, see extraction.ts)
 *   txt/md         must be valid UTF-8 (a BOM is allowed), contain no NUL
 *                  byte, and not start with a PDF/ZIP/ELF signature (a
 *                  PE executable fails the NUL rule; a leading "MZ" alone
 *                  is text)
 *
 * No new dependency: a handful of byte reads, the same approach as
 * `src/lib/media/validation.ts`.
 */
export function validateFileSignature(filename: string, bytes: Uint8Array): ValidationResult {
  const mismatch: ValidationResult = { ok: false, reason: "file_signature_mismatch" };
  switch (extensionOf(filename)) {
    case "pdf":
      return startsWith(bytes, PDF_MAGIC) ? OK : mismatch;
    case "docx":
      return startsWith(bytes, ZIP_MAGIC) ? OK : mismatch;
    case "txt":
    case "md":
    case "markdown": {
      if (BINARY_MAGICS.some((m) => startsWith(bytes, m))) return mismatch;
      if (bytes.includes(0x00)) return mismatch;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        return mismatch;
      }
      return OK;
    }
    default:
      return { ok: false, reason: "unsupported_file_type" };
  }
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
