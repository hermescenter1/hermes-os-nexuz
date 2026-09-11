/**
 * PHASE 109-C-UI.2-R5 stage 2 — ONE process of a two-process concurrency probe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE IS SHAPED SO ODDLY
 * ─────────────────────────────────────────────────────────────────────────────
 * R4 found that `Promise.all` inside one Node process does NOT race: the two
 * calls interleave at their awaits, so the first insert commits before the
 * second lookup begins and the partial unique index never has to decide
 * anything. Dropping the index left the suite green — a surviving mutation, and
 * proof that a single-process test cannot exercise a database-level guard.
 *
 * So this file is deliberately not a self-contained test. It is ONE HALF of a
 * race that `r5-two-process.mjs` sets up: the harness starts two independent
 * `vitest` processes — separate OS processes, separate PostgreSQL connections —
 * and hands each a different idempotency key, the SAME scope, and a shared
 * wall-clock instant to start at. Each process prints its outcome, and the
 * harness asserts that exactly one of them claimed the scope.
 *
 * Run it by hand and it skips, loudly, rather than pretending to have tested
 * concurrency on its own.
 */

import { describe, expect, it } from "vitest";

const KEY = process.env.R5_CLAIM_KEY;
const START_AT = Number(process.env.R5_START_AT ?? "0");
const SCOPE_SITE = process.env.R5_SCOPE_SITE ?? "";
const ORG = process.env.R5_ORG ?? "";

const configured = Boolean(KEY && START_AT > 0 && SCOPE_SITE && ORG);

describe.skipIf(!configured)("R5 · one half of a two-process claim race", () => {
  it("claims the scope, or is refused by the database", async () => {
    const { claimRun } = await import("@/lib/industrial/automation-run-store");

    // Busy-wait to the shared instant. `setTimeout` would be enough for a
    // millisecond-scale rendezvous, but the last stretch is spun deliberately:
    // the two processes must enter `claimRun` as close together as the OS
    // allows, or the race is decided by scheduling rather than by the index.
    const waitMs = START_AT - Date.now();
    if (waitMs > 50) await new Promise((r) => setTimeout(r, waitMs - 40));
    while (Date.now() < START_AT) { /* spin to the instant */ }

    const outcome = await claimRun({
      organizationId: ORG,
      request: {
        scopeMode: "SITE",
        siteId: SCOPE_SITE,
        idempotencyKey: KEY as string,
        reason: null,
        confirmOrganisationWide: false,
      },
      requestId: `r5-${KEY}`,
      actorId: null,
      actorRole: "OWNER",
      authMethod: "jwt",
      sitesIncluded: [SCOPE_SITE],
      sitesExcluded: [],
      nowMs: Date.now(),
    });

    /*
      Report to the harness through a FILE, not through stdout.

      The first version only printed the line, and the reporter did not surface
      it: both processes claimed nothing as far as the harness could see, even
      though the database showed exactly one row. A race whose result is read
      out of a test runner's log formatting is a race decided by the reporter.
      The line is still printed for a human reading the run; the file is what
      the harness trusts.

      NEITHER outcome is a failure for one process — the property under test is
      a fact about the PAIR, and only the harness can see both.
    */
    console.log(`R5_CLAIM_OUTCOME=${outcome.outcome} KEY=${KEY} PID=${process.pid}`);
    const outFile = process.env.R5_OUTCOME_FILE;
    if (outFile) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(outFile, `${outcome.outcome}\n`, "utf8");
    }

    expect(["CLAIMED", "SCOPE_BUSY", "REPLAY", "KEY_SCOPE_MISMATCH", "UNAVAILABLE"]).toContain(
      outcome.outcome,
    );
  });
});
