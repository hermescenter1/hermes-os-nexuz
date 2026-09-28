# Phase 113-A — Cookie Policy Visual System

**Scope:** the presentation of `/{locale}/cookies` only.
**Legal content and consent logic:** unchanged (see §6).
**Implementation:** `src/app/globals.css`, appended block, every rule nested under `.hz-legal`.
**Contract test:** `src/app/[locale]/cookies/__tests__/phase113a-editorial-design.test.ts` — 24 assertions.

---

## 1 · What was rejected, and why

The first Phase 113 implementation was correct on content and wrong on design.

| Rejected trait | What it actually looked like |
|---|---|
| Capsule geometry | `rounded-lg` (8px) on every card, `rounded-xl`/`rounded-2xl` (12/16px) on the consent dialog, large pill-shaped buttons |
| Bubble stacking | Each of the four categories and each of the three third parties sat in its own filled, bordered, rounded panel — a dozen separate boxes holding one legal instrument |
| Dashboard idiom | Filled surface cards, badge chips, a heading-per-card rhythm: the visual language of a SaaS admin screen |
| No document structure | Nine sections with no numbering, no index, and no reading-width limit |

A cookie policy is a legal instrument. It should read like one.

---

## 2 · Provenance of the visual decisions

**Nothing here is invented, and nothing is claimed as "exactly ZHARFA".**

The palette, the corner ceiling and the contrast law were read **read-only** from
the owner's own private corporate repository, which this account has access to:

```
gh api repos/hermescenter1/zharfa-corporate/contents/src/styles/tokens.css
gh api repos/hermescenter1/zharfa-corporate/contents/src/styles/semantic.css
```

### Values taken (verbatim, as measurable facts)

| Token | Value |
|---|---|
| forest-950 / 900 / 800 | `#061813` / `#08221a` / `#0b3025` |
| brand green | `#0b5d46` |
| signal green | `#46d79a` |
| ice / white | `#f7faf8` / `#ffffff` |
| mist-100 / mist-300 | `#e7efeb` / `#cbd9d2` |
| graphite | `#15221d` |
| radius button / card / panel | `3px` / `5px` / `8px` |
| motion micro / structural | `200ms` / `520ms`, `cubic-bezier(0.22, 0.61, 0.36, 1)` |

### The corner law, quoted

> "Architectural, not SaaS. Nothing in the system exceeds 8px."

That single sentence is the direct answer to the owner's objection, and it is a
measurable rule rather than a matter of taste — so the contract test enforces it.

### The contrast law, quoted with its measurements

```
#46D79A on #FFFFFF = 1.83:1  -> fails WCAG AA, never used for text
#46D79A on #061813 = 9.97:1  -> the dark-surface accent
#0B5D46 on #FFFFFF = 7.87:1  -> the light-surface accent
```

This is why the accent is not one colour. The document sheet is a **light**
surface, so every accent on it is Brand Green `#0b5d46` (7.87:1). Signal Green
appears in exactly two places — the masthead eyebrow and the 2px rule closing
the masthead — both on `#061813`, where it measures 9.97:1. The test asserts that
the document body never colours text with Signal Green.

### What was deliberately NOT carried over

| Not taken | Why |
|---|---|
| ZHARFA logo, wordmark, seal | Trademark. Hermes OS keeps the Hermes mark |
| ZHARFA components, layouts, section templates | This is a Hermes page, not a port of another site |
| ZHARFA copy, photography, illustration | Not ours to reuse, and not needed |
| ZHARFA's global token names | Ours are `--hz-*`, scoped to `.hz-legal`; no global token was added, renamed or changed |
| ZHARFA typefaces | The page keeps the Hermes font stack (Estedad / Vazirmatn / Inter) so Persian and German render in the faces the rest of the estate already loads |

**Hermes OS did not become ZHARFA's website.** The page keeps the Hermes public
header, the Hermes public footer, the Hermes shell and the Hermes fonts. What
crossed over is a colour scale, a corner limit and a contrast law — the
measurable part of a design system.

---

## 3 · The design

### Masthead — no oval container

A full-bleed forest plate closed by a 2px Signal rule, carrying exactly what the
brief asked for: title, short description, last-updated stamp, and the control
that opens cookie preferences. The version and effective date sit in a
`<dl>` on a hairline-separated baseline row with the control, wrapping at narrow
widths rather than being clipped.

### Body — an editorial grid

| Viewport | Layout |
|---|---|
| < 1024px | single column; the contents list is a native `<details>` disclosure |
| ≥ 1024px | `minmax(13rem,15rem)` index column + reading column, `align-items: start`, index `position: sticky` at `top: 5.5rem` (clears the sticky public header), capped at `calc(100vh - 8rem)` with its own scroll |

The reading column is capped at `68ch` — a measured legal-reading width, not a
viewport fraction.

### Contents list

One `<nav aria-labelledby>` landmark wrapping a `<details>`. On mobile it is a
compact disclosure; above 1024px it is pinned open and its chevron is hidden. It
is native HTML, so keyboard operation, screen-reader semantics and the open/close
announcement all come for free — no ARIA to get wrong, no JavaScript.

Both the index and the document body render from **one** `SECTIONS` array, so a
section cannot be listed without existing or exist without being listed. The test
asserts `SECTIONS.map(` appears exactly twice.

### Sections — dividers, not bubbles

Fourteen sections. Each has a two-digit ordinal (`01`–`14`, `aria-hidden` because
it is decoration over a real heading) in a fixed 2.75rem column, a heading, and a
hairline top rule supplied by `.hz-section + .hz-section`. The test asserts
`.hz-section` declares **no** background, **no** border-radius and **no**
box-shadow — the card look cannot come back by accident.

The four consent categories became sections 03–06, each headed by the **same
label the consent dialog renders**, so the policy and the dialog cannot name a
category differently. The umbrella `categories.heading` leaf was deleted rather
than left orphaned.

### Inventory table

| Viewport | Representation |
|---|---|
| ≥ 768px | a real `<table>`: ruled `thead` on a sunken surface, `scope="col"`/`scope="row"`, `<caption>` |
| < 768px | the same markup re-flows: `thead` is hidden accessibly (`clip-path: inset(50%)`, not `display:none`), and each cell prints its own label from `data-label` |
| ≤ 360px | the label column is dropped entirely so a 320px screen still has a usable value column |

**No horizontal scroll container exists anywhere in the block** — the test
asserts `overflow-x: auto|scroll` is absent. The destructive-overflow failure
mode is designed out, not scrolled around.

Columns: identifier (+ medium), purpose, retention, **who sets it**, scope. The
third-party table adds the consent gate and states retention as
*provider-defined* — because we genuinely do not know Google's or Microsoft's
cookie lifetimes, and inventing them would be the same class of defect this phase
exists to fix.

Every value still comes from `lib/compliance/cookie-inventory`. The test asserts
no cookie name is hard-coded in the page, and that the first-party "who sets it"
column renders `SITE_NAME` from `lib/seo/config` rather than a per-row literal.

### Controls

| Property | Value |
|---|---|
| radius | `3px` (`--hz-radius-button`) |
| target | `min-height: 44px` on buttons and on the disclosure summary |
| focus | `outline: 2px solid` + `outline-offset: 2px`, Brand Green on the sheet, Signal Green on the masthead |
| motion | 200ms colour transitions only; no transform, no bounce |
| reduced motion | `prefers-reduced-motion: reduce` collapses every duration to 0.01ms |
| forced colors | `forced-colors: active` re-asserts `CanvasText` borders and `LinkText`, because hairlines are the entire structure here |

The **one** permitted capsule is `.hz-chip`, the always-active / opt-in status
marker at `0.625rem`. The test asserts exactly one selector in the block uses
`border-radius: 999px`, that it is `.hz-chip`, and that its font-size is
≤ 0.7rem — so nobody can promote a button to a pill by reusing the class.

### The consent dialog

Brought under the same ceiling: container `rounded-xl`/`rounded-2xl` → `rounded-sm`
(6px), five `rounded-lg` (8px) → `rounded-xs` (4px). The toggle track and knob
keep `rounded-full` — a switch whose shape carries its meaning — and the test
pins that at exactly two occurrences so no third capsule creeps in.

---

## 4 · RTL

No mirrored stylesheet and no `dir`-prefixed rules. Every directional property is
logical: `border-block-start/end`, `padding-inline`, `margin-block-start`,
`border-inline-end`, `text-align: start`. The test asserts the block contains
**no** `text-align: left|right`, `border-left|right`, `padding-left|right` or
`margin-left|right`.

Two deliberate LTR islands inside the Persian document: `.hz-code` (cookie
identifiers) carries `direction: ltr; unicode-bidi: isolate` so `hermes_at` does
not reorder around its underscore, and the mailto links carry `dir="ltr"`.

---

## 5 · Breakpoint reasoning

| Width | What the layout does |
|---|---|
| 320 | single column; table labels dropped (`≤360`); masthead padding at its `clamp()` floor; no horizontal scroll |
| 375 | single column; labelled stacked table rows |
| 768 | real table appears; `hz-facts` two-column definition rows |
| 1024 | index column + sticky behaviour engage |
| 1440 | sheet capped at `86rem`; reading column still `68ch`, so line length does not grow with the viewport |
| 1920 | unchanged from 1440 — the cap is the point |

Long German is handled structurally rather than by hoping: `.hz-title` and
section headings carry `overflow-wrap: break-word` + `hyphens: auto`, `hz-facts`
values carry `overflow-wrap: anywhere`, `.hz-code` breaks anywhere, and every
horizontal rhythm is a `clamp()` rather than a fixed padding.

---

## 6 · What the redesign did NOT change

* **No legal statement was altered.** Every sentence is the same catalog leaf.
* **No consent behaviour was touched.** The reopen event, the stored-consent
  seeding, `normalizePrefs`, the save path and the endpoint headers are exactly
  as reviewed.
* **No cookie, retention period or consent gate changed.** The inventory module is
  byte-identical apart from nothing — it was not edited in 113-A.
* **`LegalPageShell` was restored to its baseline.** The two optional label props
  added in the first implementation became unused once this page stopped using the
  shared shell, so they were removed rather than shipped as dead code. `/privacy`,
  `/terms`, `/gdpr` and `/data-request` are byte-identical to `837deb5c`.
* **No global token, design-system primitive or other route was modified.** The
  CSS is additive and every rule is nested under `.hz-legal`.

### Catalog delta

| | |
|---|---|
| Added | `toc.heading`, `toc.mobileLabel`, `updates.heading`, `updates.body`, `table.colCategory`, `table.colProvider`, `storage.retentionProviderDefined` (+7) |
| Deleted | `categories.heading` (−1) — its section no longer exists |
| Not added | a provider label leaf: first-party storage is set by `SITE_NAME`, read from code, because a product name is not translatable copy |
| Net | 7980 → **7986**, measured; `cookiePolicy` = **76 leaves with zero orphans** |

---

## 7 · Still needs human review

This document records design and engineering decisions. It is **not** a legal sign-off.

| Needs a human | Why |
|---|---|
| The German and Persian legal wording | Translated to be accurate and natural, but a cookie policy is a legal text in three jurisdictions. A lawyer should read all three, not just the English |
| `updates.body` (section 13) | It states that material changes to the optional categories bring a fresh consent request. That is a **commitment**, and the owner must confirm they intend it — the code does not enforce it today (see the consent-version note in `phase113-cookie-governance.md`) |
| The retention figures as legal statements | Each is the value the code sets. Whether those lifetimes are themselves defensible under the applicable regime is a legal question, not a code question |
| `contact.generalEmail` reassignment | See `phase113-ai-media-route-audit.md` §5 and the validation report: general enquiries now point at the canonical `info@hermesnovin.com` |
| Whether a light document sheet inside the dark Hermes shell is on-brand | A judgement call. It is the most legible option for fourteen sections of legal text and it is what moves the page away from the dashboard idiom, but it is the one decision here that is aesthetic rather than measurable |

---

## 8 · Status: VISUAL IMPLEMENTATION COMPLETE — not visual acceptance

**`VISUAL_IMPLEMENTATION_COMPLETE`** · **`VISUAL_ACCEPTANCE_NOT_RUN`**

The distinction is deliberate. What is proved:

* the page renders — the production build statically generated `/fa/cookies`,
  `/en/cookies` and `/de/cookies` (a missing catalog key raises `MISSING_MESSAGE`
  and fails the build);
* 24 structural assertions hold on the real CSS and the real page source;
* the ICU retention strings render correctly per locale.

What is **not** proved: how it looks. No browser screenshot was taken — `next dev`
needed 796 s merely to reach "Ready" on this machine, the first-request compile of
the route did not finish inside a 300 s budget, and the in-app browser pane could
not reach `localhost`. That is recorded as `NOT_RUN`, never as a pass.

No further aesthetic change has been made since. Per the review instruction, the
next visual edit requires a **measurable defect** from the checklist below, not a
preference.

### Human visual review checklist

Open each URL at each width and mark every row. A row that fails is a defect;
a row that merely differs from expectation is a preference and needs an owner
decision before anything changes.

**URLs:** `/fa/cookies` (RTL) · `/en/cookies` (LTR) · `/de/cookies` (LTR, longest words)
**Widths:** **375** (phone) · **1024** (index column engages) · **1440** (sheet cap)

| # | Check | 375 | 1024 | 1440 | Notes |
|---|---|---|---|---|---|
| 1 | **No horizontal page scroll** at any width, in any locale | ☐ | ☐ | ☐ | the most likely real defect |
| 2 | **Masthead**: title, lede, version + effective date, and one control all readable; nothing clipped | ☐ | ☐ | ☐ | German title is the stress case |
| 3 | **No capsule/pill** on any card, button, badge or container — only the tiny always-active / opt-in chip | ☐ | ☐ | ☐ | the original rejection |
| 4 | **Sections read as a document**: numbered, separated by hairlines, no filled boxes | ☐ | ☐ | ☐ | |
| 5 | **Contents index**: a compact `<details>` at 375; a sticky margin column at 1024/1440 that does not overlap the header or the footer while scrolling | ☐ | ☐ | ☐ | |
| 6 | **Index links jump** to the right section and the heading is not hidden under the sticky header | ☐ | ☐ | ☐ | |
| 7 | **Table at 375**: stacked rows, each value preceded by its own label, nothing cut off, no inner scrollbar | ☐ | — | — | |
| 8 | **Table at 1024/1440**: a real ruled table, all five columns legible, no column squeezed to one character per line | — | ☐ | ☐ | |
| 9 | **Cookie identifiers** (`hermes_at`, `NEXT_LOCALE`, …) stay left-to-right and unbroken inside the Persian page | ☐ | ☐ | ☐ | underscore must not jump |
| 10 | **Persian is genuinely RTL**: text, the index, the table and the definition rows all flow right-to-left; the ordinal sits on the correct side | ☐ | ☐ | ☐ | |
| 11 | **German does not break the layout**: long compounds wrap or hyphenate, never overflow | ☐ | ☐ | ☐ | |
| 12 | **Reading line length** is comfortable at 1440 — the column does not stretch with the viewport | — | — | ☐ | |
| 13 | **Focus ring** is clearly visible on every link, button and the index summary, on both the dark masthead and the light sheet | ☐ | ☐ | ☐ | tab through the whole page |
| 14 | **Keyboard only**: the index opens/closes with Enter or Space, every section is reachable, and "Manage cookie preferences" opens the dialog | ☐ | ☐ | ☐ | |
| 15 | **Contrast** is comfortable for body text, the muted notes and the accent green | ☐ | ☐ | ☐ | |
| 16 | **Control size**: both "Manage cookie preferences" buttons are easy to hit — at least a fingertip at 375 | ☐ | — | — | |
| 17 | **Reopened consent dialog** shows the stored choice, is not capsule-shaped, and sits above the page correctly | ☐ | ☐ | ☐ | |
| 18 | **The page still feels like Hermes** — the public header and footer are unchanged and frame it | ☐ | ☐ | ☐ | the one aesthetic judgement |

Rows 1, 7, 8, 9, 11, 13, 14 and 16 are **measurable**: a failure there is a defect
and will be fixed. Rows 12, 15 and 18 are judgement calls and need an owner
decision, not a unilateral change.
