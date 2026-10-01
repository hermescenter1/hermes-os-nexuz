import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * F-2 FU-F2-R4-1 — the document storage-cleanup worker is SCHEDULED, not just
 * reachable.
 *
 * Same contract as the ATS review worker and the metering worker
 * (scripts/__tests__/ats-review-worker-registration.test.ts,
 * phase109cui2r8-worker-registration.test.ts): a compose service runs a thin
 * trigger from its own tiny image stage; the endpoint is guarded by a DEDICATED
 * worker token. Parts 5–6 execute the real runner against a local stub — no
 * database, no network beyond 127.0.0.1.
 */

const REPO = process.cwd();
const read = (p: string) => readFileSync(join(REPO, p), "utf8").replace(/\r\n/g, "\n");

const compose = read("docker-compose.prod.yml");
const dockerignore = read(".dockerignore");
const dockerfile = read("Dockerfile");
const RUNNER = "scripts/documents/storage-cleanup-worker.mjs";
const SERVICE = "hermes-document-cleanup-worker";
const STAGE = "document-cleanup-worker";
const script = read(RUNNER);

function service(): string {
  const start = compose.indexOf(`  ${SERVICE}:`);
  expect(start, `${SERVICE} service must exist`).toBeGreaterThan(-1);
  const end = compose.indexOf("\n  # ── ATS-S1", start);
  expect(end, "the service must sit before the ATS worker section").toBeGreaterThan(start);
  return compose.slice(start, end);
}

function stage(name: string): string {
  const start = dockerfile.search(new RegExp(`^FROM \\S+ AS ${name}\\s*$`, "m"));
  expect(start, `stage ${name} must exist`).toBeGreaterThan(-1);
  const rest = dockerfile.slice(start + 1);
  const next = rest.search(/^FROM /m);
  return dockerfile.slice(start, next === -1 ? undefined : start + 1 + next);
}

describe("1 · a compose service runs the worker", () => {
  it("runs exactly the runner script, from the dedicated stage", () => {
    const svc = service();
    expect(svc).toContain(`command: ["node", "${RUNNER}"]`);
    expect(svc).toMatch(new RegExp(`target:\\s*${STAGE}`));
  });

  it("restarts on its own, waits for a HEALTHY web tier, and is not profile-gated", () => {
    const svc = service();
    expect(svc).toMatch(/restart:\s*unless-stopped/);
    expect(svc).toMatch(/depends_on:\s*\n\s+hermes-web:\s*\n\s+condition:\s*service_healthy/);
    expect(svc).not.toMatch(/profiles:/);
  });

  it("talks to hermes-web over the internal network and exposes and mounts nothing", () => {
    const svc = service();
    expect(svc).toContain("HERMES_WORKER_BASE_URL: http://hermes-web:3000");
    expect(svc).toMatch(/networks:\s*\n\s+- hermes_internal/);
    expect(svc).not.toMatch(/^\s+ports:/m);
    expect(svc).not.toMatch(/^\s+volumes:/m); // no object-storage mount: removal happens in the web tier
  });

  it("carries no database credential and documents its OWN token, not the metering one", () => {
    const svc = service();
    expect(svc).not.toMatch(/DATABASE_URL\s*[:=]/);
    expect(svc).not.toMatch(/POSTGRES_(PASSWORD|USER|DB)/);
    expect(svc).not.toMatch(/REDIS_URL\s*[:=]/);
    expect(svc).not.toMatch(/METERING_WORKER_TOKEN\s*[:=]|METRICS_TOKEN\s*[:=]/);
    // The operator-facing section comment (right above the service) names the secret to set.
    const sectionStart = compose.indexOf("# ── F-2 FU-F2-R4-1 — the document storage-cleanup worker");
    expect(sectionStart).toBeGreaterThan(-1);
    const section = compose.slice(sectionStart, compose.indexOf(`  ${SERVICE}:`));
    expect(section).toContain("`DOCUMENT_CLEANUP_WORKER_TOKEN` in .env.production");
  });

  it("uses the platform's log rotation convention", () => {
    const svc = service();
    expect(svc).toMatch(/driver:\s*"json-file"/);
    expect(svc).toMatch(/max-size:\s*"20m"/);
    expect(svc).toMatch(/max-file:\s*"5"/);
  });

  it("is in the Phase 99.7 candidate env_file override list", () => {
    const gate = read("scripts/ci/phase997-candidate-gate.mjs");
    const list = gate.slice(gate.indexOf("export const ENV_FILE_SERVICES"), gate.indexOf("]);", gate.indexOf("export const ENV_FILE_SERVICES")));
    expect(list).toContain(`"${SERVICE}"`);
  });
});

describe("2 · .dockerignore admits the runner — and only the runner", () => {
  const lines = dockerignore.split("\n").map((l) => l.trim());
  const idx = (needle: string) => lines.indexOf(needle);

  it("re-includes exactly ONE file, never the directory", () => {
    expect(idx(`!${RUNNER}`)).toBeGreaterThan(-1);
    expect(lines).not.toContain("!scripts/documents");
    expect(lines).not.toContain("!scripts/documents/");
    expect(lines).not.toContain("!scripts/");
  });

  it("is ordered after scripts/ (to take effect) and before the test rules (so tests stay out)", () => {
    expect(idx(`!${RUNNER}`)).toBeGreaterThan(idx("scripts/"));
    expect(idx("**/__tests__/")).toBeGreaterThan(idx(`!${RUNNER}`));
    expect(idx("**/*.test.ts")).toBeGreaterThan(idx(`!${RUNNER}`));
  });
});

describe("3 · a dedicated image stage copies it; runner and migrator still copy no scripts", () => {
  it(`the ${STAGE} stage copies exactly one file and nothing that reaches the database`, () => {
    const s = stage(STAGE);
    const copies = s.split("\n").filter((l) => /^COPY /.test(l));
    expect(copies).toEqual([`COPY ${RUNNER} ./${RUNNER}`]);
    expect(s).not.toContain("node_modules");
    expect(s).not.toMatch(/prisma/i);
    expect(s).not.toContain(".next");
    expect(s).toMatch(/^USER worker$/m);
    expect(s).toContain(`CMD ["node", "${RUNNER}"]`);
  });

  it("runner is still the LAST stage and still copies no scripts", () => {
    const stages = [...dockerfile.matchAll(/^FROM \S+ AS (\S+)\s*$/gm)].map((m) => m[1]);
    expect(stages[stages.length - 1]).toBe("runner");
    expect(stages).toContain(STAGE);
    expect(stage("runner")).not.toMatch(/^COPY .*\bscripts\b/m);
    expect(stage("migrator")).not.toMatch(/^COPY .*\bscripts\b/m);
  });

  it("npm exposes the worker, including a one-shot mode for a cron", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["documents:cleanup:worker"]).toContain(RUNNER);
    expect(pkg.scripts["documents:cleanup:worker:once"]).toContain("--once");
  });
});

describe("4 · the endpoint guard: registered, called first, and a DEDICATED token", () => {
  const guard = read("src/lib/documents/storage-cleanup-worker-auth.ts");
  const route = read("src/app/api/documents/storage-cleanup/route.ts");
  const registry = read("scripts/security/phase99/route-inventory.mjs");

  it("the Phase 99 registry declares it at PLATFORM scope", () => {
    expect(registry).toContain('{ token: "authorizeDocumentCleanupWorker", scope: "platform" }');
  });

  it("the route calls it before doing anything else", () => {
    const handler = route.slice(route.search(/export async function POST/));
    const authAt = handler.indexOf("authorizeDocumentCleanupWorker(req)");
    expect(authAt).toBeGreaterThan(-1);
    expect(handler.indexOf("runDocumentStorageCleanupPass")).toBeGreaterThan(authAt);
    expect(route).not.toContain("authorizeWorkerRequest"); // not the metering guard
  });

  it("compares in CONSTANT TIME against its own env-only secret, with no fallback", () => {
    const code = guard.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).toContain("timingSafeEqual");
    expect(code).toContain("process.env.DOCUMENT_CLEANUP_WORKER_TOKEN");
    expect(code).not.toMatch(/METERING_WORKER_TOKEN|METRICS_TOKEN|ATS_REVIEW_WORKER_TOKEN/);
    expect(code).toMatch(/if \(!expected\) return false/);
    expect(code).toMatch(/can\(user\.role, "admin"\)/);
  });
});

describe("5 · the runner refuses to run blind, and opens nothing of its own (static)", () => {
  it("token refusal, bounded backoff with jitter, graceful shutdown, no database, no dependencies", () => {
    expect(script).toMatch(/if \(!TOKEN\)/);
    expect(script).toMatch(/process\.exit\(2\)/);
    expect(script).toMatch(/2 \*\* Math\.min/);
    expect(script).toMatch(/Math\.random\(\)/);
    expect(script).toContain("SIGTERM");
    expect(script).toContain("SIGINT");
    expect(script).toMatch(/stopping = true/);
    expect(script).not.toContain("PrismaClient");
    expect(script).not.toContain("DATABASE_URL");
    expect(script).not.toMatch(/METERING_WORKER_TOKEN|METRICS_TOKEN/);
    expect(script).not.toMatch(/\bimport\b[^;]*from\s+["'](?!node:)/);
  });
});

/* ── 6 · the runner really RUNS ─────────────────────────────────────────── */
interface Seen {
  at: number;
  method?: string;
  url?: string;
  auth?: string;
}

async function withStub(
  respond: (req: IncomingMessage, res: ServerResponse) => void,
  fn: (base: string, seen: Seen[]) => Promise<void>
): Promise<void> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    seen.push({ at: Date.now(), method: req.method, url: req.url, auth: req.headers.authorization });
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

function start(env: Record<string, string>, extraArgs: string[]): { child: ChildProcess; done: Promise<{ code: number | null; stdout: string; stderr: string }> } {
  // A MINIMAL environment: the worker must need nothing but what is passed.
  const childEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: process.env.PATH ?? "",
    SYSTEMROOT: process.env.SYSTEMROOT ?? "",
    ...env,
  };
  const child = spawn(process.execPath, [join(REPO, RUNNER), ...extraArgs], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => (stdout += String(d)));
  child.stderr?.on("data", (d) => (stderr += String(d)));
  const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("runner did not exit"));
    }, 25_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
  return { child, done };
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TOKEN = "d0c-cl3anup-t0k3n-for-test";

describe("6 · the runner, executed", () => {
  it("--once: POSTs the endpoint once with ITS bearer token, logs COUNTS only, exits 0", async () => {
    await withStub(
      (_req, res) => json(res, 200, { claimed: 2, done: 1, retrying: 1 }),
      async (base, seen) => {
        const { done } = start({ HERMES_WORKER_BASE_URL: base, DOCUMENT_CLEANUP_WORKER_TOKEN: TOKEN, DOCUMENT_CLEANUP_WORKER_BATCH: "7" }, ["--once"]);
        const r = await done;
        expect(r.code).toBe(0);
        expect(seen.map(({ method, url, auth }) => ({ method, url, auth }))).toEqual([
          { method: "POST", url: "/api/documents/storage-cleanup?limit=7", auth: `Bearer ${TOKEN}` },
        ]);
        expect(r.stdout.trim()).toBe("[document-cleanup-worker] claimed=2 done=1 retrying=1");
        expect(r.stdout + r.stderr).not.toContain(TOKEN); // the token never reaches a log line
      }
    );
  }, 30_000);

  it("without its token it exits 2 at startup and makes NO request — the metering token is not accepted in its place", async () => {
    await withStub(
      (_req, res) => json(res, 200, {}),
      async (base, seen) => {
        const { done } = start({ HERMES_WORKER_BASE_URL: base, METERING_WORKER_TOKEN: "m", METRICS_TOKEN: "x" }, ["--once"]);
        const r = await done;
        expect(r.code).toBe(2);
        expect(seen).toHaveLength(0);
        expect(r.stderr).toContain("DOCUMENT_CLEANUP_WORKER_TOKEN is not set");
      }
    );
  }, 30_000);

  it("an error answer is logged BOUNDED, and a one-shot run exits non-zero", async () => {
    const huge = `<html>${"secret-ish body ".repeat(500)}</html>`;
    await withStub(
      (_req, res) => {
        res.writeHead(502, { "content-type": "text/html" });
        res.end(huge);
      },
      async (base) => {
        const r = await start({ HERMES_WORKER_BASE_URL: base, DOCUMENT_CLEANUP_WORKER_TOKEN: TOKEN }, ["--once"]).done;
        expect(r.code).toBe(1);
        const line = r.stderr.trim();
        expect(line.startsWith("[document-cleanup-worker] HTTP 502: ")).toBe(true);
        expect(line.length).toBeLessThanOrEqual("[document-cleanup-worker] HTTP 502: ".length + 200);
        expect(r.stdout).toBe("");
      }
    );
  }, 30_000);

  it("SCHEDULES: without --once it polls repeatedly at the interval, then stops cleanly on SIGTERM", async () => {
    await withStub(
      (_req, res) => json(res, 200, { claimed: 0, done: 0, retrying: 0 }),
      async (base, seen) => {
        const { child, done } = start({ HERMES_WORKER_BASE_URL: base, DOCUMENT_CLEANUP_WORKER_TOKEN: TOKEN }, ["--interval", "1000"]);
        for (let i = 0; i < 80 && seen.length < 3; i += 1) await sleep(100);
        expect(seen.length).toBeGreaterThanOrEqual(3);
        // Interval respected: ≥ 1 s apart (1 s + up to 1 s jitter), never a hot loop.
        for (let i = 1; i < seen.length; i += 1) expect(seen[i].at - seen[i - 1].at).toBeGreaterThanOrEqual(950);
        child.kill("SIGTERM");
        const r = await done;
        // Windows cannot deliver SIGTERM to a node child as a catchable signal; there
        // the kill is immediate. Where it IS catchable, the runner exits 0.
        if (process.platform !== "win32") expect(r.code).toBe(0);
        expect(r.stdout).toContain("claimed=0 done=0 retrying=0");
      }
    );
  }, 30_000);

  // Windows cannot deliver SIGTERM to a node child as a catchable signal, so this
  // runs where it can (CI, the container). `docker stop` sends SIGTERM and kills
  // after 10 s: a runner that sleeps through its back-off would always be killed.
  it.skipIf(process.platform === "win32")(
    "SIGTERM during a long wait ends the wait at once and exits 0 (no docker-stop SIGKILL)",
    async () => {
      await withStub(
        (_req, res) => json(res, 500, { error: "STORAGE_CLEANUP_PASS_FAILED" }),
        async (base, seen) => {
          const { child, done } = start({ HERMES_WORKER_BASE_URL: base, DOCUMENT_CLEANUP_WORKER_TOKEN: TOKEN }, ["--interval", "600000"]);
          for (let i = 0; i < 80 && seen.length < 1; i += 1) await sleep(100);
          expect(seen.length).toBe(1);
          await sleep(200);
          const t0 = Date.now();
          child.kill("SIGTERM");
          const r = await done;
          expect(r.code).toBe(0);
          expect(Date.now() - t0).toBeLessThan(3000);
          expect(seen.length).toBe(1);
        }
      );
    },
    30_000
  );

  it("BACKS OFF on failure: after an error the next poll waits longer than the interval", async () => {
    await withStub(
      (_req, res) => json(res, 500, { error: "STORAGE_CLEANUP_PASS_FAILED" }),
      async (base, seen) => {
        const { child, done } = start({ HERMES_WORKER_BASE_URL: base, DOCUMENT_CLEANUP_WORKER_TOKEN: TOKEN }, ["--interval", "1000"]);
        for (let i = 0; i < 80 && seen.length < 2; i += 1) await sleep(100);
        child.kill("SIGKILL");
        await done.catch(() => undefined);
        expect(seen.length).toBeGreaterThanOrEqual(2);
        // 1st failure → min(1000·2¹, 10·1000) = 2000 ms (+ jitter), not the 1000 ms interval.
        expect(seen[1].at - seen[0].at).toBeGreaterThanOrEqual(1950);
      }
    );
  }, 30_000);
});
