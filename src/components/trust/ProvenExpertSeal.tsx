"use client";

import { useEffect } from "react";

type ProSealOptions = {
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
};

declare global {
  interface Window {
    provenExpert?: {
      proSeal: (options: ProSealOptions) => void;
    };
    loadProSeal?: () => void;
  }
}

const SCRIPT_URL = "https://s.provenexpert.net/seals/proseal-v2.js";

const PROFILE_URL =
  "https://www.provenexpert.com/hermes-os/?utm_source=seals&utm_campaign=embedded-proseal&utm_medium=profile&utm_content=556c8c4c-1239-4292-a2fb-24c03d7c8443";

export default function ProvenExpertSeal() {
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let retryTimer: number | undefined;

    const initialiseSeal = () => {
      if (cancelled) return;

      const container = document.getElementById("proSealWidget");
      const proSeal = window.provenExpert?.proSeal;

      if (container && typeof proSeal === "function") {
        container.replaceChildren();

        proSeal({
          widgetId: "556c8c4c-1239-4292-a2fb-24c03d7c8443",
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

        return;
      }

      attempts += 1;

      if (attempts <= 40) {
        retryTimer = window.setTimeout(initialiseSeal, 250);
      } else {
        console.error(
          "ProvenExpert PRO Seal API did not become available."
        );
      }
    };

    // Callback expected by the official ProvenExpert integration.
    window.loadProSeal = initialiseSeal;

    const existingScript =
      document.querySelector<HTMLScriptElement>(
        `script[src="${SCRIPT_URL}"]`
      );

    if (existingScript) {
      existingScript.addEventListener("load", initialiseSeal, {
        once: true,
      });
    } else {
      const script = document.createElement("script");

      script.id = "provenexpert-proseal-script";
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;

      // Prevent script-delay systems from altering the official widget.
      script.setAttribute("data-cfasync", "false");
      script.setAttribute("nowprocket", "");

      script.addEventListener("load", initialiseSeal, {
        once: true,
      });

      script.addEventListener(
        "error",
        () => {
          console.error("ProvenExpert PRO Seal script failed to load.");
        },
        { once: true }
      );

      document.body.appendChild(script);
    }

    initialiseSeal();

    return () => {
      cancelled = true;

      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }

      if (window.loadProSeal === initialiseSeal) {
        delete window.loadProSeal;
      }
    };
  }, []);

  return (
    <div
      className="flex min-h-[220px] w-full items-center justify-center"
      aria-label="Hermes OS customer reviews on ProvenExpert"
    >
      <noscript>
        <a
          href={PROFILE_URL}
          target="_blank"
          rel="nofollow noopener noreferrer"
          title="Customer reviews and experiences for Hermes OS"
          className="font-body text-sm text-signal underline"
        >
          View Hermes OS on ProvenExpert
        </a>
      </noscript>

      <div id="proSealWidget" />
    </div>
  );
}
