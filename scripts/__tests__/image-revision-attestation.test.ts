/**
 * DA-3 — the running image states which commit it was built from.
 *
 * THE GAP THIS CLOSES. Before this, nothing produced by a running container
 * said which commit built it. `git rev-parse HEAD` on the server proves where
 * the CHECKOUT is; `docker compose ps` proves that A container is running.
 * Neither proves the running container was built from that checkout — an
 * image built earlier, or from a different checkout, is indistinguishable in
 * both. "Production runs X" therefore rested on the deploy PROCESS, not on
 * the artefact, and a statement about a process is not an attestation.
 *
 * THE CHAIN, which only holds if every link is present:
 *
 *   1. the runner stage takes a `GIT_REVISION` build argument and records it
 *      in the standard OCI label;
 *   2. the compose file passes it to the `hermes-web` build;
 *   3. the deploy exports it as the commit it is deploying;
 *   4. after recreating the container, the deploy READS the label back off
 *      the running container and refuses if it is not the deployed SHA.
 *
 * A test per link, because a chain that is three-quarters present attests
 * nothing while looking as if it does.
 *
 * DELIBERATELY NOT ON `/api/health`. That endpoint is the public liveness
 * probe and returns only `{"status":"ok"}` by design; publishing the exact
 * deployed commit there would hand anyone on the internet a precise version
 * to match against known vulnerabilities. The label is readable on the host,
 * by someone who already has it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dockerfile = readFileSync("Dockerfile", "utf8");
const compose = readFileSync("docker-compose.prod.yml", "utf8");
const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");
const health = readFileSync("src/app/api/health/route.ts", "utf8");

/** The runner stage only — a label on another stage would attest nothing. */
function runnerStage(): string {
  const start = dockerfile.indexOf("FROM node:20-alpine AS runner");
  expect(start, "the runner stage must exist").toBeGreaterThan(-1);
  const next = dockerfile.indexOf("\nFROM ", start + 1);
  return next === -1 ? dockerfile.slice(start) : dockerfile.slice(start, next);
}

/** The independently deployed executive worker stage only. */
function executiveWorkerStage(): string {
  const start = dockerfile.indexOf("FROM node:20-alpine AS executive-report-worker");
  expect(start, "the executive worker stage must exist").toBeGreaterThan(-1);
  const next = dockerfile.indexOf("\nFROM ", start + 1);
  return next === -1 ? dockerfile.slice(start) : dockerfile.slice(start, next);
}

describe("DA-3 — link 1: the image records its own revision", () => {
  it("declares the build argument in the RUNNER stage", () => {
    expect(runnerStage()).toMatch(/^ARG GIT_REVISION=/m);
  });

  it("records it under the standard OCI label, not a private one", () => {
    // A bespoke label works for us and for nobody else; the OCI name is what
    // every scanner, registry and `docker inspect` convention already reads.
    expect(runnerStage()).toMatch(/^LABEL org\.opencontainers\.image\.revision=\$GIT_REVISION/m);
  });
});

describe("DA-3 — the executive worker image records its revision", () => {
  it("declares the build argument in the executive worker stage", () => {
    expect(executiveWorkerStage()).toMatch(/^ARG GIT_REVISION=unknown$/m);
  });

  it("uses the standard OCI revision label in the executive worker stage", () => {
    expect(executiveWorkerStage()).toMatch(
      /^LABEL org\.opencontainers\.image\.revision=\$GIT_REVISION$/m,
    );
  });
});

describe("DA-3 — link 2: compose passes the revision to the build", () => {
  it("passes GIT_REVISION as a build argument for hermes-web", () => {
    const web = compose.slice(compose.indexOf("hermes-web:"), compose.indexOf("hermes-executive-report-worker:"));
    expect(web).toMatch(/GIT_REVISION:\s*\$\{GIT_REVISION:-unknown\}/);
  });

  it("passes GIT_REVISION to the independently built executive worker", () => {
    const start = compose.indexOf("hermes-executive-report-worker:");
    const end = compose.indexOf("hermes-document-cleanup-worker:", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const worker = compose.slice(start, end);
    expect(worker).toMatch(/GIT_REVISION:\s*\$\{GIT_REVISION:-unknown\}/);
  });

  it("defaults to `unknown` rather than to something that looks like a commit", () => {
    // A hand-built image must be obviously unattested, not silently wrong.
    expect(compose).not.toMatch(/GIT_REVISION:\s*\$\{GIT_REVISION:-[0-9a-f]{7,}\}/);
  });
});

describe("DA-3 — link 3: the deploy stamps the commit it is deploying", () => {
  it("exports GIT_REVISION from TARGET_SHA before building", () => {
    const build = deploy.indexOf("build hermes-web");
    expect(build).toBeGreaterThan(-1);
    const before = deploy.slice(0, build);
    expect(before).toMatch(/export GIT_REVISION="\$\{TARGET_SHA\}"/);
  });
});

describe("DA-3 — link 4: the deploy reads the metadata back and refuses a mismatch", () => {
  const tail = deploy.slice(deploy.indexOf("Replace ONLY hermes-web"));

  it("delegates to the shared script rather than re-implementing the check", () => {
    // One implementation, exercised against real containers by
    // attest-image-revision.docker.test.ts. A second copy inline here would
    // be the copy that drifts.
    expect(tail).toContain("bash scripts/deploy/attest-image-revision.sh");
    expect(tail).toMatch(/attest-image-revision\.sh "\$\{TARGET_SHA\}" "\$\{RUNNING_CID\}"/);
  });

  it("passes the container, so the script resolves the image bound to it", () => {
    expect(tail).toContain("ps -q hermes-web");
  });

  /**
   * The four guarantees below used to be pinned against the inline rollback.
   * The rollback now lives in scripts/deploy/rollback-to-previous-good.sh,
   * where its branches can actually be EXECUTED against real images and
   * containers (rollback-to-previous-good.docker.test.ts). Each guarantee is
   * therefore re-pointed at its new home rather than dropped: moving code is
   * not a reason to stop checking what it must do.
   */
  const rollbackScript = readFileSync("scripts/deploy/rollback-to-previous-good.sh", "utf8");

  it("rolls back to previous-good when the attestation fails", () => {
    const branch = tail.slice(tail.indexOf("else"), tail.indexOf("POST-DEPLOY health gate"));
    expect(branch).toContain("hermes-web:previous-good");
    expect(branch).toContain("bash scripts/deploy/rollback-to-previous-good.sh");
    // The script is what brings the service back, and it is told the
    // production service explicitly rather than relying on its default.
    expect(branch).toContain("--service hermes-web");
    expect(rollbackScript).toContain("up -d --no-deps --no-build");
  });

  it("refuses to continue when there is nothing to roll back to", () => {
    expect(rollbackScript).toContain("NO_PRESERVED_IMAGE");
    expect(rollbackScript).toContain("needs a human now");
  });

  it("reports an UNLABELLED rollback image separately from verifying the target", () => {
    // An image built before the label existed carries no revision. That is an
    // absence of evidence about the ROLLED-BACK release — neither a second
    // failure nor a pass, and it must not be folded into the target's verdict.
    expect(rollbackScript).toContain("carries NO revision label");
    expect(rollbackScript).toContain("Its commit is unattested");
    expect(rollbackScript).toContain("revision=UNKNOWN");
  });

  it("verifies the rolled-back container is healthy", () => {
    expect(rollbackScript).toContain("Rollback is healthy");
    expect(rollbackScript).toContain("UNHEALTHY");
  });

  it("fails the run even after a successful rollback", () => {
    // A recovered failure is not a release. The branch must exit non-zero
    // whatever the rollback did.
    const branch = tail.slice(tail.indexOf("Image revision attestation failed"), tail.indexOf("POST-DEPLOY health gate"));
    expect(branch).toMatch(/exit 1/);
  });

  it("attests BEFORE the health gate declares the release good", () => {
    const attest = deploy.indexOf("attest-image-revision.sh");
    const healthGate = deploy.indexOf("Post-deploy health gate passed");
    expect(attest).toBeGreaterThan(-1);
    expect(healthGate).toBeGreaterThan(-1);
    expect(attest).toBeLessThan(healthGate);
  });
});

describe("DA-3 — the check reads the image, not a tag and not the container", () => {
  const script = readFileSync("scripts/deploy/attest-image-revision.sh", "utf8");

  it("resolves the image by the container's bound image id", () => {
    expect(script).toMatch(/docker inspect -f '\{\{\.Image\}\}'/);
  });

  it("reads the revision label from the IMAGE id", () => {
    const read = script.slice(script.indexOf('REVISION="$('));
    expect(read).toContain('"${IMAGE_ID}"');
  });

  it("treats a container label that disagrees with the image as an override", () => {
    expect(script).toContain("CONTAINER_LABEL_OVERRIDE");
  });

  it("requires a full 40-character SHA on both sides", () => {
    expect(script).toContain('[ "${#EXPECTED}" -ne 40 ]');
    expect(script).toContain('[ "${#REVISION}" -ne 40 ]');
  });

  it("rejects an empty revision and the `unknown` default", () => {
    expect(script).toContain("NO_REVISION");
    expect(script).toContain("UNKNOWN_REVISION");
  });

  it("never consults a tag", () => {
    // `docker inspect hermes-web:latest` would answer a different question
    // from "what is this container running". Comments are stripped first:
    // the script EXPLAINS the hazard by naming a tag, which is not the same
    // as consulting one.
    const code = script
      .split("\n")
      .filter(line => !line.trim().startsWith("#"))
      .join("\n");
    expect(code).not.toMatch(/docker inspect[^\n]*:latest/);
    expect(code).not.toMatch(/hermes-web/);
    // Every inspect targets a resolved id, never a name.
    for (const m of code.matchAll(/docker inspect -f [^\n]*"\$\{([A-Z_]+)\}"/g)) {
      expect(["CONTAINER", "CONTAINER_ID", "IMAGE_ID"]).toContain(m[1]);
    }
  });
});

describe("DA-3 — the revision is not published to the internet", () => {
  it("keeps the public liveness probe free of version information", () => {
    // /api/health is the container healthcheck AND a public endpoint. A commit
    // SHA there tells an anonymous caller exactly which code is running.
    expect(health).not.toMatch(/revision|commit|GIT_REVISION|version/i);
    expect(health).toContain('{ status: "ok" }');
  });
});
