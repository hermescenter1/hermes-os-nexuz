"use client";

// PHASE 107 STAGE 6-A — the load had an `if (res.ok)` with no else, so a failed
// request left the list empty and finished loading: a signed-out reader was
// shown an organization with no departments. The create path and the endpoint
// are unchanged; the refresh after a create runs through the same state machine.

import { useState }                          from "react";
import { useTranslations }                   from "next-intl";
import { GlassCard }                         from "@/components/ui/GlassCard";
import { DashboardPanel }                    from "@/components/ui/DashboardPanel";
import { ResourceFailureNotice }             from "@/components/ui/ResourceFailureNotice";
import { useResource }                       from "@/lib/client/use-resource";
import { requestJson }                       from "@/lib/client/resource-request";
import type { DeptRecord }                   from "@/lib/org/types";
import { DEPT_TYPES }                        from "@/lib/org/types";

interface Props { orgId: string; canManage: boolean }

export function DepartmentsPanel({ orgId, canManage }: Props) {
  const t = useTranslations("org");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ name: "", description: "", type: "automation" });
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const deptState = useResource<DeptRecord[]>(
    (signal) => requestJson(
      `/api/organizations/${orgId}/departments`,
      (body) => (body as { departments?: DeptRecord[] }).departments,
      { signal },
    ),
    [orgId],
  );
  const departments = deptState.data ?? [];

  async function createDept() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}/departments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setShowForm(false);
      setForm({ name: "", description: "", type: "automation" });
      deptState.retry();
    } finally { setCreating(false); }
  }

  if (deptState.status === "LOADING") {
    return (
      <DashboardPanel title="">
        <p className="text-muted text-sm">{(t as unknown as (k: string) => string)("loading")}</p>
      </DashboardPanel>
    );
  }

  if (deptState.status === "ERROR" && deptState.failure) {
    return (
      <DashboardPanel title="">
        <ResourceFailureNotice code={deptState.failure} onRetry={deptState.retry} />
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel title="">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-ink">
          {(t as unknown as (k: string) => string)("departments.title")}
        </h2>
        {canManage && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded bg-signal/10 border border-signal/30 text-signal text-sm hover:bg-signal/20 transition-colors"
          >
            {(t as unknown as (k: string) => string)("departments.add")}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-danger/10 border border-danger/30 text-sm text-danger">
          {error}
        </div>
      )}

      {showForm && (
        <GlassCard className="p-4 mb-4 space-y-3">
          <div>
            <label className="block text-xs text-muted mb-1">{(t as unknown as (k: string) => string)("fields.name")}</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 rounded bg-surface border border-line text-ink text-sm focus:border-signal outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">{(t as unknown as (k: string) => string)("departments.type")}</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 rounded bg-surface border border-line text-ink text-sm focus:border-signal outline-none"
            >
              {DEPT_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {(t as unknown as (k: string) => string)(`departments.types.${dt}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">{(t as unknown as (k: string) => string)("fields.description")}</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 rounded bg-surface border border-line text-ink text-sm focus:border-signal outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void createDept()}
              disabled={creating}
              className="px-4 py-2 rounded bg-signal text-black text-sm font-medium hover:bg-signal/80 disabled:opacity-50 transition-colors"
            >
              {creating
                ? (t as unknown as (k: string) => string)("creating")
                : (t as unknown as (k: string) => string)("departments.create")}
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
        {departments.length === 0 && (
          <p className="text-sm text-muted">{(t as unknown as (k: string) => string)("departments.empty")}</p>
        )}
        {departments.map((d) => (
          <GlassCard key={d.id} className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-ink">{d.name}</span>
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-signal/30 text-signal bg-signal/10">
                  {(t as unknown as (k: string) => string)(`departments.types.${d.type}`)}
                </span>
              </div>
            </div>
            {d.description && <p className="text-xs text-muted mt-1">{d.description}</p>}
          </GlassCard>
        ))}
      </div>
    </DashboardPanel>
  );
}
