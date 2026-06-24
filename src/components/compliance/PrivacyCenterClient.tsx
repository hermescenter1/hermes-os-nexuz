"use client";

import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";

interface ConsentRow { id: string; consentType: string; granted: boolean; createdAt: string; consentVersion: string; }

export function PrivacyCenterClient() {
  const [records, setRecords] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [email,     setEmail]     = useState("");
  const [msg,       setMsg]       = useState("");

  useEffect(() => {
    fetch("/api/compliance/consents")
      .then((r) => r.json())
      .then((d: { records?: ConsentRow[] }) => { setRecords(d.records ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function requestExport() {
    setExporting(true);
    const res  = await fetch("/api/compliance/data-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { message?: string };
    setMsg(data.message ?? "Export requested.");
    setExporting(false);
  }

  async function requestDeletion() {
    if (!confirm("Are you sure? Data deletion is irreversible.")) return;
    setDeleting(true);
    const res  = await fetch("/api/compliance/data-deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json() as { message?: string };
    setMsg(data.message ?? "Deletion requested.");
    setDeleting(false);
  }

  const grouped = records.reduce<Record<string, ConsentRow>>((acc, r) => {
    if (!acc[r.consentType] || new Date(r.createdAt) > new Date(acc[r.consentType].createdAt)) {
      acc[r.consentType] = r;
    }
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-signal/70 mb-2">HERMES OS · PRIVACY CENTER</p>
        <h1 className="font-mono text-2xl font-bold text-ink mb-2">My Privacy Center</h1>
        <p className="text-sm text-muted">Manage your consent records, request your data, and exercise your GDPR rights.</p>
      </div>

      {msg && (
        <div className="rounded-xl border border-signal/30 bg-signal/5 p-4 text-sm text-signal">{msg}</div>
      )}

      {/* Consent history */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">Current Consent Status</h2>
        {loading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-muted text-sm">No consent records found.</p>
        ) : (
          <div className="rounded-xl border border-line overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-bg border-b border-line">
                  {["Type", "Status", "Version", "Date"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-muted/70">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Object.values(grouped).map((r) => (
                  <tr key={r.id} className="hover:bg-bg/50">
                    <td className="px-4 py-3 font-mono text-ink">{r.consentType.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[9px] font-mono uppercase ${r.granted ? "bg-signal/10 text-signal" : "bg-danger/10 text-danger"}`}>
                        {r.granted ? "Granted" : "Withdrawn"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">{r.consentVersion}</td>
                    <td className="px-4 py-3 text-muted">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Data rights */}
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted/70">Your Data Rights</h2>
        <div>
          <label className="kpi-label mb-1 block">EMAIL ADDRESS</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal max-w-sm"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={requestExport}
            disabled={exporting || !email}
            className="rounded-xl border border-line bg-surface p-4 text-left hover:border-signal/30 transition-colors disabled:opacity-50 space-y-1.5"
          >
            <p className="font-mono text-xs font-semibold text-ink">📦 Export My Data</p>
            <p className="text-[11px] text-muted">Download a complete copy of your personal data (GDPR Art. 20)</p>
            {exporting && <p className="text-[10px] text-signal">Submitting…</p>}
          </button>
          <button
            onClick={requestDeletion}
            disabled={deleting || !email}
            className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-left hover:border-danger/40 transition-colors disabled:opacity-50 space-y-1.5"
          >
            <p className="font-mono text-xs font-semibold text-danger">🗑 Delete My Data</p>
            <p className="text-[11px] text-muted">Request permanent erasure of all your personal data (GDPR Art. 17)</p>
            {deleting && <p className="text-[10px] text-danger">Submitting…</p>}
          </button>
        </div>
        <p className="text-[11px] text-muted leading-relaxed">
          Or{" "}
          <Link href="/data-request" className="text-signal hover:underline">
            submit a detailed privacy request →
          </Link>
        </p>
      </section>
    </div>
  );
}
