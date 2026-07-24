"use client";

// PHASE 94C2 — gateway registration and profile editing.
//
// ONE COMPONENT, TWO MODES, BECAUSE THE FIELDS ARE ALMOST THE SAME
// The create and update schemas differ in exactly two places: create requires
// the parent record and forbids `lifecycle`; update forbids the parent and
// permits `lifecycle`. Expressing that as a `mode` keeps the two forms from
// drifting apart — which is how an edit form ends up submitting a field the
// update schema rejects.
//
// THE PAYLOAD IS BUILT BY NAME, NEVER BY SPREAD
// `buildCreateGatewayBody` / `buildUpdateGatewayBody` name every key. The
// fetched record never flows back: an edit seeds the draft through
// `gatewayDraftFromRecord`, which reads only the six writable fields and drops
// the id, the site, the timestamps and the signing state at the boundary.
//
// SUBMISSION IS NEVER OPTIMISTIC. The server response is the only evidence a
// record exists, and navigation happens only after it arrives.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Card } from "@/components/ds";
import {
  GATEWAY_CAPABILITIES,
  GATEWAY_LIFECYCLES,
  type GatewayRow,
} from "@/lib/ot-operations/contract";
import {
  createGateway,
  fetchGatewayParents,
  updateGateway,
  OtWriteError,
  type OtWriteFailureCode,
  type ParentOption,
} from "@/lib/ot-operations/mutations";
import {
  buildCreateGatewayBody,
  buildUpdateGatewayBody,
  EMPTY_GATEWAY_DRAFT,
  GATEWAY_ENVIRONMENTS,
  gatewayDraftFromRecord,
  validateGatewayDraft,
  WRITE_LIMITS,
  type GatewayFormDraft,
} from "@/lib/ot-operations/write-contract";
import { useSiteNames } from "@/components/ot-edge-operations/shared";
import {
  OtBooleanField,
  OtCapabilitySelector,
  OtEnumSelect,
  OtFormActions,
  OtFormError,
  OtTextField,
} from "./OtFormControls";
import { OtParentSelector, OtParentsEmpty, OtParentsUnavailable } from "./OtParentSelector";
import { OtRegistrationSuccess } from "./OtRegistrationSuccess";

type Phase = "idle" | "submitting" | "succeeded";

export interface GatewayFormProps {
  mode: "create" | "edit";
  /** The profile id — edit mode only. */
  recordId?: string;
  /** The loaded record — edit mode only. */
  record?: GatewayRow;
}

export function GatewayForm({ mode, recordId, record }: GatewayFormProps) {
  const t = useTranslations("otEdge.onboarding");
  const enumT = useTranslations("otEdge.enums");
  const router = useRouter();
  const siteNames = useSiteNames();

  const seeded = useMemo<GatewayFormDraft>(
    () => (mode === "edit" && record ? gatewayDraftFromRecord(record) : EMPTY_GATEWAY_DRAFT),
    [mode, record],
  );
  const [draft, setDraft] = useState<GatewayFormDraft>(seeded);
  useEffect(() => setDraft(seeded), [seeded]);

  const [siteFilter, setSiteFilter] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<OtWriteFailureCode | null>(null);
  const [created, setCreated] = useState<GatewayRow | null>(null);
  const [touched, setTouched] = useState(false);

  // Guards a double submission from a rapid second click landing before React
  // has re-rendered the disabled button. A ref, not state, because it must be
  // true synchronously inside the same event.
  const inFlight = useRef(false);

  /* ── Parent records (create only) ─────────────────────────────────────── */

  const [parents, setParents] = useState<ParentOption[] | null>(null);
  const [parentsFailed, setParentsFailed] = useState(false);
  const [parentsToken, setParentsToken] = useState(0);

  useEffect(() => {
    if (mode !== "create") return;
    const controller = new AbortController();
    setParentsFailed(false);
    fetchGatewayParents(controller.signal)
      .then((options) => {
        if (!controller.signal.aborted) setParents(options);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        // A failed load BLOCKS registration rather than degrading to an empty
        // picker, which would read as "you have no gateways".
        setParents(null);
        setParentsFailed(true);
      });
    return () => controller.abort();
  }, [mode, parentsToken]);

  /* ── Validation ───────────────────────────────────────────────────────── */

  const errors = useMemo(() => validateGatewayDraft(draft, mode), [draft, mode]);
  const errorText = useCallback(
    (key: string | undefined) => {
      if (!key) return undefined;
      if (key === "required") return t("errors.required");
      if (key === "malformed") return t("errors.malformedIdentifier");
      if (key === "tooMany") return t("errors.tooManyCapabilities");
      return t("errors.tooLong");
    },
    [t],
  );

  const body = useMemo(
    () => (mode === "create" ? null : buildUpdateGatewayBody(draft, seeded)),
    [mode, draft, seeded],
  );
  const nothingToSave = mode === "edit" && body !== null && Object.keys(body).length === 0;

  /* ── Submission ───────────────────────────────────────────────────────── */

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
        const result = await createGateway(buildCreateGatewayBody(draft));
        setCreated(result);
        setPhase("succeeded");
      } else {
        await updateGateway(recordId ?? "", buildUpdateGatewayBody(draft, seeded));
        setPhase("succeeded");
        // The list and the detail page re-read through the server API rather
        // than being handed a record to splice in — the server's copy is the
        // only authority on what was actually stored.
        router.push(`/dashboard/ot/gateways/${encodeURIComponent(recordId ?? "")}`);
        router.refresh();
      }
    } catch (error) {
      setFailure(error instanceof OtWriteError ? error.code : "FAILED");
      setPhase("idle");
    } finally {
      inFlight.current = false;
    }
  }

  /* ── Success ──────────────────────────────────────────────────────────── */

  if (mode === "create" && phase === "succeeded" && created) {
    return (
      <OtRegistrationSuccess
        title={t("success.gatewayTitle")}
        body={t("success.gatewayBody")}
        identifierLabel={t("success.identifierLabel")}
        identifier={created.id}
        detailHref={`/dashboard/ot/gateways/${encodeURIComponent(created.id)}`}
        detailLabel={t("success.openGateway")}
        listHref="/dashboard/ot/gateways"
        listLabel={t("actions.backToList")}
        copyLabel={t("actions.copyIdentifier")}
        copiedLabel={t("actions.copied")}
      />
    );
  }

  /* ── Blocking picker states (create only) ─────────────────────────────── */

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
            label={t("gateway.parentLabel")}
            hint={t("gateway.parentHint")}
            placeholder={t("gateway.parentPlaceholder")}
            options={parents ?? []}
            value={draft.gatewayId}
            onChange={(id) => setDraft((state) => ({ ...state, gatewayId: id }))}
            siteFilter={siteFilter}
            onSiteFilterChange={setSiteFilter}
            siteFilterLabel={t("site.filterLabel")}
            anySiteLabel={t("site.anySite")}
            siteNames={siteNames}
            siteLabel={t("site.label")}
            siteInheritedHint={t("site.inherited")}
            siteNotSelectedLabel={t("site.notSelected")}
            referenceLabel={t("gateway.parentReference")}
            error={showError("gatewayId")}
            disabled={busy || parents === null}
            required
          />
        ) : null}

        <OtEnumSelect
          label={t("gateway.environmentLabel")}
          value={draft.environment}
          onChange={(value) => setDraft((state) => ({ ...state, environment: value }))}
          placeholder={t("site.anySite")}
          options={GATEWAY_ENVIRONMENTS.map((value) => ({
            value,
            label: enumT(`environment.${value}`),
          }))}
          disabled={busy}
        />

        <OtCapabilitySelector
          legend={t("gateway.capabilitiesLabel")}
          description={t("gateway.capabilitiesHint")}
          options={GATEWAY_CAPABILITIES.map((value) => ({
            value,
            label: enumT(`gatewayCapability.${value}`),
          }))}
          selected={draft.capabilities}
          onToggle={(value, checked) =>
            setDraft((state) => ({
              ...state,
              capabilities: checked
                ? [...state.capabilities, value]
                : state.capabilities.filter((entry) => entry !== value),
            }))
          }
          error={showError("capabilities")}
          disabled={busy}
        />

        {mode === "edit" ? (
          <OtEnumSelect
            label={t("gateway.lifecycleLabel")}
            description={t("gateway.lifecycleHint")}
            value={draft.lifecycle}
            onChange={(value) => setDraft((state) => ({ ...state, lifecycle: value }))}
            placeholder={t("gateway.parentPlaceholder")}
            options={GATEWAY_LIFECYCLES.map((value) => ({
              value,
              label: enumT(`gatewayLifecycle.${value}`),
            }))}
            disabled={busy}
          />
        ) : (
          // Create has no lifecycle field: the schema does not accept one, and
          // a control that silently does nothing is worse than a missing one.
          <p className="text-label text-text-muted">{t("gateway.lifecycleCreateNote")}</p>
        )}

        <OtTextField
          label={t("gateway.softwareVersionLabel")}
          value={draft.softwareVersion}
          onChange={(value) => setDraft((state) => ({ ...state, softwareVersion: value }))}
          maxLength={WRITE_LIMITS.softwareVersionMax}
          error={showError("softwareVersion")}
          disabled={busy}
        />

        <OtBooleanField
          label={t("gateway.readOnlyModeLabel")}
          description={t("gateway.readOnlyModeHint")}
          checked={draft.readOnlyMode}
          onChange={(checked) => setDraft((state) => ({ ...state, readOnlyMode: checked }))}
          disabled={busy}
        />

        <OtBooleanField
          label={t("gateway.simulatorModeLabel")}
          checked={draft.simulatorMode}
          onChange={(checked) => setDraft((state) => ({ ...state, simulatorMode: checked }))}
          disabled={busy}
        />

        {nothingToSave ? <p className="text-label text-text-muted">{t("status.unchanged")}</p> : null}

        <OtFormActions
          submitLabel={mode === "create" ? t("gateway.submitCreate") : t("gateway.submitEdit")}
          submitting={busy}
          submittingLabel={t("status.submitting")}
          disabled={mode === "edit" && nothingToSave}
          onCancel={() =>
            router.push(
              mode === "edit" && recordId
                ? `/dashboard/ot/gateways/${encodeURIComponent(recordId)}`
                : "/dashboard/ot/gateways",
            )
          }
          cancelLabel={t("actions.cancel")}
        />
      </form>
    </Card>
  );
}
