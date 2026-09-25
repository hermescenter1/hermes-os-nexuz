/**
 * ATS-M1 — the pure core of position management: the lifecycle table, the
 * publish gate, the protected-characteristic scan and the public-visibility
 * predicate. No database, no mocks.
 */
import { describe, it, expect } from "vitest";
import { atsCan, type AtsCapability } from "@/lib/ats/rbac";
import { findProtectedTerms, PROTECTED_ATTRIBUTE_TERMS } from "@/lib/ats/policy";
import { isJobPubliclyEligible, publicJobWhere } from "@/lib/ats/eligibility";
import { ROLE_CODES, ROLE_PROFILES } from "@/lib/ats/review/catalog";
import { allowedActions, canonicalStatus, canSoftDelete, checkTransition, isEditable, TRANSITIONS } from "../state-machine";
import { evaluatePublishReadiness, judgedStrings, scanProtectedTerms, type ReadinessInput } from "../readiness";
import { createPositionSchema, interviewKitSchema, POSITION_ACTIONS, scoringRubricSchema, transitionSchema, updatePositionSchema } from "../contract";
import { INITIAL_POSITIONS } from "../service";

const caps = (role: string) =>
  new Set((["ATS_VIEW", "ATS_REVIEW", "ATS_MANAGE", "ATS_SCORE", "ATS_INTERVIEW", "ATS_ADMIN"] as AtsCapability[]).filter((c) => atsCan(role, c)));

describe("the lifecycle: DRAFT → OPEN → PAUSED → OPEN → CLOSED → ARCHIVED", () => {
  it("walks the owner's state machine end to end", () => {
    const path: [string, (typeof POSITION_ACTIONS)[number], string][] = [
      ["DRAFT", "PUBLISH", "OPEN"],
      ["OPEN", "PAUSE", "PAUSED"],
      ["PAUSED", "RESUME", "OPEN"],
      ["OPEN", "CLOSE", "CLOSED"],
      ["CLOSED", "ARCHIVE", "ARCHIVED"],
    ];
    for (const [from, action, to] of path) {
      const v = checkTransition(from, action, "a written reason");
      expect(v.ok, `${from} ${action}`).toBe(true);
      if (v.ok) expect(v.rule.to).toBe(to);
    }
  });

  it("refuses every move the table does not list — ARCHIVED is terminal", () => {
    expect(checkTransition("DRAFT", "PAUSE").ok).toBe(false);
    expect(checkTransition("DRAFT", "CLOSE", "reason here").ok).toBe(false);
    expect(checkTransition("OPEN", "PUBLISH").ok).toBe(false);
    expect(checkTransition("OPEN", "ARCHIVE", "reason here").ok).toBe(false);
    for (const a of POSITION_ACTIONS) expect(checkTransition("ARCHIVED", a, "reason here").ok).toBe(false);
    expect(checkTransition("SOMETHING_ELSE", "PUBLISH").ok).toBe(false);
  });

  it("reads the legacy ON_HOLD as PAUSED (resume / close), never writes it", () => {
    expect(canonicalStatus("ON_HOLD")).toBe("PAUSED");
    expect(checkTransition("ON_HOLD", "RESUME").ok).toBe(true);
    expect(Object.values(TRANSITIONS).map((r) => r.to)).not.toContain("ON_HOLD");
  });

  it("every destructive move requires a written reason (CLOSE, REOPEN, ARCHIVE)", () => {
    for (const a of ["CLOSE", "REOPEN", "ARCHIVE"] as const) {
      expect(TRANSITIONS[a].reasonRequired).toBe(true);
      const from = TRANSITIONS[a].from[0];
      expect(checkTransition(from, a)).toEqual({ ok: false, code: "REASON_REQUIRED" });
      expect(checkTransition(from, a, "  ab  ")).toEqual({ ok: false, code: "REASON_REQUIRED" });
      expect(checkTransition(from, a, "position filled internally").ok).toBe(true);
    }
  });

  it("every move that OPENS a position runs the publish gate", () => {
    for (const a of ["PUBLISH", "RESUME", "REOPEN"] as const) expect(TRANSITIONS[a].requiresReadiness).toBe(true);
  });

  it("archive and reopen are ATS_ADMIN; soft delete is ATS_ADMIN and never from OPEN", () => {
    expect(TRANSITIONS.ARCHIVE.capability).toBe("ATS_ADMIN");
    expect(TRANSITIONS.REOPEN.capability).toBe("ATS_ADMIN");
    expect(canSoftDelete("OPEN")).toBe(false);
    for (const s of ["DRAFT", "PAUSED", "CLOSED", "ARCHIVED", "ON_HOLD"]) expect(canSoftDelete(s)).toBe(true);
    expect(isEditable("ARCHIVED")).toBe(false);
  });

  it("the actions offered per role mirror the capability matrix", () => {
    // RECRUITER holds ATS_MANAGE but not ATS_ADMIN.
    const recruiter = allowedActions("CLOSED", caps("RECRUITER"));
    expect(recruiter).toEqual({ transitions: [], canEdit: true, canDelete: false });
    const hr = allowedActions("CLOSED", caps("HR_MANAGER"));
    expect(hr.transitions.sort()).toEqual(["ARCHIVE", "REOPEN"]);
    expect(hr.canDelete).toBe(true);
    // View-only roles get nothing to click.
    for (const role of ["INTERVIEWER", "MANAGER", "HIRING_MANAGER", "ENGINEER", "VIEWER"]) {
      expect(allowedActions("DRAFT", caps(role))).toEqual({ transitions: [], canEdit: false, canDelete: false });
    }
  });
});

const COMPLETE: ReadinessInput = {
  title: "Senior Accountant",
  hiringManagerId: "m-1",
  approvalOwnerRole: "HR_MANAGER",
  decisionSlaDays: 5,
  scoringRubric: { weights: { ...ROLE_PROFILES.finance_accountant.weights } },
  interviewKit: ROLE_PROFILES.finance_accountant.interviewKit,
  assessmentConfig: ROLE_PROFILES.finance_accountant.assessment,
  evidenceRequirements: ["A degree certificate or equivalent evidence"],
  closingDate: null,
  translations: ["EN", "FA", "DE"].map((language) => ({
    language,
    title: `t-${language}`,
    shortSummary: "s",
    description: "d",
    departmentLabel: "Finance",
    seoTitle: `t-${language}`,
    seoDescription: "s",
  })),
  criteria: [
    { kind: "MUST_HAVE", label: "IFRS reporting", keywords: ["IFRS"] },
    { kind: "DISQUALIFIER", label: "No accounting experience at all", keywords: [] },
  ],
  defaultLocale: "fa",
};

describe("the publish gate: required fields are enforced before publishing", () => {
  it("a complete position is ready", () => {
    expect(evaluatePublishReadiness(COMPLETE)).toEqual({ ready: true, missing: [], protectedTerms: [] });
  });

  it("reports EVERY missing requirement of the owner's rule — never fills one in", () => {
    const empty: ReadinessInput = {
      ...COMPLETE,
      title: "",
      hiringManagerId: null,
      approvalOwnerRole: null,
      decisionSlaDays: null,
      scoringRubric: null,
      interviewKit: [],
      translations: [],
      criteria: [],
    };
    const v = evaluatePublishReadiness(empty);
    expect(v.ready).toBe(false);
    for (const code of [
      "PUBLIC_TITLE_MISSING",
      "TITLE_EN_MISSING",
      "TITLE_FA_MISSING",
      "DESCRIPTION_EN_MISSING",
      "DESCRIPTION_FA_MISSING",
      "MUST_HAVE_MISSING",
      "DISQUALIFIER_MISSING",
      "RUBRIC_MISSING",
      "INTERVIEW_KIT_MISSING",
      "HIRING_OWNER_MISSING",
      "APPROVAL_OWNER_MISSING",
      "SLA_MISSING",
      "DEFAULT_LOCALE_INCOMPLETE",
    ]) {
      expect(v.missing, code).toContain(code);
    }
  });

  it("a rubric that does not total 100 is not a rubric; an owner role without ATS_REVIEW is not an approval owner", () => {
    const w = { ...ROLE_PROFILES.finance_accountant.weights, skill: ROLE_PROFILES.finance_accountant.weights.skill + 1 };
    expect(evaluatePublishReadiness({ ...COMPLETE, scoringRubric: { weights: w } }).missing).toEqual(["RUBRIC_MISSING"]);
    expect(evaluatePublishReadiness({ ...COMPLETE, approvalOwnerRole: "INTERVIEWER" }).missing).toEqual(["APPROVAL_OWNER_MISSING"]);
    expect(evaluatePublishReadiness({ ...COMPLETE, decisionSlaDays: 0 }).missing).toEqual(["SLA_MISSING"]);
    expect(evaluatePublishReadiness({ ...COMPLETE, decisionSlaDays: 91 }).missing).toEqual(["SLA_MISSING"]);
  });

  it("a passed closing date blocks opening", () => {
    const v = evaluatePublishReadiness({ ...COMPLETE, closingDate: new Date("2020-01-01") }, new Date("2026-09-24"));
    expect(v.missing).toEqual(["CLOSING_DATE_PASSED"]);
  });

  it("the German default locale requires the German copy to be complete", () => {
    const noDe = { ...COMPLETE, defaultLocale: "de" as const, translations: COMPLETE.translations.filter((t) => t.language !== "DE") };
    expect(evaluatePublishReadiness(noDe).missing).toEqual(["DEFAULT_LOCALE_INCOMPLETE"]);
  });
});

describe("protected characteristics are rejected in criteria (static + runtime)", () => {
  it("the runtime scan catches English, Persian and German protected terms", () => {
    for (const text of [
      "Candidates under 30 years of age",
      "Male applicants preferred",
      "Must state religion",
      "Married candidates only",
      "Attach a photo",
      "Nationality: Iranian",
      "Date of birth required",
      "Not pregnant",
      "حداکثر سن ۳۰ سال",
      "جنسیت: مرد",
      "وضعيت تأهل", // typed with an Arabic ي — normalised, still caught
      "ارسال عکس الزامی است",
      "Alter unter 35",
      "Familienstand angeben",
      "Lichtbild erforderlich",
      // Review fix: inflected and gendered forms in all three languages.
      "candidates aged under 35",
      "only men",
      "women only",
      "nur männliche Bewerber",
      "weiblich",
      "ledige Bewerber",
      "Rasse",
      "Altersgrenze 35",
      "فقط آقایان",
      "خانم",
      "مرد",
      "جنسیت‌ها",
      "مجرد‌ها",
      "متأهلین",
      "مذهبی",
      // Second review: -ies plurals, age / gender / birth-year forms, diacritics.
      "applicants with disabilities excluded",
      "list your nationalities",
      "young and dynamic team member",
      "younger than 30",
      "unmarried candidates",
      "citizenship required",
      "attach a photograph",
      "sexual orientation",
      "مذکر",
      "مونث",
      "متولد ۱۳۷۰ به بعد",
      "سنین ۲۵ تا ۳۵",
      "جوان و پرانرژی",
      "آقایون",
      "حداکثر سنّ ۳۰",
      "Fotos beifügen",
      "Bewerbungsfoto erforderlich",
      "Staatsbürgerschaft",
      "jung und dynamisch",
    ]) {
      expect(findProtectedTerms(text), text).not.toEqual([]);
    }
  });

  it("does not refuse ordinary engineering vocabulary", () => {
    for (const text of [
      "Agent-based simulation",
      "Agency experience with B2B clients",
      "Single-phase and three-phase motors",
      "Single-page application with React",
      "Photovoltaic plant commissioning",
      "Trace analysis of PLC scan cycles",
      "Manage engineering changes",
      "Image processing and computer vision",
      "سنجش عملکرد و گزارش‌دهی",
      "مدیریت پروژه‌های صنعتی",
      "Alternative Energien und Automatisierung",
      "Managed services",
      "Human-machine interface",
      "Mentoring junior engineers",
      "Man-hours estimation",
      "Documents management",
      "Fotografie und Bildbearbeitung",
      "Mannschaftsführung",
      "Usage analytics",
      "Damaged equipment diagnosis",
      // Second review: established technical phrases are not personal attributes.
      "Eliminate every single point of failure",
      "Single sign-on with SAML",
      "Single mode fiber backbone",
      "Single board computer for edge gateways",
      "Estimate man hours per commissioning",
      "Debug race conditions in multithreaded drivers",
      "Detect a data race in the PLC runtime",
      "Crimp an M12 male connector and a female connector",
      "Asset age and equipment age analysis for predictive maintenance",
      "Alter der Anlage bewerten",
      "تحلیل سن تجهیزات برای نگهداری پیش‌بینانه",
      "زمان عکس‌العمل سیستم کنترل",
    ]) {
      expect(findProtectedTerms(text), text).toEqual([]);
    }
  });

  it("STATIC: no criterion, keyword, interview question, rubric or assessment of the role catalogue carries one", () => {
    for (const code of ROLE_CODES) {
      const p = ROLE_PROFILES[code];
      const strings = judgedStrings({
        criteria: p.criteria.map((c) => ({ kind: c.kind, label: c.label, keywords: c.keywords })),
        interviewKit: p.interviewKit,
        assessmentConfig: p.assessment,
        evidenceRequirements: [],
      });
      expect(strings.length, code).toBeGreaterThan(20); // anti-vacuity
      expect(scanProtectedTerms(strings), code).toEqual([]);
    }
  });

  it("STATIC: the five initial positions inherit a clean catalogue and a valid kit and rubric", () => {
    expect(INITIAL_POSITIONS.map((p) => p.title.en)).toEqual([
      "Senior Accountant",
      "Senior Electrical and Industrial Automation Engineer",
      "Backend Developer",
      "Artificial Intelligence Specialist",
      "Senior B2B Marketing Specialist",
    ]);
    for (const p of INITIAL_POSITIONS) {
      const profile = ROLE_PROFILES[p.roleCode];
      expect(interviewKitSchema.safeParse(profile.interviewKit).success, p.roleCode).toBe(true);
      expect(scoringRubricSchema.safeParse({ weights: profile.weights }).success, p.roleCode).toBe(true);
      expect(profile.criteria.some((c) => c.kind === "MUST_HAVE")).toBe(true);
      expect(profile.criteria.some((c) => c.kind === "DISQUALIFIER")).toBe(true);
      // Persian titles use Persian letters only (ی / ک, never Arabic ي / ك).
      expect(p.title.fa).not.toMatch(/[يك]/);
      for (const t of [p.title.en, p.title.fa, p.title.de]) expect(findProtectedTerms(t)).toEqual([]);
    }
  });

  it("the English term list is scanned as a whole — every term is caught on its own", () => {
    for (const term of PROTECTED_ATTRIBUTE_TERMS) {
      const sample = term === "pregnan" ? "pregnancy" : term;
      expect(findProtectedTerms(`requirement: ${sample}`), term).toContain(term);
    }
  });
});

describe("the contract refuses what a client must never set", () => {
  const minimal = {
    internalTitle: "Backend (internal)",
    publicTitle: "Backend Developer",
    department: "Engineering",
    location: "Tehran",
    copy: { en: { title: "Backend Developer" }, fa: { title: "توسعه‌دهندهٔ بک‌اند" } },
  };

  it("accepts a minimal draft", () => {
    expect(createPositionSchema.safeParse(minimal).success).toBe(true);
  });

  it("refuses tenant, lifecycle and publication fields on create and on edit", () => {
    for (const extra of [{ organizationId: "org-B" }, { status: "OPEN" }, { isPublic: true }, { publishedAt: "2026-01-01" }, { deletedAt: null }]) {
      expect(createPositionSchema.safeParse({ ...minimal, ...extra }).success, JSON.stringify(extra)).toBe(false);
      expect(updatePositionSchema.safeParse({ expectedVersion: 0, ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
    // The requisition key is immutable after creation.
    expect(updatePositionSchema.safeParse({ expectedVersion: 0, requisitionKey: "NEW" }).success).toBe(false);
  });

  it("requires both an English and a Persian title", () => {
    expect(createPositionSchema.safeParse({ ...minimal, copy: { en: { title: "X" }, fa: { title: "" } } }).success).toBe(false);
  });

  it("a transition cannot smuggle a status or an organization", () => {
    expect(transitionSchema.safeParse({ action: "PUBLISH", expectedVersion: 0, status: "OPEN" }).success).toBe(false);
    expect(transitionSchema.safeParse({ action: "AUTO_HIRE", expectedVersion: 0 }).success).toBe(false);
  });
});

describe("public visibility: only OPEN + public + opened positions, whatever else is true", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  const opened = { status: "OPEN", isPublic: true, publishedAt: new Date("2026-09-01"), closingDate: null, deletedAt: null };

  it("OPEN, public and published is listed", () => {
    expect(isJobPubliclyEligible(opened, now)).toBe(true);
  });

  it.each(["DRAFT", "PAUSED", "ON_HOLD", "CLOSED", "ARCHIVED"])("%s is never public, even when flagged public and published", (status) => {
    expect(isJobPubliclyEligible({ ...opened, status }, now)).toBe(false);
  });

  it("private, unpublished, future-dated, expired, soft-deleted or org-switched-off is never public", () => {
    expect(isJobPubliclyEligible({ ...opened, isPublic: false }, now)).toBe(false);
    expect(isJobPubliclyEligible({ ...opened, publishedAt: null }, now)).toBe(false);
    expect(isJobPubliclyEligible({ ...opened, publishedAt: new Date("2026-10-01") }, now)).toBe(false);
    expect(isJobPubliclyEligible({ ...opened, closingDate: new Date("2026-09-20") }, now)).toBe(false);
    expect(isJobPubliclyEligible({ ...opened, deletedAt: new Date() }, now)).toBe(false);
    expect(isJobPubliclyEligible({ ...opened, organizationListingEnabled: false }, now)).toBe(false);
    expect(isJobPubliclyEligible({ ...opened, organizationListingEnabled: true }, now)).toBe(true);
  });

  it("the database predicate says the same thing, including the organization kill switch", () => {
    const w = publicJobWhere(now);
    expect(w).toMatchObject({ status: "OPEN", isPublic: true, deletedAt: null, publishedAt: { not: null, lte: now } });
    expect(w.organization).toEqual({
      OR: [{ atsSettings: { is: null } }, { atsSettings: { is: { publicListingEnabled: true } } }],
    });
  });
});
