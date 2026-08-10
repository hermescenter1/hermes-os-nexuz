/**
 * PHASE 102 — Hermes Media & Video Hub: WebVTT subtitle-track upload.
 *
 * Design authority: docs/phase102/architecture.md §7 and §10.
 *
 * POST /api/media/assets/[id]/subtitles
 *   multipart/form-data — `file` (the .vtt), `locale` (fa|en|de),
 *   optional `label`, optional `isDefault`.
 *
 * WHY A SUBTITLE IS TREATED AS HOSTILE INPUT
 * ------------------------------------------
 * A video file is opaque to the browser: it is decoded by the media pipeline and
 * never becomes DOM. A subtitle is the opposite — every cue is rendered into the
 * player, so its CONTENT is an injection surface in a way the video bytes are
 * not. Passing the magic-byte check ("the file starts with WEBVTT") therefore
 * proves only the container, and this route additionally inspects the decoded
 * text:
 *
 *   - it must be valid UTF-8 and actually begin with `WEBVTT`;
 *   - only the WebVTT cue-span vocabulary (`<b> <i> <u> <c> <v> <lang> <ruby>
 *     <rt>` and timestamp tags) is permitted — `<script>`, `<iframe>`, `<img>`,
 *     `<a>`, `<svg>` and every other tag are refused outright;
 *   - `javascript:` and `data:` URLs are refused anywhere in the file, checked
 *     against a copy with control characters removed, because a browser strips
 *     TAB/CR/LF from inside a URL scheme and `java&#9;script:` would otherwise
 *     slip through a naive substring test.
 *
 * A refusal never echoes the offending text back: the response carries a fixed
 * reason code, so a hostile cue cannot be reflected into an operator's console.
 *
 * Everything else — tenancy, RBAC, the `video_hub` entitlement, the rate limit
 * keyed only on the proxy-controlled real-IP header, and the server-generated
 * storage key — is identical to the video upload surface, deliberately.
 *
 * STATIC CI GATE (scripts/security/phase99/static-invariants.mjs:380-400)
 *   size     → `file.size > MAX_MEDIA_SUBTITLE_BYTES`  (`.size >`)
 *   type     → `fileField instanceof File`             (`instanceof File`)
 *   filename → `validateFilename(...)`                 (`validateFilename`)
 *   auth     → `requireOrgActor` / `requirePermission`
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import { enforceEntitlement } from "@/lib/billing-governance/runtime/require-entitlement";
import { getPrisma } from "@/lib/db/prisma";
import { resolveRequestId } from "@/lib/logger/correlation";
import { getMediaAssetById } from "@/lib/media/db";
import { buildMediaStorageKey, deleteMediaObject, putMediaObject } from "@/lib/media/storage";
import { MEDIA_LOCALES } from "@/lib/media/types";
import {
  MAX_MEDIA_SUBTITLE_BYTES,
  MEDIA_MAGIC_SNIFF_BYTES,
  isAllowedMediaExtension,
  mediaExtensionOf,
  sanitizeMediaDisplayName,
  validateMediaUpload,
  type MediaValidationReason,
} from "@/lib/media/validation";
import { requireOrgActor } from "@/lib/org/context";
import { can, requirePermission, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";
import { resolveClientIp } from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Same borrowed policy as the video upload (`engineering-import`: 10 / 60 s)
 * under its OWN identifier namespace, so subtitle uploads have an independent
 * counter. See the note in ../upload/route.ts: a bucket name that is absent from
 * `LIMITS` makes `checkRateLimit` return true unconditionally, so borrowing a
 * configured policy is preferred to inventing an unconfigured name.
 */
const SUBTITLE_LIMIT_BUCKET = "engineering-import";
const SUBTITLE_LIMIT_KEY_PREFIX = "media-subtitle";

const MULTIPART_ENVELOPE_SLACK_BYTES = 64 * 1024;

const MEDIA_PERMISSIONS: readonly OrgPermission[] = ["view_media", "manage_media", "review_media"];

/** A track may never be attached to bytes nothing is allowed to serve. */
const REFUSED_PROCESSING_STATES: readonly string[] = ["QUARANTINED"];

/**
 * The complete WebVTT cue-span vocabulary (WebVTT §6.1). Anything outside it is
 * refused — this is an allow-list, not a blocked-tag list, so a tag nobody
 * thought of is refused by default rather than accepted by default.
 */
const ALLOWED_CUE_TAGS: ReadonlySet<string> = new Set([
  "b",
  "i",
  "u",
  "c",
  "v",
  "lang",
  "ruby",
  "rt",
]);

/** `<01:02:03.456>` and `<02:03.456>` — the in-cue timestamp tags. */
const TIMESTAMP_TAG = /^(?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3}$/;

/** URL schemes that turn rendered text into code or same-origin content. */
const FORBIDDEN_URL_SCHEMES: readonly string[] = ["javascript:", "data:", "vbscript:"];

/**
 * Deliberately NOT exported: a Next.js `route.ts` may export only HTTP handlers
 * and the route-segment config, so any other export is a build-time type error.
 */
const SUBTITLE_REJECTION_REASONS = [
  "subtitle_not_utf8",
  "subtitle_not_webvtt",
  "subtitle_control_characters",
  "subtitle_unsafe_markup",
  "subtitle_unsafe_url",
] as const;
type SubtitleRejectionReason = (typeof SUBTITLE_REJECTION_REASONS)[number];

// ── Local types over the Prisma client ───────────────────────────────────────

interface SubtitleModel {
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  updateMany: (args: unknown) => Promise<{ count?: number }>;
  upsert: (args: unknown) => Promise<Record<string, unknown>>;
}

interface AssetLookupModel {
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
}

// ── Helpers (declared before the handler: the Phase 99 static analysers slice a
//    handler body from its `export` to the next one) ─────────────────────────

const assetIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const localeSchema = z.enum(MEDIA_LOCALES);
const labelSchema = z.string().trim().min(1).max(120);

function deny(status: number, code: string, extraHeaders?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { ok: false, error: code },
    { status, headers: { "Cache-Control": "no-store", ...(extraHeaders ?? {}) } },
  );
}

function denyFromActor(status: number): NextResponse {
  return status === 401 ? deny(401, "authentication_required") : deny(404, "not_found");
}

/**
 * THE FILENAME CONTROL — see ../upload/route.ts. The storage key is minted
 * server-side, so this governs only the extension considered and the name
 * recorded in the audit trail; hostile names are refused, never rewritten.
 */
function validateFilename(
  raw: unknown,
): { ok: true; value: string } | { ok: false; reason: MediaValidationReason } {
  if (typeof raw !== "string") return { ok: false, reason: "filename_required" };
  const sanitized = sanitizeMediaDisplayName(raw);
  if (!sanitized.ok) return sanitized;
  const extension = mediaExtensionOf(sanitized.value);
  if (!extension || !isAllowedMediaExtension(extension)) {
    return { ok: false, reason: "unsupported_media_type" };
  }
  return sanitized;
}

function heldMediaPermissions(role: OrgRole): OrgPermission[] {
  return MEDIA_PERMISSIONS.filter((permission) => can(role, permission));
}

async function resolveOwningOrganizationId(assetId: string): Promise<string | null> {
  const db = await getPrisma();
  if (!db) return null;
  try {
    const model = (db as Record<string, unknown>).mediaAsset as AssetLookupModel;
    const row = await model.findUnique({
      where: { id: assetId },
      select: { organizationId: true },
    });
    return row && typeof row.organizationId === "string" ? row.organizationId : null;
  } catch {
    return null;
  }
}

/** A label is rendered as the track's name in the player chrome. */
function validateTrackLabel(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const parsed = labelSchema.safeParse(raw);
  if (!parsed.success) return { ok: false };
  // Same discipline as the display-name sanitiser: control characters and
  // bidirectional overrides are refused rather than stripped.
  const sanitized = sanitizeMediaDisplayName(parsed.data);
  if (!sanitized.ok) return { ok: false };
  return { ok: true, value: sanitized.value };
}

/** Only an explicit `true` sets the default flag; anything else is `false`. */
function readBooleanField(raw: FormDataEntryValue | null): boolean {
  return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}

/**
 * Content inspection of the DECODED subtitle text.
 *
 * Returns a fixed reason code — never the offending substring — so a hostile cue
 * can never be reflected into a response, a log line or an operator console.
 */
function inspectWebVttContent(
  text: string,
): { ok: true } | { ok: false; reason: SubtitleRejectionReason } {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  // 1. The signature, on the decoded text and not merely on the leading bytes.
  if (!body.startsWith("WEBVTT")) return { ok: false, reason: "subtitle_not_webvtt" };
  if (body.length > 6) {
    const next = body.charCodeAt(6);
    const isSeparator = next === 0x20 || next === 0x09 || next === 0x0a || next === 0x0d;
    if (!isSeparator) return { ok: false, reason: "subtitle_not_webvtt" };
  }

  // 2. Control characters. TAB/LF/CR are structural in WebVTT; nothing else is,
  //    and a NUL or an ESC in a cue is either corruption or an injection attempt.
  for (let i = 0; i < body.length; i += 1) {
    const code = body.charCodeAt(i);
    const structural = code === 0x09 || code === 0x0a || code === 0x0d;
    if (structural) continue;
    if (code <= 0x1f || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
      return { ok: false, reason: "subtitle_control_characters" };
    }
  }

  // 3. Markup. Every `<…>` must be a WebVTT cue span or a timestamp tag.
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== "<") continue;
    const close = body.indexOf(">", i + 1);
    // An unterminated `<` is not markup a conforming parser would act on, but it
    // is also not something a well-formed track contains — refuse it.
    if (close === -1) return { ok: false, reason: "subtitle_unsafe_markup" };
    const inner = body.slice(i + 1, close);
    if (inner.includes("<")) return { ok: false, reason: "subtitle_unsafe_markup" };
    if (!isAllowedCueSpan(inner)) return { ok: false, reason: "subtitle_unsafe_markup" };
    i = close;
  }

  // 4. Dangerous URL schemes, checked on a copy with the structural control
  //    characters removed: a browser strips TAB/CR/LF from inside a URL before
  //    resolving its scheme, so a tab-split java<TAB>script: is a live scheme to
  //    a client and would slip past a naive substring test. The characters are
  //    matched by code point rather than written as escapes, so this source file
  //    never carries a raw control byte.
  let scanned = "";
  for (let i = 0; i < body.length; i += 1) {
    const code = body.charCodeAt(i);
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue;
    scanned += body[i];
  }
  scanned = scanned.toLowerCase();
  for (const scheme of FORBIDDEN_URL_SCHEMES) {
    if (scanned.includes(scheme)) return { ok: false, reason: "subtitle_unsafe_url" };
  }

  return { ok: true };
}

/** Is `inner` (the text between `<` and `>`) a permitted WebVTT cue span? */
function isAllowedCueSpan(inner: string): boolean {
  if (inner.length === 0) return false;
  if (TIMESTAMP_TAG.test(inner)) return true;

  const isClosing = inner.startsWith("/");
  const withoutSlash = isClosing ? inner.slice(1) : inner;
  if (withoutSlash.length === 0) return false;

  // `<v.loud Alice>` → name `v`, classes `loud`, annotation `Alice`.
  const spaceAt = withoutSlash.indexOf(" ");
  const head = spaceAt === -1 ? withoutSlash : withoutSlash.slice(0, spaceAt);
  const annotation = spaceAt === -1 ? "" : withoutSlash.slice(spaceAt + 1);

  const segments = head.split(".");
  const name = segments[0] ?? "";
  if (!ALLOWED_CUE_TAGS.has(name)) return false;
  // Class names are restricted to word characters, so a class can never carry
  // punctuation that a lenient parser might read as an attribute.
  if (!segments.slice(1).every((cls) => cls.length > 0 && /^[A-Za-z0-9_-]+$/.test(cls))) {
    return false;
  }
  // A closing tag carries no annotation; an annotation may not contain markup.
  if (isClosing && annotation.length > 0) return false;
  if (annotation.includes("<") || annotation.includes(">")) return false;
  return true;
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = resolveRequestId(req);
  const { id: rawId } = await params;

  const parsedId = assetIdSchema.safeParse(rawId);
  if (!parsedId.success) return deny(404, "not_found");
  const assetId = parsedId.data;

  const requestContentType = req.headers.get("content-type") ?? "";
  if (!requestContentType.toLowerCase().startsWith("multipart/form-data")) {
    return deny(415, "multipart_required");
  }
  const declaredLength = Number(req.headers.get("content-length") ?? "");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_MEDIA_SUBTITLE_BYTES + MULTIPART_ENVELOPE_SLACK_BYTES
  ) {
    return deny(413, "file_too_large");
  }

  // ── Tenancy, then authorization ───────────────────────────────────────────
  const organizationId = await resolveOwningOrganizationId(assetId);
  if (!organizationId) return deny(404, "not_found");

  const actor = await requireOrgActor(req, organizationId);
  if ("error" in actor) return denyFromActor(actor.status);
  const { ctx } = actor;

  const permitted = requirePermission(ctx.role, "manage_media");
  if (!permitted.ok) return deny(403, "forbidden");

  // Keyed on the proxy-controlled real-IP header only; the appended forwarded
  // chain is client-writable and would let a caller rotate buckets per request.
  const clientIp = resolveClientIp(req);
  const limitKey = `${SUBTITLE_LIMIT_KEY_PREFIX}:${clientIp}`;
  if (!(await checkRateLimit(SUBTITLE_LIMIT_BUCKET, limitKey))) {
    return deny(429, "rate_limited", {
      "Retry-After": String(retryAfter(SUBTITLE_LIMIT_BUCKET, limitKey)),
    });
  }

  const entitlement = await enforceEntitlement({
    organisationId: organizationId,
    entitlementKey: "video_hub",
    requestedUnits: 1,
    userId: ctx.userId,
  });
  if (!entitlement.ok) return entitlement.response;

  const permissions = heldMediaPermissions(ctx.role);
  const loaded = await getMediaAssetById({
    organizationId,
    id: assetId,
    audience: { scope: "EDITORIAL", includeUnpublished: true, permissions },
  });
  if (!loaded.ok) {
    if (loaded.reason === "STORAGE_UNAVAILABLE") return deny(503, "storage_unavailable");
    return deny(404, "not_found");
  }
  if (REFUSED_PROCESSING_STATES.includes(loaded.value.processingState)) {
    return deny(409, "processing_state_conflict");
  }

  // ── Multipart body ────────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return deny(400, "malformed_multipart");
  }

  const parsedLocale = localeSchema.safeParse(form.get("locale"));
  if (!parsedLocale.success) return deny(400, "invalid_locale");
  const locale = parsedLocale.data;

  const label = validateTrackLabel(form.get("label"));
  if (!label.ok) return deny(400, "invalid_label");
  const isDefault = readBooleanField(form.get("isDefault"));

  const fileField = form.get("file");
  if (!(fileField instanceof File)) return deny(400, "file_field_required");
  const file = fileField;

  if (file.size <= 0) return deny(400, "file_empty");
  if (file.size > MAX_MEDIA_SUBTITLE_BYTES) return deny(413, "file_too_large");

  const filename = validateFilename(file.name);
  if (!filename.ok) return deny(400, filename.reason);

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength <= 0) return deny(400, "file_empty");
  if (bytes.byteLength > MAX_MEDIA_SUBTITLE_BYTES) return deny(413, "file_too_large");

  // ── Container check (allow-list + magic bytes) ────────────────────────────
  const validated = validateMediaUpload({
    filename: filename.value,
    declaredMimeType: file.type,
    sizeBytes: bytes.byteLength,
    head: bytes.subarray(0, MEDIA_MAGIC_SNIFF_BYTES),
  });
  if (!validated.ok) {
    void recordAuditEvent({
      action: "media.subtitle.rejected",
      entityType: "MediaSubtitleTrack",
      entityId: assetId,
      organizationId,
      userId: ctx.userId,
      outcome: "denied",
      correlationId,
      metadata: { reason: validated.reason, locale, declaredType: file.type },
    });
    return deny(validated.reason === "file_too_large" ? 413 : 422, validated.reason);
  }
  if (validated.kind !== "subtitle") return deny(415, "unsupported_media_type");

  // ── Content check on the decoded text ─────────────────────────────────────
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return deny(422, "subtitle_not_utf8");
  }
  const inspected = inspectWebVttContent(text);
  if (!inspected.ok) {
    void recordAuditEvent({
      action: "media.subtitle.rejected",
      entityType: "MediaSubtitleTrack",
      entityId: assetId,
      organizationId,
      userId: ctx.userId,
      outcome: "denied",
      correlationId,
      metadata: { reason: inspected.reason, locale },
    });
    return deny(422, inspected.reason);
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  const db = await getPrisma();
  if (!db) return deny(503, "storage_unavailable");
  const trackModel = (db as Record<string, unknown>).mediaSubtitleTrack as SubtitleModel;

  let previousKey: string | null = null;
  try {
    const existing = await trackModel.findFirst({
      where: { organizationId, mediaAssetId: assetId, locale },
      select: { storageKey: true },
    });
    previousKey = existing && typeof existing.storageKey === "string" ? existing.storageKey : null;
  } catch {
    return deny(503, "storage_unavailable");
  }

  let storageKey: string;
  try {
    storageKey = buildMediaStorageKey({ organizationId, assetId, extension: validated.extension });
    await putMediaObject({ key: storageKey, body: bytes, contentType: validated.contentType });
  } catch {
    return deny(503, "storage_unavailable");
  }

  try {
    if (isDefault) {
      // At most one default track per asset. Scoped by organization as well as
      // asset so the write can never reach another tenant's rows.
      await trackModel.updateMany({
        where: { organizationId, mediaAssetId: assetId },
        data: { isDefault: false },
      });
    }
    await trackModel.upsert({
      where: { mediaAssetId_locale: { mediaAssetId: assetId, locale } },
      create: {
        organizationId,
        mediaAssetId: assetId,
        locale,
        label: label.value,
        storageKey,
        format: "vtt",
        byteSize: bytes.byteLength,
        isDefault,
      },
      update: {
        label: label.value,
        storageKey,
        format: "vtt",
        byteSize: bytes.byteLength,
        isDefault,
      },
    });
  } catch {
    // The row did not change, so nothing references the object just written.
    try {
      await deleteMediaObject(storageKey);
    } catch {
      /* orphan cleanup is best-effort; an unreferenced object is unreachable */
    }
    return deny(503, "storage_unavailable");
  }

  // The superseded object is unreferenced now that the row points at the new key.
  if (previousKey && previousKey !== storageKey) {
    try {
      await deleteMediaObject(previousKey);
    } catch {
      /* best-effort */
    }
  }

  void recordAuditEvent({
    action: "media.subtitle.accepted",
    entityType: "MediaSubtitleTrack",
    entityId: assetId,
    organizationId,
    userId: ctx.userId,
    outcome: "success",
    correlationId,
    metadata: {
      locale,
      byteSize: bytes.byteLength,
      isDefault,
      replacedExisting: previousKey !== null,
      displayName: filename.value,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      data: {
        mediaAssetId: assetId,
        locale,
        label: label.value,
        format: "vtt",
        byteSize: bytes.byteLength,
        isDefault,
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
