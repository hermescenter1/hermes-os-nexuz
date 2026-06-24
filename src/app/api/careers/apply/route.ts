import { NextResponse } from "next/server";
import {
  getJobById,
  getCandidateByEmail,
  createCandidate,
  createApplication,
} from "@/lib/ats/db";
import { JOBS }                   from "@/lib/ats/mock-data";

interface ApplyBody {
  jobId:             string;
  name:              string;
  email:             string;
  phone?:            string;
  location?:         string;
  coverLetter?:      string;
  resumeText?:       string;
  totalYearsExp?:    number;
  workAuthorization?: string;
  skills?:           string[];
  experience?:       unknown[];
  education?:        unknown[];
}

export async function POST(req: Request) {
  const body = (await req.json()) as ApplyBody;
  const { jobId, name, email } = body;

  if (!jobId || !name || !email) {
    return NextResponse.json(
      { error: "jobId, name, and email are required" },
      { status: 400 }
    );
  }

  // Resolve the job to get the organizationId
  const dbJob = await getJobById(jobId);

  // DB path: full persistence
  if (dbJob !== null) {
    // Upsert candidate by email
    let candidate = await getCandidateByEmail(email);
    if (!candidate) {
      candidate = await createCandidate({
        email,
        name,
        phone: body.phone,
        location: body.location,
        skills: body.skills,
        workAuthorization: body.workAuthorization,
      });
    }
    if (!candidate) {
      return NextResponse.json({ error: "Failed to create candidate record" }, { status: 500 });
    }

    const app = await createApplication({
      organizationId: dbJob.organizationId,
      jobId,
      candidateId: candidate.id,
      coverLetter: body.coverLetter,
      resumeText: body.resumeText,
      experience: body.experience,
      education: body.education,
      totalYearsExp: body.totalYearsExp,
      source: "careers_portal",
    });

    if (!app) {
      // Unique constraint violation: already applied
      return NextResponse.json(
        { error: "You have already applied for this position" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { applicationId: app.id, status: "APPLIED", message: "Application submitted successfully" },
      { status: 201 }
    );
  }

  // Mock path: validate job exists, return success without DB write
  const mockJob = JOBS.find((j) => j.id === jobId);
  if (!mockJob) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      applicationId: `mock-app-${Date.now()}`,
      status: "APPLIED",
      message: "Application submitted (demo mode — not persisted)",
    },
    { status: 201 }
  );
}
