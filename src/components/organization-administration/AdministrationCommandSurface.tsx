// PHASE 87K — organization administration + platform-billing command surface
// (Server Component).
//
// Receives ALREADY server-fetched, already-tenant-scoped records and
// reorganizes them into the administration IA: attention → membership →
// invitations → plan/subscription → usage vs. limits → next actions.
//
// Integrity rules honoured here:
//   • no member email, invitation token or API secret is rendered — the
//     invitation record type documents that the token is never returned, and
//     this surface only reads status/role/date fields;
//   • a usage metric with no record shows "not measured", never 0;
//   • `limit === -1` renders as "Unlimited", never as a number;
//   • platform subscription billing is explicitly labelled as separate from
//     ERP project budgets and internal finance;
//   • no security score, compliance score, MRR/ARR or payment-success metric
//     is derived — only the subscription status the record carries.

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn, TechnicalValue } from "@/components/ds";
import {
  DashboardSection, AttentionPanel, SafeActionGrid,
  type AttentionItem, type SafeAction,
} from "@/components/dashboard-experience";
import { DistributionCard } from "@/components/asset-maintenance";
import {
  MembershipStatusBadge, InvitationStatusBadge, SubscriptionStatusBadge,
} from "./AdminBadges";
import {
  deriveAdminAttention, membersByStatus, invitationsByStatus, type LimitRow,
} from "./logic";
import type { MemberRecord, InvitationRecord, MemberStatus, InvitationStatus } from "@/lib/org/types";
import type { SubscriptionRecord } from "@/lib/billing/types";

function AdminLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={className}>{children}</Link>;
}

export interface AdministrationCommandSurfaceProps {
  members: MemberRecord[];
  invitations: InvitationRecord[];
  subscription: SubscriptionRecord | null;
  limitRows: LimitRow[];
  /** Server-resolved timestamp so the derivation is deterministic per render. */
  now: number;
  locale: string;
}

export async function AdministrationCommandSurface({
  members, invitations, subscription, limitRows, now, locale,
}: AdministrationCommandSurfaceProps) {
  const t = await getTranslations("orgAdministration");
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });

  const attention: AttentionItem[] = deriveAdminAttention({ members, invitations, subscription, limitRows, now })
    .map((a) => ({
      id: a.id,
      severity: a.severity === "action" ? "high" : "medium",
      severityLabel: a.severity === "action" ? t("attention.severityAction") : t("attention.severityReview"),
      object: t("fields.organization"),
      reason: t(`attention.${a.kind}`, { count: nf.format(a.count) }),
      href: a.href,
      viewLabel: t("attention.view"),
    }));

  const memberRows = membersByStatus(members);
  const invitationRows = invitationsByStatus(invitations);

  const actions: SafeAction[] = [
    { key: "members", label: t("actions.members"), description: t("actions.membersDesc"), href: "/dashboard/organization/members", glyph: "◆" },
    { key: "invitations", label: t("actions.invitations"), description: t("actions.invitationsDesc"), href: "/dashboard/organization/invitations", glyph: "◈" },
    { key: "apiKeys", label: t("actions.apiKeys"), description: t("actions.apiKeysDesc"), href: "/dashboard/api", glyph: "◉" },
    { key: "billing", label: t("actions.billing"), description: t("actions.billingDesc"), href: "/dashboard/billing", glyph: "◇" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <DashboardSection id="admin-attention" title={t("attention.title")}>
        <AttentionPanel items={attention} emptyLabel={t("attention.empty")} LinkComponent={AdminLink} />
      </DashboardSection>

      <DashboardSection id="admin-membership" title={t("sections.membership")}>
        {members.length === 0 && invitations.length === 0 ? (
          <div className="rounded-md border border-border-default bg-surface-primary p-5">
            <p className="text-body-compact text-text-secondary">{t("states.noMembers")}</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {memberRows.length > 0 ? (
              <DistributionCard
                title={t("fields.totalMembers")}
                rows={memberRows.map((r) => ({
                  key: r.status, count: r.count,
                  badge: <MembershipStatusBadge status={r.status as MemberStatus} label={t(`memberStatus.${r.status}`)} />,
                }))}
                nf={nf}
              />
            ) : (
              <div className="rounded-md border border-border-default bg-surface-primary p-5">
                <p className="text-body-compact text-text-secondary">{t("states.noMembers")}</p>
              </div>
            )}
            {invitationRows.length > 0 ? (
              <DistributionCard
                title={t("sections.invitations")}
                rows={invitationRows.map((r) => ({
                  key: r.status, count: r.count,
                  badge: <InvitationStatusBadge status={r.status as InvitationStatus} label={t(`invitationStatus.${r.status}`)} />,
                }))}
                nf={nf}
              />
            ) : (
              <div className="rounded-md border border-border-default bg-surface-primary p-5">
                <h3 className="mb-2 text-title-lg font-semibold text-text-primary">{t("sections.invitations")}</h3>
                <p className="text-body-compact text-text-secondary">{t("states.noInvitations")}</p>
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-caption text-text-muted">{t("distinction.memberScope")}</p>
      </DashboardSection>

      <DashboardSection id="admin-subscription" title={t("sections.subscription")}>
        <div className="rounded-md border border-border-default bg-surface-primary p-5">
          {!subscription ? (
            <p className="text-body-compact text-text-secondary">{t("states.noSubscription")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <SubscriptionStatusBadge
                  status={subscription.status}
                  label={t(`subscriptionStatus.${subscription.status}`)}
                />
                <span className="text-body-compact font-semibold text-text-primary" dir="auto">
                  {subscription.plan?.name ?? t("fields.noPlan")}
                </span>
                <span className="text-caption text-text-muted">
                  {t("fields.cycle")}: {t(`billingCycle.${subscription.billingCycle}`)}
                </span>
              </div>
              <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-caption text-text-muted">{t("fields.startsAt")}</dt>
                  <dd className="mt-0.5 text-body-compact text-text-primary" dir="ltr">
                    {df.format(new Date(subscription.startsAt))}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-text-muted">{t("fields.expiresAt")}</dt>
                  <dd className="mt-0.5 text-body-compact text-text-primary" dir="ltr">
                    {df.format(new Date(subscription.expiresAt))}
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-text-muted">{t("fields.cycle")}</dt>
                  <dd className="mt-0.5 text-body-compact text-text-primary" dir="auto">
                    {subscription.autoRenew ? t("fields.autoRenewOn") : t("fields.autoRenewOff")}
                  </dd>
                </div>
              </dl>
            </>
          )}
          <p className="mt-3 text-caption text-text-muted">{t("distinction.platformBilling")}</p>
        </div>
      </DashboardSection>

      <DashboardSection id="admin-usage" title={t("sections.usage")}>
        <div className="rounded-md border border-border-default bg-surface-primary p-5">
          {limitRows.length === 0 ? (
            <p className="text-body-compact text-text-secondary">{t("states.noUsage")}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {limitRows.map((row) => (
                  <li key={row.metric}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-caption">
                      <span className="text-text-secondary" dir="auto">{t(`metric.${row.metric}`)}</span>
                      <span className="text-text-primary">
                        {row.used === null ? (
                          <span dir="auto">{t("fields.unavailable")}</span>
                        ) : (
                          <span className="tabular-nums" dir="ltr">{nf.format(row.used)}</span>
                        )}
                        {" / "}
                        {row.unlimited
                          ? <span dir="auto">{t("fields.unlimited")}</span>
                          : <span className="tabular-nums" dir="ltr">{nf.format(row.limit)}</span>}
                      </span>
                    </div>
                    {/* A bar is drawn ONLY when a real used value and a real
                        finite limit both exist — never for unlimited or
                        unmeasured metrics. */}
                    {!row.unlimited && row.used !== null && row.limit > 0 ? (
                      <div className="mt-1 h-1 rounded-full bg-surface-interactive">
                        <div
                          className={cn("h-1 rounded-full", row.reached ? "bg-status-danger" : "bg-brand-primary")}
                          style={{ inlineSize: `${Math.min(100, Math.round((row.used / row.limit) * 100))}%` }}
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {limitRows.some((r) => r.used === null) ? (
                <p className="mt-3 text-caption text-text-muted">{t("fields.unavailableNote")}</p>
              ) : null}
            </>
          )}
        </div>
      </DashboardSection>

      <DashboardSection id="admin-actions" title={t("sections.actions")}>
        <SafeActionGrid actions={actions} LinkComponent={AdminLink} />
      </DashboardSection>
    </div>
  );
}

/** Organization identity strip — slug rendered as a technical identifier. */
export function OrganizationIdentity({ name, slug }: { name: string; slug?: string | null }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-body-compact font-semibold text-text-primary" dir="auto">{name}</span>
      {slug ? <TechnicalValue>{slug}</TechnicalValue> : null}
    </span>
  );
}
