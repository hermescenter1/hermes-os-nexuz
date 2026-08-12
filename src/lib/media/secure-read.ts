import { constants as fsConstants, promises as fs } from "fs";
import type { FileHandle } from "fs/promises";
import path from "path";
import type { Readable } from "stream";
import { logger } from "@/lib/logger";

/**
 * PHASE 102 — hardened local-filesystem read primitive.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The media storage layer previously contained this containment check:
 *
 *     const root = path.resolve(process.cwd(), getLocalDocumentStorageDir());
 *     const resolved = path.resolve(root, key);
 *     if (!resolved.startsWith(rootWithSeparator)) reject();
 *
 * `path.resolve` is PURE STRING ARITHMETIC. It collapses `..` lexically and it
 * never touches the filesystem, so it cannot see a symlink. Three real gaps
 * followed from that:
 *
 *   1. A symlink INSIDE the storage root pointing outside it resolved to a
 *      string under the root and was accepted.
 *   2. `startsWith(root)` is a prefix test on characters, not on path segments:
 *      `/data/media-evil/x` starts with `/data/media`.
 *   3. Even a correct `realpath()` check is only a snapshot. Between validating
 *      a pathname and opening it, the pathname can be re-pointed at something
 *      else (TOCTOU). Anything that validates a PATH and then opens that PATH
 *      again has a window; the only way to remove the window is to validate,
 *      open ONCE, re-prove the properties on the DESCRIPTOR, and then read
 *      exclusively from that descriptor.
 *
 * This module implements that discipline as a reusable primitive. It is
 * deliberately storage-agnostic: it knows about a root directory, a relative
 * path and a byte ceiling, and nothing about media, assets or organizations.
 *
 * PLATFORM REALITY — READ THIS BEFORE CHANGING ANYTHING
 * -----------------------------------------------------
 * Two of the strongest guarantees below are LINUX-ONLY kernel features:
 *
 *   - `O_NOFOLLOW` makes the OPEN ITSELF fail with ELOOP when the final path
 *     component is a symlink. It is the only way to make "not a symlink" and
 *     "open it" a single atomic decision. It does not exist on Windows.
 *   - `/proc/self/fd/<fd>` names the file the descriptor is ACTUALLY attached
 *     to, which is how a swap of an intermediate directory between validation
 *     and open is detected after the fact. It does not exist on Windows.
 *
 * Production runs on Linux (Docker, node:20). Development happens on Windows.
 * Those two features are therefore gated on {@link SECURE_READ_PLATFORM}, an
 * EXPLICIT, EXPORTED, TESTED capability record — never on a silent `try/catch`.
 *
 * THE ASYMMETRY IS THE POINT. On Linux the two features are a PRECONDITION, not
 * a preference: {@link strongPrimitiveRejection} refuses the open before any
 * syscall runs if either is missing, so no weakened path can return `ok: true`
 * on the platform this system is deployed on. Only a host that does not demand
 * them ({@link SecureReadPlatformCapabilities.requiresStrongPrimitives} `false`
 * — i.e. a non-Linux developer machine) degrades, and it degrades explicitly.
 *
 * On such a host the remaining checks (canonical-root containment via
 * `realpath`, segment-wise containment via `path.relative`, `lstat` symlink
 * refusal, `fstat` regular-file and size proof, and the device/inode identity
 * match between the pre-open `lstat` and the post-open `fstat`) all still run
 * at full strength — nothing portable is weakened to accommodate Windows. What
 * is honestly lost on such a host is atomicity: {@link SECURE_READ_PLATFORM}
 * `.closesTheTocTouWindow` is `false` there, and it says so.
 *
 * FAILURE DISCLOSURE
 * ------------------
 * Every failure — missing, symlink, directory, escape, race, oversize — maps to
 * ONE uniform outcome (`{ ok: false, outcome: "unavailable" }`) that the caller
 * renders as 404. Filesystem paths and errno detail never appear in a returned
 * value or a thrown message; they go only to the internal log sink. The
 * `reason` field is a fixed vocabulary with no attacker-controlled content and
 * exists for logs, metrics and tests — a caller must not branch a response on
 * it, because doing so would rebuild the oracle this design removes.
 */

// ── Platform capability (explicit, exported, tested) ─────────────────────────

export interface SecureReadPlatformCapabilities {
  readonly platform: NodeJS.Platform;
  /**
   * `O_NOFOLLOW` is available, so "refuse a symlink" and "open the file" are a
   * single atomic syscall. True on Linux and macOS; false on Windows, where
   * `fs.constants.O_NOFOLLOW` is `undefined`.
   */
  readonly supportsONoFollow: boolean;
  /**
   * `/proc/self/fd/<fd>` is available, so an open descriptor can be asked what
   * it is actually attached to. Linux only — this is a procfs feature, not a
   * POSIX one, so macOS is deliberately `false` rather than optimistically true.
   */
  readonly supportsProcSelfFd: boolean;
  /**
   * True only when BOTH kernel features are present. When false, the primitive
   * still refuses symlinks, escapes, directories and oversize objects, but it
   * cannot prove the descriptor was not swapped underneath it at open time.
   */
  readonly closesTheTocTouWindow: boolean;
  /**
   * PRODUCTION GATE. True on Linux — the platform this system is deployed on
   * (Docker `node:20`).
   *
   * When true, the strong primitives are not an optimisation, they are a
   * PRECONDITION: {@link openSecureFile} refuses to open anything at all unless
   * both are present. That is what makes it impossible for a weakened fallback
   * to serve a byte in production. A Linux host whose `fs.constants` has no
   * `O_NOFOLLOW`, or whose procfs is not mounted, is a broken host, and a broken
   * host must fail loudly rather than quietly downgrade to the portable checks.
   *
   * On a non-Linux DEVELOPMENT host it is false, and the primitive degrades to
   * the portable checks only — which is the whole reason this flag is exported
   * and tested rather than being an implicit `try/catch`.
   */
  readonly requiresStrongPrimitives: boolean;
}

/**
 * Pure, injectable capability derivation — the reason this is a separate
 * function is so a Windows developer host can still TEST the Linux branch
 * rather than take it on faith.
 */
export function detectSecureReadPlatformCapabilities(
  platform: NodeJS.Platform,
  constants: { readonly O_NOFOLLOW?: number },
): SecureReadPlatformCapabilities {
  const oNoFollow = constants.O_NOFOLLOW;
  // `0` would be a no-op flag, which is indistinguishable from "absent" for our
  // purposes and must not be reported as support.
  const supportsONoFollow =
    typeof oNoFollow === "number" && Number.isInteger(oNoFollow) && oNoFollow !== 0;
  const supportsProcSelfFd = platform === "linux";
  return {
    platform,
    supportsONoFollow,
    supportsProcSelfFd,
    closesTheTocTouWindow: supportsONoFollow && supportsProcSelfFd,
    requiresStrongPrimitives: platform === "linux",
  };
}

/** The capabilities of the host this process is actually running on. */
export const SECURE_READ_PLATFORM: SecureReadPlatformCapabilities =
  detectSecureReadPlatformCapabilities(process.platform, fsConstants);

/**
 * THE PRODUCTION FAIL-CLOSED RULE, as a pure predicate.
 *
 * Returns the refusal reason when a host DEMANDS the strong primitives but does
 * not have them, and `null` when the open may proceed. It is exported so the
 * rule itself can be tested across the whole platform matrix on any developer
 * machine — the guarantee "a weak fallback can never yield a PASS on Linux" is
 * then a property of a tested function rather than a claim about a branch that
 * only ever runs in CI.
 */
export function strongPrimitiveRejection(
  capabilities: SecureReadPlatformCapabilities,
): SecureReadFailureReason | null {
  if (!capabilities.requiresStrongPrimitives) return null;
  if (!capabilities.supportsONoFollow) return "platform_unsupported";
  if (!capabilities.supportsProcSelfFd) return "platform_unsupported";
  return null;
}

// ── Result vocabulary ────────────────────────────────────────────────────────

export const SECURE_READ_FAILURE_REASONS = [
  /** The configured root does not exist, or is not a directory. */
  "invalid_root",
  /** The relative path was empty, absolute, NUL-bearing or had a `..` segment. */
  "invalid_relative_path",
  /** The candidate — or its canonical target — is not inside the canonical root. */
  "escapes_root",
  /** No such file, including a symlink whose target does not exist. */
  "not_found",
  /** A symlink was encountered where a plain regular file is required. */
  "symlink_rejected",
  /** A directory, FIFO, socket or device where a regular file is required. */
  "not_regular_file",
  /** `fstat` size exceeded the ceiling the caller declared at open time. */
  "too_large",
  /** The descriptor is not attached to the file that was validated. */
  "descriptor_race",
  /** The process is not permitted to open the object. */
  "not_permitted",
  /**
   * The host demands the strong kernel primitives (Linux) and does not have
   * them. Nothing is opened at all. See {@link strongPrimitiveRejection}.
   */
  "platform_unsupported",
  /** Any other filesystem error. */
  "io_error",
] as const;

export type SecureReadFailureReason = (typeof SECURE_READ_FAILURE_REASONS)[number];

/**
 * Reasons that are a normal part of serving traffic. Logging one per request
 * would turn "request a URL that 404s" into a log-amplification lever, so the
 * default sink stays silent for these and speaks up for everything else.
 */
const EXPECTED_REASONS: ReadonlySet<SecureReadFailureReason> = new Set<SecureReadFailureReason>([
  "not_found",
]);

export interface SecureReadLogRecord {
  readonly reason: SecureReadFailureReason;
  readonly severity: "expected" | "security";
  /**
   * INTERNAL ONLY. May contain absolute filesystem paths and errno detail.
   * Must never be placed in an HTTP response, an error message that can escape,
   * or anything a client can observe.
   */
  readonly detail: string;
}

export type SecureReadLogSink = (record: SecureReadLogRecord) => void;

const defaultLogSink: SecureReadLogSink = (record) => {
  if (record.severity === "expected") return;
  logger.warn("media.secure_read.refused", { reason: record.reason, detail: record.detail });
};

export interface SecureReadFailure {
  readonly ok: false;
  /**
   * Always this single value. Callers render exactly one outcome — 404 — for
   * every refusal, so that "missing", "forbidden" and "you tried something
   * clever" are indistinguishable from outside.
   */
  readonly outcome: "unavailable";
  /** Internal classification. Never render it; never branch a response on it. */
  readonly reason: SecureReadFailureReason;
}

export interface SecureReadSuccess {
  readonly ok: true;
  readonly file: SecureFile;
}

export type SecureOpenResult = SecureReadSuccess | SecureReadFailure;

// ── Usage errors (programming errors, never path-bearing) ────────────────────

export const SECURE_READ_USAGE_CODES = [
  "range_not_satisfiable",
  "range_exceeds_ceiling",
  "descriptor_released",
] as const;

export type SecureReadUsageCode = (typeof SECURE_READ_USAGE_CODES)[number];

/**
 * Thrown for a caller mistake — an inverted range, a range past the end of the
 * object, a read after the descriptor was handed to a stream. Messages are
 * fixed strings: no path, no key, no errno, so this class is safe even if a
 * caller carelessly lets it reach a response body.
 */
export class SecureReadUsageError extends Error {
  readonly code: SecureReadUsageCode;

  constructor(code: SecureReadUsageCode, message: string) {
    super(message);
    this.name = "SecureReadUsageError";
    this.code = code;
  }
}

// ── The open descriptor ──────────────────────────────────────────────────────

export interface SecureByteRange {
  /** Inclusive first byte. */
  readonly start: number;
  /** Inclusive last byte. */
  readonly end: number;
}

export interface SecureFile {
  /** Size proven by `fstat` on the open descriptor — never a database column. */
  readonly sizeBytes: number;
  /**
   * Bounded buffered read from THIS descriptor, at an absolute offset. Never
   * re-opens by pathname. Bounded twice: by the object's real size and by the
   * `maxBytes` ceiling the caller declared when opening.
   */
  read(range?: SecureByteRange): Promise<Buffer>;
  /**
   * Lazy stream over exactly `[start, end]` of THIS descriptor. The stream
   * TAKES OWNERSHIP: it closes the descriptor when it ends, errors or is
   * destroyed, and {@link SecureFile.close} becomes a no-op afterwards. Exactly
   * one stream may be created per descriptor.
   */
  createReadStream(range?: SecureByteRange): Readable;
  /** Idempotent. Safe to call after a stream has taken ownership. */
  close(): Promise<void>;
}

export interface OpenSecureFileInput {
  /** Storage root. Relative values resolve against `process.cwd()`. */
  readonly root: string;
  /** Path under the root, `/`-separated. Never decoded, never rewritten. */
  readonly relativePath: string;
  /**
   * Hard ceiling applied to the `fstat` size of the OPEN DESCRIPTOR. This is
   * the only size that may be trusted; a size recorded in a database row proves
   * nothing about what is on disk right now.
   */
  readonly maxBytes: number;
  /** Internal sink. Defaults to the structured application logger. */
  readonly log?: SecureReadLogSink;
  /**
   * TEST SEAM — awaited between validation (steps 1-4) and the open (step 5).
   *
   * It exists so the TOCTOU defences can be proven deterministically instead of
   * by racing two threads and hoping. Production callers must never pass it;
   * nothing in `src/` outside the test suite does.
   */
  readonly __testSeamBeforeOpen?: () => void | Promise<void>;
  /**
   * TEST SEAM — substitutes the host capability record for ONE call.
   *
   * A Windows developer host cannot otherwise execute the Linux branches, so
   * without this the fail-closed rule would be asserted only by a pure-function
   * test and taken on faith inside `openSecureFile` itself. With it, a test can
   * drive the real function down the Linux path and observe that it refuses.
   *
   * It is HONOURED ONLY when `NODE_ENV === "test"` — not merely "not
   * production" — so it cannot weaken, or strengthen into a false pass,
   * anything in a deployed process, and it also cannot be reached on a
   * `development`-mode host (e.g. a Linux staging box), where a caller passing
   * `requiresStrongPrimitives: false` would otherwise silently downgrade to the
   * portable-only path. No production caller passes it, and this is what makes
   * that true beyond "no caller happens to."
   */
  readonly __testPlatformCapabilities?: SecureReadPlatformCapabilities;
}

/**
 * The capability record a single call runs under. Every environment except the
 * test runner uses the real host's; only `NODE_ENV === "test"` honours the seam.
 */
function effectiveCapabilities(input: OpenSecureFileInput): SecureReadPlatformCapabilities {
  const override = input.__testPlatformCapabilities;
  if (override !== undefined && process.env.NODE_ENV === "test") return override;
  return SECURE_READ_PLATFORM;
}

// ── Path containment ─────────────────────────────────────────────────────────

/**
 * Segment-wise containment. `startsWith(root)` is the wrong test — it accepts
 * `/data/media-evil` for the root `/data/media` — so containment is decided by
 * `path.relative`, which yields a value that is empty (same path), absolute
 * (different drive/root) or `..`-leading (outside) in exactly the bad cases.
 *
 * The `..` test is segment-wise on purpose: a plain `startsWith("..")` would
 * also reject a perfectly legal directory named `..config`.
 */
function isContainedWithin(canonicalRoot: string, candidate: string): boolean {
  const relative = path.relative(canonicalRoot, candidate);
  if (relative === "") return false; // the root itself is not a readable object
  if (path.isAbsolute(relative)) return false;
  if (relative === "..") return false;
  if (relative.startsWith(`..${path.sep}`)) return false;
  // Normalise the alternate separator too: Windows accepts both, and a value
  // that reached here with a forward slash must not dodge the segment test.
  if (path.sep !== "/" && relative.startsWith("../")) return false;
  return true;
}

/**
 * Shape rejection for the caller-supplied relative path. This runs BEFORE any
 * filesystem call so that a hostile value never reaches a syscall at all.
 *
 * Nothing here decodes anything. `%2e%2e%2f`, `%252e`, `..%c0%af` and Unicode
 * dot lookalikes such as `․․` are ORDINARY FILENAME CHARACTERS to a
 * filesystem, and treating them as traversal would mean this layer performs a
 * decode that the layer above already performed — the classic double-decode
 * bug. They are simply contained by the root check like any other name.
 */
/**
 * Built rather than written as an escape sequence on purpose: a literal NUL in
 * a source file is invisible in review and does not survive every editor.
 */
const NUL = String.fromCharCode(0);

function relativePathRejection(relativePath: string): SecureReadFailureReason | null {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    return "invalid_relative_path";
  }
  // A NUL truncates the path at the syscall boundary in C, so a value carrying
  // one is refused deterministically rather than left to Node's own error.
  if (relativePath.includes(NUL)) return "invalid_relative_path";
  if (path.isAbsolute(relativePath)) return "invalid_relative_path";
  // Windows-only absolute forms that `path.isAbsolute` does not flag on POSIX.
  if (/^[A-Za-z]:/.test(relativePath)) return "invalid_relative_path";
  if (relativePath.startsWith("\\\\")) return "invalid_relative_path";

  // Segment scan against BOTH separators regardless of platform. On Linux a
  // backslash is a legal filename character, so this is stricter than the OS
  // requires — deliberately, because a path whose meaning changes between the
  // dev host and the production host is a bug waiting for a deployment.
  const segments = relativePath.split(/[\\/]/);
  for (const segment of segments) {
    if (segment === "..") return "invalid_relative_path";
  }
  return null;
}

// ── Error mapping ────────────────────────────────────────────────────────────

function errnoOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "UNKNOWN";
}

function openFailureReason(code: string): SecureReadFailureReason {
  switch (code) {
    case "ELOOP":
      // O_NOFOLLOW refused the final component. This is the atomic symlink
      // rejection — including the case where the symlink appeared AFTER lstat.
      return "symlink_rejected";
    case "ENOENT":
    case "ENOTDIR":
      return "not_found";
    case "EISDIR":
      return "not_regular_file";
    case "EACCES":
    case "EPERM":
      return "not_permitted";
    default:
      return "io_error";
  }
}

// ── The primitive ────────────────────────────────────────────────────────────

const PROC_DELETED_SUFFIX = " (deleted)";

function fail(
  reason: SecureReadFailureReason,
  detail: string,
  sink: SecureReadLogSink,
): SecureReadFailure {
  sink({
    reason,
    severity: EXPECTED_REASONS.has(reason) ? "expected" : "security",
    detail,
  });
  return { ok: false, outcome: "unavailable", reason };
}

/**
 * Opens a file under `root` and proves, on the resulting DESCRIPTOR, that it is
 * a contained, non-symlinked, regular file within the declared ceiling.
 *
 * The order below is the contract and is not interchangeable:
 *
 *   0. PLATFORM GATE. On a host that demands the strong primitives (Linux, i.e.
 *      production) the open is refused outright unless BOTH `O_NOFOLLOW` and
 *      `/proc/self/fd` are available. Nothing below runs, so there is no code
 *      path by which a weakened check can return `ok: true` in production.
 *   1. canonical root via `realpath` (NOT `path.resolve` — the root itself may
 *      legitimately be reached through a symlink, e.g. `/tmp` on macOS, and
 *      every later comparison must be against the canonical form)
 *   2. resolve the candidate and contain it with `path.relative`
 *   3. `realpath` the candidate and re-contain — catches symlinks in
 *      INTERMEDIATE directories, which step 2 cannot see
 *   4. `lstat` the FINAL component and refuse a symlink outright
 *   5. open with `O_RDONLY | O_NOFOLLOW` (Linux/macOS)
 *   6. `fstat` the descriptor: regular file, and within the ceiling
 *   7. device/inode identity: the descriptor must be the object step 4 examined
 *   8. `/proc/self/fd/<fd>` (Linux): the descriptor's real name must still be
 *      inside the canonical root and must still be the path we validated
 *
 * Steps 6-8 are what make this different from a `realpath`-then-open helper:
 * they are asked of the descriptor, after the window has closed, so a swap
 * performed inside the window is detected instead of being served.
 */
export async function openSecureFile(input: OpenSecureFileInput): Promise<SecureOpenResult> {
  const sink = input.log ?? defaultLogSink;
  const capabilities = effectiveCapabilities(input);

  // ── 0. Platform gate — production may not run without the strong primitives ─
  const platformRejection = strongPrimitiveRejection(capabilities);
  if (platformRejection !== null) {
    return fail(
      platformRejection,
      `host requires the strong read primitives and lacks them: platform=${capabilities.platform} ` +
        `O_NOFOLLOW=${capabilities.supportsONoFollow} procSelfFd=${capabilities.supportsProcSelfFd}`,
      sink,
    );
  }

  if (!Number.isInteger(input.maxBytes) || input.maxBytes <= 0) {
    return fail("too_large", `maxBytes must be a positive integer; got ${String(input.maxBytes)}`, sink);
  }

  const shapeRejection = relativePathRejection(input.relativePath);
  if (shapeRejection !== null) {
    return fail(shapeRejection, `relative path refused by shape check: ${input.relativePath}`, sink);
  }

  // ── 1. Canonical root ──────────────────────────────────────────────────────
  let canonicalRoot: string;
  try {
    canonicalRoot = await fs.realpath(path.resolve(process.cwd(), input.root));
  } catch (error) {
    return fail("invalid_root", `realpath(root) failed: ${input.root} (${errnoOf(error)})`, sink);
  }
  try {
    const rootStats = await fs.stat(canonicalRoot);
    if (!rootStats.isDirectory()) {
      return fail("invalid_root", `storage root is not a directory: ${canonicalRoot}`, sink);
    }
  } catch (error) {
    return fail("invalid_root", `stat(root) failed: ${canonicalRoot} (${errnoOf(error)})`, sink);
  }

  // ── 2. Lexical containment of the candidate ────────────────────────────────
  const candidate = path.resolve(canonicalRoot, input.relativePath);
  if (!isContainedWithin(canonicalRoot, candidate)) {
    return fail("escapes_root", `candidate escaped the root: ${candidate}`, sink);
  }

  // ── 3. Canonical containment (catches intermediate-directory symlinks) ─────
  let canonicalCandidate: string;
  try {
    canonicalCandidate = await fs.realpath(candidate);
  } catch (error) {
    const code = errnoOf(error);
    // A broken symlink lands here as ENOENT, which is the correct uniform
    // outcome: the object cannot be served, and saying WHY would disclose that
    // a link exists at all.
    return fail(
      code === "ENOENT" || code === "ENOTDIR" ? "not_found" : "io_error",
      `realpath(candidate) failed: ${candidate} (${code})`,
      sink,
    );
  }
  if (!isContainedWithin(canonicalRoot, canonicalCandidate)) {
    return fail(
      "escapes_root",
      `canonical target escaped the root: ${candidate} -> ${canonicalCandidate}`,
      sink,
    );
  }

  // ── 4. The final component must not itself be a symlink ────────────────────
  //
  // POLICY, STATED EXPLICITLY: a symlink is refused even when it points at a
  // file that IS inside the canonical root.
  //
  // Justification. (a) A symlink is a mutable indirection: "the target is
  // inside the root" is a fact about this instant, and the link can be
  // re-pointed at any later instant, so accepting inside-root links would make
  // every containment decision perishable. (b) `O_NOFOLLOW` — the only atomic
  // form of this check — cannot distinguish an inside-root link from an
  // outside-root one; it refuses links, full stop. Allowing inside-root links
  // would therefore mean giving up atomicity for the whole tree in exchange for
  // a capability nothing needs. (c) Nothing in this system ever creates a
  // symlink under the storage root: objects are written by
  // `ObjectStorage.put()` as plain files with server-generated UUID names. A
  // symlink appearing there is, by construction, either an operator mistake or
  // an attacker, and both deserve the same refusal.
  let linkStats: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    linkStats = await fs.lstat(candidate);
  } catch (error) {
    const code = errnoOf(error);
    return fail(
      code === "ENOENT" || code === "ENOTDIR" ? "not_found" : "io_error",
      `lstat(candidate) failed: ${candidate} (${code})`,
      sink,
    );
  }
  if (linkStats.isSymbolicLink()) {
    return fail("symlink_rejected", `final component is a symlink: ${candidate}`, sink);
  }
  if (linkStats.isDirectory()) {
    return fail("not_regular_file", `candidate is a directory: ${candidate}`, sink);
  }
  if (!linkStats.isFile()) {
    return fail("not_regular_file", `candidate is not a regular file: ${candidate}`, sink);
  }

  // ── TEST SEAM ──────────────────────────────────────────────────────────────
  // Everything above validated a PATHNAME. Everything below validates the
  // DESCRIPTOR. This is the exact instant a TOCTOU attacker needs, which is why
  // the tests are allowed to act here.
  if (input.__testSeamBeforeOpen) {
    await input.__testSeamBeforeOpen();
  }

  // ── 5. Open once ───────────────────────────────────────────────────────────
  const flags = capabilities.supportsONoFollow
    ? fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
    : fsConstants.O_RDONLY;

  let handle: FileHandle;
  try {
    handle = await fs.open(candidate, flags);
  } catch (error) {
    const code = errnoOf(error);
    return fail(openFailureReason(code), `open failed: ${candidate} (${code})`, sink);
  }

  // From here on EVERY exit path must close the descriptor.
  try {
    // ── 6. Prove the descriptor is a regular file within the ceiling ─────────
    const stats = await handle.stat();
    if (!stats.isFile()) {
      return fail("not_regular_file", `descriptor is not a regular file: ${candidate}`, sink);
    }
    if (stats.size > input.maxBytes) {
      return fail(
        "too_large",
        `descriptor size ${stats.size} exceeds ceiling ${input.maxBytes}: ${candidate}`,
        sink,
      );
    }

    // ── 7. Identity: the descriptor must be the object step 4 examined ───────
    //
    // Portable half of the anti-swap defence, and the only one available on
    // Windows. `ino` is 0 on filesystems that do not report one, so the check
    // is applied only when both sides carry a real identity — an unenforceable
    // check must not be reported as enforced.
    //
    // On a host that DEMANDS the strong primitives, "no identity to compare" is
    // itself a refusal: every filesystem Linux serves this data from reports a
    // device and an inode, so their absence means the identity proof cannot be
    // performed, and an unperformed proof must never read as a pass.
    const identityAvailable =
      linkStats.ino !== 0 && stats.ino !== 0 && linkStats.dev !== 0 && stats.dev !== 0;
    if (!identityAvailable && capabilities.requiresStrongPrimitives) {
      return fail(
        "descriptor_race",
        `device/inode identity is unavailable on a host that requires it: ${candidate} ` +
          `(${linkStats.dev}:${linkStats.ino} / ${stats.dev}:${stats.ino})`,
        sink,
      );
    }
    if (identityAvailable && (linkStats.ino !== stats.ino || linkStats.dev !== stats.dev)) {
      return fail(
        "descriptor_race",
        `descriptor identity changed between lstat and open: ${candidate} ` +
          `(${linkStats.dev}:${linkStats.ino} -> ${stats.dev}:${stats.ino})`,
        sink,
      );
    }

    // ── 8. Ask the kernel what this descriptor is actually attached to ───────
    if (capabilities.supportsProcSelfFd) {
      let descriptorTarget: string;
      try {
        descriptorTarget = await fs.readlink(`/proc/self/fd/${handle.fd}`);
      } catch (error) {
        // procfs is expected to be present on Linux. If it is not, we must not
        // quietly continue as though step 8 had passed.
        return fail(
          "descriptor_race",
          `unable to read /proc/self/fd/${handle.fd} (${errnoOf(error)})`,
          sink,
        );
      }
      if (descriptorTarget.endsWith(PROC_DELETED_SUFFIX)) {
        return fail(
          "descriptor_race",
          `descriptor target was unlinked after open: ${descriptorTarget}`,
          sink,
        );
      }
      if (!isContainedWithin(canonicalRoot, descriptorTarget)) {
        return fail(
          "descriptor_race",
          `descriptor target is outside the root: ${descriptorTarget}`,
          sink,
        );
      }
      if (descriptorTarget !== canonicalCandidate) {
        // Both values are kernel-canonical absolute paths for the same mount
        // namespace, so a mismatch means the pathname resolved to a different
        // object at open time than it did at validation time. Contained but
        // different is still a swap, and it fails closed.
        return fail(
          "descriptor_race",
          `descriptor target does not match the validated path: ` +
            `${canonicalCandidate} != ${descriptorTarget}`,
          sink,
        );
      }
    }

    return { ok: true, file: createSecureFile(handle, stats.size, input.maxBytes) };
  } catch (error) {
    return fail("io_error", `descriptor validation failed: ${candidate} (${errnoOf(error)})`, sink);
  } finally {
    // `closeIfUnclaimed` is a no-op once `createSecureFile` has handed the
    // descriptor to the returned SecureFile; on every failure path above it is
    // the guarantee that no descriptor leaks.
    await closeIfUnclaimed(handle);
  }
}

// ── Descriptor ownership ─────────────────────────────────────────────────────

/**
 * Descriptors that have been wrapped in a {@link SecureFile}. `openSecureFile`
 * closes in a `finally`, which must NOT close the descriptor it is about to
 * return, so ownership is tracked explicitly rather than by control flow.
 */
const claimed = new WeakSet<FileHandle>();

async function closeIfUnclaimed(handle: FileHandle): Promise<void> {
  if (claimed.has(handle)) return;
  await handle.close().catch(() => {
    /* closing a descriptor we are already discarding must never mask the real
       failure the caller is about to be told about */
  });
}

function assertRange(range: SecureByteRange, sizeBytes: number, ceiling: number): void {
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start
  ) {
    throw new SecureReadUsageError(
      "range_not_satisfiable",
      "Requested byte range is not a well-formed inclusive range.",
    );
  }
  if (sizeBytes === 0 || range.end >= sizeBytes) {
    throw new SecureReadUsageError(
      "range_not_satisfiable",
      "Requested byte range is not satisfiable for this object.",
    );
  }
  if (range.end - range.start + 1 > ceiling) {
    throw new SecureReadUsageError(
      "range_exceeds_ceiling",
      "Requested byte range exceeds the ceiling declared when the object was opened.",
    );
  }
}

function createSecureFile(handle: FileHandle, sizeBytes: number, ceiling: number): SecureFile {
  claimed.add(handle);
  let released = false;
  let closed = false;

  const wholeObject = (): SecureByteRange => ({ start: 0, end: Math.max(sizeBytes - 1, 0) });

  return {
    sizeBytes,

    async read(range?: SecureByteRange): Promise<Buffer> {
      if (released || closed) {
        throw new SecureReadUsageError(
          "descriptor_released",
          "This secure descriptor has already been closed or handed to a stream.",
        );
      }
      // "The whole of an empty object" is an empty buffer, not an unsatisfiable
      // range. An EXPLICIT range against an empty object is still refused, which
      // is what RFC 9110 requires of a `Range` request.
      if (range === undefined && sizeBytes === 0) return Buffer.alloc(0);
      const effective = range ?? wholeObject();
      assertRange(effective, sizeBytes, ceiling);
      const length = effective.end - effective.start + 1;
      // Zero-filled, not `allocUnsafe`: if the file were truncated between the
      // fstat and the read, an unsafe buffer would hand back uninitialised
      // process memory as though it were file content.
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, effective.start);
      return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
    },

    createReadStream(range?: SecureByteRange): Readable {
      if (released || closed) {
        throw new SecureReadUsageError(
          "descriptor_released",
          "This secure descriptor has already been closed or handed to a stream.",
        );
      }
      const effective = range ?? wholeObject();
      // The stream path deliberately does NOT apply the buffered ceiling: a
      // stream never holds the object in memory, which is the entire reason the
      // stream path exists.
      if (
        !Number.isInteger(effective.start) ||
        !Number.isInteger(effective.end) ||
        effective.start < 0 ||
        effective.end < effective.start ||
        sizeBytes === 0 ||
        effective.end >= sizeBytes
      ) {
        throw new SecureReadUsageError(
          "range_not_satisfiable",
          "Requested byte range is not satisfiable for this object.",
        );
      }
      released = true;
      // `autoClose` is what transfers ownership: the descriptor dies with the
      // stream, including when a client aborts mid-playback and the route
      // destroys it.
      return handle.createReadStream({ start: effective.start, end: effective.end, autoClose: true });
    },

    async close(): Promise<void> {
      if (released || closed) return;
      closed = true;
      await handle.close().catch(() => {
        /* idempotent by contract */
      });
    },
  };
}

// ── Convenience wrappers that own the `finally` ──────────────────────────────

export interface SecureStat {
  readonly sizeBytes: number;
}

/**
 * Size of a contained, non-symlinked regular file, proven on a descriptor and
 * then immediately released. Returns `null` for every refusal — the caller sees
 * the same thing whether the object is missing, a symlink, a directory or too
 * large.
 */
export async function statSecureFile(input: OpenSecureFileInput): Promise<SecureStat | null> {
  const opened = await openSecureFile(input);
  if (!opened.ok) return null;
  try {
    return { sizeBytes: opened.file.sizeBytes };
  } finally {
    await opened.file.close();
  }
}

/**
 * Bounded buffered read that opens, reads from the descriptor and closes it in
 * a `finally`. Returns `null` for every refusal. A {@link SecureReadUsageError}
 * (a caller mistake, not a filesystem outcome) still propagates.
 */
export async function readSecureFileRange(
  input: OpenSecureFileInput,
  range?: SecureByteRange,
): Promise<Buffer | null> {
  const opened = await openSecureFile(input);
  if (!opened.ok) return null;
  try {
    return await opened.file.read(range);
  } finally {
    await opened.file.close();
  }
}
