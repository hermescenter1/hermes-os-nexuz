"use client";

import { useState, useEffect } from "react";
import { useTranslations }      from "next-intl";
import { Link }                 from "@/i18n/navigation";

interface Prefs { necessary: boolean; analytics: boolean; marketing: boolean; preferences: boolean; }

const DEFAULT_PREFS: Prefs = { necessary: true, analytics: false, marketing: false, preferences: false };

// localStorage key for consent fallback — used when DB is unavailable or slow.
const CONSENT_KEY = "hermes_cookie_consent";

function readLocalConsent(): Prefs | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw ? (JSON.parse(raw) as Prefs) : null;
  } catch { return null; }
}

function writeLocalConsent(prefs: Prefs): void {
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(prefs)); } catch { /* quota / incognito */ }
}

export function CookieConsentBanner() {
  const t = useTranslations("adminGovernance.cookieConsent");
  const [visible,     setVisible]     = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [prefs,       setPrefs]       = useState<Prefs>(DEFAULT_PREFS);
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    function applyLocalConsent(local: Prefs) {
      // Re-dispatch so AnalyticsProvider picks up the stored prefs
      window.dispatchEvent(new CustomEvent("hermes:consent-updated", { detail: local }));
    }

    fetch("/api/compliance/cookie-consent")
      .then((r) => r.json())
      .then((d: { consent?: Prefs | null }) => {
        if (d.consent) return; // DB has consent — banner stays hidden
        // DB returned null. Check localStorage fallback before showing banner.
        const local = readLocalConsent();
        if (local) { applyLocalConsent(local); return; }
        setVisible(true);
      })
      .catch(() => {
        // API unreachable — fall back to localStorage
        const local = readLocalConsent();
        if (local) { applyLocalConsent(local); return; }
        setVisible(true);
      });
  }, []);

  async function save(accepted: Prefs) {
    setSaving(true);
    try {
      await fetch("/api/compliance/cookie-consent", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(accepted),
      });
    } catch {
      // Network error — consent is still saved locally below
    } finally {
      setSaving(false);
    }
    // Always persist locally so consent survives regardless of DB availability
    writeLocalConsent(accepted);
    setVisible(false);
    window.dispatchEvent(new CustomEvent("hermes:consent-updated", { detail: accepted }));
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] p-4"
      role="dialog"
      aria-label={t("ariaLabel")}
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-signal/20 bg-bg/95 shadow-2xl backdrop-blur-xl p-6">
        {!customizing ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 space-y-1.5">
              <p className="font-mono text-xs uppercase tracking-widest text-signal/70">{t("title")}</p>
              <p className="text-sm text-ink leading-relaxed">
                {t("body")}{" "}
                <Link href="/cookies" className="text-signal hover:underline">{t("learnMore")}</Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={() => setCustomizing(true)}
                className="rounded-lg border border-line px-4 py-2 text-xs font-mono text-muted hover:text-ink transition-colors"
              >
                {t("customize")}
              </button>
              <button
                onClick={() => save({ necessary: true, analytics: false, marketing: false, preferences: false })}
                disabled={saving}
                className="rounded-lg border border-line px-4 py-2 text-xs font-mono text-muted hover:text-ink transition-colors disabled:opacity-50"
              >
                {t("rejectNonEssential")}
              </button>
              <button
                onClick={() => save({ necessary: true, analytics: true, marketing: true, preferences: true })}
                disabled={saving}
                className="rounded-lg bg-signal px-4 py-2 text-xs font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
              >
                {saving ? t("saving") : t("acceptAll")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold text-ink">{t("preferencesTitle")}</h2>
              <button onClick={() => setCustomizing(false)} className="text-muted hover:text-ink text-xs font-mono transition-colors">{t("back")}</button>
            </div>
            <div className="space-y-3">
              {([
                { key: "necessary",   locked: true },
                { key: "analytics",   locked: false },
                { key: "marketing",   locked: false },
                { key: "preferences", locked: false },
              ] as const).map(({ key, locked }) => (
                <div key={key} className="flex items-start gap-4 rounded-lg bg-surface p-3">
                  <div className="flex-1">
                    <p className="text-xs font-mono font-semibold text-ink">{t(`categories.${key}.label`)}</p>
                    <p className="text-[11px] text-muted mt-0.5">{t(`categories.${key}.desc`)}</p>
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
                {saving ? t("saving") : t("savePreferences")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
