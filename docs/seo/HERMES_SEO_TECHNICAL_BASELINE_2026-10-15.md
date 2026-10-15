# Hermes OS — Technical SEO Baseline (2026-10-15)

Base: `origin/main` = `da4f28ac`. Branch: `feature/seo-technical-remediation`.
Method: read-only anonymous HTTP GETs against `https://hermesnovin.com` plus source tracing.
No deployment, Search Console, DNS, Cloudflare or server change was made.

**Important caveat.** The live site is not necessarily the code on `main`. Earlier work
(Phase 113, Sprint 1C-A, PR #114) was merged or open but not all deployed, and live responses
carry no release header. Findings below are tagged **LIVE** (observed on the deployed site) or
**REPO** (traced in source on `main`).

Classification: ✅ confirmed defect · ⚠ probable, needs measurement · ✔ not an issue / preserved ·
➕ proposed · ✖ rejected.

## 1. Host, redirects, robots, sitemap (LIVE)

| Check | Observation | Class |
|---|---|---|
| `http://hermesnovin.com/` | 301 → `https://hermesnovin.com/` | ✔ |
| `http://www…` | 301 → `https://www…` → 308 → `https://hermesnovin.com/` | ✔ (two hops, canonical apex) |
| `https://hermesnovin.com/` | 308 → `/fa` | ✔ root locale routing preserved |
| `/en/` | 308 → `/en` (trailing slash normalised) | ✔ |
| `/robots.txt` | 200, one `Sitemap:` line, apex host, 22 UA groups | ✔ |
| robots size | 90 KB (each group repeats every per-locale Disallow) | ⚠ valid (limit 500 KiB), but bloated |
| `/sitemap.xml` | 200, 435 `<url>`, all apex host, 0 duplicate `<loc>`, 1226 `xhtml:link` | ✔ |
| sitemap `x-default` | none in sitemap, present in page `<head>` | ⚠ cosmetic inconsistency, valid |
| sitemap `lastmod` | 167 of 435 entries; others omit it | ✔ not fabricated |
| Retired author URL in sitemap | 12 occurrences of `…mehr-iric…` | ✅ LIVE; fix is PR #114 (open, not merged) — **not redone here** |
| Public cache headers | `private, no-cache, no-store` on HTML | ⚠ TTFB cost; separate infra decision |

## 2. Core templates (LIVE, fa/en/de where fetched)

`/fa /en /de /fa/careers /en/careers /fa/platform /en/industrial-brain /fa/articles /fa/contact /fa/about`:
each returned 200 (after redirects), exactly **one `<h1>`**, a self-referencing canonical,
`robots: index, follow`, correct `lang`/`dir` (`fa-IR` rtl, `en-GB`/`de-DE` ltr), a reciprocal
hreflang set including `x-default`, and the global JSON-LD graph. ✔

## 3. Confirmed defects

### D1 — Careers board and job detail are empty in server HTML ✅ (LIVE + REPO)
- `/en/careers` and `/fa/careers` HTML contains no link to any `/careers/{id}`; the page is
  `CareersBoardClient`, which fetches `/api/careers/jobs` after hydration
  (`src/components/careers/CareersBoardClient.tsx`).
- The sitemap advertises 6 job URLs × 3 locales while the listing page exposes no crawlable link to them.
- `/careers/[jobId]` emits `JobPosting` JSON-LD but its visible server HTML is the "loading" state
  (`JobDetailClient` fetches after hydration). Structured data therefore did not match visible content.
- Eligibility, locale-completeness and noindex rules were already correct and are unchanged.

### D2 — Legacy `<meta name="keywords">` emitted on 35 page types ✅ (LIVE + REPO)
Ignored by search engines; the brief forbids adding it. `buildMetadata` emitted it from
`meta.pages.*.keywords`.

### D3 — Whole translation catalogue serialised into every page ✅ (LIVE) / probable cost
`/fa` HTML = 727 KB, of which ≈454 KB (~62%) is one RSC chunk carrying
`NextIntlClientProvider messages={messages}` (`src/app/[locale]/layout.tsx:157,201`).
A static scan of `useTranslations(...)` found 61 of 80 namespaces referenced, i.e. pruning by
namespace would remove only ≈19% of the catalogue, and `useMessages()` (3 files), a no-argument
`useTranslations()` (admin console) and dynamic namespaces (2 sites) make a safe allow-list unprovable
without a larger refactor. **Not changed in this PR** (see §6).

## 4. Checked, not an issue (REPO)
- `meta.pages` titles/descriptions are unique within each locale, with only `de.academy` slightly long (186 chars). Entries without title are template fragments, not pages.
- Service pillar routes already exist: `/services/{industrial-ai, plc, scada-hmi, digital-twin, predictive-maintenance, ot-edge, knowledge-cloud, cybersecurity, cmms, edms, erp, crm, multi-site}`, plus `/platform`, `/industrial-brain`, `/brain`, `/copilot`, `/library`, `/articles`. **No route gap justifies a new page.**
- Entity graph (`src/lib/seo/schemas.ts`, `config.ts`): Organization = ZHARFA, product = Hermes OS (`SoftwareApplication`), founder `Person`, stable `@id`s, `sameAs` limited to verified profiles, no rating/review/logo/LocalBusiness. Preserved.
- Taxonomy (tag/category) pages are noindex by policy in PR #114, not on `main`.

## 5. Not measured
- Lighthouse / CrUX / INP: no lab tooling was run against production; no field data available. Local figures, if any, are in the implementation report and labelled as such.
- Indexation status (e.g. "/en crawled – currently not indexed"): requires Search Console; unavailable. Treated as an investigation item only. Nothing in the live `/en` response (200, indexable, canonical self, hreflang) explains non-indexation.

## 6. Proposed / rejected
| Item | Decision |
|---|---|
| SSR careers + job detail | ➕ implemented |
| Stop emitting `keywords` meta | ➕ implemented (central, `buildMetadata`) |
| Prune message catalogue per namespace | ✖ rejected for now: ≈19% gain, runtime `MISSING_MESSAGE` risk. Better: split providers per route group (public vs dashboard/admin) — backlog |
| New pillar pages | ✖ no route gap |
| Breadcrumb/WebPage JSON-LD on service pages | deferred: needs new i18n keys and the repo's catalogue-leaf gates |
| Author 301 / retired identity | ✖ out of scope; PR #114 + owner data decision |
| Cache headers for HTML | ✖ infra/edge decision; documented |
| Shrinking robots.txt | ✖ valid today; risk > benefit |
