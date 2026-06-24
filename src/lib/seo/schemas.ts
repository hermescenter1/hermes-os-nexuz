/**
 * JSON-LD schema builders — Phase 62.
 * All builders return plain objects ready for serialisation via <JsonLd />.
 */

import { BASE_URL, SITE_NAME, ORG_NAME, CONTACT_EMAIL, ORG_LOGO_URL, OG_IMAGE_URL } from "./config";

/* ── Organisation ────────────────────────────────────────────────────────── */

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORG_NAME,
    alternateName: SITE_NAME,
    url: BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: ORG_LOGO_URL,
    },
    contactPoint: {
      "@type": "ContactPoint",
      email: CONTACT_EMAIL,
      contactType: "customer support",
      availableLanguage: ["Persian", "English"],
    },
    sameAs: [],
  };
}

/* ── WebSite + SearchAction ──────────────────────────────────────────────── */

export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: BASE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/fa/library?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/* ── SoftwareApplication ─────────────────────────────────────────────────── */

export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Enterprise industrial automation platform combining PLC programming, SCADA, HMI, and an AI copilot into one bilingual operations surface.",
    url: BASE_URL,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    image: OG_IMAGE_URL,
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
    datePublished: opts.datePublished ?? "2026-01-01",
    dateModified:  opts.dateModified  ?? "2026-06-25",
    inLanguage: opts.locale === "fa" ? "fa-IR" : "en-US",
    author: {
      "@type": "Organization",
      name: ORG_NAME,
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: ORG_NAME,
      logo: { "@type": "ImageObject", url: ORG_LOGO_URL },
    },
    keywords: opts.keywords?.join(", "),
    image: OG_IMAGE_URL,
  };
}

/* ── JobPosting ──────────────────────────────────────────────────────────── */

export interface JobPostingSchemaOptions {
  id: string;
  title: string;
  description: string;
  location: string;
  currency: string;
  salaryMin: number;
  salaryMax: number;
  contractType: string;
  datePosted: string;
  validThrough?: string;
  skills: string[];
}

export function jobPostingSchema(opts: JobPostingSchemaOptions) {
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: opts.title,
    description: opts.description,
    identifier: {
      "@type": "PropertyValue",
      name: ORG_NAME,
      value: opts.id,
    },
    hiringOrganization: {
      "@type": "Organization",
      name: ORG_NAME,
      sameAs: BASE_URL,
      logo: ORG_LOGO_URL,
    },
    jobLocation: {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: opts.location },
    },
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
    employmentType: contractTypeToSchema(opts.contractType),
    datePosted: opts.datePosted,
    ...(opts.validThrough ? { validThrough: opts.validThrough } : {}),
    skills: opts.skills.join(", "),
  };
}

function contractTypeToSchema(type: string): string {
  const map: Record<string, string> = {
    "full-time": "FULL_TIME",
    "part-time": "PART_TIME",
    contract:    "CONTRACTOR",
    freelance:   "CONTRACTOR",
    internship:  "INTERN",
  };
  return map[type] ?? "FULL_TIME";
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
    inLanguage: ["fa-IR", "en-US"],
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
