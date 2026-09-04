"use client";

import { useState, useRef, useEffect, useMemo, useTransition } from "react";
import { useRouter }  from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { WorkflowDefinitionFull, WorkflowTemplate } from "@/lib/automation/types";
import { redactActionConfig } from "@/lib/automation/redaction";
import {
  TRIGGER_TYPES, CONDITION_TYPES, ACTION_TYPES,
  MAX_CONDITIONS, MAX_ACTIONS,
} from "@/lib/automation/validation";
import {
  Badge, Button, Card, FormField, IconButton, Input, StatusIndicator,
  TechnicalValue, Textarea, cn,
} from "@/components/ds";

type Step = 1 | 2 | 3 | 4 | 5;

const STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;

const STEP_KEYS: Record<Step, string> = {
  1: "stepBasics", 2: "stepTrigger", 3: "stepConditions", 4: "stepActions", 5: "stepReview",
};
const STEP_IDS: Record<Step, string> = {
  1: "identity", 2: "trigger", 3: "conditions", 4: "actions", 5: "review",
};
const STEPS: Step[] = [1, 2, 3, 4, 5];

/** Condition types whose evaluation reads a named context field. */
const NEEDS_FIELD = new Set(["FIELD_EQUALS", "FIELD_NOT_EQUALS", "FIELD_GREATER_THAN", "FIELD_LESS_THAN"]);

/**
 * The config keys each action type actually consumes, taken from the engine's
 * ACTION_PREVIEWS map. Editing is offered for exactly these, so the builder
 * never invites free-form JSON into a plaintext Json column. SEND_WEBHOOK
 * reads no config and makes no outbound call, so it exposes no fields.
 */
const ACTION_CONFIG_FIELDS: Record<string, readonly string[]> = {
  CREATE_NOTIFICATION:      ["message"],
  CREATE_TASK:              ["title"],
  CREATE_SUPPORT_TICKET:    ["title", "priority"],
  CREATE_CRM_ACTIVITY:      ["activityType"],
  UPDATE_RECORD_STATUS:     ["status"],
  ASSIGN_OWNER:             ["strategy"],
  CREATE_AUDIT_LOG:         ["event", "severity"],
  SEND_WEBHOOK:             [],
  CREATE_KNOWLEDGE_NOTE:    ["title"],
  CREATE_MAINTENANCE_ALERT: ["message", "priority"],
};

type ConditionDraft = { type: string; field: string; value: string };
type ActionDraft    = { type: string; config: Record<string, unknown> };

/** Select styled from the same tokens as the design-system Input. */
const SELECT_CLASS =
  // 44px finger target below md. The md override is important because `cn`
  // does not resolve Tailwind conflicts and utility source order is not fixed.
  "w-full h-11 md:!h-9 rounded-sm bg-surface-interactive ps-3 pe-9 text-body text-text-primary " +
  "border border-border-default hover:border-border-active transition-colors duration-fast " +
  "ds-focus appearance-none disabled:opacity-40";

function BuilderSelect({
  id, value, onChange, children, describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  describedBy?: string;
}) {
  return (
    <span className="relative block">
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-describedby={describedBy}
        className={SELECT_CLASS}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-text-muted text-label-compact"
      >
        ▾
      </span>
    </span>
  );
}

function toConditionDrafts(src: Array<{ type: string; field?: string | null; value?: string | null }>): ConditionDraft[] {
  return src.map(c => ({ type: c.type, field: c.field ?? "", value: c.value ?? "" }));
}

function toActionDrafts(src: Array<{ type: string; order: number; config: Record<string, unknown> }>): ActionDraft[] {
  return [...src].sort((a, b) => a.order - b.order).map(a => ({ type: a.type, config: { ...a.config } }));
}

/** Stored keys this action type has no editor for; shown, never silently dropped. */
function extraConfigKeys(a: ActionDraft): string[] {
  const known = new Set(ACTION_CONFIG_FIELDS[a.type] ?? []);
  return Object.keys(a.config).filter(k => !known.has(k));
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 44px finger target on mobile, tightened to the desktop rhythm from md up.
 * The md override is marked important because  does not resolve Tailwind
 * conflicts and the emitted source order of h-9/h-11 is not guaranteed.
 */
const TOUCH = "md:!h-9 md:!w-9";

/** Section "Add …" buttons: 44px finger target below md, compact on desktop. */
const ADD_TOUCH = "!h-11 md:!h-8";

/** Section heading inside the builder workspace. */
function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-role-h4 font-semibold text-text-primary">{title}</h2>
        {action}
      </div>
      {hint ? <p className="mt-1 text-caption text-text-muted">{hint}</p> : null}
    </div>
  );
}

/** One row of the contextual summary rail. */
function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-border-subtle last:border-b-0">
      <dt className="text-label-compact text-text-muted shrink-0">{label}</dt>
      <dd className="text-label text-text-primary min-w-0 text-end break-words">{children}</dd>
    </div>
  );
}

export function WorkflowBuilderClient({
  initial,
  template,
  title,
}: {
  initial?:  WorkflowDefinitionFull | null;
  template?: WorkflowTemplate | null;
  /** Page identity resolved on the server so the heading stays server-rendered. */
  title:     string;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t      = useTranslations("automationOperations");
  const [pending, startTransition] = useTransition();

  const isEdit = Boolean(initial);

  /**
   * Creation seeds from the template the operator arrived with — including its
   * conditions and ordered actions, which the create contract now persists.
   */
  const seed = useMemo(() => ({
    name:        initial?.name        ?? template?.name        ?? "",
    description: initial?.description ?? template?.description ?? "",
    status:      initial?.status      ?? "DRAFT",
    triggerType: initial?.triggerType ?? template?.triggerType ?? "MANUAL",
    conditions:  initial
      ? toConditionDrafts(initial.conditions)
      : toConditionDrafts(template?.definition.conditions ?? []),
    actions: initial
      ? toActionDrafts(initial.actions)
      : toActionDrafts(template?.definition.actions ?? []),
  }), [initial, template]);

  const [step,        setStep]        = useState<Step>(1);
  const [name,        setName]        = useState(seed.name);
  const [description, setDescription] = useState(seed.description);
  const [status,      setStatus]      = useState<string>(seed.status);
  const [triggerType, setTriggerType] = useState<string>(seed.triggerType);
  const [conditions,  setConditions]  = useState<ConditionDraft[]>(seed.conditions);
  const [actions,     setActions]     = useState<ActionDraft[]>(seed.actions);
  const [error,       setError]       = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [saved,       setSaved]       = useState(false);

  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [step]);

  // ── Condition editing ──────────────────────────────────────────────────────
  const addCondition = () =>
    setConditions(p => p.length >= MAX_CONDITIONS ? p : [...p, { type: "ALWAYS", field: "", value: "" }]);
  const removeCondition = (i: number) => setConditions(p => p.filter((_, x) => x !== i));
  const updateCondition = (i: number, patch: Partial<ConditionDraft>) =>
    setConditions(p => p.map((c, x) => x === i ? { ...c, ...patch } : c));

  // ── Action editing ─────────────────────────────────────────────────────────
  const addAction = () =>
    setActions(p => p.length >= MAX_ACTIONS ? p : [...p, { type: "CREATE_NOTIFICATION", config: {} }]);
  const removeAction = (i: number) => setActions(p => p.filter((_, x) => x !== i));
  const setActionType = (i: number, type: string) =>
    setActions(p => p.map((a, x) => x === i ? { ...a, type } : a));
  const setActionConfig = (i: number, key: string, value: string) =>
    setActions(p => p.map((a, x) => {
      if (x !== i) return a;
      const config = { ...a.config };
      if (value === "") delete config[key]; else config[key] = value;
      return { ...a, config };
    }));
  /** Execution order is array position, so reordering is a swap. */
  const moveAction = (i: number, delta: number) =>
    setActions(p => {
      const j = i + delta;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const nameError     = name.trim().length === 0 ? t("builder.errNameRequired") : "";
  const showNameError = nameTouched && nameError.length > 0;
  const isValid       = nameError.length === 0;

  const dirty =
    name.trim()        !== seed.name.trim() ||
    description.trim() !== (seed.description ?? "").trim() ||
    status             !== seed.status ||
    triggerType        !== seed.triggerType ||
    JSON.stringify(conditions) !== JSON.stringify(seed.conditions) ||
    JSON.stringify(actions)    !== JSON.stringify(seed.actions);

  const canSave = isValid && dirty && !pending;

  const conditionsPayload = () => conditions.map(c => ({
    type:  c.type,
    field: NEEDS_FIELD.has(c.type) && c.field.trim() ? c.field.trim() : null,
    value: c.type === "ALWAYS" || !c.value.trim() ? null : c.value.trim(),
  }));

  const actionsPayload = () => actions.map(a => ({ type: a.type, config: a.config }));

  const handleSave = () => {
    setNameTouched(true);
    if (!isValid) { setStep(1); return; }
    if (!canSave) return;
    setError("");

    const url    = isEdit ? `/api/automation/workflows/${initial!.id}` : "/api/automation/workflows";
    const method = isEdit ? "PATCH" : "POST";
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      triggerType,
      conditions: conditionsPayload(),
      actions: actionsPayload(),
      ...(isEdit ? { status } : {}),
      ...(!isEdit && template ? { templateId: template.id } : {}),
    };

    startTransition(async () => {
      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { setError(t("builder.errSaveFailed")); return; }
        setSaved(true);
        router.push(`/${locale}/automation/workflows`);
        router.refresh();
      } catch {
        setError(t("builder.errNetwork"));
      }
    });
  };

  const panelProps = (s: Step) => ({
    id: `builder-panel-${STEP_IDS[s]}`,
    role: "tabpanel" as const,
    "aria-labelledby": `builder-tab-${STEP_IDS[s]}`,
  });

  return (
    <div className="space-y-5">
      {/* ── Level 1 · page identity ─────────────────────────────────────────── */}
      <Card variant="elevated" padded={false}>
        <header className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="text-label-compact font-semibold uppercase tracking-[0.14em] text-text-muted">
                {t("builder.eyebrow")}
              </p>
              <h1 className="mt-1.5 text-role-h3 font-semibold text-text-primary break-words">{title}</h1>
              <p className="mt-1.5 max-w-2xl text-body-compact text-text-secondary">
                {isEdit ? t("builder.subtitleEdit") : t("builder.subtitleNew")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isEdit ? (
                <Badge variant={status === "ACTIVE" ? "success" : "neutral"}>
                  {t(`builder.statusOptions.${status}`)}
                </Badge>
              ) : (
                <Badge variant="neutral">{t("builder.statusOptions.DRAFT")}</Badge>
              )}
              {template && !isEdit ? (
                <Badge variant="brand">{template.name}</Badge>
              ) : null}
              <StatusIndicator
                status={dirty ? "warning" : "neutral"}
                label={dirty ? t("builder.unsavedChanges") : t("builder.noChanges")}
              />
            </div>
          </div>
        </header>

        {/* ── Level 2 · workflow progression rail ───────────────────────────── */}
        <div className="border-t border-border-subtle px-2 sm:px-3">
          <div role="tablist" className="flex items-stretch gap-0">
            {STEPS.map(s => {
              const isCurrent   = step === s;
              const isCompleted = s < step;
              // Mobile keeps only the previous / current / next stage, so the
              // rail never needs horizontal scrolling to operate.
              const nearCurrent = Math.abs(s - step) <= 1;
              return (
                <button
                  key={s}
                  ref={isCurrent ? activeTabRef : null}
                  id={`builder-tab-${STEP_IDS[s]}`}
                  role="tab"
                  aria-selected={isCurrent}
                  aria-controls={`builder-panel-${STEP_IDS[s]}`}
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => setStep(s)}
                  className={cn(
                    "group min-w-0 flex-1 border-t-2 px-2 py-3 text-start transition-colors duration-fast ds-focus sm:px-3",
                    nearCurrent ? "block" : "hidden md:block",
                    isCurrent
                      ? "border-t-brand-primary bg-brand-subtle"
                      : isCompleted
                        ? "border-t-brand-border hover:border-t-brand-primary"
                        : "border-t-border-subtle hover:border-t-border-active",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {/* Rendered only when complete: a transparent glyph would still
                        land in every tab's accessible name. */}
                    {isCompleted ? (
                      <span aria-hidden="true" className="text-label-compact leading-none text-brand-primary">
                        ✓
                      </span>
                    ) : null}
                    <TechnicalValue
                      className={cn(
                        "text-label-compact",
                        isCurrent ? "text-brand-primary" : isCompleted ? "text-text-secondary" : "text-text-muted",
                      )}
                    >
                      {pad(s)}
                    </TechnicalValue>
                  </span>
                  <span
                    className={cn(
                      "mt-1 block truncate text-label",
                      isCurrent
                        ? "font-semibold text-text-primary"
                        : isCompleted
                          ? "font-medium text-text-secondary"
                          : "font-medium text-text-muted",
                    )}
                  >
                    {t(`builder.${STEP_KEYS[s]}`)}
                  </span>
                  {isCompleted ? <span className="sr-only">{t("builder.stageCompleted")}</span> : null}
                </button>
              );
            })}
          </div>
          <p className="pb-2 pt-0.5 ps-2 text-label-compact text-text-muted md:hidden">
            {t("builder.stepProgress", { current: pad(step), total: pad(STEPS.length) })}
          </p>
        </div>
      </Card>

      {/* ── Level 3 · builder workspace + contextual summary ────────────────── */}
      {/*
        The automation shell already spends 208px on its own nav, so a fixed
        20rem rail would take 42% of the remaining width at 1024. The rail is
        sized per breakpoint instead, holding the intended ~70/30 split at both
        1024 and 1440.
      */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-start lg:gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card variant="standard" padded={false} className="min-w-0">
          <div className="p-5 sm:p-6">
            {/* 01 — Identity */}
            {step === 1 && (
              <div {...panelProps(1)} className="space-y-5">
                <SectionHead title={t("builder.stepBasics")} />
                {/* The catalogued label already carries the required marker. */}
                <FormField
                  id="wf-name"
                  label={t("builder.nameLabel")}
                  description={showNameError ? undefined : t("builder.nameHint")}
                  error={showNameError ? nameError : undefined}
                >
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onBlur={() => setNameTouched(true)}
                    placeholder={t("builder.namePlaceholder")}
                    maxLength={120}
                    error={showNameError}
                  />
                </FormField>

                <FormField
                  id="wf-description"
                  label={t("builder.descriptionLabel")}
                  description={t("builder.descriptionHint")}
                >
                  <Textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    maxLength={500}
                  />
                </FormField>

                {isEdit && (
                  <FormField
                    id="wf-status"
                    label={t("builder.statusLabel")}
                    description={t("builder.statusHint")}
                  >
                    <BuilderSelect id="wf-status" value={status} onChange={setStatus}>
                      {STATUSES.map(s => (
                        <option key={s} value={s}>{t(`builder.statusOptions.${s}`)}</option>
                      ))}
                    </BuilderSelect>
                  </FormField>
                )}
              </div>
            )}

            {/* 02 — Trigger */}
            {step === 2 && (
              <div {...panelProps(2)} className="space-y-4">
                <SectionHead title={t("builder.stepTrigger")} hint={t("builder.triggerHint")} />
                <FormField id="wf-trigger" label={t("builder.triggerLabel")}>
                  <BuilderSelect
                    id="wf-trigger"
                    value={triggerType}
                    onChange={setTriggerType}
                    describedBy="wf-trigger-desc"
                  >
                    {TRIGGER_TYPES.map(v => (
                      <option key={v} value={v}>{t(`builder.triggerOptions.${v}`)}</option>
                    ))}
                  </BuilderSelect>
                </FormField>

                <div
                  id="wf-trigger-desc"
                  className="rounded-sm border border-border-subtle bg-surface-interactive px-4 py-3"
                >
                  <p className="text-body-compact text-text-secondary">
                    {t(`builder.triggerDesc.${triggerType}`)}
                  </p>
                  <TechnicalValue className="mt-2 block text-label-compact text-text-muted">
                    {triggerType}
                  </TechnicalValue>
                </div>
              </div>
            )}

            {/* 03 — Conditions */}
            {step === 3 && (
              <div {...panelProps(3)}>
                <SectionHead
                  title={t("builder.conditions")}
                  hint={t("builder.conditionsHint")}
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={addCondition}
                      disabled={conditions.length >= MAX_CONDITIONS}
                      className={ADD_TOUCH}
                    >
                      {t("builder.addCondition")}
                    </Button>
                  }
                />
                {conditions.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-border-subtle px-4 py-6 text-center text-body-compact text-text-muted">
                    {t("builder.noConditions")}
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {conditions.map((c, i) => (
                      <li key={i}>
                        <Card variant="soft" padded={false}>
                          <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
                            <span className="ds-code text-label-compact text-text-muted shrink-0">{pad(i + 1)}</span>
                            <div className="min-w-0 flex-1">
                              <label className="sr-only" htmlFor={`cond-type-${i}`}>
                                {t("builder.conditionTypeLabel")}
                              </label>
                              <BuilderSelect
                                id={`cond-type-${i}`}
                                value={c.type}
                                onChange={v => updateCondition(i, { type: v })}
                              >
                                {CONDITION_TYPES.map(ct => (
                                  <option key={ct} value={ct}>{t(`builder.conditionTypeOptions.${ct}`)}</option>
                                ))}
                              </BuilderSelect>
                            </div>
                            <IconButton
                              variant="tertiary"
                              size="lg"
                              aria-label={t("builder.removeCondition", { position: i + 1 })}
                              onClick={() => removeCondition(i)}
                              icon={<span aria-hidden="true">✕</span>}
                              className={cn(TOUCH, "text-status-danger hover:bg-status-danger-subtle hover:text-status-danger")}
                            />
                          </div>

                          {(NEEDS_FIELD.has(c.type) || c.type !== "ALWAYS") && (
                            <div className={cn("grid gap-3 px-4 py-3", NEEDS_FIELD.has(c.type) && "sm:grid-cols-2")}>
                              {NEEDS_FIELD.has(c.type) && (
                                <FormField id={`cond-field-${i}`} label={t("builder.fieldLabel")}>
                                  <Input
                                    value={c.field}
                                    onChange={e => updateCondition(i, { field: e.target.value })}
                                    placeholder={t("builder.fieldPlaceholder")}
                                    maxLength={120}
                                  />
                                </FormField>
                              )}
                              {c.type !== "ALWAYS" && (
                                <FormField id={`cond-value-${i}`} label={t("builder.valueLabel")}>
                                  <Input
                                    value={c.value}
                                    onChange={e => updateCondition(i, { value: e.target.value })}
                                    placeholder={t("builder.valuePlaceholder")}
                                    maxLength={500}
                                  />
                                </FormField>
                              )}
                            </div>
                          )}
                        </Card>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {/* 04 — Actions */}
            {step === 4 && (
              <div {...panelProps(4)}>
                <SectionHead
                  title={t("builder.actions")}
                  hint={t("builder.actionsHint")}
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={addAction}
                      disabled={actions.length >= MAX_ACTIONS}
                      className={ADD_TOUCH}
                    >
                      {t("builder.addAction")}
                    </Button>
                  }
                />
                {actions.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-border-subtle px-4 py-6 text-center text-body-compact text-text-muted">
                    {t("builder.noActions")}
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {actions.map((a, i) => {
                      const fields = ACTION_CONFIG_FIELDS[a.type] ?? [];
                      const extras = extraConfigKeys(a);
                      const safeExtras = redactActionConfig(
                        Object.fromEntries(extras.map(k => [k, a.config[k]])),
                      );
                      return (
                        <li key={i}>
                          <Card variant="soft" padded={false}>
                            <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2.5 sm:px-4">
                              <span className="ds-code flex h-7 w-7 shrink-0 items-center justify-center rounded-xs border border-brand-border bg-brand-subtle text-label-compact font-semibold text-brand-primary">
                                {pad(i + 1)}
                              </span>
                              <div className="min-w-0 flex-1 basis-48">
                                <label className="sr-only" htmlFor={`act-type-${i}`}>
                                  {t("builder.actionTypeLabel")}
                                </label>
                                <BuilderSelect
                                  id={`act-type-${i}`}
                                  value={a.type}
                                  onChange={v => setActionType(i, v)}
                                >
                                  {ACTION_TYPES.map(at => (
                                    <option key={at} value={at}>{t(`builder.actionLabels.${at}`)}</option>
                                  ))}
                                </BuilderSelect>
                              </div>
                              <div className="flex shrink-0 items-center gap-0.5 ms-auto">
                                <IconButton
                                  variant="tertiary"
                                  size="lg"
                                  aria-label={t("builder.moveActionUp", { position: i + 1 })}
                                  disabled={i === 0}
                                  onClick={() => moveAction(i, -1)}
                                  icon={<span aria-hidden="true">↑</span>}
                                  className={TOUCH}
                                />
                                <IconButton
                                  variant="tertiary"
                                  size="lg"
                                  aria-label={t("builder.moveActionDown", { position: i + 1 })}
                                  disabled={i === actions.length - 1}
                                  onClick={() => moveAction(i, 1)}
                                  icon={<span aria-hidden="true">↓</span>}
                                  className={TOUCH}
                                />
                                <IconButton
                                  variant="tertiary"
                                  size="lg"
                                  aria-label={t("builder.removeAction", { position: i + 1 })}
                                  onClick={() => removeAction(i)}
                                  icon={<span aria-hidden="true">✕</span>}
                                  className={cn(TOUCH, "text-status-danger hover:bg-status-danger-subtle hover:text-status-danger")}
                                />
                              </div>
                            </div>

                            {fields.length > 0 && (
                              <div className={cn("grid gap-3 px-3 py-3 sm:px-4", fields.length > 1 && "sm:grid-cols-2")}>
                                {fields.map(key => (
                                  <FormField
                                    key={key}
                                    id={`act-${i}-${key}`}
                                    label={t(`builder.configLabels.${key}`)}
                                  >
                                    <Input
                                      value={String(a.config[key] ?? "")}
                                      onChange={e => setActionConfig(i, key, e.target.value)}
                                      maxLength={2000}
                                    />
                                  </FormField>
                                ))}
                              </div>
                            )}

                            {extras.length > 0 && (
                              <div className="border-t border-border-subtle px-3 py-3 sm:px-4">
                                <p className="text-caption text-text-muted">{t("builder.extraConfigNote")}</p>
                                <dl className="mt-2 space-y-1">
                                  {Object.entries(safeExtras).map(([k, v]) => (
                                    <div key={k} className="flex gap-3 text-caption">
                                      <dt className="shrink-0 text-text-muted">
                                        <TechnicalValue>{k}</TechnicalValue>
                                      </dt>
                                      <dd className="min-w-0 break-words text-text-secondary">
                                        {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              </div>
                            )}
                          </Card>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}

            {/* 05 — Review · engineering preflight */}
            {step === 5 && (
              <div {...panelProps(5)} className="space-y-5">
                <SectionHead title={t("builder.review")} />

                <dl className="rounded-sm border border-border-subtle">
                  <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle px-4 py-2.5">
                    <dt className="text-label-compact text-text-muted">{t("builder.reviewName")}</dt>
                    <dd className="min-w-0 break-words text-end text-label font-medium text-text-primary">
                      {name.trim() || "—"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle px-4 py-2.5">
                    <dt className="text-label-compact text-text-muted">{t("builder.reviewTrigger")}</dt>
                    <dd className="min-w-0 text-end">
                      <span className="block text-label text-text-primary">
                        {t(`builder.triggerOptions.${triggerType}`)}
                      </span>
                      <TechnicalValue className="block text-caption text-text-muted">{triggerType}</TechnicalValue>
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle px-4 py-2.5">
                    <dt className="text-label-compact text-text-muted">{t("builder.reviewConditions")}</dt>
                    <dd className="ds-code text-label text-text-primary">{conditions.length}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <dt className="text-label-compact text-text-muted">{t("builder.reviewActions")}</dt>
                    <dd className="ds-code text-label text-text-primary">{actions.length}</dd>
                  </div>
                </dl>

                <div
                  data-testid="readiness"
                  className={cn(
                    "rounded-sm border px-4 py-3",
                    isValid
                      ? "border-status-success-border bg-status-success-subtle"
                      : "border-status-danger-border bg-status-danger-subtle",
                  )}
                >
                  <p className="text-label font-semibold text-text-primary">{t("builder.readinessTitle")}</p>
                  <StatusIndicator
                    className="mt-1.5"
                    status={isValid ? "success" : "danger"}
                    label={isValid ? t("builder.readyToSave") : t("builder.notReady")}
                  />
                  {!isValid ? (
                    <p className="mt-1.5 text-caption text-text-secondary">
                      {t("builder.validationNextAction")}
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-caption text-text-muted">
                    {dirty ? t("builder.unsavedChanges") : t("builder.noChanges")}
                  </p>
                </div>

                {error && (
                  <p role="alert" className="rounded-sm border border-status-danger-border bg-status-danger-subtle px-4 py-3 text-body-compact text-status-danger">
                    {error}
                  </p>
                )}
                {saved && !error && (
                  <p role="status" className="rounded-sm border border-status-success-border bg-status-success-subtle px-4 py-3 text-body-compact text-status-success">
                    {t("builder.saved")}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Workspace action rail — the closing row of the builder card, so the
              actions read as part of the workspace rather than floating under it.
              Mobile keeps the compact sticky bar. */}
          <div className="sticky bottom-0 z-10 border-t border-border-default bg-surface-primary/95 px-5 py-3 backdrop-blur-sm sm:px-6 md:static md:bg-transparent md:backdrop-blur-none">
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setStep(prev => Math.max(1, prev - 1) as Step)}
                disabled={step === 1}
              >
                {t("builder.back")}
              </Button>
              {step < 5 ? (
                <Button variant="primary" size="lg" onClick={() => setStep(prev => (prev + 1) as Step)}>
                  {t("builder.next")}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleSave}
                  disabled={!canSave}
                  loading={pending}
                >
                  {isEdit ? t("builder.saveChanges") : t("builder.createWorkflow")}
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Contextual summary — quiet, secondary, never decorative. */}
        <aside data-testid="summary-rail" className="mt-5 lg:sticky lg:top-5 lg:mt-0">
          <Card variant="soft" padded={false}>
            <div className="px-4 py-3 border-b border-border-subtle">
              <h2 className="text-label font-semibold text-text-primary">{t("builder.summaryTitle")}</h2>
            </div>
            <dl className="px-4 py-1">
              {/* The raw enum lives in step 02 and in Review; repeating it here only
                  forces a mid-token break in the narrow rail. */}
              <SummaryRow label={t("builder.reviewTrigger")}>
                {t(`builder.triggerOptions.${triggerType}`)}
              </SummaryRow>
              <SummaryRow label={t("builder.reviewConditions")}>
                <span className="ds-code">{conditions.length}</span>
              </SummaryRow>
              <SummaryRow label={t("builder.reviewActions")}>
                <span className="ds-code">{actions.length}</span>
              </SummaryRow>
              <SummaryRow label={t("builder.statusLabel")}>
                {t(`builder.statusOptions.${isEdit ? status : "DRAFT"}`)}
              </SummaryRow>
              {template && !isEdit ? (
                <SummaryRow label={t("workflowDetail.template")}>
                  <TechnicalValue>{template.id}</TechnicalValue>
                </SummaryRow>
              ) : null}
              {isEdit && initial?.templateId ? (
                <SummaryRow label={t("workflowDetail.template")}>
                  <TechnicalValue>{initial.templateId}</TechnicalValue>
                </SummaryRow>
              ) : null}
            </dl>
            <div className="border-t border-border-subtle px-4 py-3">
              <StatusIndicator
                status={isValid ? (dirty ? "warning" : "success") : "danger"}
                label={isValid ? (dirty ? t("builder.unsavedChanges") : t("builder.noChanges")) : t("builder.notReady")}
              />
            </div>
          </Card>
        </aside>
      </div>

    </div>
  );
}
