# Hermes OS — SEO Implementation Report (2026-10-15)

Branch `feature/seo-technical-remediation` from `origin/main` `da4f28ac`. Not deployed, not pushed.

## 1. Verdict
**Partial, evidence-based remediation.** The site's technical SEO foundation (single canonical host,
hreflang, canonical, sitemap, robots, entity graph) was already sound. Two proven defects are fixed here;
the largest performance cost (translation catalogue in every payload) and several items that need
owner/infra decisions are documented, not changed. No ranking, indexing or Core Web Vitals
improvement is claimed — none was measured.

## 2. Fixes made
| # | Change | Files |
|---|---|---|
| F1 | Careers board renders real postings in server HTML (job links, titles, summaries). Falls back to the client fetch only if the DB read is unavailable | `src/app/[locale]/careers/page.tsx`, `src/components/careers/CareersBoardClient.tsx` |
| F2 | Job detail renders the real posting (or the enumeration-safe unavailable copy) in server HTML, so `JobPosting` JSON-LD matches visible content | `src/app/[locale]/careers/[jobId]/page.tsx`, `src/components/careers/JobDetailClient.tsx` |
| F3 | `<meta name="keywords">` no longer emitted (central change; option kept as deprecated no-op) | `src/lib/seo/metadata.ts` |
| T1 | New test: server-rendered careers/detail HTML contains job content; loading only when the store is unreachable | `src/components/careers/__tests__/seo-careers-server-render.test.tsx` |
| D | Reports | `docs/seo/*.md` |

Unchanged on purpose: eligibility predicate (`publicJobWhere`), noindex/no-canonical/no-JobPosting for
ineligible or untranslated jobs, application routes, auth, robots, sitemap, CSP, consent gate, analytics.

## 3. Keyword-to-page map
See `HERMES_KEYWORD_INTENT_MAP_2026-10-15.md`. No new page was created: every cluster already has a
canonical route; remaining gaps are editorial (fact-checked articles), not routing.

## 4. Schema graph (unchanged, verified from source)
Organization (ZHARFA Vira Pouyesh Fanavari) · WebSite (+SearchAction) · SoftwareApplication (Hermes OS) ·
Person (founder, as on About) with stable `@id`s `/#organization`, `/#website`, `/#hermes-os`, `/#founder`.
Page-level: TechArticle + BreadcrumbList (articles), JobPosting (eligible jobs only), Course, vendor
Organization/ItemList. `sameAs`: product → ProvenExpert profile only; org → published corporate profile only.

## 5. Facts deliberately NOT published
Logo (no verified asset), address/phone/LocalBusiness, social handles, certifications, ratings/reviews,
customers, awards, German-locale claims beyond translated pages, any "controls PLC" claim.
Retired legal name stays unpublished (author-archive containment pending in PR #114).

## 6. Performance
Measured (live, 2026-10-15, single anonymous GET each):
- `/fa` HTML 727 KB; ≈454 KB (~62%) is one RSC chunk serialising the full i18n catalogue.
- `/en/careers` 556 KB, `/fa/articles` 606 KB (same cause).
- HTML responses are `no-store`; no edge caching.
Not measured: Lighthouse, LCP, CLS, INP, TTFB (lab tooling not run; machine was under heavy shared load,
so any local timing would be unreliable). **No before/after performance numbers exist.** F1/F2 add a DB
read per careers request (already no-store/dynamic) and reduce client work; no regression measured.

## 7. Validation (commands actually run, Node 24.18.0, Windows)
| Gate | Result |
|---|---|
| `npm ci` | exit 0 |
| `prisma generate` (CI placeholder DATABASE_URL) | ok |
| `tsc --noEmit` | exit 0 |
| `eslint --no-eslintrc -c .eslintrc.json` on 6 changed files | exit 0 (`next lint` unusable in nested worktree: parent `.eslintrc` plugin conflict) |
| careers component tests (5 existing files, one at a time) | 18+38+23+6+4 pass |
| new `seo-careers-server-render` | 6/6 pass |
| `src/lib/seo` | 158/159 in batch; the 1 failure (`canonical-host-public-content`) passed 10/10 when re-run alone → load flake, not a defect |
| `src/app/__tests__` (sitemap/robots contracts) | 142/142 |
| `src/app/api/careers` | 54/54 |
| `next build` | exit 0 |
| Full `vitest run` | see §8 |
Not run: rendered-HTML scan of a local server (`next start` fail-closes without a JWT secret; the
`renderToString` test is the evidence instead), Lighthouse, link scanner against a running server.
`prisma validate/format` not run — no Prisma files changed.

## 8. Full-suite result
`vitest run --maxWorkers=2`: exit 0 — 641 test files passed, 9 skipped (650); 15172 tests passed, 152 skipped
(15324). Stack-trace-like `database.failure` JSON lines in the log are expected negative-path test output.
Run on a shared, heavily loaded machine; the earlier worker-start timeouts disappeared with `--maxWorkers=2`.

## 9. Known limitations
- Live site predates some `main` fixes; live findings may differ after deployment.
- Payload reduction (translation catalogue) needs a provider split per route group — larger refactor.
- Sitemap carries 435 URLs incl. 12 for the retired author handle (data-model decision, PR #114).
- Indexing status of `/en` unknowable without Search Console.

## 10. Backlog
**30 days:** merge/deploy PR #114 and re-crawl sitemap; split `NextIntlClientProvider` per route group
(public vs dashboard/admin) and measure; add cache policy for public HTML at the edge (infra decision);
add BreadcrumbList to `/services/*` (requires new i18n keys + catalogue gates).
**60 days:** 6–8 fact-checked fa/en articles on PLC troubleshooting, S7-1200/1500 + TIA Portal,
OPC UA vs MQTT, SCADA redundancy — each linking to its service pillar; internal-link audit of orphaned articles.
**90 days:** electrical-power content only if sourced and reviewed; Lighthouse/CrUX baseline in CI;
locale-specific category descriptions before any category is made indexable.

## 11. Deployment checklist (do not execute here)
1. Review diff; CI green on PR. 2. Deploy via the repository's manual workflow. 3. Verify `/en/careers`
HTML has job links (`curl` and grep `/careers/`). 4. Verify a job page shows body text and `JobPosting`.
5. Confirm closed/unlisted job URL is noindex without canonical. 6. Confirm no `name="keywords"` in `<head>`.
7. Re-submit sitemap in Search Console **manually by the owner**.
