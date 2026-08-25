# Phase 104-F — The Hermes Industrial Journal (reference surface)

```text
PHASE104_F_IMPLEMENTATION=COMPLETE
CONCEPT=THE_INDUSTRIAL_EVIDENCE_PRESSROOM
ROUTES_MIGRATED_DIRECTLY=/articles, /articles/[slug]   (exact rules; nothing inherits)
PUBLIC_PRIVATE_ISOLATION=PASS   (runtime-verified)
OWNER_VISUAL_APPROVAL=PENDING   # historical — 104-F visual direction APPROVED 2026-08-16 (frozen reference surface); final page approval = 104-I scope
CODEX_FINAL_REVIEW=PENDING      # historical — Codex approved 2026-08-16 (PASS_WITH_FIXES → fixes applied)
COMMIT=NO · PUSH=NO · PR_STATE=KEEP_DRAFT   # historical (pre-commit status, 2026-08-16) — superseded: committed as `ed5a1e4`, merged with main `d1db221` (`2a3d9f7`), integrated head `58ed5a7`
```

The second Phase 104 reference surface: the public reading and discovery system of the Hermes
Industrial Journal, redesigned as an engineering publication. It shares the Hermes DNA with the
Observatory homepage and is deliberately a **different publication** — no signal bus, no chapters,
no atmospheric field. Its ground is a *page*.

## 1. Concept

**THE INDUSTRIAL EVIDENCE PRESSROOM** — a technical field journal crossed with an evidence ledger:
masthead rules, a folio running-head, margin annotation rails, numbered dispatch entries on one
continuous ledger, a contents-table discipline index, and a 72ch reading instrument.

Standfirst (en): *Engineering evidence transformed into durable technical knowledge.*

## 2. Route ownership — from `rbac.ts` and the import graph, not memory

`articles/layout.tsx` owns **all 28** `/articles/*` route files. The public/private boundary is the
middleware's own two patterns (`rbac.ts:116-117`):

| Class | Routes | 104-F |
|---|---|---|
| Public reading (**migrated**) | `/articles`, `/articles/[slug]` (+ its `not-found`) | own composition redesigned; **MIGRATED_DIRECTLY** |
| Public sub-views (journal shell, own compositions untouched) | `discover`, `latest`, `tags`, `tag/[slug]`, `categories`, `category/[slug]`, `authors`, `author/[handle]`, `trending`, `editors-picks`, `case-studies`, `feed`, `editorial-board` | `COVERED_BY_SHARED_LAYOUT` — render inside the journal shell via `ArticlesFeedClient` etc. |
| Authenticated (rbac) | `write`, `drafts`, `saved`, `following`, `my-articles`, `settings` | **out of scope** — legacy sidebar shell |
| Editorial / admin (rbac) | `moderation`, `review-queue`, `reports`, `editorial-board`, `editor`, `submissions` | **out of scope** — legacy sidebar shell |

Correction to the brief: `/articles/tags/[tag]` does not exist; the real archive route is
`/articles/tag/[slug]`.

### The shell switch

`journal-shell.ts` is a **pure resolver** (`journalShellMode(pathname)`) whose private-segment
list is asserted equal to the two rbac patterns. `JournalShell.tsx` is a minimal client boundary
that reads `usePathname()` and renders **exactly one** shell — the journal reading shell
(`PublicHeader visualMode="journal"` → `<main id="public-content">` → `PublicFooter
visualMode="journal"`) or the untouched 72.5 sidebar shell. **Fail-closed:** any private, unknown
or deep-unknown segment gets the legacy shell. Runtime-verified on the production build:
`/articles/write|editor|drafts|reports` → middleware redirect to login (unchanged), never the
journal shell; `/articles/discover|latest` → journal shell; `/platform` → `standard` header;
`/` → `observatory`.

## 3. Before → after (production, measured)

| | Before | After |
|---|---|---|
| Landing composition | sidebar + hero card + 3-col picks grid + 2/3–1/3 card feed + sidebar widgets | masthead → lead dossier (one Glass) → numbered dispatch ledger → discipline index → byline register → publication paths |
| Bordered/rounded boxes on landing (en desktop) | 109 | 0 cards; 1 Glass dossier |
| Legacy-token elements (`text-signal`/`border-line`/…) | 296 (landing), 101 (detail) | 3 (both — the shared header only) |
| Masthead KPIs | `1,200+ articles · 140+ experts · 4.2M views · 19 categories` **hardcoded** | none; only `feed.totalArticles`, and only when > 0 |
| `<h1>` on article detail | **2** (body `# ` rendered as a second H1) | **1** |
| Article body measure | unconstrained | 72ch (measured 726.75px at 16px Inter) |
| Reading progress / TOC | none | ARIA progressbar with numeric value; margin TOC from real `##/###` headings, in-flow on mobile |
| Persian titles | overlay duplicated in two clients | one shared `article-display.ts`, applied identically on landing, feed and detail |
| Locale awareness | `isFa` only (German fell to English paths) | `useLocale()`; German has native copy |

## 4. Component map

| Path | Role |
|---|---|
| `src/components/articles/journal-shell.ts` | pure shell resolver (contract-attacked) |
| `src/components/articles/journal/JournalShell.tsx` | client boundary; renders one shell |
| `src/components/articles/journal/EvidenceFolioSignature.tsx` | the Journal's own signature: raw signal → evidence fragment → engineering annotation → reviewed folio → published knowledge; desktop spread + mobile stack; no SVG text; RTL-mirrored |
| `src/components/articles/journal/JournalLanding.tsx` | server-rendered landing (six marks) |
| `src/components/articles/ArticleDetailClient.tsx` | rebuilt reading instrument; every network contract byte-identical |
| `src/components/articles/article-display.ts` | the pre-existing Persian display overlay, extracted once |
| `src/app/[locale]/articles/layout.tsx` · `page.tsx` | layout delegates to `JournalShell`; landing renders `JournalLanding` with `canWrite` **proven** from the session |
| `src/components/public-site/PublicHeader.tsx` · `PublicFooter.tsx` | third `visualMode="journal"`; default `standard` unchanged |
| `src/app/globals.css` — `PHASE 104-F` block | `.hj-*` only; zero new declarations in any gated family; zero raw colour |
| `messages/{en,de,fa}.json` — `journal.pressroom` | +42 leaves per locale; German leaf gate 6194 → 6236 |
| `scripts/design/phase104-route-inventory.mjs` | two exact rules before the broad `/articles` prefix |
| `src/components/articles/__tests__/phase104f-journal-contract.test.ts` | the contract + mutation harness |

## 5. Design DNA usage

* **Deep Navy** — the page ground (`.hj-page`), a ruled baseline field on `--color-background-base`.
* **Edge** — every rule, the folio line, the annotation rail, the ledger, the dotted index leaders.
* **Glass** — exactly **two** surfaces on the whole system: the lead dossier (landing) and the
  provenance panel (article). The article body is never inside Glass.
* **Beacon** — the active TOC entry (reading position) and the selected discipline. Nothing else.
* **Reasoning tokens** — evidence level (`evidence`), human review (`success`), safety-critical
  (`warning`), each always paired with a text label.
* **Not used** — Horizon/ember (allowlist unchanged), Rail, Command, Triad, the homepage `.hh-*`
  namespace, any raw hex/rgba.

## 6. Responsive · locale · accessibility (production build, 30 cells)

en/de/fa × 1440/1024/768/390/320 × landing/detail — cookie banner dismissed via its real reject
control:

* Document overflow: **0** at 1440/768/390/320 in every locale. At **1024** en/de show a 137px
  document overflow whose culprit is the **shared `PublicHeader` action cluster** — reproduced
  identically on `/platform` and on the approved `/` homepage, so it is **pre-existing and
  site-wide, not introduced by 104-F**. Recorded here as an out-of-scope shared-shell finding.
* Clipped visible text: 0 in en/fa; German folio labels wrapped after the fix (5-col → 3/5-col
  with `overflow-wrap:anywhere`).
* `<h1>` = 1 on every cell; heading order H1 → H2 → H3; duplicate ids 0; dangling ARIA refs 0;
  broken images 0 (one transient `ERR_TIMED_OUT` resource on isolated captures, 0 on re-run).
* Targets: discipline-index links and TOC links raised to 44px; `Read article` → `lg`, `Follow` →
  44px. Remaining sub-44 items are inline text links inside sentences (WCAG 2.5.8 inline
  exception) and DS `md` chips (36px, design-system-wide).
* RTL: the folio signature, ledger numbering, annotation rail, provenance rows and Beacon
  indicators mirror through logical properties; technical tokens (`PLC`, `SCADA/HMI`, `OPC UA`,
  code blocks) are `dir="ltr"` islands.
* Reduced motion: the only animation (`hj-seal`) is inside `no-preference`; measured `none` under
  `reduce`.

## 7. Behaviour preserved

Search + category filter (`ArticlesFeedClient`, untouched, still serving six sub-views); save,
reactions ×4, follow, share (byte-identical fetch contracts); related; author/category/tag links;
JSON-LD, canonical, `noIndex`, metadata; the plain-text body renderer (no HTML path); the Persian
display overlay; `getArticleFeed()`'s `PUBLISHED + PUBLIC` filter.

## 8. Exceptions and honest notes

* The fake masthead metrics are **no longer rendered anywhere**, but the `journal.masthead.*`
  catalog keys still exist because the still-live sub-views' client reads that namespace; they
  therefore still appear inside the RSC message payload (`<script>`), never in visible text.
  Removing the keys is a catalog change for a later increment.
* `FA_ARTICLE_MAP` (12 seed slugs) is a **cleanup candidate**: the durable fix is a localised
  title column on the article model — a data change, out of scope for a visual phase. It was
  consolidated, not extended.
* `ArticlesFeedClient` is intentionally **byte-identical to HEAD**: it serves six public sub-views
  whose compositions were not part of 104-F. Its legacy tokens are what remains on those routes.

## 9. Cleanup candidates (not removed)

`PublicHero.tsx`, `HomeStorySection.tsx` (from 104-E), `FA_ARTICLE_MAP` (data-model follow-up),
`journal.masthead.metrics/chips` catalog keys.

## 10. Rollback

Phase 104-F is a single commit — `ed5a1e4ae3b6a6a7d786412136562e8e12cd3cb0`
(*feat(design-system): deliver Phase 104-F Hermes Industrial Journal*, 23 files). Undo it by reverting that commit. Do not restore
whole directories and do not delete paths by hand: both discard unrelated
uncommitted work elsewhere in the tree.

```bash
git revert --no-commit ed5a1e4ae3b6a6a7d786412136562e8e12cd3cb0
git commit -m "revert: remove Phase 104-F Hermes Industrial Journal"
```

The command is repo-relative and carries no machine path, so it runs in any
clone or worktree from any directory inside the repository.

If later commits touched the same files the revert stops with conflicts.
Resolve them and run `git revert --continue`, or step back with
`git revert --abort`; either way the working tree stays recoverable and
nothing is deleted outright.

> This section previously carried an absolute machine path together with a
> broad `git restore` and a recursive delete. Neither was portable and the
> pair was destructive well beyond Phase 104-F.
> `phase104f-rollback-portability.test.ts` now rejects any drive-letter path
> or broad destructive command inside a Phase 104 rollback block.
