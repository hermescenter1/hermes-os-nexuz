"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations }                   from "next-intl";
import { GlassCard }                         from "@/components/ui/GlassCard";
import { DashboardPanel }                    from "@/components/ui/DashboardPanel";
import type { DeptRecord }                   from "@/lib/org/types";
import { DEPT_TYPES }                        from "@/lib/org/types";

interface Props { orgId: string; canManage: boolean }

export function DepartmentsPanel({ orgId, canManage }: Props) {
  const t = useTranslations("org");
  const [departments, setDepartments] = useState<DeptRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ name: "", description: "", type: "automation" });
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/departments`);
      if (res.ok) {
        const data = await res.json() as { departments: DeptRecord[] };
        setDepartments(data.departments);
      }
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

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
      void load();
    } finally { setCreating(false); }
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
