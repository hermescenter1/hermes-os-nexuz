/**
 * PHASE 109-C2.1 — the lifecycle of one parse: deadlines and finalization.
 *
 * Extracted from the supervisor because the supervisor is a PROGRAM and this is
 * the part that most needs testing. Two properties are hard to get right and
 * impossible to observe from the outside once they are wrong:
 *
 * WHEN THE FIRST-BYTE DEADLINE STARTS. It must start only after `READY` has been
 * schema-validated AND the child's `oom_score_adj` independently confirmed from
 * `/proc`. R1 armed it at spawn, which meant a handshake that legitimately took
 * longer than the first-byte budget consumed that budget before the caller was
 * ever allowed to send anything — the caller was then blamed for a delay that
 * was entirely the parser's. The total ingress deadline is separate and runs
 * from admission, so a slow handshake cannot buy extra body time either.
 *
 * THAT EVERY OUTCOME CLEANS UP IDENTICALLY. DONE, REFUSED, timeout, oversized
 * stream, crash, OOM, protocol error and caller disconnect all end here, in one
 * idempotent path, in one fixed order. The slot is released LAST — after the
 * body is detached and the child is gone — so a request that is still streaming
 * can never overlap the next admission.
 */

/** What the caller is told. `status` is the HTTP status; `body` is the JSON. */
export interface ParseOutcome {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/**
 * The side effects finalization performs, injected so the order can be asserted.
 *
 * Each is called at most once per lifecycle, and only through `finalize`.
 */
export interface LifecycleHooks {
  /** Remove every `data`/`end`/`aborted`/`error` listener from the request. */
  readonly detachRequestListeners: () => void;
  /** Stop the request stream delivering any further bytes. */
  readonly stopBodyConsumption: () => void;
  /** End the child's stdin so it cannot keep reading. */
  readonly closeChildStdin: () => void;
  /** SIGKILL the child if it is still alive, and reap it. */
  readonly killChild: () => void;
  /** Write and flush the response. */
  readonly respond: (outcome: ParseOutcome) => void;
  /** Release the single global parse slot. */
  readonly releaseSlot: () => void;
}

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface LifecycleTimers {
  readonly readyHandshakeMs: number;
  readonly firstByteMs: number;
  readonly totalIngressMs: number;
  readonly maxProcessingMs: number;
}

/** The order in which finalization ran, recorded for tests and diagnostics. */
export type CleanupStep =
  | "timers"
  | "detachRequestListeners"
  | "stopBodyConsumption"
  | "closeChildStdin"
  | "killChild"
  | "respond"
  | "releaseSlot";

export class ParseLifecycle {
  private readonly hooks: LifecycleHooks;
  private readonly timers: LifecycleTimers;
  private readonly onExpire: (reason: ExpiryReason) => void;

  private readyTimer: TimerHandle | null = null;
  private firstByteTimer: TimerHandle | null = null;
  private ingressTimer: TimerHandle | null = null;
  private parseTimer: TimerHandle | null = null;

  private readyVerified = false;
  private sawFirstByte = false;
  private finalizedFlag = false;
  private childReapedFlag = false;
  private slotReleasedFlag = false;
  private readonly steps: CleanupStep[] = [];

  constructor(hooks: LifecycleHooks, timers: LifecycleTimers, onExpire: (reason: ExpiryReason) => void) {
    this.hooks = hooks;
    this.timers = timers;
    this.onExpire = onExpire;
  }

  /**
   * Arm the deadlines that run from admission.
   *
   * The first-byte deadline is deliberately NOT armed here — it has nothing to
   * measure until the caller is allowed to send.
   */
  start(): void {
    this.readyTimer = setTimeout(() => this.expire("READY_TIMEOUT"), this.timers.readyHandshakeMs);
    this.ingressTimer = setTimeout(() => this.expire("INGRESS_TIMEOUT"), this.timers.totalIngressMs);
    this.parseTimer = setTimeout(() => this.expire("PARSE_TIMEOUT"), this.timers.maxProcessingMs);
  }

  /**
   * Called once the handshake is proven: schema-valid READY, and the child's
   * `oom_score_adj` read back from `/proc` by this process.
   *
   * Only now does the caller's clock start.
   */
  onReadyVerified(): void {
    if (this.finalizedFlag || this.readyVerified) return;
    this.readyVerified = true;
    this.clearTimer("ready");
    this.firstByteTimer = setTimeout(() => {
      if (!this.sawFirstByte) this.expire("FIRST_BYTE_TIMEOUT");
    }, this.timers.firstByteMs);
  }

  /** Called on the first body chunk. */
  onFirstByte(): void {
    if (this.sawFirstByte) return;
    this.sawFirstByte = true;
    this.clearTimer("firstByte");
  }

  /** Called when the body has been fully received. */
  onBodyComplete(): void {
    this.clearTimer("ingress");
  }

  get isFinalized(): boolean {
    return this.finalizedFlag;
  }

  get isSlotReleased(): boolean {
    return this.slotReleasedFlag;
  }

  get readyWasVerified(): boolean {
    return this.readyVerified;
  }

  /** The cleanup steps that actually ran, in order. Empty until finalization. */
  get cleanupOrder(): readonly CleanupStep[] {
    return this.steps;
  }

  /** True once the child has actually emitted `exit`/`close`. */
  get childWasReaped(): boolean {
    return this.childReapedFlag;
  }

  /**
   * THE ONE EXIT. Idempotent: every later call is a no-op, so a timeout that
   * fires while a crash is being handled cannot double-respond or double-release.
   *
   * The order is load-bearing. The body is detached and stopped, and the child
   * is closed and signalled, BEFORE the caller is answered.
   *
   * THE SLOT IS NOT RELEASED HERE UNLESS THE CHILD IS ALREADY GONE.
   * `child.kill("SIGKILL")` is asynchronous — it delivers a signal and returns;
   * it does not prove the process has exited. Releasing on the strength of that
   * call would let the next parse spawn a second child while the first was
   * still dying, which is exactly the "exactly one child" invariant this whole
   * component exists to hold. The caller still gets its answer immediately;
   * only the slot waits.
   */
  finalize(outcome: ParseOutcome): void {
    if (this.finalizedFlag) return;
    this.finalizedFlag = true;

    this.clearAllTimers();
    this.steps.push("timers");

    this.hooks.detachRequestListeners();
    this.steps.push("detachRequestListeners");

    this.hooks.stopBodyConsumption();
    this.steps.push("stopBodyConsumption");

    this.hooks.closeChildStdin();
    this.steps.push("closeChildStdin");

    this.hooks.killChild();
    this.steps.push("killChild");

    this.hooks.respond(outcome);
    this.steps.push("respond");

    this.maybeReleaseSlot();
  }

  /**
   * Called from the child's `exit`/`close`/`error` handlers. Idempotent.
   *
   * May legitimately arrive BEFORE finalization (a child that exits normally) or
   * AFTER it (a child that had to be killed). Both orders converge here.
   */
  onChildReaped(): void {
    if (this.childReapedFlag) return;
    this.childReapedFlag = true;
    this.maybeReleaseSlot();
  }

  /** Release exactly once, and only when both conditions hold. */
  private maybeReleaseSlot(): void {
    if (this.slotReleasedFlag) return;
    if (!this.finalizedFlag || !this.childReapedFlag) return;
    this.slotReleasedFlag = true;
    this.hooks.releaseSlot();
    this.steps.push("releaseSlot");
  }

  private expire(reason: ExpiryReason): void {
    if (this.finalizedFlag) return;
    this.onExpire(reason);
  }

  private clearTimer(which: "ready" | "firstByte" | "ingress" | "parse"): void {
    const map = {
      ready: this.readyTimer,
      firstByte: this.firstByteTimer,
      ingress: this.ingressTimer,
      parse: this.parseTimer,
    } as const;
    const handle = map[which];
    if (handle) clearTimeout(handle);
    if (which === "ready") this.readyTimer = null;
    else if (which === "firstByte") this.firstByteTimer = null;
    else if (which === "ingress") this.ingressTimer = null;
    else this.parseTimer = null;
  }

  private clearAllTimers(): void {
    this.clearTimer("ready");
    this.clearTimer("firstByte");
    this.clearTimer("ingress");
    this.clearTimer("parse");
  }
}

/** Why a deadline fired. Mapped to a stable diagnostic by the caller. */
export type ExpiryReason =
  | "READY_TIMEOUT"
  | "FIRST_BYTE_TIMEOUT"
  | "INGRESS_TIMEOUT"
  | "PARSE_TIMEOUT";
