/**
 * PHASE 112 — Snapshot redaction / allowlisting.
 *
 * Snapshots are built by ALLOWLIST, never by "store everything then delete a few
 * known keys". The raw-input snapshot is reconstructed from ONLY the known
 * Industrial Brain request fields, so a client cannot smuggle extra keys (a fake
 * "output", a secret, an injected instruction) into the immutable ledger, and
 * the create service never accepts a client-supplied output snapshot.
 */
import { AnalyzeRequestSchema } from "@/lib/industrial-brain/request-contract";

/** The exact set of fields an Industrial Brain request may contain. */
export const RAW_INPUT_ALLOWLIST: readonly string[] = Object.keys(AnalyzeRequestSchema.shape);

/** Hard cap on any single raw-input field stored in a snapshot (defense in depth). */
const MAX_FIELD_CHARS = 4000;

function clip(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > MAX_FIELD_CHARS ? trimmed.slice(0, MAX_FIELD_CHARS) : trimmed;
}

/**
 * Build the bounded RAW_INPUT snapshot from a validated request object, keeping
 * ONLY allowlisted string fields. Non-allowlisted keys and non-string values are
 * dropped — nothing outside the known request contract is ever persisted.
 */
export function boundedRawInputSnapshot(rawInput: unknown): Record<string, string> {
  const snapshot: Record<string, string> = {};
  if (typeof rawInput !== "object" || rawInput === null || Array.isArray(rawInput)) {
    return snapshot;
  }
  const source = rawInput as Record<string, unknown>;
  for (const key of RAW_INPUT_ALLOWLIST) {
    const clipped = clip(source[key]);
    if (clipped !== undefined) snapshot[key] = clipped;
  }
  return snapshot;
}
