/**
 * ATS database operations (Phase 58B).
 * All functions follow the getPrisma() pattern: return null/empty when DB
 * is unavailable rather than throwing. Callers fall back to mock-data.
 *
 * All queries hard-filter WHERE deletedAt IS NULL (soft-delete pattern).
 */

import { getPrisma } from "@/lib/db/prisma";
import { randomUUID } from "node:crypto";
import type {
  AtsJobStatus,
  AtsApplicationStatus,
  AtsInterviewType,
  AtsInterviewDecision,
} from "./db-types";

export type { AtsJobStatus, AtsApplicationStatus, AtsInterviewType, AtsInterviewDecision };

// ── Lightweight row shapes ─────────────────────────────────────────────────────
// We deliberately avoid importing from @prisma/client at compile time.
// Shapes are inlined here for full TypeScript safety without a static import.

export interface DbAtsJob {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  requirements: unknown;
  responsibilities: unknown;
  benefits: unknown;
  skills: unknown;
  location: string;
  locationType: string;
  department: string;
  salaryCurrency: string;
  salaryMin: number | null;
  salaryMax: number | null;
  status: string;
  closingDate: Date | null;
  postedById: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAtsCandidate {
  id: string;
  userId: string | null;
  email: string;
  name: string;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  summary: string | null;
  skills: unknown;
  languages: unknown;
  workAuthorization: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAtsApplication {
  id: string;
  organizationId: string;
  jobId: string;
  candidateId: string;
  status: string;
  coverLetter: string | null;
  resumeUrl: string | null;
  resumeText: string | null;
  experience: unknown;
  education: unknown;
  certifications: unknown;
  totalYearsExp: number | null;
  source: string;
  notes: string | null;
  assignedTo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAtsInterview {
  id: string;
  organizationId: string;
  applicationId: string;
  interviewType: string;
  scheduledAt: Date;
  durationMinutes: number;
  interviewerId: string | null;
  interviewerName: string | null;
  location: string | null;
  notes: string | null;
  feedback: string | null;
  technicalScore: number | null;
  culturalScore: number | null;
  communicationScore: number | null;
  overallScore: number | null;
  decision: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbAtsPipelineEvent {
  id: string;
  organizationId: string;
  applicationId: string;
  fromStatus: string | null;
  toStatus: string;
  changedById: string | null;
  changedByName: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface DbAtsCandidateScore {
  id: string;
  organizationId: string;
  applicationId: string;
  skillScore: number;
  experienceScore: number;
  locationScore: number;
  authorizationScore: number;
  salaryScore: number;
  industryScore: number;
  overallScore: number;
  riskFlags: unknown;
  explanations: unknown;
  scoredAt: Date;
  scoringVersion: string;
}

// ── Type helpers for Prisma model casts ──────────────────────────────────────

type AtsJobModel = {
  findMany:   (a: unknown) => Promise<DbAtsJob[]>;
  findUnique: (a: unknown) => Promise<DbAtsJob | null>;
  create:     (a: unknown) => Promise<DbAtsJob>;
  update:     (a: unknown) => Promise<DbAtsJob>;
};
type AtsCandidateModel = {
  findUnique: (a: unknown) => Promise<DbAtsCandidate | null>;
  findFirst:  (a: unknown) => Promise<DbAtsCandidate | null>;
  create:     (a: unknown) => Promise<DbAtsCandidate>;
  update:     (a: unknown) => Promise<DbAtsCandidate>;
  upsert:     (a: unknown) => Promise<DbAtsCandidate>;
};
type AtsApplicationModel = {
  findMany:   (a: unknown) => Promise<DbAtsApplication[]>;
  findUnique: (a: unknown) => Promise<DbAtsApplication | null>;
  create:     (a: unknown) => Promise<DbAtsApplication>;
  update:     (a: unknown) => Promise<DbAtsApplication>;
};
type AtsInterviewModel = {
  findMany:   (a: unknown) => Promise<DbAtsInterview[]>;
  findUnique: (a: unknown) => Promise<DbAtsInterview | null>;
  create:     (a: unknown) => Promise<DbAtsInterview>;
  update:     (a: unknown) => Promise<DbAtsInterview>;
};
type AtsPipelineEventModel = {
  findMany: (a: unknown) => Promise<DbAtsPipelineEvent[]>;
  create:   (a: unknown) => Promise<DbAtsPipelineEvent>;
};
type AtsCandidateScoreModel = {
  findUnique: (a: unknown) => Promise<DbAtsCandidateScore | null>;
  upsert:     (a: unknown) => Promise<DbAtsCandidateScore>;
};

async function models() {
  const db = await getPrisma();
  if (!db) return null;
  const d = db as Record<string, unknown>;
  return {
    job:        d.atsJob           as AtsJobModel,
    candidate:  d.atsCandidate     as AtsCandidateModel,
    application: d.atsApplication  as AtsApplicationModel,
    interview:  d.atsInterview     as AtsInterviewModel,
    event:      d.atsPipelineEvent as AtsPipelineEventModel,
    score:      d.atsCandidateScore as AtsCandidateScoreModel,
  };
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export async function getPublicJobs(opts?: {
  department?: string;
  location?: string;
  search?: string;
}): Promise<DbAtsJob[] | null> {
  const m = await models();
  if (!m) return null;
  try {
    const rows = await m.job.findMany({
      where: {
        status: "OPEN",
        isPublic: true,
        deletedAt: null,
        ...(opts?.department ? { department: opts.department } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      return rows.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.department.toLowerCase().includes(q) ||
          j.location.toLowerCase().includes(q)
      );
    }
    return rows;
  } catch { return null; }
}

export async function getJobById(id: string): Promise<DbAtsJob | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.job.findUnique({ where: { id, deletedAt: null } });
  } catch { return null; }
}

export async function getOrgJobs(organizationId: string, opts?: {
  status?: string;
}): Promise<DbAtsJob[] | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.job.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(opts?.status ? { status: opts.status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  } catch { return null; }
}

export async function createJob(data: {
  organizationId: string;
  title: string;
  description: string;
  department: string;
  location: string;
  locationType?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  skills?: string[];
  requirements?: string[];
  responsibilities?: string[];
  benefits?: string[];
  status?: string;
  postedById?: string;
  closingDate?: Date;
}): Promise<DbAtsJob | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.job.create({
      data: {
        id: randomUUID(),
        organizationId: data.organizationId,
        title: data.title,
        description: data.description,
        department: data.department,
        location: data.location,
        locationType: data.locationType ?? "onsite",
        salaryMin: data.salaryMin,
        salaryMax: data.salaryMax,
        salaryCurrency: data.salaryCurrency ?? "USD",
        skills: data.skills ?? [],
        requirements: data.requirements ?? [],
        responsibilities: data.responsibilities ?? [],
        benefits: data.benefits ?? [],
        status: data.status ?? "DRAFT",
        postedById: data.postedById,
        closingDate: data.closingDate,
        isPublic: true,
      },
    });
  } catch { return null; }
}

// ── Candidates ────────────────────────────────────────────────────────────────

export async function getCandidateByEmail(email: string): Promise<DbAtsCandidate | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.candidate.findUnique({ where: { email, deletedAt: null } });
  } catch { return null; }
}

export async function getCandidateByUserId(userId: string): Promise<DbAtsCandidate | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.candidate.findUnique({ where: { userId, deletedAt: null } });
  } catch { return null; }
}

export async function createCandidate(data: {
  userId?: string;
  email: string;
  name: string;
  phone?: string;
  location?: string;
  summary?: string;
  skills?: string[];
  workAuthorization?: string;
}): Promise<DbAtsCandidate | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.candidate.create({
      data: {
        id: randomUUID(),
        userId: data.userId,
        email: data.email,
        name: data.name,
        phone: data.phone,
        location: data.location,
        summary: data.summary,
        skills: data.skills ?? [],
        workAuthorization: data.workAuthorization ?? "citizen",
      },
    });
  } catch { return null; }
}

export async function updateCandidate(
  id: string,
  data: Partial<{
    name: string;
    phone: string;
    location: string;
    linkedinUrl: string;
    portfolioUrl: string;
    summary: string;
    skills: string[];
    languages: string[];
    workAuthorization: string;
  }>
): Promise<DbAtsCandidate | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.candidate.update({ where: { id }, data });
  } catch { return null; }
}

export async function linkCandidateUser(
  candidateId: string,
  userId: string
): Promise<DbAtsCandidate | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.candidate.update({ where: { id: candidateId }, data: { userId } });
  } catch { return null; }
}

// ── Applications ──────────────────────────────────────────────────────────────

export async function getApplicationsByCandidate(
  candidateId: string
): Promise<DbAtsApplication[] | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.application.findMany({
      where: { candidateId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  } catch { return null; }
}

export async function getApplicationsByOrg(
  organizationId: string,
  opts?: { jobId?: string; status?: string }
): Promise<DbAtsApplication[] | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.application.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(opts?.jobId  ? { jobId: opts.jobId }   : {}),
        ...(opts?.status ? { status: opts.status }  : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  } catch { return null; }
}

export async function getApplicationById(id: string): Promise<DbAtsApplication | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.application.findUnique({ where: { id, deletedAt: null } });
  } catch { return null; }
}

export async function createApplication(data: {
  organizationId: string;
  jobId: string;
  candidateId: string;
  coverLetter?: string;
  resumeText?: string;
  experience?: unknown[];
  education?: unknown[];
  certifications?: unknown[];
  totalYearsExp?: number;
  source?: string;
}): Promise<DbAtsApplication | null> {
  const m = await models();
  if (!m) return null;
  try {
    const app = await m.application.create({
      data: {
        id: randomUUID(),
        organizationId: data.organizationId,
        jobId: data.jobId,
        candidateId: data.candidateId,
        status: "APPLIED",
        coverLetter: data.coverLetter,
        resumeText: data.resumeText,
        experience: data.experience ?? [],
        education: data.education ?? [],
        certifications: data.certifications ?? [],
        totalYearsExp: data.totalYearsExp,
        source: data.source ?? "careers_portal",
      },
    });
    // Create initial pipeline event
    await m.event.create({
      data: {
        id: randomUUID(),
        organizationId: data.organizationId,
        applicationId: app.id,
        fromStatus: null,
        toStatus: "APPLIED",
      },
    });
    return app;
  } catch { return null; }
}

export async function updateApplicationStatus(
  applicationId: string,
  organizationId: string,
  toStatus: string,
  opts?: { changedById?: string; changedByName?: string; notes?: string }
): Promise<DbAtsApplication | null> {
  const m = await models();
  if (!m) return null;
  try {
    const current = await m.application.findUnique({ where: { id: applicationId } });
    if (!current) return null;
    const updated = await m.application.update({
      where: { id: applicationId },
      data:  { status: toStatus },
    });
    await m.event.create({
      data: {
        id: randomUUID(),
        organizationId,
        applicationId,
        fromStatus: current.status,
        toStatus,
        changedById:   opts?.changedById,
        changedByName: opts?.changedByName,
        notes:         opts?.notes,
      },
    });
    return updated;
  } catch { return null; }
}

// ── Interviews ────────────────────────────────────────────────────────────────

export async function getInterviewsByApplication(
  applicationId: string
): Promise<DbAtsInterview[] | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.interview.findMany({
      where: { applicationId, deletedAt: null },
      orderBy: { scheduledAt: "asc" },
    });
  } catch { return null; }
}

export async function getInterviewsByOrg(
  organizationId: string,
  opts?: { upcoming?: boolean }
): Promise<DbAtsInterview[] | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.interview.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(opts?.upcoming ? { scheduledAt: { gte: new Date() } } : {}),
      },
      orderBy: { scheduledAt: "asc" },
    });
  } catch { return null; }
}

export async function createInterview(data: {
  organizationId: string;
  applicationId: string;
  interviewType?: string;
  scheduledAt: Date;
  durationMinutes?: number;
  interviewerId?: string;
  interviewerName?: string;
  location?: string;
  notes?: string;
}): Promise<DbAtsInterview | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.interview.create({
      data: {
        id: randomUUID(),
        organizationId: data.organizationId,
        applicationId: data.applicationId,
        interviewType: data.interviewType ?? "VIDEO_CALL",
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes ?? 60,
        interviewerId: data.interviewerId,
        interviewerName: data.interviewerName,
        location: data.location,
        notes: data.notes,
        decision: "PENDING",
      },
    });
  } catch { return null; }
}

export async function submitInterviewFeedback(
  interviewId: string,
  data: {
    feedback: string;
    technicalScore?: number;
    culturalScore?: number;
    communicationScore?: number;
    overallScore?: number;
    decision: string;
    notes?: string;
  }
): Promise<DbAtsInterview | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.interview.update({
      where: { id: interviewId },
      data: {
        feedback: data.feedback,
        technicalScore: data.technicalScore,
        culturalScore: data.culturalScore,
        communicationScore: data.communicationScore,
        overallScore: data.overallScore,
        decision: data.decision,
        notes: data.notes,
        completedAt: new Date(),
      },
    });
  } catch { return null; }
}

// ── Pipeline events ───────────────────────────────────────────────────────────

export async function getPipelineEvents(
  applicationId: string
): Promise<DbAtsPipelineEvent[] | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.event.findMany({
      where: { applicationId },
      orderBy: { createdAt: "asc" },
    });
  } catch { return null; }
}

// ── Candidate scores ──────────────────────────────────────────────────────────

export async function upsertScore(data: {
  organizationId: string;
  applicationId: string;
  skillScore: number;
  experienceScore: number;
  locationScore: number;
  authorizationScore: number;
  salaryScore: number;
  industryScore: number;
  overallScore: number;
  riskFlags: string[];
  explanations: string[];
}): Promise<DbAtsCandidateScore | null> {
  const m = await models();
  if (!m) return null;
  try {
    return await m.score.upsert({
      where: { applicationId: data.applicationId },
      create: {
        id: randomUUID(),
        ...data,
        scoredAt: new Date(),
        scoringVersion: "1.0",
      },
      update: {
        skillScore: data.skillScore,
        experienceScore: data.experienceScore,
        locationScore: data.locationScore,
        authorizationScore: data.authorizationScore,
        salaryScore: data.salaryScore,
        industryScore: data.industryScore,
        overallScore: data.overallScore,
        riskFlags: data.riskFlags,
        explanations: data.explanations,
        scoredAt: new Date(),
      },
    });
  } catch { return null; }
}
