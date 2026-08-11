/**
 * PHASE 100 — unique attribution of release blockers.
 *
 * The defect this module removes: the same underlying fact was being counted
 * more than once, in two different vocabularies, so the release-blocker matrix
 * overstated how much was outstanding and hid which blockers were actually
 * distinct.
 *
 * Concretely. The Phase 99 readiness evaluator reports five groups —
 * PILOT_UAT_READINESS, PILOT_WORKFLOW_READINESS, PILOT_INCIDENT_READINESS,
 * PILOT_ONBOARDING and PILOT_SUPPORT — as BLOCKED_OWNER. Every one of them is
 * blocked for exactly one reason, and the evaluator says so in its own note:
 *
 *   "Pilot execution requires a customer the owner has not yet selected:
 *    PILOT_CUSTOMER_SELECTED=BLOCKED_OWNER"
 *
 * They are not five engineering deficits. They are one owner decision, observed
 * five times. Phase 100 ALREADY reports that decision individually, as
 * PILOT_CUSTOMER_SELECTED plus nine sibling pilot gates. So when Phase 100 also
 * rolled the Phase 99 readiness verdict up into a single
 * PHASE100_INTERNAL_TECHNICAL_READINESS blocker, that blocker carried no
 * identity of its own: every fact inside it was already named elsewhere in the
 * matrix. It was a duplicate wearing the label of an engineering gate.
 *
 * That mislabelling is the real harm. "Internal technical readiness is BLOCKED"
 * reads as "the engineering is unfinished", and the engineering is not
 * unfinished — all twenty repository-owned technical groups are PASS. The
 * blocker is commercial: no pilot customer has been chosen.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 *
 * Internal technical readiness answers ONE question: is the work this repository
 * owns complete? A readiness group that is blocked on an owner or pilot decision
 * is therefore attributed to the Phase 100 gate that already owns that decision,
 * and is NOT counted again here.
 *
 * This is emphatically not "ignore the blocked groups". Attribution is by a
 * CLOSED map, and it is honoured only when the gate that would inherit the fact
 * is genuinely present in the ledger and genuinely not-PASS. An unrecognised
 * blocked group, or a recognised one whose covering gates have gone missing,
 * leaves internal readiness BLOCKED and names itself — because an unattributed
 * blocker is exactly the thing that must never disappear quietly.
 *
 * Pure functions. No I/O, no clock, no process exit.
 */

/**
 * Phase 99 readiness groups that are blocked by an owner/pilot decision rather
 * than by unfinished engineering, and the Phase 100 gates that already carry
 * that same decision individually.
 *
 * A group appears here ONLY because its own blocking note names
 * PILOT_CUSTOMER_SELECTED as the cause. This map is a statement about identity,
 * not a convenience list, and adding to it without that evidence would re-open
 * the hole it closes.
 */
export const OWNER_ATTRIBUTED_READINESS_GROUPS = {
  PILOT_UAT_READINESS: ["PILOT_CUSTOMER_SELECTED", "PILOT_UAT"],
  PILOT_WORKFLOW_READINESS: ["PILOT_CUSTOMER_SELECTED", "PILOT_WORKFLOW_VALIDATION"],
  PILOT_INCIDENT_READINESS: ["PILOT_CUSTOMER_SELECTED", "PILOT_INCIDENT_SIMULATION"],
  PILOT_ONBOARDING: ["PILOT_CUSTOMER_SELECTED", "PILOT_ONBOARDING"],
  PILOT_SUPPORT: ["PILOT_CUSTOMER_SELECTED", "PILOT_SUPPORT_PROCESS"],
};

/**
 * Phase 99 gates that are AGGREGATES of facts Phase 100 counts individually.
 * Reported for continuity, never counted: `RELEASE_BLOCKERS_ZERO` sums the open
 * finding blockers and the pilot absence into one number and calls the result a
 * FAIL, which both double-counts the pilot and mislabels an absence.
 */
export const PHASE99_AGGREGATE_GATES = ["RELEASE_BLOCKERS_ZERO"];

/**
 * Decide the state of PHASE100_INTERNAL_TECHNICAL_READINESS.
 *
 * @param {{
 *   readinessState: string,
 *   blockedOn?: string[],
 *   gateStateOf: (gate: string) => string | null,
 * }} input
 *   `gateStateOf` returns the state a gate already holds in the Phase 100
 *   ledger, or null when the gate is not present.
 * @returns {{ state: "PASS"|"BLOCKED"|"FAIL", reason: string|null, errors: string[], attributedTo: Record<string,string[]>, unattributed: string[] }}
 */
export function attributeInternalReadiness({ readinessState, blockedOn = [], gateStateOf }) {
  if (readinessState === "UNAVAILABLE" || !readinessState) {
    return {
      state: "FAIL",
      reason: "the Phase 99 readiness evaluator could not be run — its verdict cannot be assumed",
      errors: [],
      attributedTo: {},
      unattributed: [],
    };
  }
  if (readinessState === "FAIL") {
    return {
      state: "FAIL",
      reason: "phase99_readiness=FAIL — a repository-owned technical group failed",
      errors: [],
      attributedTo: {},
      unattributed: [],
    };
  }
  if (readinessState === "PASS") {
    return { state: "PASS", reason: null, errors: [], attributedTo: {}, unattributed: [] };
  }

  // BLOCKED_OWNER (or any other blocked state): every blocked group must be
  // attributable to a Phase 100 gate that already carries the same fact.
  /** @type {Record<string, string[]>} */
  const attributedTo = {};
  const unattributed = [];
  const errors = [];

  for (const group of blockedOn) {
    const covering = OWNER_ATTRIBUTED_READINESS_GROUPS[group];
    if (!covering) {
      unattributed.push(group);
      errors.push(`${group}: blocked group is not attributable to any Phase 100 gate — it is counted here as its own blocker`);
      continue;
    }
    // The covering gates must EXIST and must still be withholding. If a covering
    // gate is missing, or has somehow gone PASS while the readiness evaluator
    // still reports the group blocked, the fact is no longer counted anywhere —
    // so it must be counted here.
    const present = covering.filter((g) => gateStateOf(g) !== null);
    const withholding = present.filter((g) => gateStateOf(g) !== "PASS");
    if (present.length === 0 || withholding.length === 0) {
      unattributed.push(group);
      errors.push(
        `${group}: expected Phase 100 gate(s) ${covering.join(", ")} to carry this blocker, but ` +
        (present.length === 0 ? "none are present in the ledger" : "all of them are PASS"),
      );
      continue;
    }
    attributedTo[group] = withholding;
  }

  if (unattributed.length > 0) {
    return {
      state: "BLOCKED",
      reason: `phase99_readiness=${readinessState} (unattributed: ${unattributed.join(",")})`,
      errors,
      attributedTo,
      unattributed,
    };
  }

  const groups = Object.keys(attributedTo);
  return {
    state: "PASS",
    reason:
      groups.length === 0
        ? null
        : `every repository-owned technical group is complete; ${groups.length} owner-blocked group(s) ` +
          `(${groups.join(",")}) are counted once as the Phase 100 pilot gates they belong to, not again here`,
    errors: [],
    attributedTo,
    unattributed: [],
  };
}

/**
 * Prove the assembled ledger attributes every blocker exactly once.
 *
 * Returns the violations, so the evaluator can record this as its own gate
 * rather than assert it in a comment. Three distinct properties are checked,
 * because they fail in different ways:
 *
 *   1. identity   — no gate name appears twice.
 *   2. exclusion  — no Phase 99 aggregate is inside the counted set.
 *   3. coverage   — every attributed fact is still counted by its covering gate.
 *
 * @param {{name: string, group: string, state: string}[]} ledger
 * @param {string} informationalGroup
 * @param {{ attributedTo?: Record<string, string[]> }} [attribution]
 * @returns {string[]}
 */
export function attributionViolations(ledger, informationalGroup, { attributedTo = {} } = {}) {
  const violations = [];

  const seen = new Set();
  for (const g of ledger) {
    if (seen.has(g.name)) violations.push(`DUPLICATE_GATE_IDENTITY: ${g.name} appears more than once in the ledger`);
    seen.add(g.name);
  }

  for (const name of PHASE99_AGGREGATE_GATES) {
    const entry = ledger.find((g) => g.name === name);
    if (entry && entry.group !== informationalGroup) {
      violations.push(
        `DOUBLE_COUNTED_AGGREGATE: ${name} is a Phase 99 aggregate of facts Phase 100 counts individually, ` +
        `but it sits in the counted group '${entry.group}'`,
      );
    }
  }

  for (const [group, covering] of Object.entries(attributedTo)) {
    for (const gate of covering) {
      const entry = ledger.find((g) => g.name === gate);
      if (!entry) {
        violations.push(`LOST_BLOCKER: ${group} was attributed to ${gate}, which is not in the ledger`);
      } else if (entry.state === "PASS") {
        violations.push(`LOST_BLOCKER: ${group} was attributed to ${gate}, which is PASS — the blocker is now counted nowhere`);
      }
    }
  }

  return violations;
}
