/**
 * PHASE 109-C-UI.2-R8 — the worker is actually REGISTERED to run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 * R7's single largest gap was not a bug in any function. It was that
 * `deliverPendingMeteringEvents()` existed, was proven correct against real
 * PostgreSQL, and was called by nothing — so metering events accumulated as
 * PENDING forever and no `UsageRecord` was ever written. Every behavioural test
 * in the world stays green in that state.
 *
 * So the registration itself needs a test. This one asserts the three links in
 * the chain that turn working code into running code:
 *
 *   1. a compose service exists and its command is the worker;
 *   2. `.dockerignore` admits the worker script into the build context;
 *   3. the runner stage copies it into the image.
 *
 * Break any one and the worker is dead code again, exactly as in R7. The R8
 * mutation matrix breaks link 1 and link 2 together (control M6).
 *
 * This mirrors `phase109cui2r8`'s sibling in spirit —
 * `scripts/__tests__/phase106a-journal-import-path.test.ts` — which was written
 * after Phase 106 shipped an importer that was in NO production image because
 * `.dockerignore` dropped `scripts/`. The same trap was waiting here.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const read = (p: string) => readFileSync(join(REPO, p), "utf8");

const compose = read("docker-compose.prod.yml");
const dockerignore = read(".dockerignore");
const dockerfile = read("Dockerfile");

const WORKER_SCRIPT = "scripts/industrial/metering-outbox-worker.mjs";

describe("R8 · the worker is scheduled, not merely written", () => {
  it("a compose service runs the worker script as its command", () => {
    expect(compose).toContain("hermes-metering-worker:");
    // The command is the assertion. A service that exists but runs the web
    // server would satisfy a name check and deliver nothing.
    expect(compose).toContain(`"node", "${WORKER_SCRIPT}"`);
  });

  it("the worker service restarts on its own and waits for the web tier", () => {
    const svc = compose.slice(compose.indexOf("hermes-metering-worker:"));
    const block = svc.slice(0, svc.indexOf("\n  # Phase 99.7"));
    expect(block).toMatch(/restart:\s*unless-stopped/);
    // It calls the app over HTTP, so starting before the app is up would just
    // burn its backoff budget on connection refusals.
    expect(block).toMatch(/depends_on:/);
    expect(block).toContain("hermes-web:");
    expect(block).toMatch(/condition:\s*service_healthy/);
  });

  it("the worker service is NOT profile-gated — it must run by default", () => {
    const svc = compose.slice(compose.indexOf("hermes-metering-worker:"));
    const block = svc.slice(0, svc.indexOf("\n  # Phase 99.7"));
    /*
      The migrator and the journal importer are profile-gated on purpose: they
      are one-shot operator actions. This one is the opposite — a worker behind a
      profile is a worker nobody starts, which is the R7 state with extra steps.
    */
    expect(block).not.toMatch(/profiles:/);
  });

  it(".dockerignore admits the worker script into the build context", () => {
    const lines = dockerignore.split("\n").map((l) => l.trim());
    const idx = (needle: string) => lines.indexOf(needle);

    expect(idx("!scripts/industrial")).toBeGreaterThan(-1);
    // Narrow: the blanket exclusion of scripts/ must survive.
    expect(lines).not.toContain("!scripts/");
    expect(lines).not.toContain("!scripts");
    // Ordering, twice over — Docker's LAST matching pattern wins.
    expect(idx("!scripts/industrial")).toBeGreaterThan(idx("scripts/"));
    expect(idx("**/__tests__/")).toBeGreaterThan(idx("!scripts/industrial"));
    expect(idx("**/*.test.ts")).toBeGreaterThan(idx("!scripts/industrial"));
  });

  it("a DEDICATED image stage copies the worker script, and the runner does not", () => {
    /*
      The first version put the COPY in the runner stage, and
      phase106a-journal-import-path.test.ts caught it: that stage is asserted to
      copy NO scripts, a contract written after Phase 106 shipped an importer
      that could reach production content. Rather than weaken the contract, the
      worker got its own stage — smaller, with no node_modules and no database
      credential.
    */
    const worker = dockerfile.slice(dockerfile.indexOf("AS metering-worker"));
    const workerStage = worker.slice(0, worker.indexOf("AS runner"));
    expect(workerStage).toContain("COPY scripts/industrial");
    expect(workerStage).toContain("metering-outbox-worker.mjs");
    // No application code, no node_modules, nothing that could reach the DB.
    expect(workerStage).not.toContain("node_modules");
    expect(workerStage).not.toContain("prisma");

    const runner = dockerfile.slice(dockerfile.indexOf("AS runner"));
    expect(runner).not.toMatch(/^COPY .*scripts/m);
  });

  it("the compose service builds that stage, not the web image", () => {
    const svc = compose.slice(compose.indexOf("hermes-metering-worker:"));
    const block = svc.slice(0, svc.indexOf("# Phase 99.7"));
    expect(block).toMatch(/target:\s*metering-worker/);
  });

  it("npm exposes the worker, including a one-shot mode for a cron", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["metering:worker"]).toContain(WORKER_SCRIPT);
    expect(pkg.scripts["metering:worker:once"]).toContain("--once");
  });
});

describe("R8 · the runner refuses to run blind", () => {
  const script = read(WORKER_SCRIPT);

  it("it exits rather than polling forever without a token", () => {
    // The worker entrypoint never falls open, so a tokenless worker would log a
    // 401 every interval and look alive while delivering nothing.
    expect(script).toContain("METERING_WORKER_TOKEN");
    expect(script).toMatch(/if \(!TOKEN\)/);
    expect(script).toMatch(/process\.exit\(2\)/);
  });

  it("it backs off exponentially and caps the wait", () => {
    expect(script).toMatch(/2 \*\* Math\.min/);
    expect(script).toContain("MAX_BACKOFF_MS");
    // Full jitter: replicas that all lost the web tier must not return together.
    expect(script).toMatch(/Math\.random\(\)/);
  });

  it("it shuts down on SIGTERM without abandoning an in-flight pass", () => {
    expect(script).toContain("SIGTERM");
    expect(script).toContain("SIGINT");
    expect(script).toMatch(/stopping = true/);
  });

  it("it opens no database connection of its own", () => {
    /*
      The one thing that makes this script safe to ship inside the web image.
      It carries no credentials and cannot touch the database directly; every
      write goes through the audited, tested endpoint.
    */
    expect(script).not.toContain("PrismaClient");
    expect(script).not.toContain("DATABASE_URL");
  });
});

describe("R8 · the registered guard is real on both halves", () => {
  /*
    `authorizeWorkerRequest` is registered in the Phase 99 GUARD_TOKENS registry
    as a platform-scope guard, which is what stops the route classifier calling
    the two worker routes UNKNOWN. A registry entry is a CLAIM, and Phase 103 set
    the precedent for how such a claim is kept honest: lock both halves.

    Half one — the routes really delegate to it.
    Half two — it really performs the checks the entry vouches for.

    Without this file, registering any name at all would silence the classifier.
  */
  const guardSource = read("src/lib/industrial/metering-worker-auth.ts");
  const deliverRoute = read("src/app/api/industrial/metering/deliver/route.ts");
  const healthRoute = read("src/app/api/industrial/metering/health/route.ts");
  const registry = read("scripts/security/phase99/route-inventory.mjs");

  it("the registry declares it at PLATFORM scope", () => {
    expect(registry).toContain('{ token: "authorizeWorkerRequest", scope: "platform" }');
  });

  it("both worker routes call it before doing anything else", () => {
    for (const [name, src] of [["deliver", deliverRoute], ["health", healthRoute]] as const) {
      expect(src, name).toContain("authorizeWorkerRequest(req)");
      // Called in the first statement of the handler, not after the work.
      const handler = src.slice(src.search(/export async function (GET|POST)/));
      const authAt = handler.indexOf("authorizeWorkerRequest");
      const bodyAt = handler.search(/runMeteringDeliveryPass|meteringHealth/);
      expect(authAt, name).toBeGreaterThan(-1);
      expect(bodyAt, name).toBeGreaterThan(authAt);
    }
  });

  it("it compares the token in CONSTANT TIME against an env-only secret", () => {
    expect(guardSource).toContain("timingSafeEqual");
    expect(guardSource).toContain("process.env.METERING_WORKER_TOKEN");
    expect(guardSource).toContain("process.env.METRICS_TOKEN");
    // The expected value never comes from the request.
    expect(guardSource).not.toMatch(/req\.headers\.get\(["']x-/i);
  });

  it("it falls back to an admin SESSION, not to open access", () => {
    expect(guardSource).toContain("getCurrentUser");
    expect(guardSource).toContain('can(user.role, "admin")');
    expect(guardSource).toMatch(/status:\s*401/);
    expect(guardSource).toMatch(/status:\s*403/);
  });

  it("with no token configured it refuses rather than allowing", () => {
    // `if (!expected) return false` is the line that makes an unconfigured
    // deployment closed instead of open.
    expect(guardSource).toMatch(/if \(!expected\) return false/);
  });
});
