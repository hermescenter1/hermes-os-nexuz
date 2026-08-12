import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  LOCALES,
  auditMediaHub,
  guardViolations,
  type GuardReport,
} from "../../components/media/__tests__/_guard";

/**
 * PHASE 102 / RELEASE BLOCKER 1 — the `mediaHub` key contract, derived from the
 * TypeScript AST of the media sources and resolved against the shipped catalogs.
 *
 * WHY THIS TEST EXISTS
 * The `mediaHub` namespace and the 21 media components were authored in
 * parallel, to two different key specs. Measured against the catalog, 58 of the
 * static keys the components called resolved to nothing and all 13 dynamic key
 * families resolved to nothing, so every media surface emitted next-intl
 * MISSING_MESSAGE at runtime — while the whole suite stayed green. This file is
 * the only place where the component sources and `messages/{fa,en,de}.json` are
 * compared, so it is the only thing standing between that failure and a repeat.
 *
 * WHY IT IS NOT A HARD-CODED LIST
 * A hard-coded list of expected keys rots the moment somebody adds a `t()` call,
 * which is the exact failure it is meant to catch. The key set is therefore
 * re-derived AT TEST TIME by `auditMediaHub` (see `_guard.ts`), which parses each
 * media source with the TypeScript compiler API and walks the AST:
 *
 *   1. every file that BINDS the namespace is collected — by binding, not by the
 *      spelling of the variable, so `const tr = useTranslations("mediaHub")`
 *      counts exactly as much as `const t = …`;
 *   2. every literal key argument contributes a static key, whatever quote style
 *      it is written in;
 *   3. every template-literal key contributes a key FAMILY, expanded against the
 *      ACTUAL member set of the union that feeds it — read out of
 *      `src/lib/media/types.ts`, `src/components/media/logic.ts` and the two
 *      state components, never guessed. `lifecycle.${status}` expands to exactly
 *      the members of `MEDIA_LIFECYCLE_STATUSES`, so a seventh member grows the
 *      expansion and the catalog must follow.
 *
 * A comment is invisible to all of this, because comments are not AST nodes —
 * the regular expression this replaced treated `// t("someKey")` as a real call.
 *
 * Every derived key must resolve to a non-empty string in ALL THREE languages. A
 * key present in `en` but missing in `de` is not a lesser bug: the German user
 * gets the raw key path on screen.
 *
 * THE GUARD ITSELF IS TESTED. `src/components/media/__tests__/
 * mediahub-guard-mutation.test.ts` breaks one fact at a time in an out-of-repo
 * clone and asserts this audit turns red — including the two cases the old
 * regular expression silently missed and the one it falsely reported.
 */

const REPO_ROOT = path.resolve(__dirname, "../../..");
const report: GuardReport = auditMediaHub(REPO_ROOT);

describe("mediaHub — the key contract is derived from the components", () => {
  it("finds the media surfaces that bind the namespace", () => {
    // A regression that deletes the components, renames the namespace or moves
    // the directory would otherwise make this whole file vacuously pass.
    expect(report.files.length).toBeGreaterThanOrEqual(20);
    expect(report.files).toContain("src/components/media/MediaPlayer.tsx");
    expect(report.files).toContain("src/app/[locale]/videos/page.tsx");
  });

  it("derives a non-trivial key set, not an empty one", () => {
    expect(report.keys.length).toBeGreaterThanOrEqual(150);
    expect(report.families.length).toBeGreaterThanOrEqual(13);
  });

  it("maps every dynamic key family to a real vocabulary", () => {
    // An unmapped family means a whole group of keys silently stops being
    // checked, which is the failure mode this file exists to prevent. Adding a
    // `t(\`prefix.\${x}\`)` call therefore also requires teaching `_guard.ts`
    // which union feeds it.
    expect(report.unmappedFamilies).toEqual([]);
  });

  it("resolves every key argument statically", () => {
    // `t(someVariable)` is a key path no static analysis can check, so it is a
    // hard failure rather than a silent gap: the call would be invisible to the
    // catalog comparison below while still being able to miss at runtime.
    expect(report.unresolvableCalls).toEqual([]);
  });

  it("never guesses which namespace a translator name belongs to", () => {
    // One local name bound to `mediaHub` in one place and to another namespace
    // elsewhere in the same file would make every one of its calls a coin flip.
    expect(report.ambiguousBindings).toEqual([]);
  });

  it("expands lifecycle.${status} over exactly the database vocabulary", () => {
    // Spot-check that the expansion really tracks the source of truth rather
    // than a list copied into this file.
    expect(report.vocabularies["lifecycle.${status}"]).toEqual([
      "DRAFT", "SUBMITTED", "IN_REVIEW", "PUBLISHED", "REJECTED", "ARCHIVED",
    ]);
    for (const status of report.vocabularies["lifecycle.${status}"]) {
      expect(report.keys).toContain(`lifecycle.${status}`);
    }
  });
});

describe.each(LOCALES)("mediaHub — %s resolves every derived key", (locale) => {
  it("has no missing key", () => {
    expect(report.missing[locale]).toEqual([]);
  });

  it("has no key that resolves to an empty string", () => {
    expect(report.blank[locale]).toEqual([]);
  });

  it("has no key that resolves to an object instead of a string", () => {
    // The failure that started this: `filters.duration` was an object of
    // options while the component reads it as the field LABEL. next-intl throws
    // INSUFFICIENT_PATH rather than rendering anything.
    expect(report.notLeaf[locale]).toEqual([]);
  });
});

describe("mediaHub — ICU arguments agree across the three languages", () => {
  it("keeps fa and de on the same placeholders as en", () => {
    expect(report.placeholderDrift).toEqual([]);
  });
});

/* ═══════════════════════════ no orphans ship ═══════════════════════════ */

/**
 * PHASE 102 / RELEASE BLOCKER 1 — the orphan ban.
 *
 * The catalog used to carry 401 `mediaHub` leaves reached by no `t()` call
 * anywhere in the tree — drafted copy for surfaces this phase deliberately did
 * not ship (upload, the moderation queue, the editorial workflow, the player
 * settings menu). Counting that as coverage inflated the German gate's leaf
 * arithmetic and misrepresented how much of the namespace is actually
 * measured: the gate must track parity of the ACTIVE catalog, not of drafted
 * copy nobody reads. Those 401 leaves were therefore deleted from all three
 * catalogs rather than pinned.
 *
 * The invariant going forward is that the orphan set is EMPTY. Adding a
 * `mediaHub` leaf without a surface that reads it fails here immediately,
 * which is the correct failure: unshipped copy does not get to accumulate
 * silently again.
 */
describe("mediaHub — every catalog leaf is reached; nothing ships unused", () => {
  const REACHED = 162;

  it("reaches exactly the leaves the shipped surfaces read", () => {
    expect(report.keys.length).toBe(REACHED);
  });

  it("carries zero leaves that no surface reads", () => {
    expect(report.orphans).toEqual([]);
  });

  it("accounts for every leaf in the namespace exactly once, with none unclassified", () => {
    expect(report.catalogLeaves.length).toBe(REACHED);
    const reached = new Set(report.keys);
    const orphaned = new Set(report.orphans);
    // Mutual exclusivity: no leaf may be both reached and orphaned.
    const bothReachedAndOrphaned = report.catalogLeaves.filter(
      (leaf) => reached.has(leaf) && orphaned.has(leaf),
    );
    expect(bothReachedAndOrphaned).toEqual([]);
    // Exhaustiveness: every leaf must land in exactly one of the two sets —
    // a leaf that is neither reached nor orphaned would be a classification
    // gap in the guard itself, not a property of the catalog.
    const UNCLASSIFIED_ORPHANS = report.catalogLeaves.filter(
      (leaf) => !reached.has(leaf) && !orphaned.has(leaf),
    );
    expect(UNCLASSIFIED_ORPHANS).toEqual([]);
  });
});

/* ═══════════════════════════ the verdict ═══════════════════════════ */

describe("mediaHub — the audit's own verdict is green", () => {
  it("reports no violation of any kind", () => {
    // The single boolean the mutation suite asserts on. Restating it here means
    // the repo is measured by exactly the predicate the mutations exercise —
    // a mutation proven to turn `guardViolations` red is proven to fail CI.
    expect(guardViolations(report)).toEqual([]);
  });
});
