# Executive Management Center — what an owner saw in production, 2026-10-14

Four observations from an authenticated browser session on the live site, after
`84437c3c` was deployed. Two are defects in this centre and are closed here
with tests. One is a naming and navigation problem, still open. One is correct
behaviour that was being *described* wrongly, and the description is what
changed.

**No historical report was altered.** Both code fixes are to derivation and to
copy. The stored snapshot of 2026-10-13 is unchanged, because what it recorded
was true; see §4.

---

## 1. `/fa/admin` is still the audit console — OPEN

**Observed.** `/fa/admin` remains the platform audit console. The management
centre built in this season lives at `/fa/dashboard/executive`. Nothing in the
older console points to it, so an authorized reader has no way to discover it
except by being told the URL.

**Why it is a real problem and not cosmetic.** Two surfaces now answer to the
word "admin" in a reader's head, and the one they reach first is not the one
this season built. A management centre nobody can navigate to is, from the
owner's seat, indistinguishable from one that does not exist.

**Not yet done**, and deliberately not bundled into the current branch: it
touches the audit console's own layout and the navigation model, which are
outside the executive slices. To be done as its own change:

* a link from the audit console to `/dashboard/executive`, shown **only** to
  readers the executive gate would admit — so the link does not advertise a
  surface that will refuse them;
* names in the catalogue that distinguish the two surfaces in all three
  languages, rather than both reading as "administration";
* the nav entry audited for which roles see it, against the matrix in
  `authority-matrix.test.ts`.

---

## 2. Everything reads EMPTY, and the plants are refused — EXPLAINED, NOT A DEFECT

**Observed.** For the owner's own account, operations, project financials and
customers all render EMPTY, and the plants section says no site is granted.

**Cause, from the data and the real authorization path** — five gates, of which
the role matrix is only the third:

| Gate | What it checks | For this account |
| --- | --- | --- |
| 1 | authenticated | passed |
| 2 | platform capability `admin` (`user.role`, a DIFFERENT role system from organization membership) | passed, or the page would answer FORBIDDEN |
| 3 | ACTIVE membership of the selected organization, giving an `OrganizationRole` | passed |
| 4 | the four axes from that role: `view_erp`, `view_erp_compensation`, `view_industrial`, `view_customers` | admitted — the sections render rather than refuse |
| 5 | **site grants**, from `getAllowedSiteIds(userId, organizationId)` — a separate table that **no role implies** | **empty**, so the industrial section fails closed with `noSites` |

So the plants message is not a bug: it is gate 5 answering honestly. And the
EMPTY sections are not a permission problem at all — EMPTY means *admitted and
asked, and the organization has no such records yet*. Production has zero
customers (`Party` = 0 rows, confirmed 2026-10-14) and no ERP work in this
organization, which is exactly what EMPTY reports.

**What was NOT done, on purpose.** No site was assigned to any account and no
permission was widened. A job title is not a permission: the centre shows the
plants section when the account's **organization role** holds `view_industrial`
**and** the account has a site grant. Changing either is a policy decision for
the owner, recorded in the approved role and grant model — not something to be
quietly arranged so a screen looks fuller.

---

## 3. A frozen report said "Live" — FIXED

**Observed.** The 2026-10-13 report opens with `CALC_VERSION=exec-report-2` and
a data cutoff from the previous day, and its decisions panel carried the badge
**"Live"**.

**Cause.** Every status badge renders `status.<STATUS>`, and
`executive.status.OPERATIONAL` is the word "Live". True on the live screen,
false in the archive — the figures are a snapshot of a finished day.

**Fix.** `statusLabelKey(status, frozen)` in `src/lib/executive/status-label.ts`
— pure, so it is tested without a DOM — returns `status.OPERATIONAL_RECORDED`
("Recorded" / «ثبت‌شده» / "Erfasst") for an OPERATIONAL section of a frozen
report. All five badge sites go through it, so none can be missed. Only
OPERATIONAL is distinguished: the other four statuses describe the ANSWER, and
an answer does not become a different answer by being recorded.

**Tests** (`status-label.test.ts`, 10 cases) assert the rule, that every key it
can return resolves in all three languages, and that the recorded word is not
byte-identical to the live word in any of them — otherwise a translator
copying "Live" across would restore the defect with the suite still green.

---

## 4. "1 section did not answer" for a section that was never asked — FIXED

**Observed.** The archive row for 2026-10-13 read *"1 section did not answer"*,
while inside the report the plants section said no site is granted.

**Cause.** `coverageIsComplete` was `every(OPERATIONAL || EMPTY)`. Four
different outcomes collapsed into "did not answer", so a permission boundary
was reported as a system failure — and when a source really does fail, the line
said the same thing, which is the one job it has.

**Fix.** `coverageVerdict` classifies three ways:

| Part | Statuses | Meaning |
| --- | --- | --- |
| `answered` | OPERATIONAL, EMPTY | asked, and replied |
| `notAsked` | FORBIDDEN, NO_SOURCE | by policy, by grant, or no such source exists |
| `failed` | UNAVAILABLE | asked, and could not be read |

A report is complete when **nothing failed**. A `notAsked` section does not make
a night partial — a report cannot be more complete than the reader's own access
— but it is counted and shown, so "nothing to report" is never confused with
"nothing you may see". The wrong sentence `reports.coveragePartial` was
**replaced**, not left beside the new ones: a wrong sentence kept in the
catalogue is a wrong sentence waiting to be reused.

**Tests** (`coverage-verdict.test.ts`, 7 cases) include the production
report's exact coverage shape, a mixed case where a refusal and an outage occur
together and must not be added up, and one case that locks the shape of the old
defect so reinstating `every(OPERATIONAL || EMPTY)` fails.

### Why no corrective report version was issued

The stored snapshot recorded `industrial: FORBIDDEN` with reason `noSites`.
**That was true of that night**, and it is what the night's evidence should say
for ever. The defect was in deriving "did not answer" from it and in the
sentence shown. Correcting a renderer is not a licence to rewrite history, and
nothing here needed the data changed — so the original stands, untouched, and
the archive now describes it correctly.
