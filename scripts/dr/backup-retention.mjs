/**
 * Hermes OS — Phase 98 backup retention & restore-point selection.
 *
 * Retention must NEVER destroy the ability to recover. A failed or unverified new
 * backup must never trigger deletion of a known-good recovery point, and the
 * newest verified backup is sacrosanct. Pruning is allowed ONLY for artifacts
 * that are encrypted, verified, SUPERSEDED (not among the newest N verified) and
 * age-eligible. Incomplete `.partial` artifacts are never recovery points and are
 * never selected for restore.
 *
 * Pure functions over artifact descriptors — no filesystem side effects here, so
 * the policy can be unit-tested deterministically. The shell/CLI layer scans the
 * backup directory + verification records to build the descriptors, then acts on
 * the returned decision.
 *
 * @typedef {Object} Artifact
 * @property {string} name           filename (e.g. hermes_postgres_2026....hbk or *.partial)
 * @property {number} createdAtMs    creation time (epoch ms)
 * @property {boolean} verified      verification record says "verified"
 * @property {boolean} partial       true if this is an incomplete `.partial` artifact
 * @property {boolean} encrypted     true if this is a `.hbk` encrypted artifact
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Choose which artifacts to prune. Returns the decision without mutating input.
 *
 * @param {Artifact[]} artifacts
 * @param {Object} opts
 * @param {number} opts.retentionDays        max age for a verified, superseded copy
 * @param {number} opts.minVerifiedCopies    minimum verified copies to always retain
 * @param {number} opts.nowMs                current time (epoch ms) — injected for determinism
 * @returns {{ keep: Artifact[], prune: Array<{name:string, reason:string}>, verifiedRetained: number }}
 */
export function selectPrunable(artifacts, { retentionDays, minVerifiedCopies, nowMs }) {
  if (!Number.isFinite(retentionDays) || retentionDays < 0) throw new Error("retentionDays must be >= 0");
  if (!Number.isInteger(minVerifiedCopies) || minVerifiedCopies < 1) throw new Error("minVerifiedCopies must be >= 1");
  if (!Number.isFinite(nowMs)) throw new Error("nowMs is required");
  const cutoff = nowMs - retentionDays * DAY_MS;

  // Verified, complete, encrypted recovery points — newest first.
  const verified = artifacts
    .filter((a) => a.verified && !a.partial && a.encrypted)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  const keepNames = new Set();
  const prune = [];

  // 1. Always protect the newest `minVerifiedCopies` verified copies (and thus the
  //    single newest verified recovery point, which is index 0).
  const protectedCount = Math.max(minVerifiedCopies, 1);
  verified.slice(0, protectedCount).forEach((a) => keepNames.add(a.name));

  // 2. Among the SUPERSEDED verified copies (beyond the protected window), prune
  //    only those older than the retention cutoff. This can never reduce the
  //    verified count below minVerifiedCopies because the protected window is kept.
  for (const a of verified.slice(protectedCount)) {
    if (a.createdAtMs < cutoff) {
      prune.push({ name: a.name, reason: "verified,superseded,age-eligible" });
    } else {
      keepNames.add(a.name);
    }
  }

  // 3. Non-recovery-point artifacts: incomplete `.partial` files and unverified
  //    dumps. These NEVER count as verified copies and are never restore targets.
  //    Age-eligible ones may be cleaned; deleting them can never touch a verified
  //    copy (they are a disjoint set from `verified`).
  for (const a of artifacts) {
    if (a.verified && !a.partial && a.encrypted) continue; // already handled above
    if (a.partial) {
      if (a.createdAtMs < cutoff) prune.push({ name: a.name, reason: "incomplete-partial,age-eligible" });
      else keepNames.add(a.name);
    } else {
      // unverified / non-encrypted leftover
      if (a.createdAtMs < cutoff) prune.push({ name: a.name, reason: "unverified,age-eligible" });
      else keepNames.add(a.name);
    }
  }

  const pruneNames = new Set(prune.map((p) => p.name));
  const keep = artifacts.filter((a) => !pruneNames.has(a.name));
  const verifiedRetained = keep.filter((a) => a.verified && !a.partial && a.encrypted).length;

  // Hard invariant: retention must never leave zero verified copies when at least
  // one existed. (Guaranteed by the protected window, but assert defensively.)
  if (verified.length > 0 && verifiedRetained < Math.min(protectedCount, verified.length)) {
    throw new Error("retention would drop protected verified copies — refusing");
  }

  return { keep, prune, verifiedRetained };
}

/**
 * Select the artifact to restore from: the NEWEST verified, complete, encrypted
 * recovery point. Never a `.partial`, never an unverified dump. Returns null if
 * there is no valid recovery point (caller must fail closed).
 *
 * @param {Artifact[]} artifacts
 * @returns {Artifact|null}
 */
export function selectRestoreArtifact(artifacts) {
  const candidates = artifacts
    .filter((a) => a.verified && !a.partial && a.encrypted)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  return candidates[0] ?? null;
}
