/**
 * PHASE 102 — Hermes Media & Video Hub: serving a stored WebVTT subtitle track.
 *
 * Design authority: docs/phase102/architecture.md §4, §7 and §11.
 *
 * GET /api/media/assets/[id]/subtitles/[trackId]
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------
 * `MediaSubtitleTrack` rows, the WebVTT upload path and the player's `<track>`
 * support all shipped together — with no GET route in between. A caption that is
 * stored and never servable is a caption that does not exist, so the watch page
 * honestly reported `subtitleTracks: []`. This is the missing half.
 *
 * AUTHORIZATION IS THE SHARED CHAIN
 * ---------------------------------
 * Delegated in full to `authorizeByteServing` in
 * `src/lib/media/byte-serving-auth.ts` — the same call, with the same arguments,
 * as ../../stream and ../../poster. The three surfaces cannot drift apart,
 * which is what the contract test in
 * `src/app/api/media/binary/__tests__/byte-serving-auth-contract.test.ts` pins.
 * The handler then re-asserts `view_media` against the granted role as defence
 * in depth. Every refusal is one bare `404`.
 *
 * TWO THINGS THIS ROUTE ADDS
 * --------------------------
 *  1. THE TRACK MUST BELONG TO THE ASSET. `trackId` is looked up with
 *     `{ id, organizationId, mediaAssetId }` all three in the `where` clause. A
 *     lookup on `id` alone would authorize against asset A and then serve asset
 *     B's captions — an IDOR that leaks editorial content across assets and,
 *     without the organization predicate, across tenants.
 *  2. THE STORED BYTES ARE RE-INSPECTED ON THE WAY OUT. Video bytes are opaque
 *     to the browser; a subtitle is rendered into the player, so its content is
 *     an injection surface. The upload route inspects the cue vocabulary on the
 *     way IN; this route re-runs the container check (`WEBVTT` magic, via the
 *     same allow-list used at upload) on the way OUT, so a row whose object was
 *     written by an older, buggier or compromised writer cannot make this server
 *     assert `text/vtt` over bytes that are not WebVTT. The magic requires the
 *     signature to end at EOF or at a space, tab, CR or LF — so `WEBVTTevil` is
 *     refused — and a leading UTF-8 BOM is permitted, as the WebVTT syntax
 *     allows one. A track that fails is answered `404`.
 *
 * WHOLE-OBJECT READ, ON PURPOSE AND BOUNDED, FROM ONE DESCRIPTOR
 * --------------------------------------------------------------
 * Re-verifying content requires having it, so this route buffers. That is safe
 * here and only here: the size is taken from the OPEN DESCRIPTOR's `fstat` and
 * refused above `MAX_MEDIA_SUBTITLE_BYTES` (2 MB) before a byte is read. Video
 * is never buffered — that is what the stream route is for.
 *
 * The route used to `statMediaObject(key)` and then `readMediaByteRange(key)` —
 * two independent resolutions of one pathname, which reopens the TOCTOU window
 * `src/lib/media/secure-read.ts` exists to close. It now calls
 * {@link openMediaObject} ONCE and takes both the size and the bytes from that
 * single {@link SecureFile}.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/lib/db/prisma";
import {
  boundStorageKey,
  MEDIA_BYTE_SERVING_PERMISSION,
  authorizeByteServing,
  byteServingHeaders,
  byteServingNotFound,
  byteServingRefusalResponse,
  byteServingUnavailable,
  parseMediaIdentifier,
} from "@/lib/media/byte-serving-auth";
import type { SecureFile } from "@/lib/media/secure-read";
import { openMediaObject } from "@/lib/media/storage";
import { MEDIA_SUBTITLE_FORMATS } from "@/lib/media/types";
import {
  MAX_MEDIA_SUBTITLE_BYTES,
  MEDIA_MAGIC_SNIFF_BYTES,
  validateMediaUpload,
} from "@/lib/media/validation";
import { requirePermission } from "@/lib/org/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * The canonical type from the media allow-list, plus the charset. WebVTT is
 * required to be UTF-8, and the bytes are decoded with a fatal decoder below, so
 * this header states something that has actually been verified.
 */
const SUBTITLE_CANONICAL_TYPE = "text/vtt";
const SUBTITLE_RESPONSE_TYPE = "text/vtt; charset=utf-8";
const SUBTITLE_EXTENSION = "vtt";

/** WebVTT only — there is no subtitle converter in this platform (ADR §9). */
const SUBTITLE_FORMAT: string = MEDIA_SUBTITLE_FORMATS[0];

// ── Local types over the Prisma client ───────────────────────────────────────

interface SubtitleLookupModel {
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
}

interface SubtitleTrackRow {
  readonly storageKey: string;
  readonly format: string;
}

type SubtitleTrackLookup =
  | { readonly ok: true; readonly value: SubtitleTrackRow }
  | { readonly ok: false; readonly reason: "not_found" | "storage_unavailable" };

// ── Helpers (declared before the handler: the Phase 99 static analysers slice a
//    handler body from its `export` to the next one) ─────────────────────────

/**
 * Load ONE track that belongs to ONE asset inside ONE organization.
 *
 * All three predicates are in the `where` clause. This is the anti-IDOR control:
 * authorization above was decided about `assetId`, so a track reached by `id`
 * alone would be served under an authorization it never passed.
 */
async function loadSubtitleTrack(params: {
  organizationId: string;
  assetId: string;
  trackId: string;
}): Promise<SubtitleTrackLookup> {
  const db = await getPrisma();
  if (!db) return { ok: false, reason: "storage_unavailable" };
  try {
    const model = (db as Record<string, unknown>).mediaSubtitleTrack as SubtitleLookupModel;
    const row = await model.findFirst({
      where: {
        id: params.trackId,
        organizationId: params.organizationId,
        mediaAssetId: params.assetId,
      },
      select: { storageKey: true, format: true },
    });
    if (!row) return { ok: false, reason: "not_found" };
    if (typeof row.storageKey !== "string" || typeof row.format !== "string") {
      return { ok: false, reason: "not_found" };
    }
    return { ok: true, value: { storageKey: row.storageKey, format: row.format } };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

/**
 * Re-run the media allow-list over the STORED bytes.
 *
 * The filename and MIME handed in are server constants, so the resolution can
 * only ever reach the WebVTT rule; what is actually being judged is the byte
 * signature. The fatal UTF-8 decode is what makes `charset=utf-8` truthful
 * rather than aspirational, and it is bounded by the 2 MB ceiling enforced
 * before the read.
 */
function isServableWebVtt(bytes: Buffer): boolean {
  const validated = validateMediaUpload({
    filename: `track.${SUBTITLE_EXTENSION}`,
    declaredMimeType: SUBTITLE_CANONICAL_TYPE,
    sizeBytes: bytes.byteLength,
    head: bytes.subarray(0, MEDIA_MAGIC_SNIFF_BYTES),
  });
  if (!validated.ok) return false;
  if (validated.kind !== "subtitle") return false;
  if (validated.contentType !== SUBTITLE_CANONICAL_TYPE) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  return true;
}

/** Releases a descriptor the response is not going to use. */
async function release(file: SecureFile): Promise<void> {
  await file.close();
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; trackId: string }> },
): Promise<NextResponse> {
  const { id: rawId, trackId: rawTrackId } = await params;
  const trackId = parseMediaIdentifier(rawTrackId);
  if (trackId === null) return byteServingNotFound();

  // ── 1. Authorization, entirely before storage is touched ──────────────────
  const gate = await authorizeByteServing({ req, assetId: rawId });
  if (!gate.ok) return byteServingRefusalResponse(gate);
  if (gate.actorRole !== null) {
    const permitted = requirePermission(gate.actorRole, MEDIA_BYTE_SERVING_PERMISSION);
    if (!permitted.ok) return byteServingNotFound();
  }

  const { assetId, organizationId, servedPublicly } = gate;

  // ── 2. The track, pinned to THIS asset and THIS tenant ────────────────────
  const track = await loadSubtitleTrack({ organizationId, assetId, trackId });
  if (!track.ok) {
    return track.reason === "storage_unavailable" ? byteServingUnavailable() : byteServingNotFound();
  }
  if (track.value.format !== SUBTITLE_FORMAT) return byteServingNotFound();

  const storageKey = track.value.storageKey;
  // Shape AND tenancy, both decided by the shared chain — see `boundStorageKey`.
  // The track row was already loaded with all three predicates pinned, but the
  // KEY it carries is a separate assertion nothing in the database constrains,
  // so it is proven against the authorized scope in its own right.
  const boundKey = boundStorageKey(gate, storageKey);
  if (boundKey === null) return byteServingNotFound();
  if (!boundKey.toLowerCase().endsWith(`.${SUBTITLE_EXTENSION}`)) return byteServingNotFound();

  // ── 3. ONE open. Size and bytes both come from it ─────────────────────────
  let file: SecureFile | null;
  try {
    file = await openMediaObject(storageKey);
  } catch {
    // A non-`local` provider, whose partial-read adapter does not exist and must
    // never be silently downgraded.
    return byteServingUnavailable();
  }
  if (file === null) return byteServingNotFound();
  const open = file;

  // The ceiling is applied to the OPEN DESCRIPTOR's `fstat` size, not to the
  // row's recorded `byteSize`, so a stale or forged column cannot authorise a
  // large allocation — and it is applied BEFORE any byte is read.
  const sizeBytes = open.sizeBytes;
  if (sizeBytes <= 0 || sizeBytes > MAX_MEDIA_SUBTITLE_BYTES) {
    await release(open);
    return byteServingNotFound();
  }

  let bytes: Buffer;
  try {
    bytes = await open.read({ start: 0, end: sizeBytes - 1 });
  } catch {
    await release(open);
    return byteServingNotFound();
  } finally {
    await release(open);
  }
  if (bytes.byteLength === 0) return byteServingNotFound();

  // ── 4. The outbound content check ─────────────────────────────────────────
  if (!isServableWebVtt(bytes)) return byteServingNotFound();

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...byteServingHeaders({
        contentType: SUBTITLE_RESPONSE_TYPE,
        filename: `media-${assetId}-${trackId}.${SUBTITLE_EXTENSION}`,
        isPublic: servedPublicly,
      }),
      "Content-Length": String(bytes.byteLength),
    },
  });
}
