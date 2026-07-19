# German Release Gate — PHASE 87L.6G

**Branch:** `phase-87l6-german-localization`
**Baseline:** `7e0405c` (PHASE 87L.6F)
**Status of this document: PREPARATION ONLY.** Nothing here has been committed,
merged or deployed, and no item below may be marked complete on the strength of
this file alone.

---

## 1. Orphan namespace register (§13 — documented, NOT removed)

Three catalog namespaces are fully translated into German but have **no direct
consumer**. They are preserved deliberately: deleting a namespace is a separate,
riskier change than translating one, and the catalog parity tests treat all
three locales as one shape.

| Namespace | Leaves | Direct consumer | Superseded by | Compatibility references | Removal risk | Proposed cleanup |
|---|---:|---|---|---|---|---|
| `platform` | 12 | **none** — `grep` for `useTranslations("platform")` / `getTranslations("platform")` / `"platform.` returns zero binding sites | `publicSite.platform.*` — `/[locale]/platform/page.tsx` reads `getTranslations("publicSite")` then `t("platform.eyebrow")` etc. | 3-way key-parity tests (`de-catalog.test.ts`), full-catalog reconciliation (`german-final-gate.test.ts`) | **Low.** No runtime reader. Removal must delete the key from **en, fa and de together** or parity tests fail. | Dedicated catalog-pruning phase |
| `analytics` | 15 | **none** — `AssetAnalyticsClient` binds `useTranslations("assetOperations")` and reads `analytics.*` from **that** namespace | `assetOperations.analytics.*` | as above | **Low**, same parity caveat | Dedicated catalog-pruning phase |
| `automation` | 19 | **none** — every `/automation` page and component binds `useTranslations("automationOperations")` | `automationOperations.*` | as above; `automation-operations-extraction.test.ts` asserts the *live* namespace, not this one | **Low–medium.** 8 of the 19 leaves are status labels (`active`, `paused`, `draft`, …). The live UI renders the raw UPPERCASE enum instead, so reviving them would need the `t.has()` fallback pattern already used for `triggerLabels`. | Dedicated catalog-pruning phase |

**Do not delete or rename these in this phase.** They are counted in the
5,136-leaf reconciliation as real German translations, because they are.

---

## 2. Org-level API permission split — RESOLVED (PHASE 87L.6H.1)

The owner resolved the `view_api_keys` question. The single broad permission was
split into three, so an engineer can monitor consumption without being able to
enumerate the organization's key inventory.

```ts
view_api_usage    // aggregate consumption only — never key identity
view_api_keys     // key inventory: names, prefixes, last4, scopes
manage_api_keys   // create / rotate / revoke
```

| Role | Usage | Key metadata | Manage keys |
|---|:--:|:--:|:--:|
| Engineer | ✅ | ❌ | ❌ |
| Admin | ✅ | ✅ | ✅ |
| Owner | ✅ | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ |
| Billing admin | ✅ | ✅ | ❌ |
| Viewer | ❌ | ❌ | ❌ |
| Unmapped Prisma role | ❌ | ❌ | ❌ |

Enforcement: `/api/platform/usage` and `/api/platform/rate-limits` require
`view_api_usage`; `/api/platform/keys` GET requires `view_api_keys`; create,
rotate and revoke require `manage_api_keys`. Secret material is returned only by
the existing one-time create/rotate response and never appears in any list or
detail response.

**UI note (§8):** `/dashboard/api` mixes usage and key management in one
surface, so it is NOT opened to engineers — the application-level `api_admin`
denial from 87L.6G stands. A separate usage-only surface would be required
before an engineer could see consumption in the UI. Engineers currently have
the usage permission at the API layer only.

## 3. Human German review checklist (§14)

Reviewer profile required: **native German-speaking industrial engineer**
(automation / electrical / maintenance) for the engineering content; a native
German commercial reviewer for billing/CRM wording.

Supporting artefacts already produced:
- `docs/i18n/german-knowledge-review.md` — 30-article safety-critical review sheet
- `docs/i18n/german-glossary.md` — terminology decisions

### 3.1 Public surfaces

| # | Surface | Reviewer | Review date | Status | Terminology issues | Safety issues | Responsive issues | Approval signature |
|---|---|---|---|---|---|---|---|---|
| 1 | Homepage `/de` | | | NOT REVIEWED | | | | |
| 2 | About `/de/about` | | | NOT REVIEWED | | | | |
| 3 | Contact `/de/contact` | | | NOT REVIEWED | | | | |
| 4 | Platform `/de/platform` | | | NOT REVIEWED | | | | |
| 5 | Modules `/de/modules` | | | NOT REVIEWED | | | | |
| 6 | Services `/de/services` | | | NOT REVIEWED | | | | |
| 7 | Architecture `/de/architecture` | | | NOT REVIEWED | | | | |
| 8 | Library index `/de/library` | | | NOT REVIEWED | | | | |
| 9 | Authentication `/de/auth/login` | | | NOT REVIEWED | | | | |

### 3.2 The 30 engineering articles (`/de/library/<id>`)

Every one carries a safety-critical `safetyNote`. Review order = the priority
queue in `docs/i18n/german-knowledge-review.md`.

| # | Article id | German title | Reviewer | Date | Status | Terminology | Safety | Responsive | Signature |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `plcBasics` | PLC-Grundlagen | | | NOT REVIEWED | | | | |
| 2 | `s71200` | Siemens S7-1200 | | | NOT REVIEWED | | | | |
| 3 | `s71500` | Siemens S7-1500 | | | NOT REVIEWED | | | | |
| 4 | `ladder` | Kontaktplan (KOP) | | | NOT REVIEWED | | | | |
| 5 | `structuredText` | Strukturierter Text | | | NOT REVIEWED | | | | |
| 6 | `scadaTags` | SCADA-Tag-Architektur | | | NOT REVIEWED | | | | |
| 7 | `hmiDesign` | HMI-Gestaltung | | | NOT REVIEWED | | | | |
| 8 | `alarms` | Alarmverwaltung | | | NOT REVIEWED | | | | |
| 9 | `historian` | Historian / Archivierung | | | NOT REVIEWED | | | | |
| 10 | `motors` | Elektromotoren | | | NOT REVIEWED | | | | |
| 11 | `contactors` | Schütze | | | NOT REVIEWED | | | | |
| 12 | `mcc` | Motorsteuerzentrum (MCC) | | | NOT REVIEWED | | | | |
| 13 | `protection` | Schutzeinrichtungen | | | NOT REVIEWED | | | | |
| 14 | `vfd` | Frequenzumrichter (VFD) | | | NOT REVIEWED | | | | |
| 15 | `sensors` | Industriesensoren | | | NOT REVIEWED | | | | |
| 16 | `digitalInputs` | Digitale Eingänge | | | NOT REVIEWED | | | | |
| 17 | `analogInputs` | Analoge Eingänge | | | NOT REVIEWED | | | | |
| 18 | `transmitters` | Messumformer | | | NOT REVIEWED | | | | |
| 19 | `protocols` | Industrielle Protokolle | | | NOT REVIEWED | | | | |
| 20 | `opcua` | OPC UA | | | NOT REVIEWED | | | | |
| 21 | `modbusTcp` | Modbus TCP | | | NOT REVIEWED | | | | |
| 22 | `mqtt` | MQTT | | | NOT REVIEWED | | | | |
| 23 | `s7comm` | S7-Kommunikation | | | NOT REVIEWED | | | | |
| 24 | `segmentation` | Netzsegmentierung | | | NOT REVIEWED | | | | |
| 25 | `accessControl` | Zugriffskontrolle | | | NOT REVIEWED | | | | |
| 26 | `monitoring` | Netzüberwachung | | | NOT REVIEWED | | | | |
| 27 | `audit` | Auditprotokollierung | | | NOT REVIEWED | | | | |
| 28 | `troubleshooting` | Fehlersuche | | | NOT REVIEWED | | | | |
| 29 | `predictive` | Prädiktive Instandhaltung | | | NOT REVIEWED | | | | |
| 30 | `rca` | Grundursachenanalyse | | | NOT REVIEWED | | | | |

### 3.3 Authenticated surfaces

| # | Surface | Reviewer | Date | Status | Terminology | Safety | Responsive | Signature |
|---|---|---|---|---|---|---|---|---|
| 1 | AppShell (sidebar, palette, topbar) | | | NOT REVIEWED | | | | |
| 2 | Dashboard | | | NOT REVIEWED | | | | |
| 3 | Industrial Brain | | | NOT REVIEWED | | | | |
| 4 | Assets | | | NOT REVIEWED | | | | |
| 5 | CMMS | | | NOT REVIEWED | | | | |
| 6 | Documents / EDMS | | | NOT REVIEWED | | | | |
| 7 | CRM | | | NOT REVIEWED | | | | |
| 8 | ERP | | | NOT REVIEWED | | | | |
| 9 | Billing | | | NOT REVIEWED | | | | |
| 10 | Organization administration | | | NOT REVIEWED | | | | |
| 11 | API Platform | | | NOT REVIEWED | | | | |
| 12 | Admin console | | | NOT REVIEWED | | | | |

**Native review status: NOT PERFORMED.** No item above may be signed off on the
basis of automated tests.

---

## 4. Authenticated browser validation matrix (§15)

**Not executed.** No authenticated session of any role was available in the
build environment, and no test accounts were created or fabricated. This matrix
is the plan a human runs; every "Actual" cell is empty by design.

Expected values below are derived from the shared policy
(`src/lib/auth/roles.ts` + `src/lib/auth/rbac.ts`) and are what the run should
confirm — not evidence that it did.

Legend: **A** = renders, **D** = denied (`RequireCapability` denial state),
**R** = redirected to `/{locale}/auth/login?from=…`

### 4.1 Expected access per role

| Route | Engineer | Admin | Superadmin | Anonymous |
|---|---|---|---|---|
| `/{loc}/dashboard` | A | A | A | R |
| `/{loc}/assets` | A | A | A | R |
| `/{loc}/cmms` | A | A | A | R |
| `/{loc}/documents` | A | A | A | R |
| `/{loc}/automation` | A | A | A | R |
| `/{loc}/industrial-brain` | A | A | A | R |
| `/{loc}/dashboard/copilot` | A | A | A | R |
| `/{loc}/dashboard/predictive` | A | A | A | R |
| `/{loc}/crm` | **D/R** | A | A | R |
| `/{loc}/erp` | **D/R** | A | A | R |
| `/{loc}/dashboard/billing` | **D/R** | A | A | R |
| `/{loc}/dashboard/organization` | **D/R** | A | A | R |
| `/{loc}/dashboard/api` | **D/R** | A | A | R |
| `/{loc}/admin` | **D/R** | A | A | R |

### 4.2 Run grid — 3 roles × 3 locales × 14 routes

For **each** role ∈ {Engineer, Admin, Superadmin} and **each** locale ∈ {fa, en, de},
walk all 14 routes above and record:

| Field | What to record |
|---|---|
| Expected access | from the table in 4.1 |
| Actual status | HTTP status / rendered outcome |
| Redirect or denial behaviour | exact destination URL, and whether `from=` preserves the locale |
| Navigation visibility | is the link present in the sidebar for this role? |
| Console errors | count + first message |
| Hydration errors | any React hydration warning |
| Horizontal overflow | `documentElement.scrollWidth > innerWidth` at 320 / 375 / 768 / desktop |
| Unauthorized API requests | any 401/403 fired by the page itself |
| Notification polling | any `/api/notifications*` request while signed out |

### 4.3 Specific assertions the human run must confirm

1. Engineer signed in on `/de`: sidebar shows **no** Billing, Organization,
   API Platform, CRM, ERP or Admin entry.
2. Engineer typing `/de/dashboard/billing` directly is denied — not merely
   hidden in the nav.
3. The denial is **localized German**, not English fallback.
4. Switching locale while on a denied route does not grant access.
5. A `from=` value pointing at a denied route does not authorize it after login.
6. Admin and Superadmin reach all 14 routes in all three locales.
7. Anonymous on any protected route lands on the **same-locale** login page.
8. No notification polling occurs on public German pages.

---

## 5. Release blockers still open

| # | Item | Owner | Blocking merge? |
|---|---|---|---|
| 1 | Native German review of all surfaces in §3 | German reviewer | **Yes, for publishing German** |
| 2 | Authenticated browser matrix in §4 executed | QA / owner | **Yes** |
| 3 | ~~Org-level `view_api_keys` includes `ENGINEER`~~ — **RESOLVED in 87L.6H.1** (§2 above) | Product owner | ✅ Closed |
| 4 | Orphan namespace cleanup (§1) | Engineering | No — documented, deferred |

Nothing in this phase has been committed, pushed, merged or deployed.
