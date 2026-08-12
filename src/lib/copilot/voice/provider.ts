/**
 * PHASE 103 — the ONLY module that contacts the external voice provider.
 *
 * Isolating the two outbound calls here is deliberate:
 *
 *   - the Phase 99 SSRF invariant forbids a `fetch` inside an API route whose
 *     URL expression is derived from request data; here the destination is a
 *     module-level constant that no caller can influence, and no request value
 *     ever participates in building a URL;
 *   - a reviewer can read one file to see everything that leaves the building;
 *   - the routes stay free of provider detail, so swapping providers is a change
 *     to this module and the registry, not to the security chain.
 *
 * INVARIANTS ENFORCED HERE
 *   - the API key appears in exactly one place: an Authorization header. It is
 *     never logged, never returned, never put in an error, never audited.
 *   - the transcription session is created transcription-ONLY: no tools, no
 *     assistant response. See {@link buildTranscriptionSessionBody}.
 *   - the speech call sends the caller's text verbatim and asks for audio; it
 *     carries no instructions that could make the model add words of its own.
 *   - nothing is written to disk, to the database or to a cache. Audio is
 *     streamed straight back to the caller and then it is gone.
 *   - every failure resolves to a typed result. This module never throws, so a
 *     provider outage can never surface as a stack trace or a 500.
 */

import { logger } from "@/lib/logger";

import type { VoiceLocale } from "./contract";

/**
 * The provider's API root.
 *
 * A module-level constant with no interpolation, so every URL built below has a
 * host that is fixed at build time. Nothing derived from a request can steer it.
 */
const OPENAI_API_BASE = "https://api.openai.com/v1";

/**
 * Endpoint paths, matching the current official OpenAI documentation:
 *   - realtime client secrets  → https://developers.openai.com/api/docs/guides/realtime-webrtc
 *   - audio speech             → https://developers.openai.com/api/docs/guides/text-to-speech
 *
 * The browser completes the WebRTC handshake itself against
 * `${OPENAI_API_BASE}/realtime/calls` using the ephemeral secret minted here;
 * that leg never involves the Hermes server and never sees the account key.
 */
const REALTIME_CLIENT_SECRETS_PATH = "/realtime/client_secrets";
const AUDIO_SPEECH_PATH = "/audio/speech";

/** Hard ceiling on how long an outbound call may take. */
const PROVIDER_TIMEOUT_MS = 15_000;

/**
 * Header the provider uses to attribute abuse to one end user.
 *
 * Fed the irreversible HMAC from `identity.ts` — never a Hermes user id.
 */
const SAFETY_IDENTIFIER_HEADER = "OpenAI-Safety-Identifier";

/**
 * Why an outbound call failed.
 *
 * Coarse ON PURPOSE. The routes map every value to one client-facing code, and a
 * finer vocabulary would only offer a caller a way to probe the provider
 * relationship. The distinction exists for the server log, which records the
 * reason and no payload.
 */
export type VoiceProviderFailure =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "PROVIDER_REJECTED"
  | "PROVIDER_UNAVAILABLE"
  | "MALFORMED_RESPONSE";

export type VoiceProviderResult<T> = { ok: true; value: T } | { ok: false; failure: VoiceProviderFailure };

/**
 * The transcription-only session body.
 *
 * WHY IT LOOKS LIKE THIS
 * The current Realtime API expresses "transcribe, never answer" as
 * `session.type: "transcription"`. Such a session emits transcription events
 * only; it has no assistant turn to create, which is the same guarantee the
 * earlier `create_response: false` flag provided — that flag's contract is now
 * carried by the session type, and both are asserted by the Phase 103 tests so
 * a future edit cannot quietly reintroduce a conversational session.
 *
 * `turn_detection: null` keeps segmentation on the client: the operator decides
 * when a thought is finished, which is the same decision they then confirm
 * before anything reaches the deterministic engine.
 *
 * There is deliberately no `tools`, no `tool_choice`, no `instructions` and no
 * `modalities` entry that could produce audio back. Adding one would be visible
 * in this function and is asserted against.
 */
export function buildTranscriptionSessionBody(model: string, expiresAfterSeconds: number) {
  return {
    expires_after: { anchor: "created_at", seconds: expiresAfterSeconds },
    session: {
      type: "transcription",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24_000 },
          transcription: { model },
          turn_detection: null,
        },
      },
    },
  } as const;
}

export interface TranscriptionSessionRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly expiresAfterSeconds: number;
  /** The irreversible per-(org,user) identifier. Never a Hermes user id. */
  readonly safetyIdentifier: string;
}

export interface TranscriptionSessionCredential {
  /** The ephemeral secret the browser uses for the SDP handshake. */
  readonly clientSecret: string;
  /** Unix seconds, as reported by the provider. */
  readonly expiresAt: number | null;
}

/**
 * Mint an ephemeral, transcription-only client secret.
 *
 * The returned secret is handed to the browser and NEVER persisted, logged or
 * audited — see the Phase 103 route-hygiene tests, which assert that the string
 * appears in no log call and in no audit metadata.
 */
export async function issueTranscriptionSession(
  request: TranscriptionSessionRequest,
): Promise<VoiceProviderResult<TranscriptionSessionCredential>> {
  if (!request.apiKey || !request.model || !request.safetyIdentifier) {
    return { ok: false, failure: "NOT_CONFIGURED" };
  }

  const response = await postJson(REALTIME_CLIENT_SECRETS_PATH, {
    apiKey: request.apiKey,
    safetyIdentifier: request.safetyIdentifier,
    body: buildTranscriptionSessionBody(request.model, request.expiresAfterSeconds),
  });
  if (!response.ok) return response;

  let parsed: unknown;
  try {
    parsed = await response.value.json();
  } catch {
    return { ok: false, failure: "MALFORMED_RESPONSE" };
  }

  const credential = readClientSecret(parsed);
  if (!credential) return { ok: false, failure: "MALFORMED_RESPONSE" };
  return { ok: true, value: credential };
}

/**
 * Read the ephemeral secret out of the provider's envelope.
 *
 * Tolerant of both documented shapes (`{ value, expires_at }` and a bare string)
 * without inventing a fallback: an envelope this does not recognise is a
 * MALFORMED_RESPONSE, not a guess.
 */
function readClientSecret(parsed: unknown): TranscriptionSessionCredential | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const root = parsed as Record<string, unknown>;

  const direct = root.value;
  if (typeof direct === "string" && direct.length > 0) {
    return { clientSecret: direct, expiresAt: readExpiry(root.expires_at) };
  }

  const nested = root.client_secret;
  if (typeof nested === "string" && nested.length > 0) {
    return { clientSecret: nested, expiresAt: readExpiry(root.expires_at) };
  }
  if (typeof nested === "object" && nested !== null) {
    const holder = nested as Record<string, unknown>;
    if (typeof holder.value === "string" && holder.value.length > 0) {
      return { clientSecret: holder.value, expiresAt: readExpiry(holder.expires_at ?? root.expires_at) };
    }
  }
  return null;
}

function readExpiry(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface SpeechRequest {
  readonly apiKey: string;
  readonly model: string;
  /** The EXACT deterministic answer text, already proven by a signed grant. */
  readonly text: string;
  readonly locale: VoiceLocale;
  readonly safetyIdentifier: string;
}

export interface SpeechAudio {
  readonly stream: ReadableStream<Uint8Array>;
  readonly contentType: string;
}

/**
 * The synthesis voice.
 *
 * One neutral voice for every locale, chosen so the product sounds the same
 * whoever is listening. It is not configurable from a request — a per-request
 * voice would be another client-controlled input on a paid external call for no
 * operational benefit.
 */
const SPEECH_VOICE = "alloy";

/** MP3: universally playable by `<audio>` and the smallest of the options. */
const SPEECH_FORMAT = "mp3";
const SPEECH_CONTENT_TYPE = "audio/mpeg";

/**
 * Speak the given text, verbatim.
 *
 * The body carries `input` and nothing that could license invention: no
 * `instructions`, no system prompt, no context. The response body is returned as
 * a stream and handed straight to the caller — it is never buffered to disk,
 * never written to the database and never cached.
 */
export async function synthesizeSpeech(request: SpeechRequest): Promise<VoiceProviderResult<SpeechAudio>> {
  if (!request.apiKey || !request.model || !request.text || !request.safetyIdentifier) {
    return { ok: false, failure: "NOT_CONFIGURED" };
  }

  const response = await postJson(AUDIO_SPEECH_PATH, {
    apiKey: request.apiKey,
    safetyIdentifier: request.safetyIdentifier,
    body: {
      model: request.model,
      input: request.text,
      voice: SPEECH_VOICE,
      response_format: SPEECH_FORMAT,
    },
  });
  if (!response.ok) return response;

  const stream = response.value.body;
  if (!stream) return { ok: false, failure: "MALFORMED_RESPONSE" };
  return { ok: true, value: { stream, contentType: SPEECH_CONTENT_TYPE } };
}

interface PostJsonOptions {
  readonly apiKey: string;
  readonly safetyIdentifier: string;
  readonly body: unknown;
}

/**
 * One outbound POST, with a hard timeout and no leakage on failure.
 *
 * `path` is a PATH, never a URL: the host is interpolated at the sink from the
 * module constant, so the destination host is fixed at build time and is
 * statically provable — which is what lets the Phase 99 SSRF inventory classify
 * this sink as MODULE_CONSTANT rather than as an unresolved parameter needing a
 * written review. Passing a whole URL in would have moved the decision to the
 * caller and made the guarantee a matter of convention.
 *
 * The provider's own error body is deliberately NOT read: it may echo request
 * content, and nothing downstream is allowed to see it. Only the status class is
 * used, and only the status code reaches the log.
 */
async function postJson(
  path: string,
  options: PostJsonOptions,
): Promise<VoiceProviderResult<Response>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(`${OPENAI_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
        [SAFETY_IDENTIFIER_HEADER]: options.safetyIdentifier,
      },
      body: JSON.stringify(options.body),
      // A 3xx must never bounce a credentialed request to another host.
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      // Status only. No body, no headers, no key, no request payload.
      logger.warn("[copilot-voice] external provider refused the request", {
        status: response.status,
      });
      return {
        ok: false,
        failure: response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED",
      };
    }
    return { ok: true, value: response };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    logger.warn("[copilot-voice] external provider call failed", {
      failure: aborted ? "timeout" : "network",
    });
    return { ok: false, failure: aborted ? "TIMEOUT" : "PROVIDER_UNAVAILABLE" };
  } finally {
    clearTimeout(timer);
  }
}
