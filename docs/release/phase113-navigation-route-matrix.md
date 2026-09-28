# Phase 113 — Public Navigation Route Matrix

**Baseline:** `837deb5c` (= `origin/main` = last deployed production commit)
**Decision:** `NO_HEADER_CHANGE_REQUIRED`
**Registry:** `src/components/public-site/nav.ts`
**Authorization source:** `src/lib/auth/rbac.ts`

---

## How this matrix was built

Not by reading the header. Each row was derived from three independent sources:

| Column | Source |
|---|---|
| route exists | `src/app/[locale]/<path>/page.tsx` present on disk |
| public / authenticated | `isProtectedPath("/en<path>")` from `src/lib/auth/rbac.ts` |
| RBAC requirement | `isAuthorizedForPath` / `ROLE_CAPS` in `src/lib/auth/rbac.ts` |
| indexable | `src/app/robots.ts` (derived from `PROTECTED_ROUTE_PREFIXES`) and `src/app/sitemap.ts` |
| currently in header | `PUBLIC_NAV_GROUPS` in `nav.ts` |

`src/components/public-site/__tests__/public-nav.test.ts` already pins the group
composition and asserts non-protection; Phase 113 adds
`src/lib/seo/__tests__/phase113-public-identity.test.ts`, which asserts the
boundary from the other direction (required-present, forbidden-absent).

---

## 1 · Routes IN the public header — all verified public

| Route | Access | RBAC | Tenant | Indexable | In header | Should be | Reason |
|---|---|---|---|---|---|---|---|
| `/platform` | public | none | none | yes | yes | **yes** | Platform overview; the primary conversion route |
| `/architecture` | public | none | none | yes | yes | **yes** | PLC/SCADA/HMI/OPC UA/MQTT connectivity explainer |
| `/services` | public | none | none | yes | yes | **yes** | Capability index |
| `/services/digital-twin` | public | none | none | yes | yes | **yes** | Public explainer for an implemented capability |
| `/services/predictive-maintenance` | public | none | none | yes | yes | **yes** | Public explainer |
| `/services/cmms` | public | none | none | yes | yes | **yes** | Public explainer; the CMMS *workspace* is separate and protected |
| `/services/multi-site` | public | none | none | yes | yes | **yes** | Public explainer |
| `/services/edms` | public | none | none | yes | yes | **yes** | Public explainer; the EDMS workspace is separate and protected |
| `/services/erp` | public | none | none | yes | yes | **yes** | Public explainer; the ERP workspace is separate and protected |
| `/services/ot-edge` | public | none | none | yes | yes | **yes** | **The OT Edge public capability page the brief asked about.** The OT Edge operational registry is a different, protected surface |
| `/services/crm` | public | none | none | yes | yes | **yes** | Public explainer; the CRM workspace is separate and protected |
| `/industrial-brain` | public | none | none | yes | yes | **yes** | Public by explicit architectural decision (Phase 82): renders no tenant, user or session data; `getCurrentUser()` is used only to derive a role boolean that decides whether a "Save as Engineering Case" action is offered |
| `/brain` | public | none | none | yes | yes | **yes** | Hermes Brain — the Industrial Knowledge Engine. A DISTINCT capability from Industrial Brain; neither canonicalises to the other |
| `/copilot` | public | none | none | yes | yes | **yes** | Engineering Copilot explainer |
| `/library` | public | none | none | yes | yes | **yes** | Open engineering knowledge library |
| `/academy` | public | none | none | yes | yes | **yes** | Course catalogue. `academy/admin` is a separate protected prefix |
| `/articles` | public | none | none | yes | yes | **yes** | Industrial Journal. Eleven editorial sub-paths (`articles/write`, `articles/moderation`, …) are separately protected prefixes |
| `/demo` | public | none | none | yes | yes | **yes** | Approved conversion route |
| `/vendors` | public | none | none | yes | yes | **yes** | Public vendor directory. `vendor/` (singular) is the protected vendor workspace — robots emits both exact forms so the Disallow cannot swallow the plural |
| `/about` | public | none | none | yes | yes | **yes** | Company page — now naming ZHARFA |
| `/careers` | public | none | none | yes | yes | **yes** | Public roles. `candidate/*` is protected apart from `candidate/register` |
| `/contact` | public | none | none | yes | yes | **yes** | Contact page |

## 2 · Routes in the public FOOTER only

| Route | Access | Indexable | Reason for footer-only |
|---|---|---|---|
| `/privacy` | public | yes | Legal; belongs in the legal column, not the header |
| `/terms` | public | yes | Legal |
| `/cookies` | public | yes | Legal — **rebuilt by this phase** |

The footer additionally repeats platform, intelligence, resource and company
destinations already in the header; all 17 footer links resolve to the same
verified-public set.

## 3 · Routes deliberately NOT in public navigation

| Route | Access | RBAC | Tenant | Indexable | Why excluded |
|---|---|---|---|---|---|
| `/live-operations` | **authenticated** | engineering platform roles | yes | `Disallow` | Operational surface. The brief asked specifically: the repository contains **no** separate anonymous landing page for it |
| `/dashboard` | **authenticated** | `dashboard` capability | yes | `Disallow` | The workspace root |
| `/dashboard/billing` | **authenticated** | stricter than `dashboard` | yes | `Disallow` | Commercial administration |
| `/dashboard/organization` | **authenticated** | stricter than `dashboard` | yes | `Disallow` | Tenant administration |
| `/dashboard/api` | **authenticated** | stricter than `dashboard` | yes | `Disallow` | API platform administration |
| `/engineering` | **authenticated** | engineering roles | yes | `Disallow` | Engineering estate |
| `/compliance` | **authenticated** | admin | yes | `Disallow` | Compliance Operations Center |
| `/admin` | **authenticated** | admin/superadmin | n/a | `Disallow` | Platform administration |
| `/cmms`, `/assets`, `/documents`, `/automation`, `/erp`, `/crm` | **authenticated** | admin/superadmin/engineer | yes | `Disallow` | Operational workspaces behind the public `/services/*` explainers |
| `/candidate/*` (except `register`) | **authenticated** | candidate | n/a | `Disallow` + `Allow: /…/candidate/register` | ATS candidate area |
| `/vendor/*`, `/customer/*` | **authenticated** | partner roles | yes | `Disallow` | Partner portals |
| `/privacy-center` | **authenticated** | any authenticated user | n/a | `Disallow`, and deliberately absent from the sitemap | Personal data self-service |
| `/knowledge/studio`, `/knowledge/case-studio`, `/intelligence/unknown` | **authenticated** | engineer+ | yes | `Disallow` | Authoring and reasoning surfaces |
| `/articles/{write,drafts,moderation,review-queue,reports,editorial-board,editor,submissions,saved,following,my-articles,settings}` | **authenticated** | editorial roles | n/a | `Disallow` | Editorial workflow |
| `/academy/admin` | **authenticated** | academy admin | yes | `Disallow` | Course administration |
| `/otedge` operational registry | **authenticated** | OT roles + site access | yes | `Disallow` | The public counterpart is `/services/ot-edge` |
| ATS management (`/dashboard/ats/*`) | **authenticated** | ATS roles | yes | `Disallow` | Recruitment administration |
| Reasoning-run surfaces (Phase 112) | **authenticated** | engineer+ | yes | `Disallow` | Immutable reasoning runs are tenant records |

---

## 4 · Why the header was not changed

Every capability the brief listed for review is already reachable from the
public header, and each of the 25 distinct hrefs the public shell renders was
verified to (a) resolve to a real page file and (b) be unprotected by
`isProtectedPath` in all three locales.

Adding anything further would have required either:

* exposing a protected operational route — which the brief forbids and for which
  the repository proves no anonymous landing page exists; or
* inventing a menu item for a page that does not exist — which the brief
  forbids.

So the recorded decision is **`NO_HEADER_CHANGE_REQUIRED`**, and `nav.ts` is
byte-unchanged by this phase.

The risk this leaves is *silent removal*, not silent addition, which is why the
new test asserts a REQUIRED-PRESENT list of 22 header hrefs alongside the
forbidden-absent checks.

---

## 5 · Crawl policy consistency

`src/app/robots.ts` derives its `Disallow` list from
`PROTECTED_ROUTE_PREFIXES`, and re-allows `PROTECTED_ROUTE_PUBLIC_CHILDREN`.
Crawl policy therefore follows access policy by construction rather than by a
hand-maintained second list. Phase 113 changes neither file.

Each protected prefix emits two rules — `/<locale>/<prefix>$` and
`/<locale>/<prefix>/` — so a prefix match cannot swallow a public sibling
(`/fa/vendor` must not match `/fa/vendors`).

---

# Addendum — Phase 113-B · AI Video and AI Audio

Added after the scope extension. Full reasoning and evidence:
[`phase113-ai-media-route-audit.md`](./phase113-ai-media-route-audit.md).
Contract test: `src/lib/navigation/__tests__/phase113b-ai-media-routes.test.ts`.

**Phase numbers proved from source, not assumed:** AI Video is **Phase 102**
(`api/media/public/videos/route.ts:2`), AI Audio is **Phase 103**
(`lib/copilot/voice/config.ts:2`). **Phase 104 is neither** — it is the
visual/design-system phase.

## 4 · AI media routes

| Route | Access | RBAC | Tenant | Indexable | In public nav | In app nav | Decision | Reason |
|---|---|---|---|---|---|---|---|---|
| `/videos` (hub root) | public (`PUBLIC_ANONYMOUS_PATHS`) | none | n/a | **noindex, follow** | no | no | **FEATURE_INCOMPLETE_DO_NOT_EXPOSE** | Answers 200 but renders a permanently empty grid: a media asset is addressed by `(organization, slug)`, so the bare root has no library to show. Making it useful means publishing a directory of tenants with public media — an owner policy decision the repository defers to DISCOVERY-2B |
| `/videos/[org]` | public | none | organization in the URL | yes, from the DB | no | no | **KEEP_HIDDEN_INTERNAL_ONLY** (no global entry point possible yet) | Complete and indexable, but cannot be linked globally until the directory question above is answered |
| `/videos/[org]/[slug]` | public | none | organization in the URL | yes, from the DB | no | no | same | Watch page; reachable from its own library and from search |
| `/dashboard/copilot` (Live Voice panel) | **authenticated** | `dashboard` capability | yes | `Disallow` | no | **yes — already** (`app-nav.ts:63`) | **KEEP_HIDDEN_INTERNAL_ONLY** | Costly external provider, provider credentials, tenant-scoped reasoning, and ships with `HERMES_EXTERNAL_AI_ENABLED` off. Already correctly placed |
| `/copilot` (public overview) | public | none | none | yes | **yes — already** | n/a | no change | The public counterpart already exists in the header under Intelligence. It does not yet describe the voice capability, deliberately: the feature ships disabled |
| `/api/copilot/voice/{session,query,speech}` | authenticated | `dashboard` + flag | yes | `Disallow: /api/` | n/a | n/a | no change | Three endpoints; there is deliberately no handler at the bare `/api/copilot/voice` |

## 5 · Net navigation change: NONE

`src/components/public-site/nav.ts` and `src/lib/navigation/app-nav.ts` are both
**byte-unchanged**. The counts are now pinned by test — 22 header items, 17 footer
links — so a later edit cannot silently add or drop one.

A fully translated navigation label, `appShell.nav.items.videoHub`
("Video Hub" / "مرکز ویدیو" / "Videothek"), exists and is wired to nothing. It is
**kept, not deleted**: it is what a future promotion will need, and the contract
test records the orphan as intentional so nobody resolves it by exposing the empty
hub.
