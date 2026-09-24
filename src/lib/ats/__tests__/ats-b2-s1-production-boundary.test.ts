/**
 * ATS-B2 / ATS-S1 — static boundary gate for the new production surfaces.
 *
 *   - none of them imports the development fixture, by any spelling;
 *   - the modules that handle applicant data never log;
 *   - the stage-gate vocabulary is present where it must be and absent where
 *     it must not be (no code path writes SCREENING/HIRED outside the human
 *     decision service).
 *
 * Extends `production-boundary.test.ts`, whose DISCOVERY_SURFACES list is
 * about search-engine-visible modules; this list is about the intake and
 * review path.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC = path.resolve(__dirname, "../../..");

const PRODUCTION_SURFACES = [
  "lib/ats/intake.ts",
  "lib/ats/decision.ts",
  "lib/ats/retention.ts",
  "lib/ats/criteria.ts",
  "lib/ats/rbac.ts",
  "lib/ats/policy.ts",
  "lib/ats/review/engine.ts",
  "lib/ats/review/extractor.ts",
  "lib/ats/review/scorer.ts",
  "lib/ats/review/catalog.ts",
  "lib/ats/review/worker.ts",
  "lib/ats/review/worker-auth.ts",
  "lib/ats/review/prompt-guard.ts",
  "lib/ats/review/report-schema.ts",
  "app/api/careers/apply/route.ts",
  "app/api/ats/applications/[id]/decision/route.ts",
  "app/api/ats/applications/[id]/review/route.ts",
  "app/api/ats/applications/[id]/status/route.ts",
  "app/api/ats/jobs/[id]/criteria/route.ts",
  "app/api/ats/review/deliver/route.ts",
] as const;

const NO_LOG_SURFACES = [
  "lib/ats/intake.ts",
  "lib/ats/decision.ts",
  "lib/ats/review/engine.ts",
  "lib/ats/review/extractor.ts",
  "lib/ats/review/worker.ts",
  "app/api/careers/apply/route.ts",
] as const;

function read(rel: string): string {
  const file = path.join(SRC, rel);
  expect(fs.existsSync(file), `${rel} must exist`).toBe(true);
  return fs.readFileSync(file, "utf8");
}
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("no production intake/review surface imports the ATS fixture", () => {
  it.each(PRODUCTION_SURFACES)("%s", (rel) => {
    const src = code(rel);
    expect(src).not.toMatch(/from\s+["'][^"']*mock-data["']/);
    expect(src).not.toMatch(/import\(\s*["'][^"']*mock-data["']\s*\)/);
    expect(src).not.toMatch(/require\(\s*["'][^"']*mock-data["']\s*\)/);
  });
});

describe("applicant data never reaches a log line", () => {
  it.each(NO_LOG_SURFACES)("%s", (rel) => {
    const src = code(rel);
    expect(src).not.toMatch(/console\.(log|error|warn|info|debug)/);
    expect(src).not.toMatch(/\blogger\./);
  });
});

describe("the stage gate is where it must be", () => {
  it("intake ends at AI_REVIEW_PENDING and knows no later status", () => {
    const src = code("lib/ats/intake.ts");
    expect(src).toContain('"AI_REVIEW_PENDING"');
    for (const s of ["SCREENING", "PENDING_HUMAN_APPROVAL", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]) {
      expect(src, `intake must not write ${s}`).not.toContain(`"${s}"`);
    }
  });

  it("the worker writes PENDING_HUMAN_APPROVAL and nothing later", () => {
    const src = code("lib/ats/review/worker.ts");
    expect(src).toContain('"PENDING_HUMAN_APPROVAL"');
    for (const s of ["SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED"]) {
      expect(src, `worker must not write ${s}`).not.toContain(`"${s}"`);
    }
  });

  it("only the decision service names the later stages, and it requires a reason", () => {
    const src = code("lib/ats/decision.ts");
    expect(src).toContain("decisionReasonSchema");
    expect(src).toMatch(/min\(3/);
    expect(src).toContain("PENDING_HUMAN_APPROVAL: []");
    expect(src).toContain("AI_REVIEW_PENDING: []");
  });

  it("the public gate stays closed: the owner flag is still false", async () => {
    const flags = await import("../acceptance-flag");
    expect(flags.APPLICATION_ACCEPTANCE_AUTHORIZED).toBe(false);
    expect(flags.APPLICATION_ORCHESTRATION_IMPLEMENTED).toBe(true);
    expect(flags.APPLY_JOURNEY_OPEN).toBe(false);
  });

  it("the extractor reads no field that could carry a protected attribute", () => {
    const src = code("lib/ats/review/extractor.ts");
    for (const field of ["fullName", "name", "email", "phone", "photo", "birth", "gender"]) {
      expect(src, `extractor must not read ${field}`).not.toMatch(new RegExp(`input\\.${field}\\b`));
    }
  });
});

/*
 * Repository-wide invariants behind "every application starts at
 * AI_REVIEW_PENDING" and "candidate data is reachable only through an
 * organization's application".
 *
 * Three pre-B2 writers still exist and are deliberately NOT deleted in this
 * change: `db.ts#createApplication` (creates at APPLIED), `db.ts#updateApplicationStatus`
 * (unconditional status write, no reason, no decision record) and
 * `application.ts#persistApplication` (B1's unwired persist helper). Each would
 * bypass the stage gate. Today none has a production caller — this test makes
 * that a gate rather than a coincidence.
 */
function productionSources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules" || e.name.startsWith(".")) continue;
      productionSources(p, out);
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("repository-wide: nothing bypasses the stage gate or lists candidates", () => {
  const files = productionSources(SRC).map((f) => ({ rel: path.relative(SRC, f).split(path.sep).join("/"), src: stripComments(fs.readFileSync(f, "utf8")) }));

  it("the scan is not vacuous", () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.rel === "lib/ats/intake.ts")).toBe(true);
  });

  it.each([
    ["createApplication", "lib/ats/db.ts"],
    ["updateApplicationStatus", "lib/ats/db.ts"],
    ["persistApplication", "lib/ats/application.ts"],
  ])("%s has no production caller outside its own definition in %s", (name, home) => {
    const word = new RegExp(String.raw`\b${name}\b`);
    const callers = files.filter((f) => f.rel !== home && word.test(f.src)).map((f) => f.rel);
    // Anti-vacuity: the pattern must find the definition in its home file.
    expect(word.test(files.find((f) => f.rel === home)!.src), `${name} must be found in ${home}`).toBe(true);
    expect(callers, `${name} must not be reachable — it would bypass AI_REVIEW_PENDING / the human decision record`).toEqual([]);
  });

  it("only the intake service creates an application", () => {
    const creators = files.filter((f) => /atsApplication\.create\(/.test(f.src)).map((f) => f.rel).sort();
    // application.ts keeps the unwired B1 helper, pinned unreachable above.
    expect(creators).toEqual(["lib/ats/application.ts", "lib/ats/intake.ts"]);
  });

  it("no production code lists candidates directly — they are reached through an application", () => {
    const listers = files.filter((f) => /atsCandidate\.(findMany|count|groupBy|aggregate)\(|\.candidate\.findMany\(/.test(f.src)).map((f) => f.rel);
    expect(listers).toEqual([]);
  });
});
