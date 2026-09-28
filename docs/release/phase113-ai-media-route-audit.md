# Phase 113-B — AI Video and AI Audio Route Audit

**Method:** read-only inventory from the filesystem, the authorization layer, the
navigation registries, the sitemap, the catalogs and the source comments. Phase
numbers were **proved from the repository**, not accepted from the report.
**Contract test:** `src/lib/navigation/__tests__/phase113b-ai-media-routes.test.ts` — 15 assertions.
**Outcome: no navigation change.** Reasoning below.

---

## 1 · The phase numbers, corrected

The report guessed Phase 103 and Phase 104. The repository says:

| Capability | Real phase | Evidence |
|---|---|---|
| **AI Video** — Media & Video Hub | **Phase 102** | `src/app/api/media/public/videos/route.ts:2` → `PHASE 102` |
| **AI Audio** — Live Voice Intelligence | **Phase 103** | `src/lib/copilot/voice/config.ts:2` and `src/app/api/copilot/voice/speech/route.ts:2` → `PHASE 103` |
| Phase 104 | **neither** | Phase 104 is the visual / Figma design-system and Observatory-homepage phase. It ships no audio or video capability |

So: audio is 103 (half the guess was right), video is **102**, and 104 is
unrelated. A "Film Studio" (Phase 108) exists in this project's history but is
**not present in this worktree** — no file, route, component or doc matches it at
`837deb5c`; it lives on an unmerged branch.

---

## 2 · AI Video — Phase 102 Media & Video Hub

### Inventory

| Property | Finding |
|---|---|
| Official name | Hermes Media & Video Hub (`mediaHub.title`) |
| Routes | `/[locale]/videos` (root), `/[locale]/videos/[org]`, `/[locale]/videos/[org]/[slug]` |
| Locale-aware | Yes — all three under `[locale]` |
| Public or authenticated | **Public**, by explicit decision: registered in `PUBLIC_ANONYMOUS_PATHS` as `VIDEOS_PUBLIC` (`rbac.ts:138,256`) |
| Permission | None. `isProtectedPath` is false in fa/en/de |
| Feature flag / env | None for the page. Content requires published rows in the database |
| Page component | **Present and complete** — plus `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `data.ts`, `VideoLibraryFilters.tsx` |
| API / backend | **Present**: `/api/media/public/videos` |
| Navigation | **Absent from both** the public shell and the authenticated app nav |
| Sitemap | Root **excluded** on purpose; `/videos/{org}` and `/videos/{org}/{slug}` are appended from the database |
| robots | Root is `noindex, follow` via its own `generateMetadata` |

### Why it "does not open" — the precise cause

**Classification: the page is a deliberate shell, and the capability has zero entry points.**

Two independent findings, both confirmed in source:

1. **The hub root can never render a library.** From `page.tsx:6-34`:
   a media asset is addressed by `(organization, slug)`, so without an
   organization "there is nothing this route can honestly render, and it never
   could". It answers HTTP 200, renders `VideoGrid items={[]}` with
   `emptyReason="LIBRARY_EMPTY"`, and is `noindex`. This is DISCOVERY-2A's
   deliberate position, not a bug: the previous version accepted `?org=` and
   served a permanently empty grid while the sitemap advertised it at priority
   0.8 — a soft 404.

2. **Nothing anywhere links to it.** A repository-wide search for `"/videos`
   outside the route's own directory and its tests returns exactly one hit, and
   it is a constant (`src/lib/media/seo.ts:63`,
   `MEDIA_PUBLIC_PATH_PREFIX`), not a link. There is also a fully translated
   but **unused** navigation label, `appShell.nav.items.videoHub`
   ("Video Hub" / "مرکز ویدیو" / "Videothek"), wired to nothing.

So a visitor can only reach it by typing the URL, and when they do they get an
empty state — exactly the two symptoms reported.

### Header decision: `FEATURE_INCOMPLETE_DO_NOT_EXPOSE`

For the **root**. Promoting it would:

* headline an empty page as a platform capability; and
* **pre-empt a tenant-visibility policy decision the repository explicitly
  defers.** Making the root useful means publishing a *directory of organizations
  that have public media*. `data.ts` deliberately refuses to distinguish "no such
  organization" from "nothing published here", precisely so that the hub cannot
  become a tenant directory by accident. DISCOVERY-2A records that as
  DISCOVERY-2B's decision, and it is an owner decision about customer visibility,
  not a navigation fix.

`/videos/{org}` and `/videos/{org}/{slug}` are public, indexable and complete —
but they cannot have a global entry point until that directory question is
answered. They are reachable today from a tenant's own context and from search.

**No route repair was performed, because nothing is broken.** The route answers
200, is correctly `noindex`, and is correctly absent from the sitemap. The
`videoHub` label is deliberately **kept, not deleted**: it is what a future
promotion needs, and the contract test records that it is intentionally unused so
nobody "fixes the orphan" by exposing the empty hub.

> **OWNER DECISION REQUIRED** — should Hermes OS publish a public directory of
> organizations that have published media? Answer that and the hub becomes either
> a real page (then it can enter the header) or a permanently internal address.

---

## 3 · AI Audio — Phase 103 Live Voice Intelligence

### Inventory

| Property | Finding |
|---|---|
| Official name | Hermes Live Voice Intelligence |
| Route | **None of its own.** It is a panel — `src/components/copilot/LiveVoicePanel.tsx` — rendered inside `/[locale]/dashboard/copilot` |
| Locale-aware | Yes (via its parent route); 40 `copilot.liveVoice` catalog leaves in fa/en/de |
| Public or authenticated | **Authenticated.** `/dashboard/copilot` matches the `dashboard` protected prefix in all three locales |
| Permission | The `dashboard` capability (`ROLE_CAPS`): superadmin / admin / engineer / customer / vendor. Viewer and candidate are denied |
| Feature flag / env | **`HERMES_EXTERNAL_AI_ENABLED`** must be one of `1|true|on|yes`; plus `OPENAI_API_KEY` and a signing secret. "Absence is a denial, not a default" — `config.ts:10-32`. Measured in the test environment: **disabled** |
| Page component | Present and complete |
| API / backend | `/api/copilot/voice/session`, `/query`, `/speech`. There is deliberately **no** handler at the bare `/api/copilot/voice` |
| Navigation | **Already present** in the authenticated app nav: `app-nav.ts:63` → `/dashboard/copilot` |
| Sitemap / robots | Under `/dashboard`, so `Disallow`ed and absent from the sitemap — correct |
| CSP | `connect-src` opens to the provider **only** when the same kill switch is on (`middleware.ts:83`) |

### Why it "does not open" — the precise causes

Three, in the order a user hits them:

1. **Auth redirect.** Anonymous → middleware 307 to `/{locale}/auth/login?from=…`.
   Working as designed.
2. **RBAC denial.** Signed in without the `dashboard` capability (viewer,
   candidate) → denied. Working as designed.
3. **Feature flag off.** Signed in and authorized, but `HERMES_EXTERNAL_AI_ENABLED`
   is unset — the shipped default — so the panel renders
   `copilot.liveVoice.disabledNotice` instead of a microphone control:
   *"Voice input is switched off for this deployment. An administrator must enable
   external AI processing before the microphone can be opened."*

None of these is a defect. All three are the fail-closed design.

### Header decision: `KEEP_HIDDEN_INTERNAL_ONLY`

The architecture the brief asks for — public overview + protected workspace + a
CTA that lands an authenticated user in the workspace — **already exists**:

* public overview: `/copilot`, public in all three locales, already in the public
  header under Intelligence;
* protected workspace: `/dashboard/copilot`, already in the authenticated app nav,
  permission-aware, and still authorized server-side regardless of what the nav
  renders.

So `ADD_PUBLIC_OVERVIEW_AND_PROTECTED_WORKSPACE` is already satisfied and no edit
is needed.

The voice capability is **not** advertised on the public `/copilot` page — a
search of that page for voice/audio/speech terms returns **zero** matches. That is
left as-is deliberately: the feature ships switched off, so marketing it publicly
would be a capability claim the deployment does not honour. Writing that copy is a
decision for whoever turns the provider on.

> **OWNER DECISION REQUIRED** — when external AI is enabled for a deployment,
> should `/copilot` describe the voice capability publicly? Until then, silence is
> the honest option.

---

## 4 · Why nothing was added to the public header

The brief's own guard: *"if the pages carry costly operations, organization data,
private files, provider credentials or a protected capability, do not put them
directly in the public header."*

| | Video hub root | Voice workspace |
|---|---|---|
| Costly external operation | no | **yes** — a paid provider |
| Organization data | **yes** — it would become a tenant directory | **yes** — tenant-scoped reasoning |
| Provider credentials | no | **yes** |
| Protected capability | no (public) | **yes** |
| Complete and presentable | **no** — empty by design | yes, but ships disabled |

Both fail. The public header is therefore byte-unchanged, and the contract test
pins the counts (22 header items, 17 footer links) so a later edit cannot quietly
add or drop one.

---

## 5 · Incidental finding: a retired identity still published

Found while sweeping for media routes, **not** part of the media question, and
material enough to record here because it defeats a Phase 113 gate.

`contact.generalEmail` published **`hermesnovinmehriric@gmail.com`** on the
**public** `/[locale]/contact` page — as visible text and as a `mailto:` target
(`contact/page.tsx:67,115,119`) — in all three locales. That is the retired legal
name, spelled as an email local-part.

**Why the phase missed it.** The occurrence inventory searched for `Hermes Novin`
**with a space**. The concatenated form never matched, and the new
"the retired company identity is published nowhere" test used the same spaced
needles — so the gate reported success while the name was on the page. A gate that
passes over the defect it was written for is worse than no gate.

**Remediation applied:**

1. `contact.generalEmail` → `info@hermesnovin.com`, the canonical address already
   published as `contact.salesEmail` and already emitted as the organisation's
   `contactPoint` in the entity graph (`CONTACT_EMAIL`). **No mailbox was
   invented.**
2. `src/components/landing/ContactSection.tsx` — three hard-coded `mailto:` targets
   with the same address, also replaced. That component is **currently
   unreachable** (`LandingPage` has zero consumers), so this removed a landmine
   rather than a live exposure.
3. The identity gate is now **separator-insensitive**: it compares each surface
   both literally and in a lower-cased, separator-stripped form, so
   `hermesnovinmehriric`, `Hermes-Novin` and `hermes.novin` are all caught. Two
   new assertions specifically sweep every published contact address and require
   the canonical one to be present.
4. A narrow, derived carve-out keeps the production host out of the collapsed
   comparison — `hermesnovin.com` collapses to `hermesnovin`, and the domain is
   infrastructure, not an identity claim. The carve-out is computed from
   `BASE_URL`, so it narrows automatically if the host ever migrates.

**Deliberately not changed:** `tools/figma/hermes-design-system-builder/README.md`
names `hermesnovinmehriric@gmail.com` as the Google account connected to the Figma
MCP integration. That is a factual operational record about a real account, not a
published company identity; rewriting it would falsify the note.

> **OWNER CONFIRMATION REQUESTED** — general enquiries now route to
> `info@hermesnovin.com`, the same mailbox as sales. If a separate general mailbox
> is wanted, supply it and it can replace this value in one edit.

---

## 6 · A latent collision worth knowing about

`src/lib/tenant/__tests__/tenant-context-static.test.ts:685-686` asserts that the
tenant contract source does **not** match `/ZHARFA/i` — a pre-existing guard
against a placeholder tenant name leaking into the tenant contract.

Now that ZHARFA is the real company name, that guard reads oddly, and it will
fail if anyone ever puts the company name into `tenant-selection/contract.ts` or
`tenant/context.ts`. Phase 113 touches neither file, so it passes today.

**No change made** — the guard's intent (no placeholder tenant in the tenant
contract) is still sound, and renaming it is not this phase's business. Recorded
so the next person does not find it surprising.
