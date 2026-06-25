"use client";

import { useEffect }                    from "react";
import { GA_MEASUREMENT_ID }            from "@/lib/analytics/config";
import { initGtag, updateConsent }      from "@/lib/analytics/gtag";

// GA4 is injected via direct DOM manipulation so it reliably loads regardless of
// when this component is mounted (dynamically, post-hydration, after consent grant).
export function GoogleAnalytics() {
  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;

    // Guard against double-injection (React StrictMode, re-mount)
    if (document.querySelector(`script[data-ga-id="${GA_MEASUREMENT_ID}"]`)) {
      if (typeof window.gtag !== "function") initGtag(GA_MEASUREMENT_ID);
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-ga-id", GA_MEASUREMENT_ID);
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    script.onload = () => {
      initGtag(GA_MEASUREMENT_ID);
      // Formally grant analytics storage after the script is loaded and initialized
      updateConsent(true);
    };
    document.head.appendChild(script);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
