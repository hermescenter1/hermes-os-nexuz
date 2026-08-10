#!/usr/bin/env node
/**
 * Hermes OS — Phase 99.7 `documents_data` adoption CLI (operator path).
 *
 * The one-time step that carries documents living on the legacy `hermes-web`
 * writable layer into the Phase 98 `documents_data` volume, before the old
 * container is removed and that data becomes unrecoverable.
 *
 * The runbook previously described this as an illustrative pair of `docker cp`
 * commands. That is not good enough for customer documents: a hand-typed copy
 * has no proof of completeness, no collision refusal and no way to tell
 * "there was nothing to copy" from "the copy silently did nothing". This CLI is
 * the executable, verifiable version of that step.
 *
 * Usage (both directories must already exist and be reachable from this host —
 * stage them with `docker cp` first; see the DR runbook):
 *
 *   node scripts/dr/adopt-documents.mjs \
 *     --source /tmp/hermes-documents-legacy \
 *     --dest   /tmp/hermes-documents-volume \
 *     --destination-classification EXPECTED_EMPTY \
 *     --manifest-out /tmp/hermes-documents-adoption.json
 *
 *   --plan-only   survey and decide, write nothing (always run this first)
 *
 * Fail-closed: any refusal exits non-zero and copies nothing. The source is
 * never modified or deleted, so the legacy container stays a complete fallback.
 * File contents are never printed.
 */

import { writeFileSync } from "node:fs";

import { executeDocumentAdoption, planDocumentAdoption } from "./documents-adoption.mjs";

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string,string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function fail(message) {
  console.error(`[adopt-documents] ${message}`);
  console.log("RESULT documents_adoption=FAIL");
  process.exit(2);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = typeof args.source === "string" ? args.source : null;
  const destDir = typeof args.dest === "string" ? args.dest : null;
  const classification = typeof args["destination-classification"] === "string" ? args["destination-classification"] : undefined;
  const planOnly = args["plan-only"] === true;
  const manifestOut = typeof args["manifest-out"] === "string" ? args["manifest-out"] : null;

  if (!sourceDir || !destDir) fail("--source and --dest are required");

  const plan = planDocumentAdoption({ sourceDir, destDir, destinationClassification: classification });

  console.log(`RESULT ADOPTION_SOURCE_FILE_COUNT=${plan.source.fileCount}`);
  console.log(`RESULT ADOPTION_SOURCE_TOTAL_BYTES=${plan.source.totalBytes}`);
  console.log(`RESULT ADOPTION_SOURCE_MANIFEST_SHA256=${plan.source.manifestSha256}`);
  console.log(`RESULT ADOPTION_DESTINATION_FILE_COUNT=${plan.destination.fileCount}`);
  console.log(`RESULT ADOPTION_OUTCOME=${plan.outcome}`);

  if (!plan.ok) {
    for (const b of plan.blockers) console.log(`  - BLOCKER ${b}`);
    for (const c of plan.collisions.slice(0, 20)) console.log(`  - COLLISION ${c}`);
    fail(`adoption refused: ${plan.blockers.join(", ")}`);
  }

  if (planOnly) {
    console.log("RESULT ADOPTION_MODE=PLAN_ONLY");
    console.log("RESULT documents_adoption=PLAN_OK");
    process.exit(0);
  }

  let record;
  try {
    record = executeDocumentAdoption(plan, { sourceDir, destDir });
  } catch (err) {
    fail(`adoption aborted: ${String(err?.code ?? "")} ${String(err?.message ?? err)}`);
    return;
  }

  console.log(`RESULT ADOPTION_COPIED_FILE_COUNT=${record.copiedFileCount}`);
  console.log(`RESULT ADOPTION_COPIED_TOTAL_BYTES=${record.copiedTotalBytes}`);
  console.log(`RESULT ADOPTION_MANIFEST_SHA256=${record.adoptedManifestSha256}`);
  console.log(`RESULT ADOPTION_INTEGRITY_VERIFIED=${record.integrityVerified}`);
  console.log(`RESULT ADOPTION_SOURCE_RETAINED=${record.sourceRetained}`);

  if (manifestOut) {
    // A safe, secret-free adoption record for the release evidence pack.
    writeFileSync(
      manifestOut,
      `${JSON.stringify(
        {
          outcome: record.outcome,
          plannedFileCount: record.plannedFileCount,
          plannedTotalBytes: record.plannedTotalBytes,
          copiedFileCount: record.copiedFileCount,
          copiedTotalBytes: record.copiedTotalBytes,
          sourceManifestSha256: record.sourceManifestSha256,
          adoptedManifestSha256: record.adoptedManifestSha256,
          integrityVerified: record.integrityVerified,
          sourceRetained: record.sourceRetained,
          destinationClassification: plan.destinationClassification,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`RESULT ADOPTION_MANIFEST_WRITTEN=${manifestOut}`);
  }

  if (!record.ok) {
    for (const b of record.blockers) console.log(`  - BLOCKER ${b}`);
    fail("adoption completed but integrity could not be proven");
  }

  console.log("RESULT documents_adoption=PASS");
  process.exit(0);
}

main();
