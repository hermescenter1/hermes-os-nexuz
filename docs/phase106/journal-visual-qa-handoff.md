# Phase 106 — Human Visual QA Handoff (Batch 1)

Status: **production rollout NOT authorized**. Automated screenshot capture is
unavailable in the agent environment (`VISUAL_SCREENSHOT_GATE=BLOCKED_BY_ENVIRONMENT`),
so the only outstanding gate is a human visual pass.

Everything below runs against a **disposable local PostgreSQL container**. No
step in this document touches production.

---

## 1. Start the isolated rehearsal environment

All five steps are local. Nothing here reads production credentials.

**Step 1 — disposable PostgreSQL** (pgvector image, because migration
`20260616000000_add_document_chunk_pgvector` runs `CREATE EXTENSION vector`):

```bash
docker run -d --name hermes-journal-rehearsal-pg -e POSTGRES_USER=hermes_rehearsal -e POSTGRES_PASSWORD='<CHOOSE_A_LOCAL_ONLY_PASSWORD>' -e POSTGRES_DB=hermes_journal_rehearsal -p 127.0.0.1:55432:5432 pgvector/pgvector:pg16
```

Port `55432` is deliberate: `5432` is occupied by an unrelated project's live
stack on this machine. Do not reuse it.

**Step 2 — environment.** Create `.env.local` in the repository root (already
gitignored at `.gitignore:14`). Only variable NAMES and shape are given here;
substitute the password chosen above:

```bash
DATABASE_URL="postgresql://hermes_rehearsal:<PASSWORD>@127.0.0.1:55432/hermes_journal_rehearsal"
HERMES_STORAGE_MODE=database
NEXT_PUBLIC_BASE_URL="https://hermesnovin.com"
```

**Step 3 — apply the rehearsed migrations** (all 72, including Phase 106):

```bash
npx prisma migrate deploy
```

**Step 4 — load Batch 1** (validate, preview, then write):

```bash
npm run journal:validate
```

```bash
npm run journal:import:dry
```

```bash
npm run journal:import
```

Expected: `Created: 30 | Updated: 0 | Unchanged: 0 | Conflicts: 0`.

> A previous agent rehearsal deliberately seeded a foreign-author conflict
> fixture to prove overwrite protection. This clean procedure does **not** seed
> it, so all 30 editions import and every route below serves editorial content.

**Step 5 — run the app:**

```bash
npm run dev
```

## 2. Teardown when finished

```bash
docker rm -f -v hermes-journal-rehearsal-pg
```

Also delete `.env.local`.

---

## 3. Routes to inspect

Six routes, chosen for maximum renderer coverage rather than convenience.

### English

| # | Route | Exercises |
| --- | --- | --- |
| 1 | `/en/articles/modern-plc-architecture-large-industrial-plants` | 21 tables, 2 ASCII diagrams, 2 numbered lists, 16 section headings |
| 2 | `/en/articles/structured-plc-software-design-large-projects` | 6 fenced blocks, 8 inline-code spans, 9 tables |

### Persian (RTL)

| # | Route | Exercises |
| --- | --- | --- |
| 3 | `/fa/articles/modern-plc-architecture-large-industrial-plants` | RTL body, 21 tables, LTR ASCII diagram, Persian numbered lists, Latin acronyms (PLC, I/O, PROFINET, MRP/RSTP/PRP/HSR) |
| 4 | `/fa/articles/plc-scan-cycle-determinism-real-time-performance` | RTL body, 4 fenced blocks, Persian numbered list, 2 inline-code spans, 7 tables |

Route 3 alone satisfies all four Persian requirements (Persian numerals, Latin
acronyms, table, LTR diagram).

### German

| # | Route | Exercises |
| --- | --- | --- |
| 5 | `/de/articles/structured-plc-software-design-large-projects` | Long compounds, 6 fenced blocks, 8 inline-code spans, 9 tables |
| 6 | `/de/articles/industrial-interlocks-permissives-trip-logic` | Long compounds (`Instandhaltungsangelegenheit.`, 29 chars), 8 tables, numbered list, 35 bold spans |

---

## 4. Viewports

| Name | Size |
| --- | --- |
| Desktop | 1440 × 1000 |
| Tablet | 834 × 1112 |
| Mobile | 390 × 844 |

The repository defines **no custom Tailwind `screens` block**, so the defaults
apply (sm 640 / md 768 / lg 1024 / xl 1280). There is therefore no documented
project-specific recommendation to override the sizes above.

One measurement worth knowing while inspecting: the article detail surface has
exactly **one** responsive class — `md:grid-cols-3` at 768 px. So 834 and 1440
render the *same structural layout* at different widths, and the only structural
transition is between mobile and tablet. If you want to probe that boundary
directly, add a fourth pass at **767 × 1000** (just below `md`).

---

## 5. Human checklist (per route × per viewport)

Layout geometry has already been measured programmatically and is clean; the
items below are the ones that require human eyes.

- [ ] Title fully visible, not clipped
- [ ] Exactly one page-level H1
- [ ] Body language matches the locale in the URL
- [ ] Typography readable; paragraph and heading spacing comfortable
- [ ] Tables readable; wide tables scroll inside their own container
- [ ] Numbered lists render as lists with correct markers
- [ ] Inline code legible and distinguishable from prose
- [ ] Fenced code / ASCII diagrams aligned and readable
- [ ] No page-wide horizontal overflow
- [ ] Breadcrumbs and metadata legible and not overlapping
- [ ] Article container width comfortable for long-form reading
- [ ] Mobile wrapping sensible
- [ ] **German:** long compounds wrap without clipping
- [ ] **Persian:** RTL reads correctly; punctuation on the correct side
- [ ] **Persian:** inline Latin acronyms do not disturb the RTL flow
- [ ] **Persian:** code and ASCII diagrams remain LTR and readable
- [ ] Contrast sufficient
- [ ] Visual hierarchy clear

---

## 6. Coverage and known non-blocking items

```text
REAL_BATCH1_BLOCKQUOTE_COVERAGE=0/30
BLOCKQUOTE_UNIT_TEST_COVERAGE=PASS
BLOCKQUOTE_VISUAL_QA=NOT_APPLICABLE_TO_BATCH1
```

No Batch 1 edition uses a blockquote. The renderer supports them and they are
covered by unit tests. Blockquotes were deliberately **not** added to content
merely to satisfy a coverage metric.

```text
JOURNAL_HEADER_FOOTER_ABSENCE=PRE_EXISTING
BATCH1_REGRESSION=NO
```

The `/articles` section renders without `<header>` / `<footer>` landmarks. This
was verified on pages Batch 1 did not create (`/en/articles`,
`/en/articles/authors`), while the marketing route `/en` does have both — so it
is a pre-existing property of the Journal shell, not a Batch 1 regression.
In-page navigation is functional (14 visible Journal links on an article page:
index, category, author, tag, related articles). Deliberately not changed here;
see the technical-debt note below.

```text
JOURNAL_FALLBACK_SCOPE_BEHAVIOR=KNOWN_PRODUCT_DEBT
```

Language fallback is **scope-level, not per-article**: if a query scope has any
edition in the requested language, only those are returned; if it has none, the
unfiltered corpus is returned for backward compatibility. A wholly untranslated
category therefore shows English articles on `/fa`, with no "not translated"
indicator. No mixed-language state occurs within one scope. Not changed here.

```text
WINDOWS_OXC_BASELINE_TEST=PRE_EXISTING_FAILURE
```

`scripts/__tests__/phase102-media-processing.test.ts` fails to load on Windows
with a SyntaxError. Reproduced identically on the clean baseline via
`git stash push -u`; untouched by this work; green on Linux CI.

---

## 7. Technical debt raised by this phase

1. **Journal shell lacks header/footer landmarks** — pre-existing; affects
   accessibility landmark navigation across the whole `/articles` section.
   Should be a separate scoped phase, not a deployment-time change.
2. **Scope-level language fallback** — an untranslated scope silently serves
   another language. A per-article "translation unavailable" affordance would be
   clearer. Separate phase.
3. **Blockquote has no production content exercising it** — acceptable; revisit
   when a batch naturally uses one.
