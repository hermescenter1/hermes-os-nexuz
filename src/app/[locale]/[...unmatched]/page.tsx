import { notFound } from "next/navigation";

/**
 * PHASE 89A.1 — localized unmatched-route fallback.
 *
 * Final catch-all under the locale prefix. Any URL that matches no static or
 * dynamic route in src/app/[locale] lands here (Next.js precedence: static >
 * dynamic > catch-all, so this can never shadow a valid route) and is routed
 * to the nearest not-found boundary — src/app/[locale]/not-found.tsx — instead
 * of the built-in English Next.js 404.
 *
 * Deliberately declares NO params: the unmatched segments are never read,
 * rendered, logged or echoed anywhere. This page renders no UI of its own and
 * produces a genuine 404 response via notFound().
 */
export default function UnmatchedRoute(): never {
  notFound();
}
