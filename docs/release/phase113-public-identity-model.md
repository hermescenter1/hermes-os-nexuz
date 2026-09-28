# Phase 113 — Public Identity and Entity Model

**Baseline:** `837deb5c`
**Single source of truth:** `src/lib/seo/config.ts`

---

## 1 · The model

```
ZHARFA Vira Pouyesh Fanavari          ← COMPANY  (operator / developer)
ژرفا ویرا پویش فناوری                  ← the same company, Persian
        │
        │  creator · publisher · provider
        ▼
Hermes OS                              ← PRODUCT (industrial intelligence platform)
        │
        ├── Hermes Brain             → Industrial Knowledge Engine
        ├── Hermes Industrial Brain  → alarm / signal / fault analysis
        └── Hermes Engineering Copilot
```

| Role | Value | Constant |
|---|---|---|
| Company, legal/public name | `ZHARFA Vira Pouyesh Fanavari` | `ORG_NAME` |
| Company, short brand | `ZHARFA` | `ORG_SHORT_NAME` |
| Product | `Hermes OS` | `SITE_NAME` |
| Product category | `Enterprise Industrial Intelligence Platform` | `PRODUCT_CATEGORY` |
| Canonical host | `https://hermesnovin.com` (**apex**, not `www`) | `BASE_URL` |
| Public contact | `info@hermesnovin.com` | `CONTACT_EMAIL` |
| Founder | `Hamid Reza Forozandeh` | `FOUNDER_NAME` |

**Retired, published nowhere:** `Hermes Novin Mehr IRIC`, `Hermes Novin Mehr`,
`Hermes Novin`, and their Persian forms.

A retired legal name is deliberately **not** kept as an `alternateName`. It is
not a name the current company trades under, and publishing it would keep
merging the old entity into the new one in every retrieval system that reads
this graph.

---

## 2 · JSON-LD entity graph, as emitted

One `@graph` per page, four nodes, stable locale-independent `@id` values.

```
https://hermesnovin.com/#organization
  ├─ @type: Organization
  ├─ name:          "ZHARFA Vira Pouyesh Fanavari"
  ├─ legalName:     "ZHARFA Vira Pouyesh Fanavari"
  ├─ alternateName: ["ZHARFA"]            ← the PRODUCT name was removed
  ├─ url:           https://hermesnovin.com
  ├─ knowsAbout:    [17 verified technical domains]
  ├─ founder:       → #founder
  ├─ contactPoint:  { email, availableLanguage: [Persian, English, German] }
  ├─ sameAs:        OMITTED                ← nothing verified to publish
  └─ logo:          OMITTED                ← a favicon is not a corporate logo

https://hermesnovin.com/#hermes-os
  ├─ @type: SoftwareApplication
  ├─ name: "Hermes OS"
  ├─ applicationCategory: BusinessApplication
  ├─ applicationSubCategory: Enterprise Industrial Intelligence Platform
  ├─ description: "… developed by ZHARFA Vira Pouyesh Fanavari …"
  ├─ creator   → #organization
  ├─ publisher → #organization
  ├─ provider  → #organization
  ├─ sameAs: ["https://www.provenexpert.com/hermes-os/"]   ← moved here
  └─ offers / aggregateRating / review: ABSENT

https://hermesnovin.com/#website
  ├─ @type: WebSite
  ├─ name: "Hermes OS"
  ├─ publisher → #organization
  ├─ inLanguage: [fa-IR, en-US, de-DE]
  └─ potentialAction: SearchAction → /fa/library?q={search_term_string}

https://hermesnovin.com/#founder
  ├─ @type: Person
  ├─ name: "Hamid Reza Forozandeh"
  ├─ jobTitle: "Founder, CEO & Chief Industrial Systems Architect"
  ├─ worksFor → #organization
  └─ sameAs: ["https://www.linkedin.com/in/hamid-reza-forozandeh"]
```

### Invariants held by tests

| Invariant | Where asserted |
|---|---|
| `ORG_NAME` is ZHARFA; `SITE_NAME` is Hermes OS | `phase113-public-identity.test.ts`, `entity-graph.test.ts` |
| Neither name contains the other | `phase113-public-identity.test.ts` |
| `Organization.alternateName` excludes the product name | both suites + the audit script |
| Exactly **one** `Organization` node in the whole graph | `phase113-public-identity.test.ts` |
| `creator`/`publisher`/`provider` are `@id`-only references | `phase113-public-identity.test.ts` |
| Every referenced `@id` is defined in the graph | `entity-graph.test.ts` (pre-existing) |
| Retired identity absent from 8 public surfaces + 3 catalogs + the graph | `phase113-public-identity.test.ts` + the audit script |
| Exact Organization key set (no unreviewed property) | `schema-locales.test.ts` |

---

## 3 · `sameAs` — why the company's list is empty

`sameAs` is an identity claim: it asserts that a URL **is** the entity. Two URLs
previously sat on the Organization and neither survives that test.

| URL | Previously | Now | Why |
|---|---|---|---|
| `https://www.provenexpert.com/hermes-os/` | `Organization.sameAs` | `SoftwareApplication.sameAs` | It is a review profile of the **product**. Asserting it as the company's identity merged product and company |
| `https://github.com/hermescenter1` | `Organization.sameAs` | **removed entirely** | Code hosting is not a corporate identity, and nothing in this repository proves the account is operated as ZHARFA's official presence |

The property is **omitted**, not emitted as `sameAs: []` — an empty array is
still a published claim shape, and `sameAs` is optional on `Organization`.

Publishing the ProvenExpert profile's **existence** is not publishing its
contents: no rating, review count or score appears anywhere in the graph, and
`aggregateRating` / `review` remain absent.

> **OPERATOR ACTION** — supply verified ZHARFA corporate profile URLs (LinkedIn
> or equivalent) to populate `ORG_SAME_AS` in `src/lib/seo/config.ts`. Nothing is
> added on the strength of "the name is probably taken by us".

---

## 4 · Claims this phase deliberately does NOT make

| Not claimed | Why |
|---|---|
| eNAMAD is registered to ZHARFA | The registrant of eNAMAD id 761266 is not evidenced in this repository. The seal's accessible name is product-neutral (`Hermes OS`) and names no company. Naming a company in a trust seal's accessible name is a legal claim about who is certified |
| A corporate logo | `Organization.logo` stays omitted. A favicon is a browser tab icon, and the constant was deleted (not merely unused) so no builder can reintroduce it |
| A price, offer, rating or review for Hermes OS | Commercial terms are negotiated per deployment; no authoritative public price exists |
| An X/Twitter account | None is verified, so `twitter:site` / `twitter:creator` stay omitted |
| A ZHARFA social profile | None is verified. An empty list beats a false entity merge |
| A certification or award | None is evidenced |

---

## 5 · Where identity is rendered

| Surface | Mechanism | Locales |
|---|---|---|
| JSON-LD `@graph` | `siteEntityGraph()` from `ORG_NAME` | locale-independent by design |
| HTML `authors` / `creator` / `publisher` | `src/app/[locale]/layout.tsx`, from `ORG_NAME` | all |
| Public footer copyright | `publicSite.footer.copyright` | en / fa (Persian digits and script) / de |
| Legacy shell footer copyright | `footer.copyright` | en / fa / de |
| About page | `about.eyebrow`, `about.companyTitle` | en / fa / de |
| Careers ecosystem card | `publicSite.ecosystem.cards.careers.desc` | en / fa / de |
| `llms.txt` | `${ORG_NAME}` interpolation | one document, all locales listed |
| Cookie Policy "responsible company" | `ORG_NAME` imported by the page | en / fa / de |
| Journal author byline | `content/journal/author.json` → `company` | content manifest |

### The `publisher` correction

`layout.tsx` previously set the HTML `publisher` to `SITE_NAME` — the product —
while the JSON-LD on the same page set `WebSite.publisher` to the organisation.
The page therefore contradicted itself about who publishes it. Both now resolve
to the company.

---

## 6 · Historical records left intact

Delivered phase reports are evidence of what was shipped, so they are **not**
rewritten:

* `docs/seo/phase105-final-report.md`
* `docs/i18n/german-glossary.md`
* `docs/release/german-authenticated-browser-matrix.md`

`docs/AI_DISCOVERABILITY.md` is the one exception: it is the *living*
architecture description, so it carries a dated Phase 113 amendment and its
identity tables are corrected in place.

Fixture and test data that legitimately names something other than the current
platform operator is also untouched — see section 4b of the pre-implementation
audit for the file-by-file justification.

---

## 7 · Owner evidence update — ZHARFA corporate URL (2026-09-28)

**Blocker status: `BLOCKED` → `RESOLVED_BY_OWNER_EVIDENCE`.**
**Source: explicit owner confirmation, 2026-09-28.** Value supplied by the owner:
`https://www.zharfavira.com`.

### What was verified before anything changed

The supplied value is the `www` alias, not the canonical. Measured with `curl`:

```
https://www.zharfavira.com  -> 301 Moved Permanently -> https://zharfavira.com/
                            -> 307 Temporary Redirect -> /fa
                            -> 200

https://zharfavira.com      -> 307 Temporary Redirect -> /fa
                            -> 200
```

* `www` is a **permanent (301)** redirect to the apex → the **apex is the canonical host**.
* `/fa` is a **307** locale redirect — the same next-intl pattern this site uses. It
  selects a language; it is not a canonical identity.

The site's own published metadata confirms the split:

| Signal on zharfavira.com | Value |
|---|---|
| `<link rel="canonical">` (home page) | `https://zharfavira.com/fa` |
| `og:url` | `https://zharfavira.com/fa` |
| **`Organization.url` in its own JSON-LD** | **`https://zharfavira.com`** |

So the company itself declares its **entity** URL as the apex root while its
**page** canonical is the locale variant. Hermes therefore adopts:

```
ORG_URL = "https://zharfavira.com"      // apex, no www, no locale, no trailing slash
```

### What changed in the graph

| Property | Before | After |
|---|---|---|
| `Organization.url` | `https://hermesnovin.com` (the **product** site) | `https://zharfavira.com` |
| `JobPosting.hiringOrganization` | `sameAs: BASE_URL` | `url: ORG_URL` — right property, right value |
| `Course.provider` (default) | `sameAs: BASE_URL` | `url: ORG_URL` |
| `Vendor.memberOf` | `url: BASE_URL` | `url: ORG_URL` |
| `Organization.sameAs` | omitted | **still omitted** |
| `WebSite.url`, `SoftwareApplication.url` | `BASE_URL` | **unchanged** — the site and the product really do live at `hermesnovin.com` |

The previous state actively asserted that the organisation *is* the Hermes OS
domain. It no longer does.

### `sameAs` stays empty — on purpose

Per the owner's instruction: an organisation's own principal website belongs in
`url`. `sameAs` is for **other** verified external identities (an official
LinkedIn page, for example). Publishing the corporate site in both would claim
that the company and its website are two identities to be merged — the same class
of sloppy claim this phase removed when it took the ProvenExpert profile and the
GitHub account out. `ORG_SAME_AS` remains `[]` and the property remains omitted
until a second verified corporate profile URL is supplied.

### `@id` was deliberately NOT moved to the ZHARFA domain

The owner allowed this *if needed* (`در صورت نیاز`). It was judged **not** needed,
and actively risky:

* `ORG_ID` is documented in `config.ts` as part of the published contract;
* ZHARFA's own Organization node uses `name: "ZHARFA"` and
  `legalName: "شرکت ژرفا ویرا پویش فناوری"`, whereas Hermes must keep
  `ORG_NAME = "ZHARFA Vira Pouyesh Fanavari"` because that string is also visible
  copy in the footer, the About page and the Cookie Policy. Adopting the same
  `@id` while publishing a different `name` would define **one** entity **two
  different ways** across two sites — worse than two ids;
* `url` is already the property crawlers reconcile on, and both sites now publish
  the identical value.

### Two duplicate-entity findings this evidence exposes

Reading ZHARFA's published JSON-LD surfaced a genuine cross-site problem that
**cannot be fixed from this repository alone**:

| # | Finding | Detail |
|---|---|---|
| D-1 | **Two `Organization` nodes for one company** | `hermesnovin.com/#organization` (here) and `zharfavira.com/#organization` (there). Both now agree on `url`, which is the reconciliation signal, but they remain two ids |
| D-2 | **Two `SoftwareApplication` nodes for one product** | `hermesnovin.com/#hermes-os` (here) and **`zharfavira.com/#hermes-os`** (there, `url: https://zharfavira.com/fa/hermes-os`, `name: "HERMES OS"`). A retrieval system can see two Hermes OS products |

**Owner decision required for D-2:** which site is the product's canonical home?
The defensible answer is `hermesnovin.com`, because that is where Hermes OS
actually runs — in which case the one-line fix belongs on the **ZHARFA** side:
point its `SoftwareApplication` at `@id: "https://hermesnovin.com/#hermes-os"`
(and optionally `sameAs` its own portfolio page) rather than minting a second
identifier. Nothing was changed here on the strength of an assumption.

### Public attribution link

`PublicFooter` now carries a publisher-attribution link to `ORG_URL` in the
closure row, beside the copyright line that already names the company:

* visible text is `ORG_NAME` from `lib/seo/config` — a proper noun, so not a
  catalog leaf, exactly as the product name and the policy version are not;
* the accessible name **is** localized —
  `publicSite.footer.companyWebsiteAria`, one new leaf, with the company passed
  as an ICU `{company}` argument so all three locales differ genuinely;
* `target="_blank"` with `rel="noopener noreferrer"`;
* deliberately **not** added to `nav.ts`. Listing the company's website among the
  product's own destinations would read as though ZHARFA were another Hermes
  capability. Attribution is not navigation.

### The eNAMAD blocker is UNCHANGED

**Still `BLOCKED — missing evidence.`** A corporate website does not prove who
holds eNAMAD registration `id=761266`. The seal's accessible name stays
product-neutral (`eNAMAD Electronic Trust Seal — Hermes OS`) until the registrant
is confirmed in writing.
