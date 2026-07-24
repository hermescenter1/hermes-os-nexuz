"use client";

// PHASE 94C2 — device registration and profile editing.
//
// SAME SHAPE AS THE GATEWAY FORM, WITH TWO REAL DIFFERENCES
//   1. `lifecycleState` IS accepted on create, unlike the gateway's lifecycle.
//      So the control appears in both modes here.
//   2. The write field is `lifecycleState`, while the DTO reads it back as
//      `lifecycle`. Round-tripping the DTO field name would be a 422 against a
//      `.strict()` schema, which is why the draft carries the WRITE name and
//      `deviceDraftFromRecord` performs the rename once, at the boundary.
//
// FIELDS THAT DO NOT EXIST HERE, AND WHY
// `manufacturer`, `model`, `protocols` and `lastImportSource` appear on the
// read DTO but no column backs them and no write path accepts them. A form
// field for any of them would collect a value that is silently discarded —
// worse than not asking, because the operator would believe it was stored.
// There is likewise no device name field: the write contract has none.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Card } from "@/components/ds";
import { DEVICE_CATEGORIES, DEVICE_LIFECYCLES, type DeviceRow } from "@/lib/ot-operations/contract";
import {
  createDevice,
  fetchAssetParents,
  updateDevice,
  OtWriteError,
  type OtWriteFailureCode,
  type ParentOption,
} from "@/lib/ot-operations/mutations";
import {
  buildCreateDeviceBody,
  buildUpdateDeviceBody,
  DEVICE_NETWORK_ZONES,
  DEVICE_SAFETY_CLASSES,
  deviceDraftFromRecord,
  EMPTY_DEVICE_DRAFT,
  validateDeviceDraft,
  WRITE_LIMITS,
  type DeviceFormDraft,
} from "@/lib/ot-operations/write-contract";
import { useSiteNames } from "@/components/ot-edge-operations/shared";
import { OtEnumSelect, OtFormActions, OtFormError, OtTextField } from "./OtFormControls";
import { OtParentSelector, OtParentsEmpty, OtParentsUnavailable } from "./OtParentSelector";
import { OtRegistrationSuccess } from "./OtRegistrationSuccess";

type Phase = "idle" | "submitting" | "succeeded";

export interface DeviceFormProps {
  mode: "create" | "edit";
  recordId?: string;
  record?: DeviceRow;
}

export function DeviceForm({ mode, recordId, record }: DeviceFormProps) {
  const t = useTranslations("otEdge.onboarding");
  const enumT = useTranslations("otEdge.enums");
  const router = useRouter();
  const siteNames = useSiteNames();

  const seeded = useMemo<DeviceFormDraft>(
    () => (mode === "edit" && record ? deviceDraftFromRecord(record) : EMPTY_DEVICE_DRAFT),
    [mode, record],
  );
  const [draft, setDraft] = useState<DeviceFormDraft>(seeded);
  useEffect(() => setDraft(seeded), [seeded]);

  const [siteFilter, setSiteFilter] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<OtWriteFailureCode | null>(null);
  const [created, setCreated] = useState<DeviceRow | null>(null);
  const [touched, setTouched] = useState(false);
  const inFlight = useRef(false);

  const [parents, setParents] = useState<ParentOption[] | null>(null);
  const [parentsFailed, setParentsFailed] = useState(false);
  const [parentsToken, setParentsToken] = useState(0);

  useEffect(() => {
    if (mode !== "create") return;
    const controller = new AbortController();
    setParentsFailed(false);
    fetchAssetParents(controller.signal)
      .then((options) => {
        if (!controller.signal.aborted) setParents(options);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setParents(null);
        setParentsFailed(true);
      });
    return () => controller.abort();
  }, [mode, parentsToken]);

  const errors = useMemo(() => validateDeviceDraft(draft, mode), [draft, mode]);
  const errorText = useCallback(
    (key: string | undefined) => {
      if (!key) return undefined;
      if (key === "required") return t("errors.required");
      if (key === "malformed") return t("errors.malformedIdentifier");
      return t("errors.tooLong");
    },
    [t],
  );

  const body = useMemo(
    () => (mode === "create" ? null : buildUpdateDeviceBody(draft, seeded)),
    [mode, draft, seeded],
  );
  const nothingToSave = mode === "edit" && body !== null && Object.keys(body).length === 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    if (inFlight.current) return;
    if (mode === "edit" && nothingToSave) return;

    inFlight.current = true;
    setPhase("submitting");
    setFailure(null);

    try {
      if (mode === "create") {
        const result = await createDevice(buildCreateDeviceBody(draft));
        setCreated(result);
        setPhase("succeeded");
      } else {
        await updateDevice(recordId ?? "", buildUpdateDeviceBody(draft, seeded));
        setPhase("succeeded");
        router.push(`/dashboard/ot/devices/${encodeURIComponent(recordId ?? "")}`);
        router.refresh();
      }
    } catch (error) {
      setFailure(error instanceof OtWriteError ? error.code : "FAILED");
      setPhase("idle");
    } finally {
      inFlight.current = false;
    }
  }

  if (mode === "create" && phase === "succeeded" && created) {
    return (
      <OtRegistrationSuccess
        title={t("success.deviceTitle")}
        body={t("success.deviceBody")}
        identifierLabel={t("success.identifierLabel")}
        // The engineering identifier when the operator supplied one, since that
        // is what they will recognise; otherwise the record id, which is the
        // honest fallback rather than an invented label.
        identifier={created.engineeringId ?? created.id}
        detailHref={`/dashboard/ot/devices/${encodeURIComponent(created.id)}`}
        detailLabel={t("success.openDevice")}
        listHref="/dashboard/ot/devices"
        listLabel={t("actions.backToList")}
        copyLabel={t("actions.copyIdentifier")}
        copiedLabel={t("actions.copied")}
      />
    );
  }

  if (mode === "create" && parentsFailed) {
    return (
      <OtParentsUnavailable
        title={t("errors.parentsTitle")}
        body={t("errors.parentsBody")}
        retryLabel={t("errors.retry")}
        onRetry={() => setParentsToken((token) => token + 1)}
      />
    );
  }
  if (mode === "create" && parents !== null && parents.length === 0) {
    return <OtParentsEmpty title={t("errors.parentsEmptyTitle")} body={t("errors.parentsEmptyBody")} />;
  }

  const busy = phase === "submitting";
  const showError = (key: keyof typeof errors) => (touched ? errorText(errors[key]) : undefined);

  return (
    <Card variant="standard" className="p-6">
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        {failure ? <OtFormError title={t("errors.title")} message={t(`errors.${failure}`)} /> : null}

        {mode === "create" ? (
          <OtParentSelector
            label={t("device.parentLabel")}
            hint={t("device.parentHint")}
            placeholder={t("device.parentPlaceholder")}
            options={parents ?? []}
            value={draft.assetId}
            onChange={(id) => setDraft((state) => ({ ...state, assetId: id }))}
            siteFilter={siteFilter}
            onSiteFilterChange={setSiteFilter}
            siteFilterLabel={t("site.filterLabel")}
            anySiteLabel={t("site.anySite")}
            siteNames={siteNames}
            siteLabel={t("site.label")}
            siteInheritedHint={t("site.inherited")}
            siteNotSelectedLabel={t("site.notSelected")}
            referenceLabel={t("device.engineeringIdLabel")}
            error={showError("assetId")}
            disabled={busy || parents === null}
            required
          />
        ) : null}

        <OtEnumSelect
          label={t("device.categoryLabel")}
          value={draft.category}
          onChange={(value) => setDraft((state) => ({ ...state, category: value }))}
          placeholder={t("device.parentPlaceholder")}
          options={DEVICE_CATEGORIES.map((value) => ({
            value,
            label: enumT(`deviceCategory.${value}`),
          }))}
          disabled={busy}
        />

        <OtEnumSelect
          label={t("device.lifecycleLabel")}
          value={draft.lifecycleState}
          onChange={(value) => setDraft((state) => ({ ...state, lifecycleState: value }))}
          placeholder={t("device.parentPlaceholder")}
          options={DEVICE_LIFECYCLES.map((value) => ({
            value,
            label: enumT(`deviceLifecycle.${value}`),
          }))}
          disabled={busy}
        />

        <OtEnumSelect
          label={t("device.networkZoneLabel")}
          value={draft.networkZone}
          onChange={(value) => setDraft((state) => ({ ...state, networkZone: value }))}
          placeholder={t("device.parentPlaceholder")}
          options={DEVICE_NETWORK_ZONES.map((value) => ({
            value,
            label: enumT(`networkZone.${value}`),
          }))}
          disabled={busy}
        />

        <OtEnumSelect
          label={t("device.safetyClassLabel")}
          value={draft.safetyClass}
          onChange={(value) => setDraft((state) => ({ ...state, safetyClass: value }))}
          placeholder={t("device.parentPlaceholder")}
          options={DEVICE_SAFETY_CLASSES.map((value) => ({
            value,
            label: enumT(`safetyClass.${value}`),
          }))}
          disabled={busy}
        />

        <OtTextField
          label={t("device.engineeringIdLabel")}
          description={t("device.engineeringIdHint")}
          value={draft.engineeringId}
          onChange={(value) => setDraft((state) => ({ ...state, engineeringId: value }))}
          maxLength={WRITE_LIMITS.engineeringIdMax}
          error={showError("engineeringId")}
          disabled={busy}
        />

        <OtTextField
          label={t("device.productFamilyLabel")}
          value={draft.productFamily}
          onChange={(value) => setDraft((state) => ({ ...state, productFamily: value }))}
          maxLength={WRITE_LIMITS.productFamilyMax}
          error={showError("productFamily")}
          disabled={busy}
        />

        <OtTextField
          label={t("device.firmwareVersionLabel")}
          value={draft.firmwareVersion}
          onChange={(value) => setDraft((state) => ({ ...state, firmwareVersion: value }))}
          maxLength={WRITE_LIMITS.firmwareVersionMax}
          error={showError("firmwareVersion")}
          disabled={busy}
        />

        {nothingToSave ? <p className="text-label text-text-muted">{t("status.unchanged")}</p> : null}

        <OtFormActions
          submitLabel={mode === "create" ? t("device.submitCreate") : t("device.submitEdit")}
          submitting={busy}
          submittingLabel={t("status.submitting")}
          disabled={mode === "edit" && nothingToSave}
          onCancel={() =>
            router.push(
              mode === "edit" && recordId
                ? `/dashboard/ot/devices/${encodeURIComponent(recordId)}`
                : "/dashboard/ot/devices",
            )
          }
          cancelLabel={t("actions.cancel")}
        />
      </form>
    </Card>
  );
}
