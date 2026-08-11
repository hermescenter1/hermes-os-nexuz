/**
 * PHASE 99 — tenant-predicate and IDOR analysis.
 *
 * Tenant isolation in this codebase rests on one rule: the acting organization
 * is DERIVED on the server from the authenticated actor, and is never read from
 * the request. A handler that takes `organizationId` from a body or query string
 * has no isolation at all, however many guards it calls.
 *
 * The OT subsystem already had a static test asserting exactly this for its 17
 * routes. Phase 99 generalises it to every tenant-bound handler in the API, and
 * adds the object-level check: a handler that looks a record up by a path
 * parameter must also reference the server-derived scope, or the lookup is a
 * direct object reference with nothing scoping it.
 *
 * Fail-closed: a handler that cannot be shown to satisfy both rules is reported,
 * not assumed compliant.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildRouteInventory, stripComments, HTTP_METHODS, REPO_ROOT } from "./route-inventory.mjs";

/**
 * Identity fields a client must never be able to choose. Reading one of these
 * OUT of the request is the mass-assignment / tenant-spoofing shape.
 */
export const CLIENT_SUPPLIED_IDENTITY_FIELDS = [
  "organizationId",
  "orgId",
  "userId",
  "tenantId",
  "ownerId",
];

/**
 * `siteId` and `role` are NOT in the list above, because reading them from a
 * request is legitimate and common — and treating every occurrence as a
 * violation would bury the real ones.
 *
 *   - `siteId` is a FILTER. An operator narrowing a view to one site is normal;
 *     what matters is that the handler authorises access to that site rather
 *     than trusting the parameter. That is checked separately below.
 *   - `role` is an ASSIGNMENT. An administrator choosing an invitee's role is
 *     the feature; what matters is that the value is clamped to a closed set and
 *     cannot exceed the actor's own authority.
 *
 * Each therefore has its own control requirement rather than a blanket ban.
 */
export const SITE_FILTER_FIELD = "siteId";
export const ROLE_ASSIGNMENT_FIELD = "role";

/** Evidence that a site parameter is authorised rather than trusted. */
const SITE_AUTHORIZATION_TOKENS = [
  // Resolves the caller's permitted sites server-side; the list layer intersects
  // any requested site with it (Phase 43 allow-list, hardened in Phase 99).
  "getAllowedSiteIds",
  "requireSiteActor",
  "requireSitePermission",
  "getSiteActorContext",
  "assertSiteAccess",
  "siteIds.includes",
  "accessibleSiteIds",
  "resolveSiteScope",
  // Proves an optional foreign key (industrial site, category, instructor)
  // belongs to the ACTOR's organization before any write:
  // findFirst({ where: { id, organizationId } }) with the server-derived
  // organization, fail-closed to "invalid reference". Used by the Phase 102
  // media write routes; its predicate is locked by
  // scripts/__tests__/phase99-tenant-guard-recognition.test.ts.
  "referenceBelongsToOrg(",
];

/** Evidence that an assigned role is clamped to a closed set. */
const ROLE_CLAMP_TOKENS = [
  "isRole(",
  "z.enum",
  "ROLES.includes",
  "ALLOWED_ROLES",
  "assignableRoles",
  "clampRole",
  "OrgRole",
  "isAssignableRole",
  "MEMBER_ROLES",
  "INVITABLE_ROLES",
  "isInvitableRole",
  "DEFAULT_INVITE_ROLE",
];

/**
 * Expressions that mean "this value came from the request".
 *
 * `payload` is deliberately NOT here: throughout this codebase it names the
 * VERIFIED JWT claims returned by verifyAccessToken, so `payload.role` is a
 * server-established fact, not client input. Treating it as request data would
 * flag every correctly-written authorization check.
 */
const REQUEST_SOURCE = [
  "body",
  "searchParams",
  "raw",
  "input",
];

/**
 * Identifiers that carry a server-derived scope. These are the names the
 * repository's guards actually return.
 */
const SERVER_SCOPE_TOKENS = [
  "organizationId",
  "orgId",
  "ownerScope",
  "ownerAttribution",
];

/**
 * Canonical DELEGATED tenant-scope guards.
 *
 * Each entry names ONE helper whose whole contract is "the tenant boundary
 * lives inside me": it validates the object id, resolves the OWNING
 * organization on the server, applies the { id, organizationId } predicate
 * inside the database query, and refuses with a uniform 404 before any
 * storage or filesystem access. A handler that AWAITS the helper and RETURNS
 * on its refusal has bound its path parameter to the tenant scope even though
 * no scope identifier appears lexically in its own body — the Phase 102
 * byte-serving surfaces are exactly this shape.
 *
 * Recognition is structural, not lexical — see
 * {@link delegatesScopeToCanonicalGuard}. The helper's RUNTIME contract is
 * locked behaviourally by the cross-tenant matrix in
 * `src/app/api/media/binary/__tests__/byte-serving-auth-contract.test.ts`, and
 * the recognizer itself by
 * `scripts/__tests__/phase99-tenant-guard-recognition.test.ts`. An entry added
 * here without both locks is a hole, not a vocabulary extension.
 */
export const DELEGATED_SCOPE_GUARDS = [
  {
    helper: "authorizeByteServing",
    importPath: "@/lib/media/byte-serving-auth",
    mechanism:
      "Validates the asset id shape, resolves the owning organization server-side, re-reads the row through getMediaAssetById({ organizationId, id, audience }) so the tenant predicate applies inside the database query, requires membership plus view_media for any non-public read, and maps every refusal to one uniform 404 before storage is touched.",
  },
];

/**
 * Erase string and template literal CONTENT so a helper name inside a string
 * can never look like a call. Comments are handled separately by
 * `stripComments`.
 */
export function stripStringLiterals(src) {
  return src
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '""')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, '""');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * Does this handler delegate its tenant boundary to a canonical guard?
 *
 * Returns the recognised guard's helper name, or `null`. Every clause below is
 * a mutation the recogniser must refuse, and each is pinned by a test:
 *
 *   1. the module must import the helper BY NAME from its exact defining
 *      module — a runtime import, not `import type`, not an alias, and not a
 *      name mentioned in a comment (the source arrives comment-stripped);
 *   2. the module must not re-declare the helper name locally, so a shadowing
 *      stand-in cannot impersonate the guard;
 *   3. the handler body — comments already gone, string/template literals
 *      erased here — must await the helper into a binding at the handler's own
 *      top level (net brace depth exactly 1), with no top-level `return`
 *      before it, so a call parked in nested, dead or decorative code proves
 *      nothing;
 *   4. the binding's refusal branch must `return`.
 *
 * @param {string} handlerBody comment-stripped handler slice
 * @param {string} moduleSource comment-stripped FULL module source
 * @returns {string|null}
 */
export function delegatesScopeToCanonicalGuard(handlerBody, moduleSource) {
  for (const guard of DELEGATED_SCOPE_GUARDS) {
    // ── 1. Real runtime import from the exact module ─────────────────────────
    const importMatch = new RegExp(
      `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${escapeRe(guard.importPath)}["']`,
    ).exec(moduleSource);
    if (!importMatch) continue;
    const importedNames = importMatch[1].split(",").map((n) => n.trim());
    // Exact name only: `type authorizeByteServing` is erased at runtime and
    // `authorizeByteServing as x` binds a different name than the call below.
    if (!importedNames.includes(guard.helper)) continue;

    // ── 2. No local shadow of the guard name ─────────────────────────────────
    const moduleNoStrings = stripStringLiterals(moduleSource);
    if (new RegExp(`\\b(?:const|let|var|function|class)\\s+${guard.helper}\\b`).test(moduleNoStrings)) continue;

    // ── 3. Awaited into a binding at the handler's top level ─────────────────
    const body = stripStringLiterals(handlerBody);
    const call = new RegExp(
      `\\b(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+${guard.helper}\\s*\\(`,
    ).exec(body);
    if (!call) continue;

    const before = body.slice(0, call.index);
    let depth = 0;
    let unreachable = false;
    const token = /[{}]|\breturn\b/g;
    let t;
    while ((t = token.exec(before)) !== null) {
      if (t[0] === "{") depth += 1;
      else if (t[0] === "}") depth -= 1;
      else if (depth <= 1) unreachable = true; // top-level return before the guard
    }
    // depth 1 = directly inside the handler's block (the signature's own
    // destructuring/type braces are balanced pairs and net to zero).
    if (depth !== 1 || unreachable) continue;

    // ── 4. The refusal branch returns ────────────────────────────────────────
    const binding = call[1].replace(/\$/g, "\\$");
    const refusal = new RegExp(`if\\s*\\(\\s*!${binding}\\.ok\\s*\\)\\s*\\{?\\s*return\\b`);
    if (!refusal.test(body.slice(call.index))) continue;

    return guard.helper;
  }
  return null;
}

function handlerBodies(source) {
  const src = stripComments(source);
  const out = {};
  for (const method of HTTP_METHODS) {
    const fnRe = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`);
    const constRe = new RegExp(`export\\s+const\\s+${method}\\s*(?::[^=]*)?=`);
    const m = fnRe.exec(src) ?? constRe.exec(src);
    if (!m) continue;
    const start = m.index;
    const nextExport = src.indexOf("\nexport ", start + 1);
    out[method] = src.slice(start, nextExport === -1 ? undefined : nextExport);
  }
  return out;
}

/**
 * Does this handler read an identity field out of the request?
 *
 * Matches `body.organizationId`, `body?.organizationId`, destructuring from a
 * request-sourced object, and `searchParams.get("organizationId")`.
 */
export function readsClientSuppliedIdentity(body) {
  const hits = [];
  for (const field of CLIENT_SUPPLIED_IDENTITY_FIELDS) {
    for (const src of REQUEST_SOURCE) {
      if (new RegExp(`\\b${src}\\s*\\??\\.\\s*${field}\\b`).test(body)) hits.push(`${src}.${field}`);
    }
    if (new RegExp(`searchParams\\s*\\.\\s*get\\s*\\(\\s*["']${field}["']`).test(body)) hits.push(`searchParams(${field})`);
    // Destructuring: `const { organizationId } = body` / `= await req.json()`
    const destructure = new RegExp(`\\{[^}]*\\b${field}\\b[^}]*\\}\\s*=\\s*(?:await\\s+)?(?:${REQUEST_SOURCE.join("|")}|req\\.json\\(\\)|request\\.json\\(\\))`);
    if (destructure.test(body)) hits.push(`destructured ${field}`);
  }
  return [...new Set(hits)];
}

/**
 * Does this handler carry a tenant scope alongside its lookup?
 *
 * Deliberately broad: the shapes in this codebase vary (`getXForOrg(id, scope.
 * organizationId)`, `where: { id, organizationId }`, `requireOrgActor(orgId)`),
 * and the question here is only whether a tenant identifier participates in the
 * handler at all. A handler where it does NOT is the interesting case, and that
 * is what gets reviewed.
 */
export function referencesServerScope(body) {
  return SERVER_SCOPE_TOKENS.some((t) => body.includes(t));
}

/** A site filter must be authorised, not trusted. */
export function siteFilterAuthorised(body) {
  const readsSite =
    new RegExp(`searchParams\\s*\\.\\s*get\\s*\\(\\s*["']${SITE_FILTER_FIELD}["']`).test(body) ||
    new RegExp(`\\b(?:${REQUEST_SOURCE.join("|")})\\s*\\??\\.\\s*${SITE_FILTER_FIELD}\\b`).test(body) ||
    new RegExp(`\\{[^}]*\\b${SITE_FILTER_FIELD}\\b[^}]*\\}\\s*=\\s*(?:await\\s+)?(?:${REQUEST_SOURCE.join("|")}|req\\.json\\(\\))`).test(body);
  if (!readsSite) return { reads: false, authorised: true, evidence: [] };
  const evidence = SITE_AUTHORIZATION_TOKENS.filter((t) => body.includes(t));
  return { reads: true, authorised: evidence.length > 0, evidence };
}

/** An assigned role must be clamped to a closed set. */
export function roleAssignmentClamped(body) {
  const assignsRole =
    new RegExp(`\\b(?:${REQUEST_SOURCE.join("|")})\\s*\\??\\.\\s*${ROLE_ASSIGNMENT_FIELD}\\b`).test(body) ||
    new RegExp(`\\{[^}]*\\b${ROLE_ASSIGNMENT_FIELD}\\b[^}]*\\}\\s*=\\s*(?:await\\s+)?(?:${REQUEST_SOURCE.join("|")}|req\\.json\\(\\))`).test(body);
  if (!assignsRole) return { assigns: false, clamped: true, evidence: [] };
  const evidence = ROLE_CLAMP_TOKENS.filter((t) => body.includes(t));
  return { assigns: true, clamped: evidence.length > 0, evidence };
}

/** Does this handler resolve a dynamic path parameter? */
export function usesPathParameter(body) {
  return /\bparams\b/.test(body);
}

/**
 * Analyse every tenant-bound handler.
 *
 * Returns per-handler results plus the two coverage numbers Phase 99 publishes.
 */
/**
 * Handlers whose isolation is established by reading the code rather than by
 * pattern. Every entry names the handler, the mechanism that actually enforces
 * isolation, and why the analyser could not see it.
 *
 * This is the review record, not a mute button: an entry that does not name a
 * concrete mechanism is rejected by `validateTenantReviews`.
 */
const OT_ROUTE_KIT_MECHANISM =
  "Composed by withOtRoute, which resolves the acting organization from the authenticated actor, attaches a branded OtServiceContext carrying the permitted site ids, and reaches persistence only through resolveOtServices. The route never reads identity from the request; the gateway/device is loaded through the context, so a foreign record returns NOT_FOUND. Proven by src/app/api/ot/__tests__/route-static-security.test.ts.";

const ENGINEERING_SCOPE_MECHANISM =
  "Resolved through the engineering prisma adapters, whose scope predicate is { organizationId, project: { is: { organizationId, siteId: { in: allowedSiteIds } } } }. A record outside the caller's organization or permitted sites is simply not found, so the path parameter selects nothing it should not.";

export const TENANT_REVIEW_ALLOWLIST = [
  // ── Identity taken from the request, legitimately ────────────────────────
  {
    apiPath: "/api/compliance/privacy-requests/[id]/assign",
    method: "POST",
    dimension: "IDENTITY",
    mechanism:
      "Gated by requirePlatformSuperadmin. The target organizationId IS the decision a platform operator is making here — which tenant owns an unassigned public privacy request. It is validated to exist, and the write predicate carries organizationId: null so an already-assigned request can never be reassigned or hijacked.",
  },

  // ── Site filters whose isolation is enforced by the organization predicate ─
  {
    apiPath: "/api/copilot/conversations/[id]",
    method: "POST",
    dimension: "SITE",
    mechanism:
      "sendMessage gates on copilotConversation.findFirst({ id, organizationId }) with the server-derived organization; siteId only narrows listAssets/getAssetGraph, which always AND the same organizationId. No cross-tenant reach.",
  },
  {
    apiPath: "/api/copilot/query",
    method: "POST",
    dimension: "SITE",
    mechanism:
      "generateInsights calls listAssets(orgId, { siteId }), whose predicate always carries the server-derived organizationId. The organization comes from requirePlatformAuth plus requireOrgActor, never from the body.",
  },
  {
    apiPath: "/api/digital-twin/graph",
    method: "GET",
    dimension: "SITE",
    mechanism:
      "getAssetGraph queries digitalTwinNode.findMany({ where: { organizationId, siteId } }) with the server-derived organization; siteId narrows within the tenant only.",
  },
  {
    apiPath: "/api/digital-twin/layout",
    method: "GET",
    dimension: "SITE",
    mechanism: "listLayouts filters on the server-derived organizationId; siteId only narrows within that tenant.",
  },
  {
    apiPath: "/api/digital-twin/layout",
    method: "POST",
    dimension: "SITE",
    mechanism: "createLayout stamps organizationId from the resolved context, so a client-supplied siteId cannot move the row into another tenant.",
  },
  {
    apiPath: "/api/digital-twin/nodes",
    method: "GET",
    dimension: "SITE",
    mechanism: "listNodes filters on the server-derived organizationId; siteId only narrows within that tenant.",
  },
  {
    apiPath: "/api/digital-twin/nodes",
    method: "POST",
    dimension: "SITE",
    mechanism: "createNode stamps organizationId from the resolved context, so a client-supplied siteId cannot move the row into another tenant.",
  },
  {
    apiPath: "/api/engineering/imports",
    method: "POST",
    dimension: "SITE",
    mechanism:
      "withOtRoute builds the context from the server-resolved organization plus getAllowedSiteIds, and the import service rejects any siteId not present in ctx.allowedSiteIds with FORBIDDEN. The site boundary is enforced in the service, not the route body.",
  },

  // ── Platform-global resources under platform-admin authority ──────────────
  ...[
    { apiPath: "/api/admin/access-requests/[id]/approve", method: "POST" },
    { apiPath: "/api/admin/access-requests/[id]/reject", method: "POST" },
  ].map((r) => ({
    ...r,
    dimension: "OBJECT_SCOPE",
    mechanism:
      "Platform-admin authority (getCurrentUser plus can(role, 'admin')) over SalesLead, which has no organizationId — access requests are platform-level lead capture, not tenant data. The invite role is clamped to the invitable set.",
  })),
  ...[
    { apiPath: "/api/admin/customers/[id]", method: "GET" },
    { apiPath: "/api/admin/customers/[id]", method: "PATCH" },
  ].map((r) => ({
    ...r,
    dimension: "OBJECT_SCOPE",
    mechanism:
      "Platform-admin authority (role in admin/superadmin) over the platform User directory. The customer role is assigned at registration and is never settable by a tenant, so there is no tenant object to scope to.",
  })),
  ...[
    { apiPath: "/api/admin/vendors/[id]", method: "PATCH" },
    { apiPath: "/api/admin/vendors/[id]/approve", method: "POST" },
    { apiPath: "/api/admin/vendors/[id]/reject", method: "POST" },
  ].map((r) => ({
    ...r,
    dimension: "OBJECT_SCOPE",
    mechanism:
      "Platform-admin authority (can(role, 'admin')) over the public vendor marketplace directory and its onboarding queue. These are platform-global records with no owning tenant.",
  })),
  ...[
    { apiPath: "/api/documents/[id]", method: "GET" },
    { apiPath: "/api/documents/[id]", method: "DELETE" },
  ].map((r) => ({
    ...r,
    dimension: "OBJECT_SCOPE",
    mechanism:
      "requireAdmin (auth configured plus can(role, 'admin')) over the platform Document model, which is global rather than tenant-owned. Reviewed at Phase 99; if Document ever becomes tenant-scoped this entry must be removed and a predicate added.",
  })),

  // ── Records scoped by an organization predicate inside the data layer ─────
  {
    apiPath: "/api/compliance/legal-documents/entries/[id]",
    method: "GET",
    dimension: "OBJECT_SCOPE",
    mechanism:
      "getLegalDocumentForScope resolves through findFirst({ id, organizationId: scope }); the scope comes from requireComplianceOrgScope (count-based, ambiguous resolves to 409) or is null only for requirePlatformSuperadmin. A foreign document is uniformly NOT_FOUND.",
  },
  {
    apiPath: "/api/engineering/findings/[id]",
    method: "PATCH",
    dimension: "OBJECT_SCOPE",
    mechanism: ENGINEERING_SCOPE_MECHANISM,
  },
  {
    apiPath: "/api/engineering/imports/[id]",
    method: "GET",
    dimension: "OBJECT_SCOPE",
    mechanism:
      "imports.findById resolves through findFirst({ id, organizationId, siteId: { in: allowedSiteIds } }), so both the tenant and the site boundary participate in the lookup.",
  },
  ...[
    { apiPath: "/api/engineering/projects/[id]", method: "GET" },
    { apiPath: "/api/engineering/projects/[id]/alarms", method: "GET" },
    { apiPath: "/api/engineering/projects/[id]/analyze", method: "POST" },
    { apiPath: "/api/engineering/projects/[id]/findings", method: "GET" },
    { apiPath: "/api/engineering/projects/[id]/network", method: "GET" },
    { apiPath: "/api/engineering/projects/[id]/tags", method: "GET" },
  ].map((r) => ({ ...r, dimension: "OBJECT_SCOPE", mechanism: ENGINEERING_SCOPE_MECHANISM })),
  {
    apiPath: "/api/memory/[id]/feedback",
    method: "POST",
    dimension: "OBJECT_SCOPE",
    mechanism:
      "The memory repository is constructed with an owner scope resolved by requireWritableOwner/resolveBrainOwner (count-based, 409 on ambiguity). A memory outside that scope resolves to null and the route answers 404.",
  },

  // ── OT surfaces composed by the route kit ─────────────────────────────────
  ...[
    { apiPath: "/api/ot/devices/[id]", method: "GET" },
    { apiPath: "/api/ot/devices/[id]", method: "PATCH" },
    { apiPath: "/api/ot/gateways/[id]", method: "GET" },
    { apiPath: "/api/ot/gateways/[id]", method: "PATCH" },
    { apiPath: "/api/ot/gateways/[id]/enrollment", method: "POST" },
    { apiPath: "/api/ot/gateways/[id]/enrollment", method: "DELETE" },
    { apiPath: "/api/ot/gateways/[id]/enrollment/revoke", method: "POST" },
    { apiPath: "/api/ot/gateways/[id]/enrollment/rotate", method: "POST" },
  ].map((r) => ({ ...r, dimension: "OBJECT_SCOPE", mechanism: OT_ROUTE_KIT_MECHANISM })),
  {
    apiPath: "/api/ot/gateways/[id]/envelopes",
    method: "POST",
    dimension: "OBJECT_SCOPE",
    mechanism:
      "Machine ingestion. authenticateGateway verifies an HMAC over the envelope using a server-held signing key, requires the path gateway id to equal the envelope's, enforces a clock-skew window and a payload checksum, and reserves the nonce on a unique index so a replay is rejected. The organization is read FROM the gateway record; the envelope's own organization value is only compared, never trusted.",
  },
];

export function validateTenantReviews(list) {
  if (!Array.isArray(list)) throw new Error("TENANT_REVIEW_ALLOWLIST must be an array");
  for (const e of list) {
    const okShape =
      e && typeof e.apiPath === "string" && typeof e.method === "string" &&
      ["IDENTITY", "SITE", "OBJECT_SCOPE"].includes(e.dimension) &&
      typeof e.mechanism === "string" && e.mechanism.trim().length >= 20;
    if (!okShape) throw new Error(`TENANT_REVIEW_ALLOWLIST: entry needs apiPath, method, dimension and a concrete mechanism — got ${JSON.stringify(e)?.slice(0, 120)}`);
  }
  return true;
}

const reviewKey = (r, dimension) => `${dimension}#${r.method} ${r.apiPath}`;

export function analyzeTenantPredicates({ repoRoot = REPO_ROOT, reviews = TENANT_REVIEW_ALLOWLIST } = {}) {
  validateTenantReviews(reviews);
  const reviewed = new Set(reviews.map((e) => `${e.dimension}#${e.method} ${e.apiPath}`));
  const routes = buildRouteInventory({ repoRoot });
  const sourceCache = new Map();
  const readSource = (file) => {
    if (!sourceCache.has(file)) {
      const raw = readFileSync(join(repoRoot, file), "utf8");
      // The recogniser for delegated guards needs the whole module (imports
      // live outside the handler slice), comment-stripped like everything else.
      sourceCache.set(file, { bodies: handlerBodies(raw), moduleSource: stripComments(raw) });
    }
    return sourceCache.get(file);
  };

  const TENANT_CLASSES = new Set(["TENANT_MEMBER", "TENANT_ADMIN", "OWNER_ONLY", "PLATFORM_ADMIN"]);
  const results = [];

  for (const r of routes) {
    if (!TENANT_CLASSES.has(r.classification)) continue;
    const src = readSource(r.file);
    const body = src.bodies[r.method] ?? "";
    const clientIdentity = readsClientSuppliedIdentity(body);
    const hasParam = usesPathParameter(body);
    const serverScope = referencesServerScope(body);
    const delegatedGuard = delegatesScopeToCanonicalGuard(body, src.moduleSource);
    const site = siteFilterAuthorised(body);
    const role = roleAssignmentClamped(body);
    results.push({
      file: r.file,
      apiPath: r.apiPath,
      method: r.method,
      classification: r.classification,
      clientSuppliedIdentity: clientIdentity,
      usesPathParameter: hasParam,
      referencesServerScope: serverScope,
      delegatedScopeGuard: delegatedGuard,
      siteFilter: site,
      roleAssignment: role,
      // A path-parameter lookup with no tenant identifier anywhere in the handler
      // is an unscoped direct object reference — unless the handler provably
      // delegates the boundary to a canonical guard — until a review says
      // otherwise.
      objectScoped: !hasParam || serverScope || delegatedGuard !== null,
    });
  }

  const identityViolations = results.filter((r) => r.clientSuppliedIdentity.length > 0 && !reviewed.has(reviewKey(r, "IDENTITY")));
  const idorViolations = results.filter((r) => !r.objectScoped && !reviewed.has(reviewKey(r, "OBJECT_SCOPE")));
  const siteViolations = results.filter((r) => r.siteFilter.reads && !r.siteFilter.authorised && !reviewed.has(reviewKey(r, "SITE")));
  const roleViolations = results.filter((r) => r.roleAssignment.assigns && !r.roleAssignment.clamped);

  // A review that no longer corresponds to a flagged handler is stale and must
  // not keep vouching for code that has since changed shape.
  const staleReviews = reviews.filter((e) => {
    const r = results.find((x) => x.apiPath === e.apiPath && x.method === e.method);
    if (!r) return true;
    if (e.dimension === "IDENTITY") return r.clientSuppliedIdentity.length === 0;
    if (e.dimension === "SITE") return !(r.siteFilter.reads && !r.siteFilter.authorised);
    return r.objectScoped;
  });

  return {
    ok:
      identityViolations.length === 0 &&
      idorViolations.length === 0 &&
      siteViolations.length === 0 &&
      roleViolations.length === 0 &&
      staleReviews.length === 0,
    results,
    identityViolations,
    idorViolations,
    siteViolations,
    roleViolations,
    staleReviews,
    coverage: {
      TENANT_BOUND_HANDLERS_TOTAL: results.length,
      TENANT_BOUND_HANDLERS_ANALYSED: results.length,
      TENANT_IDENTITY_SERVER_DERIVED: results.length - identityViolations.length,
      TENANT_IDENTITY_COVERAGE_PERCENT: results.length === 0 ? 0 : Math.round(((results.length - identityViolations.length) / results.length) * 1000) / 10,
      OBJECT_SCOPED_HANDLERS: results.length - idorViolations.length,
      OBJECT_SCOPE_COVERAGE_PERCENT: results.length === 0 ? 0 : Math.round(((results.length - idorViolations.length) / results.length) * 1000) / 10,
      CLIENT_SUPPLIED_IDENTITY_HANDLERS: identityViolations.length,
      UNSCOPED_OBJECT_REFERENCE_HANDLERS: idorViolations.length,
    },
  };
}
