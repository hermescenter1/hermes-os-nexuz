// PHASE 95 — strict LLM output schema (replaces loose post-hoc JSON parsing).
//
// The model is allowed to return ONLY a narrow paraphrase/explanation structure
// plus references to server-issued citation ids. It may NOT return authoritative
// values (confidence, evidence state, fault/rule ids/versions, safety class,
// approval, control actions, tenant/site ownership). Any unknown field,
// malformed JSON, missing field, action field, tool instruction, or citation id
// outside the allow-list ⇒ REJECT. On reject the caller discards provider output
// and returns the deterministic result; a safe audit event is recorded WITHOUT
// provider content or parser internals.

import { z } from "zod";

/** Fields the model must never author. If any appears, the output is rejected. */
export const FORBIDDEN_LLM_FIELDS = [
  "confidence",
  "evidenceSufficiency",
  "evidenceState",
  "faultCode",
  "ruleId",
  "ruleVersion",
  "safetyClass",
  "safetyClassification",
  "humanApprovalRequired",
  "approval",
  "controlAction",
  "action",
  "command",
  "tool",
  "toolCall",
  "tenantId",
  "organisationId",
  "organizationId",
  "siteId",
  "ownerId",
] as const;

const CITATION_ID_RE = /^S[1-9][0-9]{0,3}$/;

export const LlmRephraseSchema = z
  .object({
    rephrasedSummary: z.string().min(1).max(2_000),
    explanation: z.string().min(1).max(6_000),
    citationIds: z.array(z.string().regex(CITATION_ID_RE)).max(24).default([]),
  })
  .strict(); // unknown keys ⇒ error

export type LlmRephrase = z.infer<typeof LlmRephraseSchema>;

export type OutputRejectReason =
  | "malformed_json"
  | "schema_violation"
  | "forbidden_field"
  | "citation_not_allowed"
  | "empty";

export type LlmOutputResult =
  | { ok: true; value: LlmRephrase }
  | { ok: false; reason: OutputRejectReason };

/**
 * Parse and validate a raw provider string. Fail-closed: any problem returns a
 * fixed reason (never provider content). `allowedCitationIds` is the server
 * allow-list; a citation outside it rejects the whole output.
 */
export function parseLlmOutput(raw: unknown, allowedCitationIds: readonly string[]): LlmOutputResult {
  if (typeof raw !== "string" || raw.trim().length === 0) return { ok: false, reason: "empty" };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed_json" };
  }

  // Reject forbidden fields BEFORE schema (they would also fail .strict(), but
  // this yields the precise, auditable reason).
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const keys = Object.keys(json as Record<string, unknown>);
    if (keys.some((k) => (FORBIDDEN_LLM_FIELDS as readonly string[]).includes(k))) {
      return { ok: false, reason: "forbidden_field" };
    }
  }

  const parsed = LlmRephraseSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "schema_violation" };

  const allow = new Set(allowedCitationIds);
  if (!parsed.data.citationIds.every((id) => allow.has(id))) {
    return { ok: false, reason: "citation_not_allowed" };
  }

  return { ok: true, value: parsed.data };
}

/** The authoritative deterministic result the LLM may only decorate. The LLM
 *  output can NEVER replace these fields. */
export interface DeterministicResult {
  readonly confidence: number;
  readonly evidenceState: string;
  readonly faultCode: string | null;
  readonly ruleId: string | null;
  readonly ruleVersion: string | null;
  readonly safetyClass: string;
  readonly humanApprovalRequired: boolean;
  readonly citationIds: readonly string[];
}

/** Merge a validated rephrase onto the deterministic result WITHOUT letting the
 *  model touch any authoritative field. Deterministic values always win. */
export function mergeDeterministicWithRephrase(
  deterministic: DeterministicResult,
  rephrase: LlmRephrase | null,
): DeterministicResult & { rephrasedSummary: string | null; explanation: string | null } {
  return {
    ...deterministic,
    // citationIds stay deterministic (server-issued); the rephrase may only
    // reference a subset, never add new ones.
    citationIds: deterministic.citationIds,
    rephrasedSummary: rephrase?.rephrasedSummary ?? null,
    explanation: rephrase?.explanation ?? null,
  };
}
