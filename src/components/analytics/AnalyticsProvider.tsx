"use client";

import { useEffect, useState } from "react";
import { updateConsent }       from "@/lib/analytics/gtag";
import { GoogleTagManager }    from "./GoogleTagManager";

interface ConsentPrefs {
  analytics: boolean;
  marketing: boolean;
}

interface Props {
  gaId: string;
}

export function AnalyticsProvider({ gaId }: Props) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!gaId) {
      console.log("[GA] AnalyticsProvider: no gaId — analytics disabled");
      return;
    }
    console.log("[GA] AnalyticsProvider mounted. gaId:", gaId);

    async function checkConsent() {
      try {
        const res  = await fetch("/api/compliance/cookie-consent");
        const data = await res.json() as { consent?: ConsentPrefs | null };
        const granted = data.consent?.analytics === true;
        console.log("[GA] checkConsent resolved: analytics=", granted);
        if (granted) {
          setAllowed(true);
          activateGA4(gaId);
        }
      } catch (err) {
        console.log("[GA] checkConsent failed:", err);
      }
    }
    void checkConsent();

    function onConsentUpdate(e: Event) {
      const prefs   = (e as CustomEvent<ConsentPrefs>).detail;
      const granted = prefs.analytics === true;
      console.log("[GA] hermes:consent-updated: analytics=", granted);
      setAllowed(granted);
      if (granted) {
        activateGA4(gaId);
      } else {
        updateConsent(false);
      }
    }
    window.addEventListener("hermes:consent-updated", onConsentUpdate);
    return () => window.removeEventListener("hermes:consent-updated", onConsentUpdate);
  }, [gaId]);

  // GA4 script is loaded from SSR <head>; GTM still needs client-side injection
  if (!allowed) return null;
  return <GoogleTagManager />;
}

// Called after user grants analytics consent. The gtag.js script is already
// in the page (injected by layout SSR), so we just update consent mode and
// call gtag.config to start sending hits.
function activateGA4(gaId: string): void {
  console.log("[GA] activateGA4 called. window.gtag=", typeof window.gtag);

  function run(): void {
    if (typeof window.gtag !== "function") {
      // gtag.js is async — wait for window.load if not yet executed
      console.log("[GA] window.gtag not ready yet — deferring to window.load");
      window.addEventListener("load", run, { once: true });
      return;
    }
    window.gtag("consent", "update", {
      analytics_storage:      "granted",
      ad_storage:             "denied",
      ad_user_data:           "denied",
      ad_personalization:     "denied",
    });
    window.gtag("js", new Date());
    window.gtag("config", gaId, { anonymize_ip: true, send_page_view: true });
    console.log("[GA] GA4 activated successfully. ID:", gaId);
  }

  run();
}
