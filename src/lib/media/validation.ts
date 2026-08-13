import path from "path";
import { z } from "zod";

/**
 * PHASE 102 — Hermes Media & Video Hub: upload validation.
 *
 * Design authority: docs/phase102/architecture.md §7.
 *
 * WHY THIS IS NOT `src/lib/documents/validation.ts`
 * -------------------------------------------------
 * The document validator trusts the client-declared MIME type, performs no
 * byte-level check at all, and explicitly permits `application/octet-stream`
 * because OS file pickers report it for `.md`/`.docx`. That is a deliberate
 * trade-off for a text-extraction pipeline; it is NOT acceptable for bytes that
 * will later be streamed back to a browser under a `Content-Type` the server
 * itself asserts. Widening that allow-list with video extensions would extend an
 * already-unverified surface to a much more dangerous one, so Phase 102 keeps a
 * SEPARATE, strictly smaller allow-list and verifies the actual leading bytes.
 *
 * Three properties this module holds that the document validator does not:
 *
 *   1. A declared MIME type is mandatory, must be on the allow-list, and must
 *      agree with the filename extension. `application/octet-stream` is refused.
 *   2. The bytes are sniffed. A file declared `video/mp4` whose first bytes are
 *      `#!/bin/sh` is rejected, not stored and later served as video.
 *   3. The `Content-Type` a route later sends is the CANONICAL type from this
 *      table — never the client's string echoed back.
 *
 * No new npm dependency: the signature table is a handful of `Buffer` reads.
 */

// ── Size ceilings ────────────────────────────────────────────────────────────

/**
 * The effective upload ceiling for media bytes.
 *
 * IMPORTANT — raising this constant ALONE is a silent no-op. nginx terminates
 * every request in front of Next.js with `client_max_body_size 50M`
 * (`deploy/nginx/default.conf:43`), so a larger body is rejected with a 413
 * before any application code — including this module — ever observes it
 * (ADR §2.1). Raising the real ceiling is an infrastructure change with a
 * documented impact assessment, not an edit here.
 */
export const MAX_MEDIA_UPLOAD_BYTES = 50 * 1024 * 1024;

/** WebVTT is plain text; a subtitle track far larger than this is not a subtitle. */
export const MAX_MEDIA_SUBTITLE_BYTES = 2 * 1024 * 1024;

/** A poster still frame. Well under the video ceiling on purpose. */
export const MAX_MEDIA_POSTER_BYTES = 5 * 1024 * 1024;

/**
 * How many leading bytes a caller must hand to {@link validateMediaUpload}.
 *
 * 64 rather than 12 because the Matroska/WebM `DocType` string sits inside the
 * EBML header rather than at a fixed offset; reading a slightly larger prefix
 * lets us tell a WebM apart from a generic Matroska file instead of accepting
 * both on the shared 4-byte magic alone. Callers with a shorter file simply
 * pass the whole file.
 */
export const MEDIA_MAGIC_SNIFF_BYTES = 64;

// ── Vocabularies ─────────────────────────────────────────────────────────────

export const MEDIA_UPLOAD_KINDS = ["video", "subtitle", "poster"] as const;
export type MediaUploadKind = (typeof MEDIA_UPLOAD_KINDS)[number];

/**
 * Enumerated, non-echoing failure codes. A reason NEVER contains user input —
 * same discipline as the document validator and the AI router: the caller maps
 * a code to a translated message, so a hostile filename can never be reflected.
 */
export const MEDIA_VALIDATION_REASONS = [
  "filename_required",
  "filename_too_long",
  "filename_invalid",
  "mime_type_required",
  "unsupported_media_type",
  "mime_extension_mismatch",
  "file_empty",
  "file_too_large",
  "bytes_too_short",
  "magic_bytes_mismatch",
  "subtitle_not_webvtt",
  "malformed_input",
] as const;
export type MediaValidationReason = (typeof MEDIA_VALIDATION_REASONS)[number];

// ── Signature verifiers ──────────────────────────────────────────────────────

/**
 * A signature verifier reads only the leading bytes it needs. It returns
 * `false` — never throws — so an unexpected/truncated prefix fails CLOSED.
 */
type SignatureVerifier = (head: Buffer) => boolean;

function ascii(head: Buffer, start: number, end: number): string {
  // `latin1` maps bytes 1:1 to code units, so a comparison against an ASCII
  // literal is exact and never depends on a decoder guessing an encoding.
  return head.toString("latin1", start, end);
}

/**
 * ISO-BMFF (`.mp4`/`.m4v`): a `ftyp` box at offset 4 whose major brand is one
 * we are prepared to serve. The 4-byte big-endian box size at offset 0 is also
 * checked: a `ftyp` box is at minimum 16 bytes (size + type + brand + version),
 * so a file that merely happens to contain the ASCII "ftyp" at offset 4 without
 * a plausible box header is refused.
 */
const MP4_MAJOR_BRANDS: ReadonlySet<string> = new Set([
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "iso8",
  "mp41",
  "mp42",
  "avc1",
  "dash",
  "mmp4",
  "M4V ",
  "M4VP",
  "M4VH",
]);

const verifyMp4: SignatureVerifier = (head) => {
  if (head.length < 12) return false;
  if (ascii(head, 4, 8) !== "ftyp") return false;
  const boxSize = head.readUInt32BE(0);
  if (boxSize < 16 || boxSize % 4 !== 0) return false;
  return MP4_MAJOR_BRANDS.has(ascii(head, 8, 12));
};

/** EBML magic shared by WebM and Matroska. */
const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

/**
 * EBML container with a `DocType` cross-check.
 *
 * WebM and Matroska share one 4-byte magic, so the magic alone cannot tell them
 * apart. The `DocType` element ("webm" or "matroska") normally appears within
 * the first few dozen bytes. Policy, stated explicitly because it is a
 * trade-off: if a *conflicting* DocType is found the file is REJECTED; if
 * NEITHER string appears inside the sniff window we accept on the EBML magic
 * alone rather than reject a valid file with an unusually long header. We never
 * accept a mismatch we actually detected.
 */
function verifyEbml(expectedDocType: "webm" | "matroska"): SignatureVerifier {
  return (head) => {
    if (head.length < EBML_MAGIC.length) return false;
    if (!head.subarray(0, EBML_MAGIC.length).equals(EBML_MAGIC)) return false;
    const window = ascii(head, 0, head.length);
    const other = expectedDocType === "webm" ? "matroska" : "webm";
    if (window.includes(expectedDocType)) return true;
    if (window.includes(other)) return false;
    return true;
  };
}

/** Ogg: the "OggS" capture pattern plus the mandatory stream-structure version 0. */
const verifyOgg: SignatureVerifier = (head) => {
  if (head.length < 5) return false;
  if (ascii(head, 0, 4) !== "OggS") return false;
  return head[4] === 0x00;
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const verifyPng: SignatureVerifier = (head) =>
  head.length >= PNG_MAGIC.length && head.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);

const verifyJpeg: SignatureVerifier = (head) =>
  head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;

/** RIFF container whose form type is WEBP. */
const verifyWebp: SignatureVerifier = (head) =>
  head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * WebVTT: the file must literally begin with "WEBVTT" (an optional UTF-8 BOM is
 * permitted, as the WebVTT syntax allows one), and the signature must be
 * terminated by whitespace or end-of-file so that "WEBVTTFOO" is not accepted.
 */
const verifyWebVtt: SignatureVerifier = (head) => {
  const body = head.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)
    ? head.subarray(UTF8_BOM.length)
    : head;
  if (body.length < 6) return false;
  if (ascii(body, 0, 6) !== "WEBVTT") return false;
  if (body.length === 6) return true;
  const next = body[6];
  return next === 0x20 || next === 0x09 || next === 0x0a || next === 0x0d;
};

// ── The allow-list ───────────────────────────────────────────────────────────

export interface MediaTypeRule {
  /** The canonical `Content-Type` the server asserts. Never the client string. */
  readonly contentType: string;
  readonly kind: MediaUploadKind;
  /** Additional client-reported MIME strings that resolve to this rule. */
  readonly mimeAliases: readonly string[];
  /** Lower-case, dot-less extensions accepted for this rule. */
  readonly extensions: readonly string[];
  readonly maxBytes: number;
  /** Bytes that must be available before the signature can be judged. */
  readonly minHeadBytes: number;
  readonly verify: SignatureVerifier;
}

/**
 * Deliberately small. Every entry is a container a browser can play back
 * progressively over HTTP Range (ADR §4), a WebVTT track, or a poster still.
 *
 * NOT present, on purpose: `application/octet-stream` (unverifiable),
 * QuickTime/AVI/FLV (no reliable in-browser playback, so storing them would
 * promise something the player cannot deliver), and every audio-only container
 * (Phase 102 is a video hub; adding audio means adding a UI that does not exist).
 */
const MEDIA_TYPE_RULES: readonly MediaTypeRule[] = [
  {
    contentType: "video/mp4",
    kind: "video",
    mimeAliases: ["video/x-m4v"],
    extensions: ["mp4", "m4v"],
    maxBytes: MAX_MEDIA_UPLOAD_BYTES,
    minHeadBytes: 12,
    verify: verifyMp4,
  },
  {
    contentType: "video/webm",
    kind: "video",
    mimeAliases: [],
    extensions: ["webm"],
    maxBytes: MAX_MEDIA_UPLOAD_BYTES,
    minHeadBytes: 4,
    verify: verifyEbml("webm"),
  },
  {
    contentType: "video/x-matroska",
    kind: "video",
    mimeAliases: ["video/x-mkv", "video/matroska"],
    extensions: ["mkv"],
    maxBytes: MAX_MEDIA_UPLOAD_BYTES,
    minHeadBytes: 4,
    verify: verifyEbml("matroska"),
  },
  {
    contentType: "video/ogg",
    kind: "video",
    mimeAliases: [],
    extensions: ["ogv", "ogg"],
    maxBytes: MAX_MEDIA_UPLOAD_BYTES,
    minHeadBytes: 5,
    verify: verifyOgg,
  },
  {
    contentType: "text/vtt",
    kind: "subtitle",
    mimeAliases: [],
    extensions: ["vtt"],
    maxBytes: MAX_MEDIA_SUBTITLE_BYTES,
    minHeadBytes: 6,
    verify: verifyWebVtt,
  },
  {
    contentType: "image/png",
    kind: "poster",
    mimeAliases: [],
    extensions: ["png"],
    maxBytes: MAX_MEDIA_POSTER_BYTES,
    minHeadBytes: 8,
    verify: verifyPng,
  },
  {
    contentType: "image/jpeg",
    kind: "poster",
    mimeAliases: ["image/jpg"],
    extensions: ["jpg", "jpeg"],
    maxBytes: MAX_MEDIA_POSTER_BYTES,
    minHeadBytes: 3,
    verify: verifyJpeg,
  },
  {
    contentType: "image/webp",
    kind: "poster",
    mimeAliases: [],
    extensions: ["webp"],
    maxBytes: MAX_MEDIA_POSTER_BYTES,
    minHeadBytes: 12,
    verify: verifyWebp,
  },
];

const RULES_BY_MIME: ReadonlyMap<string, MediaTypeRule> = new Map(
  MEDIA_TYPE_RULES.flatMap((rule) =>
    [rule.contentType, ...rule.mimeAliases].map((mime) => [mime, rule] as const),
  ),
);

const RULES_BY_EXTENSION: ReadonlyMap<string, MediaTypeRule> = new Map(
  MEDIA_TYPE_RULES.flatMap((rule) =>
    rule.extensions.map((extension) => [extension, rule] as const),
  ),
);

/** Canonical content types, for a route's `accept` attribute or an API contract. */
export const MEDIA_ACCEPTED_CONTENT_TYPES: readonly string[] = MEDIA_TYPE_RULES.map(
  (rule) => rule.contentType,
);

/** Every extension this module will accept, for any kind. */
export const MEDIA_ACCEPTED_EXTENSIONS: readonly string[] = Array.from(RULES_BY_EXTENSION.keys());

export function isAllowedMediaExtension(extension: string): boolean {
  return RULES_BY_EXTENSION.has(extension.toLowerCase());
}

export function mediaExtensionsFor(kind: MediaUploadKind): readonly string[] {
  return MEDIA_TYPE_RULES.filter((rule) => rule.kind === kind).flatMap((rule) => rule.extensions);
}

/** The canonical extension a server-generated storage key should carry. */
export function canonicalExtensionFor(contentType: string): string | null {
  const rule = RULES_BY_MIME.get(normalizeMimeType(contentType));
  return rule?.extensions[0] ?? null;
}

// ── Filename handling (DISPLAY ONLY) ─────────────────────────────────────────

/**
 * The storage key is ALWAYS server-generated (see `storage.ts`), so nothing
 * here can influence a filesystem path. This governs the human-readable name
 * persisted alongside the row and rendered in a download link — where the real
 * risks are homograph/extension-disguise attacks and control-character
 * injection into logs, not traversal.
 */
const MAX_DISPLAY_NAME_LENGTH = 255;

/**
 * Bidirectional formatting controls. U+202E (RIGHT-TO-LEFT OVERRIDE) is the
 * classic extension-disguise vector: "report‮gpj.exe" renders as
 * "reportexe.jpg". The isolate/embedding family is included because it disguises
 * text just as effectively.
 *
 * NOT rejected: U+200C ZWNJ and U+200D ZWJ. Both are required for correct
 * Persian and Arabic-script rendering (CLAUDE.md mandates correct ZWNJ usage),
 * so banning them would corrupt legitimate Persian filenames.
 */
function isBidiControl(codePoint: number): boolean {
  return (
    codePoint === 0x061c || // ARABIC LETTER MARK
    codePoint === 0x200e || // LEFT-TO-RIGHT MARK
    codePoint === 0x200f || // RIGHT-TO-LEFT MARK
    (codePoint >= 0x202a && codePoint <= 0x202e) || // LRE RLE PDF LRO RLO
    (codePoint >= 0x2066 && codePoint <= 0x2069) // LRI RLI FSI PDI
  );
}

function isForbiddenInvisible(codePoint: number): boolean {
  return (
    codePoint === 0x200b || // ZERO WIDTH SPACE
    codePoint === 0xfeff // ZERO WIDTH NO-BREAK SPACE / BOM
  );
}

/** C0 controls (including NUL), DEL, and the C1 block. */
function isControlCharacter(codePoint: number): boolean {
  return codePoint <= 0x1f || codePoint === 0x7f || (codePoint >= 0x80 && codePoint <= 0x9f);
}

export type MediaDisplayNameResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: MediaValidationReason };

/**
 * Validates and normalises a display filename.
 *
 * Rejects loudly (rather than silently rewriting) for anything that indicates
 * an attack — control characters, NUL, path separators, `..`, bidi overrides —
 * because silently "fixing" a hostile name hides the attempt from the operator.
 * Only the benign leading-dot case is stripped: a leading dot marks a hidden
 * file on POSIX and adds nothing to a display name.
 */
export function sanitizeMediaDisplayName(raw: string): MediaDisplayNameResult {
  if (typeof raw !== "string") return { ok: false, reason: "filename_required" };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "filename_required" };
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) return { ok: false, reason: "filename_too_long" };

  for (const character of trimmed) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return { ok: false, reason: "filename_invalid" };
    if (isControlCharacter(codePoint)) return { ok: false, reason: "filename_invalid" };
    if (isBidiControl(codePoint)) return { ok: false, reason: "filename_invalid" };
    if (isForbiddenInvisible(codePoint)) return { ok: false, reason: "filename_invalid" };
  }

  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    return { ok: false, reason: "filename_invalid" };
  }

  const withoutLeadingDots = trimmed.replace(/^\.+/, "").trim();
  if (!withoutLeadingDots) return { ok: false, reason: "filename_invalid" };

  return { ok: true, value: withoutLeadingDots };
}

/** Lower-case extension without the dot; `""` when the name has none. */
export function mediaExtensionOf(filename: string): string {
  return path.extname(filename).replace(/^\./, "").toLowerCase();
}

/** Strips any `; codecs=…` parameters and lower-cases. */
export function normalizeMimeType(raw: string): string {
  const [base] = raw.split(";");
  return (base ?? "").trim().toLowerCase();
}

// ── Type resolution ──────────────────────────────────────────────────────────

export type MediaTypeResolution =
  | { readonly ok: true; readonly rule: MediaTypeRule; readonly extension: string }
  | { readonly ok: false; readonly reason: MediaValidationReason };

/**
 * Resolves the declared MIME + filename to exactly one allow-list rule.
 *
 * BOTH must agree. An extension-only check would let `evil.mp4` declared
 * `text/html` through; a MIME-only check would let a browser's optimistic guess
 * decide. The rule reached from the MIME must be the same object as the rule
 * reached from the extension.
 */
export function resolveMediaType(declaredMimeType: string, filename: string): MediaTypeResolution {
  const mime = normalizeMimeType(declaredMimeType);
  if (!mime) return { ok: false, reason: "mime_type_required" };

  const byMime = RULES_BY_MIME.get(mime);
  if (!byMime) return { ok: false, reason: "unsupported_media_type" };

  const extension = mediaExtensionOf(filename);
  if (!extension) return { ok: false, reason: "unsupported_media_type" };

  const byExtension = RULES_BY_EXTENSION.get(extension);
  if (!byExtension) return { ok: false, reason: "unsupported_media_type" };
  if (byExtension !== byMime) return { ok: false, reason: "mime_extension_mismatch" };

  return { ok: true, rule: byMime, extension };
}

// ── Size ─────────────────────────────────────────────────────────────────────

export type MediaSizeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: MediaValidationReason };

export function validateMediaSize(sizeBytes: number, rule: MediaTypeRule): MediaSizeResult {
  if (!Number.isFinite(sizeBytes) || !Number.isInteger(sizeBytes)) {
    return { ok: false, reason: "malformed_input" };
  }
  if (sizeBytes <= 0) return { ok: false, reason: "file_empty" };
  if (sizeBytes > rule.maxBytes) return { ok: false, reason: "file_too_large" };
  return { ok: true };
}

// ── Magic bytes ──────────────────────────────────────────────────────────────

export type MediaMagicResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: MediaValidationReason };

/**
 * Verifies the actual leading bytes against the rule's signature. This is the
 * check that makes a declared `Content-Type` mean something.
 */
export function verifyMediaMagicBytes(rule: MediaTypeRule, head: Buffer): MediaMagicResult {
  if (!Buffer.isBuffer(head)) return { ok: false, reason: "malformed_input" };
  if (head.length < rule.minHeadBytes) return { ok: false, reason: "bytes_too_short" };
  if (rule.verify(head)) return { ok: true };
  return {
    ok: false,
    // A subtitle failure gets its own code so the operator sees "this is not a
    // WebVTT file" rather than a generic container mismatch.
    reason: rule.kind === "subtitle" ? "subtitle_not_webvtt" : "magic_bytes_mismatch",
  };
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Structural guard on the non-byte fields. External input is validated with Zod
 * at the boundary per CLAUDE.md; the byte prefix is checked separately because
 * a `Buffer` is not a shape Zod describes usefully.
 */
const mediaUploadCandidateSchema = z.object({
  filename: z.string(),
  declaredMimeType: z.string(),
  sizeBytes: z.number(),
});

export interface MediaUploadCandidate {
  /** The client-supplied filename. Used for the DISPLAY name and the extension. */
  readonly filename: string;
  /** The client-supplied MIME type. Never trusted — cross-checked against bytes. */
  readonly declaredMimeType: string;
  /** Total size of the upload in bytes. */
  readonly sizeBytes: number;
  /**
   * The leading bytes of the upload — at least {@link MEDIA_MAGIC_SNIFF_BYTES},
   * or the whole file when it is shorter.
   */
  readonly head: Buffer;
}

export interface MediaUploadAccepted {
  readonly ok: true;
  readonly kind: MediaUploadKind;
  /** The CANONICAL content type. Persist and serve this, not the client's. */
  readonly contentType: string;
  /** The canonical extension for the server-generated storage key. */
  readonly extension: string;
  /** The sanitised display name. Safe to persist and render. */
  readonly displayName: string;
}

export interface MediaUploadRejected {
  readonly ok: false;
  readonly reason: MediaValidationReason;
}

export type MediaUploadValidationResult = MediaUploadAccepted | MediaUploadRejected;

/**
 * The single gate every media upload passes through.
 *
 * Order matters: cheap structural checks first, byte sniffing last, so a
 * hostile client cannot make the server do work by sending garbage.
 */
export function validateMediaUpload(
  candidate: MediaUploadCandidate,
): MediaUploadValidationResult {
  const parsed = mediaUploadCandidateSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, reason: "malformed_input" };
  if (!Buffer.isBuffer(candidate.head)) return { ok: false, reason: "malformed_input" };

  const displayName = sanitizeMediaDisplayName(candidate.filename);
  if (!displayName.ok) return { ok: false, reason: displayName.reason };

  const resolved = resolveMediaType(candidate.declaredMimeType, displayName.value);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  const size = validateMediaSize(candidate.sizeBytes, resolved.rule);
  if (!size.ok) return { ok: false, reason: size.reason };

  const magic = verifyMediaMagicBytes(resolved.rule, candidate.head);
  if (!magic.ok) return { ok: false, reason: magic.reason };

  return {
    ok: true,
    kind: resolved.rule.kind,
    contentType: resolved.rule.contentType,
    // The stored key uses the rule's canonical extension, so `foo.m4v` and
    // `foo.mp4` both land as `.mp4` and nothing downstream has to re-derive it.
    extension: resolved.rule.extensions[0] ?? resolved.extension,
    displayName: displayName.value,
  };
}
