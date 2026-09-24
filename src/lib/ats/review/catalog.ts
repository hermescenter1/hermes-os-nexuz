/**
 * ATS-S1 — the initial role catalog: five Hermes recruitment profiles.
 *
 * Each profile is a SCORECARD, not a job posting: must-have / nice-to-have /
 * disqualifier criteria with the evidence vocabulary the deterministic
 * extractor searches for, per-dimension weights, hard gates, an interview kit
 * with rubrics, a technical assessment, the accountable approval owner and a
 * decision SLA. What is deliberately ABSENT: salary, headcount, sponsorship,
 * location type, contract type — real business facts the repository does not
 * hold and this file will not invent (they stay owner-gated on AtsJob).
 *
 * ABSENCE IS NOT FAILURE. A disqualifier here fires only on EXPLICIT evidence
 * (a statement in the candidate's own text); a missing must-have is "missing
 * evidence", which yields UNKNOWN on a hard gate and REVIEW_REQUIRED — never
 * an automatic rejection.
 *
 * Protected attributes never appear as a criterion, keyword or rubric item;
 * `catalog.test.ts` scans every string in this file against
 * PROTECTED_ATTRIBUTE_TERMS.
 *
 * Applying a profile to a job writes its criteria as AtsJobCriterion rows with
 * codes `<roleCode>.<criterionCode>`; the review engine recovers the profile
 * from that prefix.
 */

import type { OrganizationRole } from "@/lib/tenant/contract";
import type { Dimension } from "./report-schema";

export type RoleCode =
  | "finance_accountant"
  | "automation_plc_scada_engineer"
  | "backend_engineer"
  | "ai_ml_engineer"
  | "b2b_technical_marketing";

export const ROLE_CODES: readonly RoleCode[] = Object.freeze([
  "finance_accountant",
  "automation_plc_scada_engineer",
  "backend_engineer",
  "ai_ml_engineer",
  "b2b_technical_marketing",
]);

export type CriterionKind = "MUST_HAVE" | "NICE_TO_HAVE" | "DISQUALIFIER";

export interface RoleCriterion {
  code: string;
  label: string;
  kind: CriterionKind;
  dimension: Dimension;
  /** Relative weight inside its dimension, 0..100. */
  weight: number;
  /** Case-insensitive evidence vocabulary; matched on word boundaries. */
  keywords: readonly string[];
  /** Experience criteria only: the minimum observed years for PASS. */
  minYears?: number;
  hardGate: boolean;
}

export type InterviewStageKind =
  | "RECRUITER_SCREEN"
  | "TECHNICAL_FUNCTIONAL"
  | "BEHAVIORAL_COMMUNICATION"
  | "FINAL_REVIEW"
  | "REFERENCE_OFFER_READINESS";

export interface RubricItem {
  item: string;
  /** What a 1, 3 and 5 look like — so two interviewers score the same thing. */
  anchors: { low: string; mid: string; high: string };
}

export interface InterviewStage {
  code: string;
  kind: InterviewStageKind;
  label: string;
  ownerRole: OrganizationRole;
  slaDays: number;
  durationMinutes: number;
  questions: readonly string[];
  rubric: readonly RubricItem[];
  /** Reference/offer stages run only when the organization's policy enables them. */
  policyGated?: boolean;
}

export interface TechnicalAssessment {
  title: string;
  format: "TAKE_HOME" | "LIVE_EXERCISE" | "CASE_STUDY" | "PORTFOLIO_REVIEW";
  durationMinutes: number;
  evaluates: readonly string[];
  /** The assessment never asks for anything a protected attribute could leak through. */
  submission: string;
}

export interface RoleProfile {
  code: RoleCode;
  title: { en: string; fa: string; de: string };
  department: string;
  weights: Record<Dimension, number>;
  criteria: readonly RoleCriterion[];
  interviewKit: readonly InterviewStage[];
  assessment: TechnicalAssessment;
  approvalOwnerRole: OrganizationRole;
  decisionSlaDays: number;
}

const recruiterScreen = (extra: readonly string[] = []): InterviewStage => ({
  code: "recruiter_screen",
  kind: "RECRUITER_SCREEN",
  label: "Recruiter screen",
  ownerRole: "RECRUITER",
  slaDays: 3,
  durationMinutes: 30,
  questions: [
    "Walk me through the parts of your background most relevant to this role.",
    "What in the posting made you apply, and what would make you decline an offer?",
    "What is your availability and notice period?",
    "Is there anything in the requirements you would want clarified before a technical stage?",
    ...extra,
  ],
  rubric: [
    { item: "Relevance of stated experience to the posting", anchors: { low: "Unrelated field", mid: "Adjacent, transferable", high: "Directly matching" } },
    { item: "Clarity of communication", anchors: { low: "Hard to follow", mid: "Clear with prompting", high: "Clear and structured unprompted" } },
    { item: "Motivation is specific to Hermes and this role", anchors: { low: "Generic", mid: "Some specifics", high: "Concrete, informed reasons" } },
  ],
});

const behavioral = (ownerRole: OrganizationRole): InterviewStage => ({
  code: "behavioral",
  kind: "BEHAVIORAL_COMMUNICATION",
  label: "Behavioral and communication",
  ownerRole,
  slaDays: 5,
  durationMinutes: 45,
  questions: [
    "Describe a time you disagreed with a technical or business decision. What did you do, and what happened?",
    "Tell me about a mistake you made at work that had real consequences. How did you handle it?",
    "Describe working with someone from a different discipline (engineering / finance / marketing). What made it work or not?",
    "How do you decide when to escalate a problem versus solve it yourself?",
  ],
  rubric: [
    { item: "Ownership of outcomes", anchors: { low: "Blames context", mid: "Acknowledges role", high: "Owns and shows what changed" } },
    { item: "Collaboration across disciplines", anchors: { low: "Works alone", mid: "Cooperates when asked", high: "Seeks out other disciplines" } },
    { item: "Judgement under uncertainty", anchors: { low: "Guesses", mid: "Asks for help", high: "States assumptions, bounds risk, decides" } },
  ],
});

const finalReview = (ownerRole: OrganizationRole): InterviewStage => ({
  code: "final_review",
  kind: "FINAL_REVIEW",
  label: "Final review",
  ownerRole,
  slaDays: 5,
  durationMinutes: 45,
  questions: [
    "Given everything discussed so far, what would you want to know before accepting?",
    "What would you expect to have delivered after ninety days?",
    "Which part of the role are you least confident about, and how would you close that gap?",
  ],
  rubric: [
    { item: "Consistency with earlier stages", anchors: { low: "Contradictions", mid: "Minor gaps", high: "Fully consistent" } },
    { item: "Realistic ninety-day plan", anchors: { low: "Vague", mid: "Plausible", high: "Specific and sequenced" } },
    { item: "Fit with the team's working norms", anchors: { low: "Clear mismatch", mid: "Workable", high: "Strong fit with evidence" } },
  ],
});

const referenceOffer = (ownerRole: OrganizationRole): InterviewStage => ({
  code: "reference_offer_readiness",
  kind: "REFERENCE_OFFER_READINESS",
  label: "Reference and offer readiness",
  ownerRole,
  slaDays: 7,
  durationMinutes: 20,
  policyGated: true,
  questions: [
    "Confirm two professional references and their relationship to you.",
    "Confirm the start-date window and any constraints.",
  ],
  rubric: [
    { item: "References corroborate stated role and tenure", anchors: { low: "Contradict", mid: "Partly confirm", high: "Fully confirm" } },
  ],
});

export const ROLE_PROFILES: Readonly<Record<RoleCode, RoleProfile>> = Object.freeze({
  finance_accountant: {
    code: "finance_accountant",
    title: { en: "Accountant / Finance Specialist", fa: "حسابدار / کارشناس مالی", de: "Buchhalter/in / Finanzspezialist/in" },
    department: "finance",
    weights: { skill: 40, experience: 25, education: 10, certification: 10, project: 5, role_relevance: 10 },
    criteria: [
      { code: "ledger", label: "General ledger, AP/AR and month-end close", kind: "MUST_HAVE", dimension: "skill", weight: 30, hardGate: true, keywords: ["general ledger", "accounts payable", "accounts receivable", "month-end", "month end close", "دفتر کل", "حساب‌های پرداختنی", "حساب‌های دریافتنی", "بستن حساب"] },
      { code: "reporting", label: "Financial statements and management reporting", kind: "MUST_HAVE", dimension: "skill", weight: 25, hardGate: false, keywords: ["financial statements", "balance sheet", "income statement", "cash flow", "management report", "صورت‌های مالی", "ترازنامه", "سود و زیان"] },
      { code: "tax", label: "Tax and VAT filings", kind: "MUST_HAVE", dimension: "skill", weight: 20, hardGate: false, keywords: ["tax", "vat", "value added tax", "مالیات", "ارزش افزوده"] },
      { code: "erp", label: "Accounting / ERP software", kind: "MUST_HAVE", dimension: "skill", weight: 15, hardGate: false, keywords: ["erp", "sap", "oracle", "hamkaran", "همکاران سیستم", "sepidar", "سپیدار", "quickbooks", "excel"] },
      { code: "standards", label: "Accounting standards (IFRS / national)", kind: "NICE_TO_HAVE", dimension: "skill", weight: 10, hardGate: false, keywords: ["ifrs", "gaap", "accounting standards", "استاندارد حسابداری"] },
      { code: "years", label: "At least 3 years in an accounting role", kind: "MUST_HAVE", dimension: "experience", weight: 100, hardGate: true, minYears: 3, keywords: [] },
      { code: "degree", label: "Degree in accounting, finance or economics", kind: "NICE_TO_HAVE", dimension: "education", weight: 100, hardGate: false, keywords: ["accounting", "finance", "economics", "حسابداری", "مدیریت مالی", "اقتصاد"] },
      { code: "cert", label: "Professional certification (ACCA / CPA / CMA / national)", kind: "NICE_TO_HAVE", dimension: "certification", weight: 100, hardGate: false, keywords: ["acca", "cpa", "cma", "cia", "حسابدار رسمی"] },
      { code: "cost", label: "Cost or industrial accounting", kind: "NICE_TO_HAVE", dimension: "project", weight: 100, hardGate: false, keywords: ["cost accounting", "industrial accounting", "حسابداری صنعتی", "بهای تمام شده"] },
      { code: "audit", label: "Audit or internal-control exposure", kind: "NICE_TO_HAVE", dimension: "role_relevance", weight: 100, hardGate: false, keywords: ["audit", "internal control", "حسابرسی", "کنترل داخلی"] },
      { code: "dq_no_accounting", label: "States no accounting experience", kind: "DISQUALIFIER", dimension: "role_relevance", weight: 0, hardGate: true, keywords: ["no accounting experience", "never worked in accounting"] },
    ],
    interviewKit: [
      recruiterScreen(["Which accounting systems have you closed a month in, end to end?"]),
      {
        code: "functional",
        kind: "TECHNICAL_FUNCTIONAL",
        label: "Functional accounting interview",
        ownerRole: "HIRING_MANAGER",
        slaDays: 5,
        durationMinutes: 60,
        questions: [
          "Walk through a month-end close you owned: sequence, controls, what usually goes wrong.",
          "A supplier invoice arrives dated last period after the close. What do you do?",
          "How do you reconcile VAT payable against the ledger before filing?",
          "Explain the difference between accrual and cash basis with an example from your work.",
        ],
        rubric: [
          { item: "Close process depth", anchors: { low: "Describes tasks only", mid: "Describes sequence and controls", high: "Explains controls and failure modes" } },
          { item: "Regulatory accuracy (tax / VAT)", anchors: { low: "Incorrect", mid: "Mostly correct", high: "Correct with edge cases" } },
          { item: "Systems fluency", anchors: { low: "Data entry only", mid: "Configures reports", high: "Owns setup and reconciliation" } },
        ],
      },
      behavioral("HR_MANAGER"),
      finalReview("HR_MANAGER"),
      referenceOffer("HR_MANAGER"),
    ],
    assessment: {
      title: "Ledger reconciliation case",
      format: "CASE_STUDY",
      durationMinutes: 90,
      evaluates: ["reconciliation accuracy", "accrual reasoning", "VAT treatment", "clarity of working papers"],
      submission: "A spreadsheet reconciling a provided trial balance to bank and VAT schedules, with notes on every adjustment.",
    },
    approvalOwnerRole: "HR_MANAGER",
    decisionSlaDays: 5,
  },

  automation_plc_scada_engineer: {
    code: "automation_plc_scada_engineer",
    title: { en: "Senior Electrical / Automation / PLC / SCADA Engineer", fa: "مهندس ارشد برق / اتوماسیون / PLC / SCADA", de: "Senior Elektro-/Automatisierungsingenieur/in (SPS/SCADA)" },
    department: "automation",
    weights: { skill: 40, experience: 20, education: 5, certification: 10, project: 15, role_relevance: 10 },
    criteria: [
      { code: "plc", label: "PLC programming (Siemens S7 / TIA Portal, Allen-Bradley, Schneider)", kind: "MUST_HAVE", dimension: "skill", weight: 30, hardGate: true, keywords: ["plc", "s7-1200", "s7-1500", "s7-300", "s7-400", "tia portal", "step 7", "allen-bradley", "allen bradley", "rslogix", "studio 5000", "controllogix", "schneider", "unity pro", "ecostruxure", "codesys"] },
      { code: "scada_hmi", label: "SCADA / HMI engineering (WinCC, Ignition, Citect, FactoryTalk)", kind: "MUST_HAVE", dimension: "skill", weight: 25, hardGate: true, keywords: ["scada", "hmi", "wincc", "ignition", "citect", "factorytalk", "intouch", "wonderware"] },
      { code: "protocols", label: "Industrial protocols (Profinet, Profibus, Modbus, OPC UA, EtherNet/IP)", kind: "MUST_HAVE", dimension: "skill", weight: 20, hardGate: false, keywords: ["profinet", "profibus", "modbus", "opc ua", "opc-ua", "opc", "ethernet/ip", "ethernet ip", "iec 61850", "mqtt"] },
      { code: "electrical", label: "Electrical design: control panels, drawings, drives", kind: "MUST_HAVE", dimension: "skill", weight: 15, hardGate: false, keywords: ["control panel", "electrical drawing", "eplan", "autocad electrical", "vfd", "variable frequency drive", "drive", "motor control", "تابلو برق", "نقشه برق"] },
      { code: "iec61131", label: "IEC 61131-3 languages (LAD, FBD, ST, SFC)", kind: "NICE_TO_HAVE", dimension: "skill", weight: 10, hardGate: false, keywords: ["iec 61131", "ladder", "structured text", "function block", "sfc", "scl"] },
      { code: "years", label: "At least 5 years in industrial automation", kind: "MUST_HAVE", dimension: "experience", weight: 100, hardGate: true, minYears: 5, keywords: [] },
      { code: "degree", label: "Degree in electrical, control or automation engineering", kind: "NICE_TO_HAVE", dimension: "education", weight: 100, hardGate: false, keywords: ["electrical engineering", "control engineering", "automation engineering", "mechatronics", "مهندسی برق", "مهندسی کنترل"] },
      { code: "cert", label: "Vendor certification (Siemens, Rockwell) or functional safety", kind: "NICE_TO_HAVE", dimension: "certification", weight: 100, hardGate: false, keywords: ["siemens certified", "rockwell certified", "tüv", "tuv", "functional safety", "sil", "iec 61508", "iec 61511", "certified automation professional", "cap"] },
      { code: "commissioning", label: "Commissioning and start-up on site", kind: "MUST_HAVE", dimension: "project", weight: 60, hardGate: false, keywords: ["commissioning", "start-up", "startup", "fat", "sat", "site acceptance", "راه‌اندازی", "کمیسیونینگ"] },
      { code: "process", label: "Process industry exposure (steel, cement, oil & gas, water, food)", kind: "NICE_TO_HAVE", dimension: "project", weight: 40, hardGate: false, keywords: ["steel", "cement", "oil and gas", "oil & gas", "petrochemical", "water treatment", "food", "pharma", "فولاد", "سیمان", "پتروشیمی"] },
      { code: "troubleshooting", label: "Troubleshooting live plant faults", kind: "NICE_TO_HAVE", dimension: "role_relevance", weight: 100, hardGate: false, keywords: ["troubleshoot", "troubleshooting", "fault finding", "root cause", "downtime", "عیب‌یابی"] },
      { code: "dq_no_plc", label: "States no PLC experience", kind: "DISQUALIFIER", dimension: "role_relevance", weight: 0, hardGate: true, keywords: ["no plc experience", "never programmed a plc", "no experience with plc"] },
    ],
    interviewKit: [
      recruiterScreen(["Which PLC platform and SCADA package have you delivered a full project on, most recently?"]),
      {
        code: "technical",
        kind: "TECHNICAL_FUNCTIONAL",
        label: "Technical automation interview",
        ownerRole: "HIRING_MANAGER",
        slaDays: 5,
        durationMinutes: 90,
        questions: [
          "Design the control architecture for a line with two PLCs, one SCADA server and a remote HMI: networks, redundancy, alarm strategy.",
          "A Profinet device drops intermittently. Walk through your diagnosis in order.",
          "How do you structure a TIA Portal project so a colleague can maintain it? Naming, blocks, libraries, versioning.",
          "Describe a commissioning where FAT passed and SAT did not. What differed and what did you change?",
          "Where does functional safety (SIL) change your design, and where does it not apply?",
        ],
        rubric: [
          { item: "Architecture reasoning", anchors: { low: "Names components", mid: "Explains data flow", high: "Explains trade-offs and failure modes" } },
          { item: "Diagnostic method", anchors: { low: "Trial and error", mid: "Ordered checks", high: "Ordered, evidence-driven, knows the tools" } },
          { item: "Maintainability discipline", anchors: { low: "Ad hoc", mid: "Some standards", high: "Standards, libraries, version control" } },
          { item: "Safety awareness", anchors: { low: "Unaware", mid: "Aware of SIL", high: "Applies SIL/ISO 13849 correctly" } },
        ],
      },
      behavioral("HIRING_MANAGER"),
      finalReview("HR_MANAGER"),
      referenceOffer("HR_MANAGER"),
    ],
    assessment: {
      title: "PLC and SCADA design exercise",
      format: "TAKE_HOME",
      durationMinutes: 240,
      evaluates: ["I/O and network design", "PLC program structure", "alarm and interlock logic", "documentation quality"],
      submission: "A short design document plus a TIA Portal (or equivalent) program for a described two-tank process with interlocks and an HMI screen outline.",
    },
    approvalOwnerRole: "HIRING_MANAGER",
    decisionSlaDays: 7,
  },

  backend_engineer: {
    code: "backend_engineer",
    title: { en: "Backend Engineer", fa: "مهندس بک‌اند", de: "Backend-Entwickler/in" },
    department: "engineering",
    weights: { skill: 40, experience: 20, education: 5, certification: 0, project: 25, role_relevance: 10 },
    criteria: [
      { code: "language", label: "Server-side language (TypeScript/Node.js, Go, Java, Python, C#)", kind: "MUST_HAVE", dimension: "skill", weight: 30, hardGate: true, keywords: ["typescript", "node.js", "nodejs", "node", "golang", "go ", "java", "python", "c#", ".net", "rust", "kotlin"] },
      { code: "sql", label: "Relational databases and SQL (PostgreSQL preferred)", kind: "MUST_HAVE", dimension: "skill", weight: 25, hardGate: true, keywords: ["postgresql", "postgres", "sql", "mysql", "mariadb", "prisma", "database design", "indexing", "transactions"] },
      { code: "api", label: "API design (REST/GraphQL), authentication and authorization", kind: "MUST_HAVE", dimension: "skill", weight: 20, hardGate: false, keywords: ["rest", "restful", "graphql", "api design", "openapi", "oauth", "jwt", "rbac", "authentication", "authorization"] },
      { code: "testing", label: "Automated testing and CI", kind: "MUST_HAVE", dimension: "skill", weight: 15, hardGate: false, keywords: ["unit test", "integration test", "vitest", "jest", "pytest", "ci/cd", "ci", "github actions", "gitlab ci", "tdd"] },
      { code: "infra", label: "Containers, caching, queues, observability", kind: "NICE_TO_HAVE", dimension: "skill", weight: 10, hardGate: false, keywords: ["docker", "kubernetes", "redis", "rabbitmq", "kafka", "nginx", "prometheus", "grafana", "opentelemetry", "observability"] },
      { code: "years", label: "At least 3 years building production backends", kind: "MUST_HAVE", dimension: "experience", weight: 100, hardGate: true, minYears: 3, keywords: [] },
      { code: "degree", label: "Degree in computer science or software engineering", kind: "NICE_TO_HAVE", dimension: "education", weight: 100, hardGate: false, keywords: ["computer science", "software engineering", "computer engineering", "مهندسی کامپیوتر", "مهندسی نرم‌افزار"] },
      { code: "production", label: "Owned a production system (deploys, incidents, on-call)", kind: "MUST_HAVE", dimension: "project", weight: 60, hardGate: false, keywords: ["production", "deployed", "deployment", "incident", "on-call", "uptime", "scaled", "migration"] },
      { code: "security", label: "Application security practice (OWASP, input validation, secrets)", kind: "NICE_TO_HAVE", dimension: "project", weight: 40, hardGate: false, keywords: ["owasp", "security", "input validation", "secrets management", "penetration", "csrf", "xss", "sql injection"] },
      { code: "nextjs", label: "Next.js / React full-stack exposure", kind: "NICE_TO_HAVE", dimension: "role_relevance", weight: 100, hardGate: false, keywords: ["next.js", "nextjs", "react", "tailwind", "server components"] },
      { code: "dq_no_backend", label: "States no backend or server-side experience", kind: "DISQUALIFIER", dimension: "role_relevance", weight: 0, hardGate: true, keywords: ["no backend experience", "never built a backend", "frontend only"] },
    ],
    interviewKit: [
      recruiterScreen(["Which production system have you owned end to end, and what broke in it?"]),
      {
        code: "technical",
        kind: "TECHNICAL_FUNCTIONAL",
        label: "Technical backend interview",
        ownerRole: "HIRING_MANAGER",
        slaDays: 5,
        durationMinutes: 75,
        questions: [
          "Design a multi-tenant API where every query must be scoped to an organization. Where do you enforce it, and how do you test it?",
          "A write must create three rows or none. Show the transaction, then explain what happens when two requests hit the same unique constraint at once.",
          "How would you make a public POST endpoint idempotent and rate-limited?",
          "Explain an N+1 query you found and how you fixed it.",
          "Review this code sample (provided) for security issues.",
        ],
        rubric: [
          { item: "Tenant-isolation reasoning", anchors: { low: "Trusts client ids", mid: "Filters in queries", high: "Enforces at the database and tests it" } },
          { item: "Transactional correctness", anchors: { low: "Sequential writes", mid: "Uses a transaction", high: "Handles concurrent writes and partial failure" } },
          { item: "Security instincts", anchors: { low: "Misses obvious issues", mid: "Finds common issues", high: "Finds subtle issues and explains fixes" } },
          { item: "Code review quality", anchors: { low: "Style only", mid: "Logic issues", high: "Logic, security and maintainability" } },
        ],
      },
      behavioral("HIRING_MANAGER"),
      finalReview("HR_MANAGER"),
      referenceOffer("HR_MANAGER"),
    ],
    assessment: {
      title: "Tenant-scoped API exercise",
      format: "TAKE_HOME",
      durationMinutes: 180,
      evaluates: ["data modelling", "authorization enforcement", "transactional writes", "tests", "README clarity"],
      submission: "A small repository implementing a described two-entity API with org scoping, one transactional endpoint and tests.",
    },
    approvalOwnerRole: "HIRING_MANAGER",
    decisionSlaDays: 5,
  },

  ai_ml_engineer: {
    code: "ai_ml_engineer",
    title: { en: "AI / ML Engineer", fa: "مهندس هوش مصنوعی / یادگیری ماشین", de: "KI-/ML-Ingenieur/in" },
    department: "engineering",
    weights: { skill: 40, experience: 15, education: 10, certification: 0, project: 25, role_relevance: 10 },
    criteria: [
      { code: "python", label: "Python for ML engineering", kind: "MUST_HAVE", dimension: "skill", weight: 25, hardGate: true, keywords: ["python", "numpy", "pandas"] },
      { code: "frameworks", label: "ML frameworks (PyTorch, TensorFlow, scikit-learn)", kind: "MUST_HAVE", dimension: "skill", weight: 25, hardGate: true, keywords: ["pytorch", "tensorflow", "scikit-learn", "sklearn", "keras", "xgboost", "lightgbm"] },
      { code: "evaluation", label: "Model evaluation, validation and monitoring", kind: "MUST_HAVE", dimension: "skill", weight: 20, hardGate: false, keywords: ["evaluation", "cross-validation", "precision", "recall", "f1", "auc", "drift", "monitoring", "a/b"] },
      { code: "llm_nlp", label: "LLM / NLP application work (RAG, embeddings, fine-tuning)", kind: "MUST_HAVE", dimension: "skill", weight: 20, hardGate: false, keywords: ["llm", "large language model", "nlp", "rag", "retrieval-augmented", "embeddings", "vector", "fine-tuning", "fine tuning", "transformer", "openai", "anthropic", "hugging face", "huggingface"] },
      { code: "timeseries", label: "Time-series / anomaly detection", kind: "NICE_TO_HAVE", dimension: "skill", weight: 10, hardGate: false, keywords: ["time series", "time-series", "anomaly detection", "forecasting", "predictive maintenance", "sensor data"] },
      { code: "years", label: "At least 2 years applied ML experience", kind: "MUST_HAVE", dimension: "experience", weight: 100, hardGate: true, minYears: 2, keywords: [] },
      { code: "degree", label: "Degree in CS, AI, mathematics, statistics or engineering", kind: "NICE_TO_HAVE", dimension: "education", weight: 100, hardGate: false, keywords: ["computer science", "artificial intelligence", "machine learning", "mathematics", "statistics", "data science", "هوش مصنوعی", "علوم کامپیوتر", "آمار"] },
      { code: "deployed", label: "Shipped a model to production (serving, pipelines, MLOps)", kind: "MUST_HAVE", dimension: "project", weight: 60, hardGate: false, keywords: ["deployed", "production", "mlops", "mlflow", "serving", "pipeline", "airflow", "docker", "inference"] },
      { code: "industrial", label: "Industrial or engineering data experience", kind: "NICE_TO_HAVE", dimension: "project", weight: 40, hardGate: false, keywords: ["industrial", "plc", "scada", "iot", "telemetry", "manufacturing", "process data"] },
      { code: "governance", label: "Awareness of AI governance, evaluation sets and safety", kind: "NICE_TO_HAVE", dimension: "role_relevance", weight: 100, hardGate: false, keywords: ["governance", "responsible ai", "bias", "safety", "evaluation set", "red team", "guardrail"] },
      { code: "dq_no_ml", label: "States no machine-learning experience", kind: "DISQUALIFIER", dimension: "role_relevance", weight: 0, hardGate: true, keywords: ["no machine learning experience", "never trained a model", "no ml experience"] },
    ],
    interviewKit: [
      recruiterScreen(["Which model did you ship most recently, and how did you know it was working after launch?"]),
      {
        code: "technical",
        kind: "TECHNICAL_FUNCTIONAL",
        label: "Technical ML interview",
        ownerRole: "HIRING_MANAGER",
        slaDays: 5,
        durationMinutes: 75,
        questions: [
          "You have sensor telemetry from a plant and few labelled failures. How do you build and evaluate an anomaly detector?",
          "Design a RAG system over engineering documents where wrong answers are dangerous. Where do you put the guardrails?",
          "How do you detect and respond to model drift in production?",
          "Explain a case where the offline metric improved and the product got worse.",
        ],
        rubric: [
          { item: "Problem framing with scarce labels", anchors: { low: "Assumes labels", mid: "Uses unsupervised methods", high: "Combines methods with a validation plan" } },
          { item: "Safety and evaluation rigor", anchors: { low: "Trusts model output", mid: "Adds checks", high: "Designs evaluation sets and abstention" } },
          { item: "Production awareness", anchors: { low: "Notebook only", mid: "Has deployed", high: "Monitors, retrains, owns incidents" } },
        ],
      },
      behavioral("HIRING_MANAGER"),
      finalReview("HR_MANAGER"),
      referenceOffer("HR_MANAGER"),
    ],
    assessment: {
      title: "Evidence-grounded extraction exercise",
      format: "TAKE_HOME",
      durationMinutes: 240,
      evaluates: ["evaluation design", "handling of unknowns", "reproducibility", "clarity of write-up"],
      submission: "A notebook or script that extracts structured facts from provided technical documents with per-claim evidence spans, plus an evaluation against a provided labelled set.",
    },
    approvalOwnerRole: "HIRING_MANAGER",
    decisionSlaDays: 5,
  },

  b2b_technical_marketing: {
    code: "b2b_technical_marketing",
    title: { en: "B2B / Technical Marketing Specialist", fa: "کارشناس بازاریابی فنی / B2B", de: "B2B-/Technical-Marketing-Spezialist/in" },
    department: "marketing",
    weights: { skill: 40, experience: 20, education: 5, certification: 5, project: 20, role_relevance: 10 },
    criteria: [
      { code: "b2b", label: "B2B marketing for industrial or technical products", kind: "MUST_HAVE", dimension: "skill", weight: 30, hardGate: true, keywords: ["b2b", "business-to-business", "industrial marketing", "technical marketing", "product marketing", "بازاریابی صنعتی", "بازاریابی b2b"] },
      { code: "content", label: "Technical content: case studies, white papers, product pages", kind: "MUST_HAVE", dimension: "skill", weight: 25, hardGate: true, keywords: ["case study", "white paper", "whitepaper", "technical content", "content marketing", "copywriting", "product page", "datasheet", "تولید محتوا"] },
      { code: "analytics", label: "Campaign analytics and attribution", kind: "MUST_HAVE", dimension: "skill", weight: 20, hardGate: false, keywords: ["google analytics", "ga4", "attribution", "conversion", "funnel", "kpi", "campaign analytics", "clarity", "hubspot"] },
      { code: "seo_digital", label: "SEO, LinkedIn and digital demand generation", kind: "MUST_HAVE", dimension: "skill", weight: 15, hardGate: false, keywords: ["seo", "linkedin", "demand generation", "lead generation", "email marketing", "webinar", "google ads", "سئو"] },
      { code: "crm", label: "CRM and marketing automation", kind: "NICE_TO_HAVE", dimension: "skill", weight: 10, hardGate: false, keywords: ["crm", "hubspot", "salesforce", "marketing automation", "pipedrive", "zoho"] },
      { code: "years", label: "At least 3 years in B2B or technical marketing", kind: "MUST_HAVE", dimension: "experience", weight: 100, hardGate: true, minYears: 3, keywords: [] },
      { code: "degree", label: "Degree in marketing, business, engineering or communications", kind: "NICE_TO_HAVE", dimension: "education", weight: 100, hardGate: false, keywords: ["marketing", "business administration", "mba", "engineering", "communications", "بازاریابی", "مدیریت بازرگانی"] },
      { code: "cert", label: "Marketing platform certification (HubSpot, Google)", kind: "NICE_TO_HAVE", dimension: "certification", weight: 100, hardGate: false, keywords: ["hubspot certified", "google certified", "google ads certification", "certified"] },
      { code: "launch", label: "Owned a product or campaign launch with measurable results", kind: "MUST_HAVE", dimension: "project", weight: 60, hardGate: false, keywords: ["launch", "campaign", "grew", "increased", "pipeline", "leads", "mql", "sql", "roi"] },
      { code: "events", label: "Trade shows, events or partner marketing", kind: "NICE_TO_HAVE", dimension: "project", weight: 40, hardGate: false, keywords: ["trade show", "exhibition", "event", "conference", "partner marketing", "نمایشگاه"] },
      { code: "domain", label: "Automation / industrial-software domain literacy", kind: "NICE_TO_HAVE", dimension: "role_relevance", weight: 100, hardGate: false, keywords: ["automation", "plc", "scada", "industrial software", "saas", "industry 4.0", "iiot", "اتوماسیون"] },
      { code: "dq_no_b2b", label: "States no B2B marketing experience", kind: "DISQUALIFIER", dimension: "role_relevance", weight: 0, hardGate: true, keywords: ["no b2b experience", "consumer marketing only", "b2c only"] },
    ],
    interviewKit: [
      recruiterScreen(["Which technical product have you marketed, and who was the buyer?"]),
      {
        code: "functional",
        kind: "TECHNICAL_FUNCTIONAL",
        label: "Functional marketing interview",
        ownerRole: "HIRING_MANAGER",
        slaDays: 5,
        durationMinutes: 60,
        questions: [
          "Plan a six-month launch for an industrial intelligence platform sold to plant managers and automation engineers. Channels, content, metrics.",
          "Turn this engineering feature description (provided) into a one-paragraph value statement for a plant manager.",
          "How do you attribute a lead that touched a webinar, a LinkedIn post and a trade show?",
          "Which of your past campaigns would you not repeat, and why?",
        ],
        rubric: [
          { item: "Audience understanding (technical buyer)", anchors: { low: "Generic buyer", mid: "Knows the role", high: "Knows the buying process and objections" } },
          { item: "Technical translation quality", anchors: { low: "Jargon or fluff", mid: "Clear", high: "Clear, accurate, benefit-led" } },
          { item: "Measurement discipline", anchors: { low: "Vanity metrics", mid: "Funnel metrics", high: "Attribution with caveats" } },
        ],
      },
      behavioral("HIRING_MANAGER"),
      finalReview("HR_MANAGER"),
      referenceOffer("HR_MANAGER"),
    ],
    assessment: {
      title: "Technical content and launch brief",
      format: "PORTFOLIO_REVIEW",
      durationMinutes: 120,
      evaluates: ["writing for technical buyers", "campaign structure", "metric selection", "portfolio evidence"],
      submission: "Two portfolio pieces plus a one-page launch brief for a described product, with the metrics you would report.",
    },
    approvalOwnerRole: "HR_MANAGER",
    decisionSlaDays: 5,
  },
});

export function findRoleProfile(code: string): RoleProfile | null {
  return (ROLE_CODES as readonly string[]).includes(code) ? ROLE_PROFILES[code as RoleCode] : null;
}

/** Criterion code as stored on AtsJobCriterion: `<roleCode>.<criterionCode>`. */
export function qualifiedCriterionCode(role: RoleCode, criterion: string): string {
  return `${role}.${criterion}`;
}

/** Recover the role profile from a set of stored criterion codes; null when mixed or unknown. */
export function roleCodeFromCriterionCodes(codes: readonly string[]): RoleCode | null {
  const prefixes = new Set(codes.map((c) => c.split(".")[0]));
  if (prefixes.size !== 1) return null;
  const [only] = [...prefixes];
  return (ROLE_CODES as readonly string[]).includes(only) ? (only as RoleCode) : null;
}
