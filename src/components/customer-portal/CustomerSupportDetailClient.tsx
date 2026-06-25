"use client";

import { useEffect, useState, useRef } from "react";
import { Link }                        from "@/i18n/navigation";
import type { CustomerSupportTicket, CustomerSupportMessage } from "@/lib/customer-portal/types";

const PRIORITY_COLORS: Record<string, string> = {
  LOW:      "border-line text-faint",
  MEDIUM:   "border-ice/30 bg-ice/10 text-ice",
  HIGH:     "border-amber-400/30 bg-amber-400/10 text-amber-400",
  CRITICAL: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function CustomerSupportDetailClient({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket]     = useState<CustomerSupportTicket | null>(null);
  const [messages, setMessages] = useState<CustomerSupportMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sending, setSending]   = useState(false);
  const [notFound, setNotFound] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function load() {
    try {
      const r = await fetch(`/api/customer/support/${ticketId}`);
      if (r.status === 404) { setNotFound(true); return; }
      const d = await r.json() as { ticket?: CustomerSupportTicket; messages?: CustomerSupportMessage[] };
      setTicket(d.ticket ?? null);
      setMessages(d.messages ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [ticketId]);

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = textRef.current?.value.trim() ?? "";
    if (!body) return;
    setSending(true);
    try {
      const r = await fetch(`/api/customer/support/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (r.ok) {
        if (textRef.current) textRef.current.value = "";
        await load();
      }
    } catch { /* ignore */ } finally { setSending(false); }
  }

  if (loading) return <div className="h-64 rounded-xl border border-line bg-surface animate-pulse" />;

  if (notFound || !ticket) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-ink">Ticket Not Found</h2>
        <Link href="/customer/support" className="mt-4 inline-block text-sm text-signal hover:underline">← Back to support</Link>
      </div>
    );
  }

  const isClosed = ticket.status === "RESOLVED" || ticket.status === "CLOSED";

  return (
    <div className="space-y-6">
      {/* Ticket header */}
      <div className="rounded-xl border border-line bg-surface p-6">
        <Link href="/customer/support" className="text-xs text-faint hover:text-signal">← Support</Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink">{ticket.title}</h2>
            <p className="text-xs text-faint mt-1">
              {ticket.category} · Created {new Date(ticket.createdAt).toLocaleString()}
            </p>
          </div>
          <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-mono font-semibold ${PRIORITY_COLORS[ticket.priority] ?? "border-line text-muted"}`}>
            {ticket.priority}
          </span>
        </div>
        <div className="mt-4 p-4 rounded-lg bg-surface-2 text-sm text-muted leading-relaxed">
          {ticket.descriptionEn}
        </div>
        {ticket.slaDeadline && !isClosed && (
          <p className="mt-3 text-xs text-amber-400">SLA Deadline: {new Date(ticket.slaDeadline).toLocaleString()}</p>
        )}
      </div>

      {/* Thread */}
      <div className="rounded-xl border border-line bg-surface">
        <div className="px-6 py-4 border-b border-line">
          <p className="font-mono text-xs uppercase tracking-widest text-faint">Message Thread</p>
        </div>
        {messages.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted">No messages yet. Add a reply below.</div>
        ) : (
          <ul className="divide-y divide-line">
            {messages.map((msg) => (
              <li key={msg.id} className={`px-6 py-4 ${msg.isInternal ? "bg-amber-400/5" : ""}`}>
                <div className="flex items-center justify-between mb-2 gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{msg.authorName}</span>
                    <span className="text-xs text-faint font-mono">{msg.authorRole}</span>
                    {msg.isInternal && (
                      <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-mono text-amber-400">Internal</span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-faint">{new Date(msg.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">{msg.body}</p>
              </li>
            ))}
          </ul>
        )}

        {/* Reply form */}
        {!isClosed && (
          <div className="px-6 py-4 border-t border-line">
            <form onSubmit={(e) => void handleSend(e)} className="space-y-3">
              <textarea
                ref={textRef}
                required
                minLength={1}
                rows={3}
                placeholder="Write a reply…"
                className="w-full rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:border-signal focus:outline-none resize-none"
              />
              <button type="submit" disabled={sending} className="rounded-lg bg-signal px-5 py-2 text-sm font-semibold text-bg disabled:opacity-50 hover:bg-signal/90 transition-colors">
                {sending ? "Sending…" : "Send Reply"}
              </button>
            </form>
          </div>
        )}
        {isClosed && (
          <div className="px-6 py-4 border-t border-line text-sm text-faint">
            This ticket is {ticket.status.toLowerCase()}. Open a new ticket if you need further assistance.
          </div>
        )}
      </div>
    </div>
  );
}
