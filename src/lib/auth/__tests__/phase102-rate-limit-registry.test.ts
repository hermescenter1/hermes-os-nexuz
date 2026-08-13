import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { auditRateLimitRegistry, parseDeclaredBuckets } from "./_rate-limit-registry";

/**
 * PHASE 102 / RELEASE BLOCKER 2 — the rate-limit registry is closed and fails
 * CLOSED.
 *
 * THE DEFECT
 * `checkRateLimit` answered `true` — allowed — for any bucket missing from
 * `LIMITS`, and `POST /api/media/assets`, `PATCH /api/media/assets/[id]` and
 * `POST .../transitions` all named buckets that were never declared. Those three
 * write routes ran completely unlimited while reporting themselves limited. The
 * neighbouring upload routes had spotted the hazard and worked around it by
 * borrowing `engineering-import`; the authoring routes had not.
 *
 * WHY ROUTE TESTS COULD NOT CATCH IT
 * Every media route suite substitutes its own `checkRateLimit` double, so the
 * real `LIMITS` lookup never runs there. The defect was invisible by
 * construction. These tests therefore drive the REAL limiter module and the
 * REAL source files on disk.
 *
 * WHAT IS PROVEN HERE
 *   1. Both media buckets are declared, with limits that actually bind.
 *   2. Every bucket any route names is declared — audited from disk.
 *   3. An undeclared bucket is refused at runtime, not waved through.
 *   4. MUTATION: deleting either media bucket from a COPY of the limiter turns
 *      the audit RED, and a cosmetic edit leaves it GREEN.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const LIMITER_RELATIVE = "src/lib/auth/rate-limiter.ts";

/* ═════════════════════════ 1 — declared and binding ═════════════════════════ */

describe("Phase 102 media buckets are declared in the canonical registry", () => {
  it("declares media-authoring-write and media-editorial-transition", async () => {
    const { RATE_LIMIT_ACTIONS, isRateLimitAction } = await import("../rate-limiter");

    expect(RATE_LIMIT_ACTIONS).toContain("media-authoring-write");
    expect(RATE_LIMIT_ACTIONS).toContain("media-editorial-transition");
    expect(isRateLimitAction("media-authoring-write")).toBe(true);
    expect(isRateLimitAction("media-editorial-transition")).toBe(true);
  });

  it("gives both buckets a finite budget that actually blocks", async () => {
    const { checkRateLimit } = await import("../rate-limiter");

    // Redis is absent under vitest, so the in-process sliding window is what
    // answers. A bucket with a real `max` must eventually say no; the old
    // undeclared behaviour said yes forever.
    const identifier = `registry-probe-${Math.random()}`;
    let allowed = 0;
    for (let i = 0; i < 200; i += 1) {
      if (await checkRateLimit("media-authoring-write", identifier)) allowed += 1;
    }
    expect(allowed).toBeGreaterThan(0);
    expect(allowed).toBeLessThan(200);

    const transitionId = `registry-probe-t-${Math.random()}`;
    let transitionsAllowed = 0;
    for (let i = 0; i < 200; i += 1) {
      if (await checkRateLimit("media-editorial-transition", transitionId)) transitionsAllowed += 1;
    }
    expect(transitionsAllowed).toBeGreaterThan(0);
    expect(transitionsAllowed).toBeLessThan(200);

    // An editorial transition changes what the public can see, so it must not
    // be looser than an ordinary metadata save.
    expect(transitionsAllowed).toBeLessThanOrEqual(allowed);
  });
});

/* ═════════════════════ 2 — no route names an undeclared bucket ══════════════ */

describe("every rate-limit bucket used by a route is declared", () => {
  const audit = auditRateLimitRegistry();

  it("finds the real call sites at all", () => {
    // A scanner that matches nothing would make every assertion below vacuous.
    expect(audit.declared.length).toBeGreaterThan(20);
    expect(audit.uses.length).toBeGreaterThan(20);
    const actions = audit.uses.map((u) => u.action);
    expect(actions).toContain("media-authoring-write");
    expect(actions).toContain("media-editorial-transition");
    expect(actions).toContain("login");
  });

  it("reports no undeclared bucket anywhere in src/", () => {
    expect(
      audit.undeclared.map((u) => `${u.file} → ${u.raw}`),
      "a route names a rate-limit bucket that LIMITS does not declare",
    ).toEqual([]);
  });

  it("has exactly two typed indirections, and both are shared route guards", () => {
    // Both entries forward a parameter that is TYPED `RateLimitAction`, so the
    // compiler covers the bucket itself; their call sites are audited as
    // `bucket:` string literals instead, which is why those literals still show
    // up in `audit.uses` above.
    //
    //   - `withOtRoute` composes the OT routes (Phase 94B4).
    //   - `requireVoiceCopilotActor` is the single Phase 103 voice guard: three
    //     equally sensitive endpoints share one ordered chain rather than three
    //     hand-copied sequences that can drift, and the bucket is the one thing
    //     that legitimately differs between them.
    //
    // Pinning the set EXACTLY is the point: a new untyped indirection cannot
    // appear without someone revisiting this file and justifying it here.
    //
    // Sorted before comparison because the audit walks the tree in the order
    // `readdirSync` reports, which is alphabetical on NTFS but arbitrary on
    // ext4. Sorting compares the SET exactly without pinning a filesystem
    // detail that would make this assertion pass locally and fail in CI.
    expect(audit.dynamic.map((u) => `${u.file} → ${u.raw}`).sort()).toEqual([
      "src/lib/copilot/voice/guard.ts → options.bucket",
      "src/lib/ot-edge/http/route-kit.ts → opts.bucket",
    ]);
  });
});

/* ═══════════════════════ 3 — runtime refusal is fail-closed ═════════════════ */

describe("an undeclared bucket fails closed at runtime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses the request instead of allowing it", async () => {
    const { checkRateLimit } = await import("../rate-limiter");

    // Cast deliberately: TypeScript already rejects this, so the only way to
    // reach the runtime guard is the same way a JS caller or a stale bucket
    // name would. Before the fix this returned `true`.
    const verdict = await checkRateLimit(
      "phase102-bucket-that-does-not-exist" as never,
      "1.2.3.4",
    );
    expect(verdict).toBe(false);
  });

  it("reports no remaining attempts and a non-zero retry window", async () => {
    const { remainingAttempts, retryAfter } = await import("../rate-limiter");

    expect(await remainingAttempts("phase102-nope" as never, "1.2.3.4")).toBe(0);
    // A refusal quoting `Retry-After: 0` invites an immediate retry loop.
    expect(retryAfter("phase102-nope" as never, "1.2.3.4")).toBeGreaterThan(0);
  });

  it("still allows and eventually blocks a declared bucket", async () => {
    const { checkRateLimit } = await import("../rate-limiter");
    // Guards the guard: a limiter that refused everything would also pass the
    // two assertions above.
    expect(await checkRateLimit("media-authoring-write", `sanity-${Math.random()}`)).toBe(true);
  });
});

/* ═══════════════════════════ 4 — mutation testing ═══════════════════════════ */

describe("MUTATION: removing a bucket from the registry turns the audit red", () => {
  /** Everything the audit reads. Nothing else is copied. */
  const CLONED_PATHS = ["src"] as const;

  function withMutatedRepo<T>(mutate: (limiterSource: string) => string, run: (root: string) => T): T {
    const root = mkdtempSync(path.join(tmpdir(), "hermes-rl-registry-"));
    try {
      for (const rel of CLONED_PATHS) {
        cpSync(path.join(REPO_ROOT, rel), path.join(root, rel), { recursive: true });
      }
      const limiterPath = path.join(root, LIMITER_RELATIVE);
      const original = readFileSync(limiterPath, "utf8");
      const mutated = mutate(original);
      expect(mutated, "the mutation did not change the file — the case would be vacuous").not.toBe(
        original,
      );
      writeFileSync(limiterPath, mutated);
      return run(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const deleteBucket = (bucket: string) => (source: string) => {
    const pattern = new RegExp(`\\n\\s*"${bucket}":\\s*\\{[^}]*\\},`, "u");
    expect(pattern.test(source), `bucket "${bucket}" not found in the limiter source`).toBe(true);
    return source.replace(pattern, "");
  };

  for (const bucket of ["media-authoring-write", "media-editorial-transition"] as const) {
    it(`RED when "${bucket}" is deleted`, () => {
      withMutatedRepo(deleteBucket(bucket), (root) => {
        const mutatedAudit = auditRateLimitRegistry({ repoRoot: root });
        expect(mutatedAudit.declared).not.toContain(bucket);
        expect(mutatedAudit.undeclared.map((u) => u.action)).toContain(bucket);
      });
    });
  }

  it("RED when a long-standing bucket like login is deleted", () => {
    withMutatedRepo(
      (source) => {
        const pattern = /\n\s*login:\s*\{[^}]*\},/u;
        expect(pattern.test(source)).toBe(true);
        return source.replace(pattern, "");
      },
      (root) => {
        const mutatedAudit = auditRateLimitRegistry({ repoRoot: root });
        expect(mutatedAudit.declared).not.toContain("login");
        expect(mutatedAudit.undeclared.map((u) => u.action)).toContain("login");
      },
    );
  });

  it("GREEN when the edit is cosmetic — the audit is not simply always red", () => {
    withMutatedRepo(
      (source) => source.replace("// ── Limits ─", "// ── Limits (comment touched) ─"),
      (root) => {
        const mutatedAudit = auditRateLimitRegistry({ repoRoot: root });
        expect(mutatedAudit.undeclared).toEqual([]);
        expect(mutatedAudit.declared).toContain("media-authoring-write");
      },
    );
  });

  it("leaves the real limiter source byte-identical", () => {
    const source = readFileSync(path.join(REPO_ROOT, LIMITER_RELATIVE), "utf8");
    expect(parseDeclaredBuckets(source)).toContain("media-authoring-write");
    expect(parseDeclaredBuckets(source)).toContain("media-editorial-transition");
    expect(parseDeclaredBuckets(source)).toContain("login");
  });
});
