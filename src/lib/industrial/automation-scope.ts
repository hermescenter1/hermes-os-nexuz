/**
 * PHASE 109-C-UI.2-R3 — the execution contract for an intelligence automation run.
 *
 * Pure: no database, no session, no clock beyond what is passed in. Everything
 * the route decides before it is allowed to write anything lives here, so the
 * decision can be attacked in a test without standing up a request.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS MODULE EXISTS TO ENFORCE
 * ─────────────────────────────────────────────────────────────────────────────
 * A run is SITE-scoped unless someone explicitly, provably and accountably asks
 * for the whole organisation. There is no third state, and in particular there
 * is no "no scope given, so do everything" — an absent scope is a refusal, never
 * a widening. Every function below fails closed.
 *
 * The owner's ruling (R3): for large commercial industry, the default execution
 * scope is the selected site; organisation-wide execution is an exceptional,
 * explicit, limited and audited capability.
 */

/** SITE is the default everywhere. ORGANISATION is never inferred. */
export type ScopeMode = "SITE" | "ORGANISATION";

export const ALL_SCOPE_MODES: readonly ScopeMode[] = ["SITE", "ORGANISATION"] as const;

/**
 * The organisation permission that authorises an organisation-wide run.
 *
 * Deliberately NOT `manage_industrial`. That permission is held by OWNER, ADMIN
 * and MANAGER and means "administer the industrial registry"; it was never a
 * statement that the holder may act on every site. Phase 99 already ruled on
 * that distinction for `POST /api/industrial/assets`, where `manage_industrial`
 * alone was found insufficient to write to a site the caller has no grant for.
 */
export const ORG_WIDE_PERMISSION = "run_industrial_automation_org_wide" as const;

/** The API-key scope with the same meaning on the machine axis. */
export const ORG_WIDE_SCOPE = "industrial.run_org_wide" as const;

/**
 * Closed set of refusal codes.
 *
 * Closed on purpose: an error string assembled at the throw site leaks whatever
 * the developer happened to have in scope. These are the only things this
 * surface will ever say, and none of them names a resource the caller may not
 * already see.
 */
export type RunRefusalCode =
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_INVALID"
  | "SCOPE_MODE_INVALID"
  | "SITE_ID_REQUIRED"
  | "SITE_ID_INVALID"
  | "SITE_ID_NOT_PERMITTED"
  | "SITE_NOT_ACTIVE"
  | "ORG_WIDE_NOT_PERMITTED"
  | "ORG_WIDE_CONFIRMATION_REQUIRED"
  | "ORG_WIDE_REASON_REQUIRED"
  | "SITE_ID_NOT_ALLOWED_IN_ORG_MODE"
  | "MALFORMED_REQUEST"
  | "SCOPE_BUSY"
  | "NO_ACCESSIBLE_SITE";

export interface RunRefusal {
  readonly ok: false;
  readonly code: RunRefusalCode;
  readonly status: number;
  /** Present only for the two-step confirmation challenge. */
  readonly challenge?: OrgWideChallenge;
}

/** What the caller is told before an organisation-wide run may proceed. */
export interface OrgWideChallenge {
  readonly scopeMode: "ORGANISATION";
  readonly siteIds: readonly string[];
  readonly siteCount: number;
  /** Echoed back so step 2 is provably a confirmation OF THIS challenge. */
  readonly idempotencyKey: string;
  readonly confirmField: "confirmOrganisationWide";
  readonly reasonRequired: true;
}

export interface RunRequest {
  readonly scopeMode: ScopeMode;
  /** Exactly one site in SITE mode; null in ORGANISATION mode. Never a wildcard. */
  readonly siteId: string | null;
  readonly idempotencyKey: string;
  readonly reason: string | null;
  readonly confirmOrganisationWide: boolean;
}

export type RunRequestResult = { readonly ok: true; readonly request: RunRequest } | RunRefusal;

const refuse = (code: RunRefusalCode, status: number, challenge?: OrgWideChallenge): RunRefusal => ({
  ok: false,
  code,
  status,
  ...(challenge ? { challenge } : {}),
});

/**
 * Identifier syntax accepted anywhere in this contract.
 *
 * cuid/uuid shaped: letters, digits, `_` and `-`, 8..64 characters. Deliberately
 * strict — it rejects an empty string, a whitespace-only string, a path
 * traversal and anything carrying a quote before either value reaches a query.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Idempotency keys are caller-chosen, so they are allowed to be longer. */
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_.:-]{16,128}$/;

export function isValidIdentifier(v: unknown): v is string {
  return typeof v === "string" && ID_PATTERN.test(v);
}

export function isValidIdempotencyKey(v: unknown): v is string {
  return typeof v === "string" && IDEMPOTENCY_PATTERN.test(v);
}

/**
 * Read a field that may legitimately appear in the body or the query string.
 *
 * A value present in BOTH is ambiguous, and ambiguity about the scope of a
 * destructive-adjacent operation resolves to a refusal, never to one of the two
 * candidates. The same rule the Live Operations filter parser uses for repeated
 * query parameters.
 */
export function readSingle(
  body: Record<string, unknown> | null,
  query: URLSearchParams,
  field: string,
): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
  const fromQuery = query.getAll(field);
  if (fromQuery.length > 1) return { ok: false };
  const inBody = body !== null && Object.prototype.hasOwnProperty.call(body, field);
  if (inBody && fromQuery.length === 1) return { ok: false };
  if (inBody) {
    const v = body![field];
    if (v === null || v === undefined) return { ok: true, value: null };
    if (typeof v !== "string" && typeof v !== "boolean") return { ok: false };
    return { ok: true, value: String(v) };
  }
  return { ok: true, value: fromQuery.length === 1 ? fromQuery[0] : null };
}

export interface ParseContext {
  /** Sites this caller may act on. `null` means "no user" (an API key). */
  readonly allowedSiteIds: readonly string[] | null;
  /** True when the caller holds the organisation-wide capability. */
  readonly mayRunOrgWide: boolean;
}

/**
 * Turn a request into an authorised scope, or refuse it.
 *
 * Order is load-bearing and every step fails closed:
 *   1. idempotency key   — no key, no run: a retry must be recognisable
 *   2. scope mode        — unrecognised text is refused, never coerced to SITE
 *   3. ORGANISATION      — capability, then confirmation, then reason
 *   4. SITE              — presence, syntax, then membership of the caller's set
 */
export function parseRunRequest(
  body: Record<string, unknown> | null,
  query: URLSearchParams,
  ctx: ParseContext,
): RunRequestResult {
  const key = readSingle(body, query, "idempotencyKey");
  if (!key.ok) return refuse("MALFORMED_REQUEST", 400);
  if (key.value === null) return refuse("IDEMPOTENCY_KEY_REQUIRED", 400);
  if (!isValidIdempotencyKey(key.value)) return refuse("IDEMPOTENCY_KEY_INVALID", 400);

  const rawMode = readSingle(body, query, "scopeMode");
  if (!rawMode.ok) return refuse("MALFORMED_REQUEST", 400);
  // Absent means SITE. Present-but-unrecognised is a refusal: silently reading
  // "ORG", "organisation " or "" as one of the two modes is how a typo becomes
  // an organisation-wide write.
  const scopeMode: ScopeMode | null =
    rawMode.value === null
      ? "SITE"
      : (ALL_SCOPE_MODES as readonly string[]).includes(rawMode.value)
        ? (rawMode.value as ScopeMode)
        : null;
  if (scopeMode === null) return refuse("SCOPE_MODE_INVALID", 400);

  const rawSite = readSingle(body, query, "siteId");
  if (!rawSite.ok) return refuse("MALFORMED_REQUEST", 400);

  const rawReason = readSingle(body, query, "reason");
  if (!rawReason.ok) return refuse("MALFORMED_REQUEST", 400);

  const rawConfirm = readSingle(body, query, "confirmOrganisationWide");
  if (!rawConfirm.ok) return refuse("MALFORMED_REQUEST", 400);
  const confirmed = rawConfirm.value === "true";

  if (scopeMode === "ORGANISATION") {
    // A site id alongside ORGANISATION mode is a contradiction, and guessing
    // which one the caller meant is exactly the guess this contract forbids.
    if (rawSite.value !== null) return refuse("SITE_ID_NOT_ALLOWED_IN_ORG_MODE", 400);

    // Capability FIRST. A caller without it never learns how many sites exist,
    // so the challenge cannot be used to enumerate the estate.
    if (!ctx.mayRunOrgWide) return refuse("ORG_WIDE_NOT_PERMITTED", 403);

    const sites = ctx.allowedSiteIds;
    if (sites !== null && sites.length === 0) return refuse("NO_ACCESSIBLE_SITE", 403);

    if (!confirmed) {
      return refuse("ORG_WIDE_CONFIRMATION_REQUIRED", 412, {
        scopeMode: "ORGANISATION",
        siteIds: sites ?? [],
        siteCount: sites?.length ?? 0,
        idempotencyKey: key.value,
        confirmField: "confirmOrganisationWide",
        reasonRequired: true,
      });
    }

    const reason = rawReason.value === null ? "" : rawReason.value.trim();
    if (reason.length < 8 || reason.length > 500) return refuse("ORG_WIDE_REASON_REQUIRED", 400);

    return {
      ok: true,
      request: {
        scopeMode: "ORGANISATION",
        siteId: null,
        idempotencyKey: key.value,
        reason,
        confirmOrganisationWide: true,
      },
    };
  }

  // ── SITE mode ────────────────────────────────────────────────────────────
  if (rawSite.value === null) return refuse("SITE_ID_REQUIRED", 400);
  // Covers "", "   ", "../other", "a'; DROP" and every id shorter than 8 chars.
  if (!isValidIdentifier(rawSite.value)) return refuse("SITE_ID_INVALID", 400);

  const allowed = ctx.allowedSiteIds;
  if (allowed !== null) {
    if (allowed.length === 0) return refuse("NO_ACCESSIBLE_SITE", 403);
    // 404-shaped at the route: a site the caller may not use is answered the
    // same way as a site that does not exist, so the status code cannot be used
    // to enumerate the organisation's sites.
    if (!allowed.includes(rawSite.value)) return refuse("SITE_ID_NOT_PERMITTED", 404);
  }

  return {
    ok: true,
    request: {
      scopeMode: "SITE",
      siteId: rawSite.value,
      idempotencyKey: key.value,
      reason: rawReason.value === null ? null : rawReason.value.trim().slice(0, 500) || null,
      confirmOrganisationWide: false,
    },
  };
}

/**
 * The value the database's partial unique index is built on.
 *
 * A `UNIQUE(organizationId, siteId)` over a nullable column would let two
 * ORGANISATION-mode runs both pass, because PostgreSQL treats NULLs as
 * distinct. `"*"` is not a site id — `ID_PATTERN` rejects it — so it can never
 * collide with a real one.
 */
export function scopeKey(request: Pick<RunRequest, "scopeMode" | "siteId">): string {
  return request.scopeMode === "ORGANISATION" ? "*" : (request.siteId as string);
}

/* ── counters (F-06) ──────────────────────────────────────────────────────── */

export interface RunCounters {
  assetsDiscovered: number;
  assetsAttempted: number;
  assetsProcessed: number;
  assetsFailed: number;
  snapshotsCreated: number;
  riskScoresCreated: number;
  alertsCreated: number;
  recommendationsCreated: number;
}

export function emptyCounters(): RunCounters {
  return {
    assetsDiscovered: 0,
    assetsAttempted: 0,
    assetsProcessed: 0,
    assetsFailed: 0,
    snapshotsCreated: 0,
    riskScoresCreated: 0,
    alertsCreated: 0,
    recommendationsCreated: 0,
  };
}

/**
 * Are these counters internally consistent?
 *
 * F-06 was `assetsProcessed` reporting the number of assets FETCHED: with every
 * asset failing, the response still claimed three processed alongside three
 * errors. The name was a claim the value did not support.
 *
 * Discovered ≥ attempted, attempted = processed + failed, and nothing was
 * created for an asset that never succeeded. A run that cannot satisfy this is
 * mis-counting and says so rather than publishing the numbers.
 */
export function countersAreConsistent(c: RunCounters): boolean {
  const nonNegative = Object.values(c).every((n) => Number.isInteger(n) && n >= 0);
  if (!nonNegative) return false;
  if (c.assetsAttempted > c.assetsDiscovered) return false;
  if (c.assetsProcessed + c.assetsFailed !== c.assetsAttempted) return false;
  if (c.assetsProcessed === 0 && (c.snapshotsCreated > 0 || c.riskScoresCreated > 0)) return false;
  if (c.snapshotsCreated > c.assetsProcessed) return false;
  return true;
}
