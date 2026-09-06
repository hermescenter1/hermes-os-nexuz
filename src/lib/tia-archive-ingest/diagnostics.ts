/**
 * PHASE 109-C2.1 — ingestion diagnostic codes.
 *
 * These continue the `AES-C2-` contract space that Phase 109-C2.0 opened, from
 * 023 upward. They live in their own module and their own array rather than
 * being appended to C2.0's, for one reason: C2.0's list is a frozen contract
 * with an exhaustiveness test that pins its length at 21. Growing that array
 * would force an edit to a shipped contract and its test on every future
 * ingestion code. Two arrays, one numbering space, no collisions — asserted by
 * a test that intersects them.
 *
 * A code never changes meaning. Retiring one reserves its number forever.
 */

// Imported from the companion MODULE rather than its barrel, and deliberately.
// The barrel also exports origin-policy, package-manifest and snapshot, which
// import values across the "@/" alias into automation-studio and ot-edge. tsc
// does not rewrite path aliases on emit, so pulling the barrel into the sidecar
// artifact would both fail to resolve at runtime and drag a far larger graph
// into the one container that handles hostile bytes. contract.ts,
// diagnostics.ts and canonical.ts are self-contained; those three are all the
// sidecar needs.
import { ALL_TIA_DIAGNOSTIC_CODES } from "../tia-companion/diagnostics";

export const INGEST_DIAGNOSTIC_CODES = Object.freeze({
  /* ── container level ─────────────────────────────────────────────────── */

  /** Leading bytes are not a ZIP local-file-header signature. */
  CONTAINER_NOT_ZIP: "AES-C2-023",
  /** Structurally unreadable: no end-of-central-directory, truncated, corrupt. */
  CONTAINER_UNREADABLE: "AES-C2-024",
  /** Central directory declares more entries than the limit allows. */
  TOO_MANY_ENTRIES: "AES-C2-025",
  /** Whole container exceeded `maxContainerBytes` while streaming. */
  CONTAINER_TOO_LARGE: "AES-C2-026",

  /* ── entry level ─────────────────────────────────────────────────────── */

  /** General-purpose bit 3 set. A Hermes profile restriction, not a ZIP fault. */
  DATA_DESCRIPTOR_REJECTED: "AES-C2-027",
  /** General-purpose bit 0 set. Encrypted entries are never opened. */
  ENCRYPTED_ENTRY_REJECTED: "AES-C2-028",
  /** Compression method outside {0 stored, 8 deflate}. */
  UNSUPPORTED_COMPRESSION_METHOD: "AES-C2-029",
  /** Entry describes a directory rather than a file. */
  DIRECTORY_ENTRY_REJECTED: "AES-C2-030",
  /** Unix file type is neither absent nor regular: symlink, device, FIFO, socket. */
  NON_REGULAR_FILE_REJECTED: "AES-C2-031",
  /** An extra field carries an id outside the closed allowlist. */
  EXTRA_FIELD_NOT_ALLOWED: "AES-C2-032",
  /** Two extra fields share one id. Ambiguity is refused, not resolved. */
  EXTRA_FIELD_DUPLICATE: "AES-C2-033",
  /** An extra field's declared length runs past the buffer that holds it. */
  EXTRA_FIELD_MALFORMED: "AES-C2-034",
  /** A ZIP64 field is present without any sentinel that would require it. */
  ZIP64_FIELD_UNNECESSARY: "AES-C2-035",
  /** The 0x7075 Unicode path disagrees with the raw header name. */
  FILENAME_SHADOWED: "AES-C2-036",
  /** Local and central headers disagree on a field that must be identical. */
  LOCAL_CENTRAL_MISMATCH: "AES-C2-037",
  /** Streamed CRC-32 does not equal the central directory's value. */
  CRC_MISMATCH: "AES-C2-038",
  /** Declared uncompressed size exceeds `maxDeclaredEntryBytes`. */
  DECLARED_ENTRY_TOO_LARGE: "AES-C2-039",
  /** Streamed bytes for one entry exceeded `maxObservedEntryBytes`. */
  OBSERVED_ENTRY_TOO_LARGE: "AES-C2-040",
  /** Streamed bytes across all entries exceeded `maxObservedTotalBytes`. */
  OBSERVED_TOTAL_TOO_LARGE: "AES-C2-041",
  /** A nested archive was found. Depth is zero; it is not opened. */
  NESTED_ARCHIVE_REJECTED: "AES-C2-042",

  /* ── isolation and transport ─────────────────────────────────────────── */

  /** Runtime is older than the baseline, or `zlib.crc32` is absent. */
  RUNTIME_UNSUPPORTED: "AES-C2-043",
  /** `memory.oom.group` is not 0, so a kill would take the whole cgroup. */
  OOM_GROUP_UNACCEPTABLE: "AES-C2-044",
  /** The child did not establish, or could not prove, its OOM victim bias. */
  OOM_BIAS_UNVERIFIED: "AES-C2-045",
  /** The child's first message was absent, malformed, or not a READY. */
  HANDSHAKE_FAILED: "AES-C2-046",
  /** Child was killed by the kernel, crashed, or exited non-zero. */
  PARSER_TERMINATED: "AES-C2-047",
  /** The whole-ingestion wall-clock budget expired. */
  PARSE_TIMEOUT: "AES-C2-048",
  /** No first byte arrived within the first-byte deadline. */
  FIRST_BYTE_TIMEOUT: "AES-C2-049",
  /** The body did not finish arriving within the total ingress deadline. */
  INGRESS_TIMEOUT: "AES-C2-050",
  /** A parse is already running. Exactly one is admitted; nothing is queued. */
  PARSER_BUSY: "AES-C2-051",
  /** The caller went away before the parse completed. */
  CALLER_DISCONNECTED: "AES-C2-052",
  /** Child output was oversized, malformed, or carried more than one terminal. */
  PARSER_PROTOCOL_VIOLATION: "AES-C2-053",
  /** The sidecar is not reachable, or this platform cannot reach it at all. */
  PARSER_UNAVAILABLE: "AES-C2-054",
  /** Declared Content-Length is absent-but-required, malformed, or inconsistent. */
  CONTENT_LENGTH_UNACCEPTABLE: "AES-C2-055",
  /** Central directory and reconciled manifest describe different entry sets. */
  MANIFEST_RECONCILIATION_FAILED: "AES-C2-056",

  /* ── refusals the reader library reaches before Hermes sees the entry ── */

  /**
   * Declared compressed and uncompressed sizes cannot both be true.
   *
   * yauzl validates this while walking the central directory and aborts before
   * the entry is emitted, so Hermes never gets to apply its own size policy to
   * such an entry. The code exists so the refusal is still specific rather than
   * collapsing into a generic "unreadable".
   */
  DECLARED_SIZE_INCONSISTENT: "AES-C2-057",

  /**
   * The reader refused the entry name's characters outright.
   *
   * With `strictFileNames` the backslash separator is rejected rather than
   * silently rewritten to `/`. That rewrite is the second name-shadowing path
   * measured in P0, so this refusal is load-bearing.
   */
  FILENAME_CHARACTERS_REJECTED: "AES-C2-058",

  /**
   * The entry path contains a character that cannot be serialised within the
   * documented wire bound.
   *
   * `JSON.stringify` encodes a C0 control (U+0000–U+001F) and a lone surrogate
   * as a six-byte escape — twice the three bytes a worst-case BMP character
   * costs. Measured: U+0001, U+001F and U+D800 each cost 6 bytes per UTF-16
   * code unit, while a 3-byte BMP character costs 3, a quote or backslash 2,
   * and an astral pair 2 per unit.
   *
   * The size calculation the response cap is derived from assumes three, so
   * these characters are refused BEFORE serialisation rather than budgeted for.
   * That keeps the bound honest without doubling every limit for characters no
   * legitimate engineering path contains. Persian text, ZWNJ/ZWJ and astral
   * pairs are unaffected.
   */
  PATH_UNSERIALIZABLE_CHARACTER: "AES-C2-059",
});

export type IngestDiagnosticCode =
  (typeof INGEST_DIAGNOSTIC_CODES)[keyof typeof INGEST_DIAGNOSTIC_CODES];

export const ALL_INGEST_DIAGNOSTIC_CODES: readonly IngestDiagnosticCode[] = Object.freeze(
  Object.values(INGEST_DIAGNOSTIC_CODES),
);

/** True when `value` is one of this module's codes. Fail-closed on anything else. */
export function isIngestDiagnosticCode(value: unknown): value is IngestDiagnosticCode {
  return (
    typeof value === "string" &&
    (ALL_INGEST_DIAGNOSTIC_CODES as readonly string[]).includes(value)
  );
}

/**
 * Codes shared with C2.0. Must always be empty.
 *
 * Exported rather than kept inside a test so the check is part of the module's
 * own contract: one numbering space, two arrays, no code may mean two things.
 */
export function collidingCodes(): readonly string[] {
  const c20 = new Set<string>(ALL_TIA_DIAGNOSTIC_CODES as readonly string[]);
  return (ALL_INGEST_DIAGNOSTIC_CODES as readonly string[]).filter((code) => c20.has(code));
}

/**
 * Every code a REFUSED message may legitimately carry.
 *
 * Both spaces, because entry admission delegates path policy to C2.0 and
 * therefore returns C2.0 codes — traversal is AES-C2-006, a non-NFC path is
 * AES-C2-019, and so on. A schema that accepted only the ingest space turned
 * every one of those into a protocol violation, which is what the real UDS gate
 * caught: nine fixtures reported AES-C2-053 instead of the rule that fired.
 * In-process tests could not see it because they call the reader directly and
 * never cross the wire.
 */
export const ALL_REFUSAL_CODES: readonly string[] = Object.freeze([
  ...(ALL_TIA_DIAGNOSTIC_CODES as readonly string[]),
  ...(ALL_INGEST_DIAGNOSTIC_CODES as readonly string[]),
]);

/** Translation key for a code, mirroring the C2.0 convention. */
export function ingestMessageKeyOf(code: IngestDiagnosticCode): string {
  return `tiaIngest.diagnostics.${code}`;
}
