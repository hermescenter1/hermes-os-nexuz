// PHASE 94B4 — the one place every OT/engineering route gets its security from.
//
// WHY A KIT RATHER THAN PER-ROUTE CODE
// Nineteen handlers each doing "authenticate, resolve org, check permission,
// resolve sites, build context, rate limit, set no-store" is nineteen chances
// to forget one. `withOtRoute` performs the whole sequence once and hands the
// handler an ALREADY-TRUSTED context; a handler cannot run before every gate
// has passed, because it is only invoked from inside the gate chain.
//
// The trusted context is built from server-resolved values only. There is no
// code path here that reads organizationId, userId, role or allowedSiteIds
// from a request body or query string.

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/billing/context";
import { requireOrgActor } from "@/lib/org/context";
import { getAllowedSiteIds } from "@/lib/site/context";
import { checkRateLimit } from "@/lib/auth/rate-limiter";
import { resolveClientIp } from "@/lib/security/request-guards";
import type { OrgPermission } from "@/lib/org/rbac";
import { can } from "@/lib/org/rbac";
import { buildOtServiceContext, type OtServiceContext } from "../service-context";
import type { ServiceError, ServiceErrorCode, ServiceResult } from "../services/core";

/** Private operational data must never be cached by a proxy or a browser. */
export const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json",
} as const;

export function privateJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

/**
 * Stable public error codes.
 *
 * The wire contract is this code plus a fixed English sentence. Neither depends
 * on the service's internal hint, so a service refactor cannot change what a
 * client sees, and an internal message cannot leak through.
 */
export const HTTP_STATUS: Record<ServiceErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
  UNSUPPORTED_FORMAT: 415,
  PAYLOAD_TOO_LARGE: 413,
  // A signature failure is answered exactly like any other authorization
  // refusal, so a prober cannot tell "bad MAC" from "not allowed".
  SIGNATURE_INVALID: 403,
  STALE_TIMESTAMP: 422,
  REPLAY_DETECTED: 409,
  CAPABILITY_NOT_ALLOWED: 403,
  TRANSIENT_FAILURE: 503,
  INTERNAL_FAILURE: 500,
};

const MESSAGE: Record<ServiceErrorCode, string> = {
  UNAUTHENTICATED: "Authentication required.",
  FORBIDDEN: "You do not have permission to perform this operation.",
  NOT_FOUND: "The requested resource was not found.",
  CONFLICT: "The request conflicts with the current state of the resource.",
  VALIDATION_FAILED: "The request payload is not valid.",
  UNSUPPORTED_FORMAT: "This content type is not supported in this release.",
  PAYLOAD_TOO_LARGE: "The request payload is too large.",
  SIGNATURE_INVALID: "You do not have permission to perform this operation.",
  STALE_TIMESTAMP: "The request timestamp is outside the accepted window.",
  REPLAY_DETECTED: "This request has already been processed.",
  CAPABILITY_NOT_ALLOWED: "You do not have permission to perform this operation.",
  TRANSIENT_FAILURE: "The service is temporarily unavailable. Please retry.",
  INTERNAL_FAILURE: "The request could not be completed.",
};

/** Render a service error as HTTP. The service's `hint` is deliberately dropped. */
export function errorResponse(err: ServiceError): NextResponse {
  const status = HTTP_STATUS[err.code];
  return privateJson({ ok: false, code: err.code, message: MESSAGE[err.code] }, status);
}

/** Render a service result. */
export function resultResponse<T>(result: ServiceResult<T>, okStatus = 200): NextResponse {
  return result.ok
    ? privateJson({ ok: true, data: result.value }, okStatus)
    : errorResponse(result);
}

export function badRequest(code: string, message: string): NextResponse {
  return privateJson({ ok: false, code, message }, 400);
}

export function tooManyRequests(): NextResponse {
  return NextResponse.json(
    { ok: false, code: "RATE_LIMITED", message: "Too many requests. Please retry shortly." },
    { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "60" } },
  );
}

/* ── Trusted context ────────────────────────────────────────────────────── */

export interface OtRouteOptions {
  permission: OrgPermission;
  /** Rate-limit bucket declared in the shared limiter. */
  bucket: string;
}

/**
 * Run `handler` only after every gate passes.
 *
 * ORDER MATTERS: authentication precedes authorization, which precedes rate
 * limiting keyed by the authenticated actor. Rate-limiting first would let an
 * anonymous flood consume a real user's budget; limiting by IP alone would let
 * one tenant behind a NAT starve another.
 */
export async function withOtRoute(
  req: NextRequest,
  opts: OtRouteOptions,
  handler: (ctx: OtServiceContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  // 1. Authentication + the organization the actor actually belongs to. The
  //    org is RESOLVED here; it is never read from the request.
  const org = await requireOrgContext(req);
  if ("error" in org) {
    return privateJson({ ok: false, code: "UNAUTHENTICATED", message: MESSAGE.UNAUTHENTICATED }, 401);
  }

  // 2. Membership must still be active (suspended members lose access).
  const actor = await requireOrgActor(req, org.ctx.orgId);
  if ("error" in actor) {
    return privateJson(
      { ok: false, code: "FORBIDDEN", message: MESSAGE.FORBIDDEN },
      actor.status === 401 ? 401 : 403,
    );
  }

  // 3. Permission, through the existing RBAC system.
  if (!can(actor.ctx.role, opts.permission)) {
    return privateJson({ ok: false, code: "FORBIDDEN", message: MESSAGE.FORBIDDEN }, 403);
  }

  // 4. Rate limit, keyed by the AUTHENTICATED actor so one tenant cannot
  //    exhaust another's budget. The IP is a secondary key for shared accounts.
  const allowed = await checkRateLimit(opts.bucket, `${actor.ctx.userId}:${resolveClientIp(req)}`);
  if (!allowed) return tooManyRequests();

  // 5. Site scope. `getAllowedSiteIds` returns [] for an actor with no site
  //    access — passed through as-is, which the context treats as deny-all.
  const siteIds = await getAllowedSiteIds(actor.ctx.userId, actor.ctx.orgId);

  const ctx = buildOtServiceContext({
    userId: actor.ctx.userId,
    organizationId: actor.ctx.orgId,
    role: actor.ctx.role,
    allowedSiteIds: siteIds,
    requestId: req.headers.get("x-request-id"),
  });

  try {
    return await handler(ctx);
  } catch {
    // A thrown handler must not surface a stack or a driver message.
    return privateJson(
      { ok: false, code: "INTERNAL_FAILURE", message: MESSAGE.INTERNAL_FAILURE },
      500,
    );
  }
}

/* ── Query parsing ──────────────────────────────────────────────────────── */

/** Page size ceiling, matching the persistence layer's own bound. */
export const MAX_PAGE_SIZE = 200;

export interface ParsedQuery {
  take: number;
  skip: number;
  sortBy?: string;
  sortDir?: string;
}

/**
 * Parse pagination from the query string.
 *
 * Every malformed form (NaN, Infinity, negative, text, absurdly large) is
 * normalised into the safe band rather than rejected, so a client cannot use a
 * parse error as an oracle. The sort FIELD is not validated here — the
 * persistence layer owns the per-entity allow-list, which is the only place
 * that knows which columns exist.
 */
export function parseQuery(url: URL): ParsedQuery {
  const num = (raw: string | null, fallback: number) => {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  };
  const page = Math.max(num(url.searchParams.get("page"), 1), 1);
  const size = Math.min(Math.max(num(url.searchParams.get("pageSize"), 50), 1), MAX_PAGE_SIZE);
  const dir = url.searchParams.get("sortDir");
  return {
    take: size,
    skip: (page - 1) * size,
    sortBy: url.searchParams.get("sortBy") ?? undefined,
    sortDir: dir === "asc" || dir === "desc" ? dir : undefined,
  };
}

/* ── Idempotency header ─────────────────────────────────────────────────── */

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_.:-]{8,128}$/;

/**
 * Read and validate the idempotency key.
 *
 * The value is NEVER echoed into the error, because the error is visible to a
 * caller who may have sent someone else's key by mistake — and because an
 * echoed key ends up in logs and proxies.
 */
export function readIdempotencyKey(req: NextRequest): { ok: true; key: string } | { ok: false } {
  const raw = req.headers.get(IDEMPOTENCY_HEADER)?.trim() ?? "";
  return IDEMPOTENCY_PATTERN.test(raw) ? { ok: true, key: raw } : { ok: false };
}
