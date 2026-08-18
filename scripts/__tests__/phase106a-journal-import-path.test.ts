/**
 * PHASE 106A — the production Journal import execution path.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Phase 106 merged a 150-edition corpus and its importer, and neither reached
 * production: `.dockerignore` excluded `scripts/` outright and no Dockerfile
 * stage ever COPYied `content/`, so `journal:import` had no executable path in
 * any deployed artifact. A deploy could apply the migration and leave the
 * Journal empty, and nothing in the repository would have said so.
 *
 * These are the contracts that keep the new path safe rather than merely
 * present: the importer image must actually carry the corpus, the profile must
 * stay off by default, the web and migrator images must not have gained
 * anything, and the write must remain impossible without an explicit switch.
 *
 * Image CONTENT is proven separately, against the built image, by the Phase
 * 106A rehearsal (see docs/phase106/production-import-runbook.md) — a text
 * assertion about a COPY line is not proof that a file is in a layer.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const read = (p: string) => readFileSync(join(REPO, p), "utf8").replace(/\r\n/g, "\n");

const dockerfile = read("Dockerfile");
const dockerignore = read(".dockerignore");
const compose = read("docker-compose.prod.yml");
const importWorkflow = read(".github/workflows/journal-import.yml");
const deployWorkflow = read(".github/workflows/deploy.yml");
const importer = read("scripts/journal/import-articles.mjs");

/**
 * Executable (non-comment, non-blank) lines.
 *
 * Every assertion below that forbids something scans CODE, never prose. The
 * files being checked all document the very prohibitions being enforced — the
 * importer's header states there is no `--force`, the workflow's header states
 * that runtime `ssh-keyscan` is forbidden, the runbook states that no delete
 * command is provided. A rule that fires on its own documentation teaches the
 * next author to delete the documentation, which is the opposite of the goal.
 * The repository already encodes this distinction in the Gate 0D-A Tier 2
 * `OPS_PROHIBITION` rule; these tests follow it.
 */
const executable = (text: string) =>
  text.split("\n").filter((l) => l.trim() !== "" && !/^\s*#/.test(l.trim()));

/** JavaScript source with block and line comments removed. */
const codeOnly = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/** Lines inside fenced code blocks of a markdown document. */
const fencedLines = (markdown: string) => {
  const out: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) out.push(line);
  }
  return out;
};

/**
 * The INSTRUCTIONS of one Dockerfile stage, bounded by FROM lines.
 *
 * Comments are stripped: the next stage's explanatory header sits inside this
 * stage's byte range, so a `not.toMatch` over the raw slice would read the NEXT
 * stage's prose as this stage's behaviour.
 */
const stageBody = (name: string) => {
  const start = dockerfile.search(new RegExp(`^FROM .* AS ${name}$`, "m"));
  if (start === -1) return "";
  const rest = dockerfile.slice(start + 1);
  const nextFrom = rest.search(/^FROM .* AS /m);
  const slice = nextFrom === -1 ? rest : rest.slice(0, nextFrom);
  return slice
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
};

// ── 1. The importer stage exists and carries what the loader needs ───────────

describe("PHASE106A_IMPORTER_STAGE", () => {
  it("declares a dedicated journal-importer stage", () => {
    expect(dockerfile).toMatch(/^FROM node:20-alpine AS journal-importer$/m);
  });

  it("copies the corpus AND the journal scripts into that stage", () => {
    const stage = stageBody("journal-importer");
    expect(stage).toMatch(/^COPY content\/journal \.\/content\/journal$/m);
    expect(stage).toMatch(/^COPY scripts\/journal \.\/scripts\/journal$/m);
    expect(stage).toMatch(/^COPY prisma \.\/prisma$/m);
  });

  it("keeps the sibling layout corpus.mjs resolves against", () => {
    // corpus.mjs computes REPO as dirname(import.meta.url)/../../.. — so
    // scripts/journal/lib/corpus.mjs at /app/scripts/journal/lib yields /app,
    // and the content must be at /app/content/journal. If either COPY target
    // moved, the loader would look for the corpus somewhere it is not.
    const corpus = read("scripts/journal/lib/corpus.mjs");
    expect(corpus).toContain('join(HERE, "..", "..", "..")');
    expect(corpus).toContain('join(REPO, "content", "journal")');
  });

  it("runs as a non-root user, like every other stage", () => {
    const stage = stageBody("journal-importer");
    expect(stage).toMatch(/^USER importer$/m);
    expect(stage).toMatch(/adduser -S importer/);
  });

  it("defaults to the DRY RUN — the image CMD carries no --commit", () => {
    const stage = stageBody("journal-importer");
    const cmd = stage.match(/^CMD \[(.*)\]$/m);
    expect(cmd, "the importer stage must declare a CMD").not.toBeNull();
    expect(cmd![1]).toContain("scripts/journal/import-articles.mjs");
    expect(cmd![1]).not.toContain("--commit");
  });

  it("keeps runner as the LAST stage", () => {
    // A bare `docker build .` and the production compose build both target the
    // final stage. If journal-importer were appended after runner, the release
    // image would silently become the importer.
    const stages = [...dockerfile.matchAll(/^FROM .* AS (\S+)$/gm)].map((m) => m[1]);
    expect(stages[stages.length - 1]).toBe("runner");
    expect(stages).toContain("journal-importer");
  });
});

// ── 2. The web and migrator images gained nothing ────────────────────────────

describe("PHASE106A_OTHER_IMAGES_UNCHANGED", () => {
  it("the runner stage still copies no scripts and no content", () => {
    const runner = stageBody("runner");
    expect(runner).not.toMatch(/^COPY .*\bscripts\b/m);
    expect(runner).not.toMatch(/^COPY .*\bcontent\b/m);
  });

  it("the migrator stage still copies no scripts and no content", () => {
    const migrator = stageBody("migrator");
    expect(migrator).not.toMatch(/^COPY .*\bscripts\b/m);
    expect(migrator).not.toMatch(/^COPY .*\bcontent\b/m);
  });
});

// ── 3. The .dockerignore exception is narrow and correctly ordered ───────────

describe("PHASE106A_DOCKERIGNORE", () => {
  const lines = dockerignore.split("\n").map((l) => l.trim());
  const idx = (pattern: string) => lines.indexOf(pattern);

  it("keeps scripts/ excluded and re-includes ONLY scripts/journal", () => {
    expect(idx("scripts/")).toBeGreaterThan(-1);
    expect(idx("!scripts/journal")).toBeGreaterThan(-1);
    // No blanket un-ignore of the whole scripts tree.
    expect(lines).not.toContain("!scripts/");
    expect(lines).not.toContain("!scripts");
  });

  it("orders the exception AFTER scripts/ so it takes effect", () => {
    // Docker applies the LAST matching pattern. An exception placed before the
    // exclusion is silently dead.
    expect(idx("!scripts/journal")).toBeGreaterThan(idx("scripts/"));
  });

  it("orders the exception BEFORE the test-file rules so those still win", () => {
    // scripts/journal/__tests__ must NOT enter the importer image. Because the
    // last match wins, the test rules must come after the re-include.
    expect(idx("**/__tests__/")).toBeGreaterThan(idx("!scripts/journal"));
    expect(idx("**/*.test.ts")).toBeGreaterThan(idx("!scripts/journal"));
  });

  it("still excludes every env file", () => {
    for (const pattern of [".env", ".env.local", ".env.production"]) {
      expect(lines, `${pattern} must stay ignored`).toContain(pattern);
    }
  });
});

// ── 4. The Compose service is one-shot, gated and network-scoped ─────────────

describe("PHASE106A_COMPOSE_SERVICE", () => {
  const service = compose.slice(
    compose.indexOf("hermes-journal-import:"),
    compose.indexOf("\n  postgres:"),
  );

  it("is declared behind the journal-import profile", () => {
    expect(service).toMatch(/profiles:\s*\["journal-import"\]/);
  });

  it("builds the journal-importer target", () => {
    expect(service).toMatch(/target:\s*journal-importer/);
  });

  it("takes its database credentials from .env.production, not from Compose", () => {
    expect(service).toMatch(/env_file:\s*\.env\.production/);
    // No credential literal may appear in the service block.
    expect(service).not.toMatch(/DATABASE_URL\s*[:=]/);
    expect(service).not.toMatch(/POSTGRES_PASSWORD/);
  });

  it("publishes no ports and declares no restart policy", () => {
    expect(service).not.toMatch(/^\s+ports:/m);
    expect(service).not.toMatch(/^\s+restart:/m);
  });

  it("is attached only to the internal network", () => {
    expect(service).toMatch(/networks:\s*\n\s*- hermes_internal/);
  });

  it("does not become a dependency of any normal service", () => {
    // Every depends_on in the file must point at data services, never at the
    // importer — otherwise `up -d` would drag it in.
    expect(compose).not.toMatch(/depends_on:[\s\S]{0,200}hermes-journal-import/);
  });

  it("leaves postgres unpublished", () => {
    const pg = compose.slice(compose.indexOf("\n  postgres:"), compose.indexOf("\n  redis:"));
    expect(pg).not.toMatch(/^\s+ports:/m);
  });
});

// ── 5. The importer's own safety contract is intact ──────────────────────────

describe("PHASE106A_IMPORTER_SAFETY_UNCHANGED", () => {
  it("still writes only under an explicit --commit", () => {
    expect(importer).toMatch(/const COMMIT = process\.argv\.includes\("--commit"\)/);
  });

  it("still has no --force switch", () => {
    // The contract is that no --force is PARSED. The string also appears in a
    // console.error telling the operator that no such flag exists; that message
    // is the contract being communicated, not a switch.
    const code = codeOnly(importer);
    expect(code).not.toMatch(/argv[\s\S]{0,40}["']--force["']/);
    expect(code).not.toMatch(/FORCE\s*=/);
  });

  it("issues no destructive SQL and deletes no authored content", () => {
    const code = codeOnly(importer);
    for (const forbidden of [/\bTRUNCATE\b/i, /\bDROP\s+TABLE\b/i, /\$executeRaw/]) {
      expect(code, `importer must not contain ${forbidden}`).not.toMatch(forbidden);
    }
    // One deleteMany exists, and its scope is the whole point: it reconciles the
    // declarative tag JOIN rows for a single article, inside that article's own
    // transaction. A join row carries no authored data. Anything wider — an
    // Article delete, or a deleteMany with no article scope — would be a
    // content deletion, which this importer must never perform.
    const deletes = [...code.matchAll(/(\w+)\.deleteMany\(\{([\s\S]*?)\}\)/g)];
    expect(deletes).toHaveLength(1);
    expect(deletes[0][1]).toBe("articleTagOnArticle");
    expect(deletes[0][2]).toMatch(/articleId:/);
    expect(code).not.toMatch(/\barticle\.deleteMany\b/);
    expect(code).not.toMatch(/\barticle\.delete\b/);
  });

  it("is the SAME importer the Dockerized path invokes — not a second implementation", () => {
    const scriptFiles = readdirSync(join(REPO, "scripts", "journal")).filter((f) =>
      f.endsWith(".mjs"),
    );
    expect(scriptFiles).toContain("import-articles.mjs");
    // Exactly one importer entry point exists.
    expect(scriptFiles.filter((f) => /import/.test(f))).toEqual(["import-articles.mjs"]);
    // Both the compose CMD and the workflow reference that one file.
    expect(dockerfile).toContain("scripts/journal/import-articles.mjs");
    expect(importWorkflow).toContain("scripts/journal/import-articles.mjs");
  });
});

// ── 6. No automatic import, anywhere ─────────────────────────────────────────

describe("PHASE106A_NO_AUTOMATIC_IMPORT", () => {
  it("the deploy workflow never imports content", () => {
    expect(deployWorkflow).not.toMatch(/journal-import/);
    expect(deployWorkflow).not.toMatch(/import-articles/);
  });

  it("the web image start command is unchanged", () => {
    const runner = stageBody("runner");
    expect(runner).toMatch(/^CMD \["node", "server\.js"\]$/m);
  });

  it("the migrator start command is unchanged", () => {
    const migrator = stageBody("migrator");
    expect(migrator).toMatch(/migrate", "deploy"\]/);
    expect(migrator).not.toMatch(/import-articles/);
  });

  it("nothing imports during image build", () => {
    expect(dockerfile).not.toMatch(/^RUN .*import-articles/m);
  });

  it("no healthcheck triggers an import", () => {
    expect(compose).not.toMatch(/healthcheck:[\s\S]{0,300}import-articles/);
  });
});

// ── 7. The import workflow is fail-closed ────────────────────────────────────

describe("PHASE106A_IMPORT_WORKFLOW", () => {
  it("is dispatch-only and runs in the protected production environment", () => {
    expect(importWorkflow).toMatch(/^on:\n\s+workflow_dispatch:/m);
    expect(importWorkflow).not.toMatch(/^\s{2}(push|schedule|workflow_run):/m);
    expect(importWorkflow).toMatch(/^\s+environment:\s*production$/m);
  });

  it("requires the exact typed confirmation phrase for a real import", () => {
    expect(importWorkflow).toMatch(/"\$CONFIRMATION"\s*=\s*"import-phase106-journal"/);
    // A boolean would be laxer: "false"/"0"/"no" can read as truthy in shell.
    expect(importWorkflow).not.toMatch(/type:\s*boolean/);
  });

  it("treats a wrong confirmation as a refusal, not as a dry run", () => {
    expect(importWorkflow).toMatch(/does not match/);
    expect(importWorkflow).toMatch(/exit 1/);
  });

  it("runs the dry run unconditionally, before the write", () => {
    const dryAt = importWorkflow.indexOf("DRY RUN (always, must pass)");
    const realAt = importWorkflow.indexOf("REAL IMPORT (confirmation required)");
    expect(dryAt).toBeGreaterThan(-1);
    expect(realAt).toBeGreaterThan(dryAt);
    // The dry-run step carries no `if:` guard.
    const dryStep = importWorkflow.slice(dryAt, realAt);
    expect(dryStep).not.toMatch(/^\s+if:/m);
  });

  it("guards the write step on the confirmation classification", () => {
    const realAt = importWorkflow.indexOf("REAL IMPORT (confirmation required)");
    const step = importWorkflow.slice(realAt, realAt + 400);
    expect(step).toMatch(/if:\s*steps\.mode\.outputs\.real_import == 'true'/);
  });

  it("uses --commit exactly once, on an executable line", () => {
    const hits = executable(importWorkflow).filter((l) => /--commit(?=\s|$)/.test(l));
    expect(hits).toHaveLength(1);
  });

  it("pins every Compose invocation to the hermes project", () => {
    const invocations = executable(importWorkflow).filter((l) => /docker compose/.test(l));
    expect(invocations.length).toBeGreaterThan(0);
    for (const line of invocations) {
      expect(line, `unpinned: ${line}`).toMatch(/-p hermes(?=\s)/);
      expect(line, `no prod file: ${line}`).toMatch(/-f docker-compose\.prod\.yml(?=\s)/);
      expect(line, `no env file: ${line}`).toMatch(/--env-file \.env\.production(?=\s)/);
    }
  });

  it("never starts, recreates or replaces a running service", () => {
    const invocations = executable(importWorkflow).filter((l) => /docker compose/.test(l));
    for (const line of invocations) {
      expect(line, `must not cut over: ${line}`).not.toMatch(/\bup\b\s+-d/);
    }
    expect(importWorkflow).not.toMatch(/hermes-web/);
  });

  it("keeps secrets out of the log and pins the host key", () => {
    const code = executable(importWorkflow).join("\n");
    expect(code).toMatch(/StrictHostKeyChecking=yes/);
    expect(code).not.toMatch(/StrictHostKeyChecking[= ](no|accept-new|ask)/);
    // Prose may say ssh-keyscan is forbidden; no executable line may call it.
    expect(code).not.toMatch(/ssh-keyscan/);
    // No `echo`/`cat` of a secret expression.
    expect(code).not.toMatch(/(echo|cat|printf)[^\n]*\$\{\{\s*secrets\./);
  });

  it("holds a read-only token", () => {
    expect(importWorkflow).toMatch(/^permissions:\n\s{2}contents:\s*read$/m);
  });

  it("verifies the outcome with read-only SQL only", () => {
    const sqlLines = executable(importWorkflow).filter((l) => /SELECT/i.test(l));
    expect(sqlLines.length).toBeGreaterThan(0);
    for (const line of sqlLines) {
      expect(line).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)\b/i);
    }
  });
});

// ── 8. The runbook documents the real commands ───────────────────────────────

describe("PHASE106A_RUNBOOK", () => {
  const path = "docs/phase106/production-import-runbook.md";

  it("exists", () => {
    expect(existsSync(join(REPO, path))).toBe(true);
  });

  it("documents both modes with project-pinned commands", () => {
    const doc = read(path);
    const commands = doc.split("\n").filter((l) => /^docker compose/.test(l.trim()));
    expect(commands.length).toBeGreaterThanOrEqual(3);
    for (const line of commands) {
      expect(line, `unpinned: ${line}`).toMatch(/-p hermes(?=\s)/);
    }
    expect(doc).toMatch(/--commit/);
    expect(doc).toMatch(/Created:\s+150/);
    expect(doc).toMatch(/Unchanged: 150/);
  });

  it("states the stop conditions and the rollback posture", () => {
    const doc = read(path);
    expect(doc).toMatch(/Stop conditions/i);
    expect(doc).toMatch(/Rollback posture/i);
    // The runbook must NOT hand an operator a delete-everything command. Its
    // prose says no such command is provided — that sentence is the point, so
    // only the RUNNABLE lines are checked.
    const runnable = fencedLines(doc).join("\n");
    expect(runnable).not.toMatch(/DELETE\s+FROM/i);
    expect(runnable).not.toMatch(/TRUNCATE/i);
    expect(runnable).not.toMatch(/DROP\s+TABLE/i);
  });
});
