# Phase 113 — Validation Report

**Branch:** `feature/phase113-public-identity-seo-cookie-governance`
**Worktree:** `E:\hermes-phase113`
**Baseline:** `837deb5cb3e31120530ece8c34fe3fa86908f5f7` (= `origin/main` = last deployed production commit)
**Covers:** the original Phase 113 scope, plus extension **113-A** (Cookie Policy visual redesign) and **113-B** (AI video / AI audio route audit)
**Validated:** 2026-09-27
**Final state:** `CODE_REVIEW_READY` · `UNCOMMITTED` · `NO_PUSH` · `NO_PR` · `NO_DEPLOY` · `NO_PRODUCTION_MIGRATION`

---

## 1 · Commands actually executed

Nothing is reported here that was not run in this worktree against locally
installed dependencies.

| # | Command | Result |
|---|---|---|
| 1 | `git fetch origin --prune`, `rev-parse`, `worktree list` | baseline confirmed; 74 pre-existing worktrees untouched |
| 2 | `npm ci` | **exit 0** |
| 3 | `DATABASE_URL=…unused… npx prisma generate` | **PASS** — Prisma Client v7.8.0 (run manually; the host `npm ci` policy blocks install scripts) |
| 4 | `npx prisma validate` | **PASS** — "The schema at prisma\schema.prisma is valid" |
| 5 | `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` | **PASS — 0 errors** |
| 6 | `npm run lint` | **PASS — 0 errors**; 122 warnings, all pre-existing, **none in any file this phase changed** |
| 7 | `npx vitest run` — the four Phase 113 suites | **PASS — 115/115** (identity 38, cookie governance 38, editorial design 24, AI media routes 15) |
| 8 | `npx vitest run --maxWorkers=3` — full suite | **PASS — 572 files passed, 9 skipped; 13770 tests passed, 149 skipped, 0 failed** |
| 9 | `node --experimental-strip-types scripts/audit-ai-discoverability.ts` | **PASS — 44 PASS / 0 WARN / 0 FAIL** |
| 10 | `NODE_OPTIONS=--max-old-space-size=4096 npm run build` | see §2 |
| 11 | `git diff --check` | one finding, explained in §3 |
| 12 | Independent read-only re-audit (see §5) | executed the real schema builders, `buildMetadata` and a rebuilt copy of the RBAC matchers |

### Full-suite completeness check

Low memory can make Vitest drop files silently, so the collected count was
reconciled against the filesystem rather than trusted:

* Vitest collected **581** files (572 passed + 9 skipped).
* `*.test.ts(x)` on disk, excluding the 25 `*.pg.test.ts` the config excludes,
  `node_modules`, `.next` and `.claude`: **578**.

Collected (581) ≥ on-disk (578) — the remainder are `.spec`/`.mjs` matches of the
default include. **No file was silently skipped.**

---

## 2 · Production build

```
NODE_OPTIONS=--max-old-space-size=4096 npm run build
→ BUILD_EXIT=0
```

**PASS.** Next.js 15.5.25, compiled clean, **988/988 static pages generated**,
`First Load JS shared by all` = **102 kB** — unchanged from the baseline figure,
so the 498 added CSS lines and the rebuilt page cost nothing in shared JavaScript.

The redesigned Cookie Policy prerendered as SSG in all three locales, which is the
strongest evidence available that the localized server render works: a missing
catalog key raises `MISSING_MESSAGE` and a render error fails the build.

```
├ ● /[locale]/cookies                          865 B         143 kB
├   ├ /fa/cookies
├   ├ /en/cookies
└   └ /de/cookies
```

**`ENOTEMPTY: rmdir '.next/export'` did not occur** — `grep -c ENOTEMPTY` over the
build log returns `0`, as it did on the first build.

### The build did not perturb the tracked diff

`.next` is git-ignored (`.gitignore:2`), and this was verified rather than assumed
by fingerprinting the working diff before and after:

```
git diff | sha256sum
before build : 6d4ee4a0ec056d5e4f5456d88519bd45de231a2fa94fd6f0c71835825bb0cfd5
after  build : 6d4ee4a0ec056d5e4f5456d88519bd45de231a2fa94fd6f0c71835825bb0cfd5
paths        : 37 (unchanged)
```

---

## 3 · `git diff --check`

One finding, unchanged from the first pass:

```
CLAUDE.md:5: trailing whitespace.
```

**Not a defect and deliberately not "fixed".** `CLAUDE.md` uses the Markdown
hard-line-break convention throughout, and the baseline line 5 ends with the same
two spaces — verified byte-for-byte:

```
git show HEAD:CLAUDE.md | sed -n '5p' | od -c
→ ... I   R   I   C  (space)(space) \n
```

Stripping them would change how the file renders.

A `LF will be replaced by CRLF` notice also appears for
`src/app/[locale]/cookies/page.tsx`. That is `core.autocrlf=true` behaving
normally: LF in the index, CRLF in the worktree.

---

## 4 · Change inventory — CORRECTED

**37 paths: 23 modified, 14 added.** `git diff --shortstat` over the tracked
files: **23 files changed, 1680 insertions(+), 133 deletions(-)**.

> **Correction to the first report.** It stated "30 paths: 21 modified, 9 added".
> Both numbers were wrong: the count was written mid-flight, and its
> documentation subtotal omitted `content/journal/author.json`. The figures above
> are the measured ones.

### Modified — product code (13)

| File | What |
|---|---|
| `src/lib/seo/config.ts` | `ORG_NAME`/`ORG_SHORT_NAME` → ZHARFA; `ORG_SAME_AS` emptied; new `PRODUCT_SAME_AS` |
| `src/lib/seo/schemas.ts` | product name removed from `Organization.alternateName`; `sameAs` omitted when empty; ProvenExpert moved onto the product |
| `src/app/[locale]/layout.tsx` | `authors`/`creator`/`publisher` all resolve to `ORG_NAME` |
| `src/app/llms.txt/route.ts` | About line interpolates `${ORG_NAME}` |
| `src/components/trust/TrustBadgesSection.tsx` | product-neutral eNAMAD accessible name |
| `src/app/[locale]/cookies/page.tsx` | **113-A** — rebuilt as an editorial document (14 numbered sections, sticky index, real tables) |
| `src/app/globals.css` | **113-A** — +498 lines, purely additive, every rule under `.hz-legal` |
| `src/components/compliance/CookieConsentBanner.tsx` | reopen listener, stored-consent seeding, `normalizePrefs`, `cache:"no-store"`; **113-A** corner radii brought under 8px |
| `src/app/api/compliance/cookie-consent/route.ts` | `Cache-Control: private, no-store…` + `Vary: Cookie` on every response |
| `src/components/landing/ContactSection.tsx` | **113-B** — 3 `mailto:` targets carrying the retired identity |
| `src/lib/media/seo.ts` | comment accuracy (tenant vs platform operator) |
| `content/journal/author.json` | author `company` |
| `CLAUDE.md` | identity line |

### Added — product code (4)

`src/lib/compliance/cookie-inventory.ts` (253) ·
`src/components/compliance/cookie-preferences.ts` (63) ·
`src/components/compliance/ManageCookiePreferencesButton.tsx` (41) ·
plus the four test files below.

### Modified — catalogs (3)

`messages/{en,fa,de}.json` — identity values, the `cookiePolicy` namespace, and
`contact.generalEmail`. Top-level key **order** is identical across all three
(asserted by `de-catalog.test.ts`), CRLF preserved, each file re-parsed and
round-trip-verified before every write.

### Modified — tests and gates (6) · Added — tests (4)

| File | Role |
|---|---|
| `src/lib/seo/__tests__/entity-graph.test.ts` | identity, separation, product-vs-company `sameAs` |
| `src/lib/seo/__tests__/schema-locales.test.ts` | Organization exact-key pin narrowed (`sameAs` omitted) |
| `src/i18n/__tests__/de-catalog.test.ts` | `cookiePolicy` registered in `TRANSLATED_NS` |
| `src/i18n/__tests__/german-final-gate.test.ts` | leaf pin 7910 → **7986** (both sites); proper-noun allowlist names ZHARFA |
| `src/lib/media/__tests__/seo.test.ts` | tenant-publisher negative assertion tracks `ORG_NAME` |
| `scripts/audit-ai-discoverability.ts` | ORG_NAME pin; llms.txt asserted *through the constant*; two new invariants |
| **+** `src/lib/seo/__tests__/phase113-public-identity.test.ts` | 38 — identity, entity separation, footer identity per locale, navigation boundary, **separator-insensitive retired-identity sweep** |
| **+** `src/components/compliance/__tests__/phase113-cookie-governance.test.tsx` | 38 — inventory↔code both directions, catalog parity, reopen behaviour on the real component, endpoint privacy |
| **+** `src/app/[locale]/cookies/__tests__/phase113a-editorial-design.test.ts` | 24 — corner ceiling, document structure, table re-flow, RTL logical properties, reduced-motion, focus |
| **+** `src/lib/navigation/__tests__/phase113b-ai-media-routes.test.ts` | 15 — real phases, route existence, protection, flag state, navigation boundary |

### Documentation — 2 modified, 7 added

`docs/AI_DISCOVERABILITY.md` (dated amendment) and the seven
`docs/release/phase113-*.md` documents.

### Restored to baseline

**`src/components/compliance/LegalPageShell.tsx`** — the two optional label props
added in the first implementation became unused once the Cookie Policy stopped
using the shared shell, so they were removed rather than shipped as dead code.
The file is now byte-identical to `837deb5c`, and `/privacy`, `/terms`, `/gdpr`
and `/data-request` are unchanged.

### Verified untouched

`prisma/**` · `prisma.config.ts` · `src/middleware.ts` · `src/lib/auth/**` ·
`src/lib/tenant/**` · `src/lib/tenant-selection/**` · `src/app/robots.ts` ·
`src/app/sitemap.ts` · `src/components/public-site/nav.ts` ·
`src/lib/navigation/app-nav.ts` · `package.json` · `package-lock.json` ·
`.github/**` · `docker-compose.yml` · `next.config.ts`

---

## 5 · Independent re-audit findings

A read-only forensic pass was run before the extension, deliberately **not**
trusting the implementation report. It executed the real modules rather than
reading assertions.

### Verified by execution

| Check | Method | Result |
|---|---|---|
| Entity graph | imported `schemas.ts` through an alias-resolving loader and serialised the real graph | 4 nodes; **exactly one** `Organization`; one `SoftwareApplication`; `alternateName` = `["ZHARFA"]`; `"sameAs" in org` = **false**; `app.sameAs` = ProvenExpert only; **no** `github.com` anywhere; no `logo`/`offers`/`aggregateRating`/`review`/`award`/`price`; all referenced `@id`s defined |
| Metadata | executed `buildMetadata` for fa/en/de | canonical per-locale on the apex; hreflang fa+en+de + `x-default`→fa; `og.url` = canonical; per-locale OG locale + alternates; `noIndex` branch emits real directives; Twitter card with **no** handle |
| Navigation | rebuilt all **24** `PROTECTED_PATHS` matchers from `rbac.ts` source, sanity-checked against 15 known answers, then tested every nav href | 25 distinct hrefs; **0** failures (page exists, unprotected in fa/en/de, no locale prefix); 0 prefix-containment hits; all four operational routes absent from nav **and** protected in all locales |
| Pinned test quality | read the assertion bodies | the required-present list is a **literal** 22-item array; the *actual* side comes from the implementation. It genuinely catches removal rather than mirroring the code |
| Hard-coded links outside the registry | grepped the public shell | `/`, `/demo`, `/platform`, `#public-content` — all public. No leak, though note the registry test does not cover them |

### The one material defect the re-audit found

**The retired company identity was still published.** `contact.generalEmail`
served `hermesnovinmehriric@gmail.com` on the **public** `/[locale]/contact` page,
as visible text and as a `mailto:` target, in all three locales.

The original inventory searched for `Hermes Novin` **with a space**, so the
concatenated form never matched — and the new regression test used the same spaced
needles, so it reported "published nowhere" while the name was on the page.

Demonstrated before fixing:

```
catalog caught by the original needles : false
catalog contains "hermesnovinmehriric" : true
```

**Remediation, and proof it works.** The address now points at the canonical
`info@hermesnovin.com` (already published as `contact.salesEmail`, already the
graph's `contactPoint`; **no mailbox was invented**), the three dead-code `mailto:`
targets were replaced, and the gate is now separator-insensitive with a carve-out
for the production host derived from `BASE_URL`. Mutation-proved:

| Input | Result | Required |
|---|---|---|
| `hermesnovinmehriric@gmail.com` | **CAUGHT** | must be caught |
| `Hermes-Novin Mehr` | **CAUGHT** | must be caught |
| `hermes.novin` | **CAUGHT** | must be caught |
| `info@hermesnovin.com` | passed | must not be caught |
| `https://hermesnovin.com/fa/cookies` | passed | must not be caught |
| `ZHARFA Vira Pouyesh Fanavari` / `Hermes OS` | passed | must not be caught |

Full write-up: `phase113-ai-media-route-audit.md` §5.

---

## 6 · Failures encountered, and how each was classified

Every failure seen across the whole phase. None was suppressed; no assertion was
weakened to obtain a pass.

| Failure | Classification | Resolution |
|---|---|---|
| `schema-locales.test.ts` Organization key pin (11 keys → 10) | **changed invariant** | `sameAs` is now omitted. Pin narrowed and the reason recorded; it stays EXACT |
| `entity-graph.test.ts` pinned the retired name and product-as-alias | **changed invariant** | That assertion *was* the defect. Replaced with stronger ones |
| `german-final-gate.test.ts` leaf pin | **changed invariant** ×2 | 7910 → 7980 → **7986**, measured each time, both pin sites |
| `de-catalog.test.ts` zero-carryover ceiling | **changed invariant** | `cookiePolicy` registered in `TRANSLATED_NS`; the ceiling stays ZERO |
| `phase113-cookie-governance.test.tsx` required-sections list referenced `categories.heading` | **changed invariant** (113-A) | The umbrella section became four numbered sections; the list now checks the new structure plus a new assertion that the deleted leaf stays deleted |
| "config.ts carries no retired identity" | **defect in my own test** | It read comments. `config.ts` documents *which* name was retired — that is documentation, not publication. Now comment-stripped for source, raw for JSON |
| "product never re-declares the company" found `ORG_NAME` | **defect in my own test** | The product `description` legitimately names its developer. Narrowed to: no nested `Organization` node, `@id`-only relations |
| `requestCookiePreferences(undefined)` returned `true` | **defect in my own code** | A JS default parameter also fires for an explicit `undefined`, so the guard was untestable. Signature is now `… \| null` with a `null` default |
| `Cannot find module 'next/navigation'` | **environment** | Mocked `@/i18n/navigation`, as the pre-existing Phase 104 consent tests do |
| 7 type errors on `fetchMock.mock.calls[…][1]` | **defect in my own test** | `vi.fn(async () => …)` declares no parameters, so `mock.calls` typed as `[]` |
| `audit-ai-discoverability.ts` `ERR_INVALID_TYPESCRIPT_SYNTAX` | **tooling defect in my own patch step** | A shell quoting layer ate backslashes out of three regex literals. Rebuilt from `String.fromCharCode(92)` in a file-based script |
| **Leaf delta asserted +7, measured +8** | **defect in my own script**, caught by its own guard | The guard threw **before writing**, so no file was touched. Expected value corrected |
| `storage.providerPlatform` would be DE==EN and FA==EN | **would have needed an allowlist entry** | Deleted instead: the first-party provider is `SITE_NAME`, read from code. A product name is not translatable copy |
| `categories.heading` / `categories.intro` orphaned by the redesign | **orphan leaves** | `categories.intro` re-homed into section 01; `categories.heading` deleted. Zero orphans now, proved by a reachability script |
| 3 failures in the new design test (radius band, capsule selector, `localStorage` literal) | **imprecise assertions of my own** | Radius check now targets the 9px–998px band; capsule detection walks rules instead of a greedy selector; the consent-locality check is comment-stripped |
| `/s` regex flag rejected by `tsc` (TS1501) but accepted by Vitest | **real portability defect in my own test** | `[^}]*` already crosses newlines; flag removed. Would have broken CI while passing locally |
| 3 `@typescript-eslint/no-require-imports` errors | **lint defect in my own test** | Converted to ESM imports |
| `/api/copilot/voice/route.ts` asserted to exist | **wrong assumption in my own test** | There is no handler at the bare path; the real endpoints are `session`, `query`, `speech` |

**No product regression occurred.** The full suite is green and every pre-existing
assertion that changed did so because the invariant it encoded genuinely changed.

---

## 7 · Pre-existing baseline defects, independently verified

### `phase109b0-disclosure-completeness.test.tsx`: **NOT REPRODUCED**

9/9 pass. The test is already deterministic: `SENTINEL_TS = Date.UTC(...)` and its
single `NextIntlClientProvider` pins `timeZone="UTC"` (line 400). This host runs
`Europe/London` at UTC+1 — precisely a zone that *would* expose host-timezone
dependence — and it still passes. **No change made**; adding a timezone invariant
to a test that already pins one would be a second copy of an existing guard.

### `prisma.config.ts` `shadowDatabaseUrl`: **CONFIRMED, milder than reported, DEFERRED**

* `shadowDatabaseUrl` belongs to `DatasourceShape`
  (`@prisma/config/dist/index.js:346-349`), **not** `MigrationsConfigShape`
  (`:358-362`). The repo puts it under `migrations`, where nothing reads it, so
  setting `SHADOW_DATABASE_URL` **has no effect**.
* The stronger claim — that every CLI call would fail to load the config — is
  **wrong at 7.8.0**. `parsePrismaConfigShape`'s `onExcessProperty: "error"` is
  only reached for a plain-object config; `defineConfig()` brands the object
  (`:264-281`) and `parsePrismaConfigInternalShape` short-circuits on that brand
  (`:462-470`). Measured: with `SHADOW_DATABASE_URL` exported,
  `npx prisma validate` loads the config and reports the schema valid.
* The real defect is **silent misconfiguration** — harder to notice, and it does
  **not** block this phase.
* **DEFERRED.** `prisma/` and `prisma.config.ts` are untouched.

### `.next/export` ENOTEMPTY: **NOT REPRODUCED**

`grep -c ENOTEMPTY` over both build logs returns `0`.

---

## 8 · Gates NOT run

| Gate | Status | Reason |
|---|---|---|
| 25 × `*.pg.test.ts` | **NOT RUN** | Require a live PostgreSQL instance; excluded by `vitest.config.ts`. No isolated fixture or disposable database is available here, and no database code changed. **Not reported as PASS** |
| `prisma migrate deploy` / `status` | **NOT RUN** | No migration exists; no production database connection authorized |
| Production deploy | **NOT RUN** | Not authorized. `deploy.yml` is `workflow_dispatch`-only |
| CI workflows | **NOT RUN** | Nothing pushed, no PR opened |
| **Browser screenshots at 375 / 1024 / 1440 (fa + en)** | **NOT_RUN — environment** | Attempted twice. `next dev` bound port 3000 but needed **796 s** merely to reach "Ready" on this machine, and the first-request compile of `/[locale]/cookies` did not finish inside a 300 s budget; the in-app browser pane could not reach `localhost` at all. Reported as NOT_RUN rather than as a pass — see §9 for what replaces it |
| eNAMAD registrant confirmation | **BLOCKED — missing evidence** | Not evidenced in the repository; recorded as an operator action |
| ZHARFA corporate `sameAs` URLs | **BLOCKED — missing evidence** | None verified; `ORG_SAME_AS` stays empty by design |

---

## 9 · What replaces the screenshots

The screenshots were the weakest available evidence anyway; these are stronger,
and all three were actually run:

1. **The production build statically generated all three locales** of the page.
   That executes the real server component against the real catalogs — a missing
   key raises `MISSING_MESSAGE` and a render error fails the build. See §2.
2. **24 structural design assertions** on the real CSS and the real page source:
   the radius ceiling (nothing between 9px and a capsule), exactly one capsule and
   it must be the small chip, `.hz-section` declaring no background / radius /
   shadow, the `68ch` reading cap, the mobile table re-flow with `data-label` and
   **no** `overflow-x`, the `≤360px` rule, logical properties only (no
   `text-align: left|right`, no physical `border/padding/margin-left|right`),
   `prefers-reduced-motion`, `forced-colors`, 44px targets, focus rings on both
   surfaces, and the Signal-Green-never-on-light contrast law.
3. **ICU rendering per locale** through `intl-messageformat`:
   `۸ ساعت` / `8 Stunden` / `8 hours`, `۳۶۵ روز` / `365 Tage` / `365 days`.

What this genuinely does **not** cover: how the layout *looks* at each width. A
human should open `/fa/cookies` and `/en/cookies` at 375, 1024 and 1440 before
sign-off.

---

## 10 · Security and privacy

| Property | Status |
|---|---|
| CSP | **unchanged** — no directive relaxed, no host added |
| Auth / RBAC / tenant isolation | **unchanged** — no authorization file touched |
| Protected routes | **unchanged**; the boundary is now pinned by two independent tests |
| Public navigation | **unchanged**; counts pinned (22 header, 17 footer) |
| Consent: `necessary` server-forced; optional fail-closed | unchanged, now asserted |
| Consent: subject id only from a server-minted validated cookie | unchanged, now asserted |
| Consent: response projects preferences only | unchanged, now asserted |
| Consent: rate-limited and body-bounded | unchanged, now asserted |
| **Consent endpoint cacheability** | **improved** — `private, no-store, max-age=0, must-revalidate` + `Vary: Cookie` on every response, closing a shared-cache cross-visitor disclosure path |
| **Malformed consent record** | **hardened** — `normalizePrefs` forces `necessary`, requires explicit `true` per optional category |
| **Retired identity on a public page** | **fixed**, and the gate that missed it is now separator-insensitive |
| Secret scan over added lines | no key, token, password or credential added. The one external reference is `gh api` reads of the owner's own repository |
| XSS in translations / JSON-LD | no `dangerouslySetInnerHTML` added; JSON-LD still routes through the tested `serializeSchema` escaper; all new copy is text |
| Event injection | the reopen event carries **no payload** — `new CustomEvent(name)` with no `detail`; the banner ignores everything but the event type |
| Open redirect | no redirect added; the only new links are `mailto:` + a locale-aware `Link` to `/privacy` |
| Third-party `target="_blank"` | carries `rel="noopener noreferrer"` |
| PLC / SIS write capability | none added |
| Fabricated legal claims | none; two were **removed** and two avoided (eNAMAD registrant, third-party retention) |

---

## 11 · Remaining risks

| Risk | Severity | Note |
|---|---|---|
| The light document sheet inside the dark Hermes shell is an aesthetic judgement | **medium** | The one decision here that is taste, not measurement. Needs the owner's eye at 375/1024/1440 |
| No visual regression baseline for the redesigned page | **medium** | The 24 assertions cover geometry and structure, not appearance |
| German and Persian legal wording | **medium** | Accurate and natural, but a cookie policy is a legal text in three jurisdictions. Needs a lawyer, not a reviewer |
| `updates.body` promises fresh consent on material change | **medium** | A commitment the code does not enforce today. Owner must confirm intent |
| `/privacy` and `/terms` remain hard-coded English | **medium** | Pre-existing, out of scope, same defect class the cookie policy had. Recommended next |
| `contact.generalEmail` now shares the sales mailbox | low | No mailbox was invented. Owner may supply a distinct address |
| `ORG_SAME_AS` empty → no external identity signal | low | Deliberate; a false entity merge is worse |
| eNAMAD registrant unconfirmed | low | The seal still verifies via its own URL; only the accessible name is product-neutral |
| Cookie policy `2.0` vs `CURRENT_CONSENT_VERSION` `1.0` | low | Re-collecting consent is an owner decision |
| `videoHub` nav label translated but unused | low | Kept deliberately; the contract test records why |
| `tenant-context-static.test.ts` forbids `/ZHARFA/i` in the tenant contract | low | Pre-existing placeholder guard that now collides with the real company name. Passes today; documented |
| `prisma.config.ts` misplacement | low | Confirmed, silent, deferred |

---

## 12 · Git state

```
branch      feature/phase113-public-identity-seo-cookie-governance
base        837deb5cb3e31120530ece8c34fe3fa86908f5f7
HEAD        837deb5c   (= baseline; 0 commits ahead)
commits     0          pushed  no      PR  none
deployed    no         migrations  none
working tree 37 paths: 23 modified, 14 added
```

`main` untouched · production untouched · all 74 pre-existing worktrees untouched ·
no branch deleted · no history rewritten · no force-push · no remote ref created
(`git ls-remote --heads origin 'feature/phase113*'` → 0).

---

## 13 · Commit plan (nothing committed)

Three reviewable commits, in this order:

**1 — company identity, metadata and the entity graph**

```
src/lib/seo/config.ts · src/lib/seo/schemas.ts · src/app/[locale]/layout.tsx
src/app/llms.txt/route.ts · src/components/trust/TrustBadgesSection.tsx
src/lib/media/seo.ts · content/journal/author.json · CLAUDE.md
messages/{en,fa,de}.json  (identity values + contact.generalEmail only)
src/components/landing/ContactSection.tsx
src/lib/seo/__tests__/{entity-graph,schema-locales}.test.ts
src/lib/media/__tests__/seo.test.ts · scripts/audit-ai-discoverability.ts
```

**2 — cookie policy, consent UX and privacy hardening**

```
src/lib/compliance/cookie-inventory.ts
src/components/compliance/{cookie-preferences.ts,ManageCookiePreferencesButton.tsx}
src/components/compliance/CookieConsentBanner.tsx
src/app/api/compliance/cookie-consent/route.ts
src/app/[locale]/cookies/page.tsx · src/app/globals.css
messages/{en,fa,de}.json  (the cookiePolicy namespace)
```

**3 — tests and governance documentation**

```
src/lib/seo/__tests__/phase113-public-identity.test.ts
src/components/compliance/__tests__/phase113-cookie-governance.test.tsx
src/app/[locale]/cookies/__tests__/phase113a-editorial-design.test.ts
src/lib/navigation/__tests__/phase113b-ai-media-routes.test.ts
src/i18n/__tests__/{de-catalog,german-final-gate}.test.ts
docs/AI_DISCOVERABILITY.md · docs/release/phase113-*.md
```

Note: commits 1 and 2 both touch `messages/*.json`. Splitting a JSON file across
two commits means the first will not have a green i18n gate on its own (the leaf
pin moves in commit 2). If every commit must be independently green, land the
catalogs whole in commit 1 and move the pin there too — or squash 1 and 2.

---

## 14 · Two owner decisions to record explicitly

### Decision 1 — `Organization.sameAs` is REMOVED, not empty

The property is **absent** from the emitted schema, not emitted as `sameAs: []`.
An empty array is still a published claim shape. Both previous entries were
identities of something other than the company: the ProvenExpert profile reviews
the **product** (moved to `SoftwareApplication.sameAs`), and the GitHub account
merely **hosts** this repository.

Verified by execution: `"sameAs" in organizationSchema()` → `false`, and
`github.com` appears nowhere in the serialised graph.

**Confirm:** the company publishes no external identity until a verified ZHARFA
corporate URL is supplied.

### Decision 2 — the eNAMAD label stays PRODUCT-NEUTRAL

The seal's accessible name is `eNAMAD Electronic Trust Seal — Hermes OS`. It names
**no company**, because the registrant of eNAMAD id 761266 is not evidenced
anywhere in this repository. The previous label named the retired company;
replacing it with ZHARFA would have asserted a registration transfer we cannot
evidence. Every verification parameter (both URLs, `referrerPolicy`, the
deliberately absent `rel`, the non-standard `code` attribute) is preserved
byte-for-byte.

**Confirm:** the label stays product-neutral until ZHARFA's legal ownership of that
eNAMAD registration is confirmed in writing, at which point it may name ZHARFA.

---

# Addendum 2 — Scope B completion and owner URL evidence

Added after the review rejected `CODE_REVIEW_READY` for an under-reported Scope B,
and after the owner supplied the ZHARFA corporate URL. The sections above stand;
this records what changed and corrects two counts.

## A · The `LegalPageShell.tsx` contradiction — RESOLVED

The report said "restored to baseline"; the UI counter showed `+3/-21`. **The
report is correct.** Proof:

```
git diff 837deb5c -- src/components/compliance/LegalPageShell.tsx   → EMPTY (exit 0)
git diff --numstat 837deb5c -- …LegalPageShell.tsx                  → no row
git status --porcelain -- …LegalPageShell.tsx                       → no row
grep -c "versionLabel\|effectiveLabel"                              → 0
```

EOL-normalised content hash, baseline vs worktree — **identical**:

```
git show 837deb5c:…LegalPageShell.tsx | tr -d '\r' | sha256sum
cat …LegalPageShell.tsx               | tr -d '\r' | sha256sum
both → a3a7656b9f8b0fb0e6fb58701498ab766c94a950138f00a5a6cc01099c93e647
```

(The *raw* hashes differ because the index stores LF and the worktree holds CRLF —
`core.autocrlf=true`, 38 lines each way. That is normal here and is why a raw
byte compare is the wrong test.)

**What the UI counter was measuring:** per-session *edit activity*, not the git
diff. The file was edited twice in this session — once to add the two optional
props (+21/−3) and once to remove them again (+3/−21). The panel showed the second
edit. Net against the baseline is zero, which is what the git commands above prove.
The file is **absent from the final diff**.

## B · Corrected counts

| | Value |
|---|---|
| Working tree | **38 paths: 24 modified, 14 added** |
| `git diff --shortstat` | **24 files changed, 1759 insertions(+), 137 deletions(-)** |

Newly touched since the previous report: `src/lib/seo/config.ts`,
`src/lib/seo/schemas.ts`, `src/components/public-site/PublicFooter.tsx`
(+ `src/app/globals.css` and `src/components/landing/ContactSection.tsx`, which
were already counted). `LegalPageShell.tsx` is **not** among them.

> Why the earlier figures moved: 30 → 32 → 37 → 38. The "30 / 21 / 9" figure was
> written mid-flight and its documentation subtotal dropped
> `content/journal/author.json`; 32 was the measured state at the read-only audit;
> 37 after Scope A and B; 38 after the corporate-URL work. Each number was correct
> only for the snapshot that produced it — which is exactly why this addendum
> quotes the command instead of a remembered total.

## C · Scope B — now reported in full

The evidence lives in
[`phase113-ai-media-route-audit.md`](./phase113-ai-media-route-audit.md) and the
addendum to
[`phase113-navigation-route-matrix.md`](./phase113-navigation-route-matrix.md).
Commit-level proof was added for both phase numbers, and the reproduction matrix
now covers fa/en/de for every route. Contract test:
`src/lib/navigation/__tests__/phase113b-ai-media-routes.test.ts` — **25 assertions**.

`NO_HEADER_CHANGE_REQUIRED` is **CONFIRMED**, no longer inherited: both
capabilities fail the owner's own exposure test, and the reasons are now pinned by
tests rather than asserted in prose.

## D · Owner URL evidence

`ZHARFA corporate URL` blocker: **`BLOCKED` → `RESOLVED_BY_OWNER_EVIDENCE`**
(explicit owner confirmation, 2026-09-28). The supplied `www` form was **not**
taken at face value: `curl` showed it 301s to the apex, and ZHARFA's own JSON-LD
publishes `Organization.url: "https://zharfavira.com"`. The apex is what Hermes
adopts. Full reasoning, the two duplicate-entity findings it exposed, and why the
`@id` was deliberately *not* moved: `phase113-public-identity-model.md` §7.

`eNAMAD` blocker: **still BLOCKED.** A corporate website does not prove who holds
registration `id=761266`.

## E · Validation re-run after all of the above

| Gate | Result |
|---|---|
| `tsc --noEmit` | **PASS — 0 errors** |
| `npm run lint` | **PASS — 0 errors** (122 pre-existing warnings, unchanged) |
| Phase 113 suites | **PASS — 132/132** (identity 45, cookie governance 38, editorial design 24, AI media 25) |
| Full suite `--maxWorkers=3` | **PASS — 572 files passed, 9 skipped; 13787 passed, 149 skipped, 0 failed** |
| `audit-ai-discoverability` | **PASS — 44 PASS / 0 WARN / 0 FAIL** |
| `prisma validate` | **PASS** |
| `git diff --check` | one pre-existing `CLAUDE.md:5` trailing-whitespace finding (baseline convention) |
| `next build` | see below |

## F · Cookie visual status — corrected wording

**`VISUAL_IMPLEMENTATION_COMPLETE`**, **not** "visual acceptance passed".
Screenshots remain `NOT_RUN` (environment). An 18-row human review checklist for
375 / 1024 / 1440 across fa and en is in `phase113-cookie-visual-system.md` §8,
marking which rows are measurable defects and which are owner judgement calls. No
further aesthetic change was made.

### G · Final production build

```
NODE_OPTIONS=--max-old-space-size=4096 npm run build  →  BUILD_EXIT=0
```

**PASS.** 988/988 static pages, `ENOTEMPTY` absent, and
`First Load JS shared by all                                   102 kB` — unchanged from baseline, so the corporate-URL work, the footer
attribution link and the 498 added CSS lines cost nothing in shared JavaScript.

Tracked diff fingerprint, before and after the build:

```
git diff | sha256sum  →  23e84314fe5c62cb8f52c7bdf0af2c614456c396e13efc6b4a6344293ef63174  (both)
```
