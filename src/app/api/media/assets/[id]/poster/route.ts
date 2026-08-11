/**
 * PHASE 102 — Hermes Media & Video Hub: serving a stored poster still.
 *
 * Design authority: docs/phase102/architecture.md §4, §7 and §9.
 *
 * GET /api/media/assets/[id]/poster
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------
 * `MediaAsset.posterStorageKey` is a real column and the player, the card and
 * the hero all render a poster when one is given — but nothing served those
 * bytes, so every surface reported `posterUrl: null`. This is the missing GET.
 *
 * No poster is ever GENERATED. There is no ffmpeg and `sharp` is overrides-only
 * (ADR §9), so an asset with no uploaded still has no poster and this route says
 * so with a `404` rather than inventing a frame.
 *
 * AUTHORIZATION IS THE SHARED CHAIN
 * ---------------------------------
 * Delegated in full to `authorizeByteServing` in
 * `src/lib/media/byte-serving-auth.ts` — the same call, with the same arguments,
 * as ../stream and ../subtitles/[trackId]. A PUBLISHED + PUBLIC + READY asset
 * serves anonymously, anything else needs membership in the OWNING organization
 * plus `view_media`, a non-`READY` or `QUARANTINED` asset never serves a byte,
 * and every refusal is one bare `404`. The handler then re-asserts `view_media`
 * against the granted role as defence in depth.
 *
 * A poster is withheld from a non-`READY` asset deliberately, even though a
 * still is harmless on its own: `QUARANTINED` means nothing may vouch for any
 * bytes stored under that asset, and a poster is the one object in this model
 * that is rendered as an image rather than decoded by the media pipeline.
 *
 * THE CONTENT TYPE IS DERIVED, THEN PROVEN AGAINST THE BYTES
 * ----------------------------------------------------------
 * There is no poster content-type column, so the type is resolved from the
 * canonical extension carried by the server-generated storage key, restricted to
 * the POSTER half of the media allow-list. A key whose extension is a video
 * container therefore cannot be served here at all — a mis-set column can never
 * turn this route into a second, unmetered video surface.
 *
 * That is a claim about a FILENAME, so it is not enough on its own. Before a
 * byte reaches the client the route reads the object's magic-byte prefix FROM
 * THE SAME DESCRIPTOR the body will be streamed from and re-runs the media
 * allow-list over it, exactly as the subtitle route re-verifies WebVTT on the
 * way out. A `.webp` key whose bytes are a PNG — or a shell script — is refused,
 * so this server never asserts an image type over bytes that are not that image.
 * WebP in particular is judged on the full `RIFF....WEBP` form rather than a
 * four-byte `RIFF` prefix, which every RIFF container shares.
 *
 * ONE OPEN, ONE DESCRIPTOR
 * ------------------------
 * The route used to `statMediaObject(key)` and then `openMediaByteRange(key)` —
 * two independent resolutions of one pathname, which reopens the TOCTOU window
 * `src/lib/media/secure-read.ts` exists to close. It now calls
 * {@link openMediaObject} ONCE and takes the size, the magic-byte head and the
 * body stream from that single {@link SecureFile}.
 *
 * `Range` is not answered — an image needs no seeking — so `Accept-Ranges` is
 * deliberately not advertised, and an unhonoured `Range` header simply yields
 * the whole representation, which is always a valid response.
 */

import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import {
  boundStorageKey,
  MEDIA_BYTE_SERVING_PERMISSION,
  authorizeByteServing,
  byteServingHeaders,
  byteServingNotFound,
  byteServingRefusalResponse,
  byteServingUnavailable,
} from "@/lib/media/byte-serving-auth";
import type { SecureFile } from "@/lib/media/secure-read";
import { openMediaObject } from "@/lib/media/storage";
import {
  MAX_MEDIA_POSTER_BYTES,
  MEDIA_ACCEPTED_CONTENT_TYPES,
  MEDIA_MAGIC_SNIFF_BYTES,
  canonicalExtensionFor,
  mediaExtensionsFor,
  validateMediaUpload,
} from "@/lib/media/validation";
import { requirePermission } from "@/lib/org/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ────────────────────────────────────────────────────────────────

const POSTER_EXTENSIONS: ReadonlySet<string> = new Set(mediaExtensionsFor("poster"));

/**
 * canonical extension → canonical content type, for POSTER rules only.
 *
 * Derived from the allow-list rather than restated, so a rule added to or
 * removed from `validation.ts` is reflected here automatically and the two can
 * never drift. Storage keys are minted with the rule's CANONICAL extension
 * (`buildMediaStorageKey`), which is why a canonical-only map is complete and a
 * key carrying anything else is correctly refused.
 */
const POSTER_CONTENT_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map(
  MEDIA_ACCEPTED_CONTENT_TYPES.flatMap((contentType) => {
    const extension = canonicalExtensionFor(contentType);
    if (extension === null || !POSTER_EXTENSIONS.has(extension)) return [];
    return [[extension, contentType] as [string, string]];
  }),
);

// ── Helpers (declared before the handler: the Phase 99 static analysers slice a
//    handler body from its `export` to the next one) ─────────────────────────

/** The canonical image type for a validated poster key, or `null` if it is not one. */
function posterContentTypeFor(storageKey: string): string | null {
  const extension = storageKey.slice(storageKey.lastIndexOf(".") + 1).toLowerCase();
  return POSTER_CONTENT_TYPE_BY_EXTENSION.get(extension) ?? null;
}

/**
 * Re-run the media allow-list over the STORED bytes.
 *
 * The filename and MIME handed in are server constants derived from the
 * allow-list itself, so the resolution can only ever reach the poster rule this
 * key claims; what is actually being judged is the byte signature. A mismatch
 * between the claimed image type and the real container is therefore refused,
 * and so is any object whose bytes are not an image at all.
 */
function isServablePoster(params: {
  head: Buffer;
  sizeBytes: number;
  contentType: string;
  extension: string;
}): boolean {
  const validated = validateMediaUpload({
    filename: `poster.${params.extension}`,
    declaredMimeType: params.contentType,
    sizeBytes: params.sizeBytes,
    head: params.head,
  });
  if (!validated.ok) return false;
  if (validated.kind !== "poster") return false;
  // The type the bytes proved must be the type this response is going to assert.
  return validated.contentType === params.contentType;
}

/** Node stream → Web stream. The two `ReadableStream` declarations (lib.dom vs
 *  node:stream/web) are structurally identical but nominally distinct, which is
 *  the entire reason this assertion exists. */
function toResponseStream(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

/** Releases a descriptor the response is not going to use. */
async function release(file: SecureFile): Promise<void> {
  await file.close();
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: rawId } = await params;

  // ── 1. Authorization, entirely before storage is touched ──────────────────
  const gate = await authorizeByteServing({ req, assetId: rawId });
  if (!gate.ok) return byteServingRefusalResponse(gate);
  if (gate.actorRole !== null) {
    const permitted = requirePermission(gate.actorRole, MEDIA_BYTE_SERVING_PERMISSION);
    if (!permitted.ok) return byteServingNotFound();
  }

  const { asset, assetId, servedPublicly } = gate;

  // ── 2. The poster key, validated rather than repaired ─────────────────────
  const storageKey = asset.posterStorageKey;
  if (!storageKey) return byteServingNotFound();
  // Shape AND tenancy, both decided by the shared chain — see `boundStorageKey`.
  // A well-formed key naming a different tenant or asset is refused, so a
  // poisoned row cannot make this route serve someone else's bytes.
  const boundKey = boundStorageKey(gate, storageKey);
  if (boundKey === null) return byteServingNotFound();

  const contentType = posterContentTypeFor(storageKey);
  if (contentType === null) return byteServingNotFound();
  const extension = canonicalExtensionFor(contentType);
  if (extension === null) return byteServingNotFound();

  // ── 3. ONE open. Size, magic bytes and body all come from it ──────────────
  let file: SecureFile | null;
  try {
    file = await openMediaObject(storageKey);
  } catch {
    return byteServingUnavailable();
  }
  if (file === null) return byteServingNotFound();
  const open = file;

  // A client that navigates away must not leave a file descriptor alive on the
  // server. Registered BEFORE any further await on this descriptor and BEFORE
  // the stream is created — an already-aborted signal never replays its event
  // to a listener added afterwards, so that case is handled explicitly below
  // rather than relied on to fire. The same handler tracks whichever object
  // currently owns the bytes: the descriptor itself until a stream claims it,
  // the stream afterwards (closing the descriptor twice is a no-op by
  // contract, so this never double-closes).
  let body: Readable | null = null;
  const onAbort = (): void => {
    if (body) body.destroy();
    else void release(open);
  };
  if (req.signal.aborted) {
    onAbort();
    return byteServingNotFound();
  }
  req.signal.addEventListener("abort", onAbort, { once: true });

  // Judged on what is ACTUALLY on disk, so a stale or forged column cannot make
  // this route serve something far larger than a still frame.
  const sizeBytes = open.sizeBytes;
  if (sizeBytes <= 0 || sizeBytes > MAX_MEDIA_POSTER_BYTES) {
    await release(open);
    return byteServingNotFound();
  }

  // ── 4. The outbound content check, on the SAME descriptor ─────────────────
  let head: Buffer;
  try {
    head = await open.read({ start: 0, end: Math.min(MEDIA_MAGIC_SNIFF_BYTES, sizeBytes) - 1 });
  } catch {
    await release(open);
    return byteServingNotFound();
  }
  if (!isServablePoster({ head, sizeBytes, contentType, extension })) {
    await release(open);
    return byteServingNotFound();
  }

  // ── 5. Stream the object off that same descriptor ─────────────────────────
  let stream: Readable;
  try {
    stream = open.createReadStream();
  } catch {
    await release(open);
    return byteServingNotFound();
  }
  // Ownership has now passed to the stream; `onAbort` (already armed above)
  // destroys it instead of closing the (now stream-owned) descriptor directly.
  body = stream;

  return new NextResponse(toResponseStream(stream), {
    status: 200,
    headers: {
      ...byteServingHeaders({
        contentType,
        filename: `media-${assetId}-poster.${extension}`,
        isPublic: servedPublicly,
      }),
      "Content-Length": String(sizeBytes),
    },
  });
}
