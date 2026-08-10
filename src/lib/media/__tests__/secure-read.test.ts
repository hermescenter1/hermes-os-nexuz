import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsSync, { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Readable } from "stream";
import {
  SECURE_READ_PLATFORM,
  SecureReadUsageError,
  detectSecureReadPlatformCapabilities,
  openSecureFile,
  readSecureFileRange,
  statSecureFile,
  strongPrimitiveRejection,
  type SecureReadFailureReason,
  type SecureReadLogRecord,
  type SecureReadPlatformCapabilities,
} from "../secure-read";

/**
 * PHASE 102 — the hardened read primitive.
 *
 * Every test here runs against a REAL temp directory and REAL symlinks. Nothing
 * about path resolution, symlink following or descriptor identity can be
 * honestly proven with a mocked `fs`: the whole point of the module is what the
 * kernel does, not what a stub says it does.
 *
 * PLATFORM HONESTY
 * ----------------
 * Two capabilities decide what can run here:
 *
 *   - creating a real symlink (Windows needs Administrator or Developer Mode);
 *   - `O_NOFOLLOW` and `/proc/self/fd` (Linux — and production IS Linux).
 *
 * Both are PROBED, not assumed, and the skip reason is itself asserted, so a
 * green Windows run cannot be mistaken for coverage. On Linux — which is what
 * CI (`ubuntu-latest`) and production run — the probes MUST succeed, and the
 * assertions below FAIL the suite if they do not. A silently-skipping security
 * test is worse than no test.
 */

// ── Capability probes ────────────────────────────────────────────────────────

interface Capability {
  readonly supported: boolean;
  /** Non-null only when unsupported. Asserted by a test — never just logged. */
  readonly skipReason: string | null;
}

function probeSymlinkCapability(): Capability {
  let dir: string | null = null;
  try {
    dir = fsSync.mkdtempSync(path.join(os.tmpdir(), "hermes-symlink-probe-"));
    const target = path.join(dir, "target.bin");
    fsSync.writeFileSync(target, "probe");
    fsSync.symlinkSync(target, path.join(dir, "file-link"), "file");
    fsSync.symlinkSync(dir, path.join(dir, "dir-link"), "dir");
    return { supported: true, skipReason: null };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "UNKNOWN";
    return {
      supported: false,
      skipReason:
        `SKIPPED: real symlinks cannot be created on this host ` +
        `(platform=${os.platform()}, errno=${code}). On Windows this needs ` +
        `Administrator or Developer Mode. These cases MUST run on Linux, where ` +
        `CI and production live.`,
    };
  } finally {
    if (dir) fsSync.rmSync(dir, { recursive: true, force: true });
  }
}

const SYMLINK = probeSymlinkCapability();
const PROC_FD: Capability = SECURE_READ_PLATFORM.supportsProcSelfFd
  ? { supported: true, skipReason: null }
  : {
      supported: false,
      skipReason:
        `SKIPPED: /proc/self/fd does not exist on this host ` +
        `(platform=${os.platform()}). The descriptor-target check is a Linux ` +
        `kernel feature and MUST run on Linux.`,
    };

/** Cases needing both a real symlink and the Linux descriptor-target check. */
const RACE = {
  supported: SYMLINK.supported && PROC_FD.supported,
  skipReason: SYMLINK.skipReason ?? PROC_FD.skipReason,
};

if (!SYMLINK.supported) console.warn(SYMLINK.skipReason);
if (!PROC_FD.supported) console.warn(PROC_FD.skipReason);

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * `root` and `outside` are SIBLINGS whose names share a prefix on purpose:
 * `<tmp>/media` and `<tmp>/media-evil`. That is the exact shape the old
 * `resolved.startsWith(root)` containment test got wrong.
 */
let sandbox: string;
let root: string;
let outside: string;
let sink: SecureReadLogRecord[];

const CEILING = 64 * 1024;

beforeEach(async () => {
  // `realpath` because macOS `os.tmpdir()` is itself a symlink (/var → /private/var)
  // and Windows may hand back an 8.3 short name; every later comparison in the
  // test must be against the same canonical form the primitive uses.
  sandbox = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "hermes-secure-read-")));
  root = path.join(sandbox, "media");
  outside = path.join(sandbox, "media-evil");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  sink = [];
});

afterEach(async () => {
  await fs.rm(sandbox, { recursive: true, force: true });
});

function collectLog(record: SecureReadLogRecord): void {
  sink.push(record);
}

/** Deterministic, non-repeating bytes so an off-by-one slice cannot pass. */
function payload(size: number, seed = 0): Buffer {
  const buffer = Buffer.alloc(size);
  for (let index = 0; index < size; index += 1) buffer[index] = (index + seed) % 251;
  return buffer;
}

async function writeUnder(base: string, relative: string, body: Buffer): Promise<string> {
  const target = path.join(base, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body);
  return target;
}

function open(relativePath: string, overrides: Partial<Parameters<typeof openSecureFile>[0]> = {}) {
  return openSecureFile({
    root,
    relativePath,
    maxBytes: CEILING,
    log: collectLog,
    ...overrides,
  });
}

async function expectRefusal(
  relativePath: string,
  reason: SecureReadFailureReason,
  overrides: Partial<Parameters<typeof openSecureFile>[0]> = {},
): Promise<void> {
  const result = await open(relativePath, overrides);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.outcome).toBe("unavailable");
  expect(result.reason).toBe(reason);
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

// ── Platform capability flags ────────────────────────────────────────────────

describe("platform capability is explicit, exported and derived — never assumed", () => {
  it("derives the Linux branch from injected constants, so it is testable off Linux", () => {
    const linux = detectSecureReadPlatformCapabilities("linux", { O_NOFOLLOW: 0x20000 });
    expect(linux).toEqual({
      platform: "linux",
      supportsONoFollow: true,
      supportsProcSelfFd: true,
      closesTheTocTouWindow: true,
      requiresStrongPrimitives: true,
    });
  });

  it("derives the Windows branch: no O_NOFOLLOW constant, no procfs, window open", () => {
    const win = detectSecureReadPlatformCapabilities("win32", {});
    expect(win).toEqual({
      platform: "win32",
      supportsONoFollow: false,
      supportsProcSelfFd: false,
      closesTheTocTouWindow: false,
      requiresStrongPrimitives: false,
    });
  });

  it("does not claim procfs on macOS merely because O_NOFOLLOW exists there", () => {
    const darwin = detectSecureReadPlatformCapabilities("darwin", { O_NOFOLLOW: 0x100 });
    expect(darwin.supportsONoFollow).toBe(true);
    expect(darwin.supportsProcSelfFd).toBe(false);
    expect(darwin.closesTheTocTouWindow).toBe(false);
  });

  it("treats a zero-valued O_NOFOLLOW as absent — a no-op flag is not support", () => {
    expect(detectSecureReadPlatformCapabilities("linux", { O_NOFOLLOW: 0 }).supportsONoFollow).toBe(
      false,
    );
    expect(
      detectSecureReadPlatformCapabilities("linux", { O_NOFOLLOW: 1.5 }).supportsONoFollow,
    ).toBe(false);
  });

  it("reports this host truthfully", () => {
    expect(SECURE_READ_PLATFORM.platform).toBe(process.platform);
    expect(SECURE_READ_PLATFORM.supportsProcSelfFd).toBe(process.platform === "linux");
    expect(SECURE_READ_PLATFORM.supportsONoFollow).toBe(
      typeof fsSync.constants.O_NOFOLLOW === "number",
    );
  });

  it("MUST have both kernel guarantees on Linux — CI and production run there", () => {
    if (process.platform !== "linux") {
      expect(PROC_FD.skipReason).toMatch(/^SKIPPED: \/proc\/self\/fd does not exist/);
      expect(PROC_FD.skipReason).toContain(os.platform());
      return;
    }
    expect(SECURE_READ_PLATFORM.supportsONoFollow).toBe(true);
    expect(SECURE_READ_PLATFORM.supportsProcSelfFd).toBe(true);
    expect(SECURE_READ_PLATFORM.closesTheTocTouWindow).toBe(true);
  });

  it("declares the symlink capability explicitly and never skips silently", () => {
    if (SYMLINK.supported) {
      expect(SYMLINK.skipReason).toBeNull();
      return;
    }
    // The reason must exist, must name the platform, and must be actionable.
    expect(SYMLINK.skipReason).toMatch(/^SKIPPED: real symlinks cannot be created/);
    expect(SYMLINK.skipReason).toContain(os.platform());
    expect(SYMLINK.skipReason).toMatch(/MUST run on Linux/);
    // A Linux host that cannot create a symlink is a broken CI runner, not a
    // reason to skip the symlink suite. Fail loudly rather than report green.
    expect(process.platform).not.toBe("linux");
  });
});

// ── The happy path ───────────────────────────────────────────────────────────

describe("a contained regular file is served from one proven descriptor", () => {
  it("reports the fstat size and reads the whole object", async () => {
    const body = payload(3000);
    await writeUnder(root, "a/b/object.bin", body);

    const result = await open("a/b/object.bin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    try {
      expect(result.file.sizeBytes).toBe(3000);
      expect(await result.file.read()).toEqual(body);
    } finally {
      await result.file.close();
    }
    expect(sink).toEqual([]);
  });

  it("reads an exact inclusive slice at an absolute offset", async () => {
    const body = payload(5000);
    await writeUnder(root, "object.bin", body);
    const bytes = await readSecureFileRange(
      { root, relativePath: "object.bin", maxBytes: CEILING, log: collectLog },
      { start: 1000, end: 1099 },
    );
    expect(bytes).toEqual(body.subarray(1000, 1100));
  });

  it("streams an exact inclusive slice without materialising the object", async () => {
    const body = payload(9000);
    await writeUnder(root, "object.bin", body);
    const result = await open("object.bin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stream = result.file.createReadStream({ start: 4096, end: 8191 });
    expect(await collect(stream)).toEqual(body.subarray(4096, 8192));
  });

  it("accepts a file exactly at the ceiling and refuses the very next byte", async () => {
    await writeUnder(root, "exact.bin", payload(1024));
    await writeUnder(root, "over.bin", payload(1025));

    const atLimit = await open("exact.bin", { maxBytes: 1024 });
    expect(atLimit.ok).toBe(true);
    if (atLimit.ok) await atLimit.file.close();

    await expectRefusal("over.bin", "too_large", { maxBytes: 1024 });
  });

  it("treats the whole of an EMPTY object as an empty buffer, but refuses a range on it", async () => {
    await writeUnder(root, "empty.bin", Buffer.alloc(0));
    const result = await open("empty.bin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    try {
      expect(result.file.sizeBytes).toBe(0);
      expect(await result.file.read()).toEqual(Buffer.alloc(0));
      await expect(result.file.read({ start: 0, end: 0 })).rejects.toBeInstanceOf(
        SecureReadUsageError,
      );
    } finally {
      await result.file.close();
    }
  });

  it("statSecureFile releases the descriptor it proved", async () => {
    await writeUnder(root, "object.bin", payload(42));
    expect(await statSecureFile({ root, relativePath: "object.bin", maxBytes: CEILING })).toEqual({
      sizeBytes: 42,
    });
  });
});

// ── Size ceiling comes from fstat, never from a caller-declared number ───────

describe("the size ceiling is enforced against the descriptor", () => {
  it("refuses a file larger than the real ceiling on its fstat size", async () => {
    // Written for real, then judged on what is on disk — no database column,
    // no Content-Length, no caller assertion about the size is involved.
    await writeUnder(root, "big.bin", payload(2048));
    await expectRefusal("big.bin", "too_large", { maxBytes: 1024 });
    expect(sink.at(-1)?.severity).toBe("security");
    expect(sink.at(-1)?.detail).toContain("2048");
  });

  it("refuses a nonsensical ceiling instead of treating it as unlimited", async () => {
    await writeUnder(root, "object.bin", payload(10));
    await expectRefusal("object.bin", "too_large", { maxBytes: 0 });
    await expectRefusal("object.bin", "too_large", { maxBytes: -1 });
  });

  it("bounds a buffered read by the ceiling declared at open time", async () => {
    await writeUnder(root, "object.bin", payload(4096));
    const result = await open("object.bin", { maxBytes: 4096 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    try {
      const error = await result.file
        .read({ start: 0, end: 4095 })
        .then(() => null)
        .catch((caught: unknown) => caught);
      // 4096 bytes is exactly the ceiling — allowed.
      expect(error).toBeNull();
    } finally {
      await result.file.close();
    }
  });
});

// ── Path shape: never decoded, always contained ──────────────────────────────

describe("relative-path shape is refused, never repaired", () => {
  it("refuses an empty, absolute, drive-qualified or UNC path", async () => {
    await expectRefusal("", "invalid_relative_path");
    await expectRefusal("/etc/passwd", "invalid_relative_path");
    await expectRefusal("C:/Windows/win.ini", "invalid_relative_path");
    await expectRefusal("c:\\Windows\\win.ini", "invalid_relative_path");
    await expectRefusal("\\\\server\\share\\x", "invalid_relative_path");
  });

  it("refuses a `..` segment against BOTH separators on every platform", async () => {
    for (const hostile of [
      "../media-evil/secret.bin",
      "..",
      "a/../../media-evil/secret.bin",
      "..\\media-evil\\secret.bin",
      "a\\..\\..\\media-evil\\secret.bin",
      "a/..\\b",
    ]) {
      await expectRefusal(hostile, "invalid_relative_path");
    }
  });

  it("refuses a NUL byte rather than letting the syscall truncate the path", async () => {
    const nul = String.fromCharCode(0);
    await expectRefusal(`object.bin${nul}.png`, "invalid_relative_path");
    await expectRefusal(`${nul}`, "invalid_relative_path");
  });

  it("does NOT decode percent-encoding or dot lookalikes — it contains them", async () => {
    // A secret exists outside the root, so "contained" is a claim with teeth.
    await writeUnder(outside, "secret.bin", Buffer.from("TOP SECRET"));

    const encoded = [
      "%2e%2e%2f" + "media-evil/secret.bin",
      "%2e%2e/media-evil/secret.bin",
      "%252e%252e%252fmedia-evil/secret.bin",
      "..%2fmedia-evil%2fsecret.bin",
      "..%5cmedia-evil%5csecret.bin",
      // U+2024 ONE DOT LEADER and U+2025 TWO DOT LEADER: they LOOK like dots and
      // are ordinary filename characters. Decoding them as traversal would be a
      // bug; treating them as a name and containing them is correct.
      "\u2024\u2024/media-evil/secret.bin",
      "\u2025/media-evil/secret.bin",
      // Full-width full stop.
      "\uff0e\uff0e/media-evil/secret.bin",
    ];

    for (const relativePath of encoded) {
      const result = await open(relativePath);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      // Contained, therefore simply absent — NOT an escape, and above all not a
      // successful read of the file outside the root.
      expect(result.reason).toBe("not_found");
    }
  });
});

// ── File type ────────────────────────────────────────────────────────────────

describe("only a plain regular file is served", () => {
  it("refuses a directory where a file is expected", async () => {
    await fs.mkdir(path.join(root, "a-directory"), { recursive: true });
    await expectRefusal("a-directory", "not_regular_file");
  });

  it("refuses the storage root itself", async () => {
    await expectRefusal(".", "escapes_root");
  });

  it("returns not_found for an object that was never written", async () => {
    await expectRefusal("never-written.bin", "not_found");
    expect(sink.at(-1)?.severity).toBe("expected");
  });
});

// ── Symlinks (real ones) ─────────────────────────────────────────────────────

describe.skipIf(!SYMLINK.supported)("symlinks are refused, in every position", () => {
  it("refuses a FINAL component that is a symlink pointing OUTSIDE the root", async () => {
    const secret = await writeUnder(outside, "secret.bin", Buffer.from("TOP SECRET"));
    await fs.symlink(secret, path.join(root, "poster.png"), "file");

    // Refused as an ESCAPE, at step 3, which is strictly earlier than the
    // symlink policy at step 4: the canonical target is outside the root, and
    // that is the more fundamental fact about it.
    await expectRefusal("poster.png", "escapes_root");
    expect(sink.at(-1)?.severity).toBe("security");

    // The bytes were never produced by any entry point.
    expect(
      await readSecureFileRange({ root, relativePath: "poster.png", maxBytes: CEILING }),
    ).toBeNull();
  });

  it("refuses a symlink in an INTERMEDIATE directory", async () => {
    await writeUnder(outside, "deep/secret.bin", Buffer.from("TOP SECRET"));
    // `<root>/link` → `<sandbox>/media-evil`. Note that lexically this resolves
    // to `<root>/link/deep/secret.bin`, which passes a `startsWith(root)` test —
    // the exact bug this module exists to close.
    await fs.symlink(outside, path.join(root, "link"), "dir");

    await expectRefusal("link/deep/secret.bin", "escapes_root");
    expect(sink.at(-1)?.detail).toContain("media-evil");
  });

  it("refuses a symlink even when its target is INSIDE the root", async () => {
    // POLICY, ASSERTED EXPLICITLY: inside-root symlinks are refused too.
    //
    // Why: a symlink is a mutable indirection, so "the target is inside the
    // root" is only true at the instant it is checked and can be re-pointed
    // afterwards; and O_NOFOLLOW — the only ATOMIC form of this check — cannot
    // distinguish an inside-root link from an outside-root one, so permitting
    // inside links would mean giving up atomicity for the entire tree. Nothing
    // in this system ever writes a symlink under the storage root, so refusing
    // costs no legitimate functionality.
    const real = await writeUnder(root, "real/object.bin", payload(128));
    await fs.symlink(real, path.join(root, "alias.bin"), "file");

    await expectRefusal("alias.bin", "symlink_rejected");
    // ...while the real path it points at is served normally, which proves the
    // refusal is about the link and not about the content.
    const direct = await open("real/object.bin");
    expect(direct.ok).toBe(true);
    if (direct.ok) await direct.file.close();
  });

  it("refuses a BROKEN symlink as simply absent", async () => {
    await fs.symlink(path.join(outside, "does-not-exist.bin"), path.join(root, "dangling.bin"), "file");
    await expectRefusal("dangling.bin", "not_found");
  });

  it("refuses a symlink chain that ends outside the root", async () => {
    const secret = await writeUnder(outside, "secret.bin", Buffer.from("TOP SECRET"));
    await fs.symlink(secret, path.join(sandbox, "hop.bin"), "file");
    await fs.symlink(path.join(sandbox, "hop.bin"), path.join(root, "entry.bin"), "file");
    await expectRefusal("entry.bin", "escapes_root");
  });

  it("refuses a symlink to a DIRECTORY inside the root", async () => {
    await fs.mkdir(path.join(root, "real-dir"), { recursive: true });
    await fs.symlink(path.join(root, "real-dir"), path.join(root, "dir-alias"), "dir");
    await expectRefusal("dir-alias", "symlink_rejected");
  });
});

// ── The TOCTOU window, simulated deterministically ───────────────────────────

describe.skipIf(!SYMLINK.supported)("a swap between validation and open fails closed", () => {
  it("catches a FINAL component swapped for a symlink after validation", async () => {
    await writeUnder(root, "object.bin", payload(256));
    const secret = await writeUnder(outside, "secret.bin", Buffer.from("TOP SECRET"));

    let swapped = false;
    const result = await open("object.bin", {
      // Runs at the exact instant between "this pathname is a contained regular
      // file" and `open()`. No timing luck involved.
      __testSeamBeforeOpen: async () => {
        await fs.unlink(path.join(root, "object.bin"));
        await fs.symlink(secret, path.join(root, "object.bin"), "file");
        swapped = true;
      },
    });

    expect(swapped).toBe(true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (SECURE_READ_PLATFORM.supportsONoFollow) {
      // O_NOFOLLOW turns "is it a symlink?" and "open it" into one syscall, so
      // the open itself fails with ELOOP.
      expect(result.reason).toBe("symlink_rejected");
    } else {
      // Without O_NOFOLLOW the open succeeds and the device/inode identity
      // check is what refuses it. Weaker (non-atomic) but still closed.
      expect(result.reason).toBe("descriptor_race");
    }
  });

  it("catches an INTERMEDIATE directory swapped for a symlink after validation", async () => {
    await writeUnder(root, "sub/object.bin", payload(256));
    await writeUnder(outside, "object.bin", Buffer.from("TOP SECRET"));

    const result = await open("sub/object.bin", {
      __testSeamBeforeOpen: async () => {
        // O_NOFOLLOW protects the FINAL component only, so after this swap the
        // open SUCCEEDS and hands back a descriptor on the file outside the
        // root. Only a post-open check can catch it.
        await fs.rm(path.join(root, "sub"), { recursive: true, force: true });
        await fs.symlink(outside, path.join(root, "sub"), "dir");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("descriptor_race");
  });

  it("catches a swap the inode check CANNOT see, using /proc/self/fd", async () => {
    if (!RACE.supported) {
      expect(RACE.skipReason).toMatch(/^SKIPPED: /);
      return;
    }
    const real = await writeUnder(root, "sub/object.bin", payload(256));
    // A HARD LINK: same device, same inode, different name, outside the root.
    // The identity check in step 7 therefore passes, and the ONLY thing that can
    // refuse this is asking the kernel what the descriptor is attached to.
    await fs.link(real, path.join(outside, "object.bin"));

    const result = await open("sub/object.bin", {
      __testSeamBeforeOpen: async () => {
        await fs.rm(path.join(root, "sub"), { recursive: true, force: true });
        await fs.symlink(outside, path.join(root, "sub"), "dir");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("descriptor_race");
    expect(sink.at(-1)?.detail).toContain("outside the root");
  });

  it("catches a swap that stays INSIDE the root but is a different path", async () => {
    if (!RACE.supported) {
      expect(RACE.skipReason).toMatch(/^SKIPPED: /);
      return;
    }
    const real = await writeUnder(root, "a/object.bin", payload(256));
    await fs.mkdir(path.join(root, "b"), { recursive: true });
    // Same inode again, so only the descriptor's real NAME differs. Containment
    // alone would accept this; exact-path equality is what refuses it.
    await fs.link(real, path.join(root, "b", "object.bin"));

    const result = await open("a/object.bin", {
      __testSeamBeforeOpen: async () => {
        await fs.rm(path.join(root, "a"), { recursive: true, force: true });
        await fs.symlink(path.join(root, "b"), path.join(root, "a"), "dir");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("descriptor_race");
    expect(sink.at(-1)?.detail).toContain("does not match the validated path");
  });

  it("catches a file unlinked between validation and open", async () => {
    if (!PROC_FD.supported) {
      expect(PROC_FD.skipReason).toMatch(/^SKIPPED: \/proc\/self\/fd/);
      return;
    }
    await writeUnder(root, "object.bin", payload(256));
    const result = await open("object.bin", {
      __testSeamBeforeOpen: async () => {
        const replacement = await writeUnder(outside, "replacement.bin", payload(256, 7));
        await fs.rename(replacement, path.join(root, "object.bin"));
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("descriptor_race");
  });
});

// ── Failure disclosure ───────────────────────────────────────────────────────

describe("refusals disclose nothing", () => {
  it("returns one uniform outcome for every distinct failure", async () => {
    await fs.mkdir(path.join(root, "dir"), { recursive: true });
    await writeUnder(root, "big.bin", payload(2048));

    const results = [
      await open("missing.bin"),
      await open("dir"),
      await open("big.bin", { maxBytes: 1024 }),
      await open("../media-evil/secret.bin"),
    ];

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.outcome).toBe("unavailable");
      // The serialized failure must not carry a path, a root, or an errno.
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(sandbox);
      expect(serialized).not.toContain("media-evil");
      expect(serialized).not.toContain(os.tmpdir());
    }
  });

  it("sends the path and errno detail to the internal sink and nowhere else", async () => {
    await expectRefusal("missing.bin", "not_found");
    expect(sink).toHaveLength(1);
    // The internal record is allowed — required, even — to name the path.
    expect(sink[0]?.detail).toContain(root);
    expect(sink[0]?.reason).toBe("not_found");
  });

  it("never throws a path-bearing error from a usage mistake", async () => {
    await writeUnder(root, "object.bin", payload(100));
    const result = await open("object.bin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    try {
      const error = await result.file
        .read({ start: 0, end: 999 })
        .then(() => null)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SecureReadUsageError);
      expect((error as SecureReadUsageError).code).toBe("range_not_satisfiable");
      expect((error as Error).message).not.toContain(sandbox);
      expect((error as Error).message).not.toContain("object.bin");
    } finally {
      await result.file.close();
    }
  });

  it("refuses a root that does not exist or is not a directory", async () => {
    const missingRoot = await openSecureFile({
      root: path.join(sandbox, "no-such-root"),
      relativePath: "x.bin",
      maxBytes: CEILING,
      log: collectLog,
    });
    expect(missingRoot.ok).toBe(false);
    if (!missingRoot.ok) expect(missingRoot.reason).toBe("invalid_root");

    const fileAsRoot = await writeUnder(sandbox, "not-a-dir", Buffer.from("x"));
    const bad = await openSecureFile({
      root: fileAsRoot,
      relativePath: "x.bin",
      maxBytes: CEILING,
      log: collectLog,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("invalid_root");
  });
});

// ── Descriptor hygiene ───────────────────────────────────────────────────────

describe("descriptors are always accounted for", () => {
  it("hands ownership to the stream, after which read and close are inert", async () => {
    await writeUnder(root, "object.bin", payload(100));
    const result = await open("object.bin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stream = result.file.createReadStream({ start: 0, end: 9 });
    expect(await collect(stream)).toHaveLength(10);

    // The stream closed the descriptor; close() must not double-close.
    await expect(result.file.close()).resolves.toBeUndefined();
    await expect(result.file.read({ start: 0, end: 1 })).rejects.toBeInstanceOf(
      SecureReadUsageError,
    );
    expect(() => result.file.createReadStream()).toThrow(SecureReadUsageError);
  });

  it("closes the descriptor when the stream is destroyed mid-read", async () => {
    await writeUnder(root, "object.bin", payload(20000));
    const result = await open("object.bin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stream = result.file.createReadStream();
    stream.destroy();
    await new Promise((resolve) => stream.once("close", resolve));
    expect(stream.destroyed).toBe(true);
  });

  it("close() is idempotent", async () => {
    await writeUnder(root, "object.bin", payload(10));
    const result = await open("object.bin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await result.file.close();
    await expect(result.file.close()).resolves.toBeUndefined();
  });

  it("leaks no descriptor across many refusals and reads", async () => {
    if (!PROC_FD.supported) {
      // Counting open descriptors portably is not possible; on Linux it is a
      // directory listing, and Linux is where this must hold.
      expect(PROC_FD.skipReason).toMatch(/^SKIPPED: \/proc\/self\/fd does not exist/);
      return;
    }
    await writeUnder(root, "object.bin", payload(512));
    await writeUnder(root, "big.bin", payload(4096));
    await fs.mkdir(path.join(root, "dir"), { recursive: true });

    const countFds = (): number => fsSync.readdirSync("/proc/self/fd").length;
    // Warm up so a lazily-opened descriptor elsewhere is not counted as a leak.
    await statSecureFile({ root, relativePath: "object.bin", maxBytes: CEILING });
    const before = countFds();

    for (let index = 0; index < 40; index += 1) {
      await statSecureFile({ root, relativePath: "object.bin", maxBytes: CEILING, log: collectLog });
      await open("dir");
      await open("big.bin", { maxBytes: 1024 });
      await open("missing.bin");
      await readSecureFileRange(
        { root, relativePath: "object.bin", maxBytes: CEILING, log: collectLog },
        { start: 0, end: 15 },
      );
    }

    expect(countFds()).toBeLessThanOrEqual(before);
  });
});

// ── The production fail-closed rule ──────────────────────────────────────────

/**
 * REQUIREMENT: on Linux — the platform production runs on (Docker `node:20`) —
 * the strong kernel primitives are a PRECONDITION, not a preference. If
 * `O_NOFOLLOW` is unavailable, or the `/proc/self/fd` verification cannot be
 * performed, the read MUST fail closed. It must be impossible for a weakened
 * fallback to yield a PASS there.
 *
 * Proving that needs two layers, and both are here:
 *
 *   1. The RULE itself, as a pure function, across the whole platform matrix.
 *      This runs identically on every host, so a Windows developer sees the same
 *      verdicts CI does.
 *   2. The RULE AS WIRED, by driving the real `openSecureFile` down the Linux
 *      branch with a capability record injected through a seam that is ignored
 *      in production. Without this, the wiring would be asserted only by the
 *      branch that happens to run on the current host.
 */
describe("Linux REQUIRES the strong primitives — a weak fallback can never pass there", () => {
  const linuxWithout = (
    over: Partial<SecureReadPlatformCapabilities>,
  ): SecureReadPlatformCapabilities => ({
    platform: "linux",
    supportsONoFollow: true,
    supportsProcSelfFd: true,
    closesTheTocTouWindow: true,
    requiresStrongPrimitives: true,
    ...over,
  });

  it("rejects a Linux host with no O_NOFOLLOW", () => {
    expect(strongPrimitiveRejection(linuxWithout({ supportsONoFollow: false }))).toBe(
      "platform_unsupported",
    );
  });

  it("rejects a Linux host with no /proc/self/fd", () => {
    expect(strongPrimitiveRejection(linuxWithout({ supportsProcSelfFd: false }))).toBe(
      "platform_unsupported",
    );
  });

  it("rejects a Linux host missing both", () => {
    expect(
      strongPrimitiveRejection(
        linuxWithout({
          supportsONoFollow: false,
          supportsProcSelfFd: false,
          closesTheTocTouWindow: false,
        }),
      ),
    ).toBe("platform_unsupported");
  });

  it("admits a fully-equipped Linux host", () => {
    expect(strongPrimitiveRejection(linuxWithout({}))).toBeNull();
  });

  it("does not impose the requirement on a non-Linux development host", () => {
    expect(strongPrimitiveRejection(detectSecureReadPlatformCapabilities("win32", {}))).toBeNull();
    expect(
      strongPrimitiveRejection(
        detectSecureReadPlatformCapabilities("darwin", { O_NOFOLLOW: 0x100 }),
      ),
    ).toBeNull();
  });

  it("EXHAUSTIVE: no capability combination lets Linux through without BOTH primitives", () => {
    for (const oNoFollow of [true, false]) {
      for (const procFd of [true, false]) {
        const caps = linuxWithout({
          supportsONoFollow: oNoFollow,
          supportsProcSelfFd: procFd,
          closesTheTocTouWindow: oNoFollow && procFd,
        });
        // The only admitted combination is "both present".
        expect(strongPrimitiveRejection(caps) === null).toBe(oNoFollow && procFd);
      }
    }
  });

  it("derives requiresStrongPrimitives from the platform alone, never from what is available", () => {
    // A Linux host that has LOST the features is still a host that REQUIRES
    // them. Deriving the requirement from availability would make it vacuous.
    expect(detectSecureReadPlatformCapabilities("linux", {}).requiresStrongPrimitives).toBe(true);
    expect(detectSecureReadPlatformCapabilities("linux", {}).closesTheTocTouWindow).toBe(false);
    expect(SECURE_READ_PLATFORM.requiresStrongPrimitives).toBe(process.platform === "linux");
  });

  it("WIRED: openSecureFile refuses a perfectly valid file when Linux has no O_NOFOLLOW", async () => {
    await writeUnder(root, "object.bin", payload(256));
    // Sanity: the very same file is readable under this host's real capabilities.
    const control = await open("object.bin");
    expect(control.ok).toBe(true);
    if (control.ok) await control.file.close();

    await expectRefusal("object.bin", "platform_unsupported", {
      __testPlatformCapabilities: linuxWithout({
        supportsONoFollow: false,
        closesTheTocTouWindow: false,
      }),
    });
    expect(sink.at(-1)?.severity).toBe("security");
    expect(sink.at(-1)?.detail).toContain("O_NOFOLLOW=false");
  });

  it("WIRED: openSecureFile refuses a valid file when Linux cannot use /proc/self/fd", async () => {
    await writeUnder(root, "object.bin", payload(256));
    await expectRefusal("object.bin", "platform_unsupported", {
      __testPlatformCapabilities: linuxWithout({
        supportsProcSelfFd: false,
        closesTheTocTouWindow: false,
      }),
    });
  });

  it("WIRED: a host whose procfs is claimed but unreadable fails closed, it does not degrade", async () => {
    await writeUnder(root, "object.bin", payload(256));
    if (SECURE_READ_PLATFORM.supportsProcSelfFd) {
      // On real Linux the descriptor check runs for real and must SUCCEED —
      // asserting a refusal there would be asserting a broken kernel.
      const real = await open("object.bin");
      expect(real.ok).toBe(true);
      if (real.ok) await real.file.close();
      return;
    }
    // Off Linux, claiming procfs makes the readlink fail. The correct behaviour
    // is `descriptor_race` — "the verification could not be performed" — and
    // NOT a quiet success.
    await expectRefusal("object.bin", "descriptor_race", {
      __testPlatformCapabilities: linuxWithout({}),
    });
  });

  it("the capability seam is INERT in production, whatever a caller passes", async () => {
    await writeUnder(root, "object.bin", payload(256));
    const previous = process.env.NODE_ENV;
    try {
      // `NODE_ENV` is read-only in the Node typings; a deployed process is what
      // is being simulated, so the assignment goes through the record.
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      const result = await open("object.bin", {
        __testPlatformCapabilities: {
          platform: "linux",
          supportsONoFollow: false,
          supportsProcSelfFd: false,
          closesTheTocTouWindow: false,
          requiresStrongPrimitives: true,
        },
      });
      // The override was ignored, so this host's REAL capabilities decided the
      // outcome: a successful read on every supported host.
      expect(result.ok).toBe(true);
      if (result.ok) await result.file.close();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previous;
    }
  });
});

// ── Device + inode identity ──────────────────────────────────────────────────

/**
 * REQUIREMENT: device AND inode are captured before/at open and re-verified
 * after open; a mismatch fails closed.
 *
 * The symlink-based race cases above cover the swap-for-a-link shape. This suite
 * covers the shape that needs NO symlink — the pathname is repointed at a
 * DIFFERENT REGULAR FILE between validation and open — which is why it runs on
 * every host, Windows included, and carries no skip.
 *
 * It is driven by the `__testSeamBeforeOpen` hook, so the swap happens at a
 * known instant rather than by racing two threads and hoping.
 */
describe("device + inode identity is re-proven on the descriptor", () => {
  it("catches a pathname repointed at a DIFFERENT regular file after validation", async () => {
    const decoy = await writeUnder(root, "decoy.bin", payload(256, 7));
    const targetPath = await writeUnder(root, "object.bin", payload(256, 99));

    let swapped = false;
    const result = await open("object.bin", {
      __testSeamBeforeOpen: async () => {
        if (swapped) return;
        swapped = true;
        // Replace the validated pathname with a different inode. Windows needs
        // the unlink first; on POSIX the rename alone would be atomic.
        await fs.rm(targetPath, { force: true });
        await fs.rename(decoy, targetPath);
      },
    });

    expect(swapped).toBe(true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.outcome).toBe("unavailable");
    // `descriptor_race` is the identity refusal; a kernel that loses the race
    // differently still refuses. No branch here serves a byte.
    expect(["descriptor_race", "not_found"]).toContain(result.reason);
  });

  it("serves the file when the seam does NOT swap it — the hook itself proves nothing", async () => {
    const body = payload(256, 99);
    await writeUnder(root, "object.bin", body);
    let ran = false;
    const result = await open("object.bin", {
      __testSeamBeforeOpen: () => {
        ran = true;
      },
    });
    expect(ran).toBe(true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await result.file.read()).toEqual(body);
    await result.file.close();
  });

  it("states the identity policy honestly for this host", async () => {
    await writeUnder(root, "object.bin", payload(64));
    // On a host that REQUIRES the strong primitives, an identity that cannot be
    // compared is itself a refusal; every filesystem Linux serves this data from
    // reports dev+ino, so the enforced path is the successful one. Off Linux the
    // requirement is not imposed — which is precisely what the flag says.
    expect(SECURE_READ_PLATFORM.requiresStrongPrimitives).toBe(process.platform === "linux");
    const result = await open("object.bin");
    expect(result.ok).toBe(true);
    if (result.ok) await result.file.close();
  });
});
