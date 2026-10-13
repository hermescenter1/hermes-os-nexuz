/**
 * /{locale}/dashboard/clients/[id] — one customer of the active organization:
 * details, follow-up, the contact log, and the organization's projects for it.
 *
 * A customer of ANOTHER organization is a 404, exactly like one that does not
 * exist. Project data is ERP data: it needs view_erp to read and manage_erp
 * (with manage_customers) to link. Forms appear only for the roles the API
 * would accept; the API re-checks everything.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import { resolveCustomerPageScope } from "@/lib/customers/page-scope";
import {
  CustomerError,
  eligibleOwners,
  getCustomer,
  linkableProjects,
  linkedProjects,
  listInteractions,
  LINKED_PROJECTS_MAX,
} from "@/lib/customers/service";
import { loadExecutiveSettings } from "@/lib/executive/settings";
import { ExecutiveScopeNotice } from "@/components/executive/ExecutiveScopeNotice";
import { Panel } from "@/components/executive/ExecutiveSummaryView";
import { CustomerForm } from "@/components/tenant-customers/CustomerForm";
import { InteractionForm } from "@/components/tenant-customers/InteractionForm";
import { ArchiveToggle } from "@/components/tenant-customers/ArchiveToggle";
import { ProjectLinker } from "@/components/tenant-customers/ProjectLinker";
import { customerFormLabels, interactionFormLabels } from "@/components/tenant-customers/labels";

export const metadata = noIndexMetadata("Customer");
export const dynamic = "force-dynamic";

const STATUS_VARIANT = { ACTIVE: "live", PROSPECT: "neutral", INACTIVE: "offline" } as const;

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("executive");
  const listHref = `/${locale}/dashboard/clients`;
  const resolved = await resolveCustomerPageScope();

  if (!resolved.ok) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl space-y-6 px-6 sm:px-8">
          <PageHeader eyebrow={t("eyebrow")} title={t("customers.pageTitle")} level="page" />
          <ExecutiveScopeNotice code={resolved.code} memberships={resolved.memberships} />
        </div>
      </AppShell>
    );
  }

  const { scope } = resolved;
  const ctx = { organizationId: scope.organizationId, userId: scope.userId, correlationId: "page" };
  let customer;
  try {
    customer = await getCustomer(ctx, id);
  } catch (err) {
    if (err instanceof CustomerError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const sp = await searchParams;
  const icursor = typeof sp.icursor === "string" && sp.icursor ? sp.icursor : undefined;
  const zone = (await loadExecutiveSettings(scope.organizationId)).values.timeZone;
  const when = (iso: string | null) => (iso ? formatDateTime(iso, locale, { dateStyle: "medium", timeStyle: "short", timeZone: zone }) : null);

  const [interactions, projects, linkable, owners] = await Promise.all([
    listInteractions(ctx, id, { cursor: icursor }).catch(() => listInteractions(ctx, id, {}).catch(() => null)),
    scope.canViewProjects ? linkedProjects(ctx, id).catch(() => null) : Promise.resolve(null),
    scope.canLinkProjects ? linkableProjects(ctx, id).catch(() => []) : Promise.resolve([]),
    scope.canManage ? eligibleOwners(ctx).catch(() => []) : Promise.resolve([]),
  ]);

  const archived = customer.archivedAt !== null;
  const base = `${listHref}/${customer.id}`;
  const row = (label: string, value: React.ReactNode) => (
    <div className="rounded-lg border border-line bg-surface-glass p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-text-primary">{value}</dd>
    </div>
  );
  const orNotSet = (v: string | null) => v ?? <span className="text-muted">{t("customers.detail.notSet")}</span>;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 px-6 sm:px-8">
        <Link href={listHref} className="text-sm text-muted underline">
          {t("customers.back")}
        </Link>
        <PageHeader eyebrow={t("customers.pageTitle")} title={customer.displayName} subtitle={customer.legalName ?? undefined} level="page" />

        {archived && (
          <p role="status" className="rounded-lg border border-status-warning-border bg-status-warning-subtle px-4 py-2 text-sm text-warn">
            {t("customers.detail.archivedNote")}
          </p>
        )}

        <Panel
          title={t("customers.detail.details")}
          badge={<PageStatusBadge label={t(`customers.status.${customer.status}` as never)} variant={STATUS_VARIANT[customer.status]} />}
        >
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {row(t("customers.detail.email"), <span dir="ltr">{orNotSet(customer.email)}</span>)}
            {row(t("customers.detail.phone"), <span dir="ltr">{orNotSet(customer.phone)}</span>)}
            {row(t("customers.detail.city"), orNotSet(customer.city))}
            {row(t("customers.detail.country"), orNotSet(customer.country))}
            {row(t("customers.detail.lastInteraction"), when(customer.lastInteractionAt) ?? t("customers.detail.never"))}
          </dl>
          {customer.notes && <p className="mt-3 whitespace-pre-line text-sm text-text-primary">{customer.notes}</p>}
          <p className="mt-3 text-xs text-muted">{t("customers.detail.updated", { when: when(customer.updatedAt) ?? "" })}</p>
          {scope.canManage && (
            <div className="mt-4">
              <ArchiveToggle
                customerId={customer.id}
                version={customer.version}
                archived={archived}
                labels={{
                  archive: t("customers.archive.archive"),
                  restore: t("customers.archive.restore"),
                  working: t("customers.archive.working"),
                  conflict: t("customers.form.conflict"),
                  failed: t("customers.archive.failed"),
                }}
              />
            </div>
          )}
        </Panel>

        <Panel title={t("customers.detail.followUpTitle")}>
          <dl className="grid gap-3 sm:grid-cols-3">
            {row(t("customers.detail.owner"), customer.followUpOwnerName ?? t("customers.detail.ownerNone"))}
            {row(
              t("customers.detail.nextActionAt"),
              customer.nextActionAt ? (
                <span className={customer.followUp === "overdue" ? "text-warn" : undefined}>
                  {when(customer.nextActionAt)} · {t(`customers.followUp.${customer.followUp}` as never)}
                </span>
              ) : (
                <span className="text-muted">{t("customers.followUp.none")}</span>
              ),
            )}
            {row(t("customers.detail.nextActionNote"), orNotSet(customer.nextActionNote))}
          </dl>
        </Panel>

        {scope.canManage && !archived && (
          <Panel title={t("customers.detail.edit")}>
            <CustomerForm
              mode="edit"
              listHref={listHref}
              customerId={customer.id}
              version={customer.version}
              owners={owners}
              initial={{
                displayName: customer.displayName,
                legalName: customer.legalName,
                status: customer.status,
                email: customer.email,
                phone: customer.phone,
                city: customer.city,
                country: customer.country,
                notes: customer.notes,
                followUpOwnerId: customer.followUpOwnerId,
                nextActionAt: customer.nextActionAt,
                nextActionNote: customer.nextActionNote,
              }}
              labels={customerFormLabels(k => t(k as never), "edit")}
            />
          </Panel>
        )}

        <Panel title={t("customers.interactions.title")}>
          {scope.canManage && !archived && (
            <div className="mb-5 rounded-lg border border-line bg-surface-glass p-4">
              <p className="mb-3 text-xs font-medium text-muted">{t("customers.interactions.form.title")}</p>
              <InteractionForm customerId={customer.id} labels={interactionFormLabels(k => t(k as never))} />
            </div>
          )}
          {interactions === null ? (
            <p role="alert" className="text-sm text-warn">
              {t("errors.SERVICE_UNAVAILABLE")}
            </p>
          ) : interactions.items.length === 0 ? (
            <p className="text-sm text-muted">{t("customers.interactions.empty")}</p>
          ) : (
            <ol className="space-y-3">
              {interactions.items.map(i => (
                <li key={i.id} className="rounded-lg border border-line bg-surface-glass p-3">
                  <p className="text-xs text-muted">
                    {t(`customers.interactions.kind.${i.kind}` as never)} · {when(i.occurredAt)}
                    {i.recordedByName ? ` · ${t("customers.interactions.recordedBy", { name: i.recordedByName })}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm text-text-primary">{i.summary}</p>
                </li>
              ))}
            </ol>
          )}
          {(interactions?.nextCursor || icursor) && (
            <nav className="mt-4 flex gap-4 text-sm" aria-label={t("customers.interactions.title")}>
              {icursor && (
                <Link href={base} className="text-muted underline">
                  {t("customers.interactions.newest")}
                </Link>
              )}
              {interactions?.nextCursor && (
                <Link href={`${base}?icursor=${encodeURIComponent(interactions.nextCursor)}`} className="text-signal underline">
                  {t("customers.interactions.older")}
                </Link>
              )}
            </nav>
          )}
        </Panel>

        <Panel title={t("customers.projects.title")}>
          {!scope.canViewProjects ? (
            <p className="text-sm text-muted">{t("customers.projects.forbidden")}</p>
          ) : projects === null ? (
            <p role="alert" className="text-sm text-warn">
              {t("errors.SERVICE_UNAVAILABLE")}
            </p>
          ) : (
            <div className="space-y-4">
              {projects.projects.length === 0 ? (
                <p className="text-sm text-muted">{t("customers.projects.none")}</p>
              ) : !(scope.canLinkProjects && !archived) ? (
                <ul className="space-y-1 text-sm text-text-primary">
                  {projects.projects.map(p => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
              ) : null}
              {projects.truncated && (
                <p className="text-xs text-muted">{t("customers.projects.truncated", { count: LINKED_PROJECTS_MAX })}</p>
              )}
              {projects.projects.length > 0 && (
                <div>
                  <p className="text-xs text-muted">{t("customers.projects.cost")}</p>
                  {projects.recordedCost.length === 0 ? (
                    <p className="text-sm text-muted">{t("customers.projects.costNone")}</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-sm text-text-primary">
                      {projects.recordedCost.map(c => (
                        <li key={c.currency}>
                          <span dir="ltr">{c.currency}</span> {formatNumber(c.amount, locale)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-muted">{t("customers.projects.perCurrency")}</p>
                </div>
              )}
              {scope.canLinkProjects && !archived && (
                <ProjectLinker
                  customerId={customer.id}
                  linked={projects.projects.map(p => ({ id: p.id, name: p.name }))}
                  available={linkable.filter(p => !p.linked).map(p => ({ id: p.id, name: p.name }))}
                  labels={{
                    title: t("customers.projects.linkTitle"),
                    choose: t("customers.projects.choose"),
                    link: t("customers.projects.link"),
                    unlink: t("customers.projects.unlink"),
                    noLinkable: t("customers.projects.noLinkable"),
                    elsewhere: t("customers.projects.elsewhere"),
                    failed: t("customers.projects.failed"),
                  }}
                />
              )}
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
