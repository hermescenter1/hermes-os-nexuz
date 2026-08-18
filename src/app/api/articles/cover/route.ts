import { NextResponse }   from "next/server";
import { writeFile }      from "fs/promises";
import { join }           from "path";
import { getCurrentUser } from "@/lib/auth/session";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import {
  ARTICLE_COVER_MAX_BYTES,
  articleUploadsDir,
  coverUrlForFilename,
  ensureArticleUploadsDir,
  mintCoverFilename,
  sniffImageMime,
} from "@/lib/articles/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cover-image upload for the Journal article writer.
 *
 * Authenticated authors only — the same identity gate the writer page itself
 * uses. It is deliberately NOT scoped to an article id: the writer creates the
 * article and its cover in one pass, so the image has to exist before there is
 * a row to attach it to. The returned URL is held in the writer's form state
 * and persisted by POST /api/articles/submit, which re-validates that the value
 * is a URL this service minted before it ever reaches the database.
 *
 * Because an upload can therefore outlive a form the author abandons, the
 * `article-cover-upload` bucket bounds how much an authenticated account can
 * leave behind (see the note on that bucket in lib/auth/rate-limiter.ts).
 *
 * Storage is the durable `uploads_data` volume that docker-compose.prod.yml
 * already mounts at /app/public/uploads for author avatars — article covers get
 * their own subdirectory under it. No new volume, no object-storage adapter,
 * and no image bytes in Postgres.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Keyed by the authenticated user, not the IP: several authors behind one
  // plant NAT must not share an upload budget.
  if (!await checkRateLimit("article-cover-upload", user.id)) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: retryAfter("article-cover-upload", user.id) },
      { status: 429 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const file = formData.get("cover");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  // Cheap declared-size check before buffering anything.
  if (file.size > ARTICLE_COVER_MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Re-check the real length — `file.size` is metadata from the multipart
  // parser, the buffer is the thing actually being written.
  if (bytes.byteLength > ARTICLE_COVER_MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }

  // CONTENT decides the type, not `file.type` and not the filename extension.
  // An SVG, an HTML document or a script renamed to .png fails here, which is
  // why SVG needs no special-case rejection: it simply never sniffs as one of
  // the three raster formats.
  const mime = sniffImageMime(bytes);
  if (!mime) {
    return NextResponse.json({ error: "unsupported_image" }, { status: 415 });
  }

  // The stored name is minted from random bytes plus an extension derived from
  // the sniffed type. The uploader's filename is never used for anything, so
  // traversal sequences, null bytes and double extensions in it are inert.
  const filename = mintCoverFilename(mime);

  try {
    await ensureArticleUploadsDir();
    await writeFile(join(articleUploadsDir(), filename), bytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[api/articles/cover] write failed user=${user.id} error=${msg}`);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, url: coverUrlForFilename(filename), mime });
}
