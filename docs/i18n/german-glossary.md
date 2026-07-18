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

## Style rules

- Formal address („Sie", never „du").
- Decimal comma in prose numbers („0,86"), non-breaking space before % where practical („+18 %").
- Sentence-case microcopy consistent with the EN catalog’s sentence case.
- Compound nouns preferred over prepositional chains where natural
  (Instandhaltungsabläufe, Validierungsstufen, Anlagentelemetrie).
- Never translate database identifiers, enum values, or user-entered free text.

## Namespace status (catalog `messages/de.json`)

- Genuinely German: meta, nav, common, home, footer, brand, auth, landing,
  contact, journal, journalWriter, journalEditorial, adminOperations,
  adminGovernance, industrialBrain, assetOperations, maintenanceOperations,
  automationOperations, enterpriseOperations, **publicSite (87L.6)**,
  **authExperience (87L.6)**.
- Deliberate English carryover (documented, pending translation): remaining
  public product pages (platform, modules, services, architecture, library)
  and the authenticated app namespaces. See the 87L.6 report for the
  activation gate.
