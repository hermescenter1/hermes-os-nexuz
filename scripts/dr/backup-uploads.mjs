#!/usr/bin/env node
/**
 * Hermes OS — Phase 98 encrypted uploads backup.
 *
 * Packs every durable upload surface into one deterministic archive with per-file
 * and manifest SHA-256, then seals it with the AES-256-GCM envelope (artifactType
 * "uploads"). Covers BOTH persistent upload locations discovered in Phase 98:
 *   public-uploads → /app/public/uploads      (volume uploads_data — avatars)
 *   data-documents → /app/.data/documents      (documents, extracted text, exports)
 *
 * Symlinks/traversal/absolute paths are refused. Nothing secret is printed.
 *
 * Usage:
 *   node scripts/dr/backup-uploads.mjs \
 *     --roots "public-uploads:/app/public/uploads,data-documents:/app/.data/documents" \
 *     --out /backups/uploads/hermes_uploads_<ts>.hbk \
 *     --key-file "$HERMES_BACKUP_KEY_FILE" --key-id "$HERMES_BACKUP_KEY_ID"
 */

import { writeFileSync, renameSync, chmodSync } from "node:fs";
import { packRoots } from "./uploads-archive.mjs";
import { encrypt, decrypt, loadKeyFile, transportSha256 } from "./backup-envelope.mjs";

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
  console.error(`RESULT phase98_uploads_backup=FAIL (${code}: ${msg})`);
  process.exit(1);
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  for (const k of ["roots", "out", "key-file", "key-id"]) {
    if (!a[k] || a[k] === true) fail("BAD_ARGS", `--${k} required`);
  }
  const roots = String(a.roots)
    .split(",")
    .map((pair) => {
      const idx = pair.indexOf(":");
      return { label: pair.slice(0, idx).trim(), dir: pair.slice(idx + 1).trim() };
    })
    .filter((r) => r.label && r.dir);
  if (roots.length === 0) fail("BAD_ARGS", "no valid roots parsed");

  const key = await loadKeyFile(a["key-file"]);
  let manifest, archive;
  try {
    ({ archive, manifest } = packRoots(roots));
  } catch (err) {
    fail(err?.code ?? "PACK_ERROR", String(err?.message ?? err));
    return;
  }

  const sealed = encrypt({
    plaintext: archive,
    key,
    keyId: a["key-id"],
    artifactType: "uploads",
    createdAt: a.created && a.created !== true ? a.created : new Date().toISOString(),
    extra: { fileCount: manifest.fileCount, manifestSha256: manifest.manifestSha256, roots: manifest.roots },
  });

  // Verify before publishing (authenticated round trip).
  decrypt({ buffer: sealed, key, expectArtifactType: "uploads" });

  const partial = `${a.out}.partial`;
  writeFileSync(partial, sealed, { mode: 0o600 });
  try {
    chmodSync(partial, 0o600);
  } catch {
    /* win32 */
  }
  renameSync(partial, a.out);

  const transport = transportSha256(sealed);
  const meta = {
    artifactType: "uploads",
    verified: true,
    partial: false,
    encrypted: true,
    keyId: a["key-id"],
    transportSha256: transport,
    createdAtMs: Date.now(),
    fileCount: manifest.fileCount,
    manifestSha256: manifest.manifestSha256,
    roots: manifest.roots,
  };
  writeFileSync(`${a.out}.meta.json`, JSON.stringify(meta) + "\n", { mode: 0o600 });

  console.log(`TRANSPORT_SHA256=${transport}`);
  console.log(`MANIFEST_SHA256=${manifest.manifestSha256}`);
  console.log(`FILE_COUNT=${manifest.fileCount}`);
  console.log(`RESULT phase98_uploads_backup=PASS`);
}

main().catch((err) => fail(err?.code ?? err?.name ?? "ERROR", String(err?.message ?? err).slice(0, 200)));
