/**
 * ATS-S1 — the AI-review worker is actually SHIPPED and RUNNABLE.
 *
 * THE DEFECT THIS LOCKS
 * ---------------------
 * The production preflight after PR #103 found that the review worker existed
 * only as source. `.dockerignore` excludes `scripts/` wholesale, so
 * `scripts/ats/ai-review-worker.mjs` was in no image, and `docker-compose.prod.yml`
 * had no service to run it. Every application would have waited at
 * AI_REVIEW_PENDING forever — safe, visible, and useless. It is the same shape
 * as Phase 109-C-UI.2-R7 (a worker called by nothing) and Phase 106A (an
 * importer in no image), and it is closed the same way:
 * `phase109cui2r8-worker-registration.test.ts` is the model for this file.
 *
 * Four links turn working code into running code, and each is asserted:
 *   1. a compose service runs the runner;
 *   2. `.dockerignore` admits the runner — and only the runner — into the context;
 *   3. a dedicated Dockerfile stage copies it, and the runner stage still does not;
 *   4. the script really runs: it is EXECUTED here against a stub endpoint.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

const REPO = process.cwd();
const read = (p: string) => readFileSync(join(REPO, p), "utf8").replace(/\r\n/g, "\n");

const compose = read("docker-compose.prod.yml");
const dockerignore = read(".dockerignore");
const dockerfile = read("Dockerfile");
const RUNNER = "scripts/ats/ai-review-worker.mjs";
const script = read(RUNNER);

/** The service block, bounded by the NEXT section header so no other service leaks in. */
function atsService(): string {
  const start = compose.indexOf("  hermes-ats-review-worker:");
  expect(start, "hermes-ats-review-worker service must exist").toBeGreaterThan(-1);
  const end = compose.indexOf("\n  # ── PHASE 109-C-UI.2-R8", start);
  expect(end, "the service must sit before the metering worker section").toBeGreaterThan(start);
  return compose.slice(start, end);
}

/**
 * One Dockerfile stage's INSTRUCTIONS, from its FROM line to the next FROM,
 * with comment lines removed. The next stage's explanatory comment block sits
 * above its FROM — i.e. inside this slice — and a comment that says "no
 * node_modules" is not an instruction that copies them.
 */
function stage(name: string): string {
  const start = dockerfile.search(new RegExp(`^FROM \\S+ AS ${name}\\s*$`, "m"));
  expect(start, `stage ${name} must exist`).toBeGreaterThan(-1);
  const rest = dockerfile.slice(start + 1);
  const next = rest.search(/^FROM /m);
  return dockerfile
    .slice(start, next === -1 ? undefined : start + 1 + next)
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
}

describe("1 · a compose service runs the worker", () => {
  it("runs exactly the runner script as its command", () => {
    const svc = atsService();
    expect(svc).toContain(`command: ["node", "${RUNNER}"]`);
  });

  it("builds the dedicated stage, not the web image", () => {
    expect(atsService()).toMatch(/target:\s*ats-review-worker/);
  });

  it("restarts on its own, waits for a HEALTHY web tier, and is not profile-gated", () => {
    const svc = atsService();
    expect(svc).toMatch(/restart:\s*unless-stopped/);
    expect(svc).toMatch(/depends_on:\s*\n\s+hermes-web:\s*\n\s+condition:\s*service_healthy/);
    // A worker behind a profile is a worker nobody starts — the R7 state again.
    expect(svc).not.toMatch(/profiles:/);
  });

  it("talks to hermes-web over the internal network and exposes nothing", () => {
    const svc = atsService();
    expect(svc).toContain("HERMES_WORKER_BASE_URL: http://hermes-web:3000");
    expect(svc).toMatch(/networks:\s*\n\s+- hermes_internal/);
    expect(svc).not.toMatch(/^\s+ports:/m);
    expect(svc).not.toMatch(/^\s+volumes:/m);
  });

  it("carries no database credential of its own", () => {
    const svc = atsService();
    expect(svc).not.toMatch(/DATABASE_URL\s*[:=]/);
    expect(svc).not.toMatch(/POSTGRES_(PASSWORD|USER|DB)/);
    expect(svc).not.toMatch(/REDIS_URL\s*[:=]/);
  });

  it("uses the platform's log rotation convention", () => {
    const svc = atsService();
    expect(svc).toMatch(/driver:\s*"json-file"/);
    expect(svc).toMatch(/max-size:\s*"20m"/);
    expect(svc).toMatch(/max-file:\s*"5"/);
  });

  it("did not disturb the metering worker's section", () => {
    const m = compose.slice(compose.indexOf("hermes-metering-worker:"));
    expect(m.slice(0, m.indexOf("\n  # Phase 99.7"))).not.toContain("hermes-ats-review-worker");
  });
});

describe("2 · .dockerignore admits the runner — and only the runner", () => {
  const lines = dockerignore.split("\n").map((l) => l.trim());
  const idx = (needle: string) => lines.indexOf(needle);

  it("re-includes exactly ONE file, never the directory", () => {
    expect(idx(`!${RUNNER}`)).toBeGreaterThan(-1);
    expect(lines).not.toContain("!scripts/ats");
    expect(lines).not.toContain("!scripts/ats/");
    // the blanket exclusion survives
    expect(lines).not.toContain("!scripts/");
    expect(lines).not.toContain("!scripts");
  });

  it("is ordered after scripts/ (to take effect) and before the test rules (so tests stay out)", () => {
    expect(idx(`!${RUNNER}`)).toBeGreaterThan(idx("scripts/"));
    expect(idx("**/__tests__/")).toBeGreaterThan(idx(`!${RUNNER}`));
    expect(idx("**/*.test.ts")).toBeGreaterThan(idx(`!${RUNNER}`));
  });
});

describe("3 · a dedicated image stage copies it; the runner stage still copies no scripts", () => {
  it("the ats-review-worker stage copies exactly one file and nothing that reaches the database", () => {
    const s = stage("ats-review-worker");
    const copies = s.split("\n").filter((l) => /^COPY /.test(l));
    expect(copies).toEqual([`COPY ${RUNNER} ./${RUNNER}`]);
    expect(s).not.toContain("node_modules");
    expect(s).not.toMatch(/prisma/i);
    expect(s).not.toContain(".next");
    expect(s).toMatch(/^USER worker$/m);
    expect(s).toContain(`CMD ["node", "${RUNNER}"]`);
  });

  it("runner is still the LAST stage and still copies no scripts", () => {
    const stages = [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gm)].map((m) => m[1]);
    expect(stages[stages.length - 1]).toBe("runner");
    expect(stages).toContain("ats-review-worker");
    expect(stage("runner")).not.toMatch(/^COPY .*\bscripts\b/m);
    expect(stage("migrator")).not.toMatch(/^COPY .*\bscripts\b/m);
  });

  it("npm exposes the worker, including a one-shot mode for a cron", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["ats:review:worker"]).toContain(RUNNER);
    expect(pkg.scripts["ats:review:worker:once"]).toContain("--once");
  });
});

describe("4 · the runner refuses to run blind, and opens nothing of its own", () => {
  it("static: token refusal, bounded backoff with jitter, graceful shutdown, no database", () => {
    expect(script).toMatch(/if \(!TOKEN\)/);
    expect(script).toMatch(/process\.exit\(2\)/);
    expect(script).toMatch(/2 \*\* Math\.min/);
    expect(script).toMatch(/Math\.random\(\)/);
    expect(script).toContain("SIGTERM");
    expect(script).toContain("SIGINT");
    expect(script).toMatch(/stopping = true/);
    expect(script).not.toContain("PrismaClient");
    expect(script).not.toContain("DATABASE_URL");
    expect(script).not.toMatch(/\bimport\b[^;]*from\s+["'](?!node:)/);
  });
});

/* ── 5 · the runner really RUNS ─────────────────────────────────────────────
 * The script is executed with the same node that runs this suite, against a
 * local stub of POST /api/ats/review/deliver. Nothing here touches a database,
 * and the stub never sees anything but the worker's own request.
 */
interface Seen { method?: string; url?: string; auth?: string }

async function withStub(
  respond: (req: IncomingMessage, res: ServerResponse) => void,
  fn: (base: string, seen: Seen[]) => Promise<void>,
): Promise<void> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    respond(req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`, seen);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

function runOnce(env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // A MINIMAL environment: the worker must need nothing but what is passed.
    // NODE_ENV is set because the repository's ProcessEnv type requires it.
    const childEnv: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PATH: process.env.PATH ?? "",
      SYSTEMROOT: process.env.SYSTEMROOT ?? "",
      ...env,
    };
    const child = spawn(process.execPath, [join(REPO, RUNNER), "--once"], {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("runner did not exit"));
    }, 20_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

describe("5 · the runner, executed", () => {
  it("POSTs the deliver endpoint once with the bearer token, logs COUNTS only, exits 0", async () => {
    await withStub(
      (_req, res) => json(res, 200, { acquired: true, claimed: 1, delivered: 1, retrying: 0, deadLettered: 0, skipped: 0, storeUnavailable: false }),
      async (base, seen) => {
        const r = await runOnce({ HERMES_WORKER_BASE_URL: base, ATS_REVIEW_WORKER_TOKEN: "t0k3n-for-test", ATS_REVIEW_WORKER_BATCH: "7" });
        expect(r.code).toBe(0);
        expect(seen).toEqual([{ method: "POST", url: "/api/ats/review/deliver?limit=7", auth: "Bearer t0k3n-for-test" }]);
        expect(r.stdout.trim()).toBe("[ats-review-worker] claimed=1 delivered=1 retrying=0 deadLettered=0 skipped=0");
        // the token itself never reaches a log line
        expect(r.stdout + r.stderr).not.toContain("t0k3n-for-test");
      },
    );
  }, 30_000);

  it("reports a lease held by another replica as such, not as a failure", async () => {
    await withStub(
      (_req, res) => json(res, 200, { acquired: false, claimed: 0, delivered: 0, retrying: 0, deadLettered: 0, skipped: 0, storeUnavailable: false }),
      async (base) => {
        const r = await runOnce({ HERMES_WORKER_BASE_URL: base, ATS_REVIEW_WORKER_TOKEN: "t" });
        expect(r.code).toBe(0);
        expect(r.stdout.trim()).toBe("[ats-review-worker] another replica holds the lease");
      },
    );
  }, 30_000);

  it("without a token it exits 2 at startup and makes NO request", async () => {
    await withStub(
      (_req, res) => json(res, 200, {}),
      async (base, seen) => {
        const r = await runOnce({ HERMES_WORKER_BASE_URL: base });
        expect(r.code).toBe(2);
        expect(seen).toHaveLength(0);
        expect(r.stderr).toContain("ATS_REVIEW_WORKER_TOKEN is not set");
      },
    );
  }, 30_000);

  it("an error answer is logged BOUNDED, and a one-shot run exits non-zero", async () => {
    const huge = `<html>${"personal@example.org ".repeat(500)}</html>`;
    await withStub(
      (_req, res) => {
        res.writeHead(502, { "content-type": "text/html" });
        res.end(huge);
      },
      async (base) => {
        const r = await runOnce({ HERMES_WORKER_BASE_URL: base, ATS_REVIEW_WORKER_TOKEN: "t" });
        expect(r.code).toBe(1);
        const line = r.stderr.trim();
        expect(line.startsWith("[ats-review-worker] HTTP 502: ")).toBe(true);
        // prefix + at most 200 characters of whatever answered
        expect(line.length).toBeLessThanOrEqual("[ats-review-worker] HTTP 502: ".length + 200);
        expect(r.stdout).toBe("");
      },
    );
  }, 30_000);
});
