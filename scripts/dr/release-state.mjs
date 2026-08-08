/**
 * Hermes OS — Phase 98 deterministic release rollout state machine + rollback
 * classification.
 *
 * A pure, in-memory state machine that models the lifecycle of a single
 * production release from "just built" through "old version retired". It
 * never touches the network, the database or the filesystem — it only
 * decides, given the current state and an event, what the next legal state
 * is, and throws on any transition that is not explicitly modeled. This
 * makes the rollout logic itself testable without a real deploy.
 *
 * A release can fail at several points. Failing BEFORE cutover (health check
 * on the candidate, a failed migration) is always safe: the previous good
 * release is still active, so the candidate is simply rolled back with no
 * user-visible impact. Failing AFTER cutover (post-cutover health check,
 * soak-period regression) is only safe to auto-rollback at the application
 * layer if no incompatible schema change was introduced, OR an app rollback
 * has been proven safe to run forward against the new schema. Otherwise the
 * failure is escalated to a human-operated incident rather than silently
 * flipping traffic back to code that may not be compatible with the current
 * database schema.
 */

/** @typedef {"NO_MIGRATION"|"ADDITIVE_COMPATIBLE"|"FORWARD_ONLY_REQUIRES_BACKUP"|"BREAKING_OR_UNKNOWN"} MigrationClassification */
/** @typedef {"APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA"|"APP_ROLLBACK_REQUIRES_DB_RESTORE"|"RELEASE_ROLLBACK_BLOCKED"} RollbackClassification */

/** @type {readonly string[]} */
export const RELEASE_STATES = Object.freeze([
  "INIT",
  "CANDIDATE_BUILT",
  "CANDIDATE_HEALTHY",
  "MIGRATED",
  "CUTOVER",
  "SOAK",
  "RETIRED_PREVIOUS",
  "ROLLED_BACK",
  "FAILED",
]);

/** States from which no further transition is possible. */
const TERMINAL_STATES = new Set(["RETIRED_PREVIOUS", "ROLLED_BACK", "FAILED"]);

/**
 * @param {string} state
 * @returns {boolean}
 */
export function isTerminal(state) {
  return TERMINAL_STATES.has(state);
}

/**
 * Legal (state, event) -> nextState transitions. Anything not listed here is
 * an illegal transition and `nextState` throws.
 * @type {Record<string, Record<string, string>>}
 */
const TRANSITIONS = {
  INIT: {
    build: "CANDIDATE_BUILT",
  },
  CANDIDATE_BUILT: {
    health_ok: "CANDIDATE_HEALTHY",
    health_fail: "ROLLED_BACK",
  },
  CANDIDATE_HEALTHY: {
    migrate: "MIGRATED",
    migrate_skip: "CUTOVER",
    migrate_fail: "ROLLED_BACK",
  },
  MIGRATED: {
    cutover: "CUTOVER",
    cutover_fail: "ROLLED_BACK",
  },
  CUTOVER: {
    health_ok: "SOAK",
    // health_fail after cutover is NOT modeled as a plain transition: the
    // legal next state depends on the rollback classification, so callers
    // must use `postCutoverFailure` instead.
  },
  SOAK: {
    soak_ok: "RETIRED_PREVIOUS",
    // soak_fail similarly depends on rollback classification; see
    // `postCutoverFailure` (the same rule applies after soak).
  },
};

/**
 * Pure state transition function.
 *
 * @param {string} current a member of RELEASE_STATES
 * @param {string} event
 * @returns {string} the next state
 * @throws {Error} if the (current, event) pair is not a legal transition
 */
export function nextState(current, event) {
  if (isTerminal(current)) {
    throw new Error(`ILLEGAL_TRANSITION: state "${current}" is terminal, cannot accept event "${event}"`);
  }
  const forState = TRANSITIONS[current];
  const to = forState ? forState[event] : undefined;
  if (!to) {
    throw new Error(`ILLEGAL_TRANSITION: no transition for state "${current}" on event "${event}"`);
  }
  return to;
}

/**
 * Decide the outcome of a health-check (or soak-check) failure that occurs
 * AFTER cutover has already happened. Because traffic has already moved to
 * the new release, this is never a plain, always-safe rollback: it depends
 * on whether the schema change (if any) is compatible with the previous
 * application code.
 *
 * @param {RollbackClassification} rollbackClassification
 * @returns {"ROLLED_BACK"|"FAILED"}
 */
export function postCutoverFailure(rollbackClassification) {
  return rollbackClassification === "APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA" ? "ROLLED_BACK" : "FAILED";
}

/**
 * Classify whether a rollback of the APPLICATION layer alone (without a
 * database restore) is safe, given the migration that shipped with this
 * release and whether an app-level rollback path has actually been proven
 * (e.g. via a rehearsal) to run correctly forward against the new schema.
 *
 * @param {{ migrationClassification: MigrationClassification, appRollbackProven: boolean }} params
 * @returns {RollbackClassification}
 */
export function classifyRollback({ migrationClassification, appRollbackProven }) {
  if (migrationClassification === "NO_MIGRATION") {
    // No schema change shipped, so there is nothing the old app code could
    // be incompatible with.
    return "APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA";
  }

  if (migrationClassification === "BREAKING_OR_UNKNOWN") {
    // A breaking (or unclassifiable) schema change makes an automatic
    // app-only rollback unsafe; this must be escalated to a human-decided
    // recovery plan (e.g. DB restore), not auto-resolved here.
    return "RELEASE_ROLLBACK_BLOCKED";
  }

  // ADDITIVE_COMPATIBLE or FORWARD_ONLY_REQUIRES_BACKUP.
  return appRollbackProven === true ? "APP_ROLLBACK_SAFE_WITH_NEW_SCHEMA" : "APP_ROLLBACK_REQUIRES_DB_RESTORE";
}

const GIT_SHA40_RE = /^[0-9a-f]{40}$/;

/**
 * Guard called before any rollout begins: a release must always have a
 * known-good previous commit to fall back to. Throws (rather than returning
 * a boolean) so callers cannot accidentally proceed on a falsy-but-ignored
 * result.
 *
 * @param {unknown} previousGoodGitSha
 * @returns {void}
 * @throws {Error} UNKNOWN_PREVIOUS_GOOD_RELEASE if not a 40-char lowercase hex sha
 */
export function requirePreviousGood(previousGoodGitSha) {
  if (typeof previousGoodGitSha !== "string" || !GIT_SHA40_RE.test(previousGoodGitSha)) {
    throw new Error("UNKNOWN_PREVIOUS_GOOD_RELEASE: deploy blocked without a valid previous-good git sha");
  }
}
