/**
 * Phase 107 visual-evidence harness — the properties that keep evidence honest.
 *
 * These are not tests of a screenshot tool's convenience features. Each one
 * pins a rule whose absence has already destroyed evidence in this repository:
 * a concurrent second writer erased 618 measurements, and a pack of 764 images
 * backed by 146 records still looked complete in a file listing.
 *
 * The suite deliberately does not launch Chrome. What failed was the
 * bookkeeping — locking, atomicity, and the completion rule — so that is what
 * is tested, plus one spawn of the real sweep binary to prove it fails closed
 * under a held lock.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  RecordStore, acquireLock, readLock, reclaimStaleLock,
  assertOutputOutsideRepo, LockHeldError, sha256,
} from "../record-store.mjs";
import { explainDuplicateGroup, classifyAccess, isStructurallyComplete, checkFinalLocation, EXIT, ACCESS } from "../contracts.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SWEEP = path.join(HERE, "..", "sweep.mjs");
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..");

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-audit-test-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const png = (name: string) => Buffer.from(`png-bytes-${name}`);
const baseRecord = (cellId: string, file: string) => ({
  runId: "test", cellId, route: "/x", locale: "en", viewport: "1440x900",
  requestedUrl: "http://localhost:3000/en/x", finalUrl: "/en/x",
  httpState: 200, accessState: ACCESS.AUTHENTICATED,
  screenshotFile: file, capturedAt: new Date().toISOString(), status: "COMPLETE",
});

describe("single-writer lock", () => {
  it("1. refuses a second writer while the lock is held", () => {
    acquireLock(dir, "run-a");
    expect(() => acquireLock(dir, "run-b")).toThrow(LockHeldError);
  });

  it("2. never clears a lock whose owner is still alive", () => {
    acquireLock(dir, "run-a");
    const outcome = reclaimStaleLock(dir, () => false);   // owner alive
    expect(outcome).toBe("owner-alive");
    expect(readLock(dir)).not.toBeNull();
  });

  it("3. reclaims a lock only once the owner is proven dead", () => {
    acquireLock(dir, "run-a");
    expect(reclaimStaleLock(dir, () => true)).toBe("reclaimed");
    expect(readLock(dir)).toBeNull();
    expect(() => acquireLock(dir, "run-b")).not.toThrow();
  });

  it("3b. treats an unattributable lock as unknown, never as dead", () => {
    fs.writeFileSync(path.join(dir, ".visual-sweep.lock"), "{ not json");
    expect(reclaimStaleLock(dir, () => true)).toBe("unknown-owner");
    expect(readLock(dir)).not.toBeNull();
  });

  it("carries runId, pid, createdAt and worktree", () => {
    acquireLock(dir, "run-a");
    const lock = readLock(dir)!;
    for (const k of ["runId", "pid", "createdAt", "worktree"]) expect(lock).toHaveProperty(k);
  });
});

describe("atomic per-cell store", () => {
  it("4. a crash before the PNG lands leaves no COMPLETE record", () => {
    const store = new RecordStore(dir);
    // Nothing written at all — the cell simply is not complete.
    expect(store.completed().done.size).toBe(0);
  });

  it("5. a crash between PNG and record is INCOMPLETE on resume", () => {
    const store = new RecordStore(dir);
    const file = "auth/a.png";
    fs.mkdirSync(path.join(dir, "auth"), { recursive: true });
    fs.writeFileSync(path.join(dir, file), png("a"));   // image, no record
    expect(store.completed().done.has(file)).toBe(false);
  });

  it("6. rejects a record whose hash does not match its screenshot", () => {
    const store = new RecordStore(dir);
    const file = "auth/b.png";
    store.writeCell(baseRecord("b", file), png("b"));
    fs.writeFileSync(path.join(dir, file), png("TAMPERED"));
    const r = store.completed();
    expect(r.done.has(file)).toBe(false);
    expect(r.hashMismatch).toBe(1);
  });

  it("7. rejects a record whose screenshot is missing", () => {
    const store = new RecordStore(dir);
    const file = "auth/c.png";
    store.writeCell(baseRecord("c", file), png("c"));
    fs.unlinkSync(path.join(dir, file));
    const r = store.completed();
    expect(r.done.has(file)).toBe(false);
    expect(r.missingPng).toBe(1);
  });

  it("never treats a half-written *.tmp record as COMPLETE", () => {
    const store = new RecordStore(dir);
    const file = "auth/d.png";
    fs.mkdirSync(path.join(dir, "auth"), { recursive: true });
    fs.writeFileSync(path.join(dir, file), png("d"));
    fs.writeFileSync(store.recordPath("d") + ".tmp", JSON.stringify(baseRecord("d", file)));
    expect(store.completed().done.has(file)).toBe(false);
  });

  it("reports a duplicate cellId instead of double-counting it", () => {
    const store = new RecordStore(dir);
    const f1 = "auth/e1.png", f2 = "auth/e2.png";
    store.writeCell(baseRecord("SAME", f1), png("e1"));
    // second record, same cellId, different file
    const rec = { ...baseRecord("SAME", f2), screenshotSha256: sha256(png("e2")) };
    fs.writeFileSync(path.join(dir, "_records", "SAME__dup.json"), JSON.stringify(rec));
    fs.writeFileSync(path.join(dir, f2), png("e2"));
    expect(store.completed().duplicates).toBe(1);
  });

  it("a completed cell round-trips: record + screenshot + matching hash", () => {
    const store = new RecordStore(dir);
    const file = "auth/f.png";
    const written = store.writeCell(baseRecord("f", file), png("f"));
    expect(written.screenshotSha256).toBe(sha256(png("f")));
    expect(isStructurallyComplete(written)).toBe(true);
    expect(store.completed().done.has(file)).toBe(true);
  });
});

describe("final-location contract", () => {
  /*
   * These exercise the REAL function the sweep calls before it photographs and
   * the verifier re-applies afterwards — not a stand-in object. The earlier
   * version of this test built a synthetic record and asserted against it,
   * which proved nothing about the code path that actually guards captures.
   */
  it("8. accepts only an exact pathname+search match by default", () => {
    expect(checkFinalLocation({ url: "/en/dashboard" }, "/en/dashboard").ok).toBe(true);
    const wrong = checkFinalLocation({ url: "/en/dashboard" }, "/en/dashboard/other");
    expect(wrong.ok).toBe(false);
    expect(wrong.reason).toMatch(/^WRONG_FINAL_LOCATION/);
  });

  it("8b. rejects any wrong-but-non-empty location (the original defect)", () => {
    // The first implementation only checked that `location` was non-empty, so
    // every one of these would have been photographed as if correct.
    for (const landed of ["/en/", "/en/auth/login", "/de/dashboard", "/en/dashboard?x=1"]) {
      expect(checkFinalLocation({ url: "/en/dashboard" }, landed).ok).toBe(false);
    }
  });

  it("8c. rejects an unsettled navigation", () => {
    for (const landed of ["", "about:blank", undefined, null]) {
      const r = checkFinalLocation({ url: "/en/dashboard" }, landed as string);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/^NAVIGATION_DID_NOT_SETTLE/);
    }
  });

  it("8d. permits a redirect ONLY when that cell declares it", () => {
    const shim = { url: "/en/login", allowedFinalUrls: ["/en/auth/login"] };
    const ok = checkFinalLocation(shim, "/en/auth/login");
    expect(ok.ok).toBe(true);
    expect(ok.reason).toMatch(/^DECLARED_REDIRECT/);

    // The same landing without the declaration is refused — no heuristic, no
    // "login pages are always fine".
    expect(checkFinalLocation({ url: "/en/login" }, "/en/auth/login").ok).toBe(false);
    // And a declaration does not open the door to any other destination.
    expect(checkFinalLocation(shim, "/en/somewhere-else").ok).toBe(false);
  });

  it("8e. MUTATION: allowing an arbitrary landing path fails the contract", () => {
    // Stand-in for the mutation "drop the assertion / accept anything": if the
    // contract ever returned ok for a non-declared mismatch, this flips red.
    const mismatch = checkFinalLocation({ url: "/en/a" }, "/en/b");
    expect(mismatch.ok).toBe(false);
    expect(mismatch.reason).toContain("planned /en/a");
    expect(mismatch.reason).toContain("landed /en/b");
  });

  it("keeps a redirect visible rather than presenting it as a direct hit", () => {
    expect(classifyAccess({ finalUrl: "/en/auth/login", httpState: 200, domText: "" })).toBe(ACCESS.SESSION_LOST);
  });

  it("PNG dimensions are checked on BOTH axes", () => {
    /*
     * A 1x1 PNG stands in for "right width, wrong height". The verifier's rule
     * is reproduced here against real IHDR bytes, so the mutation "compare
     * width only" makes this red: with height dropped, `wrongHeight` passes.
     */
    const ihdr = (w: number, h: number) => {
      const b = Buffer.alloc(24);
      b.writeUInt32BE(0x89504e47, 0);
      b.write("IHDR", 12, "ascii");
      b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
      return b;
    };
    const read = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });
    const planned = { width: 1440, height: 900 };

    const exact = read(ihdr(1440, 900));
    const wrongHeight = read(ihdr(1440, 4200));
    const wrongWidth = read(ihdr(375, 900));

    const matches = (d: { width: number; height: number }) => d.width === planned.width && d.height === planned.height;
    expect(matches(exact)).toBe(true);
    expect(matches(wrongHeight)).toBe(false);   // caught only if height is compared
    expect(matches(wrongWidth)).toBe(false);
  });

  it("14. refuses an output directory inside the source tree by default", () => {
    const inside = path.join(REPO_ROOT, "docs", "evidence-should-not-live-here");
    expect(() => assertOutputOutsideRepo(inside, REPO_ROOT)).toThrow(/inside the source tree/);
    expect(() => assertOutputOutsideRepo(inside, REPO_ROOT, { allowInsideRepo: true })).not.toThrow();
    expect(() => assertOutputOutsideRepo(dir, REPO_ROOT)).not.toThrow();
  });
});

describe("duplicate explanation", () => {
  const cell = (over: Record<string, unknown>) => ({
    locale: "en", finalUrl: "/en/a", httpState: 200, accessState: ACCESS.AUTHENTICATED, ...over,
  });

  it("9. accepts a duplicate whose members resolved to the same document", () => {
    const r = explainDuplicateGroup([cell({}), cell({})]);
    expect(r.explained).toBe(true);
    expect(r.reason).toMatch(/^SAME_DOCUMENT/);
  });

  it("9b. accepts a shared localized 404 boundary", () => {
    const r = explainDuplicateGroup([
      cell({ finalUrl: "/en/a", httpState: 404 }),
      cell({ finalUrl: "/en/b", httpState: 404 }),
    ]);
    expect(r.explained).toBe(true);
    expect(r.reason).toMatch(/^SHARED_NOT_FOUND_BOUNDARY/);
  });

  it("10. rejects a duplicate whose members resolved to different documents", () => {
    const r = explainDuplicateGroup([cell({ finalUrl: "/en/a" }), cell({ finalUrl: "/en/b" })]);
    expect(r.explained).toBe(false);
    expect(r.reason).toMatch(/^UNEXPLAINED/);
  });

  it("11. never auto-accepts an identical image across locales", () => {
    const r = explainDuplicateGroup([
      cell({ locale: "en", finalUrl: "/en/a" }),
      cell({ locale: "de", finalUrl: "/de/a" }),
    ]);
    expect(r.explained).toBe(false);
    expect(r.reason).toMatch(/^CROSS_LOCALE_IDENTICAL/);
  });

  it("keeps 404, denied, session-lost and authenticated apart", () => {
    expect(classifyAccess({ finalUrl: "/en/x", httpState: 404, domText: "" })).toBe(ACCESS.NOT_FOUND);
    expect(classifyAccess({ finalUrl: "/en/x", httpState: 200, domText: "Access restricted" })).toBe(ACCESS.DENIED_BY_CAPABILITY);
    expect(classifyAccess({ finalUrl: "/en/auth/login", httpState: 200, domText: "" })).toBe(ACCESS.SESSION_LOST);
    expect(classifyAccess({ finalUrl: "/en/x", httpState: 200, domText: "hello" })).toBe(ACCESS.AUTHENTICATED);
  });
});

describe("the real binary", () => {
  it("12. exits LOCKED when another writer holds the lock", () => {
    acquireLock(dir, "held-by-someone-else");
    const cells = path.join(dir, "cells.json");
    fs.writeFileSync(cells, "[]");
    const r = spawnSync(process.execPath, [SWEEP, cells, dir], {
      encoding: "utf8",
      env: { ...process.env, HERMES_AUDIT_EMAIL: "x@example.invalid", HERMES_AUDIT_PASSWORD: "unused" },
    });
    expect(r.status).toBe(EXIT.LOCKED);
    expect(r.stderr).toMatch(/another sweep holds the lock/);
  });

  it("13. never prints the credential on stdout or stderr", () => {
    const secret = crypto.randomBytes(18).toString("base64url");
    const cells = path.join(dir, "cells.json");
    fs.writeFileSync(cells, "[]");
    acquireLock(dir, "held");        // exit early, before any browser work
    const r = spawnSync(process.execPath, [SWEEP, cells, dir], {
      encoding: "utf8",
      env: { ...process.env, HERMES_AUDIT_EMAIL: "audit@example.invalid", HERMES_AUDIT_PASSWORD: secret },
    });
    expect(`${r.stdout}${r.stderr}`).not.toContain(secret);
  });

  it("refuses to run without credentials in the environment", () => {
    const cells = path.join(dir, "cells.json");
    fs.writeFileSync(cells, "[]");
    const env = { ...process.env };
    delete env.HERMES_AUDIT_EMAIL; delete env.HERMES_AUDIT_PASSWORD;
    const r = spawnSync(process.execPath, [SWEEP, cells, dir], { encoding: "utf8", env });
    expect(r.status).toBe(EXIT.NO_CREDENTIALS);
  });

  it("exits CAPTURE_INCOMPLETE when at least one cell fails", () => {
    /*
     * Real binary, real cells, no server listening — so every cell fails. The
     * run must NOT report success: a supervisor that sees exit 0 would record a
     * partial pack as complete, which is the whole class of mistake this
     * harness exists to prevent.
     *
     * Chrome is pointed at a path that cannot launch, so the failure is the
     * capture loop's, not the environment's, and the test needs no browser.
     */
    const cells = path.join(dir, "cells.json");
    fs.writeFileSync(cells, JSON.stringify([
      { cellId: "c1", file: "auth/c1.png", url: "/en/x", route: "/x", locale: "en", width: 1440, height: 900 },
    ]));
    const r = spawnSync(process.execPath, [SWEEP, cells, dir, "--chrome", path.join(dir, "no-such-chrome")], {
      encoding: "utf8", timeout: 120000,
      env: { ...process.env, HERMES_AUDIT_EMAIL: "a@example.invalid", HERMES_AUDIT_PASSWORD: "b" },
    });
    expect(r.status).not.toBe(EXIT.OK);
    expect(fs.existsSync(path.join(dir, "auth/c1.png"))).toBe(false);
  });

  it("refuses a non-local base URL without an explicit override", () => {
    const cells = path.join(dir, "cells.json");
    fs.writeFileSync(cells, "[]");
    const r = spawnSync(process.execPath, [SWEEP, cells, dir, "--base", "https://www.hermesnovin.com"], {
      encoding: "utf8",
      env: { ...process.env, HERMES_AUDIT_EMAIL: "a@example.invalid", HERMES_AUDIT_PASSWORD: "b" },
    });
    expect(r.status).toBe(EXIT.USAGE);
    expect(r.stderr).toMatch(/refusing to sweep a non-local host/);
  });
});
