/**
 * PHASE 103 review fixes — the panel-side contracts, read off disk.
 *
 * The panel is a `.tsx` client component, which this toolchain cannot import
 * into a unit test, so the promises that live in its SHAPE are asserted against
 * the real file — comment-stripped, so a promise written only in prose can never
 * satisfy one. The promises that live in a pure function are tested for real in
 * `phase103-voice-transcript.test.ts`; this file covers the wiring between them.
 *
 * Three contracts:
 *
 *   1. STOP COMMITS. The microphone tracks stop first and unconditionally; the
 *      commit goes out on the same data channel; the peer connection is released
 *      only after the final transcript or a bounded timeout.
 *   2. THE PANEL OWNS NO TRANSCRIPT LOGIC. It delegates to the reducer, so the
 *      duplication regression cannot be reintroduced privately.
 *   3. THE SWITCH CANNOT DIVERGE. One server variable, read by one function,
 *      reaches the UI through one server boundary — and when it is off, the panel
 *      has no Start control at all.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { stripComments } from "../../../../../scripts/security/phase99/route-inventory.mjs";

const REPO = process.cwd();

const PANEL = "src/components/copilot/LiveVoicePanel.tsx";
const AVAILABILITY = "src/components/copilot/voice-availability.tsx";
const COPILOT_LAYOUT = "src/app/[locale]/dashboard/copilot/layout.tsx";
const CONFIG = "src/lib/copilot/voice/config.ts";
const TRANSCRIPT = "src/lib/copilot/voice/transcript.ts";
const PROVIDER = "src/lib/copilot/voice/provider.ts";
const GOVERNANCE = "src/lib/copilot/voice/governance.ts";
const MIDDLEWARE = "src/middleware.ts";

const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");
const code = (rel: string): string => stripComments(read(rel));

/** Index of `needle`, asserted to exist so a rename fails loudly. */
function at(source: string, needle: string, label: string): number {
  const index = source.indexOf(needle);
  expect(index, `${label}: source does not contain ${needle}`).toBeGreaterThan(-1);
  return index;
}

/* ═════════════════ 1 — Stop commits the buffer, in the right order ══════════ */

describe("Stop commits the input audio buffer before releasing the transport", () => {
  const panel = code(PANEL);

  it("is reading the real panel (positive control)", () => {
    expect(panel).toContain("const stopMicrophone");
    expect(panel).toContain("RTCPeerConnection");
    expect(panel).toContain("createDataChannel");
  });

  it("keeps a handle on the data channel, because the commit is sent back on it", () => {
    // A commit needs somewhere to go; the pre-fix panel kept no channel handle
    // at all, which is why it could not send one.
    expect(panel).toContain("const channelRef = useRef<RTCDataChannel | null>(null)");
    expect(panel).toContain("channelRef.current = channel");
  });

  it("sends the commit from the Stop handler, using the shared helper", () => {
    const stop = panel.slice(
      at(panel, "const stopMicrophone = useCallback(async ()", "stop"),
      at(panel, "const analyze =", "stop-end"),
    );
    expect(stop).toContain("sendInputAudioBufferCommit(channelRef.current)");
    // The event name is defined once, in the tested module, and imported.
    expect(panel).toContain("sendInputAudioBufferCommit");
    expect(code(TRANSCRIPT)).toContain('export const INPUT_AUDIO_BUFFER_COMMIT_EVENT = "input_audio_buffer.commit"');
  });

  it("stops the MICROPHONE first and releases the peer only afterwards", () => {
    const stop = panel.slice(
      at(panel, "const stopMicrophone = useCallback(async ()", "stop"),
      at(panel, "const analyze =", "stop-end"),
    );
    const tracks = at(stop, "stopMicrophoneTracks()", "stop");
    const commit = at(stop, "sendInputAudioBufferCommit(", "stop");
    const wait = at(stop, "await waiter.promise", "stop");

    // Tracks die before anything can await; the wait happens after the commit.
    expect(tracks).toBeLessThan(commit);
    expect(commit).toBeLessThan(wait);
    // And the full teardown is not in front of the commit.
    expect(stop.indexOf("releaseCapture()")).toBe(-1);
    expect(stop).toContain("finishCapture()");
    expect(at(stop, "finishCapture()", "stop")).toBeGreaterThan(commit);
  });

  it("stopping the tracks does NOT close the peer connection", () => {
    const tracksOnly = panel.slice(
      at(panel, "const stopMicrophoneTracks", "tracks"),
      at(panel, "const releaseCapture", "tracks-end"),
    );
    expect(tracksOnly).toContain("track.stop()");
    expect(tracksOnly).not.toContain("peer.close()");
    expect(tracksOnly).not.toContain("peerRef.current = null");
  });

  it("the wait is bounded and cancellable — no unbounded await", () => {
    expect(panel).toContain("createFinalizeWaiter(TRANSCRIPTION_FINALIZE_TIMEOUT_MS)");
    // Teardown from any other path cancels the waiter rather than orphaning it.
    const release = panel.slice(
      at(panel, "const releaseCapture", "release"),
      at(panel, "const releaseAudio", "release-end"),
    );
    expect(release).toContain("waiter.cancel()");
    expect(release).toContain("channelRef.current = null");
  });

  it("surfaces the wait as its own machine state, so Start stays unavailable", () => {
    expect(panel).toContain('| "finalizing"');
    expect(panel).toContain('state === "finalizing"');
  });

  it("MUTANT: a Stop that only tears down would leave these markers absent", () => {
    // The pre-fix Stop was three lines: releaseCapture(); setState(...). Each of
    // these is a thing that body could not have contained.
    for (const marker of [
      "sendInputAudioBufferCommit",
      "createFinalizeWaiter",
      "stopMicrophoneTracks",
      "await waiter.promise",
    ]) {
      expect(panel, marker).toContain(marker);
    }
  });
});

/* ═══════════ 1b — `listening` is only announced on a proven-open channel ════ */

describe("the panel waits for the data channel to open before it says listening", () => {
  const panel = code(PANEL);

  const start = (): string =>
    panel.slice(
      at(panel, "const startMicrophone", "start"),
      at(panel, "const finishCapture", "start-end"),
    );

  it("registers the open waiter BEFORE the SDP exchange", () => {
    const body = start();
    const register = at(body, "awaitDataChannelOpen(channel, DATA_CHANNEL_OPEN_TIMEOUT_MS)", "start");
    const sdpPost = at(body, "PROVIDER_CALLS_URL", "start");
    // A listener attached after the exchange could miss an `open` that fired
    // while the request was in flight.
    expect(register).toBeLessThan(sdpPost);
  });

  it("awaits that waiter AFTER setRemoteDescription and BEFORE listening", () => {
    const body = start();
    const remote = at(body, "setRemoteDescription", "start");
    const awaited = at(body, "await openWaiter.promise", "start");
    const listening = at(body, 'setState("listening")', "start");

    expect(remote).toBeLessThan(awaited);
    expect(awaited).toBeLessThan(listening);
  });

  it("MUTANT: there is EXACTLY ONE setState(\"listening\"), and none before the await", () => {
    // The mutant is moving this line up next to setRemoteDescription — which is
    // precisely what the pre-fix panel did.
    const occurrences = panel.match(/setState\("listening"\)/g) ?? [];
    expect(occurrences).toHaveLength(1);

    const body = start();
    const beforeAwait = body.slice(0, at(body, "await openWaiter.promise", "start"));
    expect(beforeAwait).not.toContain('setState("listening")');
  });

  it("proves readyState as well as the event before entering listening", () => {
    const body = start();
    expect(body).toContain('opened !== "open" || channel.readyState !== "open"');
    // And the waiter itself only calls an open event `open` when the state agrees.
    expect(code(TRANSCRIPT)).toContain('finish(channel?.readyState === "open" ? "open" : "closed")');
  });

  it("fails closed on anything that is not an open channel", () => {
    const body = start();
    const guard = at(body, 'opened !== "open"', "start");
    const branch = body.slice(guard, at(body, 'setState("listening")', "start"));
    // Microphone first, then the transport, then the operator is told.
    const mic = at(branch, "stopMicrophoneTracks()", "start");
    const failed = at(branch, 'fail("PROVIDER_UNAVAILABLE")', "start");
    expect(mic).toBeLessThan(failed);
    // `fail` is the shared handler, and it releases the peer and the channel.
    expect(panel.slice(at(panel, "const fail =", "fail"), at(panel, "const startMicrophone", "fail"))).toContain(
      "releaseCapture()",
    );
  });

  it("a cancelled attempt yields to whoever tore it down", () => {
    const body = start();
    expect(body).toContain('if (opened === "cancelled") return;');
    // And teardown really does cancel it, rather than orphaning the waiter.
    const release = panel.slice(
      at(panel, "const releaseCapture", "release"),
      at(panel, "const releaseAudio", "release-end"),
    );
    expect(release).toContain("opening.cancel()");
  });

  it("Stop is enabled by that state and nothing looser", () => {
    // `listening` is now provably channel-open, so this is the whole gate.
    expect(panel).toContain('const listening = state === "listening"');
    expect(panel).toContain("disabled={!listening}");
    // The connecting window is busy, so Start cannot be pressed twice either.
    expect(panel).toContain('state === "connecting"');
  });
});

/* ═══════════ 2 — the panel delegates all transcript reduction ═══════════════ */

describe("the panel owns no transcript logic of its own", () => {
  const panel = code(PANEL);

  it("imports the reducer instead of reimplementing it", () => {
    expect(panel).toContain('from "@/lib/copilot/voice/transcript"');
    for (const symbol of ["applyTranscriptEvent", "renderTranscript", "isTranscriptComplete"]) {
      expect(panel, symbol).toContain(symbol);
    }
  });

  it("no longer appends channel text straight onto the transcript", () => {
    // The exact pre-fix line, and the shape of any close cousin.
    expect(panel).not.toContain("setTranscript((current) => `${current}${text}`)");
    expect(panel).not.toMatch(/setTranscript(?:Text)?\(\s*\(current\)\s*=>/);
    expect(panel).not.toContain("readTranscriptDelta");
  });

  it("does no substring matching on realtime event types", () => {
    expect(panel).not.toContain('includes("input_audio_transcription")');
    expect(panel).not.toContain("input_audio_transcription");
    // The reducer compares types with ===, never with includes().
    const transcript = code(TRANSCRIPT);
    expect(transcript).toContain("type !== TRANSCRIPT_DELTA_EVENT");
    expect(transcript).not.toMatch(/type\.includes\(/);
    expect(transcript).not.toMatch(/type\.startsWith\(/);
  });

  it("the channel handler routes every event through the reducer", () => {
    const handler = panel.slice(
      at(panel, "channel.onmessage", "handler"),
      at(panel, "const offer =", "handler-end"),
    );
    expect(handler).toContain("applyTranscriptEvent(transcriptStateRef.current, event.data)");
    expect(handler).toContain("setTranscriptText(renderTranscript(next))");
    expect(handler).toContain("isTranscriptComplete(next)");
  });
});

/* ═════════════ 3 — the switch reaches the UI without a second source ════════ */

describe("the UI flag and the server flag cannot silently diverge", () => {
  const panel = code(PANEL);
  const layout = code(COPILOT_LAYOUT);
  const availability = code(AVAILABILITY);

  it("the variable is READ in exactly one place, and mirrored nowhere", () => {
    // Every other consumer calls the function; nobody re-parses the string.
    const readers: string[] = [];
    for (const rel of [PANEL, AVAILABILITY, COPILOT_LAYOUT, CONFIG, PROVIDER, GOVERNANCE, MIDDLEWARE]) {
      if (code(rel).includes("process.env.HERMES_EXTERNAL_AI_ENABLED")) readers.push(rel);
      // A NEXT_PUBLIC_ twin is a second thing to set, and two things that must
      // agree eventually will not.
      expect(read(rel), rel).not.toContain("NEXT_PUBLIC_HERMES_EXTERNAL_AI_ENABLED");
    }
    expect(readers).toEqual([CONFIG]);
    // And the panel reads no environment at all.
    expect(panel).not.toContain("process.env");
  });

  it("the UI boundary, the governance layer and the CSP share one function", () => {
    expect(layout).toContain('from "@/lib/copilot/voice/config"');
    expect(layout).toContain("isExternalAiEnabled()");
    expect(layout).toContain("VoiceAvailabilityProvider");
    // The server-side denial the UI is promising to reflect.
    expect(code(GOVERNANCE)).toContain("const externalAiEnabled = isExternalAiEnabled()");
    expect(code(GOVERNANCE)).toContain('reason: "FEATURE_FLAG_OFF"');
    // The CSP entry that makes the browser leg possible moves with it.
    expect(code(MIDDLEWARE)).toContain(
      'const VOICE_CONNECT_DOMAINS = isExternalAiEnabled() ? " https://api.openai.com" : ""',
    );
  });

  it("the boundary is evaluated per request, not baked into a build", () => {
    // Without this the switch would be frozen at `next build` time and a
    // container started later with it flipped would render the wrong reality.
    expect(layout).toContain('export const dynamic = "force-dynamic"');
  });

  it("the context defaults to OFF, so forgetting the provider disables the panel", () => {
    expect(availability).toContain("createContext<boolean>(false)");
    expect(panel).toContain("const externalAiEnabled = useVoiceAvailability()");
  });

  it("server-side: the routes can never serve while the switch is off", async () => {
    const { isExternalAiEnabled, voiceConfigurationComplete } = await import("../config");
    const env = process.env as Record<string, string | undefined>;
    const savedSwitch = env.HERMES_EXTERNAL_AI_ENABLED;
    const savedKey = env.OPENAI_API_KEY;
    const savedSecret = env.HERMES_VOICE_SIGNING_SECRET;

    // Everything else fully configured, so the switch is the only variable.
    env.OPENAI_API_KEY = "sk-test-not-a-real-key";
    env.HERMES_VOICE_SIGNING_SECRET = "0123456789abcdef0123456789abcdef";

    try {
      const cases: [string | undefined, boolean][] = [
        [undefined, false],
        ["", false],
        ["0", false],
        ["off", false],
        ["false", false],
        ["no", false],
        ["maybe", false],
        ["ON", true],
        ["1", true],
        ["true", true],
        ["yes", true],
      ];
      for (const [raw, expected] of cases) {
        if (raw === undefined) delete env.HERMES_EXTERNAL_AI_ENABLED;
        else env.HERMES_EXTERNAL_AI_ENABLED = raw;

        // What the layout would hand the UI…
        const uiEnabled = isExternalAiEnabled();
        expect(uiEnabled, `switch=${String(raw)}`).toBe(expected);
        // …and what the routes would do with the same process, in lockstep.
        expect(voiceConfigurationComplete(), `switch=${String(raw)}`).toBe(expected);
      }
    } finally {
      if (savedSwitch === undefined) delete env.HERMES_EXTERNAL_AI_ENABLED;
      else env.HERMES_EXTERNAL_AI_ENABLED = savedSwitch;
      if (savedKey === undefined) delete env.OPENAI_API_KEY;
      else env.OPENAI_API_KEY = savedKey;
      if (savedSecret === undefined) delete env.HERMES_VOICE_SIGNING_SECRET;
      else env.HERMES_VOICE_SIGNING_SECRET = savedSecret;
    }
  });
});

/* ═══════════ 4 — the OFF state offers nothing to press ══════════════════════ */

describe("with the switch off the panel offers no Start control", () => {
  const panel = code(PANEL);

  it("returns the disabled surface BEFORE any control is rendered", () => {
    const guard = at(panel, "if (!externalAiEnabled) {", "off");
    const firstButton = at(panel, "<button", "off");
    expect(guard).toBeLessThan(firstButton);
  });

  it("the disabled branch contains no button, no textarea and no request", () => {
    const guard = at(panel, "if (!externalAiEnabled) {", "off");
    // The disabled branch runs from the guard to the component's main return.
    const mainReturn = panel.indexOf("\n  return (", guard);
    expect(mainReturn, "the main return was not found after the guard").toBeGreaterThan(guard);
    const branch = panel.slice(guard, mainReturn);
    expect(branch.length, "the disabled branch is empty").toBeGreaterThan(100);
    for (const forbidden of ["<button", "<textarea", "fetch(", "onClick", "getUserMedia", "startMicrophone"]) {
      expect(branch, forbidden).not.toContain(forbidden);
    }
    // It does say WHY, through the catalog like every other visible string.
    expect(branch).toContain('t("disabledNotice")');
  });

  it("the guard sits after every hook, so hook order is identical either way", () => {
    const guard = at(panel, "if (!externalAiEnabled) {", "off");
    for (const hook of ["useState<", "useRef<", "useCallback(", "useEffect("]) {
      const last = panel.lastIndexOf(hook);
      expect(last, `${hook} appears after the disabled-state early return`).toBeLessThan(guard);
    }
  });

  it("MUTANT: dropping the guard makes Start reachable while the server refuses", () => {
    // The mutant is the absence of one `if`. These three markers are what its
    // presence looks like; all must survive together.
    expect(panel).toContain("useVoiceAvailability");
    expect(panel).toContain("if (!externalAiEnabled) {");
    expect(panel).toContain('t("disabledNotice")');
    // Start is still exactly one control, still gated on the panel's own busy
    // state — the guard is an addition, not a replacement for that.
    expect(panel).toContain("onClick={startMicrophone}");
    expect(panel.match(/onClick=\{startMicrophone\}/g)).toHaveLength(1);
  });
});
