import { NextResponse }    from "next/server";
import { readOrRefuse, refusalResponse, validationResponse } from "@/lib/data-access/route-refusal";
import { z }              from "zod";
import { getCurrentUser }  from "@/lib/auth/session";
import { can }             from "@/lib/auth/roles";
import { getFailures, createFailure } from "@/lib/cmms/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * `.strict()` — PHASE 110-A2.0.
 *
 * Without it Zod STRIPS unknown keys silently. A caller that sent
 * `organizationId` to choose the tenant got 201 and a task created in a
 * different organization than the one they named — measured in the A2.0
 * rehearsal, `http-scenarios-run2.log`. Nothing leaked, because the server
 * decides the tenant regardless; what was wrong is that the request was
 * quietly not honoured and the answer said success.
 *
 * An unknown key is now a 400 naming the key. The data layer refuses the
 * same fields as well: two independent boundaries, because this schema
 * protects one route and the layer protects every caller.
 */
const CreateSchema = z.object({
  title:           z.string().min(1).max(300),
  description:     z.string().min(1),
  assetId:         z.string().optional().nullable(),
  taskId:          z.string().optional().nullable(),
  failureCodeId:   z.string().optional().nullable(),
  severity:        z.enum(["MINOR","MODERATE","MAJOR","CRITICAL"]).optional(),
  category:        z.enum(["MECHANICAL","ELECTRICAL","INSTRUMENTATION","SOFTWARE","HYDRAULIC","PNEUMATIC","STRUCTURAL","OPERATIONAL"]).optional(),
  occurredAt:      z.string(),
  detectedAt:      z.string().optional().nullable(),
  downtimeMinutes: z.number().int().min(0).optional().nullable(),
}).strict();

export async function GET(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url      = new URL(req.url);
  const severity = url.searchParams.get("severity") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;

  return readOrRefuse(() => getFailures(severity, category));
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(user.role, "admin") && !can(user.role, "authoring"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed.error);

  /*
   * PHASE 110-A2.0 — the layer throws now; it cannot answer with a mock.
   *
   * What was here returned 202 Accepted with "mock mode" when the create
   * came back null. The layer can no longer return null — it produces a row
   * or raises — and 202 would have told a caller whose write was REFUSED
   * that it had been accepted. `refusalResponse` maps the refusal to the
   * status the platform routes already use for the same condition, and
   * rethrows anything it does not recognise.
   */
  let failure;
  try {
    failure = await createFailure({ ...parsed.data, reportedBy: user.id });
  } catch (err) {
    return refusalResponse(err);
  }
  return NextResponse.json(failure, { status: 201 });
}
