/**
 * PHASE 103 — POST /api/copilot/voice/speech
 *
 * Reads back ONE exact sentence: the one the deterministic Copilot produced for
 * THIS user, in THIS organisation, in THIS locale, moments ago. It is not a
 * text-to-speech service, and an authenticated operator cannot use it as one.
 *
 * WHAT PROVES THE TEXT IS OURS
 * The caller must present the signed grant `/api/copilot/voice/query` issued.
 * `verifySpeechGrant` re-derives the MAC from the SERVER's view of the actor and
 * the submitted text, so the request is refused when the text was altered by a
 * character, the grant belongs to another user or another tenant, the locale
 * differs, the grant has expired, or the signature does not verify. Every one of
 * those refusals answers with the SAME code and status, so the response cannot
 * be used to work out which check failed.
 *
 * NOTHING IS STORED
 * The audio is streamed from the provider straight to the caller. It is not
 * buffered to disk, not written to the database, not cached, and not audited;
 * the audit event records the text LENGTH and the outcome, never the text.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { recordAuditEvent } from "@/lib/audit/audit-service";
import {
  VOICE_AUDIT,
  VOICE_BODY_MAX_BYTES,
  VOICE_LOCALES,
  VOICE_SPEECH_MAX_CHARS,
  buildVoiceAuditMetadata,
} from "@/lib/copilot/voice/contract";
import { resolveVoiceGovernance, voiceRegistryEntry } from "@/lib/copilot/voice/governance";
import { verifySpeechGrant } from "@/lib/copilot/voice/grant";
import { consumeGrantNonce } from "@/lib/copilot/voice/grant-consumption";
import { requireVoiceCopilotActor } from "@/lib/copilot/voice/guard";
import { externalUserIdentifier } from "@/lib/copilot/voice/identity";
import { synthesizeSpeech } from "@/lib/copilot/voice/provider";
import { isJsonContentType, readBoundedTextBody } from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Text, grant and locale — nothing else is representable. */
const speechSchema = z
  .object({
    text: z.string().min(1).max(VOICE_SPEECH_MAX_CHARS),
    grant: z.string().min(1).max(1024),
    locale: z.enum(VOICE_LOCALES),
  })
  .strict();

export async function POST(req: NextRequest) {
  const gate = await requireVoiceCopilotActor({ req, bucket: "copilot-voice-speech" });
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

  let candidate: unknown;
  try {
    candidate = JSON.parse(raw.text);
  } catch {
    return json({ error: "Malformed request body", code: "INVALID_INPUT" }, 400);
  }

  const parsed = speechSchema.safeParse(candidate);
  if (!parsed.success) return json({ error: "Invalid speech request", code: "INVALID_INPUT" }, 400);
  const { text, grant, locale } = parsed.data;

  const registry = voiceRegistryEntry("speech");
  const auditBase = {
    organizationId,
    registryId: registry?.registryId ?? "unknown",
    provider: registry?.provider ?? "unknown",
    model: registry?.modelId ?? "unknown",
    locale,
    characters: text.length,
  };

  const deny = async (result: string, code: string, status: number) => {
    await recordAuditEvent({
      action: VOICE_AUDIT.SPEECH_DENIED,
      entityType: "CopilotVoiceSpeech",
      organizationId,
      userId,
      outcome: "denied",
      metadata: buildVoiceAuditMetadata({ ...auditBase, result }),
    });
    return json({ error: "Speech playback is unavailable", code }, status);
  };

  // ── The grant, before anything is spent ────────────────────────────────────
  // Verified against the SERVER's actor, not against anything in the body. The
  // specific reason is audited (it is a server-side fact) but never returned.
  const verdict = verifySpeechGrant({
    token: grant,
    organizationId,
    userId,
    locale,
    text,
  });
  if (!verdict.ok) return deny(`GRANT_${verdict.reason}`, "VOICE_GRANT_INVALID", 403);

  // Single use. Defence in depth on top of the 60-second expiry — see
  // `grant-consumption.ts` for what this does and does not guarantee.
  if (!(await consumeGrantNonce(verdict.claims.nonce))) {
    return deny("GRANT_ALREADY_USED", "VOICE_GRANT_INVALID", 403);
  }

  const governance = await resolveVoiceGovernance({ organizationId, leg: "speech" });
  if (!governance.allowed) return deny(governance.reason, "EXTERNAL_AI_UNAVAILABLE", 503);

  const safetyIdentifier = externalUserIdentifier(organizationId, userId);
  if (!safetyIdentifier) return deny("IDENTITY_UNAVAILABLE", "EXTERNAL_AI_UNAVAILABLE", 503);

  const audio = await synthesizeSpeech({
    apiKey: governance.apiKey,
    model: governance.entry.modelId,
    text,
    locale,
    safetyIdentifier,
  });
  if (!audio.ok) return deny(audio.failure, "PROVIDER_UNAVAILABLE", 503);

  await recordAuditEvent({
    action: VOICE_AUDIT.SPEECH_SYNTHESISED,
    entityType: "CopilotVoiceSpeech",
    organizationId,
    userId,
    outcome: "success",
    metadata: buildVoiceAuditMetadata({ ...auditBase, result: "SYNTHESISED" }),
  });

  // Streamed through, never retained. `no-store` plus an explicit
  // `Content-Disposition: inline` says this is for immediate playback and not a
  // download the browser should keep.
  return new NextResponse(audio.value.stream, {
    status: 200,
    headers: {
      "Content-Type": audio.value.contentType,
      "Cache-Control": "no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
