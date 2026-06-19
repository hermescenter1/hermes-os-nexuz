/**
 * POST /api/organizations — Create an organization
 */

import { NextRequest, NextResponse }   from "next/server";
import { getUserIdFromRequest }         from "@/lib/org/context";
import { createOrganization }           from "@/lib/org/organizations";

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const { name, description, website } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const result = await createOrganization({
    name:        name.trim(),
    description: typeof description === "string" ? description : undefined,
    website:     typeof website     === "string" ? website     : undefined,
    actorUserId: userId,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ organization: result.org }, { status: 201 });
}
