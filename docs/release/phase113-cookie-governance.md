# Phase 113 — Cookie Governance

**Baseline:** `837deb5c`
**Policy version:** `2.0` (`COOKIE_POLICY_VERSION` in `src/lib/compliance/cookie-inventory.ts`)
**Effective:** 27 September 2026
**Page:** `src/app/[locale]/cookies/page.tsx` — Persian, English and German

---

## 1 · What was wrong

The previous policy was 52 lines of hard-coded English inside a
locale-parameterised route. Beyond the localization failure, it stated things
about the software that were not true.

| # | Defect | Evidence |
|---|---|---|
| CP-1 | Hard-coded English; `/fa/cookies` and `/de/cookies` served English prose inside a Persian or German shell | no `t()` call in the component |
| CP-2 | Named `marketing_consent` and `ui_prefs` — **neither exists anywhere in the repository** | a repo-wide search matched only that page |
| CP-3 | Named `access_token`; the real cookie is `hermes_at` | `lib/auth/config.ts:29` |
| CP-4 | Claimed CSRF-protection cookies in the Necessary category | no cookie-based CSRF token exists in the tree |
| CP-5 | Told readers to change preferences "using the banner that appears at the bottom of the screen" — **impossible**: the banner rendered only when no consent was stored | `CookieConsentBanner.tsx:54,57,87` |
| CP-6 | Never mentioned Microsoft Clarity, Google Analytics/GTM or ProvenExpert | the three services actually gated on consent |
| CP-7 | Never mentioned the `localStorage` mirror the consent layer depends on | `CookieConsentBanner.tsx:14` |
| CP-8 | Missing: responsible company, legal basis, withdrawal mechanism, browser controls, contact channel, Privacy Policy link | brief section 8 items 2, 7, 10, 11, 12, 14 |
| CP-9 | `version` and `effective` were hard-coded English literals; `hermes_consent_id` was absent | line 19 |
| CP-10 | Claimed a two-year consent-record retention with no code backing | no such constant exists |

Plus three consent-UX defects:

| # | Defect |
|---|---|
| UX-1 | **No way to reopen the consent UI.** Once answered, the banner never returned |
| UX-2 | The Customize panel always started from all-optional-off rather than the stored choice, so editing one category would silently reset the others |
| UX-3 | `GET /api/compliance/cookie-consent` set **no `Cache-Control`**, although the response is selected entirely by the `hermes_consent_id` cookie |

---

## 2 · How the policy is now prevented from drifting

No cookie name, retention period or consent gate is written as prose. The page
renders from `src/lib/compliance/cookie-inventory.ts`, which **imports the
constants the platform actually sets**:

```
SESSION_COOKIE, ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE,
ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, REFRESH_TOKEN_TTL_LONG   ← lib/auth/config
CONSENT_ID_COOKIE, CONSENT_ID_MAX_AGE_SECONDS                 ← lib/compliance/consent-cookie
TENANT_SELECTION_COOKIE                                       ← lib/tenant-selection/contract
```

Only sentences live in `messages/*.json` under the new `cookiePolicy` namespace.
A cookie name is a technical identifier, not translatable copy — keeping names
out of the catalog also keeps `hermes_at` from being reported as untranslated
German by the i18n carryover gates.

`phase113-cookie-governance.test.tsx` enforces the tie **in both directions**:

* every documented name is the value of a real declared constant;
* every `export const …COOKIE… = "…"` found in the three cookie-owning modules
  appears in the inventory — so a future phase cannot add a cookie and leave the
  legal document silently incomplete;
* the three fabricated/wrong names cannot reappear in the page or any catalog;
* `csrf` appears in no catalog, because the platform sets no CSRF cookie;
* the auth lifetimes equal the exported TTLs rather than hand-copied numbers;
* the declared third-party gates equal the gates in `AnalyticsProvider` and
  `proseal-controller`.

---

## 3 · Storage inventory (measured, not estimated)

### First-party cookies

| Identifier | Category | Retention | Scope | Attributes | Source |
|---|---|---|---|---|---|
| `hermes_session` | necessary | 8 h, extended to 30 d with "stay signed in" | signed-in only | `httpOnly`, `sameSite=lax`, `secure` in production | `api/auth/route.ts:271` |
| `hermes_at` | necessary | `ACCESS_TOKEN_TTL` = 8 h | signed-in only | `httpOnly`, `sameSite=strict` | `lib/auth/config.ts:29` |
| `hermes_rt` | necessary | `REFRESH_TOKEN_TTL` = 7 d, extended to `REFRESH_TOKEN_TTL_LONG` = 30 d | signed-in only | `httpOnly` | `lib/auth/config.ts:32` |
| `hermes_consent_id` | necessary | `CONSENT_ID_MAX_AGE_SECONDS` = 365 d | all visitors | `httpOnly`, `sameSite=lax`, `secure` in production | `lib/compliance/consent-cookie.ts:28` |
| `hermes_org` | necessary | 365 d | signed-in only | `httpOnly`, `sameSite=lax` | `lib/tenant-selection/{contract,cookie}.ts` |
| `NEXT_LOCALE` | **preferences** | 365 d (`localeCookie.maxAge` 31536000) | all visitors | library default, readable by scripts | `i18n/routing.ts:20` |

### Browser storage

| Key | Medium | Category | Retention | Purpose |
|---|---|---|---|---|
| `hermes_cookie_consent` | `localStorage` | necessary | **no expiry** — until cleared or changed | Mirror of the consent decision so a choice is honoured when the database is unreachable |

`localStorage` has no expiry, so the policy says "no expiry" rather than
inventing a duration. The test asserts that every `localStorage` entry carries
`maxAgeSeconds: null`.

### Third parties, with the gate the code enforces

| Service | Gate (as enforced) | Needs deployment config | Evidence |
|---|---|---|---|
| Google Analytics 4 / Google Tag Manager | `analytics` **or** `marketing` | **yes** — absent unless `GA_MEASUREMENT_ID`/`GTM_ID` is set | `AnalyticsProvider.tsx:100`, `middleware.ts:28-30` |
| Microsoft Clarity | `analytics` | no | `AnalyticsProvider.tsx:101` |
| ProvenExpert review seal | `marketing` | no | `proseal-controller.ts` — the script is not fetched at all pre-consent, re-checked inside the loader |

**Deliberately not listed:** the eNAMAD seal and the SaaSHub badge. Both are
plain `<img>` elements allowed only under `img-src` in the CSP; they set no
cookie and run no script, so listing them as consent-gated third parties would
misdescribe them. The test asserts they are absent from the third-party list.

### Categories with no first-party storage

`analytics` and `marketing` hold **no** first-party entries. The page says so
explicitly (`categories.noneStored`) instead of rendering an empty table — an
empty table reads as "nothing happens here", which would be wrong: third-party
storage in those categories is real.

---

## 4 · Policy claims and their code evidence

| Claim in the policy | Backed by |
|---|---|
| "ZHARFA Vira Pouyesh Fanavari is responsible" | `ORG_NAME` imported from `lib/seo/config` |
| "Hermes OS is the platform" | `SITE_NAME` |
| Contact address | `CONTACT_EMAIL` |
| "Necessary entries carry no consent switch" | `route.ts:121` forces `necessary: true` server-side; the banner's necessary toggle is `disabled` |
| "Nothing is set before you answer" | `AnalyticsProvider` renders GTM/Clarity only on granted consent; `proseal-controller` refuses to fetch pre-consent |
| "Refusing costs you no functionality" | Reject-All sets all optional categories false; no code path makes a necessary feature conditional on an optional category |
| Each retention period | the imported TTL constant, or the cited single set-site |
| "This service may be absent even with consent" (GA/GTM) | `HAS_ANALYTICS` in `middleware.ts` |
| "You can reopen the dialog here at any time" | the `ManageCookiePreferencesButton` on this page, tested end-to-end |
| "The dialog opens with your current decision filled in" | the banner seeds `prefs` from the stored record |
| "No limit on how often you may change your answer" | tested: two consecutive saves, each one POST |
| "Clearing site data makes the dialog ask again" | the decision lives in `hermes_consent_id` + the `localStorage` mirror; clearing both removes it |

Every one of the 14 sections the brief required is present and asserted by a
test that checks the key exists in **all three** locales.

---

## 5 · Consent UX changes

### The reopen path (UX-1)

```
Cookie Policy page
  └─ ManageCookiePreferencesButton   (client, renders a button and nothing else)
        └─ requestCookiePreferences()
              └─ window event "hermes:cookie-preferences-open"
                    └─ CookieConsentBanner  (the ONE consent surface)
                          └─ opens its preferences view, seeded from the stored record
```

**Why an event and not a second dialog.** A preferences dialog on the policy page
would be a second writer of one consent record, with its own state and its own
save path — which is how consent records drift apart. There is still exactly one
banner, one save path and one stored truth; `cookie-preferences.ts` is only the
doorbell. It mirrors the transport the consent layer already uses
(`hermes:consent-updated`), so a control can live on any page without importing
the banner or sharing a React tree with it.

The test asserts the reopen control renders no `role="dialog"` and no
`data-consent-action="accept-all"`, and that neither the control nor the
transport module touches `localStorage` or `fetch`.

### Seeding from the stored decision (UX-2)

The banner now keeps the consent on record in a ref and seeds the preferences
view from it. Without this, the reopen path would have been a silent downgrade: a
visitor who had accepted analytics, opening preferences to change marketing,
would have been shown analytics as OFF and would have saved that unintended
withdrawal.

A ref rather than state, so the reopen listener can read it without the effect
depending on it — which would tear down and reinstall the listener on every
consent change.

A `normalizePrefs` guard was added on the same path: `necessary` is forced true,
and every optional category must be an explicit `true`. A malformed or
hand-edited record therefore resolves to "not granted" and can never silently
enable analytics or marketing. Asserted by test.

### `Cache-Control` on the consent endpoint (UX-3)

Every response on `/api/compliance/cookie-consent` now carries:

```
Cache-Control: private, no-store, max-age=0, must-revalidate
Vary: Cookie
```

The GET response is selected entirely by the `hermes_consent_id` cookie and the
URL is identical for every visitor, so a shared cache or reverse proxy keying on
the URL alone could have served one visitor's consent state to another — which
both misreports consent and discloses one subject's record to a different
browser. `AnalyticsProvider` already passed `cache: "no-store"` on its own fetch,
but a client-side hint cannot bind an intermediary; the answer has to come from
the server. The banner's fetch also now passes `cache: "no-store"` for
consistency.

### Behaviour verified by rendering the real component

| Behaviour | Result |
|---|---|
| No stored consent → the banner asks | pass |
| Stored consent → the banner stays hidden | pass |
| Reopen event → preferences view opens, seeded with the stored choice | pass |
| Necessary toggle is checked and `disabled`; the other three are changeable | pass |
| Accept All → closes, records all four true | pass |
| Reject All → records a refusal of every optional category | pass |
| Save, reopen, change, save again → two POSTs, second body reflects the change | pass |
| Malformed stored record → all optional categories off | pass |
| Reopen works in Persian (RTL) and German, localized, no English carryover | pass |

---

## 6 · Security properties preserved, not weakened

| Property | Status |
|---|---|
| `necessary` forced true server-side | unchanged |
| Optional categories fail closed on an unparseable body | unchanged |
| Subject id taken **only** from a server-minted, pattern-validated cookie; `sessionId` in the body ignored (P99-INT-001 / P99-INT-002) | unchanged, asserted |
| Response projects preferences only — never `userId`, `ipAddress`, `userAgent` | unchanged, asserted |
| POST rate-limited (`checkRateLimit`) and body-bounded (`SMALL_JSON_BODY_BYTES`) | unchanged, asserted |
| Client IP from `resolveClientIp` (X-Real-IP), never attacker-controlled XFF | unchanged |
| CSP | **unchanged** — no directive relaxed, no host added |
| No tracking added without consent | unchanged |
| No raw secret, token or private identifier rendered on the policy page | the page renders cookie NAMES only, never values |

---

## 7 · Localization

`cookiePolicy` is a new top-level namespace, **70 leaves**, registered in
`de-catalog.test.ts`'s `TRANSLATED_NS`.

| Check | Result |
|---|---|
| en / fa / de key parity | exact, 70 = 70 = 70 |
| Empty values | none |
| ICU placeholder parity | exact |
| German identical to English | **zero** leaves — no allowlist entry added |
| Persian identical to English | **zero** leaves |
| Persian script in German values | none |
| Arabic `ي` / `ك` in Persian values | none |
| Total catalog leaves | 7910 → **7980**, measured |

Numbers in retention strings use `{count, number}` so Persian renders
Persian-Indic digits through the framework's own formatter rather than a
locale branch in the component. Third-party service names carry a localized
parenthetical (e.g. `Microsoft Clarity (Sitzungsanalyse)`) so a brand name does
not become an identical-value exception.

The policy **version** is deliberately not a catalog leaf: a version number is a
technical identifier whose German would be byte-identical to its English, which
would have forced an allowlist entry for no benefit. It lives in
`COOKIE_POLICY_VERSION`.

`LegalPageShell` gained two **optional** props (`versionLabel`,
`effectiveLabel`) defaulting to the English words it has always printed, so
`/privacy`, `/terms`, `/gdpr` and `/data-request` render byte-identically while
the cookie policy supplies its own localized labels.

---

## 8 · Known residual gaps (reported, not fixed)

| Gap | Why deferred |
|---|---|
| `/privacy` and `/terms` are still hard-coded English by the same pattern `/cookies` had | Out of this phase's scope; localizing legal text requires its own legal review. The defect is the same shape and is now documented |
| `LegalPageShell`'s footer link row (Privacy Policy / Terms / Cookie Policy / GDPR Rights / Data Request) is English in every locale | Shared chrome across five legal pages; changing it would alter four pages outside scope. The Cookie Policy carries its own **localized** Privacy Policy link inside the body, which is what the brief required |
| `CURRENT_CONSENT_VERSION` stays `"1.0"` while the policy document is `2.0` | Re-collecting consent after a policy revision is a deliberate owner decision. Bumping the consent version would invalidate every stored decision and re-prompt every visitor — a behavioural change nobody asked for |
| The consent banner's copy lives under the historical `adminGovernance.cookieConsent` namespace | Renaming a namespace is a catalog-wide migration with its own governance cost. The policy page reads that namespace on purpose so the two surfaces cannot name the categories differently |
| eNAMAD registrant unknown | The accessible name is product-neutral until the operator confirms the registrant in writing |
