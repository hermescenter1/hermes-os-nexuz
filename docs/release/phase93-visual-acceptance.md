# Phase 93 — Observability Control Room · Visual Acceptance

Scope: visual acceptance of `/{locale}/admin/observability` (the productionized
SRE Control Room). Captured against the exact branch HEAD, through the **real
authentication and data contracts** — no mocked payloads, no injected metrics,
no auth bypass.

## Method (all real, all local, no production)

- **Disposable database:** `pgvector/pgvector:pg16` in a throwaway container
  (`hermes-p93-visual-pg`, localhost:5544). Real repository migrations applied
  with `prisma migrate deploy` (48 migrations).
- **Synthetic admin via real contracts:** created with the repository's real
  password hashing (`hashArgon2` = argon2id) and the real Prisma `User` model
  (`role = "admin"`, `emailVerified`). No hardcoded session.
- **Real authentication:** logged in through the real `POST /api/auth` flow
  (argon2 verification → server-issued, sid-bound session cookie). The admin
  page is reached through the unmodified `RequireCapability("admin")` guard — no
  bypass, no temporary route.
- **Real observable activity:** generated only through legitimate flows —
  readiness probes (`/api/health/ready` → `dependency_up` + `dependency_latency_ms`),
  failed + successful `POST /api/auth` (auth-failure / security / session events),
  and the resulting AuditLog rows. Charts render only from these real signals.
- **Capture:** headless Chromium (real browser) at each viewport; per cell we
  record `<html lang/dir>`, h1 count, `main`/`nav` landmarks, document horizontal
  overflow, console errors, page errors, presence of the honest NOT_INSTRUMENTED
  HTTP panels, and keyboard-focus visibility (Tab → focused control outline).
  Screenshots are full-page PNG artifacts under `phase93-visual-evidence/`.

## Defect found & fixed during acceptance

Two concrete defects were revealed by the capture and fixed (only those):

1. **RSC boundary crash** — the audit-explorer received a function prop
   (`results: (shown,total)=>…`) across the server→client boundary, which React
   forbids; the page fell back to its error boundary. Fixed by passing a
   pre-translated template (`resultsTemplate` with `__SHOWN__`/`__TOTAL__`
   sentinels) and interpolating client-side. (`AuditExplorer.tsx`, `console-view.tsx`)
2. **Mobile horizontal overflow (en/de)** — the shared marketing header/ambient
   background overshot a narrow viewport by 5–18 px (worse for longer German
   strings) under classic scrollbars. Fixed with an **opt-in** `clipX` prop on
   `PageShell` (`overflow-x: clip` — not `hidden`, so the sticky header keeps
   working); only the observability page enables it, so no other page changes.

After the fixes the full matrix re-ran clean.

## Evidence matrix — 6/6 PASS

| Cell | Viewport | lang / dir | h1 | overflow | console | page err | main / nav | panels | focus | NOT_INSTRUMENTED | Screenshot | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FA desktop | 1440×900 | fa-IR / rtl | 1 (`اتاق کنترل SRE`) | 0 | 0 | 0 | 1 / 1 | 18 | outline 3px | honest empty | `phase93-visual-evidence/obs-fa-desktop.png` | **PASS** |
| FA mobile | 390×844 | fa-IR / rtl | 1 (`اتاق کنترل SRE`) | 0 | 0 | 0 | 1 / 1 | 18 | outline 2px | honest empty | `phase93-visual-evidence/obs-fa-mobile.png` | **PASS** |
| EN desktop | 1440×900 | en-GB / ltr | 1 (`SRE Control Room`) | 0 | 0 | 0 | 1 / 1 | 18 | outline 3px | honest empty | `phase93-visual-evidence/obs-en-desktop.png` | **PASS** |
| EN mobile | 390×844 | en-GB / ltr | 1 (`SRE Control Room`) | 0 | 0 | 0 | 1 / 1 | 18 | outline 2px | honest empty | `phase93-visual-evidence/obs-en-mobile.png` | **PASS** |
| DE desktop | 1440×900 | de-DE / ltr | 1 (`SRE-Leitstand`) | 0 | 0 | 0 | 1 / 1 | 18 | outline 3px | honest empty | `phase93-visual-evidence/obs-de-desktop.png` | **PASS** |
| DE mobile | 390×844 | de-DE / ltr | 1 (`SRE-Leitstand`) | 0 | 0 | 0 | 1 / 1 | 18 | outline 2px | honest empty | `phase93-visual-evidence/obs-de-mobile.png` | **PASS** |

Raw metrics: `phase93-visual-evidence/capture-results.json`.

## Per-requirement verification

- **Correct lang & dir:** `fa-IR/rtl`, `en-GB/ltr`, `de-DE/ltr` — verified per cell.
- **Horizontal overflow = 0:** `documentElement.scrollWidth − clientWidth = 0` in every cell.
- **Console errors = 0 / hydration errors = 0:** zero `console.error` and zero
  `pageerror` captured during each load (a hydration mismatch surfaces as a
  console error; none observed).
- **Exactly one h1:** the localized page title is the sole `<h1>` in every cell.
- **main / navigation landmarks:** one `<main>` and one navigation landmark per cell.
- **Visible keyboard focus:** Tabbing into the page moves focus to a control with
  a solid 2–3 px outline (the DS focus ring) — visible in every cell.
- **Readable charts, cards, tables:** KPI header, dependency topology, real
  dependency-latency stats, error/security/auth/session/alert bars, recent-security
  and error-fingerprint tables, and the audit explorer all render legibly (see PNGs).
- **Honest NOT_INSTRUMENTED HTTP panels:** the HTTP request-rate and request-latency
  panels render an explicit "Not instrumented / Nicht instrumentiert /
  ابزارگذاری‌نشده" state with a dashed placeholder, the data source and the operator
  action — **never a fabricated 0**.
- **No fabricated zero values:** active charts show only recorded signals; metrics
  with no recording render an empty-state, not a zero bar (proven by
  `phase93-console-logic.test.ts`).
- **Professional empty/degraded states:** e.g. "No backup found / Keine Sicherung
  gefunden / پشتیبانی یافت نشد" and "Startup validation did not run" render as
  designed panels, not blank boxes.
- **No clipping of Persian or German text:** verified in the FA (RTL) and DE
  (long compounds) screenshots.
- **Mobile navigation usability:** at 390 px the shell header/footer and the
  dashboard remain usable with no horizontal scroll.
- **Real data present:** the audit explorer shows real AuditLog rows produced by
  the test-run (login.success / login.failure / rate-limiter degradation); the
  dependency-latency panel shows real database probe latency; the topology shows
  the live PostgreSQL probe (Up) and the honest "Not configured" Redis state.

## Result

```
VISUAL_MATRIX = 6/6 PASS
VISUAL_ACCEPTANCE_BLOCKED_BY_ENVIRONMENT = NO
PR_STATUS = Draft
PRODUCTION_CONTACTED = NO
OPENBAO_CHANGED = NO
```
