import { NextResponse } from "next/server";
import {
  getJobById,
  getCandidateByEmail,
  createCandidate,
  createApplication,
} from "@/lib/ats/db";
import { JOBS }                   from "@/lib/ats/mock-data";
import { checkRateLimit, retryAfter } from "@/lib/auth/rate-limiter";
import {
  resolveClientIp,
  isJsonContentType,
  readBoundedTextBody,
  securityError,
} from "@/lib/security/request-guards";

const APPLY_ACTION = "careers-apply";
const MAX_BODY_BYTES = 32 * 1024;

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
  // Phase 86C4B2B1D-SECURITY-8: this is a legitimately PUBLIC applicant flow
  // that persists to the database, so it stays anonymous but gains abuse
  // controls — IP rate limit, then Content-Type and a genuinely bounded body
  // read — all BEFORE the JSON is parsed or any record is written.
  const ip = resolveClientIp(req);
  if (!(await checkRateLimit(APPLY_ACTION, ip))) {
    return securityError({ error: "Too many applications. Please try again later." }, 429, {
      "Retry-After": String(retryAfter(APPLY_ACTION, ip)),
    });
  }
  if (!isJsonContentType(req)) {
    return securityError({ error: "unsupported media type" }, 415);
  }
  const read = await readBoundedTextBody(req, MAX_BODY_BYTES);
  if (read.status === "too_large") {
    return securityError({ error: "payload too large" }, 413);
  }
  if (read.status === "error") {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  let body: ApplyBody;
  try {
    body = JSON.parse(read.text) as ApplyBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
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
