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
 */

import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import {
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
  isMediaStorageKey,
  openMediaObject,
  parseRangeHeader,
} from "@/lib/media/storage";
import { canonicalExtensionFor } from "@/lib/media/validation";
import { requirePermission } from "@/lib/org/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // ── 2. The stored key and type, validated rather than repaired ────────────
  const storageKey = asset.storageKey;
  const storedContentType = asset.contentType;
  if (!storageKey || !storedContentType) return byteServingNotFound();
  // Anything that is not the server-generated shape is refused before it can
  // reach the filesystem resolver at all.
  if (!isMediaStorageKey(storageKey)) return byteServingNotFound();

  // The stored type is re-checked against the allow-list on every read: a row
  // written by an older or buggier writer can never make this route assert a
  // Content-Type it does not serve.
  const extension = canonicalExtensionFor(storedContentType);
  if (extension === null) return byteServingNotFound();

  // ── 3. ONE open. Size, range decision and body all come from it ───────────
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

  const headers = byteServingHeaders({
    contentType: storedContentType,
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

  let body: Readable;
  try {
    body = open.createReadStream(window);
  } catch {
    // An empty object, or a window the descriptor cannot satisfy. Both are the
    // same uniform outcome, and the descriptor must not leak on the way out.
    await release(open);
    return byteServingNotFound();
  }

  // A client that navigates away mid-playback must not leave a file descriptor
  // and a read stream alive on the server. Destroying the stream closes the
  // descriptor it took ownership of.
  req.signal.addEventListener("abort", () => body.destroy(), { once: true });

  if (range.outcome === "satisfiable") {
    return new NextResponse(toResponseStream(body), {
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

  return new NextResponse(toResponseStream(body), {
    status: 200,
    headers: { ...headers, "Content-Length": String(sizeBytes) },
  });
}
