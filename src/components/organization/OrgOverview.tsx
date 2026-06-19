"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations }                   from "next-intl";
import { GlassCard }                         from "@/components/ui/GlassCard";
import { DashboardPanel }                    from "@/components/ui/DashboardPanel";
import type { OrgRecord }                    from "@/lib/org/types";

interface Props { orgId: string }

export function OrgOverview({ orgId }: Props) {
  const t = useTranslations("org");
  const [org, setOrg]       = useState<OrgRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm]     = useState({ name: "", description: "", website: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}`);
      if (res.ok) {
        const data = await res.json() as { organization: OrgRecord };
        setOrg(data.organization);
        setForm({
          name:        data.organization.name,
          description: data.organization.description ?? "",
          website:     data.organization.website     ?? "",
        });
      }
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${orgId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await res.json() as { organization?: OrgRecord; error?: string };
      if (!res.ok) { setError(data.error ?? "Update failed"); return; }
      setOrg(data.organization ?? null);
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally { setSaving(false); }
  }

  if (loading) {
    return (
      <DashboardPanel title="">
        <p className="text-muted text-sm">{(t as unknown as (k: string) => string)("loading")}</p>
      </DashboardPanel>
    );
  }

  if (!org) {
    return (
      <DashboardPanel title="">
        <p className="text-danger text-sm">{(t as unknown as (k: string) => string)("notFound")}</p>
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel title="">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">{org.name}</h1>
          <p className="text-muted text-sm mt-1">/{org.slug}</p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 rounded border border-line text-sm text-signal hover:bg-signal/10 transition-colors"
          >
            {(t as unknown as (k: string) => string)("edit")}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-danger/10 border border-danger/30 text-sm text-danger">
          {error}
        </div>
      )}

      {editing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1">{(t as unknown as (k: string) => string)("fields.name")}</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 rounded bg-surface border border-line text-ink text-sm focus:border-signal outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">{(t as unknown as (k: string) => string)("fields.description")}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded bg-surface border border-line text-ink text-sm focus:border-signal outline-none resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">{(t as unknown as (k: string) => string)("fields.website")}</label>
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="w-full px-3 py-2 rounded bg-surface border border-line text-ink text-sm focus:border-signal outline-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-4 py-2 rounded bg-signal text-black text-sm font-medium hover:bg-signal/80 disabled:opacity-50 transition-colors"
            >
              {saving
                ? (t as unknown as (k: string) => string)("saving")
                : (t as unknown as (k: string) => string)("save")}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 rounded border border-line text-sm text-muted hover:text-ink transition-colors"
            >
              {(t as unknown as (k: string) => string)("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {org.description && <p className="text-sm text-ink">{org.description}</p>}
          {org.website && (
            <p className="text-sm text-muted">
              <span className="text-signal mr-2">🔗</span>
              {org.website}
            </p>
          )}
          <GlassCard className="mt-4 p-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{(t as unknown as (k: string) => string)("fields.created")}</dt>
              <dd className="text-ink">{new Date(org.createdAt).toLocaleDateString()}</dd>
              <dt className="text-muted">{(t as unknown as (k: string) => string)("fields.updated")}</dt>
              <dd className="text-ink">{new Date(org.updatedAt).toLocaleDateString()}</dd>
            </dl>
          </GlassCard>
        </div>
      )}
    </DashboardPanel>
  );
}
