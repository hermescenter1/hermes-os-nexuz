/**
 * PHASE 109-C2.1 — what "cleanup succeeded" means, and what to do when it did not.
 *
 * R6 swept once and stopped. It read a single `/proc` snapshot, signalled what
 * it saw, and treated the attempt itself as the outcome. That is the mistake
 * this module exists to prevent: a process forked after the snapshot survives
 * it, a failed scan observes nothing at all, and either way a live writer keeps
 * the pipe open and the single global slot is held for the life of the
 * container — from one request.
 *
 * ATTEMPTING A SWEEP IS NOT A FACT ABOUT THE WORLD. The only evidence that
 * cleanup worked is observable: stdout reached end of output AND the child
 * handle closed. `CleanupPlan` below is the decision that follows from that
 * evidence, extracted so every branch can be exercised without a container —
 * the same reason `VerdictGate` and `decideChildOutcome` are their own modules.
 *
 * Recovery is bounded on purpose. An attacker who can fork faster than the
 * supervisor can scan must not be able to hold it in a sweep loop, so after a
 * fixed number of attempts the supervisor stops trying to win that race and
 * takes the one action guaranteed to end every writer: it terminates itself.
 * `restart: always` brings the sidecar back and the container's cgroup takes
 * the whole remaining process tree with it. The caller already holds a bounded
 * refusal by then — the deadline produced it — and the socket is given a grace
 * to drain first, so recovery never turns a readable refusal into a reset.
 */

/** What the supervisor should do after one sweep attempt has been evaluated. */
export type CleanupStep =
  | { readonly action: "DONE" }
  | { readonly action: "SWEEP_AGAIN"; readonly attempt: number }
  | { readonly action: "TERMINATE_SELF" };

export interface CleanupState {
  /** Did stdout reach end of output — cleanly or otherwise? */
  readonly stdoutFinished: boolean;
  /** Has the child handle closed? */
  readonly childReaped: boolean;
  /** Attempts already made, zero-based. */
  readonly attempt: number;
  /** Hard cap on attempts. */
  readonly maxAttempts: number;
}

/**
 * True only when BOTH observable facts hold.
 *
 * Neither alone is enough: a reaped child says nothing about a descendant that
 * inherited the pipe, and a closed pipe says nothing about a process that has
 * not been accounted for.
 */
export function cleanupComplete(state: CleanupState): boolean {
  return state.stdoutFinished && state.childReaped;
}

/**
 * Should bounded cleanup be scheduled?
 *
 * THE NEGATION OF THE POSTCONDITION, AND NOTHING NARROWER. R7 guarded arming on
 * stdout completion alone while completeness needed both halves, so exactly one
 * incomplete state was excluded — stdout finished, child NOT reaped — and it is
 * reachable: a detached grandchild inheriting only fd 2 keeps stderr open, so
 * ChildProcess `close` never fires while stdout reaches a clean EOF. Measured,
 * that left the global slot held for the life of the container.
 *
 * Expressed here rather than inline in the supervisor for the same reason the
 * verdict and the cleanup steps are: inside a socket-bound entry point no unit
 * can reach it, which is how the half-guard survived review.
 *
 * Scheduling is cheap and idempotent — `runCleanup` re-checks the postcondition
 * before it sweeps anything, so arming on a healthy parse that has not yet been
 * reaped costs one unref'd timer and no signals.
 */
export function shouldArmCleanup(state: CleanupState): boolean {
  return !cleanupComplete(state);
}

/** Decide the next step from the evidence. Pure. */
export function nextCleanupStep(state: CleanupState): CleanupStep {
  if (cleanupComplete(state)) return { action: "DONE" };
  if (state.attempt + 1 < state.maxAttempts) {
    return { action: "SWEEP_AGAIN", attempt: state.attempt + 1 };
  }
  return { action: "TERMINATE_SELF" };
}
