# UX-INFORMATION-ARCHITECTURE.md

HFCC information architecture and route plan. Phase 0 — design only.

---

## 1. TWO AUDIENCES, TWO SHELLS

| | Factory Intake Portal | Internal Factory Dashboard |
|---|---|---|
| Who | plant OT engineer, **external, no Hermes account** | OWNER / ADMIN / integration team |
| Entry | an emailed single-use expiring link | the authenticated dashboard |
| Shell | **standalone**, minimal, no nav, no tenant switcher | the existing dashboard shell |
| Can see | **only its own request** | everything in the tenant it may access |
| Can do | fill in, upload, submit — once | the full lifecycle |
| Locale | fa / en / de, user-chosen at the top | inherits the session locale |

These are deliberately **two different layouts**. Putting intake inside the
dashboard shell would mean an external party loading the authenticated
navigation, the organization switcher and the module list — a disclosure of the
tenant's structure to someone who has no account. The route separation in §2 is
what makes the middleware exclusion in §4 possible.

---

## 2. ROUTE PLAN — RECONCILED WITH THE ACTUAL REPOSITORY

The brief proposed `/[locale]/dashboard/factory-connections`. Measured against
the existing tree, that fits the convention: `/[locale]/dashboard/` already
contains `industrial/`, `ot/`, `digital-twin/`, `multi-site/`, `operations/`,
`predictive/`, `knowledge/`, `copilot/`, `billing/`, `customers/`,
`organization/`, `ats/`.

**Adopted, with one change and one addition:**

```
src/app/[locale]/dashboard/factory-connections/
  page.tsx                          1  index: the portfolio of connections
  [requestId]/
    layout.tsx                         the stepper + context header
    page.tsx                        2  Overview
    profile/page.tsx                3  Factory profile
    network/page.tsx                4  Network and security
    data-sources/page.tsx           5  Data sources
    tags/page.tsx                   6  Tag mapping
    provisioning/page.tsx           7  Gateway provisioning
    connectivity/page.tsx           8  Connectivity
    shadow/page.tsx                 9  Shadow monitoring
    fat/page.tsx                   10  FAT workspace
    evidence/page.tsx              11  Evidence and audit

src/app/[locale]/factory-intake/
  [inviteToken]/
    layout.tsx                         standalone shell, NOT the dashboard shell
    page.tsx                           the intake wizard
```

### The one change: `[requestId]`, not `[siteId]`

The brief proposed `/factory-connections/[siteId]`. **Recommendation:
`[requestId]`.**

Reason: a site can legitimately have more than one integration effort over its
life — a revoked attempt, then a successful one. Keying the URL on `siteId`
makes the second effort either unreachable or silently hijack the first one's
URL, and it makes the audit trail ambiguous ("which attempt was this?"). This
also interacts with **OD-F** (the `@@unique([organizationId, siteId])` decision):
if that constraint is relaxed to a partial index, `siteId` is no longer a unique
key for a URL at all.

The site is still the primary thing a human identifies the connection by, so the
index page is **grouped by site** and the context header shows the site name
prominently with the request reference (`FCC-2026-0007`) beside it.

### The one addition: an index page

The brief's ten pages are all per-request. An integration team managing several
factories needs a portfolio view first. Page 1 is that: a list of connections
grouped by site, each showing state, readiness/HOLD, open blockers and last
activity, filterable by state and site.

### Why not under `/dashboard/industrial/` or `/dashboard/ot/`

Both were considered. `industrial/` is the operational registry (assets, sites,
telemetry, connectors) and `ot/` is device- and gateway-centric engineering.
HFCC is neither: it is a **commissioning workflow** with its own state machine,
its own external-party plane and its own evidence lifecycle. Nesting it inside
either would mean its stepper competes with that section's navigation. It is a
sibling. Cross-links go both ways (§6).

### i18n route prefixes

`/fa` and `/en` locale prefixes are preserved exactly as the rest of the app
does it, and `/de` likewise — the catalogue is trilingual
(79 namespaces, three-way parity). `/factory-intake` is also locale-prefixed, so
a plant engineer reads the intake form in Persian, English or German.

---

## 3. THE DASHBOARD: TEN PAGES

A per-request `layout.tsx` renders the **context header** and the **progress
stepper** on every one of pages 2–11, so the operator always knows which
factory, which state, and what is blocking.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ESFAHAN STEEL · LINE 2          FCC-2026-0007      ⬤ SHADOW_COLLECTING │
│  ⚠ HOLD · 1 security blocker                       [ actions ▾ ]        │
├──────────────────────────────────────────────────────────────────────────┤
│  ①Profile ─ ②Network ─ ③Sources ─ ④Tags ─ ⑤Package ─ ⑥Connect ─ ⑦Shadow │
│                                                        ─ ⑧FAT ─ ⑨Evidence│
└──────────────────────────────────────────────────────────────────────────┘
```

| # | Page | Primary question it answers | Key regions |
|---|---|---|---|
| 1 | **Index** | which factories are we connecting, and which are stuck? | grouped list, state + HOLD + blockers + last activity, filters |
| 2 | **Overview** | is this factory ready, and if not, why? | the 14 required signals (§5), blocker list, last audit event |
| 3 | **Factory profile** | who and what is this? | site/line/unit, the three contact roles (OT/IT/Security), completeness |
| 4 | **Network and security** | is the path safe and legal? | topology diagram, subnets/VLAN/DMZ/proxy, NTP, data diode, longest outage, **certificate fingerprint viewer**, security preflight verdict + blockers, read-only + MOC confirmations with attribution |
| 5 | **Data sources** | what are we reading from? | OPC UA profile (endpoint, policy, message mode, anonymous-disabled, read-only user); Modbus/S7/MQTT shown as `DEFINED_NOT_IMPLEMENTED`, not hidden |
| 6 | **Tag mapping** | which tags, and is the list valid? | upload → **preview** → commit; advanced table (virtualised, sortable, filterable); row-level error report; duplicate/type/range/unit diagnostics; rollback |
| 7 | **Gateway provisioning** | can we build and hand over the install package? | the 10-step sequence as a checklist, identities issued, **one-time credential reveal**, manifest + SHA-256 viewer, download receipt history, HOLD reason when gated |
| 8 | **Connectivity** | do the 19 checks pass, and *in what mode*? | the C-01…C-19 matrix with per-check outcome + measured vs expected + `executionMode` badge; run history; **real-run control disabled with its reason** |
| 9 | **Shadow monitoring** | is live data arriving, and can we trust it? | freshness/provenance state, lag and queue charts, data quality, duplicate/out-of-order counters, **quarantine panel**, disconnect timeline |
| 10 | **FAT workspace** | did the factory acceptance test actually pass? | preconditions, checklist with four outcomes, operator + witness, measured vs expected, attachments, comments, signature; **three separate result columns (Lab / Simulator / Factory)** |
| 11 | **Evidence and audit** | can we prove all of it? | sealed artifact list, **evidence drawer**, the transition timeline with hash chain + verification status, pack generation |

---

## 4. THE INTAKE WIZARD

One standalone route, a multi-step wizard with server-side partial saves.

```
Step 0  Welcome + scope      "You are completing the connection profile for
                              ESFAHAN STEEL · LINE 2. This link expires
                              2026-10-12 and can be submitted once."
                              Locale picker (fa / en / de).
Step 1  Site and line        factory, site, line, unit
Step 2  Contacts             OT, IT, Security — name + contact channel
Step 3  Data source          type; OPC UA endpoint + port
Step 4  OPC UA security      security policy, message security mode,
                              certificate + fingerprint
                              >>> NO PASSWORD FIELD EXISTS ON THIS FORM <<<
Step 5  Network              IP, VLAN, DMZ, proxy, firewall; NTP servers;
                              data diode (if any); longest expected outage
Step 6  Collection           sampling rate; FAT window
Step 7  Confirmations        read-only confirmation; MOC confirmation + reference
Step 8  Tag list             upload CSV/XLSX -> PREVIEW -> commit
Step 9  Documents            network diagram + permitted documents
Step 10 Review and submit    server-computed completeness; what is still missing;
                              submit once
```

### Step 4 carries an explicit statement, not just an absent field

The plant engineer *expects* to be asked for a password, and will look for the
field. So the form says, in all three locales:

> **The OPC UA username and password are never entered here.** They are entered
> only on the gateway installed inside your plant, during installation. Hermes
> does not receive, store or transmit them.

An absent field invites a support ticket and a workaround (typing it into a
"notes" box). An explained absence does not. For the same reason, any free-text
field on this form is scanned for credential-shaped content on submit and
refused with a specific message rather than silently stored.

### Intake constraints, as UX

- **No navigation to anything else.** No dashboard link, no tenant switcher, no
  module list, no footer links into the authenticated app.
- Progress and partial saves survive a reload (T-03) without consuming the
  single-use submission.
- Expiry is shown as an absolute date **and** a relative countdown, from the
  server's clock.
- An expired, revoked or already-submitted token renders a dedicated,
  non-leaking state: it names the site **only if** the token was once valid for
  it, and otherwise says nothing about what the token might have been.
- Validation is server-authoritative. Client-side validation exists only to be
  helpful; every rule is re-checked on submit.

---

## 5. OVERVIEW — THE FOURTEEN SIGNALS, AND THE HOLD RULE

The brief requires fourteen things at a glance:

```
 1 Factory readiness score      8 Shadow status
 2 Information completeness     9 Last telemetry
 3 Security preflight          10 Data quality
 4 Gateway status              11 Quarantine count
 5 Collector status            12 Open blockers
 6 Relay status                13 FAT progress
 7 Connection status           14 Last audit event
```

### Layout

```
┌─ READINESS ───────────────────────────┐┌─ BLOCKERS (12) ──────────────────┐
│  ⚠  HOLD                              ││ ⬤ BLOCKER  FCC-SEC-003            │
│                                        ││   Anonymous OPC UA access not    │
│  No score is shown while a security    ││   confirmed disabled             │
│  blocker is open.                      ││ ◐ MAJOR    FCC-NET-011           │
│  [ view blockers ]                     ││   NTP offset 240 ms              │
└────────────────────────────────────────┘└───────────────────────────────────┘
┌─ COMPLETENESS (2) ─────────────────────┐┌─ SECURITY PREFLIGHT (3) ─────────┐
│  Profile    ████████████ 100 %         ││  ⚠ SECURITY_HOLD                 │
│  Network    ████████████ 100 %         ││  last run 2026-10-04 11:20       │
│  Sources    █████████░░░  80 %         ││  1 blocker, 1 major              │
│  Tags       ████████████ 100 %  412    │└───────────────────────────────────┘
└────────────────────────────────────────┘
┌─ PATH HEALTH (4,5,6,7) ──────────────────────────────────────────────────┐
│  Gateway    ⬤ INSTALLED     last seen 12 s ago                            │
│  Collector  ○ UNKNOWN       no report received                            │
│  Relay      ⬤ CONNECTED     queue 142 · backpressure no                   │
│  Connection ⬤ DETECTED      ⚑ SIMULATOR                                   │
└──────────────────────────────────────────────────────────────────────────┘
┌─ SHADOW (8,9,10,11) ─────────────────────────────────────────────────────┐
│  ⬤ COLLECTING   freshness LIVE   provenance ⚑ SIMULATED   lag 1.8 s       │
│  last telemetry 2026-10-05 09:12:00Z   quality 99.1 % good                │
│  accepted 10 234 · duplicate 3 · out-of-order 1 · quarantined 0           │
│                                 [ quarantine panel → ]                    │
└──────────────────────────────────────────────────────────────────────────┘
┌─ FAT (13) ───────────────────────────────────────────────────────────────┐
│             Lab      Simulator   Factory          ← NEVER a single total  │
│  PASS        18          22          0                                    │
│  FAIL         0           0          0                                    │
│  NOT_RUN      6           2         24                                    │
│  NOT_MEAS.    0           0          0                                    │
└──────────────────────────────────────────────────────────────────────────┘
┌─ LAST AUDIT EVENT (14) ──────────────────────────────────────────────────┐
│  T-11  CONNECTION_DETECTED → SHADOW_COLLECTING   SYSTEM                   │
│  2026-10-05 09:11:48Z    #12   hash 9f2c…  [ full timeline → ]            │
└──────────────────────────────────────────────────────────────────────────┘
```

Three structural properties of this layout, each enforced by the API shape
(`API-CONTRACT-PROPOSAL.md` §6) rather than by the component:

1. **A HOLD occupies the space where the number would be.** It is not a red
   number. There is no number — the server did not send one.
2. **`SIMULATOR` carries a flag glyph (`⚑`) everywhere it appears**, and the
   flag is part of the status token, not a tooltip. A reader skimming the page
   cannot miss that the connection is simulated.
3. **The FAT panel is a 4×3 matrix with no total row or column.** There is
   nowhere for a merged number to go.

`Collector ○ UNKNOWN — no report received` illustrates the general rule:
**absence of a report is reported as unknown, never as healthy.** A green
default on a signal nobody measured is the defect class this programme has met
repeatedly ("a rendered empty branch is not a reachable state").

---

## 6. NAVIGATION AND CROSS-LINKS

Sidebar entry: under the existing industrial/OT group, labelled
*Factory connections* (fa: اتصال‌های کارخانه, de: Werksanbindungen).
Visibility is **middleware-derived**, matching the existing app-shell pattern —
a user without `view_factory_connection` never sees the entry, and the route
also refuses independently.

Cross-links:

```
Factory connection  ──▶  IndustrialSite        (site detail)
                    ──▶  IndustrialGateway     (/dashboard/ot/gateways/[id])
                    ──▶  Telemetry             (/dashboard/industrial/telemetry, filtered)
                    ──▶  Assets                (tag → asset mapping)
Gateway detail      ──▶  its factory connection  (back-link)
Site detail         ──▶  its factory connection  (back-link)
```

The credential lifecycle controls on page 7 **link into** the existing
`/dashboard/ot/gateways/[id]` enrollment surface rather than re-implementing it,
consistent with reusing the Phase 94 routes.

---

## 7. STATE-DRIVEN DISCLOSURE

Pages are always **present** and always **reachable**; what changes is their
content. A page that disappears when inapplicable breaks deep links, breaks the
stepper, and hides from the operator the fact that a step exists at all.

So each page has an explicit state for every lifecycle phase:

| | before its turn | during | after | while held | revoked |
|---|---|---|---|---|---|
| content | **locked** — explains what unlocks it and which transition does so | editable | **read-only, sealed** | read-only + the HOLD reason | read-only + revocation reason and date |

Four distinct empty-ish states, never one generic "no data":

- **locked** — "Tag mapping opens once the factory submits its profile (T-04)."
- **empty** — unlocked, genuinely nothing yet, with the action that creates the
  first thing.
- **unavailable** — the server could not answer. **This is an error state, not
  an empty one**, and it says so.
- **forbidden** — the reader lacks the capability, distinct from "nothing here".

The repo already has copy for the last two
(`errors.resource.*`, `org.state*`, `otEdge.states.*`), and the Phase 110-A1.0b
lesson applies directly: *a section that FAILED or is REFUSED must not render as
an empty success.*

---

## 8. PROGRESSIVE DISCLOSURE WITHIN A PAGE

HFCC pages carry a lot of engineering detail. The rule applied throughout:

- **Verdict first, evidence on demand.** A certificate shows
  `TRUSTED · expires in 412 days` with the fingerprint available; clicking opens
  the full viewer with subject, issuer, serial, validity and the normalised
  SHA-256 in grouped hex.
- **The evidence drawer** (page 11, and reachable from any artifact reference on
  any page) is the single place raw artifacts are inspected, so no page needs to
  inline a blob.
- **Counters link to lists.** `quarantined 0` is a link; at `> 0` it is the
  primary call to action on the shadow page.
- **The timeline is collapsed to the last event** on Overview and expands to the
  full hash-chained history on page 11, with verification status per row.

---

## 9. WHAT THE UI DELIBERATELY DOES NOT OFFER

- No control that writes to a PLC or changes a setpoint. There is no such API,
  so there is no such button, and no disabled placeholder implying one could
  exist later.
- No field anywhere that accepts an OPC UA password.
- No way to edit a sealed FAT run, transition or evidence artifact.
- No way to override a blocker from the UI — a blocker is resolved by recording
  a resolution, which is itself audited.
- No `FACTORY_READY` / `PILOT_READY` / `DEPLOY_READY` / `PRODUCTION_READY`
  wording anywhere, in any locale, until the owner rules.
- No merged FAT total.
- No readiness number while a blocker is open.
