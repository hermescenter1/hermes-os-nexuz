"use client";

import { useTranslations } from "next-intl";
import { requestCookiePreferences } from "./cookie-preferences";

/**
 * PHASE 113 — the withdrawal control on the Cookie Policy page.
 *
 * It renders NO consent UI of its own. It dispatches the reopen event and the
 * one existing `CookieConsentBanner` answers, so there is exactly one consent
 * surface, one save path and one stored record. See `cookie-preferences.ts` for
 * why the contract is an event rather than shared React state.
 *
 * The banner is mounted globally by the root layout, so this control works on
 * the policy page in every locale without the page importing the banner.
 *
 * PHASE 113-A — the presentation is passed in rather than baked in. The page
 * renders this control twice, in two different surface contexts (once on the
 * dark masthead, once inside the light document body), and the styling for both
 * lives with the rest of the page's visual system in `globals.css` under
 * `.hz-legal`. Hard-coding one appearance here would have forced a second
 * component for the second placement.
 */
export function ManageCookiePreferencesButton({ className }: { className?: string }) {
  const t = useTranslations("cookiePolicy");

  return (
    <button
      type="button"
      data-consent-action="manage-preferences"
      onClick={() => { requestCookiePreferences(); }}
      className={
        className ??
        // Fallback for any caller that does not supply the page's visual system.
        "ds-focus inline-flex min-h-11 items-center justify-center rounded-xs border border-line px-5 py-2 text-xs font-semibold text-ink transition-colors hover:text-signal"
      }
    >
      {t("withdrawal.manageButton")}
    </button>
  );
}
