/**
 * PHASE 109-C2.0 — the companion's own origin admission policy.
 *
 * WHY THIS IS A SEPARATE POLICY AND NOT AN EDIT TO PHASE 109-C1
 * ------------------------------------------------------------
 * The Studio's `PERMITTED_ORIGINS_ROUND_1` says something true about the Studio:
 * it is a simulation workspace whose only producer is the local demo adapter, so
 * `imported` is not permitted there because nothing there can create it. Widening
 * that list to accommodate this companion would make the Studio's own guard
 * weaker while telling the reader nothing about why — and the C1 test suite pins
 * that list precisely so it cannot be widened by accident.
 *
 * So C1 is left byte-identical and the companion declares its own admission
 * policy. The two lists differ by exactly one member, `imported`, and they agree
 * on the thing that actually matters: BOTH REFUSE EVERY LIVE ORIGIN.
 *
 * WHY THE LIST IS WRITTEN OUT AND NOT DERIVED
 * -------------------------------------------
 * An earlier revision computed this as "every origin C1 knows about, minus every
 * live one". That reads elegantly and is the wrong shape for a security
 * allowlist: it makes admission the DEFAULT and refusal the exception. A new
 * member added to `DataOrigin` — `"streamed"`, say, or `"gateway-cached"` — would
 * have been admitted here silently, on the day it was added, by a module that
 * had never heard of it and whose author was never asked.
 *
 * An allowlist must be closed. These three members are enumerated, and anything
 * else is refused whether or not it is a member of the union. Adding a fourth is
 * an edit to this line plus an edit to the exhaustiveness test, which is exactly
 * the amount of friction the decision deserves.
 */

import {
  ALL_DATA_ORIGINS,
  isLiveOrigin,
  type DataOrigin,
} from "@/lib/automation-studio";

import { TIA_DIAGNOSTIC_CODES } from "./diagnostics";
import { TiaContractError } from "./contract";

/**
 * The closed allowlist. Exactly three members, enumerated.
 *
 * `satisfies` rather than a type annotation: the annotation would widen the
 * value to `readonly DataOrigin[]` and throw away the literal types, and the
 * exhaustiveness test needs the literals to compare against. `satisfies` keeps
 * them while still proving every member is a real `DataOrigin` — a typo like
 * `"authoured"` fails to compile.
 */
export const C2_PERMITTED_ORIGINS = Object.freeze([
  "simulated",
  "authored",
  "imported",
] as const) satisfies readonly DataOrigin[];

/**
 * Known origins this policy does not admit.
 *
 * INFORMATIONAL ONLY. Refusal does not consult this list — `isC2PermittedOrigin`
 * is allowlist-only and refuses anything absent from it, including values that
 * are not members of `DataOrigin` at all. This exists so a reader (and a test)
 * can see which known origins fall outside the allowlist today.
 */
export const C2_REFUSED_KNOWN_ORIGINS: readonly DataOrigin[] = Object.freeze(
  ALL_DATA_ORIGINS.filter(
    (origin) => !(C2_PERMITTED_ORIGINS as readonly string[]).includes(origin),
  ),
);

/** Every refused known origin that C1 classifies as a connection to real equipment. */
export const C2_REFUSED_LIVE_ORIGINS: readonly DataOrigin[] = Object.freeze(
  C2_REFUSED_KNOWN_ORIGINS.filter((origin) => isLiveOrigin(origin)),
);

/**
 * Fail closed.
 *
 * A value that is not a member of `DataOrigin` at all — which is what an
 * untrusted payload looks like once its type annotation is gone — is refused by
 * the same branch that refuses a live origin.
 */
export function isC2PermittedOrigin(origin: unknown): origin is DataOrigin {
  return (
    typeof origin === "string" &&
    (C2_PERMITTED_ORIGINS as readonly string[]).includes(origin)
  );
}

export function assertC2PermittedOrigin(origin: unknown): DataOrigin {
  if (!isC2PermittedOrigin(origin)) {
    throw new TiaContractError(
      TIA_DIAGNOSTIC_CODES.FORBIDDEN_ORIGIN,
      `origin "${String(origin)}" is not admitted. The TIA companion is an ` +
        `offline review surface: it has no controller connection, and no ` +
        `artifact may claim one.`,
    );
  }
  return origin;
}

/**
 * Whether the companion admits `imported`.
 *
 * Exposed as a named predicate rather than left implicit in the list, because
 * "C2 admits imported and C1 does not" is the single intentional difference
 * between the two policies and a reader should be able to find it by name.
 */
export function admitsImportedOrigin(): boolean {
  return isC2PermittedOrigin("imported");
}
