/**
 * PHASE 104-B1.3 — the application-acceptance gate, as a dependency-free
 * constant.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The gate must be ONE value that the server route and the public client
 * cannot disagree about. But `@/lib/ats/application.ts` pulls in `getPrisma`
 * → `@prisma/adapter-pg` → `pg` → node `tls`/`net`, so importing it from a
 * `"use client"` component drags the database driver into the browser bundle
 * and the production build fails outright.
 *
 * So the flag lives here, alone, with NO imports: `application.ts` re-exports
 * it for every server caller, and `ApplyFormClient` imports it directly.
 * There is still exactly one definition — flipping it is still a single,
 * reviewable edit — and the client bundle stays free of server-only code.
 *
 * Flipping this to `true` does NOT enable applications. The route also
 * requires an APPROVED retention policy, and B2 still owns the orchestration
 * (atomic idempotency claim → in-transaction eligibility re-check → persist →
 * claim completion). Acceptance is never a one-flag change.
 */
export const APPLICATION_ACCEPTANCE_AUTHORIZED = false;

/**
 * B2 orchestration: the atomic idempotency claim, the in-transaction
 * eligibility re-check, the persist, and the claim completion.
 *
 * Separate from the owner gate ON PURPOSE. The module header above already
 * states that flipping acceptance to `true` does not by itself make an
 * application work — but a UI that gates on the owner flag ALONE encodes the
 * opposite belief, and would start advertising an apply journey the moment the
 * owner flips one constant, while the route still refuses every submission.
 * Stating B2 as its own fact means the UI cannot make that mistake.
 */
export const APPLICATION_ORCHESTRATION_IMPLEMENTED = false;

/**
 * The ONE condition under which any apply affordance — link, button, form or
 * call to action — may appear anywhere in the careers journey. Both facts must
 * hold: the owner must have authorized acceptance, AND the server must actually
 * be able to accept. Either one alone is a promise the product cannot keep.
 */
export const APPLY_JOURNEY_OPEN =
  APPLICATION_ACCEPTANCE_AUTHORIZED && APPLICATION_ORCHESTRATION_IMPLEMENTED;
