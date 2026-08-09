// PHASE 101 (addendum) — HMI screen-definition extractor.
//
// WHY DECLARATIVE JSON
// Operator-interface engineering is not written in a PLC language and not in
// C++. On every modern panel and runtime it is a declarative description of
// screens, faceplates, bindings, permissions and navigation, with scripting
// only at the edges. This extractor reads that description in its own idiom and
// recovers the bindings it states, so the corpus's HMI layer is derived from
// the screen definition rather than asserted beside it.
//
// RELATION VOCABULARY
// Extractors speak one canonical triple — READS / WRITES / CALLS — because that
// is what a source text can state about a symbol. The mapping onto the richer
// graph vocabulary is language-specific and declared in one place
// (`RELATION_MAPPING` in `corpus.ts`): for an HMI definition a read is a
// DISPLAYS binding, a write is a COMMANDS binding, and a call is navigation.
//
// SAFETY
// A `commands` binding records that a screen DECLARES an operator command onto
// a tag. It is not a command this system can issue: Hermes has no runtime, no
// session and no write path to any device. Commands carry the permission and
// confirmation the design requires so those requirements stay visible.

import {
  type ExtractedRelation,
  type ExtractedUnit,
  type ExtractionResult,
  normaliseSource,
  summariseUnits,
} from "../source-artifacts";

/* ── Definition shape ─────────────────────────────────────────────────────── */

export interface HmiObjectDefinition {
  name: string;
  /** FACEPLATE, BUTTON, TREND, ALARM_BANNER, INDICATOR, NUMERIC, … */
  type: string;
  /** Tags this object shows. */
  displays?: string[];
  /** Tags this object declares an operator command onto. */
  commands?: string[];
  /** Permission the command requires. */
  permission?: string;
  /** Whether the operator must confirm before the command is issued. */
  requiresConfirmation?: boolean;
}

export interface HmiScreenDefinition {
  name: string;
  titleEn?: string;
  titleFa?: string;
  /** Screens reachable from this one. */
  navigatesTo?: string[];
  objects?: HmiObjectDefinition[];
}

export interface HmiDefinition {
  screens: HmiScreenDefinition[];
}

export class HmiDefinitionError extends Error {
  constructor(message: string) {
    super(`HMI definition is invalid: ${message}`);
    this.name = "HmiDefinitionError";
  }
}

/**
 * Parse and structurally validate an HMI definition.
 *
 * Throws rather than returning a partial result. A screen definition that does
 * not parse is an authoring defect, and silently extracting nothing from it
 * would let the agreement gate pass while the HMI layer described nothing.
 */
export function parseHmiDefinition(source: string): HmiDefinition {
  let raw: unknown;
  try {
    raw = JSON.parse(normaliseSource(source));
  } catch (error) {
    throw new HmiDefinitionError(error instanceof Error ? error.message : "unparseable");
  }

  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as HmiDefinition).screens)) {
    throw new HmiDefinitionError("expected an object with a `screens` array");
  }

  const screens = (raw as HmiDefinition).screens;
  for (const screen of screens) {
    if (typeof screen?.name !== "string" || screen.name.length === 0) {
      throw new HmiDefinitionError("every screen needs a non-empty `name`");
    }
    for (const object of screen.objects ?? []) {
      if (typeof object?.name !== "string" || object.name.length === 0) {
        throw new HmiDefinitionError(`screen ${screen.name} has an object without a name`);
      }
      if (typeof object.type !== "string" || object.type.length === 0) {
        throw new HmiDefinitionError(`object ${screen.name}/${object.name} has no type`);
      }
    }
  }

  return { screens };
}

/* ── Extraction ───────────────────────────────────────────────────────────── */

/**
 * Line of the first occurrence of a quoted name, 1-based.
 *
 * JSON carries no positions, so the line is recovered by locating the name in
 * the raw text. Reporting line 1 for everything would make a provenance
 * citation useless the moment a definition grows past one screen.
 */
function lineOf(source: string, name: string, fallback = 1): number {
  const index = source.indexOf(`"${name}"`);
  if (index === -1) return fallback;
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source[i] === "\n") line += 1;
  return line;
}

export function extractHmi(source: string): ExtractionResult {
  const text = normaliseSource(source);
  const definition = parseHmiDefinition(text);

  const units: ExtractedUnit[] = definition.screens.map((screen) => {
    const relations: ExtractedRelation[] = [];
    const screenLine = lineOf(text, screen.name);

    for (const object of screen.objects ?? []) {
      const objectLine = lineOf(text, object.name, screenLine);
      for (const tag of object.displays ?? []) {
        relations.push({ symbol: tag, relation: "READS", line: lineOf(text, tag, objectLine) });
      }
      for (const tag of object.commands ?? []) {
        relations.push({ symbol: tag, relation: "WRITES", line: lineOf(text, tag, objectLine) });
      }
    }

    for (const target of screen.navigatesTo ?? []) {
      relations.push({ symbol: target, relation: "CALLS", line: lineOf(text, target, screenLine) });
    }

    return { name: screen.name, kind: "SCREEN", relations };
  });

  return summariseUnits(units);
}

/* ── Design safety review ─────────────────────────────────────────────────── */

export interface UnguardedCommand {
  screen: string;
  object: string;
  tag: string;
  reason: "NO_PERMISSION" | "NO_CONFIRMATION";
}

/**
 * Operator commands that carry no permission, or that would act without
 * confirmation.
 *
 * This reviews the DESIGN, not a runtime: it reports screens whose declared
 * commands would let an operator act with less friction than the engineering
 * intent requires. It is surfaced as a finding for a human, never auto-fixed.
 */
export function unguardedCommands(source: string): UnguardedCommand[] {
  const definition = parseHmiDefinition(source);
  const findings: UnguardedCommand[] = [];

  for (const screen of definition.screens) {
    for (const object of screen.objects ?? []) {
      for (const tag of object.commands ?? []) {
        if (!object.permission) {
          findings.push({ screen: screen.name, object: object.name, tag, reason: "NO_PERMISSION" });
        }
        if (!object.requiresConfirmation) {
          findings.push({ screen: screen.name, object: object.name, tag, reason: "NO_CONFIRMATION" });
        }
      }
    }
  }

  return findings;
}
