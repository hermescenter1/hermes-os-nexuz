/**
 * DA-3 (remainder) — the deploy delegates its rollback, and keeps refusing.
 *
 * The behaviour lives in scripts/deploy/rollback-to-previous-good.sh and is
 * proven against real images and containers by its own docker test. What a
 * source-level test can add is that the workflow actually CALLS it, that the
 * inline copy did not survive beside it, and that a rollback still fails the
 * run — a release that rolled back is a recovered failure, never a success.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const deploy = readFileSync(".github/workflows/deploy.yml", "utf8").split(CR).join("");

/** The attestation branch: from the attestation call to the end of its `fi`. */
const branch = (() => {
  const from = deploy.indexOf("attest-image-revision.sh");
  if (from === -1) throw new Error("the attestation call is missing");
  const to = deploy.indexOf("POST-DEPLOY health gate", from);
  if (to === -1) throw new Error("the post-deploy health gate marker is missing");
  return deploy.slice(from, to);
})();

/** The branch with comment lines removed, so prose cannot satisfy a rule. */
const code = branch
  .split(LF)
  .filter(line => !line.trimStart().startsWith("#"))
  .join(LF);

describe("the deploy hands its rollback to the tested script", () => {
  it("calls the script on the attestation failure path", () => {
    expect(code).toContain("bash scripts/deploy/rollback-to-previous-good.sh");
  });

  it("passes the production project, service and preserved tag explicitly", () => {
    // Defaults in the script are a convenience for an operator running it by
    // hand. The release path states what it means, so a changed default can
    // never silently retarget a production rollback.
    for (const arg of [
      "--project hermes",
      "--service hermes-web",
      "--preserved hermes-web:previous-good",
      "--file docker-compose.prod.yml",
      "--env-file .env.production",
    ]) {
      expect(code, arg).toContain(arg);
    }
  });

  it("no longer carries its own copy of the rollback", () => {
    // Two implementations of this path would mean the untested one is the one
    // that runs in production.
    expect(code).not.toContain("docker tag hermes-web:previous-good");
    expect(code).not.toContain("RB_OK");
    expect(code).not.toMatch(/ROLLBACK_REVISION/);
  });

  it("still fails the run after a rollback, however the rollback went", () => {
    // `|| true` keeps the script's own non-zero exit from masking this: the
    // release did not happen, and that is what the run must report.
    expect(code).toMatch(/rollback-to-previous-good\.sh[\s\S]*?\|\| true/);
    const afterCall = code.slice(code.indexOf("rollback-to-previous-good.sh"));
    expect(afterCall).toMatch(/exit 1/);
  });

  it("keeps the attestation itself ahead of the rollback", () => {
    // The rollback must be reachable only from a FAILED attestation.
    expect(branch.indexOf("attest-image-revision.sh")).toBeLessThan(
      branch.indexOf("rollback-to-previous-good.sh"),
    );
  });
});

describe("the rollback script keeps its own guarantees", () => {
  const src = readFileSync("scripts/deploy/rollback-to-previous-good.sh", "utf8");
  const body = src
    .split(LF)
    .filter(line => !line.trimStart().startsWith("#"))
    .join(LF);

  it("never prunes, removes or rebuilds anything", () => {
    // It retags one image and asks Compose to bring a service back. A
    // rollback that also deletes is a second incident.
    expect(body).not.toMatch(/\b(prune|rmi|rm -rf|down|--volumes)\b/);
    expect(body).not.toMatch(/--build\b/);
  });

  it("reads the revision from the IMAGE, never from the container", () => {
    // Container labels can be set at run time; the image's cannot.
    expect(body).toMatch(/inspect -f '\{\{ index \.Config\.Labels "org\.opencontainers\.image\.revision" \}\}' "\$\{IMAGE_ID\}"/);
  });

  it("says plainly that the label is not a signature", () => {
    expect(src).toContain("metadata, not a signature");
  });
});
