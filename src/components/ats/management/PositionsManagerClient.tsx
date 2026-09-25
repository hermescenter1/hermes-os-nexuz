"use client";

/**
 * ATS-M1 — the Positions section of the ATS dashboard.
 *
 * Every state is explicit: loading, a permission message (401/403 — never a
 * missing or broken screen), a failure with retry, an empty organization with a
 * visible "Create your first position" for authorized users, and the list.
 * Buttons an actor cannot use are rendered DISABLED with the reason, not
 * hidden, so the interface explains itself. The server decides; the buttons
 * mirror what it said this actor may attempt.
 */

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ds/Button";
import { buttonVariants } from "@/components/ds/logic";
import { EmptyState } from "@/components/ds/EmptyState";
import { Alert } from "@/components/ds/Alert";
import { POSITION_STATUSES, type PositionAction } from "@/lib/ats/positions/contract";
import { atsMutate, atsRead } from "./client-api";
import { ConfirmDialog, ToastRegion, useRefusalMessage, useToasts, type ConfirmSpec } from "./feedback";
import { usePositionActions } from "./position-actions";

interface ListedPosition {
  id: string;
  requisitionKey: string | null;
  status: string;
  isPublic: boolean;
  publishedAt: string | null;
  publicTitle: string;
  internalTitle: string | null;
  titleEn: string | null;
  titleFa: string | null;
  department: string;
  location: string;
  applicationCount: number;
  version: number;
  actions: { transitions: PositionAction[]; canEdit: boolean; canDelete: boolean };
}

interface ListResponse {
  positions: ListedPosition[];
  nextCursor: string | null;
  viewer: { role: string; canManage: boolean; canAdmin: boolean };
}

type ViewState =
  | { kind: "loading" }
  | { kind: "denied"; status: number }
  | { kind: "error"; message: string; correlationId: string | null }
  | { kind: "ready"; data: ListResponse };

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "hs-badge hs--nominal",
  OPEN: "hs-badge hs--reasoning",
  PAUSED: "hs-badge hs--warning",
  CLOSED: "hs-badge hs--risk",
  ARCHIVED: "hs-badge hs--memory",
};

export function positionLabel(p: { titleFa: string | null; titleEn: string | null; publicTitle: string; internalTitle: string | null }, locale: string) {
  if (locale === "fa" && p.titleFa) return p.titleFa;
  return p.titleEn || p.publicTitle || p.internalTitle || "—";
}

export function PositionsManagerClient() {
  const t = useTranslations("ats.mgmt");
  const locale = useLocale();
  const refusal = useRefusalMessage();
  const { toasts, push, dismiss } = useToasts();
  const [filter, setFilter] = useState<string>("ALL");
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [reloadTick, setReloadTick] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const reload = useCallback(() => setReloadTick((n) => n + 1), []);
  const { requestTransition, requestDelete } = usePositionActions({ push, setConfirm, onChanged: reload });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    const url = filter === "ALL" ? "/api/ats/jobs" : `/api/ats/jobs?status=${filter}`;
    atsRead<ListResponse>(url, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.status === 401 || res.status === 403) setState({ kind: "denied", status: res.status });
        else if (!res.ok || !res.data) setState({ kind: "error", message: refusal(res), correlationId: res.correlationId });
        else setState({ kind: "ready", data: res.data });
      })
      .catch(() => {
        /* aborted by a newer request */
      });
    return () => controller.abort();
  }, [filter, reloadTick, refusal]);

  const viewer = state.kind === "ready" ? state.data.viewer : null;

  const createInitialDrafts = () =>
    setConfirm({
      title: t("initial.title"),
      message: t("initial.message"),
      confirmLabel: t("initial.confirm"),
      reasonRequired: true,
      onConfirm: async (reason) => {
        const res = await atsMutate<{ created: unknown[]; skipped: unknown[] }>("/api/ats/jobs/initial-drafts", "POST", { reason });
        if (res.ok && res.data) {
          push({
            kind: "success",
            message: t("initial.done", { created: res.data.created.length, skipped: res.data.skipped.length }),
            correlationId: res.correlationId,
          });
          reload();
          return true;
        }
        push({ kind: "error", message: refusal(res), correlationId: res.correlationId });
        return false;
      },
    });

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {viewer?.canManage ? (
        <Link href="/dashboard/ats/jobs/new" className={buttonVariants("primary", "sm")}>
          {t("actions.CREATE")}
        </Link>
      ) : (
        <Button size="sm" disabled title={t("permission.manageRequired")}>
          {t("actions.CREATE")}
        </Button>
      )}
      {viewer?.canManage ? (
        <Link href="/dashboard/ats/settings" className={buttonVariants("secondary", "sm")}>
          {t("actions.SETTINGS")}
        </Link>
      ) : (
        <Button size="sm" variant="secondary" disabled title={t("permission.manageRequired")}>
          {t("actions.SETTINGS")}
        </Button>
      )}
      <Button size="sm" variant="tertiary" disabled={!viewer?.canAdmin} title={viewer?.canAdmin ? undefined : t("permission.adminRequired")} onClick={createInitialDrafts}>
        {t("initial.button")}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filters.label")}>
          {["ALL", ...POSITION_STATUSES].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={`hs-badge transition-colors ${filter === s ? "hs--memory" : "hs--nominal opacity-60"}`}
            >
              {s === "ALL" ? t("filters.all") : t(`status.${s}`)}
            </button>
          ))}
        </div>
        {state.kind === "ready" ? toolbar : null}
      </div>

      {state.kind === "loading" ? (
        <div className="space-y-2" aria-busy="true" aria-label={t("states.loading")}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-line bg-surface" />
          ))}
        </div>
      ) : null}

      {state.kind === "denied" ? (
        <Alert variant="warning" title={t("permission.title")}>
          {state.status === 401 ? t("permission.signIn") : t("permission.viewRequired")}
        </Alert>
      ) : null}

      {state.kind === "error" ? (
        <Alert variant="danger" title={t("states.errorTitle")}>
          <p>{state.message}</p>
          {state.correlationId ? (
            <p className="mt-1 font-mono text-xs" dir="ltr">
              {t("feedback.correlationId")}: {state.correlationId}
            </p>
          ) : null}
          <Button size="sm" variant="secondary" className="mt-3" onClick={reload}>
            {t("states.retry")}
          </Button>
        </Alert>
      ) : null}

      {state.kind === "ready" && state.data.positions.length === 0 ? (
        <EmptyState
          title={filter === "ALL" ? t("empty.title") : t("empty.filteredTitle")}
          message={viewer?.canManage ? t("empty.message") : t("empty.readOnly")}
          action={
            viewer?.canManage && filter === "ALL" ? (
              <Link href="/dashboard/ats/jobs/new" className={buttonVariants("primary", "md")}>
                {t("empty.createFirst")}
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {state.kind === "ready" && state.data.positions.length > 0 ? (
        <ul className="space-y-2">
          {state.data.positions.map((p) => {
            const label = positionLabel(p, locale);
            const actionable = { id: p.id, version: p.version, label, applicationCount: p.applicationCount };
            return (
              <li key={p.id} className="rounded-xl border border-line bg-surface px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/ats/jobs/${p.id}`} className="truncate font-body text-sm font-semibold text-ink hover:text-signal">
                        {label}
                      </Link>
                      <span className={STATUS_BADGE[p.status] ?? "hs-badge hs--nominal"}>{t(`status.${p.status}`)}</span>
                      <span className="hs-badge hs--nominal">{p.isPublic ? t("visibility.public") : t("visibility.private")}</span>
                    </div>
                    <p className="kpi-label text-metadata">
                      {[p.department, p.location].filter(Boolean).join(" · ")}
                      {p.requisitionKey ? <span dir="ltr"> · {p.requisitionKey}</span> : null}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="intel-kpi-value text-ink">{p.applicationCount}</p>
                    <p className="kpi-label">{t("list.applications")}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/dashboard/ats/jobs/${p.id}`} className={buttonVariants("tertiary", "sm")}>
                    {t("actions.VIEW")}
                  </Link>
                  {p.actions.canEdit ? (
                    <Link href={`/dashboard/ats/jobs/${p.id}/edit`} className={buttonVariants("secondary", "sm")}>
                      {t("actions.EDIT")}
                    </Link>
                  ) : null}
                  {p.actions.transitions.map((a) => (
                    <Button key={a} size="sm" variant={a === "CLOSE" || a === "ARCHIVE" ? "destructive" : "secondary"} onClick={() => requestTransition(actionable, a)}>
                      {t(`actions.${a}`)}
                    </Button>
                  ))}
                  {p.actions.canDelete ? (
                    <Button size="sm" variant="destructive" onClick={() => requestDelete(actionable)}>
                      {t("actions.DELETE")}
                    </Button>
                  ) : null}
                  <Link href={`/dashboard/ats/jobs/${p.id}#audit`} className={buttonVariants("tertiary", "sm")}>
                    {t("actions.AUDIT")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
