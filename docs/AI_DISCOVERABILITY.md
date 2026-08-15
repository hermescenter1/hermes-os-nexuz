# AI Discoverability & Entity Authority — Phase 105

## Overview

This document describes the implemented architecture for making Hermes Novin Mehr IRIC and Hermes OS maximally discoverable, disambiguated and citable by standards-compliant search engines and AI-assisted retrieval systems.

**Critical disclaimer:** These implementations improve technical discoverability. They do NOT guarantee recognition, inclusion, ranking or citation by any external AI system, search index or retrieval platform. External systems control their own crawl, indexing and ranking policies independent of any on-site signals. This documentation describes what we control (our public website architecture), not what we can guarantee about external behavior.

## Canonical Entity Identity

### Company

| Property | Value |
|---|---|
| **Legal Name** | Hermes Novin Mehr IRIC |
| **Short Brand** | Hermes Novin |
| **Official Domain** | `https://hermesnovin.com` (APEX, not www) |
| **Contact Email** | `info@hermesnovin.com` |

### Product

| Property | Value |
|---|---|
| **Name** | Hermes OS |
| **Category** | Enterprise Industrial Intelligence Platform |
| **Developer** | Hermes Novin Mehr IRIC |
| **Supported Technologies** | PLC, SCADA, HMI, OPC UA, MQTT, Modbus |

### Canonical URLs

- Company/About: `https://hermesnovin.com/[locale]/about`
- Product/Platform: `https://hermesnovin.com/[locale]/platform`
- Hermes Brain: `https://hermesnovin.com/[locale]/brain`
- Hermes Industrial Brain: `https://hermesnovin.com/[locale]/industrial-brain`
- Engineering Copilot: `https://hermesnovin.com/[locale]/copilot`
- Architecture: `https://hermesnovin.com/[locale]/architecture`
- Journal (Articles): `https://hermesnovin.com/[locale]/articles`
- Knowledge Library: `https://hermesnovin.com/[locale]/library`
- Academy: `https://hermesnovin.com/[locale]/academy`

### Hermes Brain ≠ Hermes Industrial Brain

These are **two distinct public capabilities** of Hermes OS. They are not
duplicates, aliases or legacy variants of one another.

| | `/brain` | `/industrial-brain` |
|---|---|---|
| Concept | **Hermes Brain** | **Hermes Industrial Brain** |
| Positioning | Industrial Knowledge Engine | Alarm intelligence, signal matrix, industrial fault analysis |
| Title | Hermes Brain — Industrial Knowledge Engine | Hermes Industrial Brain — Alarm Intelligence, Signal Matrix |
| Canonical | self (`/{locale}/brain`) | self (`/{locale}/industrial-brain`) |
| Robots | `index, follow` | `index, follow` |
| Public | Yes | Yes |
| In sitemap | Yes (fa/en/de) | Yes (fa/en/de) |

Both belong to Hermes OS:

```
Hermes Novin Mehr IRIC
        │
        ▼
     Hermes OS
        │
        ├── Hermes Brain            → Industrial Knowledge Engine
        └── Hermes Industrial Brain → Alarm / signal / industrial analysis
```

**Policy:** neither route redirects to the other, neither is `noindex`, and
there is **no cross-canonical** between them. Both are self-canonical in every
active locale.

`/industrial-brain` is public by explicit architectural decision (see the
Phase 82 note in its page source): authentication only determines whether the
generated report offers an active "Save as Engineering Case" action or a sign-in
prompt. It renders no tenant, user or session data — the server component uses
`getCurrentUser()` solely to derive a role boolean.

The two capabilities are distinguished through page metadata, visible copy,
internal links and `llms.txt` — deliberately **not** by minting separate
`Organization` or `SoftwareApplication` entities for them. Promoting a
capability to its own product or company node would recreate exactly the entity
ambiguity this architecture exists to prevent. Hermes OS remains the single
product entity.

## JSON-LD Entity Graph

All public schema on the site participates in a single, interconnected entity graph via stable `@id` values. The graph is emitted globally on every page to ensure that any public page a crawler lands on carries the full relationship.

```
https://hermesnovin.com/#organization
  ├─ @type: Organization
  ├─ name: "Hermes Novin Mehr IRIC"
  ├─ legalName: "Hermes Novin Mehr IRIC"
  ├─ alternateName: ["Hermes Novin", "Hermes OS"]
  ├─ knowsAbout: [Industrial automation, PLC, SCADA, HMI, OPC UA, MQTT, ...]
  ├─ founder: → https://hermesnovin.com/#founder
  ├─ sameAs: [ProvenExpert profile, GitHub org]
  └─ contactPoint: [email, available languages: Persian, English, German]

https://hermesnovin.com/#founder
  ├─ @type: Person
  ├─ name: "Hamid Reza Forozandeh"
  ├─ jobTitle: "Founder, CEO & Chief Industrial Systems Architect"
  ├─ worksFor: → https://hermesnovin.com/#organization
  └─ sameAs: [verified LinkedIn profile]

https://hermesnovin.com/#website
  ├─ @type: WebSite
  ├─ name: "Hermes OS"
  ├─ url: "https://hermesnovin.com"
  ├─ publisher: → https://hermesnovin.com/#organization
  └─ inLanguage: ["fa-IR", "en-US", "de-DE"]

https://hermesnovin.com/#hermes-os
  ├─ @type: SoftwareApplication
  ├─ name: "Hermes OS"
  ├─ applicationCategory: "BusinessApplication"
  ├─ applicationSubCategory: "Enterprise Industrial Intelligence Platform"
  ├─ description: [detailed technical description]
  ├─ creator: → https://hermesnovin.com/#organization
  ├─ publisher: → https://hermesnovin.com/#organization
  ├─ provider: → https://hermesnovin.com/#organization
  └─ image: [canonical OG image URL]

[All article pages]
  ├─ author: → https://hermesnovin.com/#organization
  └─ publisher: → https://hermesnovin.com/#organization
```

**Key principle:** Every entity is defined once and referenced by `@id`. Translations describe the same entities, never create parallel ones.

## Verified External Profiles

The `sameAs` property lists ONLY URLs proven to belong to the entity. Unverified or guessed usernames are not included.

### Organization (Hermes Novin Mehr IRIC)

- **ProvenExpert**: https://www.provenexpert.com/hermes-os/ (trusted seal embedded in About page)
- **GitHub**: https://github.com/hermescenter1 (owns this repository)

### Founder (Hamid Reza Forozandeh)

- **LinkedIn**: https://www.linkedin.com/in/hamid-reza-forozandeh (referenced in public Contact page)

### Hermes OS (product)

No dedicated verified product profile exists, so the product entity carries **no
`sameAs`**. An omitted property is preferable to a fabricated one.

### X / Twitter

No account has been verified as belonging to this organisation, so no handle is
published and `twitter:site` / `twitter:creator` are omitted. The large-image
card renders correctly without them. A previous unverified `@hermesos` handle
was removed.

## Organization Logo — Intentionally Omitted

**`Organization.logo` is intentionally omitted until a verified corporate asset
is supplied.**

A favicon is a browser tab icon, not a corporate logo asset. Publishing
`/favicon.svg` as `Organization.logo` — as an earlier revision did, in both
`Organization` and `JobPosting.hiringOrganization` — is an unsupported assertion
about brand identity, and Google's logo guidance expects a dedicated,
raster-friendly image.

The `ORG_LOGO_URL` constant was **deleted** rather than left unused, so no schema
builder can silently reintroduce it. `logo` is optional on both types, so
omission is valid structured data.

**Site favicon behaviour is unchanged.** It is declared independently by
`app/[locale]/layout.tsx` (`metadata.icons`) and `app/manifest.ts`; neither was
modified.

> **Operator action:** supply a verified production-quality corporate logo, then
> reintroduce it in `src/lib/seo/config.ts` and reference it from
> `organizationSchema()`.

## Crawler Policy

Crawler rules distinguish between:
1. **Search indexing** — classic search engine crawlers (Google, Bing, DuckDuckGo)
2. **AI search/retrieval** — retrieval crawlers for search-integrated AI (ChatGPT, Claude, Perplexity)
3. **Model training** — data-collection crawlers for AI model training (GPT, ClaudeBot, Google-Extended)

### Search Engines

| Bot | Policy |
|---|---|
| **Googlebot** | Full public access; private/API denied |
| **Bingbot** | Full public access; private/API denied |
| **DuckDuckBot** | Full public access; private/API denied |
| **Yandex** | Full public access; private/API denied |
| **Applebot** | Full public access; private/API denied |

### AI Search / Retrieval

These crawlers index public content for search-integrated retrieval (e.g., ChatGPT search, Claude search, Perplexity answers). Different from model training.

| Bot | Policy |
|---|---|
| **OAI-SearchBot** (OpenAI) | Full public access; private/API denied |
| **Claude-SearchBot** (Anthropic) | Full public access; private/API denied |
| **Claude-User** (Anthropic user-initiated) | Full public access; private/API denied |
| **PerplexityBot** | Full public access; private/API denied |

### Model Training

These bots collect data specifically for AI model training. Access is restricted to approved knowledge surfaces only (Library, Academy, Services), not the entire public site.

| Bot | Policy |
|---|---|
| **GPTBot** (OpenAI) | Library, Academy, Services only; private/API denied |
| **ClaudeBot** (Anthropic) | Library, Academy, Services only; private/API denied |
| **Google-Extended** (Google) | Library, Academy, Services only; private/API denied |
| **Applebot-Extended** (Apple) | Library, Academy, Services only; private/API denied |
| **CCBot** (Common Crawl) | Library only; private/API denied |

### Blocked Crawlers

Aggressive or privacy-invasive crawlers are globally blocked:
- AhrefsBot, SemrushBot, MJ12bot, DotBot, BLEXBot

**Source:** [src/app/robots.ts](../src/app/robots.ts)

## Sitemap Architecture

### Static Routes

Public informational pages are listed in the sitemap with appropriate priority and change frequency.

| Path | Priority | Change Freq | In Sitemap |
|---|---|---|---|
| `/` (homepage) | 1.0 | weekly | ✅ |
| `/platform` | 0.9 | monthly | ✅ |
| `/architecture` | 0.85 | monthly | ✅ |
| `/brain` (Hermes Brain — Knowledge Engine) | 0.8 | monthly | ✅ |
| `/industrial-brain` (Hermes Industrial Brain — alarm/signal) | 0.8 | monthly | ✅ |
| `/library` (Knowledge) | 0.9 | weekly | ✅ |
| `/articles` (Journal index) | 0.9 | daily | ✅ |
| `/academy` | 0.9 | weekly | ✅ |
| `/about` | 0.7 | yearly | ✅ |
| `/contact` | 0.7 | yearly | ✅ |

### Journal (Articles) Sitemap

Public, indexable Journal articles are included in the sitemap dynamically.

**Predicate:** `PUBLISHED AND PUBLIC AND noIndex != true`

- Bounded to 5000 articles per build
- Uses real `lastModified` timestamps (from `updatedAt` or `publishedAt`)
- Never fabricates dates
- Author profiles included only when they carry at least one indexable article

**Source:** [src/lib/articles/seo.ts](../src/lib/articles/seo.ts)

### Media Hub (Videos) Sitemap

Published, public media assets are included in the sitemap.

**Predicate:** `published AND public AND not archived AND not de-indexed`

- Bounded to prevent unbounded scans as the library grows
- Real publication timestamps only
- Excludes draft, submitted, rejected, organization-private, or editor-`noIndex` assets

**Source:** [src/lib/media/seo.ts](../src/lib/media/seo.ts)

### Excluded from Sitemap

The following are intentionally NOT listed:
- `/dashboard`, `/admin`, `/crm`, `/erp`, `/assets`, `/cmms` — authenticated application surfaces
- `/auth` — authentication endpoints
- `/api/` — API routes
- `/engineering` — explicitly `noindex` in its own page metadata
- `/automation` — a protected route (`isProtectedPath`)

**Important:** Robots.txt controls crawl permission independently. Not being in the sitemap does NOT mean a page is blocked — robots allow rules determine that separately.

## Canonical URL Strategy

### Canonical Declaration

Every public page declares a canonical URL.

**Principle:** One canonical URL per page, exact URL to self. No cross-locale canonicalization.

```html
<link rel="canonical" href="https://hermesnovin.com/[locale]/[path]" />
```

### Hreflang (Locale Alternates)

Every public page declares reciprocal locale relationships. Typically:

```html
<link rel="alternate" hreflang="fa" href="https://hermesnovin.com/fa/[path]" />
<link rel="alternate" hreflang="en" href="https://hermesnovin.com/en/[path]" />
<link rel="alternate" hreflang="de" href="https://hermesnovin.com/de/[path]" />
<link rel="alternate" hreflang="x-default" href="https://hermesnovin.com/fa/[path]" />
```

### Locale Handling

- **FA** (Persian): Default locale, RTL
- **EN** (English): LTR
- **DE** (German): LTR, active since Phase 87
- **Root redirect:** `/` redirects to `/fa` (default locale)

**Source:** [src/i18n/locales.ts](../src/i18n/locales.ts)

## Metadata & OpenGraph

### Required on All Public Pages

- **title**: Unique, descriptive (typically `[Page Title] | Hermes OS`)
- **description**: Concise, accurate, under 160 characters where possible
- **canonical**: Self-referential URL
- **hreflang**: Locale alternates (where applicable)
- **robots**: Indexable by default; `noindex` only on non-authority pages

### OpenGraph (Social Sharing)

- **og:type**: `website` (default) or `article` (for articles)
- **og:locale**: Locale-specific OG tag (`fa_IR`, `en_US`, `de_DE`)
- **og:image**: [og-default.jpg](../public/brand/og-default.jpg) (1200×630px)
- **og:url**: Canonical URL
- **og:site_name**: "Hermes OS"

### X/Twitter Cards

- **twitter:card**: `summary_large_image`
- **twitter:title**, **twitter:description**, **twitter:image**: As above
- **twitter:site**, **twitter:creator**: Not declared (no verified X/Twitter account)

**Source:** [src/lib/seo/metadata.ts](../src/lib/seo/metadata.ts)

## llms.txt (Supplemental Discovery)

A human-readable, machine-parseable discovery document for AI systems.

**Purpose:** Concisely point AI retrieval systems at canonical public resources without claiming any guarantee of retrieval or indexing.

**Content:**
- Hermes Novin company identity
- Hermes OS product identity
- Canonical public URLs (homepage, platform, brain, architecture, journal, academy, about, contact)
- Knowledge surfaces (library, articles, academy)
- Explicit mention that authenticated areas (dashboard, CRM, ERP, admin) are private

**Important:** This does NOT replace robots.txt, sitemap, or structured data. Support for llms.txt across AI systems is not guaranteed.

**Source:** [src/app/llms.txt/route.ts](../src/app/llms.txt/route.ts)

## JSON-LD Serialization Security

All structured data is safely serialized to prevent script-context injection. A dedicated escaper:

1. Escapes `<` to `<` (prevents `</script>` breakout)
2. Escapes U+2028 and U+2029 (prevent JavaScript parser confusion)
3. Preserves all other characters (spaces, quotes, special chars) verbatim
4. Roundtrips exactly — `JSON.parse(escaped)` recovers the original value

**Escaper:** [src/components/seo/JsonLd.tsx](../src/components/seo/JsonLd.tsx)
**Tests:** [src/lib/seo/__tests__/jsonld-serialization.test.ts](../src/lib/seo/__tests__/jsonld-serialization.test.ts)

## What This Architecture Does NOT Do

### We Do NOT

- Claim to be the only or "official" way to discover Hermes OS via any AI system
- Guarantee inclusion in ChatGPT, Claude, Gemini, Perplexity or any other index
- Control how external systems rank, cite, or retrieve our content
- Bypass external systems' independent crawl, indexing or ranking policies
- Fabricate reviews, ratings, offers, partnerships, certifications or social presence
- Implement cloaking (serving different content to bots vs. users)
- Rely on search engine visibility as the primary go-to-market channel

### External Factors We Cannot Control

- Whether Google Search indexes and ranks us for competitive keywords
- Whether Bing Copilot recognizes and cites us
- Whether ChatGPT search includes us in results
- How Claude search surfaces information about us
- Training dataset inclusion decisions by any AI system
- Ranking algorithms across all discovery platforms
- External link/authority accumulation

## Operator Responsibilities

The following require out-of-repo actions and are tracked as operator tasks:

### Cloudflare Dashboard

- Verify WAF rules do not inadvertently block legitimate crawlers
- Confirm bot-protection settings are configured appropriately
- Check that bot verified-crawlers list includes intended AI/search crawlers

### Bing Webmaster Tools

- Verify domain ownership
- Submit canonical sitemap
- Monitor URL inspection results
- Check crawl issues and blocked resources
- Validate that Bingbot can crawl all public pages

### Google Search Console

- Verify domain ownership
- Submit sitemap
- Inspect representative public URLs (homepage, platform, brain, architecture, journal, academy)
- Monitor Core Web Vitals
- Check for manual actions or security issues
- Verify canonical interpretation

### Manual Validation (Post-Deploy)

Test the following URLs on the production domain:

```
https://hermesnovin.com/                   → 200, canonical, hreflang
https://hermesnovin.com/fa/                → 200, canonical, hreflang
https://hermesnovin.com/en/                → 200, canonical, hreflang
https://hermesnovin.com/de/                → 200, canonical, hreflang
https://hermesnovin.com/robots.txt         → 200, plain text, no stage/localhost URLs
https://hermesnovin.com/sitemap.xml        → 200, XML, all URLs canonical
https://hermesnovin.com/llms.txt           → 200, plain text, company/product identity
```

For each page, verify:
- HTTP 200 status
- Canonical URL correct
- Hreflang reciprocal and correct
- JSON-LD graph present and valid
- No private/admin URLs leaked
- No staging/localhost URLs present
- Title and description present and appropriate

## Testing & Validation

Automated tests verify the entity graph, serialization safety, and architecture.

### Test Suites

| File | Coverage |
|---|---|
| [entity-graph.test.ts](../src/lib/seo/__tests__/entity-graph.test.ts) | Entity @id stability, relationship semantics, no fabricated authority |
| [jsonld-serialization.test.ts](../src/lib/seo/__tests__/jsonld-serialization.test.ts) | Escaping safety, injection prevention, roundtrip correctness |
| [schema-locales.test.ts](../src/lib/seo/__tests__/schema-locales.test.ts) | Multilingual schema, locale parity |
| [journal-sitemap.test.ts](../src/lib/articles/__tests__/journal-sitemap.test.ts) | Published-only predicate, no de-indexed articles, bounded reads |

### Audit Script

[scripts/audit-ai-discoverability.ts](../scripts/audit-ai-discoverability.ts)

Verifies:
- All public routes exist and are indexable by default
- SEO infrastructure (robots, sitemap, llms.txt) is correctly implemented
- Entity graph has stable @ids and correct relationships
- No fabricated authority signals (offers, ratings, reviews)
- Safe JSON-LD serialization in place

**Usage:**
```bash
npx tsx scripts/audit-ai-discoverability.ts
```

## Limitations & Future Work

### Known Constraints

1. **External entity authority** requires time and external recognition. A brand-new website's claims are less trusted than an established one, regardless of technical correctness. This is solvable only through external earning (press, research citations, testimonials, case studies).

2. **AI system indexing is opaque.** Different systems have different crawl schedules, indexing policies, and training data inclusion criteria. We can make our content discoverable, but we cannot dictate how it's indexed or used.

3. **Cloudflare/WAF misconfiguration** could block crawlers we intend to allow. This requires manual operator verification.

4. **Language & translation parity** is maintained in code, but external systems may have difficulty with Persian/RTL content. Monitoring and iteration may be needed.

### Deferred (P2)

- `llms-full.txt` (comprehensive version) — deferred pending assessment of actual AI crawler usage
- Breadcrumb markup on all pages — only where a genuine stable hierarchy exists
- Automated external mention detection — would require third-party tooling
- Knowledge Graph entity promotion via Search Console — manual post-deploy operator action

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) — Project instructions and RBAC/security requirements
- [docs/seo/multilingual-launch-checklist.md](./seo/multilingual-launch-checklist.md) — Phase 87 i18n completeness
- Phase 105 memory: [[phase105-seo-entity-authority]]
