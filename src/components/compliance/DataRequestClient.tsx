"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type RequestType = "DATA_EXPORT" | "DATA_DELETION" | "CONSENT_WITHDRAWAL" | "ACCESS_REQUEST" | "CORRECTION_REQUEST";

// Raw API request-type values; display labels come from
// adminGovernance.dataRequest.types.<VALUE>.{label,desc}.
const TYPE_VALUES: RequestType[] = [
  "ACCESS_REQUEST", "DATA_EXPORT", "CORRECTION_REQUEST", "CONSENT_WITHDRAWAL", "DATA_DELETION",
];

export function DataRequestClient() {
  const t = useTranslations("adminGovernance.dataRequest");
  const [type,        setType]        = useState<RequestType>("ACCESS_REQUEST");
  const [email,       setEmail]       = useState("");
  const [description, setDescription] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [success,     setSuccess]     = useState("");
  const [error,       setError]       = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) { setError(t("emailRequired")); return; }
    setSubmitting(true); setError("");
    const res  = await fetch("/api/compliance/privacy-requests", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ requestType: type, email, description }),
    });
    const data = await res.json() as { message?: string; error?: string };
    if (res.ok) {
      setSuccess(data.message ?? t("receivedFallback"));
      setEmail(""); setDescription("");
    } else {
      setError(data.error ?? t("failedFallback"));
    }
    setSubmitting(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-signal/70 mb-2">{t("eyebrow")}</p>
      <h1 className="font-mono text-2xl font-bold text-ink mb-3">{t("title")}</h1>
      <p className="text-sm text-muted mb-8 leading-relaxed">
        {t("lede")}
      </p>

      {success ? (
        <div className="rounded-xl border border-signal/30 bg-signal/5 p-6 text-center space-y-3">
          <div className="text-3xl">✓</div>
          <p className="text-signal font-mono text-sm">{success}</p>
          <button onClick={() => setSuccess("")} className="text-xs text-muted hover:text-ink font-mono transition-colors">{t("submitAnother")}</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <label className="kpi-label block">{t("requestType")}</label>
            <div className="space-y-2">
              {TYPE_VALUES.map((value) => (
                <label key={value} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${type === value ? "border-signal/40 bg-signal/5" : "border-line bg-surface hover:border-line/70"}`}>
                  <input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} className="mt-0.5 accent-signal shrink-0" />
                  <div>
                    <p className="text-xs font-mono font-semibold text-ink">{t(`types.${value}.label`)}</p>
                    <p className="text-[11px] text-muted mt-0.5">{t(`types.${value}.desc`)}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="kpi-label mb-1 block">{t("emailLabel")}</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="kpi-label mb-1 block">{t("detailsLabel")}</label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={4} className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-signal resize-none"
              placeholder={t("detailsPlaceholder")}
            />
          </div>

          {error && <p className="rounded-lg bg-danger/10 p-3 text-xs text-danger">{error}</p>}

          <button
            type="submit" disabled={submitting}
            className="w-full rounded-lg bg-signal py-3 text-sm font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>

          <p className="text-[11px] text-muted text-center leading-relaxed">
            {t("verifyNote")} <span className="text-ink">privacy@hermes-os.io</span>
          </p>
        </form>
      )}
    </div>
  );
}
