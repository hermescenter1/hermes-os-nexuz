/**
 * GET  /api/organizations/[orgId]/members — List members
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgActor }             from "@/lib/org/context";
import { listMembers }                 from "@/lib/org/members";

type Params = { params: Promise<{ orgId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const result = await requireOrgActor(req, orgId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const members = await listMembers(orgId);
  return NextResponse.json({ members });
}
