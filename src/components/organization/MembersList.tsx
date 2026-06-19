"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations }                   from "next-intl";
import { GlassCard }                         from "@/components/ui/GlassCard";
import { DashboardPanel }                    from "@/components/ui/DashboardPanel";
import type { MemberRecord, OrgRole, MemberStatus } from "@/lib/org/types";
import { ALL_ORG_ROLES }                     from "@/lib/org/types";

interface Props { orgId: string; canManage: boolean }

const ROLE_COLOR: Record<string, string> = {
  OWNER:         "text-amber-400 border-amber-400/30 bg-amber-400/10",
  ADMIN:         "text-signal  border-signal/30  bg-signal/10",
  MANAGER:       "text-blue-400 border-blue-400/30 bg-blue-400/10",
  ENGINEER:      "text-ink      border-line        bg-surface",
  VIEWER:        "text-muted    border-line        bg-surface",
  BILLING_ADMIN: "text-purple-400 border-purple-400/30 bg-purple-400/10",
  MEMBER:        "text-muted    border-line        bg-surface",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:    "text-emerald-400",
  INVITED:   "text-amber-400",
  SUSPENDED: "text-red-400",
};

export function MembersList({ orgId, canManage }: Props) {
  const t = useTranslations("org");
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMemberId, setActionMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/members`);
      if (res.ok) {
        const data = await res.json() as { members: MemberRecord[] };
        setMembers(data.members);
      }
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  async function changeRole(memberId: string, role: OrgRole) {
    setActionMemberId(memberId);
    setError(null);
    const res = await fetch(`/api/organizations/${orgId}/members/${memberId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ role }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) { setError(data.error ?? "Failed"); }
    setActionMemberId(null);
    void load();
  }

  async function changeStatus(memberId: string, status: MemberStatus) {
    setActionMemberId(memberId);
    setError(null);
    const res = await fetch(`/api/organizations/${orgId}/members/${memberId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    });
    const data = await res.json() as { error?: string };
    if (!res.ok) { setError(data.error ?? "Failed"); }
    setActionMemberId(null);
    void load();
  }

  async function removeMember(memberId: string) {
    if (!confirm((t as unknown as (k: string) => string)("members.confirmRemove"))) return;
    setActionMemberId(memberId);
    setError(null);
    const res = await fetch(`/api/organizations/${orgId}/members/${memberId}`, { method: "DELETE" });
    const data = await res.json() as { error?: string };
    if (!res.ok) { setError(data.error ?? "Failed"); }
    setActionMemberId(null);
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
      <h2 className="text-lg font-semibold text-ink mb-4">
        {(t as unknown as (k: string) => string)("members.title")} ({members.length})
      </h2>

      {error && (
        <div className="mb-4 p-3 rounded bg-danger/10 border border-danger/30 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {members.map((m) => (
          <GlassCard key={m.id} className="p-3 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-ink truncate">
                  {m.user?.name ?? m.userId}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${ROLE_COLOR[m.role] ?? ""}`}>
                  {m.role}
                </span>
                <span className={`text-xs ${STATUS_COLOR[m.status] ?? "text-muted"}`}>
                  {m.status}
                </span>
              </div>
              {m.user?.email && (
                <p className="text-xs text-muted mt-0.5">{m.user.email}</p>
              )}
            </div>

            {canManage && (
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={m.role}
                  disabled={actionMemberId === m.id}
                  onChange={(e) => void changeRole(m.id, e.target.value as OrgRole)}
                  className="text-xs px-2 py-1 rounded bg-surface border border-line text-ink"
                >
                  {ALL_ORG_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                {m.status === "ACTIVE" ? (
                  <button
                    disabled={actionMemberId === m.id}
                    onClick={() => void changeStatus(m.id, "SUSPENDED")}
                    className="text-xs px-2 py-1 rounded border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-50"
                  >
                    {(t as unknown as (k: string) => string)("members.suspend")}
                  </button>
                ) : m.status === "SUSPENDED" ? (
                  <button
                    disabled={actionMemberId === m.id}
                    onClick={() => void changeStatus(m.id, "ACTIVE")}
                    className="text-xs px-2 py-1 rounded border border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-50"
                  >
                    {(t as unknown as (k: string) => string)("members.activate")}
                  </button>
                ) : null}

                <button
                  disabled={actionMemberId === m.id}
                  onClick={() => void removeMember(m.id)}
                  className="text-xs px-2 py-1 rounded border border-red-400/30 text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
                >
                  {(t as unknown as (k: string) => string)("members.remove")}
                </button>
              </div>
            )}
          </GlassCard>
        ))}
      </div>
    </DashboardPanel>
  );
}
