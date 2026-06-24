import type { Job, AtsScore, ScoreRequest } from "./types";

const INDUSTRIAL_KEYWORDS = [
  "plc", "scada", "hmi", "automation", "dcs", "rtu", "iec 61131",
  "tia portal", "step 7", "siemens", "abb", "schneider", "rockwell",
  "allen-bradley", "modbus", "profibus", "profinet", "opc-ua", "opc ua",
  "fieldbus", "ethercat", "drives", "vfd", "servo", "inverter",
  "commissioning", "field service", "electrical", "instrumentation",
  "control systems", "pid", "historian", "mes", "safety plc",
];

const AUTH_SCORE: Record<string, number> = {
  "citizen":              100,
  "permanent-resident":   90,
  "work-visa":            70,
  "requires-sponsorship": 30,
};

export function scoreCandidate(job: Job, candidate: ScoreRequest): AtsScore {
  const explanations: string[] = [];
  const riskFlags: string[]    = [];

  const skillsLower = candidate.skills.map(s => s.toLowerCase());

  // 1. Skill score (35%)
  const reqMatched = job.requiredSkills.filter(rs => {
    const rl = rs.toLowerCase();
    return skillsLower.some(sl => sl.includes(rl) || rl.includes(sl));
  });
  const niceMatched = job.niceToHaveSkills.filter(ns => {
    const nl = ns.toLowerCase();
    return skillsLower.some(sl => sl.includes(nl) || nl.includes(sl));
  });
  const reqRatio  = job.requiredSkills.length > 0 ? reqMatched.length / job.requiredSkills.length : 1;
  const niceRatio = job.niceToHaveSkills.length > 0 ? niceMatched.length / job.niceToHaveSkills.length : 1;
  const skillScore = Math.round((reqRatio * 0.80 + niceRatio * 0.20) * 100);

  if (reqRatio === 1) {
    explanations.push(`All ${job.requiredSkills.length} required skills matched`);
  } else {
    const list = reqMatched.length > 0 ? reqMatched.join(", ") : "none";
    explanations.push(`${reqMatched.length}/${job.requiredSkills.length} required skills matched: ${list}`);
    if (reqRatio < 0.5) riskFlags.push("Less than 50% of required skills matched");
  }
  if (niceMatched.length > 0) {
    explanations.push(`${niceMatched.length} nice-to-have skill(s) matched: ${niceMatched.join(", ")}`);
  }

  // 2. Experience score (20%)
  const minExp = job.minExperienceYears;
  const actExp = candidate.experienceYears;
  let experienceScore: number;
  if (actExp >= minExp * 1.5) {
    experienceScore = 100;
    explanations.push(`${actExp}y experience significantly exceeds ${minExp}y minimum`);
  } else if (actExp >= minExp) {
    experienceScore = Math.min(100, 85 + Math.round(((actExp - minExp) / Math.max(minExp * 0.5, 1)) * 15));
    explanations.push(`${actExp}y experience meets ${minExp}y requirement`);
  } else {
    experienceScore = Math.round((actExp / minExp) * 70);
    riskFlags.push(`Below minimum experience: ${actExp}y vs ${minExp}y required`);
    explanations.push(`${actExp}y is below ${minExp}y minimum`);
  }
  experienceScore = Math.min(100, Math.max(0, experienceScore));

  // 3. Location score (10%)
  const locA = candidate.location.toLowerCase();
  const locB = job.location.toLowerCase();
  const locationMatch = locA.includes(locB) || locB.includes(locA) ||
    locA.split(",")[0].trim() === locB.split(",")[0].trim();
  const locationScore = locationMatch ? 100 : 40;
  if (locationMatch) {
    explanations.push(`Location match: ${candidate.location}`);
  } else {
    explanations.push(`Location mismatch: candidate in ${candidate.location}, role in ${job.location}`);
  }

  // 4. Work authorization score (15%)
  const authorizationScore = AUTH_SCORE[candidate.workAuthorization] ?? 50;
  if (candidate.workAuthorization === "requires-sponsorship" && !job.visaSponsorship) {
    riskFlags.push("Requires visa sponsorship but this role does not offer it");
    explanations.push("Sponsorship required — not available for this role");
  } else {
    explanations.push(`Work authorization: ${candidate.workAuthorization.replace(/-/g, " ")}`);
    if (job.visaSponsorship && candidate.workAuthorization === "requires-sponsorship") {
      explanations.push("Visa sponsorship available for this role");
    }
  }

  // 5. Salary score (10%)
  let salaryScore: number;
  if (candidate.salaryExpectation === 0) {
    salaryScore = 80;
    explanations.push("Salary expectation not disclosed");
  } else if (candidate.salaryExpectation <= job.salaryMax) {
    salaryScore = candidate.salaryExpectation >= job.salaryMin ? 100 : 90;
    explanations.push(
      `Salary expectation (${candidate.salaryExpectation.toLocaleString()} ${job.currency}) is within budget`
    );
  } else {
    const over    = candidate.salaryExpectation - job.salaryMax;
    const overPct = over / job.salaryMax;
    salaryScore   = Math.max(0, Math.round(100 - overPct * 200));
    if (overPct > 0.2) {
      riskFlags.push(`Salary expectation ${Math.round(overPct * 100)}% above budget ceiling`);
    }
    explanations.push(
      `Salary expectation exceeds budget by ${over.toLocaleString()} ${job.currency}`
    );
  }

  // 6. Industrial background score (10%)
  const industrialHits = INDUSTRIAL_KEYWORDS.filter(kw =>
    skillsLower.some(sl => sl.includes(kw))
  );
  const industryScore = Math.min(100, industrialHits.length * 14);
  if (industrialHits.length > 0) {
    const shown = industrialHits.slice(0, 3).join(", ");
    const extra = industrialHits.length > 3 ? ` +${industrialHits.length - 3} more` : "";
    explanations.push(`Industrial background detected: ${shown}${extra}`);
  } else {
    explanations.push("No industrial/PLC/SCADA background detected in skills");
    riskFlags.push("No industrial automation background");
  }

  const total = Math.min(100, Math.max(0, Math.round(
    skillScore         * 0.35 +
    experienceScore    * 0.20 +
    locationScore      * 0.10 +
    authorizationScore * 0.15 +
    salaryScore        * 0.10 +
    industryScore      * 0.10,
  )));

  return {
    total,
    skillScore,
    experienceScore,
    locationScore,
    authorizationScore,
    salaryScore,
    industryScore,
    riskFlags,
    explanations,
  };
}
