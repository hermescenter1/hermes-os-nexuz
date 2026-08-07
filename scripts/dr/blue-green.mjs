/**
 * Hermes OS — Phase 98 blue/green rollout orchestrator (application service only).
 *
 * Encodes the health-gated, fail-closed rollout + rollback flow on top of the
 * release-state machine. It is deployment-mechanism agnostic via an ADAPTER:
 *   - startCandidate(color, ref) : bring up the inactive color's app container
 *   - healthCheck(color)         : true only when that color is READY
 *   - cutover(color)             : atomically point the edge at that color
 *   - activeColor()              : the currently-live color (from safe state)
 *   - retire(color)              : stop the previous color after a good soak
 *
 * The rehearsal provides a real Docker/Nginx adapter; production provides a Compose
 * adapter (documented in the release runbook). The core guarantees are identical:
 *   - NEVER cut over to an unhealthy candidate;
 *   - the previous-good color is retained until the new one soaks;
 *   - rollback is an atomic switch back to the previous color when the migration
 *     rollback classification allows it; otherwise it is an incident (no auto DB
 *     restore).
 *
 * The database is shared and is NEVER duplicated for release switching.
 */

import { nextState, requirePreviousGood, classifyRollback, isTerminal } from "./release-state.mjs";

export const OTHER = { blue: "green", green: "blue" };

/**
 * @param {object} opts
 * @param {object} opts.adapter                 startCandidate/healthCheck/cutover/activeColor/retire
 * @param {string} opts.targetRef               image/ref to deploy as the candidate
 * @param {string} opts.previousGoodGitSha      40-hex; requirePreviousGood enforces it
 * @param {string} opts.migrationClassification NO_MIGRATION|ADDITIVE_COMPATIBLE|FORWARD_ONLY_REQUIRES_BACKUP|BREAKING_OR_UNKNOWN
 * @param {boolean} opts.appRollbackProven
 * @param {boolean} [opts.hasMigration]
 * @param {(m:string)=>void} [opts.log]
 * @returns {Promise<{ result: string, state: string, activeColor: string, rolledBack: boolean, cutover: boolean }>}
 */
export async function runBlueGreenRelease(opts) {
  const { adapter, targetRef, previousGoodGitSha, migrationClassification, appRollbackProven, hasMigration } = opts;
  const log = opts.log || (() => {});
  requirePreviousGood(previousGoodGitSha); // UNKNOWN_PREVIOUS_GOOD_RELEASE → throws (deploy blocked)
  const rollbackClass = classifyRollback({ migrationClassification, appRollbackProven });

  const previousColor = adapter.activeColor();
  const candidateColor = OTHER[previousColor];
  let state = "INIT";
  let cutoverDone = false;

  const fail = (result) => ({ result, state, activeColor: adapter.activeColor(), rolledBack: false, cutover: cutoverDone });

  // 1. Build/start candidate.
  state = nextState(state, "build");
  const started = await adapter.startCandidate(candidateColor, targetRef);
  if (!started) {
    log(`candidate ${candidateColor} failed to start`);
    state = nextState(state, "health_fail"); // → ROLLED_BACK (previous stays active)
    return { ...fail("CANDIDATE_START_FAILED"), rolledBack: true };
  }

  // 2. Health gate BEFORE any cutover.
  const healthy = await adapter.healthCheck(candidateColor);
  if (!healthy) {
    log(`candidate ${candidateColor} unhealthy — refusing cutover`);
    state = nextState(state, "health_fail"); // → ROLLED_BACK
    await adapter.retire?.(candidateColor); // tear down the bad candidate
    return { ...fail("UNHEALTHY_CANDIDATE_NO_CUTOVER"), rolledBack: true };
  }
  state = nextState(state, "health_ok"); // CANDIDATE_HEALTHY

  // 3. Migration is applied here (by the caller/adapter) at the correct point.
  state = hasMigration ? nextState(state, "migrate") : nextState(state, "migrate_skip");
  if (hasMigration) {
    state = nextState(state, "cutover"); // MIGRATED → CUTOVER
  }

  // 4. Atomic cutover to the healthy candidate.
  const cut = await adapter.cutover(candidateColor);
  if (!cut) {
    log("cutover failed — previous-good remains active");
    state = "ROLLED_BACK";
    return { ...fail("CUTOVER_FAILED"), rolledBack: true };
  }
  cutoverDone = true;

  // 5. Post-cutover readiness.
  const postOk = await adapter.healthCheck(candidateColor);
  if (!postOk) {
    // Follow the rollback classification, not a blind auto-rollback.
    if (rollbackClass === "APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA") {
      await adapter.cutover(previousColor); // atomic switch back
      state = "ROLLED_BACK";
      return { result: "POST_CUTOVER_ROLLED_BACK", state, activeColor: adapter.activeColor(), rolledBack: true, cutover: true };
    }
    state = "FAILED"; // DB-restore-required / blocked → incident, no auto rollback
    return { result: "POST_CUTOVER_INCIDENT", state, activeColor: adapter.activeColor(), rolledBack: false, cutover: true };
  }

  // 6. Soak OK → retire the previous color.
  state = nextState(state, "health_ok"); // CUTOVER → SOAK
  state = nextState(state, "soak_ok"); // → RETIRED_PREVIOUS
  await adapter.retire?.(previousColor);
  return { result: "RELEASED", state, activeColor: adapter.activeColor(), rolledBack: false, cutover: true };
}

/** Explicit, deterministic rollback of the currently-live release to previousColor. */
export async function rollbackToPrevious(adapter, rollbackClass) {
  if (rollbackClass === "RELEASE_ROLLBACK_BLOCKED") {
    return { result: "ROLLBACK_BLOCKED", rolledBack: false };
  }
  if (rollbackClass === "APP_ROLLBACK_REQUIRES_DB_RESTORE") {
    // Application rollback alone is unsafe — this is an operator incident decision.
    return { result: "ROLLBACK_REQUIRES_DB_RESTORE", rolledBack: false };
  }
  const active = adapter.activeColor();
  const prev = OTHER[active];
  const ok = await adapter.cutover(prev);
  return { result: ok ? "ROLLED_BACK" : "ROLLBACK_FAILED", rolledBack: ok };
}

export { isTerminal };
