/**
 * Shared authorisation helpers for the Digital Twin management routes — Slice 1.
 *
 * The routes call the repository's OFFICIAL guards themselves, in strict order and
 * in plain sight (so the Phase 99 route inventory — which classifies a handler by
 * the guard calls it can see — keeps recognising them, and a reviewer can read the
 * chain top to bottom):
 *
 *   requirePlatformAuth → requireSessionAuth → requireOrgActor → requirePermission
 *   → (per site) authorizeTwinSite = requireSiteActor + requireSitePermission
 *
 * This module holds only the pieces every route shares.
 *
 * SESSION ONLY. Owner decision for this slice: the management routes accept a
 * browser session and nothing else. `requireOrgActor` already reads only the
 * access-token cookie, so an API-key caller got a 401 by accident; the explicit
 * `requireSessionAuth` turns that accident into a stated rule, and also closes the
 * mixed case (an API key in the header AND a session cookie in the same request).
 * Machine access belongs on the dedicated Gateway/Connector path, not here.
 *
 * SITE SCOPE. Org-level `view_digital_twin` / `manage_digital_twin` say what a
 * member may do to the twin in general; they say nothing about WHICH sites. Site
 * reach comes from `requireSiteActor` / `getAllowedSiteIds` exactly as for
 * `industrial/assets` (OWNER/ADMIN implicit, everyone else needs an ACTIVE
 * UserSite row; a user with no row reaches nothing). The twin has no site role
 * vocabulary of its own: reads need `view_assets`, writes need `manage_assets` —
 * the twin IS the topology of those assets.
 *
 * A site the caller may not reach is reported as NOT FOUND, indistinguishable from
 * a site that does not exist.
 */

import type { NextRequest, NextResponse } from "next/server";
import { requireSiteActor } from "@/lib/site/context";
import { requireSitePermission } from "@/lib/site/rbac";
import type { ContextRefusal } from "@/lib/auth/context-result";
import { twinJsonError, type TwinDomainError, type TwinResponseCode } from "./errors";

/** Who is acting, as established by the guards — never taken from the request. */
export interface TwinCtx {
  orgId: string;
  userId: string;
}

export type TwinSiteAccess = "view" | "manage";

/** The shape every official guard refuses with; `code` exists only on `RefusedRequest`. */
export interface GuardRefusal {
  error: string;
  status: number;
  code?: ContextRefusal;
}

/**
 * A refusal from `requirePlatformAuth` / `requireOrgActor` / `requirePermission`.
 *
 * `requirePlatformAuth` refuses with a `RefusedRequest` — `{ error, status, code }` —
 * and the UI branches on that code (select an organisation, reload, retry later, …).
 * Status, message AND code are therefore forwarded exactly as the guard produced
 * them. A code is never inferred from a status: 409 means "select an organisation",
 * not "forbidden", and 503 means "retry", not "ask an administrator".
 *
 * `requireOrgActor` and `requirePermission` return no code and only ever refuse with
 * 401 or 403, which have an unambiguous official meaning. Any OTHER uncoded status
 * is preserved with a neutral code rather than a guessed claim about permissions.
 */
export function twinAuthRefusal(r: GuardRefusal): NextResponse {
  const code: TwinResponseCode =
    r.code ??
    (r.status === 401 ? "AUTHENTICATION_REQUIRED"
      : r.status === 403 ? "FORBIDDEN"
      : "REQUEST_REFUSED");
  return twinJsonError(r.status, code, r.error);
}

/** Refuse anything that is not a browser session (see the header note). */
export function requireSessionAuth(ctx: { authMethod: string }): NextResponse | null {
  if (ctx.authMethod === "jwt") return null;
  return twinJsonError(403, "SESSION_REQUIRED", "Session authentication required");
}

/**
 * Authorise the caller on one site. `notFound` is the refusal to use when the
 * site is unreachable — the SAME value the caller would get for a site that does
 * not exist.
 */
export async function authorizeTwinSite(
  req: NextRequest,
  ctx: TwinCtx,
  siteId: string,
  access: TwinSiteAccess,
  notFound: () => TwinDomainError,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const siteAuth = await requireSiteActor(req, ctx.orgId, siteId);
  if ("error" in siteAuth) {
    const nf = notFound();
    return { ok: false, response: twinJsonError(nf.status, nf.code, nf.message) };
  }
  const sitePerm = requireSitePermission(
    siteAuth.ctx.role,
    access === "manage" ? "manage_assets" : "view_assets",
  );
  if (!sitePerm.ok) {
    return {
      ok: false,
      response: twinJsonError(sitePerm.status, "INSUFFICIENT_SITE_PERMISSION", sitePerm.error),
    };
  }
  return { ok: true };
}

/** Authorise several sites (deduplicated). Stops at the first refusal. */
export async function authorizeTwinSites(
  req: NextRequest,
  ctx: TwinCtx,
  siteIds: string[],
  access: TwinSiteAccess,
  notFound: () => TwinDomainError,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  for (const siteId of new Set(siteIds)) {
    const r = await authorizeTwinSite(req, ctx, siteId, access, notFound);
    if (!r.ok) return r;
  }
  return { ok: true };
}
