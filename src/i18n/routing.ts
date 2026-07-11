import { defineRouting } from "next-intl/routing";
import {
  ACTIVE_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_DIRECTION,
  type ActiveLocale,
} from "./locales";

// Public routing uses ACTIVE_LOCALES only — German stays out until activated.
export const routing = defineRouting({
  locales: ACTIVE_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});

// `Locale` is the app's public (active) locale. Kept as a named export for the
// many call sites that import it; it now derives from the central source.
export type Locale = ActiveLocale;

// Text direction per active locale. Re-exported from the central source so
// routing and direction can never disagree. (LOCALE_DIRECTION also carries
// inactive locales such as German; indexing it with a Locale is always valid.)
export const localeDirection = LOCALE_DIRECTION;
