"use client";

/**
 * ATS-M1 — the organization's ATS Settings page (six sections).
 *
 * Each section saves on its own, with the settings version it loaded. The
 * sections that change who decides, what reaches a model, how long candidate
 * data is kept, or whether the public can apply (human approval owner, AI,
 * retention, public careers) are ATS_ADMIN-only and open a confirmation that
 * REQUIRES a written reason. Platform invariants — a human approves every gate
 * decision, every AI claim cites evidence, retention only anonymises — are
 * shown locked. The security section shows configured / missing, never a
 * value, and has no input at all.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ds/Input";
import { Switch } from "@/components/ds/Switch";
import { Alert } from "@/components/ds/Alert";
import { ROLE_CODES, ROLE_PROFILES, type RoleCode } from "@/lib/ats/review/catalog";
import { APPROVAL_OWNER_ROLES } from "@/lib/ats/positions/contract";
import { RETENTION_APPROVAL_STATES, RETENTION_TRIGGERS, type SettingsSection } from "@/lib/ats/settings/contract";
import { atsMutate, atsRead } from "./client-api";
import { ConfirmDialog, ToastRegion, useRefusalMessage, useToasts, type ConfirmSpec } from "./feedback";

interface RetentionPolicyView {
  id: string;
  name: string;
  retentionDays: number | null;
  retentionTrigger: string;
  action: string;
  approvalState: string;
  enabled: boolean;
  dryRunOnly: boolean;
  effectiveFrom: string | null;
}

interface SettingsView {
  settings: {
    defaultDecisionSlaDays: number | null;
    defaultInterviewStages: unknown[];
    defaultApprovalOwnerRole: string | null;
    aiProviderMode: "deterministic" | "router";
    externalAiProcessingEnabled: boolean;
    minimumConfidence: number | null;
    reviewAlertsEnabled: boolean;
    interviewRemindersEnabled: boolean;
    slaBreachAlertsEnabled: boolean;
    publicListingEnabled: boolean;
    applicationIntakeEnabled: boolean;
    defaultPublicLocale: "en" | "fa" | "de";
    retentionPolicyId: string | null;
    version: number;
    exists: boolean;
  };
  locked: { humanApprovalRequired: true; evidenceRequired: true; retentionAction: "ANONYMISE"; pipeline: string[] };
  ai: { effectiveExternalProcessing: boolean; versions: { extractor: string; rubric: string; prompt: string; policy: string } };
  retention: { selectedPolicyId: string | null; policies: RetentionPolicyView[] };
  security: {
    items: { name: string; state: "CONFIGURED" | "MISSING" | "ENABLED" | "DISABLED" }[];
    applicationAcceptanceAuthorized: boolean;
    deploymentProviderMode: string;
  } | null;
  viewer: { canManage: boolean; canAdmin: boolean; canApproveRetention: boolean };
}

function Card({ title, description, children, locked }: { title: string; description?: string; children: ReactNode; locked?: string }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-body text-sm font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
        </div>
        {locked ? <span className="hs-badge hs--warning">{locked}</span> : null}
      </div>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function ToggleRow({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-ink">{label}</p>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

function LockedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface2 px-3 py-2">
      <span className="text-sm text-ink">{label}</span>
      <span className="hs-badge hs--reasoning">{value}</span>
    </div>
  );
}

type RetentionForm = {
  policyId: string;
  retentionDays: string;
  retentionTrigger: (typeof RETENTION_TRIGGERS)[number];
  approvalState: (typeof RETENTION_APPROVAL_STATES)[number];
  enabled: boolean;
  effectiveFrom: string;
};

/** The form for one stored policy, or a clean PROPOSAL when there is none. */
function retentionFormOf(p: RetentionPolicyView | undefined): RetentionForm {
  if (!p) return { policyId: "", retentionDays: "", retentionTrigger: "CREATION", approvalState: "PENDING_REVIEW", enabled: false, effectiveFrom: "" };
  return {
    policyId: p.id,
    retentionDays: p.retentionDays == null ? "" : String(p.retentionDays),
    retentionTrigger: p.retentionTrigger === "LAST_ACTIVITY" ? "LAST_ACTIVITY" : "CREATION",
    approvalState: (RETENTION_APPROVAL_STATES as readonly string[]).includes(p.approvalState)
      ? (p.approvalState as (typeof RETENTION_APPROVAL_STATES)[number])
      : "PENDING_REVIEW",
    enabled: p.enabled,
    effectiveFrom: p.effectiveFrom ? p.effectiveFrom.slice(0, 10) : "",
  };
}

const selectClass = "h-9 w-full rounded-sm border border-border-default bg-surface-interactive px-2 text-body text-text-primary";

export function AtsSettingsClient() {
  const t = useTranslations("ats.mgmt.settings");
  const tm = useTranslations("ats.mgmt");
  const tf = useTranslations("ats.mgmt.form");
  const refusal = useRefusalMessage();
  const { toasts, push, dismiss } = useToasts();
  const [view, setView] = useState<SettingsView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [tick, setTick] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  // Section drafts
  const [sla, setSla] = useState("");
  const [kitTemplate, setKitTemplate] = useState("");
  const [ownerRole, setOwnerRole] = useState("");
  const [ai, setAi] = useState({ aiProviderMode: "deterministic" as "deterministic" | "router", externalAiProcessingEnabled: false, minimumConfidence: "" });
  const [notif, setNotif] = useState({ reviewAlertsEnabled: false, interviewRemindersEnabled: false, slaBreachAlertsEnabled: false });
  const [careers, setCareers] = useState({ publicListingEnabled: true, applicationIntakeEnabled: false, defaultPublicLocale: "fa" as "en" | "fa" | "de" });
  const [retention, setRetention] = useState<RetentionForm>(() => retentionFormOf(undefined));

  useEffect(() => {
    atsRead<{ view: SettingsView }>("/api/ats/settings").then((r) => {
      if (r.status === 401 || r.status === 403) return setState("denied");
      if (!r.ok || !r.data) return setState("error");
      const v = r.data.view;
      setView(v);
      setSla(v.settings.defaultDecisionSlaDays == null ? "" : String(v.settings.defaultDecisionSlaDays));
      setOwnerRole(v.settings.defaultApprovalOwnerRole ?? "");
      setAi({
        aiProviderMode: v.settings.aiProviderMode,
        externalAiProcessingEnabled: v.settings.externalAiProcessingEnabled,
        minimumConfidence: v.settings.minimumConfidence == null ? "" : String(v.settings.minimumConfidence),
      });
      setNotif({
        reviewAlertsEnabled: v.settings.reviewAlertsEnabled,
        interviewRemindersEnabled: v.settings.interviewRemindersEnabled,
        slaBreachAlertsEnabled: v.settings.slaBreachAlertsEnabled,
      });
      setCareers({
        publicListingEnabled: v.settings.publicListingEnabled,
        applicationIntakeEnabled: v.settings.applicationIntakeEnabled,
        defaultPublicLocale: v.settings.defaultPublicLocale,
      });
      setRetention(retentionFormOf(v.retention.policies.find((p) => p.id === v.retention.selectedPolicyId)));
      setState("ready");
    });
  }, [tick]);

  const save = async (section: SettingsSection, changes: Record<string, unknown>, reason?: string): Promise<boolean> => {
    if (!view) return false;
    const res = await atsMutate<{ version: number }>("/api/ats/settings", "PATCH", {
      section,
      changes,
      expectedVersion: view.settings.version,
      ...(reason ? { reason } : {}),
    });
    if (res.ok) {
      push({ kind: "success", message: t("saved"), correlationId: res.correlationId });
      reload();
      return true;
    }
    push({ kind: "error", message: refusal(res), correlationId: res.correlationId });
    if (res.code === "STALE") reload();
    return res.code === "STALE";
  };

  const saveWithReason = (section: SettingsSection, changes: Record<string, unknown>, title: string, message: string) =>
    setConfirm({ title, message, confirmLabel: t("confirmSave"), reasonRequired: true, onConfirm: (reason) => save(section, changes, reason) });

  if (state === "loading") return <div className="h-40 animate-pulse rounded-xl border border-line bg-surface" aria-busy="true" />;
  if (state === "denied")
    return (
      <Alert variant="warning" title={tm("permission.title")}>
        {tm("permission.manageRequired")}
      </Alert>
    );
  if (state === "error" || !view)
    return (
      <Alert variant="danger" title={tm("states.errorTitle")}>
        <p>{tm("errors.GENERIC")}</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={reload}>
          {tm("states.retry")}
        </Button>
      </Alert>
    );

  const admin = view.viewer.canAdmin;
  // Approving / enabling a retention policy is a compliance act (manage_retention).
  const approver = view.viewer.canApproveRetention;
  const adminHint = admin ? undefined : tm("permission.adminRequired");

  return (
    <div className="flex flex-col gap-5">
      {!view.settings.exists ? <Alert variant="information">{t("defaultsNotice")}</Alert> : null}

      {/* 1. Recruitment workflow */}
      <Card title={t("workflow.title")} description={t("workflow.description")}>
        <div>
          <p className="kpi-label mb-2">{t("workflow.pipeline")}</p>
          <ol className="flex flex-wrap gap-1">
            {view.locked.pipeline.map((s) => (
              <li key={s} className="hs-badge hs--nominal">
                {t(`pipeline.${s}`)}
              </li>
            ))}
          </ol>
          <p className="mt-1 text-xs text-muted">{t("workflow.pipelineLocked")}</p>
        </div>
        <LockedRow label={t("workflow.humanApproval")} value={t("locked.required")} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="kpi-label">{t("workflow.slaDefault")}</span>
            <Input dir="ltr" inputMode="numeric" value={sla} onChange={(e) => setSla(e.target.value)} disabled={!view.viewer.canManage} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="kpi-label">{t("workflow.interviewStages")}</span>
            <select className={selectClass} value={kitTemplate} onChange={(e) => setKitTemplate(e.target.value)} disabled={!view.viewer.canManage}>
              <option value="">{t("workflow.keepStages", { count: view.settings.defaultInterviewStages.length })}</option>
              {ROLE_CODES.map((c) => (
                <option key={c} value={c}>
                  {tf(`template.roles.${c}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <Button
            size="sm"
            disabled={!view.viewer.canManage}
            onClick={() =>
              save("workflow", {
                defaultDecisionSlaDays: sla.trim() ? Number(sla) : null,
                ...(kitTemplate ? { defaultInterviewStages: ROLE_PROFILES[kitTemplate as RoleCode].interviewKit } : {}),
              })
            }
          >
            {t("save")}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="kpi-label">{t("workflow.approvalOwner")}</span>
            <select className={selectClass} value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)} disabled={!admin} title={adminHint}>
              <option value="">{tf("notSet")}</option>
              {APPROVAL_OWNER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {tf(`roles.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={!admin}
              title={adminHint}
              onClick={() => saveWithReason("humanApproval", { defaultApprovalOwnerRole: ownerRole || null }, t("workflow.approvalOwner"), t("confirmHumanApproval"))}
            >
              {t("save")}
            </Button>
          </div>
        </div>
      </Card>

      {/* 2. AI review */}
      <Card title={t("ai.title")} description={t("ai.description")} locked={admin ? undefined : t("locked.adminOnly")}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="kpi-label">{t("ai.provider")}</span>
            <select
              className={selectClass}
              value={ai.aiProviderMode}
              disabled={!admin}
              onChange={(e) => setAi({ ...ai, aiProviderMode: e.target.value === "router" ? "router" : "deterministic" })}
            >
              <option value="deterministic">{t("ai.deterministic")}</option>
              <option value="router">{t("ai.router")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="kpi-label">{t("ai.minimumConfidence")}</span>
            <Input dir="ltr" inputMode="numeric" value={ai.minimumConfidence} disabled={!admin} onChange={(e) => setAi({ ...ai, minimumConfidence: e.target.value })} />
            <span className="text-xs text-muted">{t("ai.minimumConfidenceHint")}</span>
          </label>
        </div>
        <ToggleRow
          label={t("ai.external")}
          hint={t("ai.externalHint")}
          checked={ai.externalAiProcessingEnabled}
          disabled={!admin}
          onChange={(v) => setAi({ ...ai, externalAiProcessingEnabled: v })}
        />
        <LockedRow label={t("ai.evidence")} value={t("locked.required")} />
        <LockedRow label={t("ai.effective")} value={view.ai.effectiveExternalProcessing ? t("ai.effectiveExternal") : t("ai.effectiveDeterministic")} />
        <p className="text-xs text-muted" dir="ltr">
          {t("ai.versions", { ...view.ai.versions })}
        </p>
        <div>
          <Button
            size="sm"
            disabled={!admin}
            title={adminHint}
            onClick={() =>
              saveWithReason(
                "ai",
                {
                  aiProviderMode: ai.aiProviderMode,
                  externalAiProcessingEnabled: ai.externalAiProcessingEnabled,
                  minimumConfidence: ai.minimumConfidence.trim() ? Number(ai.minimumConfidence) : null,
                },
                t("ai.title"),
                t("confirmAi"),
              )
            }
          >
            {t("save")}
          </Button>
        </div>
      </Card>

      {/* 3. Retention */}
      <Card title={t("retention.title")} description={t("retention.description")} locked={admin ? undefined : t("locked.adminOnly")}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="kpi-label">{t("retention.policy")}</span>
            <select
              className={selectClass}
              value={retention.policyId}
              disabled={!admin}
              onChange={(e) => {
                // Load EVERY field of the chosen policy — or a clean proposal for
                // "create new" — never a mix with the previously shown policy.
                setRetention(retentionFormOf(view.retention.policies.find((x) => x.id === e.target.value)));
              }}
            >
              <option value="">{t("retention.createNew")}</option>
              {view.retention.policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {t.has(`retention.states.${p.approvalState}`) ? t(`retention.states.${p.approvalState}`) : p.approvalState}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="kpi-label">{t("retention.days")}</span>
            <Input dir="ltr" inputMode="numeric" value={retention.retentionDays} disabled={!admin} onChange={(e) => setRetention({ ...retention, retentionDays: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="kpi-label">{t("retention.trigger")}</span>
            <select
              className={selectClass}
              value={retention.retentionTrigger}
              disabled={!admin}
              onChange={(e) => setRetention({ ...retention, retentionTrigger: e.target.value === "LAST_ACTIVITY" ? "LAST_ACTIVITY" : "CREATION" })}
            >
              {RETENTION_TRIGGERS.map((tr) => (
                <option key={tr} value={tr}>
                  {t(`retention.triggers.${tr}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="kpi-label">{t("retention.approval")}</span>
            <select
              className={selectClass}
              value={approver ? retention.approvalState : "PENDING_REVIEW"}
              disabled={!admin || !approver}
              onChange={(e) => setRetention({ ...retention, approvalState: e.target.value as (typeof RETENTION_APPROVAL_STATES)[number] })}
            >
              {RETENTION_APPROVAL_STATES.map((s) => (
                <option key={s} value={s}>
                  {t(`retention.states.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="kpi-label">{t("retention.effectiveFrom")}</span>
            <Input dir="ltr" type="date" value={retention.effectiveFrom} disabled={!admin} onChange={(e) => setRetention({ ...retention, effectiveFrom: e.target.value })} />
          </label>
          <div className="flex items-end">
            <ToggleRow
              label={t("retention.enabled")}
              checked={approver ? retention.enabled : false}
              disabled={!admin || !approver}
              onChange={(v) => setRetention({ ...retention, enabled: v })}
            />
          </div>
        </div>
        <LockedRow label={t("retention.action")} value={t("retention.anonymiseOnly")} />
        {admin && !approver ? <p className="text-xs text-amber-200">{t("retention.approverOnly")}</p> : null}
        <p className="text-xs text-muted">{t("retention.executionNote")}</p>
        <div>
          <Button
            size="sm"
            disabled={!admin}
            title={adminHint}
            onClick={() =>
              setConfirm({
                title: t("retention.title"),
                message: t("confirmRetention"),
                confirmLabel: t("confirmSave"),
                reasonRequired: true,
                onConfirm: async (reason) => {
                  const res = await atsMutate<{ policyId: string }>("/api/ats/settings/retention", "PUT", {
                    policyId: retention.policyId || null,
                    retentionDays: Number(retention.retentionDays),
                    retentionTrigger: retention.retentionTrigger,
                    // Without manage_retention only a PROPOSAL can be saved.
                    approvalState: approver ? retention.approvalState : "PENDING_REVIEW",
                    enabled: approver ? retention.enabled : false,
                    effectiveFrom: retention.effectiveFrom ? new Date(`${retention.effectiveFrom}T00:00:00Z`).toISOString() : null,
                    expectedVersion: view.settings.version,
                    reason,
                  });
                  if (res.ok) {
                    push({ kind: "success", message: t("saved"), correlationId: res.correlationId });
                    reload();
                    return true;
                  }
                  push({ kind: "error", message: refusal(res), correlationId: res.correlationId });
                  return false;
                },
              })
            }
          >
            {t("save")}
          </Button>
        </div>
      </Card>

      {/* 4. Notifications */}
      <Card title={t("notifications.title")} description={t("notifications.description")}>
        <ToggleRow label={t("notifications.review")} checked={notif.reviewAlertsEnabled} disabled={!view.viewer.canManage} onChange={(v) => setNotif({ ...notif, reviewAlertsEnabled: v })} />
        <ToggleRow label={t("notifications.interview")} checked={notif.interviewRemindersEnabled} disabled={!view.viewer.canManage} onChange={(v) => setNotif({ ...notif, interviewRemindersEnabled: v })} />
        <ToggleRow label={t("notifications.sla")} checked={notif.slaBreachAlertsEnabled} disabled={!view.viewer.canManage} onChange={(v) => setNotif({ ...notif, slaBreachAlertsEnabled: v })} />
        <p className="text-xs text-muted">{t("notifications.deliveryNote")}</p>
        <div>
          <Button size="sm" disabled={!view.viewer.canManage} onClick={() => save("notifications", notif)}>
            {t("save")}
          </Button>
        </div>
      </Card>

      {/* 5. Public careers */}
      <Card title={t("careers.title")} description={t("careers.description")} locked={admin ? undefined : t("locked.adminOnly")}>
        <ToggleRow label={t("careers.listing")} hint={t("careers.listingHint")} checked={careers.publicListingEnabled} disabled={!admin} onChange={(v) => setCareers({ ...careers, publicListingEnabled: v })} />
        <ToggleRow label={t("careers.intake")} hint={t("careers.intakeHint")} checked={careers.applicationIntakeEnabled} disabled={!admin} onChange={(v) => setCareers({ ...careers, applicationIntakeEnabled: v })} />
        <label className="flex flex-col gap-1 md:w-1/2">
          <span className="kpi-label">{t("careers.locale")}</span>
          <select
            className={selectClass}
            value={careers.defaultPublicLocale}
            disabled={!admin}
            onChange={(e) => setCareers({ ...careers, defaultPublicLocale: e.target.value as "en" | "fa" | "de" })}
          >
            {(["fa", "en", "de"] as const).map((l) => (
              <option key={l} value={l}>
                {tf(`copy.locale.${l}`)}
              </option>
            ))}
          </select>
        </label>
        <div>
          <Button size="sm" disabled={!admin} title={adminHint} onClick={() => saveWithReason("publicCareers", careers, t("careers.title"), t("confirmCareers"))}>
            {t("save")}
          </Button>
        </div>
      </Card>

      {/* 6. Security */}
      <Card title={t("security.title")} description={t("security.description")}>
        {view.security ? (
          <>
            <ul className="flex flex-col gap-2">
              {view.security.items.map((i) => (
                <li key={i.name} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                  <span className="font-mono text-xs text-ink" dir="ltr">
                    {i.name}
                  </span>
                  <span className={`hs-badge ${i.state === "CONFIGURED" || i.state === "DISABLED" ? "hs--reasoning" : "hs--warning"}`}>{t(`security.states.${i.state}`)}</span>
                </li>
              ))}
            </ul>
            <LockedRow
              label={t("security.acceptance")}
              value={view.security.applicationAcceptanceAuthorized ? t("security.states.ENABLED") : t("security.states.DISABLED")}
            />
            <p className="text-xs text-muted">{t("security.never")}</p>
          </>
        ) : (
          <p className="text-sm text-muted">{t("security.restricted")}</p>
        )}
      </Card>

      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
