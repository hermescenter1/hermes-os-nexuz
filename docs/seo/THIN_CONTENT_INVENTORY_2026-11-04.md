# Thin-content inventory and expansion — 2026-11-04

Status: DRAFT for owner review. Nothing here is deployed.

## 1. Method

- Source: the live sitemap `https://hermesnovin.com/sitemap.xml`, fetched 2026-11-04 — 433 URLs, all HTTP 200, all `index, follow`.
- Measure: visible text inside `<main>`. Scripts, styles, SVG, `<nav>` and `<footer>` are excluded. A word is any whitespace-separated token with at least one letter or digit, in any script. ZWNJ stays inside a token, so `می‌کند` counts as one word.
- Threshold: 250 words.
- Limitation: client-rendered content does not appear in the server HTML, so it is not counted. A crawler that does not run JavaScript does not see it either.

## 2. Result

- **123 URLs (49 paths) are under 250 words**: fa 42, en 46, de 35.
- By type:
  - 55 main pages
  - 28 field cases (fa/en only by design)
  - 21 vendor hubs
  - 15 job postings
  - 4 author pages
- `/pricing` (289–336 words) and `/industrial-brain` (939–1045) are **not** thin.
- The ~60-word service pages are the five rendered by `ServiceDetail`: plc, scada-hmi, industrial-ai, cybersecurity and knowledge-cloud. `/services/ot-edge` and the other `CapabilityDetail` pages are 223–351 words.

Columns fa/en/de are live word counts before this change, worst first by the lowest locale ("—" means the URL is not in the sitemap for that locale).

| # | Path | fa | en | de | Note |
|---|---|---:|---:|---:|---|
| 1 | `/articles/author/shalini-c-mr260nosb2bn` | 27 | 157 | 24 | Author page — bio owned by the author |
| 2 | `/academy` | 41 | 39 | 39 | Client-rendered list (SSR shows "Loading…"); a rendering fix, not copy |
| 3 | `/vendors` | 61 | 56 | 39 | Client-rendered list (SSR shows "Loading…"); a rendering fix, not copy |
| 4 | `/services/cybersecurity` | 70 | 59 | 52 | Expanded in this PR |
| 5 | `/services/scada-hmi` | 64 | 59 | 53 | Expanded in this PR |
| 6 | `/library/vendor/delta` | 70 | 67 | 53 | Vendor hub — follow-up (vendor-specific copy needs owner review) |
| 7 | `/library/vendor/mitsubishi` | 71 | 67 | 53 | Vendor hub — follow-up (vendor-specific copy needs owner review) |
| 8 | `/library/vendor/schneider` | 81 | 70 | 54 | Vendor hub — follow-up (vendor-specific copy needs owner review) |
| 9 | `/services/industrial-ai` | 64 | 65 | 57 | Expanded in this PR |
| 10 | `/library/vendor/phoenix` | 75 | 70 | 57 | Vendor hub — follow-up (vendor-specific copy needs owner review) |
| 11 | `/library/vendor/abb` | 75 | 70 | 58 | Vendor hub — follow-up (vendor-specific copy needs owner review) |
| 12 | `/library/vendor/omron` | 80 | 69 | 59 | Vendor hub — follow-up (vendor-specific copy needs owner review) |
| 13 | `/services/knowledge-cloud` | 60 | 60 | 61 | Expanded in this PR |
| 14 | `/services/plc` | 69 | 64 | 62 | Expanded in this PR |
| 15 | `/library/vendor/siemens` | 110 | 99 | 73 | Vendor hub — follow-up (vendor-specific copy needs owner review) |
| 16 | `/brain` | 97 | 92 | 77 | Expanded in this PR |
| 17 | `/library/cases/case-abb-acs580-oc` | 114 | 106 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 18 | `/platform` | 149 | 135 | 120 | Expanded in this PR |
| 19 | `/library` | 149 | 141 | 121 | Expanded in this PR |
| 20 | `/library/cases/case-delta-vfd-oh` | 139 | 127 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 21 | `/library/cases/case-mitsubishi-mrj4-al16` | 146 | 131 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 22 | `/library/cases/case-abb-motor-imbalance` | 145 | 133 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 23 | `/library/cases/case-delta-hmi-rs485` | 137 | 134 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 24 | `/library/cases/case-schneider-atv-ocf` | 145 | 136 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 25 | `/library/cases/case-omron-e5cc-drift` | 146 | 139 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 26 | `/library/cases/case-schneider-m580-timeout` | 151 | 142 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 27 | `/library/cases/case-mitsubishi-fx5-coil` | 154 | 143 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 28 | `/library/cases/case-phoenix-mqtt-drop` | 148 | 144 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 29 | `/library/cases/case-omron-nx-estop-reset` | 150 | 144 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 30 | `/library/cases/case-siemens-1500-scan` | 154 | 147 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 31 | `/library/cases/case-phoenix-di-chatter` | 152 | 147 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 32 | `/library/cases/case-siemens-1200-bf` | 152 | 148 | — | Field case, fa/en only by design (CASE_CONTENT_LOCALES) |
| 33 | `/demo` | 183 | 166 | 153 | Conversion page — follow-up |
| 34 | `/careers/cmur86hgx000q01pf257kqa5q` | 205 | 188 | 157 | Job posting — DB content owned by HR |
| 35 | `/careers` | 186 | 175 | 164 | Capability page — near threshold, follow-up |
| 36 | `/copilot` | 185 | 170 | 165 | Expanded in this PR |
| 37 | `/contact` | 189 | 190 | 169 | Conversion page — follow-up |
| 38 | `/careers/cmur86hks001n01pf62636b4s` | 208 | 186 | 174 | Job posting — DB content owned by HR |
| 39 | `/careers/cmur86hje001601pfiu2skftm` | 231 | 213 | 182 | Job posting — DB content owned by HR |
| 40 | `/articles/author/hamid-mqz7tv3c76up` | 560 | 432 | 189 | Author page — bio owned by the author |
| 41 | `/careers/cmur86hmj002j01pfsm7ktxr9` | 238 | 222 | 197 | Job posting — DB content owned by HR |
| 42 | `/careers/cmur86hlp002301pf55nda8iy` | 247 | 216 | 203 | Job posting — DB content owned by HR |
| 43 | `/services/erp` | 249 | 246 | 223 | Capability page — near threshold, follow-up |
| 44 | `/services/cmms` | 260 | 231 | 224 | Capability page — near threshold, follow-up |
| 45 | `/services/edms` | 260 | 237 | 225 | Capability page — near threshold, follow-up |
| 46 | `/services/multi-site` | 264 | 246 | 227 | Capability page — near threshold, follow-up |
| 47 | `/architecture` | 257 | 244 | 230 | Follow-up — its "Phase 2" note needs owner reconciliation first |
| 48 | `/services/crm` | 270 | 269 | 239 | Capability page — near threshold, follow-up |
| 49 | `/services` | 279 | 283 | 244 | Expanded in this PR |

## 3. Pages expanded in this branch (top 10)

The ten pages, measured locally on this branch with `next dev` and the same counter:

| Page | fa | en | de | Where the copy lives |
|---|---:|---:|---:|---|
| `/services/plc` | 381 | 357 | 345 | `services.items.plc.detail` |
| `/services/scada-hmi` | 343 | 328 | 272 | `services.items.scadaHmi.detail` |
| `/services/industrial-ai` | 383 | 368 | 345 | `services.items.industrialAi.detail` |
| `/services/cybersecurity` | 358 | 326 | 306 | `services.items.cybersecurity.detail` |
| `/services/knowledge-cloud` | 347 | 334 | 314 | `services.items.knowledgeCloud.detail` |
| `/platform` | 464 | 434 | 397 | `architecture.guides.platform` |
| `/brain` | 323 | 315 | 289 | `architecture.guides.brain` |
| `/copilot` | 377 | 351 | 335 | `architecture.guides.copilot` |
| `/library` | 307 | 283 | 250 | `architecture.guides.library` |
| `/services` | 389 | 399 | 340 | `services.hubGuide` |

All new copy is in **server-only** namespaces (`services`, `architecture`; see `src/i18n/client-namespaces.json`), so none of it is added to the client payload.

## 4. Evidence behind the new copy

Every statement was drawn from code or from catalog text already in the repository. No customer names, metrics, certifications or third-party claims were added.

| Claim in the new copy | Evidence |
|---|---|
| Automation Engineering Studio; S7-1200 / S7-1500 / generic IEC 61131-3 targets | `src/lib/automation-studio/contract.ts:112` |
| Stable validation diagnostic codes | `src/lib/automation-studio/contract.ts:221-233` |
| Approval states draft → reviewed → approved → commissioned; only drafts editable | `src/lib/automation-studio/contract.ts:280-286` |
| Studio data authored or simulated, never live | `src/lib/automation-studio/contract.ts:26-31,307` |
| Engineering export import (TIA / PLC / HMI / SCADA) and deterministic advisory rules | `src/lib/ot-edge/import-envelope.ts:39-46` and `src/lib/ot-edge/analysis-rules.ts:1-62` |
| No download to a controller, no automatic code application, safety scope review-only | `src/lib/tia-companion/contract.ts:41-53` and `src/lib/ot-edge/analysis-rules.ts:300-305` |
| SCADA artefact kinds (HMI screen, faceplate, alarm, trend, area, historian, report) | `src/lib/automation-studio/contract.ts:122-135` |
| SCADA Control Room gateway connectivity states and site-scoped, fail-closed access | `src/lib/scada-control-room/contract.ts:47-156` and `src/app/[locale]/engineering/scada-control-room/page.tsx` |
| Control Room is a view, configured alarms only; live alarms, live PLC diagnostics and mimics unavailable | `src/lib/scada-control-room/contract.ts:28-33,160-169,318-337` |
| Gateway enrol / rotate / revoke in a secret store, signed and replay-protected envelopes, read-only default | `docs/ot/phase94-secure-enrollment.md`, `src/app/api/ot/gateways/**` and `prisma/schema.prisma` (`readOnlyMode`, `GatewayEnvelopeNonce`) |
| Six network zones and the zone-conflict rule; no scanning or probing | `prisma/schema.prisma` (zone enum, network-node comment) and `src/lib/ot-edge/analysis-rules.ts:320-337` |
| OT permissions, findings review limited to OWNER / ADMIN / MANAGER | `src/lib/org/rbac.ts:84-91,214-221` |
| Audit log per organisation with correlation ID | `prisma/schema.prisma` `AuditLog` and `src/lib/audit/audit-service.ts` |
| Public Brain / Copilot engine deterministic, no LLM, no persistence | `src/app/api/copilot/demo/route.ts:10-24,96-105` |
| 12 classifier domains; a weak match is unknown | `src/lib/services/types.ts:154-157` and `src/lib/industrial/brain-core.ts:79` |
| 7 indexed vendors | `src/lib/industrial/vendors.ts:25-61` |
| Case matching on keyword, vendor and domain | `src/lib/industrial/cases.ts:75-95` |
| Confidence 0–100 from evidence, "no AI estimation" | `src/lib/industrial/confidence.ts:1-66` |
| Risk raised by safety class and urgent words | `src/lib/industrial/pipeline.ts:154-169` |
| Guardrails refuse bypass / defeat / forcing; LOTO notice; human approval required | `src/lib/llm/guardrails.ts:26-89`, `src/lib/industrial/brain-core.ts:266-279` and `src/app/api/copilot/demo/route.ts:169,221` |
| Analysis in fa or en; de shows en | `src/app/api/copilot/demo/route.ts:147` |
| Copilot telemetry binding "simulated", PLC connectivity "phase2" | `src/lib/industrial/platform-facts.ts:80-86` |
| Knowledge categories; each library entry has key points, checks, related entries and cases | `src/lib/industrial/knowledge-data/*.json` and `library.article.*` in the catalogs |
| Library entries trilingual; case bodies fa/en only | `src/lib/industrial/cases.ts:54` |
| Drafts → review → published; anonymous users see published only | `src/lib/storage/types.ts:10-11`, `src/app/api/cases/route.ts:16-21` and `src/app/api/knowledge/route.ts:12-15` |
| Library search matches titles, summaries and keywords | `src/components/library/LibraryClient.tsx:166-202` |
| Report separates observed / inferred / unknown | `industrialBrain.reference.lede` in the catalogs |

## 5. Owner sign-off required

### A. New statements that need confirmation before publishing

1. **Is a "service" software only, or also a human engineering service by ZHARFA?** The repository shows software only. The new copy describes software. If ZHARFA also sells engineering work (programming, commissioning, audits), the copy needs a paragraph about it, and only the owner can write it.
2. **The Automation Engineering Studio and the SCADA Control Room are behind sign-in.** The copy names them as signed-in workspaces. Confirm both names may be shown publicly.
3. **"Only a draft can be edited"** (PLC). This is true in the Studio contract types, but Studio edits are held in memory only (`src/lib/automation-studio/edit-state.ts:13-23`). Confirm that the approval workflow should be advertised in its current form.
4. **Twelve domains / seven vendors / 0–100 score** are hard-coded numbers in copy. They become wrong when the code changes.
5. **Cybersecurity: "credentials held in a dedicated secret store"** depends on OpenBao being configured in production. Confirm it is.
6. **Cybersecurity boundary:** the copy says these controls are not a penetration test, a scanner or an IDS. The repository also records that no external security assessment has been completed (`docs/security/phase99-assurance-report.md`). That fact was **deliberately left out** of the public copy, because publishing it is the owner's decision.
7. **"/library": German pages link to a case only where a German version exists.** This describes the current `CASE_CONTENT_LOCALES` behaviour.

### B. Existing claims the repository did not back — corrected in this PR

The owner asked for these to be corrected as well (2026-11-04).

- 48 existing leaves were rewritten in en, fa and de; the leaf count is unchanged.
- Each new wording uses only the evidence in section 4.

| Leaf(s) | Was (en) | Now (en) |
|---|---|---|
| `services.items.plc.short` / `.lede` | "Ladder and structured text…" / "…version control logic…" | "IEC 61131-3 logic, validated and reviewed." / "Author logic for S7-1200, S7-1500 and generic IEC 61131-3 targets, and check it before anyone approves it." |
| `services.items.plc.points.*` | Ladder & structured text; "Siemens S7, ABB, and Schneider conventions"; "Every change is … tracked" | Structured text (SCL); Siemens-first, other platforms use a generic IEC 61131-3 target; approval states, only a draft is editable |
| `services.items.scadaHmi.short` / `.lede` | "Supervisory control…" / "…the supervisory layer that drives them" | Supervisory engineering; model and check screens, alarms and trends, and see gateway connectivity for each site |
| `services.items.scadaHmi.points.*` | "Live mimic diagrams…"; HMI layouts in both directions; "Surface what matters first" | Project artefacts; trilingual RTL/LTR workspace; alarm definitions checked for a priority and an operator message |
| `services.items.industrialAi.points.two` | "Logic drafting" | "Evidence you can check" |
| `services.items.cybersecurity.short` / `.lede` / `.points.one` | "Posture and audit for OT networks"; "…harden the OT network"; "…zones, and conduits at a glance" | Gateway security, zone modelling and audit for OT data; control how OT data enters the platform; zone model with flagged conflicts |
| `services.items.knowledgeCloud.lede` / `.points.one` / `.points.two.desc` | "…query in plain language"; "Plain-language search"; "Standards, components…" | Library that Hermes Brain cites; keyword search with filters; motors, contactors, MCCs, protection and drives |
| `meta.pages.service{Plc,ScadaHmi,Cybersecurity,KnowledgeCloud,IndustrialAi}.*` | "commissioning, optimization"; "design, deploy… enterprise SCADA"; Wonderware/FactoryTalk; "enterprise-grade… services"; "historian integration, AI-ready pipelines"; "process optimization" | Titles, descriptions and keywords rewritten to the implemented capability; "Services" dropped from the titles |
| `meta.pages.brain.description` | "…trained on industrial automation" | "…a deterministic engineering-analysis engine… with no language model" |
| `meta.pages.copilot.description` | "draft PLC logic… manage HMI" | Explain alarms, classify faults, match field cases |
| `meta.pages.platform.description` / `.keywords` | "combining SCADA, HMI, PLC…" / "PLC integration" | Evidence-to-action pipeline, with OT data entering through read-only gateways |
| `publicSite.platform.layers.security.modules` | "… · PLC · SCADA · OPC UA · MQTT" | "… · OT Edge gateways · Engineering-export import · Telemetry ingest" |
| `industrialBrain.deploy.desc` | "Full integration with CMMS, EDMS, expert network…" | Saved analyses become draft engineering cases reviewed by the organisation's own authors |
| `brain.intel.memoryNote` | "Held in server session memory — V1 keeps no database." | "Public demo: analyses are computed on request and never stored, so this panel stays empty." |
| `src/components/copilot/CopilotClient.tsx` KPI note | "Domains 9 · query classifications" | "Domains 9 · knowledge domains" (the panel lists the 9 knowledge domains; the classifier has 12) |

Withdrawn after re-checking:

- **"Command Center" is backed.** `nav.items.opsCenter` = "Operations Command Center" points at `/dashboard/operations` (`src/lib/navigation/site-nav.ts:50`). Unchanged.
- **`architecture.note` / `architecture.future` ("Phase 2 gateways") is accurate.** OPC UA, Modbus and MQTT drivers do not exist yet (`src/lib/industrial/connectors/base.ts`), so "represented, not connected" is still true. Unchanged.

Still open for the owner:

- Whether ZHARFA sells human engineering services (see A.1). If it does, the "Services" framing and the meta titles can carry them again.
- The Copilot KPI strip is hard-coded English in all locales (pre-existing). It needs localisation.

## 6. Follow-ups (not in this PR)

- `/academy` and `/vendors`: the lists render client-side only ("Loading…"). Server-render the first page of results.
- `/library/vendor/*` (7 hubs, 53–110 words): add per-vendor copy after owner review of what may be said about each manufacturer.
- `/demo` and `/contact`: describe what happens after a request. This needs owner process facts.
- `/architecture`: reconcile the "Phase 2" note first, then expand.
- Capability pages at 223–245 words (de) for cmms, edms, erp, multi-site and crm.
