/**
 * PHASE 102 — Hermes Media & Video Hub: HTTP byte serving with Range support.
 *
 * Design authority: docs/phase102/architecture.md §3, §4 and §11.
 *
 * GET /api/media/assets/[id]/stream
 *
 * THE HONEST CORE OF ADR §4
 * -------------------------
 * Seeking in a `<video>` element is not a player feature — it is an HTTP feature.
 * A browser asks for `Range: bytes=<start>-` and expects `206 Partial Content`
 * with a matching `Content-Range`; without that, the element can only play from
 * the beginning and the scrub bar does nothing. This route is the only place in
 * the API that answers a Range request, and it does so by streaming a byte slice
 * off disk.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It never materialises the object. The existing compliance download route does
 * `new NextResponse(new Uint8Array(bytes))`, which costs the full file size in
 * Node heap for every concurrent reader — acceptable for a 200 KB evidence pack,
 * an outage for a 50 MB video with fifty viewers. Here the response body is a
 * lazy stream over exactly the requested window, so heap cost is the stream's
 * high-water mark, not the file size.
 *
 * ONE OPEN, ONE DESCRIPTOR (changed — read this)
 * ----------------------------------------------
 * This route used to `statMediaObject(key)` to learn the size and then
 * `openMediaByteRange(key)` to get the bytes. That is TWO independent
 * resolutions of the same pathname, and everything the first one proved —
 * contained, not a symlink, a regular file, within the ceiling, this exact inode
 * — was proved about a file the second one was not guaranteed to be opening. It
 * reopened, one layer up, the exact TOCTOU window `src/lib/media/secure-read.ts`
 * exists to close.
 *
 * Now the route calls {@link openMediaObject} ONCE. The {@link SecureFile} it
 * returns is the single descriptor the primitive opened and proved, the size
 * comes from that descriptor's `fstat`, and the response body is a stream over
 * that same descriptor. No pathname is resolved a second time anywhere in the
 * request.
 *
 * AUTHORIZATION
 * -------------
 * Delegated in full to `authorizeByteServing` in
 * `src/lib/media/byte-serving-auth.ts`, which is the ONE chain all three
 * byte-serving surfaces share, so `stream`, `poster` and `subtitles` cannot
 * drift apart. It runs entirely before storage is touched. The handler then
 * re-asserts `view_media` against the granted role: defence in depth, and the
 * handler-body authorization evidence the Phase 99 route classifier reads.
 *
 * Every refusal — unauthorized, unauthenticated, wrong tenant, not READY,
 * quarantined, missing object, symlink, swapped inode, oversize — is one bare
 * `404` with no filesystem, errno or storage detail in the body or the headers.
 *
 * RANGE SEMANTICS (RFC 9110 §14)
 * ------------------------------
 *   no Range            → 200 + `Accept-Ranges: bytes` + full body
 *   satisfiable         → 206 + `Content-Range: bytes <start>-<end>/<size>`
 *   unsatisfiable       → 416 + `Content-Range: bytes *\/<size>`, empty body
 *   multi-range         → 416, explicitly. Answering it properly needs a
 *                         `multipart/byteranges` body; serving only the first
 *                         part would be a silent correctness bug in every client
 *                         that asked, so the request is refused rather than
 *                         half-honoured.
 *   otherwise malformed → 200 with the whole representation, per the RFC's
 *                         "ignore an unparsable Range" rule. Answering 416 to a
 *                         syntactically broken header breaks ordinary clients.
 *
 * THE OUTBOUND CONTENT IS VERIFIED, NOT MERELY THE KEY (changed — read this)
 * ----------------------------------------------------------------------
 * A server-generated-shaped storage key and an allow-listed `contentType`
 * column are both claims about the object — neither is evidence about the
 * bytes actually on disk. `poster` and `subtitles` already re-run the media
 * allow-list on the way out; this route now does the same: it reads a small,
 * BOUNDED leading window off the SAME descriptor the body will stream from —
 * never a second open, never the whole object — and refuses with the uniform
 * `404` if the container signature does not match. And the `Content-Type` this
 * route sends is ALWAYS the canonical value from `MEDIA_TYPE_RULES`, resolved
 * through the stored key's extension — never `MediaAsset.contentType` echoed
 * verbatim (see `byte-serving-auth.ts`'s contract on {@link ByteServingHeaderInput.contentType}).
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
import {
  formatContentRange,
  formatUnsatisfiedContentRange,
  openMediaObject,
  parseRangeHeader,
} from "@/lib/media/storage";
import {
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

const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set(mediaExtensionsFor("video"));

/**
 * canonical extension → canonical content type, for VIDEO rules only.
 *
 * Derived from the allow-list rather than restated — mirrors the poster
 * route's `POSTER_CONTENT_TYPE_BY_EXTENSION` — so a rule added to or removed
 * from `validation.ts` is reflected here automatically. The response
 * `Content-Type` is ALWAYS looked up through this map, never taken from
 * `MediaAsset.contentType`: `video/x-m4v`, `Video/MP4` and a
 * header-injection-shaped stored value all resolve to the one fixed,
 * server-controlled string their rule declares.
 */
const VIDEO_CONTENT_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map(
  MEDIA_ACCEPTED_CONTENT_TYPES.flatMap((contentType) => {
    const extension = canonicalExtensionFor(contentType);
    if (extension === null || !VIDEO_EXTENSIONS.has(extension)) return [];
    return [[extension, contentType] as [string, string]];
  }),
);

// ── Helpers (declared before the handler: the Phase 99 static analysers slice a
//    handler body from its `export` to the next one) ─────────────────────────

/** Node stream → Web stream. The two `ReadableStream` declarations (lib.dom vs
 *  node:stream/web) are structurally identical but nominally distinct, which is
 *  the entire reason this assertion exists. */
function toResponseStream(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

/**
 * Releases a descriptor the response is not going to use.
 *
 * Every exit path between the open and the hand-off to a stream must call this.
 * A leaked descriptor is not a disclosure bug, but under a client that retries a
 * refused range it is an availability one.
 */
async function release(file: SecureFile): Promise<void> {
  await file.close();
}

/**
 * Re-run the media allow-list over the STORED bytes, on egress.
 *
 * The filename and MIME handed in are the server-derived canonical values, so
 * the resolution can only ever reach the rule this key's extension claims;
 * what is actually being judged is the byte signature read off the descriptor.
 * A key whose bytes are not that container — corrupt, truncated, or simply not
 * what the row claims — is refused, exactly as `poster` already refuses a
 * `.webp` key whose bytes are a PNG.
 */
function isServableVideo(params: {
  head: Buffer;
  sizeBytes: number;
  contentType: string;
  extension: string;
}): boolean {
  const validated = validateMediaUpload({
    filename: `media.${params.extension}`,
    declaredMimeType: params.contentType,
    sizeBytes: params.sizeBytes,
    head: params.head,
  });
  if (!validated.ok) return false;
  if (validated.kind !== "video") return false;
  // The type the bytes proved must be the type this response is going to assert.
  return validated.contentType === params.contentType;
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
  // Defence in depth over the shared chain: a member grant must still hold
  // `view_media` at the surface that serves the bytes.
  if (gate.actorRole !== null) {
    const permitted = requirePermission(gate.actorRole, MEDIA_BYTE_SERVING_PERMISSION);
    if (!permitted.ok) return byteServingNotFound();
  }

  const { asset, assetId, servedPublicly } = gate;

  // ── 2. The stored key, resolved to a CANONICAL type — never echoed ────────
  const storageKey = asset.storageKey;
  const storedContentType = asset.contentType;
  if (!storageKey || !storedContentType) return byteServingNotFound();
  // Shape AND tenancy, both decided by the shared chain. A shape check alone
  // proves the key is well-formed, never WHOSE it is, and nothing in the
  // database stops a row from carrying a key that points into another tenant.
  const boundKey = boundStorageKey(gate, storageKey);
  if (boundKey === null) return byteServingNotFound();

  // The stored type is used ONLY to look up an extension — the string itself
  // never reaches a response header. A row written by an older or buggier
  // writer can never make this route assert a Content-Type it does not serve.
  const extension = canonicalExtensionFor(storedContentType);
  if (extension === null) return byteServingNotFound();
  const contentType = VIDEO_CONTENT_TYPE_BY_EXTENSION.get(extension);
  if (contentType === undefined) return byteServingNotFound();

  // ── 3. ONE open. Size, the outbound content proof, range decision and body
  //      all come from it ─────────────────────────────────────────────────────
  let file: SecureFile | null;
  try {
    file = await openMediaObject(storageKey);
  } catch {
    // A refused key or a non-`local` provider (whose partial-read adapter does
    // not exist and must never be silently downgraded to a whole-object read).
    // Identical for every id, so it discloses nothing about this asset.
    return byteServingUnavailable();
  }
  if (file === null) return byteServingNotFound();
  const open = file;

  // The size is the OPEN DESCRIPTOR's `fstat` size, never `MediaAsset.byteSize`:
  // a row can be stale or forged, and neither is evidence about the bytes on
  // disk right now.
  const sizeBytes = open.sizeBytes;
  if (sizeBytes <= 0) {
    await release(open);
    return byteServingNotFound();
  }

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

  // The outbound content check, on the SAME descriptor: a corrupt or foreign
  // object under a valid-looking key must never be asserted as this content
  // type, whatever the row and the key both claim. Bounded to a small leading
  // read — never the whole object.
  let head: Buffer;
  try {
    head = await open.read({ start: 0, end: Math.min(MEDIA_MAGIC_SNIFF_BYTES, sizeBytes) - 1 });
  } catch {
    await release(open);
    return byteServingNotFound();
  }
  if (!isServableVideo({ head, sizeBytes, contentType, extension })) {
    await release(open);
    return byteServingNotFound();
  }

  const headers = byteServingHeaders({
    contentType,
    filename: `media-${assetId}.${extension}`,
    isPublic: servedPublicly,
    acceptRanges: true,
  });

  const range = parseRangeHeader(req.headers.get("range"), sizeBytes);

  const refuseRange =
    range.outcome === "unsatisfiable" ||
    (range.outcome === "malformed" && range.reason === "multi_range");
  if (refuseRange) {
    await release(open);
    return new NextResponse(null, {
      status: 416,
      headers: { ...headers, "Content-Range": formatUnsatisfiedContentRange(sizeBytes) },
    });
  }

  // ── 4. Stream exactly the requested window off THIS descriptor ────────────
  const window =
    range.outcome === "satisfiable" ? { start: range.start, end: range.end } : undefined;

  let stream: Readable;
  try {
    stream = open.createReadStream(window);
  } catch {
    // An empty object, or a window the descriptor cannot satisfy. Both are the
    // same uniform outcome, and the descriptor must not leak on the way out.
    await release(open);
    return byteServingNotFound();
  }
  // Ownership has now passed to the stream; `onAbort` (already armed above)
  // destroys it instead of closing the (now stream-owned) descriptor directly.
  body = stream;

  if (range.outcome === "satisfiable") {
    return new NextResponse(toResponseStream(stream), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": formatContentRange({
          start: range.start,
          end: range.end,
          sizeBytes,
        }),
      },
    });
  }

  return new NextResponse(toResponseStream(stream), {
    status: 200,
    headers: { ...headers, "Content-Length": String(sizeBytes) },
  });
}
