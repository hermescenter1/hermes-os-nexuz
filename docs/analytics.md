# Hermes OS — Analytics & Growth Platform

Phase 63 · Enterprise Analytics · Google Analytics 4 + Google Tag Manager

---

## Overview

Hermes OS integrates Google Analytics 4 (GA4) and Google Tag Manager (GTM) with full GDPR compliance.
Analytics only activates after the user grants analytics cookie consent via the Cookie Consent Banner.
No personal data (PII) is ever collected.

---

## Environment Variables

Add to `.env.local` (development) or your deployment environment (production):

```
# Google Analytics 4 Measurement ID
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Google Tag Manager Container ID (optional — independent of GA4)
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
```

Either or both can be set. If neither is set, analytics is completely disabled and no Google scripts are loaded.

---

## How It Works

### 1. Consent Check
On every page load, `AnalyticsProvider` (mounted in the root locale layout) fetches
`/api/compliance/cookie-consent` to read the current session's consent preferences.

- If `analytics: true` → GA4 and GTM scripts are loaded
- If `analytics: false` or no consent → No scripts are loaded, no data collected

### 2. Consent Events
When the user updates cookie preferences via the Cookie Consent Banner, a
`hermes:consent-updated` browser event is dispatched. `AnalyticsProvider` listens
for this event and enables/disables analytics in real time without a page reload.

When consent is revoked, `gtag('consent', 'update', { analytics_storage: 'denied' })`
is called, signaling GA4 to stop collecting immediately.

### 3. Script Loading
- `GoogleAnalytics.tsx` loads `gtag.js` via `<Script strategy="afterInteractive">`.
  The script is never loaded until consent is given.
- `GoogleTagManager.tsx` creates the GTM script element programmatically in a `useEffect`,
  also gated by consent.
- All script loading is dynamic (client-side), avoiding any impact on server-rendered HTML
  or Lighthouse performance scores.

### 4. CSP (Content Security Policy)
The middleware CSP is automatically extended when analytics env vars are set:

- `script-src`: adds `https://www.googletagmanager.com https://www.google-analytics.com`
- `connect-src`: adds GA4 collection endpoints
- `img-src`: adds GA beacon image domain

If no analytics env vars are set, the CSP remains unchanged (maximum strictness).

---

## Tracked Events

| Event | Trigger |
|---|---|
| `login` | User signs in |
| `logout` | User signs out |
| `sign_up` | New account registered |
| `candidate_registration` | Candidate portal registration |
| `apply_job` | Job application submitted |
| `enroll_course` | Academy course enrolled |
| `download_certificate` | Certificate downloaded |
| `contact_form_submit` | Contact form submitted |
| `search` | Site search performed |
| `knowledge_graph_search` | Knowledge graph queried |
| `brain_query` | AI Brain queried |
| `platform_demo_request` | Demo requested |

Plus GA4 automatic events: `page_view`, `scroll`, `session_start`, `first_visit`.

### Sending Events in Code

```typescript
import { track } from "@/lib/analytics/events";

// Login
track.login("email");

// Job application
track.applyJob(job.id, job.title);

// Academy enrollment
track.enrollCourse(course.id, course.name);

// Search
track.search(searchTerm);
```

All tracking functions are no-ops if GA is not initialized or consent was not given.
**Never pass email addresses, user IDs, or any PII as event parameters.**

---

## Admin Dashboard

Route: `/fa/admin/analytics` or `/en/admin/analytics`

Requires `admin` role. Shows:
- GA4 configuration status and masked Measurement ID
- GTM configuration status and masked Container ID
- Consent integration status
- GDPR compliance indicators
- Full event catalog
- Setup instructions

---

## Privacy Guarantees

- `anonymize_ip: true` is set on all GA4 configurations
- No user IDs, emails, passwords, tokens, or JWT content is ever sent
- Events use only opaque item IDs (not linked to personal records)
- All tracking functions are consent-gated — they are no-ops before consent
- GTM only activates when analytics consent is explicitly granted

---

## Verification Checklist

After setting environment variables:

1. **Check CSP:** Open DevTools → Network → reload → check `content-security-policy`
   header includes `googletagmanager.com`

2. **Check consent gate:** Without accepting analytics cookies, open DevTools → Network
   — no requests to `google-analytics.com` should appear

3. **Check after consent:** Accept analytics cookies → DevTools → Network → should see
   requests to `google-analytics.com/g/collect`

4. **Real-time GA4:** In Google Analytics → Reports → Realtime — should show active user
   within 60 seconds of accepting consent

5. **GTM Preview:** In GTM → Preview → enter site URL — should see tag firing events
   (if GTM_ID is configured)

6. **Admin Dashboard:** Visit `/admin/analytics` — should show "Configured" for each
   env var that was set

---

## Env Variable Reference

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional | GA4 Measurement ID (format: G-XXXXXXXXXX) |
| `NEXT_PUBLIC_GTM_ID` | Optional | GTM Container ID (format: GTM-XXXXXXX) |

Both are optional. The platform runs fully without analytics if neither is set.
