import { NextResponse } from "next/server";
import {
  BASE_URL,
  SITE_NAME,
  ORG_NAME,
  ORG_SHORT_NAME,
  PRODUCT_CATEGORY,
  ORG_ID,
  PRODUCT_ID,
  WEBSITE_ID,
} from "@/lib/seo/config";
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
  const body = `# ${SITE_NAME} — ${PRODUCT_CATEGORY}

> ${SITE_NAME} is an ${PRODUCT_CATEGORY.toLowerCase()} developed by ${ORG_NAME}
> (short brand: ${ORG_SHORT_NAME}). Canonical entity IDs for this site are
> ${ORG_ID} (the company), ${PRODUCT_ID} (the product) and ${WEBSITE_ID}.
> Hermes Brain, Hermes Industrial Brain and Hermes Engineering Copilot are
> capabilities WITHIN ${SITE_NAME}, not separate products or companies.
>
> Hermes Brain and Hermes Industrial Brain are TWO DISTINCT capabilities and
> must not be treated as duplicates of one another: Hermes Brain is the
> Industrial Knowledge Engine, while Hermes Industrial Brain performs alarm
> intelligence, signal-matrix and industrial fault analysis. Each has its own
> canonical public page; neither redirects or canonicalises to the other.
>
> The platform provides: evidence-based diagnostic reasoning, engineering
> knowledge management, asset registry, CMMS, predictive maintenance and
> multi-site operations — with explainable analysis and human-approved safe
> action paths. UI languages: Persian and English${locales.length > 2 ? " and German" : ""}.

## Core pages
${locales.map((p) => `- ${BASE_URL}${p}: Homepage (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/platform: Platform overview (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/brain: Hermes Brain — the Industrial Knowledge Engine: domain-specific engineering knowledge over PLC logic, SCADA alarms, HMI design and OT cybersecurity. A capability of Hermes OS. Distinct from Hermes Industrial Brain (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/industrial-brain: Hermes Industrial Brain — alarm intelligence, signal matrix and deterministic industrial fault analysis. A capability of Hermes OS. Distinct from Hermes Brain (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/copilot: Hermes Engineering Copilot — engineering assistance, a capability of Hermes OS (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/architecture: Architecture — PLC, SCADA, HMI, OPC UA and MQTT connectivity (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/about: About Hermes Novin Mehr (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/contact: Contact (${p.slice(1)})`).join("\n")}

## Knowledge
${locales.map((p) => `- ${BASE_URL}${p}/library: Open engineering knowledge library (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/articles: Industrial Journal — community engineering articles (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/academy: Hermes Academy — industrial courses (${p.slice(1)})`).join("\n")}

## Platform capabilities
These are implemented, running capabilities of ${SITE_NAME} — each is a
capability within the single ${PRODUCT_ID} entity, not a separate product.
The pages below are public explainers; the operational data behind each
capability (records, tenants, telemetry) stays inside the authenticated
workspace and is never exposed here.
${locales.map((p) => `- ${BASE_URL}${p}/services/digital-twin: Digital Twin — a live node-and-relation graph of plant assets overlaid with real telemetry (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/services/predictive-maintenance: Predictive Maintenance — remaining-useful-life estimation and risk scoring from asset telemetry (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/services/cmms: CMMS — work orders, preventive scheduling, spare parts and maintenance cost (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/services/multi-site: Multi-Site Operations — cross-site KPI comparison and failure-pattern detection (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/services/edms: EDMS — version-controlled engineering documents with approvals and retention (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/services/erp: ERP — project, task, inventory and approval workflows on the same tenancy (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/services/ot-edge: OT Edge — a governed, read-only registry for OT gateways and devices (${p.slice(1)})`).join("\n")}
${locales.map((p) => `- ${BASE_URL}${p}/services/crm: CRM — the sales pipeline, on the same tenancy as the rest of the platform (${p.slice(1)})`).join("\n")}

## Machine-readable
- ${BASE_URL}/sitemap.xml: Multilingual sitemap (canonical public URLs)
- ${BASE_URL}/robots.txt: Crawler policy

## Notes
- Authenticated product areas (dashboard, CRM, ERP, assets, CMMS, documents,
  organization, billing, admin) are private and intentionally not listed.
  The capability pages above are public explainers of what each does; the
  tenant records, telemetry and deals behind them stay inside sign-in.
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
