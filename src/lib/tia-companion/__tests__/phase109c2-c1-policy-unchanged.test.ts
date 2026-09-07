/**
 * PHASE 109-C2.0 — proof that Phase 109-C1 was not touched.
 *
 * The instruction for this round was explicit: do not modify
 * `PERMITTED_ORIGINS_ROUND_1`, do not modify `assertPermittedOrigin`, and give
 * the companion its own admission policy instead. That is easy to claim in a
 * report and worth nothing unless something checks it, so this file checks it
 * three ways:
 *
 *   1. BEHAVIOUR — C1's policy still answers exactly as it did, including for
 *      `imported`, which C1 must still refuse even though C2 admits it;
 *   2. TEXT — the declaration in C1's source still reads exactly as it did;
 *   3. BYTES — a digest over every Phase 109-C1 source and test file.
 *
 * The digest is line-ending normalised on purpose. This repository checks out
 * CRLF on Windows and LF on Linux CI; a raw-byte digest would be green on one
 * and red on the other, and a gate whose verdict depends on the checkout is not
 * a gate. All 27 files were measured CRLF in the authoring worktree.
 *
 * IF THIS FAILS AND C1 REALLY DID CHANGE, the digest is re-pinned HERE, in the
 * same commit, with the reason written down. That is the point: the lock does
 * not forbid a future change to C1, it forbids an unnoticed one.
 *
 * RE-PINNED — PHASE 109-C-UI.1 (design/UX stage for /[locale]/engineering/studio)
 * ----------------------------------------------------------------------------
 * C1 really did change, deliberately and under review. The baseline this file
 * was authored against (27 files, 1af814de…) is therefore no longer the tree it
 * describes, and leaving it in place would have made this lock a permanent red
 * rather than a signal.
 *
 * WHAT CHANGED. Four files were added and six edited under the three C1 roots:
 *
 *   + components/automation-studio/ArtifactSurface.tsx      the central pane for
 *     the fourteen artifacts that have no textual source and previously rendered
 *     a single centred sentence in an empty pane;
 *   + lib/automation-studio/artifact-dossier.ts             an allowlisted
 *     PROJECTION of an artifact — identity, provenance, declared symbols,
 *     references, related tests — plus the ArtifactKind and DataOrigin label
 *     maps;
 *   + two test suites for the above;
 *   ~ StudioWorkspace / SourceView / Inspector / OutputPanel / ProjectExplorer /
 *     index.ts to render them, to make the inspector reachable below `xl`, to
 *     add a changes-and-versions surface, and to stop rendering raw union
 *     members (`hmi-screen`, `binding`, `simulated`) as visible text.
 *
 * WHAT DID NOT CHANGE, and is what this file actually guards: C1's Round 1
 * ORIGIN POLICY. `PERMITTED_ORIGINS_ROUND_1` still admits exactly `simulated`
 * and `authored`; `assertPermittedOrigin` still refuses everything else,
 * `imported` included; no live origin is admitted anywhere. Those are the
 * thirteen behavioural and textual assertions in this file, and every one of
 * them passed both before and after the change — only the file COUNT and the
 * source DIGEST moved, which is arithmetic over a file list, not a policy
 * decision.
 *
 * The new module is deliberately built so it cannot weaken that policy: its
 * origin label map is DERIVED from `ALL_DATA_ORIGINS` rather than written out,
 * precisely so that no live-origin literal appears in an admit position — which
 * `phase109c1-invariants` independently enforces.
 *
 * RE-PINNED AGAIN — 109-C-UI.1 R2. The Codex review of R1 found two
 * accessibility defects in the same C1 roots: opening the inspector as a drawer
 * left focus outside it (so Escape had nothing to bubble from and a keyboard
 * user was stranded), and the toggle's `aria-expanded` was read once at mount
 * and went stale on resize. Both are fixed in `StudioWorkspace.tsx`, with new
 * behavioural tests beside them. The file COUNT is unchanged at 31 — R2 added
 * no file — and only the digest moved.
 *
 * The origin policy is STILL untouched by R2, which is what the thirteen
 * behavioural and textual assertions in this file check and what they continue
 * to prove.
 *
 * Both values below were measured with this file's own algorithm against the
 * delivered tree and reproduced independently before being written here.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALL_DATA_ORIGINS,
  assertPermittedOrigin,
  AutomationStudioOriginError,
  isPermittedOrigin,
  LIVE_ORIGINS,
  PERMITTED_ORIGINS_ROUND_1,
  type DataOrigin,
} from "@/lib/automation-studio";

import {
  admitsImportedOrigin,
  assertC2PermittedOrigin,
  C2_PERMITTED_ORIGINS,
  C2_REFUSED_KNOWN_ORIGINS,
  C2_REFUSED_LIVE_ORIGINS,
  isC2PermittedOrigin,
} from "../origin-policy";

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

const C1_ROOTS = [
  join("src", "lib", "automation-studio"),
  join("src", "components", "automation-studio"),
  join("src", "app", "[locale]", "engineering", "studio"),
];

/**
 * Every Phase 109-C1 source and test file, path-sorted.
 *
 * Tests are included deliberately: C1's invariant suite IS part of its policy,
 * and a change that relaxed a test would be exactly as significant as one that
 * relaxed the code.
 */
function c1Files(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
  };
  for (const root of C1_ROOTS) walk(join(REPO_ROOT, root));
  return out
    .map((file) => relative(REPO_ROOT, file).split(sep).join("/"))
    .sort();
}

describe("109-C2.0 · C1's Round 1 origin policy is behaviour-identical", () => {
  it("still permits exactly simulated and authored", () => {
    expect([...PERMITTED_ORIGINS_ROUND_1]).toEqual(["simulated", "authored"]);
  });

  it("still refuses `imported` — C2 did NOT widen it", () => {
    // The single intentional difference between the two policies, asserted from
    // both sides so neither can drift into the other.
    expect(isPermittedOrigin("imported")).toBe(false);
    expect(() => assertPermittedOrigin("imported")).toThrow(AutomationStudioOriginError);
    expect(admitsImportedOrigin()).toBe(true);
  });

  it("still refuses every live origin", () => {
    for (const origin of LIVE_ORIGINS) {
      expect(isPermittedOrigin(origin), origin).toBe(false);
      expect(() => assertPermittedOrigin(origin), origin).toThrow(AutomationStudioOriginError);
    }
  });

  it("still refuses a value outside the union", () => {
    expect(() => assertPermittedOrigin("production-plc" as DataOrigin)).toThrow(
      AutomationStudioOriginError,
    );
  });
});

describe("109-C2.0 · the companion's own policy is a CLOSED allowlist", () => {
  it("admits exactly three enumerated origins", () => {
    // Set equality, both directions. An earlier revision derived this list as
    // "everything that is not live", which made admission the default: a member
    // added to `DataOrigin` tomorrow would have been admitted here silently, by
    // a module that had never heard of it. An allowlist has to be closed.
    expect([...C2_PERMITTED_ORIGINS].sort()).toEqual(
      ["authored", "imported", "simulated"].sort(),
    );
    expect(C2_PERMITTED_ORIGINS.length).toBe(3);
  });

  it("EXHAUSTIVENESS: a new origin in C1 is refused until someone decides otherwise", () => {
    // This is the test that fails when `DataOrigin` grows. It does NOT fail
    // because the new member is bad — it fails because nobody has ruled on it.
    // Fixing it means editing the allowlist deliberately and editing this list,
    // which is exactly the amount of friction the decision deserves.
    const known = [...ALL_DATA_ORIGINS].sort();
    expect(known).toEqual(
      ["authored", "imported", "live-controlled", "live-readonly", "simulated"].sort(),
    );

    // Every known origin is accounted for: admitted, or refused. Nothing floats.
    const accounted = [...C2_PERMITTED_ORIGINS, ...C2_REFUSED_KNOWN_ORIGINS].sort();
    expect(accounted).toEqual(known);
    expect(new Set(accounted).size).toBe(known.length);
  });

  it("every admitted origin is a real DataOrigin, and none of them is live", () => {
    for (const origin of C2_PERMITTED_ORIGINS) {
      expect(ALL_DATA_ORIGINS, origin).toContain(origin);
      expect(LIVE_ORIGINS, origin).not.toContain(origin);
    }
  });

  it("the refused set covers both live origins", () => {
    expect([...C2_REFUSED_LIVE_ORIGINS].sort()).toEqual([...LIVE_ORIGINS].sort());
    for (const origin of LIVE_ORIGINS) {
      expect(C2_REFUSED_KNOWN_ORIGINS, origin).toContain(origin);
    }
  });

  it("differs from C1's policy by exactly one member, and it is `imported`", () => {
    const c1 = new Set<string>(PERMITTED_ORIGINS_ROUND_1);
    const extra = C2_PERMITTED_ORIGINS.filter((origin) => !c1.has(origin));
    const missing = [...PERMITTED_ORIGINS_ROUND_1].filter(
      (origin) => !(C2_PERMITTED_ORIGINS as readonly string[]).includes(origin),
    );
    expect(extra).toEqual(["imported"]);
    expect(missing).toEqual([]);
  });

  it("refuses both live origins and anything outside the union", () => {
    for (const origin of LIVE_ORIGINS) {
      expect(isC2PermittedOrigin(origin), origin).toBe(false);
      expect(() => assertC2PermittedOrigin(origin), origin).toThrow(/AES-C2-014/);
    }
    for (const value of ["production-plc", "", null, undefined, 7, {}]) {
      expect(isC2PermittedOrigin(value), String(value)).toBe(false);
    }
  });

  it("writes no live origin into its own source, in any position", () => {
    // The allowlist is closed, so refusal never depends on naming a live origin.
    // If one appeared here as a literal it could only be in an admit position,
    // which is precisely the edit this test exists to catch.
    const source = readFileSync(join(__dirname, "..", "origin-policy.ts"), "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (const origin of LIVE_ORIGINS) {
      expect(code, origin).not.toContain(`"${origin}"`);
    }
  });

  it("refusal does not consult the informational refused list", () => {
    // `C2_REFUSED_KNOWN_ORIGINS` is derived and therefore incomplete by nature:
    // it can only name origins C1 already knows. The guard must not depend on
    // it, or an unknown value would fall through. Proven with a value that is
    // in neither list.
    expect(C2_REFUSED_KNOWN_ORIGINS as readonly string[]).not.toContain("production-plc");
    expect(isC2PermittedOrigin("production-plc")).toBe(false);
  });
});

describe("109-C2.0 · C1's source is byte-identical", () => {
  it("still declares the permitted list exactly as it did", () => {
    const source = readFileSync(
      join(REPO_ROOT, "src", "lib", "automation-studio", "contract.ts"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(source).toContain(
      [
        "export const PERMITTED_ORIGINS_ROUND_1: readonly DataOrigin[] = [",
        '  "simulated",',
        '  "authored",',
        "] as const;",
      ].join("\n"),
    );
  });

  it("covers the file set the lock was measured over", () => {
    const files = c1Files();
    // 27 at the C2.0 baseline; 31 after 109-C-UI.1 added ArtifactSurface.tsx,
    // artifact-dossier.ts and their two suites. R2 added no file, so 31 stands.
    // See the re-pin note at the top.
    expect(files.length).toBe(31);
    // Spot-check the three roots are all represented, so a walk that silently
    // stopped early could not still produce the right count.
    expect(files.some((f) => f.startsWith("src/lib/automation-studio/"))).toBe(true);
    expect(files.some((f) => f.startsWith("src/components/automation-studio/"))).toBe(true);
    expect(files.some((f) => f.includes("engineering/studio/"))).toBe(true);
  });

  it("hashes to the digest re-pinned for 109-C-UI.1 R2", () => {
    const files = c1Files();
    const outer = createHash("sha256");
    for (const path of files) {
      const normalised = readFileSync(join(REPO_ROOT, path), "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      outer.update(path, "utf8");
      outer.update("\0");
      outer.update(createHash("sha256").update(normalised, "utf8").digest("hex"), "utf8");
      outer.update("\n");
    }
    // C2.0 baseline: 1af814de46ed07c8fe6ce079a7e5f9d659e18a447dbae404e563a552c460b1eb
    //                measured at b411d1dd425956720e802e45cabb8fd01e90561a over 27 files.
    // 109-C-UI.1 R1: 92a8158c307437b356bb38314101858ff1e50a824cb68a3a8afc7363679d454e
    // RE-PINNED for 109-C-UI.1 R2 (the keyboard-drawer and aria-expanded
    // corrections), measured over the same 31 files. This is NOT the C2.0
    // baseline any more, and the name of the test says so.
    expect(outer.digest("hex")).toBe(
      "a064dd381083c40228ce7c09bbd70a6acb2f1cb2f584afd857daacecf7fccb13",
    );
  });
});
