"use client";

import { useEffect, useState } from "react";
import {
  gtagReady,
  initGtag,
  updateConsent,
  type GoogleConsentPrefs,
} from "@/lib/analytics/gtag";
import { GoogleTagManager } from "./GoogleTagManager";

interface ConsentPrefs extends GoogleConsentPrefs {
  necessary: boolean;
}

interface Props {
  gaId: string;
}

const CONSENT_KEY = "hermes_cookie_consent";

const DEFAULT_PREFS: ConsentPrefs = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
};

let configuredMeasurementId = "";

function normalizeConsent(value: unknown): ConsentPrefs {
  if (!value || typeof value !== "object") {
    return DEFAULT_PREFS;
  }

  const input = value as Partial<ConsentPrefs>;

  return {
    necessary: true,
    analytics: input.analytics === true,
    marketing: input.marketing === true,
    preferences: input.preferences === true,
  };
}

function readLocalConsent(): ConsentPrefs | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);

    if (!raw) return null;

    return normalizeConsent(JSON.parse(raw));
  } catch {
    return null;
  }
}

function applyGoogleConsent(
  gaId: string,
  prefs: ConsentPrefs,
): void {
  let attempts = 0;

  function run(): void {
    if (!gtagReady()) {
      attempts += 1;

      if (attempts <= 40) {
        window.setTimeout(run, 50);
      } else {
        console.error("[GA] gtag was not ready after consent update");
      }

      return;
    }

    // Always forward the complete choice, including denials.
    updateConsent(prefs);

    // GA4 configuration and page_view only run after analytics consent.
    if (
      prefs.analytics &&
      configuredMeasurementId !== gaId
    ) {
      initGtag(gaId);
      configuredMeasurementId = gaId;

      console.log("[GA] GA4 activated successfully. ID:", gaId);
    }
  }

  run();
}

export function AnalyticsProvider({ gaId }: Props) {
  const [gtmAllowed, setGtmAllowed] = useState(false);

  useEffect(() => {
    if (!gaId) {
      console.log(
        "[GA] AnalyticsProvider: no gaId — analytics disabled",
      );
      return;
    }

    function apply(prefs: ConsentPrefs): void {
      setGtmAllowed(prefs.analytics || prefs.marketing);
      applyGoogleConsent(gaId, prefs);
    }

    async function checkConsent(): Promise<void> {
      /*
       * The local browser choice is authoritative when present.
       * This is important for explicit rejection: a stale DB value
       * must never override a newer local denial.
       */
      const local = readLocalConsent();

      if (local) {
        console.log("[GA] Applying consent from localStorage");
        apply(local);
        return;
      }

      try {
        const response = await fetch(
          "/api/compliance/cookie-consent",
          {
            credentials: "same-origin",
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            `Consent API returned ${response.status}`,
          );
        }

        const data = (await response.json()) as {
          consent?: ConsentPrefs | null;
        };

        if (data.consent) {
          console.log("[GA] Applying consent from database");
          apply(normalizeConsent(data.consent));
          return;
        }

        // Explicitly preserve denied defaults when no choice exists.
        updateConsent(DEFAULT_PREFS);
      } catch (error) {
        console.log("[GA] Consent API failed:", error);
        updateConsent(DEFAULT_PREFS);
      }
    }

    function onConsentUpdate(event: Event): void {
      const customEvent =
        event as CustomEvent<ConsentPrefs>;

      const prefs = normalizeConsent(customEvent.detail);

      console.log("[GA] Applying updated consent", {
        analytics: prefs.analytics,
        marketing: prefs.marketing,
        preferences: prefs.preferences,
      });

      apply(prefs);
    }

    void checkConsent();

    window.addEventListener(
      "hermes:consent-updated",
      onConsentUpdate,
    );

    return () => {
      window.removeEventListener(
        "hermes:consent-updated",
        onConsentUpdate,
      );
    };
  }, [gaId]);

  if (!gtmAllowed) return null;

  return <GoogleTagManager />;
}
