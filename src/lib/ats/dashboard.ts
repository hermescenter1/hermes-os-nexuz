/**
 * ATS go-live — the REAL, tenant-scoped dashboard aggregator.
 *
 * Every figure here comes from this organization's own PostgreSQL records
 * (`AtsApplication` joined to its `AtsCandidate`, `AtsJob` and
 * `AtsCandidateScore`). There is no fixture, no fabricated person, no invented
 * score, trend, velocity or chart. When the organization has no applications
 * yet — the real state of a fresh deployment — every list is empty and every
 * count is zero; a zero denominator yields `null`/"insufficient data", never an
 * invented percentage.
 *
 * EXCLUSIONS (the surfaces here are person-centric):
 *   - soft-deleted applications (`AtsApplication.deletedAt`);
 *   - anonymised applications (`AtsApplication.anonymizedAt`) — their personal
 *     content is gone;
 *   - applications whose candidate has been erased (`AtsCandidate.deletedAt`).
 * A caller who wants erased/anonymised records for compliance reads them
 * elsewhere; the recruitment dashboard never shows a person who has been erased.
 *
 * Returns `null` on a store fault so the route can answer a controlled 5xx — it
 * MUST NOT fall back to any sample data.
 */
import { getPrisma } from "@/lib/db/prisma";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  type PipelineStage,
  type ApplicationSource,
  type AtsScore,
  type Candidate,
  type PipelineColumn,
  type ActivityItem,
  type AtsOverview,
  type AtsAnalytics,
} from "./types";

/** Map the real AtsApplicationStatus to the pipeline-stage vocabulary the
 *  dashboard renders. The pre-human stages (AI review, pending approval) are
 *  still "applied" — a candidate no human has acted on yet. */
function stageOf(status: string): PipelineStage {
  switch (status) {
    case "SCREENING": return "screening";
    case "TECHNICAL_REVIEW": return "technical-review";
    case "INTERVIEW": return "interview";
    case "OFFER": return "offer";
    case "HIRED": return "hired";
    case "REJECTED": return "rejected";
    // APPLIED, AI_REVIEW_PENDING, PENDING_HUMAN_APPROVAL and anything unknown
    default: return "applied";
  }
}

const SOURCES: ApplicationSource[] = ["linkedin", "indeed", "referral", "direct", "agency", "internal"];
function sourceOf(raw: string | null | undefined): ApplicationSource {
  const v = (raw ?? "").toLowerCase();
  return (SOURCES as string[]).includes(v) ? (v as ApplicationSource) : "direct";
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function zeroScore(): AtsScore {
  return {
    total: 0, skillScore: 0, experienceScore: 0, locationScore: 0,
    authorizationScore: 0, salaryScore: 0, industryScore: 0,
    riskFlags: [], explanations: [],
  };
}

interface ScoreRow {
  skillScore: number; experienceScore: number; locationScore: number;
  authorizationScore: number; salaryScore: number; industryScore: number;
  overallScore: number; riskFlags: unknown; explanations: unknown;
}
function mapScore(s: ScoreRow | null | undefined): { score: AtsScore; scored: boolean } {
  if (!s) return { score: zeroScore(), scored: false };
  return {
    scored: true,
    score: {
      total: s.overallScore,
      skillScore: s.skillScore,
      experienceScore: s.experienceScore,
      locationScore: s.locationScore,
      authorizationScore: s.authorizationScore,
      salaryScore: s.salaryScore,
      industryScore: s.industryScore,
      riskFlags: asStringArray(s.riskFlags),
      explanations: asStringArray(s.explanations),
    },
  };
}

interface AppRow {
  id: string;
  jobId: string;
  status: string;
  source: string;
  totalYearsExp: number | null;
  createdAt: Date;
  candidate: { id: string; name: string; email: string; phone: string | null; location: string | null; skills: unknown } | null;
  job: { id: string; title: string; department: string | null; status: string } | null;
  score: ScoreRow | null;
}

type Delegate = { findMany: (a: unknown) => Promise<unknown[]> };
function models(db: unknown) {
  const d = db as Record<string, Delegate | undefined>;
  if (!d.atsApplication?.findMany || !d.atsJob?.findMany) return null;
  return { app: d.atsApplication, job: d.atsJob };
}

/** One tenant-scoped read of the live applications, with everything the four
 *  dashboard views need. Erased, anonymised and soft-deleted rows are excluded
 *  at the query level. Returns null on a store fault. */
async function loadApplications(organizationId: string): Promise<AppRow[] | null> {
  const db = await getPrisma();
  if (!db) return null;
  const m = models(db);
  if (!m) return null;
  try {
    const rows = await m.app.findMany({
      where: {
        organizationId,
        deletedAt: null,
        anonymizedAt: null,
        candidate: { deletedAt: null },
      },
      select: {
        id: true, jobId: true, status: true, source: true, totalYearsExp: true, createdAt: true,
        candidate: { select: { id: true, name: true, email: true, phone: true, location: true, skills: true } },
        job: { select: { id: true, title: true, department: true, status: true } },
        score: {
          select: {
            skillScore: true, experienceScore: true, locationScore: true, authorizationScore: true,
            salaryScore: true, industryScore: true, overallScore: true, riskFlags: true, explanations: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows as AppRow[];
  } catch {
    return null;
  }
}

interface JobRow { id: string; title: string; department: string | null; status: string }
async function loadJobs(organizationId: string): Promise<JobRow[] | null> {
  const db = await getPrisma();
  if (!db) return null;
  const m = models(db);
  if (!m) return null;
  try {
    const rows = await m.job.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, title: true, department: true, status: true },
    });
    return rows as JobRow[];
  } catch {
    return null;
  }
}

function toCandidate(a: AppRow): Candidate & { scored: boolean } {
  const { score, scored } = mapScore(a.score);
  return {
    id: a.id,
    jobId: a.jobId,
    name: a.candidate?.name ?? "",
    email: a.candidate?.email ?? "",
    phone: a.candidate?.phone ?? "",
    location: a.candidate?.location ?? "",
    workAuthorization: "not-collected", // real intake does not collect this
    experienceYears: a.totalYearsExp ?? 0,
    skills: asStringArray(a.candidate?.skills),
    cvSummary: "",
    source: sourceOf(a.source),
    stage: stageOf(a.status),
    salaryExpectation: null, // real intake does not collect this
    appliedAt: a.createdAt.toISOString(),
    atsScore: score,
    scored,
  };
}

function emptyByStage(): Record<PipelineStage, number> {
  return Object.fromEntries(STAGE_ORDER.map((s) => [s, 0])) as Record<PipelineStage, number>;
}

export async function getAtsOverview(organizationId: string): Promise<AtsOverview | null> {
  const [apps, jobs] = await Promise.all([loadApplications(organizationId), loadJobs(organizationId)]);
  if (apps === null || jobs === null) return null;

  const byStage = emptyByStage();
  for (const a of apps) byStage[stageOf(a.status)] += 1;

  const scored = apps.filter((a) => a.score);
  const averageScore = scored.length > 0
    ? Math.round(scored.reduce((sum, a) => sum + (a.score?.overallScore ?? 0), 0) / scored.length)
    : 0;

  const candidateIds = new Set(apps.map((a) => a.candidate?.id).filter(Boolean));

  const byJob = new Map<string, { title: string; count: number }>();
  for (const a of apps) {
    const j = byJob.get(a.jobId) ?? { title: a.job?.title ?? "", count: 0 };
    j.count += 1;
    byJob.set(a.jobId, j);
  }
  const topJobs = [...byJob.entries()]
    .map(([jobId, v]) => ({ jobId, title: v.title, count: v.count }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 5);

  const recentActivity: ActivityItem[] = apps.slice(0, 8).map((a) => ({
    id: a.id,
    type: "applied",
    candidateName: a.candidate?.name ?? "",
    jobTitle: a.job?.title ?? "",
    detail: "",
    timestamp: a.createdAt.toISOString(),
  }));

  return {
    openJobs: jobs.filter((j) => j.status === "OPEN").length,
    totalCandidates: candidateIds.size,
    averageScore,
    byStage,
    recentActivity,
    topJobs,
    hiringVelocityDays: 0, // no time-to-hire is computed from invented data; 0 until real history exists
  };
}

export async function getAtsCandidates(
  organizationId: string,
  opts?: { stage?: PipelineStage },
): Promise<(Candidate & { scored: boolean })[] | null> {
  const apps = await loadApplications(organizationId);
  if (apps === null) return null;
  const rows = apps.map(toCandidate);
  return opts?.stage ? rows.filter((c) => c.stage === opts.stage) : rows;
}

export async function getAtsPipeline(organizationId: string): Promise<PipelineColumn[] | null> {
  const apps = await loadApplications(organizationId);
  if (apps === null) return null;
  const byStage = new Map<PipelineStage, (Candidate & { scored: boolean })[]>();
  for (const s of STAGE_ORDER) byStage.set(s, []);
  for (const a of apps) byStage.get(stageOf(a.status))!.push(toCandidate(a));
  return STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    candidates: byStage.get(stage)!,
    count: byStage.get(stage)!.length,
  }));
}

export async function getAtsAnalytics(organizationId: string): Promise<AtsAnalytics | null> {
  const [apps, jobs] = await Promise.all([loadApplications(organizationId), loadJobs(organizationId)]);
  if (apps === null || jobs === null) return null;

  const byStageCount = emptyByStage();
  for (const a of apps) byStageCount[stageOf(a.status)] += 1;

  const scored = apps.filter((a) => a.score);
  const averageAtsScore = scored.length > 0
    ? Math.round(scored.reduce((s, a) => s + (a.score?.overallScore ?? 0), 0) / scored.length)
    : 0;

  const skillCounts = new Map<string, number>();
  for (const a of apps) for (const sk of asStringArray(a.candidate?.skills)) {
    skillCounts.set(sk, (skillCounts.get(sk) ?? 0) + 1);
  }
  const topSkills = [...skillCounts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((x, y) => y.count - x.count)
    .slice(0, 10);

  const deptCounts = new Map<string, { jobs: Set<string>; candidates: number }>();
  for (const j of jobs) {
    const dep = j.department ?? "—";
    const e = deptCounts.get(dep) ?? { jobs: new Set<string>(), candidates: 0 };
    e.jobs.add(j.id);
    deptCounts.set(dep, e);
  }
  const jobDept = new Map(jobs.map((j) => [j.id, j.department ?? "—"]));
  for (const a of apps) {
    const dep = jobDept.get(a.jobId) ?? "—";
    const e = deptCounts.get(dep) ?? { jobs: new Set<string>(), candidates: 0 };
    e.candidates += 1;
    deptCounts.set(dep, e);
  }
  const byDepartment = [...deptCounts.entries()].map(([department, v]) => ({
    department, jobs: v.jobs.size, candidates: v.candidates,
  }));

  const sourceCounts = new Map<ApplicationSource, number>();
  for (const a of apps) {
    const s = sourceOf(a.source);
    sourceCounts.set(s, (sourceCounts.get(s) ?? 0) + 1);
  }
  const bySources = [...sourceCounts.entries()].map(([source, count]) => ({ source, count }));

  // Score distribution only over really-scored applications; empty when none.
  const buckets: Record<string, number> = { "0-39": 0, "40-59": 0, "60-79": 0, "80-100": 0 };
  for (const a of scored) {
    const t = a.score!.overallScore;
    const key = t < 40 ? "0-39" : t < 60 ? "40-59" : t < 80 ? "60-79" : "80-100";
    buckets[key] += 1;
  }
  const scoreDistribution = scored.length > 0
    ? Object.entries(buckets).map(([range, count]) => ({ range, count }))
    : [];

  return {
    openJobs: jobs.filter((j) => j.status === "OPEN").length,
    closedJobs: jobs.filter((j) => j.status === "CLOSED" || j.status === "ARCHIVED").length,
    totalCandidates: new Set(apps.map((a) => a.candidate?.id).filter(Boolean)).size,
    hiredCandidates: byStageCount.hired,
    rejectedCandidates: byStageCount.rejected,
    averageAtsScore,
    byStage: STAGE_ORDER.map((stage) => ({ stage, label: STAGE_LABELS[stage], count: byStageCount[stage] })),
    topSkills,
    byDepartment,
    bySources,
    rejectionReasons: [], // no free-text reason is mined into a fabricated category
    hiringVelocityDays: 0,
    scoreDistribution,
  };
}

/** True when there is no real recruitment data at all — the signal a view uses
 *  to show its honest empty state instead of zeroed widgets. */
export async function getAtsHasData(organizationId: string): Promise<boolean | null> {
  const apps = await loadApplications(organizationId);
  if (apps === null) return null;
  return apps.length > 0;
}
