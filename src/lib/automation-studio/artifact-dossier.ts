/**
 * PHASE 109-C-UI.1 — the artifact dossier.
 *
 * WHY THIS EXISTS
 * ---------------
 * Round 1 gave the Studio one central surface: the source view. Four of the
 * project's eighteen artifacts have textual source; the other fourteen — every
 * HMI screen, faceplate, alarm and trend list, every SCADA area, historian and
 * report, the tag table, the data blocks, the UDT, the test scenario and the
 * document — rendered a single centred sentence in an otherwise empty pane. The
 * model already knew a great deal about each of them; the workspace simply did
 * not ask.
 *
 * This module asks. It is a pure PROJECTION over data that already exists:
 * declarations whose `declaredIn` is this artifact, references whose
 * `artifactId` is this artifact, the artifact's own provenance, and the test
 * scenarios whose covered symbols this artifact actually touches.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It invents nothing. There is no process value, no equipment state, no live
 * alarm, no trend series and no screen geometry anywhere in the contract, so
 * none of those appear here. An HMI screen is presented as what the model
 * actually holds — an identity, a set of bindings, the symbols behind them and
 * the findings against it — and not as a mimic of a runtime it is not connected
 * to. If a later round imports richer artifact content, this projection widens;
 * until then a field that does not exist is absent rather than fabricated.
 */

import { ALL_DATA_ORIGINS } from "./contract";
import type {
  ArtifactKind,
  AutomationProject,
  DataOrigin,
  EngineeringArtifact,
  ProvenanceRecord,
  SymbolDefinition,
  SymbolReference,
  TestScenario,
} from "./contract";

/**
 * The engineering discipline an artifact belongs to.
 *
 * Derived from `kind` alone — never from the path — so an artifact filed in an
 * unexpected folder is still classified by what it IS. The tree already derives
 * folders from paths; deriving discipline from paths too would create a second
 * source of truth that could disagree with the first.
 */
export type ArtifactDiscipline = "plc" | "hmi" | "scada" | "test" | "document";

const DISCIPLINE_BY_KIND: Readonly<Record<ArtifactKind, ArtifactDiscipline>> = {
  "program-block": "plc",
  "data-block": "plc",
  udt: "plc",
  "tag-table": "plc",
  "hmi-screen": "hmi",
  "hmi-faceplate": "hmi",
  "hmi-alarm": "hmi",
  "hmi-trend": "hmi",
  "scada-area": "scada",
  "scada-historian": "scada",
  "scada-report": "scada",
  "test-scenario": "test",
  document: "document",
};

export function disciplineOf(kind: ArtifactKind): ArtifactDiscipline {
  return DISCIPLINE_BY_KIND[kind];
}

/**
 * Translation-key suffix for an artifact kind, inside
 * `automationStudio.kinds`.
 *
 * The kind is a closed union in the contract, so this map is exhaustive by
 * construction: a new kind cannot be added without the compiler demanding a key
 * for it. The raw value (`hmi-faceplate`) was previously rendered to the user in
 * every locale, which is an English identifier standing in for a label.
 */
export const KIND_MESSAGE_KEY: Readonly<Record<ArtifactKind, string>> = {
  "program-block": "programBlock",
  "data-block": "dataBlock",
  udt: "udt",
  "tag-table": "tagTable",
  "hmi-screen": "hmiScreen",
  "hmi-faceplate": "hmiFaceplate",
  "hmi-alarm": "hmiAlarm",
  "hmi-trend": "hmiTrend",
  "scada-area": "scadaArea",
  "scada-historian": "scadaHistorian",
  "scada-report": "scadaReport",
  "test-scenario": "testScenario",
  document: "document",
};

/**
 * Translation-key suffix for a data origin, inside `automationStudio.origins`.
 *
 * DERIVED from the closed union rather than written out, for two reasons.
 *
 * The first is correctness: a hand-written map can fall out of step with the
 * contract, and a missing entry would put the raw union member back on screen —
 * which is the defect this exists to remove. Deriving it means a new member is
 * covered the moment it is declared, and `phase109cui1-artifact-dossier` pins
 * that every member resolves to a distinct key that all three catalogues carry.
 *
 * The second is a repository invariant: `phase109c1-invariants` forbids the
 * literal text of a LIVE origin anywhere in the Studio's sources except the
 * contract that declares the union. A hand-written map would have had to spell
 * one out, and a live-origin literal outside the declaration site can only ever
 * appear in an admit position — which is precisely what that guard is for. The
 * transform below never names one.
 *
 *     "simulated"       -> "simulated"
 *     "live-readonly"   -> "liveReadonly"
 */
export const ORIGIN_MESSAGE_KEY: Readonly<Record<DataOrigin, string>> =
  Object.freeze(
    Object.fromEntries(
      ALL_DATA_ORIGINS.map((origin) => [
        origin,
        origin.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
      ]),
    ) as Record<DataOrigin, string>,
  );

/**
 * The provenance fields the artifact surfaces are permitted to show.
 *
 * An explicit copy, not the record. See `ArtifactProjection` for why.
 */
export interface ProvenanceProjection {
  readonly origin: DataOrigin;
  readonly producer: string;
  readonly recordedBy: string;
  readonly disclosure: string;
}

/**
 * The artifact fields the surfaces are permitted to show — an ALLOWLIST.
 *
 * THE DEFECT THIS REPLACES
 * The dossier used to carry the `EngineeringArtifact` object itself, and the
 * test that claimed to prove "no fabricated plant data" pinned the DOSSIER's own
 * key set. That proved nothing about the artifact inside it: a field added to
 * `EngineeringArtifact` — `currentValue`, `activeAlarms`, `lastReading` — would
 * have arrived on every HMI and SCADA pane through the reference the dossier was
 * passing straight through, and the test would still have been green. A pinned
 * key set on a pass-through object is a gate measuring the wrong object.
 *
 * So the projection is built field by field. A future contract field is INVISIBLE
 * here until someone deliberately adds it to this interface and to `project()`,
 * which is a reviewable act rather than an accident of a type widening.
 *
 * `contract.ts` is untouched: this is a narrowing on the way OUT, not a change
 * to what the domain may hold.
 */
export interface ArtifactProjection {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly kind: ArtifactKind;
  readonly version: number;
  readonly checksum: string;
  readonly modifiedBy: string;
  readonly readOnly: boolean;
  /** Null when the artifact carries no record — the seeded AES-C1-009 case. */
  readonly provenance: ProvenanceProjection | null;
}

/** The exact keys `project()` copies. Pinned by the test, used by nothing else. */
export const ARTIFACT_PROJECTION_KEYS = [
  "checksum", "id", "kind", "modifiedBy", "name", "path", "provenance",
  "readOnly", "version",
] as const;

export const PROVENANCE_PROJECTION_KEYS = [
  "disclosure", "origin", "producer", "recordedBy",
] as const;

function projectProvenance(record: ProvenanceRecord | null | undefined): ProvenanceProjection | null {
  // An absent record is a validation FINDING, not a crash, and not something to
  // paper over with an empty object.
  if (!record || typeof record.origin !== "string") return null;
  return {
    origin: record.origin,
    producer: record.producer,
    recordedBy: record.recordedBy,
    disclosure: record.disclosure,
  };
}

function projectArtifact(artifact: EngineeringArtifact): ArtifactProjection {
  return {
    id: artifact.id,
    path: artifact.path,
    name: artifact.name,
    kind: artifact.kind,
    version: artifact.version,
    checksum: artifact.checksum,
    modifiedBy: artifact.modifiedBy,
    readOnly: artifact.readOnly,
    provenance: projectProvenance(artifact.provenance),
  };
}

export interface ArtifactDossier {
  /** An allowlisted COPY. Never the contract object itself. */
  readonly artifact: ArtifactProjection;
  readonly discipline: ArtifactDiscipline;
  /** Symbols this artifact DECLARES. */
  readonly declaredSymbols: readonly SymbolDefinition[];
  /** References made FROM this artifact, split by access. */
  readonly reads: readonly SymbolReference[];
  readonly writes: readonly SymbolReference[];
  readonly bindings: readonly SymbolReference[];
  readonly alarms: readonly SymbolReference[];
  readonly referenceCount: number;
  /** Distinct symbol names this artifact declares or references. */
  readonly touchedSymbols: readonly string[];
  /**
   * Test scenarios that cover at least one symbol this artifact touches.
   *
   * A real engineering relationship, computed rather than tabulated: it answers
   * "is anything testing what this screen binds", which is exactly the question
   * a reviewer asks of an HMI artifact.
   */
  readonly relatedTests: readonly TestScenario[];
}

/**
 * Build the dossier.
 *
 * Linear in the project's references and symbols. The caller memoises per
 * artifact; there is no index to maintain because the projection is cheap and
 * an index would be a second thing that can go stale.
 */
export function buildArtifactDossier(
  project: AutomationProject,
  artifact: EngineeringArtifact,
  tests: readonly TestScenario[],
): ArtifactDossier {
  const declaredSymbols = project.symbols.filter((s) => s.declaredIn === artifact.id);

  const reads: SymbolReference[] = [];
  const writes: SymbolReference[] = [];
  const bindings: SymbolReference[] = [];
  const alarms: SymbolReference[] = [];

  for (const reference of project.references) {
    if (reference.artifactId !== artifact.id) continue;
    if (reference.access === "read") reads.push(reference);
    else if (reference.access === "write") writes.push(reference);
    else if (reference.access === "binding") bindings.push(reference);
    else alarms.push(reference);
  }

  const byLine = (a: SymbolReference, b: SymbolReference) => a.line - b.line;
  reads.sort(byLine);
  writes.sort(byLine);
  bindings.sort(byLine);
  alarms.sort(byLine);

  const touched = new Set<string>();
  for (const declaration of declaredSymbols) touched.add(declaration.name);
  for (const reference of [...reads, ...writes, ...bindings, ...alarms]) {
    touched.add(reference.symbolName);
  }
  // Locale-independent order, for the same reason the symbol index sorts this
  // way: two engineers must agree on what "the first one" is.
  const touchedSymbols = [...touched].sort();

  const relatedTests = tests.filter((test) =>
    test.coveredSymbols.some((name) => touched.has(name)),
  );

  return {
    artifact: projectArtifact(artifact),
    discipline: disciplineOf(artifact.kind),
    declaredSymbols,
    reads,
    writes,
    bindings,
    alarms,
    referenceCount: reads.length + writes.length + bindings.length + alarms.length,
    touchedSymbols,
    relatedTests,
  };
}
