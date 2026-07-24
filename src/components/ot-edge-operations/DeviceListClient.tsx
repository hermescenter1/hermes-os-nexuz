"use client";

// PHASE 94C1 — the device list.
//
// WHAT IS ABSENT HERE IS AS DELIBERATE AS WHAT IS PRESENT.
// `OtDeviceProfileDto` carries `manufacturer`, `model`, `protocols` and
// `lastImportSource`, but no column backs them and no write path fills them —
// they arrive null on every response. So there is no vendor column, no vendor
// filter, and no "Unknown vendor" placeholder: a column of dashes tells an
// operator the data is missing for THESE devices, when in fact it is missing
// for all of them, everywhere, always. Omission is the honest rendering.
//
// The device DTO also has no name. The engineering identifier is the only
// human-meaningful value the contract guarantees, so it leads the table, and
// the record identifier stands in only when the engineering one was never set.
//
// As with gateways, every narrowing is the server's. No `.filter()` runs here.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { FormField } from "@/components/ds";
import { fetchDevices } from "@/lib/ot-operations/api";
import { DEVICE_CATEGORIES, DEVICE_LIFECYCLES, type DeviceRow } from "@/lib/ot-operations/contract";
import {
  deviceRequestQuery,
  hasActiveFilters,
  readDeviceQuery,
  withFilters,
  writeDeviceQuery,
  type DeviceQueryState,
} from "@/lib/ot-operations/query";
import { deviceAttentionItems, summariseDevices } from "@/lib/ot-operations/attention";
import { OtFilterBar, OtSelect } from "./OtFilterBar";
import { OtTable, type OtColumn } from "./OtTable";
import { OtPagination } from "./OtPagination";
import { OtAttentionPanel } from "./OtAttentionPanel";
import { OtEmpty, OtFailure, OtSkeleton } from "./OtStates";
import {
  DeviceCategoryBadge,
  DeviceLifecycleBadge,
  EnumBadge,
  SiteValue,
  SystemIdentifier,
} from "./OtPresenters";
import { useOtList } from "./useOtList";
import { useFailureCopy, useSiteNames, useSiteOptions } from "./shared";

export function DeviceListClient() {
  const t = useTranslations("otEdge");
  const enumT = useTranslations("otEdge");

  // See GatewayListClient: the live URL is authoritative, never a prop.
  const params = useSearchParams();
  // Memoised on the STRING, not the params object. `useSearchParams` is free
  // to return a fresh instance on any render, and an identity-keyed memo
  // would then recompute, change the request key, refire the effect and
  // re-render — an unbounded request loop. A primitive dependency cannot.
  const searchKey = params.toString();
  const requested = useMemo<DeviceQueryState>(() => readDeviceQuery(new URLSearchParams(searchKey)), [searchKey]);
  const requestQuery = useMemo(() => deviceRequestQuery(requested), [requested]);
  const urlQuery = useMemo(() => writeDeviceQuery(requested), [requested]);

  const { page, appliedQuery, loading, failure, retry, navigate } = useOtList<DeviceRow>({
    requestQuery,
    urlQuery,
    fetcher: fetchDevices,
  });

  const [draft, setDraft] = useState<DeviceQueryState>(requested);
  useEffect(() => setDraft(requested), [requested]);

  const siteNames = useSiteNames();
  const siteOptions = useSiteOptions(siteNames);
  const failureCopy = useFailureCopy();

  const submit = useCallback(
    (next: DeviceQueryState) => navigate(writeDeviceQuery(next), "push"),
    [navigate],
  );

  // Memoised so the identity is stable: `page?.items ?? []` mints a NEW empty
  // array on every render, which would make the memos below recompute each
  // time and defeat the point of having them.
  const rows = useMemo<readonly DeviceRow[]>(() => page?.items ?? [], [page]);
  const attention = useMemo(() => deviceAttentionItems(rows), [rows]);
  const summary = useMemo(() => summariseDevices(rows, page?.total ?? 0), [rows, page?.total]);

  const columns: Array<OtColumn<DeviceRow>> = [
    {
      key: "engineeringId",
      header: t("devices.columns.engineeringId"),
      cell: (row) => (
        <Link
          href={`/dashboard/ot/devices/${encodeURIComponent(row.id)}`}
          className="ds-focus font-medium text-brand-primary underline-offset-2 hover:underline"
        >
          {row.engineeringId ? (
            <SystemIdentifier value={row.engineeringId} />
          ) : (
            t("devices.noEngineeringId")
          )}
        </Link>
      ),
    },
    {
      key: "category",
      header: t("devices.columns.category"),
      cell: (row) => <DeviceCategoryBadge value={row.category} t={enumT} />,
    },
    {
      key: "lifecycle",
      header: t("devices.columns.lifecycle"),
      cell: (row) => <DeviceLifecycleBadge value={row.lifecycle} t={enumT} />,
    },
    {
      key: "site",
      header: t("devices.columns.site"),
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
      key: "networkZone",
      header: t("devices.columns.networkZone"),
      cell: (row) => <EnumBadge value={row.networkZone} t={enumT} path="enums.networkZone" />,
      optional: true,
    },
    {
      key: "systemIdentifier",
      header: t("devices.columns.systemIdentifier"),
      cell: (row) => <SystemIdentifier value={row.id} />,
      optional: true,
      technical: true,
    },
  ];

  const filtersActive = hasActiveFilters(requested);

  return (
    <div className="flex flex-col gap-6">
      <OtFilterBar
        legend={t("filters.legend")}
        searchLabel={t("filters.searchDevices")}
        searchHint={t("filters.searchDevicesHint")}
        searchValue={draft.search}
        onSearchChange={(value) => setDraft((state) => ({ ...state, search: value }))}
        onSubmit={() => submit(withFilters(draft, {}))}
        onClear={() => submit(withFilters(draft, { lifecycle: "", siteId: "", category: "", search: "" }))}
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
            options={DEVICE_LIFECYCLES.map((value) => ({
              value,
              label: t(`enums.deviceLifecycle.${value}`),
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

        <FormField label={t("filters.category")}>
          <OtSelect
            value={draft.category}
            onChange={(value) => setDraft((state) => ({ ...state, category: value }))}
            anyLabel={t("filters.any")}
            options={DEVICE_CATEGORIES.map((value) => ({
              value,
              label: t(`enums.deviceCategory.${value}`),
            }))}
          />
        </FormField>
      </OtFilterBar>

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
            ["operational", summary.operational],
            ["inCommissioning", summary.inCommissioning],
            ["lifecycleUnknown", summary.lifecycleUnknown],
            ["sitesOnPage", summary.sitesOnPage],
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
          title={filtersActive ? t("states.noMatchTitle") : t("states.emptyDevicesTitle")}
          body={filtersActive ? t("states.noMatchBody") : t("states.emptyDevicesBody")}
        />
      ) : (
        <>
          <OtTable
            caption={t("devices.tableCaption")}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
          />
          <OtPagination
            page={requested.page}
            pageSize={requested.pageSize}
            total={page?.total ?? 0}
            onPageChange={(next) => navigate(writeDeviceQuery({ ...requested, page: next }), "replace")}
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
