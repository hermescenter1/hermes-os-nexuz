"use client";

import { useEffect } from "react";
import { GTM_ID }    from "@/lib/analytics/config";

export function GoogleTagManager() {
  useEffect(() => {
    if (!GTM_ID) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.dataLayer = (window.dataLayer as any[]) ?? [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });

    const s = document.createElement("script");
    s.async = true;
    s.src   = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
    document.head.appendChild(s);
  }, []);

  if (!GTM_ID) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
