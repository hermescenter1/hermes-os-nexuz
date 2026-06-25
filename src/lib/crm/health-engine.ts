// Phase 66 — CRM Health Engine
// Deterministic 0–100 scoring derived from account seed string.
// Six weighted dimensions → composite score → category.

import type { CrmHealthCategory, CrmHealthScore } from "./types";

type Inputs = {
  accountId:    string;
  loginDays:    number;   // days active in last 30
  activeProjects: number;
  openTickets:  number;
  closedTickets: number;
  academyCourses: number;
  billingCurrent: boolean;
  featuresUsed:  number;  // 0–10
};

function seededInt(seed: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  const pos = (h >>> 0) / 0xffffffff;
  return Math.floor(pos * (max - min + 1)) + min;
}

export function computeHealthScore(inputs: Inputs): Omit<CrmHealthScore, "id" | "accountId" | "computedAt"> {
  const loginScore    = Math.min(100, Math.round((inputs.loginDays / 30) * 100));
  const projectScore  = Math.min(100, inputs.activeProjects * 20);
  const totalTickets  = inputs.openTickets + inputs.closedTickets;
  const ticketScore   = totalTickets === 0 ? 60 :
    Math.max(0, 100 - Math.round((inputs.openTickets / Math.max(totalTickets, 1)) * 80));
  const academyScore  = Math.min(100, inputs.academyCourses * 15);
  const billingScore  = inputs.billingCurrent ? 100 : 20;
  const adoptionScore = Math.min(100, inputs.featuresUsed * 10);

  const score = Math.round(
    loginScore    * 0.25 +
    projectScore  * 0.15 +
    ticketScore   * 0.15 +
    academyScore  * 0.15 +
    billingScore  * 0.20 +
    adoptionScore * 0.10
  );

  let category: CrmHealthCategory;
  if (score >= 75)      category = "HEALTHY";
  else if (score >= 55) category = "WATCH";
  else if (score >= 35) category = "AT_RISK";
  else                  category = "CRITICAL";

  return { score, category, loginScore, projectScore, ticketScore, academyScore, billingScore, adoptionScore, metadata: {} };
}

/** Generate deterministic mock health for an account ID (for demo data). */
export function mockHealthForAccount(accountId: string): ReturnType<typeof computeHealthScore> {
  const loginDays      = seededInt(accountId + "login", 3, 30);
  const activeProjects = seededInt(accountId + "proj", 0, 5);
  const openTickets    = seededInt(accountId + "open", 0, 8);
  const closedTickets  = seededInt(accountId + "closed", 1, 20);
  const academyCourses = seededInt(accountId + "acad", 0, 7);
  const billingCurrent = seededInt(accountId + "bill", 0, 10) > 2;
  const featuresUsed   = seededInt(accountId + "feat", 1, 10);

  return computeHealthScore({
    accountId,
    loginDays,
    activeProjects,
    openTickets,
    closedTickets,
    academyCourses,
    billingCurrent,
    featuresUsed,
  });
}
