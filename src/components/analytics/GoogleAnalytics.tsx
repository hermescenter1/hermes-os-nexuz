"use client";

import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/analytics/config";
import { initGtag }          from "@/lib/analytics/gtag";

export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      strategy="afterInteractive"
      onLoad={() => { initGtag(GA_MEASUREMENT_ID); }}
    />
  );
}
