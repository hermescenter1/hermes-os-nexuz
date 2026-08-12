import { describe, it, expect } from "vitest";
import {
  MAX_MEDIA_POSTER_BYTES,
  MAX_MEDIA_SUBTITLE_BYTES,
  MAX_MEDIA_UPLOAD_BYTES,
  MEDIA_ACCEPTED_CONTENT_TYPES,
  MEDIA_MAGIC_SNIFF_BYTES,
  canonicalExtensionFor,
  isAllowedMediaExtension,
  mediaExtensionOf,
  mediaExtensionsFor,
  normalizeMimeType,
  resolveMediaType,
  sanitizeMediaDisplayName,
  validateMediaUpload,
} from "../validation";

/**
 * PHASE 102 — media upload validation.
 *
 * The point of this suite is the gap between "the client says it is a video"
 * and "the bytes are a video". Every spoofing case below is a file the existing
 * document validator would have accepted.
 */

// ── Byte fixtures ────────────────────────────────────────────────────────────

/** Pads to the sniff window so fixtures exercise the real call shape. */
function head(...parts: Array<Buffer | string | number[]>): Buffer {
  const buffers = parts.map((part) => {
    if (Buffer.isBuffer(part)) return part;
    if (typeof part === "string") return Buffer.from(part, "latin1");
    return Buffer.from(part);
  });
  const joined = Buffer.concat(buffers);
  if (joined.length >= MEDIA_MAGIC_SNIFF_BYTES) return joined;
  return Buffer.concat([joined, Buffer.alloc(MEDIA_MAGIC_SNIFF_BYTES - joined.length)]);
}

/** A 32-byte `ftyp` box declaring the `isom` major brand. */
const MP4_HEAD = head([0x00, 0x00, 0x00, 0x20], "ftypisomisomiso2avc1mp41");
const M4V_HEAD = head([0x00, 0x00, 0x00, 0x20], "ftypM4V M4V mp42");
const EBML = [0x1a, 0x45, 0xdf, 0xa3];
const WEBM_HEAD = head(EBML, [0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84], "webm");
const MKV_HEAD = head(EBML, [0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x88], "matroska");
const OGG_HEAD = head("OggS", [0x00, 0x02, 0x00, 0x00]);
const VTT_HEAD = head("WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nHello\n");
const PNG_HEAD = head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEAD = head([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_HEAD = head("RIFF", [0x24, 0x00, 0x00, 0x00], "WEBPVP8 ");

/** A shell script. This is the canonical spoofing payload. */
const SHELL_SCRIPT_HEAD = head("#!/bin/sh\nrm -rf / --no-preserve-root\n");
/** An HTML document — dangerous precisely because a browser would render it. */
const HTML_HEAD = head("<!doctype html><script>alert(document.cookie)</script>");

function candidate(overrides: Partial<Parameters<typeof validateMediaUpload>[0]> = {}) {
  return {
    filename: "training.mp4",
    declaredMimeType: "video/mp4",
    sizeBytes: 1024,
    head: MP4_HEAD,
    ...overrides,
  };
}

// ── Happy paths ──────────────────────────────────────────────────────────────

describe("validateMediaUpload — accepted containers", () => {
  it("accepts a real MP4 and asserts the canonical content type, not the client's", () => {
    const result = validateMediaUpload(candidate({ declaredMimeType: "video/mp4; codecs=avc1.4d" }));
    expect(result).toEqual({
      ok: true,
      kind: "video",
      contentType: "video/mp4",
      extension: "mp4",
      displayName: "training.mp4",
    });
  });

  it("normalises .m4v onto the mp4 rule so the storage key extension is canonical", () => {
    const result = validateMediaUpload(
      candidate({ filename: "clip.m4v", declaredMimeType: "video/x-m4v", head: M4V_HEAD }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.extension).toBe("mp4");
  });

  it("accepts WebM, Matroska and Ogg", () => {
    expect(
      validateMediaUpload(
        candidate({ filename: "a.webm", declaredMimeType: "video/webm", head: WEBM_HEAD }),
      ).ok,
    ).toBe(true);
    expect(
      validateMediaUpload(
        candidate({ filename: "a.mkv", declaredMimeType: "video/x-matroska", head: MKV_HEAD }),
      ).ok,
    ).toBe(true);
    expect(
      validateMediaUpload(
        candidate({ filename: "a.ogv", declaredMimeType: "video/ogg", head: OGG_HEAD }),
      ).ok,
    ).toBe(true);
  });

  it("accepts a WebVTT subtitle track and classifies it as a subtitle", () => {
    const result = validateMediaUpload(
      candidate({ filename: "fa.vtt", declaredMimeType: "text/vtt", head: VTT_HEAD }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("subtitle");
  });

  it("accepts PNG, JPEG and WebP posters", () => {
    for (const [filename, mime, bytes] of [
      ["p.png", "image/png", PNG_HEAD],
      ["p.jpg", "image/jpeg", JPEG_HEAD],
      ["p.webp", "image/webp", WEBP_HEAD],
    ] as const) {
      const result = validateMediaUpload(
        candidate({ filename, declaredMimeType: mime, head: bytes }),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.kind).toBe("poster");
    }
  });

  it("accepts a WebVTT file that carries a UTF-8 BOM", () => {
    const withBom = head(Buffer.from([0xef, 0xbb, 0xbf]), "WEBVTT\n\ncue\n");
    const result = validateMediaUpload(
      candidate({ filename: "en.vtt", declaredMimeType: "text/vtt", head: withBom }),
    );
    expect(result.ok).toBe(true);
  });
});

// ── Magic-byte spoofing ──────────────────────────────────────────────────────

describe("validateMediaUpload — magic-byte spoofing", () => {
  it("rejects a shell script declared as video/mp4", () => {
    const result = validateMediaUpload(
      candidate({ filename: "innocent.mp4", declaredMimeType: "video/mp4", head: SHELL_SCRIPT_HEAD }),
    );
    expect(result).toEqual({ ok: false, reason: "magic_bytes_mismatch" });
  });

  it("rejects an HTML document declared as video/webm", () => {
    const result = validateMediaUpload(
      candidate({ filename: "x.webm", declaredMimeType: "video/webm", head: HTML_HEAD }),
    );
    expect(result).toEqual({ ok: false, reason: "magic_bytes_mismatch" });
  });

  it("rejects an MP4 whose bytes are actually WebM", () => {
    const result = validateMediaUpload(
      candidate({ filename: "x.mp4", declaredMimeType: "video/mp4", head: WEBM_HEAD }),
    );
    expect(result).toEqual({ ok: false, reason: "magic_bytes_mismatch" });
  });

  it("rejects a Matroska file declared as WebM when the DocType disagrees", () => {
    const result = validateMediaUpload(
      candidate({ filename: "x.webm", declaredMimeType: "video/webm", head: MKV_HEAD }),
    );
    expect(result).toEqual({ ok: false, reason: "magic_bytes_mismatch" });
  });

  it("rejects a bare 'ftyp' with an unknown major brand", () => {
    const bogus = head([0x00, 0x00, 0x00, 0x20], "ftypEVIL");
    const result = validateMediaUpload(candidate({ head: bogus }));
    expect(result).toEqual({ ok: false, reason: "magic_bytes_mismatch" });
  });

  it("rejects an implausible ftyp box header even with a known brand", () => {
    // Box size 1 is far below the 16-byte minimum for a `ftyp` box.
    const bogus = head([0x00, 0x00, 0x00, 0x01], "ftypisom");
    const result = validateMediaUpload(candidate({ head: bogus }));
    expect(result).toEqual({ ok: false, reason: "magic_bytes_mismatch" });
  });

  it("rejects a non-WebVTT text file declared as text/vtt, with a subtitle-specific reason", () => {
    const notVtt = head("<?xml version=\"1.0\"?><tt xmlns=\"http://www.w3.org/ns/ttml\">");
    const result = validateMediaUpload(
      candidate({ filename: "fa.vtt", declaredMimeType: "text/vtt", head: notVtt }),
    );
    expect(result).toEqual({ ok: false, reason: "subtitle_not_webvtt" });
  });

  it("rejects 'WEBVTTEVIL' — the signature must be terminated by whitespace or EOF", () => {
    const result = validateMediaUpload(
      candidate({ filename: "fa.vtt", declaredMimeType: "text/vtt", head: head("WEBVTTEVIL") }),
    );
    expect(result).toEqual({ ok: false, reason: "subtitle_not_webvtt" });
  });

  it("rejects a truncated prefix rather than guessing", () => {
    const result = validateMediaUpload(candidate({ head: Buffer.from([0x00, 0x00]) }));
    expect(result).toEqual({ ok: false, reason: "bytes_too_short" });
  });
});

// ── Type allow-list ──────────────────────────────────────────────────────────

describe("resolveMediaType — allow-list is strictly narrower than the document one", () => {
  it("refuses application/octet-stream, which the document validator permits", () => {
    expect(resolveMediaType("application/octet-stream", "a.mp4")).toEqual({
      ok: false,
      reason: "unsupported_media_type",
    });
  });

  it("refuses document types that are legitimate elsewhere in the platform", () => {
    for (const [mime, name] of [
      ["application/pdf", "a.pdf"],
      ["text/plain", "a.txt"],
      ["text/markdown", "a.md"],
    ] as const) {
      expect(resolveMediaType(mime, name).ok).toBe(false);
    }
  });

  it("requires a declared MIME type — an empty one is not silently allowed", () => {
    expect(resolveMediaType("", "a.mp4")).toEqual({ ok: false, reason: "mime_type_required" });
  });

  it("rejects a MIME/extension disagreement", () => {
    expect(resolveMediaType("video/mp4", "a.webm")).toEqual({
      ok: false,
      reason: "mime_extension_mismatch",
    });
  });

  it("rejects an extensionless filename", () => {
    expect(resolveMediaType("video/mp4", "video")).toEqual({
      ok: false,
      reason: "unsupported_media_type",
    });
  });

  it("rejects executables outright, whatever they claim", () => {
    expect(resolveMediaType("application/x-msdownload", "a.exe").ok).toBe(false);
    expect(resolveMediaType("video/mp4", "a.exe").ok).toBe(false);
  });
});

// ── Size ─────────────────────────────────────────────────────────────────────

describe("validateMediaUpload — size ceilings", () => {
  it("documents the nginx-bound ceiling as 50 MB", () => {
    expect(MAX_MEDIA_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
  });

  it("rejects an oversized video", () => {
    const result = validateMediaUpload(candidate({ sizeBytes: MAX_MEDIA_UPLOAD_BYTES + 1 }));
    expect(result).toEqual({ ok: false, reason: "file_too_large" });
  });

  it("accepts a video exactly at the ceiling", () => {
    expect(validateMediaUpload(candidate({ sizeBytes: MAX_MEDIA_UPLOAD_BYTES })).ok).toBe(true);
  });

  it("rejects an empty file", () => {
    expect(validateMediaUpload(candidate({ sizeBytes: 0 }))).toEqual({
      ok: false,
      reason: "file_empty",
    });
  });

  it("rejects a negative or fractional declared size as malformed", () => {
    expect(validateMediaUpload(candidate({ sizeBytes: -1 })).ok).toBe(false);
    expect(validateMediaUpload(candidate({ sizeBytes: 1.5 }))).toEqual({
      ok: false,
      reason: "malformed_input",
    });
  });

  it("holds subtitles and posters to their own, much smaller ceilings", () => {
    expect(MAX_MEDIA_SUBTITLE_BYTES).toBeLessThan(MAX_MEDIA_UPLOAD_BYTES);
    expect(MAX_MEDIA_POSTER_BYTES).toBeLessThan(MAX_MEDIA_UPLOAD_BYTES);
    expect(
      validateMediaUpload(
        candidate({
          filename: "fa.vtt",
          declaredMimeType: "text/vtt",
          head: VTT_HEAD,
          sizeBytes: MAX_MEDIA_SUBTITLE_BYTES + 1,
        }),
      ),
    ).toEqual({ ok: false, reason: "file_too_large" });
    expect(
      validateMediaUpload(
        candidate({
          filename: "p.png",
          declaredMimeType: "image/png",
          head: PNG_HEAD,
          sizeBytes: MAX_MEDIA_POSTER_BYTES + 1,
        }),
      ),
    ).toEqual({ ok: false, reason: "file_too_large" });
  });
});

// ── Display filename ─────────────────────────────────────────────────────────

describe("sanitizeMediaDisplayName", () => {
  it("rejects a U+202E right-to-left override used to disguise an extension", () => {
    const rtlOverride = String.fromCharCode(0x202e);
    const disguised = `report${rtlOverride}gpj.exe`;
    expect(sanitizeMediaDisplayName(disguised)).toEqual({ ok: false, reason: "filename_invalid" });
    expect(
      validateMediaUpload(candidate({ filename: `${disguised}.mp4` })),
    ).toEqual({ ok: false, reason: "filename_invalid" });
  });

  it("rejects the whole bidi override/isolate family, not just U+202E", () => {
    for (const codePoint of [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x2066, 0x2069]) {
      const name = `a${String.fromCharCode(codePoint)}b.mp4`;
      expect(sanitizeMediaDisplayName(name).ok).toBe(false);
    }
  });

  it("PRESERVES ZWNJ and ZWJ — they are required for correct Persian rendering", () => {
    const zwnj = String.fromCharCode(0x200c);
    const persian = `آموزش${zwnj}ها.mp4`;
    const sanitized = sanitizeMediaDisplayName(persian);
    expect(sanitized.ok).toBe(true);
    if (sanitized.ok) expect(sanitized.value).toBe(persian);
    expect(validateMediaUpload(candidate({ filename: persian })).ok).toBe(true);
  });

  it("rejects NUL and other control characters", () => {
    expect(sanitizeMediaDisplayName(`a${String.fromCharCode(0)}b.mp4`).ok).toBe(false);
    expect(sanitizeMediaDisplayName(`a${String.fromCharCode(0x1b)}[31m.mp4`).ok).toBe(false);
    expect(sanitizeMediaDisplayName(`a${String.fromCharCode(0x7f)}.mp4`).ok).toBe(false);
    expect(sanitizeMediaDisplayName(`line1${String.fromCharCode(10)}line2.mp4`).ok).toBe(false);
  });

  it("rejects path separators and traversal shapes", () => {
    for (const name of ["../../etc/passwd", "a/b.mp4", "a\\b.mp4", "..mp4", "x..y.mp4"]) {
      expect(sanitizeMediaDisplayName(name)).toEqual({ ok: false, reason: "filename_invalid" });
    }
  });

  it("strips a leading dot rather than persisting a hidden-file name", () => {
    expect(sanitizeMediaDisplayName(".profile.mp4")).toEqual({ ok: true, value: "profile.mp4" });
  });

  it("rejects empty, whitespace-only and absurdly long names", () => {
    expect(sanitizeMediaDisplayName("")).toEqual({ ok: false, reason: "filename_required" });
    expect(sanitizeMediaDisplayName("   ")).toEqual({ ok: false, reason: "filename_required" });
    expect(sanitizeMediaDisplayName(`${"a".repeat(256)}.mp4`)).toEqual({
      ok: false,
      reason: "filename_too_long",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeMediaDisplayName("  clip.mp4  ")).toEqual({ ok: true, value: "clip.mp4" });
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

describe("helpers", () => {
  it("normalizeMimeType strips parameters and lower-cases", () => {
    expect(normalizeMimeType("Video/MP4; codecs=\"avc1\"")).toBe("video/mp4");
  });

  it("mediaExtensionOf returns a dot-less lower-case extension", () => {
    expect(mediaExtensionOf("A.MP4")).toBe("mp4");
    expect(mediaExtensionOf("noext")).toBe("");
  });

  it("isAllowedMediaExtension mirrors the rule table", () => {
    expect(isAllowedMediaExtension("mp4")).toBe(true);
    expect(isAllowedMediaExtension("MP4")).toBe(true);
    expect(isAllowedMediaExtension("pdf")).toBe(false);
    expect(isAllowedMediaExtension("exe")).toBe(false);
  });

  it("canonicalExtensionFor maps a content type to the key extension", () => {
    expect(canonicalExtensionFor("video/mp4")).toBe("mp4");
    expect(canonicalExtensionFor("video/x-m4v")).toBe("mp4");
    expect(canonicalExtensionFor("text/vtt")).toBe("vtt");
    expect(canonicalExtensionFor("application/pdf")).toBeNull();
  });

  it("mediaExtensionsFor partitions the table by kind", () => {
    expect(mediaExtensionsFor("subtitle")).toEqual(["vtt"]);
    expect(mediaExtensionsFor("video")).toContain("webm");
    expect(mediaExtensionsFor("poster")).toContain("png");
  });

  it("never advertises application/octet-stream as an accepted type", () => {
    expect(MEDIA_ACCEPTED_CONTENT_TYPES).not.toContain("application/octet-stream");
  });
});
