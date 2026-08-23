/**
 * Phase 107 Stage 6-A.2 — ONE definition of how a changed path is classified.
 *
 * `freeze-snapshot.mjs` and `diff-inventory.mjs` each carried their own copy of
 * this table. They drifted the moment a file landed in a category only one of
 * them knew about: `src/lib/org/context.ts` was added to the snapshot's rules
 * and not to the inventory's, so the snapshot classified 123 paths cleanly while
 * the inventory stopped with `UNCLASSIFIED=1` on the same tree.
 *
 * Two tables that must agree are one table. Both importers now read this.
 *
 * A path that matches NOTHING is deliberately left unclassified rather than
 * swept into an "other" bucket: an unexplained file in a security-sensitive diff
 * is exactly what a reviewer needs to see, and both callers exit non-zero on it.
 */
export const RULES = [
  { cat: "tests/mutations", why: "test or mutation proof",
    match: (p) => /__tests__|\.test\.(ts|tsx)$|mutation-proof/.test(p) },

  { cat: "audit harness", why: "the audit tool itself — reads pages, never edits them",
    match: (p) => p.startsWith("tools/audit/") },

  { cat: "documentation", why: "Stage 6-A analysis scripts and the written report",
    match: (p) => p.startsWith("docs/") },

  { cat: "i18n catalogs", why: "localized copy for the new refusal states",
    match: (p) => /^messages\/(en|de|fa)\.json$/.test(p) },

  { cat: "product auth/context", why: "the refusal vocabulary and the helpers that decide it",
    match: (p) =>
      /^src\/lib\/(auth\/context-result|auth\/refusal-vocabulary|billing\/context|api\/auth|org\/context)\.ts$/.test(p)
      || /^src\/lib\/ot-edge\/(http\/route-kit|services\/core)\.ts$/.test(p)
      || p === "src/lib/copilot/voice/guard.ts"
      || p === "src/lib/client/resource-request.ts" },

  { cat: "API consumers", why: "route forwards the refusal code so the UI can branch on it",
    match: (p) => p.startsWith("src/app/api/") },

  /*
   * Rendered route surfaces. Added when the Stage 6-B responsive fix touched
   * `src/app/[locale]/documents/explorer/page.tsx` — a genuine Phase 107 product
   * change that matched no rule, so the inventory correctly refused rather than
   * quietly filing it somewhere plausible.
   */
  { cat: "product route surfaces", why: "page or layout whose rendered structure Phase 107 changed",
    match: (p) => /^src\/app\/\[locale\]\/.*\.(tsx|ts)$/.test(p) },

  { cat: "UI async states", why: "renders an explicit state instead of silence or emptiness",
    match: (p) => p.startsWith("src/components/") || /^src\/lib\/(client|ot-operations)\//.test(p) },
];

/** The rule for a path, or `null` when nothing matches. */
export const classify = (p) => RULES.find((r) => r.match(p)) ?? null;
