export type JobStatus     = "draft" | "open" | "paused" | "closed";
export type ContractType  = "full-time" | "part-time" | "contract" | "internship";
export type PipelineStage =
  | "applied" | "screening" | "technical-review"
  | "interview" | "offer" | "hired" | "rejected";
export type ApplicationSource =
  | "linkedin" | "indeed" | "referral" | "direct" | "agency" | "internal";
export type WorkAuthorization =
  | "citizen" | "permanent-resident" | "work-visa" | "requires-sponsorship";
export type InterviewType   = "phone" | "video" | "on-site" | "technical" | "panel";
export type InterviewStatus = "pending" | "scheduled" | "completed" | "cancelled";

export const STAGE_LABELS: Record<PipelineStage, string> = {
  applied:            "Applied",
  screening:          "Screening",
  "technical-review": "Technical Review",
  interview:          "Interview",
  offer:              "Offer",
  hired:              "Hired",
  rejected:           "Rejected",
};

export const STAGE_ORDER: PipelineStage[] = [
  "applied", "screening", "technical-review", "interview", "offer", "hired", "rejected",
];

export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  contractType: ContractType;
  salaryMin: number;
  salaryMax: number;
  currency: string;
  requiredSkills: string[];
  niceToHaveSkills: string[];
  visaSponsorship: boolean;
  status: JobStatus;
  description: string;
  minExperienceYears: number;
  openedAt: string;
  closedAt?: string;
  applicantCount: number;
}

export interface AtsScore {
  total: number;
  skillScore: number;
  experienceScore: number;
  locationScore: number;
  authorizationScore: number;
  salaryScore: number;
  industryScore: number;
  riskFlags: string[];
  explanations: string[];
}

export interface Candidate {
  id: string;
  jobId: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  workAuthorization: WorkAuthorization;
  experienceYears: number;
  skills: string[];
  cvSummary: string;
  source: ApplicationSource;
  stage: PipelineStage;
  salaryExpectation: number;
  appliedAt: string;
  atsScore: AtsScore;
}

export interface Interview {
  id: string;
  candidateId: string;
  candidateName: string;
  jobId: string;
  jobTitle: string;
  type: InterviewType;
  scheduledAt: string | null;
  durationMinutes: number;
  interviewer: string;
  notes: string;
  status: InterviewStatus;
}

export interface PipelineColumn {
  stage: PipelineStage;
  label: string;
  candidates: Candidate[];
  count: number;
}

export interface ActivityItem {
  id: string;
  type: "applied" | "stage-change" | "interview" | "hired";
  candidateName: string;
  jobTitle: string;
  detail: string;
  timestamp: string;
}

export interface AtsOverview {
  openJobs: number;
  totalCandidates: number;
  averageScore: number;
  byStage: Record<PipelineStage, number>;
  recentActivity: ActivityItem[];
  topJobs: { jobId: string; title: string; count: number }[];
  hiringVelocityDays: number;
}

export interface AtsAnalytics {
  openJobs: number;
  closedJobs: number;
  totalCandidates: number;
  hiredCandidates: number;
  rejectedCandidates: number;
  averageAtsScore: number;
  byStage: { stage: PipelineStage; label: string; count: number }[];
  topSkills: { skill: string; count: number }[];
  byDepartment: { department: string; jobs: number; candidates: number }[];
  bySources: { source: ApplicationSource; count: number }[];
  rejectionReasons: { reason: string; count: number }[];
  hiringVelocityDays: number;
  scoreDistribution: { range: string; count: number }[];
}

export interface ScoreRequest {
  jobId: string;
  location: string;
  workAuthorization: WorkAuthorization;
  experienceYears: number;
  skills: string[];
  salaryExpectation: number;
}
