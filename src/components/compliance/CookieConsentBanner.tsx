"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations }      from "next-intl";
import { Link }                 from "@/i18n/navigation";
import { layerStyle }           from "@/components/ds/layers";
import { useAnyModalOverlayOpen } from "@/components/ds/overlay";
import { COOKIE_PREFERENCES_OPEN_EVENT } from "./cookie-preferences";

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

/**
 * PHASE 113 — normalise anything that claims to be a consent record.
 *
 * The stored value can come from a previous catalog version, from a hand-edited
 * localStorage entry, or from the API. `necessary` is forced true because it is
 * not a choice, and every optional category must be an explicit `true` to count
 * as granted — a truthy string or a missing key resolves to "not granted", so a
 * malformed record can never silently enable analytics or marketing. Mirrors
 * `normalizeConsent` in `AnalyticsProvider`.
 */
function normalizePrefs(value: unknown): Prefs {
  const input = (value && typeof value === "object" ? value : {}) as Partial<Prefs>;
  return {
    necessary:   true,
    analytics:   input.analytics   === true,
    marketing:   input.marketing   === true,
    preferences: input.preferences === true,
  };
}

export function CookieConsentBanner() {
  const t = useTranslations("adminGovernance.cookieConsent");
  const [visible,     setVisible]     = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [prefs,       setPrefs]       = useState<Prefs>(DEFAULT_PREFS);
  const [saving,      setSaving]      = useState(false);

  /* PHASE 104 R1 - the consent notice stands down while a modal overlay is
     open. It used to sit at z-[9999], above every modal in the product, so it
     painted over the open mobile navigation drawer (hiding navigation items)
     and over the command palette's own scrim - two interactive surfaces
     competing at once, with the one the user did NOT open on top.
     The layer contract (LAYER.consent, below LAYER.overlay) is the structural
     half of the fix; this is the behavioural half, because a notice merely
     dimmed behind a scrim is still a second dialog on screen. Consent is not
     dismissed or auto-answered - it returns unchanged when the modal closes. */
  const modalOpen = useAnyModalOverlayOpen();

  /* PHASE 113 — the consent already on record, kept so that REOPENING the
     preferences view shows what the visitor actually chose.

     Before this, `prefs` was seeded once from DEFAULT_PREFS (every optional
     category off) and never re-seeded. With no reopen path that was invisible;
     with one it would be a silent downgrade — a visitor who had accepted
     analytics, opening preferences to change marketing, would have been shown
     analytics as OFF and would have saved that unintended withdrawal.

     A ref, not state: it must be readable from the event handler installed in
     the same effect without making that effect depend on it (which would tear
     down and reinstall the listener on every consent change). */
  const storedPrefs = useRef<Prefs | null>(null);

  useEffect(() => {
    function applyLocalConsent(local: Prefs) {
      // Re-dispatch so AnalyticsProvider picks up the stored prefs
      window.dispatchEvent(new CustomEvent("hermes:consent-updated", { detail: local }));
    }

    /* PHASE 113 — reopen. The banner stays the ONE consent surface: this opens
       the SAME preferences view with the SAME save path, seeded from the stored
       record. It bypasses the "has consent?" check on purpose — the visitor is
       asking to revisit a decision they have already made. */
    function onReopenRequested() {
      setPrefs(storedPrefs.current ?? DEFAULT_PREFS);
      setCustomizing(true);
      setVisible(true);
    }
    window.addEventListener(COOKIE_PREFERENCES_OPEN_EVENT, onReopenRequested);

    fetch("/api/compliance/cookie-consent", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { consent?: Prefs | null }) => {
        if (d.consent) {
          // DB has consent — banner stays hidden, but remember the choice so a
          // reopen shows it rather than the all-off defaults.
          storedPrefs.current = normalizePrefs(d.consent);
          return;
        }
        // DB returned null. Check localStorage fallback before showing banner.
        const local = readLocalConsent();
        if (local) {
          storedPrefs.current = normalizePrefs(local);
          applyLocalConsent(storedPrefs.current);
          return;
        }
        setVisible(true);
      })
      .catch(() => {
        // API unreachable — fall back to localStorage
        const local = readLocalConsent();
        if (local) {
          storedPrefs.current = normalizePrefs(local);
          applyLocalConsent(storedPrefs.current);
          return;
        }
        setVisible(true);
      });

    return () => {
      window.removeEventListener(COOKIE_PREFERENCES_OPEN_EVENT, onReopenRequested);
    };
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
    // PHASE 113 — the new choice becomes the record a later reopen is seeded
    // from, so preferences can be changed repeatedly within one page view.
    storedPrefs.current = accepted;
    setVisible(false);
    setCustomizing(false);
    window.dispatchEvent(new CustomEvent("hermes:consent-updated", { detail: accepted }));
  }

  if (!visible || modalOpen) return null;

  return (
    <div
      // PHASE 104 R1 - LAYER.consent (90): above the page and its chrome,
      // below every modal overlay. See components/ds/layers.ts.
      style={layerStyle("consent")}
      className="fixed bottom-0 left-0 right-0 p-2 sm:p-4"
      role="dialog"
      aria-label={t("ariaLabel")}
    >
      {/* PHASE 104 R1 - compact small-screen presentation. At 320x800 the
          notice used to take roughly 45% of the first screen. Every legal
          choice is still present and still 44px tall; what shrinks is padding,
          the decorative eyebrow (the dialog is already named by aria-label)
          and the body, which clamps to three lines with the full text one tap
          away under Customize. */}
      <div className="mx-auto max-w-4xl rounded-sm border border-signal/20 bg-bg/95 shadow-2xl backdrop-blur-xl p-3 sm:p-6">
        {!customizing ? (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex-1 space-y-1.5">
              <p className="hidden font-mono text-xs uppercase tracking-widest text-signal/70 sm:block">{t("title")}</p>
              <p className="line-clamp-3 text-sm text-ink leading-relaxed sm:line-clamp-none">
                {t("body")}{" "}
                <Link href="/cookies" className="text-signal hover:underline">{t("learnMore")}</Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0 max-sm:[&>button]:flex-1">
              <button
                data-consent-action="customize"
                onClick={() => setCustomizing(true)}
                className="ds-focus inline-flex min-h-11 items-center justify-center rounded-xs border border-line px-4 py-2 text-xs font-mono text-muted hover:text-ink transition-colors"
              >
                {t("customize")}
              </button>
              <button
                data-consent-action="reject-non-essential"
                onClick={() => save({ necessary: true, analytics: false, marketing: false, preferences: false })}
                disabled={saving}
                className="ds-focus inline-flex min-h-11 items-center justify-center rounded-xs border border-line px-4 py-2 text-xs font-mono text-muted hover:text-ink transition-colors disabled:opacity-50"
              >
                {t("rejectNonEssential")}
              </button>
              <button
                data-consent-action="accept-all"
                onClick={() => save({ necessary: true, analytics: true, marketing: true, preferences: true })}
                disabled={saving}
                className="ds-focus inline-flex min-h-11 items-center justify-center rounded-xs bg-signal px-4 py-2 text-xs font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
              >
                {saving ? t("saving") : t("acceptAll")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold text-ink">{t("preferencesTitle")}</h2>
              <button onClick={() => setCustomizing(false)} className="ds-focus inline-flex min-h-11 items-center text-muted hover:text-ink text-xs font-mono transition-colors">{t("back")}</button>
            </div>
            <div className="space-y-3">
              {([
                { key: "necessary",   locked: true },
                { key: "analytics",   locked: false },
                { key: "marketing",   locked: false },
                { key: "preferences", locked: false },
              ] as const).map(({ key, locked }) => (
                <div key={key} className="flex items-start gap-4 rounded-xs bg-surface p-3">
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
                className="ds-focus inline-flex min-h-11 items-center justify-center rounded-xs bg-signal px-6 py-2 text-xs font-mono font-semibold text-bg hover:bg-signal/90 transition-colors disabled:opacity-50"
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
