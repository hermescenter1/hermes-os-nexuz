import { NextRequest, NextResponse } from "next/server";
import { z }                         from "zod";
import { getCurrentUser }            from "@/lib/auth/session";
import { can }                       from "@/lib/auth/roles";
import { readBoundedJson, SMALL_JSON_BODY_BYTES } from "@/lib/security/request-guards";
import { resolveRequestId }          from "@/lib/logger/correlation";
import {
  SALES_LEAD_STATUSES,
  transitionSalesLead,
} from "@/lib/sales/lead-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin review surface for demo / sales leads.
 *
 * Counterpart to the ANONYMOUS creation endpoint at POST /api/sales/leads: the
 * public form registers the lead, this endpoint is the only way to move it
 * through the review lifecycle. It is platform-admin authority over a
 * platform-global table (SalesLead has no organizationId), matching the
 * sibling /api/admin/access-requests/* and /api/admin/vendors/* routes.
 *
 * Approving here is a COMMERCIAL decision — it accepts the request for demo /
 * sales follow-up. It deliberately mints no invitation and creates no User;
 * account access remains the separate AUTH_ACCESS_REQUEST workflow.
 *
 * The body carries exactly two closed-vocabulary values and nothing else
 * (`.strict()`): no owner, actor, organization or source field is accepted from
 * the client, so there is no mass-assignment surface. The acting administrator
 * is taken from the session.
 */

const patchSchema = z
  .object({
    /** Target status. */
    status: z.enum(SALES_LEAD_STATUSES),
    /**
     * The status the operator was looking at. Optimistic concurrency: a stale
     * tab whose expectation no longer matches the row is refused with 409
     * rather than overwriting a newer decision.
     */
    expectedStatus: z.enum(SALES_LEAD_STATUSES),
  })
  .strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user)                    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin")) return NextResponse.json({ error: "forbidden" },    { status: 403 });

  const { id } = await params;

  // Bounded read — the same ceiling the public lead endpoints use, so an
  // authenticated caller cannot hand an unbounded body to the JSON parser.
  const read = await readBoundedJson(req, SMALL_JSON_BODY_BYTES);
  if (read.status === "too_large") {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  if (read.status === "invalid") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(read.value);
  if (!parsed.success) {
    // Field names only — never the submitted values, which could echo content
    // back into logs or an error surface.
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await transitionSalesLead({
    leadId:        id,
    to:            parsed.data.status,
    expectedFrom:  parsed.data.expectedStatus,
    adminUserId:   user.id,
    correlationId: resolveRequestId(req),
  });

  if (!result.ok) {
    switch (result.error) {
      case "not-found":
        return NextResponse.json({ error: "not_found" }, { status: 404 });

      // Not a 404: the acting administrator can already see every lead on
      // /admin/leads, so hiding the row's existence protects nothing. What
      // matters is refusing to drive the account-access state machine from the
      // commercial one, and saying so plainly.
      case "access-request-lead":
        return NextResponse.json({ error: "access_request_lead" }, { status: 409 });

      case "invalid-transition":
        return NextResponse.json(
          { error: "invalid_transition", currentStatus: result.currentStatus },
          { status: 409 },
        );

      case "stale-state":
        return NextResponse.json(
          { error: "stale_state", currentStatus: result.currentStatus },
          { status: 409 },
        );

      case "unknown-state":
        return NextResponse.json({ error: "unknown_state" }, { status: 409 });

      case "db-unavailable":
      default:
        return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
    }
  }

  return NextResponse.json({
    ok:             true,
    status:         result.status,
    previousStatus: result.previousStatus,
  });
}
