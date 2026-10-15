/**
 * DA-3 — the attestation, exercised against REAL images and containers.
 *
 * A textual test proves the workflow contains a check. It cannot prove what
 * Docker does when a tag is moved, when a label is set on a container, or
 * when an image carries no revision at all. Those are the cases the check
 * exists for, so they are run here against real objects.
 *
 * The images are built from a three-line Dockerfile, not from this
 * repository's: the question is what `docker inspect` reports about a
 * container's image, which does not depend on what that image contains.
 *
 * SKIPPED when Docker is not reachable, so an ordinary unit run is unaffected.
 * It never touches a production object: every image and container it makes is
 * named `hermes-da3-test-*` and removed afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

const SCRIPT = "scripts/deploy/attest-image-revision.sh";
const TAG = "hermes-da3-test";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
/** Pulled once in `beforeAll`; every test image is a commit of it. */
const BASE_IMAGE = "busybox:stable";
/** Set by the suite itself, so a SKIPPED suite cannot pass for a green one. */
let suiteRan = false;

/**
 * Deliberately NOT `shell: true`. With a shell, Node concatenates arguments
 * instead of escaping them (DEP0190), so `--change "LABEL org… = …"` arrives
 * as several arguments and `docker commit` refuses. Measured on this machine:
 * `spawnSync("docker", …)` resolves without a shell on Windows too.
 */
const sh = (args: string[], opts: { cwd?: string } = {}) =>
  spawnSync(args[0], args.slice(1), { encoding: "utf8", cwd: opts.cwd, input: "" });

const dockerProbe = (() => {
  const r = sh(["docker", "version", "--format", "{{.Server.Version}}"]);
  return {
    ok: r.status === 0 && (r.stdout ?? "").trim().length > 0,
    status: r.status,
    error: (r.error as { code?: string } | undefined)?.code ?? null,
    stderr: (r.stderr ?? "").slice(0, 200),
  };
})();
const dockerAvailable = dockerProbe.ok;

/** Run the attestation script through bash, as the deploy does. */
function attest(expected: string, container: string) {
  const r = sh(["bash", SCRIPT, expected, container]);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const fields: Record<string, string> = {};
  for (const line of (r.stdout ?? "").split("\n")) {
    const m = /^ATTEST ([a-z_]+)=(.*)$/.exec(line.trim());
    if (m) fields[m[1]] = m[2];
  }
  return { status: r.status, fields, out };
}

const made: { images: string[]; containers: string[] } = { images: [], containers: [] };

/**
 * Make a labelled image WITHOUT invoking the builder.
 *
 * `docker build` of even a three-line Dockerfile took about four minutes each
 * on the machine this was written on, so four of them blew through the 300 s
 * hook timeout — and vitest reports a timed-out `beforeAll` by marking its
 * tests SKIPPED, not failed. A suite whose entire job is to exercise real
 * Docker was sliding past as green. `docker commit --change` sets the label
 * on a stopped container and takes milliseconds.
 */
function buildImage(tag: string, revision: string | null) {
  const scratch = `${tag.replace(/[:/]/g, "-")}-scratch`;
  sh(["docker", "rm", "-f", scratch]);
  const created = sh(["docker", "create", "--name", scratch, BASE_IMAGE, "sleep", "600"]);
  if (created.status !== 0) throw new Error(`create ${scratch} failed: ${created.stderr}`);
  const change =
    revision === null ? [] : ["--change", `LABEL org.opencontainers.image.revision=${revision}`];
  const committed = sh(["docker", "commit", ...change, scratch, tag]);
  sh(["docker", "rm", "-f", scratch]);
  if (committed.status !== 0) throw new Error(`commit ${tag} failed: ${committed.stderr}`);
  made.images.push(tag);
  return (committed.stdout ?? "").trim();
}

function runContainer(name: string, image: string, extraArgs: string[] = []) {
  sh(["docker", "rm", "-f", name]);
  const r = sh(["docker", "run", "-d", "--name", name, ...extraArgs, image]);
  if (r.status !== 0) throw new Error(`run ${name} failed: ${r.stderr}`);
  made.containers.push(name);
  return (r.stdout ?? "").trim();
}

describe.skipIf(!dockerAvailable)("DA-3 — attestation against real images and containers", () => {
  beforeAll(() => {
    // Pull once; the four images below are commits of this one.
    const pull = sh(["docker", "pull", "-q", BASE_IMAGE]);
    if (pull.status !== 0) throw new Error(`pull ${BASE_IMAGE} failed: ${pull.stderr}`);
    buildImage(`${TAG}:correct`, SHA_A);
    buildImage(`${TAG}:wrong`, SHA_B);
    buildImage(`${TAG}:unknown`, "unknown");
    buildImage(`${TAG}:bare`, null);
    // Set only after the setup SUCCEEDS. In `afterAll` it would be set even
    // when `beforeAll` timed out, which is precisely the case the guard
    // exists to catch.
    suiteRan = true;
  }, 300_000);

  afterAll(() => {
    for (const c of made.containers) sh(["docker", "rm", "-f", c]);
    for (const i of made.images) sh(["docker", "rmi", "-f", i]);
    // Generous: `docker rm`/`rmi` took tens of seconds each on the machine
    // this was written on, and a cleanup that times out leaves named objects
    // behind for the next run to collide with.
  }, 600_000);

  it("accepts a container whose image carries the target revision", () => {
    runContainer(`${TAG}-ok`, `${TAG}:correct`);
    const r = attest(SHA_A, `${TAG}-ok`);
    expect(r.fields.result).toBe("MATCH");
    expect(r.status).toBe(0);
    // Records all three identities, so the evidence names what it checked.
    expect(r.fields.container_id).toMatch(/^[0-9a-f]{64}$/);
    expect(r.fields.image_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r.fields.revision).toBe(SHA_A);
  });

  it("rejects a container whose image carries a DIFFERENT revision", () => {
    runContainer(`${TAG}-wrong`, `${TAG}:wrong`);
    const r = attest(SHA_A, `${TAG}-wrong`);
    expect(r.fields.result).toBe("MISMATCH");
    expect(r.status).toBe(1);
    expect(r.fields.revision).toBe(SHA_B);
  });

  it("rejects `unknown` — an image built without a revision", () => {
    runContainer(`${TAG}-unknown`, `${TAG}:unknown`);
    const r = attest(SHA_A, `${TAG}-unknown`);
    expect(r.fields.result).toBe("UNKNOWN_REVISION");
    expect(r.status).toBe(1);
  });

  it("rejects an image with no revision label at all", () => {
    runContainer(`${TAG}-bare`, `${TAG}:bare`);
    const r = attest(SHA_A, `${TAG}-bare`);
    expect(r.fields.result).toBe("NO_REVISION");
    expect(r.status).toBe(1);
  });

  it("is unmoved when the TAG is repointed at another image", () => {
    // The container keeps running the image it started with. A check that
    // read the tag would now report the wrong answer; this one reads the
    // image ID bound to the container.
    const container = runContainer(`${TAG}-tagmove`, `${TAG}:correct`);
    const before = attest(SHA_A, `${TAG}-tagmove`);
    expect(before.fields.result).toBe("MATCH");

    // Move the tag to the image carrying the WRONG revision.
    expect(sh(["docker", "tag", `${TAG}:wrong`, `${TAG}:correct`]).status).toBe(0);

    const after = attest(SHA_A, `${TAG}-tagmove`);
    expect(after.fields.result, "moving a tag must not change the verdict").toBe("MATCH");
    expect(after.fields.image_id).toBe(before.fields.image_id);
    expect(container.length).toBeGreaterThan(0);
  });

  it("is not fooled by a revision label set on the CONTAINER", () => {
    // The dressing-up case: an image with the wrong revision, run with a
    // container label that claims the right one. Reading the container would
    // pass it; reading the image and comparing the two does not.
    runContainer(`${TAG}-override`, `${TAG}:wrong`, [
      "--label",
      `org.opencontainers.image.revision=${SHA_A}`,
    ]);
    const r = attest(SHA_A, `${TAG}-override`);
    expect(r.fields.result).toBe("CONTAINER_LABEL_OVERRIDE");
    expect(r.status).toBe(1);
    expect(r.fields.revision).toBe(SHA_B);
    expect(r.fields.container_revision).toBe(SHA_A);
  });

  it("refuses a short SHA as the target, rather than matching a prefix", () => {
    runContainer(`${TAG}-short`, `${TAG}:correct`);
    const r = attest(SHA_A.slice(0, 12), `${TAG}-short`);
    expect(r.fields.result).toBe("BAD_EXPECTED");
    expect(r.status).toBe(1);
  });

  it("refuses an empty target and a container that does not exist", () => {
    expect(attest("", `${TAG}-ok`).fields.result).toBe("BAD_EXPECTED");
    expect(attest(SHA_A, "hermes-da3-test-does-not-exist").fields.result).toBe("NO_CONTAINER");
  });
});

describe("DA-3 — the evidence is named for what it is", () => {
  it("actually RAN the Docker cases when Docker was reachable", () => {
    // The trap this closes: a `beforeAll` that times out makes vitest report
    // its tests as SKIPPED, not failed, so a suite whose whole purpose is to
    // exercise real Docker slides past as green. If Docker was reachable and
    // the cases did not run, that is a failure of this suite.
    if (!dockerProbe.ok) return;
    expect(suiteRan, "Docker was available but the attestation cases did not run").toBe(true);
  });

  it("reports whether Docker was reachable, so a SKIP is never mistaken for a PASS", () => {
    // A suite whose whole job is to exercise real Docker must not slip past
    // as "green" when it never ran. This line puts the reason in the output.
    // eslint-disable-next-line no-console
    console.log(`DOCKER_PROBE ${JSON.stringify(dockerProbe)}`);
    expect(typeof dockerProbe.ok).toBe("boolean");
  });

  it("does not call itself a signature or a proof of content authenticity", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(SCRIPT, "utf8");
    // The script must say plainly what it does NOT do, so no reader of a
    // deploy log upgrades "the label says X" into "the bytes are X".
    expect(src).toContain("an image SIGNATURE");
    expect(src).toContain("nothing here is signed");
    expect(src).toContain("It proves the");
    expect(src).toContain("revision METADATA");
  });
});
