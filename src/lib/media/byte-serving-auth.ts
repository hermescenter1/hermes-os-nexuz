import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db/prisma";
import { PUBLIC_AUDIENCE, getMediaAssetById, type MediaAssetRow } from "@/lib/media/db";
import { isPubliclyReadable, isServable } from "@/lib/media/types";
import { requireOrgActor } from "@/lib/org/context";
import { can, requirePermission, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";

/**
 * PHASE 102 — the ONE authorization chain behind every media byte.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Three routes serve stored bytes — `stream`, `poster` and
 * `subtitles/[trackId]` — and until now each carried its own copy of the same
 * ~70-line chain. Copies do not stay identical. A copy is exactly how one
 * surface keeps the `QUARANTINED` refusal and another loses it in a refactor,
 * and the loss is invisible because every copy still looks complete on its own.
 * The chain now exists once, and the contract test in
 * `src/app/api/media/binary/__tests__/byte-serving-auth-contract.test.ts`
 * asserts the same matrix against all three handlers, so a route that stopped
 * calling it — or called it and then ignored the answer — fails the suite.
 *
 * THE CHAIN, IN ORDER
 * -------------------
 *  1. The asset id must match the server id shape. Anything else is `not_found`
 *     before a query runs.
 *  2. Resolve the OWNING organization. Necessarily un-scoped — the caller may be
 *     anonymous, so there is no context to scope by yet. Only the opaque owning
 *     id is selected, it never reaches a response, and every later read is
 *     organization-scoped and audience-gated.
 *  3. Try the ANONYMOUS read first. `PUBLIC_AUDIENCE` pins PUBLISHED + PUBLIC +
 *     READY inside the repository query, so a draft or a quarantined asset is
 *     simply not found rather than found and then filtered.
 *  4. Otherwise require membership in the owning organization plus `view_media`,
 *     then re-read under the explicit EDITORIAL audience.
 *  5. Re-assert servability. `processingState` must be `READY`; `QUARANTINED`
 *     never serves a byte, because there is no virus scanner in this platform
 *     (ADR §9) and quarantine is precisely the state that says "nothing may
 *     vouch for these bytes".
 *
 * DISCLOSURE POLICY — ONE STATUS FOR EVERY REFUSAL
 * ------------------------------------------------
 * Every authorization outcome that is not "serve it" is {@link BYTE_SERVING_NOT_FOUND},
 * rendered as a bare `404`. That includes the anonymous caller who would have
 * been told `401`, and the member without `view_media` who would have been told
 * `403`.
 *
 * This is a deliberate change from the per-route chains it replaces, and it
 * closes a real oracle. Those chains reached their `401` only AFTER the owning
 * organization had been resolved — so a `401` meant "this id exists" and a `404`
 * meant "it does not", and an unauthenticated attacker could enumerate valid
 * asset ids across every tenant by reading the status code. `403` leaked the
 * same fact to any authenticated user about any organization they belong to.
 * Byte-serving surfaces have no interactive sign-in affordance to protect — the
 * player embeds them as `src` attributes — so there is nothing to trade away by
 * collapsing them.
 *
 * The ONLY other status this module produces is `503`
 * {@link BYTE_SERVING_UNAVAILABLE}, and only for infrastructure that is down for
 * everyone: no database client, or a storage provider with no partial-read
 * adapter. It is returned identically for an id that exists and for one that
 * does not, so it distinguishes nothing about any asset. No filesystem path,
 * errno, storage key or database detail appears in either response, in the body
 * or in the headers.
 */

// ── Permissions ──────────────────────────────────────────────────────────────

/**
 * The permissions a media reader may hold. Passed to the EDITORIAL audience so
 * the repository can decide what an actor of this role is allowed to see; it is
 * NOT the gate itself, which is `view_media` below.
 */
export const MEDIA_READ_PERMISSIONS: readonly OrgPermission[] = [
  "view_media",
  "manage_media",
  "review_media",
];

/** The single permission that gates every byte-serving surface. */
export const MEDIA_BYTE_SERVING_PERMISSION: OrgPermission = "view_media";

function heldMediaPermissions(role: OrgRole): OrgPermission[] {
  return MEDIA_READ_PERMISSIONS.filter((permission) => can(role, permission));
}

// ── Responses ────────────────────────────────────────────────────────────────

/**
 * THE uniform refusal. One status, one body, no headers that vary with the
 * reason, and nothing in it derived from a key, a path, an errno or a row.
 *
 * `Cache-Control: no-store` keeps a refusal out of shared caches so that a
 * later, legitimately authorized request is not answered from it.
 */
export function byteServingNotFound(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "not_found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Infrastructure is down for EVERY caller and EVERY id. It is not an outcome
 * about the requested asset and cannot be used to probe for one.
 */
export function byteServingUnavailable(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "storage_unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

// ── Result vocabulary ────────────────────────────────────────────────────────

export const BYTE_SERVING_NOT_FOUND = "not_found";
export const BYTE_SERVING_UNAVAILABLE = "storage_unavailable";

export interface ByteServingGrant {
  readonly ok: true;
  /** The authorized asset row, loaded under the audience that authorized it. */
  readonly asset: MediaAssetRow;
  /**
   * The VALIDATED asset id. Routes build `Content-Disposition` filenames from
   * this rather than from the raw route parameter, so the header can only ever
   * contain characters this module's regex already accepted.
   */
  readonly assetId: string;
  /** The OWNING organization. Server-derived; never read from the request. */
  readonly organizationId: string;
  /** True when the asset was served through the anonymous PUBLIC audience. */
  readonly servedPublicly: boolean;
  /**
   * The acting member's role, or `null` for an anonymous public read. Routes
   * re-assert `view_media` against it as defence in depth — see the note on
   * {@link authorizeByteServing}.
   */
  readonly actorRole: OrgRole | null;
}

export interface ByteServingRefusal {
  readonly ok: false;
  readonly outcome: typeof BYTE_SERVING_NOT_FOUND | typeof BYTE_SERVING_UNAVAILABLE;
}

export type ByteServingAuthorization = ByteServingGrant | ByteServingRefusal;

const notFound: ByteServingRefusal = { ok: false, outcome: BYTE_SERVING_NOT_FOUND };
const unavailable: ByteServingRefusal = { ok: false, outcome: BYTE_SERVING_UNAVAILABLE };

/** Renders a refusal. Exists so no route has to restate the status mapping. */
export function byteServingRefusalResponse(refusal: ByteServingRefusal): NextResponse {
  return refusal.outcome === BYTE_SERVING_UNAVAILABLE
    ? byteServingUnavailable()
    : byteServingNotFound();
}

// ── Identifier shape ─────────────────────────────────────────────────────────

/**
 * Ids in this schema are cuids. The pattern is narrower than "anything a cuid
 * could be" on purpose: an id format change should fail a test rather than
 * silently widen what may appear in a route parameter.
 */
export const mediaIdentifierSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export function parseMediaIdentifier(raw: unknown): string | null {
  const parsed = mediaIdentifierSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ── Owning tenant ────────────────────────────────────────────────────────────

interface AssetLookupModel {
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
}

type OwnerLookup =
  | { readonly ok: true; readonly organizationId: string }
  | { readonly ok: false; readonly outcome: ByteServingRefusal["outcome"] };

async function resolveOwningOrganizationId(assetId: string): Promise<OwnerLookup> {
  const db = await getPrisma();
  // No client at all is infrastructure, not a statement about this asset.
  if (!db) return { ok: false, outcome: BYTE_SERVING_UNAVAILABLE };
  try {
    const model = (db as Record<string, unknown>).mediaAsset as AssetLookupModel;
    const row = await model.findUnique({
      where: { id: assetId },
      select: { organizationId: true },
    });
    if (!row || typeof row.organizationId !== "string") return { ok: false, outcome: BYTE_SERVING_NOT_FOUND };
    return { ok: true, organizationId: row.organizationId };
  } catch {
    // The error is deliberately not inspected: a driver message can carry a
    // schema or a query, and nothing here is allowed to reach a response.
    return { ok: false, outcome: BYTE_SERVING_UNAVAILABLE };
  }
}

// ── The gate ─────────────────────────────────────────────────────────────────

export interface AuthorizeByteServingInput {
  readonly req: NextRequest;
  /** The RAW route parameter. Validated here, never trusted by the caller. */
  readonly assetId: unknown;
}

/**
 * Decides whether this request may receive bytes for this asset.
 *
 * Runs ENTIRELY before storage is touched — a caller that is not entitled must
 * not be able to make the server open a descriptor, let alone read one.
 *
 * A note on the routes' redundant `requirePermission` call: every handler
 * re-asserts {@link MEDIA_BYTE_SERVING_PERMISSION} against
 * {@link ByteServingGrant.actorRole} after this function returns. It is genuine
 * defence in depth — a future change here that widened the grant would still be
 * refused at the surface — and it is also what keeps each handler's own
 * authorization evidence visible to the Phase 99 route-security classifier,
 * which reads guard tokens from the handler body and its module-local helpers
 * and does not follow imports. Hoisting the chain without leaving that call
 * behind would reclassify all three handlers as `UNKNOWN` and fail readiness.
 */
export async function authorizeByteServing(
  input: AuthorizeByteServingInput,
): Promise<ByteServingAuthorization> {
  const assetId = parseMediaIdentifier(input.assetId);
  if (assetId === null) return notFound;

  const owner = await resolveOwningOrganizationId(assetId);
  if (!owner.ok) return owner.outcome === BYTE_SERVING_UNAVAILABLE ? unavailable : notFound;
  const organizationId = owner.organizationId;

  // ── The anonymous path ────────────────────────────────────────────────────
  const publicRead = await getMediaAssetById({
    organizationId,
    id: assetId,
    audience: PUBLIC_AUDIENCE,
  });
  if (publicRead.ok) {
    const asset = publicRead.value;
    // Belt and braces on top of the repository gate: neither predicate may be
    // dropped without this failing.
    if (!isServable(asset) || !isPubliclyReadable(asset)) return notFound;
    return { ok: true, asset, assetId, organizationId, servedPublicly: true, actorRole: null };
  }
  if (publicRead.reason === "STORAGE_UNAVAILABLE") return unavailable;

  // ── The member path ───────────────────────────────────────────────────────
  const actor = await requireOrgActor(input.req, organizationId);
  // Unauthenticated, not a member, membership not active — all one outcome. See
  // the disclosure policy at the top of this file.
  if ("error" in actor) return notFound;

  const { ctx } = actor;
  const permitted = requirePermission(ctx.role, MEDIA_BYTE_SERVING_PERMISSION);
  if (!permitted.ok) return notFound;

  const scopedRead = await getMediaAssetById({
    organizationId,
    id: assetId,
    audience: {
      scope: "EDITORIAL",
      includeUnpublished: true,
      permissions: heldMediaPermissions(ctx.role),
    },
  });
  if (!scopedRead.ok) {
    return scopedRead.reason === "STORAGE_UNAVAILABLE" ? unavailable : notFound;
  }

  const asset = scopedRead.value;
  if (!isServable(asset)) return notFound;

  return { ok: true, asset, assetId, organizationId, servedPublicly: false, actorRole: ctx.role };
}

// ── Shared response headers ──────────────────────────────────────────────────

/**
 * A published, public asset is cacheable; anything reachable only with a session
 * must never be written to a shared cache.
 */
const PUBLIC_CACHE_CONTROL = "public, max-age=3600";
const PRIVATE_CACHE_CONTROL = "private, no-store";

export interface ByteServingHeaderInput {
  /** ALWAYS a server-side allow-list constant. Never a string echoed from a row. */
  readonly contentType: string;
  /**
   * A SERVER-generated ASCII filename. Built only from regex-validated
   * identifiers and a canonical extension, so it carries no client input, no
   * path separator and no second extension, and cannot be steered into a
   * download-and-execute.
   */
  readonly filename: string;
  readonly isPublic: boolean;
  /** `stream` advertises byte ranges; `poster` and `subtitles` do not. */
  readonly acceptRanges?: boolean;
}

export function byteServingHeaders(input: ByteServingHeaderInput): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": input.contentType,
    // Stops a browser re-deciding the type from the bytes. Every one of these
    // surfaces asserts a type it has verified, so sniffing can only weaken it.
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename="${input.filename}"`,
    "Cache-Control": input.isPublic ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL,
    "Cross-Origin-Resource-Policy": input.isPublic ? "cross-origin" : "same-origin",
  };
  if (input.acceptRanges) headers["Accept-Ranges"] = "bytes";
  return headers;
}
