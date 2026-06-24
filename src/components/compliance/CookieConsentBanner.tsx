"use client";

import { useState, useEffect } from "react";
import { Link }                 from "@/i18n/navigation";

interface Prefs { necessary: boolean; analytics: boolean; marketing: boolean; preferences: boolean; }

const DEFAULT_PREFS: Prefs = { necessary: true, analytics: false, marketing: false, preferences: false };

export function CookieConsentBanner() {
  const [visible,      setVisible]      = useState(false);
  const [customizing,  setCustomizing]  = useState(false);
  const [prefs,        setPrefs]        = useState<Prefs>(DEFAULT_PREFS);
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    // Check existing consent
    fetch("/api/compliance/cookie-consent")
      .then((r) => r.json())
      .then((d: { consent?: Prefs | null }) => {
        if (!d.consent) setVisible(true);
      })
      .catch(() => setVisible(true));
  }, []);

  async function save(accepted: Prefs) {
    setSaving(true);
    await fetch("/api/compliance/cookie-consent", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(accepted),
    });
    setSaving(false);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] p-4"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-signal/20 bg-bg/95 shadow-2xl backdrop-blur-xl p-6">
        {!customizing ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-1.5">
              <p className="font-mono text-xs uppercase tracking-widest text-signal/70">Cookie Consent</p>
              <p className="text-sm text-ink leading-relaxed">
                Hermes OS uses cookies for essential functions, analytics, and personalization.
                You control what we store.{" "}
                <Link href="/cookies" className="text-signal hover:underline">Learn more</Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={() => setCustomizing(true)}
                className="rounded-lg border border-line px-4 py-2 text-xs font-mono text-muted hover:text-ink transition-colors"
              >
                Customize
              </button>
              <button
                onClick={() => save({ necessary: true, analytics: false, marketing: false, preferences: false })}
                disabled={saving}
                className="rounded-lg border border-line px-4 py-2 text-xs font-mono text-muted hover:text-ink transition-colors disabled:opacity-50"
              >
                Reject Non-Essential
              </button>
              <button
                onClick={() => save({ necessary: true, analytics: true, marketing: true, preferences: true })}
                disabled={saving}
                className="rounded-lg bg-signal px-4 py-2 text-xs font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Accept All"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold text-ink">Cookie Preferences</h2>
              <button onClick={() => setCustomizing(false)} className="text-muted hover:text-ink text-xs font-mono transition-colors">← Back</button>
            </div>
            <div className="space-y-3">
              {([
                { key: "necessary",   label: "Necessary",   desc: "Essential for the site to function. Cannot be disabled.", locked: true },
                { key: "analytics",   label: "Analytics",   desc: "Help us understand how visitors use the site (anonymized).", locked: false },
                { key: "marketing",   label: "Marketing",   desc: "Allow us to show relevant offers and communications.", locked: false },
                { key: "preferences", label: "Preferences", desc: "Remember your settings and personalization choices.", locked: false },
              ] as const).map(({ key, label, desc, locked }) => (
                <div key={key} className="flex items-start gap-4 rounded-lg bg-surface p-3">
                  <div className="flex-1">
                    <p className="text-xs font-mono font-semibold text-ink">{label}</p>
                    <p className="text-[11px] text-muted mt-0.5">{desc}</p>
                  </div>
                  <label className="relative flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={prefs[key]}
                      disabled={locked}
                      onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className={`w-9 h-5 rounded-full transition-colors peer-checked:bg-signal ${locked ? "bg-signal/50 opacity-60 cursor-not-allowed" : "bg-line"}`} />
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                  </label>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => save(prefs)}
                disabled={saving}
                className="rounded-lg bg-signal px-6 py-2 text-xs font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Preferences"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
