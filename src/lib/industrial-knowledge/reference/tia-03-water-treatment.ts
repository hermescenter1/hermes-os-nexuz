// PHASE 101 — TIA-03: water treatment and reverse-osmosis skid.
//
// ORIGIN
// Original synthetic engineering reference authored for this repository. It
// contains no customer, proprietary or licensed vendor project material.
//
// WHAT IS *NOT* CLAIMED
// The SCL below is real, readable IEC 61131-3 / Siemens-dialect source text and
// the FBD artefact is a real structured XML description. Neither was produced,
// compiled, downloaded or validated by TIA Portal or any other vendor
// engineering tool, and this repository ships no `.apXX` / `.zapXX` archive and
// no vendor binary. Producing one requires licensed Windows tooling that is not
// available here, and that limitation is reported rather than papered over.
//
// WHAT THIS REFERENCE EXERCISES THAT TIA-01 AND TIA-02 DO NOT
//   - A COMPLETE block architecture rather than a slice: a cyclic OB and a
//     startup OB, four function blocks, three functions, four data blocks and
//     four user-defined types, each declared in source the extractor actually
//     parses and each cross-checked against the graph.
//   - Signal VALIDATION as its own layer. A measurement outside the physical
//     range of its instrument is not "low", it is unknown — and every permissive
//     downstream is derived from the validated value, never the raw one.
//   - Duty/standby changeover with an explicit "no standby available" outcome,
//     so the corpus can express the difference between a pump that tripped and
//     a skid that has nothing left to run on.
//
// SAFETY CONTRACT — enforced structurally
//   - Hermes is diagnostic and advisory only: no live control, no PLC
//     connection, no chemical dosing, no CIP execution.
//   - The program READS every interlock and writes none. There is no automatic
//     restart: a trip drops the sequence to its idle step and leaves it there,
//     and the startup block deliberately re-initialises state WITHOUT clearing a
//     latched trip.
//   - The CIP / chemical subsystem is monitored only. Its objects are
//     safety-classified, nothing commands, writes or actuates them, and every
//     action touching them is review-only or escalate-only.
//   - ROLE and AUDIT_EVENT_TYPE never enter a diagnostic traversal.

import type { AuthoredReferenceSystem } from "../types";
import { authoring, chainStates, t } from "./_authoring";

const a = authoring({
  projectId: "TIA-03",
  subsystem: "RO_SKID_A",
  domain: "CONTROL_LOGIC",
});

/* ── Identifiers ──────────────────────────────────────────────────────────── */

const D = {
  cpu: a.id("DEVICE", "CPU_1516F"),
  io: a.id("DEVICE", "ET200SP_IO"),
  panel: a.id("DEVICE", "HMI_PANEL"),
  vfd: a.id("DEVICE", "VFD_HP_PUMP"),
  analyser: a.id("DEVICE", "CONDUCTIVITY_ANALYSER"),
  pnSwitch: a.id("DEVICE", "PROFINET_SWITCH"),
};

const EQ = {
  rawTank: a.id("EQUIPMENT", "RAW_WATER_TANK"),
  feedP1: a.id("EQUIPMENT", "FEED_PUMP_P1"),
  feedP2: a.id("EQUIPMENT", "FEED_PUMP_P2"),
  mmFilter: a.id("EQUIPMENT", "MULTIMEDIA_FILTER"),
  cartridge: a.id("EQUIPMENT", "CARTRIDGE_FILTER"),
  hpPump: a.id("EQUIPMENT", "HIGH_PRESSURE_PUMP"),
  roStage1: a.id("EQUIPMENT", "RO_STAGE_1"),
  roStage2: a.id("EQUIPMENT", "RO_STAGE_2"),
  permeateTank: a.id("EQUIPMENT", "PERMEATE_TANK"),
  rejectLine: a.id("EQUIPMENT", "REJECT_LINE"),
  cipSkid: a.id("EQUIPMENT", "CIP_CHEMICAL_SKID"),
  valveMatrix: a.id("EQUIPMENT", "VALVE_MATRIX"),
};

/** The declared block architecture. Every one of these is a real SCL unit. */
const B = {
  obMain: a.id("PLC_BLOCK", "OB_MAIN"),
  obStartup: a.id("PLC_BLOCK", "OB_STARTUP"),
  fbAnalog: a.id("PLC_BLOCK", "FB_ANALOG_VALIDATION"),
  fbPump: a.id("PLC_BLOCK", "FB_PUMP_SUPERVISION"),
  fbValve: a.id("PLC_BLOCK", "FB_VALVE_SUPERVISION"),
  fbSequence: a.id("PLC_BLOCK", "FB_RO_SEQUENCE"),
  fcScale: a.id("PLC_BLOCK", "FC_SCALE_ANALOG"),
  fcQuality: a.id("PLC_BLOCK", "FC_QUALITY_CALC"),
  fcKpi: a.id("PLC_BLOCK", "FC_KPI_CALC"),
  dbInstance: a.id("PLC_BLOCK", "DB_INSTANCE"),
  dbConfig: a.id("PLC_BLOCK", "DB_CONFIG"),
  dbAlarms: a.id("PLC_BLOCK", "DB_ALARMS"),
  dbRecipe: a.id("PLC_BLOCK", "DB_RECIPE"),
  udtPump: a.id("PLC_BLOCK", "UDT_PUMP"),
  udtValve: a.id("PLC_BLOCK", "UDT_VALVE"),
  udtAnalog: a.id("PLC_BLOCK", "UDT_ANALOG"),
  udtSeqState: a.id("PLC_BLOCK", "UDT_SEQ_STATE"),
};

/** The controller process image. Every symbol the SCL names lives here. */
const T = {
  /* Sequence and mode state */
  seqStep: a.id("TAG", "SEQ_STEP"),
  skidRunning: a.id("TAG", "SKID_RUNNING"),
  divertActive: a.id("TAG", "DIVERT_ACTIVE"),
  dutySelect: a.id("TAG", "DUTY_SELECT"),
  alarmWord: a.id("TAG", "ALARM_WORD"),
  startRequest: a.id("TAG", "START_REQUEST"),
  stopRequest: a.id("TAG", "STOP_REQUEST"),
  modeAuto: a.id("TAG", "MODE_AUTO"),
  modeRemote: a.id("TAG", "MODE_REMOTE"),
  /* Raw channels and scaled values */
  feedPressureRaw: a.id("TAG", "FEED_PRESSURE_RAW"),
  rawLevelRaw: a.id("TAG", "RAW_TANK_LEVEL_RAW"),
  permeateCondRaw: a.id("TAG", "PERMEATE_COND_RAW"),
  feedPressure: a.id("TAG", "FEED_PRESSURE"),
  rawTankLevel: a.id("TAG", "RAW_TANK_LEVEL"),
  permeateConductivity: a.id("TAG", "PERMEATE_CONDUCTIVITY"),
  /* Validation */
  feedPressureValid: a.id("TAG", "FEED_PRESSURE_VALID"),
  feedPressureValidPrev: a.id("TAG", "FEED_PRESSURE_VALID_PREV"),
  rawLevelValid: a.id("TAG", "RAW_LEVEL_VALID"),
  permeateCondValid: a.id("TAG", "PERMEATE_COND_VALID"),
  analogRecoveryCount: a.id("TAG", "ANALOG_RECOVERY_COUNT"),
  /* Feed pumps */
  p1Running: a.id("TAG", "P1_RUNNING"),
  p1Fault: a.id("TAG", "P1_FAULT"),
  p1FaultPrev: a.id("TAG", "P1_FAULT_PREV"),
  p1Demand: a.id("TAG", "P1_DEMAND"),
  p2Running: a.id("TAG", "P2_RUNNING"),
  p2Available: a.id("TAG", "P2_AVAILABLE"),
  p2Demand: a.id("TAG", "P2_DEMAND"),
  pumpHoursDuty: a.id("TAG", "PUMP_HOURS_DUTY"),
  /* Filtration */
  mmfDp: a.id("TAG", "MMF_DIFF_PRESSURE"),
  cartridgeDp: a.id("TAG", "CARTRIDGE_DIFF_PRESSURE"),
  backwashActive: a.id("TAG", "MMF_BACKWASH_ACTIVE"),
  /* High pressure and RO */
  hpPumpRunning: a.id("TAG", "HP_PUMP_RUNNING"),
  hpPumpFault: a.id("TAG", "HP_PUMP_FAULT"),
  hpPressure: a.id("TAG", "HP_DISCHARGE_PRESSURE"),
  hpPumpPower: a.id("TAG", "HP_PUMP_POWER"),
  stage1Pressure: a.id("TAG", "RO_STAGE1_PRESSURE"),
  stage2Pressure: a.id("TAG", "RO_STAGE2_PRESSURE"),
  permeateFlow: a.id("TAG", "PERMEATE_FLOW"),
  rejectFlow: a.id("TAG", "REJECT_FLOW"),
  feedFlow: a.id("TAG", "FEED_FLOW"),
  feedConductivity: a.id("TAG", "FEED_CONDUCTIVITY"),
  permeateQualityOk: a.id("TAG", "PERMEATE_QUALITY_OK"),
  saltRejection: a.id("TAG", "SALT_REJECTION"),
  /* Valve matrix */
  vHpDemand: a.id("TAG", "V_HP_DEMAND"),
  vHpOpenFb: a.id("TAG", "V_HP_OPEN_FB"),
  vInletOpenFb: a.id("TAG", "V_INLET_OPEN_FB"),
  vFlushOpenFb: a.id("TAG", "V_FLUSH_OPEN_FB"),
  valveMatrixReady: a.id("TAG", "VALVE_MATRIX_READY"),
  /* CIP and chemical — monitored only */
  cipChemFlow: a.id("TAG", "CIP_CHEM_FLOW"),
  cipTankLevel: a.id("TAG", "CIP_TANK_LEVEL"),
  /* Counters */
  prodCountM3: a.id("TAG", "PROD_COUNT_M3"),
  recoveryPct: a.id("TAG", "RECOVERY_PCT"),
  specificEnergy: a.id("TAG", "SPECIFIC_ENERGY"),
  /* Communications */
  pnLinkOk: a.id("TAG", "PN_LINK_OK"),
  telemetryAge: a.id("TAG", "TELEMETRY_AGE"),
  dataStale: a.id("TAG", "DATA_STALE"),
  /* Alarm bits the program sets */
  almAnalogInvalid: a.id("TAG", "ALM_ANALOG_INVALID"),
  almDutyPumpTrip: a.id("TAG", "ALM_DUTY_PUMP_TRIP"),
  almNoStandbyPump: a.id("TAG", "ALM_NO_STANDBY_PUMP"),
  almValveDiscrepancy: a.id("TAG", "ALM_VALVE_DISCREPANCY"),
  almCipLockout: a.id("TAG", "ALM_CIP_LOCKOUT"),
  almPermeateQuality: a.id("TAG", "ALM_PERMEATE_QUALITY"),
  almCommsLost: a.id("TAG", "ALM_COMMS_LOST"),
  almFilterDp: a.id("TAG", "ALM_FILTER_DP_HIGH"),
};

const IO = {
  feedPressureAi: a.id("IO_POINT", "AI_FEED_PRESSURE"),
  rawLevelAi: a.id("IO_POINT", "AI_RAW_TANK_LEVEL"),
  permeateCondAi: a.id("IO_POINT", "AI_PERMEATE_CONDUCTIVITY"),
  cartridgeDpAi: a.id("IO_POINT", "AI_CARTRIDGE_DIFF_PRESSURE"),
  p1FaultDi: a.id("IO_POINT", "DI_P1_FAULT"),
  vHpOpenDi: a.id("IO_POINT", "DI_V_HP_OPEN"),
};

const SQ = a.id("SEQUENCE", "RO_PRODUCTION_SEQUENCE");
const S = {
  idle: a.id("STATE", "R00_IDLE"),
  permissive: a.id("STATE", "R10_PERMISSIVE_CHECK"),
  pressurise: a.id("STATE", "R20_PRESSURISE"),
  produce: a.id("STATE", "R30_PRODUCE"),
  flush: a.id("STATE", "R40_FLUSH"),
  stop: a.id("STATE", "R50_STOP"),
};

const AQ = a.id("SEQUENCE", "ALARM_LIFECYCLE");
const AS = {
  normal: a.id("STATE", "AL00_NORMAL"),
  unack: a.id("STATE", "AL10_UNACK_ALARM"),
  acked: a.id("STATE", "AL20_ACK_ALARM"),
  rtnUnack: a.id("STATE", "AL30_RTN_UNACK"),
};

const P = {
  feedAvailable: a.id("PERMISSIVE", "PRM_FEED_AVAILABLE"),
  feedPressureOk: a.id("PERMISSIVE", "PRM_FEED_PRESSURE_OK"),
  valvesReady: a.id("PERMISSIVE", "PRM_VALVES_READY"),
  qualityOk: a.id("PERMISSIVE", "PRM_QUALITY_OK"),
};

const I = {
  lowSuction: a.id("INTERLOCK", "ILK_LOW_SUCTION"),
  hpOverpressure: a.id("INTERLOCK", "ILK_HP_OVERPRESSURE"),
  cipActive: a.id("INTERLOCK", "ILK_CIP_ACTIVE"),
};

const AL = {
  analogInvalid: a.id("ALARM", "ALM_ANALOG_SIGNAL_INVALID"),
  dutyPumpTrip: a.id("ALARM", "ALM_DUTY_PUMP_TRIPPED"),
  noStandby: a.id("ALARM", "ALM_NO_STANDBY_AVAILABLE"),
  filterDp: a.id("ALARM", "ALM_CARTRIDGE_DP_HIGH"),
  valveDiscrepancy: a.id("ALARM", "ALM_VALVE_POSITION_DISCREPANCY"),
  permeateQuality: a.id("ALARM", "ALM_PERMEATE_QUALITY_LOW"),
  commsLost: a.id("ALARM", "ALM_PROFINET_COMMS_LOST"),
  cipLockout: a.id("ALARM", "ALM_CIP_LOCKOUT_ACTIVE"),
  skidInLocal: a.id("ALARM", "ALM_SKID_IN_LOCAL"),
};

const K = {
  production: a.id("KPI", "KPI_PRODUCTION_VOLUME"),
  recovery: a.id("KPI", "KPI_RECOVERY"),
  specificEnergy: a.id("KPI", "KPI_SPECIFIC_ENERGY"),
  quality: a.id("KPI", "KPI_SALT_REJECTION"),
};

const EV = {
  processTrend: a.id("EVIDENCE_SOURCE", "HIST_PROCESS_TREND"),
  qualityTrend: a.id("EVIDENCE_SOURCE", "HIST_QUALITY_TREND"),
  pumpEventLog: a.id("EVIDENCE_SOURCE", "HIST_PUMP_EVENT_LOG"),
  cpuDiagnostics: a.id("EVIDENCE_SOURCE", "HIST_CPU_DIAGNOSTIC_BUFFER"),
  seqLog: a.id("EVIDENCE_SOURCE", "HIST_SEQUENCE_LOG"),
  auditLog: a.id("EVIDENCE_SOURCE", "HIST_OPERATOR_AUDIT_LOG"),
};

const FM = {
  levelTxFailure: a.id("FAULT_MODE", "FM_FEED_LEVEL_TX_FAILURE"),
  dutyPumpTrip: a.id("FAULT_MODE", "FM_DUTY_PUMP_DRIVE_TRIP"),
  standbyUnavailable: a.id("FAULT_MODE", "FM_STANDBY_PUMP_UNAVAILABLE"),
  cartridgeFouling: a.id("FAULT_MODE", "FM_CARTRIDGE_FILTER_FOULING"),
  valveDiscrepancy: a.id("FAULT_MODE", "FM_HP_VALVE_POSITION_DISCREPANCY"),
  membraneQuality: a.id("FAULT_MODE", "FM_MEMBRANE_SALT_PASSAGE"),
  commsLoss: a.id("FAULT_MODE", "FM_PROFINET_COMMS_LOSS"),
  cipInterlock: a.id("FAULT_MODE", "FM_CIP_INTERLOCK_ACTIVE"),
  leftInLocal: a.id("FAULT_MODE", "FM_SKID_LEFT_IN_LOCAL"),
};

const SA = {
  levelCompare: a.id("SAFE_ACTION", "SA_COMPARE_LEVEL_TO_SIGHT_GLASS"),
  pumpHistory: a.id("SAFE_ACTION", "SA_READ_FEED_PUMP_FAULT_HISTORY"),
  standbyCheck: a.id("SAFE_ACTION", "SA_VERIFY_STANDBY_PUMP_READINESS"),
  cartridgeInspect: a.id("SAFE_ACTION", "SA_INSPECT_AND_REPLACE_CARTRIDGE_ELEMENTS"),
  valveInspect: a.id("SAFE_ACTION", "SA_INSPECT_HP_VALVE_ACTUATOR_AND_FEEDBACK"),
  membraneReview: a.id("SAFE_ACTION", "SA_REVIEW_MEMBRANE_PERFORMANCE_TREND"),
  pnDiagnostics: a.id("SAFE_ACTION", "SA_VERIFY_PROFINET_AND_CPU_DIAGNOSTICS"),
  cipReview: a.id("SAFE_ACTION", "SA_ESCALATE_CIP_CHEMICAL_REVIEW"),
  auditReview: a.id("SAFE_ACTION", "SA_REVIEW_OPERATOR_AUDIT_LOG"),
};

/* ── Native engineering source ────────────────────────────────────────────── */

const OB_STARTUP_SCL = `ORGANIZATION_BLOCK "OB_STARTUP"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// OB100 — startup / initialisation.
//
// DETERMINISTIC INITIALISATION
// Every piece of state the cyclic program depends on is given a known value
// here, so a warm start can never leave the sequence sitting in a step whose
// entry conditions were never evaluated in this power cycle.
//
// WHAT IS DELIBERATELY *NOT* DONE
// No latched trip is cleared and nothing is started. Returning the skid to
// production after a trip or after communications recover is an operator act on
// this controller; the program does not perform it, here or anywhere else.
BEGIN
   "SEQ_STEP" := 0;
   "SKID_RUNNING" := FALSE;
   "DIVERT_ACTIVE" := TRUE;
   "DUTY_SELECT" := 1;
   "ALARM_WORD" := 0;
END_ORGANIZATION_BLOCK
`;

const OB_MAIN_SCL = `ORGANIZATION_BLOCK "OB_MAIN"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// OB1 — cyclic entry point.
VAR_TEMP
   cycleOk : Bool;
END_VAR

BEGIN
   // Order matters and is stated here rather than left to block numbering.
   // Signals are validated before anything reasons about them, then supervision
   // runs, then the sequence, then the calculated counters. A sequence that ran
   // before validation would act on a value the same scan had already judged
   // untrustworthy.
   "FB_ANALOG_VALIDATION"();
   "FB_PUMP_SUPERVISION"();
   "FB_VALVE_SUPERVISION"();
   "FB_RO_SEQUENCE"();
   "FC_KPI_CALC"();
END_ORGANIZATION_BLOCK
`;

const FB_ANALOG_VALIDATION_SCL = `FUNCTION_BLOCK "FB_ANALOG_VALIDATION"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Signal validation and the permissives derived from it.
VAR
   invalidCycles : Int := 0;
END_VAR
VAR_CONSTANT
   FEED_P_MIN   : Real := 0.2;
   FEED_P_MAX   : Real := 12.0;
   LEVEL_MIN    : Real := 0.0;
   LEVEL_MAX    : Real := 100.0;
   COND_MAX     : Real := 2000.0;
   INVALID_MAX  : Int  := 999;
END_VAR

BEGIN
   "FC_SCALE_ANALOG"();

   // A measurement outside the physical range of its instrument is not "low".
   // It is UNKNOWN, and keeping that distinction is what stops a diagnosis
   // blaming the process for a broken transmitter.
   "FEED_PRESSURE_VALID" := "FEED_PRESSURE" > FEED_P_MIN AND "FEED_PRESSURE" < FEED_P_MAX;
   "RAW_LEVEL_VALID" := "RAW_TANK_LEVEL" >= LEVEL_MIN AND "RAW_TANK_LEVEL" <= LEVEL_MAX;
   "PERMEATE_COND_VALID" := "PERMEATE_CONDUCTIVITY" >= 0.0 AND "PERMEATE_CONDUCTIVITY" <= COND_MAX;

   IF NOT "FEED_PRESSURE_VALID" OR NOT "RAW_LEVEL_VALID" OR NOT "PERMEATE_COND_VALID" THEN
      "ALM_ANALOG_INVALID" := TRUE;
      #invalidCycles := #invalidCycles + 1;
   END_IF;

   // Bounded counter: a diagnostic count that wrapped silently would be worse
   // than no count at all.
   IF #invalidCycles > INVALID_MAX THEN
      #invalidCycles := 0;
   END_IF;

   // Rising-edge detection on the validity flag, so a channel that recovers is
   // counted once rather than every scan it stays healthy.
   IF "FEED_PRESSURE_VALID" AND NOT "FEED_PRESSURE_VALID_PREV" THEN
      "ANALOG_RECOVERY_COUNT" := "ANALOG_RECOVERY_COUNT" + 1;
   END_IF;
   "FEED_PRESSURE_VALID_PREV" := "FEED_PRESSURE_VALID";

   // Stale data is published as its own fact. It is never treated as a healthy
   // reading, and nothing downstream is restarted when the link returns.
   IF NOT "PN_LINK_OK" THEN
      "ALM_COMMS_LOST" := TRUE;
      "DATA_STALE" := TRUE;
   END_IF;

   // Permissives are derived from VALIDATED values only.
   "PRM_FEED_AVAILABLE" := "RAW_LEVEL_VALID" AND "RAW_TANK_LEVEL" > "DB_CONFIG".LevelMinPct;
   "PRM_FEED_PRESSURE_OK" := "FEED_PRESSURE_VALID" AND "FEED_PRESSURE" >= "DB_CONFIG".FeedPressureMin;
   "PRM_QUALITY_OK" := "PERMEATE_COND_VALID" AND "PERMEATE_QUALITY_OK";
END_FUNCTION_BLOCK
`;

const FB_PUMP_SUPERVISION_SCL = `FUNCTION_BLOCK "FB_PUMP_SUPERVISION"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Duty/standby supervision for the raw-water feed pumps.
VAR
   changeoverTimer : TON;
END_VAR
VAR_CONSTANT
   CHANGEOVER_DELAY : Time := T#5s;
   HOURS_MAX        : DInt := 100000;
END_VAR

BEGIN
   // Rising edge on the duty pump's fault bit. A changeover is a REQUEST for the
   // standby pump and it happens only when the standby is genuinely available;
   // when it is not, the skid stops and says so rather than behaving as though a
   // pump existed.
   IF "P1_FAULT" AND NOT "P1_FAULT_PREV" THEN
      "ALM_DUTY_PUMP_TRIP" := TRUE;
      IF "P2_AVAILABLE" THEN
         "DUTY_SELECT" := 2;
      ELSE
         "ALM_NO_STANDBY_PUMP" := TRUE;
         "SKID_RUNNING" := FALSE;
      END_IF;
   END_IF;
   "P1_FAULT_PREV" := "P1_FAULT";

   #changeoverTimer(IN := "P1_FAULT", PT := CHANGEOVER_DELAY);

   // The two demands are mutually exclusive BY CONSTRUCTION. Running both feed
   // pumps onto one suction header is prevented here, not by an operator
   // remembering which one is duty.
   "P1_DEMAND" := "SKID_RUNNING" AND "DUTY_SELECT" = 1;
   "P2_DEMAND" := "SKID_RUNNING" AND "DUTY_SELECT" = 2;

   IF "P1_RUNNING" THEN
      "PUMP_HOURS_DUTY" := "PUMP_HOURS_DUTY" + 1;
   END_IF;

   IF "PUMP_HOURS_DUTY" > HOURS_MAX THEN
      "PUMP_HOURS_DUTY" := 0;
   END_IF;
END_FUNCTION_BLOCK
`;

const FB_VALVE_SUPERVISION_SCL = `FUNCTION_BLOCK "FB_VALVE_SUPERVISION"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Valve matrix supervision.
VAR
   travelTimer : TON;
END_VAR
VAR_CONSTANT
   TRAVEL_TIME : Time := T#8s;
END_VAR

BEGIN
   // A valve is judged by whether its FEEDBACK follows its DEMAND within the
   // declared travel time. Feedback that disagrees for longer than that is a
   // discrepancy — and a discrepancy is never resolved by preferring the demand.
   #travelTimer(IN := "V_HP_DEMAND" <> "V_HP_OPEN_FB", PT := TRAVEL_TIME);

   IF #travelTimer.Q THEN
      "ALM_VALVE_DISCREPANCY" := TRUE;
   END_IF;

   // While CIP is active the production matrix is held. This program observes
   // that interlock and never writes it, resets it or bridges it.
   IF "ILK_CIP_ACTIVE" THEN
      "ALM_CIP_LOCKOUT" := TRUE;
   END_IF;

   "VALVE_MATRIX_READY" := "V_INLET_OPEN_FB" AND NOT "V_FLUSH_OPEN_FB" AND NOT "ILK_CIP_ACTIVE";
   "PRM_VALVES_READY" := "VALVE_MATRIX_READY";
END_FUNCTION_BLOCK
`;

const FB_RO_SEQUENCE_SCL = `FUNCTION_BLOCK "FB_RO_SEQUENCE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// The reverse-osmosis production state machine.
VAR
   stepTimer  : TON;
   flushCount : Int := 0;
END_VAR
VAR_CONSTANT
   T_FLUSH   : Time := T#120s;
   FLUSH_MAX : Int  := 9999;
END_VAR

BEGIN
   // A trip drops the sequence to its idle step and LEAVES IT THERE. There is no
   // automatic restart: when the interlock clears, the sequence stays at step 0
   // until an operator requests a start on this controller.
   IF "ILK_LOW_SUCTION" OR "ILK_HP_OVERPRESSURE" THEN
      "SEQ_STEP" := 0;
      "SKID_RUNNING" := FALSE;
   END_IF;

   CASE "SEQ_STEP" OF
      0:  // R00 idle — every start condition is checked together
         IF "START_REQUEST"
            AND "MODE_AUTO"
            AND "MODE_REMOTE"
            AND "PRM_FEED_AVAILABLE"
            AND "PRM_VALVES_READY"
         THEN
            "SEQ_STEP" := 10;
         END_IF;

      10: // R10 permissive check — the pressure permissive is derived from a
          // validated measurement, so an unknown value cannot satisfy it
         IF "PRM_FEED_PRESSURE_OK" THEN
            "SEQ_STEP" := 20;
         END_IF;

      20: // R20 pressurise
         "SKID_RUNNING" := TRUE;
         IF "HP_PUMP_RUNNING" AND "PRM_QUALITY_OK" THEN
            "SEQ_STEP" := 30;
         END_IF;

      30: // R30 produce — permeate is only sent to the tank once quality holds
         "DIVERT_ACTIVE" := FALSE;
         IF "STOP_REQUEST" OR NOT "PERMEATE_QUALITY_OK" THEN
            "SEQ_STEP" := 40;
         END_IF;

      40: // R40 flush — always entered before stopping, never skipped
         "DIVERT_ACTIVE" := TRUE;
         #flushCount := #flushCount + 1;
         IF #flushCount > FLUSH_MAX THEN
            #flushCount := 0;
         END_IF;
         "SEQ_STEP" := 50;

      50: // R50 stop
         "SKID_RUNNING" := FALSE;
         "SEQ_STEP" := 0;
   END_CASE;
END_FUNCTION_BLOCK
`;

const FC_LIBRARY_SCL = `FUNCTION "FC_SCALE_ANALOG" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Raw analogue channels to engineering units.
VAR_CONSTANT
   SCALE_PRESSURE : Real := 0.000366;
   SCALE_LEVEL    : Real := 0.003052;
   SCALE_COND     : Real := 0.061035;
END_VAR

BEGIN
   "FEED_PRESSURE" := "FEED_PRESSURE_RAW" * SCALE_PRESSURE;
   "RAW_TANK_LEVEL" := "RAW_TANK_LEVEL_RAW" * SCALE_LEVEL;
   "PERMEATE_CONDUCTIVITY" := "PERMEATE_COND_RAW" * SCALE_COND;
END_FUNCTION

FUNCTION "FC_QUALITY_CALC" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Product quality against the recipe limit.
BEGIN
   "SALT_REJECTION" := ("FEED_CONDUCTIVITY" - "PERMEATE_CONDUCTIVITY") * 100.0 / "FEED_CONDUCTIVITY";
   "PERMEATE_QUALITY_OK" := "PERMEATE_CONDUCTIVITY" <= "DB_RECIPE".PermeateCondLimit;

   // Off-specification product is diverted, never blended. The alarm is raised
   // as a fact; clearing it is an operator act.
   IF NOT "PERMEATE_QUALITY_OK" THEN
      "DIVERT_ACTIVE" := TRUE;
      "ALM_PERMEATE_QUALITY" := TRUE;
   END_IF;
END_FUNCTION

FUNCTION "FC_KPI_CALC" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Production, recovery and specific-energy counters.
VAR_CONSTANT
   COUNT_MAX : Real := 1000000.0;
END_VAR

BEGIN
   "FC_QUALITY_CALC"();

   "RECOVERY_PCT" := "PERMEATE_FLOW" * 100.0 / "FEED_FLOW";
   "SPECIFIC_ENERGY" := "HP_PUMP_POWER" / "PERMEATE_FLOW";
   "PROD_COUNT_M3" := "PROD_COUNT_M3" + "PERMEATE_FLOW";

   IF "PROD_COUNT_M3" > COUNT_MAX THEN
      "PROD_COUNT_M3" := 0.0;
   END_IF;

   // The cartridge filter is judged on differential pressure against the
   // configured limit rather than on a fixed number buried in the logic.
   IF "CARTRIDGE_DIFF_PRESSURE" >= "DB_CONFIG".CartridgeDpLimit THEN
      "ALM_FILTER_DP_HIGH" := TRUE;
   END_IF;
END_FUNCTION
`;

const DB_DEFINITIONS_SCL = `DATA_BLOCK "DB_INSTANCE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Retentive instance state for the supervision blocks.
STRUCT
   PumpDuty       : "UDT_PUMP";
   PumpStandby    : "UDT_PUMP";
   ValveHighPress : "UDT_VALVE";
   FeedPressure   : "UDT_ANALOG";
   Sequence       : "UDT_SEQ_STATE";
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_CONFIG"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Engineering configuration. Limits live here, not in the logic.
STRUCT
   LevelMinPct       : Real := 15.0;
   FeedPressureMin   : Real := 1.5;
   CartridgeDpLimit  : Real := 1.2;
   ChangeoverDelayMs : DInt := 5000;
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_ALARMS"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Alarm bits and their acknowledgement state.
STRUCT
   AnalogInvalid     : Bool := FALSE;
   DutyPumpTrip      : Bool := FALSE;
   NoStandbyPump     : Bool := FALSE;
   FilterDpHigh      : Bool := FALSE;
   ValveDiscrepancy  : Bool := FALSE;
   PermeateQuality   : Bool := FALSE;
   CommsLost         : Bool := FALSE;
   CipLockout        : Bool := FALSE;
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_RECIPE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Product recipe parameters.
STRUCT
   PermeateCondLimit : Real := 50.0;
   TargetRecoveryPct : Real := 75.0;
   FlushDurationSec  : Int  := 120;
END_STRUCT
BEGIN
END_DATA_BLOCK
`;

const UDT_DEFINITIONS_SCL = `TYPE "UDT_PUMP"
VERSION : 1.0
// One feed pump, as the supervision block sees it.
STRUCT
   Running    : Bool;
   Fault      : Bool;
   Available  : Bool;
   RunHours   : DInt;
END_STRUCT
END_TYPE

TYPE "UDT_VALVE"
VERSION : 1.0
// One matrix valve: demand, both feedbacks, and the travel judgement.
STRUCT
   Demand       : Bool;
   OpenFeedback : Bool;
   ClosedFb     : Bool;
   Discrepancy  : Bool;
END_STRUCT
END_TYPE

TYPE "UDT_ANALOG"
VERSION : 1.0
// One analogue signal and the validity that travels with it.
STRUCT
   Raw        : Int;
   Scaled     : Real;
   Valid      : Bool;
   OutOfRange : Bool;
END_STRUCT
END_TYPE

TYPE "UDT_SEQ_STATE"
VERSION : 1.0
// Sequence state, so a step and its timeout are never held apart.
STRUCT
   Step         : Int;
   StepElapsedS : DInt;
   TimeoutS     : Int;
   Running      : Bool;
END_STRUCT
END_TYPE
`;

const FBD_VALVE_MATRIX_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  TIA-03 — valve matrix permissive network, exported as a structured FBD
  description. This is engineering text: it was not produced, compiled or
  validated by TIA Portal or any other vendor tool, and it is carried for
  engineering fidelity only. This build declares no relation mapping for
  FBD_XML, so the source-agreement gate reports it as SKIPPED rather than
  pretending to have checked it.
-->
<Document>
  <FunctionBlockDiagram Name="FBD_VALVE_MATRIX" Number="1250" Language="FBD">
    <Network Number="1" Title="High-pressure valve travel supervision">
      <Part Name="NE" Uid="21" />
      <Part Name="TON" Uid="22">
        <Parameter Name="PT" Type="Time" Value="T#8s" />
      </Part>
      <Access Uid="23" Scope="GlobalVariable">
        <Symbol><Component Name="V_HP_DEMAND" /></Symbol>
      </Access>
      <Access Uid="24" Scope="GlobalVariable">
        <Symbol><Component Name="V_HP_OPEN_FB" /></Symbol>
      </Access>
      <Access Uid="25" Scope="GlobalVariable">
        <Symbol><Component Name="ALM_VALVE_DISCREPANCY" /></Symbol>
      </Access>
      <Wire><NameCon Uid="23" Name="in1" /><NameCon Uid="21" Name="in1" /></Wire>
      <Wire><NameCon Uid="24" Name="in1" /><NameCon Uid="21" Name="in2" /></Wire>
      <Wire><NameCon Uid="21" Name="out" /><NameCon Uid="22" Name="IN" /></Wire>
      <Wire><NameCon Uid="22" Name="Q" /><NameCon Uid="25" Name="operand" /></Wire>
    </Network>
    <Network Number="2" Title="Production matrix ready">
      <Part Name="And" Uid="31" />
      <Part Name="Not" Uid="32" />
      <Part Name="Not" Uid="33" />
      <Access Uid="34" Scope="GlobalVariable">
        <Symbol><Component Name="V_INLET_OPEN_FB" /></Symbol>
      </Access>
      <Access Uid="35" Scope="GlobalVariable">
        <Symbol><Component Name="V_FLUSH_OPEN_FB" /></Symbol>
      </Access>
      <Access Uid="36" Scope="GlobalVariable">
        <Symbol><Component Name="ILK_CIP_ACTIVE" /></Symbol>
      </Access>
      <Access Uid="37" Scope="GlobalVariable">
        <Symbol><Component Name="VALVE_MATRIX_READY" /></Symbol>
      </Access>
      <Wire><NameCon Uid="34" Name="in1" /><NameCon Uid="31" Name="in1" /></Wire>
      <Wire><NameCon Uid="35" Name="in1" /><NameCon Uid="32" Name="in" /></Wire>
      <Wire><NameCon Uid="36" Name="in1" /><NameCon Uid="33" Name="in" /></Wire>
      <Wire><NameCon Uid="32" Name="out" /><NameCon Uid="31" Name="in2" /></Wire>
      <Wire><NameCon Uid="33" Name="out" /><NameCon Uid="31" Name="in3" /></Wire>
      <Wire><NameCon Uid="31" Name="out" /><NameCon Uid="37" Name="operand" /></Wire>
    </Network>
  </FunctionBlockDiagram>
</Document>
`;

/* ── Operator surface and governance ─────────────────────────────────────── */

const ST = {
  feedPressure: a.id("SCADA_TAG", "HMI_Feed_Pressure"),
  permeateCond: a.id("SCADA_TAG", "HMI_Permeate_Conductivity"),
  skidRunning: a.id("SCADA_TAG", "HMI_Skid_Running"),
  startIntent: a.id("SCADA_TAG", "HMI_Start_Request_Intent"),
  ackCmd: a.id("SCADA_TAG", "HMI_Alarm_Ack_Cmd"),
  kpiPublished: a.id("SCADA_TAG", "HMI_Kpi_Published"),
};

const H = {
  overview: a.id("HMI_SCREEN", "Screen_SkidOverview"),
  alarms: a.id("HMI_SCREEN", "Screen_Alarms"),
};

const HO = {
  skidStatus: a.id("HMI_OBJECT", "Ind_SkidStatus"),
  qualityTrend: a.id("HMI_OBJECT", "Trend_PermeateQuality"),
  startButton: a.id("HMI_OBJECT", "Btn_StartRequest"),
  alarmBanner: a.id("HMI_OBJECT", "Banner_ActiveAlarms"),
};

const SC = {
  startIntent: a.id("SCRIPT", "OnStartRequestIntent"),
  alarmAck: a.id("SCRIPT", "OnAlarmAcknowledge"),
  kpiPublish: a.id("SCRIPT", "OnKpiPublish"),
};

const R = {
  operator: a.id("ROLE", "Role_PlantOperator"),
  engineer: a.id("ROLE", "Role_ProcessEngineer"),
};

const AE = {
  startIntent: a.id("AUDIT_EVENT_TYPE", "Audit_StartRequestIntentRecorded"),
  alarmAck: a.id("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged"),
  kpiRecord: a.id("AUDIT_EVENT_TYPE", "Audit_KpiPublishRecord"),
};

/* ── System ───────────────────────────────────────────────────────────────── */

export const TIA_03_WATER_TREATMENT: AuthoredReferenceSystem = {
  id: "TIA-03",
  name: t(
    "Water treatment and reverse-osmosis skid",
    "اسکید تصفیهٔ آب و اسمز معکوس",
  ),
  domain: t(
    "Raw-water feed, filtration, high-pressure reverse osmosis, permeate quality and CIP boundary",
    "تغذیهٔ آب خام، فیلتراسیون، اسمز معکوس پرفشار، کیفیت آب محصول و مرز شست‌وشوی شیمیایی",
  ),
  sourceType: "TIA_REFERENCE",
  platform:
    "Vendor-neutral S7-1500-class controller described in IEC 61131-3 / SCL source text; no vendor project archive is produced or claimed",
  version: "1.0.0",
  revision: 1,
  origin: "SYNTHETIC_ORIGINAL",

  nodes: [
    /* Devices */
    a.node("DEVICE", "CPU_1516F", t("Skid controller CPU", "پردازندهٔ کنترلر اسکید"), {
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "ET200SP_IO", t("Distributed I/O station", "ایستگاه ورودی/خروجی توزیع‌شده"), {
      domain: "FIELD_IO",
      attributes: { deviceCategory: "REMOTE_IO", networkZone: "FIELD", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "HMI_PANEL", t("Skid operator panel", "پنل اپراتور اسکید"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { deviceCategory: "HMI", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "VFD_HP_PUMP", t("High-pressure pump drive", "درایو پمپ فشار قوی"), {
      domain: "DRIVES",
      attributes: { deviceCategory: "VFD", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "CONDUCTIVITY_ANALYSER", t("Conductivity analyser", "آنالایزر هدایت الکتریکی"), {
      domain: "QUALITY",
      attributes: { deviceCategory: "SENSOR_AGGREGATOR", networkZone: "FIELD" },
    }),
    a.node("DEVICE", "PROFINET_SWITCH", t("PROFINET switch", "سوییچ پروفینت"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "NETWORK_SWITCH", networkZone: "CONTROL" },
    }),

    /* Equipment */
    a.node("EQUIPMENT", "RAW_WATER_TANK", t("Raw-water buffer tank", "مخزن بافر آب خام"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "FEED_PUMP_P1", t("Feed pump P1 (duty)", "پمپ تغذیهٔ P1 (اصلی)"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "FEED_PUMP_P2", t("Feed pump P2 (standby)", "پمپ تغذیهٔ P2 (پشتیبان)"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "MULTIMEDIA_FILTER", t("Multimedia filter", "فیلتر چندلایه"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "CARTRIDGE_FILTER", t("Cartridge filter", "فیلتر کارتریجی"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "HIGH_PRESSURE_PUMP", t("High-pressure pump", "پمپ فشار قوی"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "RO_STAGE_1", t("RO stage 1", "مرحلهٔ ۱ اسمز معکوس"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "RO_STAGE_2", t("RO stage 2", "مرحلهٔ ۲ اسمز معکوس"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "PERMEATE_TANK", t("Permeate tank", "مخزن آب محصول"), { domain: "QUALITY" }),
    a.node("EQUIPMENT", "REJECT_LINE", t("Reject / concentrate line", "خط پساب غلیظ"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "CIP_CHEMICAL_SKID", t("CIP and chemical dosing skid", "اسکید شست‌وشو و تزریق مواد شیمیایی"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Monitored only. No dosing is commanded, advised or simulated from this system; a chemical finding is escalated to a qualified process and safety engineer.",
        "فقط پایش می‌شود. هیچ تزریقی از این سامانه فرمان داده، توصیه یا شبیه‌سازی نمی‌شود؛ هر یافتهٔ شیمیایی به مهندس فرایند و ایمنی واجد صلاحیت ارجاع می‌شود.",
      ),
    }),
    a.node("EQUIPMENT", "VALVE_MATRIX", t("Process valve matrix", "ماتریس شیرهای فرایندی"), { domain: "PROCESS" }),

    /* PLC blocks — every one of these is a real SCL unit in the artefacts */
    a.node("PLC_BLOCK", "OB_MAIN", t("OB1 cyclic entry point", "OB1 نقطهٔ ورود چرخه‌ای"), {
      attributes: { blockType: "OB" },
      sourceId: "OB1",
    }),
    a.node("PLC_BLOCK", "OB_STARTUP", t("OB100 startup and initialisation", "OB100 راه‌اندازی و مقداردهی اولیه"), {
      attributes: { blockType: "OB" },
      sourceId: "OB100",
      description: t(
        "Deterministic initialisation that clears no latched trip and starts nothing.",
        "مقداردهی اولیهٔ قطعی که هیچ تریپ قفل‌شده‌ای را پاک نمی‌کند و هیچ‌چیز را راه‌اندازی نمی‌کند.",
      ),
    }),
    a.node("PLC_BLOCK", "FB_ANALOG_VALIDATION", t("Analogue validation block", "بلوک اعتبارسنجی سیگنال آنالوگ"), {
      attributes: { blockType: "FB" },
      sourceId: "FB1310",
      domain: "FIELD_IO",
    }),
    a.node("PLC_BLOCK", "FB_PUMP_SUPERVISION", t("Feed pump supervision block", "بلوک نظارت بر پمپ تغذیه"), {
      attributes: { blockType: "FB" },
      sourceId: "FB1320",
      domain: "MECHANICAL",
    }),
    a.node("PLC_BLOCK", "FB_VALVE_SUPERVISION", t("Valve supervision block", "بلوک نظارت بر شیرها"), {
      attributes: { blockType: "FB" },
      sourceId: "FB1330",
    }),
    a.node("PLC_BLOCK", "FB_RO_SEQUENCE", t("RO sequence block", "بلوک توالی اسمز معکوس"), {
      attributes: { blockType: "FB" },
      sourceId: "FB1340",
    }),
    a.node("PLC_BLOCK", "FC_SCALE_ANALOG", t("Analogue scaling function", "تابع مقیاس‌بندی آنالوگ"), {
      attributes: { blockType: "FC" },
      sourceId: "FC1350",
      domain: "FIELD_IO",
    }),
    a.node("PLC_BLOCK", "FC_QUALITY_CALC", t("Product quality calculation", "محاسبهٔ کیفیت محصول"), {
      attributes: { blockType: "FC" },
      sourceId: "FC1360",
      domain: "QUALITY",
    }),
    a.node("PLC_BLOCK", "FC_KPI_CALC", t("Counter and KPI calculation", "محاسبهٔ شمارنده‌ها و شاخص‌ها"), {
      attributes: { blockType: "FC" },
      sourceId: "FC1370",
      domain: "ENERGY",
    }),
    a.node("PLC_BLOCK", "DB_INSTANCE", t("Instance state data block", "بلوک دادهٔ وضعیت نمونه"), {
      attributes: { blockType: "DB" },
      sourceId: "DB1310",
    }),
    a.node("PLC_BLOCK", "DB_CONFIG", t("Configuration data block", "بلوک دادهٔ پیکربندی"), {
      attributes: { blockType: "DB" },
      sourceId: "DB1311",
      description: t(
        "Engineering limits live here rather than inside the logic, so a limit can be reviewed without reading a state machine.",
        "حدود مهندسی به‌جای درون منطق، اینجا قرار دارند تا بتوان یک حد را بدون خواندن ماشین حالت بازبینی کرد.",
      ),
    }),
    a.node("PLC_BLOCK", "DB_ALARMS", t("Alarm data block", "بلوک دادهٔ آلارم"), {
      attributes: { blockType: "DB" },
      sourceId: "DB1312",
    }),
    a.node("PLC_BLOCK", "DB_RECIPE", t("Recipe data block", "بلوک دادهٔ دستور ساخت"), {
      attributes: { blockType: "DB" },
      sourceId: "DB1313",
      domain: "QUALITY",
    }),
    a.node("PLC_BLOCK", "UDT_PUMP", t("Pump user-defined type", "نوع کاربرتعریف پمپ"), {
      attributes: { blockType: "UDT" },
      sourceId: "UDT_PUMP",
    }),
    a.node("PLC_BLOCK", "UDT_VALVE", t("Valve user-defined type", "نوع کاربرتعریف شیر"), {
      attributes: { blockType: "UDT" },
      sourceId: "UDT_VALVE",
    }),
    a.node("PLC_BLOCK", "UDT_ANALOG", t("Analogue signal user-defined type", "نوع کاربرتعریف سیگنال آنالوگ"), {
      attributes: { blockType: "UDT" },
      sourceId: "UDT_ANALOG",
    }),
    a.node("PLC_BLOCK", "UDT_SEQ_STATE", t("Sequence state user-defined type", "نوع کاربرتعریف وضعیت توالی"), {
      attributes: { blockType: "UDT" },
      sourceId: "UDT_SEQ_STATE",
    }),

    /* Sequence and mode state */
    a.node("TAG", "SEQ_STEP", t("Sequence step", "گام توالی"), { attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "SKID_RUNNING", t("Skid running", "در حال کار بودن اسکید"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "DIVERT_ACTIVE", t("Permeate divert active", "فعال بودن انحراف آب محصول"), {
      domain: "QUALITY",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Off-specification permeate is diverted, never blended into the product tank.",
        "آب محصولِ خارج از مشخصات منحرف می‌شود و هرگز با محتوای مخزن محصول مخلوط نمی‌شود.",
      ),
    }),
    a.node("TAG", "DUTY_SELECT", t("Duty pump selection", "انتخاب پمپ اصلی"), { attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "ALARM_WORD", t("Alarm collection word", "کلمهٔ تجمیع آلارم"), { attributes: { dataType: "WORD", accessMode: "READ" } }),
    a.node("TAG", "START_REQUEST", t("Start request", "درخواست راه‌اندازی"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "STOP_REQUEST", t("Stop request", "درخواست توقف"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "MODE_AUTO", t("Automatic mode selected", "انتخاب حالت خودکار"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "MODE_REMOTE", t("Remote mode selected", "انتخاب حالت از راه دور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "FALSE means somebody left the local selector engaged at the skid. The evidence for that is an operator action, not a process state.",
        "مقدار FALSE یعنی کسی سلکتور محلی را روی اسکید فعال رها کرده است. شاهد این موضوع یک اقدام اپراتوری است، نه یک وضعیت فرایندی.",
      ),
    }),

    /* Raw channels and scaled values */
    a.node("TAG", "FEED_PRESSURE_RAW", t("Feed pressure raw channel", "کانال خام فشار تغذیه"), { domain: "FIELD_IO", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "RAW_TANK_LEVEL_RAW", t("Raw tank level raw channel", "کانال خام سطح مخزن آب خام"), { domain: "FIELD_IO", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "PERMEATE_COND_RAW", t("Permeate conductivity raw channel", "کانال خام هدایت آب محصول"), { domain: "FIELD_IO", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "FEED_PRESSURE", t("Feed pressure", "فشار تغذیه"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" } }),
    a.node("TAG", "RAW_TANK_LEVEL", t("Raw-water tank level", "سطح مخزن آب خام"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "%", accessMode: "READ" } }),
    a.node("TAG", "PERMEATE_CONDUCTIVITY", t("Permeate conductivity", "هدایت الکتریکی آب محصول"), { domain: "QUALITY", attributes: { dataType: "REAL", unit: "uS/cm", accessMode: "READ" } }),

    /* Validation */
    a.node("TAG", "FEED_PRESSURE_VALID", t("Feed pressure measurement valid", "معتبر بودن اندازه‌گیری فشار تغذیه"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "FEED_PRESSURE_VALID_PREV", t("Feed pressure validity, previous scan", "اعتبار فشار تغذیه در چرخهٔ پیشین"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "RAW_LEVEL_VALID", t("Raw level measurement valid", "معتبر بودن اندازه‌گیری سطح آب خام"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "PERMEATE_COND_VALID", t("Permeate conductivity valid", "معتبر بودن هدایت آب محصول"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ANALOG_RECOVERY_COUNT", t("Analogue recovery count", "شمارش بازیابی سیگنال آنالوگ"), { domain: "MAINTENANCE", attributes: { dataType: "INT", accessMode: "READ" } }),

    /* Feed pumps */
    a.node("TAG", "P1_RUNNING", t("P1 running", "کارکرد P1"), { domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "P1_FAULT", t("P1 drive fault", "خطای درایو P1"), { domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "P1_FAULT_PREV", t("P1 fault, previous scan", "خطای P1 در چرخهٔ پیشین"), { domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "P1_DEMAND", t("P1 run demand", "تقاضای کارکرد P1"), { domain: "CONTROL_LOGIC", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "P2_RUNNING", t("P2 running", "کارکرد P2"), { domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "P2_AVAILABLE", t("P2 available for duty", "آمادگی P2 برای کار اصلی"), { domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "P2_DEMAND", t("P2 run demand", "تقاضای کارکرد P2"), { domain: "CONTROL_LOGIC", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "PUMP_HOURS_DUTY", t("Duty pump running hours", "ساعات کارکرد پمپ اصلی"), { domain: "MAINTENANCE", attributes: { dataType: "DINT", unit: "h", accessMode: "READ" } }),

    /* Filtration */
    a.node("TAG", "MMF_DIFF_PRESSURE", t("Multimedia filter differential pressure", "اختلاف فشار فیلتر چندلایه"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" } }),
    a.node("TAG", "CARTRIDGE_DIFF_PRESSURE", t("Cartridge filter differential pressure", "اختلاف فشار فیلتر کارتریجی"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" } }),
    a.node("TAG", "MMF_BACKWASH_ACTIVE", t("Multimedia filter backwash active", "فعال بودن شست‌وشوی معکوس فیلتر"), { domain: "PROCESS", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* High pressure and RO */
    a.node("TAG", "HP_PUMP_RUNNING", t("High-pressure pump running", "کارکرد پمپ فشار قوی"), { domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "HP_PUMP_FAULT", t("High-pressure pump fault", "خطای پمپ فشار قوی"), { domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "HP_DISCHARGE_PRESSURE", t("High-pressure discharge pressure", "فشار خروجی پمپ فشار قوی"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" } }),
    a.node("TAG", "HP_PUMP_POWER", t("High-pressure pump power", "توان پمپ فشار قوی"), { domain: "ENERGY", attributes: { dataType: "REAL", unit: "kW", accessMode: "READ" } }),
    a.node("TAG", "RO_STAGE1_PRESSURE", t("RO stage 1 pressure", "فشار مرحلهٔ ۱ اسمز معکوس"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" } }),
    a.node("TAG", "RO_STAGE2_PRESSURE", t("RO stage 2 pressure", "فشار مرحلهٔ ۲ اسمز معکوس"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" } }),
    a.node("TAG", "PERMEATE_FLOW", t("Permeate flow", "دبی آب محصول"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ" } }),
    a.node("TAG", "REJECT_FLOW", t("Reject flow", "دبی پساب غلیظ"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ" } }),
    a.node("TAG", "FEED_FLOW", t("Feed flow", "دبی تغذیه"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ" } }),
    a.node("TAG", "FEED_CONDUCTIVITY", t("Feed conductivity", "هدایت الکتریکی تغذیه"), { domain: "QUALITY", attributes: { dataType: "REAL", unit: "uS/cm", accessMode: "READ" } }),
    a.node("TAG", "PERMEATE_QUALITY_OK", t("Permeate within quality limit", "بودن آب محصول در حد کیفی"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "SALT_REJECTION", t("Salt rejection", "درصد دفع نمک"), { domain: "QUALITY", attributes: { dataType: "REAL", unit: "%", accessMode: "READ" } }),

    /* Valve matrix */
    a.node("TAG", "V_HP_DEMAND", t("High-pressure valve demand", "فرمان شیر فشار قوی"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "V_HP_OPEN_FB", t("High-pressure valve open feedback", "بازخورد باز بودن شیر فشار قوی"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "V_INLET_OPEN_FB", t("Inlet valve open feedback", "بازخورد باز بودن شیر ورودی"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "V_FLUSH_OPEN_FB", t("Flush valve open feedback", "بازخورد باز بودن شیر شست‌وشو"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "VALVE_MATRIX_READY", t("Valve matrix ready", "آمادگی ماتریس شیرها"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* CIP and chemical — monitored only */
    a.node("TAG", "CIP_CHEM_FLOW", t("CIP chemical flow", "دبی مادهٔ شیمیایی شست‌وشو"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "L/h", accessMode: "READ" },
    }),
    a.node("TAG", "CIP_TANK_LEVEL", t("CIP chemical tank level", "سطح مخزن مادهٔ شیمیایی"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),

    /* Counters */
    a.node("TAG", "PROD_COUNT_M3", t("Produced permeate volume", "حجم آب محصول تولیدشده"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "m3", accessMode: "READ" } }),
    a.node("TAG", "RECOVERY_PCT", t("Recovery", "بازیابی"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "%", accessMode: "READ" } }),
    a.node("TAG", "SPECIFIC_ENERGY", t("Specific energy", "انرژی ویژه"), { domain: "ENERGY", attributes: { dataType: "REAL", unit: "kWh/m3", accessMode: "READ" } }),

    /* Communications */
    a.node("TAG", "PN_LINK_OK", t("PROFINET link healthy", "سلامت پیوند پروفینت"), { domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "TELEMETRY_AGE", t("Age of newest process value", "سن تازه‌ترین مقدار فرایندی"), { domain: "NETWORK", attributes: { dataType: "INT", unit: "s", accessMode: "READ" } }),
    a.node("TAG", "DATA_STALE", t("Process data stale", "کهنگی دادهٔ فرایندی"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Published as its own fact. A stale value is unknown, never a healthy reading, and nothing is restarted when the link returns.",
        "به‌عنوان یک واقعیت مستقل منتشر می‌شود. مقدار کهنه نامعلوم است، هرگز یک قرائت سالم نیست و با بازگشت پیوند هیچ‌چیز دوباره راه‌اندازی نمی‌شود.",
      ),
    }),

    /* Alarm bits the program sets */
    a.node("TAG", "ALM_ANALOG_INVALID", t("Analogue invalid alarm bit", "بیت آلارم نامعتبری آنالوگ"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_DUTY_PUMP_TRIP", t("Duty pump trip alarm bit", "بیت آلارم تریپ پمپ اصلی"), { domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_NO_STANDBY_PUMP", t("No standby pump alarm bit", "بیت آلارم نبود پمپ پشتیبان"), { domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_VALVE_DISCREPANCY", t("Valve discrepancy alarm bit", "بیت آلارم مغایرت شیر"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_CIP_LOCKOUT", t("CIP lockout alarm bit", "بیت آلارم قفل شست‌وشو"), { domain: "SAFETY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_PERMEATE_QUALITY", t("Permeate quality alarm bit", "بیت آلارم کیفیت آب محصول"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_COMMS_LOST", t("Communications lost alarm bit", "بیت آلارم قطع ارتباط"), { domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_FILTER_DP_HIGH", t("Filter differential pressure alarm bit", "بیت آلارم اختلاف فشار فیلتر"), { domain: "PROCESS", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Field channels */
    a.node("IO_POINT", "AI_FEED_PRESSURE", t("Feed pressure transmitter", "ترانسمیتر فشار تغذیه"), { domain: "FIELD_IO", attributes: { channelType: "AI", unit: "bar" } }),
    a.node("IO_POINT", "AI_RAW_TANK_LEVEL", t("Raw tank level transmitter", "ترانسمیتر سطح مخزن آب خام"), { domain: "FIELD_IO", attributes: { channelType: "AI", unit: "%" } }),
    a.node("IO_POINT", "AI_PERMEATE_CONDUCTIVITY", t("Permeate conductivity cell", "سل هدایت آب محصول"), { domain: "FIELD_IO", attributes: { channelType: "AI", unit: "uS/cm" } }),
    a.node("IO_POINT", "AI_CARTRIDGE_DIFF_PRESSURE", t("Cartridge differential pressure transmitter", "ترانسمیتر اختلاف فشار کارتریج"), { domain: "FIELD_IO", attributes: { channelType: "AI", unit: "bar" } }),
    a.node("IO_POINT", "DI_P1_FAULT", t("P1 fault contact", "کنتاکت خطای P1"), { domain: "FIELD_IO", attributes: { channelType: "DI" } }),
    a.node("IO_POINT", "DI_V_HP_OPEN", t("High-pressure valve open limit switch", "لیمیت‌سوییچ باز بودن شیر فشار قوی"), { domain: "FIELD_IO", attributes: { channelType: "DI" } }),

    /* Production sequence */
    a.node("SEQUENCE", "RO_PRODUCTION_SEQUENCE", t("RO production sequence", "توالی تولید اسمز معکوس"), {
      description: t(
        "The state machine the FB implements. Described here and executed nowhere in this repository.",
        "ماشین حالتی که بلوک تابعی پیاده می‌کند. اینجا توصیف می‌شود و در هیچ جای این مخزن اجرا نمی‌شود.",
      ),
    }),
    a.node("STATE", "R00_IDLE", t("Idle", "بی‌کار"), { attributes: { stepNumber: 0 } }),
    a.node("STATE", "R10_PERMISSIVE_CHECK", t("Permissive check", "بررسی مجوزها"), { attributes: { stepNumber: 10, stepTimeoutSeconds: 60 } }),
    a.node("STATE", "R20_PRESSURISE", t("Pressurise", "فشارگیری"), { attributes: { stepNumber: 20, stepTimeoutSeconds: 180 } }),
    a.node("STATE", "R30_PRODUCE", t("Produce", "تولید"), { attributes: { stepNumber: 30 } }),
    a.node("STATE", "R40_FLUSH", t("Flush", "شست‌وشوی نهایی"), { attributes: { stepNumber: 40, stepTimeoutSeconds: 120 } }),
    a.node("STATE", "R50_STOP", t("Stop", "توقف"), { attributes: { stepNumber: 50 } }),

    /* Alarm lifecycle */
    a.node("SEQUENCE", "ALARM_LIFECYCLE", t("ISA-18.2 alarm lifecycle", "چرخهٔ عمر آلارم ISA-18.2"), { domain: "OPERATOR_INTERFACE" }),
    a.node("STATE", "AL00_NORMAL", t("Normal", "عادی"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 0 } }),
    a.node("STATE", "AL10_UNACK_ALARM", t("Unacknowledged alarm", "آلارم تأییدنشده"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 10 } }),
    a.node("STATE", "AL20_ACK_ALARM", t("Acknowledged alarm", "آلارم تأییدشده"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 20 } }),
    a.node("STATE", "AL30_RTN_UNACK", t("Returned to normal, unacknowledged", "بازگشته به عادی، تأییدنشده"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 30 } }),

    /* Permissives */
    a.node("PERMISSIVE", "PRM_FEED_AVAILABLE", t("Raw water available", "در دسترس بودن آب خام"), { domain: "PROCESS" }),
    a.node("PERMISSIVE", "PRM_FEED_PRESSURE_OK", t("Feed pressure sufficient", "کفایت فشار تغذیه"), {
      domain: "PROCESS",
      description: t(
        "Derived from the VALIDATED pressure. An unknown measurement can never satisfy it, which is what keeps a broken transmitter from looking like a healthy start condition.",
        "از فشار اعتبارسنجی‌شده استخراج می‌شود. یک اندازه‌گیری نامعلوم هرگز نمی‌تواند آن را برآورده کند و همین است که نمی‌گذارد یک ترانسمیتر خراب شبیه یک شرط راه‌اندازی سالم به نظر برسد.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_VALVES_READY", t("Valve matrix ready", "آمادگی ماتریس شیرها"), {}),
    a.node("PERMISSIVE", "PRM_QUALITY_OK", t("Product quality within limit", "بودن کیفیت محصول در حد مجاز"), { domain: "QUALITY" }),

    /* Interlocks — read by the program, written by nothing */
    a.node("INTERLOCK", "ILK_LOW_SUCTION", t("Low suction protection", "حفاظت افت مکش"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Observed as diagnostic evidence only. This program reads it and never writes, resets, inhibits or bridges it.",
        "فقط به‌عنوان شاهد تشخیصی مشاهده می‌شود. این برنامه آن را می‌خواند و هرگز نمی‌نویسد، ریست، غیرفعال یا دور نمی‌زند.",
      ),
    }),
    a.node("INTERLOCK", "ILK_HP_OVERPRESSURE", t("High-pressure overpressure protection", "حفاظت اضافه‌فشار فشار قوی"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_CIP_ACTIVE", t("CIP lockout interlock", "اینترلاک قفل شست‌وشوی شیمیایی"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),

    /* Alarms */
    a.node("ALARM", "ALM_ANALOG_SIGNAL_INVALID", t("Analogue signal invalid", "نامعتبر بودن سیگنال آنالوگ"), { domain: "FIELD_IO", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_DUTY_PUMP_TRIPPED", t("Duty feed pump tripped", "تریپ پمپ تغذیهٔ اصلی"), { domain: "DRIVES", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_NO_STANDBY_AVAILABLE", t("No standby pump available", "نبود پمپ پشتیبان در دسترس"), { domain: "MECHANICAL", attributes: { alarmPriority: "URGENT", requiresAck: true } }),
    a.node("ALARM", "ALM_CARTRIDGE_DP_HIGH", t("Cartridge filter differential pressure high", "بالا بودن اختلاف فشار فیلتر کارتریجی"), { domain: "PROCESS", attributes: { alarmPriority: "MEDIUM", requiresAck: true } }),
    a.node("ALARM", "ALM_VALVE_POSITION_DISCREPANCY", t("Valve position discrepancy", "مغایرت وضعیت شیر"), { domain: "FIELD_IO", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_PERMEATE_QUALITY_LOW", t("Permeate quality outside limit", "خروج کیفیت آب محصول از حد مجاز"), { domain: "QUALITY", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_PROFINET_COMMS_LOST", t("PROFINET communications lost", "قطع ارتباط پروفینت"), { domain: "NETWORK", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_CIP_LOCKOUT_ACTIVE", t("CIP lockout active", "فعال بودن قفل شست‌وشوی شیمیایی"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_SKID_IN_LOCAL", t("Skid left in local mode", "رهاشدن اسکید در حالت محلی"), { domain: "OPERATOR_INTERFACE", attributes: { alarmPriority: "MEDIUM", requiresAck: true } }),

    /* Operator surface */
    a.node("SCADA_TAG", "HMI_Feed_Pressure", t("Feed pressure (panel)", "فشار تغذیه (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Permeate_Conductivity", t("Permeate conductivity (panel)", "هدایت آب محصول (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "REAL", unit: "uS/cm", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Skid_Running", t("Skid running (panel)", "کارکرد اسکید (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Start_Request_Intent", t("Start request intent", "قصد درخواست راه‌اندازی"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "SKID_START", requiresConfirmation: true },
      description: t(
        "A recorded statement that an authorised human asked for a start. It is engineering metadata: it drives no plant object here, and the controller's own permissives decide whether the request is honoured.",
        "ثبت این که یک انسانِ مجاز درخواست راه‌اندازی داده است. یک فرادادهٔ مهندسی است: اینجا هیچ شیء فرایندی را به حرکت درنمی‌آورد و مجوزهای خود کنترلر تصمیم می‌گیرند که درخواست پذیرفته شود یا نه.",
      ),
    }),
    a.node("SCADA_TAG", "HMI_Alarm_Ack_Cmd", t("Alarm acknowledge command", "فرمان تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "ALARM_ACK", requiresConfirmation: true },
    }),
    a.node("SCADA_TAG", "HMI_Kpi_Published", t("Published KPI snapshot", "تصویر منتشرشدهٔ شاخص‌ها"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "REAL", accessMode: "READ_WRITE" } }),
    a.node("HMI_SCREEN", "Screen_SkidOverview", t("Skid overview", "نمای کلی اسکید"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_SCREEN", "Screen_Alarms", t("Active alarms", "آلارم‌های فعال"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_OBJECT", "Ind_SkidStatus", t("Skid status indicator", "نشانگر وضعیت اسکید"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_OBJECT", "Trend_PermeateQuality", t("Permeate quality trend", "روند کیفیت آب محصول"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_OBJECT", "Btn_StartRequest", t("Start request button", "دکمهٔ درخواست راه‌اندازی"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "SKID_START", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Banner_ActiveAlarms", t("Active alarm banner", "نوار آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "ALARM_ACK", requiresConfirmation: true },
    }),
    a.node("SCRIPT", "OnStartRequestIntent", t("Start request intent handler", "پردازندهٔ قصد درخواست راه‌اندازی"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "SKID_START" },
    }),
    a.node("SCRIPT", "OnAlarmAcknowledge", t("Alarm acknowledge handler", "پردازندهٔ تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "ALARM_ACK" },
    }),
    a.node("SCRIPT", "OnKpiPublish", t("KPI publication routine", "روال انتشار شاخص‌ها"), {
      domain: "OPERATOR_INTERFACE",
      description: t(
        "Scheduled on the panel. No operator invokes it, so it declares no role and humanInvokable is deliberately left undeclared: absence means false.",
        "روی پنل زمان‌بندی شده است. هیچ اپراتوری آن را فراخوانی نمی‌کند، بنابراین هیچ نقشی اعلام نمی‌کند و humanInvokable عمداً اعلام‌نشده مانده است: نبودن یعنی نادرست.",
      ),
    }),
    a.node("ROLE", "Role_PlantOperator", t("Plant operator", "اپراتور بهره‌برداری")),
    a.node("ROLE", "Role_ProcessEngineer", t("Process engineer", "مهندس فرایند")),
    a.node("AUDIT_EVENT_TYPE", "Audit_StartRequestIntentRecorded", t("Start request intent recorded", "ثبت قصد درخواست راه‌اندازی")),
    a.node("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged", t("Alarm acknowledged", "تأیید آلارم")),
    a.node("AUDIT_EVENT_TYPE", "Audit_KpiPublishRecord", t("KPI publication record", "رکورد انتشار شاخص‌ها")),

    /* KPI and evidence */
    a.node("KPI", "KPI_PRODUCTION_VOLUME", t("Produced volume", "حجم تولیدشده"), { domain: "PROCESS", attributes: { unit: "m3", formula: "integrated permeate flow" } }),
    a.node("KPI", "KPI_RECOVERY", t("Recovery", "بازیابی"), { domain: "PROCESS", attributes: { unit: "%", formula: "permeate flow / feed flow" } }),
    a.node("KPI", "KPI_SPECIFIC_ENERGY", t("Specific energy", "انرژی ویژه"), { domain: "ENERGY", attributes: { unit: "kWh/m3", formula: "high-pressure pump energy / permeate volume" } }),
    a.node("KPI", "KPI_SALT_REJECTION", t("Salt rejection", "دفع نمک"), { domain: "QUALITY", attributes: { unit: "%", formula: "(feed conductivity - permeate conductivity) / feed conductivity" } }),
    a.node("EVIDENCE_SOURCE", "HIST_PROCESS_TREND", t("Process trend archive", "بایگانی روند فرایند"), { domain: "MAINTENANCE", attributes: { retentionDays: 400, sampleIntervalSeconds: 5 } }),
    a.node("EVIDENCE_SOURCE", "HIST_QUALITY_TREND", t("Quality trend archive", "بایگانی روند کیفیت"), { domain: "QUALITY", attributes: { retentionDays: 730, sampleIntervalSeconds: 30 } }),
    a.node("EVIDENCE_SOURCE", "HIST_PUMP_EVENT_LOG", t("Pump event log", "گزارش رویدادهای پمپ"), { domain: "MAINTENANCE", attributes: { retentionDays: 400 } }),
    a.node("EVIDENCE_SOURCE", "HIST_CPU_DIAGNOSTIC_BUFFER", t("CPU diagnostic buffer", "بافر تشخیصی پردازنده"), { domain: "NETWORK", attributes: { retentionDays: 90 } }),
    a.node("EVIDENCE_SOURCE", "HIST_SEQUENCE_LOG", t("Sequence step log", "گزارش گام‌های توالی"), { domain: "CONTROL_LOGIC", attributes: { retentionDays: 400 } }),
    a.node("EVIDENCE_SOURCE", "HIST_OPERATOR_AUDIT_LOG", t("Operator audit log", "گزارش ممیزی اپراتور"), { domain: "OPERATOR_INTERFACE", attributes: { retentionDays: 1825 } }),

    /* Fault modes */
    a.node("FAULT_MODE", "FM_FEED_LEVEL_TX_FAILURE", t("Raw tank level transmitter failure", "خرابی ترانسمیتر سطح مخزن آب خام"), {
      domain: "FIELD_IO",
      attributes: { faultClass: "SENSOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_DUTY_PUMP_DRIVE_TRIP", t("Duty feed pump drive trip", "تریپ درایو پمپ تغذیهٔ اصلی"), {
      domain: "DRIVES",
      attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
    }),
    a.node("FAULT_MODE", "FM_STANDBY_PUMP_UNAVAILABLE", t("Standby pump unavailable at changeover", "در دسترس نبودن پمپ پشتیبان هنگام تعویض"), {
      domain: "MECHANICAL",
      attributes: { faultClass: "PERMISSIVE_MISSING", subsystem: "MECHANICAL" },
    }),
    a.node("FAULT_MODE", "FM_CARTRIDGE_FILTER_FOULING", t("Cartridge filter fouled", "گرفتگی فیلتر کارتریجی"), {
      domain: "PROCESS",
      attributes: { faultClass: "BLOCKAGE", subsystem: "PROCESS" },
    }),
    a.node("FAULT_MODE", "FM_HP_VALVE_POSITION_DISCREPANCY", t("High-pressure valve not following demand", "پیروی نکردن شیر فشار قوی از فرمان"), {
      domain: "FIELD_IO",
      attributes: { faultClass: "ACTUATOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_MEMBRANE_SALT_PASSAGE", t("Membrane salt passage", "عبور نمک از غشا"), {
      domain: "QUALITY",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "PROCESS" },
    }),
    a.node("FAULT_MODE", "FM_PROFINET_COMMS_LOSS", t("PROFINET communications lost", "قطع ارتباط پروفینت"), {
      domain: "NETWORK",
      attributes: { faultClass: "COMMUNICATION_LOSS", subsystem: "NETWORK" },
    }),
    a.node("FAULT_MODE", "FM_CIP_INTERLOCK_ACTIVE", t("CIP interlock holding the skid", "نگه‌داشتن اسکید توسط اینترلاک شست‌وشو"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "INTERLOCK_ACTIVE", subsystem: "SAFETY_CIRCUIT" },
    }),
    a.node("FAULT_MODE", "FM_SKID_LEFT_IN_LOCAL", t("Skid left in local mode", "رهاشدن اسکید در حالت محلی"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { faultClass: "INCORRECT_MODE", subsystem: "HMI" },
    }),

    /* Safe actions */
    a.node("SAFE_ACTION", "SA_COMPARE_LEVEL_TO_SIGHT_GLASS", t("Compare the level reading to the tank sight glass", "مقایسهٔ قرائت سطح با شیشهٔ نمایانگر مخزن"), { domain: "FIELD_IO" }),
    a.node("SAFE_ACTION", "SA_READ_FEED_PUMP_FAULT_HISTORY", t("Read the feed pump drive fault history", "خواندن تاریخچهٔ خطای درایو پمپ تغذیه"), { domain: "DRIVES" }),
    a.node("SAFE_ACTION", "SA_VERIFY_STANDBY_PUMP_READINESS", t("Verify standby pump readiness and isolation state", "بررسی آمادگی پمپ پشتیبان و وضعیت جداسازی آن"), { domain: "MECHANICAL" }),
    a.node("SAFE_ACTION", "SA_INSPECT_AND_REPLACE_CARTRIDGE_ELEMENTS", t("Inspect and replace the cartridge elements", "بازرسی و تعویض المان‌های کارتریج"), {
      domain: "PROCESS",
      description: t(
        "Under the skid's own isolation and depressurisation procedure. Nothing is opened while the high-pressure section is live.",
        "تحت دستورالعمل جداسازی و تخلیهٔ فشار خود اسکید. تا زمانی که بخش فشار قوی برق‌دار و تحت فشار است، هیچ‌چیز باز نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_HP_VALVE_ACTUATOR_AND_FEEDBACK", t("Inspect the high-pressure valve actuator and its feedback", "بازرسی عملگر شیر فشار قوی و بازخورد آن"), { domain: "FIELD_IO" }),
    a.node("SAFE_ACTION", "SA_REVIEW_MEMBRANE_PERFORMANCE_TREND", t("Review the membrane performance trend", "بازبینی روند عملکرد غشا"), { domain: "QUALITY" }),
    a.node("SAFE_ACTION", "SA_VERIFY_PROFINET_AND_CPU_DIAGNOSTICS", t("Verify the PROFINET link and read the CPU diagnostic buffer", "بررسی پیوند پروفینت و خواندن بافر تشخیصی پردازنده"), { domain: "NETWORK" }),
    a.node("SAFE_ACTION", "SA_ESCALATE_CIP_CHEMICAL_REVIEW", t("Escalate to a CIP and chemical review", "ارجاع به بازبینی شست‌وشو و مواد شیمیایی"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Escalate-only, to a qualified process and safety engineer. No dosing is commanded, advised or simulated, and the CIP interlock is never reset or bridged from here.",
        "فقط ارجاع، به مهندس فرایند و ایمنی واجد صلاحیت. هیچ تزریقی فرمان داده، توصیه یا شبیه‌سازی نمی‌شود و اینترلاک شست‌وشو هرگز از اینجا ریست یا دور زده نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_OPERATOR_AUDIT_LOG", t("Review the operator audit log", "بازبینی گزارش ممیزی اپراتور"), { domain: "OPERATOR_INTERFACE" }),
  ],

  edges: [
    /* Device containment */
    a.edge(D.cpu, B.obMain, "CONTAINS"),
    a.edge(D.cpu, B.obStartup, "CONTAINS"),
    a.edge(D.cpu, B.fbAnalog, "CONTAINS"),
    a.edge(D.cpu, B.fbPump, "CONTAINS"),
    a.edge(D.cpu, B.fbValve, "CONTAINS"),
    a.edge(D.cpu, B.fbSequence, "CONTAINS"),
    a.edge(D.cpu, B.fcScale, "CONTAINS"),
    a.edge(D.cpu, B.fcQuality, "CONTAINS"),
    a.edge(D.cpu, B.fcKpi, "CONTAINS"),
    a.edge(D.cpu, B.dbInstance, "CONTAINS"),
    a.edge(D.cpu, B.dbConfig, "CONTAINS"),
    a.edge(D.cpu, B.dbAlarms, "CONTAINS"),
    a.edge(D.cpu, B.dbRecipe, "CONTAINS"),
    a.edge(D.cpu, B.udtPump, "CONTAINS"),
    a.edge(D.cpu, B.udtValve, "CONTAINS"),
    a.edge(D.cpu, B.udtAnalog, "CONTAINS"),
    a.edge(D.cpu, B.udtSeqState, "CONTAINS"),
    a.edge(D.cpu, SQ, "CONTAINS"),
    a.edge(D.io, IO.feedPressureAi, "CONTAINS"),
    a.edge(D.io, IO.rawLevelAi, "CONTAINS"),
    a.edge(D.io, IO.permeateCondAi, "CONTAINS"),
    a.edge(D.io, IO.cartridgeDpAi, "CONTAINS"),
    a.edge(D.io, IO.p1FaultDi, "CONTAINS"),
    a.edge(D.io, IO.vHpOpenDi, "CONTAINS"),
    a.edge(D.panel, H.overview, "CONTAINS"),
    a.edge(D.panel, H.alarms, "CONTAINS"),
    a.edge(D.panel, AQ, "CONTAINS"),
    a.edge(H.overview, HO.skidStatus, "CONTAINS"),
    a.edge(H.overview, HO.qualityTrend, "CONTAINS"),
    a.edge(H.overview, HO.startButton, "CONTAINS"),
    a.edge(H.alarms, HO.alarmBanner, "CONTAINS"),
    a.edge(SQ, S.idle, "CONTAINS"),
    a.edge(SQ, S.permissive, "CONTAINS"),
    a.edge(SQ, S.pressurise, "CONTAINS"),
    a.edge(SQ, S.produce, "CONTAINS"),
    a.edge(SQ, S.flush, "CONTAINS"),
    a.edge(SQ, S.stop, "CONTAINS"),
    a.edge(AQ, AS.normal, "CONTAINS"),
    a.edge(AQ, AS.unack, "CONTAINS"),
    a.edge(AQ, AS.acked, "CONTAINS"),
    a.edge(AQ, AS.rtnUnack, "CONTAINS"),

    /* ── SCL-derived relationships ─────────────────────────────────────────
     * Every edge below restates a relationship the source text itself states.
     * `sourceAgreementReport` re-derives them from the SCL and fails if one is
     * missing, so the graph cannot drift away from the program. */

    /* OB_STARTUP */
    a.edge(B.obStartup, T.seqStep, "WRITES"),
    a.edge(B.obStartup, T.skidRunning, "WRITES"),
    a.edge(B.obStartup, T.divertActive, "WRITES"),
    a.edge(B.obStartup, T.dutySelect, "WRITES"),
    a.edge(B.obStartup, T.alarmWord, "WRITES"),

    /* OB_MAIN */
    a.edge(B.obMain, B.fbAnalog, "CALLS"),
    a.edge(B.obMain, B.fbPump, "CALLS"),
    a.edge(B.obMain, B.fbValve, "CALLS"),
    a.edge(B.obMain, B.fbSequence, "CALLS"),
    a.edge(B.obMain, B.fcKpi, "CALLS"),

    /* FB_ANALOG_VALIDATION */
    a.edge(B.fbAnalog, B.fcScale, "CALLS"),
    a.edge(B.fbAnalog, T.feedPressure, "READS"),
    a.edge(B.fbAnalog, T.rawTankLevel, "READS"),
    a.edge(B.fbAnalog, T.permeateConductivity, "READS"),
    a.edge(B.fbAnalog, T.feedPressureValid, "READS"),
    a.edge(B.fbAnalog, T.rawLevelValid, "READS"),
    a.edge(B.fbAnalog, T.permeateCondValid, "READS"),
    a.edge(B.fbAnalog, T.feedPressureValidPrev, "READS"),
    a.edge(B.fbAnalog, T.analogRecoveryCount, "READS"),
    a.edge(B.fbAnalog, T.pnLinkOk, "READS"),
    a.edge(B.fbAnalog, T.permeateQualityOk, "READS"),
    a.edge(B.fbAnalog, B.dbConfig, "READS"),
    a.edge(B.fbAnalog, T.feedPressureValid, "WRITES"),
    a.edge(B.fbAnalog, T.rawLevelValid, "WRITES"),
    a.edge(B.fbAnalog, T.permeateCondValid, "WRITES"),
    a.edge(B.fbAnalog, T.almAnalogInvalid, "WRITES"),
    a.edge(B.fbAnalog, T.analogRecoveryCount, "WRITES"),
    a.edge(B.fbAnalog, T.feedPressureValidPrev, "WRITES"),
    a.edge(B.fbAnalog, T.almCommsLost, "WRITES"),
    a.edge(B.fbAnalog, T.dataStale, "WRITES"),
    a.edge(B.fbAnalog, P.feedAvailable, "WRITES"),
    a.edge(B.fbAnalog, P.feedPressureOk, "WRITES"),
    a.edge(B.fbAnalog, P.qualityOk, "WRITES"),

    /* FB_PUMP_SUPERVISION */
    a.edge(B.fbPump, T.p1Fault, "READS"),
    a.edge(B.fbPump, T.p1FaultPrev, "READS"),
    a.edge(B.fbPump, T.p2Available, "READS"),
    a.edge(B.fbPump, T.skidRunning, "READS"),
    a.edge(B.fbPump, T.dutySelect, "READS"),
    a.edge(B.fbPump, T.p1Running, "READS"),
    a.edge(B.fbPump, T.pumpHoursDuty, "READS"),
    a.edge(B.fbPump, T.almDutyPumpTrip, "WRITES"),
    a.edge(B.fbPump, T.dutySelect, "WRITES"),
    a.edge(B.fbPump, T.almNoStandbyPump, "WRITES"),
    a.edge(B.fbPump, T.skidRunning, "WRITES"),
    a.edge(B.fbPump, T.p1FaultPrev, "WRITES"),
    a.edge(B.fbPump, T.p1Demand, "WRITES"),
    a.edge(B.fbPump, T.p2Demand, "WRITES"),
    a.edge(B.fbPump, T.pumpHoursDuty, "WRITES"),

    /* FB_VALVE_SUPERVISION */
    a.edge(B.fbValve, T.vHpDemand, "READS"),
    a.edge(B.fbValve, T.vHpOpenFb, "READS"),
    a.edge(B.fbValve, I.cipActive, "READS"),
    a.edge(B.fbValve, T.vInletOpenFb, "READS"),
    a.edge(B.fbValve, T.vFlushOpenFb, "READS"),
    a.edge(B.fbValve, T.valveMatrixReady, "READS"),
    a.edge(B.fbValve, T.almValveDiscrepancy, "WRITES"),
    a.edge(B.fbValve, T.almCipLockout, "WRITES"),
    a.edge(B.fbValve, T.valveMatrixReady, "WRITES"),
    a.edge(B.fbValve, P.valvesReady, "WRITES"),

    /* FB_RO_SEQUENCE */
    a.edge(B.fbSequence, I.lowSuction, "READS"),
    a.edge(B.fbSequence, I.hpOverpressure, "READS"),
    a.edge(B.fbSequence, T.seqStep, "READS"),
    a.edge(B.fbSequence, T.startRequest, "READS"),
    a.edge(B.fbSequence, T.modeAuto, "READS"),
    a.edge(B.fbSequence, T.modeRemote, "READS"),
    a.edge(B.fbSequence, P.feedAvailable, "READS"),
    a.edge(B.fbSequence, P.valvesReady, "READS"),
    a.edge(B.fbSequence, P.feedPressureOk, "READS"),
    a.edge(B.fbSequence, T.hpPumpRunning, "READS"),
    a.edge(B.fbSequence, P.qualityOk, "READS"),
    a.edge(B.fbSequence, T.stopRequest, "READS"),
    a.edge(B.fbSequence, T.permeateQualityOk, "READS"),
    a.edge(B.fbSequence, T.seqStep, "WRITES"),
    a.edge(B.fbSequence, T.skidRunning, "WRITES"),
    a.edge(B.fbSequence, T.divertActive, "WRITES"),

    /* FC_SCALE_ANALOG */
    a.edge(B.fcScale, T.feedPressureRaw, "READS"),
    a.edge(B.fcScale, T.rawLevelRaw, "READS"),
    a.edge(B.fcScale, T.permeateCondRaw, "READS"),
    a.edge(B.fcScale, T.feedPressure, "WRITES"),
    a.edge(B.fcScale, T.rawTankLevel, "WRITES"),
    a.edge(B.fcScale, T.permeateConductivity, "WRITES"),

    /* FC_QUALITY_CALC */
    a.edge(B.fcQuality, T.feedConductivity, "READS"),
    a.edge(B.fcQuality, T.permeateConductivity, "READS"),
    a.edge(B.fcQuality, B.dbRecipe, "READS"),
    a.edge(B.fcQuality, T.permeateQualityOk, "READS"),
    a.edge(B.fcQuality, T.saltRejection, "WRITES"),
    a.edge(B.fcQuality, T.permeateQualityOk, "WRITES"),
    a.edge(B.fcQuality, T.divertActive, "WRITES"),
    a.edge(B.fcQuality, T.almPermeateQuality, "WRITES"),

    /* FC_KPI_CALC */
    a.edge(B.fcKpi, B.fcQuality, "CALLS"),
    a.edge(B.fcKpi, T.permeateFlow, "READS"),
    a.edge(B.fcKpi, T.feedFlow, "READS"),
    a.edge(B.fcKpi, T.hpPumpPower, "READS"),
    a.edge(B.fcKpi, T.prodCountM3, "READS"),
    a.edge(B.fcKpi, T.cartridgeDp, "READS"),
    a.edge(B.fcKpi, B.dbConfig, "READS"),
    a.edge(B.fcKpi, T.recoveryPct, "WRITES"),
    a.edge(B.fcKpi, T.specificEnergy, "WRITES"),
    a.edge(B.fcKpi, T.prodCountM3, "WRITES"),
    a.edge(B.fcKpi, T.almFilterDp, "WRITES"),

    /* ── Graph-only engineering structure ──────────────────────────────── */

    /* Field channels */
    a.edge(T.feedPressureRaw, IO.feedPressureAi, "BOUND_TO"),
    a.edge(T.rawLevelRaw, IO.rawLevelAi, "BOUND_TO"),
    a.edge(T.permeateCondRaw, IO.permeateCondAi, "BOUND_TO"),
    a.edge(T.cartridgeDp, IO.cartridgeDpAi, "BOUND_TO"),
    a.edge(T.p1Fault, IO.p1FaultDi, "BOUND_TO"),
    a.edge(T.vHpOpenFb, IO.vHpOpenDi, "BOUND_TO"),

    /* What the tags monitor */
    a.edge(T.rawTankLevel, EQ.rawTank, "MONITORS"),
    a.edge(T.feedPressure, EQ.feedP1, "MONITORS"),
    a.edge(T.p1Running, EQ.feedP1, "MONITORS"),
    a.edge(T.p1Fault, EQ.feedP1, "MONITORS"),
    a.edge(T.p2Running, EQ.feedP2, "MONITORS"),
    a.edge(T.p2Available, EQ.feedP2, "MONITORS"),
    a.edge(T.mmfDp, EQ.mmFilter, "MONITORS"),
    a.edge(T.backwashActive, EQ.mmFilter, "MONITORS"),
    a.edge(T.cartridgeDp, EQ.cartridge, "MONITORS"),
    a.edge(T.hpPumpRunning, EQ.hpPump, "MONITORS"),
    a.edge(T.hpPumpFault, EQ.hpPump, "MONITORS"),
    a.edge(T.hpPressure, EQ.hpPump, "MONITORS"),
    a.edge(T.hpPumpPower, EQ.hpPump, "MONITORS"),
    a.edge(T.stage1Pressure, EQ.roStage1, "MONITORS"),
    a.edge(T.stage2Pressure, EQ.roStage2, "MONITORS"),
    a.edge(T.permeateFlow, EQ.permeateTank, "MONITORS"),
    a.edge(T.permeateConductivity, EQ.permeateTank, "MONITORS"),
    a.edge(T.rejectFlow, EQ.rejectLine, "MONITORS"),
    a.edge(T.feedFlow, EQ.rawTank, "MONITORS"),
    a.edge(T.feedConductivity, EQ.rawTank, "MONITORS"),
    a.edge(T.cipChemFlow, EQ.cipSkid, "MONITORS"),
    a.edge(T.cipTankLevel, EQ.cipSkid, "MONITORS"),
    a.edge(T.vHpOpenFb, EQ.valveMatrix, "MONITORS"),
    a.edge(T.vInletOpenFb, EQ.valveMatrix, "MONITORS"),
    a.edge(T.vFlushOpenFb, EQ.valveMatrix, "MONITORS"),
    a.edge(D.vfd, EQ.hpPump, "MONITORS"),
    a.edge(D.analyser, EQ.permeateTank, "MONITORS"),

    /* Sequence chain and gating */
    ...chainStates(a, [S.idle, S.permissive, S.pressurise, S.produce, S.flush, S.stop]),
    ...chainStates(a, [AS.normal, AS.unack, AS.acked, AS.rtnUnack]),
    a.edge(
      AS.rtnUnack,
      AS.normal,
      "TRANSITIONS_TO",
      t("Acknowledgement of a returned alarm closes the lifecycle", "تأیید آلارمِ بازگشته چرخه را می‌بندد"),
    ),
    a.edge(
      S.stop,
      S.idle,
      "TRANSITIONS_TO",
      t("The stop step returns the sequence to idle, and it stays there", "گام توقف، توالی را به حالت بی‌کار بازمی‌گرداند و همان‌جا می‌ماند"),
    ),
    a.edge(P.feedAvailable, SQ, "GATES"),
    a.edge(P.valvesReady, SQ, "GATES"),
    a.edge(P.feedPressureOk, S.pressurise, "GATES"),
    a.edge(P.qualityOk, S.produce, "GATES"),
    a.edge(I.lowSuction, S.pressurise, "BLOCKS"),
    a.edge(I.hpOverpressure, S.produce, "BLOCKS"),
    a.edge(I.cipActive, SQ, "BLOCKS"),

    /* What the permissives and interlocks read */
    a.edge(P.feedAvailable, T.rawTankLevel, "READS"),
    a.edge(P.feedAvailable, T.rawLevelValid, "READS"),
    a.edge(P.feedPressureOk, T.feedPressure, "READS"),
    a.edge(P.feedPressureOk, T.feedPressureValid, "READS"),
    a.edge(P.valvesReady, T.valveMatrixReady, "READS"),
    a.edge(P.qualityOk, T.permeateConductivity, "READS"),
    a.edge(P.qualityOk, T.permeateQualityOk, "READS"),
    a.edge(I.lowSuction, T.feedPressure, "READS"),
    a.edge(I.hpOverpressure, T.hpPressure, "READS"),
    a.edge(I.cipActive, T.cipChemFlow, "READS"),

    /* Alarms */
    a.edge(T.almAnalogInvalid, AL.analogInvalid, "RAISES"),
    a.edge(T.almDutyPumpTrip, AL.dutyPumpTrip, "RAISES"),
    a.edge(T.almNoStandbyPump, AL.noStandby, "RAISES"),
    a.edge(T.almFilterDp, AL.filterDp, "RAISES"),
    a.edge(T.almValveDiscrepancy, AL.valveDiscrepancy, "RAISES"),
    a.edge(T.almPermeateQuality, AL.permeateQuality, "RAISES"),
    a.edge(T.almCommsLost, AL.commsLost, "RAISES"),
    a.edge(T.almCipLockout, AL.cipLockout, "RAISES"),
    a.edge(T.modeRemote, AL.skidInLocal, "RAISES"),

    /* Operator surface */
    a.edge(ST.feedPressure, T.feedPressure, "MIRRORS"),
    a.edge(ST.permeateCond, T.permeateConductivity, "MIRRORS"),
    a.edge(ST.skidRunning, T.skidRunning, "MIRRORS"),
    a.edge(H.overview, ST.feedPressure, "DISPLAYS"),
    a.edge(H.overview, ST.permeateCond, "DISPLAYS"),
    a.edge(H.overview, ST.skidRunning, "DISPLAYS"),
    a.edge(H.overview, ST.startIntent, "COMMANDS"),
    a.edge(H.overview, H.alarms, "NAVIGATES_TO"),
    a.edge(H.alarms, ST.ackCmd, "COMMANDS"),
    a.edge(H.alarms, H.overview, "NAVIGATES_TO"),
    a.edge(HO.skidStatus, ST.skidRunning, "DISPLAYS"),
    a.edge(HO.qualityTrend, ST.permeateCond, "DISPLAYS"),
    a.edge(HO.startButton, ST.startIntent, "COMMANDS"),
    a.edge(HO.alarmBanner, ST.ackCmd, "COMMANDS"),
    a.edge(SC.startIntent, ST.feedPressure, "READS"),
    a.edge(SC.startIntent, ST.startIntent, "WRITES"),
    a.edge(SC.alarmAck, ST.ackCmd, "WRITES"),
    a.edge(SC.kpiPublish, ST.skidRunning, "READS"),
    a.edge(SC.kpiPublish, ST.kpiPublished, "WRITES"),
    a.edge(SC.startIntent, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.startIntent, AE.startIntent, "EMITS"),
    a.edge(SC.alarmAck, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.alarmAck, AE.alarmAck, "EMITS"),
    // No REQUIRES_ROLE: nothing human invokes the publication routine.
    a.edge(SC.kpiPublish, AE.kpiRecord, "EMITS"),

    /* Historian and KPI */
    a.edge(EV.processTrend, T.feedPressure, "RECORDS"),
    a.edge(EV.processTrend, T.rawTankLevel, "RECORDS"),
    a.edge(EV.processTrend, T.cartridgeDp, "RECORDS"),
    a.edge(EV.processTrend, T.hpPressure, "RECORDS"),
    a.edge(EV.processTrend, T.feedFlow, "RECORDS"),
    a.edge(EV.qualityTrend, T.permeateConductivity, "RECORDS"),
    a.edge(EV.qualityTrend, T.saltRejection, "RECORDS"),
    a.edge(EV.qualityTrend, T.feedConductivity, "RECORDS"),
    a.edge(EV.pumpEventLog, T.p1Fault, "RECORDS"),
    a.edge(EV.pumpEventLog, T.p2Available, "RECORDS"),
    a.edge(EV.pumpEventLog, T.pumpHoursDuty, "RECORDS"),
    a.edge(EV.cpuDiagnostics, T.pnLinkOk, "RECORDS"),
    a.edge(EV.cpuDiagnostics, T.telemetryAge, "RECORDS"),
    a.edge(EV.seqLog, T.seqStep, "RECORDS"),
    a.edge(EV.seqLog, T.vHpDemand, "RECORDS"),
    a.edge(EV.auditLog, T.modeRemote, "RECORDS"),
    a.edge(K.production, T.prodCountM3, "DERIVED_FROM"),
    a.edge(K.recovery, T.recoveryPct, "DERIVED_FROM"),
    a.edge(K.recovery, T.permeateFlow, "DERIVED_FROM"),
    a.edge(K.recovery, T.feedFlow, "DERIVED_FROM"),
    a.edge(K.specificEnergy, T.specificEnergy, "DERIVED_FROM"),
    a.edge(K.specificEnergy, T.hpPumpPower, "DERIVED_FROM"),
    a.edge(K.quality, T.saltRejection, "DERIVED_FROM"),
    a.edge(K.quality, T.permeateConductivity, "DERIVED_FROM"),
    a.edge(K.quality, T.feedConductivity, "DERIVED_FROM"),

    /* Fault modes */
    a.edge(FM.levelTxFailure, AL.analogInvalid, "EXPLAINS"),
    a.edge(T.rawTankLevel, FM.levelTxFailure, "EVIDENCE_FOR"),
    a.edge(T.rawLevelValid, FM.levelTxFailure, "EVIDENCE_FOR"),
    a.edge(T.almAnalogInvalid, FM.levelTxFailure, "EVIDENCE_FOR"),
    a.edge(IO.rawLevelAi, FM.levelTxFailure, "EVIDENCE_FOR"),
    a.edge(EV.processTrend, FM.levelTxFailure, "EVIDENCE_FOR"),

    a.edge(FM.dutyPumpTrip, AL.dutyPumpTrip, "EXPLAINS"),
    a.edge(T.p1Fault, FM.dutyPumpTrip, "EVIDENCE_FOR"),
    a.edge(T.p1Running, FM.dutyPumpTrip, "EVIDENCE_FOR"),
    a.edge(T.almDutyPumpTrip, FM.dutyPumpTrip, "EVIDENCE_FOR"),
    a.edge(T.feedPressure, FM.dutyPumpTrip, "EVIDENCE_FOR"),
    a.edge(EV.pumpEventLog, FM.dutyPumpTrip, "EVIDENCE_FOR"),

    a.edge(FM.standbyUnavailable, AL.noStandby, "EXPLAINS"),
    a.edge(T.p2Available, FM.standbyUnavailable, "EVIDENCE_FOR"),
    a.edge(T.p2Running, FM.standbyUnavailable, "EVIDENCE_FOR"),
    a.edge(T.almNoStandbyPump, FM.standbyUnavailable, "EVIDENCE_FOR"),
    a.edge(T.skidRunning, FM.standbyUnavailable, "EVIDENCE_FOR"),
    a.edge(EV.pumpEventLog, FM.standbyUnavailable, "EVIDENCE_FOR"),

    a.edge(FM.cartridgeFouling, AL.filterDp, "EXPLAINS"),
    a.edge(T.cartridgeDp, FM.cartridgeFouling, "EVIDENCE_FOR"),
    a.edge(T.almFilterDp, FM.cartridgeFouling, "EVIDENCE_FOR"),
    a.edge(T.feedFlow, FM.cartridgeFouling, "EVIDENCE_FOR"),
    a.edge(T.hpPressure, FM.cartridgeFouling, "EVIDENCE_FOR"),
    a.edge(EV.processTrend, FM.cartridgeFouling, "EVIDENCE_FOR"),

    a.edge(FM.valveDiscrepancy, AL.valveDiscrepancy, "EXPLAINS"),
    a.edge(T.vHpDemand, FM.valveDiscrepancy, "EVIDENCE_FOR"),
    a.edge(T.vHpOpenFb, FM.valveDiscrepancy, "EVIDENCE_FOR"),
    a.edge(T.almValveDiscrepancy, FM.valveDiscrepancy, "EVIDENCE_FOR"),
    a.edge(IO.vHpOpenDi, FM.valveDiscrepancy, "EVIDENCE_FOR"),
    a.edge(EV.seqLog, FM.valveDiscrepancy, "EVIDENCE_FOR"),

    a.edge(FM.membraneQuality, AL.permeateQuality, "EXPLAINS"),
    a.edge(T.permeateConductivity, FM.membraneQuality, "EVIDENCE_FOR"),
    a.edge(T.saltRejection, FM.membraneQuality, "EVIDENCE_FOR"),
    a.edge(T.permeateQualityOk, FM.membraneQuality, "EVIDENCE_FOR"),
    a.edge(T.divertActive, FM.membraneQuality, "EVIDENCE_FOR"),
    a.edge(T.almPermeateQuality, FM.membraneQuality, "EVIDENCE_FOR"),
    a.edge(EV.qualityTrend, FM.membraneQuality, "EVIDENCE_FOR"),

    a.edge(FM.commsLoss, AL.commsLost, "EXPLAINS"),
    a.edge(T.pnLinkOk, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(T.telemetryAge, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(T.dataStale, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(T.almCommsLost, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(EV.cpuDiagnostics, FM.commsLoss, "EVIDENCE_FOR"),

    a.edge(FM.cipInterlock, AL.cipLockout, "EXPLAINS"),
    a.edge(I.cipActive, FM.cipInterlock, "EVIDENCE_FOR"),
    a.edge(T.cipChemFlow, FM.cipInterlock, "EVIDENCE_FOR"),
    a.edge(T.cipTankLevel, FM.cipInterlock, "EVIDENCE_FOR"),
    a.edge(T.almCipLockout, FM.cipInterlock, "EVIDENCE_FOR"),
    a.edge(T.valveMatrixReady, FM.cipInterlock, "EVIDENCE_FOR"),
    a.edge(EV.seqLog, FM.cipInterlock, "EVIDENCE_FOR"),

    a.edge(FM.leftInLocal, AL.skidInLocal, "EXPLAINS"),
    a.edge(T.modeRemote, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(T.startRequest, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(T.seqStep, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(EV.auditLog, FM.leftInLocal, "EVIDENCE_FOR"),

    /* Safe actions */
    a.edge(SA.levelCompare, FM.levelTxFailure, "VERIFIES"),
    a.edge(SA.pumpHistory, FM.dutyPumpTrip, "VERIFIES"),
    a.edge(SA.standbyCheck, FM.standbyUnavailable, "VERIFIES"),
    a.edge(SA.cartridgeInspect, FM.cartridgeFouling, "VERIFIES"),
    a.edge(SA.valveInspect, FM.valveDiscrepancy, "VERIFIES"),
    a.edge(SA.membraneReview, FM.membraneQuality, "VERIFIES"),
    a.edge(SA.pnDiagnostics, FM.commsLoss, "VERIFIES"),
    a.edge(SA.cipReview, FM.cipInterlock, "VERIFIES"),
    a.edge(SA.auditReview, FM.leftInLocal, "VERIFIES"),
  ],

  artifacts: [
    {
      local: "OB_STARTUP",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "OB100_Startup.scl",
      declares: [B.obStartup],
      provenance: { subsystem: "RO_SKID_A", sourceId: "OB100", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: OB_STARTUP_SCL,
    },
    {
      local: "OB_MAIN",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "OB1_Main.scl",
      declares: [B.obMain],
      provenance: { subsystem: "RO_SKID_A", sourceId: "OB1", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: OB_MAIN_SCL,
    },
    {
      local: "FB_ANALOG_VALIDATION",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1310_AnalogValidation.scl",
      declares: [B.fbAnalog, P.feedAvailable, P.feedPressureOk, P.qualityOk],
      provenance: { subsystem: "RO_SKID_A", sourceId: "FB1310", domain: "FIELD_IO", safetyClass: "NON_SAFETY" },
      content: FB_ANALOG_VALIDATION_SCL,
    },
    {
      local: "FB_PUMP_SUPERVISION",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1320_PumpSupervision.scl",
      declares: [B.fbPump, EQ.feedP1, EQ.feedP2],
      provenance: { subsystem: "RO_SKID_A", sourceId: "FB1320", domain: "MECHANICAL", safetyClass: "NON_SAFETY" },
      content: FB_PUMP_SUPERVISION_SCL,
    },
    {
      local: "FB_VALVE_SUPERVISION",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1330_ValveSupervision.scl",
      declares: [B.fbValve, P.valvesReady, EQ.valveMatrix],
      provenance: { subsystem: "RO_SKID_A", sourceId: "FB1330", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: FB_VALVE_SUPERVISION_SCL,
    },
    {
      local: "FB_RO_SEQUENCE",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1340_RoSequence.scl",
      declares: [B.fbSequence, SQ, S.idle, S.permissive, S.pressurise, S.produce, S.flush, S.stop],
      provenance: { subsystem: "RO_SKID_A", sourceId: "FB1340", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: FB_RO_SEQUENCE_SCL,
    },
    {
      local: "FC_LIBRARY",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FC1350_1370_Library.scl",
      declares: [B.fcScale, B.fcQuality, B.fcKpi, K.production, K.recovery, K.specificEnergy, K.quality],
      provenance: { subsystem: "RO_SKID_A", sourceId: "FC1350", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: FC_LIBRARY_SCL,
    },
    {
      local: "DB_DEFINITIONS",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "DB1310_1313_Definitions.scl",
      declares: [B.dbInstance, B.dbConfig, B.dbAlarms, B.dbRecipe],
      provenance: { subsystem: "RO_SKID_A", sourceId: "DB1310", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: DB_DEFINITIONS_SCL,
    },
    {
      local: "UDT_DEFINITIONS",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "UDT_Definitions.scl",
      declares: [B.udtPump, B.udtValve, B.udtAnalog, B.udtSeqState],
      provenance: { subsystem: "RO_SKID_A", sourceId: "UDT", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: UDT_DEFINITIONS_SCL,
    },
    {
      local: "FBD_VALVE_MATRIX",
      language: "FBD_XML",
      layer: "PLC_LOGIC",
      fileName: "FBD1250_ValveMatrix.fbd.xml",
      declares: [T.vHpDemand, T.vHpOpenFb, T.valveMatrixReady, I.cipActive],
      provenance: { subsystem: "RO_SKID_A", sourceId: "FBD1250", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: FBD_VALVE_MATRIX_XML,
    },
  ],

  scenarios: [
    {
      id: "TIA-03-FS-01",
      title: t("Tank level reads above the tank", "قرائت سطح مخزن بالاتر از خود مخزن"),
      narrative: t(
        "The raw-water tank level is reading 118 percent and the controller has flagged the signal invalid. The feed pressure is normal and the plant is drawing water as usual.",
        "سطح مخزن آب خام ۱۱۸ درصد نشان می‌دهد و کنترلر سیگنال را نامعتبر علامت زده است. فشار تغذیه عادی است و واحد مثل همیشه آب برمی‌دارد.",
      ),
      observations: [
        { nodeId: AL.analogInvalid, state: "TRUE" },
        { nodeId: T.rawTankLevel, state: "ABNORMAL", detail: "118% — above the physical range of the tank" },
        { nodeId: T.rawLevelValid, state: "FALSE" },
        { nodeId: T.almAnalogInvalid, state: "TRUE" },
        { nodeId: T.feedPressure, state: "NORMAL" },
        { nodeId: T.pnLinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "SENSOR_FAILURE",
        faultModeId: FM.levelTxFailure,
        supportingNodeIds: [T.rawTankLevel, T.rawLevelValid, AL.analogInvalid],
        expectedMissingNodeIds: [IO.rawLevelAi, EV.processTrend],
        expectedSafeActionIds: [SA.levelCompare],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-03-FS-02",
      title: t("Duty feed pump tripped and the feed pressure fell with it", "تریپ پمپ تغذیهٔ اصلی و افت فشار تغذیه همراه آن"),
      narrative: t(
        "The duty feed pump stopped and its drive is reporting a fault. The feed pressure collapsed at the same moment and the standby pump reports itself available.",
        "پمپ تغذیهٔ اصلی متوقف شد و درایو آن خطا گزارش می‌کند. فشار تغذیه در همان لحظه افت کرد و پمپ پشتیبان خود را در دسترس اعلام می‌کند.",
      ),
      observations: [
        { nodeId: AL.dutyPumpTrip, state: "TRUE" },
        { nodeId: T.p1Fault, state: "TRUE", detail: "drive fault reported" },
        { nodeId: T.p1Running, state: "FALSE" },
        { nodeId: T.almDutyPumpTrip, state: "TRUE" },
        { nodeId: T.feedPressure, state: "ABNORMAL", detail: "collapsed with the pump" },
        { nodeId: T.p2Available, state: "NORMAL" },
        { nodeId: T.pnLinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "DRIVE",
        faultClass: "DRIVE_FAULT",
        faultModeId: FM.dutyPumpTrip,
        supportingNodeIds: [T.p1Fault, T.p1Running, T.feedPressure, AL.dutyPumpTrip],
        expectedMissingNodeIds: [EV.pumpEventLog],
        expectedSafeActionIds: [SA.pumpHistory],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-03-FS-03",
      title: t("Changeover found no standby pump to change over to", "نبود پمپ پشتیبان برای تعویض هنگام سوئیچ"),
      narrative: t(
        "The duty pump tripped and the changeover could not proceed: the standby pump is not reporting itself available and is not running. The skid stopped rather than continuing without a pump.",
        "پمپ اصلی تریپ کرد و تعویض پیش نرفت: پمپ پشتیبان خود را در دسترس اعلام نمی‌کند و در حال کار نیست. اسکید به‌جای ادامه بدون پمپ، متوقف شد.",
      ),
      observations: [
        { nodeId: AL.noStandby, state: "TRUE" },
        { nodeId: T.p2Available, state: "FALSE" },
        { nodeId: T.p2Running, state: "FALSE" },
        { nodeId: T.almNoStandbyPump, state: "TRUE" },
        { nodeId: T.skidRunning, state: "FALSE" },
        { nodeId: T.pnLinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "MECHANICAL",
        faultClass: "PERMISSIVE_MISSING",
        faultModeId: FM.standbyUnavailable,
        supportingNodeIds: [T.p2Available, T.p2Running, T.almNoStandbyPump, AL.noStandby],
        expectedMissingNodeIds: [EV.pumpEventLog],
        expectedSafeActionIds: [SA.standbyCheck],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-03-FS-04",
      title: t("Cartridge filter differential pressure climbing", "افزایش اختلاف فشار فیلتر کارتریجی"),
      narrative: t(
        "The cartridge filter differential pressure has climbed past the configured limit over the week. The feed flow is falling away and the high-pressure discharge is having to work harder for the same permeate.",
        "اختلاف فشار فیلتر کارتریجی طی این هفته از حد پیکربندی‌شده گذشته است. دبی تغذیه رو به کاهش است و بخش فشار قوی برای همان مقدار آب محصول باید بیشتر کار کند.",
      ),
      observations: [
        { nodeId: AL.filterDp, state: "TRUE" },
        { nodeId: T.cartridgeDp, state: "ABNORMAL", detail: "past the configured limit" },
        { nodeId: T.almFilterDp, state: "TRUE" },
        { nodeId: T.feedFlow, state: "ABNORMAL", detail: "falling for the same pump speed" },
        { nodeId: T.hpPressure, state: "ABNORMAL", detail: "higher for the same permeate flow" },
        { nodeId: T.pnLinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "BLOCKAGE",
        faultModeId: FM.cartridgeFouling,
        supportingNodeIds: [T.cartridgeDp, T.feedFlow, T.hpPressure, AL.filterDp],
        expectedMissingNodeIds: [EV.processTrend],
        expectedSafeActionIds: [SA.cartridgeInspect],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-03-FS-05",
      title: t("High-pressure valve does not follow its demand", "پیروی نکردن شیر فشار قوی از فرمان خود"),
      narrative: t(
        "The high-pressure valve has been demanded open for well past its travel time and the open feedback has not made. The sequence is holding and the controller has raised a discrepancy.",
        "شیر فشار قوی مدت‌ها بیش از زمان حرکت خود فرمان باز شدن گرفته و بازخورد باز بودن آن برقرار نشده است. توالی متوقف مانده و کنترلر مغایرت اعلام کرده است.",
      ),
      observations: [
        { nodeId: AL.valveDiscrepancy, state: "TRUE" },
        { nodeId: T.vHpDemand, state: "TRUE" },
        { nodeId: T.vHpOpenFb, state: "ABNORMAL", detail: "still not made 30 s after the demand" },
        { nodeId: T.almValveDiscrepancy, state: "TRUE" },
        { nodeId: T.pnLinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "ACTUATOR_FAILURE",
        faultModeId: FM.valveDiscrepancy,
        supportingNodeIds: [T.vHpDemand, T.vHpOpenFb, T.almValveDiscrepancy, AL.valveDiscrepancy],
        expectedMissingNodeIds: [IO.vHpOpenDi, EV.seqLog],
        expectedSafeActionIds: [SA.valveInspect],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-03-FS-06",
      title: t("Permeate conductivity above the recipe limit", "بالا رفتن هدایت آب محصول از حد دستور ساخت"),
      narrative: t(
        "The permeate conductivity has risen above the recipe limit, salt rejection has fallen with it, and the controller is diverting the product rather than sending it to the tank.",
        "هدایت الکتریکی آب محصول از حد دستور ساخت بالاتر رفته، دفع نمک همراه آن کاهش یافته و کنترلر به‌جای ارسال محصول به مخزن، آن را منحرف می‌کند.",
      ),
      observations: [
        { nodeId: AL.permeateQuality, state: "TRUE" },
        { nodeId: T.permeateConductivity, state: "ABNORMAL", detail: "above the recipe limit" },
        { nodeId: T.saltRejection, state: "ABNORMAL", detail: "fallen well below the design figure" },
        { nodeId: T.permeateQualityOk, state: "FALSE" },
        { nodeId: T.almPermeateQuality, state: "TRUE" },
        { nodeId: T.divertActive, state: "TRUE" },
        { nodeId: T.pnLinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.membraneQuality,
        supportingNodeIds: [T.permeateConductivity, T.saltRejection, T.permeateQualityOk, AL.permeateQuality],
        expectedMissingNodeIds: [EV.qualityTrend],
        expectedSafeActionIds: [SA.membraneReview],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-03-FS-07",
      title: t("Process values stopped updating", "توقف به‌روزرسانی مقادیر فرایندی"),
      narrative: t(
        "Every process value froze in the same second and the PROFINET link is reported down. The last readings before the freeze were unremarkable, which says nothing about the skid now.",
        "همهٔ مقادیر فرایندی در یک ثانیهٔ واحد منجمد شدند و پیوند پروفینت قطع گزارش می‌شود. آخرین قرائت‌ها پیش از انجماد چیز خاصی نداشتند، که این هیچ چیزی دربارهٔ وضعیت کنونی اسکید نمی‌گوید.",
      ),
      observations: [
        { nodeId: AL.commsLost, state: "TRUE" },
        { nodeId: T.pnLinkOk, state: "FALSE" },
        { nodeId: T.telemetryAge, state: "ABNORMAL", detail: "260 s and rising" },
        { nodeId: T.dataStale, state: "TRUE" },
        { nodeId: T.almCommsLost, state: "TRUE" },
        { nodeId: T.permeateFlow, state: "STALE" },
        { nodeId: T.stage1Pressure, state: "STALE" },
      ],
      groundTruth: {
        subsystem: "NETWORK",
        faultClass: "COMMUNICATION_LOSS",
        faultModeId: FM.commsLoss,
        supportingNodeIds: [T.pnLinkOk, T.telemetryAge, T.dataStale, AL.commsLost],
        expectedMissingNodeIds: [EV.cpuDiagnostics],
        expectedSafeActionIds: [SA.pnDiagnostics],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-03-FS-08",
      title: t("CIP interlock is holding the production matrix", "نگه‌داشتن ماتریس تولید توسط اینترلاک شست‌وشو"),
      narrative: t(
        "The skid will not go to production. The CIP interlock is active, chemical is flowing on the cleaning circuit, and the valve matrix is not reporting ready.",
        "اسکید به تولید نمی‌رود. اینترلاک شست‌وشوی شیمیایی فعال است، مادهٔ شیمیایی در مدار شست‌وشو جریان دارد و ماتریس شیرها آمادگی گزارش نمی‌کند.",
      ),
      observations: [
        { nodeId: AL.cipLockout, state: "TRUE" },
        { nodeId: I.cipActive, state: "TRUE" },
        { nodeId: T.almCipLockout, state: "TRUE" },
        { nodeId: T.cipChemFlow, state: "ABNORMAL", detail: "flowing on the cleaning circuit" },
        { nodeId: T.valveMatrixReady, state: "FALSE" },
        { nodeId: T.pnLinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "SAFETY_CIRCUIT",
        faultClass: "INTERLOCK_ACTIVE",
        faultModeId: FM.cipInterlock,
        supportingNodeIds: [I.cipActive, T.cipChemFlow, T.almCipLockout, AL.cipLockout],
        expectedMissingNodeIds: [T.cipTankLevel, EV.seqLog],
        expectedSafeActionIds: [SA.cipReview],
        requiresEscalation: true,
      },
    },
    {
      id: "TIA-03-FS-09",
      title: t("Skid ignores the start request after maintenance", "بی‌پاسخ ماندن درخواست راه‌اندازی پس از تعمیرات"),
      narrative: t(
        "After maintenance the skid does not answer a start request from the control room. Nothing reports a fault, the automatic mode is selected, and the sequence stays at its idle step.",
        "پس از تعمیرات، اسکید به درخواست راه‌اندازی از اتاق کنترل پاسخ نمی‌دهد. هیچ‌چیز خطا گزارش نمی‌کند، حالت خودکار انتخاب شده و توالی در گام بی‌کار خود می‌ماند.",
      ),
      observations: [
        { nodeId: AL.skidInLocal, state: "TRUE" },
        { nodeId: T.modeRemote, state: "FALSE", detail: "local selector still engaged at the skid" },
        { nodeId: T.startRequest, state: "TRUE" },
        { nodeId: T.seqStep, state: "ABNORMAL", detail: "held at step 0 with a start requested" },
        { nodeId: T.pnLinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "HMI",
        faultClass: "INCORRECT_MODE",
        faultModeId: FM.leftInLocal,
        supportingNodeIds: [T.modeRemote, T.startRequest, T.seqStep, AL.skidInLocal],
        expectedMissingNodeIds: [EV.auditLog],
        expectedSafeActionIds: [SA.auditReview],
        requiresEscalation: false,
      },
    },
  ],
};
