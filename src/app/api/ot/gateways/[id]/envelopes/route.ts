// PHASE 94B4.1 — signed gateway envelope ingestion, authenticated as a MACHINE.
//
// THIS ROUTE HAS NO HUMAN GATES, DELIBERATELY.
// It does not call requireOrgContext or requireOrgActor, does not read a
// session cookie, and does not require `manage_ot_gateway`. Until 94B4.1 it did
// all four, which meant a physical gateway could only deliver telemetry by
// carrying an organization administrator's browser session — an unusable
// deployment model and, worse, one that would have given every gateway an
// administrator's authority.
//
// WHAT REPLACES THEM
// The gateway proves who it is with an HMAC over the envelope, computed with a
// secret only the server and that device hold. Everything downstream — the
// organization, the site, what the device may send — is read from the server's
// own gateway record. Nothing in the request body is trusted as identity,
// including the `organizationId` the envelope carries: that field is compared
// against the authenticated record and never used in its place.
//
// WHY CSRF DOES NOT APPLY HERE
// A CSRF attack works by making a browser replay an ambient credential. There
// is no ambient credential on this path: the request must carry a signature the
// attacker cannot compute, and any cookie a browser attaches is ignored. No
// session is read, so none can be ridden.

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, limitWindowSeconds } from "@/lib/auth/rate-limiter";
import { authenticateGateway } from "@/lib/ot-edge/machine-context";
import {
  machineAuthFailure,
  machineClientKey,
  machineRateLimited,
  readIngestionHeader,
} from "@/lib/ot-edge/http/machine-auth";
import { errorResponse, resultResponse } from "@/lib/ot-edge/http/route-kit";
import { resolveOtServices } from "@/lib/ot-edge/http/composition";
import { svcFail } from "@/lib/ot-edge/services/core";
import { readRawJsonBody, MAX_IMPORT_BYTES } from "@/lib/ot-edge/http/body";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Ingest one signed envelope.
 *
 * THE ORDER BELOW IS THE SECURITY DESIGN, not a style choice:
 *
 *   1. a per-IP limit, so probing costs something before any lookup;
 *   2. a bounded body read, so nothing unbounded is ever buffered;
 *   3. authentication, whose own internal order puts the expensive HMAC last;
 *   4. a per-GATEWAY limit, so one noisy device cannot starve its neighbours;
 *   5. and only then the service, whose first write is the nonce reservation.
 *
 * A request failing anywhere before step 5 leaves no row behind — in particular
 * it cannot burn a nonce, which would otherwise let an anonymous caller
 * pre-consume the nonce a real gateway is about to use.
 */
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;

  // 1. Pre-authentication throttle, keyed by the address nginx observed. This
  //    is the only brake on someone guessing ingestion handles, so it runs
  //    before the body is read and before the database is touched.
  const clientKey = machineClientKey(req);
  if (!(await checkRateLimit("ot-envelope-preauth", clientKey))) {
    return machineRateLimited(limitWindowSeconds("ot-envelope-preauth"));
  }

  // 2. Content type, declared length and a genuinely bounded read, in that
  //    order. These refusals describe the REQUEST, not the gateway, so they
  //    disclose nothing usable for enumerating devices.
  const body = await readRawJsonBody(req, MAX_IMPORT_BYTES);
  if (!body.ok) return body.response;

  const parsed = body.value as { envelope?: unknown; payload?: unknown };
  if (
    typeof parsed?.envelope !== "object" ||
    parsed.envelope === null ||
    typeof parsed.payload !== "string"
  ) {
    return machineAuthFailure();
  }

  const svc = await resolveOtServices();
  if (!svc) return errorResponse(svcFail("TRANSIENT_FAILURE"));

  // 3. Authenticate. This performs no writes at all, so every failure below is
  //    free of side effects.
  const auth = await authenticateGateway({
    ingestionId: readIngestionHeader(req),
    envelope: parsed.envelope,
    payload: parsed.payload,
    pathGatewayId: id,
    lookup: svc.machineAuth.lookup,
    secrets: svc.machineAuth.secrets,
    simulatorAllowed: svc.machineAuth.simulatorAllowed,
    now: new Date(),
    requestId: req.headers.get("x-request-id"),
  });

  if (!auth.ok) {
    // The reason is recorded internally and collapsed to one response: an
    // unknown gateway, a revoked one, a missing capability and a forged
    // signature are indistinguishable from outside.
    await svc.gateway.rejected(auth.rejection, auth.gatewayId);
    return machineAuthFailure();
  }

  // 4. Post-authentication throttle, keyed by the AUTHENTICATED gateway rather
  //    than by address, so devices sharing one industrial NAT get independent
  //    budgets and a single misbehaving device is contained.
  if (!(await checkRateLimit("ot-envelope-gateway", auth.ctx.gatewayId))) {
    return machineRateLimited(limitWindowSeconds("ot-envelope-gateway"));
  }

  // 5. Ingest. Tenant and site come from `auth.ctx` — the server's record —
  //    and the service cannot be reached with any other kind of context.
  return resultResponse(await svc.gateway.ingest(auth.ctx, auth.envelope), 202);
}
