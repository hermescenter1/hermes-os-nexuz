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
import { AppShell }    from "@/components/app-shell";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { getOrgPageContext, ORG_PAGE_STATE_KEY } from "./org-page-context";
import { OrgOverview } from "@/components/organization/OrgOverview";
import { PageHeader }  from "@/components/ui/PageHeader";
import { can as orgCan }       from "@/lib/org/rbac";
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

/** Metrics surfaced against plan limits — numeric PlanLimits keys only. */
const USAGE_METRICS = [
  "members", "projects", "storage_gb", "api_calls", "ai_requests",
] as const;

/**
 * PHASE 110-A1.0b R3 (R3-3) — one read, and which of three things happened.
 *
 * The three are genuinely different and the page renders them differently:
 *
 *   ok          the read returned. An empty array here means the organization
 *               really has no members, and saying so is correct.
 *   forbidden   this reader's ORGANIZATION role does not carry the permission
 *               the corresponding API enforces, so the read was never made.
 *   unavailable the read was attempted and failed. Nothing is known about the
 *               data, and in particular it is NOT known to be empty.
 *
 * The failure cause is deliberately not carried out of here. A driver message
 * or a Prisma error string on an administration surface is an information leak,
 * and the reader can act on none of it.
 */
type SectionState<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "forbidden" }
  | { readonly status: "unavailable" };

async function readSection<T>(
  permitted: boolean,
  read: () => Promise<T>,
): Promise<SectionState<T>> {
  if (!permitted) return { status: "forbidden" };
  try {
    return { status: "ok", value: await read() };
  } catch {
    return { status: "unavailable" };
  }
}


export default async function OrgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t  = await getTranslations("org");
  const oa = await getTranslations("orgAdministration");
  const ctx = await getOrgPageContext("org_admin");

  /*
   * PHASE 110-A1.0b R2 (F5) — THE AUTHORIZATION GATE IS HERE, NOT IN THE JSX.
   *
   * This page is different from its four siblings and R1 missed the difference.
   * They pass an `orgId` to CLIENT components, which fetch through
   * `/api/organizations/[orgId]/...`; those routes call `requireOrgActor`, which
   * enforces session revocation AND `status === "ACTIVE"` and answers 403
   * otherwise. So on those pages a suspended member saw chrome, not data.
   *
   * This page calls `listMembers`, `listInvitations`, `getSubscription` and
   * `getUsageSummary` DIRECTLY, server-side. Those are unguarded service
   * functions: each takes an `organizationId` and returns rows — `listMembers`
   * returns every member with their name and email. There was no gate between
   * the old page-local `findFirst` (no ACTIVE filter, no revocation check) and
   * those four calls, and `<RequireCapability>` could not be one, because it
   * only decides what to RENDER after the page body has already run.
   *
   * The early return below is what makes the refusal real: on any state but
   * `resolved` this function returns before the service calls exist, so the
   * count of domain reads is zero rather than four discarded ones.
   */
  if (ctx.state !== "resolved") {
    return (
      <RequireCapability capability="org_admin">
        <AppShell>
          <div className="mx-auto max-w-7xl px-6 sm:px-8">
            <PageHeader
              eyebrow={oa("header.eyebrow")}
              title={t("title")}
              subtitle={oa("header.purpose")}
              level="page"
            />
            <p className="mt-6 text-muted" data-org-state={ctx.state}>
              {t(ORG_PAGE_STATE_KEY[ctx.state])}
            </p>
          </div>
        </AppShell>
      </RequireCapability>
    );
  }

  const orgId = ctx.organizationId;
  const orgRole = ctx.organizationRole;

  /*
   * PHASE 110-A1.0b R3 (R3-3) — TWO defects lived on these four lines, and only
   * one of them was mine.
   *
   * INHERITED, from Phase 87K: `.catch(() => [])`, `.catch(() => null)` and
   * `.catch(() => ({}))` turned a FAILED read into a successful EMPTY fact. A
   * members query that threw rendered "no members"; a billing query that threw
   * rendered "no subscription" on a paid product. R2 made the CONTEXT failure
   * distinct and left these four alone, so a failure after the context resolved
   * still lost its meaning. `readSection` keeps refused, failed and genuinely
   * empty apart.
   *
   * MINE, from R2: the only gate was the PLATFORM capability `org_admin`. Three
   * of these four reads have their own ORGANIZATION-role policy at the API, and
   * the two axes are unrelated — a platform admin may hold any organization
   * role, VIEWER included. Measured against the routes serving the same data:
   *
   *   listMembers      GET /api/organizations/[orgId]/members
   *                    -> requireOrgActor only: ACTIVE membership, no further
   *                       permission. (`view_members` exists in the matrix but
   *                       that route does not consult it. This page matches the
   *                       route; the discrepancy is REPORTED, not "fixed" here.)
   *   listInvitations  GET /api/organizations/[orgId]/invitations
   *                    -> requirePermission(role, "invite_member")
   *                       = OWNER / ADMIN / MANAGER. Phase 90-93A added it
   *                       deliberately: that list carries invitee email
   *                       addresses and the role each was offered.
   *   getSubscription  GET /api/billing/subscription
   *   getUsageSummary  GET /api/billing/usage
   *                    -> requirePermission(role, "view_billing")
   *                       = OWNER / ADMIN / BILLING_ADMIN.
   *
   * So an ACTIVE ENGINEER or VIEWER whose platform role passes `org_admin` read
   * here — server-side, with no gate — the invitation roster and the billing
   * record the API answers 403 for. The checks below are the SAME calls those
   * routes make against the SAME matrix: no permission is widened, none is
   * invented, and a role in no list is denied exactly as `requirePermission`
   * already denies it.
   */
  const [members, invitations, subscription, usage] = await Promise.all([
    readSection(true, () => listMembers(orgId)),
    readSection(orgCan(orgRole, "invite_member"), () => listInvitations(orgId)),
    readSection(orgCan(orgRole, "view_billing"), () => getSubscription(orgId)),
    readSection(orgCan(orgRole, "view_billing"), () => getUsageSummary(orgId)),
  ]);

  /*
   * Limits are derived ONLY when both inputs actually arrived. Building them
   * from a refused or failed read would produce a usage table made out of
   * absence — the very class of claim this change removes.
   */
  const limitRows =
    subscription.status === "ok" && usage.status === "ok"
      ? buildLimitRows(
          subscription.value?.plan?.limits as unknown as Record<string, number | boolean> | null,
          usage.value,
          USAGE_METRICS,
        )
      : [];

  // PHASE 87L.6G — organization ADMINISTRATION surface: admin/superadmin
  // only, matching the "org_admin" middleware gate. Engineer keeps its
  // ordinary organization/site CONTEXT elsewhere; only this surface is denied.
  return (
    <RequireCapability capability="org_admin">
      <AppShell>
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
                members={members.status === "ok" ? members.value : []}
                invitations={invitations.status === "ok" ? invitations.value : []}
                subscription={subscription.status === "ok" ? subscription.value : null}
                limitRows={limitRows}
                sections={{
                  members: members.status,
                  invitations: invitations.status,
                  subscription: subscription.status,
                  usage: usage.status,
                }}
                now={Date.now()}
                locale={locale}
              />
              <OrgOverview orgId={orgId} />
            </div>
          ) : (
            <p className="mt-6 text-muted">{oa("states.noOrganization")}</p>
          )}
        </div>
      </AppShell>
    </RequireCapability>
  );
}
