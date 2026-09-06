/**
 * PHASE 109-C2.1 — per-entry admission policy.
 *
 * The path rules are NOT reimplemented here. `classifyEntryPath` in C2.0 is
 * already the authority on traversal, absolute paths, drive qualification, NUL
 * bytes, NFC and depth, and it returns the stable `AES-C2-0xx` codes an audit
 * row quotes. This module adds only what a real archive introduces and a
 * manifest cannot: header flags, compression method, Unix file type, declared
 * sizes, and duplicate canonical paths within one container.
 */

// Deep imports, for the reason documented in ./diagnostics.ts: the companion
// barrel reaches modules that alias into other parts of the app, which cannot
// be resolved from a compiled CommonJS sidecar.
import { classifyEntryPath } from "../tia-companion/contract";
import { TIA_DIAGNOSTIC_CODES } from "../tia-companion/diagnostics";

import { INGEST_DIAGNOSTIC_CODES, type IngestDiagnosticCode } from "./diagnostics";
import { extraFieldProblems, filenameShadowProblem, type RawExtraField } from "./extra-field-policy";
import { INGEST_LIMITS } from "./limits";

/** General-purpose bit flags this policy reads. */
export const GP_FLAG_ENCRYPTED = 0x0001;
export const GP_FLAG_DATA_DESCRIPTOR = 0x0008;

/** Compression methods Hermes will decode. */
export const METHOD_STORED = 0;
export const METHOD_DEFLATE = 8;

/** `S_IFMT` and the only two file-type values that may be admitted. */
export const S_IFMT = 0o170000;
export const S_IFREG = 0o100000;

/** Extensions that indicate a nested archive. Depth is zero; these are refused. */
const NESTED_ARCHIVE_SUFFIXES: readonly string[] = Object.freeze([
  ".zip",
  ".jar",
  ".7z",
  ".rar",
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
  ".xz",
]);

/** One central-directory entry, in the shape the parser reads it. */
export interface CentralEntry {
  readonly decodedName: string;
  readonly rawName: string;
  readonly generalPurposeBitFlag: number;
  readonly compressionMethod: number;
  readonly crc32: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly versionMadeBy: number;
  readonly externalFileAttributes: number;
  readonly localHeaderOffset: number;
  readonly extraFields: readonly RawExtraField[];
  readonly extraFieldRawLength: number;
}

export type EntryProblem = {
  readonly code: IngestDiagnosticCode | (typeof TIA_DIAGNOSTIC_CODES)[keyof typeof TIA_DIAGNOSTIC_CODES];
  readonly detail: string;
};

export type EntryVerdict =
  | { readonly ok: true; readonly canonicalPath: string }
  | { readonly ok: false; readonly problems: readonly EntryProblem[] };

/**
 * Unix file-type check.
 *
 * The naive rule — require `S_IFMT === S_IFREG` — was measured against five
 * real writers and rejected FOUR of them: .NET's `Compress-Archive` and a Node
 * writer both leave `externalFileAttributes` at 0, and Python's streaming
 * writer emits permission bits with no type bits. Only Python's file mode
 * carries `S_IFREG`. So "no type information" and "regular file" are both
 * admitted, and everything else — symlink, directory, character or block
 * device, FIFO, socket — is refused.
 */
export function fileTypeIsAdmissible(externalFileAttributes: number): boolean {
  const mode = externalFileAttributes >>> 16;
  const type = mode & S_IFMT;
  return type === 0 || type === S_IFREG;
}

/**
 * Refuse path characters that cannot be serialised within the documented bound.
 *
 * This is what MAKES the three-bytes-per-code-unit figure in `limits.ts` a real
 * upper bound rather than an assumption. `JSON.stringify` escapes exactly three
 * classes of character: `"` and `\` (2 bytes each), C0 controls U+0000–U+001F
 * (6 bytes), and lone surrogates (6 bytes). The first class is under the bound;
 * the other two are double it, so they are refused here rather than budgeted
 * for — budgeting would have doubled every downstream limit to accommodate
 * characters no legitimate engineering path contains.
 *
 * NOT a Unicode restriction. Persian text costs 2 bytes per code unit, ZWNJ and
 * ZWJ cost 3, and an astral pair costs 2 per unit — all admitted, all within
 * the bound. NFC and path identity are untouched: this runs after the C2.0
 * classifier and only removes characters, never rewrites one.
 */
export function pathSerializationProblem(path: string): string | null {
  for (let i = 0; i < path.length; i++) {
    const unit = path.charCodeAt(i);

    if (unit <= 0x1f) {
      return `C0 control U+${unit.toString(16).padStart(4, "0").toUpperCase()} at index ${i}`;
    }

    // A high surrogate must be followed by a low one, and a low surrogate must
    // never appear alone. Either way the result is a 6-byte escape.
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < path.length ? path.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) return `unpaired high surrogate at index ${i}`;
      i += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) return `unpaired low surrogate at index ${i}`;
  }
  return null;
}

function looksLikeNestedArchive(canonicalPath: string): boolean {
  const lowered = canonicalPath.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
  return NESTED_ARCHIVE_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
}

/**
 * Admit or refuse one entry, collecting every problem rather than the first.
 *
 * `seenCanonicalPaths` is mutated by the caller across a container so that a
 * duplicate canonical path — two entries that normalise to the same identity —
 * is caught. Two headers may differ byte-for-byte and still name one file.
 */
export function classifyEntry(
  entry: CentralEntry,
  seenCanonicalPaths: Set<string>,
): EntryVerdict {
  const C = INGEST_DIAGNOSTIC_CODES;
  const problems: EntryProblem[] = [];

  if ((entry.generalPurposeBitFlag & GP_FLAG_ENCRYPTED) !== 0) {
    problems.push({ code: C.ENCRYPTED_ENTRY_REJECTED, detail: "general-purpose bit 0 set" });
  }
  if ((entry.generalPurposeBitFlag & GP_FLAG_DATA_DESCRIPTOR) !== 0) {
    problems.push({ code: C.DATA_DESCRIPTOR_REJECTED, detail: "general-purpose bit 3 set" });
  }
  if (entry.compressionMethod !== METHOD_STORED && entry.compressionMethod !== METHOD_DEFLATE) {
    problems.push({
      code: C.UNSUPPORTED_COMPRESSION_METHOD,
      detail: `method ${entry.compressionMethod}`,
    });
  }
  if (!fileTypeIsAdmissible(entry.externalFileAttributes)) {
    const mode = entry.externalFileAttributes >>> 16;
    problems.push({
      code: C.NON_REGULAR_FILE_REJECTED,
      detail: `unix mode 0o${mode.toString(8)} is not a regular file`,
    });
  }
  if (entry.decodedName.endsWith("/")) {
    problems.push({ code: C.DIRECTORY_ENTRY_REJECTED, detail: "entry name ends with a separator" });
  }
  if (entry.uncompressedSize > INGEST_LIMITS.maxDeclaredEntryBytes) {
    problems.push({
      code: C.DECLARED_ENTRY_TOO_LARGE,
      detail: `declared ${entry.uncompressedSize} bytes`,
    });
  }

  const shadow = filenameShadowProblem(entry.decodedName, entry.rawName);
  if (shadow) problems.push(shadow);

  for (const problem of extraFieldProblems(entry.extraFields, {
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    localHeaderOffset: entry.localHeaderOffset,
    extraFieldRawLength: entry.extraFieldRawLength,
  })) {
    problems.push(problem);
  }

  // Path policy is C2.0's, verbatim, on the RAW header name — never on a name
  // an extra field supplied.
  const path = classifyEntryPath(entry.rawName);
  if (!path.ok) {
    problems.push({ code: path.code, detail: `path refused: ${entry.rawName}` });
    return { ok: false, problems };
  }

  if (path.canonical.split("/").length > INGEST_LIMITS.maxEntryPathSegments) {
    problems.push({ code: TIA_DIAGNOSTIC_CODES.PATH_DEPTH_EXCEEDED, detail: path.canonical });
  }
  if (path.canonical.length > INGEST_LIMITS.maxEntryPathLength) {
    problems.push({ code: TIA_DIAGNOSTIC_CODES.PATH_LENGTH_EXCEEDED, detail: path.canonical });
  }
  if (looksLikeNestedArchive(path.canonical)) {
    problems.push({ code: C.NESTED_ARCHIVE_REJECTED, detail: path.canonical });
  }
  const unserializable = pathSerializationProblem(path.canonical);
  if (unserializable) {
    problems.push({ code: C.PATH_UNSERIALIZABLE_CHARACTER, detail: unserializable });
  }
  if (seenCanonicalPaths.has(path.canonical)) {
    problems.push({ code: TIA_DIAGNOSTIC_CODES.DUPLICATE_CANONICAL_PATH, detail: path.canonical });
  }

  if (problems.length > 0) return { ok: false, problems };

  seenCanonicalPaths.add(path.canonical);
  return { ok: true, canonicalPath: path.canonical };
}
