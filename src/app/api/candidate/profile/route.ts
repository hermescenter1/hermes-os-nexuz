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

  const body = await req.json() as Partial<{
    name: string;
    phone: string;
    location: string;
    linkedinUrl: string;
    portfolioUrl: string;
    summary: string;
    skills: string[];
    languages: string[];
    workAuthorization: string;
  }>;

  const updated = await updateCandidate(candidate.id, body);
  if (!updated) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ candidate: updated });
}
