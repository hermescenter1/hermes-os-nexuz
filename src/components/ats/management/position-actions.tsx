"use client";

/**
 * ATS-M1 — lifecycle actions on a position, shared by the list and the detail
 * page: each builds a confirmation (with a mandatory reason where the server
 * requires one), calls the API, and reports the outcome as a toast — success
 * or refusal, never silence. What an actor may attempt comes from the server
 * (`actions` on every position); the server re-checks it on the request.
 */

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { PositionAction } from "@/lib/ats/positions/contract";
import { TRANSITIONS } from "@/lib/ats/positions/state-machine";
import { atsMutate } from "./client-api";
import { useRefusalMessage, type ConfirmSpec, type Toast } from "./feedback";

export interface ActionablePosition {
  id: string;
  version: number;
  label: string;
  applicationCount: number;
}

export function usePositionActions(opts: {
  push: (t: Omit<Toast, "id">) => void;
  setConfirm: (spec: ConfirmSpec | null) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("ats.mgmt");
  const refusal = useRefusalMessage();
  const { push, setConfirm, onChanged } = opts;

  const requestTransition = useCallback(
    (p: ActionablePosition, action: PositionAction) => {
      const rule = TRANSITIONS[action];
      setConfirm({
        title: t(`confirm.${action}.title`),
        message: t(`confirm.${action}.message`, { title: p.label }),
        confirmLabel: t(`actions.${action}`),
        destructive: action === "CLOSE" || action === "ARCHIVE",
        reasonRequired: rule.reasonRequired,
        extra:
          action === "CLOSE" || action === "ARCHIVE" ? (
            <p className="rounded-md border border-line bg-surface2 px-3 py-2 text-xs text-muted">
              {t("confirm.applicationsUntouched", { count: p.applicationCount })}
            </p>
          ) : null,
        onConfirm: async (reason) => {
          const res = await atsMutate<{ status: string }>(`/api/ats/jobs/${encodeURIComponent(p.id)}/transition`, "POST", {
            action,
            expectedVersion: p.version,
            ...(reason ? { reason } : {}),
          });
          if (res.ok) {
            push({ kind: "success", message: t(`done.${action}`, { title: p.label }), correlationId: res.correlationId });
            onChanged();
            return true;
          }
          const missing = Array.isArray(res.detail?.missing) ? (res.detail?.missing as string[]) : [];
          push({
            kind: "error",
            message: missing.length
              ? `${refusal(res)} ${missing.map((m) => t(`readiness.${m}`)).join(" · ")}`
              : refusal(res),
            correlationId: res.correlationId,
          });
          // A stale or incomplete position: close the dialog and reload so the
          // operator sees the current state (and the readiness checklist).
          if (res.code === "STALE" || res.code === "NOT_READY") {
            onChanged();
            return true;
          }
          return false;
        },
      });
    },
    [t, refusal, push, setConfirm, onChanged],
  );

  const requestDelete = useCallback(
    (p: ActionablePosition) => {
      setConfirm({
        title: t("confirm.DELETE.title"),
        message: t("confirm.DELETE.message", { title: p.label }),
        confirmLabel: t("actions.DELETE"),
        destructive: true,
        reasonRequired: true,
        extra: (
          <div className="rounded-md border border-amber-400/40 bg-amber-950/40 px-3 py-2 text-xs text-ink">
            <p className="font-semibold">{t("confirm.DELETE.linked", { count: p.applicationCount })}</p>
            <p className="mt-1 text-muted">{t("confirm.DELETE.safety")}</p>
          </div>
        ),
        onConfirm: async (reason) => {
          const res = await atsMutate<{ softDeleted: boolean }>(`/api/ats/jobs/${encodeURIComponent(p.id)}/delete`, "POST", {
            expectedVersion: p.version,
            reason,
            confirmLinkedApplications: p.applicationCount,
          });
          if (res.ok) {
            push({ kind: "success", message: t("done.DELETE", { title: p.label }), correlationId: res.correlationId });
            onChanged();
            return true;
          }
          push({ kind: "error", message: refusal(res), correlationId: res.correlationId });
          if (res.code === "LINKED_COUNT_CHANGED" || res.code === "STALE") {
            onChanged();
            return true;
          }
          return false;
        },
      });
    },
    [t, refusal, push, setConfirm, onChanged],
  );

  return { requestTransition, requestDelete };
}
