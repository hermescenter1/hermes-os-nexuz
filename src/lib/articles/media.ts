/**
 * Journal article media — cover image storage contract.
 *
 * Server-only. Deliberately mirrors the author-avatar convention already in
 * production (`/api/articles/author-profile/avatar`): a random opaque filename
 * under `public/uploads/`, which docker-compose.prod.yml persists through the
 * `uploads_data` named volume mounted at `/app/public/uploads`. Article covers
 * get their OWN subdirectory so an article never shares a file with a profile
 * and cleanup can never touch avatar bytes.
 *
 * The one deliberate hardening over the avatar route: the declared MIME is
 * never trusted on its own. `sniffImageMime` reads the magic bytes and the
 * upload is rejected unless the CONTENT is a JPEG, PNG or WebP. That closes the
 * "rename evil.svg to cover.png" path — an SVG (or anything scriptable) fails
 * the sniff regardless of what the browser or the client claimed.
 */

import { mkdir, unlink } from "fs/promises";
import { join }   from "path";
import { randomBytes } from "crypto";

/** Content types accepted for an article cover. SVG is deliberately absent. */
export const ARTICLE_COVER_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type ArticleCoverMime = (typeof ARTICLE_COVER_MIME)[number];

/** 4MB — covers are hero images, larger than a 2MB avatar but still bounded. */
export const ARTICLE_COVER_MAX_BYTES = 4 * 1024 * 1024;

const EXT_BY_MIME: Record<ArticleCoverMime, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

/** Public URL prefix. Must stay in sync with `articleUploadsDir()`. */
export const ARTICLE_COVER_URL_PREFIX = "/uploads/articles/";

/**
 * Filenames this module mints: 32 lowercase hex characters plus a known
 * extension. Anchored, so nothing containing a path separator, traversal
 * sequence or second extension can match.
 */
const MANAGED_COVER_NAME = /^[0-9a-f]{32}\.(jpg|png|webp)$/;

/**
 * `process.cwd()` is `/app` in the Docker standalone build and the project root
 * in dev — the same assumption the avatar route documents.
 */
export function articleUploadsDir(): string {
  return join(process.cwd(), "public", "uploads", "articles");
}

/**
 * Create the cover directory if it is missing.
 *
 * This is required at runtime, not merely defensive. The Dockerfile creates
 * `articles/` in the image, but production mounts the named `uploads_data`
 * volume over `/app/public/uploads` — and Docker only seeds a volume from the
 * image on FIRST use. An environment whose volume already exists from an
 * earlier deploy would therefore mount a directory containing only `authors/`,
 * and the image's `articles/` would be shadowed. Creating it on demand is what
 * makes the first cover upload after this release succeed there.
 */
export async function ensureArticleUploadsDir(): Promise<void> {
  await mkdir(articleUploadsDir(), { recursive: true });
}

/**
 * Magic-byte content sniffing. Returns the real image type, or null when the
 * bytes are not one of the three accepted formats.
 *
 * Byte values are compared numerically rather than through string escapes so
 * the check cannot be perturbed by source-file encoding.
 */
export function sniffImageMime(bytes: Uint8Array): ArticleCoverMime | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  // WebP: "RIFF" .... "WEBP" (bytes 0-3 and 8-11)
  const RIFF = [0x52, 0x49, 0x46, 0x46];
  const WEBP = [0x57, 0x45, 0x42, 0x50];
  if (
    bytes.length >= 12 &&
    RIFF.every((b, i) => bytes[i] === b) &&
    WEBP.every((b, i) => bytes[8 + i] === b)
  ) {
    return "image/webp";
  }
  return null;
}

/** A fresh opaque filename. The uploader's filename is never used. */
export function mintCoverFilename(mime: ArticleCoverMime): string {
  return randomBytes(16).toString("hex") + "." + EXT_BY_MIME[mime];
}

/**
 * True only for a URL this module minted. Anything else — an absolute URL, an
 * avatar path, a traversal attempt, a hand-edited value — returns false, which
 * is what keeps `deleteCoverFile` from unlinking a file it does not own.
 */
export function isManagedCoverUrl(url: string | null | undefined): boolean {
  if (typeof url !== "string" || !url.startsWith(ARTICLE_COVER_URL_PREFIX)) return false;
  const name = url.slice(ARTICLE_COVER_URL_PREFIX.length);
  return MANAGED_COVER_NAME.test(name);
}

/** Public URL for a minted filename. */
export function coverUrlForFilename(filename: string): string {
  return ARTICLE_COVER_URL_PREFIX + filename;
}

/**
 * Best-effort removal of a cover file. Never throws and never rejects: a
 * missing or already-removed file is a normal outcome, and a failed unlink must
 * not fail the article mutation that triggered it.
 *
 * Covers are owned EXCLUSIVELY by one article — each upload mints a new file
 * and the previous one is released — so there is no shared-media or
 * reference-count case to consider here.
 */
export async function deleteCoverFile(url: string | null | undefined): Promise<void> {
  if (!isManagedCoverUrl(url)) return;
  const name = (url as string).slice(ARTICLE_COVER_URL_PREFIX.length);
  try {
    await unlink(join(articleUploadsDir(), name));
  } catch {
    /* already gone, or the volume is read-only — never surfaced to the caller */
  }
}
