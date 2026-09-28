/**
 * PHASE 113 — the reopen interface for the cookie consent UI.
 *
 * THE DEFECT THIS CLOSES
 * `CookieConsentBanner` showed itself only when no consent was stored. After any
 * choice — Accept All, Reject All or a saved customisation — it never rendered
 * again and nothing anywhere could bring it back. Meanwhile the Cookie Policy
 * page told visitors, in English, that they could "update your cookie
 * preferences at any time using the banner that appears at the bottom of the
 * screen". That instruction was impossible to follow, which is a false
 * statement in a legal document and, under a consent regime, a withdrawal path
 * that does not exist.
 *
 * WHY AN EVENT AND NOT A SECOND COMPONENT
 * The obvious fix — a preferences dialog on the policy page — would be a SECOND
 * consent surface with its own state, its own save path and its own idea of
 * what the visitor has agreed to. Two writers of one consent record is how
 * consent records drift. So there is still exactly ONE banner, ONE save path and
 * ONE stored truth; this module is only the doorbell.
 *
 * It deliberately mirrors the transport the consent layer already uses: the
 * banner, `AnalyticsProvider` and `proseal-controller` communicate over
 * `hermes:consent-updated` window events. Reopening travels the same way, so a
 * control can live on any page — server-rendered or client — without importing
 * the banner or sharing a React tree with it.
 *
 * This module is pure and framework-free so the contract can be tested without
 * rendering anything.
 */

/**
 * The window event that asks the consent banner to reopen in its preferences
 * view. Part of the public contract between the policy page and the banner —
 * renaming it breaks the withdrawal path, so it is asserted by
 * `__tests__/phase113-consent-reopen.test.tsx`.
 */
export const COOKIE_PREFERENCES_OPEN_EVENT = "hermes:cookie-preferences-open";

/** Minimal surface this module needs, so a test can pass a fake. */
export interface PreferencesEventTarget {
  dispatchEvent(event: Event): boolean;
}

/**
 * Ask the consent banner to reopen its preferences view.
 *
 * Returns `false` when there is nothing to dispatch on (server rendering, or an
 * environment without `CustomEvent`) so a caller can stay silent rather than
 * throw. It never changes stored consent — only the banner writes that.
 *
 * The default resolves to `null` rather than `undefined` when there is no
 * window, because a JavaScript default parameter also fires for an explicitly
 * passed `undefined`: with `undefined` as the "nothing" value a test could
 * never exercise the guard, it would silently get the real `window` instead.
 * `null` is a value the default cannot swallow.
 */
export function requestCookiePreferences(
  target: PreferencesEventTarget | null = typeof window === "undefined" ? null : window,
): boolean {
  if (!target || typeof CustomEvent === "undefined") return false;
  target.dispatchEvent(new CustomEvent(COOKIE_PREFERENCES_OPEN_EVENT));
  return true;
}
