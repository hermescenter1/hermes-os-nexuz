/**
 * PHASE 102 — Hermes Media & Video Hub: the editorial and processing state machines.
 *
 * Design authority: docs/phase102/architecture.md §5 and §11.
 *
 * This module is PURE. It performs no I/O, imports no database client and reads no
 * environment. Everything here is a total function over its arguments, so the whole
 * machine is testable without a database — which is the point: the `Article`
 * lifecycle is inlined in two route handlers with no table, and as a direct result
 * `IN_REVIEW` and `ARCHIVED` are declared but never written. Phase 102 declares the
 * table once, closed, with the required permission attached to each edge.
 *
 * Two separate machines live here and they are deliberately NOT merged:
 *
 *   - the EDITORIAL machine governs who may publish (a human decision), and
 *   - the PROCESSING machine governs whether the bytes may be served at all
 *     (a machine/operator determination).
 *
 * They intersect at exactly one place — `PROCESSING_STATE_REQUIRED_TO_PUBLISH` —
 * so an asset whose bytes were never validated, or were quarantined, cannot be
 * published no matter what permission the actor holds.
 */

import type { OrgPermission } from "@/lib/org/rbac";
import type {
  MediaEditorialAction,
  MediaLifecycleStatus,
  MediaProcessingState,
} from "./types";

// ── Permissions ──────────────────────────────────────────────────────────────

/**
 * The two permissions that appear on an editorial edge. `view_media` never
 * authorises a transition — it is a read permission — so it is deliberately not a
 * member of this type: a caller cannot pass it where a transition permission is
 * expected. `Extract<OrgPermission, …>` (rather than a free string union) means a
 * rename in `src/lib/org/rbac.ts` breaks this file at compile time instead of
 * silently producing an edge no role can ever satisfy.
 */
export type MediaTransitionPermission = Extract<
  OrgPermission,
  "manage_media" | "review_media"
>;

// ── Editorial machine (§11) ──────────────────────────────────────────────────

/** One directed edge of the editorial machine. */
export interface MediaEditorialTransition {
  readonly to: MediaLifecycleStatus;
  /** The vocabulary term persisted on the `MediaEditorialEvent` audit row. */
  readonly action: MediaEditorialAction;
  /** The organization permission the actor must hold to traverse this edge. */
  readonly permission: MediaTransitionPermission;
}

/**
 * The CLOSED editorial transition table.
 *
 * `DRAFT → SUBMITTED → IN_REVIEW → PUBLISHED → ARCHIVED`, with `REJECTED` reachable
 * from review and `DRAFT` reachable back from both `REJECTED` and `ARCHIVED`. Every
 * one of the six states is reachable, and every state except the two re-entry paths
 * has an exit, so nothing is a dead end an operator cannot get out of.
 *
 * Author-side moves (`SUBMIT`, `ARCHIVE`, `RESTORE`) require `manage_media`.
 * Review decisions (`START_REVIEW`, `PUBLISH`, `REJECT`) require `review_media`,
 * because publication makes an asset readable outside the editorial surface and —
 * at visibility `PUBLIC` — outside the tenant, so it is not the author's own call.
 *
 * Three absences are decisions, not omissions:
 *
 *   - `SUBMITTED → DRAFT` (author withdraws) is NOT an edge. The ADR grants
 *     `manage_media` "create/edit drafts, submit for review, archive" — not the
 *     power to pull an asset out from under a reviewer mid-decision. The return
 *     path to `DRAFT` is a reviewer's `REJECT`, which is recorded and attributable.
 *   - `ARCHIVED → PUBLISHED` is NOT an edge. Restoring lands in `DRAFT`, so a
 *     previously-published asset must pass review again before it is served. A
 *     direct edge would be a republication with no reviewer and no record.
 *   - `PUBLISHED → DRAFT` is NOT an edge. Withdrawing published material is
 *     `ARCHIVE` (which stamps `archivedAt` and writes an event) followed by
 *     `RESTORE`; collapsing the two would lose the archival record.
 */
export const MEDIA_EDITORIAL_TRANSITIONS: Readonly<
  Record<MediaLifecycleStatus, readonly MediaEditorialTransition[]>
> = {
  DRAFT: [
    { to: "SUBMITTED", action: "SUBMIT", permission: "manage_media" },
    { to: "ARCHIVED", action: "ARCHIVE", permission: "manage_media" },
  ],
  SUBMITTED: [
    { to: "IN_REVIEW", action: "START_REVIEW", permission: "review_media" },
    { to: "PUBLISHED", action: "PUBLISH", permission: "review_media" },
    { to: "REJECTED", action: "REJECT", permission: "review_media" },
  ],
  IN_REVIEW: [
    { to: "PUBLISHED", action: "PUBLISH", permission: "review_media" },
    { to: "REJECTED", action: "REJECT", permission: "review_media" },
  ],
  PUBLISHED: [{ to: "ARCHIVED", action: "ARCHIVE", permission: "manage_media" }],
  REJECTED: [
    { to: "DRAFT", action: "RESTORE", permission: "manage_media" },
    { to: "ARCHIVED", action: "ARCHIVE", permission: "manage_media" },
  ],
  ARCHIVED: [{ to: "DRAFT", action: "RESTORE", permission: "manage_media" }],
} as const;

/**
 * PHASE 102 — which editorial actions the `video_hub` entitlement gates.
 *
 * THE PROBLEM THE EXCEPTION SOLVES
 * A tenant whose `video_hub` entitlement has lapsed must not be able to keep
 * authoring or to publish anything new. But refusing EVERY transition would be
 * worse than useless: it would freeze already-published material on the public
 * site with no way to take it down, and it would strand assets mid-review with
 * no exit — `SUBMITTED` and `IN_REVIEW` lead only to `PUBLISHED` or `REJECTED`,
 * so gating both leaves nothing reachable. A commercial gate that traps a
 * customer's content in public view is not a commercial gate, it is a hostage.
 *
 * THE RULE
 * An action is exempt if and only if it CANNOT increase exposure and is the
 * customer's way to reduce it or tidy up:
 *
 *   ARCHIVE — the unpublish/cleanup edge. `PUBLISHED → ARCHIVED` is exactly how
 *             live material is withdrawn; `DRAFT → ARCHIVED` and
 *             `REJECTED → ARCHIVED` are cleanup.
 *   REJECT  — refuses publication outright, and it is the ONLY exit from
 *             `SUBMITTED` / `IN_REVIEW` that does not publish. Without it those
 *             two states have no non-publishing exit at all.
 *
 * Everything else is gated, because each either publishes or resumes authoring:
 * `SUBMIT`, `START_REVIEW`, `PUBLISH`, and `RESTORE` (which returns an archived
 * asset to `DRAFT` — the start of the authoring loop).
 *
 * The exemption is deliberately stated as a closed set over the action
 * vocabulary rather than as a predicate over states, so adding a new action
 * without classifying it fails the exhaustiveness test rather than defaulting to
 * exempt.
 */
export const MEDIA_EXPOSURE_REDUCING_ACTIONS: readonly MediaEditorialAction[] = [
  "ARCHIVE",
  "REJECT",
] as const;

/**
 * Whether traversing this edge requires an active `video_hub` entitlement.
 *
 * Fails CLOSED: anything not explicitly listed as exposure-reducing is gated.
 */
export function editorialActionRequiresEntitlement(action: MediaEditorialAction): boolean {
  return !MEDIA_EXPOSURE_REDUCING_ACTIONS.includes(action);
}

/** The state a newly created asset starts in. Matches the schema default. */
export const MEDIA_INITIAL_STATUS: MediaLifecycleStatus = "DRAFT";

/** The only lifecycle state in which an asset may be served publicly (§11). */
export const MEDIA_PUBLISHED_STATUS: MediaLifecycleStatus = "PUBLISHED";

/**
 * The only processing state from which `PUBLISH` may be traversed.
 *
 * This is the intersection of the two machines. It is enforced twice on purpose:
 * here, so a caller cannot construct an illegal publish, and again in the
 * repository's compare-and-swap predicate, so a concurrent quarantine that lands
 * between the check and the write still wins.
 */
export const PROCESSING_STATE_REQUIRED_TO_PUBLISH: MediaProcessingState = "READY";

/** Look up the single edge `from → to`, or null when no such edge exists. */
export function findEditorialTransition(
  from: MediaLifecycleStatus,
  to: MediaLifecycleStatus,
): MediaEditorialTransition | null {
  return MEDIA_EDITORIAL_TRANSITIONS[from].find((t) => t.to === to) ?? null;
}

/**
 * The pure authorisation predicate.
 *
 * `from === to` is false, not a no-op success: a repeated request is a conflict the
 * caller must see, and treating it as success would let a compare-and-swap that
 * matched nothing be reported as a completed transition.
 */
export function canTransition(
  from: MediaLifecycleStatus,
  to: MediaLifecycleStatus,
  permissions: readonly OrgPermission[],
): boolean {
  const edge = findEditorialTransition(from, to);
  if (!edge) return false;
  return permissions.includes(edge.permission);
}

/** Why a transition was refused. Distinguishing the two matters: an illegal move is
 *  a 409/422, a permission failure is a 403, and conflating them either leaks the
 *  machine's shape to an unauthorised caller or hides a real client bug. */
export type MediaTransitionRefusal =
  | "ILLEGAL_TRANSITION"
  | "FORBIDDEN"
  | "PROCESSING_NOT_READY";

export type MediaTransitionDecision =
  | { readonly ok: true; readonly transition: MediaEditorialTransition }
  | { readonly ok: false; readonly reason: MediaTransitionRefusal };

/**
 * The full decision, including the processing-state guard when the edge publishes.
 *
 * `processingState` is optional so the table can still be exercised in isolation;
 * when it is omitted and the edge is a publish, the decision fails closed with
 * `PROCESSING_NOT_READY` rather than assuming the bytes are fine.
 */
export function evaluateTransition(params: {
  from: MediaLifecycleStatus;
  to: MediaLifecycleStatus;
  permissions: readonly OrgPermission[];
  processingState?: MediaProcessingState;
}): MediaTransitionDecision {
  const edge = findEditorialTransition(params.from, params.to);
  if (!edge) return { ok: false, reason: "ILLEGAL_TRANSITION" };
  if (!params.permissions.includes(edge.permission)) {
    return { ok: false, reason: "FORBIDDEN" };
  }
  if (
    params.to === MEDIA_PUBLISHED_STATUS &&
    params.processingState !== PROCESSING_STATE_REQUIRED_TO_PUBLISH
  ) {
    return { ok: false, reason: "PROCESSING_NOT_READY" };
  }
  return { ok: true, transition: edge };
}

/** Every edge, flattened. Used by the tests to prove the table is exhaustive and by
 *  the operator surface to describe what an actor may do next. */
export function listEditorialTransitions(): ReadonlyArray<{
  from: MediaLifecycleStatus;
  to: MediaLifecycleStatus;
  action: MediaEditorialAction;
  permission: MediaTransitionPermission;
}> {
  const out: Array<{
    from: MediaLifecycleStatus;
    to: MediaLifecycleStatus;
    action: MediaEditorialAction;
    permission: MediaTransitionPermission;
  }> = [];
  for (const from of Object.keys(MEDIA_EDITORIAL_TRANSITIONS) as MediaLifecycleStatus[]) {
    for (const edge of MEDIA_EDITORIAL_TRANSITIONS[from]) {
      out.push({ from, to: edge.to, action: edge.action, permission: edge.permission });
    }
  }
  return out;
}

/** The moves an actor holding `permissions` may make from `from`, right now. */
export function allowedTransitionsFrom(
  from: MediaLifecycleStatus,
  permissions: readonly OrgPermission[],
): readonly MediaEditorialTransition[] {
  return MEDIA_EDITORIAL_TRANSITIONS[from].filter((t) =>
    permissions.includes(t.permission),
  );
}

// ── Processing machine (§5) ──────────────────────────────────────────────────

/**
 * Who drives a processing edge.
 *
 * `REQUEST` — an authenticated HTTP request may cause it (an upload completing).
 * `OPERATOR` — only the operator-run CLI in `scripts/` may cause it. There is no
 * background job runner in this platform (ADR §2.2): no queue library, no worker
 * container, no scheduler. Marking these `OPERATOR` is how the type system records
 * that nothing advances them on its own, rather than implying a worker that does
 * not exist.
 */
export type MediaProcessingDriver = "REQUEST" | "OPERATOR";

export interface MediaProcessingTransition {
  readonly to: MediaProcessingState;
  readonly driver: MediaProcessingDriver;
  /**
   * The permission an HTTP caller must hold. `null` for `OPERATOR` edges, which
   * are unreachable over HTTP at all — a null here is "no request can do this",
   * never "anyone may".
   */
  readonly permission: MediaTransitionPermission | null;
}

/**
 * The CLOSED processing transition table.
 *
 * `QUARANTINED` is TERMINAL, and that is the security-load-bearing decision in this
 * table. There is no virus scanner in this platform (ADR §9), so nothing here is
 * capable of vouching for bytes that validation already refused to vouch for; an
 * edge out of `QUARANTINED` could only ever be an operator asserting "it is probably
 * fine", which is exactly the optimistic assumption §5 exists to prevent. The remedy
 * for a quarantined asset is a fresh upload against a new asset, not a release.
 *
 * `READY → QUARANTINED` runs the other way and is allowed: pulling already-servable
 * bytes out of service is always permitted, because every edge that reduces exposure
 * is safe to take.
 *
 * `FAILED → PENDING_UPLOAD` is the retry path, which is what keeps `FAILED`
 * non-terminal and stops a transient write error from stranding an asset.
 */
export const MEDIA_PROCESSING_TRANSITIONS: Readonly<
  Record<MediaProcessingState, readonly MediaProcessingTransition[]>
> = {
  PENDING_UPLOAD: [
    { to: "UPLOADED", driver: "REQUEST", permission: "manage_media" },
    { to: "FAILED", driver: "REQUEST", permission: "manage_media" },
  ],
  UPLOADED: [
    { to: "VALIDATING", driver: "OPERATOR", permission: null },
    { to: "FAILED", driver: "OPERATOR", permission: null },
    { to: "QUARANTINED", driver: "OPERATOR", permission: null },
  ],
  VALIDATING: [
    { to: "READY", driver: "OPERATOR", permission: null },
    { to: "FAILED", driver: "OPERATOR", permission: null },
    { to: "QUARANTINED", driver: "OPERATOR", permission: null },
  ],
  READY: [{ to: "QUARANTINED", driver: "OPERATOR", permission: null }],
  FAILED: [{ to: "PENDING_UPLOAD", driver: "REQUEST", permission: "manage_media" }],
  QUARANTINED: [],
} as const;

/** The state a newly created asset starts in. Matches the schema default. */
export const MEDIA_INITIAL_PROCESSING_STATE: MediaProcessingState = "PENDING_UPLOAD";

/** Processing states from which nothing may move. */
export const TERMINAL_MEDIA_PROCESSING_STATES: readonly MediaProcessingState[] = [
  "QUARANTINED",
];

export function findProcessingTransition(
  from: MediaProcessingState,
  to: MediaProcessingState,
): MediaProcessingTransition | null {
  return MEDIA_PROCESSING_TRANSITIONS[from].find((t) => t.to === to) ?? null;
}

/** Pure structural predicate: is `from → to` an edge at all? */
export function canTransitionProcessing(
  from: MediaProcessingState,
  to: MediaProcessingState,
): boolean {
  return findProcessingTransition(from, to) !== null;
}

export type MediaProcessingRefusal =
  | "ILLEGAL_TRANSITION"
  | "FORBIDDEN"
  | "OPERATOR_ONLY";

export type MediaProcessingDecision =
  | { readonly ok: true; readonly transition: MediaProcessingTransition }
  | { readonly ok: false; readonly reason: MediaProcessingRefusal };

/**
 * Decide a processing transition for a given driver.
 *
 * An `OPERATOR` edge requested by a `REQUEST` driver is refused with `OPERATOR_ONLY`
 * — an HTTP route can never advance validation, because nothing over HTTP has
 * inspected the bytes.
 */
export function evaluateProcessingTransition(params: {
  from: MediaProcessingState;
  to: MediaProcessingState;
  driver: MediaProcessingDriver;
  permissions?: readonly OrgPermission[];
}): MediaProcessingDecision {
  const edge = findProcessingTransition(params.from, params.to);
  if (!edge) return { ok: false, reason: "ILLEGAL_TRANSITION" };
  if (params.driver === "OPERATOR") return { ok: true, transition: edge };
  if (edge.driver !== "REQUEST" || edge.permission === null) {
    return { ok: false, reason: "OPERATOR_ONLY" };
  }
  const held = params.permissions ?? [];
  if (!held.includes(edge.permission)) return { ok: false, reason: "FORBIDDEN" };
  return { ok: true, transition: edge };
}

/** Every processing edge, flattened — used by the exhaustiveness tests. */
export function listProcessingTransitions(): ReadonlyArray<{
  from: MediaProcessingState;
  to: MediaProcessingState;
  driver: MediaProcessingDriver;
}> {
  const out: Array<{
    from: MediaProcessingState;
    to: MediaProcessingState;
    driver: MediaProcessingDriver;
  }> = [];
  for (const from of Object.keys(
    MEDIA_PROCESSING_TRANSITIONS,
  ) as MediaProcessingState[]) {
    for (const edge of MEDIA_PROCESSING_TRANSITIONS[from]) {
      out.push({ from, to: edge.to, driver: edge.driver });
    }
  }
  return out;
}
