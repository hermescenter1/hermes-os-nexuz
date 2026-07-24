"use client";

// PHASE 94C2 — loading the record an edit form starts from.
//
// The record is fetched through the same authorized read endpoint the detail
// page uses, so an edit form can never show a record the operator is not
// allowed to see: a foreign or missing profile answers 404 identically, and
// both render the same "not available" state rather than distinguishing them.
//
// The form is mounted only once the record has arrived. Seeding an empty form
// and filling it in afterwards would let an operator type into fields that are
// about to be overwritten, and — worse — submit before the baseline is known,
// which would send unchanged fields as if they were edits.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchDevice, fetchGateway, OtRequestError, type OtFailureCode } from "@/lib/ot-operations/api";
import type { DeviceRow, GatewayRow } from "@/lib/ot-operations/contract";
import { OtFailure, OtSkeleton } from "@/components/ot-edge-operations";
import { useFailureCopy } from "@/components/ot-edge-operations/shared";
import { GatewayForm } from "./GatewayForm";
import { DeviceForm } from "./DeviceForm";

function useRecord<T>(id: string, fetcher: (id: string, signal?: AbortSignal) => Promise<T>) {
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

export function GatewayEditLoader({ id }: { id: string }) {
  const t = useTranslations("otEdge.states");
  const copy = useFailureCopy();
  const { record, loading, failure, retry } = useRecord<GatewayRow>(id, fetchGateway);

  if (loading) return <OtSkeleton rows={4} label={t("loadingTitle")} />;
  if (failure || !record) {
    return (
      <OtFailure code={failure ?? "NOT_FOUND"} copy={copy} onRetry={retry} retryLabel={t("retry")} />
    );
  }
  return <GatewayForm mode="edit" recordId={id} record={record} />;
}

export function DeviceEditLoader({ id }: { id: string }) {
  const t = useTranslations("otEdge.states");
  const copy = useFailureCopy();
  const { record, loading, failure, retry } = useRecord<DeviceRow>(id, fetchDevice);

  if (loading) return <OtSkeleton rows={4} label={t("loadingTitle")} />;
  if (failure || !record) {
    return (
      <OtFailure code={failure ?? "NOT_FOUND"} copy={copy} onRetry={retry} retryLabel={t("retry")} />
    );
  }
  return <DeviceForm mode="edit" recordId={id} record={record} />;
}
