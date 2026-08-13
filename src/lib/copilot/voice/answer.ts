/**
 * PHASE 103 — projecting the deterministic Copilot answer for voice.
 *
 * Two pure functions over a {@link CopilotResponse} the EXISTING engine
 * produced. Neither adds a claim, softens a caveat, or invents a sentence: every
 * character they emit came from the deterministic pipeline or from this file's
 * own fixed connectives.
 *
 * `toVoiceAnswer` is the documented, read-only wire shape.
 * `renderSpeechText` is the exact string the speech leg may read, and the string
 * the grant's hash is computed over. They are derived from the SAME response in
 * the SAME request, so what the operator sees and what the product says cannot
 * drift apart.
 */

import type { CopilotEvidence, CopilotResponse } from "@/lib/copilot/types";

import { VOICE_SPEECH_MAX_CHARS } from "./contract";

/**
 * The wire shape of a voice answer.
 *
 * Evidence is projected to its human-readable description plus the record ids
 * the UI already links, which is what the existing Copilot surfaces expose. No
 * new data is published by this phase.
 */
export interface VoiceAnswerDto {
  readonly intent: string;
  readonly confidence: string;
  readonly summary: string;
  readonly observations: { readonly title: string; readonly description: string }[];
  readonly recommendations: {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly priority: string;
  }[];
  readonly evidence: { readonly type: string; readonly description: string; readonly recordId: string | null }[];
  readonly insufficientData: boolean;
  readonly blocked: boolean;
}

function projectEvidence(evidence: CopilotEvidence[]): VoiceAnswerDto["evidence"] {
  return evidence.map((item) => ({
    type: item.type,
    description: item.description,
    recordId: item.recordId ?? null,
  }));
}

export function toVoiceAnswer(response: CopilotResponse): VoiceAnswerDto {
  return {
    intent: response.intent,
    confidence: response.confidence,
    summary: response.summary,
    observations: response.observations.map((o) => ({ title: o.title, description: o.description })),
    recommendations: response.recommendations.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      priority: r.priority,
    })),
    evidence: projectEvidence([
      ...response.observations.flatMap((o) => o.evidence),
      ...response.recommendations.flatMap((r) => r.evidence),
    ]),
    insufficientData: response.insufficientData,
    blocked: Boolean(response.blockedReason),
  };
}

/**
 * Render the spoken text.
 *
 * Deterministic and total: the same response always renders the same string, so
 * the hash in the grant is reproducible, and a caller cannot influence the
 * rendering with anything except the question they already confirmed.
 *
 * A blocked response reads back ONLY its block reason. That is the case where
 * the operator asked for something the Copilot refuses — a control action, for
 * instance — and reading the refusal aloud and nothing else is the whole point.
 *
 * Recommendations are spoken as titles, not as full descriptions: a spoken list
 * of paragraphs is unusable, and the full text is on screen beside the button
 * the operator just pressed.
 *
 * The result is clamped to {@link VOICE_SPEECH_MAX_CHARS}. Clamping happens HERE,
 * before the grant is signed, so the hash covers exactly what will be spoken and
 * the speech route never has to trim (and so never has to re-decide) anything.
 */
export function renderSpeechText(response: CopilotResponse): string {
  if (response.blockedReason) return clamp(response.blockedReason.trim());

  const parts: string[] = [];
  const summary = response.summary.trim();
  if (summary) parts.push(summary);

  for (const observation of response.observations) {
    const title = observation.title.trim();
    const description = observation.description.trim();
    if (title && description) parts.push(`${title}: ${description}`);
    else if (description) parts.push(description);
    else if (title) parts.push(title);
  }

  for (const recommendation of response.recommendations) {
    const title = recommendation.title.trim();
    if (title) parts.push(title);
  }

  // A response with nothing to say still has to say something, and the honest
  // thing to say is the engine's own insufficient-data verdict rather than
  // silence the operator would read as a failure.
  if (parts.length === 0) return "";

  return clamp(parts.join(" "));
}

function clamp(text: string): string {
  return text.length <= VOICE_SPEECH_MAX_CHARS ? text : text.slice(0, VOICE_SPEECH_MAX_CHARS);
}
