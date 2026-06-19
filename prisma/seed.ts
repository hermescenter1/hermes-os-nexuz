/**
 * Prisma seed (Phase 11C).
 *
 * Seeds PostgreSQL with the existing V1 corpus so a fresh database mirrors
 * the bundled session data:
 *   - 14 engineering cases (knowledge-data/cases.json)
 *   - 30 knowledge libraries (knowledge-data/*.json)
 *
 * Idempotent via upsert on a deterministic id derived from the source id, so
 * re-running the seed does not create duplicates. Run with:  npm run db:seed
 *
 * This script only runs against a real database (it imports @prisma/client
 * directly). It is never imported by the app, so the session build is
 * unaffected.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "src", "lib", "industrial", "knowledge-data");

interface RawCase {
  id: string;
  vendor: string;
  category: string;
  keywords: string[];
  en: {
    symptoms: string;
    rootCause: string;
    rootCauses: string[];
    verificationSteps: string[];
    correctiveActions: string[];
  };
}

interface RawLib {
  id: string;
  domains: string[];
  keywords: string[];
  vendor?: string;
}

async function seedCases() {
  const file = JSON.parse(readFileSync(join(dataDir, "cases.json"), "utf8")) as {
    cases: RawCase[];
  };
  let n = 0;
  for (const c of file.cases) {
    const id = `seed-${c.id}`;
    const data = {
      title: c.en.rootCause.slice(0, 80) || c.id,
      vendor: c.vendor,
      domain: c.category,
      problem: c.en.symptoms ?? "",
      rootCause: c.en.rootCause ?? "",
      secondaryCauses: c.en.rootCauses ?? [],
      verificationSteps: c.en.verificationSteps ?? [],
      correctiveActions: c.en.correctiveActions ?? [],
      safetyNotes: "",
      tags: c.keywords ?? [],
      confidence: 80,
      status: "published",
    };
    await prisma.engineeringCase.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
    n++;
  }
  return n;
}

async function seedKnowledge() {
  const files = readdirSync(dataDir).filter(
    (f) => f.endsWith(".json") && f !== "cases.json" && f !== "vendors.json"
  );
  let n = 0;
  for (const f of files) {
    const category = f.replace(/\.json$/, "");
    const parsed = JSON.parse(readFileSync(join(dataDir, f), "utf8")) as {
      libraries?: RawLib[];
    };
    for (const lib of parsed.libraries ?? []) {
      const id = `seed-${lib.id}`;
      const data = {
        title: lib.id,
        domain: lib.domains?.[0] ?? category,
        vendor: lib.vendor ?? null,
        summary: `${category} knowledge library: ${lib.id}`,
        content: "",
        failureModes: [],
        diagnosticGuidance: [],
        verificationSteps: [],
        correctiveActions: [],
        safetyNotes: "",
        tags: lib.keywords ?? [],
        confidence: 75,
        status: "published",
      };
      await prisma.knowledgeArticle.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      n++;
    }
  }
  return n;
}

// ── Phase 31 — Billing plans ──────────────────────────────────────────────

interface PlanLimits {
  ai_requests:        number;
  projects:           number;
  members:            number;
  storage_gb:         number;
  industrial_gateway: boolean;
  multi_agent:        boolean;
  api_access:         boolean;
  priority_support:   boolean;
}

interface PlanSeed {
  slug:         string;
  name:         string;
  description:  string;
  monthlyPrice: string;
  yearlyPrice:  string;
  currency:     string;
  features:     string[];
  limits:       PlanLimits;
}

const PLANS: PlanSeed[] = [
  {
    slug:         "community",
    name:         "Community",
    description:  "Open-source engineers and solo automation professionals.",
    monthlyPrice: "0.0000",
    yearlyPrice:  "0.0000",
    currency:     "USD",
    features:     [
      "1 project",
      "3 team members",
      "AI Copilot (100 req/mo)",
      "Knowledge Library access",
      "Community support",
    ],
    limits: {
      ai_requests: 100, projects: 1, members: 3, storage_gb: 0.5,
      industrial_gateway: false, multi_agent: false, api_access: false, priority_support: false,
    },
  },
  {
    slug:         "professional",
    name:         "Professional",
    description:  "Individual engineers and small automation teams.",
    monthlyPrice: "49.0000",
    yearlyPrice:  "470.0000",
    currency:     "USD",
    features:     [
      "5 projects",
      "10 team members",
      "AI Copilot (2 000 req/mo)",
      "SCADA Studio access",
      "Multi-Agent access",
      "API access",
      "Priority email support",
    ],
    limits: {
      ai_requests: 2000, projects: 5, members: 10, storage_gb: 5,
      industrial_gateway: false, multi_agent: true, api_access: true, priority_support: true,
    },
  },
  {
    slug:         "team",
    name:         "Team",
    description:  "Growing engineering departments and system integrators.",
    monthlyPrice: "149.0000",
    yearlyPrice:  "1430.0000",
    currency:     "USD",
    features:     [
      "25 projects",
      "50 team members",
      "AI Copilot (10 000 req/mo)",
      "All modules unlocked",
      "Industrial Gateway access",
      "RBAC and audit logs",
      "Slack support",
    ],
    limits: {
      ai_requests: 10000, projects: 25, members: 50, storage_gb: 50,
      industrial_gateway: true, multi_agent: true, api_access: true, priority_support: true,
    },
  },
  {
    slug:         "enterprise",
    name:         "Enterprise",
    description:  "Large plant operators and system integrators at scale.",
    monthlyPrice: "499.0000",
    yearlyPrice:  "4790.0000",
    currency:     "USD",
    features:     [
      "Unlimited projects",
      "Unlimited members",
      "AI Copilot (unlimited)",
      "On-premise deployment",
      "Custom integrations",
      "Dedicated support SLA",
      "IRR / GBP / EUR billing",
    ],
    limits: {
      ai_requests: -1, projects: -1, members: -1, storage_gb: -1,
      industrial_gateway: true, multi_agent: true, api_access: true, priority_support: true,
    },
  },
];

async function seedPlans(): Promise<number> {
  let n = 0;
  for (const p of PLANS) {
    await prisma.plan.upsert({
      where:  { slug: p.slug },
      create: {
        slug:         p.slug,
        name:         p.name,
        description:  p.description,
        monthlyPrice: p.monthlyPrice,
        yearlyPrice:  p.yearlyPrice,
        currency:     p.currency as "USD",
        features:     p.features,
        limits:       p.limits,
        isActive:     true,
      },
      update: {
        name:         p.name,
        description:  p.description,
        monthlyPrice: p.monthlyPrice,
        yearlyPrice:  p.yearlyPrice,
        features:     p.features,
        limits:       p.limits,
        isActive:     true,
      },
    });
    n++;
  }
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const cases    = await seedCases();
  const articles = await seedKnowledge();
  const plans    = await seedPlans();
  console.log(
    `Seed complete: ${cases} engineering cases, ${articles} knowledge articles, ${plans} billing plans.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
