/**
 * PHASE 99 — declared non-authenticated surfaces.
 *
 * The route classifier is fail-closed: a handler with no authorization evidence
 * in its own body is UNKNOWN, and UNKNOWN fails readiness. This file is the ONLY
 * way a handler leaves that state without proving a guard call — which is
 * exactly why every entry carries a written justification naming what the
 * handler actually returns.
 *
 * A justification is not a formality. Each of these was read during the Phase 99
 * review, and three of them were found to be wrong and were FIXED rather than
 * declared (see findings P99-INT-004, -005 and -006 — a public detail endpoint
 * that returned unpublished cross-tenant records is not a public surface, it is
 * a defect). What remains here returns published content, static fixtures,
 * derived aggregates, or is a pre-authentication credential flow.
 *
 * Adding an entry is a security decision. Adding one to silence the evaluator,
 * rather than because the handler genuinely exposes nothing, defeats the gate.
 */

/** Liveness/readiness probes: no state, no identifiers, safe for a load balancer. */
export const HEALTH_SURFACE = [
  {
    path: "/api/health",
    methods: ["GET"],
    justification: "Liveness only. Returns the literal {status:'ok'} — no dependency state, no identifiers. Wired as the container healthcheck.",
  },
  {
    path: "/api/health/ready",
    methods: ["GET"],
    justification: "Traffic-gate readiness. Returns booleans and a status string; dependency errors go to the log, never to the response body.",
  },
];

/**
 * Machine-to-machine endpoints authenticated by a shared secret or signature
 * rather than a session. The classifier independently verifies that each one
 * actually performs a cryptographic sender check.
 */
export const WEBHOOK_SURFACE = [
  {
    path: "/api/billing/webhooks/stripe",
    methods: ["POST"],
    justification: "Stripe webhook. Sender authenticated by HMAC signature with timestamp tolerance over the raw body; the organization is resolved from the locally stored subscription, never from the payload; replays are rejected by a unique (provider, providerEventId) claim.",
  },
  {
    path: "/api/seo/indexnow",
    methods: ["POST"],
    justification: "Secret-gated search-engine submission trigger. Sender authenticated by a length-guarded constant-time comparison against INDEXNOW_TRIGGER_SECRET; fails closed with 503 when the secret is unset, is rate limited, and submits only canonical-host URLs.",
  },
];

/**
 * Deliberately public surfaces. `PUBLIC_READ` for safe methods, `PUBLIC_WRITE`
 * for the rest — the classifier derives which from the method.
 */
export const PUBLIC_SURFACE = [
  // ── Published editorial content ──────────────────────────────────────────
  {
    path: "/api/articles",
    methods: ["GET"],
    justification: "Public article listing. The query pins status PUBLISHED and visibility PUBLIC; page size is clamped (P99-INT-010).",
  },
  {
    path: "/api/articles/authors",
    methods: ["GET"],
    justification: "Public author directory. Only active authors who have at least one PUBLISHED, PUBLIC article are returned.",
  },
  {
    path: "/api/articles/feed",
    methods: ["GET"],
    justification: "Public syndication feed. PUBLISHED and PUBLIC only, bounded to 50 rows.",
  },
  {
    path: "/api/articles/trending",
    methods: ["GET"],
    justification: "Public trending list. PUBLISHED and PUBLIC only, limit clamped to 50.",
  },
  {
    path: "/api/media/public/videos",
    methods: ["GET"],
    justification:
      "Public video library (Phase 102). The PUBLISHED + PUBLIC + processingState READY predicate is applied by the repository default in src/lib/media/db.ts, not by the route, so no caller can forget it; the editorial opt-out is a separate typed argument this route never passes. Page size is clamped and the projection is an explicit whitelist that omits organizationId, storage keys and every editorial field.",
  },
  {
    path: "/api/media/public/videos/[slug]",
    methods: ["GET"],
    justification:
      "Public video detail (Phase 102). Same repository-enforced PUBLISHED + PUBLIC + READY predicate as the library. A draft, archived, quarantined or other-tenant slug answers 404 rather than 403, so the endpoint is not an existence oracle. Bytes are never served here — playback goes through the separately-gated /api/media/assets/[id]/stream route.",
  },
  {
    // Declared explicitly because the derived classification UNDERSTATES it.
    // The handler calls `getUserIdFromRequest`, which the classifier reads as a
    // user-scope token and labels AUTHENTICATED_USER — but that helper returns
    // null for an anonymous caller and the view is still recorded. This is a
    // genuine anonymous WRITE surface, and an inventory that hides that defeats
    // the artifact's purpose.
    path: "/api/media/public/videos/[slug]/view",
    methods: ["POST"],
    justification:
      "Anonymous playback beacon (Phase 102). Deliberately accepts unauthenticated writes: identity is read from the caller's own cookie or is null, and the Zod body schema carries no subject field, so a hostile client can only attribute a view to itself. Reaches only PUBLISHED + PUBLIC + READY assets via the same repository predicate. Stores ipHash only — never a raw IP. Rate-limited on resolveClientIp (X-Real-IP), body bounded, non-JSON content types refused.",
  },
  {
    path: "/api/vendors",
    methods: ["GET"],
    justification: "Public vendor directory. Pinned to APPROVED, active, not-deleted rows and clamped to 100.",
  },
  {
    path: "/api/vendors/[id]",
    methods: ["GET"],
    justification: "Public vendor profile. Same APPROVED/active/not-deleted predicate as the directory.",
  },
  {
    path: "/api/careers/jobs",
    methods: ["GET"],
    justification: "Public job listing. The query pins status OPEN and isPublic true.",
  },
  {
    path: "/api/careers/jobs/[jobId]",
    methods: ["GET"],
    justification: "Public job detail. Enforces status OPEN and isPublic true in the handler and answers 404 otherwise, so it is not an existence oracle (added by P99-INT-004; it previously returned drafts).",
  },
  {
    path: "/api/billing/plans",
    methods: ["GET"],
    justification: "Public price list. Active plan catalogue only — no tenant, subscription or usage state.",
  },
  {
    path: "/api/compliance/legal-documents/[type]",
    methods: ["GET"],
    justification: "Public legal documents. Pinned to organizationId null, isPublished, lifecycle PUBLISHED and an effective date in the past, projected through a public DTO.",
  },

  // ── Static product fixtures (no tenant data reaches these) ───────────────
  {
    path: "/api/ats/analytics",
    methods: ["GET"],
    justification: "Reads only the static ATS demo fixtures in src/lib/ats/mock-data. No database access, no tenant data.",
  },
  { path: "/api/ats/candidates", methods: ["GET"], justification: "Static ATS demo fixtures only (example.com placeholders). No database access, no real personal data." },
  { path: "/api/ats/jobs", methods: ["GET"], justification: "Static ATS demo fixtures only. The write path on the same route is authorization-gated." },
  { path: "/api/ats/overview", methods: ["GET"], justification: "Aggregates computed from the static ATS demo fixtures. No database access." },
  { path: "/api/ats/pipeline", methods: ["GET"], justification: "Aggregates computed from the static ATS demo fixtures. No database access." },
  { path: "/api/customers/accounts", methods: ["GET"], justification: "Static customer-success demo fixtures in src/lib/customers/mock-data. No database access, no real customer data." },
  { path: "/api/customers/health", methods: ["GET"], justification: "Derived from the static customer-success demo fixtures. No database access." },
  { path: "/api/customers/overview", methods: ["GET"], justification: "Derived from the static customer-success demo fixtures. No database access." },
  { path: "/api/customers/risks", methods: ["GET"], justification: "Derived from the static customer-success demo fixtures. No database access." },
  { path: "/api/customers/success-plans", methods: ["GET"], justification: "Static customer-success demo fixtures. No database access." },
  { path: "/api/customers/usage", methods: ["GET"], justification: "Derived from the static customer-success demo fixtures. No database access." },
  {
    path: "/api/telemetry",
    methods: ["GET"],
    justification: "Pure mathematical simulator (simulateSnapshot). Imports only a type; reaches no gateway, device or database.",
  },

  // ── Derived public engineering graph ─────────────────────────────────────
  {
    path: "/api/eng-graph",
    methods: ["GET"],
    justification: "Engineering graph built from the static vendor catalogue plus PUBLISHED knowledge/case records only. Unpublished rows are excluded from the response. Compute cost is tracked as open finding P99-INT-011.",
  },
  { path: "/api/eng-graph/edges", methods: ["GET"], justification: "Same builder and published-only filter as /api/eng-graph." },
  { path: "/api/eng-graph/node/[id]", methods: ["GET"], justification: "Same builder and published-only filter as /api/eng-graph; serves a single derived node." },
  { path: "/api/eng-graph/nodes", methods: ["GET"], justification: "Same builder and published-only filter as /api/eng-graph." },
  { path: "/api/eng-graph/stats", methods: ["GET"], justification: "Counts derived from the engineering graph. No record content is returned." },
  { path: "/api/operations/alerts", methods: ["GET"], justification: "Derived from the engineering graph and the static platform catalogue. No tenant records." },
  { path: "/api/operations/intelligence", methods: ["GET"], justification: "Derived from the engineering graph and static platform facts. No tenant records." },
  { path: "/api/operations/overview", methods: ["GET"], justification: "Aggregates derived from the engineering graph. No tenant records." },
  { path: "/api/operations/sites", methods: ["GET"], justification: "Vendor zones derived from the static catalogue. No tenant records." },
  { path: "/api/operations/war-room", methods: ["GET"], justification: "Derived from the engineering graph. No tenant records." },

  // ── Public demo + verification surfaces ──────────────────────────────────
  {
    path: "/api/copilot/demo",
    methods: ["GET", "POST"],
    justification: "Anonymous product demo. GET returns an empty history and touches no database; POST runs a deterministic in-process pipeline with no Prisma, provider or model call. Both are rate limited, and POST bounds the body and checks the media type.",
  },
  {
    path: "/api/industrial-brain/analyze",
    methods: ["POST"],
    justification: "Anonymous deterministic fault analysis. The analyzer reaches no database, provider or model and echoes only the caller's own input. Rate limit, media-type check and bounded body added by P99-INT-012.",
  },
  {
    path: "/api/academy/certificates/[id]",
    methods: ["GET"],
    justification: "Certificate verification by capability token. The path segment IS the credential: an unguessable randomUUID verification token that the holder chooses to share. Expiry is enforced (P99-INT-013).",
  },
  {
    path: "/api/seo/indexnow",
    methods: ["GET"],
    justification: "Reports whether the IndexNow trigger is configured. Returns booleans and the canonical host only — never the key or any part of it.",
  },

  // ── Consent (must remain reachable before authentication) ────────────────
  {
    path: "/api/compliance/cookie-consent",
    methods: ["GET", "POST"],
    justification: "Cookie consent is collected before login, so it cannot require authentication. The subject is identified only by an opaque server-minted consent id, the authentication cookie is never read or written, and the response projects consent preferences only (P99-INT-001, P99-INT-002).",
  },

  // ── Pre-authentication credential flows ──────────────────────────────────
  {
    path: "/api/auth/register",
    methods: ["POST"],
    justification: "Public self-registration is DISABLED: the handler returns 403 with no logic behind it.",
  },
  {
    path: "/api/auth/access-request",
    methods: ["POST"],
    justification: "Access request for a closed platform. Rate limited and honeypot-guarded; writes a SalesLead only and never creates a User or grants any access.",
  },
  {
    path: "/api/auth/accept-invite",
    methods: ["POST"],
    justification: "Invitation redemption. The single-use hashed invitation token is the credential, and the granted role comes from the invitation record, never from the request. Rate limited per client IP.",
  },
  {
    path: "/api/auth/forgot-password",
    methods: ["POST"],
    justification: "Password-reset initiation. Rate limited, and the response is identical whether or not the address exists, so it does not enumerate accounts.",
  },
  {
    path: "/api/auth/reset-password",
    methods: ["POST"],
    justification: "Password-reset completion. The single-use reset token is the credential; rate limited.",
  },
  {
    path: "/api/auth/verify-email",
    methods: ["POST"],
    justification: "Email verification. The single-use verification token is the credential; rate limited.",
  },
  {
    path: "/api/candidate/register",
    methods: ["POST"],
    justification: "Candidate self-registration for the public careers portal. Rate limited, media-type checked and body-bounded; creates only a candidate-scoped identity.",
  },
  {
    path: "/api/careers/apply",
    methods: ["POST"],
    justification: "Public job application. Rate limited, media-type checked and body-bounded; the organization is taken from the job record, never from the request.",
  },
  {
    path: "/api/vendors/apply",
    methods: ["POST"],
    justification: "Public vendor onboarding request. Rate limited, media-type checked and body-bounded, and no longer reads or stores the authentication cookie (P99-INT-009). Creates a pending request that an administrator must approve.",
  },
  {
    path: "/api/sales/leads",
    methods: ["POST"],
    justification: "Public contact form. Honeypot-guarded and rate limited on an un-spoofable client IP (P99-INT-008); writes a SalesLead only.",
  },
];
