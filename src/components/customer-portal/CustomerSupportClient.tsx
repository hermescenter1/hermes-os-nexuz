"use client";

import { useEffect, useState, useRef } from "react";
import { Link }                        from "@/i18n/navigation";
import type { CustomerSupportTicket }  from "@/lib/customer-portal/types";

const PRIORITY_COLORS: Record<string, string> = {
  LOW:      "border-line text-faint",
  MEDIUM:   "border-ice/30 bg-ice/10 text-ice",
  HIGH:     "border-amber-400/30 bg-amber-400/10 text-amber-400",
  CRITICAL: "border-red-500/30 bg-red-500/10 text-red-400",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN:             "border-signal/30 bg-signal/10 text-signal",
  IN_PROGRESS:      "border-ice/30 bg-ice/10 text-ice",
  WAITING_CUSTOMER: "border-amber-400/30 bg-amber-400/10 text-amber-400",
  RESOLVED:         "border-line bg-surface-2 text-muted",
  CLOSED:           "border-line text-faint",
};

const TICKET_CATEGORIES = ["GENERAL", "TECHNICAL", "BILLING", "ONBOARDING", "FEATURE_REQUEST", "BUG_REPORT", "TRAINING"];

export function CustomerSupportClient() {
  const [tickets, setTickets]   = useState<CustomerSupportTicket[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [noAccount, setNoAccount]   = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/customer/support");
      const d = await r.json() as { tickets?: CustomerSupportTicket[]; noAccount?: boolean };
      if (d.noAccount) { setNoAccount(true); return; }
      setTickets(d.tickets ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/customer/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       fd.get("title"),
          description: fd.get("description"),
          priority:    fd.get("priority"),
          category:    fd.get("category"),
        }),
      });
      if (r.ok) {
        setShowForm(false);
        formRef.current?.reset();
        await load();
      }
    } catch { /* ignore */ } finally { setSubmitting(false); }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-line bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (noAccount) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-ink">No Account Found</h2>
        <p className="mt-2 text-sm text-muted">Contact your account manager to access support.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + create */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-faint">Support Center</p>
          <p className="text-sm text-muted mt-0.5">{tickets.length} ticket{tickets.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors"
        >
          {showForm ? "Cancel" : "+ New Ticket"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form ref={formRef} onSubmit={(e) => void handleSubmit(e)} className="rounded-xl border border-signal/30 bg-surface p-6 space-y-4">
          <p className="font-mono text-xs uppercase tracking-widest text-faint">New Support Ticket</p>
          <input name="title" required minLength={3} maxLength={200} placeholder="Issue title" className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-signal focus:outline-none" />
          <textarea name="description" required minLength={10} rows={4} placeholder="Describe the issue in detail..." className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-signal focus:outline-none resize-none" />
          <div className="grid grid-cols-2 gap-4">
            <select name="priority" defaultValue="MEDIUM" className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-ink focus:border-signal focus:outline-none">
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select name="category" defaultValue="GENERAL" className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-ink focus:border-signal focus:outline-none">
              {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
          </div>
          <button type="submit" disabled={submitting} className="rounded-lg bg-signal px-6 py-2.5 text-sm font-semibold text-bg disabled:opacity-50 hover:bg-signal/90 transition-colors">
            {submitting ? "Submitting…" : "Submit Ticket"}
          </button>
        </form>
      )}

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center space-y-2">
          <h2 className="text-lg font-bold text-ink">No Support Tickets</h2>
          <p className="text-sm text-muted">Open a ticket whenever you need assistance.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Link key={t.id} href={`/customer/support/${t.id}` as "/customer"}>
              <div className="rounded-xl border border-line bg-surface p-5 hover:border-signal/30 transition-colors cursor-pointer">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="font-medium text-ink">{t.title}</p>
                    <p className="text-xs text-faint mt-0.5">{t.category} · {new Date(t.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-mono font-semibold ${PRIORITY_COLORS[t.priority] ?? "border-line text-muted"}`}>{t.priority}</span>
                    <span className={`rounded border px-2 py-0.5 text-[10px] font-mono font-semibold ${STATUS_COLORS[t.status] ?? "border-line text-muted"}`}>{t.status.replace("_", " ")}</span>
                  </div>
                </div>
                {t.slaDeadline && t.status !== "RESOLVED" && t.status !== "CLOSED" && (
                  <p className="text-xs text-amber-400">SLA: {new Date(t.slaDeadline).toLocaleString()}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
