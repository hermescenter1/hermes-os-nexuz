/**
 * DA-3 (remainder) — the rollback, exercised against REAL images and
 * containers.
 *
 * This is the path that runs when production is ALREADY broken: the container
 * has been replaced and the release was judged bad. Until now it lived inline
 * in deploy.yml and had never been executed anywhere, which is the worst place
 * to have an untested branch.
 *
 * WHAT IS REAL HERE. The preserved image, the tag move, the container, the
 * image identity the container is bound to, the revision label and the health
 * state are all real Docker objects. Only `docker compose` is shimmed — a
 * production Compose project is not something a unit run may conjure — and the
 * shim starts a real container from the real tag, so everything the script
 * decides afterwards is decided about a real object.
 *
 * SKIPPED when Docker is not reachable. A skipped suite cannot pass for a
 * green one: `suiteRan` is set at the END of the setup and asserted.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = "scripts/deploy/rollback-to-previous-good.sh";
const PREFIX = "hermes-da3-rb";
const BASE_IMAGE = "busybox:stable";
const REVISION = "c".repeat(40);
let suiteRan = false;

/** No `shell: true`: on Windows a shell concatenates args instead of escaping. */
const sh = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(args[0], args.slice(1), { encoding: "utf8", input: "", env: { ...process.env, ...env } });

const dockerAvailable = (() => {
  const r = sh(["docker", "version", "--format", "{{.Server.Version}}"]);
  return r.status === 0 && (r.stdout ?? "").trim().length > 0;
})();

const made = { images: [] as string[], containers: [] as string[] };
let dir = "";
let shim = "";

/**
 * A labelled image without invoking the builder: `docker build` of even a
 * three-line Dockerfile takes minutes on this machine, and a timed-out
 * `beforeAll` is reported by vitest as SKIPPED rather than failed.
 */
function makeImage(tag: string, revision: string | null) {
  const scratch = `${tag.replace(/[:/]/g, "-")}-scratch`;
  sh(["docker", "rm", "-f", scratch]);
  const created = sh(["docker", "create", "--name", scratch, BASE_IMAGE, "sleep", "600"]);
  if (created.status !== 0) throw new Error(`create failed: ${created.stderr}`);
  const change = revision === null ? [] : ["--change", `LABEL org.opencontainers.image.revision=${revision}`];
  const committed = sh(["docker", "commit", ...change, scratch, tag]);
  sh(["docker", "rm", "-f", scratch]);
  if (committed.status !== 0) throw new Error(`commit failed: ${committed.stderr}`);
  made.images.push(tag);
}

/**
 * A `docker` that answers `compose` itself and forwards everything else.
 *
 * `compose up` starts a real container from the real built tag, with whatever
 * health behaviour the case needs; `compose ps -q` prints its id. Every other
 * verb — image inspect, tag, inspect — reaches the real daemon untouched.
 */
function writeShim(opts: { container: string; health?: "none" | "healthy" | "unhealthy"; upFails?: boolean; runImage?: string }) {
  const health =
    opts.health === "healthy"
      ? ["--health-cmd", "true", "--health-interval", "1s", "--health-retries", "1", "--health-start-period", "0s"]
      : opts.health === "unhealthy"
        ? ["--health-cmd", "false", "--health-interval", "1s", "--health-retries", "1", "--health-start-period", "0s"]
        : [];
  const body = [
    "#!/usr/bin/env bash",
    "set -uo pipefail",
    'args=("$@")',
    'if [ "${1:-}" = "compose" ]; then',
    "  for a in \"$@\"; do",
    '    if [ "$a" = "up" ]; then',
    opts.upFails ? '      echo "shim: up refused" >&2; exit 1' : "      :",
    '      docker rm -f ' + opts.container + " >/dev/null 2>&1",
    "      docker run -d --name " + opts.container + " " + health.map(h => JSON.stringify(h)).join(" ") + " " + (opts.runImage ?? "$BUILT_TAG") + " sleep 600 >/dev/null",
    "      exit $?",
    "    fi",
    '    if [ "$a" = "ps" ]; then',
    "      docker inspect -f '{{.Id}}' " + opts.container + " 2>/dev/null",
    "      exit 0",
    "    fi",
    "  done",
    "  exit 0",
    "fi",
    'exec docker "$@"',
    "",
  ].join("\n");
  const path = join(dir, "docker-shim.sh");
  writeFileSync(path, body, { mode: 0o755 });
  return path;
}

/** Run the script with the shim in place. */
function rollback(args: string[], builtTag: string, shimPath: string) {
  const r = sh(["bash", SCRIPT, ...args], { DOCKER_BIN: shimPath, BUILT_TAG: builtTag });
  const fields: Record<string, string> = {};
  for (const line of (r.stdout ?? "").split("\n")) {
    const m = /^ROLLBACK ([a-z_]+)=(.*)$/.exec(line.trim());
    if (m) fields[m[1]] = m[2];
  }
  return { status: r.status, fields, stderr: r.stderr ?? "" };
}

const baseArgs = (preserved: string, extra: string[] = []) => [
  "--project",
  PREFIX,
  "--service",
  "web",
  "--preserved",
  preserved,
  "--file",
  "/dev/null",
  "--env-file",
  "/dev/null",
  ...extra,
];

beforeAll(() => {
  if (!dockerAvailable) return;
  dir = mkdtempSync(join(tmpdir(), "da3-rb-"));
  sh(["docker", "pull", BASE_IMAGE]);
  makeImage(`${PREFIX}-labelled:previous-good`, REVISION);
  makeImage(`${PREFIX}-unlabelled:previous-good`, null);
  makeImage(`${PREFIX}-other:latest`, "d".repeat(40));
  shim = writeShim({ container: `${PREFIX}-c` });
  suiteRan = true; // LAST: a setup that threw must not look like a run
}, 300_000);

afterAll(() => {
  if (!dockerAvailable) return;
  for (const c of [...made.containers, `${PREFIX}-c`]) sh(["docker", "rm", "-f", c]);
  for (const i of made.images) sh(["docker", "rmi", "-f", i]);
  for (const t of [`${PREFIX}-web:latest`]) sh(["docker", "rmi", "-f", t]);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!dockerAvailable)("DA-3 — the rollback, against real Docker", () => {
  it("the suite actually ran, rather than being skipped into a pass", () => {
    expect(suiteRan).toBe(true);
  });

  it("refuses when there is nothing to roll back to, and changes nothing", () => {
    // The container has already been replaced by the time this runs. If the
    // preserved image is gone there is no honest action left but to stop.
    const s = writeShim({ container: `${PREFIX}-c` });
    const r = rollback(baseArgs(`${PREFIX}-absent:previous-good`), `${PREFIX}-web:latest`, s);
    expect(r.fields.result).toBe("NO_PRESERVED_IMAGE");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("needs a human");
    // Nothing was started.
    expect(sh(["docker", "inspect", `${PREFIX}-c`]).status).not.toBe(0);
  });

  it("puts the previous release back and reports the revision it claims", () => {
    const s = writeShim({ container: `${PREFIX}-c`, health: "none" });
    const r = rollback(baseArgs(`${PREFIX}-labelled:previous-good`), `${PREFIX}-web:latest`, s);
    made.containers.push(`${PREFIX}-c`);
    expect(r.fields.result).toBe("ROLLED_BACK");
    expect(r.status).toBe(0);
    expect(r.fields.revision).toBe(REVISION);
    // The image it reports is the image the CONTAINER is bound to, and it is
    // the preserved one — not merely the tag the script moved.
    const preservedId = sh(["docker", "image", "inspect", "-f", "{{.Id}}", `${PREFIX}-labelled:previous-good`]).stdout.trim();
    expect(r.fields.image).toBe(preservedId);
    expect(r.fields.preserved_image).toBe(preservedId);
  });

  it("reports a missing revision label as UNKNOWN and a warning, not as success or failure of the rollback", () => {
    // An image built before the label existed carries no revision. That is an
    // absence of evidence about the release that came back — the rollback
    // itself still succeeded, and must not be reported as broken.
    const s = writeShim({ container: `${PREFIX}-c`, health: "none" });
    const r = rollback(baseArgs(`${PREFIX}-unlabelled:previous-good`), `${PREFIX}-web:latest`, s);
    expect(r.fields.result).toBe("ROLLED_BACK");
    expect(r.status).toBe(0);
    expect(r.fields.revision).toBe("UNKNOWN");
    expect(r.stderr).toContain("::warning::");
    expect(r.stderr).toContain("NO revision label");
  });

  it("refuses when the container came back on a DIFFERENT image than the preserved one", () => {
    // A Compose file that pins its own image, or a container Compose decided
    // to keep, would otherwise read as a successful rollback to something
    // else entirely.
    const s = writeShim({ container: `${PREFIX}-c`, health: "none", runImage: `${PREFIX}-other:latest` });
    const r = rollback(baseArgs(`${PREFIX}-labelled:previous-good`), `${PREFIX}-web:latest`, s);
    expect(r.fields.result).toBe("WRONG_IMAGE");
    expect(r.status).toBe(1);
  });

  it("accepts a container whose own healthcheck reports healthy", () => {
    const s = writeShim({ container: `${PREFIX}-c`, health: "healthy" });
    const r = rollback(baseArgs(`${PREFIX}-labelled:previous-good`, ["--health-timeout", "60"]), `${PREFIX}-web:latest`, s);
    expect(r.fields.result).toBe("ROLLED_BACK");
    expect(r.fields.state).toBe("running healthy");
    expect(r.status).toBe(0);
  }, 120_000);

  it("refuses a rollback that comes back UNHEALTHY, rather than trading one broken state for another", () => {
    const s = writeShim({ container: `${PREFIX}-c`, health: "unhealthy" });
    const r = rollback(baseArgs(`${PREFIX}-labelled:previous-good`, ["--health-timeout", "40"]), `${PREFIX}-web:latest`, s);
    expect(r.fields.result).toBe("UNHEALTHY");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("needs a human");
  }, 120_000);

  it("fails when Compose cannot bring the service up", () => {
    const s = writeShim({ container: `${PREFIX}-c`, upFails: true });
    const r = rollback(baseArgs(`${PREFIX}-labelled:previous-good`), `${PREFIX}-web:latest`, s);
    expect(r.fields.result).toBe("UP_FAILED");
    expect(r.status).toBe(1);
  });

  it("validates the health timeout before touching anything", () => {
    for (const bad of ["0", "-5", "soon"]) {
      const r = rollback(baseArgs(`${PREFIX}-labelled:previous-good`, ["--health-timeout", bad]), `${PREFIX}-web:latest`, shim);
      expect(r.fields.result, bad).toBe("BAD_TIMEOUT");
      expect(r.fields.preserved_image, bad).toBeUndefined();
    }
  });

  it("refuses an argument it does not understand instead of ignoring it", () => {
    const r = sh(["bash", SCRIPT, "--wipe-everything"], { DOCKER_BIN: shim });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown argument");
  });
});
