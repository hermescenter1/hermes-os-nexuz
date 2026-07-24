"use client";

// PHASE 94C1 — single-record views for a gateway and a device.
//
// These render the SAME verified fields as the lists, laid out for reading
// rather than comparison. Nothing new is fetched beyond the record itself, and
// nothing is derived that the list would not also show — a detail page is not
// an opportunity to infer state the API never reported.
//
// A record outside the actor's authorized sites answers 404, byte-identical to
// one that does not exist, which is why both map to the same message here: the
// UI must not become the oracle the API refuses to be.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchDevice, fetchGateway, OtRequestError, type OtFailureCode } from "@/lib/ot-operations/api";
import type { DeviceRow, GatewayRow } from "@/lib/ot-operations/contract";
import { Card } from "@/components/ds";
import { OtFailure, OtSkeleton } from "./OtStates";
import {
  DeviceCategoryBadge,
  DeviceLifecycleBadge,
  DetailRow,
  EnumBadge,
  GatewayCapabilityList,
  GatewayLifecycleBadge,
  ObservationValue,
  SigningState,
  SiteValue,
  SystemIdentifier,
} from "./OtPresenters";
import { useFailureCopy, useSiteNames } from "./shared";
import { formatDateTime } from "@/lib/i18n/format";

/** One record, one request, with the same abort discipline as the lists. */
function useOtRecord<T>(id: string, fetcher: (id: string, signal?: AbortSignal) => Promise<T>) {
  const [record, setRecord] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<OtFailureCode | null>(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure(null);

    fetcher(id, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setRecord(value);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRecord(null);
        setFailure(error instanceof OtRequestError ? error.code : "FAILED");
        setLoading(false);
      });

    return () => controller.abort();
  }, [id, fetcher, token]);

  const retry = useCallback(() => setToken((value) => value + 1), []);
  return { record, loading, failure, retry };
}

export function GatewayDetailClient({ id, locale }: { id: string; locale: string }) {
  const t = useTranslations("otEdge");
  const enumT = useTranslations("otEdge");
  const siteNames = useSiteNames();
  const failureCopy = useFailureCopy();
  const { record, loading, failure, retry } = useOtRecord<GatewayRow>(id, fetchGateway);

  if (loading) return <OtSkeleton rows={4} label={t("states.loadingTitle")} />;
  if (failure || !record) {
    return (
      <OtFailure
        code={failure ?? "NOT_FOUND"}
        copy={failureCopy}
        onRetry={retry}
        retryLabel={t("states.retry")}
      />
    );
  }

  return (
    <Card variant="standard" className="p-6">
      <dl className="flex flex-col">
        <DetailRow label={t("gateways.columns.name")}>{record.displayName || "—"}</DetailRow>
        <DetailRow label={t("identifiers.systemIdentifier")}>
          <SystemIdentifier value={record.gatewayId} />
          <span className="mt-1 block text-label text-text-muted">{t("identifiers.systemIdentifierHint")}</span>
        </DetailRow>
        <DetailRow label={t("gateways.columns.lifecycle")}>
          <GatewayLifecycleBadge value={record.lifecycle} t={enumT} />
        </DetailRow>
        <DetailRow label={t("gateways.columns.site")}>
          <SiteValue
            siteId={record.siteId}
            siteNames={siteNames}
            noSiteLabel={t("identifiers.noSite")}
            unknownLabel={t("identifiers.unknownSite")}
          />
        </DetailRow>
        <DetailRow label={t("gateways.environment")}>
          <EnumBadge value={record.environment} t={enumT} path="enums.environment" />
        </DetailRow>
        <DetailRow label={t("gateways.columns.capabilities")}>
          <GatewayCapabilityList
            values={record.capabilities}
            t={enumT}
            emptyLabel={t("gateways.noCapabilities")}
          />
        </DetailRow>
        <DetailRow label={t("gateways.columns.lastSeen")}>
          <ObservationValue value={record.lastSeenAt} locale={locale} neverLabel={t("observation.never")} />
          <span className="mt-1 block text-label text-text-muted">
            {record.lastSeenAt === null ? t("observation.neverHint") : t("observation.seenHint")}
          </span>
        </DetailRow>
        <DetailRow label={t("gateways.columns.signing")}>
          <SigningState
            configured={record.signingConfigured}
            configuredLabel={t("signing.configured")}
            notConfiguredLabel={t("signing.notConfigured")}
          />
          <span className="mt-1 block text-label text-text-muted">{t("signing.hint")}</span>
        </DetailRow>
        <DetailRow label={t("gateways.softwareVersion")}>
          {record.softwareVersion ? <SystemIdentifier value={record.softwareVersion} /> : "—"}
        </DetailRow>
        <DetailRow label={t("gateways.readOnlyMode")}>
          {record.readOnlyMode ? t("boolean.yes") : t("boolean.no")}
        </DetailRow>
        <DetailRow label={t("gateways.simulatorMode")}>
          {record.simulatorMode ? t("boolean.yes") : t("boolean.no")}
        </DetailRow>
        <DetailRow label={t("gateways.createdAt")}>
          {record.createdAt ? formatDateTime(record.createdAt, locale) : "—"}
        </DetailRow>
        <DetailRow label={t("gateways.updatedAt")}>
          {record.updatedAt ? formatDateTime(record.updatedAt, locale) : "—"}
        </DetailRow>
      </dl>
    </Card>
  );
}

export function DeviceDetailClient({ id, locale }: { id: string; locale: string }) {
  const t = useTranslations("otEdge");
  const enumT = useTranslations("otEdge");
  const siteNames = useSiteNames();
  const failureCopy = useFailureCopy();
  const { record, loading, failure, retry } = useOtRecord<DeviceRow>(id, fetchDevice);

  if (loading) return <OtSkeleton rows={4} label={t("states.loadingTitle")} />;
  if (failure || !record) {
    return (
      <OtFailure
        code={failure ?? "NOT_FOUND"}
        copy={failureCopy}
        onRetry={retry}
        retryLabel={t("states.retry")}
      />
    );
  }

  return (
    <Card variant="standard" className="p-6">
      <dl className="flex flex-col">
        <DetailRow label={t("devices.columns.engineeringId")}>
          {record.engineeringId ? (
            <SystemIdentifier value={record.engineeringId} />
          ) : (
            <span className="text-text-muted">{t("devices.noEngineeringId")}</span>
          )}
        </DetailRow>
        <DetailRow label={t("identifiers.systemIdentifier")}>
          <SystemIdentifier value={record.id} />
          <span className="mt-1 block text-label text-text-muted">{t("identifiers.systemIdentifierHint")}</span>
        </DetailRow>
        <DetailRow label={t("devices.columns.category")}>
          <DeviceCategoryBadge value={record.category} t={enumT} />
        </DetailRow>
        <DetailRow label={t("devices.columns.lifecycle")}>
          <DeviceLifecycleBadge value={record.lifecycle} t={enumT} />
        </DetailRow>
        <DetailRow label={t("devices.columns.site")}>
          <SiteValue
            siteId={record.siteId}
            siteNames={siteNames}
            noSiteLabel={t("identifiers.noSite")}
            unknownLabel={t("identifiers.unknownSite")}
          />
        </DetailRow>
        <DetailRow label={t("devices.columns.networkZone")}>
          <EnumBadge value={record.networkZone} t={enumT} path="enums.networkZone" />
        </DetailRow>
        <DetailRow label={t("devices.safetyClass")}>
          <EnumBadge value={record.safetyClass} t={enumT} path="enums.safetyClass" />
        </DetailRow>
        {/* `firmwareVersion` and `productFamily` ARE written by the create and
            update routes, unlike manufacturer/model/protocols — so they are
            shown when present and simply omitted when not. */}
        {record.firmwareVersion ? (
          <DetailRow label={t("devices.firmwareVersion")}>
            <SystemIdentifier value={record.firmwareVersion} />
          </DetailRow>
        ) : null}
        {record.productFamily ? (
          <DetailRow label={t("devices.productFamily")}>{record.productFamily}</DetailRow>
        ) : null}
        {record.assetId ? (
          <DetailRow label={t("devices.assetId")}>
            <SystemIdentifier value={record.assetId} />
          </DetailRow>
        ) : null}
        <DetailRow label={t("devices.createdAt")}>
          {record.createdAt ? formatDateTime(record.createdAt, locale) : "—"}
        </DetailRow>
        <DetailRow label={t("devices.updatedAt")}>
          {record.updatedAt ? formatDateTime(record.updatedAt, locale) : "—"}
        </DetailRow>
      </dl>
    </Card>
  );
}
