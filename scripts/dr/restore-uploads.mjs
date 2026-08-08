#!/usr/bin/env node
/**
 * Hermes OS — Phase 98 encrypted uploads restore.
 *
 * Authenticates + decrypts an uploads `.hbk` (GCM tag verified before any write),
 * then unpacks each root to its destination with per-file digest verification,
 * aggregate manifest verification and strict path safety. Refuses corruption,
 * wrong key and path traversal. Never overwrites arbitrary host paths — every
 * entry is written under an explicitly provided destination directory.
 *
 * Usage:
 *   node scripts/dr/restore-uploads.mjs \
 *     --in <artifact.hbk> \
 *     --dest "public-uploads:/restore/public/uploads,data-documents:/restore/.data/documents" \
 *     --key-file "$HERMES_BACKUP_KEY_FILE" [--empty-check]
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { decrypt, loadKeyFile } from "./backup-envelope.mjs";
import { unpackRoots } from "./uploads-archive.mjs";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const k = argv[i].slice(2);
      out[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[(i += 1)] : true;
    }
  }
  return out;
}

function fail(code, msg) {
  console.error(`RESULT phase98_uploads_restore=FAIL (${code}: ${msg})`);
  process.exit(1);
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  for (const k of ["in", "dest", "key-file"]) if (!a[k] || a[k] === true) fail("BAD_ARGS", `--${k} required`);

  const destByLabel = {};
  for (const pair of String(a.dest).split(",")) {
    const idx = pair.indexOf(":");
    if (idx < 0) continue;
    destByLabel[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  if (Object.keys(destByLabel).length === 0) fail("BAD_ARGS", "no valid destinations parsed");

  // Rehearsal safety: restore only into EMPTY targets when --empty-check is set.
  if (a["empty-check"]) {
    for (const [label, dir] of Object.entries(destByLabel)) {
      if (existsSync(dir) && readdirSync(dir).length > 0) {
        fail("TARGET_NOT_EMPTY", `restore target for '${label}' is not empty: ${dir}`);
      }
    }
  }

  const key = await loadKeyFile(a["key-file"]);
  let plaintext;
  try {
    ({ plaintext } = decrypt({ buffer: readFileSync(a.in), key, expectArtifactType: "uploads" }));
  } catch (err) {
    fail(err?.code ?? "DECRYPTION_FAILED", String(err?.message ?? err));
    return;
  }

  let res;
  try {
    res = unpackRoots(plaintext, destByLabel);
  } catch (err) {
    fail(err?.code ?? "UNPACK_ERROR", String(err?.message ?? err));
    return;
  }

  console.log(`FILE_COUNT=${res.fileCount}`);
  console.log(`MANIFEST_SHA256=${res.manifestSha256}`);
  for (const [label, n] of Object.entries(res.byLabel)) console.log(`ROOT ${label}=${n}`);
  console.log(`RESULT phase98_uploads_restore=PASS`);
}

main().catch((err) => fail(err?.code ?? err?.name ?? "ERROR", String(err?.message ?? err).slice(0, 200)));
