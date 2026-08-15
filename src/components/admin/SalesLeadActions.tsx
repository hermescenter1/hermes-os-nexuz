"use client";

import { useState }        from "react";
import { useTranslations } from "next-intl";
// Deep import of the PURE rule table, never the server workflow module — that
// one pulls in Prisma, the logger and the audit service.
import {
  allowedTransitions,
  isSalesLeadStatus,
  type SalesLeadStatus,
} from "@/lib/sales/lead-status";

interface Props {
  leadId:        string;
  initialStatus: string;
}

/**
 * Review controls for a DEMO / SALES lead.
 *
 * Deliberately separate from `AccessRequestActions`. That component's "Approve"
 * mints an account invitation; this one records a commercial decision and can
 * never create an invite or a User — it only ever calls
 * PATCH /api/admin/sales/leads/[id]. Sharing one generic button implementation
 * between the two would make the more dangerous action indistinguishable from
 * the safer one at the call site.
 *
 * The transition table is imported from the same module the API enforces, so
 * the buttons an operator sees are derived from the real rule set rather than a
 * second copy of it. The backend re-decides every transition regardless.
 */
export function SalesLeadActions({ leadId, initialStatus }: Props) {
  const t = useTranslations("adminOperations.leads");

  const [status,  setStatus]  = useState(initialStatus);
  const [busy,    setBusy]    = useState<SalesLeadStatus | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  const current = isSalesLeadStatus(status) ? status : null;
  const next    = current ? allowedTransitions(current) : [];

  async function act(to: SalesLeadStatus) {
    if (busy || !current) return;
    setBusy(to);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sales/leads/${leadId}`, {
        method:  "PATCH",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ status: to, expectedStatus: current }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        currentStatus?: string;
        error?: string;
      };

      if (res.ok && data.status) {
        setStatus(data.status);
        return;
      }

      // A conflict means another administrator already moved this lead. Adopt
      // the status the server reports so the controls resync without a reload
      // instead of leaving the operator staring at a stale card.
      if (res.status === 409 && data.currentStatus) {
        setStatus(data.currentStatus);
        setError(t("actionConflict"));
        return;
      }
      setError(t("actionFailed"));
    } catch {
      setError(t("actionFailed"));
    } finally {
      setBusy(null);
    }
  }

  // Status text is always rendered as a word, never encoded by colour alone.
  const statusLabel = current ? t(`status.${current}`) : status;

  return (
    <div className="mt-4 pt-3 border-t border-[#1E2E40]">
      <p className="text-[9px] font-mono uppercase tracking-wider text-[#4A5A6E] mb-2">
        {t("reviewTitle")}
      </p>

      <p className="text-[11px] font-mono text-[#8A9BB0] mb-2.5">
        <span className="text-[#4A5A6E]">{t("currentStatus")}: </span>
        <span className="text-[#F0F4F8] font-semibold">{statusLabel}</span>
      </p>

      {next.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {next.map((to) => {
            const destructive = to === "REJECTED";
            return (
              <button
                key={to}
                type="button"
                onClick={() => act(to)}
                disabled={busy !== null}
                aria-busy={busy === to}
                className={
                  "text-[11px] font-mono uppercase tracking-wider rounded-md px-3 py-1.5 " +
                  "transition-colors disabled:opacity-40 disabled:cursor-not-allowed " +
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(30,200,164,0.5)] " +
                  (destructive
                    ? "bg-[rgba(239,68,68,0.08)] text-[#EF4444] border border-[rgba(239,68,68,0.22)] hover:bg-[rgba(239,68,68,0.15)]"
                    : "bg-[rgba(30,200,164,0.10)] text-[#1EC8A4] border border-[rgba(30,200,164,0.25)] hover:bg-[rgba(30,200,164,0.18)]")
                }
              >
                {busy === to ? t("actionBusy") : t(`action.${to}`)}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] font-mono text-[#4A5A6E]">{t("terminalNote")}</p>
      )}

      {/*
        Approving a demo lead is a commercial decision only. Stated in the UI so
        an operator is never left assuming the factory now has product access.
      */}
      {current === "APPROVED" && (
        <p className="mt-2.5 text-[11px] font-mono text-[#8A9BB0] leading-relaxed">
          {t("approvedNote")}
        </p>
      )}

      {error && (
        <p role="status" className="mt-2 text-[11px] font-mono text-[#EF4444]">
          {error}
        </p>
      )}
    </div>
  );
}
