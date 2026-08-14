# Phase 105 — AI Discoverability & Entity Authority: Final Report

**Status:** implementation complete, uncommitted
**Baseline:** `b9424f3483aa0653dfeb014bef3d26fbae975bda`
**Branch:** `claude/hermes-os-seo-hardening-883af2`
**Scope:** P0 + P1 (owner-selected). P2 items are listed as deferred.

This document records what was changed, what was verified, and — importantly —
where an intermediate revision of this phase was **wrong** and how it was
corrected. The correction trail is kept deliberately: it is the most useful part
of the audit history.

---

## 1. Canonical identity

| | Value |
|---|---|
| Company (legal, canonical) | Hermes Novin Mehr IRIC |
| Short brand | Hermes Novin |
| Product | Hermes OS |
| Product category | Enterprise Industrial Intelligence Platform |
| Canonical host | `https://hermesnovin.com` (**apex**) |

The canonical host is the apex, established from repository evidence:
`deploy/nginx/default.conf` 308-redirects `www` → apex, and both the Dockerfile
and `docker-compose.prod.yml` default `NEXT_PUBLIC_BASE_URL` to the apex. The
`www.hermesnovin.com` line in `CLAUDE.md` is a stale document, not a conflict.

### Stable entity IDs (public contract — do not rename)

```
Organization  https://hermesnovin.com/#organization
WebSite       https://hermesnovin.com/#website
Hermes OS     https://hermesnovin.com/#hermes-os
Founder       https://hermesnovin.com/#founder
```

These are locale-independent by construction (built from `BASE_URL`, never from
a locale segment), so the fa/en/de pages describe **one** company and **one**
product rather than three of each.

### Graph relationships

```
WebSite     --publisher--------------------> Organization
Hermes OS   --creator / publisher / provider-> Organization
Person      --worksFor--------------------->  Organization
Organization--founder---------------------->  Person
Article     --author / publisher----------->  Organization
```

Schema.org has no `develops` property, so ownership is expressed only in the
directions the vocabulary actually supports. No property was invented.

---

## 2. The two Brain capabilities — corrected determination

### An intermediate revision of this phase got this wrong

An earlier revision classified `/industrial-brain` as a *private application
workspace*, removed it from the sitemap, and relabelled `/brain` as "Hermes
Industrial Brain" in `llms.txt`. **All three of those were incorrect.** The
evidence that overturned it:

- `src/app/[locale]/industrial-brain/page.tsx` carries an explicit architectural
  note: *"Phase 82: page stays fully public — auth only decides whether the
  report shows an active 'Save as Engineering Case' button or a sign-in CTA."*
- It is linked from the **public homepage** (`page.tsx:71`, `:191`), the
  **public navigation** (`public-site/nav.ts:43`, `:106`), `HomeStorySection`
  and the dashboard — i.e. it is the primary Industrial Brain entry point.
- It is **not** in `isProtectedPath`, and it renders for anonymous visitors.
- `IndustrialBrainWorkspace` receives only `{ locale, isFa, canSaveCase }`.
  `getCurrentUser()` is used solely to derive the `canSaveCase` boolean; no
  tenant, user, session or private operational data is rendered server-side.

Removing it from the sitemap therefore hid the *primary* Industrial Brain
surface from crawlers while advertising the secondary one — the opposite of the
intended outcome. Both errors are corrected in the final state.

### Final model (owner-approved)

```
Hermes Novin Mehr IRIC
        │
        ▼
     Hermes OS
        │
        ├── Hermes Brain              → /brain
        │     └── Industrial Knowledge Engine
        │
        └── Hermes Industrial Brain   → /industrial-brain
              └── Alarm intelligence / signal matrix / industrial analysis
```

### Final evidence for both routes

| Property | `/brain` | `/industrial-brain` |
|---|---|---|
| Meta title | Hermes Brain — Industrial Knowledge Engine | Hermes Industrial Brain — Alarm Intelligence, Signal Matrix |
| H1 | Industrial engineering analysis | Hermes Industrial Brain |
| Canonical | `/{locale}/brain` (self) | `/{locale}/industrial-brain` (self) |
| Robots | `index, follow` | `index, follow` |
| In sitemap | Yes (fa/en/de) | Yes (fa/en/de) |
| Auth required | No | No |
| Tenant / user / session data | None | None |
| Semantic identity | Knowledge / reasoning capability | Alarm, signal and fault-analysis capability |
| Relation to Hermes OS | Capability within Hermes OS | Capability within Hermes OS |

`brain canonical != industrial-brain canonical`. Both indexable, both public,
both semantically distinct. **Neither redirects nor canonicalises to the other,
and neither is noindexed.**

### Structured-data treatment

The two capabilities are represented through page metadata, visible copy,
internal links and the `llms.txt` description — deliberately **not** by minting
separate `Organization` or `SoftwareApplication` entities. Elevating a capability
to its own product/company node is precisely the entity-ambiguity failure this
phase exists to prevent. Hermes OS remains the single product entity.

---

## 3. Organization logo — intentionally omitted

`Organization.logo` **is intentionally omitted pending a verified corporate
asset.**

The previous `ORG_LOGO_URL` pointed at `/favicon.svg` and was emitted both as
`Organization.logo` and as `JobPosting.hiringOrganization.logo`. A favicon is a
browser tab icon, not a corporate logo asset; publishing it as the company logo
is an unsupported assertion about brand identity.

The constant was **deleted**, not merely unused, so no schema builder can
silently reintroduce it. `logo` is optional on both types, so omission is valid
structured data.

**Site favicon behaviour is unchanged** — it is declared independently by
`app/[locale]/layout.tsx` (`metadata.icons`) and `app/manifest.ts`, neither of
which was touched.

> **Operator action:** supply a verified production-quality corporate logo, then
> reintroduce it in `lib/seo/config.ts` and reference it from
> `organizationSchema()`.

---

## 4. Verified `sameAs`

Every value is provable from this repository. Nothing was guessed from a
plausible username.

| Entity | URL | Verification source |
|---|---|---|
| Organization | `https://www.provenexpert.com/hermes-os/` | Embedded by `components/trust/ProvenExpertSeal.tsx:13` using this organisation's own profile id; allow-listed in the middleware CSP. Campaign parameters stripped — `sameAs` must be the canonical profile URL. |
| Organization | `https://github.com/hermescenter1` | The **account/profile identity page** of the account hosting this repository's origin remote. A bare repository URL would not be an identity page and is deliberately not used. |
| Founder (Person) | `https://www.linkedin.com/in/hamid-reza-forozandeh` | The LinkedIn URL this site itself publishes on its public contact page (`contact.linkedinUrl`). |
| Hermes OS | *(none)* | No dedicated verified product profile exists. An empty/omitted `sameAs` is preferred to fabrication. |

No X/Twitter handle is published. The previous `TWITTER_HANDLE = "@hermesos"`
was unverified and was removed; `twitter:site` / `twitter:creator` are omitted,
and the large-image card renders correctly without them.

---

## 5. Fabricated-signal removals

| Removed | Why |
|---|---|
| `Offer { price: "0", priceCurrency: "USD" }` on `SoftwareApplication` | A free price advertised for a product that has a `/pricing` page. This was a fabricated commercial claim. Omitted even though Google's SoftwareApplication rich result prefers `offers` to be present — correctness over rich-result eligibility. |
| `articleSchema` date fallbacks `2026-01-01` / `2026-06-25` | Stamped a fabricated publication history onto every article lacking real timestamps. Dates are now emitted only when the caller genuinely has them. |
| Site-wide sitemap `lastModified = 2026-06-25` | Claimed every marketing page changed on one day and never again. `lastmod` is optional; static routes now omit it, and database-backed families carry the row's real timestamp. |
| `Organization.logo` = favicon | See §3. |
| `TWITTER_HANDLE` | See §4. |

No `aggregateRating`, `review` or `award` is emitted anywhere.

---

## 6. Sitemap architecture

- **186 URLs** at build time without a database: **62 unique paths × 3 locales**
  (fa = 62, en = 62, de = 62 — perfectly symmetric).
- Reciprocal hreflang alternates on every entry.
- Contains **no** admin, dashboard, auth, API, CRM/ERP, `/engineering`
  (explicitly `noindex`) or `/automation` (a protected route) URL.
- Zero duplicate URLs.
- `lastModified` present only where a real timestamp exists — **0** entries
  without a database, by design.

### Journal policy

The Journal (`/articles`, every article, every author profile) was **entirely
absent** from the sitemap before this phase — the single largest crawlable
authority gap on the site.

Its predicate lives in `src/lib/articles/seo.ts` and is a *superset* of the one
the article page applies to itself:

```
status = PUBLISHED  AND  visibility = PUBLIC  AND  noIndex = false
```

The `noIndex` clause is why `getPublicArticles()` cannot be reused: its
`ArticleListItem` type does not carry `noIndex`, so an editor-de-indexed article
would otherwise be advertised in the sitemap while its page serves `noindex`.

Reads are bounded by `ARTICLE_SITEMAP_MAX = 5000`. Author profiles are listed
only when they carry at least one indexable article, so no thin/soft-404 profile
is advertised. `lastModified` is the row's real `updatedAt`, falling back to
`publishedAt`, and is omitted entirely when neither is usable.

---

## 7. Crawler policy

Unchanged by this phase; documented here because it is part of the architecture.
`src/app/robots.ts` separates three distinct concerns — they are not equivalent:

| Agent | Policy | Purpose |
|---|---|---|
| Googlebot | Public allowed; private/API denied | Search indexing |
| Bingbot | Public allowed; private/API denied | Search indexing |
| OAI-SearchBot | Public allowed; private/API denied | AI **search/retrieval** |
| Claude-SearchBot / Claude-User | Public allowed; private/API denied | AI search / user-directed fetch |
| PerplexityBot | Public allowed; private/API denied | AI search |
| GPTBot | `/library`, `/services`, `/academy` only | Model **training** |
| ClaudeBot | Same scoped subset | Model training |
| Google-Extended | Same scoped subset | Training-use token (does **not** control Google Search indexing) |
| Applebot-Extended | Same scoped subset | Training-use token |
| AhrefsBot, SemrushBot, MJ12bot, DotBot, BLEXBot | Disallow `/` | Commercial SEO scrapers |

`robots.txt` is crawl policy, not access control. Private surfaces remain
protected by authentication and authorization independently of it.

---

## 8. JSON-LD serialisation security

`JSON.stringify` **does not escape `<`.** The Phase 99 sink gate's own comment
previously claimed it "escapes the sequences that could close the element" —
that was incorrect. An article headline containing `</script>` would terminate
the JSON-LD script element and inject the remainder as markup.

`src/components/seo/JsonLd.tsx` now routes every payload through
`serializeSchema()`, which escapes `<` to its JSON escape plus U+2028/U+2029.
Escaping is lossless — values round-trip exactly through `JSON.parse`.

The Phase 99 static invariant was **strengthened**, not weakened: a new
`JSON_SERIALISED_ESCAPED` classification is recognised *structurally* — the
helper's definition must be present in the same file and must be shown to
perform the `<` escape. A decoy `serializeSchema` that merely wraps
`JSON.stringify` is still flagged as unsanitised (verified with a probe).

Both the special characters and the backslash of their replacement are built via
`String.fromCharCode`. Written as literal escape sequences they have already
degraded silently through this toolchain once — U+2028 collapsed to a plain
space, which would have replaced every space in the payload.

---

## 9. IndexNow

Not rewritten. The existing implementation is sound: the key is read from the
environment, `keyLocation` points at a fixed `/indexnow-key.txt` route, and the
key file 404s when unconfigured so the feature never leaks.

Both canonical Brain URLs are ordinary public canonical URLs on the canonical
host and are therefore eligible under the existing submission policy. No
integration change was required or made.

---

## 10. llms.txt

A **supplemental** discovery document. It is not a ranking mechanism and support
across AI systems is not guaranteed.

It lists canonical public URLs only, states the company → product relationship
and the canonical entity IDs, and now explicitly distinguishes the two Brain
capabilities so no retrieval system can conflate them. It contains no
authenticated, admin, tenant-private, preview or API URL.

`llms-full.txt` is **intentionally deferred** and was not created.

---

## 11. Distinguishing the five layers

These are routinely conflated; this implementation only controls the first two.

| Layer | Meaning | Controlled here? |
|---|---|---|
| **Crawlability** | A crawler can fetch the URL | Yes — robots, sitemap, SSR, status codes |
| **Indexability** | A search engine may store and serve it | Yes — canonical, hreflang, robots meta |
| **Entity recognition** | A system understands *which* company/product this is | Partially — structured data and consistency are necessary but not sufficient |
| **External authority** | Third-party corroboration of the entity | **No** — requires verified external profiles and genuine third-party coverage |
| **AI retrieval** | An AI system actually cites the page | **No** — external indexes are outside our control |

**No implementation in this repository guarantees recognition, citation,
ranking, training inclusion or retrieval by any AI system.** We control the
website; we do not control external indexes.

---

## 12. Validation

### Terminology (used consistently)

- **Phase 105 regression status: PASS** — 8575 tests passed, **0 test failures**.
- **Full repository status: PASS WITH PRE-EXISTING FAILURE** — Vitest reports
  `Test Files 1 failed | 389 passed | 9 skipped`.

The single failing *file* is `scripts/__tests__/phase102-media-processing.test.ts`,
which fails to load with `SyntaxError: Invalid or unexpected token` (a Windows/OXC
issue). It is **pre-existing**: with the entire Phase 105 diff stashed and the
working tree clean at `b9424f3`, the identical failure reproduces. Phase 102 was
not modified by this phase.

The full suite must never be described simply as "PASS" while Vitest exits
non-zero.

### Commands

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx next lint --dir src` | exit 0; 0 errors; no warnings in Phase 105 files |
| `npx vitest run --maxWorkers=4` | 8575 passed, 0 failed tests; 1 pre-existing failing file |
| `npx next build` | success — 947 static pages |
| `npx tsx scripts/audit-ai-discoverability.ts` | 42 PASS, 0 WARN, 0 FAIL (exit 0) |

The one build warning (`src/lib/ai/providers/shared.ts`, "Critical dependency")
is pre-existing and unrelated.

---

## 13. Security review

No file governing authentication, authorization, RBAC, tenant isolation, API
authorization, middleware security, Prisma, the database schema, Docker, nginx,
CSP, CSRF, rate limits or secrets was modified.

The one security-adjacent file changed is
`scripts/security/phase99/static-invariants.mjs`, a read-only CI static reviewer,
which was **strengthened** (§8).

`/brain` and `/industrial-brain` were both examined specifically: neither exposes
tenant, user, session or private operational data. Not a security defect.

---

## 14. Operator actions (do not block commit)

- [ ] Supply a verified production-quality **corporate logo** asset, then
      restore `Organization.logo`.
- [ ] Provide the official **X/Twitter** URL if one exists (nothing is published
      until verified).
- [ ] **Bing Webmaster Tools** — verify domain, submit `sitemap.xml`, inspect the
      canonical Brain/About/Platform URLs, confirm IndexNow key validation.
- [ ] **Google Search Console** — submit sitemap, review Page Indexing, confirm
      canonical selection and hreflang, check Core Web Vitals.
- [ ] **Cloudflare** — confirm WAF/bot rules do not challenge verified search or
      AI-search crawlers on public paths. Do not weaken protections globally.

---

## 15. Deferred (intentional)

- `llms-full.txt`
- Site-wide `BreadcrumbList`
- Remaining P2 polish

---

## 16. Post-deployment verification

For `/`, `/fa`, `/en`, `/de`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, and the
canonical About, Platform, Architecture, `/brain`, `/industrial-brain`, `/copilot`
and representative Journal URLs, confirm:

- HTTP status and a single, non-chained redirect
- self-canonical, and reciprocal hreflang where the translation genuinely exists
- robots meta and `X-Robots-Tag`
- JSON-LD parses; `@id` values match §1; no `localhost`/staging URL
- visible identity text is present in the **server-rendered** HTML
- `/brain` and `/industrial-brain` resolve to different canonicals

Do not treat immediate non-recognition by any AI system as failure; external
recrawling and index refresh take time.
