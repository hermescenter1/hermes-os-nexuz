/**
 * PHASE 109-C2.0 — the declared compile-result contract.
 *
 * THE HONEST CLAIM
 * ----------------
 * This companion cannot observe a compilation. It does not run TIA Portal, it
 * does not invoke Openness, and it starts no process. Everything it can ever
 * know about a compile is what somebody TOLD it.
 *
 * So the contract has exactly one evidence value, `"DECLARED"`, and the type is
 * that literal. There is no stronger value to reach for — not because a stronger
 * one was omitted for later, but because this architecture can never justify
 * one. A field that could hold a stronger value would eventually hold it, set by
 * a caller that meant "I am fairly sure", and the surface would then be telling
 * an engineer that a compile was confirmed when nothing confirmed it.
 *
 * BINDING
 * A compile result is meaningless without knowing WHICH project state it
 * describes, so every result carries `snapshotContentSha256` and is refused
 * unless it equals the content address of the snapshot it is being applied to.
 * That also makes it useless to replay a genuine result against a modified
 * project: the digest moved, the binding fails.
 *
 * It binds to `contentSha256`, NOT to `snapshotId`, and the distinction is the
 * point: a compile describes the ENGINEERING CONTENT, so the same result is
 * legitimately valid for two snapshots of that content recorded by different
 * engineers at different times. Binding to `snapshotId` would invalidate a
 * genuine compile result the moment somebody re-recorded the same code.
 *
 * TWO FAILURE CODES, NOT ONE
 *   AES-C2-020 COMPILE_RESULT_MALFORMED — the document is structurally invalid:
 *              schema failure, an unknown severity token, a structural code that
 *              is prose, a malformed timestamp or declarer field, too many
 *              entries. A producer bug.
 *   AES-C2-012 COMPILE_RESULT_UNBOUND   — the document is well formed and names
 *              a project state that is not this one. A replay, or the wrong
 *              snapshot in hand.
 * They call for different responses, so they are different codes.
 *
 * SEVERITY IS STRUCTURAL, NEVER TEXTUAL
 * A TIA compile log renders its severities in the installation's language:
 * "Error", "Fehler", "خطا". Deciding severity by reading those words would make
 * the companion's verdict depend on the language a machine in another building
 * happened to be installed in. Severity is therefore derived ONLY from
 * `severityToken`, a locale-independent enum, and the human text is carried as
 * bounded, untrusted, display-only evidence.
 */

import { z } from "zod";

import { classifyEntryPath, TIA_PACKAGE_LIMITS, unsafeTextReason } from "./contract";
import {
  diagnostic,
  TIA_DIAGNOSTIC_CODES,
  type TiaDiagnostic,
  type TiaDiagnosticSeverity,
} from "./diagnostics";
import type { TiaSnapshot } from "./snapshot";

/* ── evidence ─────────────────────────────────────────────────────────────── */

/** The only evidence value this architecture can honestly produce. */
export const COMPILE_EVIDENCE = "DECLARED" as const;

export type CompileEvidence = typeof COMPILE_EVIDENCE;

/* ── severity tokens ──────────────────────────────────────────────────────── */

/**
 * Locale-independent severity tokens.
 *
 * A producer that only has translated text must map it to one of these BEFORE
 * handing the result over. Pushing that mapping out to the producer is
 * deliberate: whoever holds the log also knows which language it is in, and this
 * module refuses to guess.
 */
export const COMPILE_SEVERITY_TOKENS = ["ERROR", "WARNING", "INFO"] as const;

export type CompileSeverityToken = (typeof COMPILE_SEVERITY_TOKENS)[number];

const SEVERITY_BY_TOKEN: Readonly<Record<CompileSeverityToken, TiaDiagnosticSeverity>> =
  Object.freeze({
    ERROR: "error",
    WARNING: "warning",
    INFO: "info",
  });

/**
 * Severity for one entry.
 *
 * Reads `severityToken` and nothing else. `untrustedText` is not a parameter of
 * this function on purpose: a function that cannot see the text cannot be
 * accused of having been influenced by it.
 */
export function severityOfToken(token: CompileSeverityToken): TiaDiagnosticSeverity {
  return SEVERITY_BY_TOKEN[token];
}

/* ── schemas ──────────────────────────────────────────────────────────────── */

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/** A tool-supplied structural identifier. Bounded, and never prose. */
const StructuralCodeSchema = z
  .string()
  .regex(/^[A-Z0-9][A-Z0-9_.-]{0,63}$/, "expected an upper-case structural code");

export const DeclaredCompileEntrySchema = z
  .object({
    structuralCode: StructuralCodeSchema,
    severityToken: z.enum(COMPILE_SEVERITY_TOKENS),
    /** Package-relative path the entry is about, or null for a project-wide entry. */
    entryPath: z.string().max(TIA_PACKAGE_LIMITS.maxEntryPathLength).nullable(),
    line: z.number().int().min(1).max(20_000_000).nullable(),
    /**
     * The producer's own message. Bounded, untrusted, DISPLAY ONLY. Never read
     * by any decision in this module.
     */
    untrustedText: z.string().max(TIA_PACKAGE_LIMITS.maxUntrustedTextLength),
  })
  .strict();

export const DeclaredCompileResultSchema = z
  .object({
    /** Literal. A schema that accepted anything else would defeat the contract. */
    compileEvidence: z.literal(COMPILE_EVIDENCE),
    /** The snapshot this result describes. Checked against the actual snapshot. */
    snapshotContentSha256: Sha256Schema,
    declaredAtEpochMs: z.number().int().min(0),
    /**
     * Who declared this. EVIDENCE, so its bytes are preserved exactly.
     *
     * `.trim()` was removed here: in Zod it is a TRANSFORM, not a check, so
     * `"  Engineer A  "` silently became `"Engineer A"` and the value recorded
     * was not the value submitted. Blankness is checked in `bindCompileResult`
     * with `value.trim().length > 0` — asking whether a field is filled in is a
     * different question from deciding which bytes are the evidence, and only
     * the first is trim's business.
     */
    declaredBy: z.string().max(191),
    /** What the producer says produced this. An assertion, recorded as evidence. */
    toolDeclaration: z.string().max(191),
    entries: z.array(DeclaredCompileEntrySchema).max(50_000),
  })
  .strict();

export type DeclaredCompileEntry = z.infer<typeof DeclaredCompileEntrySchema>;
export type DeclaredCompileResult = z.infer<typeof DeclaredCompileResultSchema>;

/* ── normalized findings ──────────────────────────────────────────────────── */

/**
 * One normalized compile finding.
 *
 * Deliberately a different type from `TiaDiagnostic`: a diagnostic is the
 * companion's own verdict about a contract, while this is somebody else's claim
 * about their compiler. Collapsing the two would make an unverifiable assertion
 * look like a Hermes finding.
 */
export interface NormalizedCompileFinding {
  readonly structuralCode: string;
  readonly severity: TiaDiagnosticSeverity;
  readonly entryPath: string | null;
  readonly line: number | null;
  /** Display-only. Never a decision source anywhere in this codebase. */
  readonly untrustedText: string;
  /** Restated on every finding so no consumer can forget what it is looking at. */
  readonly compileEvidence: CompileEvidence;
  readonly snapshotContentSha256: string;
}

export type CompileBinding =
  | {
      readonly ok: true;
      readonly result: DeclaredCompileResult;
      readonly findings: readonly NormalizedCompileFinding[];
    }
  | { readonly ok: false; readonly diagnostics: readonly TiaDiagnostic[] };

/**
 * Validate a declared compile result and bind it to a snapshot.
 *
 * Fail-closed at every step. In particular an entry whose `entryPath` is not a
 * valid package-relative path is refused rather than kept with the path blanked:
 * a compile finding that points at `../../etc/passwd` is evidence about the
 * producer, and quietly normalising it away would destroy that evidence.
 */
export function bindCompileResult(raw: unknown, snapshot: TiaSnapshot): CompileBinding {
  const C = TIA_DIAGNOSTIC_CODES;

  // The evidence value is read first, so a result claiming a stronger evidence
  // than this architecture can produce is reported as exactly that rather than
  // as a generic schema failure.
  const declaredEvidence =
    raw !== null && typeof raw === "object"
      ? (raw as Record<string, unknown>).compileEvidence
      : undefined;
  if (declaredEvidence !== COMPILE_EVIDENCE) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          C.COMPILE_EVIDENCE_NOT_DECLARED,
          { declared: String(declaredEvidence), permitted: COMPILE_EVIDENCE },
          { snapshotContentSha256: snapshot.contentSha256 },
        ),
      ],
    };
  }

  // MALFORMED, not UNBOUND. A document that does not parse and a well-formed
  // document pointing at the wrong project state are different failures with
  // different responses — the first is a producer bug, the second is a replay —
  // and collapsing them into one code would tell a reviewer neither. Zod's own
  // issue prose never leaves this function; the caller gets a stable code plus
  // identifiers.
  const parsed = DeclaredCompileResultSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          C.COMPILE_RESULT_MALFORMED,
          {
            issueCount: String(parsed.error.issues.length),
            firstPath: parsed.error.issues[0]?.path.join(".") ?? "",
          },
          { snapshotContentSha256: snapshot.contentSha256 },
        ),
      ],
    };
  }
  const result = parsed.data;

  // Bounded evidence text: CHECKED, never rewritten.
  //
  // Two questions in a fixed order, because they have different answers:
  //   1. is the field meaningfully filled in?  -> blank means MALFORMED (020),
  //      and blankness is judged with `trim()` WITHOUT storing the trimmed value;
  //   2. does it carry anything a renderer must not be handed? -> UNSAFE (021).
  //
  // Refused rather than sanitised, for the reason that governs this module: a
  // message containing a right-to-left override is evidence about the producer,
  // and rewriting it destroys that evidence while leaving a reviewer looking at
  // a cleaned-up string with no sign anything was there.
  for (const [field, text] of [
    ["toolDeclaration", result.toolDeclaration],
    ["declaredBy", result.declaredBy],
  ] as const) {
    if (text.trim().length === 0) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            C.COMPILE_RESULT_MALFORMED,
            { field, reason: "empty or whitespace-only" },
            { snapshotContentSha256: snapshot.contentSha256 },
          ),
        ],
      };
    }
    const unsafe = unsafeTextReason(text);
    if (unsafe !== null) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            C.UNSAFE_TEXT_CONTROL_CHARACTERS,
            { field, detail: unsafe },
            { snapshotContentSha256: snapshot.contentSha256 },
          ),
        ],
      };
    }
  }

  // UNBOUND is reserved for exactly this: a STRUCTURALLY VALID result naming a
  // project state that is not the one in hand. That is the replay case.
  if (result.snapshotContentSha256 !== snapshot.contentSha256) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          C.COMPILE_RESULT_UNBOUND,
          {
            declared: result.snapshotContentSha256,
            expected: snapshot.contentSha256,
          },
          { snapshotContentSha256: snapshot.contentSha256 },
        ),
      ],
    };
  }

  const findings: NormalizedCompileFinding[] = [];
  const refusals: TiaDiagnostic[] = [];

  for (const entry of result.entries) {
    const unsafe = unsafeTextReason(entry.untrustedText);
    if (unsafe !== null) {
      refusals.push(
        diagnostic(
          C.UNSAFE_TEXT_CONTROL_CHARACTERS,
          { field: "untrustedText", structuralCode: entry.structuralCode, detail: unsafe },
          { snapshotContentSha256: snapshot.contentSha256 },
        ),
      );
      continue;
    }
    let path: string | null = null;
    if (entry.entryPath !== null) {
      const verdict = classifyEntryPath(entry.entryPath);
      if (!verdict.ok) {
        refusals.push(
          diagnostic(
            verdict.code,
            { path: entry.entryPath, structuralCode: entry.structuralCode },
            { entryPath: entry.entryPath, snapshotContentSha256: snapshot.contentSha256 },
          ),
        );
        continue;
      }
      path = verdict.canonical;
    }
    findings.push(
      Object.freeze({
        structuralCode: entry.structuralCode,
        severity: severityOfToken(entry.severityToken),
        entryPath: path,
        line: entry.line,
        untrustedText: entry.untrustedText,
        compileEvidence: COMPILE_EVIDENCE,
        snapshotContentSha256: snapshot.contentSha256,
      }),
    );
  }

  if (refusals.length > 0) {
    return { ok: false, diagnostics: Object.freeze(refusals) };
  }

  return { ok: true, result, findings: Object.freeze(findings) };
}

/** Counts by severity over normalized compile findings. */
export function compileCountBySeverity(
  findings: readonly NormalizedCompileFinding[],
): { error: number; warning: number; info: number } {
  const out = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) out[finding.severity] += 1;
  return out;
}
