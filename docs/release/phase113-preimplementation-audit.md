# Phase 113 — Pre-implementation Audit

**Phase:** 113 — Public Identity, SEO, Navigation and Cookie Governance
**Branch:** `feature/phase113-public-identity-seo-cookie-governance`
**Worktree:** `E:\hermes-phase113`
**Audit date:** 2026-09-27
**Status at time of writing:** READ-ONLY AUDIT COMPLETE — no product file modified yet.

---

## 1. Baseline and isolation

| Fact | Value | How established |
|---|---|---|
| `origin/main` after `git fetch --prune` | `837deb5cb3e31120530ece8c34fe3fa86908f5f7` | `git rev-parse origin/main` |
| Phase 113 branch base | `837deb5c` (identical to `origin/main`) | `git rev-parse HEAD` in the new worktree |
| Worktree cleanliness at creation | clean (`git status --short` empty) | direct observation |
| Invoking worktree (`E:\hermes-os-nexuz`) | `feature/ats-candidate-privacy-notice` @ `25409e58`, clean — **NOT modified by this phase** | `git status` |
| Pre-existing worktrees | 74 registered; **none touched** | `git worktree list --porcelain` |

### The abandoned prototype branch

`feature/company-navigation-cookie-hotfix` **does not exist** — not locally, not on
`origin`. `git branch -a --list '*company-navigation*'` returns no output.

There is therefore nothing to inherit, and nothing was inherited. This phase starts
from `origin/main` only.

---

## 2. GitHub versus Production delta

Production deployment state was established from **read-only CI evidence**, not from a
live host connection (no production access is authorized for this phase):

    gh run list --workflow=deploy.yml
    gh run view 36158106337 --json headSha,createdAt,conclusion
    -> conclusion: success
       createdAt:  2026-09-25T16:01:51Z
       headSha:    837deb5cb3e31120530ece8c34fe3fa86908f5f7

**Conclusion: `origin/main` == last successfully deployed commit == this phase's baseline.**
There is no "merged but not deployed" backlog. `deploy.yml` is `workflow_dispatch`-only,
so deployment is always an explicit owner action.

### Classification of everything that exists but is not on main

| Item | Classification | Public-navigation eligibility |
|---|---|---|
| `origin/main` @ `837deb5c` | merged **and** deployed | n/a — the baseline |
| PR #109 `feature/ats-open-application-acceptance` | remote branch only, open, base `main` | ATS candidate intake — **candidate-scoped, not general public nav** |
| PR #110 `feature/ats-candidate-privacy-notice` | remote branch only, open, stacked on #109 | legal draft — **not a nav item** |
| PR #57 `security/academy-tenant-isolation` | remote branch only, open | security fix, no public surface |
| PRs #55, #56, #50, #43, #42, #40, #38, #36, #34, #6 | remote branch only, **draft** | none are public-navigation candidates |
| 74 local worktrees (Phase 87 through 112, design lanes) | local worktree only / incomplete | **excluded by isolation rules** |

**No feature was added to the public header because its code exists.** The header
decision in section 3 is driven by route reachability and RBAC, not by code presence.

---

## 3. Public header and navigation audit

The public shell renders from **one** registry, `src/components/public-site/nav.ts`
(`PUBLIC_NAV_GROUPS` feeds `PublicNavMenus` / `PublicHeader` / `PublicMobileNav`;
`PUBLIC_FOOTER_COLUMNS` feeds `PublicFooter`).

All 25 distinct hrefs were checked against the filesystem and against the
authorization layer:

* **25/25** resolve to a real `src/app/[locale]/<path>/page.tsx`.
* **0/25** are matched by `isProtectedPath()` from `src/lib/auth/rbac.ts`.

Every capability the brief asked to be reviewed is **already present**:

| Requested capability | Header location | Route |
|---|---|---|
| Platform | `platform` group | `/platform` |
| Public service/capability pages | `platform` + `capabilities` groups | `/services`, `/architecture`, 8 x `/services/*` |
| Industrial Brain | `intelligence` | `/industrial-brain` |
| Hermes Brain | `intelligence` | `/brain` |
| Copilot | `intelligence` | `/copilot` |
| Library | `knowledge` | `/library` |
| Academy | `knowledge` | `/academy` |
| Articles | `knowledge` | `/articles` |
| Demo | `resources` | `/demo` |
| Vendors | `resources` | `/vendors` |
| About | `company` | `/about` |
| Careers | `company` | `/careers` |
| Contact | `company` | `/contact` |
| OT Edge public capability page | `capabilities` | `/services/ot-edge` |

The four routes the brief warned against are all registered in
`PROTECTED_ROUTE_PREFIXES` and none appears in the public shell:
`live-operations`, `dashboard`, `engineering`, `compliance`.

**Finding: `NO_HEADER_CHANGE_REQUIRED`.** No menu item is added or removed. The
existing contract test `src/components/public-site/__tests__/public-nav.test.ts`
already pins the group composition and asserts non-protection; this phase adds an
independent boundary test rather than duplicating it.

---

## 4. Company and product identity — exact occurrence inventory

Searched with ripgrep over the tracked tree for `Hermes Novin` (case-insensitive) and
for the Persian form.

### 4a. MUST CHANGE — current public-facing identity

| File | Line | Current value |
|---|---|---|
| `src/lib/seo/config.ts` | 25 | `ORG_NAME = "Hermes Novin Mehr IRIC"` |
| `src/lib/seo/config.ts` | 26 | `ORG_SHORT_NAME = "Hermes Novin"` |
| `src/lib/seo/config.ts` | 20 | doc comment naming the three retired variants |
| `src/app/[locale]/layout.tsx` | 74 | `authors: [{ name: "Hermes Novin", ... }]` |
| `src/app/[locale]/layout.tsx` | 75 | `creator: "Hermes Novin"` |
| `src/app/[locale]/layout.tsx` | 76 | `publisher: SITE_NAME` — **product used as publisher** |
| `src/app/llms.txt/route.ts` | 53 | `About Hermes Novin Mehr` |
| `src/components/trust/TrustBadgesSection.tsx` | 80 | `aria-label="eNAMAD Electronic Trust Seal — Hermes Novin"` |
| `content/journal/author.json` | 38 | `"company": "Hermes Novin Mehr IRIC"` |
| `messages/en.json` | 1343, 4110, 4114, 7087, 7169 | footer / about / careers / publicSite copy |
| `messages/fa.json` | 1343, 4110, 4114, 7087, 7169 | same keys, Persian |
| `messages/de.json` | 1343, 4110, 4114, 7087, 7169 | same keys, German |
| `src/lib/seo/__tests__/entity-graph.test.ts` | 66 | pins the retired legal name |
| `src/i18n/__tests__/german-final-gate.test.ts` | 272 | proper-noun allowlist entry |
| `scripts/audit-ai-discoverability.ts` | 287, 345 | invariant regexes pinning the retired name |
| `CLAUDE.md` | 5 | project identity line |

Catalog key paths (identical in all three locales):

    footer.copyright
    about.eyebrow
    about.companyTitle
    publicSite.ecosystem.cards.careers.desc
    publicSite.footer.copyright

### 4b. MUST NOT CHANGE — not current public identity

| File | Why preserved |
|---|---|
| `src/lib/media/__tests__/seo.test.ts:475` | **Negative assertion** — proves a tenant video's publisher is the TENANT, not the platform operator. The needle must track the operator constant, but the assertion's *intent* stays "not the platform operator". |
| `src/components/app-shell/__tests__/runtime-shell-nav.test.tsx:224,229` | **Tenant fixture name** passed to `OrganizationSelector` — a customer organization label in a test, not the platform operator. |
| `src/components/seo/__tests__/jsonld-nonce-hydration.test.tsx:48` | **Arbitrary schema payload** for a nonce/hydration test; the value is opaque to the test's subject. |
| `src/lib/media/seo.ts:361` | Code **comment** explaining tenant-versus-operator publishing. Updated for accuracy only; no behavioural meaning. |
| `docs/seo/phase105-final-report.md`, `docs/i18n/german-glossary.md`, `docs/release/german-authenticated-browser-matrix.md` | **Historical phase records.** Rewriting a delivered report falsifies the record. |
| `docs/AI_DISCOVERABILITY.md` | The one documentation exception: it is the *living* architecture description the audit script cites, so it receives a dated amendment rather than a rewrite. |
| `src/components/public-site/__tests__/phase104i-estate-contract.test.tsx:283` | Comment only. |

---

## 5. Footer and trust area

* **One** footer component serves both desktop and mobile: `PublicFooter.tsx`
  (`hf-registry` is a responsive grid; there is no second mobile footer).
  `SiteFooter.tsx` is legacy and is imported **only** by `PageShell.tsx`, a contract
  pinned by `public-shell-rollout.test.ts`.
* The visible company line is `publicSite.footer.copyright`; the legacy shell reads
  `footer.copyright`. **Both** carry the retired name and both are changed.
* Persian already uses Persian-Indic digits in the existing string, so
  locale-appropriate year formatting is preserved by editing the per-locale strings —
  no formatter change is needed.
* **eNAMAD (id=761266):** the repository contains no evidence of the registrant's
  legal identity. The current `aria-label` names the retired company. Per the brief,
  the accessible name becomes product-neutral (`Hermes OS`) rather than asserting
  ZHARFA registration. The verification URL, `referrerPolicy`, the deliberately
  absent `rel` and the non-standard `code` attribute are all preserved byte-for-byte.
* **ProvenExpert:** the widget is gated on **marketing** consent
  (`src/components/trust/proseal-controller.ts`), reading the same
  `hermes_cookie_consent` record — not a second consent store.
* CSP allowances for `trustseal.enamad.ir`, `cdn-b.saashub.com` and the ProvenExpert
  hosts are **unchanged**; no directive is relaxed.

---

## 6. JSON-LD entity graph — current state

`siteEntityGraph()` already emits one `@graph` with four stable `@id` values and
`@id`-only cross references. Three defects against the brief's model:

1. `Organization.alternateName = [ORG_SHORT_NAME, SITE_NAME]` — **puts the product
   name inside the organization's alternate names**, which is exactly the entity
   merge the brief forbids.
2. `ORG_SAME_AS` contains `https://www.provenexpert.com/hermes-os/` — a **product**
   profile attributed to the **company** — and `https://github.com/hermescenter1`,
   which is repository hosting, not an organization alias.
3. `layout.tsx` sets the HTML `publisher` to the product name.

Already correct and to be preserved: no `offers` / `aggregateRating` / `review`, no
`logo` (the favicon was deliberately deleted), no guessed social handles, and
`creator` / `publisher` / `provider` / `worksFor` / `WebSite.publisher` all pointing
at `ORG_ID`.

---

## 7. Cookie implementation — measured inventory

Every row below was read out of the source, not assumed.

### First-party cookies

| Name | Set by | Category | Attributes / lifetime |
|---|---|---|---|
| `hermes_session` | `lib/auth/config.ts:26` (HMAC session) | Necessary | session authentication |
| `hermes_at` | `lib/auth/config.ts:29` | Necessary | `ACCESS_TOKEN_TTL` = 8 hours |
| `hermes_rt` | `lib/auth/config.ts:32` | Necessary | 7 days, or 30 days with remember-me |
| `hermes_consent_id` | `lib/compliance/consent-cookie.ts:28` | Necessary | `httpOnly`, `sameSite=lax`, `secure` in production, 365 days |
| `hermes_org` | `lib/tenant-selection/contract.ts:45` | Necessary (tenant selection) | authenticated workspace only |
| `NEXT_LOCALE` | `i18n/routing.ts:20` (next-intl) | Preferences | `maxAge` 31536000 s = 365 days |

### Browser storage

| Key | Where | Purpose |
|---|---|---|
| `hermes_cookie_consent` (localStorage) | `CookieConsentBanner.tsx:14`, `AnalyticsProvider.tsx:21`, `proseal-controller.ts:23` | consent mirror so consent survives database unavailability |

### Third-party, consent-gated

| Service | Gate | Evidence |
|---|---|---|
| Google Tag Manager / GA4 | `analytics OR marketing` | `AnalyticsProvider.tsx:100` |
| Microsoft Clarity | `analytics` | `AnalyticsProvider.tsx:101` |
| ProvenExpert widget | `marketing` | `proseal-controller.ts` |
| eNAMAD seal | none needed — `img-src` only, sets no cookie | `TrustBadgesSection.tsx` |
| SaaSHub badge | none needed — `img-src` only, sets no cookie | `middleware.ts:58` |

GA/GTM load **only** when `GA_MEASUREMENT_ID` / `GTM_ID` are configured
(`middleware.ts:28-30`); Clarity is a fixed integration.

### There is no CSRF cookie

No cookie-based CSRF token exists anywhere in the tree (a case-insensitive search of
`src/lib/security` and `src/lib/auth` finds no `csrf` match). The current policy page
claims one.

---

## 8. Cookie policy page — defects found

`src/app/[locale]/cookies/page.tsx` is 52 lines of **hard-coded English** inside a
locale-parameterised route.

| # | Defect | Evidence |
|---|---|---|
| CP-1 | Entire body is hard-coded English; `/fa/cookies` and `/de/cookies` serve English prose to Persian and German readers while the surrounding shell is localized. | no `t()` call in the component |
| CP-2 | **Fabricated cookie names.** `marketing_consent` and `ui_prefs` exist nowhere in the repository. | a repo-wide search for both names matches **only this page** |
| CP-3 | **Wrong cookie name.** Claims `access_token`; the real cookie is `hermes_at`. | `lib/auth/config.ts:29` |
| CP-4 | **False claim about CSRF cookies** in the Necessary category. | no CSRF cookie exists |
| CP-5 | **False instruction:** "update your cookie preferences at any time using the banner that appears at the bottom of the screen". The banner renders only when no consent is stored; after any choice it never reappears and there is no reopen control. | `CookieConsentBanner.tsx:54,57,87` |
| CP-6 | No mention of Microsoft Clarity, Google Analytics/GTM or ProvenExpert — the actual third parties that set storage. | section 7 above |
| CP-7 | No mention of `localStorage` (`hermes_cookie_consent`), although the implementation relies on browser storage. | `CookieConsentBanner.tsx:14` |
| CP-8 | Missing entirely: responsible company, legal/consent basis, withdrawal mechanism, browser controls, contact channel, link to the Privacy Policy. | brief section 8 items 2, 7, 10, 11, 12, 14 |
| CP-9 | `version="1.0" effective="June 2026"` are hard-coded English literals in a localized route; `hermes_consent_id` is not listed at all. | line 19 |
| CP-10 | Retention paragraph states "up to 12 months" and "2 years" with no code backing for the two-year figure. | no retention constant found for consent records |

### Consent UX defects

| # | Defect | Evidence |
|---|---|---|
| UX-1 | **No way to reopen the consent UI.** `visible` is only ever set true when no consent exists. | `CookieConsentBanner.tsx:58,64` |
| UX-2 | The Customize panel always starts from `DEFAULT_PREFS` (all optional off) instead of the stored choice, so a returning user editing preferences would silently reset them. | `useState<Prefs>(DEFAULT_PREFS)` line 31, never re-seeded |
| UX-3 | `GET /api/compliance/cookie-consent` sets **no `Cache-Control`**. The response varies per `hermes_consent_id` cookie; a shared or intermediary cache could serve one visitor's consent state to another. `AnalyticsProvider` passes `cache:"no-store"` on its own fetch; the banner does not. | the route sets no such header; `AnalyticsProvider.tsx:122` |

### Verified-correct behaviour to preserve

* `necessary` is forced `true` server-side (`route.ts:121`) — a client cannot disable it.
* Optional categories default to `false` on an unparseable body — consent fails closed.
* Subject identity comes **only** from a server-minted, pattern-validated cookie;
  `sessionId` from the body is ignored (P99-INT-001 / P99-INT-002).
* The response projects preferences only — never `userId`, `ipAddress`, `userAgent`.
* POST is rate-limited and body-bounded (`SMALL_JSON_BODY_BYTES`).
* Reject-All and Accept-All both persist and both dispatch `hermes:consent-updated`.

---

## 9. SEO / AEO / GEO audit — state before changes

| Area | State | Action |
|---|---|---|
| Canonical host | `BASE_URL` defaults to the **apex** `https://hermesnovin.com` | unchanged |
| hreflang and `x-default` | generated from `ACTIVE_LOCALES`; `x-default` points at the default locale | unchanged |
| robots | derived from `PROTECTED_ROUTE_PREFIXES`; `User-agent: *` group present; public children re-allowed | unchanged |
| sitemap | `/privacy`, `/terms`, `/cookies` present; `/privacy-center` deliberately absent | unchanged |
| OpenGraph / Twitter | OG complete; Twitter deliberately omitted (no verified account) | unchanged |
| `llms.txt` | correct product/capability disambiguation; **one** stale company reference (line 53) | fix line 53 |
| Entity graph | see section 6 | 3 fixes |
| HTML metadata identity | `authors` / `creator` carry the retired name; `publisher` is the product | fix |
| Structured-data escaping | the `JsonLd` nonce path is already tested | unchanged |

---

## 10. Pre-existing baseline defects independently verified

### Brief section 12 — `phase109b0-disclosure-completeness.test.tsx`: **NOT REPRODUCED**

    npx vitest run src/components/dashboard/__tests__/phase109b0-disclosure-completeness.test.tsx
    -> Test Files 1 passed (1) | Tests 9 passed (9)

The test is **already deterministic**. `SENTINEL_TS = Date.UTC(2026,0,2,4,5,6)` and the
single `NextIntlClientProvider` pins `timeZone="UTC"` (line 400), so the `04:05:06`
needle does not depend on the host zone. This host runs `Europe/London` at UTC+1 —
precisely a zone that *would* expose host-timezone dependence, because 04:05:06 UTC
would format as 05:05:06 local — and the test still passes.

**Classification: the reported defect does not exist on this baseline.** No change is
made; no arbitrary time string is substituted, and no timezone invariant is added to a
test that already has one.

### Brief section 13 — `prisma.config.ts` `shadowDatabaseUrl`: **CONFIRMED, but milder than reported**

Verified against the installed `@prisma/config` and `prisma@7.8.0`:

* `shadowDatabaseUrl` is a field of `DatasourceShape`
  (`node_modules/@prisma/config/dist/index.js:346-349`), **not** of
  `MigrationsConfigShape` (`:358-362`, which has only `path`, `initShadowDb`, `seed`).
* The repository places it under `migrations` (`prisma.config.ts:17-19`), where
  nothing reads it. **Setting `SHADOW_DATABASE_URL` therefore has no effect.**
* The stronger claim that every Prisma CLI call would *fail to load the config* does
  **not** hold at 7.8.0 through `defineConfig()`. `parsePrismaConfigShape`'s
  `onExcessProperty: "error"` is only reached for a plain-object config;
  `defineConfig()` builds and brands the object, and
  `parsePrismaConfigInternalShape` short-circuits on that brand
  (`dist/index.js:264-281` and `:462-470`). Empirically, with `SHADOW_DATABASE_URL`
  exported, `npx prisma validate` prints
  `Loaded Prisma config from prisma.config.ts.` and reports the schema valid.
* **Does it block this phase?** No. This phase needs no migration and no
  `migrate diff --from-migrations`, and `SHADOW_DATABASE_URL` is unset in validation.

**Decision: DEFERRED to a dedicated follow-up.** Per the brief, a migration-tooling
change is not combined with public identity work. No file under `prisma/` is touched
by Phase 113.

### `ENOTEMPTY: rmdir '.next/export'`

Not yet observed in this worktree. It is re-checked at the build gate and reported
honestly; no product code is patched for it unless it reproduces here with a proven
root cause.

---

## 11. Database

**No migration is required and none is created.** The cookie policy is presentational
copy; consent already has `CookieConsent` and `ConsentRecord` models plus
`CURRENT_CONSENT_VERSION = "1.0"` in `lib/compliance/types.ts`. Nothing in this phase
adds, alters or drops a column.

---

## 12. Planned change surface (scope lock)

1. `src/lib/seo/config.ts` — `ORG_NAME`, `ORG_SHORT_NAME`, `ORG_SAME_AS`, a new
   `PRODUCT_SAME_AS`, and rewritten doc comments.
2. `src/lib/seo/schemas.ts` — drop `SITE_NAME` from `Organization.alternateName`;
   attach the ProvenExpert product profile to the `SoftwareApplication`.
3. `src/app/[locale]/layout.tsx` — `authors` / `creator` / `publisher` become the company.
4. `src/app/llms.txt/route.ts` — one stale About line.
5. `src/components/trust/TrustBadgesSection.tsx` — product-neutral eNAMAD label.
6. `content/journal/author.json` — the author `company` field.
7. `messages/{en,fa,de}.json` — 5 identity values per locale plus a new
   `cookiePolicy` namespace.
8. `src/app/[locale]/cookies/page.tsx` — a fully localized, evidence-backed rebuild.
9. `src/components/compliance/CookieConsentBanner.tsx` plus a new
   `src/components/compliance/cookie-preferences.ts` — one reopen interface.
10. `src/app/api/compliance/cookie-consent/route.ts` — `Cache-Control: no-store` on GET.
11. Tests: new `phase113-*` suites; targeted updates to `entity-graph.test.ts`,
    `german-final-gate.test.ts`, `de-catalog.test.ts`, `media/__tests__/seo.test.ts`
    and `scripts/audit-ai-discoverability.ts`.
12. `CLAUDE.md` identity line; a `docs/AI_DISCOVERABILITY.md` amendment; the five
    Phase 113 release documents.

**Out of scope, reported not fixed:** `/privacy` and `/terms` are hard-coded English
by the same pattern `/cookies` had. Localizing them is a separate legal-review task;
this phase does not widen into them.

---

# Addendum — scope extension (113-A and 113-B)

Added after the owner extended the phase. The sections above record the original
audit and remain accurate; this addendum records what the extension found.

## A · Cookie Policy design — REJECTED on presentation

The content and governance work above was accepted. The **design** was not.

Audited state before the redesign: `rounded-lg` (8px) on every category and
third-party card, `rounded-xl`/`rounded-2xl` (12/16px) on the consent dialog
container, large capsule controls, and fourteen sections of legal text delivered
as a dozen separate filled panels — the SaaS-dashboard idiom, not a legal
instrument.

A **verified** design reference was available and was used: the owner's own
private `hermescenter1/zharfa-corporate` repository was read read-only via the
GitHub API (`src/styles/tokens.css`, `src/styles/semantic.css`), giving a real
palette, a real corner law ("Architectural, not SaaS. Nothing in the system
exceeds 8px") and a real contrast law with measured ratios. Nothing was invented
and nothing is claimed as "exactly ZHARFA" — see
[`phase113-cookie-visual-system.md`](./phase113-cookie-visual-system.md) for the
values taken, the values deliberately NOT taken, and why.

## B · AI video / AI audio — phase numbers were wrong in the report

Proved from source rather than assumed:

* **AI Video = Phase 102** (Media & Video Hub), not 104.
* **AI Audio = Phase 103** (Live Voice Intelligence) — correct in the report.
* **Phase 104 is neither.** It is the visual / design-system phase.
* A Phase 108 "Film Studio" exists in project history but is **absent from this
  worktree** at `837deb5c`; it lives on an unmerged branch.

Root causes of "does not open / not in the header":

* the video hub **root is a deliberate empty shell** (a media asset needs an
  organization; the root has none), is `noindex`, and has **zero entry points**
  anywhere in the UI;
* the voice capability has **no page of its own** — it is a panel inside the
  **protected** `/dashboard/copilot`, behind the `dashboard` capability and behind
  `HERMES_EXTERNAL_AI_ENABLED`, which ships **off**.

Both were therefore left out of the public header, with reasons recorded in
[`phase113-ai-media-route-audit.md`](./phase113-ai-media-route-audit.md).

## C · Defect found in this phase's OWN work

**The retired company identity was still published.** `contact.generalEmail`
served `hermesnovinmehriric@gmail.com` on the **public** `/[locale]/contact` page
in all three locales.

The original inventory (section 4 above) searched for `Hermes Novin` **with a
space**, so the concatenated form never matched — and the new regression test used
the same spaced needles, so the gate reported "published nowhere" while the name
was on the page.

This is the most serious finding of the extension, because it is a gate that
passed over the exact defect it was written to catch. Remediation, including the
now separator-insensitive gate and its narrow production-host carve-out, is in
[`phase113-ai-media-route-audit.md`](./phase113-ai-media-route-audit.md) §5.

## D · Corrections to the original audit's own numbers

| Claim in the first validation report | Actual |
|---|---|
| "30 paths in the working tree: 21 modified, 9 added" | **32 paths: 22 modified, 10 added.** The count was written mid-flight and the documentation table omitted `content/journal/author.json` from its modified-documentation subtotal |

The corrected inventory is in the validation report.
