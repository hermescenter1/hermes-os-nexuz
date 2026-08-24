/**
 * PHASE 89 — Persian (fa) identical-value allowlist (deterministic, reviewed).
 *
 * Every entry is a catalog leaf whose Persian value is INTENTIONALLY identical
 * to the English value. Phase 89 translated 352 genuine English carryover
 * leaves into professional Persian; what remains identical is only the
 * language-neutral set below. The companion test
 * (`__tests__/fa-identical-audit.test.ts`) enforces BOTH directions:
 *
 *   1. any FA==EN equality NOT listed here fails (new English carryover is
 *      caught with the exact key path), and
 *   2. any listed entry that is no longer identical fails (stale entries must
 *      be pruned when a value gets genuinely translated).
 *
 * Unlike German, Persian shares no Latin words with English, so there is no
 * "word-identical" or "loanword" category — an identical value is only correct
 * when it is language-neutral:
 *   - protocol-or-standard       protocols, acronyms, standards, tech-lists
 *                                (PLC, HMI, VFD, OPC UA, MQTT, MTBF, OEE,
 *                                SKU, SEO, hreflang, robots.txt, IT / OT …)
 *   - brand-or-product           Hermes and third-party product / spec names
 *                                (Hermes OS, Open Graph, Twitter Cards)
 *   - vendor-or-thirdparty       third-party company / payment brands
 *                                (Stripe, Visa, Mastercard)
 *   - contact-url-or-propernoun  URLs, e-mails, domains, example placeholders
 *   - non-linguistic             dashes and markdown tokens (—, #, ```, "- ")
 *
 * Do NOT add an entry without a category review — this list is the enforcement
 * point that keeps future English carryover out of the Persian catalog.
 */

export type FaIdenticalCategory =
  | "protocol-or-standard"
  | "brand-or-product"
  | "vendor-or-thirdparty"
  | "contact-url-or-propernoun"
  | "non-linguistic";

export const FA_IDENTICAL_ALLOWLIST: Record<string, FaIdenticalCategory> = {
  "adminOperations.seo.robotsTxt": "protocol-or-standard",
  "adminOperations.seo.webManifest": "protocol-or-standard",
  "adminOperations.seo.xmlSitemap": "protocol-or-standard",
  "assetMaintenance.assetType.HMI": "protocol-or-standard",
  "assetMaintenance.assetType.PLC": "protocol-or-standard",
  "assetMaintenance.reliability.mtbf": "protocol-or-standard",
  "assetMaintenance.reliability.mttr": "protocol-or-standard",
  "assetOperations.enums.typeCompact.HMI": "protocol-or-standard",
  "assetOperations.enums.typeCompact.INDUSTRIAL_PC": "protocol-or-standard",
  "assetOperations.enums.typeCompact.PLC": "protocol-or-standard",
  "assetOperations.enums.typeCompact.VFD": "protocol-or-standard",
  "assetOperations.enums.typeFull.HMI": "protocol-or-standard",
  "assetOperations.enums.typeFull.PLC": "protocol-or-standard",
  "assetOperations.enums.typeFull.VFD": "protocol-or-standard",
  "brain.domains.hmi": "protocol-or-standard",
  "brain.domains.plc": "protocol-or-standard",
  "dashboard.kpi.oee": "protocol-or-standard",
  "dashboard.overview.oee": "protocol-or-standard",
  // 104-I3 — public demo-request interest options. Persian keeps the EDMS and
  // CMMS acronyms verbatim, exactly as the existing brain.domains.* entries do.
  "demo.form.interests.CMMS": "protocol-or-standard",
  "demo.form.interests.EDMS": "protocol-or-standard",
  "enterpriseOperations.inventory.columns.sku": "protocol-or-standard",
  "home.capabilities.hmi.name": "protocol-or-standard",
  "journal.discover.type.PLC_SCADA_TUTORIAL": "protocol-or-standard",
  "journalWriter.tab.seo": "protocol-or-standard",
  "knowledge.modbusTcp.name": "protocol-or-standard",
  "knowledge.mqtt.name": "protocol-or-standard",
  "knowledge.opcua.name": "protocol-or-standard",
  "library.categories.hmi": "protocol-or-standard",
  "library.categories.plc": "protocol-or-standard",
  "maintenanceOperations.nav.eyebrow": "protocol-or-standard",
  "meta.pages.seo.hreflang": "protocol-or-standard",
  "org.departments.types.it_ot": "protocol-or-standard",
  "publicSite.modules.groups.business.items": "protocol-or-standard",
  "publicSite.platform.layers.business.modules": "protocol-or-standard",
  "publicSite.trustStrip.protocols": "protocol-or-standard",
  // R2 — public capability pages (gap-closure roadmap). CMMS/EDMS/ERP/CRM are
  // technical abbreviations with no Persian equivalent in industrial-software
  // usage, exactly like the existing MQTT/OPC UA/HMI/PLC entries above.
  "nav.items.capCmms": "protocol-or-standard",
  "nav.items.capCrm": "protocol-or-standard",
  "nav.items.capEdms": "protocol-or-standard",
  "nav.items.capErp": "protocol-or-standard",
  // F2 — the same four acronyms in the REAL public header registry
  // (publicSite.header.nav), which is what visitors actually see.
  "publicSite.header.nav.capCmms": "protocol-or-standard",
  "publicSite.header.nav.capCrm": "protocol-or-standard",
  "publicSite.header.nav.capEdms": "protocol-or-standard",
  "publicSite.header.nav.capErp": "protocol-or-standard",
  "services.capabilities.cmms.connects.items.1.name": "protocol-or-standard",
  "services.capabilities.cmms.name": "protocol-or-standard",
  "services.capabilities.crm.connects.items.0.name": "protocol-or-standard",
  "services.capabilities.crm.connects.items.1.name": "protocol-or-standard",
  "services.capabilities.crm.name": "protocol-or-standard",
  "services.capabilities.digitalTwin.connects.items.1.name": "protocol-or-standard",
  "services.capabilities.edms.connects.items.0.name": "protocol-or-standard",
  "services.capabilities.edms.connects.items.1.name": "protocol-or-standard",
  "services.capabilities.edms.name": "protocol-or-standard",
  "services.capabilities.erp.connects.items.0.name": "protocol-or-standard",
  "services.capabilities.erp.connects.items.1.name": "protocol-or-standard",
  "services.capabilities.erp.name": "protocol-or-standard",
  "services.capabilities.multiSite.connects.items.0.name": "protocol-or-standard",
  "services.capabilities.predictiveMaintenance.connects.items.1.name": "protocol-or-standard",
  "adminOperations.seo.twitterCards": "brand-or-product",
  "authExperience.brandName": "brand-or-product",
  // PHASE 103 — the product name of the voice panel. Everything else in
  // copilot.liveVoice.* is genuinely Persian; a product name is not translated.
  "copilot.liveVoice.brand": "brand-or-product",
  "meta.pages.seo.ogTags": "brand-or-product",
  "landing.pricing.paymentMastercard": "vendor-or-thirdparty",
  "landing.pricing.paymentStripe": "vendor-or-thirdparty",
  "landing.pricing.paymentVisa": "vendor-or-thirdparty",
  "about.website": "contact-url-or-propernoun",
  "auth.emailPlaceholder": "contact-url-or-propernoun",
  "authExperience.forgot.emailPlaceholder": "contact-url-or-propernoun",
  "automationOperations.webhooks.urlPlaceholder": "contact-url-or-propernoun",
  "contact.generalEmail": "contact-url-or-propernoun",
  "contact.githubUrl": "contact-url-or-propernoun",
  "contact.linkedinUrl": "contact-url-or-propernoun",
  "contact.salesEmail": "contact-url-or-propernoun",
  "contact.supportEmail": "contact-url-or-propernoun",
  "contact.websiteUrl": "contact-url-or-propernoun",
  "publicSite.footer.domain": "contact-url-or-propernoun",
  "admin.metrics.none": "non-linguistic",
  "journalWriter.guide.0.code": "non-linguistic",
  "journalWriter.guide.1.code": "non-linguistic",
  "journalWriter.guide.2.code": "non-linguistic",
  "journalWriter.guide.3.code": "non-linguistic",
  "journalWriter.guide.4.code": "non-linguistic",
  "unknownCenter.metrics.none": "non-linguistic",
  // PHASE 104-I3 — vendor application placeholders that are literal sample
  // tokens (a sample company name, a sample e-mail, a sample URL). Persian
  // renders them unchanged because they are not prose.
  "vendors.apply.form.contactEmailPlaceholder": "contact-url-or-propernoun",
  "vendors.apply.form.websiteUrlPlaceholder": "contact-url-or-propernoun",
};

/** Audit summary (kept in sync by the companion test). */
export const FA_IDENTICAL_COUNTS: Record<FaIdenticalCategory, number> = {
  // R2: +18 — CMMS/EDMS/ERP/CRM capability-page labels (nav + card names).
  // F2: +4  — the same acronyms in the real public header registry.
  // 104-I3: +2 — EDMS/CMMS as demo-request interest options.
  "protocol-or-standard": 57,
  // Phase 103: +1 — copilot.liveVoice.brand ("Hermes Live Voice Intelligence").
  "brand-or-product": 4,
  "vendor-or-thirdparty": 3,
  // 104-I3: +2 — vendor application sample tokens (sample e-mail, sample URL).
  "contact-url-or-propernoun": 13,
  "non-linguistic": 7
} as const;
