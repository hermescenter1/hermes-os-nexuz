"use client";

import Link            from "next/link";
import { useState }    from "react";
import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import type {
  WorkflowDefinitionFull, WorkflowExecution, WorkflowAction,
} from "@/lib/automation/types";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { redactActionConfig } from "@/lib/automation/redaction";
import {
  Badge, Card, StatusIndicator, TechnicalValue, buttonVariants, cn,
  type BadgeVariant, type StatusKind,
} from "@/components/ds";

type Tab = "overview" | "conditions" | "actions" | "executions";

const TAB_IDS: Tab[] = ["overview", "conditions", "actions", "executions"];

/** Workflow lifecycle → badge treatment. The label always carries the meaning. */
const STATUS_BADGE: Record<string, BadgeVariant> = {
  ACTIVE: "success", PAUSED: "warning", DRAFT: "neutral", ARCHIVED: "danger",
};

/** Execution outcome → badge treatment, and the same mapping for status dots. */
const EXEC_BADGE: Record<string, BadgeVariant> = {
  SUCCESS: "success", FAILED: "danger", PARTIAL: "warning",
  CANCELLED: "neutral", RUNNING: "information", QUEUED: "information",
};
const EXEC_DOT: Record<string, StatusKind> = {
  SUCCESS: "success", FAILED: "danger", PARTIAL: "warning",
  CANCELLED: "neutral", RUNNING: "information", QUEUED: "information",
};

/**
 * Page actions reach the 44px finger target below md and return to desktop
 * density above it. The `md:!` override is important because `cn` does not
 * resolve Tailwind conflicts and utility source order is not fixed.
 */
const ACTION_TOUCH = "!h-11 md:!h-9";

/** Condition types whose evaluation reads a named context field. */
const NEEDS_FIELD = new Set(["FIELD_EQUALS", "FIELD_NOT_EQUALS", "FIELD_GREATER_THAN", "FIELD_LESS_THAN"]);

const em = "—";

/** One label/value row of a technical summary list. */
function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
      <dt className="text-label text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-body-compact text-text-primary">{children}</dd>
    </div>
  );
}

/** One reading of the operations summary: a label, a value, an optional code. */
function Tile({
  label, technical, children,
}: { label: string; technical?: string; children: ReactNode }) {
  return (
    <Card variant="soft" padded={false}>
      <div className="flex min-h-[4.5rem] flex-col justify-between gap-2 p-4">
        <p className="text-label-compact font-semibold uppercase tracking-[0.12em] text-text-muted">
          {label}
        </p>
        <div className="min-w-0">
          <div>{children}</div>
          {/*
            The identifier gets its own block so it starts on the reading edge of
            the surrounding direction, while the <bdi dir="ltr"> inside keeps its
            own characters left-to-right.
          */}
          {technical ? (
            <div className="mt-1">
              <TechnicalValue className="text-caption text-text-muted">{technical}</TechnicalValue>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** Section heading shared by every panel, matching the builder's section rhythm. */
function PanelHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <h2 className="text-role-h4 font-semibold text-text-primary">{title}</h2>
      {count !== undefined ? (
        <TechnicalValue className="text-label-compact text-text-muted">{count}</TechnicalValue>
      ) : null}
    </div>
  );
}

/** Redacted configuration rendered as engineering key/value rows. */
function ActionConfig({ action, t }: { action: WorkflowAction; t: ReturnType<typeof useTranslations> }) {
  // Redaction is applied by the shared helper — this surface only formats what
  // that helper already deemed safe to display.
  const redacted = redactActionConfig(action.config);
  const entries  = Object.entries(redacted);

  if (entries.length === 0) {
    return <p className="text-body-compact text-text-muted">{t("workflowDetail.noConfig")}</p>;
  }

  return (
    <div>
      <p className="mb-2 text-label-compact font-semibold uppercase tracking-[0.12em] text-text-muted">
        {t("workflowDetail.configTitle")}
      </p>
      <dl className="divide-y divide-border-subtle">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
            <dt className="text-label text-text-secondary">
              <TechnicalValue>{key}</TechnicalValue>
            </dt>
            <dd className="min-w-0 break-words text-body-compact text-text-primary">
              {typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? (
                <TechnicalValue>{String(value)}</TechnicalValue>
              ) : (
                <TechnicalValue>{JSON.stringify(value)}</TechnicalValue>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function WorkflowDetailClient({
  workflow,
  executions,
}: {
  workflow:   WorkflowDefinitionFull;
  executions: WorkflowExecution[];
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const locale        = useLocale();
  const t             = useTranslations("automationOperations");

  const TAB_LABELS: Record<Tab, string> = {
    overview:   t("workflowDetail.tabOverview"),
    conditions: t("workflowDetail.tabConditions", { count: workflow.conditions.length }),
    actions:    t("workflowDetail.tabActions",    { count: workflow.actions.length }),
    executions: t("workflowDetail.tabExecutions", { count: executions.length }),
  };

  // `getExecutions` returns newest first, so the head of the list is the run
  // that determines the workflow's current operational health.
  const lastExec  = executions[0];
  const sortedActions = [...workflow.actions].sort((a, b) => a.order - b.order);

  const panelProps = (id: Tab) => ({
    id:                `workflow-panel-${id}`,
    role:              "tabpanel" as const,
    "aria-labelledby": `workflow-tab-${id}`,
  });

  const execHref = (id: string) => `/${locale}/automation/executions/${id}`;

  return (
    <div className="space-y-5">
      {/* ── Level 1 · page identity ─────────────────────────────────────────── */}
      <Card variant="elevated" padded={false}>
        <header className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <p className="text-label-compact font-semibold uppercase tracking-[0.14em] text-text-muted">
                {t("workflowDetail.eyebrow")}
              </p>
              <h1 className="mt-1.5 text-role-h3 font-semibold text-text-primary break-words">
                {workflow.name}
              </h1>
              <p className="mt-1.5 max-w-2xl text-body-compact text-text-secondary">
                {workflow.description || t("workflowDetail.noDescription")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Badge variant={STATUS_BADGE[workflow.status] ?? "neutral"}>
                  {t(`builder.statusOptions.${workflow.status}`)}
                </Badge>
                <Badge variant="brand">{t(`triggerLabels.${workflow.triggerType}`)}</Badge>
                <StatusIndicator
                  status={lastExec ? EXEC_DOT[lastExec.status] ?? "neutral" : "neutral"}
                  pulse={lastExec?.status === "RUNNING"}
                  label={
                    lastExec
                      ? `${t("workflowDetail.lastExecutionLabel")}: ${lastExec.status}`
                      : t("workflowDetail.neverExecuted")
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/${locale}/automation/workflows/${workflow.id}/builder`}
                className={cn(buttonVariants("primary", "md"), ACTION_TOUCH)}
              >
                {t("workflowDetail.edit")}
              </Link>
              <Link
                href={`/${locale}/automation/workflows`}
                className={cn(buttonVariants("secondary", "md"), ACTION_TOUCH)}
              >
                {t("workflowDetail.back")}
              </Link>
            </div>
          </div>
        </header>

        {/* ── Level 2 · section rail ────────────────────────────────────────── */}
        {/*
          A 2x2 grid below md keeps all four sections reachable without a
          horizontally scrolling row; from md it relaxes into the same flat
          border-top rail the builder uses.
        */}
        <div className="border-t border-border-subtle px-2 sm:px-3">
          <div role="tablist" aria-label={t("workflowDetail.tabsLabel")} className="grid grid-cols-2 md:flex md:items-stretch">
            {TAB_IDS.map(id => {
              const isCurrent = tab === id;
              return (
                <button
                  key={id}
                  id={`workflow-tab-${id}`}
                  role="tab"
                  type="button"
                  aria-selected={isCurrent}
                  aria-controls={`workflow-panel-${id}`}
                  onClick={() => setTab(id)}
                  className={cn(
                    "min-h-[44px] min-w-0 border-b-2 px-2 py-3 text-start text-label transition-colors",
                    "duration-fast ds-focus md:flex-1 sm:px-3",
                    // The indicator underlines the active section rather than
                    // filling it: on a light surface a solid selected tab reads
                    // as a button, not as navigation.
                    isCurrent
                      ? "border-b-brand-primary bg-brand-subtle font-semibold text-text-primary"
                      : "border-b-transparent font-medium text-text-muted hover:border-b-border-active hover:text-text-secondary",
                  )}
                >
                  <span className="block truncate">{TAB_LABELS[id]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ── Level 3 · panel workspace + persistent identity rail ────────────── */}
      {/*
        The automation shell already spends its own column on nav, so at 1024 a
        third column would leave the executions table too narrow to hold a
        timestamp on one line. The rail therefore only splits off at xl; below
        that it follows the workspace and the table keeps its density.
      */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-5">
        <Card variant="standard" padded={false} className="min-w-0">
          <div className="p-5 sm:p-6">
            {/* Overview — operations summary */}
            {tab === "overview" && (
              <div {...panelProps("overview")}>
                <PanelHeading title={t("workflowDetail.overviewTitle")} />
                {/*
                  Operational readings sit side by side rather than stacked, so
                  the summary reads as an instrument panel and uses the width the
                  workspace actually has instead of leaving it empty.
                */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Tile label={t("workflowDetail.colStatus")}>
                    <Badge variant={STATUS_BADGE[workflow.status] ?? "neutral"}>
                      {t(`builder.statusOptions.${workflow.status}`)}
                    </Badge>
                  </Tile>
                  <Tile label={t("workflowDetail.trigger")} technical={workflow.triggerType}>
                    <span className="text-body font-semibold text-text-primary">
                      {t(`triggerLabels.${workflow.triggerType}`)}
                    </span>
                  </Tile>
                  <Tile label={t("builder.conditions")}>
                    {workflow.conditions.length === 0 ? (
                      <span className="text-body-compact text-text-secondary">
                        {t("workflowDetail.noConditions")}
                      </span>
                    ) : (
                      <TechnicalValue className="text-role-h4 font-semibold text-text-primary">
                        {workflow.conditions.length}
                      </TechnicalValue>
                    )}
                  </Tile>
                  <Tile label={t("builder.actions")}>
                    {workflow.actions.length === 0 ? (
                      <span className="text-body-compact text-text-secondary">
                        {t("workflowDetail.noActions")}
                      </span>
                    ) : (
                      <TechnicalValue className="text-role-h4 font-semibold text-text-primary">
                        {workflow.actions.length}
                      </TechnicalValue>
                    )}
                  </Tile>
                </div>

                <div className="mt-3">
                  <Tile label={t("workflowDetail.lastExecutionLabel")}>
                    {lastExec ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <Badge variant={EXEC_BADGE[lastExec.status] ?? "neutral"}>{lastExec.status}</Badge>
                        <TechnicalValue className="text-body-compact text-text-secondary">
                          {formatDateTime(lastExec.createdAt, locale)}
                        </TechnicalValue>
                        {lastExec.durationMs != null ? (
                          <TechnicalValue className="text-body-compact text-text-muted">
                            {`${lastExec.durationMs}ms`}
                          </TechnicalValue>
                        ) : null}
                        <Link
                          href={execHref(lastExec.id)}
                          aria-label={t("workflowDetail.viewExecution", { id: lastExec.id })}
                          className={cn(buttonVariants("secondary", "md"), ACTION_TOUCH, "ms-auto")}
                        >
                          {t("workflowDetail.view")}
                        </Link>
                      </div>
                    ) : (
                      <span className="text-body-compact text-text-secondary">
                        {t("workflowDetail.neverExecuted")}
                      </span>
                    )}
                  </Tile>
                </div>
              </div>
            )}

            {/* Conditions — read-only evaluation rules */}
            {tab === "conditions" && (
              <div {...panelProps("conditions")}>
                <PanelHeading title={t("workflowDetail.conditionsTitle")} count={workflow.conditions.length} />
                {workflow.conditions.length === 0 ? (
                  <p className="text-body-compact text-text-secondary">{t("workflowDetail.noConditions")}</p>
                ) : (
                  <ul className="space-y-3">
                    {workflow.conditions.map(c => (
                      <li key={c.id}>
                        <Card variant="soft" padded={false}>
                          <div className="p-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span className="text-body font-semibold text-text-primary">
                                {t(`builder.conditionTypeOptions.${c.type}`)}
                              </span>
                              <TechnicalValue className="text-caption text-text-muted">{c.type}</TechnicalValue>
                            </div>
                            {(c.field || c.operator || c.value) && (
                              <dl className="mt-3 divide-y divide-border-subtle">
                                {NEEDS_FIELD.has(c.type) && c.field ? (
                                  <SummaryRow label={t("workflowDetail.fieldLabel")}>
                                    <TechnicalValue>{c.field}</TechnicalValue>
                                  </SummaryRow>
                                ) : null}
                                {c.operator ? (
                                  <SummaryRow label={t("workflowDetail.operatorLabel")}>
                                    <TechnicalValue>{c.operator}</TechnicalValue>
                                  </SummaryRow>
                                ) : null}
                                {c.value ? (
                                  <SummaryRow label={t("workflowDetail.valueLabel")}>
                                    <TechnicalValue>{c.value}</TechnicalValue>
                                  </SummaryRow>
                                ) : null}
                              </dl>
                            )}
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Actions — read-only execution plan */}
            {tab === "actions" && (
              <div {...panelProps("actions")}>
                <PanelHeading title={t("workflowDetail.actionsTitle")} count={workflow.actions.length} />
                {sortedActions.length === 0 ? (
                  <p className="text-body-compact text-text-secondary">{t("workflowDetail.noActions")}</p>
                ) : (
                  <ol className="space-y-3">
                    {sortedActions.map(a => (
                      <li key={a.id}>
                        <Card variant="soft" padded={false}>
                          <div className="p-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span
                                aria-hidden="true"
                                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-xs border border-brand-border bg-brand-subtle"
                              >
                                <TechnicalValue className="text-label-compact font-semibold text-brand-primary">
                                  {a.order}
                                </TechnicalValue>
                              </span>
                              <span className="sr-only">{t("workflowDetail.stepLabel", { order: a.order })}</span>
                              <span className="text-body font-semibold text-text-primary">
                                {t(`builder.actionLabels.${a.type}`)}
                              </span>
                              <TechnicalValue className="text-caption text-text-muted">{a.type}</TechnicalValue>
                            </div>
                            <div className="mt-3">
                              <ActionConfig action={a} t={t} />
                            </div>
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {/* Executions — table from md, card list below it */}
            {tab === "executions" && (
              <div {...panelProps("executions")}>
                <PanelHeading title={t("workflowDetail.executionsTitle")} count={executions.length} />

                {executions.length === 0 ? (
                  <p className="text-body-compact text-text-secondary">{t("workflowDetail.empty")}</p>
                ) : (
                  <>
                    {/* Mobile — every column of the desktop table becomes a card
                        row, so nothing is clipped and every View stays reachable. */}
                    <ul data-testid="execution-cards" className="space-y-3 md:hidden">
                      {executions.map(e => (
                        <li key={e.id}>
                          <Card variant="soft" padded={false}>
                            <div className="p-4">
                              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                                <Badge variant={EXEC_BADGE[e.status] ?? "neutral"}>{e.status}</Badge>
                                <Badge variant="neutral">
                                  {e.isSimulation ? t("executionList.typeSimulation") : t("executionList.typeLive")}
                                </Badge>
                              </div>
                              <div className="mt-2">
                                <TechnicalValue className="text-caption text-text-muted">{e.id}</TechnicalValue>
                              </div>
                              <dl className="mt-2 divide-y divide-border-subtle">
                                <SummaryRow label={t("workflowDetail.colTriggeredBy")}>
                                  {e.triggeredBy ? <TechnicalValue>{e.triggeredBy}</TechnicalValue> : em}
                                </SummaryRow>
                                <SummaryRow label={t("workflowDetail.colDuration")}>
                                  {e.durationMs != null ? <TechnicalValue>{`${e.durationMs}ms`}</TechnicalValue> : em}
                                </SummaryRow>
                                <SummaryRow label={t("workflowDetail.colDate")}>
                                  <TechnicalValue>{formatDateTime(e.createdAt, locale)}</TechnicalValue>
                                </SummaryRow>
                              </dl>
                              <Link
                                href={execHref(e.id)}
                                aria-label={t("workflowDetail.viewExecution", { id: e.id })}
                                className={cn(buttonVariants("secondary", "lg", { fullWidth: true }), "mt-3")}
                              >
                                {t("workflowDetail.view")}
                              </Link>
                            </div>
                          </Card>
                        </li>
                      ))}
                    </ul>

                    {/* Desktop — the operational table, unchanged in data. */}
                    <div className="hidden overflow-hidden rounded-md border border-border-default md:block">
                      <table className="w-full text-body-compact">
                        <thead className="bg-surface-interactive">
                          <tr>
                            <th scope="col" className="px-4 py-2.5 text-start text-label font-semibold text-text-secondary">
                              {t("workflowDetail.colStatus")}
                            </th>
                            <th scope="col" className="px-4 py-2.5 text-start text-label font-semibold text-text-secondary">
                              {t("workflowDetail.colTriggeredBy")}
                            </th>
                            <th scope="col" className="px-4 py-2.5 text-start text-label font-semibold text-text-secondary">
                              {t("workflowDetail.colDuration")}
                            </th>
                            <th scope="col" className="px-4 py-2.5 text-start text-label font-semibold text-text-secondary">
                              {t("workflowDetail.colDate")}
                            </th>
                            <th scope="col" className="px-4 py-2.5">
                              <span className="sr-only">{t("workflowDetail.view")}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {executions.map(e => (
                            <tr key={e.id} className="transition-colors duration-fast hover:bg-surface-interactive">
                              <td className="px-4 py-2.5">
                                <Badge variant={EXEC_BADGE[e.status] ?? "neutral"}>{e.status}</Badge>
                              </td>
                              <td className="px-4 py-2.5 text-text-secondary">
                                {e.triggeredBy ? <TechnicalValue>{e.triggeredBy}</TechnicalValue> : em}
                              </td>
                              <td className="px-4 py-2.5">
                                {e.durationMs != null ? <TechnicalValue>{`${e.durationMs}ms`}</TechnicalValue> : em}
                              </td>
                              <td className="px-4 py-2.5 text-text-secondary">
                                <TechnicalValue>{formatDateTime(e.createdAt, locale)}</TechnicalValue>
                              </td>
                              <td className="px-4 py-2.5 text-end">
                                <Link
                                  href={execHref(e.id)}
                                  aria-label={t("workflowDetail.viewExecution", { id: e.id })}
                                  className={buttonVariants("tertiary", "sm")}
                                >
                                  {t("workflowDetail.view")}
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Persistent identity rail — page context that outlives the active tab. */}
        <aside data-testid="identity-rail" className="mt-5 xl:sticky xl:top-5 xl:mt-0">
          <Card variant="soft" padded={false}>
            <div className="p-5">
              <h2 className="text-label-compact font-semibold uppercase tracking-[0.14em] text-text-muted">
                {t("workflowDetail.identityTitle")}
              </h2>
              {/*
                Below xl the rail is a full-width strip under the workspace, so
                its readings run in columns; at xl it becomes the stacked list
                the sticky rail wants.
              */}
              <dl className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-1 xl:divide-y xl:divide-border-subtle">
                <SummaryRow label={t("workflowDetail.workflowIdLabel")}>
                  <TechnicalValue className="text-caption">{workflow.id}</TechnicalValue>
                </SummaryRow>
                <SummaryRow label={t("workflowDetail.created")}>
                  <TechnicalValue>{formatDate(workflow.createdAt, locale)}</TechnicalValue>
                </SummaryRow>
                <SummaryRow label={t("workflowDetail.updated")}>
                  <TechnicalValue>{formatDate(workflow.updatedAt, locale)}</TechnicalValue>
                </SummaryRow>
                {workflow.templateId ? (
                  <SummaryRow label={t("workflowDetail.template")}>
                    <Link
                      href={`/${locale}/automation/templates/${workflow.templateId}`}
                      className={buttonVariants("tertiary", "sm")}
                    >
                      <TechnicalValue className="text-caption">{workflow.templateId}</TechnicalValue>
                    </Link>
                  </SummaryRow>
                ) : null}
              </dl>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
