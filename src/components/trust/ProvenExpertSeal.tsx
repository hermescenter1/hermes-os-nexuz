"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("trustBadges");

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
    <div className="flex w-full items-center justify-center" aria-label={t("provenExpertRegion")}>
      <noscript>
        <a
          href={PROFILE_URL}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="font-body text-sm text-signal underline"
        >
          {t("provenExpertLink")}
        </a>
      </noscript>

      {granted ? (
        /*
          The VENDOR widget renders at its own natural size (min 220px tall),
          far larger than the peer badges, so it alone is contained in a fixed
          compact viewport (116×84) and reduced with a pure transform
          (scale 0.38, origin centre). The reserved viewport prevents layout
          shift and stops the widget from dominating the trust strip.
        */
        <div className="flex h-[84px] w-[116px] items-center justify-center overflow-hidden">
          <div className="w-[300px] shrink-0 origin-center scale-[0.38]">
            <div className="flex min-h-[220px] w-full items-center justify-center">
              <div id={PROSEAL_CONTAINER_ID} />
            </div>
          </div>
        </div>
      ) : (
        /*
          PHASE 104-I1 — the Trust Registry must never present an empty frame.
          The vendor widget is an OPTIONAL enhancement: it mounts only after
          marketing consent, so with consent denied (the privacy-preserving
          default) this slot previously rendered nothing at all. The honest
          profile link stands in its place — the same destination the
          <noscript> path offers, code-native, with no invented score, rating
          or review count.

          PHASE 104-I3 — it is deliberately OUTSIDE the 0.38 scale above. The
          transform exists to shrink the vendor's fixed-size widget; when it
          also wrapped this link, a 44px control was rendered 17px tall, so the
          one target a consent-denying reader can actually use was the smallest
          on the page. Only the vendor widget is scaled now.
        */
        <a
          href={PROFILE_URL}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="ds-focus inline-flex min-h-11 w-full items-center justify-center rounded-sm px-1 text-center font-body text-[10px] leading-tight text-text-secondary underline decoration-dotted underline-offset-4 transition-colors hover:text-text-primary motion-reduce:transition-none"
        >
          {t("provenExpertLink")}
        </a>
      )}
    </div>
  );
}
