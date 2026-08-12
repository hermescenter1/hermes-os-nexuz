/**
 * PHASE 103 — POST /api/copilot/voice/query
 *
 * The ONLY door between a spoken question and an answer, and it opens only on an
 * explicit operator confirmation: the browser sends the transcript here after
 * the operator has read it, corrected it if necessary and pressed Analyze.
 * Nothing on the transcription path can reach this endpoint by itself.
 *
 * THE ANSWER IS DETERMINISTIC, FULL STOP
 * The transcript is handed to `generateResponse` — the SAME engine the existing
 * `/api/copilot/query` route uses, unchanged. No external model is consulted, no
 * paraphrase is applied, and no part of the answer originates outside the
 * deterministic pipeline. Voice changed how the question arrived; it did not
 * change who answers it.
 *
 * WHAT IS RETURNED
 *   - the documented, read-only answer projection, and
 *   - a short-lived SIGNED GRANT that authorises reading back one exact string.
 *
 * The grant binds organisation, user, locale, a hash of the text and an expiry
 * (see `src/lib/copilot/voice/grant.ts`), so the speech leg can prove the
 * sentence it is about to say is the sentence this server just produced.
 *
 * THE TRANSCRIPT IS NOT STORED
 * It is parsed, validated, passed to the engine and dropped. It is written to no
 * table, no cache, no log line and no audit event; the audit records its LENGTH
 * and the resulting intent, never its content.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { recordAuditEvent } from "@/lib/audit/audit-service";
import { generateResponse } from "@/lib/copilot/copilot";
import { renderSpeechText, toVoiceAnswer } from "@/lib/copilot/voice/answer";
import {
  VOICE_AUDIT,
  VOICE_BODY_MAX_BYTES,
  VOICE_LOCALES,
  VOICE_TRANSCRIPT_MAX_CHARS,
  buildVoiceAuditMetadata,
} from "@/lib/copilot/voice/contract";
import { voiceRegistryEntry } from "@/lib/copilot/voice/governance";
import { issueSpeechGrant } from "@/lib/copilot/voice/grant";
import { requireVoiceCopilotActor } from "@/lib/copilot/voice/guard";
import { isJsonContentType, readBoundedTextBody } from "@/lib/security/request-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * The writable surface, and nothing else.
 *
 * `.strict()` is the mass-assignment control: a body carrying `organizationId`,
 * `userId`, `siteId`, `assetId` or a grant of its own is REJECTED rather than
 * quietly ignored. The tenant and the actor come from the guard; neither is
 * representable here, so neither can be supplied by a client.
 */
const voiceQuerySchema = z
  .object({
    transcript: z.string().trim().min(1).max(VOICE_TRANSCRIPT_MAX_CHARS),
    locale: z.enum(VOICE_LOCALES),
  })
  .strict();

export async function POST(req: NextRequest) {
  const gate = await requireVoiceCopilotActor({ req, bucket: "copilot-voice-query" });
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

  const parsed = voiceQuerySchema.safeParse(candidate);
  // The failure is NOT echoed: a validation report that reflects the submitted
  // transcript would put spoken content into a response body and a proxy log.
  if (!parsed.success) return json({ error: "Invalid voice query", code: "INVALID_INPUT" }, 400);
  const { transcript, locale } = parsed.data;

  // ── The deterministic engine. The authority. ───────────────────────────────
  // Site and asset scoping are deliberately not exposed on the voice path: the
  // engine already filters everything it reads by the server-derived
  // organisation, and a spoken free-text field is the wrong place to introduce
  // a new scoping parameter.
  let response;
  try {
    response = await generateResponse(organizationId, transcript, undefined, undefined, locale);
  } catch {
    // The engine is the product; if it cannot answer, there is nothing to speak
    // and nothing to fall back to. The internal cause stays in the server.
    return json({ error: "The Copilot could not answer", code: "COPILOT_UNAVAILABLE" }, 503);
  }

  const answer = toVoiceAnswer(response);
  const speechText = renderSpeechText(response);

  // A grant is minted only when there IS something to say and the signing secret
  // exists. No grant simply means the answer is read on screen — the answer is
  // never withheld because the voice leg is unavailable.
  const grant = speechText.length > 0 ? issueSpeechGrant({ organizationId, userId, locale, text: speechText }) : null;

  const registry = voiceRegistryEntry("speech");
  await recordAuditEvent({
    action: VOICE_AUDIT.QUERY_ANSWERED,
    entityType: "CopilotVoiceQuery",
    organizationId,
    userId,
    outcome: "success",
    // Lengths and closed enums only — never the transcript, never the answer.
    metadata: {
      ...buildVoiceAuditMetadata({
        organizationId,
        registryId: "hermes:copilot-deterministic",
        provider: "hermes",
        model: "hermes-copilot-deterministic",
        locale,
        characters: transcript.length,
        result: answer.blocked ? "BLOCKED" : answer.intent,
      }),
      confidence: answer.confidence,
      insufficientData: answer.insufficientData,
      speechGrantIssued: grant !== null,
    },
  });

  return json(
    {
      answer,
      // `text` is the exact string the speech route will accept, and the string
      // the grant's hash covers. The UI shows it beside the play control so the
      // operator can see what will be said before it is said.
      speech: grant
        ? { text: speechText, grant: grant.token, expiresAt: grant.expiresAt, locale }
        : null,
      engine: {
        // Stated explicitly in the payload so a client can never present this
        // answer as something an external model produced.
        authority: "deterministic",
        registryId: "hermes:copilot-deterministic",
        externalModelUsed: false,
        speechRegistryId: registry?.registryId ?? null,
      },
    },
    200,
  );
}
