"use client";

import Script from "next/script";
import { useCallback } from "react";

declare global {
  interface Window {
    provenExpert?: {
      proSeal: (options: {
        widgetId: string;
        language: string;
        usePageLanguage: boolean;
        bannerColor: string;
        textColor: string;
        showBackPage: boolean;
        showReviews: boolean;
        hideDate: boolean;
        hideName: boolean;
        googleStars: boolean;
        displayReviewerLastName: boolean;
        embeddedSelector: string;
      }) => void;
    };
  }
}

const PROVEN_EXPERT_WIDGET_ID =
  "556c8c4c-1239-4292-a2fb-24c03d7c8443";

const PROVEN_EXPERT_PROFILE_URL =
  "https://www.provenexpert.com/hermes-os/?utm_source=seals&utm_campaign=embedded-proseal&utm_medium=profile&utm_content=556c8c4c-1239-4292-a2fb-24c03d7c8443";

export default function ProvenExpertSeal() {
  const initialiseSeal = useCallback(() => {
    const container = document.getElementById("proSealWidget");

    if (!container || !window.provenExpert?.proSeal) {
      return;
    }

    // جلوگیری از نمایش چندباره ویجت هنگام جابه‌جایی بین صفحات
    container.replaceChildren();

    window.provenExpert.proSeal({
      widgetId: PROVEN_EXPERT_WIDGET_ID,
      language: "en-GB",
      usePageLanguage: false,
      bannerColor: "#097E92",
      textColor: "#FFFFFF",
      showBackPage: false,
      showReviews: true,
      hideDate: true,
      hideName: false,
      googleStars: false,
      displayReviewerLastName: false,
      embeddedSelector: "#proSealWidget",
    });
  }, []);

  return (
    <div
      className="flex min-h-[220px] w-full items-center justify-center"
      aria-label="Hermes OS customer reviews on ProvenExpert"
    >
      <noscript>
        <a
          href={PROVEN_EXPERT_PROFILE_URL}
          target="_blank"
          rel="nofollow noopener noreferrer"
          title="Customer reviews and experiences for Hermes OS"
          className="font-body text-sm text-signal underline"
        >
          View Hermes OS on ProvenExpert
        </a>
      </noscript>

      <div id="proSealWidget" />

      <Script
        id="provenexpert-proseal-script"
        src="https://s.provenexpert.net/seals/proseal-v2.js"
        strategy="afterInteractive"
        onLoad={initialiseSeal}
        onReady={initialiseSeal}
        onError={() => {
          console.error("ProvenExpert PRO Seal failed to load.");
        }}
      />
    </div>
  );
}