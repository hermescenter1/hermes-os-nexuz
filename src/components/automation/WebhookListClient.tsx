"use client";

import { useState, useTransition } from "react";
import { useRouter }  from "next/navigation";
import type { WorkflowWebhookEndpoint } from "@/lib/automation/types";

export function WebhookListClient({ webhooks }: { webhooks: WorkflowWebhookEndpoint[] }) {
  const router   = useRouter();
  const [pending, startTransition] = useTransition();
  const [name,    setName]    = useState("");
  const [url,     setUrl]     = useState("");
  const [error,   setError]   = useState("");
  const [showForm, setShowForm] = useState(false);

  const handleCreate = () => {
    if (!name.trim() || !url.trim()) { setError("Name and URL are required"); return; }
    startTransition(async () => {
      try {
        const res = await fetch("/api/automation/webhooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), url: url.trim() }),
        });
        if (!res.ok) { setError("Failed to create webhook"); return; }
        setName(""); setUrl(""); setShowForm(false); setError("");
        router.refresh();
      } catch { setError("Network error"); }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{webhooks.length} Webhook{webhooks.length !== 1 ? "s" : ""}</h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {showForm ? "Cancel" : "Register Webhook"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold">Register New Webhook</h3>
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="My Webhook"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">URL *</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              placeholder="https://hooks.example.com/..."
              type="url"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={pending}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create Webhook"}
          </button>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">URL</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Failures</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Delivered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {webhooks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No webhooks registered.</td>
              </tr>
            ) : (
              webhooks.map(wh => (
                <tr key={wh.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{wh.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono truncate max-w-xs">{wh.url}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${wh.isActive ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-slate-500/15 text-slate-600 dark:text-slate-400"}`}>
                      {wh.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{wh.failureCount}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {wh.lastDeliveredAt ? new Date(wh.lastDeliveredAt).toLocaleString() : "Never"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
