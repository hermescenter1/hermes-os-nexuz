/**
 * PHASE 109-C1 — Automation Engineering Studio: domain contract.
 *
 * This module is the stable core of the Studio and it is deliberately free of
 * React, of `next-intl`, of formatting and of any I/O. Everything here is data
 * and pure predicates, so the same model can be driven by the current local
 * demo adapter and, later, by an import adapter without the UI noticing.
 *
 * Two rules shape the whole file:
 *
 *   1. Values carry raw instants (`epochMs`) and locale-independent data. A
 *      `Date` rendered through a locale is a PRESENTATION concern; putting it in
 *      the domain would make the model's identity depend on who is looking.
 *   2. `DataOrigin` is a closed union and the live members are rejected at
 *      runtime in Round 1. The boundary between simulated and live data is the
 *      single most consequential thing this product asserts, so it is enforced
 *      by a function rather than by a convention.
 */

/* ── origin and mode ──────────────────────────────────────────────────────── */

/**
 * Where a value came from. Closed union: adding a member is a deliberate
 * product decision, not an accident of an incoming payload.
 */
export type DataOrigin =
  | "simulated"
  | "imported"
  | "authored"
  | "live-readonly"
  | "live-controlled";

export const ALL_DATA_ORIGINS: readonly DataOrigin[] = [
  "simulated",
  "imported",
  "authored",
  "live-readonly",
  "live-controlled",
] as const;

/**
 * The origins Round 1 permits. `imported` is modelled but not yet produced by
 * any adapter, so it is not permitted either — permitting a shape nothing can
 * create would make the guard untestable.
 */
export const PERMITTED_ORIGINS_ROUND_1: readonly DataOrigin[] = [
  "simulated",
  "authored",
] as const;

/** Origins that describe a connection to real equipment. Never permitted here. */
export const LIVE_ORIGINS: readonly DataOrigin[] = [
  "live-readonly",
  "live-controlled",
] as const;

export function isLiveOrigin(origin: DataOrigin): boolean {
  return (LIVE_ORIGINS as readonly string[]).includes(origin);
}

export function isPermittedOrigin(origin: DataOrigin): boolean {
  return (PERMITTED_ORIGINS_ROUND_1 as readonly string[]).includes(origin);
}

/**
 * Fail closed. Anything that is not explicitly permitted is refused, including
 * a value that is not a member of the union at all — which is what an untrusted
 * payload would look like.
 */
export function assertPermittedOrigin(origin: DataOrigin): DataOrigin {
  if (!isPermittedOrigin(origin)) {
    throw new AutomationStudioOriginError(origin);
  }
  return origin;
}

export class AutomationStudioOriginError extends Error {
  readonly origin: string;
  constructor(origin: string) {
    super(
      `[automation-studio] origin "${origin}" is not permitted. Round 1 is a ` +
        `simulation workspace: no live controller connection exists, and no ` +
        `artifact may claim one.`,
    );
    this.name = "AutomationStudioOriginError";
    this.origin = origin;
  }
}

/** How the workspace as a whole is operating. */
export type WorkspaceMode = "simulation" | "review" | "read-only";

/* ── provenance ───────────────────────────────────────────────────────────── */

export interface ProvenanceRecord {
  readonly origin: DataOrigin;
  /** Stable identifier of the producing adapter, e.g. "local-demo-adapter". */
  readonly producer: string;
  /** Raw instant. Formatting belongs to the view. */
  readonly recordedAtEpochMs: number;
  /** Display name of the responsible engineer, or the adapter for generated data. */
  readonly recordedBy: string;
  /**
   * Free-text statement of what this data is NOT. Present so a reader who sees
   * only the provenance record still cannot mistake demo data for plant data.
   */
  readonly disclosure: string;
}

/* ── controller and project ───────────────────────────────────────────────── */

export type ControllerFamily = "s7-1200" | "s7-1500" | "generic-iec-61131";

export interface ControllerTarget {
  readonly id: string;
  readonly name: string;
  readonly family: ControllerFamily;
  /** Factual descriptor, never a vendor endorsement claim. */
  readonly descriptor: string;
}

export type ArtifactKind =
  | "program-block"
  | "data-block"
  | "udt"
  | "tag-table"
  | "hmi-screen"
  | "hmi-faceplate"
  | "hmi-alarm"
  | "hmi-trend"
  | "scada-area"
  | "scada-historian"
  | "scada-report"
  | "test-scenario"
  | "document";

export type BlockLanguage = "scl" | "ladder" | "fbd" | "none";

export interface EngineeringArtifact {
  /** Stable across sessions: derived from the project definition, not order. */
  readonly id: string;
  /** Normalised POSIX-style path inside the project. Never absolute. */
  readonly path: string;
  readonly name: string;
  readonly kind: ArtifactKind;
  readonly version: number;
  /** Deterministic content checksum. */
  readonly checksum: string;
  readonly modifiedAtEpochMs: number;
  readonly modifiedBy: string;
  readonly provenance: ProvenanceRecord;
  readonly readOnly: boolean;
}

export interface ProgramBlock extends EngineeringArtifact {
  readonly kind: "program-block" | "data-block" | "udt";
  readonly language: BlockLanguage;
  /** Source lines WITHOUT line numbers. The view supplies numbering. */
  readonly sourceLines: readonly string[];
}

export interface AutomationProject {
  readonly id: string;
  readonly name: string;
  readonly site: string;
  readonly target: ControllerTarget;
  readonly artifacts: readonly EngineeringArtifact[];
  readonly blocks: readonly ProgramBlock[];
  readonly symbols: readonly SymbolDefinition[];
  readonly references: readonly SymbolReference[];
  readonly provenance: ProvenanceRecord;
}

/* ── symbols ──────────────────────────────────────────────────────────────── */

export type SymbolDataType =
  | "Bool"
  | "Int"
  | "DInt"
  | "Real"
  | "Time"
  | "String"
  | "Struct";

export type SymbolScope = "global" | "block-local" | "hmi" | "scada";

export type SymbolAccess = "read" | "write" | "binding" | "alarm";

export interface SymbolDefinition {
  readonly id: string;
  readonly name: string;
  readonly dataType: SymbolDataType;
  readonly scope: SymbolScope;
  /** Artifact id where the symbol is declared, or null when undeclared. */
  readonly declaredIn: string | null;
  readonly declaredAtLine: number | null;
  /** Engineering unit, when the value is a physical or time quantity. */
  readonly engineeringUnit: string | null;
  readonly writable: boolean;
  readonly comment: string;
}

export interface SymbolReference {
  readonly symbolName: string;
  readonly artifactId: string;
  readonly line: number;
  readonly access: SymbolAccess;
  /** The literal source text of the referencing line, for display. */
  readonly context: string;
}

/* ── diagnostics ──────────────────────────────────────────────────────────── */

export type DiagnosticSeverity = "error" | "warning" | "info";

/**
 * Stable finding codes. These are a contract: a code never changes meaning, and
 * a retired code is never reused. The UI must not hard-code any finding — it
 * renders what the engine returns.
 */
export const DIAGNOSTIC_CODES = {
  UNRESOLVED_SYMBOL: "AES-C1-001",
  DUPLICATE_SYMBOL: "AES-C1-002",
  UNUSED_SYMBOL: "AES-C1-003",
  HMI_BINDING_WITHOUT_PLC_SYMBOL: "AES-C1-004",
  ALARM_WITHOUT_PRIORITY: "AES-C1-005",
  COMMAND_WITHOUT_FEEDBACK: "AES-C1-006",
  QUANTITY_WITHOUT_UNIT: "AES-C1-007",
  WRITE_TO_READ_ONLY_SYMBOL: "AES-C1-008",
  ARTIFACT_WITHOUT_PROVENANCE: "AES-C1-009",
  SIMULATED_VALUE_WITHOUT_DISCLOSURE: "AES-C1-010",
  FORBIDDEN_LIVE_ORIGIN: "AES-C1-011",
} as const;

export type DiagnosticCode =
  (typeof DIAGNOSTIC_CODES)[keyof typeof DIAGNOSTIC_CODES];

export const ALL_DIAGNOSTIC_CODES: readonly DiagnosticCode[] =
  Object.values(DIAGNOSTIC_CODES);

export interface DiagnosticFinding {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  /**
   * Translation key suffix inside the `automationStudio.diagnostics` namespace.
   * The engine never returns display text: findings must be renderable in three
   * locales, so the message is resolved by the view.
   */
  readonly messageKey: string;
  /** Values interpolated into the message. Identifiers, never prose. */
  readonly params: Readonly<Record<string, string>>;
  readonly artifactId: string | null;
  readonly artifactPath: string | null;
  readonly line: number | null;
  readonly symbolName: string | null;
}

export interface ValidationRun {
  readonly runAtEpochMs: number;
  readonly findings: readonly DiagnosticFinding[];
  readonly checkedArtifacts: number;
  readonly checkedSymbols: number;
  readonly checkedReferences: number;
  /** Codes that were evaluated and produced nothing — the green checks. */
  readonly passedCodes: readonly DiagnosticCode[];
}

/* ── tests, versions, workspace ───────────────────────────────────────────── */

export type TestScenarioStatus = "passed" | "failed" | "not-run";

export interface TestScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: TestScenarioStatus;
  readonly coveredSymbols: readonly string[];
}

export type ApprovalState = "draft" | "reviewed" | "approved" | "commissioned";

export const EDITABLE_APPROVAL_STATES: readonly ApprovalState[] = ["draft"];

export function isEditableApprovalState(state: ApprovalState): boolean {
  return (EDITABLE_APPROVAL_STATES as readonly string[]).includes(state);
}

export interface ProjectVersion {
  readonly id: string;
  readonly label: string;
  readonly approval: ApprovalState;
  readonly author: string;
  readonly createdAtEpochMs: number;
  /** Artifact ids that differ from the baseline. */
  readonly modifiedArtifactIds: readonly string[];
  /** One-line semantic summary. Locale-independent: a key, not prose. */
  readonly summaryKey: string;
}

export interface EngineeringWorkspace {
  readonly project: AutomationProject;
  readonly mode: WorkspaceMode;
  readonly baselineVersion: ProjectVersion;
  readonly workingVersion: ProjectVersion;
  readonly versions: readonly ProjectVersion[];
  readonly tests: readonly TestScenario[];
  readonly liveConnection: null;
}

/* ── path safety ──────────────────────────────────────────────────────────── */

/** Hard bounds. A project outside these is refused rather than rendered. */
export const PROJECT_LIMITS = {
  maxArtifacts: 5_000,
  maxPathSegments: 24,
  maxPathLength: 512,
  maxSourceLines: 20_000,
  maxSearchQueryLength: 128,
} as const;

export class AutomationStudioPathError extends Error {
  readonly path: string;
  constructor(path: string, reason: string) {
    super(`[automation-studio] rejected artifact path: ${reason}`);
    this.name = "AutomationStudioPathError";
    this.path = path;
  }
}

/**
 * Normalise an artifact path, or refuse it.
 *
 * Refusal rather than sanitisation is the point: silently rewriting
 * `../../etc/passwd` into something harmless hides the fact that something
 * produced it. A traversal attempt is a finding, not a formatting problem.
 */
export function normaliseArtifactPath(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new AutomationStudioPathError(String(raw), "empty path");
  }
  if (raw.length > PROJECT_LIMITS.maxPathLength) {
    throw new AutomationStudioPathError(raw, "path exceeds the length limit");
  }
  if (raw.includes("\0")) {
    throw new AutomationStudioPathError(raw, "path contains a NUL byte");
  }
  const unified = raw.replace(/\\/g, "/");
  if (unified.startsWith("/")) {
    throw new AutomationStudioPathError(raw, "absolute paths are not accepted");
  }
  if (/^[A-Za-z]:/.test(unified)) {
    throw new AutomationStudioPathError(raw, "drive-qualified paths are not accepted");
  }
  const segments = unified.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    throw new AutomationStudioPathError(raw, "path has no segments");
  }
  if (segments.length > PROJECT_LIMITS.maxPathSegments) {
    throw new AutomationStudioPathError(raw, "path is nested too deeply");
  }
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new AutomationStudioPathError(raw, "path contains a traversal segment");
    }
  }
  return segments.join("/");
}

/** Deterministic, dependency-free checksum. Not a security primitive. */
export function contentChecksum(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}
