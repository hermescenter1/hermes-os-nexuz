"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations }                   from "next-intl";
import { GlassCard }                         from "@/components/ui/GlassCard";
import { DashboardPanel }                    from "@/components/ui/DashboardPanel";
import type { InvitationRecord, OrgRole }    from "@/lib/org/types";
import { ALL_ORG_ROLES }                     from "@/lib/org/types";

interface Props { orgId: string; canInvite: boolean }

const STATUS_COLOR: Record<string, string> = {
  PENDING:  "text-amber-400 border-amber-400/30 bg-amber-400/10",
  ACCEPTED: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  REJECTED: "text-red-400 border-red-400/30 bg-red-400/10",
  EXPIRED:  "text-muted border-line bg-surface",
};

export function InvitationsPanel({ orgId, canInvite }: Props) {
  const t = useTranslations("org");
  const [invitations, setInvitations] = useState<InvitationRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ email: "", role: "ENGINEER" as OrgRole });
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [tokenResult, setTokenResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/invitations`);
      if (res.ok) {
        const data = await res.json() as { invitations: InvitationRecord[] };
        setInvitations(data.invitations);
      }
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  async function sendInvitation() {
    setSending(true);
    setError(null);
    setTokenResult(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}/invitations`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json() as { invitation?: { token: string }; error?: string };
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setTokenResult(data.invitation?.token ?? null);
      setShowForm(false);
      setForm({ email: "", role: "ENGINEER" });
      void load();
    } finally { setSending(false); }
  }

  async function revoke(invId: string) {
    if (!confirm((t as unknown as (k: string) => string)("invitations.confirmRevoke"))) return;
    await fetch(`/api/organizations/${orgId}/invitations/${invId}`, { method: "DELETE" });
    void load();
  }

  async function resend(invId: string) {
    const res = await fetch(`/api/organizations/${orgId}/invitations/${invId}`, { method: "PATCH" });
    const data = await res.json() as { invitation?: { token: string } };
    if (data.invitation?.token) setTokenResult(data.invitation.token);
    void load();
  }

  if (loading) {
    return (
      <DashboardPanel title="">
        <p className="text-muted text-sm">{(t as unknown as (k: string) => string)("loading")}</p>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel title="">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ink">
          {(t as unknown as (k: string) => string)("invitations.title")}
        </h2>
        {canInvite && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded bg-signal/10 border border-signal/30 text-signal text-sm hover:bg-signal/20 transition-colors"
          >
            {(t as unknown as (k: string) => string)("invitations.invite")}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-danger/10 border border-danger/30 text-sm text-danger">
          {error}
        </div>
      )}

      {tokenResult && (
        <div className="mb-4 p-3 rounded bg-signal/10 border border-signal/30 text-sm">
          <p className="text-signal font-medium mb-1">
            {(t as unknown as (k: string) => string)("invitations.tokenNote")}
          </p>
          <code className="block text-xs text-ink break-all font-mono bg-black/20 p-2 rounded">
            {tokenResult}
          </code>
          <button
            onClick={() => setTokenResult(null)}
            className="mt-2 text-xs text-muted hover:text-ink"
          >
            {(t as unknown as (k: string) => string)("dismiss")}
          </button>
        </div>
      )}

      {showForm && (
        <GlassCard className="p-4 mb-4 space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">{(t as unknown as (k: string) => string)("fields.email")}</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 rounded bg-surface border border-line text-ink text-sm focus:border-signal outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">{(t as unknown as (k: string) => string)("fields.role")}</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as OrgRole })}
              className="w-full px-3 py-2 rounded bg-surface border border-line text-ink text-sm focus:border-signal outline-none"
            >
              {ALL_ORG_ROLES.filter((r) => r !== "MEMBER" && r !== "OWNER").map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void sendInvitation()}
              disabled={sending}
              className="px-4 py-2 rounded bg-signal text-black text-sm font-medium hover:bg-signal/80 disabled:opacity-50 transition-colors"
            >
              {sending
                ? (t as unknown as (k: string) => string)("sending")
                : (t as unknown as (k: string) => string)("invitations.send")}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded border border-line text-sm text-muted hover:text-ink transition-colors"
            >
              {(t as unknown as (k: string) => string)("cancel")}
            </button>
          </div>
        </GlassCard>
      )}

      <div className="space-y-2">
        {invitations.length === 0 && (
          <p className="text-sm text-muted">{(t as unknown as (k: string) => string)("invitations.empty")}</p>
        )}
        {invitations.map((inv) => (
          <GlassCard key={inv.id} className="p-3 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-ink truncate">{inv.email}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[inv.status] ?? ""}`}>
                  {inv.status}
                </span>
                <span className="text-xs text-muted">{inv.role}</span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                {(t as unknown as (k: string) => string)("invitations.expires")}:{" "}
                {new Date(inv.expiresAt).toLocaleDateString()}
              </p>
            </div>
            {canInvite && inv.status === "PENDING" && (
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => void resend(inv.id)}
                  className="text-xs px-2 py-1 rounded border border-signal/30 text-signal hover:bg-signal/10 transition-colors"
                >
                  {(t as unknown as (k: string) => string)("invitations.resend")}
                </button>
                <button
                  onClick={() => void revoke(inv.id)}
                  className="text-xs px-2 py-1 rounded border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  {(t as unknown as (k: string) => string)("invitations.revoke")}
                </button>
              </div>
            )}
          </GlassCard>
        ))}
      </div>
    </DashboardPanel>
  );
}
