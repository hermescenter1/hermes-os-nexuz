# German Release — Human Review Index (PHASE 87L.6H)

**Branch:** `phase-87l6-german-localization`
**Purpose:** the single entry point a human reviewer starts from. It links to
the detailed material rather than duplicating it.

> **Every row below is `NOT REVIEWED` until a named human signs it.**
> Automated tests are green, but no automated result may be used to fill in a
> reviewer, a date, or an approval. Passing tests prove the German is
> *structurally* complete — not that it is *correct*.

## Linked material

| Document | What it holds |
|---|---|
| [`german-glossary.md`](../i18n/german-glossary.md) | Terminology decisions across all waves |
| [`german-knowledge-review.md`](../i18n/german-knowledge-review.md) | 3,037-line per-article safety sheet (30 articles, EN/DE side by side) — **not duplicated here** |
| [`german-release-gate.md`](./german-release-gate.md) | Orphan register, `view_api_keys` observation, authenticated browser matrix |
| [`multilingual-launch-checklist.md`](../seo/multilingual-launch-checklist.md) | Owner/DevOps/portal split for the SEO launch |

## Reviewer qualification (§9)

Three distinct competencies are required. **One reviewer cannot cover all three.**

| Area | Required qualification | Why |
|---|---|---|
| A — Public & marketing German | Native German, B2B/industrial marketing literacy | Claim accuracy, natural register |
| B — Industrial & safety German | Native German **industrial engineer** (automation/electrical/maintenance) | LOTO, isolation, stored energy, interlocks — grammar competence is not sufficient |
| C — Commercial German | Native German with billing/CRM domain knowledge | Invoice/payment status precision, no invented tax or legal claims |

> **A language reviewer alone must not sign area B.** Correct grammar is not
> evidence of correct engineering meaning.

---

## 1. Public content — area A

| # | Surface | Reviewer | Experience | Date | Status | Corrections required | Approved | Signature |
|---|---|---|---|---|---|---|---|---|
| 1 | Homepage `/de` | | | | NOT REVIEWED | | ☐ | |
| 2 | About | | | | NOT REVIEWED | | ☐ | |
| 3 | Contact | | | | NOT REVIEWED | | ☐ | |
| 4 | Platform | | | | NOT REVIEWED | | ☐ | |
| 5 | Modules | | | | NOT REVIEWED | | ☐ | |
| 6 | Services | | | | NOT REVIEWED | | ☐ | |
| 7 | Architecture | | | | NOT REVIEWED | | ☐ | |
| 8 | Library index | | | | NOT REVIEWED | | ☐ | |
| 9 | Legal (privacy/terms/cookies/GDPR) | | | | NOT REVIEWED | | ☐ | |

**Acceptance for area A:** natural professional German · no misleading claims ·
terminology consistent with the glossary · correct company meaning · no English
UI leakage · no Persian contamination (the locale-switcher endonym «فارسی» is
intentional and expected).

## 2. Authentication — area A

| # | Surface | Reviewer | Experience | Date | Status | Corrections | Approved | Signature |
|---|---|---|---|---|---|---|---|---|
| 10 | Login / register / reset | | | | NOT REVIEWED | | ☐ | |
| 11 | Access-denied + session states | | | | NOT REVIEWED | | ☐ | |

## 3. Authenticated AppShell & enterprise UI — areas A + C

| # | Surface | Area | Reviewer | Date | Status | Corrections | Approved | Signature |
|---|---|---|---|---|---|---|---|---|
| 12 | AppShell (sidebar/palette/topbar) | A | | | NOT REVIEWED | | ☐ | |
| 13 | Dashboard | A | | | NOT REVIEWED | | ☐ | |
| 14 | Industrial Brain | B | | | NOT REVIEWED | | ☐ | |
| 15 | Assets | B | | | NOT REVIEWED | | ☐ | |
| 16 | CMMS | B | | | NOT REVIEWED | | ☐ | |
| 17 | Documents / EDMS | A | | | NOT REVIEWED | | ☐ | |
| 18 | CRM | C | | | NOT REVIEWED | | ☐ | |
| 19 | ERP | C | | | NOT REVIEWED | | ☐ | |
| 20 | Billing | C | | | NOT REVIEWED | | ☐ | |
| 21 | Organization administration | C | | | NOT REVIEWED | | ☐ | |
| 22 | API Platform | C | | | NOT REVIEWED | | ☐ | |
| 23 | Admin console | A | | | NOT REVIEWED | | ☐ | |

**Acceptance for area C:** correct CRM terminology · correct billing terminology
· no invented tax claims · no invented legal guarantees · invoice/payment status
language exact (`bezahlt` / `offen` / `überfällig` / `storniert` must stay
distinct).

## 4. Knowledge Library — area B (SAFETY-CRITICAL)

All 30 articles carry a `safetyNote`. Review them **article by article** against
[`german-knowledge-review.md`](../i18n/german-knowledge-review.md), which holds
the EN/DE pairs. Sign here; record findings there.

| # | Article | Reviewer (qualified engineer) | Date | Safety verdict | Terminology | Approved | Signature |
|---|---|---|---|---|---|---|---|
| 1 | `plcBasics` | | | NOT REVIEWED | | ☐ | |
| 2 | `s71200` | | | NOT REVIEWED | | ☐ | |
| 3 | `s71500` | | | NOT REVIEWED | | ☐ | |
| 4 | `ladder` | | | NOT REVIEWED | | ☐ | |
| 5 | `structuredText` | | | NOT REVIEWED | | ☐ | |
| 6 | `scadaTags` | | | NOT REVIEWED | | ☐ | |
| 7 | `hmiDesign` | | | NOT REVIEWED | | ☐ | |
| 8 | `alarms` | | | NOT REVIEWED | | ☐ | |
| 9 | `historian` | | | NOT REVIEWED | | ☐ | |
| 10 | `motors` | | | NOT REVIEWED | | ☐ | |
| 11 | `contactors` | | | NOT REVIEWED | | ☐ | |
| 12 | `mcc` | | | NOT REVIEWED | | ☐ | |
| 13 | `protection` | | | NOT REVIEWED | | ☐ | |
| 14 | `vfd` | | | NOT REVIEWED | | ☐ | |
| 15 | `sensors` | | | NOT REVIEWED | | ☐ | |
| 16 | `digitalInputs` | | | NOT REVIEWED | | ☐ | |
| 17 | `analogInputs` | | | NOT REVIEWED | | ☐ | |
| 18 | `transmitters` | | | NOT REVIEWED | | ☐ | |
| 19 | `protocols` | | | NOT REVIEWED | | ☐ | |
| 20 | `opcua` | | | NOT REVIEWED | | ☐ | |
| 21 | `modbusTcp` | | | NOT REVIEWED | | ☐ | |
| 22 | `mqtt` | | | NOT REVIEWED | | ☐ | |
| 23 | `s7comm` | | | NOT REVIEWED | | ☐ | |
| 24 | `segmentation` | | | NOT REVIEWED | | ☐ | |
| 25 | `accessControl` | | | NOT REVIEWED | | ☐ | |
| 26 | `monitoring` | | | NOT REVIEWED | | ☐ | |
| 27 | `audit` | | | NOT REVIEWED | | ☐ | |
| 28 | `troubleshooting` | | | NOT REVIEWED | | ☐ | |
| 29 | `predictive` | | | NOT REVIEWED | | ☐ | |
| 30 | `rca` | | | NOT REVIEWED | | ☐ | |

**Acceptance for area B — each article must preserve:** exact engineering
meaning · stated uncertainty (`meist`, `kann`) · every prohibition as a
prohibition · LOTO / Freischaltung meaning · Spannungsfreiheit feststellen ·
stored-energy (DC-Zwischenkreis, Entladezeit) warnings · interlock and bypass
warnings · every number, unit and standard identifier · **no new imperative that
the English source does not make**.

## 5. Open terminology questions

Carried from the knowledge review sheet — each needs a house-style ruling:

| # | Question | Decision | Decided by | Date |
|---|---|---|---|---|
| 1 | `vfd` uses source notation **V/Hz**; German drive docs often prefer **U/f** | | | |
| 2 | `ladder.name` rendered **Kontaktplan (KOP)** — is KOP right for this audience? | | | |
| 3 | The English source has **no** "qualified personnel" clause; none was added (adding one would introduce a requirement the source never made). Accept, or fix in EN+FA+DE together? | | | |
| 4 | `mcc.safetyNote` uses **PSA-Kategorie** for "PPE category" | | | |
| 5 | `crm.header.eyebrow` rendered **Vertriebsoperationen** for "Sales Operations" | | | |

## 6. Open policy decisions (not language)

| # | Decision | Owner | Status |
|---|---|---|---|
| 1 | Org-level `view_api_keys` includes `ENGINEER` — see analysis in [`german-release-gate.md`](./german-release-gate.md) §2 and PHASE 87L.6H report | Product owner | **OPEN** |
| 2 | Orphan namespaces `platform`/`analytics`/`automation` (46 leaves) — cleanup phase | Engineering | Deferred, non-blocking |
| 3 | German library keyword index vs. public search terms | Engineering | Deferred, non-blocking |

## 7. Responsive / accessibility findings log

| # | Surface | Breakpoint | Finding | Severity | Fixed |
|---|---|---|---|---|---|
| | | | _(none recorded — authenticated surfaces not yet visually reviewed)_ | | |

---

## Sign-off

German content may be published only when areas A, B and C are each approved by
a suitably qualified named reviewer **and** the authenticated browser matrix in
[`german-release-gate.md`](./german-release-gate.md) §4 has been executed.

- Area A (public/marketing) — name: ______________________ date: __________ ☐ approved
- Area B (industrial/safety) — name: ______________________ date: __________ ☐ approved
- Area C (commercial) — name: ______________________ date: __________ ☐ approved
- Authenticated browser matrix executed — name: ______________________ date: __________ ☐ complete

**Current overall status: NOT APPROVED — no area has been reviewed.**
