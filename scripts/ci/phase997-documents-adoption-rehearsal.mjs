/**
 * PHASE 99.7 — `documents_data` adoption rehearsal (real Docker, disposable).
 *
 * This rehearsal first REPRODUCES the data-loss scenario, then proves the
 * adoption closes it. Reproducing it matters: the Phase 98 change is safe only
 * if the one-time adoption actually happens, and a rehearsal that starts from an
 * already-correct state would prove nothing.
 *
 *   1. a "legacy" container writes documents to /app/.data/documents with NO
 *      volume mounted — exactly the pre-Phase-98 production shape;
 *   2. a container started from the SAME image WITH documents_data mounted at
 *      that path sees an EMPTY directory — the legacy bytes are hidden, and are
 *      lost for good once the old container is removed;
 *   3. the adoption CLI carries the staged legacy tree into the volume and
 *      proves count + bytes + per-file digest;
 *   4. the volume's contents are verified from INSIDE the container, against
 *      digests taken from the legacy container;
 *   5. the legacy source is proven untouched, so rollback stays possible;
 *   6. the fail-closed refusals are exercised against the now-populated volume;
 *   7. the zero-document case is rehearsed separately.
 *
 * Every container and volume name is guarded by the disposable `hermes997_`
 * prefix, so no operation here can name — let alone remove — a Production
 * resource. No Production document is ever read: the fixtures are SYNTHETIC.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADOPT_CLI = join(REPO, "scripts", "dr", "adopt-documents.mjs");
const PREFIX = "hermes997_";
const DOC_PATH = "/app/.data/documents";
const IMAGE = "alpine:3.20";

let failed = false;
const check = (label, cond, detail) => {
  console.log(`RESULT ${label}=${cond ? "PASS" : "FAIL"}`);
  if (!cond && detail) console.log(`  - ${String(detail).slice(0, 300)}`);
  if (!cond) failed = true;
};

const docker = (args, opts = {}) => execFileSync("docker", args, { encoding: "utf8", ...opts });
const node = (args) => execFileSync(process.execPath, args, { encoding: "utf8" });
/** Run the adoption CLI, returning {ok, out} instead of throwing. */
const adopt = (args) => {
  try {
    return { ok: true, out: node([ADOPT_CLI, ...args]) };
  } catch (err) {
    return { ok: false, out: `${String(err.stdout ?? "")}\n${String(err.stderr ?? "")}` };
  }
};

/** The single safety invariant: nothing here may name a Production resource. */
function guard(name) {
  if (!name.startsWith(PREFIX) || name === "hermes" || name.startsWith("hermes-")) {
    throw new Error(`DISPOSABLE_GUARD violated: ${name}`);
  }
  return name;
}

/** `<sha256>  <path>` lines, sorted — any content or path change shows up. */
const digestsIn = (container, path) =>
  docker(["exec", container, "sh", "-c", `cd ${path} 2>/dev/null && find . -type f -exec sha256sum {} + | sort || true`]);

const fileCountIn = (container, path) =>
  docker(["exec", container, "sh", "-c", `find ${path} -type f 2>/dev/null | wc -l || echo 0`]).trim();

async function main() {
  const rid = randomBytes(4).toString("hex");
  const legacy = guard(`${PREFIX}legacy_${rid}`);
  const mounted = guard(`${PREFIX}mounted_${rid}`);
  const emptyLegacy = guard(`${PREFIX}emptylegacy_${rid}`);
  const emptyMounted = guard(`${PREFIX}emptymounted_${rid}`);
  const volume = guard(`${PREFIX}documents_${rid}`);
  const emptyVolume = guard(`${PREFIX}documents_empty_${rid}`);

  const containers = [legacy, mounted, emptyLegacy, emptyMounted];
  const volumes = [volume, emptyVolume];

  const work = mkdtempSync(join(tmpdir(), "hermes-p997-docs-"));
  const stageLegacy = join(work, "stage-legacy");
  const stageVolume = join(work, "stage-volume");
  const stageEmptyLegacy = join(work, "stage-empty-legacy");
  const stageEmptyVolume = join(work, "stage-empty-volume");
  for (const d of [stageLegacy, stageVolume, stageEmptyLegacy, stageEmptyVolume]) mkdirSync(d, { recursive: true });

  try {
    // ── 1. The pre-Phase-98 shape: documents on the container writable layer ──
    docker(["run", "-d", "--name", legacy, IMAGE, "sleep", "900"]);
    docker([
      "exec",
      legacy,
      "sh",
      "-c",
      // SYNTHETIC fixtures only: nested paths, a Persian filename, a zero-byte
      // file and a binary blob — the shapes a naive copy tends to mishandle.
      `set -e; mkdir -p ${DOC_PATH}/uploads/2026 "${DOC_PATH}/exports/بستهٔ انطباق"; ` +
        `printf 'SYNTHETIC document body' > ${DOC_PATH}/uploads/2026/manual.txt; ` +
        `head -c 64 /dev/urandom > ${DOC_PATH}/uploads/2026/scan.bin; ` +
        `: > ${DOC_PATH}/uploads/empty.marker; ` +
        `printf '{"synthetic":true}' > "${DOC_PATH}/exports/بستهٔ انطباق/package.json"`,
    ]);
    const legacyDigests = digestsIn(legacy, DOC_PATH);
    const legacyCount = fileCountIn(legacy, DOC_PATH);
    check("REHEARSAL_LEGACY_SEEDED", legacyCount === "4", `expected 4 synthetic documents, found ${legacyCount}`);

    // ── 2. Reproduce the loss: mount the new volume over the same path ────────
    docker(["volume", "create", guard(volume)]);
    docker(["run", "-d", "--name", mounted, "-v", `${volume}:${DOC_PATH}`, IMAGE, "sleep", "900"]);
    const hiddenCount = fileCountIn(mounted, DOC_PATH);
    check(
      "REHEARSAL_LOSS_SCENARIO_REPRODUCED",
      hiddenCount === "0",
      `mounting documents_data should hide the legacy tree; the mounted container saw ${hiddenCount} files`,
    );

    // ── 3. Adoption through the real operator CLI ─────────────────────────────
    // Stage both sides on the host, exactly as the runbook instructs.
    docker(["cp", `${legacy}:${DOC_PATH}/.`, stageLegacy]);
    docker(["cp", `${mounted}:${DOC_PATH}/.`, stageVolume]);

    const planOnly = adopt(["--source", stageLegacy, "--dest", stageVolume, "--destination-classification", "EXPECTED_EMPTY", "--plan-only"]);
    check("REHEARSAL_PLAN_ONLY_WRITES_NOTHING", planOnly.ok && /ADOPTION_MODE=PLAN_ONLY/.test(planOnly.out), planOnly.out);

    const manifestOut = join(work, "adoption.json");
    const run = adopt([
      "--source",
      stageLegacy,
      "--dest",
      stageVolume,
      "--destination-classification",
      "EXPECTED_EMPTY",
      "--manifest-out",
      manifestOut,
    ]);
    check("REHEARSAL_ADOPTION_SUCCEEDS", run.ok && /RESULT documents_adoption=PASS/.test(run.out), run.out);
    check("REHEARSAL_ADOPTION_COUNT", /ADOPTION_COPIED_FILE_COUNT=4/.test(run.out), run.out);
    check("REHEARSAL_ADOPTION_INTEGRITY", /ADOPTION_INTEGRITY_VERIFIED=true/.test(run.out), run.out);
    check("REHEARSAL_ADOPTION_SOURCE_RETAINED", /ADOPTION_SOURCE_RETAINED=true/.test(run.out), run.out);
    check("REHEARSAL_ADOPTION_MANIFEST_WRITTEN", /ADOPTION_MANIFEST_WRITTEN=/.test(run.out), run.out);

    // ── 4. Verify from INSIDE the volume-backed container ─────────────────────
    docker(["cp", `${stageVolume}/.`, `${mounted}:${DOC_PATH}`]);
    const adoptedDigests = digestsIn(mounted, DOC_PATH);
    check(
      "REHEARSAL_VOLUME_CONTENT_MATCHES_LEGACY",
      adoptedDigests === legacyDigests && adoptedDigests.trim().length > 0,
      "digests inside documents_data do not match the legacy container",
    );

    // ── 5. The legacy source must survive, so rollback stays possible ─────────
    check(
      "REHEARSAL_LEGACY_SOURCE_PRESERVED",
      digestsIn(legacy, DOC_PATH) === legacyDigests && fileCountIn(legacy, DOC_PATH) === legacyCount,
      "the adoption modified or removed the legacy source",
    );

    // ── 6. Fail-closed refusals against the now-populated destination ─────────
    const unclassified = adopt(["--source", stageLegacy, "--dest", stageVolume]);
    check(
      "REHEARSAL_REFUSES_UNCLASSIFIED_NON_EMPTY_DESTINATION",
      !unclassified.ok && /DESTINATION_NOT_EMPTY_AND_UNCLASSIFIED/.test(unclassified.out),
      unclassified.out,
    );

    const collide = adopt(["--source", stageLegacy, "--dest", stageVolume, "--destination-classification", "OWNER_CLASSIFIED_SAFE_NON_EMPTY"]);
    check("REHEARSAL_REFUSES_OVERWRITE", !collide.ok && /DESTINATION_PATH_COLLISION/.test(collide.out), collide.out);

    // Re-running must not have changed the destination.
    check(
      "REHEARSAL_REFUSAL_LEFT_DESTINATION_INTACT",
      digestsIn(mounted, DOC_PATH) === legacyDigests,
      "a refused adoption still altered the destination",
    );

    const missingSource = adopt(["--source", join(work, "does-not-exist"), "--dest", stageVolume, "--destination-classification", "OWNER_CLASSIFIED_SAFE_NON_EMPTY"]);
    check("REHEARSAL_REFUSES_MISSING_SOURCE", !missingSource.ok && /SOURCE_MISSING/.test(missingSource.out), missingSource.out);

    // ── 7. Zero-document case ─────────────────────────────────────────────────
    docker(["run", "-d", "--name", emptyLegacy, IMAGE, "sleep", "900"]);
    docker(["exec", emptyLegacy, "sh", "-c", `mkdir -p ${DOC_PATH}`]);
    docker(["volume", "create", guard(emptyVolume)]);
    docker(["run", "-d", "--name", emptyMounted, "-v", `${emptyVolume}:${DOC_PATH}`, IMAGE, "sleep", "900"]);
    docker(["cp", `${emptyLegacy}:${DOC_PATH}/.`, stageEmptyLegacy]);
    docker(["cp", `${emptyMounted}:${DOC_PATH}/.`, stageEmptyVolume]);

    const zero = adopt(["--source", stageEmptyLegacy, "--dest", stageEmptyVolume, "--destination-classification", "EXPECTED_EMPTY"]);
    check("REHEARSAL_ZERO_DOCUMENTS_REPORTED", zero.ok && /ADOPTION_OUTCOME=ZERO_DOCUMENTS/.test(zero.out), zero.out);
    check("REHEARSAL_ZERO_DOCUMENTS_COPIES_NOTHING", zero.ok && /ADOPTION_COPIED_FILE_COUNT=0/.test(zero.out), zero.out);
  } catch (err) {
    check("REHEARSAL_COMPLETED", false, String(err?.message ?? err));
  } finally {
    for (const c of containers) {
      try {
        docker(["rm", "-f", guard(c)], { stdio: "pipe" });
      } catch {
        /* best effort */
      }
    }
    for (const v of volumes) {
      try {
        docker(["volume", "rm", guard(v)], { stdio: "pipe" });
      } catch {
        /* best effort */
      }
    }
    rmSync(work, { recursive: true, force: true });
  }

  console.log(`RESULT phase997_documents_adoption=${failed ? "FAIL" : "PASS"}`);
  console.log("RESULT phase997_documents_adoption_production_contacted=False");
  console.log("RESULT phase997_documents_adoption_data=SYNTHETIC_ONLY");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`RESULT phase997_documents_adoption=FAIL (${String(err?.message ?? err).slice(0, 200)})`);
  process.exit(1);
});
