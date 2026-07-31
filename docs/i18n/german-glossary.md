# German Terminology Glossary — Hermes OS (PHASE 87L.6)

Authoritative terminology for German (`de`) localization. Internal document —
not exposed as a public route. Product names and protocol names are trademarks
or technical abbreviations and stay untranslated everywhere.

## Product names — NEVER translated

| Term | German usage |
|---|---|
| Hermes OS, Hermes Novin Mehr IRIC | unchanged |
| Industrial Brain | unchanged (product name) |
| Hermes Copilot / Engineering Copilot | unchanged |
| Hermes Academy | unchanged |
| Command Center, Knowledge Engine & Graph | unchanged |
| PLC, SCADA, HMI, OPC UA, MQTT, EDMS, CMMS, ERP, CRM, ATS, RBAC, FFT, RMS | unchanged (technical abbreviations) |

## Core concepts

| English | German | Notes |
|---|---|---|
| Industrial Intelligence | industrielle Intelligenz | |
| Safe Action Path | sicherer Maßnahmenpfad | pipeline stage label: „Sicherer Maßnahmenpfad" |
| Asset Registry | Anlagenregister | |
| Predictive Maintenance | prädiktive Instandhaltung | |
| Work Order | Arbeitsauftrag | |
| Controlled Document | gelenktes Dokument | DIN EN ISO 9001 terminology |
| Root Cause | Grundursache | |
| Evidence | Evidenz | diagnostic-reasoning context; „Nachweis" for legal/audit contexts |
| Interlock | Verriegelung | |
| Automation Engineering | Automatisierungstechnik | |
| Maintenance Strategy | Instandhaltungsstrategie | |
| Digital Twin | Digitaler Zwilling | |
| Knowledge Graph | Wissensgraph | |
| Knowledge Library | Wissensbibliothek | |
| Industrial Journal | Industriejournal | |
| Vendor Directory | Lieferantenverzeichnis | |
| Multi-tenant | mandantenfähig | isolation: „Mandantenisolation" |
| Tenant | Mandant | |
| Site (plant location) | Standort | site-level: „auf Standortebene" |
| Plant | Anlage / Werk | „Werk" for the facility, „Anlage" for equipment/plant systems |
| Audit trail | Audit-Trail | established anglicism in German enterprise software |
| Explainable | nachvollziehbar | |
| Deterministic | deterministisch | |
| Hypothesis / ranked hypotheses | Hypothese / priorisierte Hypothesen | |
| Confidence | Konfidenz | |
| Human approval | menschliche Freigabe | |
| Command center (physical room) | Leitstand | German industry standard term |
| Remaining useful life | Restnutzungsdauer | |
| Baseline | Baseline | established anglicism in condition monitoring |
| On-prem / private cloud | On-Premises / Private Cloud | |
| Request a Demo | Demo anfragen | |
| Sign in / Sign out | Anmelden / Abmelden | |
| Password reset | Passwort zurücksetzen | |
| Engineering case | Engineering-Fall | case management: „Fallverwaltung"; a single record: „der Fall" |
| Recommended action | empfohlene Maßnahme | |
| Asset | Anlage / Asset | „Asset" accepted in German asset-management software; registry: „Anlagenregister" |
| Alarm | Alarm | identical German word; alarm list: „Alarmliste"; acknowledged: „quittiert" |
| Gateway | Gateway | established anglicism (das Gateway); OT context: „Edge-Gateway" |
| Knowledge article | Wissensartikel | |
| Unknown analysis | Unbekannten-Analyse | product surface stays „Unknown Analysis Center" (brand) |
| Dashboard | Dashboard | established anglicism (das Dashboard); factory dashboard: „Werksdashboard" |
| Operational status | Betriebsstatus | status chips Online/Offline stay untranslated (accepted usage) |
| Maintenance | Instandhaltung | corrective repair: „Instandsetzung"; work order: „Arbeitsauftrag" |

## Style rules

- Formal address („Sie", never „du").
- Decimal comma in prose numbers („0,86"), non-breaking space before % where practical („+18 %").
- Sentence-case microcopy consistent with the EN catalog’s sentence case.
- Compound nouns preferred over prepositional chains where natural
  (Instandhaltungsabläufe, Validierungsstufen, Anlagentelemetrie).
- Never translate database identifiers, enum values, or user-entered free text.

## Namespace status (catalog `messages/de.json`)

**PHASE 88 — the catalog is CLOSED.** Every namespace is genuinely German; the
namespace-level carryover ceiling in `de-catalog.test.ts` is **zero** (87L.6F)
and any regression fails CI immediately.

Value-level enforcement (Phase 88): all **362** leaves whose German value is
intentionally identical to English are individually reviewed and categorized in
`src/i18n/de-identical-allowlist.ts` (German words spelled identically ·
accepted loanwords · brand/product names · protocols/standards · vendors ·
contact data/URLs · brand eyebrows · non-linguistic values).
`src/i18n/__tests__/de-identical-audit.test.ts` enforces the list in both
directions — a NEW DE==EN equality fails with the exact key path (translate it
or review+allowlist it), and a stale entry fails until pruned. The same suite
guards against Persian script in `de.json`, whitespace-only values in any
locale, and raw-key-looking values.

Outbound auth e-mails (verification / password reset / welcome) are fully
tri-lingual in `src/lib/email/templates/email-locale.ts` (Sie-form German,
placeholders preserved; unknown locale falls back to English).
