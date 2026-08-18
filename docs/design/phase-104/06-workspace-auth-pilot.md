# Phase 104 — Workspace & Authentication Visual Pilot (Increment 104-D2)

```text
INCREMENT=104-D2
VISUAL_CHANGE=YES
LOGIN_VISUAL_MIGRATION=YES
DASHBOARD_VISUAL_MIGRATION=YES
LOGIN_MIGRATED_DIRECTLY=YES
DASHBOARD_MIGRATED_DIRECTLY=YES
HORIZON_PRODUCT_CONSUMER=YES
TRIAD_PRODUCT_CONSUMER=YES
OWNER_VISUAL_APPROVAL=OUTSTANDING
```

104-D adopted the shared shell — Rail, Command, Beacon — but changed **no route content**. This
increment is the first that does. Two canonical routes were redesigned and nothing else:

| Route | Adoption |
|---|---|
| `/{locale}/auth/login` | **Hermes Horizon** atmosphere + a contract-owned **Glass** content surface |
| `/{locale}/dashboard` | The **Hermes Triad** — `operate` / `understand` / `act` |

Horizon and Triad were the last two signatures with no product consumer. They have one now.

---

## 1. Ownership, established from imports

**Login.** `src/app/[locale]/auth/login/page.tsx` → `AuthExperienceShell` → `NewLoginClient`.
The shell is shared by **six** auth routes (login, register, forgot-password, reset-password,
accept-invite, verify-email), which is exactly why the Horizon treatment had to be isolated rather
than applied to the shell outright. `/{locale}/login` is a `redirect()` to `/auth/login` and has no
visual surface of its own.

**Dashboard.** `src/app/[locale]/dashboard/page.tsx` → `AppShell` + `PageHeader` + `CommandRibbon`
+ `DashboardClient` → `DashboardCommandSurface` → the `dashboard-experience` primitives. The
command surface already reorganised the authorized snapshot into *operational status → attention →
risk & evidence → safe actions*. That is the Triad, unnamed. This increment names it and gives it
the composition.

## 2. Login — Horizon, isolated by construction

`AuthExperienceShell` gained `visualMode?: "standard" | "horizon"`, **defaulting to `"standard"`**.
Only the canonical Login passes `visualMode="horizon"`.

The default is the whole safety property: a default of `"horizon"` would silently light up five
other auth routes. The gate asserts both halves — Login opts in, and each of the other five is
checked by name for the absence of the opt-in.

| Property | Value | Source |
|---|---|---|
| Ember band | **22%** (gradient turns warm at 78%) | recomputed against `HORIZON.emberBandMaxHeightRatio` |
| Vignette | present, composited **over** the ember | `HORIZON.vignetteRequired` |
| Colours | `--color-horizon-ember-fade`, `--color-horizon-ember-core` | 104-A atmosphere-only tokens |
| Layer | `position: absolute`, `pointer-events: none`, `aria-hidden` | — |
| Content surface | `.ds-glass-elevated` | `GLASS_VARIABLE_CONTRACT` (contract-owned) |

Text never sits on Horizon: the panel is a Glass surface composited above it. The Glass tier is
the **contract-owned** `.ds-glass-elevated`, not the legacy `.ds-glass` overlay utility — that
distinction was called out in the 104-D review and is honoured here.

The band percentage is not read from prose. The gate parses the gradient, takes the **last
transparent stop** as the true start of the warm band (an earlier draft measured from the ember
stop, which understated it and did not notice a widened transition), and compares the result
against the machine source.

**Behaviour is untouched.** No change to credentials, submission, callback URLs, validation, error
mapping, pending state, password visibility, keyboard submission, focus, auth API calls or locale
routing. The shell change is a wrapper and a class swap.

## 3. Dashboard — the real Triad

Exactly three intents, in decision order, each wrapping content the Dashboard **already rendered**:

| Intent | Content | Real source |
|---|---|---|
| `operate` | `AttentionPanel` — critical/high alarms and assets needing attention | `buildCommandModel(snap).attention`, from the existing telemetry poll |
| `understand` | `RiskEvidence` — score, trend, factors, evidence supported/watch/missing, readiness | `model.risk`, `model.evidence`, `model.readiness` |
| `act` | `SafeActionGrid` — four existing navigation destinations | `/industrial-brain`, `/dashboard/operations`, `/dashboard/predictive`, `/dashboard/knowledge` |

**Nothing was invented.** No new action, command, mutation, backend route or acknowledge control.
The four safe actions are the four that already existed; the gate asserts no `acknowledg*` and no
`fetch(`/`useMutation(` appears anywhere in the changed scope.

`TriadGroup` types the intent as a **three-member union**, so a fourth intent is a compile error
before it is a gate failure. `TRIAD_INTENTS` is exported so the composition and the gate read one
source instead of agreeing by coincidence.

**The Beacon is conditional and never alone.** The `operate` group carries it only when
`attentionItems.length > 0` — the model's own judgement — and when it does, the posture label is
rendered as words beside it. The bar is the geometric channel; the word is the one that survives
greyscale and reaches a screen reader.

**Region ids were preserved.** `TriadGroup` accepts `id`, so the groups keep `attention-title`,
`risk-evidence-title` and `safe-actions-title` — the anchors the existing Phase 87F runtime tests
already address. No existing test was weakened to accommodate the new composition.

### Deliberately not done

- **No Horizon on the Dashboard.** Asserted three ways: no `hermes-horizon`, no `visualMode`, no
  `--color-horizon-*` in any dashboard file.
- **No Glass-on-Glass.** The Triad group is Edge-separated; its children keep their own surfaces.
  Wrapping glass around glass is the "card inside card" noise the brief forbids.
- **No new visible strings.** The groups reuse the existing section titles, so no locale catalogue
  changed and no parity risk was introduced.

## 4. Responsive, RTL, accessibility

| Viewport | Behaviour |
|---|---|
| 1440×1024 | Triad in three equal columns; Login keeps the two-column capability/form composition |
| 768×1024 | Triad becomes three columns at the `768px` breakpoint (`TRIAD.stackBelow`) |
| 390×844 | Triad stacks to one column in decision order; Login is single-column |
| 320×568 | Same stack; no fixed heights, no horizontal overflow |

The Triad stack is the **same** hierarchy, not a degraded one: reading order *is* decision order.

All new CSS uses logical properties — `inline-size`, `border-inline-start-*`, `min-inline-size` —
so Persian RTL mirrors without a second rule. The Beacon bar sits on the inline start, matching the
Rail's grammar.

Accessibility: each intent is a `<section>` with `aria-labelledby` pointing at a real `<h2>`; the
Horizon layer is `aria-hidden` and pointer-inert; the Beacon adds a textual partner rather than
replacing one; heading hierarchy (page `h1` → group `h2`) is unchanged.

## 5. Visual evidence

```text
VISUAL_ARTIFACTS=BLOCKED_OWNER_TOOLING
OWNER_VISUAL_RUN_REQUIRED=YES
OWNER_VISUAL_APPROVAL=OUTSTANDING
```

*(historical, at `f606792`, 2026-08-14)* No screenshots were captured and **no visual PASS was claimed** — superseded: the Login Horizon and Dashboard Triad were later rendered and measured on the production build (104-D2 first render, then the 104-H frozen-surface regression set, `09-…md` §8a). The blockers at the time were concrete:

- the repository contains no screenshot or e2e tooling (`puppeteer`, `playwright`, `cypress` are
  all absent from `package.json`) and this increment may not add a dependency;
- the Dashboard is authenticated-only and no database was reachable to create a session.

**Owner run instructions** (Login needs no session; Dashboard does):

```bash
npm run dev
# Login — no authentication required:
#   http://localhost:3000/en/auth/login
#   http://localhost:3000/fa/auth/login
#   http://localhost:3000/de/auth/login
# Dashboard — sign in first, then:
#   http://localhost:3000/en/dashboard
```

Check at 1440×1024, 768×1024, 390×844 and 320×568: no horizontal overflow, the Horizon band stays
in the lower fifth and never sits behind the form text, the Triad reads operate → understand → act,
and the Persian build mirrors the Beacon bar to the right edge.

## 6. Limitations

- *(historical, at `f606792`)* 104-E, 104-F, 104-H and 104-I had **not started** — **superseded:** 104-E (`b860a62`), 104-F (`ed5a1e4`), 104-H (`4e1ac5c`) implemented; 104-I outstanding (integrated head `58ed5a7`).
- Only **two** routes are `MIGRATED_DIRECTLY`. Everything else still inherits.
- *(historical, at `f606792`)* No owner visual approval, no screenshots — the 104-D2 Login/Dashboard pilot remains a pilot: bespoke composition of Login and the operational family is 104-I scope (`09-…md` §13).
- Figma unchanged: historical **181/205**, Verify / Dry Run / Apply all **not run**.
- Legacy glow utilities still ship with their two out-of-scope consumers.
- `DashboardClient`'s own `Panel` helper still carries inline `boxShadow` and `rgba()` literals.
  It was left alone deliberately: it is outside the command surface this pilot migrated, and
  changing it would widen the diff into an unbounded cleanup. Recorded, not silently skipped.

## 7. Rollback

```bash
git revert --no-commit <104-D2 commit sha>
```

Restores the flat section stack on the Dashboard and the standard auth atmosphere on Login. No
route, API, locale catalogue, contract value or dependency is affected.

## 8. Next increment boundary

104-E — operational surfaces (Command Center, Live Operations, Assets & Connectivity, Alarm
Center, Reports, Administration). **Do not start before independent review of this increment.**
