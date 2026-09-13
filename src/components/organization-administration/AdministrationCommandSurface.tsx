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

/**
 * PHASE 110-A1.0b R3 (R3-3) — what happened to one section's read.
 *
 * `ok` means the data arrived, and an empty list is then a real fact about the
 * organization. `forbidden` means this reader's ORGANIZATION role does not
 * carry the permission the corresponding API enforces, so the read was never
 * made. `unavailable` means the read failed and nothing is known — least of all
 * that the answer is empty.
 */
export type AdminSectionStatus = "ok" | "forbidden" | "unavailable";

export interface AdministrationCommandSurfaceProps {
  members: MemberRecord[];
  invitations: InvitationRecord[];
  subscription: SubscriptionRecord | null;
  limitRows: LimitRow[];
  /**
   * Per-section outcome. Optional and defaulting to all-`ok`, so a caller that
   * has already established its reads succeeded renders exactly as before.
   */
  sections?: {
    members: AdminSectionStatus;
    invitations: AdminSectionStatus;
    subscription: AdminSectionStatus;
    usage: AdminSectionStatus;
  };
  /** Server-resolved timestamp so the derivation is deterministic per render. */
  now: number;
  locale: string;
}

const ALL_SECTIONS_OK = {
  members: "ok",
  invitations: "ok",
  subscription: "ok",
  usage: "ok",
} as const;

export async function AdministrationCommandSurface({
  members, invitations, subscription, limitRows,
  sections = ALL_SECTIONS_OK, now, locale,
}: AdministrationCommandSurfaceProps) {
  const t = await getTranslations("orgAdministration");
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const df = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });

  /** A section that did not resolve renders its reason in place of its data. */
  const notice = (status: AdminSectionStatus): string =>
    status === "forbidden" ? t("states.sectionForbidden") : t("states.sectionUnavailable");

  const incomplete =
    sections.members !== "ok" || sections.invitations !== "ok" ||
    sections.subscription !== "ok" || sections.usage !== "ok";

  /*
   * PHASE 110-A1.0b R3 (R3-3) — attention is derived ONLY from what arrived.
   *
   * `deriveAdminAttention` counts things: expiring invitations, limits reached,
   * members needing action. Handing it a section that did not resolve would let
   * absence be counted as zero and produce a confident "nothing needs
   * attention" from data nobody has. Unresolved sections are excluded from the
   * derivation, and their absence is STATED below rather than implied by a
   * shorter list.
   */
  const attention: AttentionItem[] = deriveAdminAttention({
    members: sections.members === "ok" ? members : [],
    invitations: sections.invitations === "ok" ? invitations : [],
    subscription: sections.subscription === "ok" ? subscription : null,
    limitRows: sections.usage === "ok" ? limitRows : [],
    now,
  })
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
        {/* Stated, not implied: a shorter attention list because a read failed
            must not read as "less needs attention". */}
        {incomplete ? (
          <p className="mb-3 text-body-compact text-text-secondary" data-admin-section="summary">
            {t("states.summaryIncomplete")}
          </p>
        ) : null}
        <AttentionPanel items={attention} emptyLabel={t("attention.empty")} LinkComponent={AdminLink} />
      </DashboardSection>

      <DashboardSection id="admin-membership" title={t("sections.membership")}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div data-admin-section="members" data-admin-section-status={sections.members}>
            {sections.members !== "ok" ? (
              <div className="ds-glass-card rounded-lg p-5">
                <h3 className="mb-2 text-title-lg font-semibold text-text-primary">{t("fields.totalMembers")}</h3>
                <p className="text-body-compact text-text-secondary">{notice(sections.members)}</p>
              </div>
            ) : memberRows.length > 0 ? (
              <DistributionCard
                title={t("fields.totalMembers")}
                rows={memberRows.map((r) => ({
                  key: r.status, count: r.count,
                  badge: <MembershipStatusBadge status={r.status as MemberStatus} label={t(`memberStatus.${r.status}`)} />,
                }))}
                nf={nf}
              />
            ) : (
              <div className="ds-glass-card rounded-lg p-5">
                <p className="text-body-compact text-text-secondary">{t("states.noMembers")}</p>
              </div>
            )}
          </div>
          <div data-admin-section="invitations" data-admin-section-status={sections.invitations}>
            {sections.invitations !== "ok" ? (
              <div className="ds-glass-card rounded-lg p-5">
                <h3 className="mb-2 text-title-lg font-semibold text-text-primary">{t("sections.invitations")}</h3>
                <p className="text-body-compact text-text-secondary">{notice(sections.invitations)}</p>
              </div>
            ) : invitationRows.length > 0 ? (
              <DistributionCard
                title={t("sections.invitations")}
                rows={invitationRows.map((r) => ({
                  key: r.status, count: r.count,
                  badge: <InvitationStatusBadge status={r.status as InvitationStatus} label={t(`invitationStatus.${r.status}`)} />,
                }))}
                nf={nf}
              />
            ) : (
              <div className="ds-glass-card rounded-lg p-5">
                <h3 className="mb-2 text-title-lg font-semibold text-text-primary">{t("sections.invitations")}</h3>
                <p className="text-body-compact text-text-secondary">{t("states.noInvitations")}</p>
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-caption text-text-muted">{t("distinction.memberScope")}</p>
      </DashboardSection>

      <DashboardSection id="admin-subscription" title={t("sections.subscription")}>
        <div
          className="ds-glass-card rounded-lg p-5"
          data-admin-section="subscription"
          data-admin-section-status={sections.subscription}
        >
          {/* "You are on no plan" is a claim about money. It is made only when
              the read actually returned nothing — never because it failed and
              never because this reader may not see it. */}
          {sections.subscription !== "ok" ? (
            <p className="text-body-compact text-text-secondary">{notice(sections.subscription)}</p>
          ) : !subscription ? (
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
              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <div
          className="ds-glass-card rounded-lg p-5"
          data-admin-section="usage"
          data-admin-section-status={sections.usage}
        >
          {/* Usage needs BOTH the subscription (for limits) and the usage read.
              If either did not resolve, the table is not drawn from what is
              left — it says why it is absent. */}
          {sections.usage !== "ok" ? (
            <p className="text-body-compact text-text-secondary">{notice(sections.usage)}</p>
          ) : sections.subscription !== "ok" ? (
            <p className="text-body-compact text-text-secondary">{notice(sections.subscription)}</p>
          ) : limitRows.length === 0 ? (
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
