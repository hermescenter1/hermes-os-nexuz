"use client";

/**
 * ATS-M1 — shared feedback primitives for the management pages: a toast
 * region (success / error, with the correlation id of a failed request) and a
 * confirmation dialog that can REQUIRE a written reason before it enables its
 * confirm button. Built on the design-system Dialog, Button and Textarea.
 */

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ds/Dialog";
import { Button } from "@/components/ds/Button";
import { Textarea } from "@/components/ds/Textarea";
import type { ApiOutcome } from "./client-api";

export interface Toast {
  id: number;
  kind: "success" | "error";
  message: string;
  correlationId?: string | null;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = ++seq.current;
      setToasts((all) => [...all.slice(-3), { ...toast, id }]);
      // Errors stay until dismissed — a failure must never vanish unread.
      if (toast.kind === "success") setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}

export function ToastRegion({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const t = useTranslations("ats.mgmt.feedback");
  return (
    <div aria-live="polite" role="status" className="fixed bottom-4 end-4 z-50 flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-xl border px-4 py-3 shadow-e4 backdrop-blur ${
            toast.kind === "success" ? "border-emerald-400/40 bg-emerald-950/80" : "border-rose-400/40 bg-rose-950/85"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink">{toast.message}</p>
            <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => onDismiss(toast.id)} aria-label={t("dismiss")}>
              ×
            </button>
          </div>
          {toast.correlationId ? (
            <p className="mt-1 font-mono text-[0.65rem] text-muted" dir="ltr">
              {t("correlationId")}: {toast.correlationId}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** A human message for a refusal code — the server's text is never shown raw. */
export function useRefusalMessage() {
  const t = useTranslations("ats.mgmt.errors");
  return useCallback(
    (outcome: Pick<ApiOutcome<unknown>, "code" | "status">): string => {
      const code = outcome.code ?? (outcome.status === 401 ? "AUTHENTICATION_REQUIRED" : null);
      const known = [
        "INVALID_INPUT",
        "IDEMPOTENCY_KEY_REUSED",
        "IDEMPOTENCY_IN_PROGRESS",
        "NOT_FOUND",
        "STALE",
        "INVALID_TRANSITION",
        "NOT_READY",
        "PROTECTED_TERM",
        "REASON_REQUIRED",
        "FORBIDDEN",
        "CONFLICT",
        "LINKED_COUNT_CHANGED",
        "HIRING_OWNER_INVALID",
        "STORE_UNAVAILABLE",
        "OFFLINE",
        "AUTHENTICATION_REQUIRED",
        "ORGANIZATION_CONTEXT_REQUIRED",
        "ORGANIZATION_SELECTION_REQUIRED",
        "ORGANIZATION_CONTEXT_UNAVAILABLE",
        "ORGANIZATION_CONTEXT_CONFLICT",
        "ORGANIZATION_PRECONDITION_REQUIRED",
        "ORIGIN_NOT_ALLOWED",
      ];
      return code && known.includes(code) ? t(code) : t("GENERIC");
    },
    [t],
  );
}

export interface ConfirmSpec {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  reasonRequired?: boolean;
  /** Extra content shown above the reason (e.g. linked-record counts). */
  extra?: ReactNode;
  onConfirm: (reason: string) => Promise<boolean>;
}

export function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec | null; onClose: () => void }) {
  const t = useTranslations("ats.mgmt.feedback");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const reasonId = useId();
  const reasonOk = !spec?.reasonRequired || reason.trim().length >= 5;

  const close = () => {
    if (busy) return;
    setReason("");
    onClose();
  };

  return (
    <Dialog
      open={spec !== null}
      onClose={close}
      title={spec?.title}
      description={typeof spec?.message === "string" ? spec.message : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            variant={spec?.destructive ? "destructive" : "primary"}
            loading={busy}
            disabled={!reasonOk || busy}
            onClick={async () => {
              if (!spec) return;
              setBusy(true);
              const done = await spec.onConfirm(reason.trim());
              setBusy(false);
              if (done) {
                setReason("");
                onClose();
              }
            }}
          >
            {spec?.confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-5">
        {typeof spec?.message !== "string" ? spec?.message : null}
        {spec?.extra}
        <div className="flex flex-col gap-1">
          <label htmlFor={reasonId} className="kpi-label">
            {spec?.reasonRequired ? t("reasonRequired") : t("reasonOptional")}
          </label>
          <Textarea id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} rows={3} error={!reasonOk && reason.length > 0} />
          {spec?.reasonRequired ? <p className="text-xs text-muted">{t("reasonHint")}</p> : null}
        </div>
      </div>
    </Dialog>
  );
}
