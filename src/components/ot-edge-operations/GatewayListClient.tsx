"use client";

// PHASE 94C1 — the gateway list.
//
// EVERY NARROWING HAPPENS ON THE SERVER. There is not one `.filter()` over the
// returned rows anywhere in this file: the API applies the predicate inside the
// tenant-scoped query, before pagination, so `total` is the true count for the
// current filter and page N is page N of the filtered set. Re-filtering here
// would silently contradict all three.
//
// WHAT IS RENDERED IS ONLY WHAT THE CONTRACT GUARANTEES: name, system
// identifier, lifecycle, site, capabilities, last observation and whether
// signing is configured. No signing reference, no ingestion handle, no hardware
// identifier — none of which the API returns — and no connectivity claim, which
// none of them could support.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { FormField } from "@/components/ds";
import { fetchGateways } from "@/lib/ot-operations/api";
import { GATEWAY_CAPABILITIES, GATEWAY_LIFECYCLES, type GatewayRow } from "@/lib/ot-operations/contract";
import {
  gatewayRequestQuery,
  hasActiveFilters,
  readGatewayQuery,
  withFilters,
  writeGatewayQuery,
  type GatewayQueryState,
} from "@/lib/ot-operations/query";
import { gatewayAttentionItems, summariseGateways } from "@/lib/ot-operations/attention";
import { OtFilterBar, OtSelect } from "./OtFilterBar";
import { OtTable, type OtColumn } from "./OtTable";
import { OtPagination } from "./OtPagination";
import { OtAttentionPanel } from "./OtAttentionPanel";
import { OtEmpty, OtFailure, OtSkeleton } from "./OtStates";
import {
  GatewayCapabilityList,
  GatewayLifecycleBadge,
  ObservationValue,
  SigningState,
  SiteValue,
  SystemIdentifier,
} from "./OtPresenters";
import { useOtList } from "./useOtList";
import { useFailureCopy, useSiteNames, useSiteOptions } from "./shared";

export function GatewayListClient({ locale }: { locale: string }) {
  const t = useTranslations("otEdge");
  const enumT = useTranslations("otEdge");

  // THE LIVE URL IS THE SOURCE OF TRUTH, read here rather than handed down as
  // a prop. A server-passed string would be baked at prerender time, so a cold
  // load of a filtered link would silently render the UNFILTERED list — and it
  // would not update on Back/Forward either, because the server component does
  // not re-run for a client-side navigation.
  const params = useSearchParams();
  // Memoised on the STRING, not the params object. `useSearchParams` is free
  // to return a fresh instance on any render, and an identity-keyed memo
  // would then recompute, change the request key, refire the effect and
  // re-render — an unbounded request loop. A primitive dependency cannot.
  const searchKey = params.toString();
  const requested = useMemo<GatewayQueryState>(() => readGatewayQuery(new URLSearchParams(searchKey)), [searchKey]);
  const requestQuery = useMemo(() => gatewayRequestQuery(requested), [requested]);
  const urlQuery = useMemo(() => writeGatewayQuery(requested), [requested]);

  const { page, appliedQuery, loading, failure, retry, navigate } = useOtList<GatewayRow>({
    requestQuery,
    urlQuery,
    fetcher: fetchGateways,
  });

  // Draft control state, seeded from the URL and resynced whenever the URL
  // changes — so Back and Forward move the controls too, not just the results.
  const [draft, setDraft] = useState<GatewayQueryState>(requested);
  useEffect(() => setDraft(requested), [requested]);

  const siteNames = useSiteNames();
  const siteOptions = useSiteOptions(siteNames);
  const failureCopy = useFailureCopy();

  const submit = useCallback(
    (next: GatewayQueryState) => navigate(writeGatewayQuery(next), "push"),
    [navigate],
  );

  // Memoised so the identity is stable: `page?.items ?? []` mints a NEW empty
  // array on every render, which would make the memos below recompute each
  // time and defeat the point of having them.
  const rows = useMemo<readonly GatewayRow[]>(() => page?.items ?? [], [page]);
  const attention = useMemo(() => gatewayAttentionItems(rows), [rows]);
  const summary = useMemo(() => summariseGateways(rows, page?.total ?? 0), [rows, page?.total]);

  const columns: Array<OtColumn<GatewayRow>> = [
    {
      key: "name",
      header: t("gateways.columns.name"),
      cell: (row) => (
        <Link
          href={`/dashboard/ot/gateways/${encodeURIComponent(row.id)}`}
          className="ds-focus font-medium text-brand-primary underline-offset-2 hover:underline"
        >
          {row.displayName || t("gateways.detailTitle")}
        </Link>
      ),
    },
    {
      key: "systemIdentifier",
      // Labelled as a SYSTEM identifier. It is a registry primary key, and
      // calling it a serial number would be a claim the data does not support.
      header: t("gateways.columns.systemIdentifier"),
      cell: (row) => <SystemIdentifier value={row.gatewayId} />,
      optional: true,
      technical: true,
    },
    {
      key: "lifecycle",
      header: t("gateways.columns.lifecycle"),
      cell: (row) => <GatewayLifecycleBadge value={row.lifecycle} t={enumT} />,
    },
    {
      key: "site",
      header: t("gateways.columns.site"),
      cell: (row) => (
        <SiteValue
          siteId={row.siteId}
          siteNames={siteNames}
          noSiteLabel={t("identifiers.noSite")}
          unknownLabel={t("identifiers.unknownSite")}
        />
      ),
      optional: true,
    },
    {
      key: "capabilities",
      header: t("gateways.columns.capabilities"),
      cell: (row) => (
        <GatewayCapabilityList values={row.capabilities} t={enumT} emptyLabel={t("gateways.noCapabilities")} />
      ),
      optional: true,
    },
    {
      key: "lastSeen",
      header: t("gateways.columns.lastSeen"),
      cell: (row) => (
        <ObservationValue value={row.lastSeenAt} locale={locale} neverLabel={t("observation.never")} />
      ),
    },
    {
      key: "signing",
      header: t("gateways.columns.signing"),
      cell: (row) => (
        <SigningState
          configured={row.signingConfigured}
          configuredLabel={t("signing.configured")}
          notConfiguredLabel={t("signing.notConfigured")}
        />
      ),
      optional: true,
    },
  ];

  const filtersActive = hasActiveFilters(requested);

  return (
    <div className="flex flex-col gap-6">
      <OtFilterBar
        legend={t("filters.legend")}
        searchLabel={t("filters.searchGateways")}
        searchHint={t("filters.searchGatewaysHint")}
        searchValue={draft.search}
        onSearchChange={(value) => setDraft((state) => ({ ...state, search: value }))}
        onSubmit={() => submit(withFilters(draft, {}))}
        onClear={() =>
          submit(withFilters(draft, { lifecycle: "", siteId: "", capability: "", search: "" }))
        }
        applyLabel={t("filters.apply")}
        clearLabel={t("filters.clear")}
        busy={loading}
        canClear={filtersActive || hasActiveFilters(draft)}
      >
        <FormField label={t("filters.lifecycle")}>
          <OtSelect
            value={draft.lifecycle}
            onChange={(value) => setDraft((state) => ({ ...state, lifecycle: value }))}
            anyLabel={t("filters.any")}
            options={GATEWAY_LIFECYCLES.map((value) => ({
              value,
              label: t(`enums.gatewayLifecycle.${value}`),
            }))}
          />
        </FormField>

        <FormField label={t("filters.site")}>
          <OtSelect
            value={draft.siteId}
            onChange={(value) => setDraft((state) => ({ ...state, siteId: value }))}
            anyLabel={t("filters.anySite")}
            options={siteOptions}
          />
        </FormField>

        <FormField label={t("filters.capability")}>
          <OtSelect
            value={draft.capability}
            onChange={(value) => setDraft((state) => ({ ...state, capability: value }))}
            anyLabel={t("filters.any")}
            options={GATEWAY_CAPABILITIES.map((value) => ({
              value,
              label: t(`enums.gatewayCapability.${value}`),
            }))}
          />
        </FormField>
      </OtFilterBar>

      {/* Rendered only once rows are on screen: an attention summary over a
          result set that has not loaded would be a claim about nothing. */}
      {page && rows.length > 0 ? (
        <OtAttentionPanel
          items={attention.items}
          total={attention.total}
          title={t("attention.title")}
          emptyLabel={t("attention.empty")}
          note={t("attention.note")}
          moreLabel={
            attention.total > attention.items.length
              ? t("attention.moreCount", { count: attention.total - attention.items.length })
              : null
          }
          reasonLabel={(reason) => t(`attention.reasons.${reason}`)}
        />
      ) : null}

      {page && rows.length > 0 ? (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["inService", summary.inService],
            ["awaitingActivation", summary.awaitingActivation],
            ["neverObserved", summary.neverObserved],
            ["signingIncomplete", summary.signingIncomplete],
          ].map(([key, value]) => (
            <div key={String(key)} className="rounded-lg border border-border-default bg-surface-primary p-4">
              <dt className="text-label text-text-secondary">{t(`summary.${String(key)}`)}</dt>
              <dd className="mt-1 text-title font-semibold text-text-primary">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {loading ? (
        <OtSkeleton label={t(appliedQuery ? "states.loadingFiltered" : "states.loadingTitle")} />
      ) : failure ? (
        <OtFailure code={failure} copy={failureCopy} onRetry={retry} retryLabel={t("states.retry")} />
      ) : rows.length === 0 ? (
        <OtEmpty
          title={filtersActive ? t("states.noMatchTitle") : t("states.emptyGatewaysTitle")}
          body={filtersActive ? t("states.noMatchBody") : t("states.emptyGatewaysBody")}
        />
      ) : (
        <>
          <OtTable
            caption={t("gateways.tableCaption")}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
          />
          <OtPagination
            page={requested.page}
            pageSize={requested.pageSize}
            total={page?.total ?? 0}
            onPageChange={(next) => navigate(writeGatewayQuery({ ...requested, page: next }), "replace")}
            labels={{
              label: t("pagination.label"),
              previous: t("pagination.previous"),
              next: t("pagination.next"),
              status: t("pagination.status", {
                page: requested.page,
                pages: Math.max(1, Math.ceil((page?.total ?? 0) / requested.pageSize) || 1),
              }),
              resultCount: t("pagination.resultCount", { count: page?.total ?? 0 }),
            }}
          />
        </>
      )}
    </div>
  );
}
