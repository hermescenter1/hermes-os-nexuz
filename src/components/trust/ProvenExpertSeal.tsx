"use client";

import { useEffect, useState } from "react";
import {
  readMarketingConsent,
  mountProSeal,
  teardownProSeal,
  MARKETING_CONSENT_EVENT,
  PROSEAL_CONTAINER_ID,
} from "./proseal-controller";

const PROFILE_URL =
  "https://www.provenexpert.com/hermes-os/?utm_source=seals&utm_campaign=embedded-proseal&utm_medium=profile&utm_content=556c8c4c-1239-4292-a2fb-24c03d7c8443";

/**
 * ProvenExpert customer-reviews seal.
 *
 * SECURITY (compliance hotfix) — ProvenExpert is a NON-ESSENTIAL, marketing
 * third party. It loads ONLY after explicit marketing consent (default denied),
 * and consent withdrawal tears the widget down completely. All DOM/vendor
 * mechanics live in `proseal-controller` so nothing runs at module load or
 * during SSR; the script is injected exclusively inside an effect, gated on the
 * authoritative consent record.
 */
export default function ProvenExpertSeal() {
  // Default DENIED — SSR and the first client render never load the widget.
  const [granted, setGranted] = useState(false);

  // Track the current consent decision from the authoritative consent record.
  useEffect(() => {
    setGranted(readMarketingConsent(window));
    const onConsent = () => setGranted(readMarketingConsent(window));
    window.addEventListener(MARKETING_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(MARKETING_CONSENT_EVENT, onConsent);
  }, []);

  // Mount only while consent is granted; tear down on withdrawal or unmount.
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!granted) {
      teardownProSeal(document, window);
      return;
    }
    mountProSeal(document, window);
    return () => teardownProSeal(document, window);
  }, [granted]);

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

      {/* The vendor renders into this container only after marketing consent. */}
      {granted ? <div id={PROSEAL_CONTAINER_ID} /> : null}
    </div>
  );
}
