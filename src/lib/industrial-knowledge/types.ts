// PHASE 101 — canonical industrial engineering knowledge model.
//
// PURPOSE
// One normalised representation able to express the full engineering chain:
//
//   PLC block → tag → I/O → device → equipment → state → sequence →
//   permissive → interlock → alarm → SCADA tag → HMI object →
//   historical evidence → fault hypothesis → root cause → safe action
//
// SAFETY POSTURE
// Everything in this module is DECLARATIVE ENGINEERING METADATA. It describes
// what a control system contains and how its parts relate. It opens no
// connection, evaluates no logic, and carries no runtime value. A `SAFE_ACTION`
// node is an instruction addressed to a qualified human being — it is never a
// command this system can execute, and one whose `safetyClass` is
// `SAFETY_RELATED` or `SAFETY_CRITICAL` is review-only by construction
// (see `isReviewOnly`).
//
// PROVENANCE
// Every node carries a complete `Provenance` record. Ingestion, retrieval and
// reasoning all propagate it, so any statement the Brain makes can be traced
// back to the exact source object that supports it. A reasoning output that
// cites a node id that is not in the corpus is, by definition, an unsupported
// claim — `diagnostics.ts` treats that as a defect, not a stylistic issue.
//
// REUSE
// The safety, zone, device-category, protocol and data-type vocabularies are
// imported from the Phase 94 import envelope rather than re-declared, so a
// Phase 101 corpus can be projected onto the existing `EngineeringImport`
// pipeline without a translation table (see `envelope-projection.ts`).

import {
  SAFETY_CLASSES,
  NETWORK_ZONES,
  DEVICE_CATEGORIES,
  PROTOCOLS,
  ACCESS_MODES,
} from "@/lib/ot-edge/import-envelope";
// Type-only, and therefore erased at runtime: `source-artifacts.ts` imports the
// provenance types from here, so a value import would be a genuine cycle.
import type { AuthoredSourceArtifact, SourceArtifact } from "./source-artifacts";

/* ── Localised text ───────────────────────────────────────────────────────── */

/** Bilingual label. Persian is authored, never machine-transliterated. */
export interface LocalizedText {
  en: string;
  fa: string;
}

export type KnowledgeLocale = "en" | "fa";

export function localized(text: LocalizedText, locale: KnowledgeLocale): string {
  return text[locale];
}

/* ── Vocabularies ─────────────────────────────────────────────────────────── */

export type SafetyClass = (typeof SAFETY_CLASSES)[number];
export type NetworkZone = (typeof NETWORK_ZONES)[number];
export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];
export type EngineeringProtocol = (typeof PROTOCOLS)[number];
export type AccessMode = (typeof ACCESS_MODES)[number];

/**
 * Engineering domain of a node. Coarser than a node kind: it answers "which
 * discipline owns this?", which is what subsystem identification is scored on.
 */
export const ENGINEERING_DOMAINS = [
  "CONTROL_LOGIC",
  "FIELD_IO",
  "DRIVES",
  "MECHANICAL",
  "PROCESS",
  "SAFETY",
  "NETWORK",
  "SUPERVISORY",
  "OPERATOR_INTERFACE",
  "QUALITY",
  "MAINTENANCE",
  "ENERGY",
] as const;
export type EngineeringDomain = (typeof ENGINEERING_DOMAINS)[number];

/** The kind of engineering object a node represents. */
export const KNOWLEDGE_NODE_KINDS = [
  "DEVICE",
  "EQUIPMENT",
  "PLC_BLOCK",
  "TAG",
  "IO_POINT",
  "SEQUENCE",
  "STATE",
  "PERMISSIVE",
  "INTERLOCK",
  "ALARM",
  "SCADA_TAG",
  "SCADA_VIEW",
  "HMI_SCREEN",
  "HMI_OBJECT",
  /** A named supervisory / operator-interface routine, in its own language. */
  "SCRIPT",
  "RECIPE",
  "KPI",
  "EVIDENCE_SOURCE",
  "FAULT_MODE",
  "SAFE_ACTION",
  /** Operator authorisation a human-invokable script demands. Governance only. */
  "ROLE",
  /** Class of audit record a script declares it emits. Governance only. */
  "AUDIT_EVENT_TYPE",
] as const;
export type KnowledgeNodeKind = (typeof KNOWLEDGE_NODE_KINDS)[number];

/**
 * Kinds that describe the GOVERNANCE surround of a system rather than the plant.
 *
 * A role and an audit-event class say who may invoke a routine and what record
 * that invocation leaves. Neither is a physical or logical object a fault can
 * propagate through, so neither may ever appear on a diagnostic path: an
 * operator role is not evidence, and reaching a fault mode "via" a role would be
 * a citation an engineer could not audit. `graph.ts` therefore removes these
 * kinds while building neighbours and never admits them to a traversal frontier.
 */
export const NON_DIAGNOSTIC_NODE_KINDS: readonly KnowledgeNodeKind[] = [
  "ROLE",
  "AUDIT_EVENT_TYPE",
];

export function isNonDiagnosticKind(kind: KnowledgeNodeKind): boolean {
  return NON_DIAGNOSTIC_NODE_KINDS.includes(kind);
}

/** How two engineering objects relate. Direction is always source → target. */
export const KNOWLEDGE_RELATIONS = [
  /** structural containment: project/device/screen → child */
  "CONTAINS",
  /** a block or object reads a tag / I/O point */
  "READS",
  /** a block writes a tag / I/O point (declared, never exercised) */
  "WRITES",
  /** a tag is bound to a physical channel */
  "BOUND_TO",
  /** a permissive gates a sequence, state or equipment */
  "GATES",
  /** an interlock blocks a sequence, state or equipment */
  "BLOCKS",
  /** a condition raises an alarm */
  "RAISES",
  /** a SCADA tag mirrors a PLC tag */
  "MIRRORS",
  /** an HMI/SCADA object displays a tag */
  "DISPLAYS",
  /** an HMI object issues an operator command onto a tag (declared only) */
  "COMMANDS",
  /** ordered state transition inside a sequence */
  "TRANSITIONS_TO",
  /** an evidence source records a tag or KPI */
  "RECORDS",
  /** a node's observable state is evidence for a fault mode */
  "EVIDENCE_FOR",
  /** a fault mode explains an alarm / symptom node */
  "EXPLAINS",
  /** a safe action verifies a fault mode */
  "VERIFIES",
  /** a block invokes another block (recovered from the source itself) */
  "CALLS",
  /** an object drives / actuates equipment */
  "ACTUATES",
  /** an object monitors equipment or a process value */
  "MONITORS",
  /** a KPI or recipe is derived from tags */
  "DERIVED_FROM",
  /** navigation between HMI screens */
  "NAVIGATES_TO",
  /** a human-invokable script demands an operator role (declared, never checked here) */
  "REQUIRES_ROLE",
  /** a script declares that invoking it emits an audit event of this class */
  "EMITS",
] as const;
export type KnowledgeRelation = (typeof KNOWLEDGE_RELATIONS)[number];

/**
 * Relations that state a governance fact rather than an engineering one.
 *
 * `REQUIRES_ROLE` and `EMITS` describe the authorisation and the audit trail a
 * routine declares. They carry no diagnostic signal — a missing role does not
 * make a bearing fail — so they are deliberately absent from
 * `DIAGNOSTIC_RELATIONS` and are listed here so a surface that wants the
 * governance view asks for it explicitly instead of discovering it by accident.
 */
export const STRUCTURAL_RELATIONS: readonly KnowledgeRelation[] = ["REQUIRES_ROLE", "EMITS"];

export function isStructuralRelation(relation: KnowledgeRelation): boolean {
  return STRUCTURAL_RELATIONS.includes(relation);
}

/** Subsystem the phase brief scores "correct subsystem identification" against. */
export const SUBSYSTEMS = [
  "PLC_LOGIC",
  "FIELD_DEVICE",
  "DRIVE",
  "MECHANICAL",
  "PROCESS",
  "SAFETY_CIRCUIT",
  "NETWORK",
  "SCADA",
  "HMI",
  "RECIPE_CONFIG",
  "UPSTREAM_DOWNSTREAM",
  "TELEMETRY",
] as const;
export type Subsystem = (typeof SUBSYSTEMS)[number];

/** Fault classes the benchmark must cover (phase brief LOOP 7). */
export const FAULT_CLASSES = [
  "SENSOR_FAILURE",
  "ACTUATOR_FAILURE",
  "DRIVE_FAULT",
  "COMMUNICATION_LOSS",
  "PERMISSIVE_MISSING",
  "INTERLOCK_ACTIVE",
  "INCORRECT_MODE",
  "SEQUENCE_TIMEOUT",
  "PROCESS_DEVIATION",
  "RECIPE_MISMATCH",
  "BLOCKAGE",
  "STALE_TELEMETRY",
] as const;
export type FaultClass = (typeof FAULT_CLASSES)[number];

/* ── Provenance ───────────────────────────────────────────────────────────── */

export const REFERENCE_SOURCE_TYPES = [
  "TIA_REFERENCE",
  "SCADA_REFERENCE",
  "HMI_REFERENCE",
] as const;
export type ReferenceSourceType = (typeof REFERENCE_SOURCE_TYPES)[number];

/** Where an engineering object came from. Never lost during ingestion. */
export interface Provenance {
  /** Reference system id, e.g. "TIA-01". */
  projectId: string;
  /** Named engineering subsystem inside that project, e.g. "ROLL_LINE_A". */
  subsystem: string;
  /** Artefact class the object was declared in. */
  sourceType: ReferenceSourceType;
  /** Identifier INSIDE that artefact, e.g. "FB1210/NET3" or "Screen_02/Fp_M14". */
  sourceId: string;
  /** Engineering version string of the source artefact. */
  version: string;
  /** Monotonic engineering revision of the source artefact. */
  revision: number;
  /** SHA-256 of the canonical form of the owning reference system. */
  checksum: string;
  domain: EngineeringDomain;
  safetyClass: SafetyClass;
}

/**
 * Provenance as authored on a node, before the corpus stamps the parts it owns
 * (`projectId`, `version`, `revision`, `checksum`, `sourceType`). Authors write
 * only what is genuinely local to the object.
 */
export type AuthoredProvenance = Pick<
  Provenance,
  "subsystem" | "sourceId" | "domain" | "safetyClass"
>;

/* ── Nodes ────────────────────────────────────────────────────────────────── */

/**
 * Attributes a node may declare. Deliberately a closed shape rather than a free
 * `Record<string, unknown>`: an open blob would let corpus data smuggle content
 * past the schema, and would make canonical checksums order-dependent.
 */
export interface NodeAttributes {
  /** Declared data type for tags / SCADA tags (BOOL, REAL, …). */
  dataType?: string;
  /** Logical address as declared by the reference design (e.g. "DB1210.DBX4.0"). */
  address?: string;
  /** Engineering unit. */
  unit?: string;
  /** Declared access mode. Not a capability this system can exercise. */
  accessMode?: AccessMode;
  /** Physical channel type for an I/O point. */
  channelType?: "DI" | "DO" | "AI" | "AO" | "PROFINET" | "PROFISAFE" | "IO_LINK";
  /** Device category for DEVICE nodes. */
  deviceCategory?: DeviceCategory;
  /** Network zone for DEVICE / SCADA nodes. */
  networkZone?: NetworkZone;
  /** Protocol for DEVICE / SCADA_TAG nodes. */
  protocol?: EngineeringProtocol;
  /** PLC block class. */
  blockType?: "OB" | "FB" | "FC" | "DB" | "UDT";
  /** Ordinal position of a STATE inside its SEQUENCE. */
  stepNumber?: number;
  /** Declared step watchdog in seconds — the value a timeout compares against. */
  stepTimeoutSeconds?: number;
  /** Alarm priority, following ISA-18.2 style banding. */
  alarmPriority?: "DIAGNOSTIC" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  /** Whether an alarm requires operator acknowledgement. */
  requiresAck?: boolean;
  /** Historian / trend retention window, in days, as designed. */
  retentionDays?: number;
  /** Sample interval of an evidence source, in seconds. */
  sampleIntervalSeconds?: number;
  /** Operator permission an HMI command requires. */
  requiredPermission?: string;
  /** TRUE when an HMI command must be confirmed by the operator. */
  requiresConfirmation?: boolean;
  /**
   * TRUE when a SCRIPT is declared to be started BY A HUMAN — an operator
   * pressing a button, an engineer running a routine — rather than by the
   * runtime on a schedule, a tag change or an alarm.
   *
   * Explicit and fail-closed: only the literal value `true` counts. An absent
   * or undefined field means "not human-invokable", because the safe reading of
   * an undeclared routine is that no operator is standing behind it. Read it
   * through `isHumanInvokable`, never as a bare truthiness test.
   */
  humanInvokable?: boolean;
  /** Fault class a FAULT_MODE node belongs to. */
  faultClass?: FaultClass;
  /** Subsystem a FAULT_MODE node attributes the fault to. */
  subsystem?: Subsystem;
  /** Expected value/state, in engineering terms, for diagnostic comparison. */
  expectedState?: string;
  /** KPI formula, expressed in engineering terms — never evaluated here. */
  formula?: string;
}

export interface KnowledgeNode {
  /** Corpus-unique id. Convention: "<PROJECT>:<KIND>:<LOCAL>", ASCII, stable. */
  id: string;
  kind: KnowledgeNodeKind;
  label: LocalizedText;
  description?: LocalizedText;
  attributes: NodeAttributes;
  provenance: Provenance;
}

/** A node as authored inside a reference system, before corpus stamping. */
export interface AuthoredNode {
  id: string;
  kind: KnowledgeNodeKind;
  label: LocalizedText;
  description?: LocalizedText;
  attributes?: NodeAttributes;
  provenance: AuthoredProvenance;
}

/* ── Edges ────────────────────────────────────────────────────────────────── */

export interface KnowledgeEdge {
  id: string;
  source: string;
  target: string;
  relation: KnowledgeRelation;
  /** Optional engineering note, e.g. the condition a permissive expresses. */
  note?: LocalizedText;
}

export interface AuthoredEdge {
  source: string;
  target: string;
  relation: KnowledgeRelation;
  note?: LocalizedText;
}

/* ── Observations & fault scenarios ───────────────────────────────────────── */

/**
 * The qualitative state of one corpus node at diagnosis time.
 *
 * `state` is an engineering description, not a numeric value: the corpus is a
 * design artefact and holds no telemetry. `ABSENT` means the operator/gateway
 * could not supply this observation at all — exactly the case the reasoning
 * engine must report as missing evidence rather than assume away.
 */
export type ObservationState =
  | "TRUE"
  | "FALSE"
  | "NORMAL"
  | "ABNORMAL"
  | "STALE"
  | "ABSENT";

export interface Observation {
  /** Corpus node id this observation is about. Unknown ids are rejected. */
  nodeId: string;
  state: ObservationState;
  /** Free-form engineering detail, e.g. "F30005 reported on drive A". */
  detail?: string;
}

/** What a scenario is known to actually be. Never shown to the engine. */
export interface FaultGroundTruth {
  subsystem: Subsystem;
  faultClass: FaultClass;
  /** The FAULT_MODE node that is the true root cause. */
  faultModeId: string;
  /** Corpus nodes whose observed state genuinely supports the true cause. */
  supportingNodeIds: string[];
  /**
   * Observations a competent engineer would demand before concluding, which
   * this scenario deliberately does NOT provide. The engine is scored on
   * naming them, not on guessing their value.
   */
  expectedMissingNodeIds: string[];
  /** SAFE_ACTION nodes that are appropriate next steps. */
  expectedSafeActionIds: string[];
  /** TRUE when the situation must be escalated rather than handled in line. */
  requiresEscalation: boolean;
}

export interface FaultScenario {
  /** Corpus-unique, e.g. "TIA-01-FS-03". */
  id: string;
  title: LocalizedText;
  /** Operator-voice narrative — what a human would actually report. */
  narrative: LocalizedText;
  /** Observations available at diagnosis time. */
  observations: Observation[];
  groundTruth: FaultGroundTruth;
}

/* ── Reference system ─────────────────────────────────────────────────────── */

export interface ReferenceSystemHeader {
  /** Stable id, e.g. "TIA-01". */
  id: string;
  name: LocalizedText;
  /** Production domain, e.g. "Steel rolling / hot strip finishing". */
  domain: LocalizedText;
  sourceType: ReferenceSourceType;
  /** Engineering platform this reference is modelled on, in generic terms. */
  platform: string;
  version: string;
  revision: number;
  /**
   * Attribution of the design. Every Phase 101 reference is original synthetic
   * engineering authored for this repository; this field makes that explicit
   * in the data itself, not only in documentation.
   */
  origin: "SYNTHETIC_ORIGINAL";
}

/** A reference system exactly as authored. `defineReferenceSystem` seals it. */
export interface AuthoredReferenceSystem extends ReferenceSystemHeader {
  nodes: AuthoredNode[];
  edges: AuthoredEdge[];
  scenarios: FaultScenario[];
  /**
   * Native engineering source for this system — SCL, ladder/FBD XML, SCADA
   * scripting, HMI screen definitions. Optional so a system can be authored
   * graph-first and gain its source in a later revision, but every TIA, SCADA
   * and HMI reference in this phase carries source.
   */
  artifacts?: AuthoredSourceArtifact[];
}

/** A sealed reference system: provenance stamped, checksum computed. */
export interface ReferenceSystem extends ReferenceSystemHeader {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  scenarios: FaultScenario[];
  artifacts: SourceArtifact[];
  /** SHA-256 over the canonical form. Identity of the CONTENT, not the file. */
  checksum: string;
}

/* ── Safety helpers ───────────────────────────────────────────────────────── */

/**
 * TRUE when a node may only ever be reviewed, never acted on automatically.
 *
 * `SIS_AND_SAFETY_PLC_SCOPE=REVIEW_ONLY` is enforced here rather than at each
 * call site so a new consumer cannot forget it. `UNKNOWN` is treated as
 * review-only deliberately: an unclassified object in a safety context is a
 * reason for caution, not a reason for confidence.
 */
export function isReviewOnly(safetyClass: SafetyClass): boolean {
  return safetyClass !== "NON_SAFETY";
}

/**
 * TRUE only when a node EXPLICITLY declares that a human invokes it.
 *
 * Fail-closed by construction. Every other value — `false`, `undefined`, an
 * attribute bag that never mentions the field, a node kind that cannot be
 * invoked at all — reports `false`. The asymmetry is deliberate: treating an
 * undeclared routine as operator-driven would let an automatic script inherit
 * the authorisation story of a manual one, and `validateAuthoredSystem`
 * rejects a `REQUIRES_ROLE` edge whose source does not pass this check.
 */
export function isHumanInvokable(node: { attributes?: NodeAttributes }): boolean {
  return node.attributes?.humanInvokable === true;
}

/** Node kinds that may never be presented as an executable step. */
export const NEVER_EXECUTABLE_KINDS: readonly KnowledgeNodeKind[] = [
  "SAFE_ACTION",
  "INTERLOCK",
  "PERMISSIVE",
];
