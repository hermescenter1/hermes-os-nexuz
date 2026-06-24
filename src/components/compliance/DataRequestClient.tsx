"use client";

import { useState } from "react";

type RequestType = "DATA_EXPORT" | "DATA_DELETION" | "CONSENT_WITHDRAWAL" | "ACCESS_REQUEST" | "CORRECTION_REQUEST";

const TYPES: { value: RequestType; label: string; desc: string }[] = [
  { value: "ACCESS_REQUEST",      label: "Access My Data",       desc: "Receive a copy of all personal data we hold about you." },
  { value: "DATA_EXPORT",         label: "Export My Data",       desc: "Download a machine-readable export of your data." },
  { value: "CORRECTION_REQUEST",  label: "Correct My Data",      desc: "Request correction of inaccurate personal information." },
  { value: "CONSENT_WITHDRAWAL",  label: "Withdraw Consent",     desc: "Withdraw previously given consent for data processing." },
  { value: "DATA_DELETION",       label: "Delete My Data",       desc: "Request erasure of your personal data (right to be forgotten)." },
];

export function DataRequestClient() {
  const [type,        setType]        = useState<RequestType>("ACCESS_REQUEST");
  const [email,       setEmail]       = useState("");
  const [description, setDescription] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [success,     setSuccess]     = useState("");
  const [error,       setError]       = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) { setError("Email is required."); return; }
    setSubmitting(true); setError("");
    const res  = await fetch("/api/compliance/privacy-requests", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ requestType: type, email, description }),
    });
    const data = await res.json() as { message?: string; error?: string };
    if (res.ok) {
      setSuccess(data.message ?? "Request received.");
      setEmail(""); setDescription("");
    } else {
      setError(data.error ?? "Failed to submit request.");
    }
    setSubmitting(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-signal/70 mb-2">GDPR · PRIVACY RIGHTS</p>
      <h1 className="font-mono text-2xl font-bold text-ink mb-3">Data Request Center</h1>
      <p className="text-sm text-muted mb-8 leading-relaxed">
        Exercise your privacy rights under GDPR and applicable data protection law.
        All requests are processed within 30 days.
      </p>

      {success ? (
        <div className="rounded-xl border border-signal/30 bg-signal/5 p-6 text-center space-y-3">
          <div className="text-3xl">✓</div>
          <p className="text-signal font-mono text-sm">{success}</p>
          <button onClick={() => setSuccess("")} className="text-xs text-muted hover:text-ink font-mono transition-colors">Submit another request</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <label className="kpi-label block">REQUEST TYPE</label>
            <div className="space-y-2">
              {TYPES.map((t) => (
                <label key={t.value} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${type === t.value ? "border-signal/40 bg-signal/5" : "border-line bg-surface hover:border-line/70"}`}>
                  <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="mt-0.5 accent-signal shrink-0" />
                  <div>
                    <p className="text-xs font-mono font-semibold text-ink">{t.label}</p>
                    <p className="text-[11px] text-muted mt-0.5">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="kpi-label mb-1 block">EMAIL ADDRESS *</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="kpi-label mb-1 block">ADDITIONAL DETAILS</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={4} className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal resize-none"
              placeholder="Describe your request in detail…"
            />
          </div>

          {error && <p className="rounded-lg bg-danger/10 p-3 text-xs text-danger">{error}</p>}

          <button
            type="submit" disabled={submitting}
            className="w-full rounded-lg bg-signal py-3 text-sm font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit Privacy Request"}
          </button>

          <p className="text-[11px] text-muted text-center leading-relaxed">
            We will verify your identity before processing data access or deletion requests.
            For urgent matters contact <span className="text-ink">privacy@hermes-os.io</span>
          </p>
        </form>
      )}
    </div>
  );
}
