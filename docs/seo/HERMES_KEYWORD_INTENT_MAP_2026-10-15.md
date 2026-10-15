# Hermes OS — Keyword & Search-Intent Map (2026-10-15)

Scope: fa + en primary; de only where the page already exists in de. Canonical URLs are the
existing routes (`/{locale}…`); no new pages are proposed because the audit found no route gap.
Rank/indexability evidence: **none available** (no Search Console access in this task). Every
"gap" below is a content-relevance gap observed in the repo, not a measured ranking.
Rule: one strongest canonical per intent; articles support it by linking in. No keyword stuffing,
no `meta keywords`.

| # | Cluster | Intent (user wants…) | Primary query (fa / en) | Canonical page | Type | Gap / action | CTA | Schema | Acceptance test |
|---|---|---|---|---|---|---|---|---|---|
| A | Brand / navigational | find the company/product | هرمس او اس · Hermes OS | `/{l}` | Home (WebSite+Org+SoftwareApplication in global graph) | Optimise existing: first visible paragraph names product, domain, safety stance | Demo | Global entity graph | One H1; title contains brand; graph `@id`s stable |
| A2 | Brand | company identity | هرمس نوین · ZHARFA / Hermes Novin | `/{l}/about` | AboutPage | Keep only verified names; retired legal name stays unpublished | Contact | Organization (existing) | No retired-identity string on public pages (PR #114 gate) |
| B | Industrial AI / reasoning | understand evidence-based diagnostics | پلتفرم هوش مصنوعی صنعتی · industrial AI platform | `/{l}/services/industrial-ai` | Service/pillar | Optimise: link to Industrial Brain + journal articles | Demo | WebPage (backlog) | Inbound links ≥ 3 from articles |
| B2 | Reasoning engine | what Industrial Brain is | موتور استدلال صنعتی · industrial reasoning engine | `/{l}/industrial-brain` | Product page | Optimise; `/brain` is a deeper sibling — keep canonicals separate, cross-link | Demo | — | Distinct title/description (verified unique) |
| B3 | Predictive maintenance | evaluate PdM platform | نگهداری پیش‌بینانه · predictive maintenance platform | `/{l}/services/predictive-maintenance` | Pillar | Optimise existing | Demo | — | H1 contains topic |
| B4 | Digital twin | industrial digital twin | دوقلوی دیجیتال صنعتی | `/{l}/services/digital-twin` | Pillar | Optimise existing | Demo | — | — |
| C | PLC/SCADA/HMI | learn / buy automation intelligence | برنامه‌نویسی PLC · PLC programming | `/{l}/services/plc` | Pillar | Existing; supporting Journal/Library articles must link in | Demo | — | — |
| C2 | SCADA/HMI | SCADA design/monitoring | اسکادا · SCADA/HMI design | `/{l}/services/scada-hmi` | Pillar | Existing | Demo | — | — |
| C3 | Troubleshooting PLC, TIA Portal, S7-1200/1500 | how-to answers | عیب‌یابی PLC · PLC troubleshooting | `/{l}/articles/{slug}` + `/{l}/library` | Informational (TechArticle) | **Content gap**, not a routing gap: editorial, fact-checked articles only | Related service link | TechArticle (existing) | Each article links to its pillar |
| D | OT/data | connectivity & edge | OPC UA · MQTT · لبه OT | `/{l}/services/ot-edge` | Pillar | Existing; one canonical for OPC UA+MQTT | Demo | — | — |
| D2 | Asset ops / CMMS / EAM / EDMS | maintenance & documents | CMMS · مدیریت دارایی صنعتی | `/{l}/services/cmms`, `/services/edms` | Pillars | Existing | Demo | — | — |
| D3 | Knowledge | industrial knowledge mgmt | مدیریت دانش مهندسی | `/{l}/services/knowledge-cloud`, `/{l}/library` | Pillar + library | Existing | Library | — | — |
| D4 | OT cybersecurity | OT security | امنیت سایبری صنعتی | `/{l}/services/cybersecurity` | Pillar | Existing | Contact | — | — |
| D5 | Multi-site | multi-site ops | multi-site industrial operations | `/{l}/services/multi-site` | Pillar | Existing | Demo | — | — |
| E | Electrical engineering | learn power/earthing/drives | کیفیت توان · ارتینگ · درایو | **No page** | Informational | Do **not** repurpose product pages. Publish journal articles only after fact-check; Hermes is not an electrical contractor | Related service | TechArticle | Article exists before any claim |
| F | Careers | find open roles | استخدام اتوماسیون صنعتی | `/{l}/careers`, `/{l}/careers/{id}` | CollectionPage / JobPosting | **Fixed**: SSR job links + visible detail | Apply (gated by flag) | JobPosting only on eligible jobs | `seo-careers-server-render.test.tsx` |

## Cannibalisation rules
- `/industrial-brain` (product) vs `/brain` (workbench): distinct metadata, cross-linked, one canonical each.
- Service pillars own head terms; articles own long-tail how-to terms and link to the pillar.
- Tag pages stay noindex (PR #114 policy); category pages likewise until locale-specific copy exists.

## Locale policy
Persian and English are priority. German is served only where the existing catalogue/page is
translated; hreflang is derived from real content locales (`contentLocales`).
