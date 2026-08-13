// PHASE 101 — TIA-04: continuous heat-treatment furnace and quench line.
//
// ORIGIN
// Original synthetic engineering reference authored for this repository. No
// customer, proprietary or licensed vendor project material.
//
// WHAT IS *NOT* CLAIMED
// The SCL is real, readable IEC 61131-3 / Siemens-dialect source and the LAD
// artefact is a real structured XML description. Neither was produced, compiled,
// downloaded or validated by TIA Portal or any other vendor tool. No `.apXX` /
// `.zapXX` archive and no vendor binary exists here, and none is claimed.
//
// THE BURNER-MANAGEMENT BOUNDARY — the point of this reference
// A continuous furnace has two control systems, and confusing them is how people
// are hurt. The PROCESS controller modelled here schedules a temperature
// profile, moves material and computes a BOUNDED SUPERVISORY HEAT DEMAND. The
// BURNER-MANAGEMENT SYSTEM owns combustion: fuel valves, pilot valves, ignition
// transformers, flame safeguard, purge and the combustion trip.
//
// In this corpus that boundary is structural, not editorial:
//   - Every BMS object is SAFETY_CRITICAL and carries NO inbound COMMANDS,
//     WRITES or ACTUATES edge from anything.
//   - `HEAT_DEMAND_PCT` is a REQUEST. It is bounded, and losing BMS readiness —
//     or losing confidence in the temperature evidence — forces it to zero with
//     no partial fallback.
//   - The combustion trip is never reset here, and no purge or ignition
//     sequence is generated, described as generated, or implied.
//   - Stale or self-contradictory temperature evidence can never read as a safe
//     furnace temperature: confidence is withdrawn instead.
//
// SAFETY CONTRACT
// No live PLC connection, no TIA Portal contact, no fuel or ignition control, no
// BMS/SIS/ESD bypass, no automatic combustion-trip reset, and no automatic
// restart after a trip, a power recovery or a communications recovery.

import type { AuthoredReferenceSystem } from "../types";
import { authoring, chainStates, t } from "./_authoring";

const a = authoring({
  projectId: "TIA-04",
  subsystem: "FURNACE_LINE_A",
  domain: "CONTROL_LOGIC",
});

/* ── Identifiers ──────────────────────────────────────────────────────────── */

const D = {
  cpu: a.id("DEVICE", "CPU_1517F"),
  io: a.id("DEVICE", "ET200MP_IO"),
  panel: a.id("DEVICE", "HMI_PANEL_FURNACE"),
  bms: a.id("DEVICE", "BMS_CONTROLLER"),
  vfdHearth: a.id("DEVICE", "VFD_HEARTH_DRIVE"),
  pyrometer: a.id("DEVICE", "ZONE2_PYROMETER"),
  pnSwitch: a.id("DEVICE", "PROFINET_SWITCH"),
};

const EQ = {
  chargeTable: a.id("EQUIPMENT", "CHARGE_TABLE"),
  entryConveyor: a.id("EQUIPMENT", "ENTRY_CONVEYOR"),
  entryDoor: a.id("EQUIPMENT", "FURNACE_ENTRY_DOOR"),
  zone1: a.id("EQUIPMENT", "HEATING_ZONE_1"),
  zone2: a.id("EQUIPMENT", "HEATING_ZONE_2"),
  zone3: a.id("EQUIPMENT", "HEATING_ZONE_3"),
  soakZone: a.id("EQUIPMENT", "SOAKING_ZONE"),
  hearth: a.id("EQUIPMENT", "ROLLER_HEARTH"),
  dischargeDoor: a.id("EQUIPMENT", "FURNACE_DISCHARGE_DOOR"),
  quench: a.id("EQUIPMENT", "QUENCH_TANK"),
  quenchPump: a.id("EQUIPMENT", "QUENCH_PUMP"),
  exitConveyor: a.id("EQUIPMENT", "EXIT_CONVEYOR"),
  burnerTrain: a.id("EQUIPMENT", "BURNER_TRAIN"),
  fuelTrain: a.id("EQUIPMENT", "FUEL_TRAIN"),
};

/** The declared block architecture. Every one is a real SCL unit. */
const B = {
  obMain: a.id("PLC_BLOCK", "OB_MAIN"),
  obStartup: a.id("PLC_BLOCK", "OB_STARTUP"),
  fbZone: a.id("PLC_BLOCK", "FB_ZONE_PROFILE_CONTROL"),
  fbRecipe: a.id("PLC_BLOCK", "FB_RECIPE_MANAGEMENT"),
  fbConveyor: a.id("PLC_BLOCK", "FB_CONVEYOR_SYNC"),
  fbTracking: a.id("PLC_BLOCK", "FB_MATERIAL_TRACKING"),
  fbQuench: a.id("PLC_BLOCK", "FB_QUENCH_SUPERVISION"),
  fbState: a.id("PLC_BLOCK", "FB_STATE_SUPERVISION"),
  fcSensor: a.id("PLC_BLOCK", "FC_SENSOR_VALIDATION"),
  fcDeviation: a.id("PLC_BLOCK", "FC_TEMP_DEVIATION"),
  fcResidence: a.id("PLC_BLOCK", "FC_RESIDENCE_TIME"),
  fcKpi: a.id("PLC_BLOCK", "FC_KPI_CALC"),
  dbInstance: a.id("PLC_BLOCK", "DB_INSTANCE"),
  dbRecipe: a.id("PLC_BLOCK", "DB_RECIPE"),
  dbConfig: a.id("PLC_BLOCK", "DB_CONFIG"),
  dbTracking: a.id("PLC_BLOCK", "DB_TRACKING"),
  dbAlarms: a.id("PLC_BLOCK", "DB_ALARMS"),
  udtZone: a.id("PLC_BLOCK", "UDT_FURNACE_ZONE"),
  udtTemp: a.id("PLC_BLOCK", "UDT_TEMPERATURE_SIGNAL"),
  udtProfile: a.id("PLC_BLOCK", "UDT_RECIPE_PROFILE"),
  udtPiece: a.id("PLC_BLOCK", "UDT_WORKPIECE"),
  udtDrive: a.id("PLC_BLOCK", "UDT_DRIVE"),
  udtSeq: a.id("PLC_BLOCK", "UDT_SEQ_STATE"),
};

const T = {
  /* Sequence and mode */
  seqStep: a.id("TAG", "SEQ_STEP"),
  lineRunning: a.id("TAG", "LINE_RUNNING"),
  startRequest: a.id("TAG", "START_REQUEST"),
  modeAuto: a.id("TAG", "MODE_AUTO"),
  modeRemote: a.id("TAG", "MODE_REMOTE"),
  alarmWord: a.id("TAG", "ALARM_WORD"),
  soakReady: a.id("TAG", "SOAK_READY"),
  trackRecoveryReview: a.id("TAG", "TRACK_RECOVERY_REVIEW"),
  /* Temperature evidence */
  z1TempTc: a.id("TAG", "Z1_TEMP_TC"),
  z2TempTc: a.id("TAG", "Z2_TEMP_TC"),
  z3TempTc: a.id("TAG", "Z3_TEMP_TC"),
  z2TempPyro: a.id("TAG", "Z2_TEMP_PYRO"),
  z1TempValid: a.id("TAG", "Z1_TEMP_VALID"),
  z2TempValid: a.id("TAG", "Z2_TEMP_VALID"),
  z3TempValid: a.id("TAG", "Z3_TEMP_VALID"),
  tempAgrees: a.id("TAG", "TEMP_EVIDENCE_AGREES"),
  tempConfidenceOk: a.id("TAG", "TEMP_CONFIDENCE_OK"),
  tempDataStale: a.id("TAG", "TEMP_DATA_STALE"),
  pyroLinkOk: a.id("TAG", "PYRO_LINK_OK"),
  telemetryAge: a.id("TAG", "TELEMETRY_AGE"),
  z1TempDev: a.id("TAG", "Z1_TEMP_DEV"),
  z2TempDev: a.id("TAG", "Z2_TEMP_DEV"),
  z3TempDev: a.id("TAG", "Z3_TEMP_DEV"),
  /* Heat demand — a request, never an actuation */
  heatDemand: a.id("TAG", "HEAT_DEMAND_PCT"),
  fuelEnergyTotal: a.id("TAG", "FUEL_ENERGY_TOTAL"),
  /* BMS boundary — read-only evidence */
  bmsReady: a.id("TAG", "BMS_READY"),
  bmsFlameOk: a.id("TAG", "BMS_FLAME_OK"),
  bmsPurgeComplete: a.id("TAG", "BMS_PURGE_COMPLETE"),
  bmsCombustionTrip: a.id("TAG", "BMS_COMBUSTION_TRIP"),
  bmsFuelValvePos: a.id("TAG", "BMS_FUEL_VALVE_POSITION"),
  bmsPilotValvePos: a.id("TAG", "BMS_PILOT_VALVE_POSITION"),
  bmsIgnitionActive: a.id("TAG", "BMS_IGNITION_ACTIVE"),
  /* Recipe */
  recipeSelected: a.id("TAG", "RECIPE_SELECTED"),
  recipeValid: a.id("TAG", "RECIPE_VALID"),
  recipeBoundsOk: a.id("TAG", "RECIPE_BOUNDS_OK"),
  recipeChecksumOk: a.id("TAG", "RECIPE_CHECKSUM_OK"),
  recipeChecksumAct: a.id("TAG", "RECIPE_CHECKSUM_ACT"),
  recipeLocked: a.id("TAG", "RECIPE_LOCKED"),
  recipeChangeRequest: a.id("TAG", "RECIPE_CHANGE_REQUEST"),
  recipeChangeReview: a.id("TAG", "RECIPE_CHANGE_REVIEW"),
  /* Conveyor and roller hearth */
  conveyorSpeedRef: a.id("TAG", "CONVEYOR_SPEED_REF"),
  hearthSpeedAct: a.id("TAG", "HEARTH_SPEED_ACT"),
  exitSpeedAct: a.id("TAG", "EXIT_SPEED_ACT"),
  speedSyncOk: a.id("TAG", "SPEED_SYNC_OK"),
  rollerDriveFault: a.id("TAG", "ROLLER_DRIVE_FAULT"),
  rollerDriveFaultPrev: a.id("TAG", "ROLLER_DRIVE_FAULT_PREV"),
  /* Material tracking */
  entryPhotocell: a.id("TAG", "ENTRY_PHOTOCELL"),
  entryPhotocellPrev: a.id("TAG", "ENTRY_PHOTOCELL_PREV"),
  dischargePhotocell: a.id("TAG", "DISCHARGE_PHOTOCELL"),
  dischargePhotocellPrev: a.id("TAG", "DISCHARGE_PHOTOCELL_PREV"),
  pieceIdCounter: a.id("TAG", "PIECE_ID_COUNTER"),
  piecesInFurnace: a.id("TAG", "PIECES_IN_FURNACE"),
  pieceDischargedPulse: a.id("TAG", "PIECE_DISCHARGED_PULSE"),
  zoneOccupancyDuplicate: a.id("TAG", "ZONE_OCCUPANCY_DUPLICATE"),
  zonePiecesDetected: a.id("TAG", "ZONE_PIECES_DETECTED"),
  piecesInProfile: a.id("TAG", "PIECES_IN_PROFILE"),
  /* Doors */
  entryDoorOpenFb: a.id("TAG", "ENTRY_DOOR_OPEN_FB"),
  entryDoorClosedFb: a.id("TAG", "ENTRY_DOOR_CLOSED_FB"),
  dischargeDoorOpenFb: a.id("TAG", "DISCHARGE_DOOR_OPEN_FB"),
  dischargeDoorClosedFb: a.id("TAG", "DISCHARGE_DOOR_CLOSED_FB"),
  /* Quench */
  quenchFlowAct: a.id("TAG", "QUENCH_FLOW_ACT"),
  quenchFlowOk: a.id("TAG", "QUENCH_FLOW_OK"),
  quenchPumpReady: a.id("TAG", "QUENCH_PUMP_READY"),
  quenchPumpFault: a.id("TAG", "QUENCH_PUMP_FAULT"),
  quenchPumpAvailable: a.id("TAG", "QUENCH_PUMP_AVAILABLE"),
  quenchTemp: a.id("TAG", "QUENCH_BATH_TEMP"),
  /* Counters */
  residenceTime: a.id("TAG", "RESIDENCE_TIME_S"),
  residenceDeviation: a.id("TAG", "RESIDENCE_DEVIATION_S"),
  prodCountPieces: a.id("TAG", "PROD_COUNT_PIECES"),
  specificEnergy: a.id("TAG", "SPECIFIC_ENERGY"),
  qualityInProfile: a.id("TAG", "QUALITY_IN_PROFILE_PCT"),
  /* Alarm bits */
  almTempDisagree: a.id("TAG", "ALM_TEMP_DISAGREE"),
  almTempStale: a.id("TAG", "ALM_TEMP_STALE"),
  almZoneOvertemp: a.id("TAG", "ALM_ZONE_OVERTEMP"),
  almResidence: a.id("TAG", "ALM_RESIDENCE_MISMATCH"),
  almRecipeInvalid: a.id("TAG", "ALM_RECIPE_INVALID"),
  almRecipeChangeBlocked: a.id("TAG", "ALM_RECIPE_CHANGE_BLOCKED"),
  almSpeedSync: a.id("TAG", "ALM_SPEED_SYNC"),
  almRollerTrip: a.id("TAG", "ALM_ROLLER_DRIVE_TRIP"),
  almTrackOverflow: a.id("TAG", "ALM_TRACK_OVERFLOW"),
  almTrackImpossible: a.id("TAG", "ALM_TRACK_IMPOSSIBLE_MOVE"),
  almTrackDuplicate: a.id("TAG", "ALM_TRACK_DUPLICATE"),
  almTrackLost: a.id("TAG", "ALM_TRACK_LOST_PIECE"),
  almDoorDiscrepancy: a.id("TAG", "ALM_DOOR_DISCREPANCY"),
  almQuenchFlowLow: a.id("TAG", "ALM_QUENCH_FLOW_LOW"),
  almQuenchUnavailable: a.id("TAG", "ALM_QUENCH_UNAVAILABLE"),
};

const IO = {
  z2TcAi: a.id("IO_POINT", "AI_Z2_THERMOCOUPLE"),
  z3TcAi: a.id("IO_POINT", "AI_Z3_THERMOCOUPLE"),
  z2PyroAi: a.id("IO_POINT", "AI_Z2_PYROMETER"),
  quenchFlowAi: a.id("IO_POINT", "AI_QUENCH_FLOW"),
  entryPhotoDi: a.id("IO_POINT", "DI_ENTRY_PHOTOCELL"),
  dischargeDoorDi: a.id("IO_POINT", "DI_DISCHARGE_DOOR_OPEN"),
  rollerFaultDi: a.id("IO_POINT", "DI_ROLLER_DRIVE_FAULT"),
};

const SQ = a.id("SEQUENCE", "FURNACE_LINE_SEQUENCE");
const S = {
  idle: a.id("STATE", "F00_IDLE"),
  load: a.id("STATE", "F10_LOAD"),
  heat: a.id("STATE", "F20_HEAT"),
  soak: a.id("STATE", "F30_SOAK"),
  quench: a.id("STATE", "F40_QUENCH"),
  discharge: a.id("STATE", "F50_DISCHARGE"),
};

const AQ = a.id("SEQUENCE", "ALARM_LIFECYCLE");
const AS = {
  normal: a.id("STATE", "AL00_NORMAL"),
  unack: a.id("STATE", "AL10_UNACK_ALARM"),
  acked: a.id("STATE", "AL20_ACK_ALARM"),
  rtnUnack: a.id("STATE", "AL30_RTN_UNACK"),
};

const P = {
  recipeReady: a.id("PERMISSIVE", "PRM_RECIPE_READY"),
  bmsReady: a.id("PERMISSIVE", "PRM_BMS_READY"),
  conveyorReady: a.id("PERMISSIVE", "PRM_CONVEYOR_READY"),
  quenchReady: a.id("PERMISSIVE", "PRM_QUENCH_READY"),
};

const I = {
  combustionTrip: a.id("INTERLOCK", "ILK_BMS_COMBUSTION_TRIP"),
  overtemp: a.id("INTERLOCK", "ILK_ZONE_OVERTEMPERATURE"),
  doorInterlock: a.id("INTERLOCK", "ILK_DOOR_POSITION"),
  quenchInterlock: a.id("INTERLOCK", "ILK_QUENCH_NOT_READY"),
};

const AL = {
  tcDrift: a.id("ALARM", "ALM_THERMOCOUPLE_INVALID"),
  tempDisagree: a.id("ALARM", "ALM_TEMPERATURE_EVIDENCE_CONFLICT"),
  zoneOvertemp: a.id("ALARM", "ALM_ZONE_OVERTEMPERATURE"),
  bmsNotReady: a.id("ALARM", "ALM_BMS_NOT_READY"),
  rollerTrip: a.id("ALARM", "ALM_ROLLER_DRIVE_TRIPPED"),
  trackMismatch: a.id("ALARM", "ALM_MATERIAL_TRACKING_MISMATCH"),
  doorDiscrepancy: a.id("ALARM", "ALM_DOOR_POSITION_DISCREPANCY"),
  tempStale: a.id("ALARM", "ALM_TEMPERATURE_DATA_STALE"),
  quenchUnavailable: a.id("ALARM", "ALM_QUENCH_NOT_AVAILABLE"),
  recipeMismatch: a.id("ALARM", "ALM_RECIPE_PROFILE_MISMATCH"),
  lineInLocal: a.id("ALARM", "ALM_LINE_IN_LOCAL"),
};

const K = {
  production: a.id("KPI", "KPI_PRODUCTION_PIECES"),
  specificEnergy: a.id("KPI", "KPI_SPECIFIC_ENERGY"),
  quality: a.id("KPI", "KPI_IN_PROFILE_QUALITY"),
  residence: a.id("KPI", "KPI_MEAN_RESIDENCE_TIME"),
};

const EV = {
  tempTrend: a.id("EVIDENCE_SOURCE", "HIST_TEMPERATURE_TREND"),
  bmsEventLog: a.id("EVIDENCE_SOURCE", "HIST_BMS_EVENT_LOG"),
  driveEventLog: a.id("EVIDENCE_SOURCE", "HIST_DRIVE_EVENT_LOG"),
  trackingLog: a.id("EVIDENCE_SOURCE", "HIST_MATERIAL_TRACKING_LOG"),
  cpuDiagnostics: a.id("EVIDENCE_SOURCE", "HIST_CPU_DIAGNOSTIC_BUFFER"),
  recipeAuditLog: a.id("EVIDENCE_SOURCE", "HIST_RECIPE_AUDIT_LOG"),
  operatorAuditLog: a.id("EVIDENCE_SOURCE", "HIST_OPERATOR_AUDIT_LOG"),
  quenchTrend: a.id("EVIDENCE_SOURCE", "HIST_QUENCH_TREND"),
};

const FM = {
  tcDrift: a.id("FAULT_MODE", "FM_ZONE3_THERMOCOUPLE_DRIFT"),
  evidenceConflict: a.id("FAULT_MODE", "FM_TEMPERATURE_EVIDENCE_CONFLICT"),
  zoneOvertemp: a.id("FAULT_MODE", "FM_ZONE_OVERTEMPERATURE"),
  bmsBoundary: a.id("FAULT_MODE", "FM_BMS_COMBUSTION_BOUNDARY_TRIP"),
  rollerTrip: a.id("FAULT_MODE", "FM_ROLLER_DRIVE_TRIP"),
  trackingMismatch: a.id("FAULT_MODE", "FM_MATERIAL_TRACKING_MISMATCH"),
  doorDiscrepancy: a.id("FAULT_MODE", "FM_DISCHARGE_DOOR_DISCREPANCY"),
  pyroCommsLoss: a.id("FAULT_MODE", "FM_PYROMETER_COMMS_LOSS"),
  quenchUnavailable: a.id("FAULT_MODE", "FM_QUENCH_UNAVAILABLE"),
  recipeMismatch: a.id("FAULT_MODE", "FM_RECIPE_PROFILE_MISMATCH"),
  leftInLocal: a.id("FAULT_MODE", "FM_LINE_LEFT_IN_LOCAL"),
};

const SA = {
  tcCompare: a.id("SAFE_ACTION", "SA_COMPARE_ZONE_TC_TO_CALIBRATED_INSTRUMENT"),
  evidenceReview: a.id("SAFE_ACTION", "SA_REVIEW_REDUNDANT_TEMPERATURE_EVIDENCE"),
  overtempReview: a.id("SAFE_ACTION", "SA_ESCALATE_ZONE_OVERTEMPERATURE_REVIEW"),
  bmsReview: a.id("SAFE_ACTION", "SA_ESCALATE_BMS_COMBUSTION_REVIEW"),
  driveHistory: a.id("SAFE_ACTION", "SA_READ_HEARTH_DRIVE_FAULT_HISTORY"),
  trackingReview: a.id("SAFE_ACTION", "SA_RECONCILE_MATERIAL_TRACKING_AGAINST_FURNACE"),
  doorInspect: a.id("SAFE_ACTION", "SA_INSPECT_DISCHARGE_DOOR_LIMITS"),
  pyroDiagnostics: a.id("SAFE_ACTION", "SA_VERIFY_PYROMETER_LINK_AND_CPU_DIAGNOSTICS"),
  quenchReview: a.id("SAFE_ACTION", "SA_ESCALATE_QUENCH_AVAILABILITY_REVIEW"),
  recipeReview: a.id("SAFE_ACTION", "SA_REVIEW_RECIPE_REVISION_AND_PROFILE"),
  auditReview: a.id("SAFE_ACTION", "SA_REVIEW_OPERATOR_AUDIT_LOG"),
};

/* ── Operator surface and governance ─────────────────────────────────────── */

const ST = {
  z2Temp: a.id("SCADA_TAG", "HMI_Zone2_Temperature"),
  heatDemand: a.id("SCADA_TAG", "HMI_Heat_Demand"),
  bmsReady: a.id("SCADA_TAG", "HMI_Bms_Ready"),
  lineRunning: a.id("SCADA_TAG", "HMI_Line_Running"),
  startIntent: a.id("SCADA_TAG", "HMI_Line_Start_Intent"),
  recipeSelectIntent: a.id("SCADA_TAG", "HMI_Recipe_Select_Intent"),
  ackCmd: a.id("SCADA_TAG", "HMI_Alarm_Ack_Cmd"),
  kpiPublished: a.id("SCADA_TAG", "HMI_Kpi_Published"),
};

const H = {
  overview: a.id("HMI_SCREEN", "Screen_FurnaceOverview"),
  recipe: a.id("HMI_SCREEN", "Screen_Recipe"),
  alarms: a.id("HMI_SCREEN", "Screen_Alarms"),
};

const HO = {
  zoneTemps: a.id("HMI_OBJECT", "Trend_ZoneTemperatures"),
  heatDemand: a.id("HMI_OBJECT", "Ind_HeatDemand"),
  bmsStatus: a.id("HMI_OBJECT", "Ind_BmsStatus"),
  startButton: a.id("HMI_OBJECT", "Btn_LineStart"),
  recipeSelect: a.id("HMI_OBJECT", "Btn_RecipeSelect"),
  alarmBanner: a.id("HMI_OBJECT", "Banner_ActiveAlarms"),
};

const SC = {
  startIntent: a.id("SCRIPT", "OnLineStartIntent"),
  recipeIntent: a.id("SCRIPT", "OnRecipeSelectIntent"),
  alarmAck: a.id("SCRIPT", "OnAlarmAcknowledge"),
  kpiPublish: a.id("SCRIPT", "OnKpiPublish"),
};

const R = {
  operator: a.id("ROLE", "Role_FurnaceOperator"),
  metallurgist: a.id("ROLE", "Role_HeatTreatmentEngineer"),
};

const AE = {
  startIntent: a.id("AUDIT_EVENT_TYPE", "Audit_LineStartIntentRecorded"),
  recipeIntent: a.id("AUDIT_EVENT_TYPE", "Audit_RecipeSelectIntentRecorded"),
  alarmAck: a.id("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged"),
  kpiRecord: a.id("AUDIT_EVENT_TYPE", "Audit_KpiPublishRecord"),
};

/* ── Native engineering source ────────────────────────────────────────────── */

const OB_STARTUP_SCL = `ORGANIZATION_BLOCK "OB_STARTUP"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// OB100 — startup / initialisation.
//
// DETERMINISTIC INITIALISATION
// The line comes back cold and idle, with the heat demand at zero.
//
// WHAT IS DELIBERATELY *NOT* DONE
// No combustion trip is reset, no burner state is touched and nothing is
// started. The retained material picture is treated as AMBIGUOUS until a human
// reconciles it: TRACK_RECOVERY_REVIEW is raised here and only an explicit
// review clears it, because a furnace that silently forgot its load would
// discharge a piece nobody was expecting.
BEGIN
   "SEQ_STEP" := 0;
   "HEAT_DEMAND_PCT" := 0.0;
   "LINE_RUNNING" := FALSE;
   "CONVEYOR_SPEED_REF" := 0.0;
   "RECIPE_LOCKED" := FALSE;
   "TRACK_RECOVERY_REVIEW" := TRUE;
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
   // Validation first: nothing may reason about a temperature the same scan has
   // not yet judged. The recipe is settled next, because the profile bounds
   // every demand and every speed that follows it.
   "FC_SENSOR_VALIDATION"();
   "FB_RECIPE_MANAGEMENT"();
   "FB_ZONE_PROFILE_CONTROL"();
   "FB_CONVEYOR_SYNC"();
   "FB_MATERIAL_TRACKING"();
   "FB_QUENCH_SUPERVISION"();
   "FB_STATE_SUPERVISION"();
   "FC_KPI_CALC"();
END_ORGANIZATION_BLOCK
`;

const FB_ZONE_PROFILE_CONTROL_SCL = `FUNCTION_BLOCK "FB_ZONE_PROFILE_CONTROL"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Zone profile scheduling and the BOUNDED SUPERVISORY HEAT DEMAND.
VAR
   rampTimer : TON;
END_VAR
VAR_CONSTANT
   DEMAND_MAX : Real := 100.0;
   RAMP_TIME  : Time := T#600s;
END_VAR

BEGIN
   "FC_TEMP_DEVIATION"();

   // The BMS permissive is ASSEMBLED FROM READ-ONLY EVIDENCE. Every term is
   // published by the burner-management system; this block writes none of them.
   "PRM_BMS_READY" := "BMS_READY" AND "BMS_PURGE_COMPLETE" AND NOT "BMS_COMBUSTION_TRIP";

   // HEAT DEMAND IS A REQUEST, NOT AN ACTUATION.
   // It is a bounded percentage handed to the burner-management system, which
   // retains final authority over fuel, pilot, ignition and flame safeguard.
   // Nothing in this block opens a valve or energises an igniter.
   IF "PRM_BMS_READY" AND "BMS_FLAME_OK" AND "TEMP_CONFIDENCE_OK" AND "RECIPE_VALID" THEN
      "HEAT_DEMAND_PCT" := "DB_RECIPE".HeatDemandSetpoint;
   ELSE
      // Losing BMS readiness — or losing confidence in the temperature evidence
      // — forces the demand to ZERO. There is no partial fallback, because a
      // reduced demand computed from evidence nobody trusts is still a demand.
      "HEAT_DEMAND_PCT" := 0.0;
   END_IF;

   IF "HEAT_DEMAND_PCT" > DEMAND_MAX THEN
      "HEAT_DEMAND_PCT" := DEMAND_MAX;
   END_IF;

   #rampTimer(IN := "LINE_RUNNING", PT := RAMP_TIME);
   IF #rampTimer.Q THEN
      "SOAK_READY" := TRUE;
   END_IF;
END_FUNCTION_BLOCK
`;

const FB_RECIPE_MANAGEMENT_SCL = `FUNCTION_BLOCK "FB_RECIPE_MANAGEMENT"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Recipe validation, bounds and immutability.
VAR
   changeEdge : Bool;
END_VAR
VAR_CONSTANT
   ZONE_TARGET_MIN : Real := 200.0;
   ZONE_TARGET_MAX : Real := 1150.0;
   SPEED_MIN       : Real := 0.05;
   SPEED_MAX       : Real := 2.50;
END_VAR

BEGIN
   // Every profile parameter is bounded. There is NO default recipe: a missing
   // or invalid one prevents an automatic start rather than substituting
   // something plausible and letting the furnace decide what plausible meant.
   "RECIPE_BOUNDS_OK" := "DB_RECIPE".Zone1Target >= ZONE_TARGET_MIN
      AND "DB_RECIPE".Zone1Target <= ZONE_TARGET_MAX
      AND "DB_RECIPE".ConveyorSpeed >= SPEED_MIN
      AND "DB_RECIPE".ConveyorSpeed <= SPEED_MAX;

   "RECIPE_CHECKSUM_OK" := "RECIPE_CHECKSUM_ACT" = "DB_RECIPE".RevisionChecksum;
   "RECIPE_VALID" := "RECIPE_BOUNDS_OK" AND "RECIPE_CHECKSUM_OK" AND "RECIPE_SELECTED";

   IF NOT "RECIPE_VALID" THEN
      "ALM_RECIPE_INVALID" := TRUE;
   END_IF;

   // IMMUTABILITY. Once material is inside under a profile, that profile is
   // locked. A change request is held and referred for review; it is never
   // applied to a workpiece that started under a different profile.
   IF "LINE_RUNNING" AND "PIECES_IN_FURNACE" > 0 THEN
      "RECIPE_LOCKED" := TRUE;
   END_IF;

   IF "RECIPE_CHANGE_REQUEST" AND "RECIPE_LOCKED" THEN
      "ALM_RECIPE_CHANGE_BLOCKED" := TRUE;
      "RECIPE_CHANGE_REVIEW" := TRUE;
   END_IF;

   "PRM_RECIPE_READY" := "RECIPE_VALID";
END_FUNCTION_BLOCK
`;

const FB_CONVEYOR_SYNC_SCL = `FUNCTION_BLOCK "FB_CONVEYOR_SYNC"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Roller-hearth and exit-conveyor speed synchronisation.
VAR
   syncTimer : TON;
END_VAR
VAR_CONSTANT
   SYNC_TOLERANCE : Real := 0.05;
   SYNC_DELAY     : Time := T#10s;
END_VAR

BEGIN
   // The speed reference is BOUNDED BY THE RECIPE and by nothing else.
   "CONVEYOR_SPEED_REF" := "DB_RECIPE".ConveyorSpeed;

   IF NOT "RECIPE_VALID" OR NOT "LINE_RUNNING" THEN
      "CONVEYOR_SPEED_REF" := 0.0;
   END_IF;

   // Hearth and exit must hold the same speed within tolerance. Once they drift
   // apart the piece spacing drifts with them and the residence time stops
   // meaning anything, which is why this is supervised rather than assumed.
   "SPEED_SYNC_OK" := ABS("HEARTH_SPEED_ACT" - "EXIT_SPEED_ACT") <= SYNC_TOLERANCE;

   #syncTimer(IN := NOT "SPEED_SYNC_OK", PT := SYNC_DELAY);
   IF #syncTimer.Q THEN
      "ALM_SPEED_SYNC" := TRUE;
   END_IF;

   // Rising edge on the hearth drive fault. The line stops; it does not retry.
   IF "ROLLER_DRIVE_FAULT" AND NOT "ROLLER_DRIVE_FAULT_PREV" THEN
      "ALM_ROLLER_DRIVE_TRIP" := TRUE;
      "LINE_RUNNING" := FALSE;
   END_IF;
   "ROLLER_DRIVE_FAULT_PREV" := "ROLLER_DRIVE_FAULT";

   "PRM_CONVEYOR_READY" := "SPEED_SYNC_OK" AND NOT "ROLLER_DRIVE_FAULT";
END_FUNCTION_BLOCK
`;

const FB_MATERIAL_TRACKING_SCL = `FUNCTION_BLOCK "FB_MATERIAL_TRACKING"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Deterministic workpiece tracking through the furnace zones.
VAR
   zoneIndex : Int;
END_VAR
VAR_CONSTANT
   ZONE_COUNT : Int := 4;
   PIECES_MAX : Int := 40;
   ID_MAX     : Int := 9999;
END_VAR

BEGIN
   // ENTRY. A piece is admitted on the rising edge of the entry photocell and
   // only when the tracking model has room for it. Its identity comes from a
   // bounded counter, so every piece in the model has a deterministic name.
   IF "ENTRY_PHOTOCELL" AND NOT "ENTRY_PHOTOCELL_PREV" THEN
      IF "PIECES_IN_FURNACE" < PIECES_MAX THEN
         "PIECE_ID_COUNTER" := "PIECE_ID_COUNTER" + 1;
         "PIECES_IN_FURNACE" := "PIECES_IN_FURNACE" + 1;
      ELSE
         "ALM_TRACK_OVERFLOW" := TRUE;
      END_IF;
   END_IF;
   "ENTRY_PHOTOCELL_PREV" := "ENTRY_PHOTOCELL";

   IF "PIECE_ID_COUNTER" > ID_MAX THEN
      "PIECE_ID_COUNTER" := 0;
   END_IF;

   // DISCHARGE. A discharge with nothing tracked behind it is an IMPOSSIBLE
   // MOVEMENT: it is rejected and reported, not absorbed into the count.
   IF "DISCHARGE_PHOTOCELL" AND NOT "DISCHARGE_PHOTOCELL_PREV" THEN
      IF "PIECES_IN_FURNACE" > 0 THEN
         "PIECES_IN_FURNACE" := "PIECES_IN_FURNACE" - 1;
         "PIECE_DISCHARGED_PULSE" := 1;
      ELSE
         "ALM_TRACK_IMPOSSIBLE_MOVE" := TRUE;
      END_IF;
   END_IF;
   "DISCHARGE_PHOTOCELL_PREV" := "DISCHARGE_PHOTOCELL";

   // Two pieces reported in one zone position is a tracking defect, not a
   // production event.
   IF "ZONE_OCCUPANCY_DUPLICATE" THEN
      "ALM_TRACK_DUPLICATE" := TRUE;
   END_IF;

   // A piece the model believes is inside but which no zone reports is LOST.
   // The model is NEVER silently reset to make the arithmetic agree; the
   // discrepancy is published and a human reconciles it against the furnace.
   IF "PIECES_IN_FURNACE" > "ZONE_PIECES_DETECTED" THEN
      "ALM_TRACK_LOST_PIECE" := TRUE;
   END_IF;
END_FUNCTION_BLOCK
`;

const FB_QUENCH_SUPERVISION_SCL = `FUNCTION_BLOCK "FB_QUENCH_SUPERVISION"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Quench and cooling availability.
VAR_CONSTANT
   FLOW_MIN : Real := 40.0;
END_VAR

BEGIN
   "QUENCH_FLOW_OK" := "QUENCH_FLOW_ACT" >= FLOW_MIN;
   "QUENCH_PUMP_AVAILABLE" := "QUENCH_PUMP_READY" AND NOT "QUENCH_PUMP_FAULT";

   IF NOT "QUENCH_FLOW_OK" THEN
      "ALM_QUENCH_FLOW_LOW" := TRUE;
   END_IF;

   IF NOT "QUENCH_PUMP_AVAILABLE" THEN
      "ALM_QUENCH_UNAVAILABLE" := TRUE;
   END_IF;

   // Discharging hot material into a quench that cannot take it is the one
   // thing this section exists to prevent, so the permissive demands BOTH a
   // healthy flow and an available pump.
   "PRM_QUENCH_READY" := "QUENCH_FLOW_OK" AND "QUENCH_PUMP_AVAILABLE";
END_FUNCTION_BLOCK
`;

const FB_STATE_SUPERVISION_SCL = `FUNCTION_BLOCK "FB_STATE_SUPERVISION"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// The line state machine and the trip path.
VAR
   stepTimer : TON;
END_VAR
VAR_CONSTANT
   T_LOAD : Time := T#120s;
END_VAR

BEGIN
   // TRIP PATH. A combustion trip, or a burner-management system that is no
   // longer ready, drops the line to idle and forces the heat demand to zero.
   // The trip is NEVER reset here — the BMS owns that — and the line does not
   // come back on its own when the condition clears.
   IF "BMS_COMBUSTION_TRIP" OR NOT "BMS_READY" THEN
      "SEQ_STEP" := 0;
      "LINE_RUNNING" := FALSE;
      "HEAT_DEMAND_PCT" := 0.0;
   END_IF;

   // Both door limit switches made at once describes a door that is open and
   // closed simultaneously. It is a discrepancy, never resolved by preference.
   IF "DISCHARGE_DOOR_OPEN_FB" AND "DISCHARGE_DOOR_CLOSED_FB" THEN
      "ALM_DOOR_DISCREPANCY" := TRUE;
   END_IF;

   CASE "SEQ_STEP" OF
      0:  // F00 idle — every start condition is checked together, including the
          // material-tracking review that a restart raises
         IF "START_REQUEST"
            AND "MODE_AUTO"
            AND "MODE_REMOTE"
            AND "PRM_RECIPE_READY"
            AND "PRM_BMS_READY"
            AND "PRM_CONVEYOR_READY"
            AND NOT "TRACK_RECOVERY_REVIEW"
         THEN
            "SEQ_STEP" := 10;
         END_IF;

      10: // F10 load
         "LINE_RUNNING" := TRUE;
         IF "ENTRY_DOOR_OPEN_FB" THEN
            "SEQ_STEP" := 20;
         END_IF;

      20: // F20 heat — confidence in the temperature evidence is a condition of
          // progressing, not a comment about it
         IF "TEMP_CONFIDENCE_OK" AND "SOAK_READY" THEN
            "SEQ_STEP" := 30;
         END_IF;

      30: // F30 soak — the quench must be ready BEFORE hot material moves toward it
         IF "PRM_QUENCH_READY" THEN
            "SEQ_STEP" := 40;
         END_IF;

      40: // F40 quench
         IF "DISCHARGE_DOOR_OPEN_FB" THEN
            "SEQ_STEP" := 50;
         END_IF;

      50: // F50 discharge
         "LINE_RUNNING" := FALSE;
         "SEQ_STEP" := 0;
   END_CASE;
END_FUNCTION_BLOCK
`;

const FC_LIBRARY_SCL = `FUNCTION "FC_SENSOR_VALIDATION" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Temperature signal validation and evidence confidence.
VAR_CONSTANT
   TEMP_MIN : Real := 0.0;
   TEMP_MAX : Real := 1300.0;
END_VAR

BEGIN
   "Z1_TEMP_VALID" := "Z1_TEMP_TC" > TEMP_MIN AND "Z1_TEMP_TC" < TEMP_MAX;
   "Z2_TEMP_VALID" := "Z2_TEMP_TC" > TEMP_MIN AND "Z2_TEMP_TC" < TEMP_MAX;
   "Z3_TEMP_VALID" := "Z3_TEMP_TC" > TEMP_MIN AND "Z3_TEMP_TC" < TEMP_MAX;

   "TEMP_CONFIDENCE_OK" := "Z1_TEMP_VALID" AND "Z2_TEMP_VALID" AND "Z3_TEMP_VALID";

   // REDUNDANT EVIDENCE. The zone thermocouple and the pyrometer are two
   // independent witnesses. When they disagree, NEITHER is trusted: the
   // disagreement is published and confidence is withdrawn, rather than one
   // instrument being preferred because it reads lower.
   "TEMP_EVIDENCE_AGREES" := ABS("Z2_TEMP_TC" - "Z2_TEMP_PYRO") <= "DB_CONFIG".TempAgreeBand;

   IF NOT "TEMP_EVIDENCE_AGREES" THEN
      "ALM_TEMP_DISAGREE" := TRUE;
      "TEMP_CONFIDENCE_OK" := FALSE;
   END_IF;

   // STALE EVIDENCE IS NEVER A SAFE FURNACE TEMPERATURE. A frozen reading is
   // unknown, and unknown withdraws confidence exactly as a disagreement does.
   IF NOT "PYRO_LINK_OK" OR "TEMP_DATA_STALE" THEN
      "TEMP_CONFIDENCE_OK" := FALSE;
      "ALM_TEMP_STALE" := TRUE;
   END_IF;
END_FUNCTION

FUNCTION "FC_TEMP_DEVIATION" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Zone deviation against the selected profile.
BEGIN
   "Z1_TEMP_DEV" := "Z1_TEMP_TC" - "DB_RECIPE".Zone1Target;
   "Z2_TEMP_DEV" := "Z2_TEMP_TC" - "DB_RECIPE".Zone2Target;
   "Z3_TEMP_DEV" := "Z3_TEMP_TC" - "DB_RECIPE".Zone3Target;

   IF "Z3_TEMP_DEV" > "DB_CONFIG".HighDeviationLimit THEN
      "ALM_ZONE_OVERTEMP" := TRUE;
   END_IF;
END_FUNCTION

FUNCTION "FC_RESIDENCE_TIME" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Residence time against the profile target.
VAR_CONSTANT
   RESIDENCE_MAX : DInt := 86400;
END_VAR

BEGIN
   "RESIDENCE_TIME_S" := "RESIDENCE_TIME_S" + 1;

   IF "RESIDENCE_TIME_S" > RESIDENCE_MAX THEN
      "RESIDENCE_TIME_S" := 0;
   END_IF;

   "RESIDENCE_DEVIATION_S" := "RESIDENCE_TIME_S" - "DB_RECIPE".TargetResidenceS;

   IF "RESIDENCE_DEVIATION_S" > "DB_CONFIG".ResidenceToleranceS THEN
      "ALM_RESIDENCE_MISMATCH" := TRUE;
   END_IF;
END_FUNCTION

FUNCTION "FC_KPI_CALC" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Production, energy and quality counters.
VAR_CONSTANT
   COUNT_MAX : DInt := 1000000;
END_VAR

BEGIN
   "FC_RESIDENCE_TIME"();

   "PROD_COUNT_PIECES" := "PROD_COUNT_PIECES" + "PIECE_DISCHARGED_PULSE";

   IF "PROD_COUNT_PIECES" > COUNT_MAX THEN
      "PROD_COUNT_PIECES" := 0;
   END_IF;

   "SPECIFIC_ENERGY" := "FUEL_ENERGY_TOTAL" / "PROD_COUNT_PIECES";
   "QUALITY_IN_PROFILE_PCT" := "PIECES_IN_PROFILE" * 100.0 / "PROD_COUNT_PIECES";
END_FUNCTION
`;

const DB_DEFINITIONS_SCL = `DATA_BLOCK "DB_INSTANCE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Retentive instance state for the supervision blocks.
STRUCT
   Zone1     : "UDT_FURNACE_ZONE";
   Zone2     : "UDT_FURNACE_ZONE";
   Zone3     : "UDT_FURNACE_ZONE";
   SoakZone  : "UDT_FURNACE_ZONE";
   HearthDrive : "UDT_DRIVE";
   Sequence  : "UDT_SEQ_STATE";
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_RECIPE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// The selected heat-treatment profile, with its revision identity.
STRUCT
   RecipeName        : String[32] := 'PROFILE_A';
   RevisionChecksum  : DWord := 16#4A7F2C11;
   Zone1Target       : Real := 780.0;
   Zone2Target       : Real := 900.0;
   Zone3Target       : Real := 940.0;
   SoakTarget        : Real := 940.0;
   HeatDemandSetpoint : Real := 72.0;
   ConveyorSpeed     : Real := 0.85;
   TargetResidenceS  : DInt := 5400;
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_CONFIG"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Engineering limits. They live here, not inside the logic.
STRUCT
   TempAgreeBand       : Real := 15.0;
   HighDeviationLimit  : Real := 25.0;
   ResidenceToleranceS : DInt := 600;
   StaleThresholdS     : Int := 30;
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_TRACKING"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// The material model: one entry per tracked workpiece position.
STRUCT
   Pieces : Array[1..40] of "UDT_WORKPIECE";
   Count  : Int := 0;
   LastId : Int := 0;
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_ALARMS"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Alarm bits and acknowledgement state.
STRUCT
   ThermocoupleInvalid : Bool := FALSE;
   EvidenceConflict    : Bool := FALSE;
   ZoneOvertemp        : Bool := FALSE;
   BmsNotReady         : Bool := FALSE;
   RollerDriveTrip     : Bool := FALSE;
   TrackingMismatch    : Bool := FALSE;
   DoorDiscrepancy     : Bool := FALSE;
   TemperatureStale    : Bool := FALSE;
   QuenchUnavailable   : Bool := FALSE;
   RecipeMismatch      : Bool := FALSE;
END_STRUCT
BEGIN
END_DATA_BLOCK
`;

const UDT_DEFINITIONS_SCL = `TYPE "UDT_FURNACE_ZONE"
VERSION : 1.0
// One controlled heating zone.
STRUCT
   Target      : Real;
   Actual      : Real;
   Deviation   : Real;
   HeatDemand  : Real;
   AtTarget    : Bool;
END_STRUCT
END_TYPE

TYPE "UDT_TEMPERATURE_SIGNAL"
VERSION : 1.0
// One temperature signal and the validity that travels with it.
STRUCT
   Value      : Real;
   Valid      : Bool;
   Stale      : Bool;
   AgreesWithRedundant : Bool;
END_STRUCT
END_TYPE

TYPE "UDT_RECIPE_PROFILE"
VERSION : 1.0
// A bounded ramp/soak profile with its revision identity.
STRUCT
   RevisionChecksum : DWord;
   ZoneTargets      : Array[1..4] of Real;
   ConveyorSpeed    : Real;
   TargetResidenceS : DInt;
   BoundsOk         : Bool;
END_STRUCT
END_TYPE

TYPE "UDT_WORKPIECE"
VERSION : 1.0
// One tracked workpiece, with a deterministic identity.
STRUCT
   PieceId     : Int;
   ZoneIndex   : Int;
   EntryTimeS  : DInt;
   InProfile   : Bool;
   Present     : Bool;
END_STRUCT
END_TYPE

TYPE "UDT_DRIVE"
VERSION : 1.0
// One conveyor or hearth drive.
STRUCT
   SpeedRef    : Real;
   SpeedAct    : Real;
   Fault       : Bool;
   Running     : Bool;
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

const LAD_SUPERVISORY_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  TIA-04 — non-safety supervisory permissive network, exported as a structured
  LAD description. This is engineering text: it was not produced, compiled or
  validated by TIA Portal or any other vendor tool. It describes a SUPERVISORY
  permissive only; it contains no burner, fuel, pilot, ignition, flame-safeguard
  or purge logic, because none of those belong to this controller. This build
  declares no relation mapping for LAD_XML, so the source-agreement gate reports
  it as SKIPPED rather than pretending to have checked it.
-->
<Document>
  <LadderDiagram Name="LAD_SUPERVISORY_PERMISSIVE" Number="1450" Language="LAD">
    <Network Number="1" Title="Line start permissive collection (supervisory, non-safety)">
      <Part Name="Contact" Uid="21" />
      <Part Name="Contact" Uid="22" />
      <Part Name="Contact" Uid="23" />
      <Part Name="Coil" Uid="24" />
      <Access Uid="31" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_RECIPE_READY" /></Symbol>
      </Access>
      <Access Uid="32" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_CONVEYOR_READY" /></Symbol>
      </Access>
      <Access Uid="33" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_QUENCH_READY" /></Symbol>
      </Access>
      <Access Uid="34" Scope="GlobalVariable">
        <Symbol><Component Name="SOAK_READY" /></Symbol>
      </Access>
      <Wire><NameCon Uid="31" Name="operand" /><NameCon Uid="21" Name="in" /></Wire>
      <Wire><NameCon Uid="32" Name="operand" /><NameCon Uid="22" Name="in" /></Wire>
      <Wire><NameCon Uid="33" Name="operand" /><NameCon Uid="23" Name="in" /></Wire>
      <Wire><NameCon Uid="21" Name="out" /><NameCon Uid="22" Name="in" /></Wire>
      <Wire><NameCon Uid="22" Name="out" /><NameCon Uid="23" Name="in" /></Wire>
      <Wire><NameCon Uid="23" Name="out" /><NameCon Uid="24" Name="in" /></Wire>
      <Wire><NameCon Uid="24" Name="operand" /><NameCon Uid="34" Name="operand" /></Wire>
    </Network>
    <Network Number="2" Title="Burner-management readiness is MONITORED, never driven">
      <Comment>
        Every BMS term below is an input to this network and an output of the
        burner-management system. No coil in this diagram writes to a BMS
        object, and no purge, ignition or trip-reset rung exists here or in any
        other artefact of this reference.
      </Comment>
      <Part Name="Contact" Uid="41" />
      <Part Name="Contact" Uid="42" />
      <Part Name="NotContact" Uid="43" />
      <Part Name="Coil" Uid="44" />
      <Access Uid="51" Scope="GlobalVariable">
        <Symbol><Component Name="BMS_READY" /></Symbol>
      </Access>
      <Access Uid="52" Scope="GlobalVariable">
        <Symbol><Component Name="BMS_PURGE_COMPLETE" /></Symbol>
      </Access>
      <Access Uid="53" Scope="GlobalVariable">
        <Symbol><Component Name="BMS_COMBUSTION_TRIP" /></Symbol>
      </Access>
      <Access Uid="54" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_BMS_READY" /></Symbol>
      </Access>
      <Wire><NameCon Uid="51" Name="operand" /><NameCon Uid="41" Name="in" /></Wire>
      <Wire><NameCon Uid="52" Name="operand" /><NameCon Uid="42" Name="in" /></Wire>
      <Wire><NameCon Uid="53" Name="operand" /><NameCon Uid="43" Name="in" /></Wire>
      <Wire><NameCon Uid="41" Name="out" /><NameCon Uid="42" Name="in" /></Wire>
      <Wire><NameCon Uid="42" Name="out" /><NameCon Uid="43" Name="in" /></Wire>
      <Wire><NameCon Uid="43" Name="out" /><NameCon Uid="44" Name="in" /></Wire>
      <Wire><NameCon Uid="44" Name="operand" /><NameCon Uid="54" Name="operand" /></Wire>
    </Network>
  </LadderDiagram>
</Document>
`;

/* ── System ───────────────────────────────────────────────────────────────── */

export const TIA_04_HEAT_TREATMENT: AuthoredReferenceSystem = {
  id: "TIA-04",
  name: t(
    "Continuous heat-treatment furnace and quench line",
    "خط کورهٔ عملیات حرارتی پیوسته و کوئنچ",
  ),
  domain: t(
    "Charge entry, multi-zone heating, soaking, roller-hearth transport, quench and discharge, with an external burner-management boundary",
    "ورود بار، گرمایش چندناحیه‌ای، خیساندن حرارتی، انتقال با کورهٔ غلتکی، کوئنچ و تخلیه، با مرز بیرونی مدیریت مشعل",
  ),
  sourceType: "TIA_REFERENCE",
  platform:
    "Vendor-neutral S7-1500-class controller described in IEC 61131-3 / SCL source text, with combustion owned by an external BMS; no vendor project archive is produced or claimed",
  version: "1.0.0",
  revision: 1,
  origin: "SYNTHETIC_ORIGINAL",

  nodes: [
    /* Devices */
    a.node("DEVICE", "CPU_1517F", t("Furnace line controller", "کنترلر خط کوره"), {
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "ET200MP_IO", t("Distributed I/O station", "ایستگاه ورودی/خروجی توزیع‌شده"), {
      domain: "FIELD_IO",
      attributes: { deviceCategory: "REMOTE_IO", networkZone: "FIELD", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "HMI_PANEL_FURNACE", t("Furnace operator panel", "پنل اپراتور کوره"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { deviceCategory: "HMI", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "BMS_CONTROLLER", t("Burner management system", "سامانهٔ مدیریت مشعل"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { deviceCategory: "SAFETY_CONTROLLER", networkZone: "SAFETY" },
      description: t(
        "An EXTERNAL system with final authority over fuel, pilot, ignition, flame safeguard, purge and the combustion trip. This corpus observes what it publishes and can never command, reset, inhibit, bypass or simulate any part of it.",
        "یک سامانهٔ بیرونی با اختیار نهایی بر سوخت، پیلوت، جرقه، حفاظت شعله، پرژ و تریپ احتراق. این پیکره آنچه را منتشر می‌کند مشاهده می‌کند و هرگز نمی‌تواند هیچ بخشی از آن را فرمان دهد، ریست، غیرفعال، دور زده یا شبیه‌سازی کند.",
      ),
    }),
    a.node("DEVICE", "VFD_HEARTH_DRIVE", t("Roller hearth drive", "درایو کورهٔ غلتکی"), {
      domain: "DRIVES",
      attributes: { deviceCategory: "VFD", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "ZONE2_PYROMETER", t("Zone 2 pyrometer", "پیرومتر ناحیهٔ ۲"), {
      domain: "FIELD_IO",
      attributes: { deviceCategory: "SENSOR_AGGREGATOR", networkZone: "FIELD" },
    }),
    a.node("DEVICE", "PROFINET_SWITCH", t("PROFINET switch", "سوییچ پروفینت"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "NETWORK_SWITCH", networkZone: "CONTROL" },
    }),

    /* Equipment */
    a.node("EQUIPMENT", "CHARGE_TABLE", t("Charge table", "میز بارگذاری"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "ENTRY_CONVEYOR", t("Entry conveyor", "نوار ورودی"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "FURNACE_ENTRY_DOOR", t("Furnace entry door", "درب ورودی کوره"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "HEATING_ZONE_1", t("Heating zone 1", "ناحیهٔ گرمایش ۱"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "HEATING_ZONE_2", t("Heating zone 2", "ناحیهٔ گرمایش ۲"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "HEATING_ZONE_3", t("Heating zone 3", "ناحیهٔ گرمایش ۳"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "SOAKING_ZONE", t("Soaking zone", "ناحیهٔ خیساندن حرارتی"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "ROLLER_HEARTH", t("Roller hearth", "کورهٔ غلتکی"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "FURNACE_DISCHARGE_DOOR", t("Furnace discharge door", "درب تخلیهٔ کوره"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "QUENCH_TANK", t("Quench tank", "مخزن کوئنچ"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Hot material discharged into a quench that cannot take it is the hazard this section exists to prevent.",
        "تخلیهٔ مادهٔ داغ به کوئنچی که توان پذیرش آن را ندارد، همان خطری است که این بخش برای پیشگیری از آن وجود دارد.",
      ),
    }),
    a.node("EQUIPMENT", "QUENCH_PUMP", t("Quench circulation pump", "پمپ گردش کوئنچ"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "EXIT_CONVEYOR", t("Exit conveyor", "نوار خروجی"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "BURNER_TRAIN", t("Burner train", "مجموعهٔ مشعل"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "Owned by the burner-management system. Observed here, driven nowhere.",
        "در اختیار سامانهٔ مدیریت مشعل. اینجا مشاهده می‌شود و در هیچ جا فرمان‌دهی نمی‌شود.",
      ),
    }),
    a.node("EQUIPMENT", "FUEL_TRAIN", t("Fuel train and safety shut-off valves", "مسیر سوخت و شیرهای قطع ایمنی"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
    }),

    /* PLC blocks */
    a.node("PLC_BLOCK", "OB_MAIN", t("OB1 cyclic entry point", "OB1 نقطهٔ ورود چرخه‌ای"), { attributes: { blockType: "OB" }, sourceId: "OB1" }),
    a.node("PLC_BLOCK", "OB_STARTUP", t("OB100 startup and initialisation", "OB100 راه‌اندازی و مقداردهی اولیه"), {
      attributes: { blockType: "OB" },
      sourceId: "OB100",
      description: t(
        "Initialises cold and idle with the heat demand at zero, resets no combustion trip, and raises the material-tracking review rather than assuming the furnace is empty.",
        "سرد و بی‌کار با تقاضای حرارتی صفر مقداردهی می‌کند، هیچ تریپ احتراقی را ریست نمی‌کند و به‌جای فرض خالی بودن کوره، بازبینی ردیابی مواد را مطرح می‌کند.",
      ),
    }),
    a.node("PLC_BLOCK", "FB_ZONE_PROFILE_CONTROL", t("Zone profile control block", "بلوک کنترل پروفیل ناحیه"), { attributes: { blockType: "FB" }, sourceId: "FB1410", domain: "PROCESS" }),
    a.node("PLC_BLOCK", "FB_RECIPE_MANAGEMENT", t("Recipe management block", "بلوک مدیریت دستور ساخت"), { attributes: { blockType: "FB" }, sourceId: "FB1420", domain: "QUALITY" }),
    a.node("PLC_BLOCK", "FB_CONVEYOR_SYNC", t("Conveyor synchronisation block", "بلوک هم‌زمانی نوار و غلتک"), { attributes: { blockType: "FB" }, sourceId: "FB1430", domain: "DRIVES" }),
    a.node("PLC_BLOCK", "FB_MATERIAL_TRACKING", t("Material tracking block", "بلوک ردیابی مواد"), { attributes: { blockType: "FB" }, sourceId: "FB1440" }),
    a.node("PLC_BLOCK", "FB_QUENCH_SUPERVISION", t("Quench supervision block", "بلوک نظارت بر کوئنچ"), { attributes: { blockType: "FB" }, sourceId: "FB1450", domain: "PROCESS" }),
    a.node("PLC_BLOCK", "FB_STATE_SUPERVISION", t("Line state and alarm supervision block", "بلوک نظارت بر وضعیت و آلارم خط"), { attributes: { blockType: "FB" }, sourceId: "FB1460" }),
    a.node("PLC_BLOCK", "FC_SENSOR_VALIDATION", t("Sensor validation function", "تابع اعتبارسنجی حسگر"), { attributes: { blockType: "FC" }, sourceId: "FC1470", domain: "FIELD_IO" }),
    a.node("PLC_BLOCK", "FC_TEMP_DEVIATION", t("Temperature deviation function", "تابع انحراف دما"), { attributes: { blockType: "FC" }, sourceId: "FC1471", domain: "PROCESS" }),
    a.node("PLC_BLOCK", "FC_RESIDENCE_TIME", t("Residence time function", "تابع زمان ماند"), { attributes: { blockType: "FC" }, sourceId: "FC1472" }),
    a.node("PLC_BLOCK", "FC_KPI_CALC", t("Counter and KPI function", "تابع شمارنده و شاخص"), { attributes: { blockType: "FC" }, sourceId: "FC1473", domain: "ENERGY" }),
    a.node("PLC_BLOCK", "DB_INSTANCE", t("Instance state data block", "بلوک دادهٔ وضعیت نمونه"), { attributes: { blockType: "DB" }, sourceId: "DB1410" }),
    a.node("PLC_BLOCK", "DB_RECIPE", t("Recipe data block", "بلوک دادهٔ دستور ساخت"), {
      attributes: { blockType: "DB" },
      sourceId: "DB1411",
      domain: "QUALITY",
      description: t(
        "Carries the profile AND its revision checksum, so a profile can be identified rather than merely believed.",
        "پروفیل و checksum نسخهٔ آن را با هم دارد تا بتوان یک پروفیل را شناسایی کرد، نه صرفاً به آن باور داشت.",
      ),
    }),
    a.node("PLC_BLOCK", "DB_CONFIG", t("Configuration data block", "بلوک دادهٔ پیکربندی"), { attributes: { blockType: "DB" }, sourceId: "DB1412" }),
    a.node("PLC_BLOCK", "DB_TRACKING", t("Material tracking data block", "بلوک دادهٔ ردیابی مواد"), { attributes: { blockType: "DB" }, sourceId: "DB1413" }),
    a.node("PLC_BLOCK", "DB_ALARMS", t("Alarm data block", "بلوک دادهٔ آلارم"), { attributes: { blockType: "DB" }, sourceId: "DB1414" }),
    a.node("PLC_BLOCK", "UDT_FURNACE_ZONE", t("Furnace zone type", "نوع ناحیهٔ کوره"), { attributes: { blockType: "UDT" }, sourceId: "UDT_FURNACE_ZONE" }),
    a.node("PLC_BLOCK", "UDT_TEMPERATURE_SIGNAL", t("Temperature signal type", "نوع سیگنال دما"), { attributes: { blockType: "UDT" }, sourceId: "UDT_TEMPERATURE_SIGNAL" }),
    a.node("PLC_BLOCK", "UDT_RECIPE_PROFILE", t("Recipe profile type", "نوع پروفیل دستور ساخت"), { attributes: { blockType: "UDT" }, sourceId: "UDT_RECIPE_PROFILE" }),
    a.node("PLC_BLOCK", "UDT_WORKPIECE", t("Workpiece type", "نوع قطعهٔ کار"), { attributes: { blockType: "UDT" }, sourceId: "UDT_WORKPIECE" }),
    a.node("PLC_BLOCK", "UDT_DRIVE", t("Drive type", "نوع درایو"), { attributes: { blockType: "UDT" }, sourceId: "UDT_DRIVE" }),
    a.node("PLC_BLOCK", "UDT_SEQ_STATE", t("Sequence state type", "نوع وضعیت توالی"), { attributes: { blockType: "UDT" }, sourceId: "UDT_SEQ_STATE" }),

    /* Sequence and mode */
    a.node("TAG", "SEQ_STEP", t("Sequence step", "گام توالی"), { attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "LINE_RUNNING", t("Line running", "در حال کار بودن خط"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "START_REQUEST", t("Start request", "درخواست راه‌اندازی"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "MODE_AUTO", t("Automatic mode selected", "انتخاب حالت خودکار"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "MODE_REMOTE", t("Remote mode selected", "انتخاب حالت از راه دور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "FALSE means the local selector is still engaged at the line. The evidence is an operator action, not a process state.",
        "مقدار FALSE یعنی سلکتور محلی هنوز روی خط فعال است. شاهد آن یک اقدام اپراتوری است، نه یک وضعیت فرایندی.",
      ),
    }),
    a.node("TAG", "ALARM_WORD", t("Alarm collection word", "کلمهٔ تجمیع آلارم"), { attributes: { dataType: "WORD", accessMode: "READ" } }),
    a.node("TAG", "SOAK_READY", t("Soak time complete", "پایان زمان خیساندن حرارتی"), { domain: "PROCESS", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "TRACK_RECOVERY_REVIEW", t("Material tracking review required", "نیاز به بازبینی ردیابی مواد"), {
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Raised by the startup block. The retained material picture is ambiguous after a restart, and an automatic start is blocked until a human reconciles it.",
        "توسط بلوک راه‌اندازی مطرح می‌شود. تصویر بازمانده از مواد پس از راه‌اندازی مجدد مبهم است و تا زمانی که انسانی آن را تطبیق ندهد، شروع خودکار مسدود است.",
      ),
    }),

    /* Temperature evidence */
    a.node("TAG", "Z1_TEMP_TC", t("Zone 1 thermocouple", "ترموکوپل ناحیهٔ ۱"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "C", accessMode: "READ" } }),
    a.node("TAG", "Z2_TEMP_TC", t("Zone 2 thermocouple", "ترموکوپل ناحیهٔ ۲"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "C", accessMode: "READ" } }),
    a.node("TAG", "Z3_TEMP_TC", t("Zone 3 thermocouple", "ترموکوپل ناحیهٔ ۳"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "C", accessMode: "READ" } }),
    a.node("TAG", "Z2_TEMP_PYRO", t("Zone 2 pyrometer reading", "قرائت پیرومتر ناحیهٔ ۲"), {
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
      description: t(
        "The independent second witness for zone 2. Its value only matters alongside the thermocouple; either one alone cannot detect a drift.",
        "شاهد دوم مستقل برای ناحیهٔ ۲. مقدار آن تنها در کنار ترموکوپل معنا دارد؛ هیچ‌یک به‌تنهایی نمی‌تواند رانش را تشخیص دهد.",
      ),
    }),
    a.node("TAG", "Z1_TEMP_VALID", t("Zone 1 measurement valid", "معتبر بودن اندازه‌گیری ناحیهٔ ۱"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "Z2_TEMP_VALID", t("Zone 2 measurement valid", "معتبر بودن اندازه‌گیری ناحیهٔ ۲"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "Z3_TEMP_VALID", t("Zone 3 measurement valid", "معتبر بودن اندازه‌گیری ناحیهٔ ۳"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "TEMP_EVIDENCE_AGREES", t("Redundant temperature evidence agrees", "توافق شواهد افزونهٔ دما"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "TEMP_CONFIDENCE_OK", t("Temperature evidence trustworthy", "قابل اعتماد بودن شواهد دما"), {
      domain: "FIELD_IO",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Withdrawn by a disagreement and withdrawn by staleness. A furnace temperature nobody can vouch for is not a safe temperature.",
        "با اختلاف شواهد و با کهنگی، سلب می‌شود. دمای کوره‌ای که کسی نمی‌تواند برای آن ضمانت کند، دمای ایمنی نیست.",
      ),
    }),
    a.node("TAG", "TEMP_DATA_STALE", t("Temperature data stale", "کهنگی دادهٔ دما"), { domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "PYRO_LINK_OK", t("Pyrometer link healthy", "سلامت پیوند پیرومتر"), { domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "TELEMETRY_AGE", t("Age of newest temperature sample", "سن تازه‌ترین نمونهٔ دما"), { domain: "NETWORK", attributes: { dataType: "INT", unit: "s", accessMode: "READ" } }),
    a.node("TAG", "Z1_TEMP_DEV", t("Zone 1 deviation from profile", "انحراف ناحیهٔ ۱ از پروفیل"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "C", accessMode: "READ" } }),
    a.node("TAG", "Z2_TEMP_DEV", t("Zone 2 deviation from profile", "انحراف ناحیهٔ ۲ از پروفیل"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "C", accessMode: "READ" } }),
    a.node("TAG", "Z3_TEMP_DEV", t("Zone 3 deviation from profile", "انحراف ناحیهٔ ۳ از پروفیل"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "C", accessMode: "READ" } }),

    /* Heat demand */
    a.node("TAG", "HEAT_DEMAND_PCT", t("Supervisory heat demand request", "درخواست نظارتی تقاضای حرارت"), {
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
      description: t(
        "A BOUNDED REQUEST to the burner-management system, not a burner actuation. Losing BMS readiness or temperature confidence forces it to zero, with no partial fallback.",
        "یک درخواست کران‌دار به سامانهٔ مدیریت مشعل، نه فرمان‌دهی مشعل. از دست رفتن آمادگی BMS یا اعتماد به دما، آن را به صفر می‌رساند، بدون هیچ حالت میانی.",
      ),
    }),
    a.node("TAG", "FUEL_ENERGY_TOTAL", t("Total fuel energy", "انرژی کل سوخت"), { domain: "ENERGY", attributes: { dataType: "REAL", unit: "MJ", accessMode: "READ" } }),

    /* BMS boundary — read-only evidence */
    a.node("TAG", "BMS_READY", t("BMS ready", "آمادگی BMS"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "BMS_FLAME_OK", t("Flame safeguard healthy", "سلامت حفاظت شعله"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "BMS_PURGE_COMPLETE", t("Purge complete", "تکمیل پرژ"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Published by the BMS. No purge is generated, requested, sequenced or simulated anywhere in this reference.",
        "توسط BMS منتشر می‌شود. در هیچ جای این مرجع هیچ پرژی تولید، درخواست، توالی‌بندی یا شبیه‌سازی نمی‌شود.",
      ),
    }),
    a.node("TAG", "BMS_COMBUSTION_TRIP", t("Combustion trip active", "فعال بودن تریپ احتراق"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Read-only. The trip is never reset from this controller; the BMS owns it and clearing it is a human act on that system.",
        "فقط‌خواندنی. این تریپ هرگز از این کنترلر ریست نمی‌شود؛ BMS مالک آن است و پاک کردن آن یک اقدام انسانی روی همان سامانه است.",
      ),
    }),
    a.node("TAG", "BMS_FUEL_VALVE_POSITION", t("Fuel valve position", "وضعیت شیر سوخت"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "BMS_PILOT_VALVE_POSITION", t("Pilot valve position", "وضعیت شیر پیلوت"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "BMS_IGNITION_ACTIVE", t("Ignition transformer active", "فعال بودن ترانس جرقه"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Recipe */
    a.node("TAG", "RECIPE_SELECTED", t("A recipe is selected", "انتخاب شدن یک دستور ساخت"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "RECIPE_VALID", t("Recipe valid", "معتبر بودن دستور ساخت"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "RECIPE_BOUNDS_OK", t("Recipe parameters within bounds", "بودن پارامترهای دستور ساخت در محدوده"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "RECIPE_CHECKSUM_OK", t("Recipe revision matches its checksum", "تطابق نسخهٔ دستور ساخت با checksum آن"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "RECIPE_CHECKSUM_ACT", t("Actual recipe checksum", "checksum واقعی دستور ساخت"), { domain: "QUALITY", attributes: { dataType: "DWORD", accessMode: "READ" } }),
    a.node("TAG", "RECIPE_LOCKED", t("Recipe locked during processing", "قفل بودن دستور ساخت حین پردازش"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "RECIPE_CHANGE_REQUEST", t("Recipe change requested", "درخواست تغییر دستور ساخت"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "RECIPE_CHANGE_REVIEW", t("Recipe change requires review", "نیاز تغییر دستور ساخت به بازبینی"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Conveyor and hearth */
    a.node("TAG", "CONVEYOR_SPEED_REF", t("Conveyor speed reference", "مرجع سرعت نوار"), { domain: "DRIVES", attributes: { dataType: "REAL", unit: "m/min", accessMode: "READ" } }),
    a.node("TAG", "HEARTH_SPEED_ACT", t("Roller hearth actual speed", "سرعت واقعی کورهٔ غلتکی"), { domain: "DRIVES", attributes: { dataType: "REAL", unit: "m/min", accessMode: "READ" } }),
    a.node("TAG", "EXIT_SPEED_ACT", t("Exit conveyor actual speed", "سرعت واقعی نوار خروجی"), { domain: "DRIVES", attributes: { dataType: "REAL", unit: "m/min", accessMode: "READ" } }),
    a.node("TAG", "SPEED_SYNC_OK", t("Speeds synchronised", "هم‌زمانی سرعت‌ها"), { domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ROLLER_DRIVE_FAULT", t("Roller hearth drive fault", "خطای درایو کورهٔ غلتکی"), { domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ROLLER_DRIVE_FAULT_PREV", t("Roller drive fault, previous scan", "خطای درایو غلتک در چرخهٔ پیشین"), { domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Material tracking */
    a.node("TAG", "ENTRY_PHOTOCELL", t("Entry photocell", "فتوسل ورودی"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ENTRY_PHOTOCELL_PREV", t("Entry photocell, previous scan", "فتوسل ورودی در چرخهٔ پیشین"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "DISCHARGE_PHOTOCELL", t("Discharge photocell", "فتوسل تخلیه"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "DISCHARGE_PHOTOCELL_PREV", t("Discharge photocell, previous scan", "فتوسل تخلیه در چرخهٔ پیشین"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "PIECE_ID_COUNTER", t("Workpiece identity counter", "شمارندهٔ هویت قطعهٔ کار"), { attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "PIECES_IN_FURNACE", t("Pieces the model holds in the furnace", "تعداد قطعات در مدل کوره"), { attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "PIECE_DISCHARGED_PULSE", t("Piece discharged pulse", "پالس تخلیهٔ قطعه"), { attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "ZONE_OCCUPANCY_DUPLICATE", t("Duplicate zone occupancy detected", "شناسایی اشغال تکراری ناحیه"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ZONE_PIECES_DETECTED", t("Pieces the zones actually report", "تعداد قطعاتی که نواحی واقعاً گزارش می‌کنند"), { domain: "FIELD_IO", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "PIECES_IN_PROFILE", t("Pieces discharged within profile", "قطعات تخلیه‌شده در محدودهٔ پروفیل"), { domain: "QUALITY", attributes: { dataType: "DINT", accessMode: "READ" } }),

    /* Doors */
    a.node("TAG", "ENTRY_DOOR_OPEN_FB", t("Entry door open feedback", "بازخورد باز بودن درب ورودی"), { domain: "FIELD_IO", safetyClass: "SAFETY_RELATED", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ENTRY_DOOR_CLOSED_FB", t("Entry door closed feedback", "بازخورد بسته بودن درب ورودی"), { domain: "FIELD_IO", safetyClass: "SAFETY_RELATED", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "DISCHARGE_DOOR_OPEN_FB", t("Discharge door open feedback", "بازخورد باز بودن درب تخلیه"), { domain: "FIELD_IO", safetyClass: "SAFETY_RELATED", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "DISCHARGE_DOOR_CLOSED_FB", t("Discharge door closed feedback", "بازخورد بسته بودن درب تخلیه"), { domain: "FIELD_IO", safetyClass: "SAFETY_RELATED", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Quench */
    a.node("TAG", "QUENCH_FLOW_ACT", t("Quench flow", "دبی کوئنچ"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ" } }),
    a.node("TAG", "QUENCH_FLOW_OK", t("Quench flow sufficient", "کفایت دبی کوئنچ"), { domain: "PROCESS", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "QUENCH_PUMP_READY", t("Quench pump ready", "آمادگی پمپ کوئنچ"), { domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "QUENCH_PUMP_FAULT", t("Quench pump fault", "خطای پمپ کوئنچ"), { domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "QUENCH_PUMP_AVAILABLE", t("Quench pump available", "در دسترس بودن پمپ کوئنچ"), { domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "QUENCH_BATH_TEMP", t("Quench bath temperature", "دمای حمام کوئنچ"), { domain: "PROCESS", attributes: { dataType: "REAL", unit: "C", accessMode: "READ" } }),

    /* Counters */
    a.node("TAG", "RESIDENCE_TIME_S", t("Residence time", "زمان ماند"), { attributes: { dataType: "DINT", unit: "s", accessMode: "READ" } }),
    a.node("TAG", "RESIDENCE_DEVIATION_S", t("Residence time deviation", "انحراف زمان ماند"), { attributes: { dataType: "DINT", unit: "s", accessMode: "READ" } }),
    a.node("TAG", "PROD_COUNT_PIECES", t("Pieces produced", "تعداد قطعات تولیدشده"), { domain: "PROCESS", attributes: { dataType: "DINT", accessMode: "READ" } }),
    a.node("TAG", "SPECIFIC_ENERGY", t("Specific energy per piece", "انرژی ویژه به‌ازای هر قطعه"), { domain: "ENERGY", attributes: { dataType: "REAL", unit: "MJ/piece", accessMode: "READ" } }),
    a.node("TAG", "QUALITY_IN_PROFILE_PCT", t("Pieces within profile", "درصد قطعات در محدودهٔ پروفیل"), { domain: "QUALITY", attributes: { dataType: "REAL", unit: "%", accessMode: "READ" } }),

    /* Alarm bits */
    a.node("TAG", "ALM_TEMP_DISAGREE", t("Temperature disagreement alarm bit", "بیت آلارم اختلاف دما"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_TEMP_STALE", t("Temperature stale alarm bit", "بیت آلارم کهنگی دما"), { domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_ZONE_OVERTEMP", t("Zone overtemperature alarm bit", "بیت آلارم اضافه‌دمای ناحیه"), { domain: "PROCESS", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_RESIDENCE_MISMATCH", t("Residence mismatch alarm bit", "بیت آلارم مغایرت زمان ماند"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_RECIPE_INVALID", t("Recipe invalid alarm bit", "بیت آلارم نامعتبری دستور ساخت"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_RECIPE_CHANGE_BLOCKED", t("Recipe change blocked alarm bit", "بیت آلارم مسدود شدن تغییر دستور ساخت"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_SPEED_SYNC", t("Speed synchronisation alarm bit", "بیت آلارم هم‌زمانی سرعت"), { domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_ROLLER_DRIVE_TRIP", t("Roller drive trip alarm bit", "بیت آلارم تریپ درایو غلتک"), { domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_TRACK_OVERFLOW", t("Tracking overflow alarm bit", "بیت آلارم سرریز ردیابی"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_TRACK_IMPOSSIBLE_MOVE", t("Impossible movement alarm bit", "بیت آلارم حرکت غیرممکن"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_TRACK_DUPLICATE", t("Duplicate occupancy alarm bit", "بیت آلارم اشغال تکراری"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_TRACK_LOST_PIECE", t("Lost workpiece alarm bit", "بیت آلارم گم شدن قطعه"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_DOOR_DISCREPANCY", t("Door discrepancy alarm bit", "بیت آلارم مغایرت درب"), { domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_QUENCH_FLOW_LOW", t("Quench flow low alarm bit", "بیت آلارم افت دبی کوئنچ"), { domain: "PROCESS", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_QUENCH_UNAVAILABLE", t("Quench unavailable alarm bit", "بیت آلارم در دسترس نبودن کوئنچ"), { domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Field channels */
    a.node("IO_POINT", "AI_Z2_THERMOCOUPLE", t("Zone 2 thermocouple channel", "کانال ترموکوپل ناحیهٔ ۲"), { domain: "FIELD_IO", attributes: { channelType: "AI", unit: "C" } }),
    a.node("IO_POINT", "AI_Z3_THERMOCOUPLE", t("Zone 3 thermocouple channel", "کانال ترموکوپل ناحیهٔ ۳"), { domain: "FIELD_IO", attributes: { channelType: "AI", unit: "C" } }),
    a.node("IO_POINT", "AI_Z2_PYROMETER", t("Zone 2 pyrometer channel", "کانال پیرومتر ناحیهٔ ۲"), { domain: "FIELD_IO", attributes: { channelType: "AI", unit: "C" } }),
    a.node("IO_POINT", "AI_QUENCH_FLOW", t("Quench flow channel", "کانال دبی کوئنچ"), { domain: "FIELD_IO", attributes: { channelType: "AI", unit: "m3/h" } }),
    a.node("IO_POINT", "DI_ENTRY_PHOTOCELL", t("Entry photocell channel", "کانال فتوسل ورودی"), { domain: "FIELD_IO", attributes: { channelType: "DI" } }),
    a.node("IO_POINT", "DI_DISCHARGE_DOOR_OPEN", t("Discharge door open limit switch", "لیمیت‌سوییچ باز بودن درب تخلیه"), { domain: "FIELD_IO", safetyClass: "SAFETY_RELATED", attributes: { channelType: "DI" } }),
    a.node("IO_POINT", "DI_ROLLER_DRIVE_FAULT", t("Roller drive fault contact", "کنتاکت خطای درایو غلتک"), { domain: "FIELD_IO", attributes: { channelType: "DI" } }),

    /* Sequences */
    a.node("SEQUENCE", "FURNACE_LINE_SEQUENCE", t("Furnace line sequence", "توالی خط کوره"), {
      description: t(
        "The state machine the supervision block implements. Described here and executed nowhere in this repository.",
        "ماشین حالتی که بلوک نظارت پیاده می‌کند. اینجا توصیف می‌شود و در هیچ جای این مخزن اجرا نمی‌شود.",
      ),
    }),
    a.node("STATE", "F00_IDLE", t("Idle", "بی‌کار"), { attributes: { stepNumber: 0 } }),
    a.node("STATE", "F10_LOAD", t("Load", "بارگذاری"), { attributes: { stepNumber: 10, stepTimeoutSeconds: 120 } }),
    a.node("STATE", "F20_HEAT", t("Heat", "گرمایش"), { attributes: { stepNumber: 20, stepTimeoutSeconds: 3600 } }),
    a.node("STATE", "F30_SOAK", t("Soak", "خیساندن حرارتی"), { attributes: { stepNumber: 30, stepTimeoutSeconds: 5400 } }),
    a.node("STATE", "F40_QUENCH", t("Quench", "کوئنچ"), { attributes: { stepNumber: 40, stepTimeoutSeconds: 600 } }),
    a.node("STATE", "F50_DISCHARGE", t("Discharge", "تخلیه"), { attributes: { stepNumber: 50 } }),
    a.node("SEQUENCE", "ALARM_LIFECYCLE", t("ISA-18.2 alarm lifecycle", "چرخهٔ عمر آلارم ISA-18.2"), { domain: "OPERATOR_INTERFACE" }),
    a.node("STATE", "AL00_NORMAL", t("Normal", "عادی"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 0 } }),
    a.node("STATE", "AL10_UNACK_ALARM", t("Unacknowledged alarm", "آلارم تأییدنشده"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 10 } }),
    a.node("STATE", "AL20_ACK_ALARM", t("Acknowledged alarm", "آلارم تأییدشده"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 20 } }),
    a.node("STATE", "AL30_RTN_UNACK", t("Returned to normal, unacknowledged", "بازگشته به عادی، تأییدنشده"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 30 } }),

    /* Permissives */
    a.node("PERMISSIVE", "PRM_RECIPE_READY", t("A valid recipe is selected", "انتخاب یک دستور ساخت معتبر"), { domain: "QUALITY" }),
    a.node("PERMISSIVE", "PRM_BMS_READY", t("Burner management ready", "آمادگی مدیریت مشعل"), {
      subsystem: "COMBUSTION_BOUNDARY",
      description: t(
        "Assembled from read-only BMS evidence. It is this controller's VIEW of the burner-management state, never an instruction to it.",
        "از شواهد فقط‌خواندنی BMS ساخته می‌شود. این، دیدگاه این کنترلر از وضعیت مدیریت مشعل است، نه دستوری به آن.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_CONVEYOR_READY", t("Conveyor synchronised and healthy", "هم‌زمانی و سلامت نوار"), { domain: "DRIVES" }),
    a.node("PERMISSIVE", "PRM_QUENCH_READY", t("Quench available", "در دسترس بودن کوئنچ"), { domain: "PROCESS" }),

    /* Interlocks — read, never written */
    a.node("INTERLOCK", "ILK_BMS_COMBUSTION_TRIP", t("Combustion trip interlock", "اینترلاک تریپ احتراق"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "The declared effect of the burner-management trip on this line. Observed only; never reset, inhibited, bypassed or simulated from here.",
        "اثر اعلام‌شدهٔ تریپ مدیریت مشعل بر این خط. فقط مشاهده می‌شود؛ هرگز از اینجا ریست، غیرفعال، دور زده یا شبیه‌سازی نمی‌شود.",
      ),
    }),
    a.node("INTERLOCK", "ILK_ZONE_OVERTEMPERATURE", t("Zone overtemperature interlock", "اینترلاک اضافه‌دمای ناحیه"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_DOOR_POSITION", t("Door position interlock", "اینترلاک وضعیت درب"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_QUENCH_NOT_READY", t("Quench not ready interlock", "اینترلاک آماده نبودن کوئنچ"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),

    /* Alarms */
    a.node("ALARM", "ALM_THERMOCOUPLE_INVALID", t("Thermocouple signal invalid", "نامعتبر بودن سیگنال ترموکوپل"), { domain: "FIELD_IO", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_TEMPERATURE_EVIDENCE_CONFLICT", t("Redundant temperature evidence conflicts", "تعارض شواهد افزونهٔ دما"), { domain: "FIELD_IO", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_ZONE_OVERTEMPERATURE", t("Zone overtemperature", "اضافه‌دمای ناحیه"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_BMS_NOT_READY", t("Burner management not ready", "آماده نبودن مدیریت مشعل"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_ROLLER_DRIVE_TRIPPED", t("Roller hearth drive tripped", "تریپ درایو کورهٔ غلتکی"), { domain: "DRIVES", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_MATERIAL_TRACKING_MISMATCH", t("Material tracking mismatch", "مغایرت ردیابی مواد"), { attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_DOOR_POSITION_DISCREPANCY", t("Door position discrepancy", "مغایرت وضعیت درب"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_TEMPERATURE_DATA_STALE", t("Temperature data stale", "کهنگی دادهٔ دما"), { domain: "NETWORK", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_QUENCH_NOT_AVAILABLE", t("Quench unavailable", "در دسترس نبودن کوئنچ"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_RECIPE_PROFILE_MISMATCH", t("Recipe profile mismatch", "مغایرت پروفیل دستور ساخت"), { domain: "QUALITY", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_LINE_IN_LOCAL", t("Line left in local mode", "رهاشدن خط در حالت محلی"), { domain: "OPERATOR_INTERFACE", attributes: { alarmPriority: "MEDIUM", requiresAck: true } }),

    /* Operator surface */
    a.node("SCADA_TAG", "HMI_Zone2_Temperature", t("Zone 2 temperature (panel)", "دمای ناحیهٔ ۲ (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "REAL", unit: "C", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Heat_Demand", t("Heat demand (panel)", "تقاضای حرارت (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "REAL", unit: "%", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Bms_Ready", t("BMS ready (panel)", "آمادگی BMS (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Line_Running", t("Line running (panel)", "کارکرد خط (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Line_Start_Intent", t("Line start intent", "قصد راه‌اندازی خط"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "LINE_START", requiresConfirmation: true },
      description: t(
        "A recorded statement that an authorised human asked for a start. Engineering metadata: it drives no plant object, and the controller's own permissives decide whether the request is honoured.",
        "ثبت این که یک انسانِ مجاز درخواست راه‌اندازی داده است. فرادادهٔ مهندسی: هیچ شیء فرایندی را به حرکت درنمی‌آورد و مجوزهای خود کنترلر تصمیم می‌گیرند که درخواست پذیرفته شود یا نه.",
      ),
    }),
    a.node("SCADA_TAG", "HMI_Recipe_Select_Intent", t("Recipe selection intent", "قصد انتخاب دستور ساخت"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "RECIPE_SELECT", requiresConfirmation: true },
    }),
    a.node("SCADA_TAG", "HMI_Alarm_Ack_Cmd", t("Alarm acknowledge command", "فرمان تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "ALARM_ACK", requiresConfirmation: true },
    }),
    a.node("SCADA_TAG", "HMI_Kpi_Published", t("Published KPI snapshot", "تصویر منتشرشدهٔ شاخص‌ها"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "REAL", accessMode: "READ_WRITE" } }),
    a.node("HMI_SCREEN", "Screen_FurnaceOverview", t("Furnace overview", "نمای کلی کوره"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_SCREEN", "Screen_Recipe", t("Recipe and profile", "دستور ساخت و پروفیل"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_SCREEN", "Screen_Alarms", t("Active alarms", "آلارم‌های فعال"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_OBJECT", "Trend_ZoneTemperatures", t("Zone temperature trend", "روند دمای نواحی"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_OBJECT", "Ind_HeatDemand", t("Heat demand indicator", "نشانگر تقاضای حرارت"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_OBJECT", "Ind_BmsStatus", t("BMS status indicator (read-only)", "نشانگر وضعیت BMS (فقط‌خواندنی)"), {
      domain: "OPERATOR_INTERFACE",
      description: t(
        "Displays burner-management state. It declares no command: nothing about combustion is operable from this panel.",
        "وضعیت مدیریت مشعل را نمایش می‌دهد. هیچ فرمانی اعلام نمی‌کند: هیچ چیزی دربارهٔ احتراق از این پنل قابل عملیات نیست.",
      ),
    }),
    a.node("HMI_OBJECT", "Btn_LineStart", t("Line start button", "دکمهٔ راه‌اندازی خط"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "LINE_START", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Btn_RecipeSelect", t("Recipe selection button", "دکمهٔ انتخاب دستور ساخت"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "RECIPE_SELECT", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Banner_ActiveAlarms", t("Active alarm banner", "نوار آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "ALARM_ACK", requiresConfirmation: true },
    }),
    a.node("SCRIPT", "OnLineStartIntent", t("Line start intent handler", "پردازندهٔ قصد راه‌اندازی خط"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "LINE_START" },
    }),
    a.node("SCRIPT", "OnRecipeSelectIntent", t("Recipe selection intent handler", "پردازندهٔ قصد انتخاب دستور ساخت"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "RECIPE_SELECT" },
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
    a.node("ROLE", "Role_FurnaceOperator", t("Furnace operator", "اپراتور کوره")),
    a.node("ROLE", "Role_HeatTreatmentEngineer", t("Heat-treatment engineer", "مهندس عملیات حرارتی")),
    a.node("AUDIT_EVENT_TYPE", "Audit_LineStartIntentRecorded", t("Line start intent recorded", "ثبت قصد راه‌اندازی خط")),
    a.node("AUDIT_EVENT_TYPE", "Audit_RecipeSelectIntentRecorded", t("Recipe selection intent recorded", "ثبت قصد انتخاب دستور ساخت")),
    a.node("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged", t("Alarm acknowledged", "تأیید آلارم")),
    a.node("AUDIT_EVENT_TYPE", "Audit_KpiPublishRecord", t("KPI publication record", "رکورد انتشار شاخص‌ها")),

    /* KPI and evidence */
    a.node("KPI", "KPI_PRODUCTION_PIECES", t("Pieces produced", "قطعات تولیدشده"), { domain: "PROCESS", attributes: { unit: "pieces", formula: "discharged piece count per period" } }),
    a.node("KPI", "KPI_SPECIFIC_ENERGY", t("Specific energy", "انرژی ویژه"), { domain: "ENERGY", attributes: { unit: "MJ/piece", formula: "fuel energy / pieces produced" } }),
    a.node("KPI", "KPI_IN_PROFILE_QUALITY", t("In-profile quality", "کیفیت در محدودهٔ پروفیل"), { domain: "QUALITY", attributes: { unit: "%", formula: "in-profile pieces / pieces produced" } }),
    a.node("KPI", "KPI_MEAN_RESIDENCE_TIME", t("Mean residence time", "میانگین زمان ماند"), { domain: "PROCESS", attributes: { unit: "s", formula: "mean measured furnace residence time" } }),
    a.node("EVIDENCE_SOURCE", "HIST_TEMPERATURE_TREND", t("Temperature trend archive", "بایگانی روند دما"), { domain: "MAINTENANCE", attributes: { retentionDays: 730, sampleIntervalSeconds: 5 } }),
    a.node("EVIDENCE_SOURCE", "HIST_BMS_EVENT_LOG", t("Burner management event log", "گزارش رویدادهای مدیریت مشعل"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { retentionDays: 3650 },
      description: t(
        "Published by the BMS. Hermes reads about it; it writes nothing to it and cannot influence what it records.",
        "توسط BMS منتشر می‌شود. هرمس دربارهٔ آن می‌خواند؛ چیزی در آن نمی‌نویسد و نمی‌تواند بر آنچه ثبت می‌کند اثر بگذارد.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_DRIVE_EVENT_LOG", t("Drive event log", "گزارش رویدادهای درایو"), { domain: "DRIVES", attributes: { retentionDays: 400 } }),
    a.node("EVIDENCE_SOURCE", "HIST_MATERIAL_TRACKING_LOG", t("Material tracking log", "گزارش ردیابی مواد"), { attributes: { retentionDays: 730 } }),
    a.node("EVIDENCE_SOURCE", "HIST_CPU_DIAGNOSTIC_BUFFER", t("CPU diagnostic buffer", "بافر تشخیصی پردازنده"), { domain: "NETWORK", attributes: { retentionDays: 90 } }),
    a.node("EVIDENCE_SOURCE", "HIST_RECIPE_AUDIT_LOG", t("Recipe audit log", "گزارش ممیزی دستور ساخت"), { domain: "QUALITY", attributes: { retentionDays: 1825 } }),
    a.node("EVIDENCE_SOURCE", "HIST_OPERATOR_AUDIT_LOG", t("Operator audit log", "گزارش ممیزی اپراتور"), { domain: "OPERATOR_INTERFACE", attributes: { retentionDays: 1825 } }),
    a.node("EVIDENCE_SOURCE", "HIST_QUENCH_TREND", t("Quench trend archive", "بایگانی روند کوئنچ"), { domain: "MAINTENANCE", attributes: { retentionDays: 400, sampleIntervalSeconds: 10 } }),

    /* Fault modes */
    a.node("FAULT_MODE", "FM_ZONE3_THERMOCOUPLE_DRIFT", t("Zone 3 thermocouple drifted or stuck", "رانش یا گیرکردن ترموکوپل ناحیهٔ ۳"), {
      domain: "FIELD_IO",
      attributes: { faultClass: "SENSOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_TEMPERATURE_EVIDENCE_CONFLICT", t("Redundant temperature witnesses disagree", "اختلاف دو شاهد افزونهٔ دما"), {
      domain: "FIELD_IO",
      attributes: { faultClass: "SENSOR_FAILURE", subsystem: "FIELD_DEVICE" },
      description: t(
        "Two independent instruments cannot both be right. Until the disagreement is resolved neither reading earns confidence, and the demand goes to zero rather than following the more convenient one.",
        "دو ابزار مستقل نمی‌توانند هر دو درست باشند. تا زمانی که اختلاف حل نشود هیچ‌یک اعتماد کسب نمی‌کند و تقاضا به‌جای پیروی از قرائت راحت‌تر، صفر می‌شود.",
      ),
    }),
    a.node("FAULT_MODE", "FM_ZONE_OVERTEMPERATURE", t("Zone above its profile limit", "فراتر رفتن ناحیه از حد پروفیل"), {
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "PROCESS" },
    }),
    a.node("FAULT_MODE", "FM_BMS_COMBUSTION_BOUNDARY_TRIP", t("Burner management holding the line", "نگه‌داشتن خط توسط مدیریت مشعل"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { faultClass: "INTERLOCK_ACTIVE", subsystem: "SAFETY_CIRCUIT" },
    }),
    a.node("FAULT_MODE", "FM_ROLLER_DRIVE_TRIP", t("Roller hearth drive tripped", "تریپ درایو کورهٔ غلتکی"), {
      domain: "DRIVES",
      attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
    }),
    a.node("FAULT_MODE", "FM_MATERIAL_TRACKING_MISMATCH", t("Material model disagrees with the furnace", "اختلاف مدل مواد با خود کوره"), {
      attributes: { faultClass: "SEQUENCE_TIMEOUT", subsystem: "PLC_LOGIC" },
      description: t(
        "The model holds more pieces than the zones report and the residence time has run past its target. The model is never silently corrected: a piece unaccounted for is a piece somebody must find.",
        "مدل قطعات بیشتری از آنچه نواحی گزارش می‌کنند نگه داشته و زمان ماند از هدف خود گذشته است. مدل هرگز بی‌صدا اصلاح نمی‌شود: قطعه‌ای که حساب نشده، قطعه‌ای است که کسی باید پیدایش کند.",
      ),
    }),
    a.node("FAULT_MODE", "FM_DISCHARGE_DOOR_DISCREPANCY", t("Discharge door reports open and closed", "گزارش هم‌زمان باز و بسته بودن درب تخلیه"), {
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "ACTUATOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_PYROMETER_COMMS_LOSS", t("Pyrometer telemetry lost", "قطع تله‌متری پیرومتر"), {
      domain: "NETWORK",
      attributes: { faultClass: "COMMUNICATION_LOSS", subsystem: "TELEMETRY" },
      description: t(
        "The temperature picture froze. What the furnace is actually doing is unknown, and unknown is never reported as safe.",
        "تصویر دما منجمد شد. اینکه کوره واقعاً چه می‌کند نامعلوم است و نامعلوم هرگز ایمن گزارش نمی‌شود.",
      ),
    }),
    a.node("FAULT_MODE", "FM_QUENCH_UNAVAILABLE", t("Quench unavailable for discharge", "در دسترس نبودن کوئنچ برای تخلیه"), {
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "PERMISSIVE_MISSING", subsystem: "MECHANICAL" },
    }),
    a.node("FAULT_MODE", "FM_RECIPE_PROFILE_MISMATCH", t("Loaded profile is not the selected revision", "ناهمخوانی پروفیل بارگذاری‌شده با نسخهٔ انتخابی"), {
      domain: "QUALITY",
      attributes: { faultClass: "RECIPE_MISMATCH", subsystem: "RECIPE_CONFIG" },
    }),
    a.node("FAULT_MODE", "FM_LINE_LEFT_IN_LOCAL", t("Line left in local mode", "رهاشدن خط در حالت محلی"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { faultClass: "INCORRECT_MODE", subsystem: "HMI" },
    }),

    /* Safe actions */
    a.node("SAFE_ACTION", "SA_COMPARE_ZONE_TC_TO_CALIBRATED_INSTRUMENT", t("Compare the zone thermocouple to a calibrated instrument", "مقایسهٔ ترموکوپل ناحیه با ابزار کالیبره"), { domain: "FIELD_IO" }),
    a.node("SAFE_ACTION", "SA_REVIEW_REDUNDANT_TEMPERATURE_EVIDENCE", t("Review both temperature witnesses against the trend", "بازبینی هر دو شاهد دما در برابر روند"), { domain: "FIELD_IO" }),
    a.node("SAFE_ACTION", "SA_ESCALATE_ZONE_OVERTEMPERATURE_REVIEW", t("Escalate a zone overtemperature review", "ارجاع بازبینی اضافه‌دمای ناحیه"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Escalate-only, to the heat-treatment engineer. No burner adjustment is made or advised from here.",
        "فقط ارجاع، به مهندس عملیات حرارتی. هیچ تنظیم مشعلی از اینجا انجام یا توصیه نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_BMS_COMBUSTION_REVIEW", t("Escalate to a burner-management review", "ارجاع به بازبینی مدیریت مشعل"), {
      subsystem: "COMBUSTION_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "Escalate-only, to the combustion-safety engineer. The trip is not reset, the purge is not initiated and no fuel, pilot or ignition device is touched from here or from anywhere else in Hermes.",
        "فقط ارجاع، به مهندس ایمنی احتراق. تریپ ریست نمی‌شود، پرژ آغاز نمی‌شود و هیچ وسیلهٔ سوخت، پیلوت یا جرقه‌ای از اینجا یا هیچ جای دیگر هرمس لمس نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_READ_HEARTH_DRIVE_FAULT_HISTORY", t("Read the hearth drive fault history", "خواندن تاریخچهٔ خطای درایو کوره"), { domain: "DRIVES" }),
    a.node("SAFE_ACTION", "SA_RECONCILE_MATERIAL_TRACKING_AGAINST_FURNACE", t("Reconcile the material model against the furnace", "تطبیق مدل مواد با خود کوره"), {
      description: t(
        "A physical count against the model, by a qualified person. The model is corrected only by that reconciliation, never automatically.",
        "شمارش فیزیکی در برابر مدل، توسط فرد واجد صلاحیت. مدل تنها با همان تطبیق اصلاح می‌شود، هرگز به‌صورت خودکار.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_DISCHARGE_DOOR_LIMITS", t("Inspect the discharge door limit switches", "بازرسی لیمیت‌سوییچ‌های درب تخلیه"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("SAFE_ACTION", "SA_VERIFY_PYROMETER_LINK_AND_CPU_DIAGNOSTICS", t("Verify the pyrometer link and read the CPU diagnostic buffer", "بررسی پیوند پیرومتر و خواندن بافر تشخیصی پردازنده"), { domain: "NETWORK" }),
    a.node("SAFE_ACTION", "SA_ESCALATE_QUENCH_AVAILABILITY_REVIEW", t("Escalate a quench availability review", "ارجاع بازبینی در دسترس بودن کوئنچ"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_RECIPE_REVISION_AND_PROFILE", t("Review the recipe revision against the loaded profile", "بازبینی نسخهٔ دستور ساخت در برابر پروفیل بارگذاری‌شده"), { domain: "QUALITY" }),
    a.node("SAFE_ACTION", "SA_REVIEW_OPERATOR_AUDIT_LOG", t("Review the operator audit log", "بازبینی گزارش ممیزی اپراتور"), { domain: "OPERATOR_INTERFACE" }),
  ],

  edges: [
    /* Containment */
    a.edge(D.cpu, B.obMain, "CONTAINS"),
    a.edge(D.cpu, B.obStartup, "CONTAINS"),
    a.edge(D.cpu, B.fbZone, "CONTAINS"),
    a.edge(D.cpu, B.fbRecipe, "CONTAINS"),
    a.edge(D.cpu, B.fbConveyor, "CONTAINS"),
    a.edge(D.cpu, B.fbTracking, "CONTAINS"),
    a.edge(D.cpu, B.fbQuench, "CONTAINS"),
    a.edge(D.cpu, B.fbState, "CONTAINS"),
    a.edge(D.cpu, B.fcSensor, "CONTAINS"),
    a.edge(D.cpu, B.fcDeviation, "CONTAINS"),
    a.edge(D.cpu, B.fcResidence, "CONTAINS"),
    a.edge(D.cpu, B.fcKpi, "CONTAINS"),
    a.edge(D.cpu, B.dbInstance, "CONTAINS"),
    a.edge(D.cpu, B.dbRecipe, "CONTAINS"),
    a.edge(D.cpu, B.dbConfig, "CONTAINS"),
    a.edge(D.cpu, B.dbTracking, "CONTAINS"),
    a.edge(D.cpu, B.dbAlarms, "CONTAINS"),
    a.edge(D.cpu, B.udtZone, "CONTAINS"),
    a.edge(D.cpu, B.udtTemp, "CONTAINS"),
    a.edge(D.cpu, B.udtProfile, "CONTAINS"),
    a.edge(D.cpu, B.udtPiece, "CONTAINS"),
    a.edge(D.cpu, B.udtDrive, "CONTAINS"),
    a.edge(D.cpu, B.udtSeq, "CONTAINS"),
    a.edge(D.cpu, SQ, "CONTAINS"),
    a.edge(D.io, IO.z2TcAi, "CONTAINS"),
    a.edge(D.io, IO.z3TcAi, "CONTAINS"),
    a.edge(D.io, IO.z2PyroAi, "CONTAINS"),
    a.edge(D.io, IO.quenchFlowAi, "CONTAINS"),
    a.edge(D.io, IO.entryPhotoDi, "CONTAINS"),
    a.edge(D.io, IO.dischargeDoorDi, "CONTAINS"),
    a.edge(D.io, IO.rollerFaultDi, "CONTAINS"),
    a.edge(D.bms, T.bmsReady, "CONTAINS"),
    a.edge(D.bms, T.bmsFlameOk, "CONTAINS"),
    a.edge(D.bms, T.bmsPurgeComplete, "CONTAINS"),
    a.edge(D.bms, T.bmsCombustionTrip, "CONTAINS"),
    a.edge(D.bms, T.bmsFuelValvePos, "CONTAINS"),
    a.edge(D.bms, T.bmsPilotValvePos, "CONTAINS"),
    a.edge(D.bms, T.bmsIgnitionActive, "CONTAINS"),
    a.edge(D.bms, EV.bmsEventLog, "CONTAINS"),
    a.edge(D.panel, H.overview, "CONTAINS"),
    a.edge(D.panel, H.recipe, "CONTAINS"),
    a.edge(D.panel, H.alarms, "CONTAINS"),
    a.edge(D.panel, AQ, "CONTAINS"),
    a.edge(H.overview, HO.zoneTemps, "CONTAINS"),
    a.edge(H.overview, HO.heatDemand, "CONTAINS"),
    a.edge(H.overview, HO.bmsStatus, "CONTAINS"),
    a.edge(H.overview, HO.startButton, "CONTAINS"),
    a.edge(H.recipe, HO.recipeSelect, "CONTAINS"),
    a.edge(H.alarms, HO.alarmBanner, "CONTAINS"),
    a.edge(SQ, S.idle, "CONTAINS"),
    a.edge(SQ, S.load, "CONTAINS"),
    a.edge(SQ, S.heat, "CONTAINS"),
    a.edge(SQ, S.soak, "CONTAINS"),
    a.edge(SQ, S.quench, "CONTAINS"),
    a.edge(SQ, S.discharge, "CONTAINS"),
    a.edge(AQ, AS.normal, "CONTAINS"),
    a.edge(AQ, AS.unack, "CONTAINS"),
    a.edge(AQ, AS.acked, "CONTAINS"),
    a.edge(AQ, AS.rtnUnack, "CONTAINS"),

    /* ── SCL-derived relationships ───────────────────────────────────────── */

    /* OB_STARTUP */
    a.edge(B.obStartup, T.seqStep, "WRITES"),
    a.edge(B.obStartup, T.heatDemand, "WRITES"),
    a.edge(B.obStartup, T.lineRunning, "WRITES"),
    a.edge(B.obStartup, T.conveyorSpeedRef, "WRITES"),
    a.edge(B.obStartup, T.recipeLocked, "WRITES"),
    a.edge(B.obStartup, T.trackRecoveryReview, "WRITES"),
    a.edge(B.obStartup, T.alarmWord, "WRITES"),

    /* OB_MAIN */
    a.edge(B.obMain, B.fcSensor, "CALLS"),
    a.edge(B.obMain, B.fbRecipe, "CALLS"),
    a.edge(B.obMain, B.fbZone, "CALLS"),
    a.edge(B.obMain, B.fbConveyor, "CALLS"),
    a.edge(B.obMain, B.fbTracking, "CALLS"),
    a.edge(B.obMain, B.fbQuench, "CALLS"),
    a.edge(B.obMain, B.fbState, "CALLS"),
    a.edge(B.obMain, B.fcKpi, "CALLS"),

    /* FB_ZONE_PROFILE_CONTROL */
    a.edge(B.fbZone, B.fcDeviation, "CALLS"),
    a.edge(B.fbZone, T.bmsReady, "READS"),
    a.edge(B.fbZone, T.bmsPurgeComplete, "READS"),
    a.edge(B.fbZone, T.bmsCombustionTrip, "READS"),
    a.edge(B.fbZone, P.bmsReady, "READS"),
    a.edge(B.fbZone, T.bmsFlameOk, "READS"),
    a.edge(B.fbZone, T.tempConfidenceOk, "READS"),
    a.edge(B.fbZone, T.recipeValid, "READS"),
    a.edge(B.fbZone, B.dbRecipe, "READS"),
    a.edge(B.fbZone, T.heatDemand, "READS"),
    a.edge(B.fbZone, T.lineRunning, "READS"),
    a.edge(B.fbZone, P.bmsReady, "WRITES"),
    a.edge(B.fbZone, T.heatDemand, "WRITES"),
    a.edge(B.fbZone, T.soakReady, "WRITES"),

    /* FB_RECIPE_MANAGEMENT */
    a.edge(B.fbRecipe, B.dbRecipe, "READS"),
    a.edge(B.fbRecipe, T.recipeChecksumAct, "READS"),
    a.edge(B.fbRecipe, T.recipeBoundsOk, "READS"),
    a.edge(B.fbRecipe, T.recipeChecksumOk, "READS"),
    a.edge(B.fbRecipe, T.recipeSelected, "READS"),
    a.edge(B.fbRecipe, T.recipeValid, "READS"),
    a.edge(B.fbRecipe, T.lineRunning, "READS"),
    a.edge(B.fbRecipe, T.piecesInFurnace, "READS"),
    a.edge(B.fbRecipe, T.recipeChangeRequest, "READS"),
    a.edge(B.fbRecipe, T.recipeLocked, "READS"),
    a.edge(B.fbRecipe, T.recipeBoundsOk, "WRITES"),
    a.edge(B.fbRecipe, T.recipeChecksumOk, "WRITES"),
    a.edge(B.fbRecipe, T.recipeValid, "WRITES"),
    a.edge(B.fbRecipe, T.almRecipeInvalid, "WRITES"),
    a.edge(B.fbRecipe, T.recipeLocked, "WRITES"),
    a.edge(B.fbRecipe, T.almRecipeChangeBlocked, "WRITES"),
    a.edge(B.fbRecipe, T.recipeChangeReview, "WRITES"),
    a.edge(B.fbRecipe, P.recipeReady, "WRITES"),

    /* FB_CONVEYOR_SYNC */
    a.edge(B.fbConveyor, B.dbRecipe, "READS"),
    a.edge(B.fbConveyor, T.recipeValid, "READS"),
    a.edge(B.fbConveyor, T.lineRunning, "READS"),
    a.edge(B.fbConveyor, T.hearthSpeedAct, "READS"),
    a.edge(B.fbConveyor, T.exitSpeedAct, "READS"),
    a.edge(B.fbConveyor, T.speedSyncOk, "READS"),
    a.edge(B.fbConveyor, T.rollerDriveFault, "READS"),
    a.edge(B.fbConveyor, T.rollerDriveFaultPrev, "READS"),
    a.edge(B.fbConveyor, T.conveyorSpeedRef, "WRITES"),
    a.edge(B.fbConveyor, T.speedSyncOk, "WRITES"),
    a.edge(B.fbConveyor, T.almSpeedSync, "WRITES"),
    a.edge(B.fbConveyor, T.almRollerTrip, "WRITES"),
    a.edge(B.fbConveyor, T.lineRunning, "WRITES"),
    a.edge(B.fbConveyor, T.rollerDriveFaultPrev, "WRITES"),
    a.edge(B.fbConveyor, P.conveyorReady, "WRITES"),

    /* FB_MATERIAL_TRACKING */
    a.edge(B.fbTracking, T.entryPhotocell, "READS"),
    a.edge(B.fbTracking, T.entryPhotocellPrev, "READS"),
    a.edge(B.fbTracking, T.piecesInFurnace, "READS"),
    a.edge(B.fbTracking, T.pieceIdCounter, "READS"),
    a.edge(B.fbTracking, T.dischargePhotocell, "READS"),
    a.edge(B.fbTracking, T.dischargePhotocellPrev, "READS"),
    a.edge(B.fbTracking, T.zoneOccupancyDuplicate, "READS"),
    a.edge(B.fbTracking, T.zonePiecesDetected, "READS"),
    a.edge(B.fbTracking, T.pieceIdCounter, "WRITES"),
    a.edge(B.fbTracking, T.piecesInFurnace, "WRITES"),
    a.edge(B.fbTracking, T.almTrackOverflow, "WRITES"),
    a.edge(B.fbTracking, T.entryPhotocellPrev, "WRITES"),
    a.edge(B.fbTracking, T.pieceDischargedPulse, "WRITES"),
    a.edge(B.fbTracking, T.almTrackImpossible, "WRITES"),
    a.edge(B.fbTracking, T.dischargePhotocellPrev, "WRITES"),
    a.edge(B.fbTracking, T.almTrackDuplicate, "WRITES"),
    a.edge(B.fbTracking, T.almTrackLost, "WRITES"),

    /* FB_QUENCH_SUPERVISION */
    a.edge(B.fbQuench, T.quenchFlowAct, "READS"),
    a.edge(B.fbQuench, T.quenchPumpReady, "READS"),
    a.edge(B.fbQuench, T.quenchPumpFault, "READS"),
    a.edge(B.fbQuench, T.quenchFlowOk, "READS"),
    a.edge(B.fbQuench, T.quenchPumpAvailable, "READS"),
    a.edge(B.fbQuench, T.quenchFlowOk, "WRITES"),
    a.edge(B.fbQuench, T.quenchPumpAvailable, "WRITES"),
    a.edge(B.fbQuench, T.almQuenchFlowLow, "WRITES"),
    a.edge(B.fbQuench, T.almQuenchUnavailable, "WRITES"),
    a.edge(B.fbQuench, P.quenchReady, "WRITES"),

    /* FB_STATE_SUPERVISION */
    a.edge(B.fbState, T.bmsCombustionTrip, "READS"),
    a.edge(B.fbState, T.bmsReady, "READS"),
    a.edge(B.fbState, T.dischargeDoorOpenFb, "READS"),
    a.edge(B.fbState, T.dischargeDoorClosedFb, "READS"),
    a.edge(B.fbState, T.seqStep, "READS"),
    a.edge(B.fbState, T.startRequest, "READS"),
    a.edge(B.fbState, T.modeAuto, "READS"),
    a.edge(B.fbState, T.modeRemote, "READS"),
    a.edge(B.fbState, P.recipeReady, "READS"),
    a.edge(B.fbState, P.bmsReady, "READS"),
    a.edge(B.fbState, P.conveyorReady, "READS"),
    a.edge(B.fbState, T.trackRecoveryReview, "READS"),
    a.edge(B.fbState, T.entryDoorOpenFb, "READS"),
    a.edge(B.fbState, T.tempConfidenceOk, "READS"),
    a.edge(B.fbState, T.soakReady, "READS"),
    a.edge(B.fbState, P.quenchReady, "READS"),
    a.edge(B.fbState, T.seqStep, "WRITES"),
    a.edge(B.fbState, T.lineRunning, "WRITES"),
    a.edge(B.fbState, T.heatDemand, "WRITES"),
    a.edge(B.fbState, T.almDoorDiscrepancy, "WRITES"),

    /* FC_SENSOR_VALIDATION */
    a.edge(B.fcSensor, T.z1TempTc, "READS"),
    a.edge(B.fcSensor, T.z2TempTc, "READS"),
    a.edge(B.fcSensor, T.z3TempTc, "READS"),
    a.edge(B.fcSensor, T.z1TempValid, "READS"),
    a.edge(B.fcSensor, T.z2TempValid, "READS"),
    a.edge(B.fcSensor, T.z3TempValid, "READS"),
    a.edge(B.fcSensor, T.z2TempPyro, "READS"),
    a.edge(B.fcSensor, B.dbConfig, "READS"),
    a.edge(B.fcSensor, T.tempAgrees, "READS"),
    a.edge(B.fcSensor, T.pyroLinkOk, "READS"),
    a.edge(B.fcSensor, T.tempDataStale, "READS"),
    a.edge(B.fcSensor, T.z1TempValid, "WRITES"),
    a.edge(B.fcSensor, T.z2TempValid, "WRITES"),
    a.edge(B.fcSensor, T.z3TempValid, "WRITES"),
    a.edge(B.fcSensor, T.tempConfidenceOk, "WRITES"),
    a.edge(B.fcSensor, T.tempAgrees, "WRITES"),
    a.edge(B.fcSensor, T.almTempDisagree, "WRITES"),
    a.edge(B.fcSensor, T.almTempStale, "WRITES"),

    /* FC_TEMP_DEVIATION */
    a.edge(B.fcDeviation, T.z1TempTc, "READS"),
    a.edge(B.fcDeviation, T.z2TempTc, "READS"),
    a.edge(B.fcDeviation, T.z3TempTc, "READS"),
    a.edge(B.fcDeviation, B.dbRecipe, "READS"),
    a.edge(B.fcDeviation, T.z3TempDev, "READS"),
    a.edge(B.fcDeviation, B.dbConfig, "READS"),
    a.edge(B.fcDeviation, T.z1TempDev, "WRITES"),
    a.edge(B.fcDeviation, T.z2TempDev, "WRITES"),
    a.edge(B.fcDeviation, T.z3TempDev, "WRITES"),
    a.edge(B.fcDeviation, T.almZoneOvertemp, "WRITES"),

    /* FC_RESIDENCE_TIME */
    a.edge(B.fcResidence, T.residenceTime, "READS"),
    a.edge(B.fcResidence, B.dbRecipe, "READS"),
    a.edge(B.fcResidence, T.residenceDeviation, "READS"),
    a.edge(B.fcResidence, B.dbConfig, "READS"),
    a.edge(B.fcResidence, T.residenceTime, "WRITES"),
    a.edge(B.fcResidence, T.residenceDeviation, "WRITES"),
    a.edge(B.fcResidence, T.almResidence, "WRITES"),

    /* FC_KPI_CALC */
    a.edge(B.fcKpi, B.fcResidence, "CALLS"),
    a.edge(B.fcKpi, T.prodCountPieces, "READS"),
    a.edge(B.fcKpi, T.pieceDischargedPulse, "READS"),
    a.edge(B.fcKpi, T.fuelEnergyTotal, "READS"),
    a.edge(B.fcKpi, T.piecesInProfile, "READS"),
    a.edge(B.fcKpi, T.prodCountPieces, "WRITES"),
    a.edge(B.fcKpi, T.specificEnergy, "WRITES"),
    a.edge(B.fcKpi, T.qualityInProfile, "WRITES"),

    /* ── Graph-only engineering structure ──────────────────────────────── */

    /* Field channels */
    a.edge(T.z2TempTc, IO.z2TcAi, "BOUND_TO"),
    a.edge(T.z3TempTc, IO.z3TcAi, "BOUND_TO"),
    a.edge(T.z2TempPyro, IO.z2PyroAi, "BOUND_TO"),
    a.edge(T.quenchFlowAct, IO.quenchFlowAi, "BOUND_TO"),
    a.edge(T.entryPhotocell, IO.entryPhotoDi, "BOUND_TO"),
    a.edge(T.dischargeDoorOpenFb, IO.dischargeDoorDi, "BOUND_TO"),
    a.edge(T.rollerDriveFault, IO.rollerFaultDi, "BOUND_TO"),

    /* What the tags monitor */
    a.edge(T.z1TempTc, EQ.zone1, "MONITORS"),
    a.edge(T.z2TempTc, EQ.zone2, "MONITORS"),
    a.edge(T.z2TempPyro, EQ.zone2, "MONITORS"),
    a.edge(T.z3TempTc, EQ.zone3, "MONITORS"),
    a.edge(T.z1TempDev, EQ.zone1, "MONITORS"),
    a.edge(T.z2TempDev, EQ.zone2, "MONITORS"),
    a.edge(T.z3TempDev, EQ.zone3, "MONITORS"),
    a.edge(T.soakReady, EQ.soakZone, "MONITORS"),
    a.edge(T.hearthSpeedAct, EQ.hearth, "MONITORS"),
    a.edge(T.exitSpeedAct, EQ.exitConveyor, "MONITORS"),
    a.edge(T.rollerDriveFault, EQ.hearth, "MONITORS"),
    a.edge(T.conveyorSpeedRef, EQ.entryConveyor, "MONITORS"),
    a.edge(T.entryPhotocell, EQ.chargeTable, "MONITORS"),
    a.edge(T.entryDoorOpenFb, EQ.entryDoor, "MONITORS"),
    a.edge(T.entryDoorClosedFb, EQ.entryDoor, "MONITORS"),
    a.edge(T.dischargeDoorOpenFb, EQ.dischargeDoor, "MONITORS"),
    a.edge(T.dischargeDoorClosedFb, EQ.dischargeDoor, "MONITORS"),
    a.edge(T.dischargePhotocell, EQ.dischargeDoor, "MONITORS"),
    a.edge(T.quenchFlowAct, EQ.quench, "MONITORS"),
    a.edge(T.quenchTemp, EQ.quench, "MONITORS"),
    a.edge(T.quenchPumpReady, EQ.quenchPump, "MONITORS"),
    a.edge(T.quenchPumpFault, EQ.quenchPump, "MONITORS"),
    a.edge(T.bmsFuelValvePos, EQ.fuelTrain, "MONITORS"),
    a.edge(T.bmsPilotValvePos, EQ.burnerTrain, "MONITORS"),
    a.edge(T.bmsIgnitionActive, EQ.burnerTrain, "MONITORS"),
    a.edge(T.bmsFlameOk, EQ.burnerTrain, "MONITORS"),
    a.edge(D.bms, EQ.burnerTrain, "MONITORS"),
    a.edge(D.bms, EQ.fuelTrain, "MONITORS"),
    a.edge(D.vfdHearth, EQ.hearth, "MONITORS"),
    a.edge(D.pyrometer, EQ.zone2, "MONITORS"),

    /* Sequence chain and gating */
    ...chainStates(a, [S.idle, S.load, S.heat, S.soak, S.quench, S.discharge]),
    ...chainStates(a, [AS.normal, AS.unack, AS.acked, AS.rtnUnack]),
    a.edge(
      AS.rtnUnack,
      AS.normal,
      "TRANSITIONS_TO",
      t("Acknowledgement of a returned alarm closes the lifecycle", "تأیید آلارمِ بازگشته چرخه را می‌بندد"),
    ),
    a.edge(
      S.discharge,
      S.idle,
      "TRANSITIONS_TO",
      t("Discharge returns the line to idle, and a trip leaves it there", "تخلیه خط را به حالت بی‌کار بازمی‌گرداند و تریپ آن را همان‌جا نگه می‌دارد"),
    ),
    a.edge(P.recipeReady, SQ, "GATES"),
    a.edge(P.bmsReady, SQ, "GATES"),
    a.edge(P.conveyorReady, SQ, "GATES"),
    a.edge(P.quenchReady, S.quench, "GATES"),
    a.edge(I.combustionTrip, S.heat, "BLOCKS"),
    a.edge(I.overtemp, S.soak, "BLOCKS"),
    a.edge(I.doorInterlock, S.discharge, "BLOCKS"),
    a.edge(I.quenchInterlock, S.quench, "BLOCKS"),

    /* What the permissives and interlocks read */
    a.edge(P.recipeReady, T.recipeValid, "READS"),
    a.edge(P.bmsReady, T.bmsReady, "READS"),
    a.edge(P.bmsReady, T.bmsPurgeComplete, "READS"),
    a.edge(P.bmsReady, T.bmsCombustionTrip, "READS"),
    a.edge(P.conveyorReady, T.speedSyncOk, "READS"),
    a.edge(P.conveyorReady, T.rollerDriveFault, "READS"),
    a.edge(P.quenchReady, T.quenchFlowOk, "READS"),
    a.edge(P.quenchReady, T.quenchPumpAvailable, "READS"),
    a.edge(I.combustionTrip, T.bmsCombustionTrip, "READS"),
    a.edge(I.combustionTrip, T.bmsFlameOk, "READS"),
    a.edge(I.overtemp, T.z3TempDev, "READS"),
    a.edge(I.doorInterlock, T.dischargeDoorOpenFb, "READS"),
    a.edge(I.doorInterlock, T.dischargeDoorClosedFb, "READS"),
    a.edge(I.quenchInterlock, T.quenchFlowOk, "READS"),

    /* Alarms */
    a.edge(T.z3TempValid, AL.tcDrift, "RAISES"),
    a.edge(T.almTempDisagree, AL.tempDisagree, "RAISES"),
    a.edge(T.almZoneOvertemp, AL.zoneOvertemp, "RAISES"),
    a.edge(T.bmsCombustionTrip, AL.bmsNotReady, "RAISES"),
    a.edge(T.almRollerTrip, AL.rollerTrip, "RAISES"),
    a.edge(T.almSpeedSync, AL.rollerTrip, "RAISES"),
    a.edge(T.almTrackLost, AL.trackMismatch, "RAISES"),
    a.edge(T.almTrackOverflow, AL.trackMismatch, "RAISES"),
    a.edge(T.almTrackImpossible, AL.trackMismatch, "RAISES"),
    a.edge(T.almTrackDuplicate, AL.trackMismatch, "RAISES"),
    a.edge(T.almResidence, AL.trackMismatch, "RAISES"),
    a.edge(T.almDoorDiscrepancy, AL.doorDiscrepancy, "RAISES"),
    a.edge(T.almTempStale, AL.tempStale, "RAISES"),
    a.edge(T.almQuenchUnavailable, AL.quenchUnavailable, "RAISES"),
    a.edge(T.almQuenchFlowLow, AL.quenchUnavailable, "RAISES"),
    a.edge(T.almRecipeInvalid, AL.recipeMismatch, "RAISES"),
    a.edge(T.almRecipeChangeBlocked, AL.recipeMismatch, "RAISES"),
    a.edge(T.modeRemote, AL.lineInLocal, "RAISES"),

    /* Operator surface */
    a.edge(ST.z2Temp, T.z2TempTc, "MIRRORS"),
    a.edge(ST.heatDemand, T.heatDemand, "MIRRORS"),
    a.edge(ST.bmsReady, T.bmsReady, "MIRRORS"),
    a.edge(ST.lineRunning, T.lineRunning, "MIRRORS"),
    a.edge(H.overview, ST.z2Temp, "DISPLAYS"),
    a.edge(H.overview, ST.heatDemand, "DISPLAYS"),
    a.edge(H.overview, ST.bmsReady, "DISPLAYS"),
    a.edge(H.overview, ST.lineRunning, "DISPLAYS"),
    a.edge(H.overview, ST.startIntent, "COMMANDS"),
    a.edge(H.overview, H.recipe, "NAVIGATES_TO"),
    a.edge(H.overview, H.alarms, "NAVIGATES_TO"),
    a.edge(H.recipe, ST.recipeSelectIntent, "COMMANDS"),
    a.edge(H.recipe, H.overview, "NAVIGATES_TO"),
    a.edge(H.alarms, ST.ackCmd, "COMMANDS"),
    a.edge(H.alarms, H.overview, "NAVIGATES_TO"),
    a.edge(HO.zoneTemps, ST.z2Temp, "DISPLAYS"),
    a.edge(HO.heatDemand, ST.heatDemand, "DISPLAYS"),
    a.edge(HO.bmsStatus, ST.bmsReady, "DISPLAYS"),
    a.edge(HO.startButton, ST.startIntent, "COMMANDS"),
    a.edge(HO.recipeSelect, ST.recipeSelectIntent, "COMMANDS"),
    a.edge(HO.alarmBanner, ST.ackCmd, "COMMANDS"),
    a.edge(SC.startIntent, ST.z2Temp, "READS"),
    a.edge(SC.startIntent, ST.bmsReady, "READS"),
    a.edge(SC.startIntent, ST.startIntent, "WRITES"),
    a.edge(SC.recipeIntent, ST.lineRunning, "READS"),
    a.edge(SC.recipeIntent, ST.recipeSelectIntent, "WRITES"),
    a.edge(SC.alarmAck, ST.ackCmd, "WRITES"),
    a.edge(SC.kpiPublish, ST.lineRunning, "READS"),
    a.edge(SC.kpiPublish, ST.kpiPublished, "WRITES"),
    a.edge(SC.startIntent, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.startIntent, AE.startIntent, "EMITS"),
    a.edge(SC.recipeIntent, R.metallurgist, "REQUIRES_ROLE"),
    a.edge(SC.recipeIntent, AE.recipeIntent, "EMITS"),
    a.edge(SC.alarmAck, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.alarmAck, AE.alarmAck, "EMITS"),
    // No REQUIRES_ROLE: nothing human invokes the publication routine.
    a.edge(SC.kpiPublish, AE.kpiRecord, "EMITS"),

    /* Historian and KPI */
    a.edge(EV.tempTrend, T.z1TempTc, "RECORDS"),
    a.edge(EV.tempTrend, T.z2TempTc, "RECORDS"),
    a.edge(EV.tempTrend, T.z3TempTc, "RECORDS"),
    a.edge(EV.tempTrend, T.z2TempPyro, "RECORDS"),
    a.edge(EV.tempTrend, T.heatDemand, "RECORDS"),
    a.edge(EV.bmsEventLog, T.bmsCombustionTrip, "RECORDS"),
    a.edge(EV.bmsEventLog, T.bmsFlameOk, "RECORDS"),
    a.edge(EV.bmsEventLog, T.bmsPurgeComplete, "RECORDS"),
    a.edge(EV.driveEventLog, T.rollerDriveFault, "RECORDS"),
    a.edge(EV.driveEventLog, T.hearthSpeedAct, "RECORDS"),
    a.edge(EV.driveEventLog, T.dischargeDoorOpenFb, "RECORDS"),
    a.edge(EV.trackingLog, T.piecesInFurnace, "RECORDS"),
    a.edge(EV.trackingLog, T.pieceIdCounter, "RECORDS"),
    a.edge(EV.trackingLog, T.residenceTime, "RECORDS"),
    a.edge(EV.cpuDiagnostics, T.pyroLinkOk, "RECORDS"),
    a.edge(EV.cpuDiagnostics, T.telemetryAge, "RECORDS"),
    a.edge(EV.recipeAuditLog, T.recipeChecksumAct, "RECORDS"),
    a.edge(EV.recipeAuditLog, T.recipeChangeRequest, "RECORDS"),
    a.edge(EV.operatorAuditLog, T.modeRemote, "RECORDS"),
    a.edge(EV.quenchTrend, T.quenchFlowAct, "RECORDS"),
    a.edge(EV.quenchTrend, T.quenchTemp, "RECORDS"),
    a.edge(K.production, T.prodCountPieces, "DERIVED_FROM"),
    a.edge(K.specificEnergy, T.specificEnergy, "DERIVED_FROM"),
    a.edge(K.specificEnergy, T.fuelEnergyTotal, "DERIVED_FROM"),
    a.edge(K.quality, T.qualityInProfile, "DERIVED_FROM"),
    a.edge(K.quality, T.piecesInProfile, "DERIVED_FROM"),
    a.edge(K.residence, T.residenceTime, "DERIVED_FROM"),
    a.edge(K.residence, T.residenceDeviation, "DERIVED_FROM"),

    /* Fault modes */
    a.edge(FM.tcDrift, AL.tcDrift, "EXPLAINS"),
    a.edge(T.z3TempTc, FM.tcDrift, "EVIDENCE_FOR"),
    a.edge(T.z3TempValid, FM.tcDrift, "EVIDENCE_FOR"),
    a.edge(T.z3TempDev, FM.tcDrift, "EVIDENCE_FOR"),
    a.edge(IO.z3TcAi, FM.tcDrift, "EVIDENCE_FOR"),
    a.edge(EV.tempTrend, FM.tcDrift, "EVIDENCE_FOR"),

    a.edge(FM.evidenceConflict, AL.tempDisagree, "EXPLAINS"),
    a.edge(T.tempAgrees, FM.evidenceConflict, "EVIDENCE_FOR"),
    a.edge(T.z2TempTc, FM.evidenceConflict, "EVIDENCE_FOR"),
    a.edge(T.z2TempPyro, FM.evidenceConflict, "EVIDENCE_FOR"),
    a.edge(T.tempConfidenceOk, FM.evidenceConflict, "EVIDENCE_FOR"),
    a.edge(T.almTempDisagree, FM.evidenceConflict, "EVIDENCE_FOR"),
    a.edge(EV.tempTrend, FM.evidenceConflict, "EVIDENCE_FOR"),

    a.edge(FM.zoneOvertemp, AL.zoneOvertemp, "EXPLAINS"),
    a.edge(T.z3TempDev, FM.zoneOvertemp, "EVIDENCE_FOR"),
    a.edge(T.z3TempTc, FM.zoneOvertemp, "EVIDENCE_FOR"),
    a.edge(T.heatDemand, FM.zoneOvertemp, "EVIDENCE_FOR"),
    a.edge(T.almZoneOvertemp, FM.zoneOvertemp, "EVIDENCE_FOR"),
    a.edge(I.overtemp, FM.zoneOvertemp, "EVIDENCE_FOR"),
    a.edge(EV.tempTrend, FM.zoneOvertemp, "EVIDENCE_FOR"),

    a.edge(FM.bmsBoundary, AL.bmsNotReady, "EXPLAINS"),
    a.edge(T.bmsReady, FM.bmsBoundary, "EVIDENCE_FOR"),
    a.edge(T.bmsCombustionTrip, FM.bmsBoundary, "EVIDENCE_FOR"),
    a.edge(T.bmsFlameOk, FM.bmsBoundary, "EVIDENCE_FOR"),
    a.edge(I.combustionTrip, FM.bmsBoundary, "EVIDENCE_FOR"),
    a.edge(T.heatDemand, FM.bmsBoundary, "EVIDENCE_FOR"),
    a.edge(EV.bmsEventLog, FM.bmsBoundary, "EVIDENCE_FOR"),

    a.edge(FM.rollerTrip, AL.rollerTrip, "EXPLAINS"),
    a.edge(T.rollerDriveFault, FM.rollerTrip, "EVIDENCE_FOR"),
    a.edge(T.hearthSpeedAct, FM.rollerTrip, "EVIDENCE_FOR"),
    a.edge(T.almRollerTrip, FM.rollerTrip, "EVIDENCE_FOR"),
    a.edge(T.lineRunning, FM.rollerTrip, "EVIDENCE_FOR"),
    a.edge(EV.driveEventLog, FM.rollerTrip, "EVIDENCE_FOR"),

    a.edge(FM.trackingMismatch, AL.trackMismatch, "EXPLAINS"),
    a.edge(T.piecesInFurnace, FM.trackingMismatch, "EVIDENCE_FOR"),
    a.edge(T.zonePiecesDetected, FM.trackingMismatch, "EVIDENCE_FOR"),
    a.edge(T.almTrackLost, FM.trackingMismatch, "EVIDENCE_FOR"),
    a.edge(T.residenceDeviation, FM.trackingMismatch, "EVIDENCE_FOR"),
    a.edge(T.almResidence, FM.trackingMismatch, "EVIDENCE_FOR"),
    a.edge(EV.trackingLog, FM.trackingMismatch, "EVIDENCE_FOR"),

    a.edge(FM.doorDiscrepancy, AL.doorDiscrepancy, "EXPLAINS"),
    a.edge(T.dischargeDoorOpenFb, FM.doorDiscrepancy, "EVIDENCE_FOR"),
    a.edge(T.dischargeDoorClosedFb, FM.doorDiscrepancy, "EVIDENCE_FOR"),
    a.edge(T.almDoorDiscrepancy, FM.doorDiscrepancy, "EVIDENCE_FOR"),
    a.edge(I.doorInterlock, FM.doorDiscrepancy, "EVIDENCE_FOR"),
    a.edge(IO.dischargeDoorDi, FM.doorDiscrepancy, "EVIDENCE_FOR"),
    a.edge(EV.driveEventLog, FM.doorDiscrepancy, "EVIDENCE_FOR"),

    a.edge(FM.pyroCommsLoss, AL.tempStale, "EXPLAINS"),
    a.edge(T.pyroLinkOk, FM.pyroCommsLoss, "EVIDENCE_FOR"),
    a.edge(T.telemetryAge, FM.pyroCommsLoss, "EVIDENCE_FOR"),
    a.edge(T.tempDataStale, FM.pyroCommsLoss, "EVIDENCE_FOR"),
    a.edge(T.almTempStale, FM.pyroCommsLoss, "EVIDENCE_FOR"),
    a.edge(T.tempConfidenceOk, FM.pyroCommsLoss, "EVIDENCE_FOR"),
    a.edge(EV.cpuDiagnostics, FM.pyroCommsLoss, "EVIDENCE_FOR"),

    a.edge(FM.quenchUnavailable, AL.quenchUnavailable, "EXPLAINS"),
    a.edge(T.quenchFlowAct, FM.quenchUnavailable, "EVIDENCE_FOR"),
    a.edge(T.quenchFlowOk, FM.quenchUnavailable, "EVIDENCE_FOR"),
    a.edge(T.quenchPumpReady, FM.quenchUnavailable, "EVIDENCE_FOR"),
    a.edge(T.quenchPumpFault, FM.quenchUnavailable, "EVIDENCE_FOR"),
    a.edge(T.quenchPumpAvailable, FM.quenchUnavailable, "EVIDENCE_FOR"),
    a.edge(T.almQuenchUnavailable, FM.quenchUnavailable, "EVIDENCE_FOR"),
    a.edge(P.quenchReady, FM.quenchUnavailable, "EVIDENCE_FOR"),
    a.edge(I.quenchInterlock, FM.quenchUnavailable, "EVIDENCE_FOR"),
    a.edge(EV.quenchTrend, FM.quenchUnavailable, "EVIDENCE_FOR"),

    a.edge(FM.recipeMismatch, AL.recipeMismatch, "EXPLAINS"),
    a.edge(T.recipeChecksumOk, FM.recipeMismatch, "EVIDENCE_FOR"),
    a.edge(T.recipeChecksumAct, FM.recipeMismatch, "EVIDENCE_FOR"),
    a.edge(T.recipeValid, FM.recipeMismatch, "EVIDENCE_FOR"),
    a.edge(T.almRecipeInvalid, FM.recipeMismatch, "EVIDENCE_FOR"),
    a.edge(EV.recipeAuditLog, FM.recipeMismatch, "EVIDENCE_FOR"),

    a.edge(FM.leftInLocal, AL.lineInLocal, "EXPLAINS"),
    a.edge(T.modeRemote, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(T.startRequest, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(T.seqStep, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(EV.operatorAuditLog, FM.leftInLocal, "EVIDENCE_FOR"),

    /* Safe actions */
    a.edge(SA.tcCompare, FM.tcDrift, "VERIFIES"),
    a.edge(SA.evidenceReview, FM.evidenceConflict, "VERIFIES"),
    a.edge(SA.overtempReview, FM.zoneOvertemp, "VERIFIES"),
    a.edge(SA.bmsReview, FM.bmsBoundary, "VERIFIES"),
    a.edge(SA.driveHistory, FM.rollerTrip, "VERIFIES"),
    a.edge(SA.trackingReview, FM.trackingMismatch, "VERIFIES"),
    a.edge(SA.doorInspect, FM.doorDiscrepancy, "VERIFIES"),
    a.edge(SA.pyroDiagnostics, FM.pyroCommsLoss, "VERIFIES"),
    a.edge(SA.quenchReview, FM.quenchUnavailable, "VERIFIES"),
    a.edge(SA.recipeReview, FM.recipeMismatch, "VERIFIES"),
    a.edge(SA.auditReview, FM.leftInLocal, "VERIFIES"),
  ],

  artifacts: [
    {
      local: "OB_STARTUP",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "OB100_Startup.scl",
      declares: [B.obStartup],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "OB100", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: OB_STARTUP_SCL,
    },
    {
      local: "OB_MAIN",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "OB1_Main.scl",
      declares: [B.obMain],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "OB1", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: OB_MAIN_SCL,
    },
    {
      local: "FB_ZONE_PROFILE_CONTROL",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1410_ZoneProfileControl.scl",
      declares: [B.fbZone, P.bmsReady, EQ.zone1, EQ.zone2, EQ.zone3],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "FB1410", domain: "PROCESS", safetyClass: "NON_SAFETY" },
      content: FB_ZONE_PROFILE_CONTROL_SCL,
    },
    {
      local: "FB_RECIPE_MANAGEMENT",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1420_RecipeManagement.scl",
      declares: [B.fbRecipe, P.recipeReady],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "FB1420", domain: "QUALITY", safetyClass: "NON_SAFETY" },
      content: FB_RECIPE_MANAGEMENT_SCL,
    },
    {
      local: "FB_CONVEYOR_SYNC",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1430_ConveyorSync.scl",
      declares: [B.fbConveyor, P.conveyorReady, EQ.hearth, EQ.exitConveyor],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "FB1430", domain: "DRIVES", safetyClass: "NON_SAFETY" },
      content: FB_CONVEYOR_SYNC_SCL,
    },
    {
      local: "FB_MATERIAL_TRACKING",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1440_MaterialTracking.scl",
      declares: [B.fbTracking, B.dbTracking],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "FB1440", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: FB_MATERIAL_TRACKING_SCL,
    },
    {
      local: "FB_QUENCH_SUPERVISION",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1450_QuenchSupervision.scl",
      declares: [B.fbQuench, P.quenchReady, EQ.quench, EQ.quenchPump],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "FB1450", domain: "PROCESS", safetyClass: "NON_SAFETY" },
      content: FB_QUENCH_SUPERVISION_SCL,
    },
    {
      local: "FB_STATE_SUPERVISION",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1460_StateSupervision.scl",
      declares: [B.fbState, SQ, S.idle, S.load, S.heat, S.soak, S.quench, S.discharge],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "FB1460", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: FB_STATE_SUPERVISION_SCL,
    },
    {
      local: "FC_LIBRARY",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FC1470_1473_Library.scl",
      declares: [B.fcSensor, B.fcDeviation, B.fcResidence, B.fcKpi, K.production, K.specificEnergy, K.quality, K.residence],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "FC1470", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: FC_LIBRARY_SCL,
    },
    {
      local: "DB_DEFINITIONS",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "DB1410_1414_Definitions.scl",
      declares: [B.dbInstance, B.dbRecipe, B.dbConfig, B.dbTracking, B.dbAlarms],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "DB1410", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: DB_DEFINITIONS_SCL,
    },
    {
      local: "UDT_DEFINITIONS",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "UDT_Definitions.scl",
      declares: [B.udtZone, B.udtTemp, B.udtProfile, B.udtPiece, B.udtDrive, B.udtSeq],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "UDT", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: UDT_DEFINITIONS_SCL,
    },
    {
      local: "LAD_SUPERVISORY_PERMISSIVE",
      language: "LAD_XML",
      layer: "PLC_LOGIC",
      fileName: "LAD1450_SupervisoryPermissive.lad.xml",
      declares: [P.recipeReady, P.conveyorReady, P.quenchReady, P.bmsReady, T.soakReady],
      provenance: { subsystem: "FURNACE_LINE_A", sourceId: "LAD1450", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: LAD_SUPERVISORY_XML,
    },
  ],

  scenarios: [
    {
      id: "TIA-04-FS-01",
      title: t("Zone 3 thermocouple stopped moving", "توقف تغییرات ترموکوپل ناحیهٔ ۳"),
      narrative: t(
        "Zone 3 has reported exactly the same temperature for six hours while the heat demand and the load through the furnace both varied. The controller has flagged the signal invalid.",
        "ناحیهٔ ۳ شش ساعت است دقیقاً همان دما را گزارش می‌کند، در حالی که تقاضای حرارت و بار عبوری از کوره هر دو تغییر کرده‌اند. کنترلر سیگنال را نامعتبر علامت زده است.",
      ),
      observations: [
        { nodeId: AL.tcDrift, state: "TRUE" },
        { nodeId: T.z3TempTc, state: "STALE", detail: "identical value for six hours" },
        { nodeId: T.z3TempValid, state: "FALSE" },
        { nodeId: T.z3TempDev, state: "ABNORMAL", detail: "frozen against a moving profile" },
        { nodeId: T.pyroLinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "SENSOR_FAILURE",
        faultModeId: FM.tcDrift,
        supportingNodeIds: [T.z3TempTc, T.z3TempValid, AL.tcDrift],
        expectedMissingNodeIds: [IO.z3TcAi, EV.tempTrend],
        expectedSafeActionIds: [SA.tcCompare],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-04-FS-02",
      title: t("The two zone 2 witnesses disagree", "اختلاف دو شاهد ناحیهٔ ۲"),
      narrative: t(
        "The zone 2 thermocouple reads about sixty degrees above the pyrometer looking at the same load. Neither instrument is obviously wrong, the link is healthy, and the controller has withdrawn confidence in both.",
        "ترموکوپل ناحیهٔ ۲ حدود شصت درجه بالاتر از پیرومتری را نشان می‌دهد که به همان بار نگاه می‌کند. هیچ‌یک آشکارا نادرست نیست، پیوند سالم است و کنترلر اعتماد به هر دو را سلب کرده است.",
      ),
      observations: [
        { nodeId: AL.tempDisagree, state: "TRUE" },
        { nodeId: T.tempAgrees, state: "FALSE" },
        { nodeId: T.z2TempTc, state: "ABNORMAL", detail: "about 60 C above the pyrometer" },
        { nodeId: T.z2TempPyro, state: "ABNORMAL", detail: "about 60 C below the thermocouple" },
        { nodeId: T.tempConfidenceOk, state: "FALSE" },
        { nodeId: T.almTempDisagree, state: "TRUE" },
        { nodeId: T.pyroLinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "SENSOR_FAILURE",
        faultModeId: FM.evidenceConflict,
        supportingNodeIds: [T.tempAgrees, T.z2TempTc, T.z2TempPyro, AL.tempDisagree],
        expectedMissingNodeIds: [EV.tempTrend],
        expectedSafeActionIds: [SA.evidenceReview],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-04-FS-03",
      title: t("Zone 3 above its profile limit", "فراتر رفتن ناحیهٔ ۳ از حد پروفیل"),
      narrative: t(
        "Zone 3 has climbed past the deviation limit for the selected profile, the overtemperature interlock is active, and the heat demand had been sitting high before the interlock took it away.",
        "ناحیهٔ ۳ از حد انحراف پروفیل انتخابی گذشته، اینترلاک اضافه‌دما فعال است و تقاضای حرارت پیش از آن که اینترلاک آن را قطع کند، بالا مانده بود.",
      ),
      observations: [
        { nodeId: AL.zoneOvertemp, state: "TRUE" },
        { nodeId: I.overtemp, state: "TRUE" },
        { nodeId: T.z3TempDev, state: "ABNORMAL", detail: "past the profile deviation limit" },
        { nodeId: T.z3TempTc, state: "ABNORMAL", detail: "well above the zone target" },
        { nodeId: T.heatDemand, state: "ABNORMAL", detail: "had been held high before the interlock" },
        { nodeId: T.almZoneOvertemp, state: "TRUE" },
        { nodeId: T.tempConfidenceOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.zoneOvertemp,
        supportingNodeIds: [T.z3TempDev, T.z3TempTc, I.overtemp, AL.zoneOvertemp],
        expectedMissingNodeIds: [EV.tempTrend],
        expectedSafeActionIds: [SA.overtempReview],
        requiresEscalation: true,
      },
    },
    {
      id: "TIA-04-FS-04",
      title: t("Burner management has tripped and is holding the line", "تریپ مدیریت مشعل و نگه‌داشتن خط"),
      narrative: t(
        "The burner-management system reports a combustion trip and is no longer ready. Flame is lost, the line dropped to idle and the heat demand went to zero. Nothing on this controller can clear the trip.",
        "سامانهٔ مدیریت مشعل یک تریپ احتراق گزارش می‌کند و دیگر آماده نیست. شعله از دست رفته، خط به حالت بی‌کار افتاده و تقاضای حرارت صفر شده است. هیچ‌چیز روی این کنترلر نمی‌تواند تریپ را پاک کند.",
      ),
      observations: [
        { nodeId: AL.bmsNotReady, state: "TRUE" },
        { nodeId: I.combustionTrip, state: "TRUE" },
        { nodeId: T.bmsCombustionTrip, state: "TRUE" },
        { nodeId: T.bmsReady, state: "FALSE" },
        { nodeId: T.bmsFlameOk, state: "FALSE" },
        { nodeId: T.heatDemand, state: "ABNORMAL", detail: "forced to zero by the trip" },
      ],
      groundTruth: {
        subsystem: "SAFETY_CIRCUIT",
        faultClass: "INTERLOCK_ACTIVE",
        faultModeId: FM.bmsBoundary,
        supportingNodeIds: [T.bmsCombustionTrip, T.bmsReady, I.combustionTrip, AL.bmsNotReady],
        expectedMissingNodeIds: [EV.bmsEventLog],
        expectedSafeActionIds: [SA.bmsReview],
        requiresEscalation: true,
      },
    },
    {
      id: "TIA-04-FS-05",
      title: t("Roller hearth drive tripped under load", "تریپ درایو کورهٔ غلتکی زیر بار"),
      narrative: t(
        "The roller hearth drive faulted with material inside the furnace. The hearth coasted to a stop and the line stopped with it; the drive is reporting a fault and has not been reset.",
        "درایو کورهٔ غلتکی با وجود مواد داخل کوره خطا داد. کوره از دور افتاد و خط با آن متوقف شد؛ درایو خطا گزارش می‌کند و ریست نشده است.",
      ),
      observations: [
        { nodeId: AL.rollerTrip, state: "TRUE" },
        { nodeId: T.rollerDriveFault, state: "TRUE" },
        { nodeId: T.hearthSpeedAct, state: "ABNORMAL", detail: "coasted to zero with material inside" },
        { nodeId: T.almRollerTrip, state: "TRUE" },
        { nodeId: T.lineRunning, state: "FALSE" },
        { nodeId: T.speedSyncOk, state: "FALSE" },
      ],
      groundTruth: {
        subsystem: "DRIVE",
        faultClass: "DRIVE_FAULT",
        faultModeId: FM.rollerTrip,
        supportingNodeIds: [T.rollerDriveFault, T.hearthSpeedAct, AL.rollerTrip],
        expectedMissingNodeIds: [EV.driveEventLog],
        expectedSafeActionIds: [SA.driveHistory],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-04-FS-06",
      title: t("The model holds a piece the furnace cannot find", "نگه‌داشتن قطعه‌ای در مدل که کوره آن را نمی‌یابد"),
      narrative: t(
        "The tracking model holds twelve pieces while the zone detectors report eleven, and the residence time has run well past the profile target. No discharge has been recorded for the missing piece.",
        "مدل ردیابی دوازده قطعه نگه داشته در حالی که آشکارسازهای نواحی یازده قطعه گزارش می‌کنند، و زمان ماند بسیار فراتر از هدف پروفیل رفته است. برای قطعهٔ مفقود هیچ تخلیه‌ای ثبت نشده است.",
      ),
      observations: [
        { nodeId: AL.trackMismatch, state: "TRUE" },
        { nodeId: T.piecesInFurnace, state: "ABNORMAL", detail: "model holds twelve" },
        { nodeId: T.zonePiecesDetected, state: "ABNORMAL", detail: "zones report eleven" },
        { nodeId: T.almTrackLost, state: "TRUE" },
        { nodeId: T.residenceDeviation, state: "ABNORMAL", detail: "past the profile target" },
        { nodeId: T.almResidence, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "PLC_LOGIC",
        faultClass: "SEQUENCE_TIMEOUT",
        faultModeId: FM.trackingMismatch,
        supportingNodeIds: [T.piecesInFurnace, T.zonePiecesDetected, T.almTrackLost, AL.trackMismatch],
        expectedMissingNodeIds: [EV.trackingLog],
        expectedSafeActionIds: [SA.trackingReview],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-04-FS-07",
      title: t("Discharge door reports open and closed at once", "گزارش هم‌زمان باز و بسته بودن درب تخلیه"),
      narrative: t(
        "Both discharge door limit switches are made at the same time, which no healthy door does. The door interlock is active and the sequence is holding before discharge.",
        "هر دو لیمیت‌سوییچ درب تخلیه هم‌زمان بسته‌اند، چیزی که هیچ درب سالمی انجام نمی‌دهد. اینترلاک درب فعال است و توالی پیش از تخلیه متوقف مانده است.",
      ),
      observations: [
        { nodeId: AL.doorDiscrepancy, state: "TRUE" },
        { nodeId: I.doorInterlock, state: "TRUE" },
        { nodeId: T.dischargeDoorOpenFb, state: "ABNORMAL", detail: "open limit made" },
        { nodeId: T.dischargeDoorClosedFb, state: "ABNORMAL", detail: "closed limit made at the same time" },
        { nodeId: T.almDoorDiscrepancy, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "ACTUATOR_FAILURE",
        faultModeId: FM.doorDiscrepancy,
        supportingNodeIds: [T.dischargeDoorOpenFb, T.dischargeDoorClosedFb, I.doorInterlock, AL.doorDiscrepancy],
        expectedMissingNodeIds: [IO.dischargeDoorDi, EV.driveEventLog],
        expectedSafeActionIds: [SA.doorInspect],
        requiresEscalation: true,
      },
    },
    {
      id: "TIA-04-FS-08",
      title: t("The temperature picture froze", "منجمد شدن تصویر دما"),
      narrative: t(
        "The pyrometer link went down and every temperature value stopped updating in the same second. The last readings looked ordinary, which says nothing about the furnace now — and the controller has withdrawn confidence rather than carrying the last value forward.",
        "پیوند پیرومتر قطع شد و همهٔ مقادیر دما در یک ثانیهٔ واحد از به‌روزرسانی بازماندند. آخرین قرائت‌ها عادی به نظر می‌رسیدند، که این چیزی دربارهٔ وضعیت کنونی کوره نمی‌گوید — و کنترلر به‌جای ادامه دادن آخرین مقدار، اعتماد را سلب کرده است.",
      ),
      observations: [
        { nodeId: AL.tempStale, state: "TRUE" },
        { nodeId: T.pyroLinkOk, state: "FALSE" },
        { nodeId: T.telemetryAge, state: "ABNORMAL", detail: "180 s and rising" },
        { nodeId: T.tempDataStale, state: "TRUE" },
        { nodeId: T.almTempStale, state: "TRUE" },
        { nodeId: T.tempConfidenceOk, state: "FALSE" },
        { nodeId: T.z2TempPyro, state: "STALE" },
      ],
      groundTruth: {
        subsystem: "TELEMETRY",
        faultClass: "COMMUNICATION_LOSS",
        faultModeId: FM.pyroCommsLoss,
        supportingNodeIds: [T.pyroLinkOk, T.telemetryAge, T.tempDataStale, AL.tempStale],
        expectedMissingNodeIds: [EV.cpuDiagnostics],
        expectedSafeActionIds: [SA.pyroDiagnostics],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-04-FS-09",
      title: t("Quench cannot take the next discharge", "ناتوانی کوئنچ در پذیرش تخلیهٔ بعدی"),
      narrative: t(
        "The quench flow has fallen below the minimum and the circulation pump is reporting a fault, so the pump is not available. The quench permissive is absent and the sequence is holding hot material rather than discharging it.",
        "دبی کوئنچ به زیر حداقل افت کرده و پمپ گردش خطا گزارش می‌کند، بنابراین پمپ در دسترس نیست. مجوز کوئنچ برقرار نیست و توالی به‌جای تخلیه، مادهٔ داغ را نگه داشته است.",
      ),
      observations: [
        { nodeId: AL.quenchUnavailable, state: "TRUE" },
        { nodeId: T.quenchFlowAct, state: "ABNORMAL", detail: "below the minimum" },
        { nodeId: T.quenchFlowOk, state: "FALSE" },
        { nodeId: T.quenchPumpFault, state: "TRUE" },
        { nodeId: T.quenchPumpAvailable, state: "FALSE" },
        { nodeId: T.almQuenchUnavailable, state: "TRUE" },
        { nodeId: P.quenchReady, state: "FALSE" },
      ],
      groundTruth: {
        subsystem: "MECHANICAL",
        faultClass: "PERMISSIVE_MISSING",
        faultModeId: FM.quenchUnavailable,
        supportingNodeIds: [T.quenchFlowAct, T.quenchFlowOk, T.quenchPumpAvailable, AL.quenchUnavailable],
        expectedMissingNodeIds: [T.quenchPumpReady, EV.quenchTrend],
        expectedSafeActionIds: [SA.quenchReview],
        requiresEscalation: true,
      },
    },
    {
      id: "TIA-04-FS-10",
      title: t("Loaded profile is not the revision that was selected", "ناهمخوانی پروفیل بارگذاری‌شده با نسخهٔ انتخاب‌شده"),
      narrative: t(
        "The recipe checksum computed from the loaded profile does not match the revision stored against the selected recipe. The controller has refused the profile and the line will not start automatically.",
        "checksum محاسبه‌شده از پروفیل بارگذاری‌شده با نسخهٔ ذخیره‌شده برای دستور ساخت انتخابی همخوانی ندارد. کنترلر پروفیل را نپذیرفته و خط به‌صورت خودکار راه نمی‌افتد.",
      ),
      observations: [
        { nodeId: AL.recipeMismatch, state: "TRUE" },
        { nodeId: T.recipeChecksumOk, state: "FALSE" },
        { nodeId: T.recipeChecksumAct, state: "ABNORMAL", detail: "does not match the stored revision" },
        { nodeId: T.recipeValid, state: "FALSE" },
        { nodeId: T.almRecipeInvalid, state: "TRUE" },
        { nodeId: T.recipeBoundsOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "RECIPE_CONFIG",
        faultClass: "RECIPE_MISMATCH",
        faultModeId: FM.recipeMismatch,
        supportingNodeIds: [T.recipeChecksumOk, T.recipeChecksumAct, T.recipeValid, AL.recipeMismatch],
        expectedMissingNodeIds: [EV.recipeAuditLog],
        expectedSafeActionIds: [SA.recipeReview],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-04-FS-11",
      title: t("Line ignores the start request after maintenance", "بی‌پاسخ ماندن درخواست راه‌اندازی خط پس از تعمیرات"),
      narrative: t(
        "After maintenance the line does not answer a start request from the control room. Automatic mode is selected, nothing reports a fault, and the sequence stays at its idle step.",
        "پس از تعمیرات، خط به درخواست راه‌اندازی از اتاق کنترل پاسخ نمی‌دهد. حالت خودکار انتخاب شده، هیچ‌چیز خطا گزارش نمی‌کند و توالی در گام بی‌کار خود می‌ماند.",
      ),
      observations: [
        { nodeId: AL.lineInLocal, state: "TRUE" },
        { nodeId: T.modeRemote, state: "FALSE", detail: "local selector still engaged at the line" },
        { nodeId: T.startRequest, state: "TRUE" },
        { nodeId: T.seqStep, state: "ABNORMAL", detail: "held at step 0 with a start requested" },
        { nodeId: T.modeAuto, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "HMI",
        faultClass: "INCORRECT_MODE",
        faultModeId: FM.leftInLocal,
        supportingNodeIds: [T.modeRemote, T.startRequest, T.seqStep, AL.lineInLocal],
        expectedMissingNodeIds: [EV.operatorAuditLog],
        expectedSafeActionIds: [SA.auditReview],
        requiresEscalation: false,
      },
    },
  ],
};
