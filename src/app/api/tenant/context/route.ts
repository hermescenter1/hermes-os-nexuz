/**
 * PHASE 110-A1.0b — the organization context endpoint.
 *
 *   GET  /api/tenant/context   what organization is in effect, and what else
 *                              this reader could choose
 *   PUT  /api/tenant/context   choose one
 *
 * WHY A NEW ROUTE RATHER THAN AN EXISTING ONE
 * `GET /api/billing/organizations` looks close but is not: it answers with a
 * billing-shaped organization record and its POST creates an organization.
 * Overloading it would mean a selection request and a creation request sharing
 * a path, and would tie the shell's context to the billing module. The one
 * thing this endpoint must never become is a way to create a tenant, so it
 * lives apart from the route that does that.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - It grants nothing. A selection narrows a set the server has already
 *     proven; every route keeps its own permission check afterwards.
 *   - GET writes NOTHING. Not a selection, and — since R2 — not a deletion
 *     either. R1's header claimed the first while the code did the second, and
 *     the deletion was itself half of a defect: clearing a dead intent made the
 *     next request look like somebody who had never chosen, so a surviving
 *     single membership was granted automatically. A dead intent is now kept
 *     and refused until an explicit PUT replaces it.
 *   - It never discloses whether an organization exists. Every bad candidate —
 *     foreign, deleted, suspended, malformed — gets one identical answer.
 */

import { NextResponse, type NextRequest } from "next/server";

import { readBoundedJson, requireTrustedOrigin } from "@/lib/security/request-guards";
import {
  TENANT_REFUSAL_STATUS,
  type TenantContextResponse,
  type TenantRefusalCode,
} from "@/lib/tenant-selection/contract";
import { writeStoredSelection } from "@/lib/tenant-selection/cookie";
import {
  decideFromResolved,
  resolveTenantBase,
  resolveTenantDecision,
  selectFromResolved,
} from "@/lib/tenant-selection/selection";

export const runtime = "nodejs";
/*
 * Never prerendered and never cached. The answer depends on the session cookie
 * and names the caller's own organizations; a shared cache entry here would
 * hand one reader another reader's membership list.
 */
export const dynamic = "force-dynamic";

/** Private, per-reader data. Not for any shared cache, ever. */
const PRIVATE_HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

/**
 * The largest selection body this endpoint will INGEST, in bytes.
 *
 * The payload is one JSON object with one string field, and the merged contract
 * caps that value's length. Even at the worst encoding cost that is well under
 * a kilobyte, so 4 KB is generous and still a hard ceiling.
 *
 * PHASE 110-A1.0b R3 (R3-1) — "hard bound" is now true, and in R2 it was not.
 * R2 did `await req.text()` and THEN compared `Buffer.byteLength(raw)` against
 * this number. That bounds what gets PARSED and bounds nothing about what gets
 * READ: the whole stream was pulled into memory first. Measured against the R2
 * handler, a 256 KB chunked body produced 256 pulls and 262144 bytes ingested,
 * with the stream never released, before the 422 was written.
 *
 * `readBoundedJson` is the repository's own primitive and it was already here —
 * in the very module this route imports its origin check from. It refuses a
 * truthfully oversized `Content-Length` without touching the stream, and then
 * reads chunk by chunk counting ACTUAL byte lengths, cancelling the reader the
 * moment the total crosses the ceiling. The chunk that crosses it is never
 * buffered. A lying or absent `Content-Length` changes nothing, because the
 * declared length is only ever an early exit, never the bound.
 *
 * What this does NOT bound is TIME. A small body that never finishes arriving
 * is a duration concern belonging to the server's own request deadline, not to
 * a byte ceiling, and no claim is made here that it is covered.
 */
const MAX_BODY_BYTES = 4096;

function json(body: TenantContextResponse, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

/** A refusal with no option list. The list travels only where it means something. */
function refusal(code: TenantRefusalCode): NextResponse {
  return json({ state: "REFUSED", code }, TENANT_REFUSAL_STATUS[code]);
}

/**
 * ONE answer for every unusable request.
 *
 * Foreign, deleted, suspended, malformed, oversized, interrupted and absent are
 * indistinguishable here on purpose: the difference between "no such
 * organization" and "not one of yours" is exactly the oracle that would let a
 * signed-in caller enumerate other tenants' ids, and the difference between
 * "too large" and "not JSON" only describes the parser.
 *
 * 422, not 409: the request itself is what is wrong. A 409 would say "choose an
 * organization", and the caller just did.
 */
function invalidSelection(): NextResponse {
  return NextResponse.json(
    { state: "REFUSED", code: "ORGANIZATION_SELECTION_INVALID" },
    { status: 422, headers: PRIVATE_HEADERS },
  );
}

/* ── GET ─────────────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest): Promise<NextResponse> {
  const decision = await resolveTenantDecision(req);

  if (!decision.granted) {
    return json(
      {
        state: "REFUSED",
        code: decision.code,
        /*
         * The option list travels ONLY where a choice is the remedy. Attaching
         * it to the others would mean a caller with no organization receives an
         * empty array and a caller in an outage receives one too, and both
         * would render as "you have no organizations" — a claim neither state
         * supports.
         */
        ...(decision.options ? { options: decision.options } : {}),
      },
      TENANT_REFUSAL_STATUS[decision.code],
    );
  }

  return json(
    {
      state: "SINGLE_ACTIVE_ORGANIZATION",
      organizationId: decision.organizationId,
      organizationSlug: decision.organizationSlug,
      organizationRole: decision.organizationRole,
      selectable: decision.selectable,
      /*
       * PHASE 110-A1.0b R2 (F1) — the alternatives ship WITH the granted
       * context. R1 sent `selectable: true` and no list, so the switcher read a
       * 200 without options as "ready, nothing to choose": the first selection
       * worked and no later one was possible through that control.
       */
      ...(decision.options ? { options: decision.options } : {}),
    },
    200,
  );
}

/* ── PUT ─────────────────────────────────────────────────────────────────── */

export async function PUT(req: NextRequest): Promise<NextResponse> {
  /*
   * 1. Same-origin, before anything else.
   *
   * This is a state-changing request authenticated by a cookie, which is the
   * exact shape CSRF exploits. `requireTrustedOrigin` is the repository's own
   * check, pinned to "jwt" so the API-key exemption inside it can never be
   * reached: an OT integration has no reason to change a human's organization.
   *
   * It answers 403 rather than a context refusal because nothing about the
   * caller's organizations has been consulted yet, and saying anything about
   * them to a cross-origin caller would be the leak this check exists to stop.
   */
  if (!requireTrustedOrigin(req, "jwt").ok) {
    return NextResponse.json(
      { state: "REFUSED", code: "FORBIDDEN" },
      { status: 403, headers: PRIVATE_HEADERS },
    );
  }

  /*
   * 2. Identity and memberships, ONCE, before the body is touched.
   *
   * PHASE 110-A1.0b R2 (F4) — R1 read the body first and authenticated inside
   * the selector, so an anonymous request with an acceptable Origin made the
   * server consume a body it had no reason to read. An Origin header is not
   * authentication.
   *
   * Resolving here rather than inside the selector also keeps it to ONE
   * resolution per request: two would be two chances to disagree, and the first
   * would have run before the caller was known to exist.
   */
  const base = await resolveTenantBase(req);

  if (base.state === "UNAUTHENTICATED") return refusal("AUTHENTICATION_REQUIRED");
  if (base.state === "MEMBERSHIP_UNAVAILABLE") return refusal("ORGANIZATION_CONTEXT_UNAVAILABLE");
  if (base.state === "NO_ACTIVE_ORGANIZATION") return refusal("ORGANIZATION_CONTEXT_REQUIRED");

  /*
   * 3. The body, bounded DURING the read, and only now.
   *
   * One identical refusal for oversized, malformed, interrupted and absent
   * bodies. The caller learns that their request was not usable and nothing
   * about which of those it was — the distinction would only describe the
   * parser, and `too_large` versus `unparseable` is not a difference a client
   * can act on differently here.
   */
  const read = await readBoundedJson<unknown>(req, MAX_BODY_BYTES);
  if (read.status !== "ok") return invalidSelection();
  const body = read.value;

  /*
   * The candidate is extracted, never coerced.
   *
   * `body?.organizationId` may be a number, an array, an object with a
   * `toString`, or absent. All of them arrive here as themselves and are handed
   * to the selector as `unknown`; the selector compares identity against a
   * proven id, so none of them can match. There is no `String(...)` anywhere on
   * this path — `String(undefined)` is `"undefined"`, which is a perfectly
   * good-looking organization id belonging to nobody.
   */
  const candidate =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).organizationId
      : undefined;

  const outcome = selectFromResolved(base, candidate);

  if (!outcome.accepted) {
    if (outcome.code === "ORGANIZATION_SELECTION_INVALID") return invalidSelection();
    return refusal(outcome.code);
  }

  /*
   * 4. The answer, derived from the SAME resolution the selection used.
   *
   * PHASE 110-A1.0b R3 (R3-5) — R2 also called `storedSelectionFor(base, req)`
   * here and discarded the result with `void`. It described the post-selection
   * state, which is what the call below actually computes, so it decided
   * nothing and read a cookie for no reason. Removed, along with the export
   * that existed only to serve it.
   */
  const after = decideFromResolved(base, {
    kind: "selection",
    organizationId: outcome.organizationId,
  });

  const res = json(
    {
      state: "SINGLE_ACTIVE_ORGANIZATION",
      organizationId: outcome.organizationId,
      organizationSlug: outcome.organizationSlug,
      organizationRole: outcome.organizationRole,
      selectable: outcome.selectable,
      ...(after.granted && after.options ? { options: after.options } : {}),
    },
    200,
  );

  /*
   * The cookie is written ONLY here, and only from a context the resolver
   * proved on this request. Both ids are server-derived: the user id from the
   * verified session, the organization id from a membership row just re-read.
   * Nothing the client sent is stored.
   */
  writeStoredSelection(res, outcome.userId, outcome.organizationId);
  return res;
}
