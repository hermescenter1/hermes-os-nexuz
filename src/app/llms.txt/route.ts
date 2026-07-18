import { NextResponse } from "next/server";
import { BASE_URL } from "@/lib/seo/config";
import { ACTIVE_LOCALES } from "@/i18n/locales";

// PHASE 87L.6 — llms.txt: a SUPPLEMENTAL discovery document for AI systems.
//
// It does not replace robots.txt, the sitemap or structured data, and support
// across AI systems is not guaranteed — it simply gives retrieval systems a
// concise, factual map of the STABLE PUBLIC canonical resources. Rules:
// public canonical URLs only, no private endpoints, no secrets, no
// fabricated claims. Localized sections are generated from ACTIVE_LOCALES so
// German joins automatically when it is activated.

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const locales = ACTIVE_LOCALES.map((l) => `/${l}`);
  const body = `# Hermes OS — Industrial Intelligence Platform

> Hermes OS (Hermes Novin Mehr IRIC) is an enterprise industrial intelligence
> platform: evidence-based diagnostic reasoning (Industrial Brain), engineering
> knowledge management, asset registry, CMMS, predictive maintenance and
> multi-site operations — with explainable analysis and human-approved safe
> action paths. UI languages: Persian and English${locales.length > 2 ? " and German" : ""}.

## Core pages
${locales.map((p) => `- ${BASE_URL}${p}: Homepage (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/platform: Platform overview (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/industrial-brain: Industrial Brain — diagnostic reasoning workspace (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/about: About Hermes Novin Mehr (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/contact: Contact (${p.slice(1)})`).join("\n")}

## Knowledge
${locales.map((p) => `- ${BASE_URL}${p}/library: Open engineering knowledge library (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/articles: Industrial Journal — community engineering articles (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/academy: Hermes Academy — industrial courses (${p.slice(1)})`).join("\n")}

## Machine-readable
- ${BASE_URL}/sitemap.xml: Multilingual sitemap (canonical public URLs)
- ${BASE_URL}/robots.txt: Crawler policy

## Notes
- Authenticated product areas (dashboard, CRM, ERP, assets, CMMS, documents,
  organization, billing, admin) are private and intentionally not listed.
- Analyses are evidence-based and explainable; recommendations always require
  human approval before touching plant state.
`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
