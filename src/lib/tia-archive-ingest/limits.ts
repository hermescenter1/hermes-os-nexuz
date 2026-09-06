/**
 * PHASE 109-C2.1 — resource limits for archive ingestion.
 *
 * EVERY LIMIT CARRIES ITS UNIT IN ITS NAME OR ITS DOC. The C2.1 decision report
 * (R2, correction 7) required this because the two byte counts that matter most
 * are not the same quantity:
 *
 *   - a DECLARED size is a number an attacker writes into a header. It is a
 *     claim. Checking it costs nothing and stops the lazy cases.
 *   - an OBSERVED size is bytes that actually moved through the stream. It is
 *     the only one that bounds memory or time, and it is enforced DURING the
 *     read, not after it.
 *
 * A limit that is only checked after the read has already happened is not a
 * limit. Every observed bound below is applied per chunk.
 */

/** Limits for one ingestion attempt. All names are unit-suffixed or documented. */
export const INGEST_LIMITS = Object.freeze({
  /** Whole container, in octets, enforced while streaming into the parser. */
  maxContainerBytes: 32 * 1024 * 1024,

  /**
   * Entries the central directory may declare. Count.
   *
   * DELIBERATELY LOWER THAN C2.0's `TIA_PACKAGE_LIMITS.maxEntries` (20 000).
   * That bound governs a number written in a JSON manifest and costs nothing to
   * allow. This one governs how large the parser's terminal DONE message can
   * become, and the supervisor has to hold that message in memory inside a
   * 128 MiB cgroup while a child is still running.
   *
   * The worst case is computed below rather than guessed. At 20 000 entries a
   * maximal DONE is 31.82 MiB of JSON — which, held as a JS string alongside a
   * live parse, is exactly the kind of allocation that could push the cgroup
   * over and put the SUPERVISOR at risk. The supervisor staying alive is the
   * entire point of the architecture, so the admissible entry count is lowered
   * until the worst-case result fits comfortably.
   *
   * Raising this is a one-line change, but it must be made together with the
   * container memory limit, not on its own.
   */
  maxEntries: 5_000,

  /** Upper bound on an entry's DECLARED uncompressed size, in octets. */
  maxDeclaredEntryBytes: 64 * 1024 * 1024,

  /** Upper bound on bytes actually STREAMED out of one entry, in octets. */
  maxObservedEntryBytes: 64 * 1024 * 1024,

  /** Upper bound on bytes actually STREAMED across every entry, in octets. */
  maxObservedTotalBytes: 256 * 1024 * 1024,

  /**
   * Entry path length, in UTF-16 code units — the unit `String.length` returns
   * and the unit the C2.0 classifier already measures. Saying "characters"
   * would be wrong: an astral character is two code units.
   */
  maxEntryPathLength: 512,

  /** Entry path depth, in `/`-separated segments. Count. */
  maxEntryPathSegments: 24,

  /** Manifest document size, in UTF-8 octets. */
  maxManifestBytes: 2 * 1024 * 1024,

  /** Untrusted display text, in UTF-16 code units. */
  maxUntrustedTextLength: 2_000,

  /** Whole-ingestion budget, in wall-clock milliseconds. */
  maxProcessingMs: 30_000,

  /** Nested archives are not opened. Depth, count. Zero is not a placeholder. */
  maxNestingDepth: 0,
});

/* ── worst-case size of the parser's terminal DONE message ───────────────────
 *
 * Every constant below was MEASURED against real `JSON.stringify` output rather
 * than counted by eye, and each is derived from `INGEST_LIMITS` so the two can
 * never drift apart. A response cap chosen independently of the entry limit is
 * how R1 shipped a 1 MiB cap that a mere 1 000 entries would have overflowed.
 */

/** Fixed text of one serialised entry: braces, four keys, quotes, commas. */
const ENTRY_JSON_FIXED_BYTES = 49;

/** Fixed text of the DONE envelope, excluding its two numbers. */
const DONE_ENVELOPE_FIXED_BYTES = 75;

/**
 * Worst-case UTF-8 bytes per UTF-16 code unit of an entry path, inside JSON.
 *
 * MEASURED, and true only because `pathSerializationProblem` refuses the two
 * classes that exceed it:
 *
 *   U+0001, U+001F (C0 control) ... 6 bytes/unit   REFUSED before serialisation
 *   lone surrogate U+D800 ........ 6 bytes/unit   REFUSED before serialisation
 *   U+0FFF (3-byte BMP) .......... 3 bytes/unit   admitted — the bound
 *   ZWNJ U+200C .................. 3 bytes/unit   admitted
 *   quote, backslash ............. 2 bytes/unit   admitted
 *   astral pair U+1D11E .......... 2 bytes/unit   admitted
 *   DEL U+007F ................... 1 byte/unit    admitted
 *
 * Without that refusal the real figure is 6, not 3, and every bound derived
 * from it would be half of what it needs to be. The two are a pair: changing
 * either one alone breaks the guarantee, and a test asserts the relationship.
 */
const JSON_BYTES_PER_PATH_CODE_UNIT = 3;

const SHA256_HEX_BYTES = 64;
/** `4294967295` — CRC-32 is unsigned 32-bit. */
const CRC32_MAX_DIGITS = 10;

function digitsOf(value: number): number {
  return String(value).length;
}

/** Largest number of bytes one entry can contribute, separator included. */
export const WORST_CASE_ENTRY_JSON_BYTES =
  ENTRY_JSON_FIXED_BYTES +
  JSON_BYTES_PER_PATH_CODE_UNIT * INGEST_LIMITS.maxEntryPathLength +
  digitsOf(INGEST_LIMITS.maxObservedEntryBytes) +
  SHA256_HEX_BYTES +
  CRC32_MAX_DIGITS +
  1; // the `,` that separates it from the next entry

/** Largest DONE message the parser can legitimately produce, with its newline. */
export const WORST_CASE_DONE_JSON_BYTES =
  DONE_ENVELOPE_FIXED_BYTES +
  digitsOf(INGEST_LIMITS.maxEntries) +
  digitsOf(INGEST_LIMITS.maxObservedTotalBytes) +
  1 + // trailing newline
  INGEST_LIMITS.maxEntries * WORST_CASE_ENTRY_JSON_BYTES;

/**
 * The mandatory READY line, including its newline.
 *
 * Fixed-width by construction: the schema pins `oomScoreAdj` to the literal 1000
 * and `oomGroup` to the literal 0, so there is exactly one byte sequence a valid
 * READY can be. Measured at 49 bytes.
 */
export const WORST_CASE_READY_JSON_BYTES = 49;

/**
 * Everything one child may legitimately write to stdout across a whole parse.
 *
 * The supervisor frames READY and the terminal message through ONE `LineFramer`
 * whose byte counter is cumulative, so a cap covering only the terminal message
 * would have the READY line eating into the terminal budget — a maximal DONE
 * would then overflow a limit that was supposed to admit it. This is the sum,
 * and it is what the supervisor's framer is given.
 *
 * The host client keeps the terminal-only bound below, because it never sees a
 * READY: it reads one HTTP response body containing exactly one message.
 */
export const MAX_CHILD_STDOUT_BYTES = WORST_CASE_READY_JSON_BYTES + WORST_CASE_DONE_JSON_BYTES;

/** Transport-level bounds owned by the supervisor rather than the parser. */
export const INGRESS_LIMITS = Object.freeze({
  /**
   * Time allowed between admission and the FIRST request byte, in ms.
   *
   * Separate from, and far shorter than, the overall ingress deadline. P0-R2
   * measured why: one silent client held the single global slot for the whole
   * 15 s ingress window while every other caller received 429. A slow upload is
   * a different thing from a client that never speaks at all.
   */
  firstByteMs: 2_000,

  /** Total time allowed to receive the whole body, in ms. */
  totalIngressMs: 15_000,

  /**
   * Bytes of ONE TERMINAL MESSAGE, in octets. Used by the host client.
   *
   * DERIVED, never chosen. It is exactly the worst-case DONE computed above, so
   * a maximal legitimate result is accepted and one byte more is refused. R1
   * hard-coded 1 MiB here while admitting 20 000 entries; a 1 000-entry package
   * would already have produced 1.59 MiB and been refused as a protocol
   * violation — a legitimate package rejected by an arithmetic mismatch.
   */
  maxResponseBytes: WORST_CASE_DONE_JSON_BYTES,

  /**
   * Bytes of a child's WHOLE stdout stream, in octets. Used by the supervisor.
   *
   * Strictly larger than `maxResponseBytes`, because the supervisor's framer
   * also sees the READY line and counts cumulatively.
   */
  maxChildStdoutBytes: MAX_CHILD_STDOUT_BYTES,

  /**
   * PHYSICAL frames the supervisor will accept from one child. Count.
   *
   * Two, because the protocol is exactly two messages: READY, then one terminal
   * DONE or REFUSED. Blank lines are not exempt — a blank line costs the same
   * array element as a full one.
   *
   * A byte cap alone does not bound memory. One newline is one byte and yields
   * one array element, so a newline flood converts a byte budget into an object
   * count: 8 340 138 bytes of newlines produced 8 340 138 lines and 305 MB of
   * RSS inside a 128 MiB cgroup. This is the bound that actually holds.
   */
  maxChildStdoutLines: 2,

  /**
   * PHYSICAL frames the host client will accept in one response body. Count.
   *
   * One. The client reads a single HTTP response containing exactly one
   * terminal message; a second line, blank or otherwise, is a protocol
   * violation rather than something to be tolerated and skipped.
   */
  maxResponseLines: 1,

  /** Time allowed for the child to complete its READY handshake, in ms. */
  readyHandshakeMs: 5_000,

  /**
   * Grace between killing a parse and sweeping its execution tree, in ms.
   *
   * After a deadline refusal the direct child is killed and its process group
   * with it. A DETACHED descendant holding the inherited stdout survives both,
   * and while it lives the pipe never reaches EOF — so `close` never fires and
   * the slot is never released. One request would take the sidecar offline
   * permanently.
   *
   * This is how long the ordinary path is given to close on its own before the
   * supervisor removes every remaining writer. Long enough that a healthy child
   * finishing its own shutdown is never swept; short enough that a held pipe
   * costs seconds, not the process.
   */
  orphanSweepGraceMs: 2_000,

  /**
   * How many sweeps are attempted before the supervisor gives up on cleanup.
   *
   * A SINGLE SWEEP IS NOT A GUARANTEE. It reads one `/proc` snapshot and signals
   * what it saw; a process that forks after that snapshot survives, and so does
   * one the scan never observed because the read failed. Attempting a sweep is
   * not the same fact as "every writer is gone", and only the postcondition —
   * stdout reaching end of output and the child handle closing — proves that.
   *
   * Three attempts, each re-reading `/proc`, so a fork racing one snapshot is
   * caught by the next. Bounded, because an attacker who can fork faster than
   * the supervisor can scan must not be able to keep it looping for ever.
   */
  orphanSweepAttempts: 3,

  /**
   * Time each sweep attempt is given to produce the postcondition, in ms.
   *
   * Generous relative to the cost of a SIGKILL taking effect and a pipe
   * closing, which is microseconds; the length is here so a slow container
   * under load is not mistaken for an unkillable writer.
   */
  sweepPostconditionMs: 1_500,

  /**
   * Time the flushed refusal is given to leave the socket before the supervisor
   * terminates itself as a last resort, in ms.
   *
   * The caller must have its answer BEFORE the process goes; a recovery that
   * takes the response with it would turn a bounded refusal into a reset.
   */
  recoveryFlushMs: 250,

  /** Concurrent parses admitted by one sidecar. Count. Exactly one. */
  maxConcurrentParses: 1,
});

/** The `oom_score_adj` value the child must hold before it may receive bytes. */
export const REQUIRED_CHILD_OOM_SCORE_ADJ = 1000;

/** The only acceptable `memory.oom.group` value; anything else fails closed. */
export const REQUIRED_MEMORY_OOM_GROUP = 0;

/** Minimum Node runtime. `zlib.crc32` landed in 20.15.0. */
export const MIN_NODE_VERSION = Object.freeze([20, 15, 0] as const);
