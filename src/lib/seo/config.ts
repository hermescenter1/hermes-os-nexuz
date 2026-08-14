/** Central SEO configuration — Phase 62 (locale lists centralised in Phase 86B) */

import {
  ACTIVE_LOCALES,
  DEFAULT_LOCALE as CENTRAL_DEFAULT_LOCALE,
  OG_LOCALE as CENTRAL_OG_LOCALE,
  type ActiveLocale,
} from "@/i18n/locales";

export const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://hermesnovin.com";

export const SITE_NAME    = "Hermes OS";

/**
 * Canonical public organisation identity.
 *
 * `ORG_NAME` is the name published in every structured-data block and is the
 * full legal/public identity on purpose: retrieval systems must be able to
 * merge "Hermes Novin", "Hermes Novin Mehr" and "Hermes Novin Mehr IRIC" into
 * ONE organisation rather than treating them as unrelated companies. The short
 * brand is kept as an explicit `alternateName` instead of being a second,
 * competing primary name.
 */
export const ORG_NAME       = "Hermes Novin Mehr IRIC";
export const ORG_SHORT_NAME = "Hermes Novin";

/**
 * The canonical product category. Used verbatim by the product schema and the
 * llms.txt summary so the site never describes Hermes OS as two different
 * kinds of thing on two different surfaces.
 */
export const PRODUCT_CATEGORY = "Enterprise Industrial Intelligence Platform";

/**
 * Stable semantic identifiers (Phase 105).
 *
 * These `@id` values are the join keys of the public knowledge graph: every
 * schema block on every page and in every locale points at these exact strings
 * so a crawler can merge the graph deterministically. Translations describe the
 * SAME entity, so the IDs are deliberately locale-independent.
 *
 * They are part of the public contract — do not rename them.
 */
export const ORG_ID     = `${BASE_URL}/#organization`;
export const WEBSITE_ID = `${BASE_URL}/#website`;
export const PRODUCT_ID = `${BASE_URL}/#hermes-os`;
export const FOUNDER_ID = `${BASE_URL}/#founder`;

// Locale lists derive from the single source of truth so SEO and routing
// cannot drift. SEO exposes ACTIVE locales only.
export const DEFAULT_LOCALE = CENTRAL_DEFAULT_LOCALE;
export const LOCALES        = ACTIVE_LOCALES;
export type  SeoLocale      = ActiveLocale;

export const OG_IMAGE_URL   = `${BASE_URL}/brand/og-default.jpg`;
export const CONTACT_EMAIL  = "info@hermesnovin.com";

/*
 * ORGANIZATION LOGO — INTENTIONALLY OMITTED.
 *
 * There was previously an `ORG_LOGO_URL` pointing at `/favicon.svg`, emitted as
 * `Organization.logo` and as `JobPosting.hiringOrganization.logo`. A favicon is
 * a browser tab icon, not a corporate logo asset: publishing it as the company's
 * logo is an unsupported factual assertion about brand identity, and Google's
 * logo guidance expects a dedicated, raster-friendly image.
 *
 * The constant is DELETED rather than left unused so no schema builder can
 * silently reintroduce the favicon as the corporate logo. `logo` is optional on
 * both Organization and JobPosting, so omission is valid structured data.
 *
 * The site favicon itself is untouched — it is declared independently by
 * `app/[locale]/layout.tsx` (metadata.icons) and `app/manifest.ts`.
 *
 * OPERATOR ACTION: supply a verified production-quality corporate logo, then
 * reintroduce it here and reference it from `organizationSchema()`.
 */

/**
 * VERIFIED external profiles for the organisation (`sameAs`).
 *
 * Entry criteria — every URL here must be provable from this repository, never
 * guessed from a plausible username:
 *
 *  - ProvenExpert: the profile embedded by `components/trust/ProvenExpertSeal`
 *    using this organisation's own profile id, and allow-listed in the
 *    middleware CSP. Tracking parameters are stripped: `sameAs` must be the
 *    canonical profile URL, not a campaign-tagged one.
 *  - GitHub: the account hosting this repository's own origin remote.
 *
 * A social handle is NOT listed unless an account is confirmed to exist and to
 * belong to the organisation. Nothing is added here on the strength of "the
 * name is probably taken by us".
 */
export const ORG_SAME_AS: readonly string[] = [
  "https://www.provenexpert.com/hermes-os/",
  "https://github.com/hermescenter1",
];

/**
 * VERIFIED external profiles for the founder (`Person.sameAs`).
 *
 * Sourced from the LinkedIn URL this site itself publishes on its public
 * contact page (`contact.linkedinUrl`), so it is self-evidently the profile the
 * organisation claims as its own point of contact.
 */
export const FOUNDER_SAME_AS: readonly string[] = [
  "https://www.linkedin.com/in/hamid-reza-forozandeh",
];

/**
 * The founder's public identity, as already published on the About page
 * (`about.founderName` / `about.founderRole`).
 */
export const FOUNDER_NAME = "Hamid Reza Forozandeh";
export const FOUNDER_ROLE = "Founder, CEO & Chief Industrial Systems Architect";

/**
 * OG locale string per locale code. Re-exported from the central source, which
 * also models inactive locales (German → de_DE) for when they go public.
 */
export const OG_LOCALE = CENTRAL_OG_LOCALE;
