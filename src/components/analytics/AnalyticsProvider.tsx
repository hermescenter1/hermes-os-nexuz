"use client";

import { useEffect, useState } from "react";
import { analyticsEnabled }    from "@/lib/analytics/config";
import { updateConsent }       from "@/lib/analytics/gtag";
import { GoogleAnalytics }     from "./GoogleAnalytics";
import { GoogleTagManager }    from "./GoogleTagManager";

interface ConsentPrefs {
  analytics: boolean;
  marketing: boolean;
}

export function AnalyticsProvider() {
  const [ready,   setReady]   = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!analyticsEnabled) return;

    async function checkConsent() {
      try {
        const res  = await fetch("/api/compliance/cookie-consent");
        const data = await res.json() as { consent?: ConsentPrefs | null };
        setAllowed(data.consent?.analytics === true);
      } catch {
        setAllowed(false);
      } finally {
        setReady(true);
      }
    }

    void checkConsent();

    function onConsentUpdate(e: Event) {
      const prefs = (e as CustomEvent<ConsentPrefs>).detail;
      const granted = prefs.analytics === true;
      setAllowed(granted);
      updateConsent(granted);
    }

    window.addEventListener("hermes:consent-updated", onConsentUpdate);
    return () => window.removeEventListener("hermes:consent-updated", onConsentUpdate);
  }, []);

  if (!analyticsEnabled || !ready || !allowed) return null;

  return (
    <>
      <GoogleAnalytics />
      <GoogleTagManager />
    </>
  );
}
