import { NextResponse }                from "next/server";
import { getTokenUser }               from "@/lib/auth/token-session";
import { getCandidateByUserId, updateCandidate } from "@/lib/ats/db";

export async function GET() {
  const user = await getTokenUser();
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const candidate = await getCandidateByUserId(user.id);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 });
  }

  return NextResponse.json({ candidate });
}

export async function PUT(req: Request) {
  const user = await getTokenUser();
  if (!user || user.role !== "candidate") {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const candidate = await getCandidateByUserId(user.id);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 });
  }

  // PHASE 99 SECURITY — the body used to be cast with `as Partial<{…}>` and
  // forwarded whole into Prisma `data`. A TypeScript assertion filters nothing at
  // runtime, so a candidate could send `email`/`userId` (both unique on
  // AtsCandidate) to capture another person's applications or re-link identity,
  // or a nested relation write to reassign someone else's AtsApplication to
  // themselves. Only these self-service profile fields may pass, each copied
  // explicitly and only when the client actually supplied it — matching the
  // allow-list pattern already used by PATCH /api/academy/courses/[id].
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const EDITABLE = [
    "name", "phone", "location", "linkedinUrl", "portfolioUrl",
    "summary", "skills", "languages", "workAuthorization",
  ] as const;

  const body: Record<string, unknown> = {};
  for (const field of EDITABLE) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) body[field] = raw[field];
  }

  const updated = await updateCandidate(candidate.id, body as Parameters<typeof updateCandidate>[1]);
  if (!updated) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ candidate: updated });
}
