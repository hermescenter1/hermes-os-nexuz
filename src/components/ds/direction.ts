"use client";

/**
 * Directionality foundation for the Hermes Design System.
 *
 * The single source of truth for text direction is `LOCALE_DIRECTION` in
 * `src/i18n/locales.ts`; `<html dir>` is set from it in
 * `src/app/[locale]/layout.tsx`. The pure resolvers live in the JSX-free
 * `logic` core (so they unit-test without pulling next-intl); this module adds
 * the client hook.
 *
 * Component layout should prefer Tailwind's built-in LOGICAL utilities
 * (`ms-*`/`me-*`, `ps-*`/`pe-*`, `border-s`/`border-e`, `start-*`/`end-*`,
 * `text-start`/`text-end`) so one markup mirrors correctly under `dir="rtl"`.
 * Direction-agnostic technical values stay LTR via <TechnicalValue>.
 */
import { useLocale } from "next-intl";
import { directionForLocale, isRtl, type Direction } from "./logic";

export { directionForLocale, isRtl };
export type { Direction };

/** Client hook — the active locale's direction, derived from next-intl. */
export function useDirection(): Direction {
  return directionForLocale(useLocale());
}
