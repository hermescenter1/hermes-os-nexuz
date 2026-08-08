/**
 * Hermes OS — Phase 98 retention runner.
 *
 * Scans the durable backup directory, builds artifact descriptors from the `.hbk`
 * files and their safe `.meta.json` sidecars, applies the verification-aware
 * retention policy (scripts/dr/backup-retention.mjs) and deletes ONLY the artifacts
 * the policy marks prunable. Never deletes the newest verified recovery point and
 * never lets a failed/unverified/partial artifact cause deletion of a good copy.
 * Prints only counts and filenames — never secrets or row data.
 *
 * Env: BACKUP_DIR, BACKUP_RETENTION_DAYS, BACKUP_MIN_VERIFIED_COPIES.
 */

import { readdirSync, readFileSync, statSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { selectPrunable } from "./backup-retention.mjs";

const BACKUP_DIR = process.env.BACKUP_DIR || "/backups/postgres";
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || "30");
const minVerifiedCopies = Number(process.env.BACKUP_MIN_VERIFIED_COPIES || "3");

function loadArtifacts(dir) {
  const names = readdirSync(dir);
  const artifacts = [];
  for (const name of names) {
    if (name.endsWith(".meta.json")) continue;
    if (name.endsWith(".hbk.partial")) {
      artifacts.push({
        name,
        createdAtMs: safeMtime(join(dir, name)),
        verified: false,
        partial: true,
        encrypted: true,
      });
      continue;
    }
    if (!name.endsWith(".hbk")) continue;
    const metaPath = join(dir, `${name}.meta.json`);
    let verified = false;
    let createdAtMs = safeMtime(join(dir, name));
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, "utf8"));
        verified = meta.verified === true;
        if (Number.isFinite(meta.createdAtMs)) createdAtMs = meta.createdAtMs;
      } catch {
        verified = false; // unreadable sidecar → treat as unverified (fail-safe)
      }
    }
    artifacts.push({ name, createdAtMs, verified, partial: false, encrypted: true });
  }
  return artifacts;
}

function safeMtime(p) {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

const artifacts = loadArtifacts(BACKUP_DIR);
const { prune, verifiedRetained } = selectPrunable(artifacts, {
  retentionDays,
  minVerifiedCopies,
  nowMs: Date.now(),
});

for (const p of prune) {
  const artifactPath = join(BACKUP_DIR, p.name);
  rmSync(artifactPath, { force: true });
  rmSync(`${artifactPath}.meta.json`, { force: true });
  console.log(`[retention] pruned ${p.name} (${p.reason})`);
}
console.log(
  `RESULT phase98_retention=PASS (pruned=${prune.length}, verifiedRetained=${verifiedRetained}, minVerified=${minVerifiedCopies})`,
);
