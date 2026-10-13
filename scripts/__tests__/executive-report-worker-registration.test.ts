/**
 * Executive Management Center — the nightly report runner is SHIPPED and
 * RUNNABLE, and a sweep reaches every organization.
 *
 * Same four links as `ats-review-worker-registration.test.ts`, the model for
 * this file, because the failure is the same shape: `.dockerignore` excludes
 * `scripts/` wholesale, so a runner with no stage, no re-include and no compose
 * service is source that never runs.
 *   1. a compose service runs the runner;
 *   2. `.dockerignore` admits the runner — and only the runner;
 *   3. a dedicated Dockerfile stage copies it, and the runner stage still does not;
 *   4. the script really runs: it is EXECUTED here against a stub endpoint,
 *      including the cursor chain that makes a sweep complete.
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
const RUNNER = "scripts/executive/daily-report-worker.mjs";
const script = read(RUNNER);

/** The service block, bounded by the NEXT section header so no other service leaks in. */
function service(): string {
  const start = compose.indexOf("  hermes-executive-report-worker:");
  expect(start, "hermes-executive-report-worker service must exist").toBeGreaterThan(-1);
  const end = compose.indexOf("\n  # ── F-2 FU-F2-R4-1", start);
  expect(end, "the service must sit before the document-cleanup section").toBeGreaterThan(start);
  return compose.slice(start, end);
}

/** One Dockerfile stage's instructions, FROM to the next FROM, comments removed. */
function stage(name: string): string {
  const start = dockerfile.search(new RegExp(`^FROM \\S+ AS ${name}\\s*$`, "m"));
  expect(start, `stage ${name} must exist`).toBeGreaterThan(-1);
  const rest = dockerfile.slice(start + 1);
  const next = rest.search(/^FROM /m);
  return dockerfile
    .slice(start, next === -1 ? undefined : start + 1 + next)
    .split("\n")
    .filter(l => !l.trim().startsWith("#"))
    .join("\n");
}

describe("1 · a compose service runs the runner", () => {
  it("runs exactly the runner script, from its dedicated stage", () => {
    const svc = service();
    expect(svc).toContain(`command: ["node", "${RUNNER}"]`);
    expect(svc).toMatch(/target:\s*executive-report-worker/);
  });

  it("restarts on its own, waits for a HEALTHY web tier, and is not profile-gated", () => {
    const svc = service();
    expect(svc).toMatch(/restart:\s*unless-stopped/);
    expect(svc).toMatch(/depends_on:\s*\n\s+hermes-web:\s*\n\s+condition:\s*service_healthy/);
    expect(svc).not.toMatch(/profiles:/);
  });

  it("talks to hermes-web over the internal network, exposes nothing, holds no database credential", () => {
    const svc = service();
    expect(svc).toContain("HERMES_WORKER_BASE_URL: http://hermes-web:3000");
    expect(svc).toMatch(/networks:\s*\n\s+- hermes_internal/);
    expect(svc).not.toMatch(/^\s+ports:/m);
    expect(svc).not.toMatch(/^\s+volumes:/m);
    expect(svc).not.toMatch(/DATABASE_URL\s*[:=]/);
    expect(svc).not.toMatch(/POSTGRES_(PASSWORD|USER|DB)/);
  });

  it("uses the platform's log rotation convention", () => {
    const svc = service();
    expect(svc).toMatch(/driver:\s*"json-file"/);
    expect(svc).toMatch(/max-size:\s*"20m"/);
    expect(svc).toMatch(/max-file:\s*"5"/);
  });
});

describe("2 · .dockerignore admits the runner — and only the runner", () => {
  const lines = dockerignore.split("\n").map(l => l.trim());
  const idx = (needle: string) => lines.indexOf(needle);

  it("re-includes exactly ONE file, never the directory, after scripts/ and before the test rules", () => {
    expect(idx(`!${RUNNER}`)).toBeGreaterThan(idx("scripts/"));
    expect(lines).not.toContain("!scripts/executive");
    expect(lines).not.toContain("!scripts/executive/");
    expect(idx("**/__tests__/")).toBeGreaterThan(idx(`!${RUNNER}`));
    expect(idx("**/*.test.ts")).toBeGreaterThan(idx(`!${RUNNER}`));
  });
});

describe("3 · a dedicated image stage copies it; the runner stage still copies no scripts", () => {
  it("copies exactly one file and nothing that reaches the database", () => {
    const s = stage("executive-report-worker");
    expect(s.split("\n").filter(l => /^COPY /.test(l))).toEqual([`COPY ${RUNNER} ./${RUNNER}`]);
    expect(s).not.toContain("node_modules");
    expect(s).not.toMatch(/prisma/i);
    expect(s).toMatch(/^USER worker$/m);
    expect(s).toContain(`CMD ["node", "${RUNNER}"]`);
  });

  it("does not sit between the metering stage and the runner, which stays last", () => {
    const stages = [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gm)].map(m => m[1]);
    expect(stages[stages.length - 1]).toBe("runner");
    expect(stages.indexOf("executive-report-worker")).toBeLessThan(stages.indexOf("metering-worker"));
    expect(stage("runner")).not.toMatch(/^COPY .*\bscripts\b/m);
  });

  it("npm exposes the runner, including a one-shot sweep", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["executive:report:worker"]).toContain(RUNNER);
    expect(pkg.scripts["executive:report:worker:once"]).toContain("--once");
  });

  it("the runner imports nothing and never touches the database", () => {
    expect(script).not.toMatch(/\bimport\b[^;]*from\s+["'](?!node:)/);
    expect(script).not.toContain("PrismaClient");
    expect(script).not.toContain("DATABASE_URL");
  });
});

/* ── 4 · the runner, executed against a stub of the run endpoint ───────────── */
interface Seen { url?: string; auth?: string }

async function withStub(
  respond: (req: IncomingMessage, res: ServerResponse, n: number) => void,
  fn: (base: string, seen: Seen[]) => Promise<void>,
): Promise<void> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization });
    respond(req, res, seen.length);
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`, seen);
  } finally {
    await new Promise<void>(r => server.close(() => r()));
  }
}

function runOnce(env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // A MINIMAL environment: the runner must need nothing but what is passed.
    const childEnv: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PATH: process.env.PATH ?? "",
      SYSTEMROOT: process.env.SYSTEMROOT ?? "",
      ...env,
    };
    const child = spawn(process.execPath, [join(REPO, RUNNER), "--once"], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => (stdout += String(d)));
    child.stderr.on("data", d => (stderr += String(d)));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("runner did not exit"));
    }, 20_000);
    child.on("exit", code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const pass = (over: Record<string, unknown>) => ({
  leaseHeld: true,
  considered: 2,
  created: 2,
  alreadyReported: 0,
  skippedNotFinished: 0,
  failed: 0,
  notified: 2,
  failures: [],
  undelivered: [],
  afterOrganizationId: null,
  nextAfterOrganizationId: null,
  leaseLost: false,
  ...over,
});

describe("4 · the runner, executed", () => {
  it("chains passes with the server's cursor until it runs out, then exits 0", async () => {
    await withStub(
      (_req, res, n) =>
        json(
          res,
          200,
          n === 1
            ? pass({ nextAfterOrganizationId: "org-b" })
            : n === 2
              ? pass({ afterOrganizationId: "org-b", nextAfterOrganizationId: "org-d" })
              : pass({ afterOrganizationId: "org-d", considered: 1 }),
        ),
      async (base, seen) => {
        const r = await runOnce({
          HERMES_WORKER_BASE_URL: base,
          EXECUTIVE_REPORT_WORKER_TOKEN: "t0k3n-for-test",
          EXECUTIVE_REPORT_BATCH: "2",
        });
        expect(r.code).toBe(0);
        expect(seen.map(s => s.url)).toEqual([
          "/api/executive/reports/run?max=2",
          "/api/executive/reports/run?max=2&after=org-b",
          "/api/executive/reports/run?max=2&after=org-d",
        ]);
        expect(seen.every(s => s.auth === "Bearer t0k3n-for-test")).toBe(true);
        expect(r.stdout + r.stderr).not.toContain("t0k3n-for-test");
        // A clean exit, without the libuv assertion process.exit() used to trip.
        expect(r.stderr).not.toMatch(/Assertion failed/);
      },
    );
  }, 30_000);

  it("ends the sweep when another replica holds the lease", async () => {
    await withStub(
      (_req, res) => json(res, 200, pass({ leaseHeld: false, considered: 0, nextAfterOrganizationId: null })),
      async (base, seen) => {
        const r = await runOnce({ HERMES_WORKER_BASE_URL: base, EXECUTIVE_REPORT_WORKER_TOKEN: "t" });
        expect(r.code).toBe(0);
        expect(seen).toHaveLength(1);
      },
    );
  }, 30_000);

  it("stops rather than loop when a cursor does not advance", async () => {
    await withStub(
      (_req, res) => json(res, 200, pass({ nextAfterOrganizationId: "org-x" })),
      async (base, seen) => {
        const r = await runOnce({ HERMES_WORKER_BASE_URL: base, EXECUTIVE_REPORT_WORKER_TOKEN: "t" });
        expect(r.code).toBe(0);
        expect(seen).toHaveLength(2);
        expect(r.stdout).toContain("cursor did not advance");
      },
    );
  }, 30_000);

  it("logs a report that reached nobody as a warning, never silently", async () => {
    await withStub(
      (_req, res) =>
        json(res, 200, pass({ notified: 0, undelivered: [{ organizationId: "org-a", businessDate: "2026-10-12", reason: "NO_RECIPIENT" }] })),
      async base => {
        const r = await runOnce({ HERMES_WORKER_BASE_URL: base, EXECUTIVE_REPORT_WORKER_TOKEN: "t" });
        const warning = r.stdout.split("\n").find(l => l.includes("report not announced"));
        expect(warning).toBeDefined();
        expect(JSON.parse(warning!)).toMatchObject({ level: "WARN", organizationId: "org-a", reason: "NO_RECIPIENT" });
      },
    );
  }, 30_000);

  it("without any token it exits 2 at startup and makes NO request", async () => {
    await withStub(
      (_req, res) => json(res, 200, pass({})),
      async (base, seen) => {
        const r = await runOnce({ HERMES_WORKER_BASE_URL: base });
        expect(r.code).toBe(2);
        expect(seen).toHaveLength(0);
        expect(r.stderr).toContain("EXECUTIVE_REPORT_WORKER_TOKEN is not set");
      },
    );
  }, 30_000);

  it("a refused credential is fatal for a one-shot run", async () => {
    await withStub(
      (_req, res) => json(res, 401, { error: "AUTHENTICATION_REQUIRED" }),
      async base => {
        const r = await runOnce({ HERMES_WORKER_BASE_URL: base, EXECUTIVE_REPORT_WORKER_TOKEN: "wrong" });
        expect(r.code).toBe(1);
      },
    );
  }, 30_000);
});
