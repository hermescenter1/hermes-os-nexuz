/**
 * PHASE 109-C-UI.3 — /[locale]/engineering/scada-control-room
 *
 * A SERVER component. Every read happens here, behind the tenant boundary, and
 * the browser fetches nothing about the plant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS ROUTE SITS UNDER /engineering
 * ─────────────────────────────────────────────────────────────────────────────
 * `engineering` is ALREADY registered in `PROTECTED_PATHS` and routed to
 * `canAccessEngineering` by `isAuthorizedForPath` (src/lib/auth/rbac.ts). Adding
 * a new TOP-LEVEL route would have required editing that registry and the
 * middleware matcher — and a top-level route that is not registered there is
 * PUBLIC, which for this data would mean publishing a tenant's plant estate to
 * anonymous visitors. Living under an already-protected prefix removes that
 * failure mode instead of managing it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTHORISATION HAPPENS TWICE, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Middleware proves a PLATFORM role for the `/engineering` prefix.
 *   2. This page resolves a TENANT context of its own and re-checks the
 *      organisation permission and the site grant.
 *
 * Middleware proves nothing about which organisation the reader belongs to. The
 * second check is the one that separates one company's plant from another's,
 * and the site grant is the one that separates one plant from its neighbour.
 *
 * FAIL CLOSED, ALWAYS. Every branch that cannot establish identity, tenancy,
 * permission, a site grant or a readable backend renders an explicit refusal.
 * There is no path on which this page shows an empty, calm-looking screen
 * because something went wrong upstream.
 */

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { resolveTenantContextFromServerSession } from "@/lib/tenant/context";
import { hasTenantContext } from "@/lib/tenant/contract";
import { can } from "@/lib/org/rbac";
import { getAllowedSiteIds } from "@/lib/site/context";
import { narrowToOrgRole } from "@/lib/scada-control-room/contract";
import { buildControlRoomView } from "@/lib/scada-control-room/view";
import { ControlRoomWorkspace } from "@/components/scada-control-room/ControlRoomWorkspace";
import { AccessRefusal } from "@/components/scada-control-room/AccessRefusal";

/*
  Honest here: this page reads cookies through the session resolver and a
  database whose contents change per request. There is nothing to prerender, and
  a cached render would be a stale operations screen — the exact failure the page
  exists to make visible.
*/
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "otEdge.controlRoom" });
  return {
    title: `${t("metaTitle")} · Hermes OS`,
    // An authenticated operations surface is never indexed.
    robots: { index: false, follow: false },
  };
}

export default async function ScadaControlRoomPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const tenant = await resolveTenantContextFromServerSession();
  if (!hasTenantContext(tenant)) {
    /*
      The resolver distinguishes "no identity" from "no single active
      organisation", and so does the refusal: one tells the reader to sign in,
      the other tells them their account is not attached to one organisation.
      Neither reveals whether any organisation exists.
    */
    const code =
      tenant.state === "UNAUTHENTICATED" ? "AUTHENTICATION_REQUIRED" : "ORGANIZATION_SCOPE_REQUIRED";
    return <AccessRefusal code={code} locale={locale} />;
  }

  /*
    The organisation permission. `view_industrial` is the read predicate the rest
    of the industrial surface already uses; this page invents no new one.

    The narrowing in front of it is not ceremony. The tenant resolver returns
    `OrganizationRole` — fifteen values, including HR_MANAGER and STUDENT — while
    the permission matrix speaks a seven-value vocabulary. An unknown role
    refuses rather than being assumed harmless.
  */
  const orgRole = narrowToOrgRole(tenant.organizationRole);
  if (orgRole === null || !can(orgRole, "view_industrial")) {
    return <AccessRefusal code="PERMISSION_REQUIRED" locale={locale} />;
  }

  /*
    The site grant. `getAllowedSiteIds` is fail-closed by construction — it
    returns [] when it throws — so an empty list is treated as "no access",
    never as "no restriction". That asymmetry is the site boundary.
  */
  const allowedSiteIds = await getAllowedSiteIds(tenant.userId, tenant.organizationId);
  if (allowedSiteIds.length === 0) {
    return <AccessRefusal code="NO_ACCESSIBLE_SITE" locale={locale} />;
  }

  /*
    The engineering half — alarm definitions and declared network nodes — is
    governed by `view_engineering_project`, which the permission matrix keeps
    deliberately separate from the registry permission above: an alarm export
    describes how a plant is controlled. Today both permissions hold the same
    roles, so nothing changes for any current reader; the day they diverge,
    this page follows the matrix instead of quietly outliving it. Lacking it
    withholds those two panels, not the whole page.
  */
  const engineeringPermitted = can(orgRole, "view_engineering_project");

  const view = await buildControlRoomView({
    organizationId: tenant.organizationId,
    allowedSiteIds,
    engineeringPermitted,
  });

  /*
    A readable backend that returns no site, when the caller HAS grants, means
    the read itself failed — the grants name sites the query could not find. That
    is a backend problem, and it is reported as one rather than as an empty
    control room.
  */
  if (view.sites.length === 0) {
    return <AccessRefusal code="BACKEND_UNAVAILABLE" locale={locale} />;
  }

  return <ControlRoomWorkspace view={view} locale={locale} />;
}
