# Executive Management Center — Slice I: the performance baseline and safe caching

Status: **MEASURED AND IMPLEMENTED ON AN ISOLATED ENVIRONMENT — NOT A PRODUCTION
MEASUREMENT, NOT YET MERGED**
Date: 2026-10-13
Branch `feature/executive-slice-g3-customers-in-view`, from `main` = `b461ac97`.

Requirement row 11. Before this slice the row said `NOT_STARTED` and no latency
figure had been claimed anywhere, which was the honest state: the surface had
never been measured.

---

## 0. What these numbers are, and what they are not

Everything below was measured on **one developer machine**, against a
**disposable local PostgreSQL container**, calling the **data layer only**.

* No HTTP, no React rendering, no production hardware, no concurrent users, no
  network between the application and the database.
* The row counts are **synthetic** rows created by the harness, in one
  organization. They are a volume, not a real estate.
* **No figure here is a production response time**, and none may be quoted as
  one. A production figure has to be measured in production; that is a separate,
  still-open task recorded in the tracker.

What the measurement *is* good for: finding work that grows with the data,
proving a fix removed it, and setting a floor below which the page cannot go
however fast the hardware is.

---

## 1. How to repeat it

```bash
EXECUTIVE_PERF_DB=postgresql://…/hermes_exec_test \
PERF_REPORT=./perf.json \
npm run perf:executive
```

* Harness: `src/lib/executive/__tests__/pg/summary-baseline.pg.test.ts`.
* Config: `vitest.executive-perf.config.ts`, excluded from the ordinary suite
  (`**/*.pg.test.ts`) so it never runs in CI by accident.
* **Skips itself** unless `EXECUTIVE_PERF_DB` is set, and **refuses** any URL
  that is not plainly a test database — it writes tens of thousands of rows.
* Knobs: `PERF_CUSTOMERS` (seed target), `PERF_REPEATS` (default 21),
  `PERF_SCALING_SAMPLES`, `PERF_REPORT`, `PERF_SCALING_REPORT`.
* Environment of the figures below: Windows 11, PostgreSQL in Docker on
  `127.0.0.1`, database `hermes_exec_test`, one organization, 8 ERP tasks,
  5 asset alerts, 1 customer interaction.

It calls `buildExecutiveSummary` — the same function the screen and the nightly
report call — with the `OWNER` scope and all three authority axes, which is the
most expensive shape (every section does its work).

---

## 2. What was measured where, and why

Two different questions, answered by two different instruments on purpose.

**How many statements does one page cost, and does that number grow per row?**
Answered **deterministically in the unit suite**
(`summary.test.ts` → "the aggregation's cost does not grow with the number of
rows"), whose fake database client records every statement:

* 1 customer and 500 customers issue the **identical** number of statements.
* The customers section is exactly **8 counting statements**, and **every one**
  of them carries the `organizationId` predicate.

This is where the N+1 question belongs, because it is a question about code and
has an exact answer.

**What does it cost at volume?** Answered in wall-clock time against real
PostgreSQL, in the harness above.

Three earlier attempts to measure the statement count *inside* the PostgreSQL
harness were wrong, and are documented in the harness header so nobody repeats
them:

1. A Prisma log listener on a second client measured **0 queries** — the
   aggregation uses the application's own client — and the N+1 assertion passed
   **vacuously**.
2. `pg_stat_clear_snapshot()` through `$queryRawUnsafe` with an array parameter
   threw before measuring anything.
3. `pg_stat_user_tables` counters are flushed **asynchronously per backend**, so
   a window taken right after one build reported **607 scans** for a single
   build (a backlog of 21) and then **0** for the next.

The harness still reports scan counts, but labelled `approxTotal` with the
reason, and only as context.

---

## 3. The baseline

| Customers in the organization | p50 | p95 | min | max | payload | scans/build (approx) |
| --- | --- | --- | --- | --- | --- | --- |
| 8,007 | 11.87 ms | 20.99 ms | 10.30 ms | 23.44 ms | 8,947 B | 60 |
| 32,031 | 24.31 ms | 32.46 ms | 20.61 ms | 33.36 ms | 8,949 B | 60 |
| 64,063 | 35.71 ms | 42.76 ms | 29.30 ms | 50.06 ms | 8,951 B | 60 |

21 repeats per volume after one warm-up (the first call pays for connection
setup and plan caching, which a steady-state page does not).

Two things to read from the table:

* **The payload does not grow.** 8,947 → 8,951 bytes across an eightfold
  increase in rows: the summary is counts and five metrics, never a list of
  rows. There is nothing to paginate on this surface, because it returns no
  unbounded list. (The customer *pages*, which do list rows, were given cursor
  pagination in slice G1 and are bounded at 50 per page.)
* **The scan count does not grow either** — 60 per build at 8k and at 32k —
  which is the same conclusion as the deterministic unit proof, reached by an
  independent instrument.
* **But the time does grow**, roughly with the row count. That is not an N+1:
  it is what a `count(*)` over most of a table costs.

### Scaling

| | rows | p50 |
| --- | --- | --- |
| before doubling | 32,031 | 25.85 ms |
| after doubling | 64,063 | 35.52 ms |
| ratio | ×2.00 | **×1.37** |

Doubling the data costs 37% more time, not 100%: sublinear, and the harness
asserts the ratio stays under 1.6 so a regression into per-row work fails the
test rather than being noticed later.

---

## 4. The index, with before and after at the same volume

`EXPLAIN (ANALYZE, BUFFERS)` on each of the five customer counts, at 64,063
rows, found three sequential scans. One of them was indefensible:

> the **"new customers in this period"** count read **64,063 rows to return
> 155**.

Added in migration `20261013180000_executive_customer_count_indexes`
(additive — two indexes, no column, constraint or row is touched, so the
rollback is `DROP INDEX` and nothing else):

* `Party (organizationId, kind, createdAt)`
* `PartyInteraction (organizationId, occurredAt)` — the existing index leads
  with `partyId`, so it cannot serve a time range across all customers.

| Statement | Before | After |
| --- | --- | --- |
| new customers in the period | Seq Scan, **5.704 ms** | **Index Only Scan, 0.083 ms** |
| total customers | Seq Scan, 15.78 ms | Seq Scan, 17.72 ms |
| active customers | Seq Scan, 12.65 ms | Seq Scan, 14.23 ms |
| overdue follow-ups | Bitmap Heap Scan, 7.13 ms | Bitmap Heap Scan, 7.59 ms |
| unassigned | Bitmap Heap Scan, 4.39 ms | Bitmap Heap Scan, 4.58 ms |

And the whole aggregation, same database, same 64,063 rows, same command:

| | p50 | p95 | min | max |
| --- | --- | --- | --- | --- |
| before | 35.71 ms | 42.76 ms | 29.30 ms | 50.06 ms |
| after | **33.24 ms** | 42.33 ms | 30.64 ms | 47.10 ms |
| change | −7% | −1% | +5% | −6% |

**The honest reading.** The index made that one statement ~69× faster and
stopped it reading 128,126 rows per page view (two window counts), but the
end-to-end p50 moved only 7%, because the eight counts run concurrently and the
remaining full-table counts dominate the wall time. Anyone quoting "69× faster"
about the page would be wrong, and so would anyone concluding the index is
pointless: it removed the one access pattern that gets worse without bound as a
tenant's history grows, and it removed it from the database's workload as well
as from this page's.

The other three scans were **left alone on purpose**: their predicates match
most of the table (≈85% of rows are active, non-archived customers), so
PostgreSQL's planner is right to read it sequentially, and forcing an index
there would be slower. The lever for those is not another index — it is not
recomputing them for every reader every second.

---

## 5. The cache, and the six rules it keeps

`src/lib/executive/cache.ts`. A cache in front of a tenant-isolated,
permission-gated surface is a security boundary before it is an optimisation,
so each rule is a test, not a comment.

**1. Nothing is cached before the permission check.** `readExecutiveSummary`
takes an already-resolved `ExecutiveScope`, which only exists after
`resolveExecutiveScope()` has established the session, the active organization,
an ACTIVE membership and the authority axes. A reader who fails the gate never
reaches the module, so a cache entry can never be the thing that admits them.
The page and the API route both call the gate first and the cache second.

**2. The key carries the whole access shape.** Organization, role, each of the
three authority axes named individually, the sorted set of permitted site ids,
the reporting zone, the day cutoff, the range, and the resolved window start.
`executiveCacheKeyMaterial` is exported so the test asserts what separates
readers rather than inferring it:

* two readers with the same shape but different `userId`, `memberId` and
  `correlationId` share one entry — intended, because the summary is a pure
  function of the shape (verified: `getErpOverview` reads only
  `organizationId` and the financial axis, the industrial section reads only
  the permitted sites, the customers section only the organization);
* changing *any* of the nine listed components produces a different key;
* reordering the site list does not.

**3. Revocation takes effect at once**, by two independent mechanisms: the gate
refuses before any lookup, and the axes are in the key, so a reader who has lost
one cannot address the entry built while they had it. The test takes a scope
with the financial axis, caches it, then reads with the axis removed and asserts
a fresh computation whose payload says `financial: false`.

**4. A write invalidates.** `createCustomer`, `updateCustomer` and
`addInteraction` call `invalidateExecutiveSummary(organizationId)` **after the
transaction commits** — an entry must not be dropped for a write that then rolls
back. It bumps a per-organization generation counter that is part of every key,
so one atomic operation makes every cached range of that organization
unaddressable, and it can never half-succeed and leave a pre-write entry
readable. It never throws: a failed invalidation must not fail the write.
`setProjectLink` deliberately does *not* invalidate — a project link changes no
figure the summary counts.

**5. The TTL is a ceiling, not a promise.** 60 seconds by default
(`EXECUTIVE_CACHE_TTL_SECONDS`, capped at 900; `0` disables caching entirely and
stays supported). It bounds how stale an answer can be when something changed
*without* bumping the generation. Past half the TTL
(`EXECUTIVE_CACHE_STALE_AFTER_SECONDS`) the entry is still served but marked
stale.

**6. The reader is told what they are looking at.** Every answer carries
`{ hit, computedAtIso, ageSeconds, ttlSeconds, stale, store }`; the screen
prints "computed now" or "from cache, computed N s ago" (in warning colour once
stale) next to the existing "Updated …" and time-zone line, and the API returns
the same object as an additive `cache` field.

**7. The frozen nightly report never comes from here.** `report/generate.ts`
calls `buildExecutiveSummary` directly, and a source-level test asserts it keeps
doing so. A report is a record of a finished day; serving it a cached live
summary would replace a historical fact with a recent one, which is exactly the
failure the frozen-report design exists to prevent.

### What the cache does NOT fix

Without Redis the store and the generation counter are **per process**, so a
write served by one instance does not invalidate another instance's copy and the
TTL is the only bound. That is why the default TTL is one minute and why
disabling the cache stays supported. With `REDIS_URL` present both live in
Redis and invalidation is global.

No speed-up is claimed for the cache here. A cache hit returns a parsed JSON
payload instead of issuing the statements, which is obviously cheaper, but
measuring "how much faster" on this machine would measure the measuring machine.
What *is* claimed and tested is the behaviour above.

---

## 6. Files

| File | Change |
| --- | --- |
| `src/lib/executive/cache.ts` | new — the read-through cache and the invalidation hook |
| `src/lib/executive/__tests__/cache.test.ts` | new — 18 cases: key separation, serving, ageing, expiry, invalidation, tenant isolation, revocation, frozen-report exclusion |
| `src/lib/executive/__tests__/pg/summary-baseline.pg.test.ts` | new — the repeatable baseline and the scaling assertion |
| `vitest.executive-perf.config.ts`, `package.json` | new — `npm run perf:executive` |
| `src/lib/executive/__tests__/summary.test.ts` | the deterministic statement-count proof |
| `prisma/schema.prisma`, `prisma/migrations/20261013180000_executive_customer_count_indexes/` | the two additive indexes |
| `src/app/[locale]/dashboard/executive/page.tsx`, `src/app/api/executive/summary/route.ts` | read through the cache, after the gate |
| `src/components/executive/ExecutiveSummaryView.tsx` | shows the computation timestamp and the stale state |
| `src/lib/customers/service.ts` | invalidate after a committed write |
| `messages/{fa,en,de}.json` | `executive.computation.{live,cached,cachedStale}` |

---

## 7. Validation executed

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors** |
| `npm run lint` | **exit 0**, no warnings |
| `npm test` (whole repository) | **13,897 passed, 9 failed, 152 skipped** of 14,058 — see below |
| `vitest src/lib/executive/__tests__/cache.test.ts` | **19 passed** |
| `vitest src/app/api/executive/__tests__/summary-route-isolation.test.ts` | **23 passed** (two new: the additive `cache` field and the no-cached-outage case) |
| `vitest src/lib/executive/__tests__/summary.test.ts` | **40 passed** (two new: the deterministic statement count) |
| `vitest src/i18n` | **638 passed** after the German total moved 8660 → **8663** |
| `vitest prisma/__tests__/phase102-migration-safety.test.ts` | **83 passed** after declaring the new migration in both sanctioned lists |
| `prisma validate` | schema valid |
| `npm run perf:executive` | the figures in §3 and §4 |

**About those 9 failures.** One was real and mine: the Phase 102 migration gate
expected 15 sanctioned migrations and found 16, because the new index migration
was not declared. It is now declared in **both** places that pin the list — the
vitest gate and `scripts/ci/phase102-applied-migration-check.mjs` — and that
suite is green.

The other **eight were all `Test timed out in 60000ms`** on gates that walk the
whole repository (`phase99-static-invariants`, `format-migration`,
`phase104-signature-contract`, `model-registry.static`,
`phase102-rate-limit-registry`, `phase100-closure-eval`,
`phase997-release-safety`, `phase109c2-static-safety`). Re-run on their own,
with the machine not also running a PostgreSQL benchmark: **8 files, 278 tests,
0 failures.** They are the known worker-timeout-under-load pattern, not
defects — and the two that would plausibly have been *caused* by this change
(the SQL-injection gate, which sees the harness's `$queryRawUnsafe`, and the
formatter-hygiene gate) are among the ones that pass.

`prisma format` was deliberately NOT run: it reformats all ~8,870 lines of the
schema and converts the file to LF, which would have buried an 8-line change in
a 2,886-line diff. `prisma validate` was run instead.

---

## 8. What is still open on row 11

* **A production measurement.** Nothing here is one.
* **The cache measured under concurrency**, which is the case it exists for and
  which a single-threaded harness cannot show.
* **Redis in the loop**: the invalidation path with `REDIS_URL` set has not been
  exercised against a real Redis, only the per-process fallback.
* The two remaining full-table counts, if a tenant's customer count grows by
  another order of magnitude. The next lever there is a maintained counter, not
  an index.
