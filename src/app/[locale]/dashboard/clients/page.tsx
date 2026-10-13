/**
 * /{locale}/dashboard/clients — the active organization's customers.
 *
 * Server-rendered: the filters are a plain GET form and the pager is a pair of
 * links, so the list works without client JavaScript. The organization is the
 * session's server-side active organization (resolveCustomerPageScope); the
 * query string carries only search terms and a cursor, both validated by the
 * same strict schema the API uses, and a cursor from another organization is
 * refused by the data layer before it can position a page.
 */
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { formatDateTime } from "@/lib/i18n/format";
import { resolveCustomerPageScope } from "@/lib/customers/page-scope";
import { CustomerListQuerySchema, PARTY_STATUSES } from "@/lib/customers/schemas";
import { CustomerError, eligibleOwners, listCustomers, type CustomerView } from "@/lib/customers/service";
import { loadExecutiveSettings } from "@/lib/executive/settings";
import { ExecutiveScopeNotice } from "@/components/executive/ExecutiveScopeNotice";
import { Panel } from "@/components/executive/ExecutiveSummaryView";

export const metadata = noIndexMetadata("Customers");
export const dynamic = "force-dynamic";

const FOLLOW_UPS = ["overdue", "scheduled", "none"] as const;
const STATUS_VARIANT = { ACTIVE: "live", PROSPECT: "neutral", INACTIVE: "offline" } as const;

type SearchParams = Record<string, string | string[] | undefined>;

/** Only the known, single-valued parameters reach the schema; empty ones are dropped. */
function queryOf(sp: SearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["q", "status", "owner", "followUp", "archived", "cursor"]) {
    const v = sp[key];
    if (typeof v === "string" && v.trim() !== "") out[key] = v.trim();
  }
  return out;
}

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("executive");
  const resolved = await resolveCustomerPageScope();

  let body: React.ReactNode;
  if (!resolved.ok) {
    body = <ExecutiveScopeNotice code={resolved.code} memberships={resolved.memberships} />;
  } else {
    const { scope } = resolved;
    const raw = queryOf(await searchParams);
    const parsed = CustomerListQuerySchema.safeParse(raw);
    const query = parsed.success ? parsed.data : {};
    const filtered = Object.keys(raw).some(k => k !== "cursor");
    const ctx = { organizationId: scope.organizationId, userId: scope.userId, correlationId: "page" };
    const zone = (await loadExecutiveSettings(scope.organizationId)).values.timeZone;
    const when = (iso: string | null) => (iso ? formatDateTime(iso, locale, { dateStyle: "medium", timeStyle: "short", timeZone: zone }) : null);

    let page: Awaited<ReturnType<typeof listCustomers>> | null = null;
    try {
      page = await listCustomers(ctx, query);
    } catch (err) {
      // A stale or foreign cursor restarts at the first page; anything else is a failure.
      if (err instanceof CustomerError && err.code === "INVALID_CURSOR") {
        page = await listCustomers(ctx, { ...query, cursor: undefined }).catch(() => null);
      }
    }
    const failed = page === null;
    const base = `/${locale}/dashboard/clients`;
    const owners = await eligibleOwners(ctx).catch(() => []);
    const keep = new URLSearchParams(Object.entries(raw).filter(([k]) => k !== "cursor"));
    const nextHref = page?.nextCursor ? `${base}?${new URLSearchParams([...keep, ["cursor", page.nextCursor]])}` : null;
    const firstHref = raw.cursor ? `${base}?${keep}` : null;

    const field = "mt-1 w-full rounded-md border border-border-default bg-surface-interactive px-3 py-2 text-sm text-text-primary";

    body = (
      <div className="space-y-6">
        {!scope.canManage && <p className="text-sm text-muted">{t("customers.readOnly")}</p>}

        <Panel title={t("customers.search.label")}>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" role="search">
            <label className="text-xs text-muted lg:col-span-2">
              {t("customers.search.label")}
              <input name="q" defaultValue={raw.q ?? ""} placeholder={t("customers.search.placeholder")} maxLength={100} className={field} />
            </label>
            <label className="text-xs text-muted">
              {t("customers.search.status")}
              <select name="status" defaultValue={raw.status ?? ""} className={field}>
                <option value="">{t("customers.search.statusAll")}</option>
                {PARTY_STATUSES.map(s => (
                  <option key={s} value={s}>
                    {t(`customers.status.${s}` as never)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              {t("customers.search.followUp")}
              <select name="followUp" defaultValue={raw.followUp ?? ""} className={field}>
                <option value="">{t("customers.search.followUpAll")}</option>
                {FOLLOW_UPS.map(f => (
                  <option key={f} value={f}>
                    {t(`customers.followUp.${f}` as never)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              {t("customers.search.owner")}
              <select name="owner" defaultValue={raw.owner ?? ""} className={field}>
                <option value="">{t("customers.search.ownerAll")}</option>
                <option value="me">{t("customers.search.ownerMe")}</option>
                {owners.map(o => (
                  <option key={o.userId} value={o.userId}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              {t("customers.search.archived")}
              <select name="archived" defaultValue={raw.archived ?? ""} className={field}>
                <option value="">{t("customers.search.archivedExclude")}</option>
                <option value="only">{t("customers.search.archivedOnly")}</option>
              </select>
            </label>
            <div className="flex items-end gap-3 lg:col-span-6">
              <button type="submit" className="rounded-md border border-signal bg-signalDim px-4 py-2 text-sm text-signal">
                {t("customers.search.submit")}
              </button>
              {filtered && (
                <Link href={base} className="text-sm text-muted underline">
                  {t("customers.search.reset")}
                </Link>
              )}
            </div>
          </form>
        </Panel>

        <Panel
          title={t("customers.pageTitle")}
          badge={
            scope.canManage ? (
              <Link href={`${base}/new`} className="rounded-md border border-signal bg-signalDim px-3 py-1.5 text-xs text-signal">
                {t("customers.linkNew")}
              </Link>
            ) : undefined
          }
        >
          {failed ? (
            <p role="alert" className="text-sm text-warn">
              {t("errors.SERVICE_UNAVAILABLE")}
            </p>
          ) : page && page.items.length === 0 ? (
            <p className="text-sm text-muted">
              {filtered ? t("customers.empty.noMatch") : scope.canManage ? t("customers.empty.noneCanCreate") : t("customers.empty.none")}
            </p>
          ) : page ? (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("customers.table.caption")}</caption>
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th scope="col" className="py-2 pe-3 text-start font-normal">{t("customers.table.name")}</th>
                    <th scope="col" className="py-2 pe-3 text-start font-normal">{t("customers.table.status")}</th>
                    <th scope="col" className="py-2 pe-3 text-start font-normal">{t("customers.table.owner")}</th>
                    <th scope="col" className="py-2 pe-3 text-start font-normal">{t("customers.table.nextAction")}</th>
                    <th scope="col" className="py-2 text-start font-normal">{t("customers.table.lastInteraction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((c: CustomerView) => (
                    <tr key={c.id} className="border-b border-border-subtle last:border-0">
                      <th scope="row" className="py-2 pe-3 text-start font-normal">
                        <Link href={`${base}/${c.id}`} className="text-text-primary underline-offset-2 hover:underline">
                          {c.displayName}
                        </Link>
                      </th>
                      <td className="py-2 pe-3">
                        <PageStatusBadge label={t(`customers.status.${c.status}` as never)} variant={STATUS_VARIANT[c.status]} />
                      </td>
                      <td className="py-2 pe-3 text-muted">{c.followUpOwnerName ?? t("customers.detail.ownerNone")}</td>
                      <td className="py-2 pe-3">
                        {c.followUp === "none" ? (
                          <span className="text-muted">{t("customers.followUp.none")}</span>
                        ) : (
                          <span className={c.followUp === "overdue" ? "text-warn" : "text-text-primary"}>
                            {t(`customers.followUp.${c.followUp}` as never)} · {when(c.nextActionAt)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-muted">{when(c.lastInteractionAt) ?? t("customers.detail.never")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {(nextHref || firstHref) && (
            <nav className="mt-4 flex gap-4 text-sm" aria-label={t("customers.table.caption")}>
              {firstHref && (
                <Link href={firstHref} className="text-muted underline">
                  {t("customers.pager.first")}
                </Link>
              )}
              {nextHref && (
                <Link href={nextHref} className="text-signal underline">
                  {t("customers.pager.next")}
                </Link>
              )}
            </nav>
          )}
        </Panel>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 sm:px-8">
        <PageHeader eyebrow={t("eyebrow")} title={t("customers.pageTitle")} subtitle={t("customers.pageLede")} level="page" />
        {body}
      </div>
    </AppShell>
  );
}
