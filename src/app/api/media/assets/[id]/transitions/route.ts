/**
 * PHASE 102 — Hermes Media & Video Hub: the editorial workflow endpoint.
 *
 * Design authority: docs/phase102/architecture.md §11.
 *
 * `DRAFT → SUBMITTED → IN_REVIEW → PUBLISHED → ARCHIVED`, with `REJECTED`
 * reachable from review. The machine itself is NOT reimplemented here: the closed
 * transition table lives in `src/lib/media/lifecycle.ts` and the compare-and-swap
 * write lives in `src/lib/media/db.ts`. This handler's whole job is to bind an
 * HTTP request to those two, and to refuse everything they refuse.
 *
 * PERMISSION PER TRANSITION. Author-side moves (`SUBMIT`, `ARCHIVE`, `RESTORE`)
 * need `manage_media`; the review decisions (`START_REVIEW`, `PUBLISH`, `REJECT`)
 * need `review_media`, so an author cannot publish their own material by default.
 * The required permission is read off the edge — it is not restated here, because
 * a second copy of the table is a second chance to disagree with it.
 *
 * CONCURRENCY. The repository re-reads the current status inside the transaction
 * and uses it as the compare-and-swap predicate, treating `affected !== 1` as a
 * conflict. A caller may additionally send `expectedStatus`; a stale value is a
 * 409 and never a silent overwrite of whatever the row happens to hold now.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requirePlatformAuth } from "@/lib/api/auth";
import { requireOrgActor } from "@/lib/org/context";
import { can, requirePermission, type OrgPermission } from "@/lib/org/rbac";
import type { OrgRole } from "@/lib/org/types";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import {
  isJsonContentType,
  readBoundedTextBody,
  requireTrustedOrigin,
} from "@/lib/security/request-guards";
import { recordAuditEvent } from "@/lib/audit/audit-service";
import { z } from "zod";
import { enforceEntitlement } from "@/lib/billing-governance/runtime/require-entitlement";
import { getMediaAssetById, transitionMediaAssetStatus } from "@/lib/media/db";
import { editorialActionRequiresEntitlement, findEditorialTransition } from "@/lib/media/lifecycle";
import {
  MEDIA_LIFECYCLE_STATUSES,
  isMediaLifecycleStatus,
} from "@/lib/media/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA_PERMISSIONS: readonly OrgPermission[] = ["view_media", "manage_media", "review_media"];

function permissionsOf(role: OrgRole): readonly OrgPermission[] {
  return MEDIA_PERMISSIONS.filter((p) => can(role, p));
}

const MEDIA_TRANSITION_LIMIT = "media-editorial-transition";
const MAX_BODY_BYTES = 8 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function json(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers });
}

/**
 * The request body.
 *
 * `.strict()` matters here as much as on a create: a body carrying
 * `organizationId`, `actorUserId`, `publishedAt` or `action` must be rejected,
 * not partially honoured. The action is DERIVED from the edge, never accepted.
 */
const transitionSchema = z
  .object({
    to: z.enum(MEDIA_LIFECYCLE_STATUSES),
    /** Optimistic concurrency: the status the caller believes the asset is in. */
    expectedStatus: z.enum(MEDIA_LIFECYCLE_STATUSES).optional(),
    /** Free text, recorded on the editorial event. Never placed in audit metadata. */
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAuth(req);
  if ("error" in auth) return json({ error: auth.error, code: "AUTHENTICATION_REQUIRED" }, auth.status);

  // Same-origin, for cookie-authenticated writes only. Runs before the id is
  // read, so the refusal is identical for every id.
  const originGate = requireTrustedOrigin(req, auth.ctx.authMethod);
  if (!originGate.ok) return json({ error: "Forbidden", code: "FORBIDDEN" }, 403);

  const member = await requireOrgActor(req, auth.ctx.orgId);
  if ("error" in member) return json({ error: member.error, code: "ORGANIZATION_SCOPE_REQUIRED" }, member.status);

  // Baseline gate: an actor who may not read the library may not move anything
  // inside it. The per-edge permission is enforced below, once the edge is known.
  const baseline = requirePermission(member.ctx.role, "view_media");
  if (!baseline.ok) return json({ error: baseline.error, code: "INSUFFICIENT_PERMISSION" }, baseline.status);

  const organizationId = member.ctx.orgId;
  const actorUserId = member.ctx.userId;
  const permissions = permissionsOf(member.ctx.role);

  const { id } = await params;
  if (!ID_PATTERN.test(id)) return json({ error: "Not found", code: "NOT_FOUND" }, 404);

  const limitKey = `${organizationId}:${actorUserId}`;
  if (!(await checkRateLimit(MEDIA_TRANSITION_LIMIT, limitKey))) {
    return json({ error: "Too many requests", code: "RATE_LIMITED" }, 429, {
      "Retry-After": String(retryAfter(MEDIA_TRANSITION_LIMIT, limitKey)),
    });
  }

  if (!isJsonContentType(req)) {
    return json({ error: "JSON request body required", code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  }
  const body = await readBoundedTextBody(req, MAX_BODY_BYTES);
  if (body.status === "too_large") {
    return json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, 413);
  }
  if (body.status === "error") {
    return json({ error: "Malformed request body", code: "INVALID_INPUT" }, 400);
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(body.text);
  } catch {
    return json({ error: "Malformed request body", code: "INVALID_INPUT" }, 400);
  }

  const parsed = transitionSchema.safeParse(candidate);
  if (!parsed.success) return json({ error: "Invalid transition request", code: "INVALID_INPUT" }, 400);
  const input = parsed.data;

  // Cross-tenant and non-existent are indistinguishable: the tenant predicate is
  // in the query, so 404 here is a fact about the result set, not a policy choice
  // applied afterwards.
  const loaded = await getMediaAssetById({
    organizationId,
    id,
    audience: { scope: "EDITORIAL", includeUnpublished: true, permissions },
  });
  if (!loaded.ok) {
    if (loaded.reason === "NOT_FOUND") return json({ error: "Not found", code: "NOT_FOUND" }, 404);
    if (loaded.reason === "FORBIDDEN") {
      return json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, 403);
    }
    if (loaded.reason === "STORAGE_UNAVAILABLE") {
      return json({ error: "Media library is temporarily unavailable", code: "STORAGE_UNAVAILABLE" }, 503);
    }
    return json({ error: "Could not load the media asset", code: "READ_FAILED" }, 500);
  }

  const from = loaded.value.status;
  if (!isMediaLifecycleStatus(from)) {
    // A value the CHECK constraint should have made impossible. No transition may
    // be computed from a state this module cannot name.
    return json({ error: "The asset is in an unknown state", code: "CONFLICT" }, 409);
  }

  if (input.expectedStatus && input.expectedStatus !== from) {
    return json(
      { error: "The asset has moved on", code: "STALE_STATE", currentStatus: from },
      409,
    );
  }

  const edge = findEditorialTransition(from, input.to);
  if (!edge) {
    return json(
      { error: "That transition is not allowed", code: "ILLEGAL_TRANSITION", currentStatus: from },
      409,
    );
  }

  // The edge's own permission, checked with the real RBAC table.
  const edgePerm = requirePermission(member.ctx.role, edge.permission);
  if (!edgePerm.ok) return json({ error: edgePerm.error, code: "INSUFFICIENT_PERMISSION" }, edgePerm.status);

  // Commercial gate, AFTER RBAC and AFTER the edge is known — the action decides
  // whether it applies at all. A tenant without `video_hub` may not submit,
  // start a review, publish or restore; it may always ARCHIVE (withdraw live
  // material, tidy up) and REJECT (refuse publication), because a gate that
  // trapped published content in public view with no way to take it down would
  // be a hostage, not a gate. See `MEDIA_EXPOSURE_REDUCING_ACTIONS`.
  //
  // `requestedUnits: 0` asks whether the capability is AVAILABLE rather than
  // metering another unit — a state change is not a new asset.
  if (editorialActionRequiresEntitlement(edge.action)) {
    const entitlement = await enforceEntitlement({
      organisationId: organizationId,
      entitlementKey: "video_hub",
      requestedUnits: 0,
      userId: actorUserId,
    });
    if (!entitlement.ok) return entitlement.response;
  }

  // The repository re-evaluates the table, re-reads the status inside the
  // transaction, pins `processingState` on the publish edge, writes the
  // MediaEditorialEvent in the same transaction and treats a non-unit update as
  // a conflict. Nothing above is trusted by it.
  const result = await transitionMediaAssetStatus({
    id,
    organizationId,
    actorUserId,
    to: input.to,
    permissions,
    reason: input.reason ?? null,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "NOT_FOUND":
        return json({ error: "Not found", code: "NOT_FOUND" }, 404);
      case "FORBIDDEN":
        return json({ error: "Insufficient organization permissions", code: "INSUFFICIENT_PERMISSION" }, 403);
      case "ILLEGAL_TRANSITION":
        return json({ error: "That transition is not allowed", code: "ILLEGAL_TRANSITION" }, 409);
      case "PROCESSING_NOT_READY":
        return json(
          { error: "The media has not finished validation", code: "PROCESSING_NOT_READY" },
          409,
        );
      case "CONFLICT":
        return json({ error: "The asset changed while the transition ran", code: "CONFLICT" }, 409);
      case "STORAGE_UNAVAILABLE":
        return json({ error: "Media library is temporarily unavailable", code: "STORAGE_UNAVAILABLE" }, 503);
      case "INVALID_INPUT":
        return json({ error: "Invalid transition request", code: "INVALID_INPUT" }, 400);
      default:
        return json({ error: "Could not apply the transition", code: "TRANSITION_FAILED" }, 500);
    }
  }

  // Closed enums and identifiers only. `reason` is operator free text and lives
  // on the MediaEditorialEvent row — the editorial record — never in audit
  // metadata, which is read by surfaces with a different audience.
  await recordAuditEvent({
    userId: actorUserId,
    action: "media.asset.transitioned",
    entityType: "MediaAsset",
    entityId: id,
    organizationId,
    outcome: "success",
    metadata: {
      fromStatus: result.value.from,
      toStatus: result.value.to,
      editorialAction: result.value.action,
      requiredPermission: edge.permission,
      processingState: loaded.value.processingState,
      hasReason: Boolean(input.reason),
    },
  });

  return json(
    {
      transition: {
        id: result.value.id,
        from: result.value.from,
        to: result.value.to,
        action: result.value.action,
      },
    },
    200,
  );
}
