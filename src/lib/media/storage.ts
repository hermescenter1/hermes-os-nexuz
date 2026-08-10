import { randomUUID } from "crypto";
import type { Readable } from "stream";
import { getLocalDocumentStorageDir } from "@/lib/documents/config";
import { getDocumentObjectStorage } from "@/lib/documents/object-storage";
import {
  openSecureFile,
  readSecureFileRange,
  statSecureFile,
  type OpenSecureFileInput,
  type SecureFile,
} from "./secure-read";
import { MAX_MEDIA_UPLOAD_BYTES, isAllowedMediaExtension } from "./validation";

/**
 * PHASE 102 — Hermes Media & Video Hub: the storage + streaming seam.
 *
 * Design authority: docs/phase102/architecture.md §4 and §7.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * `ObjectStorage.get(key): Promise<Buffer | null>` is whole-object by design
 * (ADR §2.3). That is fine for a 200 KB PDF and unusable for video: answering a
 * seek to 00:41:00 of a 50 MB file by reading all 50 MB into the Node heap, per
 * request, per viewer, is how a single page view becomes an outage. Phase 102
 * therefore adds a RANGE READER beside the existing seam rather than replacing
 * it — nothing about document storage changes.
 *
 * WHAT IS AND IS NOT DELEGATED
 * ----------------------------
 * All byte PERSISTENCE (put/get/delete/exists) is delegated to
 * `getDocumentObjectStorage()` so the seam's unexported `sanitizeKey()`
 * traversal guard applies. Phase 102 does NOT hand-roll a second, weaker
 * sanitiser.
 *
 * The range reader cannot delegate — the seam has no `stat` and no partial
 * read — so it resolves a filesystem path itself. It does this WITHOUT
 * re-implementing sanitisation: {@link assertMediaStorageKey} is a fail-closed
 * VALIDATOR that rejects anything not matching the exact server-generated key
 * shape, and it never rewrites a key. Because that shape contains no `.`, `..`,
 * empty or backslash segment, `path.join(root, key)` (what the seam does after
 * sanitising) and the resolution `secure-read.ts` performs are provably the
 * same path — an invariant the tests pin by writing through the seam and
 * reading back through the range reader.
 *
 * HOW READS REACH THE DISK (changed — read this)
 * ----------------------------------------------
 * Every read side of this module now goes through
 * {@link openSecureFile} in `./secure-read`. The previous implementation
 * validated a pathname with `path.resolve` + `startsWith(root)` and then opened
 * that pathname — twice, in the case of `openMediaByteRange`, which stat'ed the
 * path and then handed the same path to `createReadStream`. That was wrong in
 * three ways: `path.resolve` cannot see a symlink, `startsWith` is a character
 * prefix test rather than a segment test, and re-opening by pathname reintroduces
 * the TOCTOU window on every call.
 *
 * The primitive validates once, opens ONCE, re-proves containment, file type and
 * size on the resulting DESCRIPTOR, and serves bytes only from that descriptor.
 * The key validator above remains the first gate — a key that is not the
 * server-generated shape never reaches the filesystem at all — and the primitive
 * is the second, independent one.
 */

// ── Errors ───────────────────────────────────────────────────────────────────

export const MEDIA_STORAGE_ERROR_CODES = [
  /** A key did not match the server-generated shape. Never rewritten — refused. */
  "invalid_storage_key",
  /**
   * A key path escaped the configured storage root.
   *
   * RETAINED, DELIBERATELY UNTHROWN. Containment is now decided inside
   * `secure-read.ts`, which maps an escape to the same uniform "unavailable"
   * outcome as a missing object so that a probe cannot tell the two apart. The
   * code stays in the vocabulary because it is the name operators already know
   * from the internal log line, and because deleting it would silently narrow a
   * public union other code may switch over.
   */
  "key_outside_storage_root",
  /** Range reads require the `local` provider; `minio`/`s3` reject by design. */
  "range_requires_local_provider",
  /** A byte range was requested that the object cannot satisfy. */
  "range_not_satisfiable",
  /** A bounded buffered read was asked for more bytes than the cap allows. */
  "range_too_large",
  /** An organization/asset identifier was not usable as a key segment. */
  "invalid_key_segment",
  /** An extension outside the media allow-list was proposed for a key. */
  "invalid_key_extension",
] as const;

export type MediaStorageErrorCode = (typeof MEDIA_STORAGE_ERROR_CODES)[number];

/**
 * Fails loudly. Per the object-storage module's own rationale, a storage layer
 * that silently degrades is worse than one that errors: the caller maps these
 * codes to a safe HTTP status and never echoes the message to a client.
 */
export class MediaStorageError extends Error {
  readonly code: MediaStorageErrorCode;

  constructor(code: MediaStorageErrorCode, message: string) {
    super(message);
    this.name = "MediaStorageError";
    this.code = code;
  }
}

// ── Keys ─────────────────────────────────────────────────────────────────────

/** Top-level namespace inside the durable `documents_data` volume (ADR §7). */
export const MEDIA_KEY_PREFIX = "media";

/**
 * Identifier segments are cuids in this schema. The pattern is deliberately
 * narrower than "anything a cuid could be" so that a future id format change
 * fails a test rather than silently widening what may appear in a path.
 */
const KEY_SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The ONLY key shape this module will read or write:
 *   media/<organizationId>/<assetId>/<uuid-v4>.<ext>
 *
 * The filename component is a server-generated UUID — never derived from a
 * client filename (ADR §7). Anything else is refused outright, which is what
 * makes the path resolution below safe without a second sanitiser.
 */
const MEDIA_KEY_PATTERN =
  /^media\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9]{1,8}$/;

export function isMediaStorageKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  if (!MEDIA_KEY_PATTERN.test(key)) return false;
  // The extension is re-checked against the media allow-list on every read as
  // well as on mint, so a key persisted by an older or buggier writer can never
  // cause the server to hand back bytes under an extension it does not serve.
  const extension = key.slice(key.lastIndexOf(".") + 1);
  return isAllowedMediaExtension(extension);
}

export function assertMediaStorageKey(key: unknown): asserts key is string {
  if (!isMediaStorageKey(key)) {
    throw new MediaStorageError(
      "invalid_storage_key",
      "Media storage keys must be server-generated and match media/<organizationId>/<assetId>/<uuid>.<ext>.",
    );
  }
}

export interface BuildMediaStorageKeyInput {
  readonly organizationId: string;
  readonly assetId: string;
  /** Dot-less, lower-case, and on the media allow-list (see validation.ts). */
  readonly extension: string;
}

/**
 * Mints a storage key. The filename is `randomUUID()` — a client filename never
 * reaches the filesystem, not even sanitised, so extension-disguise and
 * collision attacks have no surface at all.
 */
export function buildMediaStorageKey(input: BuildMediaStorageKeyInput): string {
  if (!KEY_SEGMENT_PATTERN.test(input.organizationId)) {
    throw new MediaStorageError(
      "invalid_key_segment",
      "organizationId is not usable as a storage key segment.",
    );
  }
  if (!KEY_SEGMENT_PATTERN.test(input.assetId)) {
    throw new MediaStorageError(
      "invalid_key_segment",
      "assetId is not usable as a storage key segment.",
    );
  }
  const extension = input.extension.toLowerCase();
  if (!isAllowedMediaExtension(extension)) {
    throw new MediaStorageError(
      "invalid_key_extension",
      "Extension is outside the Phase 102 media allow-list.",
    );
  }
  return `${MEDIA_KEY_PREFIX}/${input.organizationId}/${input.assetId}/${randomUUID()}.${extension}`;
}

// ── Delegated byte persistence ───────────────────────────────────────────────

export interface PutMediaObjectInput {
  readonly key: string;
  readonly body: Buffer;
  readonly contentType: string;
}

export interface PutMediaObjectResult {
  readonly key: string;
  readonly sizeBytes: number;
}

/**
 * Writes bytes through the shared object-storage seam. Works with every
 * provider the seam supports — `minio`/`s3` reject by design, which is the
 * correct, loud outcome for an operator who configured a backend with no SDK.
 */
export async function putMediaObject(input: PutMediaObjectInput): Promise<PutMediaObjectResult> {
  assertMediaStorageKey(input.key);
  const storage = getDocumentObjectStorage();
  const result = await storage.put({
    key: input.key,
    body: input.body,
    contentType: input.contentType,
  });
  return { key: result.key, sizeBytes: result.sizeBytes };
}

/**
 * Whole-object read. Correct for a WebVTT track or a poster; NEVER use it to
 * serve video — {@link openMediaByteRange} exists for that.
 *
 * On the `local` provider this does NOT delegate to the seam's `get()`, which
 * is a bare `fs.readFile(path)` and therefore follows a symlink like any other
 * pathname read. It goes through the same hardened primitive as every other
 * read here, so a symlink, a directory or an over-ceiling object is refused
 * identically whether it is reached by a range read or a whole-object read.
 * Non-`local` providers still delegate, and still reject loudly by design.
 */
export async function getMediaObject(key: string): Promise<Buffer | null> {
  assertMediaStorageKey(key);
  const storage = getDocumentObjectStorage();
  if (storage.provider !== "local") return storage.get(key);
  return readSecureFileRange(secureReadInput(key));
}

export async function deleteMediaObject(key: string): Promise<void> {
  assertMediaStorageKey(key);
  await getDocumentObjectStorage().delete(key);
}

export async function mediaObjectExists(key: string): Promise<boolean> {
  assertMediaStorageKey(key);
  return getDocumentObjectStorage().exists(key);
}

// ── Local path resolution (range reads only) ─────────────────────────────────

function requireLocalProvider(): void {
  const provider = getDocumentObjectStorage().provider;
  if (provider !== "local") {
    throw new MediaStorageError(
      "range_requires_local_provider",
      `Byte-range reads require the "local" storage provider; "${provider}" has no implemented ` +
        "partial-read adapter and must not be silently downgraded to a whole-object read.",
    );
  }
}

/**
 * Hard ceiling every stored media object is read under.
 *
 * It is the upload cap, because nothing larger can legitimately exist under the
 * storage root — an object that exceeds it was not written by this system. The
 * ceiling is enforced against the `fstat` size of an OPEN DESCRIPTOR, never
 * against `MediaAsset.byteSize` or any other database column: a row can be
 * stale, or forged by a write path that has its own bug, and neither is
 * evidence about the bytes on disk. Routes layer their own tighter, per-kind
 * ceilings (poster 5 MB, subtitle 2 MB) on top of this one.
 */
export const MEDIA_MAX_STORED_OBJECT_BYTES = MAX_MEDIA_UPLOAD_BYTES;

/**
 * Describes an ALREADY-VALIDATED key to the hardened read primitive.
 *
 * The root is the same one `createLocalObjectStorage().resolvePath` uses
 * (`process.cwd()` + `getLocalDocumentStorageDir()`), resolved at call time so
 * that a test or an operator changing `HERMES_LOCAL_DOCUMENT_STORAGE_DIR` is
 * honoured on the next read rather than being frozen at module load.
 */
function secureReadInput(key: string): OpenSecureFileInput {
  assertMediaStorageKey(key);
  return {
    root: getLocalDocumentStorageDir(),
    relativePath: key,
    maxBytes: MEDIA_MAX_STORED_OBJECT_BYTES,
  };
}

/**
 * ONE OPEN PER REQUEST — the accessor every byte-serving route uses.
 *
 * `statMediaObject` followed by `openMediaByteRange` is TWO independent
 * resolutions of the same pathname. Everything the first one proved (contained,
 * not a symlink, a regular file, within the ceiling, this exact inode) is proved
 * about a file the second one is not guaranteed to be opening — which is the
 * very TOCTOU window `secure-read.ts` exists to close, reopened one layer up.
 * The routes therefore call THIS, once, and take the size, the head bytes and
 * the body stream from the single {@link SecureFile} it returns.
 *
 * Returns `null` for every unserveable object — missing, symlinked, a directory,
 * escaping the root, swapped under us, over the ceiling, or on a host that
 * requires the strong kernel primitives and lacks them. The caller renders one
 * status (404) for all of them; the reason goes to the internal log only.
 *
 * THE CALLER OWNS THE DESCRIPTOR. Close it, or hand it to exactly one stream
 * (which then closes it). Every route below does one or the other on every
 * path, including the error paths.
 */
export async function openMediaObject(key: string): Promise<SecureFile | null> {
  requireLocalProvider();
  const opened = await openSecureFile(secureReadInput(key));
  return opened.ok ? opened.file : null;
}

export interface MediaObjectStat {
  readonly sizeBytes: number;
}

/**
 * Size of a stored object without reading its content. Required to answer
 * `Content-Range` and to decide satisfiability.
 *
 * Returns `null` for every unserveable object — missing, symlinked, a
 * directory, escaping the root, swapped under us, or larger than the ceiling —
 * because the caller renders one status (404) for all of them and any finer
 * distinction would be an oracle. The reason goes to the internal log only.
 *
 * The size is taken from `fstat` on a descriptor that is opened, proven and
 * closed inside this call.
 */
export async function statMediaObject(key: string): Promise<MediaObjectStat | null> {
  requireLocalProvider();
  const input = secureReadInput(key);
  const stat = await statSecureFile(input);
  return stat === null ? null : { sizeBytes: stat.sizeBytes };
}

// ── Range parsing ────────────────────────────────────────────────────────────

export const MEDIA_RANGE_MALFORMED_REASONS = [
  "unit_not_bytes",
  "syntax",
  "multi_range",
  "non_numeric",
  "inverted",
] as const;
export type MediaRangeMalformedReason = (typeof MEDIA_RANGE_MALFORMED_REASONS)[number];

/**
 * The four outcomes a caller must distinguish, because HTTP treats them
 * differently (RFC 9110 §14):
 *
 *  - `none`          no Range header  → 200 with the whole body.
 *  - `malformed`     an unparsable or unsupported Range → the server MUST
 *                    ignore it and answer 200, NOT 416. Answering 416 to a
 *                    malformed header breaks ordinary clients.
 *  - `unsatisfiable` syntactically valid but outside the object → 416 with
 *                    `Content-Range: bytes *\/<size>`.
 *  - `satisfiable`   → 206 with `Content-Range: bytes <start>-<end>/<size>`.
 */
export type MediaRangeParseResult =
  | { readonly outcome: "none" }
  | { readonly outcome: "malformed"; readonly reason: MediaRangeMalformedReason }
  | { readonly outcome: "unsatisfiable"; readonly sizeBytes: number }
  | {
      readonly outcome: "satisfiable";
      readonly start: number;
      readonly end: number;
      readonly length: number;
      readonly sizeBytes: number;
    };

/**
 * Digit strings longer than this cannot be represented exactly as a JS number.
 * A range bound that long is certainly beyond any object we store, so it is
 * treated as "past the end" rather than as a parse failure — which is what the
 * RFC's clamping semantics imply.
 */
const MAX_RANGE_DIGITS = 15;
const BEYOND_ANY_OBJECT = Number.MAX_SAFE_INTEGER;

function parseRangeNumber(raw: string): number | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  if (raw.length > MAX_RANGE_DIGITS) return BEYOND_ANY_OBJECT;
  return Number(raw);
}

/**
 * Parses a single-range HTTP `Range` header against a known object size.
 *
 * Multi-range (`bytes=0-9,20-29`) is deliberately NOT implemented: answering it
 * correctly requires a `multipart/byteranges` body, and a half-implementation
 * that silently returns only the first part would be a correctness bug in every
 * client that asked. It is reported as malformed so the caller serves the whole
 * object, which is always a valid response.
 */
export function parseRangeHeader(
  header: string | null | undefined,
  sizeBytes: number,
): MediaRangeParseResult {
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0) {
    throw new MediaStorageError(
      "range_not_satisfiable",
      "Object size must be a non-negative integer to evaluate a range.",
    );
  }
  if (header === null || header === undefined) return { outcome: "none" };

  const trimmed = header.trim();
  if (!trimmed) return { outcome: "none" };

  const separator = trimmed.indexOf("=");
  if (separator < 0) return { outcome: "malformed", reason: "syntax" };

  const unit = trimmed.slice(0, separator).trim().toLowerCase();
  if (unit !== "bytes") return { outcome: "malformed", reason: "unit_not_bytes" };

  const spec = trimmed.slice(separator + 1).trim();
  if (!spec) return { outcome: "malformed", reason: "syntax" };
  if (spec.includes(",")) return { outcome: "malformed", reason: "multi_range" };
  if (/\s/.test(spec)) return { outcome: "malformed", reason: "syntax" };

  const dash = spec.indexOf("-");
  if (dash < 0) return { outcome: "malformed", reason: "syntax" };
  if (spec.indexOf("-", dash + 1) >= 0) return { outcome: "malformed", reason: "syntax" };

  const rawStart = spec.slice(0, dash);
  const rawEnd = spec.slice(dash + 1);

  // ── suffix form: bytes=-N (the LAST N bytes) ──
  if (rawStart === "") {
    if (rawEnd === "") return { outcome: "malformed", reason: "syntax" };
    const suffixLength = parseRangeNumber(rawEnd);
    if (suffixLength === null) return { outcome: "malformed", reason: "non_numeric" };
    // A zero-length suffix is well-formed and can never be satisfied.
    if (suffixLength === 0 || sizeBytes === 0) return { outcome: "unsatisfiable", sizeBytes };
    const start = suffixLength >= sizeBytes ? 0 : sizeBytes - suffixLength;
    const end = sizeBytes - 1;
    return { outcome: "satisfiable", start, end, length: end - start + 1, sizeBytes };
  }

  const start = parseRangeNumber(rawStart);
  if (start === null) return { outcome: "malformed", reason: "non_numeric" };

  // ── open-ended form: bytes=N- ──
  if (rawEnd === "") {
    if (sizeBytes === 0 || start >= sizeBytes) return { outcome: "unsatisfiable", sizeBytes };
    const end = sizeBytes - 1;
    return { outcome: "satisfiable", start, end, length: end - start + 1, sizeBytes };
  }

  // ── closed form: bytes=N-M ──
  const requestedEnd = parseRangeNumber(rawEnd);
  if (requestedEnd === null) return { outcome: "malformed", reason: "non_numeric" };
  if (requestedEnd < start) return { outcome: "malformed", reason: "inverted" };
  if (sizeBytes === 0 || start >= sizeBytes) return { outcome: "unsatisfiable", sizeBytes };
  const end = Math.min(requestedEnd, sizeBytes - 1);
  return { outcome: "satisfiable", start, end, length: end - start + 1, sizeBytes };
}

/** `Content-Range` for a 206 response. */
export function formatContentRange(range: {
  start: number;
  end: number;
  sizeBytes: number;
}): string {
  return `bytes ${range.start}-${range.end}/${range.sizeBytes}`;
}

/** `Content-Range` for a 416 response — tells the client the real size. */
export function formatUnsatisfiedContentRange(sizeBytes: number): string {
  return `bytes */${sizeBytes}`;
}

// ── Range reading ────────────────────────────────────────────────────────────

export interface MediaByteRange {
  /** Inclusive first byte. */
  readonly start: number;
  /** Inclusive last byte. */
  readonly end: number;
}

/**
 * Cap on the BUFFERED read helper only. Streaming has no such cap because it
 * never holds the object in memory; this exists so a caller that reaches for the
 * convenient buffered path cannot accidentally allocate a whole video.
 */
export const MAX_MEDIA_BUFFERED_RANGE_BYTES = 8 * 1024 * 1024;

/** Shape-only: integral, non-negative, non-inverted. Cheap and object-free. */
function assertWellFormedRange(range: MediaByteRange): void {
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start
  ) {
    throw new MediaStorageError(
      "range_not_satisfiable",
      "Requested byte range is not a well-formed inclusive range.",
    );
  }
}

/** Bounds check against the object that actually exists on disk. */
function assertWithinObject(range: MediaByteRange, sizeBytes: number): void {
  if (sizeBytes === 0 || range.end >= sizeBytes) {
    throw new MediaStorageError(
      "range_not_satisfiable",
      "Requested byte range is not satisfiable for this object.",
    );
  }
}

export interface OpenMediaByteRangeResult {
  /** A lazy stream over exactly `[start, end]`. The whole object is never read. */
  readonly stream: Readable;
  readonly start: number;
  readonly end: number;
  readonly length: number;
  readonly sizeBytes: number;
}

/**
 * THE honest core of ADR §4.
 *
 * Opens a stream over a byte slice, so the process reads only the requested
 * window — the file is never materialised. `end` is inclusive on both sides of
 * the boundary, which is why it maps onto HTTP `Content-Range` with no
 * arithmetic.
 *
 * ONE OPEN, ONE DESCRIPTOR. The previous implementation stat'ed a pathname and
 * then handed the SAME pathname to `createReadStream`, which opened it a second
 * time — so everything proven by the stat was proven about a file that the
 * stream was not guaranteed to be reading. Now the descriptor produced by
 * validation is the descriptor the stream is built on, and the size reported to
 * the caller is that descriptor's `fstat` size. The stream owns the descriptor
 * and closes it when it ends, errors or is destroyed (which is what the routes'
 * `req.signal` abort handler triggers).
 *
 * Fails closed on a non-`local` provider: `minio`/`s3` construct fine but every
 * method rejects and no SDK is installed (ADR §2.4). Falling back to a
 * whole-object read there would trade a loud failure for a silent memory blowup.
 *
 * Returns `null` when the object cannot be served for ANY reason.
 */
export async function openMediaByteRange(
  key: string,
  range?: MediaByteRange,
): Promise<OpenMediaByteRangeResult | null> {
  requireLocalProvider();
  const opened = await openSecureFile(secureReadInput(key));
  if (!opened.ok) return null;

  const file: SecureFile = opened.file;
  try {
    const effective: MediaByteRange = range ?? { start: 0, end: Math.max(file.sizeBytes - 1, 0) };
    assertWellFormedRange(effective);
    assertWithinObject(effective, file.sizeBytes);

    const stream = file.createReadStream(effective);
    return {
      stream,
      start: effective.start,
      end: effective.end,
      length: effective.end - effective.start + 1,
      sizeBytes: file.sizeBytes,
    };
  } catch (error) {
    // The descriptor was never handed to a stream, so this function still owns
    // it. An unsatisfiable range must not leak one.
    await file.close();
    throw error;
  }
}

/**
 * Bounded buffered slice — for a subtitle cue window, a checksum probe or a
 * test, where a stream is more machinery than the caller needs.
 *
 * Reads positionally from the ONE descriptor the primitive opened and proved,
 * into a ZERO-FILLED buffer: `Buffer.allocUnsafe` would risk returning
 * uninitialised process memory if the file were truncated after the `fstat`.
 * The descriptor is closed in a `finally` inside the primitive.
 *
 * Returns `null` when the object cannot be served for ANY reason.
 */
export async function readMediaByteRange(
  key: string,
  range: MediaByteRange,
): Promise<Buffer | null> {
  requireLocalProvider();
  const input = secureReadInput(key);

  // The cap is checked BEFORE touching the filesystem: an absurd request must
  // not be able to make the server do work, let alone allocate for it.
  assertWellFormedRange(range);
  const length = range.end - range.start + 1;
  if (length > MAX_MEDIA_BUFFERED_RANGE_BYTES) {
    throw new MediaStorageError(
      "range_too_large",
      `Buffered range reads are capped at ${MAX_MEDIA_BUFFERED_RANGE_BYTES} bytes; stream instead.`,
    );
  }

  const opened = await openSecureFile(input);
  if (!opened.ok) return null;
  try {
    assertWithinObject(range, opened.file.sizeBytes);
    return await opened.file.read(range);
  } finally {
    await opened.file.close();
  }
}
