// PHASE 87K — canonical organization administration landing.
//
// Adds a premium administration command surface (attention → membership →
// invitations → plan/subscription → usage vs. limits → next actions) above the
// EXISTING OrgOverview editor, which keeps its own fetch/save handlers
// untouched. All records are read server-side through the EXISTING org and
// billing service functions and are already tenant-scoped by `orgId` — this
// page adds no API, no query and no authorization of its own.
//
// SHELL NOTE: this page deliberately KEEPS the legacy `PageShell`. The PHASE
// 87D contract (public-shell-rollout.test.ts → PROTECTED_KEEP_LEGACY) pins it,
// and rewriting that contract to fit this redesign is out of scope. The
// AppShell inconsistency for authenticated /dashboard/* pages is reported as a
// backlog item rather than silently changed.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { cookies }     from "next/headers";
import { PageShell }   from "@/components/PageShell";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { OrgOverview } from "@/components/organization/OrgOverview";
import { PageHeader }  from "@/components/ui/PageHeader";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";
import { listMembers }         from "@/lib/org/members";
import { listInvitations }     from "@/lib/org/invitations";
import { getSubscription }     from "@/lib/billing/subscriptions";
import { getUsageSummary }     from "@/lib/billing/usage";
import { AdministrationCommandSurface, buildLimitRows } from "@/components/organization-administration";

/**
 * PHASE 87L.6G — explicit noindex. The route is already unreachable to
 * anonymous crawlers (middleware redirects to login) and robots disallows
 * /{locale}/dashboard/, but the page-level directive is a third,
 * transport-independent declaration so a future routing change cannot make
 * an administration surface indexable by accident.
 */
export const metadata = { robots: { index: false, follow: false } };

type MemberModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };

/** Metrics surfaced against plan limits — numeric PlanLimits keys only. */
const USAGE_METRICS = [
  "members", "projects", "storage_gb", "api_calls", "ai_requests",
] as const;

async function getOrgIdForUser(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;
  const db = await getPrisma();
  if (!db) return null;
  const m = (db as Record<string, unknown>).organizationMember as MemberModel;
  const row = await m.findFirst({ where: { userId: payload.sub }, orderBy: { createdAt: "asc" } }).catch(() => null);
  return row ? String(row.organizationId) : null;
}

export default async function OrgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t  = await getTranslations("org");
  const oa = await getTranslations("orgAdministration");
  const orgId = await getOrgIdForUser();

  // Independent, already-authorized reads run in parallel; each degrades to an
  // empty/null result rather than surfacing a raw error.
  const [members, invitations, subscription, usage] = orgId
    ? await Promise.all([
        listMembers(orgId).catch(() => []),
        listInvitations(orgId).catch(() => []),
        getSubscription(orgId).catch(() => null),
        getUsageSummary(orgId).catch(() => ({})),
      ])
    : [[], [], null, {}];

  const limitRows = buildLimitRows(
    subscription?.plan?.limits as unknown as Record<string, number | boolean> | null,
    usage,
    USAGE_METRICS,
  );

  // PHASE 87L.6G — organization ADMINISTRATION surface: admin/superadmin
  // only, matching the "org_admin" middleware gate. Engineer keeps its
  // ordinary organization/site CONTEXT elsewhere; only this surface is denied.
  return (
    <RequireCapability capability="org_admin">
      <PageShell>
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <PageHeader
            eyebrow={oa("header.eyebrow")}
            title={t("title")}
            subtitle={oa("header.purpose")}
            level="page"
          />
          {orgId ? (
            <div className="mt-6 flex flex-col gap-8">
              <AdministrationCommandSurface
                members={members}
                invitations={invitations}
                subscription={subscription}
                limitRows={limitRows}
                now={Date.now()}
                locale={locale}
              />
              <OrgOverview orgId={orgId} />
            </div>
          ) : (
            <p className="mt-6 text-muted">{oa("states.noOrganization")}</p>
          )}
        </div>
      </PageShell>
    </RequireCapability>
  );
}
