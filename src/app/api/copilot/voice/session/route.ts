/**
 * PHASE 103 — POST /api/copilot/voice/session
 *
 * Mints a SHORT-LIVED, TRANSCRIPTION-ONLY credential the operator's browser uses
 * to open a WebRTC connection to the speech-to-text provider. The account API key
 * never leaves this server; the browser only ever holds the ephemeral secret.
 *
 * WHAT THIS ENDPOINT DOES NOT DO
 *   - it does not open a conversational session (see
 *     `buildTranscriptionSessionBody`: `session.type: "transcription"`, no tools,
 *     no assistant response — the contract earlier written `create_response:
 *     false`);
 *   - it does not record, store or forward audio. No audio touches this server at
 *     all: the media stream goes browser → provider directly;
 *   - it does not persist, log or audit the ephemeral secret it returns.
 *
 * Authorization is the shared Phase 103 chain — see
 * `src/lib/copilot/voice/guard.ts` for the ordered contract and why an API key
 * is refused here.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { recordAuditEvent } from "@/lib/audit/audit-service";
import {
  VOICE_AUDIT,
  VOICE_BODY_MAX_BYTES,
  VOICE_SESSION_TTL_SECONDS,
  buildVoiceAuditMetadata,
  isVoiceLocale,
  type VoiceLocale,
} from "@/lib/copilot/voice/contract";
import { resolveVoiceGovernance, voiceRegistryEntry } from "@/lib/copilot/voice/governance";
import { requireVoiceCopilotActor } from "@/lib/copilot/voice/guard";
import { externalUserIdentifier } from "@/lib/copilot/voice/identity";
import { issueTranscriptionSession } from "@/lib/copilot/voice/provider";
import { isJsonContentType, readBoundedTextBody } from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every response carries `no-store`: none of this is ever cacheable. */
function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const gate = await requireVoiceCopilotActor({ req, bucket: "copilot-voice-session" });
  if (!gate.ok) return gate.response;
  const { organizationId, userId } = gate.actor;

  if (!isJsonContentType(req)) {
    return json({ error: "JSON request body required", code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  }
  const raw = await readBoundedTextBody(req, VOICE_BODY_MAX_BYTES);
  if (raw.status === "too_large") {
    return json({ error: "Request body too large", code: "BODY_TOO_LARGE" }, 413);
  }
  if (raw.status === "error") {
    return json({ error: "Malformed request body", code: "INVALID_INPUT" }, 400);
  }

  // The only field this endpoint accepts is the locale, and it is validated
  // against a closed set. Anything else in the envelope is ignored rather than
  // being able to influence the session that gets minted.
  let locale: VoiceLocale = "en";
  if (raw.text.trim().length > 0) {
    let candidate: unknown;
    try {
      candidate = JSON.parse(raw.text);
    } catch {
      return json({ error: "Malformed request body", code: "INVALID_INPUT" }, 400);
    }
    const requested = (candidate as Record<string, unknown> | null)?.locale;
    if (requested !== undefined) {
      if (!isVoiceLocale(requested)) {
        return json({ error: "Unsupported locale", code: "INVALID_INPUT" }, 400);
      }
      locale = requested;
    }
  }

  const registry = voiceRegistryEntry("transcription");
  const auditBase = {
    organizationId,
    registryId: registry?.registryId ?? "unknown",
    provider: registry?.provider ?? "unknown",
    model: registry?.modelId ?? "unknown",
    locale,
    characters: 0,
  };

  const governance = await resolveVoiceGovernance({ organizationId, leg: "transcription" });
  if (!governance.allowed) {
    // The DENIAL REASON is audited (it is a governance fact, not user content);
    // the client is told only that the capability is unavailable, so a probe
    // cannot map which of the switch, key, policy or environment is missing.
    await recordAuditEvent({
      action: VOICE_AUDIT.SESSION_DENIED,
      entityType: "CopilotVoiceSession",
      organizationId,
      userId,
      outcome: "denied",
      metadata: buildVoiceAuditMetadata({ ...auditBase, result: governance.reason }),
    });
    return json({ error: "Voice transcription is unavailable", code: "EXTERNAL_AI_UNAVAILABLE" }, 503);
  }

  const safetyIdentifier = externalUserIdentifier(organizationId, userId);
  if (!safetyIdentifier) {
    // Unreachable while governance requires the signing secret; kept because a
    // provider call without an irreversible identifier must never happen, and a
    // guarantee that depends on another module's ordering is not a guarantee.
    return json({ error: "Voice transcription is unavailable", code: "EXTERNAL_AI_UNAVAILABLE" }, 503);
  }

  const session = await issueTranscriptionSession({
    apiKey: governance.apiKey,
    model: governance.entry.modelId,
    expiresAfterSeconds: VOICE_SESSION_TTL_SECONDS,
    safetyIdentifier,
  });

  if (!session.ok) {
    await recordAuditEvent({
      action: VOICE_AUDIT.SESSION_DENIED,
      entityType: "CopilotVoiceSession",
      organizationId,
      userId,
      outcome: "failure",
      metadata: buildVoiceAuditMetadata({ ...auditBase, result: session.failure }),
    });
    return json({ error: "Voice transcription is unavailable", code: "PROVIDER_UNAVAILABLE" }, 503);
  }

  // Identity and counters only. The client secret is NOT in this event, is not
  // logged anywhere, and is not written to any store.
  await recordAuditEvent({
    action: VOICE_AUDIT.SESSION_ISSUED,
    entityType: "CopilotVoiceSession",
    organizationId,
    userId,
    outcome: "success",
    metadata: buildVoiceAuditMetadata({ ...auditBase, result: "ISSUED" }),
  });

  return json(
    {
      // The browser posts its SDP offer to the provider itself using this
      // secret; the Hermes server is not in the media path.
      clientSecret: session.value.clientSecret,
      expiresAt: session.value.expiresAt,
      expiresInSeconds: VOICE_SESSION_TTL_SECONDS,
      mode: "transcription_only",
      provider: governance.entry.provider,
      model: governance.entry.modelId,
      locale,
    },
    200,
  );
}
