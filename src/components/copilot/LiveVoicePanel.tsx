"use client";

/**
 * PHASE 103 — the Hermes Live Voice Intelligence panel.
 *
 * A voice INTERFACE to the deterministic Industrial Copilot, rendered inside the
 * existing Copilot workspace. It follows the established Hermes visual language
 * (surface/line/signal tokens, the same panel shell as its neighbours) and
 * redesigns nothing around it.
 *
 * THE FLOW THIS COMPONENT ENFORCES
 *   idle → connecting → listening → transcriptReady → analyzing → answerReady
 *        → speaking, with `error` reachable from any step.
 *
 * Two rules are structural rather than stylistic:
 *
 *   1. NO AUTOMATIC ANYTHING. The microphone opens only from `startMicrophone`,
 *      which is only ever called by the operator's click; audio plays only from
 *      `playAnswer`, likewise. There is no effect in this file that starts
 *      capture or playback, and the Phase 103 source contract test asserts that.
 *
 *   2. NO RECORDING. There is no `MediaRecorder`, no `Blob` assembly, no
 *      download and no upload of audio. The microphone stream is attached to a
 *      peer connection and to nothing else; the server never sees a byte of it.
 *
 * CLEANUP IS DETERMINISTIC
 * Every MediaStreamTrack and every RTCPeerConnection this component opens is
 * released by `releaseCapture`, which runs on stop, on error, on a new attempt
 * and on unmount. A microphone that stays live after the operator navigated away
 * is a privacy failure, so the teardown is written once and called from every
 * exit path rather than being duplicated per handler.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

/** The panel's state machine. Every value has a translated label. */
type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "transcriptReady"
  | "analyzing"
  | "answerReady"
  | "speaking"
  | "error";

interface VoiceAnswer {
  intent: string;
  confidence: string;
  summary: string;
  observations: { title: string; description: string }[];
  recommendations: { id: string; title: string; description: string; priority: string }[];
  insufficientData: boolean;
  blocked: boolean;
}

interface VoiceSpeech {
  text: string;
  grant: string;
  expiresAt: string;
  locale: string;
}

/** The provider's own realtime endpoint. The ephemeral secret authorises it. */
const PROVIDER_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

/** The three locales the voice contract accepts, mirrored from the server. */
const VOICE_LOCALES = ["fa", "en", "de"] as const;

/**
 * The error codes this panel can render, and nothing else.
 *
 * A server code outside this set — or one invented by a compromised response —
 * renders as `UNKNOWN` rather than being interpolated into a translation lookup.
 * That matters twice: `next-intl` throws on a missing key, so an unmapped code
 * would break the panel; and a code echoed into the UI would be a reflected
 * content sink. `MICROPHONE_DENIED` is client-only: the browser refused the
 * permission and the server was never asked.
 */
const RENDERABLE_ERROR_CODES = [
  "MICROPHONE_DENIED",
  "SESSION_AUTH_REQUIRED",
  "FORBIDDEN",
  "INSUFFICIENT_PERMISSION",
  "ORGANIZATION_SCOPE_REQUIRED",
  "RATE_LIMITED",
  "INVALID_INPUT",
  "EXTERNAL_AI_UNAVAILABLE",
  "VOICE_GRANT_INVALID",
  "PROVIDER_UNAVAILABLE",
  "COPILOT_UNAVAILABLE",
  "UNKNOWN",
] as const;

type RenderableErrorCode = (typeof RENDERABLE_ERROR_CODES)[number];

function toRenderableError(code: string | undefined | null): RenderableErrorCode {
  return (RENDERABLE_ERROR_CODES as readonly string[]).includes(code ?? "")
    ? (code as RenderableErrorCode)
    : "UNKNOWN";
}

function toVoiceLocale(locale: string): (typeof VOICE_LOCALES)[number] {
  return (VOICE_LOCALES as readonly string[]).includes(locale)
    ? (locale as (typeof VOICE_LOCALES)[number])
    : "en";
}

export function LiveVoicePanel() {
  const t = useTranslations("copilot.liveVoice");
  const locale = toVoiceLocale(useLocale());

  const [state, setState] = useState<VoiceState>("idle");
  const [errorCode, setErrorCode] = useState<RenderableErrorCode | null>(null);
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState<VoiceAnswer | null>(null);
  const [speech, setSpeech] = useState<VoiceSpeech | null>(null);

  // Held in refs, not state: these are resources to release, not values to
  // render, and a re-render must never lose the handle to a live microphone.
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  /**
   * Release every browser resource this panel holds.
   *
   * Stopping the tracks is what actually turns the microphone indicator off;
   * closing the peer connection tears down the transport. Both are idempotent,
   * so calling this twice is harmless — which is why every exit path can call it
   * unconditionally.
   */
  const releaseCapture = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    const peer = peerRef.current;
    if (peer) {
      peer.close();
      peerRef.current = null;
    }
  }, []);

  /** Release the object URL and the audio element used for playback. */
  const releaseAudio = useCallback(() => {
    const element = audioRef.current;
    if (element) {
      element.pause();
      element.src = "";
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // Unmount teardown. Without this, navigating away from the Copilot page while
  // listening would leave the microphone open for the life of the tab.
  useEffect(() => {
    return () => {
      releaseCapture();
      releaseAudio();
    };
  }, [releaseCapture, releaseAudio]);

  const fail = useCallback(
    (code: string) => {
      releaseCapture();
      setErrorCode(toRenderableError(code));
      setState("error");
    },
    [releaseCapture],
  );

  /**
   * Open the microphone and connect a TRANSCRIPTION-ONLY session.
   *
   * Called only from the Start control. The server decides whether a session may
   * exist at all; this function cannot conjure one, and a refusal leaves the
   * panel in `error` with the microphone released.
   */
  const startMicrophone = useCallback(async () => {
    setErrorCode(null);
    setAnswer(null);
    setSpeech(null);
    releaseAudio();
    releaseCapture();
    setState("connecting");

    let credential: { clientSecret: string };
    try {
      const response = await fetch("/api/copilot/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        fail(body?.code ?? "PROVIDER_UNAVAILABLE");
        return;
      }
      credential = (await response.json()) as { clientSecret: string };
    } catch {
      fail("PROVIDER_UNAVAILABLE");
      return;
    }

    let stream: MediaStream;
    try {
      // Audio only, and only after the browser's own permission prompt. There is
      // no video constraint and no recorder attached to this stream.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("MICROPHONE_DENIED");
      return;
    }
    streamRef.current = stream;

    try {
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);

      // The provider streams transcription events over this data channel. It is
      // the ONLY thing read from the connection: no audio comes back, because a
      // transcription session has no assistant turn to speak.
      const channel = peer.createDataChannel("oai-events");
      channel.onmessage = (event) => {
        const text = readTranscriptDelta(event.data);
        if (text) setTranscript((current) => `${current}${text}`);
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const answerSdp = await fetch(PROVIDER_CALLS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });
      if (!answerSdp.ok) {
        fail("PROVIDER_UNAVAILABLE");
        return;
      }
      await peer.setRemoteDescription({ type: "answer", sdp: await answerSdp.text() });
      setState("listening");
    } catch {
      fail("PROVIDER_UNAVAILABLE");
    }
  }, [fail, locale, releaseAudio, releaseCapture]);

  /** Stop capture. The transcript stays on screen for the operator to edit. */
  const stopMicrophone = useCallback(() => {
    releaseCapture();
    setState(transcript.trim().length > 0 ? "transcriptReady" : "idle");
  }, [releaseCapture, transcript]);

  /**
   * Send the CONFIRMED transcript to the deterministic engine.
   *
   * This is the only path from speech to an answer, and it runs only when the
   * operator presses Analyze — which is why the transcript is an ordinary,
   * editable textarea above this control rather than something streamed
   * straight through.
   */
  const analyze = useCallback(async () => {
    const confirmed = transcript.trim();
    if (confirmed.length === 0) return;

    releaseCapture();
    releaseAudio();
    setErrorCode(null);
    setSpeech(null);
    setState("analyzing");

    try {
      const response = await fetch("/api/copilot/voice/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: confirmed, locale }),
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        fail(body?.code ?? "COPILOT_UNAVAILABLE");
        return;
      }
      const body = (await response.json()) as { answer: VoiceAnswer; speech: VoiceSpeech | null };
      setAnswer(body.answer);
      setSpeech(body.speech);
      setState("answerReady");
    } catch {
      fail("COPILOT_UNAVAILABLE");
    }
  }, [fail, locale, releaseAudio, releaseCapture, transcript]);

  /**
   * Play the deterministic answer.
   *
   * Sends back the EXACT text and grant the query returned. Editing either in a
   * client-side debugger produces a refusal, not different speech.
   */
  const playAnswer = useCallback(async () => {
    if (!speech) return;
    releaseAudio();
    setErrorCode(null);
    setState("speaking");

    try {
      const response = await fetch("/api/copilot/voice/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: speech.text, grant: speech.grant, locale }),
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { code?: string } | null;
        setErrorCode(toRenderableError(body?.code ?? "PROVIDER_UNAVAILABLE"));
        setState("answerReady");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      audioUrlRef.current = url;
      const element = new Audio(url);
      audioRef.current = element;
      element.onended = () => {
        releaseAudio();
        setState("answerReady");
      };
      await element.play();
    } catch {
      releaseAudio();
      setErrorCode(toRenderableError("PROVIDER_UNAVAILABLE"));
      setState("answerReady");
    }
  }, [locale, releaseAudio, speech]);

  const stopAudio = useCallback(() => {
    releaseAudio();
    setState("answerReady");
  }, [releaseAudio]);

  const listening = state === "listening";
  const busy = state === "connecting" || state === "analyzing";
  const canAnalyze = transcript.trim().length > 0 && !busy && state !== "speaking";

  return (
    <section
      aria-labelledby="live-voice-heading"
      className="rounded-xl border border-line bg-surface p-5"
      style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.28), 0 0 0 1px rgba(30,200,164,0.04)" }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="type-eyebrow mb-1.5">{t("brand")}</p>
          <h2 id="live-voice-heading" className="type-panel-title">
            {t("title")}
          </h2>
        </div>
        <p
          className="flex items-center gap-2 font-body text-xs text-muted"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              state === "error" ? "bg-danger" : listening || state === "speaking" ? "bg-signal" : "bg-muted/50"
            }`}
          />
          {t(`states.${state}`)}
        </p>
      </div>

      <p className="mb-4 type-caption leading-relaxed">{t("lede")}</p>

      {/* Disclosure. Deliberately above the controls: the operator reads what
          leaves the building BEFORE the microphone can be opened. */}
      <div className="mb-5 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3">
        <p className="font-body text-xs leading-relaxed text-warn">{t("disclosure")}</p>
        <p className="mt-2 font-body text-xs leading-relaxed text-muted">{t("retentionNote")}</p>
        <p className="mt-2 font-body text-xs leading-relaxed text-muted">{t("deterministicNote")}</p>
      </div>

      {/* ── Capture controls ─────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startMicrophone}
          disabled={listening || busy}
          className="rounded-lg bg-signal px-5 py-2.5 font-body text-sm font-semibold text-bg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {t("actions.start")}
        </button>
        <button
          type="button"
          onClick={stopMicrophone}
          disabled={!listening}
          className="rounded-lg border border-line px-5 py-2.5 font-body text-sm font-semibold text-ink transition-all hover:border-signal/40 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {t("actions.stop")}
        </button>
      </div>

      {/* ── The editable transcript. The confirmation step. ──────────────── */}
      <label htmlFor="live-voice-transcript" className="type-eyebrow mb-2 block">
        {t("transcriptLabel")}
      </label>
      <textarea
        id="live-voice-transcript"
        value={transcript}
        onChange={(event) => {
          setTranscript(event.target.value);
          if (state === "answerReady" || state === "error") setState("transcriptReady");
        }}
        rows={4}
        placeholder={t("transcriptPlaceholder")}
        aria-describedby="live-voice-transcript-hint"
        className="w-full resize-y rounded-lg border border-line bg-bg px-4 py-3 font-body text-sm leading-relaxed text-ink transition-colors placeholder:text-muted/50 focus:border-signal/50 focus:outline-none focus:ring-1 focus:ring-signal/20"
      />
      <p id="live-voice-transcript-hint" className="mt-2 type-caption">
        {t("transcriptHint")}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={analyze}
          disabled={!canAnalyze}
          className="rounded-lg bg-signal px-6 py-2.5 font-body text-sm font-semibold text-bg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {t("actions.analyze")}
        </button>
      </div>

      {errorCode && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 font-body text-sm leading-relaxed text-danger"
        >
          {t(`errors.${errorCode}`)}
        </p>
      )}

      {/* ── The deterministic answer ─────────────────────────────────────── */}
      {answer && (
        <div className="mt-5 border-t border-line pt-5">
          <p className="type-eyebrow mb-2">{t("answerLabel")}</p>
          <p className="font-body text-sm leading-relaxed text-ink">{answer.summary}</p>

          {answer.observations.length > 0 && (
            <ul className="mt-3 space-y-2">
              {answer.observations.map((observation) => (
                <li key={observation.title} className="flex gap-3 font-body text-sm leading-relaxed text-ink">
                  <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-signal" />
                  <span>
                    <span className="font-semibold">{observation.title}</span> — {observation.description}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {answer.recommendations.length > 0 && (
            <ol className="mt-3 space-y-2">
              {answer.recommendations.map((recommendation, index) => (
                <li
                  key={recommendation.id}
                  className="flex gap-3 font-body text-sm leading-relaxed text-ink"
                >
                  <span aria-hidden="true" className="metric w-5 shrink-0 text-sm font-bold text-muted/60">
                    {index + 1}.
                  </span>
                  {recommendation.title}
                </li>
              ))}
            </ol>
          )}

          {answer.insufficientData && (
            <p className="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-4 py-3 font-body text-xs leading-relaxed text-warn">
              {t("insufficientData")}
            </p>
          )}

          {/* ── Playback ─────────────────────────────────────────────────── */}
          {speech ? (
            <>
              <p className="mt-4 type-caption">{t("spokenTextLabel")}</p>
              <p className="mt-1 rounded-lg border border-line/60 bg-surface2/40 px-4 py-3 font-body text-xs leading-relaxed text-muted">
                {speech.text}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={playAnswer}
                  disabled={state === "speaking"}
                  className="rounded-lg border border-signal/40 px-5 py-2.5 font-body text-sm font-semibold text-signal transition-all hover:bg-signal/5 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {t("actions.play")}
                </button>
                <button
                  type="button"
                  onClick={stopAudio}
                  disabled={state !== "speaking"}
                  className="rounded-lg border border-line px-5 py-2.5 font-body text-sm font-semibold text-ink transition-all hover:border-signal/40 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {t("actions.stopAudio")}
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4 type-caption">{t("noSpeechAvailable")}</p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Pull transcript text out of one realtime event.
 *
 * Total and defensive: an event this does not recognise contributes nothing.
 * Only the documented transcription delta/completed events carry text, and
 * nothing else on the channel is interpreted — in particular, no event can make
 * this component take an action, because it returns a string and nothing else.
 */
function readTranscriptDelta(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return "";
  }
  if (typeof event !== "object" || event === null) return "";
  const record = event as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (!type.includes("input_audio_transcription")) return "";
  if (typeof record.delta === "string") return record.delta;
  if (typeof record.transcript === "string") return record.transcript;
  return "";
}
