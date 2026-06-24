import type { Job, Candidate, Interview, ActivityItem, PipelineStage } from "./types";
import { scoreCandidate } from "./scoring";

export const JOBS: Job[] = [
  {
    id: "job-001",
    title: "Senior PLC Engineer",
    department: "Automation Engineering",
    location: "Frankfurt, Germany",
    contractType: "full-time",
    salaryMin: 65000, salaryMax: 85000, currency: "EUR",
    requiredSkills: ["Siemens TIA Portal", "PLC Programming", "IEC 61131-3", "PROFIBUS", "PROFINET"],
    niceToHaveSkills: ["SCADA", "HMI Design", "Safety PLC", "OPC-UA"],
    visaSponsorship: true,
    status: "open",
    description: "Lead PLC programming for industrial automation projects at Tier-1 automotive and manufacturing clients. Responsible for system design, commissioning, and client training.",
    minExperienceYears: 5,
    openedAt: "2026-05-01",
    applicantCount: 8,
  },
  {
    id: "job-002",
    title: "SCADA Architect",
    department: "Automation Engineering",
    location: "Dubai, UAE",
    contractType: "full-time",
    salaryMin: 85000, salaryMax: 120000, currency: "USD",
    requiredSkills: ["SCADA", "Wonderware", "FactoryTalk", "OPC-UA", "SQL"],
    niceToHaveSkills: ["Python", "Historian", "MES", "ISA-88", "IIoT"],
    visaSponsorship: true,
    status: "open",
    description: "Design and architect enterprise SCADA systems for oil & gas and utility clients across the Middle East. Lead a team of 4 engineers.",
    minExperienceYears: 8,
    openedAt: "2026-05-15",
    applicantCount: 5,
  },
  {
    id: "job-003",
    title: "Automation Technician",
    department: "Field Services",
    location: "Paris, France",
    contractType: "full-time",
    salaryMin: 38000, salaryMax: 52000, currency: "EUR",
    requiredSkills: ["PLC", "HMI", "Electrical Wiring", "Troubleshooting"],
    niceToHaveSkills: ["Siemens", "Schneider Electric", "VFD", "Drives"],
    visaSponsorship: false,
    status: "open",
    description: "On-site automation support and commissioning for manufacturing clients in the Île-de-France region.",
    minExperienceYears: 2,
    openedAt: "2026-06-01",
    applicantCount: 12,
  },
  {
    id: "job-004",
    title: "Industrial Software Developer",
    department: "Software Engineering",
    location: "Amsterdam, Netherlands",
    contractType: "full-time",
    salaryMin: 70000, salaryMax: 95000, currency: "EUR",
    requiredSkills: ["Python", "REST API", "OPC-UA", "Linux", "Docker"],
    niceToHaveSkills: ["TypeScript", "React", "Industrial IoT", "MQTT", "Kafka"],
    visaSponsorship: true,
    status: "open",
    description: "Build industrial data platforms and IIoT connectivity layers. Work with plant engineers to digitize production data flows.",
    minExperienceYears: 4,
    openedAt: "2026-06-10",
    applicantCount: 9,
  },
  {
    id: "job-005",
    title: "Field Service Engineer",
    department: "Field Services",
    location: "Houston, TX, USA",
    contractType: "contract",
    salaryMin: 75000, salaryMax: 100000, currency: "USD",
    requiredSkills: ["Commissioning", "Instrumentation", "P&ID", "Control Systems"],
    niceToHaveSkills: ["ABB", "Emerson", "DCS", "Safety Systems", "HAZOP"],
    visaSponsorship: false,
    status: "paused",
    description: "Commission and maintain control systems at petroleum refinery and petrochemical clients. Travel up to 60% required.",
    minExperienceYears: 6,
    openedAt: "2026-04-15",
    applicantCount: 6,
  },
  {
    id: "job-006",
    title: "Sales Engineer — Industrial Automation",
    department: "Sales",
    location: "London, UK",
    contractType: "full-time",
    salaryMin: 55000, salaryMax: 75000, currency: "GBP",
    requiredSkills: ["Sales", "Technical Presentations", "Automation Knowledge"],
    niceToHaveSkills: ["PLC", "SCADA", "Account Management", "CRM", "Salesforce"],
    visaSponsorship: false,
    status: "open",
    description: "Drive automation product and solution sales to industrial manufacturing clients across UK and Ireland. Quota-bearing role.",
    minExperienceYears: 3,
    openedAt: "2026-06-20",
    applicantCount: 4,
  },
];

type RawCandidate = Omit<Candidate, "atsScore">;

const RAW_CANDIDATES: RawCandidate[] = [
  // ── job-001 Senior PLC Engineer ──────────────────────────────────────────
  {
    id: "cand-001", jobId: "job-001",
    name: "Ahmad Karimi", email: "a.karimi@example.com", phone: "+49 151 2345 6789",
    location: "Frankfurt, Germany", workAuthorization: "work-visa", experienceYears: 7,
    skills: ["Siemens TIA Portal", "PLC Programming", "IEC 61131-3", "PROFIBUS", "PROFINET", "SCADA", "HMI Design"],
    cvSummary: "7 years PLC programming with Siemens S7-1200/1500. Strong automotive sector background. Fluent in German and English.",
    source: "linkedin", stage: "interview", salaryExpectation: 78000, appliedAt: "2026-06-03",
  },
  {
    id: "cand-002", jobId: "job-001",
    name: "Lars Petersen", email: "l.petersen@example.com", phone: "+49 176 8765 4321",
    location: "Frankfurt, Germany", workAuthorization: "permanent-resident", experienceYears: 9,
    skills: ["Siemens TIA Portal", "PLC Programming", "IEC 61131-3", "PROFIBUS", "PROFINET", "Safety PLC", "OPC-UA", "SCADA"],
    cvSummary: "9 years automation engineering. Led 3 greenfield PLC projects for BMW and Volkswagen. Expert in functional safety (SIL 2).",
    source: "referral", stage: "offer", salaryExpectation: 84000, appliedAt: "2026-05-25",
  },
  {
    id: "cand-003", jobId: "job-001",
    name: "Mehdi Tehrani", email: "m.tehrani@example.com", phone: "+49 152 1111 2222",
    location: "Munich, Germany", workAuthorization: "work-visa", experienceYears: 5,
    skills: ["Siemens TIA Portal", "PLC Programming", "IEC 61131-3", "PROFINET", "HMI Design"],
    cvSummary: "5 years PLC experience in food & beverage automation. Proficient with Siemens Step 7 and TIA Portal. Open to relocation.",
    source: "indeed", stage: "technical-review", salaryExpectation: 68000, appliedAt: "2026-06-12",
  },
  {
    id: "cand-004", jobId: "job-001",
    name: "Anna Müller", email: "a.mueller@example.com", phone: "+49 160 3333 4444",
    location: "Berlin, Germany", workAuthorization: "citizen", experienceYears: 2,
    skills: ["PLC", "Electrical Wiring", "AutoCAD"],
    cvSummary: "2 years as junior automation technician. Limited PLC experience in building automation. Eager to learn.",
    source: "direct", stage: "rejected", salaryExpectation: 55000, appliedAt: "2026-06-18",
  },

  // ── job-002 SCADA Architect ───────────────────────────────────────────────
  {
    id: "cand-005", jobId: "job-002",
    name: "James Wright", email: "j.wright@example.com", phone: "+971 50 111 2222",
    location: "Dubai, UAE", workAuthorization: "work-visa", experienceYears: 11,
    skills: ["SCADA", "Wonderware", "FactoryTalk", "OPC-UA", "SQL", "Historian", "MES", "Python"],
    cvSummary: "11 years SCADA architecture across oil & gas and utilities in GCC. Led ADNOC SCADA modernisation project. AVEVA certified.",
    source: "linkedin", stage: "interview", salaryExpectation: 115000, appliedAt: "2026-06-05",
  },
  {
    id: "cand-006", jobId: "job-002",
    name: "Priya Sharma", email: "p.sharma@example.com", phone: "+971 55 333 4444",
    location: "Abu Dhabi, UAE", workAuthorization: "work-visa", experienceYears: 8,
    skills: ["SCADA", "Wonderware", "OPC-UA", "SQL", "Python", "ISA-88"],
    cvSummary: "8 years SCADA engineering in UAE water treatment and desalination plants. Strong SQL and historian expertise.",
    source: "referral", stage: "screening", salaryExpectation: 92000, appliedAt: "2026-06-17",
  },
  {
    id: "cand-007", jobId: "job-002",
    name: "Omar Benali", email: "o.benali@example.com", phone: "+971 52 555 6666",
    location: "Riyadh, Saudi Arabia", workAuthorization: "work-visa", experienceYears: 9,
    skills: ["SCADA", "FactoryTalk", "OPC-UA", "SQL", "Historian", "IIoT"],
    cvSummary: "9 years industrial SCADA across Aramco-tier clients. Specialised in real-time data infrastructure and historian performance.",
    source: "agency", stage: "technical-review", salaryExpectation: 105000, appliedAt: "2026-06-10",
  },

  // ── job-003 Automation Technician ────────────────────────────────────────
  {
    id: "cand-008", jobId: "job-003",
    name: "Pierre Dubois", email: "p.dubois@example.com", phone: "+33 6 11 22 33 44",
    location: "Paris, France", workAuthorization: "citizen", experienceYears: 3,
    skills: ["PLC", "HMI", "Electrical Wiring", "Troubleshooting", "Schneider Electric"],
    cvSummary: "3 years automation technician in automotive parts manufacturing. Proficient with Schneider M221/M340 PLCs.",
    source: "indeed", stage: "applied", salaryExpectation: 43000, appliedAt: "2026-06-21",
  },
  {
    id: "cand-009", jobId: "job-003",
    name: "Sofia Ricci", email: "s.ricci@example.com", phone: "+33 6 55 66 77 88",
    location: "Lyon, France", workAuthorization: "citizen", experienceYears: 5,
    skills: ["PLC", "HMI", "Electrical Wiring", "Troubleshooting", "Siemens", "VFD", "Drives"],
    cvSummary: "5 years automation technician specialised in packaging lines. Strong Siemens and Schneider experience. Open to Paris relocation.",
    source: "linkedin", stage: "screening", salaryExpectation: 49000, appliedAt: "2026-06-14",
  },
  {
    id: "cand-010", jobId: "job-003",
    name: "Kris Van Den Berg", email: "k.vdb@example.com", phone: "+32 476 111 222",
    location: "Brussels, Belgium", workAuthorization: "citizen", experienceYears: 4,
    skills: ["PLC", "HMI", "Electrical Wiring", "Troubleshooting", "Siemens", "Drives"],
    cvSummary: "4 years automation technician in food processing. Extensive experience with Siemens S7-300/400. Basic French language skills.",
    source: "direct", stage: "interview", salaryExpectation: 47000, appliedAt: "2026-06-08",
  },
  {
    id: "cand-011", jobId: "job-003",
    name: "María López", email: "m.lopez@example.com", phone: "+34 612 333 444",
    location: "Madrid, Spain", workAuthorization: "citizen", experienceYears: 1,
    skills: ["Electrical Wiring", "AutoCAD", "Basic PLC"],
    cvSummary: "1 year as electrical apprentice. Limited PLC experience. Looking for first automation role.",
    source: "indeed", stage: "rejected", salaryExpectation: 35000, appliedAt: "2026-06-19",
  },
  {
    id: "cand-012", jobId: "job-003",
    name: "Yusuf Al-Rashid", email: "y.alrashid@example.com", phone: "+33 7 99 88 77 66",
    location: "Paris, France", workAuthorization: "citizen", experienceYears: 3,
    skills: ["PLC", "HMI", "Troubleshooting", "Schneider Electric", "VFD"],
    cvSummary: "3 years automation maintenance in pharmaceutical cleanroom environments. ISO-compliant maintenance procedures experience.",
    source: "referral", stage: "applied", salaryExpectation: 45000, appliedAt: "2026-06-22",
  },

  // ── job-004 Industrial Software Developer ────────────────────────────────
  {
    id: "cand-013", jobId: "job-004",
    name: "Alex Chen", email: "a.chen@example.com", phone: "+31 6 12 34 56 78",
    location: "Amsterdam, Netherlands", workAuthorization: "work-visa", experienceYears: 6,
    skills: ["Python", "REST API", "OPC-UA", "Linux", "Docker", "Industrial IoT", "MQTT", "TypeScript", "React"],
    cvSummary: "6 years industrial software development. Built OPC-UA bridge for Siemens S7 to cloud at Philips Electronics. Open source contributor.",
    source: "linkedin", stage: "offer", salaryExpectation: 88000, appliedAt: "2026-05-28",
  },
  {
    id: "cand-014", jobId: "job-004",
    name: "Nadia Volkova", email: "n.volkova@example.com", phone: "+31 6 98 76 54 32",
    location: "Rotterdam, Netherlands", workAuthorization: "permanent-resident", experienceYears: 5,
    skills: ["Python", "REST API", "OPC-UA", "Linux", "Docker", "Kafka", "MQTT"],
    cvSummary: "5 years backend software engineering for industrial IoT platforms. Developed MQTT data pipelines for 40,000 sensor endpoints.",
    source: "direct", stage: "technical-review", salaryExpectation: 82000, appliedAt: "2026-06-13",
  },
  {
    id: "cand-015", jobId: "job-004",
    name: "Marco Ferretti", email: "m.ferretti@example.com", phone: "+39 331 555 6666",
    location: "Milan, Italy", workAuthorization: "citizen", experienceYears: 3,
    skills: ["Python", "REST API", "Linux", "Docker", "TypeScript"],
    cvSummary: "3 years Python backend developer in e-commerce. No industrial background but strong programming skills. Open to Amsterdam relocation.",
    source: "indeed", stage: "screening", salaryExpectation: 70000, appliedAt: "2026-06-16",
  },
  {
    id: "cand-016", jobId: "job-004",
    name: "Liam O'Brien", email: "l.obrien@example.com", phone: "+353 86 111 2222",
    location: "Dublin, Ireland", workAuthorization: "citizen", experienceYears: 2,
    skills: ["Python", "JavaScript", "REST API"],
    cvSummary: "2 years junior developer. No industrial or OPC-UA experience. Interested in the industrial sector.",
    source: "direct", stage: "rejected", salaryExpectation: 65000, appliedAt: "2026-06-20",
  },

  // ── job-005 Field Service Engineer ──────────────────────────────────────
  {
    id: "cand-017", jobId: "job-005",
    name: "Carlos Mendez", email: "c.mendez@example.com", phone: "+1 713 555 1234",
    location: "Houston, TX, USA", workAuthorization: "citizen", experienceYears: 8,
    skills: ["Commissioning", "Instrumentation", "P&ID", "Control Systems", "ABB", "DCS", "Safety Systems"],
    cvSummary: "8 years field service engineer at refineries and petrochemical plants in Texas and Louisiana. ABB certified. HAZOP trained.",
    source: "referral", stage: "interview", salaryExpectation: 95000, appliedAt: "2026-06-07",
  },
  {
    id: "cand-018", jobId: "job-005",
    name: "Rachel Kim", email: "r.kim@example.com", phone: "+1 713 666 7890",
    location: "Dallas, TX, USA", workAuthorization: "citizen", experienceYears: 5,
    skills: ["Commissioning", "Instrumentation", "P&ID", "Control Systems", "Emerson"],
    cvSummary: "5 years instrumentation engineer in upstream oil & gas. Emerson DeltaV experience. Willing to travel.",
    source: "linkedin", stage: "applied", salaryExpectation: 80000, appliedAt: "2026-06-22",
  },

  // ── job-006 Sales Engineer ───────────────────────────────────────────────
  {
    id: "cand-019", jobId: "job-006",
    name: "Tom Bradley", email: "t.bradley@example.com", phone: "+44 7700 123 456",
    location: "London, UK", workAuthorization: "citizen", experienceYears: 4,
    skills: ["Sales", "Technical Presentations", "Automation Knowledge", "PLC", "Account Management", "Salesforce"],
    cvSummary: "4 years technical sales in industrial automation. Managed £2M annual quota. Experience with Siemens and Rockwell distribution.",
    source: "linkedin", stage: "screening", salaryExpectation: 68000, appliedAt: "2026-06-16",
  },
  {
    id: "cand-020", jobId: "job-006",
    name: "Aisha Patel", email: "a.patel@example.com", phone: "+44 7800 654 321",
    location: "London, UK", workAuthorization: "citizen", experienceYears: 6,
    skills: ["Sales", "Technical Presentations", "Automation Knowledge", "PLC", "SCADA", "Account Management", "CRM", "Salesforce"],
    cvSummary: "6 years sales engineer at ABB UK. Consistent top-5% performer. Deep automation product knowledge and existing client relationships.",
    source: "referral", stage: "hired", salaryExpectation: 72000, appliedAt: "2026-05-15",
  },
];

export const CANDIDATES: Candidate[] = RAW_CANDIDATES.map(c => {
  const job = JOBS.find(j => j.id === c.jobId)!;
  return { ...c, atsScore: scoreCandidate(job, c) };
});

export const INTERVIEWS: Interview[] = [
  {
    id: "int-001", candidateId: "cand-001", candidateName: "Ahmad Karimi",
    jobId: "job-001", jobTitle: "Senior PLC Engineer",
    type: "video", scheduledAt: "2026-07-01T10:00:00Z", durationMinutes: 60,
    interviewer: "Thomas Weber", notes: "Focus on S7-1500 and functional safety experience.",
    status: "scheduled",
  },
  {
    id: "int-002", candidateId: "cand-002", candidateName: "Lars Petersen",
    jobId: "job-001", jobTitle: "Senior PLC Engineer",
    type: "on-site", scheduledAt: "2026-06-25T09:00:00Z", durationMinutes: 120,
    interviewer: "Thomas Weber, Anna Schmidt",
    notes: "Final round. Completed well. Offer extended.",
    status: "completed",
  },
  {
    id: "int-003", candidateId: "cand-005", candidateName: "James Wright",
    jobId: "job-002", jobTitle: "SCADA Architect",
    type: "panel", scheduledAt: "2026-07-02T13:00:00Z", durationMinutes: 90,
    interviewer: "Sanjay Mehta, Yasmin Al-Hakim",
    notes: "Architecture design challenge included. Review oil & gas references.",
    status: "scheduled",
  },
  {
    id: "int-004", candidateId: "cand-010", candidateName: "Kris Van Den Berg",
    jobId: "job-003", jobTitle: "Automation Technician",
    type: "video", scheduledAt: "2026-07-03T11:00:00Z", durationMinutes: 45,
    interviewer: "Marie Lefevre",
    notes: "Check French language level and PLC troubleshooting depth.",
    status: "scheduled",
  },
  {
    id: "int-005", candidateId: "cand-017", candidateName: "Carlos Mendez",
    jobId: "job-005", jobTitle: "Field Service Engineer",
    type: "technical", scheduledAt: "2026-07-05T14:00:00Z", durationMinutes: 75,
    interviewer: "David Park",
    notes: "P&ID walkthrough exercise and refinery safety protocols review.",
    status: "scheduled",
  },
  {
    id: "int-006", candidateId: "cand-013", candidateName: "Alex Chen",
    jobId: "job-004", jobTitle: "Industrial Software Developer",
    type: "on-site", scheduledAt: "2026-06-20T10:00:00Z", durationMinutes: 120,
    interviewer: "Lisa De Boer, Erik Jansen",
    notes: "Live coding: OPC-UA bridge implementation. Excellent result.",
    status: "completed",
  },
  {
    id: "int-007", candidateId: "cand-020", candidateName: "Aisha Patel",
    jobId: "job-006", jobTitle: "Sales Engineer — Industrial Automation",
    type: "panel", scheduledAt: "2026-06-15T09:00:00Z", durationMinutes: 90,
    interviewer: "John Hargreaves, Emma Thornton",
    notes: "Outstanding product knowledge and client references. Hired.",
    status: "completed",
  },
  {
    id: "int-008", candidateId: "cand-003", candidateName: "Mehdi Tehrani",
    jobId: "job-001", jobTitle: "Senior PLC Engineer",
    type: "phone", scheduledAt: null, durationMinutes: 30,
    interviewer: "Thomas Weber",
    notes: "Initial phone screen to be scheduled after technical assessment completion.",
    status: "pending",
  },
];

export const RECENT_ACTIVITY: ActivityItem[] = [
  { id: "act-001", type: "hired",        candidateName: "Aisha Patel",       jobTitle: "Sales Engineer — Industrial Automation", detail: "Hired after panel interview",        timestamp: "2026-06-20" },
  { id: "act-002", type: "interview",    candidateName: "Ahmad Karimi",       jobTitle: "Senior PLC Engineer",                   detail: "Video interview scheduled 2026-07-01", timestamp: "2026-06-24" },
  { id: "act-003", type: "stage-change", candidateName: "Lars Petersen",      jobTitle: "Senior PLC Engineer",                   detail: "Advanced to Offer stage",             timestamp: "2026-06-25" },
  { id: "act-004", type: "interview",    candidateName: "James Wright",       jobTitle: "SCADA Architect",                       detail: "Panel interview scheduled 2026-07-02", timestamp: "2026-06-23" },
  { id: "act-005", type: "stage-change", candidateName: "Alex Chen",          jobTitle: "Industrial Software Developer",          detail: "Advanced to Offer stage",             timestamp: "2026-06-22" },
  { id: "act-006", type: "applied",      candidateName: "Rachel Kim",         jobTitle: "Field Service Engineer",                detail: "New application received",            timestamp: "2026-06-22" },
  { id: "act-007", type: "applied",      candidateName: "Yusuf Al-Rashid",    jobTitle: "Automation Technician",                 detail: "New application received",            timestamp: "2026-06-22" },
  { id: "act-008", type: "stage-change", candidateName: "Carlos Mendez",      jobTitle: "Field Service Engineer",                detail: "Advanced to Interview stage",         timestamp: "2026-06-21" },
];

// Compute pipeline velocity from hired candidates
const HIRED = CANDIDATES.filter(c => c.stage === "hired");
export const HIRING_VELOCITY_DAYS: number = HIRED.length > 0
  ? Math.round(
      HIRED.reduce((sum, c) => {
        const days = (new Date("2026-06-24").getTime() - new Date(c.appliedAt).getTime()) / 86400000;
        return sum + days;
      }, 0) / HIRED.length
    )
  : 0;

export const STAGE_COUNTS: Record<PipelineStage, number> = {
  applied:            0,
  screening:          0,
  "technical-review": 0,
  interview:          0,
  offer:              0,
  hired:              0,
  rejected:           0,
};
CANDIDATES.forEach(c => { STAGE_COUNTS[c.stage]++; });
