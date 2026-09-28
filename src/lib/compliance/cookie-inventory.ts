/**
 * PHASE 113 — the authoritative inventory of cookies, browser storage and
 * third-party integrations that the Cookie Policy page describes.
 *
 * WHY THIS MODULE EXISTS
 * The policy page used to hard-code its own list of cookie names in English
 * prose. Three of them were wrong: `access_token` (the real cookie is
 * `hermes_at`), `marketing_consent` and `ui_prefs` (neither exists anywhere in
 * this repository), and the Necessary category claimed CSRF cookies the
 * platform does not set. A legal document that names cookies the software does
 * not set is a false statement of fact about data processing.
 *
 * So the NAMES are imported from the modules that actually set them. A rename
 * in `lib/auth/config.ts` now moves the published policy with it, and
 * `__tests__/phase113-cookie-inventory.test.ts` fails if a cookie constant
 * exists in the tree without a row here.
 *
 * WHAT STAYS IN THE CATALOG
 * Only PROSE lives in `messages/*.json` under the `cookiePolicy` namespace:
 * purposes, category explanations, legal basis, withdrawal instructions. A
 * cookie name is a technical identifier, not translatable copy — keeping names
 * out of the catalog also keeps `hermes_at` from being reported as untranslated
 * German by the i18n carryover gates.
 *
 * RETENTION VALUES
 * Every duration below is either an exported constant (imported here, so it
 * cannot drift) or a literal whose single set-site is cited in a comment. No
 * duration is estimated.
 */

import {
  SESSION_COOKIE,
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  REFRESH_TOKEN_TTL_LONG,
} from "@/lib/auth/config";
import {
  CONSENT_ID_COOKIE,
  CONSENT_ID_MAX_AGE_SECONDS,
} from "@/lib/compliance/consent-cookie";
import { TENANT_SELECTION_COOKIE } from "@/lib/tenant-selection/contract";

/** The four consent categories the consent record actually models. */
export type ConsentCategory = "necessary" | "analytics" | "marketing" | "preferences";

/** Where a value is kept in the browser. */
export type StorageMedium = "cookie" | "localStorage";

export interface StorageEntry {
  /** The exact technical identifier as the browser sees it. */
  name: string;
  medium: StorageMedium;
  category: ConsentCategory;
  /**
   * Translation key suffix under `cookiePolicy.storage.<purposeKey>`, holding
   * the localized purpose sentence.
   */
  purposeKey: string;
  /**
   * Lifetime in seconds. `null` means the value has no expiry and persists
   * until the visitor clears it or changes their choice — which is the honest
   * description of localStorage, and the reason this is not a number.
   *
   * Every platform cookie currently sets an explicit `maxAge`, so there is no
   * "session cookie" member here; adding one would create a rendering branch
   * with no copy behind it.
   */
  maxAgeSeconds: number | null;
  /**
   * The longer lifetime the same value takes when "remember me" was chosen, if
   * the set-site has two branches.
   */
  extendedMaxAgeSeconds?: number;
  /** True when the value is only ever set for a signed-in visitor. */
  authenticatedOnly: boolean;
  /** `httpOnly` cookies are unreadable from page scripts. */
  httpOnly: boolean;
}

/**
 * The locale cookie is set by `next-intl`'s middleware, not by this codebase,
 * so its NAME is the library default rather than a local constant. The lifetime
 * IS ours: `src/i18n/routing.ts` sets `localeCookie: { maxAge: 31536000 }`.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * The localStorage key that mirrors the consent record so a choice survives a
 * database outage. Declared in `CookieConsentBanner`, `AnalyticsProvider` and
 * `proseal-controller` — all three read this ONE key; there is no second
 * consent store.
 */
export const CONSENT_MIRROR_STORAGE_KEY = "hermes_cookie_consent";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const STORAGE_INVENTORY: readonly StorageEntry[] = [
  {
    // src/app/api/auth/route.ts:271 — 8 hours, or 30 days with remember-me.
    name: SESSION_COOKIE,
    medium: "cookie",
    category: "necessary",
    purposeKey: "session",
    maxAgeSeconds: 60 * 60 * 8,
    extendedMaxAgeSeconds: 60 * 60 * 24 * 30,
    authenticatedOnly: true,
    httpOnly: true,
  },
  {
    name: ACCESS_TOKEN_COOKIE,
    medium: "cookie",
    category: "necessary",
    purposeKey: "accessToken",
    maxAgeSeconds: ACCESS_TOKEN_TTL,
    authenticatedOnly: true,
    httpOnly: true,
  },
  {
    name: REFRESH_TOKEN_COOKIE,
    medium: "cookie",
    category: "necessary",
    purposeKey: "refreshToken",
    maxAgeSeconds: REFRESH_TOKEN_TTL,
    extendedMaxAgeSeconds: REFRESH_TOKEN_TTL_LONG,
    authenticatedOnly: true,
    httpOnly: true,
  },
  {
    name: CONSENT_ID_COOKIE,
    medium: "cookie",
    category: "necessary",
    purposeKey: "consentId",
    maxAgeSeconds: CONSENT_ID_MAX_AGE_SECONDS,
    authenticatedOnly: false,
    httpOnly: true,
  },
  {
    // src/lib/tenant-selection/cookie.ts:52 — MAX_AGE_SECONDS, one year.
    name: TENANT_SELECTION_COOKIE,
    medium: "cookie",
    category: "necessary",
    purposeKey: "tenantSelection",
    maxAgeSeconds: ONE_YEAR_SECONDS,
    authenticatedOnly: true,
    httpOnly: true,
  },
  {
    // src/i18n/routing.ts:20 — localeCookie maxAge 31536000.
    name: LOCALE_COOKIE,
    medium: "cookie",
    category: "preferences",
    purposeKey: "locale",
    maxAgeSeconds: ONE_YEAR_SECONDS,
    authenticatedOnly: false,
    httpOnly: false,
  },
  {
    name: CONSENT_MIRROR_STORAGE_KEY,
    medium: "localStorage",
    category: "necessary",
    purposeKey: "consentMirror",
    // localStorage has no expiry: it lives until the visitor clears site data
    // or changes their choice. Stating a duration here would be an invention.
    maxAgeSeconds: null,
    authenticatedOnly: false,
    httpOnly: false,
  },
];

export interface ThirdPartyEntry {
  /** Stable key for the localized name/purpose pair. */
  key: string;
  /**
   * The consent categories that each independently enable this service. The
   * service loads when ANY of them is granted, mirroring the gate in the code.
   */
  gatedBy: readonly ConsentCategory[];
  /**
   * True when the integration additionally requires deployment configuration,
   * so it may be absent even with consent granted.
   */
  requiresConfiguration: boolean;
  /** Vendor privacy documentation — the vendor's own canonical URL. */
  privacyUrl: string;
}

/**
 * Third parties that can place storage in the visitor's browser.
 *
 * Every gate below is the gate in the code, not a policy aspiration:
 *
 *   - Google Tag Manager / GA4 — `AnalyticsProvider.tsx`: rendered when
 *     `analytics || marketing`, and only when `GA_MEASUREMENT_ID`/`GTM_ID` are
 *     configured for the deployment (`middleware.ts`).
 *   - Microsoft Clarity — `AnalyticsProvider.tsx`: rendered when `analytics`.
 *   - ProvenExpert — `proseal-controller.ts`: the script is not fetched at all
 *     until `marketing` consent is present, re-checked inside the loader.
 *
 * eNAMAD and SaaSHub are deliberately ABSENT: both are plain `<img>` badges
 * allowed only under `img-src` in the CSP. They set no cookie and run no
 * script, so listing them as consent-gated third parties would misdescribe
 * them.
 */
export const THIRD_PARTY_INVENTORY: readonly ThirdPartyEntry[] = [
  {
    key: "googleAnalytics",
    gatedBy: ["analytics", "marketing"],
    requiresConfiguration: true,
    privacyUrl: "https://policies.google.com/privacy",
  },
  {
    key: "microsoftClarity",
    gatedBy: ["analytics"],
    requiresConfiguration: false,
    privacyUrl: "https://privacy.microsoft.com/privacystatement",
  },
  {
    key: "provenExpert",
    gatedBy: ["marketing"],
    requiresConfiguration: false,
    privacyUrl: "https://www.provenexpert.com/privacy-policy/",
  },
];

/** The category order the policy renders in — necessary first, always. */
export const CATEGORY_ORDER: readonly ConsentCategory[] = [
  "necessary",
  "analytics",
  "marketing",
  "preferences",
];

/** Entries belonging to one category, in declaration order. */
export function storageForCategory(category: ConsentCategory): readonly StorageEntry[] {
  return STORAGE_INVENTORY.filter((entry) => entry.category === category);
}

/**
 * The published version of the Cookie Policy document.
 *
 * Deliberately a CODE constant and not a catalog leaf: a version number is a
 * technical identifier, not translatable copy, and putting it in the catalog
 * produced one leaf whose German was byte-identical to its English — which the
 * identical-value audit would have forced into an allowlist for no benefit.
 *
 * NOT the same thing as `CURRENT_CONSENT_VERSION` in `./types`, which records
 * which consent wording a stored decision was given against. Re-collecting
 * consent after a policy revision is a deliberate owner decision, so bumping
 * this value does NOT invalidate stored consent.
 */
export const COOKIE_POLICY_VERSION = "2.0";
