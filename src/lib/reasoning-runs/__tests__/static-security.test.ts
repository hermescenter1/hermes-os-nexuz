/**
 * PHASE 112 — static security scan of the reasoning-run source.
 *
 * Proves by inspection that the feature has no OT actuation / external side
 * effect vocabulary, embeds no secrets, and that the repository never issues an
 * UPDATE/UPSERT/DELETE against the immutable reasoning tables.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const LIB_DIR = join(REPO, "src/lib/reasoning-runs");
const ROUTE_FILES = [
  "src/app/api/industrial-brain/runs/route.ts",
  "src/app/api/industrial-brain/runs/[id]/route.ts",
  "src/app/api/industrial-brain/runs/[id]/replay/route.ts",
];

function libSourceFiles(): string[] {
  return readdirSync(LIB_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => join(LIB_DIR, f));
}

function readAllSources(): { path: string; text: string }[] {
  const files = [...libSourceFiles(), ...ROUTE_FILES.map((p) => join(REPO, p))];
  return files.map((p) => ({ path: p, text: readFileSync(p, "utf8") }));
}

describe("no OT actuation / external side-effect vocabulary", () => {
  // Deliberately word-boundary anchored so legitimate identifiers like
  // `recommendedActions` or `SAFE_ACTION` do not match.
  const FORBIDDEN = [
    /\bwriteTag\b/i,
    /\bsetpoint\b/i,
    /\bactuate\w*\b/i,
    /\bforceValue\b/i,
    /\bsendCommand\b/i,
    /\bcreateWorkOrder\b/i,
    /\bnodemailer\b/i,
    /\bsendMail\b/i,
    /\bfetch\s*\(/,
    /\baxios\b/,
    /process\.env/,
  ];

  for (const { path, text } of readAllSources()) {
    it(`clean: ${path.replace(REPO, "")}`, () => {
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(text), `${path} matched ${pattern}`).toBe(false);
      }
    });
  }
});

describe("no embedded secrets", () => {
  const SECRET_PATTERNS = [/sk-[A-Za-z0-9]{16,}/, /PRIVATE KEY/, /BEGIN [A-Z ]*KEY/, /password\s*[:=]\s*["'][^"']+["']/i];
  for (const { path, text } of readAllSources()) {
    it(`no secret in ${path.replace(REPO, "")}`, () => {
      for (const pattern of SECRET_PATTERNS) {
        expect(pattern.test(text), `${path} matched ${pattern}`).toBe(false);
      }
    });
  }
});

describe("repository never mutates or deletes the immutable tables", () => {
  it("prisma-repository issues no update/upsert/delete/updateMany/deleteMany", () => {
    const text = readFileSync(join(LIB_DIR, "prisma-repository.ts"), "utf8");
    for (const m of [".update(", ".upsert(", ".delete(", ".updateMany(", ".deleteMany("]) {
      expect(text.includes(m), `prisma-repository uses ${m}`).toBe(false);
    }
  });

  it("the repository port declares no update/upsert method", () => {
    const text = readFileSync(join(LIB_DIR, "repository.ts"), "utf8");
    // The interface exposes persistRun / findRunWithArtifacts / appendReplayAttempt only.
    expect(/\bupdateRun\b|\bupsert\w*\(/.test(text)).toBe(false);
  });
});
