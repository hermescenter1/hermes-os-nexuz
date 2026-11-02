# Hermes OS — Technical SEO Targets

Status: adopted target set, 2026-11-02.
Machine definition: `scripts/seo/technical-targets.mjs` (keep this table and that
module in step). Live check: `npm run audit:seo:live`.

These targets define "technically healthy" for the public site
(`https://hermesnovin.com`, locales `fa`, `en`, `de`). Each is measurable from a
crawl of the live site, with no Search Console or analytics access. They describe
crawlability, indexability and delivery. They do not promise rankings, traffic or
AI citations.

A **BLOCKER** failure means Google is likely to drop, merge or misread pages, and
fails the gate. **MAJOR** degrades ranking ability or crawl efficiency. **MINOR**
is hygiene.

| ID | Severity | Target | Threshold |
|---|---|---|---|
| T01 | BLOCKER | Every sitemap URL answers 200 without a redirect | 100% |
| T02 | BLOCKER | Exactly one absolute canonical per indexable page, inside `<head>` | 100% |
| T03 | BLOCKER | Sitemap pages are indexable and self-canonical | 100% |
| T04 | BLOCKER | hreflang inside `<head>`, with `x-default`, reciprocal, pointing at live alternates | 100% |
| T05 | BLOCKER | `html lang` and main-content language match the URL locale | 100% |
| T06 | MAJOR | One `<title>` in `<head>`, 15–65 characters, unique | 100% |
| T07 | MINOR | Meta description 70–170 characters, unique | 100% |
| T08 | MINOR | Exactly one `<h1>` | 100% |
| T09 | BLOCKER | No sitemap URL is disallowed for Googlebot by robots.txt | 100% |
| T10 | MAJOR | Internal links resolve to 200 (no redirect, 4xx or 5xx) | 100% of crawled targets |
| T11 | MAJOR | http, www, unprefixed, uppercase and trailing-slash variants reach the canonical in one permanent (301/308) hop | 100% |
| T12 | MAJOR | TTFB at the edge | p75 ≤ 800 ms and p95 ≤ 1500 ms |
| T13 | MAJOR | Decoded HTML size | ≤ 300 KB |
| T14 | MAJOR | Indexable HTML is edge-cacheable (`public` / `s-maxage`, not `private`/`no-store`) | 100% |
| T15 | MINOR | `Strict-Transport-Security` present, no `X-Powered-By` | every response |
| T16 | MAJOR | JSON-LD parses; Article has headline, image, datePublished, dateModified, publisher `@id`; article pages have BreadcrumbList | 100% |
| T17 | MAJOR | Main content ≥ 300 words on commercial pages, ≥ 600 on articles | 100% |
| T18 | MINOR | Every article has its own `og:image` | 100% |
| T19 | MAJOR | Sitemap `lastmod` reflects real edits | ≤ 20% of values inside the last 48 h |
| T20 | BLOCKER | No 5xx anywhere in the crawl | 0 |
| T21 | MINOR | Every indexable page reachable by links is in the sitemap | 100% |
| T22 | MINOR | No orphan sitemap page | 100% |

## Why these thresholds

- **T02 and T04 require `<head>`.** Google ignores `rel=canonical` and hreflang
  outside `<head>`. Next 15 streams metadata into `<body>` for any user agent
  that is not on its HTML-limited bot list, and that list does not include
  Googlebot. URL Inspection (Google-InspectionTool) *is* on the list, so it shows
  correct markup while Googlebot does not see it. The crawler therefore uses a
  user agent that is not on the list. It reproduces what Googlebot receives.
- **T05 checks language from the content, not only the attribute.** Search
  Console showed German articles published under `/en/` and `/fa/`, and Persian
  articles reachable under `/en/` and `/de/`.
- **T11 rejects 302/307.** A temporary redirect keeps the source URL canonical.
  That is how 42 unprefixed URLs stayed in Google's index.
- **T12 and T13** are edge-side lab budgets, not Core Web Vitals. Search Console
  has no field data for this site yet because traffic is too low.
- **T19** catches `updatedAt` churn. A view counter used to stamp every article
  as modified "now".
- **T17's word floors** are an internal quality floor for pages that must win
  commercial and informational queries. They are not a Google rule.

## Running it

```bash
npm run audit:seo:live -- --out seo-audit-output
```

Options: `--base <url>` (for example a staging host), `--concurrency 2`,
`--delay-ms 300`, `--discover-max 300`, `--no-fail`. The audit uses GET only,
sends no cookies and needs no credentials. It exits 1 when a BLOCKER fails.
