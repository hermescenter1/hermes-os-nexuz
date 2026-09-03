/**
 * PHASE 109-C1 — the deterministic demo project.
 *
 * Everything here is SIMULATED. It is written by hand, it never touches a
 * network, a device or a clock that could drift, and it produces the same bytes
 * on every call. That determinism is not a nicety: the symbol index, the
 * cross-reference view and the validation engine are all asserted against these
 * exact contents, so a change here is a deliberate change to the test oracle.
 *
 * The SCL below is realistic engineering — a motor function block with
 * permissives, a run-feedback timeout, an overload trip and an explicit state
 * machine — because a toy example would not exercise the cross-reference engine
 * in any way worth testing. It is nonetheless DEMONSTRATION SOURCE:
 *
 *   - it is not commissioned, not reviewed against any plant,
 *   - it deliberately carries the defects the validator is meant to find,
 *   - and nothing in this product can download it anywhere.
 *
 * The seeded defects are listed at the bottom of this file so a reader never has
 * to guess which findings are intentional.
 */

import {
  contentChecksum,
  normaliseArtifactPath,
  type AutomationProject,
  type ControllerTarget,
  type EngineeringArtifact,
  type ProgramBlock,
  type ProjectVersion,
  type ProvenanceRecord,
  type SymbolDefinition,
  type SymbolReference,
  type TestScenario,
} from "./contract";

/**
 * A fixed instant. The demo project must be byte-identical on every call, so it
 * cannot read the wall clock — a `Date.now()` here would make two renders of the
 * same project disagree and would make the checksum meaningless.
 *
 * 2026-01-15T08:00:00Z.
 */
export const DEMO_EPOCH_MS = 1_768_464_000_000;

export const DEMO_PRODUCER = "local-demo-adapter";

export const DEMO_DISCLOSURE =
  "Simulated engineering data generated locally for demonstration. " +
  "No controller, historian or plant network was contacted, and nothing here " +
  "originates from real equipment.";

function provenance(
  recordedBy: string,
  origin: "simulated" | "authored" = "simulated",
): ProvenanceRecord {
  return {
    origin,
    producer: DEMO_PRODUCER,
    recordedAtEpochMs: DEMO_EPOCH_MS,
    recordedBy,
    disclosure: DEMO_DISCLOSURE,
  };
}

export const DEMO_TARGET: ControllerTarget = {
  id: "target-plc-01",
  name: "PLC_Line01",
  family: "s7-1500",
  // Factual interoperability descriptor. Not a vendor endorsement, not a claim
  // of certification, and not a statement that this project was compiled.
  descriptor: "IEC 61131-3 structured text target profile",
};

/* ── source ───────────────────────────────────────────────────────────────── */

const FB_MOTOR_SOURCE: readonly string[] = [
  "FUNCTION_BLOCK \"FB_Motor\"",
  "{ S7_Optimized_Access := 'TRUE' }",
  "VERSION : 0.1",
  "VAR_INPUT",
  "   Motor_101_StartCmd : Bool;   // operator or sequence start command",
  "   Motor_101_RunFb    : Bool;   // run feedback from the contactor",
  "   Motor_101_Overload : Bool;   // thermal overload, normally closed",
  "   Motor_101_Reset    : Bool;   // fault acknowledge",
  "   Line_01_AutoMode   : Bool;   // line is in automatic mode",
  "END_VAR",
  "VAR",
  "   State              : Int;    // 0 idle, 1 starting, 2 running, 3 faulted",
  "   RunTimer           : TON;",
  "   Motor_101_RunTimeout : Time := T#5s;  // feedback must arrive within this",
  "END_VAR",
  "VAR_OUTPUT",
  "   Motor_101_RunOut   : Bool;   // contactor output",
  "   Motor_101_Fault    : Bool;   // latched fault",
  "END_VAR",
  "",
  "BEGIN",
  "   // Permissive: the line must be in automatic mode and no overload present.",
  "   // The overload input is wired normally-closed, so TRUE means healthy.",
  "   IF NOT #Motor_101_Overload THEN",
  "      #Motor_101_Fault := TRUE;",
  "      #State := 3;",
  "   END_IF;",
  "",
  "   CASE #State OF",
  "      0:  // idle — await a start command with the line permissive",
  "         IF #Motor_101_StartCmd AND #Line_01_AutoMode THEN",
  "            #State := 1;",
  "         END_IF;",
  "",
  "      1:  // starting — energise the contactor and wait for feedback",
  "         #Motor_101_RunOut := TRUE;",
  "         #RunTimer(IN := TRUE, PT := #Motor_101_RunTimeout);",
  "         IF #Motor_101_RunFb THEN",
  "            #State := 2;",
  "         ELSIF #RunTimer.Q THEN",
  "            // Feedback never arrived: trip rather than keep the output on.",
  "            #Motor_101_RunOut := FALSE;",
  "            #Motor_101_Fault  := TRUE;",
  "            #State := 3;",
  "         END_IF;",
  "",
  "      2:  // running — drop out on stop command or feedback loss",
  "         #RunTimer(IN := FALSE, PT := #Motor_101_RunTimeout);",
  "         IF NOT #Motor_101_StartCmd OR NOT #Motor_101_RunFb THEN",
  "            #Motor_101_RunOut := FALSE;",
  "            #State := 0;",
  "         END_IF;",
  "",
  "      3:  // faulted — safe reset only, never an automatic restart",
  "         #Motor_101_RunOut := FALSE;",
  "         IF #Motor_101_Reset AND NOT #Motor_101_StartCmd THEN",
  "            #Motor_101_Fault := FALSE;",
  "            #State := 0;",
  "         END_IF;",
  "   END_CASE;",
  "END_FUNCTION_BLOCK",
];

const FB_VALVE_SOURCE: readonly string[] = [
  "FUNCTION_BLOCK \"FB_Valve\"",
  "VERSION : 0.1",
  "VAR_INPUT",
  "   Valve_201_OpenCmd  : Bool;   // open command",
  "   Line_01_AutoMode   : Bool;",
  "END_VAR",
  "VAR_OUTPUT",
  "   Valve_201_OpenOut  : Bool;",
  "END_VAR",
  "BEGIN",
  "   // NOTE (demo defect AES-C1-006): this command has no position feedback.",
  "   IF #Valve_201_OpenCmd AND #Line_01_AutoMode THEN",
  "      #Valve_201_OpenOut := TRUE;",
  "   ELSE",
  "      #Valve_201_OpenOut := FALSE;",
  "   END_IF;",
  "END_FUNCTION_BLOCK",
];

const FC_INTERLOCKS_SOURCE: readonly string[] = [
  "FUNCTION \"FC_Interlocks\" : Bool",
  "VAR_INPUT",
  "   Line_01_AutoMode   : Bool;",
  "   Motor_101_Overload : Bool;",
  "END_VAR",
  "BEGIN",
  "   // Interlock summary: healthy only when automatic and no overload.",
  "   #FC_Interlocks := #Line_01_AutoMode AND #Motor_101_Overload;",
  "   // NOTE (demo defect AES-C1-001): Line_01_EStop is referenced but never",
  "   // declared anywhere in this project.",
  "   IF NOT #Line_01_EStop THEN",
  "      #FC_Interlocks := FALSE;",
  "   END_IF;",
  "END_FUNCTION",
];

const OB1_SOURCE: readonly string[] = [
  "ORGANIZATION_BLOCK \"OB1\"",
  "BEGIN",
  "   // Cyclic execution of the line logic.",
  "   \"FB_Motor_DB\"(Motor_101_StartCmd := \"DB_Motors\".Motor_101_StartCmd,",
  "                 Motor_101_RunFb    := \"DB_Motors\".Motor_101_RunFb,",
  "                 Motor_101_Overload := \"DB_Motors\".Motor_101_Overload,",
  "                 Motor_101_Reset    := \"DB_Motors\".Motor_101_Reset,",
  "                 Line_01_AutoMode   := \"DB_Process\".Line_01_AutoMode);",
  "END_ORGANIZATION_BLOCK",
];

/* ── artifacts ────────────────────────────────────────────────────────────── */

function block(
  id: string,
  path: string,
  name: string,
  kind: ProgramBlock["kind"],
  sourceLines: readonly string[],
  modifiedBy: string,
  readOnly = false,
): ProgramBlock {
  return {
    id,
    path: normaliseArtifactPath(path),
    name,
    kind,
    version: 1,
    checksum: contentChecksum(sourceLines.join("\n")),
    modifiedAtEpochMs: DEMO_EPOCH_MS,
    modifiedBy,
    provenance: provenance(modifiedBy, "authored"),
    readOnly,
    language: kind === "program-block" ? "scl" : "none",
    sourceLines,
  };
}

function artifact(
  id: string,
  path: string,
  name: string,
  kind: EngineeringArtifact["kind"],
  modifiedBy: string,
  opts: { readOnly?: boolean; withProvenance?: boolean } = {},
): EngineeringArtifact {
  const { readOnly = false, withProvenance = true } = opts;
  return {
    id,
    path: normaliseArtifactPath(path),
    name,
    kind,
    version: 1,
    checksum: contentChecksum(`${id}:${path}:${kind}`),
    modifiedAtEpochMs: DEMO_EPOCH_MS,
    modifiedBy,
    // A single artifact deliberately lacks provenance so AES-C1-009 has
    // something real to find. See the seeded-defect list below.
    provenance: withProvenance
      ? provenance(modifiedBy)
      : (null as unknown as ProvenanceRecord),
    readOnly,
  };
}

const BLOCKS: readonly ProgramBlock[] = [
  block("blk-ob1", "PLC/ProgramBlocks/OB1.scl", "OB1", "program-block", OB1_SOURCE, "A. Fischer"),
  block("blk-fb-motor", "PLC/ProgramBlocks/FB_Motor.scl", "FB_Motor", "program-block", FB_MOTOR_SOURCE, "A. Fischer"),
  block("blk-fb-valve", "PLC/ProgramBlocks/FB_Valve.scl", "FB_Valve", "program-block", FB_VALVE_SOURCE, "S. Ahmadi"),
  block("blk-fc-interlocks", "PLC/ProgramBlocks/FC_Interlocks.scl", "FC_Interlocks", "program-block", FC_INTERLOCKS_SOURCE, "S. Ahmadi"),
];

const OTHER_ARTIFACTS: readonly EngineeringArtifact[] = [
  artifact("art-db-motors", "PLC/DataBlocks/DB_Motors.db", "DB_Motors", "data-block", "A. Fischer"),
  artifact("art-db-process", "PLC/DataBlocks/DB_Process.db", "DB_Process", "data-block", "A. Fischer"),
  artifact("art-udt-motor", "PLC/UDT/UDT_Motor.udt", "UDT_Motor", "udt", "A. Fischer"),
  artifact("art-tags", "PLC/Tags/Line01_Tags.tags", "Line01_Tags", "tag-table", "A. Fischer"),
  artifact("art-hmi-overview", "HMI/Screens/Line01_Overview.screen", "Line01_Overview", "hmi-screen", "M. Weber"),
  artifact("art-hmi-motor", "HMI/Screens/Motor_Detail.screen", "Motor_Detail", "hmi-screen", "M. Weber"),
  artifact("art-hmi-faceplate", "HMI/Faceplates/FP_Motor.faceplate", "FP_Motor", "hmi-faceplate", "M. Weber"),
  artifact("art-hmi-alarms", "HMI/Alarms/Line01_Alarms.alarms", "Line01_Alarms", "hmi-alarm", "M. Weber"),
  artifact("art-hmi-trends", "HMI/Trends/Line01_Trends.trends", "Line01_Trends", "hmi-trend", "M. Weber"),
  artifact("art-scada-area", "SCADA/Areas/Area_Packaging.area", "Area_Packaging", "scada-area", "R. Novak"),
  artifact("art-scada-historian", "SCADA/Historian/Line01_Points.historian", "Line01_Points", "scada-historian", "R. Novak"),
  // Seeded defect AES-C1-009: no provenance record.
  artifact("art-scada-report", "SCADA/Reports/Shift_Report.report", "Shift_Report", "scada-report", "R. Novak", { withProvenance: false }),
  artifact("art-test-motor", "Tests/Motor_Start_Sequence.test", "Motor_Start_Sequence", "test-scenario", "A. Fischer"),
  artifact("art-doc-functional", "Documentation/Functional_Description.md", "Functional_Description", "document", "A. Fischer", { readOnly: true }),
];

/* ── symbols ──────────────────────────────────────────────────────────────── */

function symbol(
  name: string,
  dataType: SymbolDefinition["dataType"],
  scope: SymbolDefinition["scope"],
  declaredIn: string | null,
  declaredAtLine: number | null,
  opts: { unit?: string | null; writable?: boolean; comment?: string } = {},
): SymbolDefinition {
  return {
    id: `sym-${name}`,
    name,
    dataType,
    scope,
    declaredIn,
    declaredAtLine,
    engineeringUnit: opts.unit ?? null,
    writable: opts.writable ?? true,
    comment: opts.comment ?? "",
  };
}

const SYMBOLS: readonly SymbolDefinition[] = [
  symbol("Motor_101_StartCmd", "Bool", "global", "blk-fb-motor", 5, { comment: "operator or sequence start command" }),
  symbol("Motor_101_RunFb", "Bool", "global", "blk-fb-motor", 6, { writable: false, comment: "run feedback from the contactor" }),
  symbol("Motor_101_Overload", "Bool", "global", "blk-fb-motor", 7, { writable: false, comment: "thermal overload, normally closed" }),
  symbol("Motor_101_Reset", "Bool", "global", "blk-fb-motor", 8, { comment: "fault acknowledge" }),
  symbol("Line_01_AutoMode", "Bool", "global", "blk-fb-motor", 9, { comment: "line is in automatic mode" }),
  // Seeded defect AES-C1-007: a Time quantity with no engineering unit recorded.
  symbol("Motor_101_RunTimeout", "Time", "block-local", "blk-fb-motor", 14, { unit: null, comment: "feedback must arrive within this" }),
  symbol("Motor_101_RunOut", "Bool", "global", "blk-fb-motor", 17),
  symbol("Motor_101_Fault", "Bool", "global", "blk-fb-motor", 18),
  symbol("Valve_201_OpenCmd", "Bool", "global", "blk-fb-valve", 4),
  symbol("Valve_201_OpenOut", "Bool", "global", "blk-fb-valve", 8),
  // Seeded defect AES-C1-003: declared, never referenced.
  symbol("Line_01_SpareTag", "Bool", "global", "art-tags", 12, { comment: "reserved spare" }),
  // Seeded defect AES-C1-002: the same name declared twice, in two artifacts.
  symbol("Line_01_AutoMode", "Bool", "scada", "art-scada-area", 3, { comment: "duplicate declaration in the SCADA area" }),
];

/* ── references ───────────────────────────────────────────────────────────── */

function ref(
  symbolName: string,
  artifactId: string,
  line: number,
  access: SymbolReference["access"],
  context: string,
): SymbolReference {
  return { symbolName, artifactId, line, access, context };
}

const REFERENCES: readonly SymbolReference[] = [
  // OB1 wiring
  ref("Motor_101_StartCmd", "blk-ob1", 4, "read", "Motor_101_StartCmd := \"DB_Motors\".Motor_101_StartCmd,"),
  ref("Motor_101_RunFb", "blk-ob1", 5, "read", "Motor_101_RunFb    := \"DB_Motors\".Motor_101_RunFb,"),
  ref("Motor_101_Overload", "blk-ob1", 6, "read", "Motor_101_Overload := \"DB_Motors\".Motor_101_Overload,"),
  ref("Motor_101_Reset", "blk-ob1", 7, "read", "Motor_101_Reset    := \"DB_Motors\".Motor_101_Reset,"),
  ref("Line_01_AutoMode", "blk-ob1", 8, "read", "Line_01_AutoMode   := \"DB_Process\".Line_01_AutoMode);"),

  // FB_Motor body
  ref("Motor_101_Overload", "blk-fb-motor", 23, "read", "IF NOT #Motor_101_Overload THEN"),
  ref("Motor_101_Fault", "blk-fb-motor", 24, "write", "#Motor_101_Fault := TRUE;"),
  ref("Motor_101_StartCmd", "blk-fb-motor", 30, "read", "IF #Motor_101_StartCmd AND #Line_01_AutoMode THEN"),
  ref("Line_01_AutoMode", "blk-fb-motor", 30, "read", "IF #Motor_101_StartCmd AND #Line_01_AutoMode THEN"),
  ref("Motor_101_RunOut", "blk-fb-motor", 35, "write", "#Motor_101_RunOut := TRUE;"),
  ref("Motor_101_RunTimeout", "blk-fb-motor", 36, "read", "#RunTimer(IN := TRUE, PT := #Motor_101_RunTimeout);"),
  ref("Motor_101_RunFb", "blk-fb-motor", 37, "read", "IF #Motor_101_RunFb THEN"),
  ref("Motor_101_RunOut", "blk-fb-motor", 42, "write", "#Motor_101_RunOut := FALSE;"),
  ref("Motor_101_Fault", "blk-fb-motor", 43, "write", "#Motor_101_Fault  := TRUE;"),
  ref("Motor_101_RunTimeout", "blk-fb-motor", 48, "read", "#RunTimer(IN := FALSE, PT := #Motor_101_RunTimeout);"),
  ref("Motor_101_StartCmd", "blk-fb-motor", 49, "read", "IF NOT #Motor_101_StartCmd OR NOT #Motor_101_RunFb THEN"),
  ref("Motor_101_RunFb", "blk-fb-motor", 49, "read", "IF NOT #Motor_101_StartCmd OR NOT #Motor_101_RunFb THEN"),
  ref("Motor_101_RunOut", "blk-fb-motor", 50, "write", "#Motor_101_RunOut := FALSE;"),
  ref("Motor_101_RunOut", "blk-fb-motor", 55, "write", "#Motor_101_RunOut := FALSE;"),
  ref("Motor_101_Reset", "blk-fb-motor", 56, "read", "IF #Motor_101_Reset AND NOT #Motor_101_StartCmd THEN"),
  ref("Motor_101_StartCmd", "blk-fb-motor", 56, "read", "IF #Motor_101_Reset AND NOT #Motor_101_StartCmd THEN"),
  ref("Motor_101_Fault", "blk-fb-motor", 57, "write", "#Motor_101_Fault := FALSE;"),

  // FB_Valve — a command with no feedback symbol anywhere (AES-C1-006)
  ref("Valve_201_OpenCmd", "blk-fb-valve", 12, "read", "IF #Valve_201_OpenCmd AND #Line_01_AutoMode THEN"),
  ref("Line_01_AutoMode", "blk-fb-valve", 12, "read", "IF #Valve_201_OpenCmd AND #Line_01_AutoMode THEN"),
  ref("Valve_201_OpenOut", "blk-fb-valve", 13, "write", "#Valve_201_OpenOut := TRUE;"),
  ref("Valve_201_OpenOut", "blk-fb-valve", 15, "write", "#Valve_201_OpenOut := FALSE;"),

  // FC_Interlocks — includes the undeclared symbol (AES-C1-001)
  ref("Line_01_AutoMode", "blk-fc-interlocks", 7, "read", "#FC_Interlocks := #Line_01_AutoMode AND #Motor_101_Overload;"),
  ref("Motor_101_Overload", "blk-fc-interlocks", 7, "read", "#FC_Interlocks := #Line_01_AutoMode AND #Motor_101_Overload;"),
  ref("Line_01_EStop", "blk-fc-interlocks", 10, "read", "IF NOT #Line_01_EStop THEN"),

  // HMI bindings
  ref("Motor_101_StartCmd", "art-hmi-motor", 14, "binding", "Button.Command -> Motor_101_StartCmd"),
  ref("Motor_101_RunFb", "art-hmi-motor", 15, "binding", "Indicator.State -> Motor_101_RunFb"),
  ref("Motor_101_Fault", "art-hmi-motor", 16, "binding", "Indicator.Fault -> Motor_101_Fault"),
  ref("Motor_101_RunFb", "art-hmi-overview", 22, "binding", "Tile.Motor101.Running -> Motor_101_RunFb"),
  ref("Motor_101_StartCmd", "art-hmi-faceplate", 8, "binding", "FP_Motor.StartCommand -> Motor_101_StartCmd"),
  // Seeded defect AES-C1-004: an HMI binding to a symbol no PLC block declares.
  ref("Motor_102_RunFb", "art-hmi-overview", 23, "binding", "Tile.Motor102.Running -> Motor_102_RunFb"),

  // Alarms — one seeded without a priority (AES-C1-005)
  ref("Motor_101_Fault", "art-hmi-alarms", 5, "alarm", "ALARM Motor_101_Fault priority=2 \"Motor 101 fault\""),
  ref("Motor_101_Overload", "art-hmi-alarms", 6, "alarm", "ALARM Motor_101_Overload \"Motor 101 overload\""),

  // SCADA
  ref("Line_01_AutoMode", "art-scada-area", 9, "binding", "Area.Mode -> Line_01_AutoMode"),
  ref("Motor_101_RunFb", "art-scada-historian", 11, "binding", "Point.Motor101Run -> Motor_101_RunFb"),
  // Seeded defect AES-C1-008: a write to a symbol declared read-only.
  ref("Motor_101_RunFb", "art-scada-area", 12, "write", "Area.Override.Motor101Run := TRUE"),
];

/* ── versions and tests ───────────────────────────────────────────────────── */

export const DEMO_BASELINE_VERSION: ProjectVersion = {
  id: "ver-baseline",
  label: "v1.0.0-commissioned",
  approval: "commissioned",
  author: "A. Fischer",
  createdAtEpochMs: DEMO_EPOCH_MS - 86_400_000 * 30,
  modifiedArtifactIds: [],
  summaryKey: "versions.summary.baseline",
};

export const DEMO_WORKING_VERSION: ProjectVersion = {
  id: "ver-working",
  label: "v1.1.0-draft",
  approval: "draft",
  author: "S. Ahmadi",
  createdAtEpochMs: DEMO_EPOCH_MS,
  modifiedArtifactIds: ["blk-fb-valve", "blk-fc-interlocks", "art-hmi-overview"],
  summaryKey: "versions.summary.working",
};

const DEMO_REVIEWED_VERSION: ProjectVersion = {
  id: "ver-reviewed",
  label: "v1.0.1-reviewed",
  approval: "reviewed",
  author: "M. Weber",
  createdAtEpochMs: DEMO_EPOCH_MS - 86_400_000 * 7,
  modifiedArtifactIds: ["art-hmi-motor"],
  summaryKey: "versions.summary.reviewed",
};

export const DEMO_VERSIONS: readonly ProjectVersion[] = [
  DEMO_BASELINE_VERSION,
  DEMO_REVIEWED_VERSION,
  DEMO_WORKING_VERSION,
];

export const DEMO_TESTS: readonly TestScenario[] = [
  {
    id: "test-start",
    name: "Motor_Start_Sequence",
    description: "tests.motorStart",
    status: "passed",
    coveredSymbols: ["Motor_101_StartCmd", "Motor_101_RunFb", "Motor_101_RunOut"],
  },
  {
    id: "test-timeout",
    name: "Motor_Feedback_Timeout",
    description: "tests.motorTimeout",
    status: "failed",
    coveredSymbols: ["Motor_101_RunFb", "Motor_101_RunTimeout", "Motor_101_Fault"],
  },
  {
    id: "test-interlock",
    name: "Line_Interlock_Summary",
    description: "tests.interlock",
    status: "not-run",
    coveredSymbols: ["Line_01_AutoMode", "Motor_101_Overload"],
  },
];

/* ── the project ──────────────────────────────────────────────────────────── */

export function buildDemoProject(): AutomationProject {
  return {
    id: "proj-plant-alpha",
    name: "Plant Alpha",
    site: "Line 01 — Packaging",
    target: DEMO_TARGET,
    artifacts: [...BLOCKS, ...OTHER_ARTIFACTS],
    blocks: BLOCKS,
    symbols: SYMBOLS,
    references: REFERENCES,
    provenance: provenance(DEMO_PRODUCER),
  };
}

/**
 * The defects deliberately seeded into the demo project, so a reader never has
 * to guess whether a finding is a bug in the validator or the point of the
 * fixture. Each is asserted by name in the validation tests.
 *
 *   AES-C1-001  Line_01_EStop is referenced in FC_Interlocks, declared nowhere
 *   AES-C1-002  Line_01_AutoMode is declared twice (FB_Motor and SCADA area)
 *   AES-C1-003  Line_01_SpareTag is declared and never referenced
 *   AES-C1-004  Motor_102_RunFb is bound on an HMI screen with no PLC symbol
 *   AES-C1-005  the Motor_101_Overload alarm carries no priority
 *   AES-C1-006  Valve_201_OpenCmd commands an output with no feedback symbol
 *   AES-C1-007  Motor_101_RunTimeout is a Time quantity with no unit recorded
 *   AES-C1-008  the SCADA area writes Motor_101_RunFb, declared read-only
 *   AES-C1-009  Shift_Report carries no provenance record
 *
 * Two codes are expected to find NOTHING here, and that is deliberate: a
 * baseline in which every rule fires proves nothing about the rules that pass.
 *
 *   AES-C1-010  every simulated artifact does carry a disclosure
 *   AES-C1-011  no artifact claims a live origin
 */
export const SEEDED_DEFECT_CODES = [
  "AES-C1-001",
  "AES-C1-002",
  "AES-C1-003",
  "AES-C1-004",
  "AES-C1-005",
  "AES-C1-006",
  "AES-C1-007",
  "AES-C1-008",
  "AES-C1-009",
] as const;

export const EXPECTED_PASSING_CODES = ["AES-C1-010", "AES-C1-011"] as const;
