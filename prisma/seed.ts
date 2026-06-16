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

async function main() {
  const cases = await seedCases();
  const articles = await seedKnowledge();
  console.log(`Seed complete: ${cases} engineering cases, ${articles} knowledge articles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
