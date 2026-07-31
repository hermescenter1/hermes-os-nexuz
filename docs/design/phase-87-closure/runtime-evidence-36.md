# PHASE 87 — Runtime Evidence Pass (36 combinations)

> Deterministic runtime execution evidence for the six approved experiences ×
> FA/EN/DE × Desktop(1440×900)/Mobile(390×844) = **36 combinations, all PASS**.
> Produced by driving the real Next.js app locally; **zero runtime code changed**
> (no defect found), so this pass adds only this evidence artifact.

## ENVIRONMENT_ISOLATION

- Docker daemon **unavailable** on this Windows host and **no local PostgreSQL**
  installed → per the fallback rule, used the repository's designed **safe
  no‑DB path**: `HERMES_STORAGE_MODE=session` (in‑process memory + bundled JSON
  corpus). `DATABASE_URL` was **never set** for the runtime → **zero database
  contact of any kind** (the strongest form of "no production/real DB").
- Prisma CLI (`generate`, `db:validate`) required a value, so a **verified‑local
  placeholder** was used for the CLI only — host `localhost`, db
  `hermes_evidence_test`, synthetic creds — and Prisma does not connect during
  generate/validate. Fail‑closed check confirmed host=localhost before use.
- Dev server: `next dev` on **isolated port 3987**, `127.0.0.1` only.
- **No Production/Staging/SMTP/OpenBao/DNS/Figma contact.** No real email
  (session mode sends none; no email flow exercised). Startup validation:
  8 ok / 1 warn (REDIS absent → in‑process rate‑limiter) / **0 fatal**.

## TEST_DATABASE_PROOF / SYNTHETIC_SEED_PROOF

- No external test database exists in this environment; the app ran in
  **session mode** (no DB). This is honest: there is **no** Postgres
  migration/seed here — the "store" is the in‑process memory repository.
- **Synthetic identity**: a single seeded admin from env
  (`ADMIN_EMAIL=evidence.admin@hermes.local`, synthetic password, name
  "Evidence Admin"). No real credential or real data used.
- **Authenticated session was real**, via the app's **actual login flow**
  (`POST /api/auth`) — not a test backdoor, RBAC not bypassed. Login redirected
  to the authenticated workspace; authenticated surfaces loaded with the
  session's demo corpus (session‑mode "demo" data), not a login redirect.
  Logout via the app's real `POST /api/auth {action:"logout"}`.

## METHODOLOGY & tooling honesty

- Playwright is **not** installed. Rather than add a heavy dependency, the
  in‑app Browser pane's tools were used: real navigation, viewport resize,
  DOM/CSSOM probes, console reads. Animations/transitions were disabled per
  page (`* {animation:none;transition:none}`) for determinism.
- **Pixel screenshots could not be produced**: the Browser pane is not
  displayed in this headless context, so it does not composite frames and
  `screenshot` times out. Layout/geometry, however, compute correctly
  regardless of visibility, so the **deterministic DOM‑level checks below are
  valid** and cover every required dimension (overflow, RTL/LTR, hydration/
  console, landmarks, accessible names, form labels, German compound overflow).
  This is disclosed rather than faked.

## VISUAL_MATRIX_36 — machine‑readable

Every cell verified: `dir` (RTL for FA, LTR for EN/DE), `lang`, page horizontal
overflow `ox` (px; PASS = 0), Next dev **error overlay** absent (= no hydration/
runtime error), interactive controls with accessible names (0 unnamed), form
inputs labelled (0 unlabelled), landmarks present. **All 36 = PASS.**

```json
{
  "viewports": { "desktop": "1440x900", "mobile": "390x844" },
  "locales": { "en": "en-GB/ltr", "fa": "fa-IR/rtl", "de": "de-DE/ltr" },
  "pass": 36, "fail": 0,
  "checks_all_cells": {
    "page_horizontal_overflow_px": 0,
    "dir_correct": true,
    "next_dev_error_overlay": false,
    "controls_without_accessible_name": 0,
    "form_inputs_without_label": 0,
    "landmarks_present": true
  },
  "cells": [
    {"exp":"homepage","route":"/{loc}","auth":false,"en":{"d":"PASS","m":"PASS","h1":"Industrial Intelligence. Engineered for Action."},"fa":{"d":"PASS","m":"PASS","dir":"rtl","h1":"هوش صنعتی؛ از شواهد تا اقدام ایمن"},"de":{"d":"PASS","m":"PASS","h1":"Industrielle Intelligenz. Entwickelt für sicheres Handeln."}},
    {"exp":"platform","route":"/{loc}/platform","auth":false,"en":{"d":"PASS","m":"PASS","h1":"One architecture, from industrial data to safe action"},"fa":{"d":"PASS","m":"PASS","dir":"rtl","h1":"یک معماری، از داده صنعتی تا اقدام ایمن"},"de":{"d":"PASS","m":"PASS","h1":"Eine Architektur — von Industriedaten zu sicherem Handeln"}},
    {"exp":"login","route":"/{loc}/login → /{loc}/auth/login","auth":false,"formPresent":true,"en":{"d":"PASS","m":"PASS","h1":"Sign in to Hermes OS"},"fa":{"d":"PASS","m":"PASS","dir":"rtl","h1":"ورود به هرمس‌اواس"},"de":{"d":"PASS","m":"PASS","h1":"Bei Hermes OS anmelden"}},
    {"exp":"dashboard","route":"/{loc}/dashboard","auth":true,"en":{"d":"PASS","m":"PASS","h1":"Factory Dashboard"},"fa":{"d":"PASS","m":"PASS","dir":"rtl","h1":"داشبورد کارخانه"},"de":{"d":"PASS","m":"PASS","h1":"Werksdashboard"}},
    {"exp":"copilot","route":"/{loc}/copilot","auth":true,"en":{"d":"PASS","m":"PASS","h1":"Industrial Copilot"},"fa":{"d":"PASS","m":"PASS","dir":"rtl","h1":"کوپایلت صنعتی"},"de":{"d":"PASS","m":"PASS","h1":"Industrial Copilot (repo-intentional EN carryover)"}},
    {"exp":"industrial-brain","route":"/{loc}/brain","auth":true,"en":{"d":"PASS","m":"PASS","h1":"Industrial engineering analysis"},"fa":{"d":"PASS","m":"PASS","dir":"rtl","h1":"تحلیل مهندسی صنعتی"},"de":{"d":"PASS","m":"PASS","h1":"Industrielle Engineering-Analyse"}}
  ]
}
```

| Experience | Auth | EN‑D | EN‑M | FA‑D | FA‑M | DE‑D | DE‑M |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Homepage | – | PASS | PASS | PASS | PASS | PASS | PASS |
| Platform | – | PASS | PASS | PASS | PASS | PASS | PASS |
| Login | – | PASS | PASS | PASS | PASS | PASS | PASS |
| Dashboard | ✓ | PASS | PASS | PASS | PASS | PASS | PASS |
| Copilot | ✓ | PASS | PASS | PASS | PASS | PASS | PASS |
| Industrial Brain | ✓ | PASS | PASS | PASS | PASS | PASS | PASS |

## PROOFS

- **FA_RTL_PROOF**: every FA cell reported `dir=rtl`, `lang=fa-IR`, Persian H1s
  (e.g. «داشبورد کارخانه», «کوپایلت صنعتی», «تحلیل مهندسی صنعتی»); no page overflow;
  form inputs labelled. Logical spacing holds (no horizontal overflow either edge).
- **EN_LTR_PROOF / DE_LTR_PROOF**: every EN/DE cell `dir=ltr`, correct lang tags
  (`en-GB` / `de-DE`).
- **DE_LTR_OVERFLOW_PROOF**: German compound headings render with **zero page
  overflow at 390px mobile** — "Werksdashboard", "Industrielle Engineering‑
  Analyse", "Industrielle Intelligenz. Entwickelt für sicheres Handeln.",
  "Eine Architektur — von Industriedaten zu sicherem Handeln". `ox=0` in all DE cells.
- **CONSOLE_HYDRATION_PROOF**: Next dev **error overlay absent** on all 36 (the
  reliable hydration/runtime‑error signal). `read_console_messages(onlyErrors)`
  spot‑checked on dashboard + copilot (authenticated) = **"No console logs"**.
  No failed critical navigations (every route returned its page, not a login
  redirect for authenticated surfaces).
- **ACCESSIBILITY_PROOF**: 0 interactive controls without an accessible name,
  0 form inputs without a programmatic label, 0 `<img>` without `alt`, on every
  probed cell; landmarks present (`<main>` on every page; `<nav>`/`<header>`/
  `<footer>` on public surfaces); exactly one `<h1>` per page; login focus order
  is logical (back‑link → email → password → show‑password → submit). Reduced
  motion is honoured by the app (`@media (prefers-reduced-motion)` in globals.css).
- **RESPONSIVE_PROOF**: no page horizontal overflow at either 1440 or 390 across
  all 36 (the "no horizontal overflow 320→1920" contract holds at the tested
  bounds; decorative absolutely‑positioned glows extend past the edge but are
  clipped by their containers — page `scrollWidth == clientWidth`).

## DEFECTS_FOUND

**None.** All 36 combinations passed every check. Per rule E (code changes only
on a confirmed, reproducible defect), **no runtime code was modified**.

## Honest limitations of this pass

- **Pixel screenshots not captured** — Browser pane not displayed → no
  compositing (documented above). DOM‑level deterministic evidence stands in.
- **Session/demo mode** — authenticated surfaces render the session‑mode demo
  corpus (no Postgres available in this environment). Behaviour, RBAC, i18n,
  layout and a11y are exercised faithfully; live DB‑backed data volumes are not.
- **Full `npm run test` (4705) + `npm run build` not re‑run this pass** — the
  runtime code is **unchanged** (zero defects → zero edits; only this doc added),
  so their status equals the green baseline at HEAD `4182c05`
  (`tsc --noEmit` green; six‑surface targeted suites 77/77 green).
