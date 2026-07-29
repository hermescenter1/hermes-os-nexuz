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
const SCRIPT_ID = "provenexpert-proseal-script";
const CONTAINER_ID = "proSealWidget";

const PROFILE_URL =
  "https://www.provenexpert.com/hermes-os/?utm_source=seals&utm_campaign=embedded-proseal&utm_medium=profile&utm_content=556c8c4c-1239-4292-a2fb-24c03d7c8443";

// Official widget configuration — must match the ProvenExpert dashboard
// snippet exactly.
const WIDGET_OPTIONS: ProSealOptions = {
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
  embeddedSelector: `#${CONTAINER_ID}`,
};

// Bounded fallback polling: 40 × 250 ms ≈ 10 s. Covers the cases where no
// load event will ever fire (the script tag already existed and executed
// before this mount) and where the vendor exposes `window.provenExpert`
// slightly after its own load event.
const RETRY_INTERVAL_MS = 250;
const MAX_ATTEMPTS = 40;

export default function ProvenExpertSeal() {
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let retryTimer: number | undefined;

    const initialiseSeal = () => {
      if (cancelled) return;

      // The script load event, the official `loadProSeal` callback and the
      // retry timer can all race; collapse them into a single pending
      // attempt so the vendor API is only ever driven by one code path.
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }

      const container = document.getElementById(CONTAINER_ID);
      const proSeal = window.provenExpert?.proSeal;

      if (container && typeof proSeal === "function") {
        // Idempotency guard scoped to the DOM node itself: the vendor
        // script may invoke `loadProSeal` after the polling loop already
        // initialised this container. A remounted footer produces a fresh
        // node without the flag, so client-side navigation re-renders the
        // badge correctly instead of being suppressed forever.
        if (container.dataset.prosealInitialised === "true") {
          return;
        }

        // Drop any stale markup before (re)initialising so the vendor
        // never renders a duplicate badge next to leftover content.
        container.replaceChildren();
        proSeal(WIDGET_OPTIONS);
        container.dataset.prosealInitialised = "true";
        return;
      }

      if (attempts >= MAX_ATTEMPTS) {
        console.error("ProvenExpert PRO Seal API did not become available.");
        return;
      }

      attempts += 1;
      retryTimer = window.setTimeout(initialiseSeal, RETRY_INTERVAL_MS);
    };

    const handleScriptError = () => {
      console.error("ProvenExpert PRO Seal script failed to load.");
    };

    // Official integration contract: proseal-v2.js calls
    // `window.loadProSeal()` once its API is ready, so the callback MUST be
    // registered before the external script gets a chance to execute.
    window.loadProSeal = initialiseSeal;

    // Reuse an existing tag (React Strict Mode remount, client-side
    // navigation, repeated component mounting) instead of injecting a
    // duplicate. Matched by our id and, defensively, by the exact src.
    let script = document.querySelector<HTMLScriptElement>(
      `script#${SCRIPT_ID}, script[src="${SCRIPT_URL}"]`
    );

    if (script) {
      // If the existing script already executed, no further load event
      // will fire; the immediate `initialiseSeal()` call below plus the
      // bounded retry loop handle that case.
      script.addEventListener("load", initialiseSeal, { once: true });
      script.addEventListener("error", handleScriptError, { once: true });
    } else {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;

      // Keep Cloudflare Rocket Loader / WP Rocket-style optimisers from
      // rewriting or delaying the official widget script.
      script.setAttribute("data-cfasync", "false");
      script.setAttribute("nowprocket", "");

      script.addEventListener("load", initialiseSeal, { once: true });
      script.addEventListener("error", handleScriptError, { once: true });

      document.body.appendChild(script);
    }

    // Covers the "API already available" case (script loaded on a previous
    // page) and otherwise starts the bounded polling fallback.
    initialiseSeal();

    return () => {
      cancelled = true;

      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }

      script?.removeEventListener("load", initialiseSeal);
      script?.removeEventListener("error", handleScriptError);

      // Release the global only if it is still ours; a newer mount may
      // have re-registered it already.
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

      <div id={CONTAINER_ID} />
    </div>
  );
}
