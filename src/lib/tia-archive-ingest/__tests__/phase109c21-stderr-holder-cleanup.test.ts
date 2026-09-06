/**
 * PHASE 109-C2.1 — R8: a grandchild holding only stderr stranded the slot.
 *
 * R7 defined the postcondition as `stdoutFinished && childReaped` but armed
 * cleanup on `gate.sawStdoutEnd` alone. Half a postcondition is not a guard:
 * exactly one incomplete state was excluded — stdout finished, child NOT
 * reaped — and it is reachable without any exotic trick.
 *
 * A child hands a DETACHED grandchild fd 2 and nothing else
 * (`stdio: ["ignore", "ignore", 2]`), writes a valid READY and a schema-valid
 * DONE, and exits 0. stdout reaches a clean EOF, so the verdict is correct and
 * publishable — but ChildProcess `close` waits for EVERY stdio stream, and
 * stderr is still open. Measured against R7 with a real process tree:
 *
 *     3733ms  stdout end
 *     3749ms  child exit  code=0
 *     3753ms  VERDICT     PUBLISH DONE
 *     3754ms  armOrphanSweep  NOT ARMED     <- cleanupComplete() was false
 *             childReaped     false ... indefinitely
 *             slot released   never
 *
 * No sweep was ever scheduled, so the grandchild was never removed, `close`
 * never came, and one request held the single global slot for the life of the
 * container. The same run with the guard set to the negation of the
 * postcondition arms cleanup at 3901 ms.
 *
 * Test B below drives a REAL process tree through the product's own guard, so
 * it fails if the guard regresses rather than merely if a constant changes.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { cleanupComplete, nextCleanupStep, shouldArmCleanup } from "../cleanup-plan";
import { INGRESS_LIMITS } from "../limits";
import { VerdictGate } from "../verdict-gate";

const MAX = INGRESS_LIMITS.orphanSweepAttempts;
const state = (stdoutFinished: boolean, childReaped: boolean, attempt = 0) => ({
  stdoutFinished,
  childReaped,
  attempt,
  maxAttempts: MAX,
});

/* ── A · the excluded state, as a rule ──────────────────────────────────── */

describe("109-C2.1 R8 · the guard is the negation of the postcondition", () => {
  it("stdout finished but child NOT reaped is incomplete, and MUST arm cleanup", () => {
    // The exact state R7 excluded.
    expect(cleanupComplete(state(true, false))).toBe(false);
    expect(shouldArmCleanup(state(true, false))).toBe(true);
  });

  it("child reaped but stdout not finished also arms", () => {
    expect(shouldArmCleanup(state(false, true))).toBe(true);
  });

  it("neither half arms", () => {
    expect(shouldArmCleanup(state(false, false))).toBe(true);
  });

  it("only the fully satisfied postcondition declines to arm", () => {
    expect(shouldArmCleanup(state(true, true))).toBe(false);
  });

  it("arming is exactly !cleanupComplete, for every combination", () => {
    for (const stdoutFinished of [false, true]) {
      for (const childReaped of [false, true]) {
        const s = state(stdoutFinished, childReaped);
        expect(shouldArmCleanup(s)).toBe(!cleanupComplete(s));
      }
    }
  });

  it("an armed run that is still incomplete goes on to sweep, not to stop", () => {
    expect(nextCleanupStep(state(true, false, 0))).toEqual({ action: "SWEEP_AGAIN", attempt: 1 });
  });

  it("and it still ends in controlled termination rather than looping", () => {
    expect(nextCleanupStep(state(true, false, MAX - 1))).toEqual({ action: "TERMINATE_SELF" });
  });
});

/* ── B · the same thing, with real processes ────────────────────────────── */

describe("109-C2.1 R8 · a real grandchild holding only stderr", () => {
  const dir = mkdtempSync(join(tmpdir(), "c21-r8-"));
  const parent = join(dir, "stderr-parent.cjs");
  const children: ReturnType<typeof spawn>[] = [];
  const holders: number[] = [];

  // Writes READY + a schema-valid DONE on stdout, records the DETACHED
  // grandchild's pid in a file the test can read, hands that grandchild fd 2
  // ONLY, then exits 0. stdout can therefore reach EOF while stderr stays open —
  // which is precisely what keeps ChildProcess `close` from firing.
  //
  // THE PID FILE IS NOT DECORATION. The grandchild is `detached`, so it leads
  // its OWN process group: killing the direct child's group never reaches it.
  // An earlier version of this test claimed to clean up its process group and
  // did not — it leaked a 30-second holder on every run.
  writeFileSync(
    parent,
    [
      'const { spawn } = require("node:child_process");',
      'const { writeFileSync } = require("node:fs");',
      'process.stdout.write(JSON.stringify({ kind: "READY", oomScoreAdj: 1000, oomGroup: 0 }) + "\\n");',
      'process.stdout.write(JSON.stringify({ kind: "DONE", result: { entryCount: 1,',
      '  entries: [{ path: "blocks/main.scl", observedBytes: 3, sha256: "a".repeat(64), crc32: 7 }],',
      '  observedTotalBytes: 3 } }) + "\\n");',
      'const kid = spawn(process.execPath, ["-e", "setTimeout(()=>process.exit(0),30000)"],',
      '  { detached: true, stdio: ["ignore", "ignore", 2] });',
      "kid.unref();",
      "writeFileSync(process.argv[2], String(kid.pid), \"utf8\");",
      "process.exit(0);",
    ].join("\n"),
    "utf8",
  );

  /** True while the pid is still a live process. */
  function alive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /** Kill a detached holder: its own group first, then the pid itself. */
  function killHolder(pid: number): void {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* negative pids are unsupported on Windows, and the group may be gone */
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }

  // Belt and braces. The test's own `finally` does the real work and proves it;
  // this catches anything a crash between spawn and finally could leave behind,
  // and removes the temporary directory.
  afterAll(() => {
    for (const pid of holders) killHolder(pid);
    for (const c of children) {
      try {
        c.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    "stdout reaches clean EOF, the child exits 0, close stays pending — and cleanup arms",
    async () => {
      const pidFile = join(dir, `holder-${process.pid}.pid`);
      const child = spawn(process.execPath, [parent, pidFile], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      children.push(child);
      child.stdin.on("error", () => {});
      child.stderr.resume();
      child.stdout.resume();

      const gate = new VerdictGate();
      let childReaped = false;
      const closed = new Promise<void>((resolve) => {
        child.on("close", () => {
          childReaped = true;
          resolve();
        });
      });
      child.stdout.on("end", () => gate.recordStdoutEnd());
      child.on("exit", (code, signal) => gate.recordExit(code, signal));

      let holderPid = 0;
      try {
        // Well past the point where a healthy child would have been reaped.
        await new Promise((r) => setTimeout(r, 4000));

        holderPid = Number(readFileSync(pidFile, "utf8").trim());
        expect(Number.isInteger(holderPid)).toBe(true);
        expect(holderPid).toBeGreaterThan(0);
        holders.push(holderPid);

        // stdout ended cleanly and the child exited 0 — the verdict is fine.
        expect(gate.sawStdoutEnd).toBe(true);
        expect(gate.streamCompletion).toBe("CLEAN_END");
        expect(gate.take()?.code).toBe(0);

        // But the grandchild still holds stderr, so the reap never happened.
        expect(childReaped).toBe(false);
        expect(alive(holderPid)).toBe(true);

        // THE REGRESSION: R7 would not have armed here, and nothing would ever
        // have removed that writer.
        expect(
          shouldArmCleanup({
            stdoutFinished: gate.sawStdoutEnd,
            childReaped,
            attempt: 0,
            maxAttempts: MAX,
          }),
        ).toBe(true);
      } finally {
        // Runs on an assertion failure and on a timeout alike, so the holder is
        // never leaked by a red run.
        if (holderPid > 0) killHolder(holderPid);
      }

      // Removing the holder releases stderr, so the reap finally happens — which
      // is the same mechanism the supervisor's sweep relies on.
      await closed;
      expect(childReaped).toBe(true);

      // Prove the holder is gone rather than assuming the kill worked.
      for (let i = 0; i < 40 && alive(holderPid); i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(alive(holderPid)).toBe(false);
    },
    30_000,
  );
});
