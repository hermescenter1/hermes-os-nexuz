"use client";

import { useEffect, useState } from "react";
import type { CustomerActivityLog } from "@/lib/customer-portal/types";

const EVENT_ICONS: Record<string, string> = {
  customer_portal_view:             "⬡",
  customer_project_view:            "◉",
  customer_support_ticket_created:  "◎",
  customer_support_message_sent:    "◈",
  customer_document_view:           "▦",
  customer_subscription_view:       "◆",
  customer_training_view:           "▤",
  customer_settings_updated:        "◬",
};

export function CustomerActivityClient() {
  const [activity, setActivity] = useState<CustomerActivityLog[]>([]);
  const [loading, setLoading]   = useState(true);
  const [noAccount, setNoAccount] = useState(false);

  useEffect(() => {
    fetch("/api/customer/activity?take=100")
      .then((r) => r.json())
      .then((d: { activity?: CustomerActivityLog[]; noAccount?: boolean }) => {
        if (d.noAccount) { setNoAccount(true); return; }
        setActivity(d.activity ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg border border-line bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (noAccount) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-ink">No Account Found</h2>
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center space-y-2">
        <h2 className="text-lg font-bold text-ink">No Activity Yet</h2>
        <p className="text-sm text-muted">Your portal activity will be recorded here.</p>
      </div>
    );
  }

  // Group by date
  const groups = activity.reduce<Record<string, CustomerActivityLog[]>>((acc, log) => {
    const date = new Date(log.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    (acc[date] ??= []).push(log);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([date, logs]) => (
        <div key={date}>
          <p className="font-mono text-xs uppercase tracking-widest text-faint mb-3">{date}</p>
          <div className="rounded-xl border border-line bg-surface divide-y divide-line">
            {logs.map((log) => (
              <div key={log.id} className="px-5 py-3.5 flex items-center gap-3">
                <span className="shrink-0 font-mono text-xs text-signal">
                  {EVENT_ICONS[log.eventType] ?? "◬"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">{log.description}</p>
                  <p className="text-xs text-faint font-mono">{log.eventType}</p>
                </div>
                <span className="shrink-0 text-xs text-faint">
                  {new Date(log.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
