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
 * Canonical public organisation identity — PHASE 113.
 *
 * `ORG_NAME` is the name published in every structured-data block and is the
 * full legal/public identity of the COMPANY that operates and develops the
 * platform. The short brand is kept as an explicit `alternateName` instead of
 * being a second, competing primary name.
 *
 * COMPANY AND PRODUCT ARE TWO ENTITIES, NOT ONE
 * ---------------------------------------------
 * This constant must never carry the product name, and `SITE_NAME` must never
 * carry the company name:
 *
 *     ZHARFA Vira Pouyesh Fanavari  = company / platform operator / developer
 *     Hermes OS                     = the industrial intelligence product
 *
 * The retired identity "Hermes Novin Mehr IRIC" (and its short forms) is no
 * longer published on any public surface. It is deliberately NOT kept as an
 * `alternateName`: a retired legal name is not an alias the current company
 * trades under, and publishing it would keep merging the old entity into the
 * new one in every retrieval system that reads this graph.
 */
export const ORG_NAME       = "ZHARFA Vira Pouyesh Fanavari";
export const ORG_SHORT_NAME = "ZHARFA";

/**
 * The company's own canonical website — PHASE 113, owner-confirmed evidence.
 *
 * WHY THE APEX WITH NO LOCALE PATH
 * Measured, not assumed (2026-09-28):
 *
 *   https://www.zharfavira.com  -> 301 -> https://zharfavira.com/ -> 307 -> /fa
 *   https://zharfavira.com      ->               307 -> /fa
 *
 * `www` is a PERMANENT (301) redirect to the apex, so the apex is the canonical
 * host. The `/fa` hop is a 307 locale redirect — the same next-intl pattern this
 * site uses — which selects a language, not a canonical identity.
 *
 * The decisive evidence is that ZHARFA's own structured data publishes exactly
 * this value: its `Organization` node carries
 * `url: "https://zharfavira.com"` while its per-page canonical is
 * `https://zharfavira.com/fa`. Pointing at the apex therefore agrees with the
 * company's own declaration of its entity URL rather than a locale variant of it.
 *
 * THIS BELONGS IN `url`, NOT IN `sameAs`
 * `sameAs` is for OTHER external identities of an entity (a verified LinkedIn
 * profile, for instance). An organisation's own principal website is its `url`.
 * Putting it in `sameAs` as well would assert that the company and its website
 * are two identities to be merged, which is exactly the kind of sloppy claim
 * this phase removed elsewhere. `ORG_SAME_AS` therefore stays empty.
 */
export const ORG_URL = "https://zharfavira.com";

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
 * VERIFIED external profiles for the ORGANISATION (`sameAs`).
 *
 * PHASE 113 — DELIBERATELY EMPTY.
 *
 * `sameAs` is an identity claim: it tells a retrieval system "this URL IS this
 * entity". Two URLs used to sit here and neither survives that test now that
 * the company and the product are modelled as separate entities:
 *
 *  - `https://www.provenexpert.com/hermes-os/` is a review profile for the
 *    PRODUCT, Hermes OS. It moved to `PRODUCT_SAME_AS` below. Leaving it here
 *    asserted that the review profile of a piece of software is the company,
 *    which is the exact entity merge this phase exists to undo.
 *  - `https://github.com/hermescenter1` is the account that HOSTS this
 *    repository. Code hosting is not a corporate identity: an organisation's
 *    `sameAs` must be a profile OF the organisation, and no repository in this
 *    tree proves that account is operated as ZHARFA's official presence.
 *
 * An empty list is safer than a false entity merge. A ZHARFA LinkedIn or other
 * corporate profile is added here only once the operator supplies the official
 * URL, or once a verified one is provable from this repository — never on the
 * strength of "the name is probably taken by us".
 *
 * OPERATOR ACTION: supply verified ZHARFA corporate profile URLs to populate
 * this list.
 */
export const ORG_SAME_AS: readonly string[] = [];

/**
 * VERIFIED external profiles for the PRODUCT (`SoftwareApplication.sameAs`).
 *
 * ProvenExpert: the profile embedded by `components/trust/ProvenExpertSeal`
 * using this product's own profile id, and allow-listed in the middleware CSP.
 * Tracking parameters are stripped — `sameAs` must be the canonical profile
 * URL, not a campaign-tagged one.
 *
 * NOTE: this publishes the profile's EXISTENCE, not its contents. No rating,
 * review count or score is asserted anywhere in the graph; `aggregateRating`
 * and `review` stay absent (see `softwareApplicationSchema`).
 */
export const PRODUCT_SAME_AS: readonly string[] = [
  "https://www.provenexpert.com/hermes-os/",
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
