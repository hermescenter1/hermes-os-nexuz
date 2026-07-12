"use client";

import { useState, useTransition } from "react";
import { useRouter }  from "next/navigation";
import { useTranslations } from "next-intl";
import type { WorkflowWebhookEndpoint } from "@/lib/automation/types";

export function WebhookListClient({ webhooks }: { webhooks: WorkflowWebhookEndpoint[] }) {
  const router   = useRouter();
  const t        = useTranslations("automationOperations");
  const [pending, startTransition] = useTransition();
  const [name,    setName]    = useState("");
  const [url,     setUrl]     = useState("");
  const [error,   setError]   = useState("");
  const [showForm, setShowForm] = useState(false);

  const handleCreate = () => {
    if (!name.trim() || !url.trim()) { setError(t("webhooks.errNameUrlRequired")); return; }
    startTransition(async () => {
      try {
        const res = await fetch("/api/automation/webhooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), url: url.trim() }),
        });
        if (!res.ok) { setError(t("webhooks.errCreateFailed")); return; }
        setName(""); setUrl(""); setShowForm(false); setError("");
        router.refresh();
      } catch { setError(t("webhooks.errNetwork")); }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("webhooks.heading", { count: webhooks.length })}</h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {showForm ? t("webhooks.cancel") : t("webhooks.register")}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold">{t("webhooks.registerNew")}</h3>
          <div>
            <label className="block text-sm font-medium mb-1">{t("webhooks.nameLabel")}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t("webhooks.namePlaceholder")}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t("webhooks.urlLabel")}</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              placeholder={t("webhooks.urlPlaceholder")}
              type="url"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={pending}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-60"
          >
            {pending ? t("webhooks.creating") : t("webhooks.createWebhook")}
          </button>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("webhooks.colName")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("webhooks.colUrl")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("webhooks.colStatus")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("webhooks.colFailures")}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("webhooks.colLastDelivered")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {webhooks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{t("webhooks.empty")}</td>
              </tr>
            ) : (
              webhooks.map(wh => (
                <tr key={wh.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{wh.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono truncate max-w-xs">{wh.url}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${wh.isActive ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-slate-500/15 text-slate-600 dark:text-slate-400"}`}>
                      {wh.isActive ? t("webhooks.active") : t("webhooks.inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{wh.failureCount}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {wh.lastDeliveredAt ? new Date(wh.lastDeliveredAt).toLocaleString() : t("webhooks.never")}
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
