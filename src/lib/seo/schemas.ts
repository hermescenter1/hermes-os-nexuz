/**
 * JSON-LD schema builders — Phase 62.
 * All builders return plain objects ready for serialisation via <JsonLd />.
 */

import {
  BASE_URL,
  SITE_NAME,
  ORG_NAME,
  ORG_SHORT_NAME,
  PRODUCT_CATEGORY,
  CONTACT_EMAIL,
  OG_IMAGE_URL,
  ORG_ID,
  WEBSITE_ID,
  PRODUCT_ID,
  FOUNDER_ID,
  ORG_SAME_AS,
  FOUNDER_SAME_AS,
  FOUNDER_NAME,
  FOUNDER_ROLE,
} from "./config";
import {
  ACTIVE_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_ACCESSIBLE_NAME,
  isActiveLocale,
  type ActiveLocale,
} from "@/i18n/locales";

/* ── Locale → BCP-47 for JSON-LD (Phase 89B.1) ──────────────────────────── */

/**
 * The single locale→BCP-47 mapping used by every schema builder. `en` stays
 * `en-US` deliberately: that is the value published in production JSON-LD
 * since Phase 62 (the html-lang tag uses en-GB; JSON-LD keeps its own
 * established value so existing fa/en output is byte-stable).
 */
const SCHEMA_LOCALE_TAG: Record<ActiveLocale, string> = {
  fa: "fa-IR",
  en: "en-US",
  de: "de-DE",
};

/**
 * BCP-47 tag for a page locale; unknown values fall back to DEFAULT_LOCALE.
 *
 * PHASE 102: exported so the media `VideoObject` builder derives `inLanguage`
 * from the SAME mapping as every other schema on the site instead of declaring a
 * second, drift-prone table.
 */
export function schemaLanguageTag(locale: string): string {
  return SCHEMA_LOCALE_TAG[isActiveLocale(locale) ? locale : DEFAULT_LOCALE];
}

/* ── Canonical entity graph ──────────────────────────────────────────────────

   Every builder below emits a stable `@id` and references OTHER entities by
   `@id` rather than repeating their properties. That is what lets a crawler
   merge the whole public site — three locales, dozens of pages — into ONE
   organisation, ONE website and ONE product instead of a pile of unrelated
   look-alike blocks.

   Relationship direction is deliberate. Schema.org has no "develops" property,
   so ownership is expressed the way the vocabulary actually models it:

       WebSite   --publisher-->                     Organization
       Hermes OS --creator / publisher / provider--> Organization
       Person    --worksFor / founder of-->          Organization

   Nothing here invents a property to make the graph look richer.
   ─────────────────────────────────────────────────────────────────────────── */

/** Reference to an entity defined elsewhere in the graph. */
const ref = (id: string) => ({ "@id": id });

/**
 * Technical domains the organisation demonstrably works in. Every term is
 * backed by real platform functionality and real published content — this is a
 * disambiguation signal ("which Hermes is this?"), not a keyword list.
 */
const ORG_KNOWS_ABOUT: readonly string[] = [
  "Industrial automation",
  "Programmable logic controllers (PLC)",
  "SCADA systems",
  "Human-machine interfaces (HMI)",
  "OPC UA",
  "MQTT",
  "Modbus",
  "Industrial internet of things",
  "Predictive maintenance",
  "Digital twins",
  "Asset management",
  "Computerised maintenance management systems (CMMS)",
  "Industrial diagnostics",
  "Root cause analysis",
  "Operational technology cybersecurity",
  "Engineering knowledge management",
  "Explainable artificial intelligence",
];

/* ── Organisation ────────────────────────────────────────────────────────── */

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: ORG_NAME,
    legalName: ORG_NAME,
    // The short brand and the product name are the two other strings the
    // company is referred to by in the wild. Declaring them as alternates lets
    // a retrieval system resolve all three to this single entity.
    alternateName: [ORG_SHORT_NAME, SITE_NAME],
    url: BASE_URL,
    // `logo` intentionally omitted pending a verified corporate asset — see the
    // note in ./config.ts. A favicon is not a corporate logo.
    founder: ref(FOUNDER_ID),
    knowsAbout: [...ORG_KNOWS_ABOUT],
    contactPoint: {
      "@type": "ContactPoint",
      email: CONTACT_EMAIL,
      contactType: "customer support",
      availableLanguage: ACTIVE_LOCALES.map((locale) => LOCALE_ACCESSIBLE_NAME[locale]),
    },
    sameAs: [...ORG_SAME_AS],
  };
}

/* ── Founder (Person) ────────────────────────────────────────────────────── */

/**
 * The public founder entity. Only information this site already publishes on
 * its own About and Contact pages is included — no private contact details.
 */
export function founderSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": FOUNDER_ID,
    name: FOUNDER_NAME,
    jobTitle: FOUNDER_ROLE,
    worksFor: ref(ORG_ID),
    url: `${BASE_URL}/${DEFAULT_LOCALE}/about`,
    sameAs: [...FOUNDER_SAME_AS],
  };
}

/* ── WebSite + SearchAction ──────────────────────────────────────────────── */

export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: BASE_URL,
    publisher: ref(ORG_ID),
    inLanguage: ACTIVE_LOCALES.map((locale) => SCHEMA_LOCALE_TAG[locale]),
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/${DEFAULT_LOCALE}/library?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/* ── SoftwareApplication (Hermes OS) ─────────────────────────────────────── */

export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": PRODUCT_ID,
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: PRODUCT_CATEGORY,
    operatingSystem: "Web",
    description:
      `${SITE_NAME} is an ${PRODUCT_CATEGORY.toLowerCase()} developed by ${ORG_NAME}. ` +
      "It connects industrial systems such as PLC, SCADA and HMI through OPC UA and MQTT, " +
      "and applies evidence-based diagnostic reasoning, engineering knowledge management, " +
      "asset intelligence, predictive maintenance and multi-site analytics — with explainable " +
      "analysis and human approval required before any action touches plant state.",
    url: BASE_URL,
    // Ownership, in the three directions the vocabulary actually supports.
    creator: ref(ORG_ID),
    publisher: ref(ORG_ID),
    provider: ref(ORG_ID),
    image: OG_IMAGE_URL,
    // NOTE: `offers`, `aggregateRating` and `review` are deliberately absent.
    // Commercial terms are negotiated per deployment and no authoritative
    // public price exists, so publishing one — in particular the previous
    // `price: "0"` — would be a fabricated commercial claim about a paid
    // product. Omitting the property is correct even though Google's
    // SoftwareApplication rich result prefers it to be present.
  };
}

/**
 * The full canonical entity graph, ready for a single `<JsonLd />` block.
 *
 * Emitting these together as one `@graph` (rather than four sibling scripts)
 * is what makes the `@id` cross-references resolvable inside one document.
 */
export function siteEntityGraph() {
  // Nodes inside an @graph must NOT repeat @context — it is declared once on
  // the envelope.
  const strip = <T extends Record<string, unknown>>(node: T) => {
    const rest: Record<string, unknown> = { ...node };
    delete rest["@context"];
    return rest;
  };
  return {
    "@context": "https://schema.org",
    "@graph": [
      strip(organizationSchema()),
      strip(founderSchema()),
      strip(webSiteSchema()),
      strip(softwareApplicationSchema()),
    ],
  };
}

/* ── BreadcrumbList ──────────────────────────────────────────────────────── */

export interface BreadcrumbEntry {
  name: string;
  url: string;
}

export function breadcrumbSchema(items: BreadcrumbEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/* ── Article ─────────────────────────────────────────────────────────────── */

export interface ArticleSchemaOptions {
  headline: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  keywords?: string[];
  locale: string;
}

export function articleSchema(opts: ArticleSchemaOptions) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: opts.headline,
    description: opts.description,
    url: opts.url,
    mainEntityOfPage: opts.url,
    // Dates are emitted ONLY when the caller actually has them. The previous
    // "2026-01-01" / "2026-06-25" fallbacks stamped a fabricated publication
    // history onto every article that lacked real timestamps, which is both a
    // false factual claim and an active freshness-signal risk.
    ...(opts.datePublished ? { datePublished: opts.datePublished } : {}),
    ...(opts.dateModified  ? { dateModified:  opts.dateModified  } : {}),
    inLanguage: schemaLanguageTag(opts.locale),
    // Author and publisher resolve to the one canonical organisation entity.
    author: ref(ORG_ID),
    publisher: ref(ORG_ID),
    ...(opts.keywords?.length ? { keywords: opts.keywords.join(", ") } : {}),
    image: OG_IMAGE_URL,
  };
}

/* ── JobPosting ──────────────────────────────────────────────────────────── */

export interface JobPostingSchemaOptions {
  /** The organization-scoped stable requisition key — never a database id. */
  requisitionKey: string;
  /** Localized title/description of the SERVED locale's complete translation. */
  title: string;
  description: string;
  /** Three independent address fields; no free-text city guessing. */
  addressLocality: string;
  addressRegion: string;
  addressCountry: string;
  /** Both salary bounds and the currency, or none of them. */
  currency?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  /** Only an owner-approved stored value; unknown values are omitted. */
  employmentType?: string | null;
  /** From AtsJob.publishedAt ONLY — never createdAt, never "now". */
  datePosted: string;
  /** From a real closingDate ONLY. */
  validThrough?: string;
  skills: string[];
}

/**
 * DISCOVERY-2A — every optional property is now genuinely optional.
 *
 * `AtsJob` — the authoritative source — has nullable `salaryMin`/`salaryMax` and
 * NO employment-type column at all. The previous shape required all of them, so
 * the only caller that could satisfy it was the development fixture, and
 * `contractTypeToSchema` silently defaulted an unknown contract to `FULL_TIME` —
 * publishing an employment term the platform had never been told.
 *
 * A property the record cannot back is omitted, never defaulted. Google treats a
 * missing optional property as missing; it treats a wrong one as a wrong fact.
 */
export function jobPostingSchema(opts: JobPostingSchemaOptions) {
  /*
   * PHASE 104-B1 — structured data is built from PUBLISHED truth only.
   *
   *   - the caller must hold an ELIGIBLE row (shared predicate) with a
   *     complete translation; this builder never re-checks and never invents;
   *   - datePosted comes from publishedAt only — a caller without one has no
   *     JobPosting to emit;
   *   - identifier is the org-scoped requisitionKey, stable across reposts;
   *   - salary appears only when min + max + currency are ALL present
   *     (unitText YEAR completes the claim); a half-known band is not a fact;
   *   - employmentType appears only when a stored, owner-approved value maps
   *     cleanly onto the schema.org vocabulary; nothing is defaulted;
   *   - NO remote/hybrid inference: jobLocationType and
   *     applicantLocationRequirements are never emitted here. Mapping a
   *     fully-remote role is an explicit owner decision, not a guess.
   *
   * Valid markup makes a page ELIGIBLE for a rich result; it does not
   * produce one, and no placement is promised anywhere in this repository.
   */
  const hasSalary =
    typeof opts.currency === "string" &&
    opts.currency.length > 0 &&
    typeof opts.salaryMin === "number" &&
    typeof opts.salaryMax === "number";

  const employmentType =
    opts.employmentType == null ? undefined : contractTypeToSchema(opts.employmentType);

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: opts.title,
    description: opts.description,
    identifier: {
      "@type": "PropertyValue",
      name: ORG_NAME,
      value: opts.requisitionKey,
    },
    hiringOrganization: {
      "@type": "Organization",
      "@id": ORG_ID,
      name: ORG_NAME,
      sameAs: BASE_URL,
      // `logo` intentionally omitted — same reason as organizationSchema().
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: opts.addressLocality,
        addressRegion: opts.addressRegion,
        addressCountry: opts.addressCountry,
      },
    },
    ...(hasSalary
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: opts.currency,
            value: {
              "@type": "QuantitativeValue",
              minValue: opts.salaryMin,
              maxValue: opts.salaryMax,
              unitText: "YEAR",
            },
          },
        }
      : {}),
    ...(employmentType ? { employmentType } : {}),
    datePosted: opts.datePosted,
    ...(opts.validThrough ? { validThrough: opts.validThrough } : {}),
    ...(opts.skills.length > 0 ? { skills: opts.skills.join(", ") } : {}),
  };
}

/**
 * Map a known contract type to the schema.org token, or `undefined`.
 *
 * An unrecognised value used to fall through to `FULL_TIME`. It now yields
 * `undefined` and the property is dropped: "we do not know" and "full time" are
 * different claims, and only one of them is safe to publish.
 */
function contractTypeToSchema(type: string): string | undefined {
  const map: Record<string, string> = {
    "full-time": "FULL_TIME",
    "part-time": "PART_TIME",
    contract:    "CONTRACTOR",
    freelance:   "CONTRACTOR",
    internship:  "INTERN",
  };
  return map[type];
}

/* ── Course / EducationalOrganization ───────────────────────────────────── */

export interface CourseSchemaOptions {
  name: string;
  description: string;
  url: string;
  provider?: string;
  level?: string;
}

export function courseSchema(opts: CourseSchemaOptions) {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    provider: {
      "@type": "Organization",
      name: opts.provider ?? ORG_NAME,
      sameAs: BASE_URL,
    },
    ...(opts.level ? { educationalLevel: opts.level } : {}),
    courseMode: "online",
    inLanguage: ACTIVE_LOCALES.map((locale) => SCHEMA_LOCALE_TAG[locale]),
  };
}

/* ── FAQPage ─────────────────────────────────────────────────────────────── */

export interface FaqEntry {
  question: string;
  answer: string;
}

export function faqSchema(items: FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/* ── Vendor Schemas ──────────────────────────────────────────────────────── */

interface VendorForSchema {
  id:          string;
  slug:        string;
  nameEn:      string;
  descriptionEn?: string | null;
  websiteUrl?:    string | null;
  contactEmail?:  string | null;
  vendorType:  string;
  tier:        string;
  isVerified:  boolean;
  headquartersCity?:    string | null;
  headquartersCountry?: string | null;
}

export function buildVendorSchema(vendor: VendorForSchema, locale = "fa") {
  // 89C: entity URL follows the page locale (was hardcoded /fa on every locale).
  return {
    "@context": "https://schema.org",
    "@type":    "Organization",
    name:       vendor.nameEn,
    url:        `${BASE_URL}/${isActiveLocale(locale) ? locale : DEFAULT_LOCALE}/vendors/${vendor.slug}`,
    ...(vendor.websiteUrl   ? { sameAs: [vendor.websiteUrl] } : {}),
    ...(vendor.descriptionEn ? { description: vendor.descriptionEn } : {}),
    ...(vendor.contactEmail  ? { email: vendor.contactEmail } : {}),
    ...(vendor.headquartersCity ? {
      address: {
        "@type":          "PostalAddress",
        addressLocality:  vendor.headquartersCity,
        addressCountry:   vendor.headquartersCountry ?? "",
      },
    } : {}),
    memberOf: {
      "@type": "Organization",
      name:    ORG_NAME,
      url:     BASE_URL,
    },
  };
}

export function buildVendorListSchema(vendors: VendorForSchema[]) {
  if (vendors.length === 0) return null;
  return {
    "@context":     "https://schema.org",
    "@type":        "ItemList",
    name:           "Hermes OS Vendor Directory",
    description:    "Certified industrial technology vendors, system integrators, and service providers in the Hermes OS ecosystem.",
    url:            `${BASE_URL}/fa/vendors`,
    numberOfItems:  vendors.length,
    itemListElement: vendors.map((v, i) => ({
      "@type":    "ListItem",
      position:   i + 1,
      name:       v.nameEn,
      url:        `${BASE_URL}/fa/vendors/${v.slug}`,
    })),
  };
}
