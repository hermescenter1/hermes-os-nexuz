"use client";

import { useState }        from "react";
import { useTranslations } from "next-intl";

interface Props {
  leadId:        string;
  initialStatus: string;
}

/**
 * Phase 81C: approve / reject controls for an AUTH_ACCESS_REQUEST lead.
 * Approve returns the invite link exactly once (token is stored hashed) —
 * the admin must copy it here; re-approving mints a fresh link.
 */
export function AccessRequestActions({ leadId, initialStatus }: Props) {
  const t  = useTranslations("adminAccess");
  const ta = useTranslations("auth");

  const [status,    setStatus]    = useState(initialStatus);
  const [role,      setRole]      = useState("customer");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState(false);

  async function act(action: "approve" | "reject") {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/admin/access-requests/${leadId}/${action}`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    action === "approve" ? JSON.stringify({ role }) : "{}",
      });
      const data = await res.json().catch(() => ({})) as { inviteUrl?: string };
      if (!res.ok) {
        setError(true);
      } else if (action === "approve") {
        setStatus("APPROVED");
        setInviteUrl(data.inviteUrl ?? null);
        setCopied(false);
      } else {
        setStatus("REJECTED");
        setInviteUrl(null);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard unavailable — the URL stays visible for manual copy */
    }
  }

  const rejected = status === "REJECTED";

  return (
    <div className="mt-4 pt-3 border-t border-[#1E2E40]">
      <p className="text-[9px] font-mono uppercase tracking-wider text-[#4A5A6E] mb-2">
        {t("reviewTitle")}
      </p>

      {!rejected && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={busy}
            aria-label={t("inviteRole")}
            className="text-[11px] font-mono rounded-md px-2 py-1.5 bg-[#0C1420] text-[#8A9BB0] border border-[#1E2E40] focus:outline-none focus:border-[rgba(30,200,164,0.4)]"
          >
            <option value="customer">{ta("roleCustomer")}</option>
            <option value="viewer">{ta("roleViewer")}</option>
            <option value="engineer">{ta("roleEngineer")}</option>
          </select>

          <button
            type="button"
            onClick={() => act("approve")}
            disabled={busy}
            className="text-[11px] font-mono uppercase tracking-wider rounded-md px-3 py-1.5 bg-[rgba(30,200,164,0.10)] text-[#1EC8A4] border border-[rgba(30,200,164,0.25)] hover:bg-[rgba(30,200,164,0.18)] transition-colors disabled:opacity-40"
          >
            {t("approve")}
          </button>

          <button
            type="button"
            onClick={() => act("reject")}
            disabled={busy}
            className="text-[11px] font-mono uppercase tracking-wider rounded-md px-3 py-1.5 bg-[rgba(239,68,68,0.08)] text-[#EF4444] border border-[rgba(239,68,68,0.22)] hover:bg-[rgba(239,68,68,0.15)] transition-colors disabled:opacity-40"
          >
            {t("reject")}
          </button>
        </div>
      )}

      {rejected && (
        <p className="text-[11px] font-mono text-[#EF4444]">{t("rejectedNote")}</p>
      )}

      {error && (
        <p className="mt-2 text-[11px] font-mono text-[#EF4444]">{t("actionFailed")}</p>
      )}

      {inviteUrl && (
        <div className="mt-3 rounded-lg border border-[rgba(30,200,164,0.25)] bg-[rgba(30,200,164,0.05)] p-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[#1EC8A4] mb-1.5">
            {t("inviteCreated")}
          </p>
          <p dir="ltr" className="text-[10px] font-mono text-[#8A9BB0] break-all mb-2">
            {inviteUrl}
          </p>
          <button
            type="button"
            onClick={copy}
            className="text-[11px] font-mono uppercase tracking-wider rounded-md px-3 py-1.5 bg-[rgba(30,200,164,0.10)] text-[#1EC8A4] border border-[rgba(30,200,164,0.25)] hover:bg-[rgba(30,200,164,0.18)] transition-colors"
          >
            {copied ? t("inviteLinkCopied") : t("copyInviteLink")}
          </button>
        </div>
      )}
    </div>
  );
}
