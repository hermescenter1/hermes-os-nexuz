/**
 * PHASE 109-C-UI.2 — /[locale]/live-operations
 *
 * ROADMAP page 09. A SERVER component: every read happens here, behind the
 * tenant boundary, and nothing about the plant is fetched by the browser.
 *
 * AUTHORIZATION happens twice, on purpose.
 *
 *   1. `src/middleware.ts` runs on every request. `/live-operations` is
 *      registered in `PROTECTED_PATHS` (`src/lib/auth/rbac.ts`) and routed to
 *      `canAccessEngineering(role)` by `isAuthorizedForPath`. Without that
 *      registration a new top-level route is PUBLIC, and this page would have
 *      published tenant-scoped plant data to anonymous visitors.
 *   2. This page resolves a TENANT context of its own and re-checks the
 *      organization permission. Middleware proves a platform role; it proves
 *      nothing about which organization the reader belongs to. Both are needed,
 *      and the second is the one that separates one company from another.
 *
 * ROUTE GENERATION. `force-dynamic`, and it is honest here in a way it was not
 * on the Studio: this page reads cookies through the session resolver and a
 * database whose contents change per request. There is nothing to prerender and
 * a cached render would be a stale operations screen — the exact failure the
 * page is built to make visible.
 */

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { resolveTenantContextFromServerSession } from "@/lib/tenant/context";
import { can } from "@/lib/org/rbac";
import { getAllowedSiteIds } from "@/lib/site/context";
import { listSites } from "@/lib/industrial/sites";
import { buildLiveOperationsFeed } from "@/lib/live-operations/feed";
import { parseFilter } from "@/lib/live-operations/contract";
import { LiveOperationsWorkspace } from "@/components/live-operations/LiveOperationsWorkspace";
import { AccessRefusal } from "@/components/live-operations/AccessRefusal";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "liveOperations" });
  return {
    title: `${t("metaTitle")} · Hermes OS`,
    // An authenticated operations surface is never indexed.
    robots: { index: false, follow: false },
  };
}

export default async function LiveOperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const tenant = await resolveTenantContextFromServerSession();

  /*
    Every refusal renders its OWN state. They are deliberately not collapsed
    into one "no access" screen: "you belong to no organization", "you belong to
    several and none is selected" and "we could not read your membership" are
    three different facts, and the third one in particular must never look like
    an empty plant.
  */
  if (tenant.state !== "SINGLE_ACTIVE_ORGANIZATION") {
    return <AccessRefusal state={tenant.state} />;
  }

  // The organization role is proven, not claimed. `view_industrial` is the same
  // permission the industrial APIs require.
  // `organizationRole` is typed against ORGANIZATION_ROLES, which is a superset
  // of the roles `can` reasons about; an unknown role therefore falls through to
  // `can`'s default-deny rather than being widened here.
  if (!can(tenant.organizationRole as Parameters<typeof can>[0], "view_industrial")) {
    return <AccessRefusal state="FORBIDDEN" />;
  }

  const allowedSiteIds = await getAllowedSiteIds(tenant.userId, tenant.organizationId);
  const sites = await listSites(tenant.organizationId, allowedSiteIds);

  // Filters come from the URL and are parsed against the reader's OWN allowed
  // sites, so a hand-typed site id belonging to another company is refused
  // before it reaches a query.
  const filter = parseFilter(await searchParams, allowedSiteIds);

  const feed = await buildLiveOperationsFeed({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    filter,
    nowEpochMs: Date.now(),
  });

  return (
    <LiveOperationsWorkspace
      feed={feed}
      sites={sites.map((s) => ({ id: s.id, name: s.name }))}
      organizationSlug={tenant.organizationSlug}
    />
  );
}
