/**
 * PHASE 109-C2.1 — the child↔supervisor wire protocol.
 *
 * TWO MESSAGES, AND THE SECOND ONE IS TERMINAL. The child emits exactly one
 * `READY` and then exactly one of `DONE` or `REFUSED`. There is no progressive
 * reporting: P0 removed per-entry messages precisely so that nothing partial
 * can be observed, cached or acted on before the whole pipeline has succeeded.
 *
 * NO CONTENT BYTES CROSS THE BOUNDARY. `DONE` carries paths, sizes and digests.
 * The decompressed bytes themselves never leave the parser process — they are
 * hashed as they stream and discarded.
 *
 * Every field is bounded. `.strict()` everywhere because Zod strips unknown
 * keys by default, and silently dropping a key an attacker added is the same
 * failure mode as accepting it: in both cases the message that was validated is
 * not the message that was sent.
 */

import { z } from "zod";

import { ALL_REFUSAL_CODES } from "./diagnostics";
import { INGEST_LIMITS, REQUIRED_CHILD_OOM_SCORE_ADJ, REQUIRED_MEMORY_OOM_GROUP } from "./limits";

const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex digits");

/**
 * The handshake.
 *
 * `oomScoreAdj` must be exactly the required value and `oomGroup` exactly 0 —
 * the schema does not accept "some high number" or "close enough". The
 * supervisor additionally re-reads the value from `/proc/<pid>/oom_score_adj`;
 * this schema bounds what the child may CLAIM, and the /proc read is what makes
 * the claim worth anything.
 */
export const ReadyMessageSchema = z
  .object({
    kind: z.literal("READY"),
    oomScoreAdj: z.literal(REQUIRED_CHILD_OOM_SCORE_ADJ),
    oomGroup: z.literal(REQUIRED_MEMORY_OOM_GROUP),
  })
  .strict();

export const IngestedEntrySchema = z
  .object({
    path: z.string().min(1).max(INGEST_LIMITS.maxEntryPathLength),
    observedBytes: z.number().int().nonnegative().max(INGEST_LIMITS.maxObservedEntryBytes),
    sha256: Sha256Hex,
    crc32: z.number().int().nonnegative().max(0xffffffff),
  })
  .strict();

export const DoneMessageSchema = z
  .object({
    kind: z.literal("DONE"),
    result: z
      .object({
        entryCount: z.number().int().nonnegative().max(INGEST_LIMITS.maxEntries),
        entries: z.array(IngestedEntrySchema).max(INGEST_LIMITS.maxEntries),
        observedTotalBytes: z
          .number()
          .int()
          .nonnegative()
          .max(INGEST_LIMITS.maxObservedTotalBytes),
      })
      .strict(),
  })
  .strict();

export const RefusedMessageSchema = z
  .object({
    kind: z.literal("REFUSED"),
    code: z.enum(ALL_REFUSAL_CODES as unknown as [string, ...string[]]),
    detail: z.string().max(INGEST_LIMITS.maxUntrustedTextLength).optional(),
  })
  .strict();

export const TerminalMessageSchema = z.discriminatedUnion("kind", [
  DoneMessageSchema,
  RefusedMessageSchema,
]);

export type ReadyMessage = z.infer<typeof ReadyMessageSchema>;
export type DoneMessage = z.infer<typeof DoneMessageSchema>;
export type RefusedMessage = z.infer<typeof RefusedMessageSchema>;
export type TerminalMessage = z.infer<typeof TerminalMessageSchema>;
export type IngestedEntry = z.infer<typeof IngestedEntrySchema>;

/** `entryCount` must equal the number of entries actually carried. */
export function doneMessageIsSelfConsistent(message: DoneMessage): boolean {
  if (message.result.entryCount !== message.result.entries.length) return false;
  const summed = message.result.entries.reduce((n, e) => n + e.observedBytes, 0);
  return summed === message.result.observedTotalBytes;
}

/** Parse one NDJSON line as a READY, or return null. Never throws. */
export function parseReady(line: string): ReadyMessage | null {
  try {
    const parsed: unknown = JSON.parse(line);
    const result = ReadyMessageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Parse one NDJSON line as a terminal message, or return null. Never throws. */
export function parseTerminal(line: string): TerminalMessage | null {
  try {
    const parsed: unknown = JSON.parse(line);
    const result = TerminalMessageSchema.safeParse(parsed);
    if (!result.success) return null;
    if (result.data.kind === "DONE" && !doneMessageIsSelfConsistent(result.data)) return null;
    return result.data;
  } catch {
    return null;
  }
}
