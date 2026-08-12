// PHASE 101 — TIA-05: automotive body-shop robotic spot-welding cell.
//
// ORIGIN
// Original synthetic engineering reference authored for this repository. No
// customer, proprietary or licensed vendor project material.
//
// WHAT IS *NOT* CLAIMED
// The SCL is real, readable IEC 61131-3 / Siemens-dialect source and the LAD and
// FBD artefacts are real structured XML descriptions. None of them was produced,
// compiled, downloaded or validated by TIA Portal or any other vendor tool. No
// `.apXX` / `.zapXX` archive and no vendor binary exists here, and none is
// claimed. No robot program, no `.mod`/`.src` motion file and no weld-timer
// program is produced, transmitted or claimed either.
//
// THE SAFETY-CONTROLLER BOUNDARY — the point of this reference
// A body-shop cell has two controllers, and confusing them is how people are
// hurt. The CELL controller modelled here schedules the cycle, closes the
// fixture, counts spots and REQUESTS a weld enable. The SAFETY CONTROLLER owns
// personnel protection: the fence gate interlock and its guard lock, the load
// light curtain, the emergency-stop chain, the zone clearance and the robot
// motion enable itself.
//
// In this corpus that boundary is structural, not editorial:
//   - Every safety-controller object is SAFETY_CRITICAL and carries NO inbound
//     COMMANDS, WRITES or ACTUATES edge from anything.
//   - `PRM_SAFETY_GRANTED` is this controller's READ-ONLY VIEW of the motion
//     grant. It is assembled from published safety evidence and never sent.
//   - A safe stop is never reset here, no light curtain is muted, no gate lock
//     is released and no robot is enabled, described as enabled, or implied to
//     be enabled by anything in this reference.
//
// WELD QUALITY IS MEASURED, NEVER INFERRED — the second boundary
// A spot weld that nobody measured is not a good spot weld. When the weld timer
// publishes no measurement, or the parameter link goes stale, confidence is
// WITHDRAWN and the spot is reported as unverified. It is never counted as good
// because the cycle completed, and the verified counter never advances on
// evidence the cell does not actually hold.
//
// SAFETY CONTRACT
// No live PLC connection, no TIA Portal contact, no robot motion command, no
// weld energisation, no safety-controller write, no light-curtain mute, no
// guard-lock release, no emergency-stop reset and no automatic restart after a
// safe stop, a power recovery or a communications recovery.

import type { AuthoredReferenceSystem } from "../types";
import { authoring, chainStates, t } from "./_authoring";

const a = authoring({
  projectId: "TIA-05",
  subsystem: "CELL_BS31",
  domain: "CONTROL_LOGIC",
});

/* ── Identifiers ──────────────────────────────────────────────────────────── */

const D = {
  cpu: a.id("DEVICE", "CPU_1516F"),
  io: a.id("DEVICE", "ET200SP_IO"),
  panel: a.id("DEVICE", "HMI_PANEL_CELL"),
  safety: a.id("DEVICE", "SAFETY_CONTROLLER"),
  robotCtrl1: a.id("DEVICE", "ROBOT_CONTROLLER_R1"),
  robotCtrl2: a.id("DEVICE", "ROBOT_CONTROLLER_R2"),
  robotCtrl3: a.id("DEVICE", "ROBOT_CONTROLLER_R3"),
  robotCtrl4: a.id("DEVICE", "ROBOT_CONTROLLER_R4"),
  weldTimer: a.id("DEVICE", "WELD_TIMER_MFDC"),
  vfdShuttle: a.id("DEVICE", "VFD_SHUTTLE_DRIVE"),
  pnSwitch: a.id("DEVICE", "PROFINET_SWITCH"),
};

const EQ = {
  shuttle: a.id("EQUIPMENT", "SHUTTLE_CONVEYOR"),
  geoFixture: a.id("EQUIPMENT", "GEO_FIXTURE"),
  clampA: a.id("EQUIPMENT", "CLAMP_GROUP_A"),
  clampB: a.id("EQUIPMENT", "CLAMP_GROUP_B"),
  locatingPins: a.id("EQUIPMENT", "LOCATING_PINS"),
  robot1: a.id("EQUIPMENT", "ROBOT_R1"),
  robot2: a.id("EQUIPMENT", "ROBOT_R2"),
  robot3: a.id("EQUIPMENT", "ROBOT_R3"),
  robot4: a.id("EQUIPMENT", "ROBOT_R4"),
  gun1: a.id("EQUIPMENT", "WELD_GUN_R1"),
  gun2: a.id("EQUIPMENT", "WELD_GUN_R2"),
  gun3: a.id("EQUIPMENT", "WELD_GUN_R3"),
  gun4: a.id("EQUIPMENT", "WELD_GUN_R4"),
  tipDresser: a.id("EQUIPMENT", "TIP_DRESSER"),
  waterCircuit: a.id("EQUIPMENT", "WELD_WATER_CIRCUIT"),
  airSupply: a.id("EQUIPMENT", "AIR_SUPPLY"),
  fenceGate: a.id("EQUIPMENT", "SAFETY_FENCE_GATE"),
  lightCurtain: a.id("EQUIPMENT", "LOAD_LIGHT_CURTAIN"),
  estopChain: a.id("EQUIPMENT", "EMERGENCY_STOP_CHAIN"),
};

/** The declared block architecture. Every one is a real SCL unit. */
const B = {
  obMain: a.id("PLC_BLOCK", "OB_MAIN"),
  obStartup: a.id("PLC_BLOCK", "OB_STARTUP"),
  fbSafety: a.id("PLC_BLOCK", "FB_SAFETY_STATUS"),
  fbFixture: a.id("PLC_BLOCK", "FB_FIXTURE_CONTROL"),
  fbVariant: a.id("PLC_BLOCK", "FB_VARIANT_MANAGEMENT"),
  fbRobot: a.id("PLC_BLOCK", "FB_ROBOT_COORDINATION"),
  fbWeld: a.id("PLC_BLOCK", "FB_WELD_SUPERVISION"),
  fbTip: a.id("PLC_BLOCK", "FB_TIP_MANAGEMENT"),
  fbSequence: a.id("PLC_BLOCK", "FB_CELL_SEQUENCE"),
  fcUtility: a.id("PLC_BLOCK", "FC_UTILITY_VALIDATION"),
  fcQuality: a.id("PLC_BLOCK", "FC_WELD_QUALITY"),
  fcCycle: a.id("PLC_BLOCK", "FC_CYCLE_TIME"),
  fcKpi: a.id("PLC_BLOCK", "FC_KPI_CALC"),
  dbInstance: a.id("PLC_BLOCK", "DB_INSTANCE"),
  dbSchedule: a.id("PLC_BLOCK", "DB_SCHEDULE"),
  dbConfig: a.id("PLC_BLOCK", "DB_CONFIG"),
  dbRobots: a.id("PLC_BLOCK", "DB_ROBOTS"),
  dbAlarms: a.id("PLC_BLOCK", "DB_ALARMS"),
  udtRobot: a.id("PLC_BLOCK", "UDT_ROBOT"),
  udtSpot: a.id("PLC_BLOCK", "UDT_WELD_SPOT"),
  udtSchedule: a.id("PLC_BLOCK", "UDT_WELD_SCHEDULE"),
  udtClamp: a.id("PLC_BLOCK", "UDT_CLAMP"),
  udtZone: a.id("PLC_BLOCK", "UDT_SAFETY_ZONE"),
  udtSeq: a.id("PLC_BLOCK", "UDT_SEQ_STATE"),
};

const T = {
  /* Sequence and mode */
  seqStep: a.id("TAG", "SEQ_STEP"),
  cellRunning: a.id("TAG", "CELL_RUNNING"),
  startRequest: a.id("TAG", "START_REQUEST"),
  modeAuto: a.id("TAG", "MODE_AUTO"),
  modeRemote: a.id("TAG", "MODE_REMOTE"),
  teachActive: a.id("TAG", "TEACH_MODE_ACTIVE"),
  alarmWord: a.id("TAG", "ALARM_WORD"),
  cycleComplete: a.id("TAG", "CYCLE_COMPLETE"),
  restartReview: a.id("TAG", "RESTART_REVIEW_REQUIRED"),
  /* Safety boundary — read-only evidence */
  zoneClear: a.id("TAG", "SAFETY_ZONE_CLEAR"),
  gateClosed: a.id("TAG", "FENCE_GATE_CLOSED"),
  gateLocked: a.id("TAG", "FENCE_GATE_LOCKED"),
  curtainIntact: a.id("TAG", "LIGHT_CURTAIN_INTACT"),
  estopHealthy: a.id("TAG", "ESTOP_CHAIN_HEALTHY"),
  safeStopActive: a.id("TAG", "SAFE_STOP_ACTIVE"),
  motionEnable: a.id("TAG", "ROBOT_MOTION_ENABLE"),
  safetyAckRequired: a.id("TAG", "SAFETY_ACK_REQUIRED"),
  /* Robots */
  r1Ready: a.id("TAG", "R1_READY"),
  r2Ready: a.id("TAG", "R2_READY"),
  r3Ready: a.id("TAG", "R3_READY"),
  r4Ready: a.id("TAG", "R4_READY"),
  robotsReadyAll: a.id("TAG", "ROBOTS_READY_ALL"),
  robotsAtHome: a.id("TAG", "ROBOTS_AT_HOME"),
  robotCycleDone: a.id("TAG", "ROBOT_CYCLE_DONE"),
  r3LinkOk: a.id("TAG", "R3_LINK_OK"),
  r3TelemetryAge: a.id("TAG", "R3_TELEMETRY_AGE"),
  r3DataStale: a.id("TAG", "R3_DATA_STALE"),
  /* Weld — a request, never an energisation */
  weldEnable: a.id("TAG", "WELD_ENABLE"),
  weldTimerReady: a.id("TAG", "WELD_TIMER_READY"),
  weldTimerFault: a.id("TAG", "WELD_TIMER_FAULT"),
  weldCurrentAct: a.id("TAG", "WELD_CURRENT_ACT"),
  weldForceAct: a.id("TAG", "WELD_FORCE_ACT"),
  weldTimeAct: a.id("TAG", "WELD_TIME_ACT"),
  weldEnergyTotal: a.id("TAG", "WELD_ENERGY_TOTAL"),
  weldCurrentOk: a.id("TAG", "WELD_CURRENT_OK"),
  weldForceOk: a.id("TAG", "WELD_FORCE_OK"),
  weldMeasured: a.id("TAG", "WELD_MEASURED"),
  weldConfidenceOk: a.id("TAG", "WELD_QUALITY_CONFIDENCE_OK"),
  weldLogLinkOk: a.id("TAG", "WELD_LOG_LINK_OK"),
  weldTelemetryAge: a.id("TAG", "WELD_TELEMETRY_AGE"),
  weldDataStale: a.id("TAG", "WELD_DATA_STALE"),
  spotCountCycle: a.id("TAG", "SPOT_COUNT_CYCLE"),
  spotTargetCount: a.id("TAG", "SPOT_TARGET_COUNT"),
  spotsVerified: a.id("TAG", "SPOTS_VERIFIED"),
  /* Servo gun and electrode tips */
  gunDriveFault: a.id("TAG", "GUN_R2_DRIVE_FAULT"),
  gunDriveFaultPrev: a.id("TAG", "GUN_R2_DRIVE_FAULT_PREV"),
  gunForceRef: a.id("TAG", "GUN_R2_FORCE_REF"),
  gunPositionAct: a.id("TAG", "GUN_R2_POSITION_ACT"),
  tipWearCount: a.id("TAG", "TIP_WEAR_COUNT"),
  tipWearLimit: a.id("TAG", "TIP_WEAR_LIMIT_REACHED"),
  tipDressRequest: a.id("TAG", "TIP_DRESS_REQUEST"),
  tipDressDone: a.id("TAG", "TIP_DRESS_DONE"),
  dresserMotorFault: a.id("TAG", "DRESSER_MOTOR_FAULT"),
  dresserBladeJam: a.id("TAG", "DRESSER_BLADE_JAM"),
  /* Fixture */
  clampCloseCmd: a.id("TAG", "CLAMP_CLOSE_CMD"),
  clampAClosedFb: a.id("TAG", "CLAMP_A_CLOSED_FB"),
  clampAOpenFb: a.id("TAG", "CLAMP_A_OPEN_FB"),
  clampBClosedFb: a.id("TAG", "CLAMP_B_CLOSED_FB"),
  clampBOpenFb: a.id("TAG", "CLAMP_B_OPEN_FB"),
  clampsClosedAll: a.id("TAG", "CLAMPS_CLOSED_ALL"),
  partPresent1: a.id("TAG", "PART_PRESENT_1"),
  partPresent2: a.id("TAG", "PART_PRESENT_2"),
  geoPinEngaged: a.id("TAG", "GEO_PIN_ENGAGED"),
  partSeatedOk: a.id("TAG", "PART_SEATED_OK"),
  /* Utilities */
  waterFlowAct: a.id("TAG", "WELD_WATER_FLOW_ACT"),
  waterFlowOk: a.id("TAG", "WELD_WATER_FLOW_OK"),
  waterTemp: a.id("TAG", "WELD_WATER_TEMP"),
  airPressureAct: a.id("TAG", "AIR_PRESSURE_ACT"),
  airPressureOk: a.id("TAG", "AIR_PRESSURE_OK"),
  /* Transport */
  shuttleInPosition: a.id("TAG", "SHUTTLE_IN_POSITION"),
  shuttleSpeedAct: a.id("TAG", "SHUTTLE_SPEED_ACT"),
  shuttleDriveFault: a.id("TAG", "SHUTTLE_DRIVE_FAULT"),
  /* Body variant and weld schedule */
  variantSelected: a.id("TAG", "VARIANT_SELECTED"),
  variantIdAct: a.id("TAG", "VARIANT_ID_ACT"),
  scheduleIdLoaded: a.id("TAG", "SCHEDULE_ID_LOADED"),
  scheduleMatches: a.id("TAG", "SCHEDULE_MATCHES_VARIANT"),
  scheduleChecksumAct: a.id("TAG", "SCHEDULE_CHECKSUM_ACT"),
  scheduleChecksumOk: a.id("TAG", "SCHEDULE_CHECKSUM_OK"),
  scheduleValid: a.id("TAG", "SCHEDULE_VALID"),
  scheduleLocked: a.id("TAG", "SCHEDULE_LOCKED"),
  scheduleChangeRequest: a.id("TAG", "SCHEDULE_CHANGE_REQUEST"),
  scheduleChangeReview: a.id("TAG", "SCHEDULE_CHANGE_REVIEW"),
  /* Counters */
  cycleTime: a.id("TAG", "CYCLE_TIME_S"),
  cycleTimeDeviation: a.id("TAG", "CYCLE_TIME_DEVIATION_S"),
  prodCountBodies: a.id("TAG", "PROD_COUNT_BODIES"),
  bodiesFaultFree: a.id("TAG", "BODIES_FAULT_FREE"),
  spotQualityPct: a.id("TAG", "SPOT_QUALITY_PCT"),
  firstTimeThroughPct: a.id("TAG", "FIRST_TIME_THROUGH_PCT"),
  specificWeldEnergy: a.id("TAG", "SPECIFIC_WELD_ENERGY"),
  /* Alarm bits */
  almSafetyStop: a.id("TAG", "ALM_SAFETY_STOP"),
  almZoneNotClear: a.id("TAG", "ALM_ZONE_NOT_CLEAR"),
  almClampTimeout: a.id("TAG", "ALM_CLAMP_TIMEOUT"),
  almClampDiscrepancy: a.id("TAG", "ALM_CLAMP_DISCREPANCY"),
  almPartNotSeated: a.id("TAG", "ALM_PART_NOT_SEATED"),
  almWeldCurrentLow: a.id("TAG", "ALM_WELD_CURRENT_LOW"),
  almWeldUnverified: a.id("TAG", "ALM_WELD_UNVERIFIED"),
  almTelemetryStale: a.id("TAG", "ALM_TELEMETRY_STALE"),
  almTipWearLimit: a.id("TAG", "ALM_TIP_WEAR_LIMIT"),
  almDresserJam: a.id("TAG", "ALM_DRESSER_JAM"),
  almGunDriveTrip: a.id("TAG", "ALM_GUN_DRIVE_TRIP"),
  almRobotCommsLoss: a.id("TAG", "ALM_ROBOT_COMMS_LOSS"),
  almRobotCycleTimeout: a.id("TAG", "ALM_ROBOT_CYCLE_TIMEOUT"),
  almCycleDeviation: a.id("TAG", "ALM_CYCLE_DEVIATION"),
  almWaterFlowLow: a.id("TAG", "ALM_WATER_FLOW_LOW"),
  almAirPressureLow: a.id("TAG", "ALM_AIR_PRESSURE_LOW"),
  almScheduleMismatch: a.id("TAG", "ALM_SCHEDULE_MISMATCH"),
  almScheduleChangeBlocked: a.id("TAG", "ALM_SCHEDULE_CHANGE_BLOCKED"),
  almCellInTeach: a.id("TAG", "ALM_CELL_IN_TEACH"),
  almShuttleDriveTrip: a.id("TAG", "ALM_SHUTTLE_DRIVE_TRIP"),
};

const IO = {
  gateProfisafe: a.id("IO_POINT", "FS_FENCE_GATE_CLOSED"),
  curtainProfisafe: a.id("IO_POINT", "FS_LIGHT_CURTAIN"),
  estopProfisafe: a.id("IO_POINT", "FS_ESTOP_CHAIN"),
  partPresentDi: a.id("IO_POINT", "DI_PART_PRESENT_1"),
  clampAClosedDi: a.id("IO_POINT", "DI_CLAMP_A_CLOSED"),
  clampBClosedDi: a.id("IO_POINT", "DI_CLAMP_B_CLOSED"),
  waterFlowAi: a.id("IO_POINT", "AI_WELD_WATER_FLOW"),
  airPressureAi: a.id("IO_POINT", "AI_AIR_PRESSURE"),
  weldCurrentAi: a.id("IO_POINT", "AI_WELD_CURRENT"),
  gunFaultDi: a.id("IO_POINT", "DI_GUN_R2_DRIVE_FAULT"),
  dresserJamDi: a.id("IO_POINT", "DI_DRESSER_BLADE_JAM"),
  r3LinkPn: a.id("IO_POINT", "PN_R3_LINK"),
};

const SQ = a.id("SEQUENCE", "CELL_CYCLE_SEQUENCE");
const S = {
  idle: a.id("STATE", "C00_IDLE"),
  infeed: a.id("STATE", "C10_BODY_INFEED"),
  clampClose: a.id("STATE", "C20_CLAMP_CLOSE"),
  weld: a.id("STATE", "C30_WELD_EXECUTION"),
  verify: a.id("STATE", "C40_WELD_VERIFY"),
  clampOpen: a.id("STATE", "C50_CLAMP_OPEN"),
  outfeed: a.id("STATE", "C60_BODY_OUTFEED"),
};

const TQ = a.id("SEQUENCE", "TIP_DRESS_SEQUENCE");
const TS = {
  ready: a.id("STATE", "TD00_READY"),
  dress: a.id("STATE", "TD10_DRESS"),
  measure: a.id("STATE", "TD20_MEASURE"),
  complete: a.id("STATE", "TD30_COMPLETE"),
};

const AQ = a.id("SEQUENCE", "ALARM_LIFECYCLE");
const AS = {
  normal: a.id("STATE", "AL00_NORMAL"),
  unack: a.id("STATE", "AL10_UNACK_ALARM"),
  acked: a.id("STATE", "AL20_ACK_ALARM"),
  rtnUnack: a.id("STATE", "AL30_RTN_UNACK"),
};

const P = {
  safetyGranted: a.id("PERMISSIVE", "PRM_SAFETY_GRANTED"),
  fixtureReady: a.id("PERMISSIVE", "PRM_FIXTURE_READY"),
  utilityReady: a.id("PERMISSIVE", "PRM_UTILITY_READY"),
  scheduleReady: a.id("PERMISSIVE", "PRM_SCHEDULE_READY"),
  robotsReady: a.id("PERMISSIVE", "PRM_ROBOTS_READY"),
};

const I = {
  safetyStop: a.id("INTERLOCK", "ILK_SAFETY_STOP"),
  zoneNotClear: a.id("INTERLOCK", "ILK_ZONE_NOT_CLEAR"),
  clampNotClosed: a.id("INTERLOCK", "ILK_CLAMP_NOT_CLOSED"),
  utilityNotReady: a.id("INTERLOCK", "ILK_UTILITY_NOT_READY"),
  gunDriveTrip: a.id("INTERLOCK", "ILK_GUN_DRIVE_TRIP"),
};

const AL = {
  safetyStop: a.id("ALARM", "ALM_SAFETY_STOP_ACTIVE"),
  zoneNotClear: a.id("ALARM", "ALM_SAFETY_ZONE_NOT_CLEAR"),
  clampTimeout: a.id("ALARM", "ALM_CLAMP_CLOSE_TIMEOUT"),
  clampDiscrepancy: a.id("ALARM", "ALM_CLAMP_POSITION_DISCREPANCY"),
  partNotSeated: a.id("ALARM", "ALM_PART_NOT_SEATED_CORRECTLY"),
  weldCurrentLow: a.id("ALARM", "ALM_WELD_CURRENT_BELOW_LIMIT"),
  weldUnverified: a.id("ALARM", "ALM_WELD_QUALITY_UNVERIFIED"),
  weldTelemetryStale: a.id("ALARM", "ALM_WELD_TELEMETRY_STALE"),
  electrodeWear: a.id("ALARM", "ALM_ELECTRODE_WEAR_LIMIT"),
  dresserJammed: a.id("ALARM", "ALM_TIP_DRESSER_JAMMED"),
  gunDriveTripped: a.id("ALARM", "ALM_SERVO_GUN_DRIVE_TRIPPED"),
  robotTelemetryLost: a.id("ALARM", "ALM_ROBOT_TELEMETRY_LOST"),
  robotCycleNotCompleted: a.id("ALARM", "ALM_ROBOT_CYCLE_NOT_COMPLETED"),
  waterFlowLow: a.id("ALARM", "ALM_WELD_WATER_FLOW_LOW"),
  airPressureLow: a.id("ALARM", "ALM_AIR_SUPPLY_PRESSURE_LOW"),
  scheduleMismatch: a.id("ALARM", "ALM_WELD_SCHEDULE_MISMATCH"),
  cellInTeach: a.id("ALARM", "ALM_CELL_LEFT_IN_TEACH"),
  shuttleTripped: a.id("ALARM", "ALM_SHUTTLE_DRIVE_TRIPPED"),
};

const K = {
  bodies: a.id("KPI", "KPI_BODIES_PRODUCED"),
  spotQuality: a.id("KPI", "KPI_SPOT_QUALITY"),
  firstTimeThrough: a.id("KPI", "KPI_FIRST_TIME_THROUGH"),
  cycleTime: a.id("KPI", "KPI_CYCLE_TIME"),
  weldEnergy: a.id("KPI", "KPI_SPECIFIC_WELD_ENERGY"),
};

const EV = {
  weldLog: a.id("EVIDENCE_SOURCE", "HIST_WELD_PARAMETER_LOG"),
  safetyLog: a.id("EVIDENCE_SOURCE", "HIST_SAFETY_EVENT_LOG"),
  robotLog: a.id("EVIDENCE_SOURCE", "HIST_ROBOT_EVENT_LOG"),
  driveLog: a.id("EVIDENCE_SOURCE", "HIST_DRIVE_EVENT_LOG"),
  electrodeLog: a.id("EVIDENCE_SOURCE", "HIST_ELECTRODE_LIFE_LOG"),
  cpuDiagnostics: a.id("EVIDENCE_SOURCE", "HIST_CPU_DIAGNOSTIC_BUFFER"),
  scheduleAuditLog: a.id("EVIDENCE_SOURCE", "HIST_SCHEDULE_AUDIT_LOG"),
  operatorAuditLog: a.id("EVIDENCE_SOURCE", "HIST_OPERATOR_AUDIT_LOG"),
  utilityTrend: a.id("EVIDENCE_SOURCE", "HIST_UTILITY_TREND"),
};

const FM = {
  partSensor: a.id("FAULT_MODE", "FM_PART_PRESENT_SENSOR_FAILURE"),
  safetyGate: a.id("FAULT_MODE", "FM_SAFETY_GATE_INTERLOCK_OPEN"),
  utilityLost: a.id("FAULT_MODE", "FM_WELD_UTILITY_SUPPLY_LOST"),
  gunDriveTrip: a.id("FAULT_MODE", "FM_SERVO_GUN_DRIVE_TRIP"),
  robotComms: a.id("FAULT_MODE", "FM_ROBOT_PROFINET_LOSS"),
  robotCycleTimeout: a.id("FAULT_MODE", "FM_ROBOT_CYCLE_TIMEOUT"),
  electrodeWear: a.id("FAULT_MODE", "FM_ELECTRODE_WEAR_CURRENT_DECAY"),
  scheduleMismatch: a.id("FAULT_MODE", "FM_WELD_SCHEDULE_VARIANT_MISMATCH"),
  clampValve: a.id("FAULT_MODE", "FM_CLAMP_VALVE_FAILURE"),
  dresserJam: a.id("FAULT_MODE", "FM_TIP_DRESSER_JAM"),
  leftInTeach: a.id("FAULT_MODE", "FM_CELL_LEFT_IN_TEACH"),
  shuttleDriveTrip: a.id("FAULT_MODE", "FM_SHUTTLE_DRIVE_TRIP"),
  weldTelemetryStale: a.id("FAULT_MODE", "FM_WELD_TELEMETRY_STALE"),
};

const SA = {
  partSensor: a.id("SAFE_ACTION", "SA_VERIFY_PART_PRESENT_SENSOR_AGAINST_FIXTURE"),
  safetyReview: a.id("SAFE_ACTION", "SA_ESCALATE_SAFETY_INTERLOCK_REVIEW"),
  utilityReview: a.id("SAFE_ACTION", "SA_ESCALATE_WELD_UTILITY_REVIEW"),
  gunDriveHistory: a.id("SAFE_ACTION", "SA_READ_SERVO_GUN_DRIVE_FAULT_HISTORY"),
  robotLinkCheck: a.id("SAFE_ACTION", "SA_VERIFY_ROBOT_LINK_AND_CPU_DIAGNOSTICS"),
  robotCycleReview: a.id("SAFE_ACTION", "SA_RECONCILE_ROBOT_CYCLE_AGAINST_SEQUENCE"),
  electrodeReview: a.id("SAFE_ACTION", "SA_MEASURE_ELECTRODE_AND_REVIEW_WELD_TREND"),
  scheduleReview: a.id("SAFE_ACTION", "SA_REVIEW_WELD_SCHEDULE_AGAINST_BODY_VARIANT"),
  clampInspect: a.id("SAFE_ACTION", "SA_INSPECT_CLAMP_VALVE_AND_LIMIT_SWITCHES"),
  dresserInspect: a.id("SAFE_ACTION", "SA_INSPECT_TIP_DRESSER_FOR_OBSTRUCTION"),
  auditReview: a.id("SAFE_ACTION", "SA_REVIEW_OPERATOR_AUDIT_LOG_FOR_MODE_CHANGE"),
  shuttleDriveHistory: a.id("SAFE_ACTION", "SA_READ_SHUTTLE_DRIVE_FAULT_HISTORY"),
  weldLogPath: a.id("SAFE_ACTION", "SA_VERIFY_WELD_PARAMETER_LOGGING_PATH"),
};

/* ── Operator surface and governance ─────────────────────────────────────── */

const ST = {
  cellState: a.id("SCADA_TAG", "HMI_Cell_State"),
  spotCount: a.id("SCADA_TAG", "HMI_Spot_Count"),
  weldCurrent: a.id("SCADA_TAG", "HMI_Weld_Current"),
  safetyGranted: a.id("SCADA_TAG", "HMI_Safety_Granted"),
  cellRunning: a.id("SCADA_TAG", "HMI_Cell_Running"),
  startIntent: a.id("SCADA_TAG", "HMI_Cycle_Start_Intent"),
  scheduleSelectIntent: a.id("SCADA_TAG", "HMI_Schedule_Select_Intent"),
  tipDressIntent: a.id("SCADA_TAG", "HMI_Tip_Dress_Intent"),
  ackCmd: a.id("SCADA_TAG", "HMI_Alarm_Ack_Cmd"),
  kpiPublished: a.id("SCADA_TAG", "HMI_Kpi_Published"),
};

const H = {
  overview: a.id("HMI_SCREEN", "Screen_CellOverview"),
  quality: a.id("HMI_SCREEN", "Screen_WeldQuality"),
  schedule: a.id("HMI_SCREEN", "Screen_Schedule"),
  alarms: a.id("HMI_SCREEN", "Screen_Alarms"),
};

const HO = {
  weldTrend: a.id("HMI_OBJECT", "Trend_WeldCurrent"),
  safetyStatus: a.id("HMI_OBJECT", "Ind_SafetyStatus"),
  spotCount: a.id("HMI_OBJECT", "Ind_SpotCount"),
  startButton: a.id("HMI_OBJECT", "Btn_CycleStart"),
  scheduleSelect: a.id("HMI_OBJECT", "Btn_ScheduleSelect"),
  tipDress: a.id("HMI_OBJECT", "Btn_TipDress"),
  alarmBanner: a.id("HMI_OBJECT", "Banner_ActiveAlarms"),
};

const SC = {
  startIntent: a.id("SCRIPT", "OnCycleStartIntent"),
  scheduleIntent: a.id("SCRIPT", "OnScheduleSelectIntent"),
  tipDressIntent: a.id("SCRIPT", "OnTipDressIntent"),
  alarmAck: a.id("SCRIPT", "OnAlarmAcknowledge"),
  kpiPublish: a.id("SCRIPT", "OnKpiPublish"),
};

const R = {
  operator: a.id("ROLE", "Role_CellOperator"),
  weldEngineer: a.id("ROLE", "Role_WeldEngineer"),
  technician: a.id("ROLE", "Role_MaintenanceTechnician"),
};

const AE = {
  startIntent: a.id("AUDIT_EVENT_TYPE", "Audit_CycleStartIntentRecorded"),
  scheduleIntent: a.id("AUDIT_EVENT_TYPE", "Audit_ScheduleSelectIntentRecorded"),
  tipDressIntent: a.id("AUDIT_EVENT_TYPE", "Audit_TipDressIntentRecorded"),
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
// The cell comes back idle, unclamped, with the weld enable withdrawn.
//
// WHAT IS DELIBERATELY *NOT* DONE
// No safe stop is reset, no guard lock is released, no light curtain is muted
// and no robot is enabled. The body picture is treated as AMBIGUOUS until a
// human reconciles it: RESTART_REVIEW_REQUIRED is raised here and only an
// explicit review clears it, because a cell that silently forgot a part-welded
// body would release it as if every spot had been made.
BEGIN
   "SEQ_STEP" := 0;
   "CELL_RUNNING" := FALSE;
   "WELD_ENABLE" := FALSE;
   "CLAMP_CLOSE_CMD" := FALSE;
   "SCHEDULE_LOCKED" := FALSE;
   "SPOT_COUNT_CYCLE" := 0;
   "SPOTS_VERIFIED" := 0;
   "RESTART_REVIEW_REQUIRED" := TRUE;
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
   // The safety view is assembled first: nothing downstream may reason about a
   // motion grant this scan has not yet read. Utilities and the weld schedule
   // settle next, because both bound every weld request that follows them.
   "FB_SAFETY_STATUS"();
   "FC_UTILITY_VALIDATION"();
   "FB_VARIANT_MANAGEMENT"();
   "FB_FIXTURE_CONTROL"();
   "FB_ROBOT_COORDINATION"();
   "FB_WELD_SUPERVISION"();
   "FB_TIP_MANAGEMENT"();
   "FB_CELL_SEQUENCE"();
   "FC_KPI_CALC"();
END_ORGANIZATION_BLOCK
`;

const FB_SAFETY_STATUS_SCL = `FUNCTION_BLOCK "FB_SAFETY_STATUS"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// The cell's READ-ONLY VIEW of the safety controller.
BEGIN
   // EVERY TERM BELOW IS PUBLISHED BY THE SAFETY CONTROLLER. This block writes
   // none of them. PRM_SAFETY_GRANTED is an observation of the motion grant,
   // never an instruction to issue one: the grant itself is ROBOT_MOTION_ENABLE,
   // and it is an input.
   "PRM_SAFETY_GRANTED" := "SAFETY_ZONE_CLEAR"
      AND "FENCE_GATE_CLOSED"
      AND "FENCE_GATE_LOCKED"
      AND "LIGHT_CURTAIN_INTACT"
      AND "ESTOP_CHAIN_HEALTHY"
      AND "ROBOT_MOTION_ENABLE"
      AND NOT "SAFE_STOP_ACTIVE";

   // A safe stop withdraws the weld request and stops the cycle. It is NEVER
   // reset here — the safety controller owns that, and clearing it is a human
   // act on that system after the zone has been checked.
   IF "SAFE_STOP_ACTIVE" THEN
      "ALM_SAFETY_STOP" := TRUE;
      "CELL_RUNNING" := FALSE;
      "WELD_ENABLE" := FALSE;
   END_IF;

   IF NOT "SAFETY_ZONE_CLEAR" OR NOT "FENCE_GATE_CLOSED" OR NOT "LIGHT_CURTAIN_INTACT" THEN
      "ALM_ZONE_NOT_CLEAR" := TRUE;
   END_IF;

   // An acknowledgement the safety controller demands is REPORTED, not given.
   IF "SAFETY_ACK_REQUIRED" THEN
      "RESTART_REVIEW_REQUIRED" := TRUE;
   END_IF;
END_FUNCTION_BLOCK
`;

const FB_FIXTURE_CONTROL_SCL = `FUNCTION_BLOCK "FB_FIXTURE_CONTROL"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Geometry fixture: part seating, clamp groups and the clamp watchdog.
VAR
   clampTimer : TON;
END_VAR
VAR_CONSTANT
   CLAMP_TIME_MAX : Time := T#15s;
END_VAR

BEGIN
   // A body is seated only when BOTH presence sensors and the geometry pin
   // agree. One sensor alone cannot establish seating, because a single stuck
   // sensor would then be enough to weld an unlocated body.
   "PART_SEATED_OK" := "PART_PRESENT_1" AND "PART_PRESENT_2" AND "GEO_PIN_ENGAGED";

   IF NOT "PART_SEATED_OK" THEN
      "ALM_PART_NOT_SEATED" := TRUE;
   END_IF;

   // Closed means BOTH closed limits made and NEITHER open limit made. A clamp
   // that reports both is a discrepancy, handled by the sequence block.
   "CLAMPS_CLOSED_ALL" := "CLAMP_A_CLOSED_FB" AND "CLAMP_B_CLOSED_FB"
      AND NOT "CLAMP_A_OPEN_FB" AND NOT "CLAMP_B_OPEN_FB";

   #clampTimer(IN := "CLAMP_CLOSE_CMD" AND NOT "CLAMPS_CLOSED_ALL", PT := CLAMP_TIME_MAX);
   IF #clampTimer.Q THEN
      "ALM_CLAMP_TIMEOUT" := TRUE;
   END_IF;

   "PRM_FIXTURE_READY" := "PART_SEATED_OK" AND "CLAMPS_CLOSED_ALL" AND "SHUTTLE_IN_POSITION";
END_FUNCTION_BLOCK
`;

const FB_VARIANT_MANAGEMENT_SCL = `FUNCTION_BLOCK "FB_VARIANT_MANAGEMENT"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Body variant, weld schedule validation, bounds and immutability.
VAR_CONSTANT
   SPOT_TARGET_MIN : Int := 20;
   SPOT_TARGET_MAX : Int := 260;
   FORCE_MIN       : Real := 1.5;
   FORCE_MAX       : Real := 6.0;
END_VAR

BEGIN
   // The schedule the weld timer holds must be the schedule this body asks for.
   // Matching is an EQUALITY on identity, not a similarity: a schedule that
   // merely looks close enough would put the wrong current into the wrong steel.
   "SCHEDULE_MATCHES_VARIANT" := "SCHEDULE_ID_LOADED" = "VARIANT_ID_ACT";
   "SCHEDULE_CHECKSUM_OK" := "SCHEDULE_CHECKSUM_ACT" = "DB_SCHEDULE".RevisionChecksum;

   // Every schedule parameter is bounded. There is NO default schedule: a
   // missing or invalid one prevents an automatic start rather than substituting
   // something plausible and letting the cell decide what plausible meant.
   "SCHEDULE_VALID" := "VARIANT_SELECTED"
      AND "SCHEDULE_MATCHES_VARIANT"
      AND "SCHEDULE_CHECKSUM_OK"
      AND "DB_SCHEDULE".SpotTarget >= SPOT_TARGET_MIN
      AND "DB_SCHEDULE".SpotTarget <= SPOT_TARGET_MAX
      AND "DB_SCHEDULE".ElectrodeForce >= FORCE_MIN
      AND "DB_SCHEDULE".ElectrodeForce <= FORCE_MAX;

   "SPOT_TARGET_COUNT" := "DB_SCHEDULE".SpotTarget;

   IF NOT "SCHEDULE_VALID" THEN
      "ALM_SCHEDULE_MISMATCH" := TRUE;
   END_IF;

   // IMMUTABILITY. Once a spot has been made on this body under this schedule,
   // that schedule is locked. A change request is held and referred for review;
   // it is never applied to a body whose first spots were made under another.
   IF "CELL_RUNNING" AND "SPOT_COUNT_CYCLE" > 0 THEN
      "SCHEDULE_LOCKED" := TRUE;
   END_IF;

   IF "SCHEDULE_CHANGE_REQUEST" AND "SCHEDULE_LOCKED" THEN
      "ALM_SCHEDULE_CHANGE_BLOCKED" := TRUE;
      "SCHEDULE_CHANGE_REVIEW" := TRUE;
   END_IF;

   "PRM_SCHEDULE_READY" := "SCHEDULE_VALID";
END_FUNCTION_BLOCK
`;

const FB_ROBOT_COORDINATION_SCL = `FUNCTION_BLOCK "FB_ROBOT_COORDINATION"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Robot group readiness and the weld-execution watchdog.
VAR
   cycleTimer : TON;
END_VAR
VAR_CONSTANT
   ROBOT_CYCLE_MAX : Time := T#90s;
   STALE_LIMIT_S   : Int := 5;
END_VAR

BEGIN
   "ROBOTS_READY_ALL" := "R1_READY" AND "R2_READY" AND "R3_READY" AND "R4_READY";

   // A ROBOT WHOSE TELEMETRY HAS STOPPED ARRIVING IS NOT A READY ROBOT.
   // The last frame said ready; that says nothing about the arm now, so
   // readiness is withdrawn rather than carried forward.
   IF NOT "R3_LINK_OK" OR "R3_TELEMETRY_AGE" > STALE_LIMIT_S THEN
      "R3_DATA_STALE" := TRUE;
      "ROBOTS_READY_ALL" := FALSE;
      "ALM_ROBOT_COMMS_LOSS" := TRUE;
   END_IF;

   // The watchdog measures the robot cycle, not the operator's patience. It
   // reports; it never re-issues a motion request and never re-triggers a robot.
   #cycleTimer(IN := "CELL_RUNNING" AND NOT "ROBOT_CYCLE_DONE", PT := ROBOT_CYCLE_MAX);
   IF #cycleTimer.Q THEN
      "ALM_ROBOT_CYCLE_TIMEOUT" := TRUE;
   END_IF;

   // Readiness of the group is gated by the SAFETY VIEW as well as by the
   // robots themselves: a ready arm inside an unguarded zone is not available.
   "PRM_ROBOTS_READY" := "ROBOTS_READY_ALL" AND "ROBOTS_AT_HOME" AND "PRM_SAFETY_GRANTED";
END_FUNCTION_BLOCK
`;

const FB_WELD_SUPERVISION_SCL = `FUNCTION_BLOCK "FB_WELD_SUPERVISION"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// The weld request and the servo-gun trip path.
BEGIN
   "FC_WELD_QUALITY"();

   // WELD ENABLE IS A REQUEST, NOT AN ENERGISATION.
   // It is a permission handed to the weld timer, which retains authority over
   // current, squeeze, hold and its own thermal protection. Nothing in this
   // block closes a contactor, fires a thyristor or discharges anything.
   IF "PRM_SAFETY_GRANTED"
      AND "PRM_FIXTURE_READY"
      AND "PRM_UTILITY_READY"
      AND "PRM_SCHEDULE_READY"
      AND "WELD_TIMER_READY"
      AND NOT "WELD_TIMER_FAULT"
   THEN
      "WELD_ENABLE" := TRUE;
   ELSE
      // Losing any single condition withdraws the request completely. There is
      // no reduced-current fallback, because a weld made under conditions the
      // cell could not confirm is still a weld nobody can vouch for.
      "WELD_ENABLE" := FALSE;
   END_IF;

   // Rising edge on the servo gun drive fault. The cell stops; it does not retry.
   IF "GUN_R2_DRIVE_FAULT" AND NOT "GUN_R2_DRIVE_FAULT_PREV" THEN
      "ALM_GUN_DRIVE_TRIP" := TRUE;
      "CELL_RUNNING" := FALSE;
      "WELD_ENABLE" := FALSE;
   END_IF;
   "GUN_R2_DRIVE_FAULT_PREV" := "GUN_R2_DRIVE_FAULT";

   // The electrode force reference is BOUNDED BY THE SCHEDULE and by nothing
   // else, and it collapses to zero the moment the request is withdrawn.
   "GUN_R2_FORCE_REF" := "DB_SCHEDULE".ElectrodeForce;

   IF NOT "SCHEDULE_VALID" OR NOT "WELD_ENABLE" THEN
      "GUN_R2_FORCE_REF" := 0.0;
   END_IF;
END_FUNCTION_BLOCK
`;

const FB_TIP_MANAGEMENT_SCL = `FUNCTION_BLOCK "FB_TIP_MANAGEMENT"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Electrode life and the tip-dressing request.
VAR_CONSTANT
   TIP_LIFE_SPOTS : Int := 3000;
END_VAR

BEGIN
   "TIP_WEAR_COUNT" := "TIP_WEAR_COUNT" + "SPOT_COUNT_CYCLE";
   "TIP_WEAR_LIMIT_REACHED" := "TIP_WEAR_COUNT" >= TIP_LIFE_SPOTS;

   IF "TIP_WEAR_LIMIT_REACHED" THEN
      "ALM_TIP_WEAR_LIMIT" := TRUE;
      "TIP_DRESS_REQUEST" := TRUE;
   END_IF;

   // A dresser that is jammed or faulted has NOT dressed anything. The done
   // flag is cleared rather than left standing from the previous cycle.
   IF "DRESSER_BLADE_JAM" OR "DRESSER_MOTOR_FAULT" THEN
      "ALM_DRESSER_JAM" := TRUE;
      "TIP_DRESS_DONE" := FALSE;
   END_IF;

   // The wear counter is cleared by a COMPLETED dress and by nothing else —
   // not by a request, not by a restart, and not to make a limit go away.
   IF "TIP_DRESS_DONE" THEN
      "TIP_WEAR_COUNT" := 0;
      "TIP_DRESS_REQUEST" := FALSE;
   END_IF;
END_FUNCTION_BLOCK
`;

const FB_CELL_SEQUENCE_SCL = `FUNCTION_BLOCK "FB_CELL_SEQUENCE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// The cell state machine and the trip path.
BEGIN
   // TRIP PATH. A safe stop, or the loss of the robot motion grant, drops the
   // cell to idle, withdraws the weld request and releases the clamp command.
   // The stop is NEVER reset here — the safety controller owns that — and the
   // cell does not come back on its own when the condition clears.
   IF "SAFE_STOP_ACTIVE" OR NOT "ROBOT_MOTION_ENABLE" THEN
      "SEQ_STEP" := 0;
      "CELL_RUNNING" := FALSE;
      "WELD_ENABLE" := FALSE;
      "CLAMP_CLOSE_CMD" := FALSE;
   END_IF;

   // Both clamp limits made at once describes a clamp that is open and closed
   // simultaneously. It is a discrepancy, never resolved by preference.
   IF "CLAMP_B_OPEN_FB" AND "CLAMP_B_CLOSED_FB" THEN
      "ALM_CLAMP_DISCREPANCY" := TRUE;
   END_IF;

   IF "SHUTTLE_DRIVE_FAULT" THEN
      "ALM_SHUTTLE_DRIVE_TRIP" := TRUE;
      "CELL_RUNNING" := FALSE;
   END_IF;

   IF "TEACH_MODE_ACTIVE" THEN
      "ALM_CELL_IN_TEACH" := TRUE;
   END_IF;

   CASE "SEQ_STEP" OF
      0:  // C00 idle — every start condition is checked together, including the
          // restart review a power-up or a safety acknowledgement raises
         IF "START_REQUEST"
            AND "MODE_AUTO"
            AND "MODE_REMOTE"
            AND NOT "TEACH_MODE_ACTIVE"
            AND "PRM_SAFETY_GRANTED"
            AND "PRM_SCHEDULE_READY"
            AND "PRM_UTILITY_READY"
            AND "PRM_ROBOTS_READY"
            AND NOT "RESTART_REVIEW_REQUIRED"
         THEN
            "SEQ_STEP" := 10;
         END_IF;

      10: // C10 body infeed
         "CELL_RUNNING" := TRUE;
         IF "SHUTTLE_IN_POSITION" AND "PART_SEATED_OK" THEN
            "SEQ_STEP" := 20;
         END_IF;

      20: // C20 clamp close — the fixture permissive, not a timer, releases welding
         "CLAMP_CLOSE_CMD" := TRUE;
         IF "PRM_FIXTURE_READY" THEN
            "SEQ_STEP" := 30;
         END_IF;

      30: // C30 weld execution — the robots must report done AND the spot count
          // must have reached the schedule target
         IF "ROBOT_CYCLE_DONE" AND "SPOT_COUNT_CYCLE" >= "SPOT_TARGET_COUNT" THEN
            "SEQ_STEP" := 40;
         END_IF;

      40: // C40 weld verification — confidence in the measurement is a condition
          // of releasing the body, not a comment about it
         IF "WELD_QUALITY_CONFIDENCE_OK" AND "SPOTS_VERIFIED" >= "SPOT_TARGET_COUNT" THEN
            "SEQ_STEP" := 50;
         END_IF;

      50: // C50 clamp open
         "CLAMP_CLOSE_CMD" := FALSE;
         IF "CLAMP_A_OPEN_FB" AND "CLAMP_B_OPEN_FB" THEN
            "SEQ_STEP" := 60;
         END_IF;

      60: // C60 body outfeed
         "CYCLE_COMPLETE" := TRUE;
         "CELL_RUNNING" := FALSE;
         "SEQ_STEP" := 0;
   END_CASE;
END_FUNCTION_BLOCK
`;

const FC_LIBRARY_SCL = `FUNCTION "FC_UTILITY_VALIDATION" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Gun cooling water and clamp air, validated before anything asks to weld.
VAR_CONSTANT
   FLOW_MIN     : Real := 6.0;
   PRESSURE_MIN : Real := 4.5;
END_VAR

BEGIN
   "WELD_WATER_FLOW_OK" := "WELD_WATER_FLOW_ACT" >= FLOW_MIN;
   "AIR_PRESSURE_OK" := "AIR_PRESSURE_ACT" >= PRESSURE_MIN;

   IF NOT "WELD_WATER_FLOW_OK" THEN
      "ALM_WATER_FLOW_LOW" := TRUE;
   END_IF;

   IF NOT "AIR_PRESSURE_OK" THEN
      "ALM_AIR_PRESSURE_LOW" := TRUE;
   END_IF;

   // Welding an uncooled gun destroys the electrode and then the shank, so the
   // permissive demands BOTH a healthy flow and a healthy air supply.
   "PRM_UTILITY_READY" := "WELD_WATER_FLOW_OK" AND "AIR_PRESSURE_OK";
END_FUNCTION

FUNCTION "FC_WELD_QUALITY" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Spot verification. Measured, never inferred.
VAR_CONSTANT
   CURRENT_MIN : Real := 6.5;
   CURRENT_MAX : Real := 13.0;
END_VAR

BEGIN
   "WELD_CURRENT_OK" := "WELD_CURRENT_ACT" >= CURRENT_MIN AND "WELD_CURRENT_ACT" <= CURRENT_MAX;
   "WELD_FORCE_OK" := ABS("WELD_FORCE_ACT" - "DB_SCHEDULE".ElectrodeForce) <= "DB_CONFIG".ForceBand;

   "WELD_QUALITY_CONFIDENCE_OK" := "WELD_MEASURED" AND "WELD_CURRENT_OK" AND "WELD_FORCE_OK";

   IF NOT "WELD_CURRENT_OK" THEN
      "ALM_WELD_CURRENT_LOW" := TRUE;
   END_IF;

   // STALE PARAMETERS ARE NEVER A GOOD WELD. A frozen reading is unknown, and
   // unknown withdraws confidence exactly as a missing measurement does.
   IF NOT "WELD_LOG_LINK_OK" OR "WELD_TELEMETRY_AGE" > "DB_CONFIG".StaleThresholdS THEN
      "WELD_DATA_STALE" := TRUE;
   END_IF;

   // AN UNMEASURED SPOT IS NOT A GOOD SPOT. The verified counter advances only
   // on evidence the cell actually holds.
   IF NOT "WELD_MEASURED" OR "WELD_DATA_STALE" THEN
      "WELD_QUALITY_CONFIDENCE_OK" := FALSE;
      "ALM_WELD_UNVERIFIED" := TRUE;
      "ALM_TELEMETRY_STALE" := TRUE;
   END_IF;

   IF "WELD_QUALITY_CONFIDENCE_OK" THEN
      "SPOTS_VERIFIED" := "SPOTS_VERIFIED" + 1;
   END_IF;
END_FUNCTION

FUNCTION "FC_CYCLE_TIME" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Cycle time against the schedule target.
VAR_CONSTANT
   CYCLE_MAX : Real := 3600.0;
END_VAR

BEGIN
   "CYCLE_TIME_S" := "CYCLE_TIME_S" + 1.0;

   IF "CYCLE_TIME_S" > CYCLE_MAX THEN
      "CYCLE_TIME_S" := 0.0;
   END_IF;

   "CYCLE_TIME_DEVIATION_S" := "CYCLE_TIME_S" - "DB_SCHEDULE".TargetCycleS;

   IF "CYCLE_TIME_DEVIATION_S" > "DB_CONFIG".CycleToleranceS THEN
      "ALM_CYCLE_DEVIATION" := TRUE;
   END_IF;
END_FUNCTION

FUNCTION "FC_KPI_CALC" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Production, quality and energy counters.
VAR_CONSTANT
   COUNT_MAX : DInt := 1000000;
END_VAR

BEGIN
   "FC_CYCLE_TIME"();

   IF "CYCLE_COMPLETE" THEN
      "PROD_COUNT_BODIES" := "PROD_COUNT_BODIES" + 1;
   END_IF;

   IF "PROD_COUNT_BODIES" > COUNT_MAX THEN
      "PROD_COUNT_BODIES" := 0;
   END_IF;

   "SPOT_QUALITY_PCT" := "SPOTS_VERIFIED" * 100.0 / "SPOT_TARGET_COUNT";
   "FIRST_TIME_THROUGH_PCT" := "BODIES_FAULT_FREE" * 100.0 / "PROD_COUNT_BODIES";
   "SPECIFIC_WELD_ENERGY" := "WELD_ENERGY_TOTAL" / "PROD_COUNT_BODIES";
END_FUNCTION
`;

const DB_DEFINITIONS_SCL = `DATA_BLOCK "DB_INSTANCE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Retentive instance state for the supervision blocks.
STRUCT
   ClampA    : "UDT_CLAMP";
   ClampB    : "UDT_CLAMP";
   GunR2     : "UDT_WELD_SPOT";
   Zone      : "UDT_SAFETY_ZONE";
   Sequence  : "UDT_SEQ_STATE";
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_SCHEDULE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// The selected weld schedule, with its revision identity.
STRUCT
   ScheduleName     : String[32] := 'BS31_VARIANT_A';
   RevisionChecksum : DWord := 16#7C31D0A5;
   VariantId        : Int := 31;
   SpotTarget       : Int := 148;
   ElectrodeForce   : Real := 3.6;
   CurrentSetpoint  : Real := 9.4;
   WeldTimeMs       : Int := 260;
   TargetCycleS     : Real := 54.0;
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_CONFIG"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Engineering limits. They live here, not inside the logic.
STRUCT
   ForceBand        : Real := 0.4;
   CurrentBand      : Real := 0.8;
   CycleToleranceS  : Real := 6.0;
   StaleThresholdS  : Int := 10;
   TipLifeSpots     : Int := 3000;
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_ROBOTS"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// One entry per robot in the cell.
STRUCT
   Arms  : Array[1..4] of "UDT_ROBOT";
   Count : Int := 4;
END_STRUCT
BEGIN
END_DATA_BLOCK

DATA_BLOCK "DB_ALARMS"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
// Alarm bits and acknowledgement state.
STRUCT
   SafetyStop         : Bool := FALSE;
   ZoneNotClear       : Bool := FALSE;
   ClampTimeout       : Bool := FALSE;
   ClampDiscrepancy   : Bool := FALSE;
   PartNotSeated      : Bool := FALSE;
   WeldCurrentLow     : Bool := FALSE;
   WeldUnverified     : Bool := FALSE;
   ElectrodeWearLimit : Bool := FALSE;
   DresserJam         : Bool := FALSE;
   GunDriveTrip       : Bool := FALSE;
   RobotCommsLoss     : Bool := FALSE;
   ScheduleMismatch   : Bool := FALSE;
END_STRUCT
BEGIN
END_DATA_BLOCK
`;

const UDT_DEFINITIONS_SCL = `TYPE "UDT_ROBOT"
VERSION : 1.0
// One robot arm and the evidence that travels with it.
STRUCT
   ArmId       : Int;
   Ready       : Bool;
   AtHome      : Bool;
   CycleDone   : Bool;
   LinkOk      : Bool;
   TelemetryAgeS : Int;
END_STRUCT
END_TYPE

TYPE "UDT_WELD_SPOT"
VERSION : 1.0
// One spot weld, with the measurement that verifies it.
STRUCT
   SpotId      : Int;
   CurrentKa   : Real;
   ForceKn     : Real;
   WeldTimeMs  : Int;
   Measured    : Bool;
   Verified    : Bool;
END_STRUCT
END_TYPE

TYPE "UDT_WELD_SCHEDULE"
VERSION : 1.0
// A bounded weld schedule with its revision identity.
STRUCT
   RevisionChecksum : DWord;
   VariantId        : Int;
   SpotTarget       : Int;
   ElectrodeForce   : Real;
   CurrentSetpoint  : Real;
   BoundsOk         : Bool;
END_STRUCT
END_TYPE

TYPE "UDT_CLAMP"
VERSION : 1.0
// One clamp group and both of its limit switches.
STRUCT
   CloseCommanded : Bool;
   ClosedLimit    : Bool;
   OpenLimit      : Bool;
   Discrepancy    : Bool;
END_STRUCT
END_TYPE

TYPE "UDT_SAFETY_ZONE"
VERSION : 1.0
// The READ-ONLY view of one safety zone. Every member is published by the
// safety controller; none of them is writable from the cell program.
STRUCT
   ZoneClear      : Bool;
   GateClosed     : Bool;
   GateLocked     : Bool;
   CurtainIntact  : Bool;
   MotionEnabled  : Bool;
   SafeStopActive : Bool;
END_STRUCT
END_TYPE

TYPE "UDT_SEQ_STATE"
VERSION : 1.0
// Sequence state, so a step and its watchdog are never held apart.
STRUCT
   Step         : Int;
   StepElapsedS : DInt;
   TimeoutS     : Int;
   Running      : Bool;
END_STRUCT
END_TYPE
`;

const LAD_CELL_PERMISSIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  TIA-05 — non-safety cell permissive collection, exported as a structured LAD
  description. This is engineering text: it was not produced, compiled or
  validated by TIA Portal or any other vendor tool. It contains no safety
  function: no emergency-stop rung, no guard-lock rung, no light-curtain muting
  and no robot enable, because none of those belong to this controller. This
  build declares no relation mapping for LAD_XML, so the source-agreement gate
  reports it as SKIPPED rather than pretending to have checked it.
-->
<Document>
  <LadderDiagram Name="LAD_CELL_PERMISSIVE" Number="1590" Language="LAD">
    <Network Number="1" Title="Cycle start permissive collection (supervisory, non-safety)">
      <Part Name="Contact" Uid="21" />
      <Part Name="Contact" Uid="22" />
      <Part Name="Contact" Uid="23" />
      <Part Name="Coil" Uid="24" />
      <Access Uid="31" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_SCHEDULE_READY" /></Symbol>
      </Access>
      <Access Uid="32" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_UTILITY_READY" /></Symbol>
      </Access>
      <Access Uid="33" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_ROBOTS_READY" /></Symbol>
      </Access>
      <Access Uid="34" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_FIXTURE_READY" /></Symbol>
      </Access>
      <Wire><NameCon Uid="31" Name="operand" /><NameCon Uid="21" Name="in" /></Wire>
      <Wire><NameCon Uid="32" Name="operand" /><NameCon Uid="22" Name="in" /></Wire>
      <Wire><NameCon Uid="33" Name="operand" /><NameCon Uid="23" Name="in" /></Wire>
      <Wire><NameCon Uid="21" Name="out" /><NameCon Uid="22" Name="in" /></Wire>
      <Wire><NameCon Uid="22" Name="out" /><NameCon Uid="23" Name="in" /></Wire>
      <Wire><NameCon Uid="23" Name="out" /><NameCon Uid="24" Name="in" /></Wire>
      <Wire><NameCon Uid="24" Name="operand" /><NameCon Uid="34" Name="operand" /></Wire>
    </Network>
    <Network Number="2" Title="Safety-controller readiness is MONITORED, never driven">
      <Comment>
        Every safety term below is an input to this network and an output of the
        safety controller. No coil in this diagram writes to a safety object,
        and no emergency-stop reset, guard-lock release, curtain mute or robot
        enable rung exists here or in any other artefact of this reference.
      </Comment>
      <Part Name="Contact" Uid="41" />
      <Part Name="Contact" Uid="42" />
      <Part Name="Contact" Uid="43" />
      <Part Name="NotContact" Uid="44" />
      <Part Name="Coil" Uid="45" />
      <Access Uid="51" Scope="GlobalVariable">
        <Symbol><Component Name="SAFETY_ZONE_CLEAR" /></Symbol>
      </Access>
      <Access Uid="52" Scope="GlobalVariable">
        <Symbol><Component Name="FENCE_GATE_LOCKED" /></Symbol>
      </Access>
      <Access Uid="53" Scope="GlobalVariable">
        <Symbol><Component Name="ROBOT_MOTION_ENABLE" /></Symbol>
      </Access>
      <Access Uid="54" Scope="GlobalVariable">
        <Symbol><Component Name="SAFE_STOP_ACTIVE" /></Symbol>
      </Access>
      <Access Uid="55" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_SAFETY_GRANTED" /></Symbol>
      </Access>
      <Wire><NameCon Uid="51" Name="operand" /><NameCon Uid="41" Name="in" /></Wire>
      <Wire><NameCon Uid="52" Name="operand" /><NameCon Uid="42" Name="in" /></Wire>
      <Wire><NameCon Uid="53" Name="operand" /><NameCon Uid="43" Name="in" /></Wire>
      <Wire><NameCon Uid="54" Name="operand" /><NameCon Uid="44" Name="in" /></Wire>
      <Wire><NameCon Uid="41" Name="out" /><NameCon Uid="42" Name="in" /></Wire>
      <Wire><NameCon Uid="42" Name="out" /><NameCon Uid="43" Name="in" /></Wire>
      <Wire><NameCon Uid="43" Name="out" /><NameCon Uid="44" Name="in" /></Wire>
      <Wire><NameCon Uid="44" Name="out" /><NameCon Uid="45" Name="in" /></Wire>
      <Wire><NameCon Uid="45" Name="operand" /><NameCon Uid="55" Name="operand" /></Wire>
    </Network>
  </LadderDiagram>
</Document>
`;

const FBD_WELD_ENABLE_XML = `<?xml version="1.0" encoding="utf-8"?>
<!--
  TIA-05 — the weld-enable request network, exported as a structured FBD
  description. This is engineering text: it was not produced, compiled or
  validated by TIA Portal or any other vendor tool. The coil at the end of this
  network is a REQUEST to the weld timer. It closes no contactor, fires no
  thyristor and energises no electrode; the weld timer owns all of that. This
  build declares no relation mapping for FBD_XML, so the source-agreement gate
  reports it as SKIPPED rather than pretending to have checked it.
-->
<Document>
  <FunctionBlockDiagram Name="FBD_WELD_ENABLE" Number="1591" Language="FBD">
    <Network Number="1" Title="Weld enable request — all five conditions, no fallback">
      <Part Name="And" Uid="21" Cardinality="6" />
      <Part Name="Not" Uid="22" />
      <Part Name="Coil" Uid="23" />
      <Access Uid="31" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_SAFETY_GRANTED" /></Symbol>
      </Access>
      <Access Uid="32" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_FIXTURE_READY" /></Symbol>
      </Access>
      <Access Uid="33" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_UTILITY_READY" /></Symbol>
      </Access>
      <Access Uid="34" Scope="GlobalVariable">
        <Symbol><Component Name="PRM_SCHEDULE_READY" /></Symbol>
      </Access>
      <Access Uid="35" Scope="GlobalVariable">
        <Symbol><Component Name="WELD_TIMER_READY" /></Symbol>
      </Access>
      <Access Uid="36" Scope="GlobalVariable">
        <Symbol><Component Name="WELD_TIMER_FAULT" /></Symbol>
      </Access>
      <Access Uid="37" Scope="GlobalVariable">
        <Symbol><Component Name="WELD_ENABLE" /></Symbol>
      </Access>
      <Wire><NameCon Uid="31" Name="operand" /><NameCon Uid="21" Name="in1" /></Wire>
      <Wire><NameCon Uid="32" Name="operand" /><NameCon Uid="21" Name="in2" /></Wire>
      <Wire><NameCon Uid="33" Name="operand" /><NameCon Uid="21" Name="in3" /></Wire>
      <Wire><NameCon Uid="34" Name="operand" /><NameCon Uid="21" Name="in4" /></Wire>
      <Wire><NameCon Uid="35" Name="operand" /><NameCon Uid="21" Name="in5" /></Wire>
      <Wire><NameCon Uid="36" Name="operand" /><NameCon Uid="22" Name="in" /></Wire>
      <Wire><NameCon Uid="22" Name="out" /><NameCon Uid="21" Name="in6" /></Wire>
      <Wire><NameCon Uid="21" Name="out" /><NameCon Uid="23" Name="in" /></Wire>
      <Wire><NameCon Uid="23" Name="operand" /><NameCon Uid="37" Name="operand" /></Wire>
    </Network>
  </FunctionBlockDiagram>
</Document>
`;

/* ── System ───────────────────────────────────────────────────────────────── */

export const TIA_05_BODY_SHOP_WELDING: AuthoredReferenceSystem = {
  id: "TIA-05",
  name: t("Body-shop robotic spot-welding cell", "سلول جوشکاری نقطه‌ای رباتیک بدنه‌سازی"),
  domain: t(
    "Body infeed, geometry fixturing, four-robot spot welding, weld verification, electrode tip management and body outfeed, with an external safety-controller boundary",
    "ورود بدنه، مهار هندسی، جوش نقطه‌ای با چهار ربات، صحت‌سنجی جوش، مدیریت الکترود و خروج بدنه، با مرز بیرونی کنترلر ایمنی",
  ),
  sourceType: "TIA_REFERENCE",
  platform:
    "Vendor-neutral S7-1500F-class controller described in IEC 61131-3 / SCL source text, with personnel safety owned by an external safety controller over a fail-safe fieldbus; no vendor project archive is produced or claimed",
  version: "1.0.0",
  revision: 1,
  origin: "SYNTHETIC_ORIGINAL",
  nodes: [
    /* Devices */
    a.node("DEVICE", "CPU_1516F", t("Cell controller", "کنترلر سلول"), {
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "ET200SP_IO", t("Distributed I/O station", "ایستگاه ورودی/خروجی توزیع‌شده"), {
      domain: "FIELD_IO",
      attributes: { deviceCategory: "REMOTE_IO", networkZone: "FIELD", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "HMI_PANEL_CELL", t("Cell operator panel", "پنل اپراتور سلول"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { deviceCategory: "HMI", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "SAFETY_CONTROLLER", t("Cell safety controller", "کنترلر ایمنی سلول"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { deviceCategory: "SAFETY_CONTROLLER", networkZone: "SAFETY" },
      description: t(
        "An EXTERNAL system with final authority over the emergency-stop chain, the fence gate interlock and its guard lock, the load light curtain, zone clearance and the robot motion enable. This corpus observes what it publishes and can never command, reset, inhibit, bypass, mute or simulate any part of it.",
        "یک سامانهٔ بیرونی با اختیار نهایی بر زنجیرهٔ توقف اضطراری، اینترلاک درِ حصار و قفل نگهبان آن، پردهٔ نوری بارگذاری، پاکیِ ناحیه و مجوز حرکت ربات. این پیکره آنچه را منتشر می‌کند مشاهده می‌کند و هرگز نمی‌تواند هیچ بخشی از آن را فرمان دهد، ریست، غیرفعال، دور زده، بی‌اثر یا شبیه‌سازی کند.",
      ),
    }),
    a.node("DEVICE", "ROBOT_CONTROLLER_R1", t("Robot 1 controller", "کنترلر ربات ۱"), {
      subsystem: "ROBOT_GROUP",
      domain: "MECHANICAL",
      attributes: { deviceCategory: "OTHER", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "ROBOT_CONTROLLER_R2", t("Robot 2 controller", "کنترلر ربات ۲"), {
      subsystem: "ROBOT_GROUP",
      domain: "MECHANICAL",
      attributes: { deviceCategory: "OTHER", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "ROBOT_CONTROLLER_R3", t("Robot 3 controller", "کنترلر ربات ۳"), {
      subsystem: "ROBOT_GROUP",
      domain: "MECHANICAL",
      attributes: { deviceCategory: "OTHER", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "ROBOT_CONTROLLER_R4", t("Robot 4 controller", "کنترلر ربات ۴"), {
      subsystem: "ROBOT_GROUP",
      domain: "MECHANICAL",
      attributes: { deviceCategory: "OTHER", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "WELD_TIMER_MFDC", t("Mid-frequency weld timer", "تایمر جوش فرکانس‌متوسط"), {
      subsystem: "WELD_CONTROL",
      domain: "ENERGY",
      attributes: { deviceCategory: "OTHER", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
      description: t(
        "Owns weld current, squeeze, hold and its own thermal protection. This controller hands it a bounded REQUEST and reads back what it measured; it never energises an electrode.",
        "مالک جریان جوش، فشردن، نگه‌داشت و حفاظت حرارتی خودش است. این کنترلر تنها یک درخواست کران‌دار به آن می‌دهد و آنچه را اندازه گرفته می‌خواند؛ هرگز الکترودی را انرژی‌دار نمی‌کند.",
      ),
    }),
    a.node("DEVICE", "VFD_SHUTTLE_DRIVE", t("Shuttle conveyor drive", "درایو نوار شاتل"), {
      subsystem: "CONVEY",
      domain: "DRIVES",
      attributes: { deviceCategory: "VFD", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "PROFINET_SWITCH", t("PROFINET switch", "سوییچ پروفینت"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "NETWORK_SWITCH", networkZone: "CONTROL" },
    }),

    /* Equipment */
    a.node("EQUIPMENT", "SHUTTLE_CONVEYOR", t("Body shuttle conveyor", "نوار شاتل بدنه"), {
      subsystem: "CONVEY",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "GEO_FIXTURE", t("Geometry fixture", "فیکسچر هندسی"), {
      subsystem: "FIXTURE",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "CLAMP_GROUP_A", t("Clamp group A", "گروه گیرهٔ A"), {
      subsystem: "FIXTURE",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "CLAMP_GROUP_B", t("Clamp group B", "گروه گیرهٔ B"), {
      subsystem: "FIXTURE",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "LOCATING_PINS", t("Geometry locating pins", "پین‌های موقعیت‌یاب هندسی"), {
      subsystem: "FIXTURE",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "ROBOT_R1", t("Spot-welding robot 1", "ربات جوش نقطه‌ای ۱"), {
      subsystem: "ROBOT_GROUP",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "ROBOT_R2", t("Spot-welding robot 2", "ربات جوش نقطه‌ای ۲"), {
      subsystem: "ROBOT_GROUP",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "ROBOT_R3", t("Spot-welding robot 3", "ربات جوش نقطه‌ای ۳"), {
      subsystem: "ROBOT_GROUP",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "ROBOT_R4", t("Spot-welding robot 4", "ربات جوش نقطه‌ای ۴"), {
      subsystem: "ROBOT_GROUP",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "WELD_GUN_R1", t("Servo weld gun 1", "گان جوش سروو ۱"), {
      subsystem: "WELD_CONTROL",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "WELD_GUN_R2", t("Servo weld gun 2", "گان جوش سروو ۲"), {
      subsystem: "WELD_CONTROL",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "WELD_GUN_R3", t("Servo weld gun 3", "گان جوش سروو ۳"), {
      subsystem: "WELD_CONTROL",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "WELD_GUN_R4", t("Servo weld gun 4", "گان جوش سروو ۴"), {
      subsystem: "WELD_CONTROL",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "TIP_DRESSER", t("Electrode tip dresser", "تراش‌دهندهٔ نوک الکترود"), {
      subsystem: "WELD_CONTROL",
      domain: "MAINTENANCE",
    }),
    a.node("EQUIPMENT", "WELD_WATER_CIRCUIT", t("Gun cooling water circuit", "مدار آب خنک‌کاری گان"), {
      subsystem: "UTILITY",
      domain: "PROCESS",
      description: t(
        "Welding an uncooled gun destroys the electrode and then the shank. Cooling is a permissive here, not a comfort.",
        "جوشکاری با گانِ خنک‌نشده ابتدا الکترود و سپس شفت را از بین می‌برد. خنک‌کاری اینجا یک مجوز است، نه یک امکان رفاهی.",
      ),
    }),
    a.node("EQUIPMENT", "AIR_SUPPLY", t("Compressed air supply", "تأمین هوای فشرده"), {
      subsystem: "UTILITY",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "SAFETY_FENCE_GATE", t("Safety fence gate with guard lock", "درِ حصار ایمنی با قفل نگهبان"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "Owned by the safety controller. Observed here, released nowhere.",
        "در اختیار کنترلر ایمنی. اینجا مشاهده می‌شود و در هیچ جا آزاد نمی‌شود.",
      ),
    }),
    a.node("EQUIPMENT", "LOAD_LIGHT_CURTAIN", t("Load-station light curtain", "پردهٔ نوری ایستگاه بارگذاری"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "No muting, blanking or override is generated, requested, sequenced or simulated anywhere in this reference.",
        "در هیچ جای این مرجع هیچ بی‌اثرسازی، پوشش یا نادیده‌گیری تولید، درخواست، توالی‌بندی یا شبیه‌سازی نمی‌شود.",
      ),
    }),
    a.node("EQUIPMENT", "EMERGENCY_STOP_CHAIN", t("Emergency-stop chain", "زنجیرهٔ توقف اضطراری"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
    }),

    /* PLC blocks */
    a.node("PLC_BLOCK", "OB_MAIN", t("OB1 cyclic entry point", "OB1 نقطهٔ ورود چرخه‌ای"), { attributes: { blockType: "OB" }, sourceId: "OB1" }),
    a.node("PLC_BLOCK", "OB_STARTUP", t("OB100 startup and initialisation", "OB100 راه‌اندازی و مقداردهی اولیه"), { attributes: { blockType: "OB" }, sourceId: "OB100" }),
    a.node("PLC_BLOCK", "FB_SAFETY_STATUS", t("Safety-controller status view", "نمای وضعیت کنترلر ایمنی"), {
      subsystem: "SAFETY_BOUNDARY",
      attributes: { blockType: "FB" },
      sourceId: "FB1510",
      description: t(
        "Reads the safety controller and writes nothing to it. Every term of the motion grant is an input.",
        "کنترلر ایمنی را می‌خواند و چیزی در آن نمی‌نویسد. هر جزء مجوز حرکت یک ورودی است.",
      ),
    }),
    a.node("PLC_BLOCK", "FB_FIXTURE_CONTROL", t("Geometry fixture control", "کنترل فیکسچر هندسی"), { subsystem: "FIXTURE", attributes: { blockType: "FB" }, sourceId: "FB1520" }),
    a.node("PLC_BLOCK", "FB_VARIANT_MANAGEMENT", t("Body variant and weld schedule management", "مدیریت واریانت بدنه و برنامهٔ جوش"), { domain: "QUALITY", attributes: { blockType: "FB" }, sourceId: "FB1530" }),
    a.node("PLC_BLOCK", "FB_ROBOT_COORDINATION", t("Robot group coordination", "هماهنگی گروه ربات‌ها"), { subsystem: "ROBOT_GROUP", attributes: { blockType: "FB" }, sourceId: "FB1540" }),
    a.node("PLC_BLOCK", "FB_WELD_SUPERVISION", t("Weld request supervision", "نظارت بر درخواست جوش"), { subsystem: "WELD_CONTROL", attributes: { blockType: "FB" }, sourceId: "FB1550" }),
    a.node("PLC_BLOCK", "FB_TIP_MANAGEMENT", t("Electrode tip management", "مدیریت نوک الکترود"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { blockType: "FB" }, sourceId: "FB1560" }),
    a.node("PLC_BLOCK", "FB_CELL_SEQUENCE", t("Cell cycle state machine", "ماشین حالت چرخهٔ سلول"), { attributes: { blockType: "FB" }, sourceId: "FB1570" }),
    a.node("PLC_BLOCK", "FC_UTILITY_VALIDATION", t("Cooling and air validation", "اعتبارسنجی خنک‌کاری و هوا"), { subsystem: "UTILITY", domain: "PROCESS", attributes: { blockType: "FC" }, sourceId: "FC1580" }),
    a.node("PLC_BLOCK", "FC_WELD_QUALITY", t("Spot verification", "صحت‌سنجی نقطهٔ جوش"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { blockType: "FC" }, sourceId: "FC1581" }),
    a.node("PLC_BLOCK", "FC_CYCLE_TIME", t("Cycle time supervision", "نظارت بر زمان چرخه"), { attributes: { blockType: "FC" }, sourceId: "FC1582" }),
    a.node("PLC_BLOCK", "FC_KPI_CALC", t("Production and quality counters", "شمارنده‌های تولید و کیفیت"), { attributes: { blockType: "FC" }, sourceId: "FC1583" }),
    a.node("PLC_BLOCK", "DB_INSTANCE", t("Supervision instance data", "دادهٔ نمونهٔ بلوک‌های نظارتی"), { attributes: { blockType: "DB" }, sourceId: "DB1510" }),
    a.node("PLC_BLOCK", "DB_SCHEDULE", t("Selected weld schedule", "برنامهٔ جوش انتخاب‌شده"), { domain: "QUALITY", attributes: { blockType: "DB" }, sourceId: "DB1511" }),
    a.node("PLC_BLOCK", "DB_CONFIG", t("Engineering limits", "حدود مهندسی"), { attributes: { blockType: "DB" }, sourceId: "DB1512" }),
    a.node("PLC_BLOCK", "DB_ROBOTS", t("Robot group data", "دادهٔ گروه ربات‌ها"), { subsystem: "ROBOT_GROUP", attributes: { blockType: "DB" }, sourceId: "DB1513" }),
    a.node("PLC_BLOCK", "DB_ALARMS", t("Alarm bits and acknowledgement", "بیت‌های آلارم و تأیید"), { attributes: { blockType: "DB" }, sourceId: "DB1514" }),
    a.node("PLC_BLOCK", "UDT_ROBOT", t("Robot arm type", "نوع بازوی ربات"), { attributes: { blockType: "UDT" }, sourceId: "UDT_ROBOT" }),
    a.node("PLC_BLOCK", "UDT_WELD_SPOT", t("Weld spot type", "نوع نقطهٔ جوش"), { attributes: { blockType: "UDT" }, sourceId: "UDT_WELD_SPOT" }),
    a.node("PLC_BLOCK", "UDT_WELD_SCHEDULE", t("Weld schedule type", "نوع برنامهٔ جوش"), { attributes: { blockType: "UDT" }, sourceId: "UDT_WELD_SCHEDULE" }),
    a.node("PLC_BLOCK", "UDT_CLAMP", t("Clamp group type", "نوع گروه گیره"), { attributes: { blockType: "UDT" }, sourceId: "UDT_CLAMP" }),
    a.node("PLC_BLOCK", "UDT_SAFETY_ZONE", t("Safety zone view type", "نوع نمای ناحیهٔ ایمنی"), { attributes: { blockType: "UDT" }, sourceId: "UDT_SAFETY_ZONE" }),
    a.node("PLC_BLOCK", "UDT_SEQ_STATE", t("Sequence state type", "نوع وضعیت توالی"), { attributes: { blockType: "UDT" }, sourceId: "UDT_SEQ_STATE" }),

    /* Sequence and mode */
    a.node("TAG", "SEQ_STEP", t("Sequence step", "گام توالی"), { attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "CELL_RUNNING", t("Cell running", "در حال کار بودن سلول"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "START_REQUEST", t("Cycle start request", "درخواست شروع چرخه"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "MODE_AUTO", t("Automatic mode selected", "انتخاب حالت خودکار"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "MODE_REMOTE", t("Remote mode selected", "انتخاب حالت از راه دور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "TEACH_MODE_ACTIVE", t("Teach mode active at the cell", "فعال بودن حالت آموزش روی سلول"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "TRUE means a pendant is still enabled at the cell. The evidence is a human action, not a process state, and no automatic cycle may start against it.",
        "مقدار TRUE یعنی یک پندانت هنوز روی سلول فعال است. شاهد آن یک اقدام انسانی است، نه یک وضعیت فرایندی، و هیچ چرخهٔ خودکاری در برابر آن نباید آغاز شود.",
      ),
    }),
    a.node("TAG", "ALARM_WORD", t("Alarm collection word", "کلمهٔ تجمیع آلارم"), { attributes: { dataType: "WORD", accessMode: "READ" } }),
    a.node("TAG", "CYCLE_COMPLETE", t("Cycle complete", "تکمیل چرخه"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "RESTART_REVIEW_REQUIRED", t("Restart review required", "نیاز به بازبینی پیش از راه‌اندازی مجدد"), {
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Raised by the startup block and by a safety acknowledgement demand. A part-welded body is ambiguous after a restart, and an automatic start is blocked until a human reconciles it.",
        "توسط بلوک راه‌اندازی و نیز درخواست تأیید ایمنی مطرح می‌شود. بدنه‌ای که نیمه‌جوش مانده پس از راه‌اندازی مجدد مبهم است و تا زمانی که انسانی آن را تطبیق ندهد، شروع خودکار مسدود است.",
      ),
    }),

    /* Safety boundary — read-only evidence */
    a.node("TAG", "SAFETY_ZONE_CLEAR", t("Cell zone clear of people", "خالی بودن ناحیهٔ سلول از افراد"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "FENCE_GATE_CLOSED", t("Fence gate closed", "بسته بودن درِ حصار"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "FENCE_GATE_LOCKED", t("Guard lock engaged", "درگیر بودن قفل نگهبان"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Published by the safety controller. No guard-lock release is generated, requested or simulated anywhere in this reference.",
        "توسط کنترلر ایمنی منتشر می‌شود. در هیچ جای این مرجع هیچ آزادسازی قفل نگهبان تولید، درخواست یا شبیه‌سازی نمی‌شود.",
      ),
    }),
    a.node("TAG", "LIGHT_CURTAIN_INTACT", t("Light curtain unbroken", "قطع‌نشدن پردهٔ نوری"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "ESTOP_CHAIN_HEALTHY", t("Emergency-stop chain healthy", "سلامت زنجیرهٔ توقف اضطراری"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "SAFE_STOP_ACTIVE", t("Safe stop active", "فعال بودن توقف ایمن"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Read-only. The stop is never reset from this controller; the safety controller owns it and clearing it is a human act on that system after the zone has been checked.",
        "فقط‌خواندنی. این توقف هرگز از این کنترلر ریست نمی‌شود؛ کنترلر ایمنی مالک آن است و پاک کردن آن یک اقدام انسانی روی همان سامانه، پس از بازبینی ناحیه است.",
      ),
    }),
    a.node("TAG", "ROBOT_MOTION_ENABLE", t("Robot motion enable", "مجوز حرکت ربات"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "The grant itself, and an INPUT to this controller. The cell program observes it; it does not, and structurally cannot, issue it.",
        "خودِ مجوز، و یک ورودی برای این کنترلر. برنامهٔ سلول آن را مشاهده می‌کند؛ آن را صادر نمی‌کند و از نظر ساختاری نمی‌تواند صادر کند.",
      ),
    }),
    a.node("TAG", "SAFETY_ACK_REQUIRED", t("Safety acknowledgement demanded", "درخواست تأیید ایمنی"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Robots */
    a.node("TAG", "R1_READY", t("Robot 1 ready", "آمادگی ربات ۱"), { subsystem: "ROBOT_GROUP", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "R2_READY", t("Robot 2 ready", "آمادگی ربات ۲"), { subsystem: "ROBOT_GROUP", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "R3_READY", t("Robot 3 ready", "آمادگی ربات ۳"), { subsystem: "ROBOT_GROUP", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "R4_READY", t("Robot 4 ready", "آمادگی ربات ۴"), { subsystem: "ROBOT_GROUP", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ROBOTS_READY_ALL", t("All four robots ready", "آمادگی هر چهار ربات"), { subsystem: "ROBOT_GROUP", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ROBOTS_AT_HOME", t("All robots at home position", "قرار داشتن همهٔ ربات‌ها در موقعیت خانه"), { subsystem: "ROBOT_GROUP", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ROBOT_CYCLE_DONE", t("Robot cycle reported complete", "گزارش پایان چرخهٔ ربات‌ها"), { subsystem: "ROBOT_GROUP", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "R3_LINK_OK", t("Robot 3 link healthy", "سلامت پیوند ربات ۳"), { subsystem: "ROBOT_GROUP", domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "R3_TELEMETRY_AGE", t("Age of newest robot 3 frame", "سن تازه‌ترین فریم ربات ۳"), { subsystem: "ROBOT_GROUP", domain: "NETWORK", attributes: { dataType: "INT", unit: "s", accessMode: "READ" } }),
    a.node("TAG", "R3_DATA_STALE", t("Robot 3 data stale", "کهنگی دادهٔ ربات ۳"), { subsystem: "ROBOT_GROUP", domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Weld request and measurement */
    a.node("TAG", "WELD_ENABLE", t("Weld enable request", "درخواست مجوز جوش"), {
      subsystem: "WELD_CONTROL",
      domain: "ENERGY",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "A PERMISSION handed to the weld timer, not an energisation. Losing any one of the five conditions withdraws it completely, with no reduced-current fallback.",
        "یک اجازه که به تایمر جوش داده می‌شود، نه انرژی‌دار کردن. از دست رفتن هر یک از پنج شرط، آن را کاملاً سلب می‌کند، بدون هیچ حالت میانیِ کم‌جریان.",
      ),
    }),
    a.node("TAG", "WELD_TIMER_READY", t("Weld timer ready", "آمادگی تایمر جوش"), { subsystem: "WELD_CONTROL", domain: "ENERGY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "WELD_TIMER_FAULT", t("Weld timer fault", "خطای تایمر جوش"), { subsystem: "WELD_CONTROL", domain: "ENERGY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "WELD_CURRENT_ACT", t("Measured weld current", "جریان جوش اندازه‌گیری‌شده"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { dataType: "REAL", unit: "kA", accessMode: "READ" } }),
    a.node("TAG", "WELD_FORCE_ACT", t("Measured electrode force", "نیروی الکترود اندازه‌گیری‌شده"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { dataType: "REAL", unit: "kN", accessMode: "READ" } }),
    a.node("TAG", "WELD_TIME_ACT", t("Measured weld time", "زمان جوش اندازه‌گیری‌شده"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { dataType: "INT", unit: "ms", accessMode: "READ" } }),
    a.node("TAG", "WELD_ENERGY_TOTAL", t("Total weld energy", "انرژی کل جوش"), { subsystem: "WELD_CONTROL", domain: "ENERGY", attributes: { dataType: "REAL", unit: "MJ", accessMode: "READ" } }),
    a.node("TAG", "WELD_CURRENT_OK", t("Weld current within band", "بودن جریان جوش در محدوده"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "WELD_FORCE_OK", t("Electrode force within band", "بودن نیروی الکترود در محدوده"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "WELD_MEASURED", t("Weld timer published a measurement", "انتشار اندازه‌گیری توسط تایمر جوش"), {
      subsystem: "WELD_CONTROL",
      domain: "QUALITY",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "FALSE means the spot was made but nothing measured it. That is not a good spot; it is an unverified one.",
        "مقدار FALSE یعنی نقطه زده شده اما چیزی آن را اندازه نگرفته است. این نقطهٔ خوبی نیست؛ نقطه‌ای صحت‌سنجی‌نشده است.",
      ),
    }),
    a.node("TAG", "WELD_QUALITY_CONFIDENCE_OK", t("Weld evidence trustworthy", "قابل اعتماد بودن شواهد جوش"), {
      subsystem: "WELD_CONTROL",
      domain: "QUALITY",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Withdrawn by a missing measurement and withdrawn by staleness alike. A spot nobody can vouch for is not a good spot.",
        "با نبود اندازه‌گیری و با کهنگی، به یک اندازه سلب می‌شود. نقطه‌ای که کسی نمی‌تواند برای آن ضمانت کند، نقطهٔ خوبی نیست.",
      ),
    }),
    a.node("TAG", "WELD_LOG_LINK_OK", t("Weld parameter link healthy", "سلامت پیوند پارامترهای جوش"), { subsystem: "WELD_CONTROL", domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "WELD_TELEMETRY_AGE", t("Age of newest weld record", "سن تازه‌ترین رکورد جوش"), { subsystem: "WELD_CONTROL", domain: "NETWORK", attributes: { dataType: "INT", unit: "s", accessMode: "READ" } }),
    a.node("TAG", "WELD_DATA_STALE", t("Weld parameter data stale", "کهنگی دادهٔ پارامترهای جوش"), { subsystem: "WELD_CONTROL", domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "SPOT_COUNT_CYCLE", t("Spots made this cycle", "نقاط زده‌شده در این چرخه"), { subsystem: "WELD_CONTROL", domain: "PROCESS", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "SPOT_TARGET_COUNT", t("Spots the schedule demands", "تعداد نقاط مورد نیاز برنامه"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "SPOTS_VERIFIED", t("Spots verified by measurement", "نقاط صحت‌سنجی‌شده با اندازه‌گیری"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { dataType: "INT", accessMode: "READ" } }),

    /* Servo gun and electrode tips */
    a.node("TAG", "GUN_R2_DRIVE_FAULT", t("Servo gun 2 drive fault", "خطای درایو گان سروو ۲"), { subsystem: "WELD_CONTROL", domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "GUN_R2_DRIVE_FAULT_PREV", t("Servo gun 2 drive fault, previous scan", "خطای درایو گان سروو ۲ در چرخهٔ پیشین"), { subsystem: "WELD_CONTROL", domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "GUN_R2_FORCE_REF", t("Servo gun 2 force reference", "مرجع نیروی گان سروو ۲"), { subsystem: "WELD_CONTROL", domain: "DRIVES", attributes: { dataType: "REAL", unit: "kN", accessMode: "READ" } }),
    a.node("TAG", "GUN_R2_POSITION_ACT", t("Servo gun 2 actual position", "موقعیت واقعی گان سروو ۲"), { subsystem: "WELD_CONTROL", domain: "DRIVES", attributes: { dataType: "REAL", unit: "mm", accessMode: "READ" } }),
    a.node("TAG", "TIP_WEAR_COUNT", t("Spots since the last dress", "نقاط زده‌شده از آخرین تراش"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "TIP_WEAR_LIMIT_REACHED", t("Electrode life limit reached", "رسیدن به حد عمر الکترود"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "TIP_DRESS_REQUEST", t("Tip dress requested", "درخواست تراش نوک"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "TIP_DRESS_DONE", t("Tip dress completed", "تکمیل تراش نوک"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "DRESSER_MOTOR_FAULT", t("Tip dresser motor fault", "خطای موتور تراش‌دهنده"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "DRESSER_BLADE_JAM", t("Tip dresser blade jammed", "گیر کردن تیغهٔ تراش‌دهنده"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Fixture */
    a.node("TAG", "CLAMP_CLOSE_CMD", t("Clamp close command", "فرمان بستن گیره"), { subsystem: "FIXTURE", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "CLAMP_A_CLOSED_FB", t("Clamp A closed feedback", "بازخورد بسته بودن گیرهٔ A"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "CLAMP_A_OPEN_FB", t("Clamp A open feedback", "بازخورد باز بودن گیرهٔ A"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "CLAMP_B_CLOSED_FB", t("Clamp B closed feedback", "بازخورد بسته بودن گیرهٔ B"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "CLAMP_B_OPEN_FB", t("Clamp B open feedback", "بازخورد باز بودن گیرهٔ B"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "CLAMPS_CLOSED_ALL", t("Every clamp reports closed", "گزارش بسته بودن همهٔ گیره‌ها"), { subsystem: "FIXTURE", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "PART_PRESENT_1", t("Part present sensor 1", "سنسور حضور قطعهٔ ۱"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "PART_PRESENT_2", t("Part present sensor 2", "سنسور حضور قطعهٔ ۲"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "GEO_PIN_ENGAGED", t("Geometry pin engaged", "درگیر بودن پین هندسی"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "PART_SEATED_OK", t("Body seated in the fixture", "نشستن بدنه در فیکسچر"), { subsystem: "FIXTURE", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Utilities */
    a.node("TAG", "WELD_WATER_FLOW_ACT", t("Gun cooling water flow", "دبی آب خنک‌کاری گان"), { subsystem: "UTILITY", domain: "PROCESS", attributes: { dataType: "REAL", unit: "l/min", accessMode: "READ" } }),
    a.node("TAG", "WELD_WATER_FLOW_OK", t("Cooling flow sufficient", "کفایت دبی خنک‌کاری"), { subsystem: "UTILITY", domain: "PROCESS", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "WELD_WATER_TEMP", t("Cooling water return temperature", "دمای برگشت آب خنک‌کاری"), { subsystem: "UTILITY", domain: "PROCESS", attributes: { dataType: "REAL", unit: "C", accessMode: "READ" } }),
    a.node("TAG", "AIR_PRESSURE_ACT", t("Compressed air pressure", "فشار هوای فشرده"), { subsystem: "UTILITY", domain: "PROCESS", attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" } }),
    a.node("TAG", "AIR_PRESSURE_OK", t("Air pressure sufficient", "کفایت فشار هوا"), { subsystem: "UTILITY", domain: "PROCESS", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Transport */
    a.node("TAG", "SHUTTLE_IN_POSITION", t("Shuttle in weld position", "قرار گرفتن شاتل در موقعیت جوش"), { subsystem: "CONVEY", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "SHUTTLE_SPEED_ACT", t("Shuttle actual speed", "سرعت واقعی شاتل"), { subsystem: "CONVEY", domain: "DRIVES", attributes: { dataType: "REAL", unit: "m/min", accessMode: "READ" } }),
    a.node("TAG", "SHUTTLE_DRIVE_FAULT", t("Shuttle drive fault", "خطای درایو شاتل"), { subsystem: "CONVEY", domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Body variant and weld schedule */
    a.node("TAG", "VARIANT_SELECTED", t("A body variant is selected", "انتخاب شدن یک واریانت بدنه"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "VARIANT_ID_ACT", t("Body variant read from the carrier", "شناسهٔ واریانت خوانده‌شده از حامل"), { domain: "QUALITY", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "SCHEDULE_ID_LOADED", t("Schedule identity the weld timer holds", "شناسهٔ برنامه‌ای که تایمر جوش نگه داشته"), { domain: "QUALITY", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("TAG", "SCHEDULE_MATCHES_VARIANT", t("Loaded schedule matches the body", "تطابق برنامهٔ بارگذاری‌شده با بدنه"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "SCHEDULE_CHECKSUM_ACT", t("Actual schedule checksum", "checksum واقعی برنامهٔ جوش"), { domain: "QUALITY", attributes: { dataType: "DWORD", accessMode: "READ" } }),
    a.node("TAG", "SCHEDULE_CHECKSUM_OK", t("Schedule revision matches its checksum", "تطابق نسخهٔ برنامه با checksum آن"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "SCHEDULE_VALID", t("Weld schedule valid", "معتبر بودن برنامهٔ جوش"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "SCHEDULE_LOCKED", t("Schedule locked for this body", "قفل بودن برنامه برای این بدنه"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "SCHEDULE_CHANGE_REQUEST", t("Schedule change requested", "درخواست تغییر برنامهٔ جوش"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "SCHEDULE_CHANGE_REVIEW", t("Schedule change requires review", "نیاز تغییر برنامه به بازبینی"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Counters */
    a.node("TAG", "CYCLE_TIME_S", t("Cycle time", "زمان چرخه"), { attributes: { dataType: "REAL", unit: "s", accessMode: "READ" } }),
    a.node("TAG", "CYCLE_TIME_DEVIATION_S", t("Cycle time deviation", "انحراف زمان چرخه"), { attributes: { dataType: "REAL", unit: "s", accessMode: "READ" } }),
    a.node("TAG", "PROD_COUNT_BODIES", t("Bodies produced", "تعداد بدنه‌های تولیدشده"), { domain: "PROCESS", attributes: { dataType: "DINT", accessMode: "READ" } }),
    a.node("TAG", "BODIES_FAULT_FREE", t("Bodies completed without a fault", "بدنه‌های تکمیل‌شده بدون خطا"), { domain: "QUALITY", attributes: { dataType: "DINT", accessMode: "READ" } }),
    a.node("TAG", "SPOT_QUALITY_PCT", t("Verified spots as a share of target", "سهم نقاط صحت‌سنجی‌شده از هدف"), { domain: "QUALITY", attributes: { dataType: "REAL", unit: "%", accessMode: "READ" } }),
    a.node("TAG", "FIRST_TIME_THROUGH_PCT", t("First-time-through share", "سهم عبور بدون بازکاری"), { domain: "QUALITY", attributes: { dataType: "REAL", unit: "%", accessMode: "READ" } }),
    a.node("TAG", "SPECIFIC_WELD_ENERGY", t("Weld energy per body", "انرژی جوش به‌ازای هر بدنه"), { domain: "ENERGY", attributes: { dataType: "REAL", unit: "MJ/body", accessMode: "READ" } }),

    /* Alarm bits */
    a.node("TAG", "ALM_SAFETY_STOP", t("Safe stop alarm bit", "بیت آلارم توقف ایمن"), { subsystem: "SAFETY_BOUNDARY", domain: "SAFETY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_ZONE_NOT_CLEAR", t("Zone not clear alarm bit", "بیت آلارم پاک نبودن ناحیه"), { subsystem: "SAFETY_BOUNDARY", domain: "SAFETY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_CLAMP_TIMEOUT", t("Clamp close timeout alarm bit", "بیت آلارم سررسید بستن گیره"), { subsystem: "FIXTURE", domain: "MECHANICAL", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_CLAMP_DISCREPANCY", t("Clamp discrepancy alarm bit", "بیت آلارم مغایرت گیره"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_PART_NOT_SEATED", t("Part not seated alarm bit", "بیت آلارم ننشستن قطعه"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_WELD_CURRENT_LOW", t("Weld current low alarm bit", "بیت آلارم افت جریان جوش"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_WELD_UNVERIFIED", t("Weld unverified alarm bit", "بیت آلارم صحت‌سنجی‌نشدن جوش"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_TELEMETRY_STALE", t("Weld telemetry stale alarm bit", "بیت آلارم کهنگی تله‌متری جوش"), { subsystem: "WELD_CONTROL", domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_TIP_WEAR_LIMIT", t("Electrode wear limit alarm bit", "بیت آلارم حد سایش الکترود"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_DRESSER_JAM", t("Tip dresser jam alarm bit", "بیت آلارم گیر تراش‌دهنده"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_GUN_DRIVE_TRIP", t("Servo gun trip alarm bit", "بیت آلارم تریپ گان سروو"), { subsystem: "WELD_CONTROL", domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_ROBOT_COMMS_LOSS", t("Robot comms loss alarm bit", "بیت آلارم قطع ارتباط ربات"), { subsystem: "ROBOT_GROUP", domain: "NETWORK", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_ROBOT_CYCLE_TIMEOUT", t("Robot cycle timeout alarm bit", "بیت آلارم سررسید چرخهٔ ربات"), { subsystem: "ROBOT_GROUP", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_CYCLE_DEVIATION", t("Cycle time deviation alarm bit", "بیت آلارم انحراف زمان چرخه"), { attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_WATER_FLOW_LOW", t("Cooling flow low alarm bit", "بیت آلارم افت دبی خنک‌کاری"), { subsystem: "UTILITY", domain: "PROCESS", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_AIR_PRESSURE_LOW", t("Air pressure low alarm bit", "بیت آلارم افت فشار هوا"), { subsystem: "UTILITY", domain: "PROCESS", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_SCHEDULE_MISMATCH", t("Schedule mismatch alarm bit", "بیت آلارم ناهمخوانی برنامهٔ جوش"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_SCHEDULE_CHANGE_BLOCKED", t("Schedule change blocked alarm bit", "بیت آلارم مسدود شدن تغییر برنامه"), { domain: "QUALITY", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_CELL_IN_TEACH", t("Cell in teach alarm bit", "بیت آلارم بودن سلول در حالت آموزش"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("TAG", "ALM_SHUTTLE_DRIVE_TRIP", t("Shuttle drive trip alarm bit", "بیت آلارم تریپ درایو شاتل"), { subsystem: "CONVEY", domain: "DRIVES", attributes: { dataType: "BOOL", accessMode: "READ" } }),

    /* Field channels */
    a.node("IO_POINT", "FS_FENCE_GATE_CLOSED", t("Fence gate fail-safe channel", "کانال ایمنِ‌خطا درِ حصار"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { channelType: "PROFISAFE" },
    }),
    a.node("IO_POINT", "FS_LIGHT_CURTAIN", t("Light curtain fail-safe channel", "کانال ایمنِ‌خطا پردهٔ نوری"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { channelType: "PROFISAFE" },
    }),
    a.node("IO_POINT", "FS_ESTOP_CHAIN", t("Emergency-stop fail-safe channel", "کانال ایمنِ‌خطا توقف اضطراری"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { channelType: "PROFISAFE" },
    }),
    a.node("IO_POINT", "DI_PART_PRESENT_1", t("Part present sensor 1 channel", "کانال سنسور حضور قطعهٔ ۱"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { channelType: "DI" } }),
    a.node("IO_POINT", "DI_CLAMP_A_CLOSED", t("Clamp A closed limit switch", "لیمیت‌سوییچ بسته بودن گیرهٔ A"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { channelType: "DI" } }),
    a.node("IO_POINT", "DI_CLAMP_B_CLOSED", t("Clamp B closed limit switch", "لیمیت‌سوییچ بسته بودن گیرهٔ B"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { channelType: "DI" } }),
    a.node("IO_POINT", "AI_WELD_WATER_FLOW", t("Cooling water flow channel", "کانال دبی آب خنک‌کاری"), { subsystem: "UTILITY", domain: "FIELD_IO", attributes: { channelType: "AI", unit: "l/min" } }),
    a.node("IO_POINT", "AI_AIR_PRESSURE", t("Air pressure channel", "کانال فشار هوا"), { subsystem: "UTILITY", domain: "FIELD_IO", attributes: { channelType: "AI", unit: "bar" } }),
    a.node("IO_POINT", "AI_WELD_CURRENT", t("Weld current measurement channel", "کانال اندازه‌گیری جریان جوش"), { subsystem: "WELD_CONTROL", domain: "FIELD_IO", attributes: { channelType: "AI", unit: "kA" } }),
    a.node("IO_POINT", "DI_GUN_R2_DRIVE_FAULT", t("Servo gun 2 drive fault contact", "کنتاکت خطای درایو گان سروو ۲"), { subsystem: "WELD_CONTROL", domain: "FIELD_IO", attributes: { channelType: "DI" } }),
    a.node("IO_POINT", "DI_DRESSER_BLADE_JAM", t("Tip dresser jam contact", "کنتاکت گیر تراش‌دهنده"), { subsystem: "WELD_CONTROL", domain: "FIELD_IO", attributes: { channelType: "DI" } }),
    a.node("IO_POINT", "PN_R3_LINK", t("Robot 3 PROFINET port", "پورت پروفینت ربات ۳"), { subsystem: "ROBOT_GROUP", domain: "NETWORK", attributes: { channelType: "PROFINET" } }),

    /* Sequences */
    a.node("SEQUENCE", "CELL_CYCLE_SEQUENCE", t("Cell cycle sequence", "توالی چرخهٔ سلول"), {
      description: t(
        "The state machine the sequence block implements. Described here and executed nowhere in this repository.",
        "ماشین حالتی که بلوک توالی پیاده می‌کند. اینجا توصیف می‌شود و در هیچ جای این مخزن اجرا نمی‌شود.",
      ),
    }),
    a.node("STATE", "C00_IDLE", t("Idle", "بی‌کار"), { attributes: { stepNumber: 0 } }),
    a.node("STATE", "C10_BODY_INFEED", t("Body infeed", "ورود بدنه"), { attributes: { stepNumber: 10, stepTimeoutSeconds: 30 } }),
    a.node("STATE", "C20_CLAMP_CLOSE", t("Clamp close", "بستن گیره‌ها"), { attributes: { stepNumber: 20, stepTimeoutSeconds: 15 } }),
    a.node("STATE", "C30_WELD_EXECUTION", t("Weld execution", "اجرای جوش"), { attributes: { stepNumber: 30, stepTimeoutSeconds: 90 } }),
    a.node("STATE", "C40_WELD_VERIFY", t("Weld verification", "صحت‌سنجی جوش"), { attributes: { stepNumber: 40, stepTimeoutSeconds: 20 } }),
    a.node("STATE", "C50_CLAMP_OPEN", t("Clamp open", "باز کردن گیره‌ها"), { attributes: { stepNumber: 50, stepTimeoutSeconds: 15 } }),
    a.node("STATE", "C60_BODY_OUTFEED", t("Body outfeed", "خروج بدنه"), { attributes: { stepNumber: 60, stepTimeoutSeconds: 30 } }),
    a.node("SEQUENCE", "TIP_DRESS_SEQUENCE", t("Electrode dressing sequence", "توالی تراش الکترود"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE" }),
    a.node("STATE", "TD00_READY", t("Dressing ready", "آمادهٔ تراش"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { stepNumber: 0 } }),
    a.node("STATE", "TD10_DRESS", t("Dressing", "در حال تراش"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { stepNumber: 10, stepTimeoutSeconds: 30 } }),
    a.node("STATE", "TD20_MEASURE", t("Electrode measurement", "اندازه‌گیری الکترود"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { stepNumber: 20, stepTimeoutSeconds: 20 } }),
    a.node("STATE", "TD30_COMPLETE", t("Dressing complete", "پایان تراش"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { stepNumber: 30 } }),
    a.node("SEQUENCE", "ALARM_LIFECYCLE", t("ISA-18.2 alarm lifecycle", "چرخهٔ عمر آلارم ISA-18.2"), { domain: "OPERATOR_INTERFACE" }),
    a.node("STATE", "AL00_NORMAL", t("Normal", "عادی"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 0 } }),
    a.node("STATE", "AL10_UNACK_ALARM", t("Unacknowledged alarm", "آلارم تأییدنشده"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 10 } }),
    a.node("STATE", "AL20_ACK_ALARM", t("Acknowledged alarm", "آلارم تأییدشده"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 20 } }),
    a.node("STATE", "AL30_RTN_UNACK", t("Returned to normal, unacknowledged", "بازگشته به عادی، تأییدنشده"), { domain: "OPERATOR_INTERFACE", attributes: { stepNumber: 30 } }),

    /* Permissives */
    a.node("PERMISSIVE", "PRM_SAFETY_GRANTED", t("Safety controller grants motion", "اعطای مجوز حرکت توسط کنترلر ایمنی"), {
      subsystem: "SAFETY_BOUNDARY",
      description: t(
        "Assembled from read-only safety evidence. It is this controller's VIEW of the motion grant, never an instruction to issue one.",
        "از شواهد فقط‌خواندنی ایمنی ساخته می‌شود. این، دیدگاه این کنترلر از مجوز حرکت است، نه دستوری برای صدور آن.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_FIXTURE_READY", t("Body seated and clamped", "نشستن و مهار شدن بدنه"), { subsystem: "FIXTURE", domain: "MECHANICAL" }),
    a.node("PERMISSIVE", "PRM_UTILITY_READY", t("Cooling and air healthy", "سلامت خنک‌کاری و هوا"), { subsystem: "UTILITY", domain: "PROCESS" }),
    a.node("PERMISSIVE", "PRM_SCHEDULE_READY", t("A valid weld schedule is loaded", "بارگذاری یک برنامهٔ جوش معتبر"), { domain: "QUALITY" }),
    a.node("PERMISSIVE", "PRM_ROBOTS_READY", t("Robot group available", "در دسترس بودن گروه ربات‌ها"), { subsystem: "ROBOT_GROUP", domain: "MECHANICAL" }),

    /* Interlocks — read, never written */
    a.node("INTERLOCK", "ILK_SAFETY_STOP", t("Safe stop interlock", "اینترلاک توقف ایمن"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "The declared effect of the safety controller's stop on this cell. Observed only; never reset, inhibited, bypassed or simulated from here.",
        "اثر اعلام‌شدهٔ توقف کنترلر ایمنی بر این سلول. فقط مشاهده می‌شود؛ هرگز از اینجا ریست، غیرفعال، دور زده یا شبیه‌سازی نمی‌شود.",
      ),
    }),
    a.node("INTERLOCK", "ILK_ZONE_NOT_CLEAR", t("Zone not clear interlock", "اینترلاک پاک نبودن ناحیه"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
    }),
    a.node("INTERLOCK", "ILK_CLAMP_NOT_CLOSED", t("Clamp not closed interlock", "اینترلاک بسته نبودن گیره"), {
      subsystem: "FIXTURE",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_UTILITY_NOT_READY", t("Cooling or air interlock", "اینترلاک خنک‌کاری یا هوا"), {
      subsystem: "UTILITY",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_GUN_DRIVE_TRIP", t("Servo gun trip interlock", "اینترلاک تریپ گان سروو"), {
      subsystem: "WELD_CONTROL",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),

    /* Alarms */
    a.node("ALARM", "ALM_SAFETY_STOP_ACTIVE", t("Safe stop active", "فعال بودن توقف ایمن"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_SAFETY_ZONE_NOT_CLEAR", t("Cell zone not clear", "پاک نبودن ناحیهٔ سلول"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_CLAMP_CLOSE_TIMEOUT", t("Clamp did not close in time", "بسته نشدن گیره در زمان مقرر"), { subsystem: "FIXTURE", domain: "MECHANICAL", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_CLAMP_POSITION_DISCREPANCY", t("Clamp reports open and closed", "گزارش هم‌زمان باز و بسته بودن گیره"), {
      subsystem: "FIXTURE",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_PART_NOT_SEATED_CORRECTLY", t("Body not seated correctly", "ننشستن درست بدنه"), { subsystem: "FIXTURE", domain: "FIELD_IO", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_WELD_CURRENT_BELOW_LIMIT", t("Weld current below the schedule band", "افت جریان جوش زیر محدودهٔ برنامه"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_WELD_QUALITY_UNVERIFIED", t("Spot welds unverified", "صحت‌سنجی‌نشدن نقاط جوش"), {
      subsystem: "WELD_CONTROL",
      domain: "QUALITY",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_WELD_TELEMETRY_STALE", t("Weld parameter data stale", "کهنگی دادهٔ پارامترهای جوش"), { subsystem: "WELD_CONTROL", domain: "NETWORK", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_ELECTRODE_WEAR_LIMIT", t("Electrode life limit reached", "رسیدن به حد عمر الکترود"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { alarmPriority: "MEDIUM", requiresAck: true } }),
    a.node("ALARM", "ALM_TIP_DRESSER_JAMMED", t("Tip dresser jammed", "گیر کردن تراش‌دهندهٔ نوک"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_SERVO_GUN_DRIVE_TRIPPED", t("Servo weld gun drive tripped", "تریپ درایو گان جوش سروو"), { subsystem: "WELD_CONTROL", domain: "DRIVES", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_ROBOT_TELEMETRY_LOST", t("Robot telemetry lost", "قطع تله‌متری ربات"), { subsystem: "ROBOT_GROUP", domain: "NETWORK", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_ROBOT_CYCLE_NOT_COMPLETED", t("Robot cycle did not complete", "تکمیل نشدن چرخهٔ ربات"), { subsystem: "ROBOT_GROUP", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_WELD_WATER_FLOW_LOW", t("Gun cooling flow low", "افت دبی خنک‌کاری گان"), {
      subsystem: "UTILITY",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_AIR_SUPPLY_PRESSURE_LOW", t("Compressed air pressure low", "افت فشار هوای فشرده"), { subsystem: "UTILITY", domain: "PROCESS", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_WELD_SCHEDULE_MISMATCH", t("Weld schedule does not match the body", "ناهمخوانی برنامهٔ جوش با بدنه"), { domain: "QUALITY", attributes: { alarmPriority: "HIGH", requiresAck: true } }),
    a.node("ALARM", "ALM_CELL_LEFT_IN_TEACH", t("Cell left in teach mode", "رهاشدن سلول در حالت آموزش"), { domain: "OPERATOR_INTERFACE", attributes: { alarmPriority: "MEDIUM", requiresAck: true } }),
    a.node("ALARM", "ALM_SHUTTLE_DRIVE_TRIPPED", t("Shuttle conveyor drive tripped", "تریپ درایو نوار شاتل"), { subsystem: "CONVEY", domain: "DRIVES", attributes: { alarmPriority: "HIGH", requiresAck: true } }),

    /* Operator surface */
    a.node("SCADA_TAG", "HMI_Cell_State", t("Cell state (panel)", "وضعیت سلول (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Spot_Count", t("Spot count (panel)", "شمار نقاط (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "INT", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Weld_Current", t("Weld current (panel)", "جریان جوش (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "REAL", unit: "kA", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Safety_Granted", t("Safety granted (panel)", "اعطای مجوز ایمنی (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Cell_Running", t("Cell running (panel)", "کارکرد سلول (پنل)"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "BOOL", accessMode: "READ" } }),
    a.node("SCADA_TAG", "HMI_Cycle_Start_Intent", t("Cycle start intent", "قصد شروع چرخه"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "CELL_START", requiresConfirmation: true },
      description: t(
        "A recorded statement that an authorised human asked for a cycle. Engineering metadata: it drives no robot and no gun, and the controller's own permissives decide whether the request is honoured.",
        "ثبت این که یک انسانِ مجاز درخواست چرخه داده است. فرادادهٔ مهندسی: هیچ ربات و هیچ گانی را به حرکت درنمی‌آورد و مجوزهای خود کنترلر تصمیم می‌گیرند که درخواست پذیرفته شود یا نه.",
      ),
    }),
    a.node("SCADA_TAG", "HMI_Schedule_Select_Intent", t("Schedule selection intent", "قصد انتخاب برنامهٔ جوش"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "SCHEDULE_SELECT", requiresConfirmation: true },
    }),
    a.node("SCADA_TAG", "HMI_Tip_Dress_Intent", t("Tip dressing intent", "قصد تراش نوک الکترود"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "TIP_DRESS", requiresConfirmation: true },
    }),
    a.node("SCADA_TAG", "HMI_Alarm_Ack_Cmd", t("Alarm acknowledge command", "فرمان تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "ALARM_ACK", requiresConfirmation: true },
    }),
    a.node("SCADA_TAG", "HMI_Kpi_Published", t("Published KPI snapshot", "تصویر منتشرشدهٔ شاخص‌ها"), { domain: "OPERATOR_INTERFACE", attributes: { dataType: "REAL", accessMode: "READ_WRITE" } }),
    a.node("HMI_SCREEN", "Screen_CellOverview", t("Cell overview", "نمای کلی سلول"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_SCREEN", "Screen_WeldQuality", t("Weld quality", "کیفیت جوش"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_SCREEN", "Screen_Schedule", t("Weld schedule", "برنامهٔ جوش"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_SCREEN", "Screen_Alarms", t("Active alarms", "آلارم‌های فعال"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_OBJECT", "Trend_WeldCurrent", t("Weld current trend", "روند جریان جوش"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_OBJECT", "Ind_SafetyStatus", t("Safety status indicator (read-only)", "نشانگر وضعیت ایمنی (فقط‌خواندنی)"), {
      domain: "OPERATOR_INTERFACE",
      description: t(
        "Displays the safety-controller state. It declares no command: nothing about personnel safety is operable from this panel.",
        "وضعیت کنترلر ایمنی را نمایش می‌دهد. هیچ فرمانی اعلام نمی‌کند: هیچ چیزی دربارهٔ ایمنی افراد از این پنل قابل عملیات نیست.",
      ),
    }),
    a.node("HMI_OBJECT", "Ind_SpotCount", t("Spot count indicator", "نشانگر شمار نقاط"), { domain: "OPERATOR_INTERFACE" }),
    a.node("HMI_OBJECT", "Btn_CycleStart", t("Cycle start button", "دکمهٔ شروع چرخه"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "CELL_START", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Btn_ScheduleSelect", t("Schedule selection button", "دکمهٔ انتخاب برنامهٔ جوش"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "SCHEDULE_SELECT", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Btn_TipDress", t("Tip dressing button", "دکمهٔ تراش نوک الکترود"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "TIP_DRESS", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Banner_ActiveAlarms", t("Active alarm banner", "نوار آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "ALARM_ACK", requiresConfirmation: true },
    }),
    a.node("SCRIPT", "OnCycleStartIntent", t("Cycle start intent handler", "پردازندهٔ قصد شروع چرخه"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "CELL_START" },
    }),
    a.node("SCRIPT", "OnScheduleSelectIntent", t("Schedule selection intent handler", "پردازندهٔ قصد انتخاب برنامهٔ جوش"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "SCHEDULE_SELECT" },
    }),
    a.node("SCRIPT", "OnTipDressIntent", t("Tip dressing intent handler", "پردازندهٔ قصد تراش نوک الکترود"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "TIP_DRESS" },
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
    a.node("ROLE", "Role_CellOperator", t("Cell operator", "اپراتور سلول")),
    a.node("ROLE", "Role_WeldEngineer", t("Weld engineer", "مهندس جوش")),
    a.node("ROLE", "Role_MaintenanceTechnician", t("Maintenance technician", "تکنسین نگهداری")),
    a.node("AUDIT_EVENT_TYPE", "Audit_CycleStartIntentRecorded", t("Cycle start intent recorded", "ثبت قصد شروع چرخه")),
    a.node("AUDIT_EVENT_TYPE", "Audit_ScheduleSelectIntentRecorded", t("Schedule selection intent recorded", "ثبت قصد انتخاب برنامهٔ جوش")),
    a.node("AUDIT_EVENT_TYPE", "Audit_TipDressIntentRecorded", t("Tip dressing intent recorded", "ثبت قصد تراش نوک الکترود")),
    a.node("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged", t("Alarm acknowledged", "تأیید آلارم")),
    a.node("AUDIT_EVENT_TYPE", "Audit_KpiPublishRecord", t("KPI publication record", "رکورد انتشار شاخص‌ها")),

    /* KPI and evidence */
    a.node("KPI", "KPI_BODIES_PRODUCED", t("Bodies produced", "بدنه‌های تولیدشده"), { domain: "PROCESS", attributes: { unit: "bodies", formula: "completed body count per period" } }),
    a.node("KPI", "KPI_SPOT_QUALITY", t("Verified spot quality", "کیفیت نقاط صحت‌سنجی‌شده"), { domain: "QUALITY", attributes: { unit: "%", formula: "verified spots / spots the schedule demands" } }),
    a.node("KPI", "KPI_FIRST_TIME_THROUGH", t("First time through", "عبور بدون بازکاری"), { domain: "QUALITY", attributes: { unit: "%", formula: "fault-free bodies / bodies produced" } }),
    a.node("KPI", "KPI_CYCLE_TIME", t("Cell cycle time", "زمان چرخهٔ سلول"), { domain: "PROCESS", attributes: { unit: "s", formula: "measured cell cycle time per body" } }),
    a.node("KPI", "KPI_SPECIFIC_WELD_ENERGY", t("Weld energy per body", "انرژی جوش به‌ازای هر بدنه"), { domain: "ENERGY", attributes: { unit: "MJ/body", formula: "weld energy / bodies produced" } }),
    a.node("EVIDENCE_SOURCE", "HIST_WELD_PARAMETER_LOG", t("Weld parameter archive", "بایگانی پارامترهای جوش"), { subsystem: "WELD_CONTROL", domain: "QUALITY", attributes: { retentionDays: 3650, sampleIntervalSeconds: 1 } }),
    a.node("EVIDENCE_SOURCE", "HIST_SAFETY_EVENT_LOG", t("Safety controller event log", "گزارش رویدادهای کنترلر ایمنی"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { retentionDays: 3650 },
      description: t(
        "Published by the safety controller. Hermes reads about it; it writes nothing to it and cannot influence what it records.",
        "توسط کنترلر ایمنی منتشر می‌شود. هرمس دربارهٔ آن می‌خواند؛ چیزی در آن نمی‌نویسد و نمی‌تواند بر آنچه ثبت می‌کند اثر بگذارد.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_ROBOT_EVENT_LOG", t("Robot event log", "گزارش رویدادهای ربات"), { subsystem: "ROBOT_GROUP", domain: "MECHANICAL", attributes: { retentionDays: 400 } }),
    a.node("EVIDENCE_SOURCE", "HIST_DRIVE_EVENT_LOG", t("Drive event log", "گزارش رویدادهای درایو"), { domain: "DRIVES", attributes: { retentionDays: 400 } }),
    a.node("EVIDENCE_SOURCE", "HIST_ELECTRODE_LIFE_LOG", t("Electrode life log", "گزارش عمر الکترود"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE", attributes: { retentionDays: 730 } }),
    a.node("EVIDENCE_SOURCE", "HIST_CPU_DIAGNOSTIC_BUFFER", t("CPU diagnostic buffer", "بافر تشخیصی پردازنده"), { domain: "NETWORK", attributes: { retentionDays: 90 } }),
    a.node("EVIDENCE_SOURCE", "HIST_SCHEDULE_AUDIT_LOG", t("Weld schedule audit log", "گزارش ممیزی برنامهٔ جوش"), { domain: "QUALITY", attributes: { retentionDays: 1825 } }),
    a.node("EVIDENCE_SOURCE", "HIST_OPERATOR_AUDIT_LOG", t("Operator audit log", "گزارش ممیزی اپراتور"), { domain: "OPERATOR_INTERFACE", attributes: { retentionDays: 1825 } }),
    a.node("EVIDENCE_SOURCE", "HIST_UTILITY_TREND", t("Cooling and air trend archive", "بایگانی روند خنک‌کاری و هوا"), { subsystem: "UTILITY", domain: "MAINTENANCE", attributes: { retentionDays: 400, sampleIntervalSeconds: 10 } }),

    /* Fault modes */
    a.node("FAULT_MODE", "FM_PART_PRESENT_SENSOR_FAILURE", t("Part present sensor stuck", "گیر کردن سنسور حضور قطعه"), {
      subsystem: "FIXTURE",
      domain: "FIELD_IO",
      attributes: { faultClass: "SENSOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_SAFETY_GATE_INTERLOCK_OPEN", t("Safety controller holding the cell", "نگه‌داشتن سلول توسط کنترلر ایمنی"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { faultClass: "INTERLOCK_ACTIVE", subsystem: "SAFETY_CIRCUIT" },
    }),
    a.node("FAULT_MODE", "FM_WELD_UTILITY_SUPPLY_LOST", t("Gun cooling or clamp air supply lost", "از دست رفتن خنک‌کاری گان یا تأمین هوای گیره"), {
      subsystem: "UTILITY",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "PERMISSIVE_MISSING", subsystem: "PROCESS" },
      description: t(
        "The utility permissive covers both supplies because the weld request depends on both. Which one failed is what the evidence has to separate.",
        "مجوز یوتیلیتی هر دو تأمین را پوشش می‌دهد، چون درخواست جوش به هر دو وابسته است. اینکه کدام‌یک از کار افتاده، همان چیزی است که شواهد باید از هم جدا کند.",
      ),
    }),
    a.node("FAULT_MODE", "FM_SHUTTLE_DRIVE_TRIP", t("Shuttle conveyor drive tripped", "تریپ درایو نوار شاتل"), {
      subsystem: "CONVEY",
      domain: "DRIVES",
      attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
      description: t(
        "The second drive fault in this cell. It shares an evidence source with the servo gun trip, so the two are separated by which drive actually reports the fault, not by which alarm arrived first.",
        "دومین خطای درایو در این سلول. با تریپ گان سروو یک منبع شاهد مشترک دارد، بنابراین این دو با اینکه کدام درایو واقعاً خطا گزارش می‌کند از هم جدا می‌شوند، نه با اینکه کدام آلارم زودتر رسیده است.",
      ),
    }),
    a.node("FAULT_MODE", "FM_SERVO_GUN_DRIVE_TRIP", t("Servo weld gun drive tripped", "تریپ درایو گان جوش سروو"), {
      subsystem: "WELD_CONTROL",
      domain: "DRIVES",
      attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
    }),
    a.node("FAULT_MODE", "FM_ROBOT_PROFINET_LOSS", t("Robot telemetry lost", "قطع تله‌متری ربات"), {
      subsystem: "ROBOT_GROUP",
      domain: "NETWORK",
      attributes: { faultClass: "COMMUNICATION_LOSS", subsystem: "NETWORK" },
      description: t(
        "The arm's picture froze. What the robot is actually doing is unknown, and unknown is never reported as ready.",
        "تصویر بازو منجمد شد. اینکه ربات واقعاً چه می‌کند نامعلوم است و نامعلوم هرگز آماده گزارش نمی‌شود.",
      ),
    }),
    a.node("FAULT_MODE", "FM_ROBOT_CYCLE_TIMEOUT", t("Robot cycle never reported complete", "گزارش‌نشدن پایان چرخهٔ ربات"), {
      subsystem: "ROBOT_GROUP",
      attributes: { faultClass: "SEQUENCE_TIMEOUT", subsystem: "PLC_LOGIC" },
    }),
    a.node("FAULT_MODE", "FM_ELECTRODE_WEAR_CURRENT_DECAY", t("Electrode wear pulling the weld current down", "افت جریان جوش بر اثر سایش الکترود"), {
      subsystem: "WELD_CONTROL",
      domain: "PROCESS",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "PROCESS" },
      description: t(
        "A mushroomed electrode spreads the contact area, the current density falls and the nugget shrinks while every setpoint still looks correct.",
        "الکترودِ پهن‌شده سطح تماس را گسترده می‌کند، چگالی جریان افت می‌کند و دکمهٔ جوش کوچک می‌شود، در حالی که همهٔ نقاط تنظیم هنوز درست به نظر می‌رسند.",
      ),
    }),
    a.node("FAULT_MODE", "FM_WELD_SCHEDULE_VARIANT_MISMATCH", t("Loaded schedule is not this body's", "ناهمخوانی برنامهٔ بارگذاری‌شده با این بدنه"), {
      domain: "QUALITY",
      attributes: { faultClass: "RECIPE_MISMATCH", subsystem: "RECIPE_CONFIG" },
    }),
    a.node("FAULT_MODE", "FM_CLAMP_VALVE_FAILURE", t("Clamp valve failed to stroke", "ناتوانی شیر گیره در جابه‌جایی"), {
      subsystem: "FIXTURE",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "ACTUATOR_FAILURE", subsystem: "MECHANICAL" },
    }),
    a.node("FAULT_MODE", "FM_TIP_DRESSER_JAM", t("Tip dresser obstructed", "انسداد تراش‌دهندهٔ نوک"), {
      subsystem: "WELD_CONTROL",
      domain: "MAINTENANCE",
      attributes: { faultClass: "BLOCKAGE", subsystem: "MECHANICAL" },
    }),
    a.node("FAULT_MODE", "FM_CELL_LEFT_IN_TEACH", t("Cell left in teach mode", "رهاشدن سلول در حالت آموزش"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { faultClass: "INCORRECT_MODE", subsystem: "HMI" },
    }),
    a.node("FAULT_MODE", "FM_WELD_TELEMETRY_STALE", t("Weld parameter record froze", "منجمد شدن رکورد پارامترهای جوش"), {
      subsystem: "WELD_CONTROL",
      domain: "NETWORK",
      attributes: { faultClass: "STALE_TELEMETRY", subsystem: "TELEMETRY" },
      description: t(
        "Every spot in this cycle was made, and none of them was measured. A completed cycle is not evidence of a good weld.",
        "همهٔ نقاط این چرخه زده شده‌اند و هیچ‌یک اندازه‌گیری نشده است. تکمیل شدن چرخه شاهدی بر خوب بودن جوش نیست.",
      ),
    }),

    /* Safe actions */
    a.node("SAFE_ACTION", "SA_VERIFY_PART_PRESENT_SENSOR_AGAINST_FIXTURE", t("Check the part-present sensor against an empty fixture", "بررسی سنسور حضور قطعه در برابر فیکسچر خالی"), { subsystem: "FIXTURE", domain: "FIELD_IO" }),
    a.node("SAFE_ACTION", "SA_ESCALATE_SAFETY_INTERLOCK_REVIEW", t("Escalate to a safety-interlock review", "ارجاع به بازبینی اینترلاک ایمنی"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "Escalate-only, to the cell safety engineer. The stop is not reset, no guard lock is released, no light curtain is muted and no robot is enabled from here or from anywhere else in Hermes.",
        "فقط ارجاع، به مهندس ایمنی سلول. توقف ریست نمی‌شود، هیچ قفل نگهبانی آزاد نمی‌شود، هیچ پردهٔ نوری بی‌اثر نمی‌شود و هیچ رباتی از اینجا یا هیچ جای دیگر هرمس مجاز به حرکت نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_WELD_UTILITY_REVIEW", t("Escalate a gun cooling and air supply review", "ارجاع بازبینی خنک‌کاری گان و تأمین هوا"), {
      subsystem: "UTILITY",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("SAFE_ACTION", "SA_READ_SHUTTLE_DRIVE_FAULT_HISTORY", t("Read the shuttle drive fault history", "خواندن تاریخچهٔ خطای درایو شاتل"), { subsystem: "CONVEY", domain: "DRIVES" }),
    a.node("SAFE_ACTION", "SA_READ_SERVO_GUN_DRIVE_FAULT_HISTORY", t("Read the servo gun drive fault history", "خواندن تاریخچهٔ خطای درایو گان سروو"), { subsystem: "WELD_CONTROL", domain: "DRIVES" }),
    a.node("SAFE_ACTION", "SA_VERIFY_ROBOT_LINK_AND_CPU_DIAGNOSTICS", t("Verify the robot link and read the CPU diagnostic buffer", "بررسی پیوند ربات و خواندن بافر تشخیصی پردازنده"), { subsystem: "ROBOT_GROUP", domain: "NETWORK" }),
    a.node("SAFE_ACTION", "SA_RECONCILE_ROBOT_CYCLE_AGAINST_SEQUENCE", t("Reconcile the robot cycle against the cell sequence", "تطبیق چرخهٔ ربات با توالی سلول"), { subsystem: "ROBOT_GROUP" }),
    a.node("SAFE_ACTION", "SA_MEASURE_ELECTRODE_AND_REVIEW_WELD_TREND", t("Measure the electrode and review the weld current trend", "اندازه‌گیری الکترود و بازبینی روند جریان جوش"), { subsystem: "WELD_CONTROL", domain: "QUALITY" }),
    a.node("SAFE_ACTION", "SA_REVIEW_WELD_SCHEDULE_AGAINST_BODY_VARIANT", t("Review the weld schedule against the body variant", "بازبینی برنامهٔ جوش در برابر واریانت بدنه"), { domain: "QUALITY" }),
    a.node("SAFE_ACTION", "SA_INSPECT_CLAMP_VALVE_AND_LIMIT_SWITCHES", t("Inspect the clamp valve and both limit switches", "بازرسی شیر گیره و هر دو لیمیت‌سوییچ"), {
      subsystem: "FIXTURE",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_TIP_DRESSER_FOR_OBSTRUCTION", t("Inspect the tip dresser for an obstruction", "بازرسی تراش‌دهندهٔ نوک از نظر انسداد"), { subsystem: "WELD_CONTROL", domain: "MAINTENANCE" }),
    a.node("SAFE_ACTION", "SA_REVIEW_OPERATOR_AUDIT_LOG_FOR_MODE_CHANGE", t("Review the operator audit log for the mode change", "بازبینی گزارش ممیزی اپراتور برای تغییر حالت"), { domain: "OPERATOR_INTERFACE" }),
    a.node("SAFE_ACTION", "SA_VERIFY_WELD_PARAMETER_LOGGING_PATH", t("Verify the weld parameter logging path end to end", "بررسی پایان‌به‌پایان مسیر ثبت پارامترهای جوش"), { subsystem: "WELD_CONTROL", domain: "NETWORK" }),
  ],
  edges: [
    /* ── SCL-derived relationships ───────────────────────────────────────── */

    /* OB_STARTUP */
    a.edge(B.obStartup, T.alarmWord, "WRITES"),
    a.edge(B.obStartup, T.cellRunning, "WRITES"),
    a.edge(B.obStartup, T.clampCloseCmd, "WRITES"),
    a.edge(B.obStartup, T.restartReview, "WRITES"),
    a.edge(B.obStartup, T.scheduleLocked, "WRITES"),
    a.edge(B.obStartup, T.seqStep, "WRITES"),
    a.edge(B.obStartup, T.spotCountCycle, "WRITES"),
    a.edge(B.obStartup, T.spotsVerified, "WRITES"),
    a.edge(B.obStartup, T.weldEnable, "WRITES"),

    /* OB_MAIN */
    a.edge(B.obMain, B.fbFixture, "CALLS"),
    a.edge(B.obMain, B.fbRobot, "CALLS"),
    a.edge(B.obMain, B.fbSafety, "CALLS"),
    a.edge(B.obMain, B.fbSequence, "CALLS"),
    a.edge(B.obMain, B.fbTip, "CALLS"),
    a.edge(B.obMain, B.fbVariant, "CALLS"),
    a.edge(B.obMain, B.fbWeld, "CALLS"),
    a.edge(B.obMain, B.fcKpi, "CALLS"),
    a.edge(B.obMain, B.fcUtility, "CALLS"),

    /* FB_SAFETY_STATUS */
    a.edge(B.fbSafety, T.curtainIntact, "READS"),
    a.edge(B.fbSafety, T.estopHealthy, "READS"),
    a.edge(B.fbSafety, T.gateClosed, "READS"),
    a.edge(B.fbSafety, T.gateLocked, "READS"),
    a.edge(B.fbSafety, T.motionEnable, "READS"),
    a.edge(B.fbSafety, T.safeStopActive, "READS"),
    a.edge(B.fbSafety, T.safetyAckRequired, "READS"),
    a.edge(B.fbSafety, T.zoneClear, "READS"),
    a.edge(B.fbSafety, P.safetyGranted, "WRITES"),
    a.edge(B.fbSafety, T.almSafetyStop, "WRITES"),
    a.edge(B.fbSafety, T.almZoneNotClear, "WRITES"),
    a.edge(B.fbSafety, T.cellRunning, "WRITES"),
    a.edge(B.fbSafety, T.restartReview, "WRITES"),
    a.edge(B.fbSafety, T.weldEnable, "WRITES"),

    /* FB_FIXTURE_CONTROL */
    a.edge(B.fbFixture, T.clampAClosedFb, "READS"),
    a.edge(B.fbFixture, T.clampAOpenFb, "READS"),
    a.edge(B.fbFixture, T.clampBClosedFb, "READS"),
    a.edge(B.fbFixture, T.clampBOpenFb, "READS"),
    a.edge(B.fbFixture, T.clampCloseCmd, "READS"),
    a.edge(B.fbFixture, T.clampsClosedAll, "READS"),
    a.edge(B.fbFixture, T.geoPinEngaged, "READS"),
    a.edge(B.fbFixture, T.partPresent1, "READS"),
    a.edge(B.fbFixture, T.partPresent2, "READS"),
    a.edge(B.fbFixture, T.partSeatedOk, "READS"),
    a.edge(B.fbFixture, T.shuttleInPosition, "READS"),
    a.edge(B.fbFixture, P.fixtureReady, "WRITES"),
    a.edge(B.fbFixture, T.almClampTimeout, "WRITES"),
    a.edge(B.fbFixture, T.almPartNotSeated, "WRITES"),
    a.edge(B.fbFixture, T.clampsClosedAll, "WRITES"),
    a.edge(B.fbFixture, T.partSeatedOk, "WRITES"),

    /* FB_VARIANT_MANAGEMENT */
    a.edge(B.fbVariant, B.dbSchedule, "READS"),
    a.edge(B.fbVariant, T.cellRunning, "READS"),
    a.edge(B.fbVariant, T.scheduleChangeRequest, "READS"),
    a.edge(B.fbVariant, T.scheduleChecksumAct, "READS"),
    a.edge(B.fbVariant, T.scheduleChecksumOk, "READS"),
    a.edge(B.fbVariant, T.scheduleIdLoaded, "READS"),
    a.edge(B.fbVariant, T.scheduleLocked, "READS"),
    a.edge(B.fbVariant, T.scheduleMatches, "READS"),
    a.edge(B.fbVariant, T.scheduleValid, "READS"),
    a.edge(B.fbVariant, T.spotCountCycle, "READS"),
    a.edge(B.fbVariant, T.variantIdAct, "READS"),
    a.edge(B.fbVariant, T.variantSelected, "READS"),
    a.edge(B.fbVariant, P.scheduleReady, "WRITES"),
    a.edge(B.fbVariant, T.almScheduleChangeBlocked, "WRITES"),
    a.edge(B.fbVariant, T.almScheduleMismatch, "WRITES"),
    a.edge(B.fbVariant, T.scheduleChangeReview, "WRITES"),
    a.edge(B.fbVariant, T.scheduleChecksumOk, "WRITES"),
    a.edge(B.fbVariant, T.scheduleLocked, "WRITES"),
    a.edge(B.fbVariant, T.scheduleMatches, "WRITES"),
    a.edge(B.fbVariant, T.scheduleValid, "WRITES"),
    a.edge(B.fbVariant, T.spotTargetCount, "WRITES"),

    /* FB_ROBOT_COORDINATION */
    a.edge(B.fbRobot, P.safetyGranted, "READS"),
    a.edge(B.fbRobot, T.cellRunning, "READS"),
    a.edge(B.fbRobot, T.r1Ready, "READS"),
    a.edge(B.fbRobot, T.r2Ready, "READS"),
    a.edge(B.fbRobot, T.r3LinkOk, "READS"),
    a.edge(B.fbRobot, T.r3Ready, "READS"),
    a.edge(B.fbRobot, T.r3TelemetryAge, "READS"),
    a.edge(B.fbRobot, T.r4Ready, "READS"),
    a.edge(B.fbRobot, T.robotCycleDone, "READS"),
    a.edge(B.fbRobot, T.robotsAtHome, "READS"),
    a.edge(B.fbRobot, T.robotsReadyAll, "READS"),
    a.edge(B.fbRobot, P.robotsReady, "WRITES"),
    a.edge(B.fbRobot, T.almRobotCommsLoss, "WRITES"),
    a.edge(B.fbRobot, T.almRobotCycleTimeout, "WRITES"),
    a.edge(B.fbRobot, T.r3DataStale, "WRITES"),
    a.edge(B.fbRobot, T.robotsReadyAll, "WRITES"),

    /* FB_WELD_SUPERVISION */
    a.edge(B.fbWeld, B.fcQuality, "CALLS"),
    a.edge(B.fbWeld, B.dbSchedule, "READS"),
    a.edge(B.fbWeld, P.fixtureReady, "READS"),
    a.edge(B.fbWeld, P.safetyGranted, "READS"),
    a.edge(B.fbWeld, P.scheduleReady, "READS"),
    a.edge(B.fbWeld, P.utilityReady, "READS"),
    a.edge(B.fbWeld, T.gunDriveFault, "READS"),
    a.edge(B.fbWeld, T.gunDriveFaultPrev, "READS"),
    a.edge(B.fbWeld, T.scheduleValid, "READS"),
    a.edge(B.fbWeld, T.weldEnable, "READS"),
    a.edge(B.fbWeld, T.weldTimerFault, "READS"),
    a.edge(B.fbWeld, T.weldTimerReady, "READS"),
    a.edge(B.fbWeld, T.almGunDriveTrip, "WRITES"),
    a.edge(B.fbWeld, T.cellRunning, "WRITES"),
    a.edge(B.fbWeld, T.gunDriveFaultPrev, "WRITES"),
    a.edge(B.fbWeld, T.gunForceRef, "WRITES"),
    a.edge(B.fbWeld, T.weldEnable, "WRITES"),

    /* FB_TIP_MANAGEMENT */
    a.edge(B.fbTip, T.dresserBladeJam, "READS"),
    a.edge(B.fbTip, T.dresserMotorFault, "READS"),
    a.edge(B.fbTip, T.spotCountCycle, "READS"),
    a.edge(B.fbTip, T.tipDressDone, "READS"),
    a.edge(B.fbTip, T.tipWearCount, "READS"),
    a.edge(B.fbTip, T.tipWearLimit, "READS"),
    a.edge(B.fbTip, T.almDresserJam, "WRITES"),
    a.edge(B.fbTip, T.almTipWearLimit, "WRITES"),
    a.edge(B.fbTip, T.tipDressDone, "WRITES"),
    a.edge(B.fbTip, T.tipDressRequest, "WRITES"),
    a.edge(B.fbTip, T.tipWearCount, "WRITES"),
    a.edge(B.fbTip, T.tipWearLimit, "WRITES"),

    /* FB_CELL_SEQUENCE */
    a.edge(B.fbSequence, P.fixtureReady, "READS"),
    a.edge(B.fbSequence, P.robotsReady, "READS"),
    a.edge(B.fbSequence, P.safetyGranted, "READS"),
    a.edge(B.fbSequence, P.scheduleReady, "READS"),
    a.edge(B.fbSequence, P.utilityReady, "READS"),
    a.edge(B.fbSequence, T.clampAOpenFb, "READS"),
    a.edge(B.fbSequence, T.clampBClosedFb, "READS"),
    a.edge(B.fbSequence, T.clampBOpenFb, "READS"),
    a.edge(B.fbSequence, T.modeAuto, "READS"),
    a.edge(B.fbSequence, T.modeRemote, "READS"),
    a.edge(B.fbSequence, T.motionEnable, "READS"),
    a.edge(B.fbSequence, T.partSeatedOk, "READS"),
    a.edge(B.fbSequence, T.restartReview, "READS"),
    a.edge(B.fbSequence, T.robotCycleDone, "READS"),
    a.edge(B.fbSequence, T.safeStopActive, "READS"),
    a.edge(B.fbSequence, T.seqStep, "READS"),
    a.edge(B.fbSequence, T.shuttleDriveFault, "READS"),
    a.edge(B.fbSequence, T.shuttleInPosition, "READS"),
    a.edge(B.fbSequence, T.spotCountCycle, "READS"),
    a.edge(B.fbSequence, T.spotsVerified, "READS"),
    a.edge(B.fbSequence, T.spotTargetCount, "READS"),
    a.edge(B.fbSequence, T.startRequest, "READS"),
    a.edge(B.fbSequence, T.teachActive, "READS"),
    a.edge(B.fbSequence, T.weldConfidenceOk, "READS"),
    a.edge(B.fbSequence, T.almCellInTeach, "WRITES"),
    a.edge(B.fbSequence, T.almClampDiscrepancy, "WRITES"),
    a.edge(B.fbSequence, T.almShuttleDriveTrip, "WRITES"),
    a.edge(B.fbSequence, T.cellRunning, "WRITES"),
    a.edge(B.fbSequence, T.clampCloseCmd, "WRITES"),
    a.edge(B.fbSequence, T.cycleComplete, "WRITES"),
    a.edge(B.fbSequence, T.seqStep, "WRITES"),
    a.edge(B.fbSequence, T.weldEnable, "WRITES"),

    /* FC_UTILITY_VALIDATION */
    a.edge(B.fcUtility, T.airPressureAct, "READS"),
    a.edge(B.fcUtility, T.airPressureOk, "READS"),
    a.edge(B.fcUtility, T.waterFlowAct, "READS"),
    a.edge(B.fcUtility, T.waterFlowOk, "READS"),
    a.edge(B.fcUtility, P.utilityReady, "WRITES"),
    a.edge(B.fcUtility, T.airPressureOk, "WRITES"),
    a.edge(B.fcUtility, T.almAirPressureLow, "WRITES"),
    a.edge(B.fcUtility, T.almWaterFlowLow, "WRITES"),
    a.edge(B.fcUtility, T.waterFlowOk, "WRITES"),

    /* FC_WELD_QUALITY */
    a.edge(B.fcQuality, B.dbConfig, "READS"),
    a.edge(B.fcQuality, B.dbSchedule, "READS"),
    a.edge(B.fcQuality, T.spotsVerified, "READS"),
    a.edge(B.fcQuality, T.weldConfidenceOk, "READS"),
    a.edge(B.fcQuality, T.weldCurrentAct, "READS"),
    a.edge(B.fcQuality, T.weldCurrentOk, "READS"),
    a.edge(B.fcQuality, T.weldDataStale, "READS"),
    a.edge(B.fcQuality, T.weldForceAct, "READS"),
    a.edge(B.fcQuality, T.weldForceOk, "READS"),
    a.edge(B.fcQuality, T.weldLogLinkOk, "READS"),
    a.edge(B.fcQuality, T.weldMeasured, "READS"),
    a.edge(B.fcQuality, T.weldTelemetryAge, "READS"),
    a.edge(B.fcQuality, T.almTelemetryStale, "WRITES"),
    a.edge(B.fcQuality, T.almWeldCurrentLow, "WRITES"),
    a.edge(B.fcQuality, T.almWeldUnverified, "WRITES"),
    a.edge(B.fcQuality, T.spotsVerified, "WRITES"),
    a.edge(B.fcQuality, T.weldConfidenceOk, "WRITES"),
    a.edge(B.fcQuality, T.weldCurrentOk, "WRITES"),
    a.edge(B.fcQuality, T.weldDataStale, "WRITES"),
    a.edge(B.fcQuality, T.weldForceOk, "WRITES"),

    /* FC_CYCLE_TIME */
    a.edge(B.fcCycle, B.dbConfig, "READS"),
    a.edge(B.fcCycle, B.dbSchedule, "READS"),
    a.edge(B.fcCycle, T.cycleTime, "READS"),
    a.edge(B.fcCycle, T.cycleTimeDeviation, "READS"),
    a.edge(B.fcCycle, T.almCycleDeviation, "WRITES"),
    a.edge(B.fcCycle, T.cycleTime, "WRITES"),
    a.edge(B.fcCycle, T.cycleTimeDeviation, "WRITES"),

    /* FC_KPI_CALC */
    a.edge(B.fcKpi, B.fcCycle, "CALLS"),
    a.edge(B.fcKpi, T.bodiesFaultFree, "READS"),
    a.edge(B.fcKpi, T.cycleComplete, "READS"),
    a.edge(B.fcKpi, T.prodCountBodies, "READS"),
    a.edge(B.fcKpi, T.spotsVerified, "READS"),
    a.edge(B.fcKpi, T.spotTargetCount, "READS"),
    a.edge(B.fcKpi, T.weldEnergyTotal, "READS"),
    a.edge(B.fcKpi, T.firstTimeThroughPct, "WRITES"),
    a.edge(B.fcKpi, T.prodCountBodies, "WRITES"),
    a.edge(B.fcKpi, T.specificWeldEnergy, "WRITES"),
    a.edge(B.fcKpi, T.spotQualityPct, "WRITES"),

    /* ── Containment ─────────────────────────────────────────────────────── */

    a.edge(D.cpu, B.obMain, "CONTAINS"),
    a.edge(D.cpu, B.obStartup, "CONTAINS"),
    a.edge(D.cpu, B.fbSafety, "CONTAINS"),
    a.edge(D.cpu, B.fbFixture, "CONTAINS"),
    a.edge(D.cpu, B.fbVariant, "CONTAINS"),
    a.edge(D.cpu, B.fbRobot, "CONTAINS"),
    a.edge(D.cpu, B.fbWeld, "CONTAINS"),
    a.edge(D.cpu, B.fbTip, "CONTAINS"),
    a.edge(D.cpu, B.fbSequence, "CONTAINS"),
    a.edge(D.cpu, B.fcUtility, "CONTAINS"),
    a.edge(D.cpu, B.fcQuality, "CONTAINS"),
    a.edge(D.cpu, B.fcCycle, "CONTAINS"),
    a.edge(D.cpu, B.fcKpi, "CONTAINS"),
    a.edge(D.cpu, B.dbInstance, "CONTAINS"),
    a.edge(D.cpu, B.dbSchedule, "CONTAINS"),
    a.edge(D.cpu, B.dbConfig, "CONTAINS"),
    a.edge(D.cpu, B.dbRobots, "CONTAINS"),
    a.edge(D.cpu, B.dbAlarms, "CONTAINS"),
    a.edge(D.cpu, B.udtRobot, "CONTAINS"),
    a.edge(D.cpu, B.udtSpot, "CONTAINS"),
    a.edge(D.cpu, B.udtSchedule, "CONTAINS"),
    a.edge(D.cpu, B.udtClamp, "CONTAINS"),
    a.edge(D.cpu, B.udtZone, "CONTAINS"),
    a.edge(D.cpu, B.udtSeq, "CONTAINS"),
    a.edge(D.cpu, SQ, "CONTAINS"),
    a.edge(D.io, IO.partPresentDi, "CONTAINS"),
    a.edge(D.io, IO.clampAClosedDi, "CONTAINS"),
    a.edge(D.io, IO.clampBClosedDi, "CONTAINS"),
    a.edge(D.io, IO.waterFlowAi, "CONTAINS"),
    a.edge(D.io, IO.airPressureAi, "CONTAINS"),
    a.edge(D.io, IO.weldCurrentAi, "CONTAINS"),
    a.edge(D.io, IO.gunFaultDi, "CONTAINS"),
    a.edge(D.io, IO.dresserJamDi, "CONTAINS"),
    a.edge(D.safety, IO.gateProfisafe, "CONTAINS"),
    a.edge(D.safety, IO.curtainProfisafe, "CONTAINS"),
    a.edge(D.safety, IO.estopProfisafe, "CONTAINS"),
    a.edge(D.safety, T.zoneClear, "CONTAINS"),
    a.edge(D.safety, T.gateClosed, "CONTAINS"),
    a.edge(D.safety, T.gateLocked, "CONTAINS"),
    a.edge(D.safety, T.curtainIntact, "CONTAINS"),
    a.edge(D.safety, T.estopHealthy, "CONTAINS"),
    a.edge(D.safety, T.safeStopActive, "CONTAINS"),
    a.edge(D.safety, T.motionEnable, "CONTAINS"),
    a.edge(D.safety, T.safetyAckRequired, "CONTAINS"),
    a.edge(D.safety, EV.safetyLog, "CONTAINS"),
    a.edge(D.pnSwitch, IO.r3LinkPn, "CONTAINS"),
    a.edge(D.weldTimer, T.weldCurrentAct, "CONTAINS"),
    a.edge(D.weldTimer, T.weldForceAct, "CONTAINS"),
    a.edge(D.weldTimer, T.weldTimeAct, "CONTAINS"),
    a.edge(D.weldTimer, T.weldMeasured, "CONTAINS"),
    a.edge(D.weldTimer, EV.weldLog, "CONTAINS"),
    a.edge(D.panel, H.overview, "CONTAINS"),
    a.edge(D.panel, H.quality, "CONTAINS"),
    a.edge(D.panel, H.schedule, "CONTAINS"),
    a.edge(D.panel, H.alarms, "CONTAINS"),
    a.edge(D.panel, AQ, "CONTAINS"),
    a.edge(H.overview, HO.safetyStatus, "CONTAINS"),
    a.edge(H.overview, HO.spotCount, "CONTAINS"),
    a.edge(H.overview, HO.startButton, "CONTAINS"),
    a.edge(H.quality, HO.weldTrend, "CONTAINS"),
    a.edge(H.quality, HO.tipDress, "CONTAINS"),
    a.edge(H.schedule, HO.scheduleSelect, "CONTAINS"),
    a.edge(H.alarms, HO.alarmBanner, "CONTAINS"),
    a.edge(SQ, S.idle, "CONTAINS"),
    a.edge(SQ, S.infeed, "CONTAINS"),
    a.edge(SQ, S.clampClose, "CONTAINS"),
    a.edge(SQ, S.weld, "CONTAINS"),
    a.edge(SQ, S.verify, "CONTAINS"),
    a.edge(SQ, S.clampOpen, "CONTAINS"),
    a.edge(SQ, S.outfeed, "CONTAINS"),
    a.edge(TQ, TS.ready, "CONTAINS"),
    a.edge(TQ, TS.dress, "CONTAINS"),
    a.edge(TQ, TS.measure, "CONTAINS"),
    a.edge(TQ, TS.complete, "CONTAINS"),
    a.edge(AQ, AS.normal, "CONTAINS"),
    a.edge(AQ, AS.unack, "CONTAINS"),
    a.edge(AQ, AS.acked, "CONTAINS"),
    a.edge(AQ, AS.rtnUnack, "CONTAINS"),

    /* ── Graph-only engineering structure ────────────────────────────────── */

    /* Field channels */
    a.edge(T.gateClosed, IO.gateProfisafe, "BOUND_TO"),
    a.edge(T.curtainIntact, IO.curtainProfisafe, "BOUND_TO"),
    a.edge(T.estopHealthy, IO.estopProfisafe, "BOUND_TO"),
    a.edge(T.partPresent1, IO.partPresentDi, "BOUND_TO"),
    a.edge(T.clampAClosedFb, IO.clampAClosedDi, "BOUND_TO"),
    a.edge(T.clampBClosedFb, IO.clampBClosedDi, "BOUND_TO"),
    a.edge(T.waterFlowAct, IO.waterFlowAi, "BOUND_TO"),
    a.edge(T.airPressureAct, IO.airPressureAi, "BOUND_TO"),
    a.edge(T.weldCurrentAct, IO.weldCurrentAi, "BOUND_TO"),
    a.edge(T.gunDriveFault, IO.gunFaultDi, "BOUND_TO"),
    a.edge(T.dresserBladeJam, IO.dresserJamDi, "BOUND_TO"),
    a.edge(T.r3LinkOk, IO.r3LinkPn, "BOUND_TO"),

    /* What the tags and devices monitor */
    a.edge(T.partPresent1, EQ.geoFixture, "MONITORS"),
    a.edge(T.partPresent2, EQ.geoFixture, "MONITORS"),
    a.edge(T.geoPinEngaged, EQ.locatingPins, "MONITORS"),
    a.edge(T.partSeatedOk, EQ.geoFixture, "MONITORS"),
    a.edge(T.clampAClosedFb, EQ.clampA, "MONITORS"),
    a.edge(T.clampAOpenFb, EQ.clampA, "MONITORS"),
    a.edge(T.clampBClosedFb, EQ.clampB, "MONITORS"),
    a.edge(T.clampBOpenFb, EQ.clampB, "MONITORS"),
    a.edge(T.clampCloseCmd, EQ.geoFixture, "MONITORS"),
    a.edge(T.shuttleInPosition, EQ.shuttle, "MONITORS"),
    a.edge(T.shuttleSpeedAct, EQ.shuttle, "MONITORS"),
    a.edge(T.shuttleDriveFault, EQ.shuttle, "MONITORS"),
    a.edge(T.r1Ready, EQ.robot1, "MONITORS"),
    a.edge(T.r2Ready, EQ.robot2, "MONITORS"),
    a.edge(T.r3Ready, EQ.robot3, "MONITORS"),
    a.edge(T.r4Ready, EQ.robot4, "MONITORS"),
    a.edge(T.r3DataStale, EQ.robot3, "MONITORS"),
    a.edge(T.robotsAtHome, EQ.robot1, "MONITORS"),
    a.edge(T.robotCycleDone, EQ.robot2, "MONITORS"),
    a.edge(T.weldCurrentAct, EQ.gun2, "MONITORS"),
    a.edge(T.weldForceAct, EQ.gun2, "MONITORS"),
    a.edge(T.weldTimeAct, EQ.gun2, "MONITORS"),
    a.edge(T.gunDriveFault, EQ.gun2, "MONITORS"),
    a.edge(T.gunPositionAct, EQ.gun2, "MONITORS"),
    a.edge(T.gunForceRef, EQ.gun2, "MONITORS"),
    a.edge(T.tipWearCount, EQ.gun2, "MONITORS"),
    a.edge(T.dresserBladeJam, EQ.tipDresser, "MONITORS"),
    a.edge(T.dresserMotorFault, EQ.tipDresser, "MONITORS"),
    a.edge(T.tipDressDone, EQ.tipDresser, "MONITORS"),
    a.edge(T.waterFlowAct, EQ.waterCircuit, "MONITORS"),
    a.edge(T.waterTemp, EQ.waterCircuit, "MONITORS"),
    a.edge(T.airPressureAct, EQ.airSupply, "MONITORS"),
    a.edge(T.gateClosed, EQ.fenceGate, "MONITORS"),
    a.edge(T.gateLocked, EQ.fenceGate, "MONITORS"),
    a.edge(T.curtainIntact, EQ.lightCurtain, "MONITORS"),
    a.edge(T.estopHealthy, EQ.estopChain, "MONITORS"),
    a.edge(D.safety, EQ.fenceGate, "MONITORS"),
    a.edge(D.safety, EQ.lightCurtain, "MONITORS"),
    a.edge(D.safety, EQ.estopChain, "MONITORS"),
    a.edge(D.robotCtrl1, EQ.robot1, "MONITORS"),
    a.edge(D.robotCtrl2, EQ.robot2, "MONITORS"),
    a.edge(D.robotCtrl3, EQ.robot3, "MONITORS"),
    a.edge(D.robotCtrl4, EQ.robot4, "MONITORS"),
    a.edge(D.weldTimer, EQ.gun1, "MONITORS"),
    a.edge(D.weldTimer, EQ.gun2, "MONITORS"),
    a.edge(D.weldTimer, EQ.gun3, "MONITORS"),
    a.edge(D.weldTimer, EQ.gun4, "MONITORS"),
    a.edge(D.vfdShuttle, EQ.shuttle, "MONITORS"),

    /* Sequence chains and gating */
    ...chainStates(a, [S.idle, S.infeed, S.clampClose, S.weld, S.verify, S.clampOpen, S.outfeed]),
    ...chainStates(a, [TS.ready, TS.dress, TS.measure, TS.complete]),
    ...chainStates(a, [AS.normal, AS.unack, AS.acked, AS.rtnUnack]),
    a.edge(
      S.outfeed,
      S.idle,
      "TRANSITIONS_TO",
      t(
        "Outfeed returns the cell to idle, and a safe stop leaves it there",
        "خروج بدنه سلول را به حالت بی‌کار بازمی‌گرداند و توقف ایمن آن را همان‌جا نگه می‌دارد",
      ),
    ),
    a.edge(
      AS.rtnUnack,
      AS.normal,
      "TRANSITIONS_TO",
      t("Acknowledgement of a returned alarm closes the lifecycle", "تأیید آلارمِ بازگشته چرخه را می‌بندد"),
    ),
    a.edge(P.safetyGranted, SQ, "GATES"),
    a.edge(P.scheduleReady, SQ, "GATES"),
    a.edge(P.utilityReady, SQ, "GATES"),
    a.edge(P.robotsReady, SQ, "GATES"),
    a.edge(P.fixtureReady, S.weld, "GATES"),
    a.edge(I.safetyStop, S.weld, "BLOCKS"),
    a.edge(I.zoneNotClear, S.infeed, "BLOCKS"),
    a.edge(I.clampNotClosed, S.weld, "BLOCKS"),
    a.edge(I.utilityNotReady, S.weld, "BLOCKS"),
    a.edge(I.gunDriveTrip, S.weld, "BLOCKS"),

    /* What the permissives and interlocks read */
    a.edge(P.safetyGranted, T.zoneClear, "READS"),
    a.edge(P.safetyGranted, T.gateClosed, "READS"),
    a.edge(P.safetyGranted, T.gateLocked, "READS"),
    a.edge(P.safetyGranted, T.curtainIntact, "READS"),
    a.edge(P.safetyGranted, T.estopHealthy, "READS"),
    a.edge(P.safetyGranted, T.motionEnable, "READS"),
    a.edge(P.safetyGranted, T.safeStopActive, "READS"),
    a.edge(P.fixtureReady, T.partSeatedOk, "READS"),
    a.edge(P.fixtureReady, T.clampsClosedAll, "READS"),
    a.edge(P.fixtureReady, T.shuttleInPosition, "READS"),
    a.edge(P.utilityReady, T.waterFlowOk, "READS"),
    a.edge(P.utilityReady, T.airPressureOk, "READS"),
    a.edge(P.scheduleReady, T.scheduleValid, "READS"),
    a.edge(P.robotsReady, T.robotsReadyAll, "READS"),
    a.edge(P.robotsReady, T.robotsAtHome, "READS"),
    a.edge(I.safetyStop, T.safeStopActive, "READS"),
    a.edge(I.safetyStop, T.motionEnable, "READS"),
    a.edge(I.zoneNotClear, T.zoneClear, "READS"),
    a.edge(I.zoneNotClear, T.curtainIntact, "READS"),
    a.edge(I.clampNotClosed, T.clampsClosedAll, "READS"),
    a.edge(I.clampNotClosed, T.clampBClosedFb, "READS"),
    a.edge(I.utilityNotReady, T.waterFlowOk, "READS"),
    a.edge(I.utilityNotReady, T.airPressureOk, "READS"),
    a.edge(I.gunDriveTrip, T.gunDriveFault, "READS"),

    /* Alarms */
    a.edge(T.almSafetyStop, AL.safetyStop, "RAISES"),
    a.edge(T.safeStopActive, AL.safetyStop, "RAISES"),
    a.edge(T.almZoneNotClear, AL.zoneNotClear, "RAISES"),
    a.edge(T.almClampTimeout, AL.clampTimeout, "RAISES"),
    a.edge(T.almClampDiscrepancy, AL.clampDiscrepancy, "RAISES"),
    a.edge(T.almPartNotSeated, AL.partNotSeated, "RAISES"),
    a.edge(T.almWeldCurrentLow, AL.weldCurrentLow, "RAISES"),
    a.edge(T.almWeldUnverified, AL.weldUnverified, "RAISES"),
    a.edge(T.almTelemetryStale, AL.weldTelemetryStale, "RAISES"),
    a.edge(T.almTipWearLimit, AL.electrodeWear, "RAISES"),
    a.edge(T.almDresserJam, AL.dresserJammed, "RAISES"),
    a.edge(T.almGunDriveTrip, AL.gunDriveTripped, "RAISES"),
    a.edge(T.almRobotCommsLoss, AL.robotTelemetryLost, "RAISES"),
    a.edge(T.almRobotCycleTimeout, AL.robotCycleNotCompleted, "RAISES"),
    a.edge(T.almCycleDeviation, AL.robotCycleNotCompleted, "RAISES"),
    a.edge(T.almWaterFlowLow, AL.waterFlowLow, "RAISES"),
    a.edge(T.almAirPressureLow, AL.airPressureLow, "RAISES"),
    a.edge(T.almScheduleMismatch, AL.scheduleMismatch, "RAISES"),
    a.edge(T.almScheduleChangeBlocked, AL.scheduleMismatch, "RAISES"),
    a.edge(T.almCellInTeach, AL.cellInTeach, "RAISES"),
    a.edge(T.almShuttleDriveTrip, AL.shuttleTripped, "RAISES"),

    /* Operator surface */
    a.edge(ST.cellState, T.seqStep, "MIRRORS"),
    a.edge(ST.spotCount, T.spotCountCycle, "MIRRORS"),
    a.edge(ST.weldCurrent, T.weldCurrentAct, "MIRRORS"),
    a.edge(ST.safetyGranted, T.motionEnable, "MIRRORS"),
    a.edge(ST.cellRunning, T.cellRunning, "MIRRORS"),
    a.edge(H.overview, ST.cellState, "DISPLAYS"),
    a.edge(H.overview, ST.safetyGranted, "DISPLAYS"),
    a.edge(H.overview, ST.cellRunning, "DISPLAYS"),
    a.edge(H.overview, ST.spotCount, "DISPLAYS"),
    a.edge(H.overview, ST.startIntent, "COMMANDS"),
    a.edge(H.overview, H.quality, "NAVIGATES_TO"),
    a.edge(H.overview, H.schedule, "NAVIGATES_TO"),
    a.edge(H.overview, H.alarms, "NAVIGATES_TO"),
    a.edge(H.quality, ST.weldCurrent, "DISPLAYS"),
    a.edge(H.quality, ST.tipDressIntent, "COMMANDS"),
    a.edge(H.quality, H.overview, "NAVIGATES_TO"),
    a.edge(H.schedule, ST.scheduleSelectIntent, "COMMANDS"),
    a.edge(H.schedule, H.overview, "NAVIGATES_TO"),
    a.edge(H.alarms, ST.ackCmd, "COMMANDS"),
    a.edge(H.alarms, H.overview, "NAVIGATES_TO"),
    a.edge(HO.weldTrend, ST.weldCurrent, "DISPLAYS"),
    a.edge(HO.safetyStatus, ST.safetyGranted, "DISPLAYS"),
    a.edge(HO.spotCount, ST.spotCount, "DISPLAYS"),
    a.edge(HO.startButton, ST.startIntent, "COMMANDS"),
    a.edge(HO.scheduleSelect, ST.scheduleSelectIntent, "COMMANDS"),
    a.edge(HO.tipDress, ST.tipDressIntent, "COMMANDS"),
    a.edge(HO.alarmBanner, ST.ackCmd, "COMMANDS"),
    a.edge(SC.startIntent, ST.cellState, "READS"),
    a.edge(SC.startIntent, ST.safetyGranted, "READS"),
    a.edge(SC.startIntent, ST.startIntent, "WRITES"),
    a.edge(SC.scheduleIntent, ST.cellRunning, "READS"),
    a.edge(SC.scheduleIntent, ST.scheduleSelectIntent, "WRITES"),
    a.edge(SC.tipDressIntent, ST.spotCount, "READS"),
    a.edge(SC.tipDressIntent, ST.tipDressIntent, "WRITES"),
    a.edge(SC.alarmAck, ST.ackCmd, "WRITES"),
    a.edge(SC.kpiPublish, ST.cellRunning, "READS"),
    a.edge(SC.kpiPublish, ST.kpiPublished, "WRITES"),
    a.edge(SC.startIntent, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.startIntent, AE.startIntent, "EMITS"),
    a.edge(SC.scheduleIntent, R.weldEngineer, "REQUIRES_ROLE"),
    a.edge(SC.scheduleIntent, AE.scheduleIntent, "EMITS"),
    a.edge(SC.tipDressIntent, R.technician, "REQUIRES_ROLE"),
    a.edge(SC.tipDressIntent, AE.tipDressIntent, "EMITS"),
    a.edge(SC.alarmAck, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.alarmAck, AE.alarmAck, "EMITS"),
    // No REQUIRES_ROLE: nothing human invokes the publication routine.
    a.edge(SC.kpiPublish, AE.kpiRecord, "EMITS"),

    /* Historian and KPI */
    a.edge(EV.weldLog, T.weldCurrentAct, "RECORDS"),
    a.edge(EV.weldLog, T.weldForceAct, "RECORDS"),
    a.edge(EV.weldLog, T.weldTimeAct, "RECORDS"),
    a.edge(EV.weldLog, T.weldMeasured, "RECORDS"),
    a.edge(EV.weldLog, T.spotsVerified, "RECORDS"),
    a.edge(EV.safetyLog, T.safeStopActive, "RECORDS"),
    a.edge(EV.safetyLog, T.gateClosed, "RECORDS"),
    a.edge(EV.safetyLog, T.curtainIntact, "RECORDS"),
    a.edge(EV.safetyLog, T.motionEnable, "RECORDS"),
    a.edge(EV.robotLog, T.robotCycleDone, "RECORDS"),
    a.edge(EV.robotLog, T.r3Ready, "RECORDS"),
    a.edge(EV.robotLog, T.cycleTime, "RECORDS"),
    a.edge(EV.driveLog, T.gunDriveFault, "RECORDS"),
    a.edge(EV.driveLog, T.gunPositionAct, "RECORDS"),
    a.edge(EV.driveLog, T.shuttleDriveFault, "RECORDS"),
    a.edge(EV.driveLog, T.shuttleSpeedAct, "RECORDS"),
    a.edge(EV.electrodeLog, T.tipWearCount, "RECORDS"),
    a.edge(EV.electrodeLog, T.tipDressDone, "RECORDS"),
    a.edge(EV.electrodeLog, T.dresserBladeJam, "RECORDS"),
    a.edge(EV.cpuDiagnostics, T.r3LinkOk, "RECORDS"),
    a.edge(EV.cpuDiagnostics, T.r3TelemetryAge, "RECORDS"),
    a.edge(EV.cpuDiagnostics, T.partPresent1, "RECORDS"),
    a.edge(EV.scheduleAuditLog, T.scheduleChecksumAct, "RECORDS"),
    a.edge(EV.scheduleAuditLog, T.scheduleChangeRequest, "RECORDS"),
    a.edge(EV.scheduleAuditLog, T.scheduleIdLoaded, "RECORDS"),
    a.edge(EV.operatorAuditLog, T.teachActive, "RECORDS"),
    a.edge(EV.operatorAuditLog, T.modeRemote, "RECORDS"),
    a.edge(EV.utilityTrend, T.waterFlowAct, "RECORDS"),
    a.edge(EV.utilityTrend, T.waterTemp, "RECORDS"),
    a.edge(EV.utilityTrend, T.airPressureAct, "RECORDS"),
    a.edge(K.bodies, T.prodCountBodies, "DERIVED_FROM"),
    a.edge(K.spotQuality, T.spotQualityPct, "DERIVED_FROM"),
    a.edge(K.spotQuality, T.spotsVerified, "DERIVED_FROM"),
    a.edge(K.firstTimeThrough, T.firstTimeThroughPct, "DERIVED_FROM"),
    a.edge(K.firstTimeThrough, T.bodiesFaultFree, "DERIVED_FROM"),
    a.edge(K.cycleTime, T.cycleTime, "DERIVED_FROM"),
    a.edge(K.cycleTime, T.cycleTimeDeviation, "DERIVED_FROM"),
    a.edge(K.weldEnergy, T.specificWeldEnergy, "DERIVED_FROM"),
    a.edge(K.weldEnergy, T.weldEnergyTotal, "DERIVED_FROM"),

    /* Fault modes */
    a.edge(FM.partSensor, AL.partNotSeated, "EXPLAINS"),
    a.edge(T.partPresent1, FM.partSensor, "EVIDENCE_FOR"),
    a.edge(T.partPresent2, FM.partSensor, "EVIDENCE_FOR"),
    a.edge(T.partSeatedOk, FM.partSensor, "EVIDENCE_FOR"),
    a.edge(T.almPartNotSeated, FM.partSensor, "EVIDENCE_FOR"),
    a.edge(IO.partPresentDi, FM.partSensor, "EVIDENCE_FOR"),
    a.edge(EV.cpuDiagnostics, FM.partSensor, "EVIDENCE_FOR"),

    a.edge(FM.safetyGate, AL.safetyStop, "EXPLAINS"),
    a.edge(FM.safetyGate, AL.zoneNotClear, "EXPLAINS"),
    a.edge(T.safeStopActive, FM.safetyGate, "EVIDENCE_FOR"),
    a.edge(T.gateClosed, FM.safetyGate, "EVIDENCE_FOR"),
    a.edge(T.motionEnable, FM.safetyGate, "EVIDENCE_FOR"),
    a.edge(T.zoneClear, FM.safetyGate, "EVIDENCE_FOR"),
    a.edge(T.almSafetyStop, FM.safetyGate, "EVIDENCE_FOR"),
    a.edge(I.safetyStop, FM.safetyGate, "EVIDENCE_FOR"),
    a.edge(I.zoneNotClear, FM.safetyGate, "EVIDENCE_FOR"),
    a.edge(EV.safetyLog, FM.safetyGate, "EVIDENCE_FOR"),

    a.edge(FM.utilityLost, AL.waterFlowLow, "EXPLAINS"),
    a.edge(FM.utilityLost, AL.airPressureLow, "EXPLAINS"),
    a.edge(T.waterFlowAct, FM.utilityLost, "EVIDENCE_FOR"),
    a.edge(T.waterFlowOk, FM.utilityLost, "EVIDENCE_FOR"),
    a.edge(T.waterTemp, FM.utilityLost, "EVIDENCE_FOR"),
    a.edge(T.almWaterFlowLow, FM.utilityLost, "EVIDENCE_FOR"),
    a.edge(T.airPressureAct, FM.utilityLost, "EVIDENCE_FOR"),
    a.edge(T.airPressureOk, FM.utilityLost, "EVIDENCE_FOR"),
    a.edge(P.utilityReady, FM.utilityLost, "EVIDENCE_FOR"),
    a.edge(I.utilityNotReady, FM.utilityLost, "EVIDENCE_FOR"),
    a.edge(EV.utilityTrend, FM.utilityLost, "EVIDENCE_FOR"),

    a.edge(FM.gunDriveTrip, AL.gunDriveTripped, "EXPLAINS"),
    a.edge(T.gunDriveFault, FM.gunDriveTrip, "EVIDENCE_FOR"),
    a.edge(T.gunPositionAct, FM.gunDriveTrip, "EVIDENCE_FOR"),
    a.edge(T.almGunDriveTrip, FM.gunDriveTrip, "EVIDENCE_FOR"),
    a.edge(T.cellRunning, FM.gunDriveTrip, "EVIDENCE_FOR"),
    a.edge(I.gunDriveTrip, FM.gunDriveTrip, "EVIDENCE_FOR"),
    a.edge(IO.gunFaultDi, FM.gunDriveTrip, "EVIDENCE_FOR"),
    a.edge(EV.driveLog, FM.gunDriveTrip, "EVIDENCE_FOR"),

    a.edge(FM.shuttleDriveTrip, AL.shuttleTripped, "EXPLAINS"),
    a.edge(T.shuttleDriveFault, FM.shuttleDriveTrip, "EVIDENCE_FOR"),
    a.edge(T.shuttleSpeedAct, FM.shuttleDriveTrip, "EVIDENCE_FOR"),
    a.edge(T.almShuttleDriveTrip, FM.shuttleDriveTrip, "EVIDENCE_FOR"),
    a.edge(T.shuttleInPosition, FM.shuttleDriveTrip, "EVIDENCE_FOR"),
    a.edge(T.cellRunning, FM.shuttleDriveTrip, "EVIDENCE_FOR"),
    a.edge(EV.driveLog, FM.shuttleDriveTrip, "EVIDENCE_FOR"),

    a.edge(FM.robotComms, AL.robotTelemetryLost, "EXPLAINS"),
    a.edge(T.r3LinkOk, FM.robotComms, "EVIDENCE_FOR"),
    a.edge(T.r3TelemetryAge, FM.robotComms, "EVIDENCE_FOR"),
    a.edge(T.r3DataStale, FM.robotComms, "EVIDENCE_FOR"),
    a.edge(T.r3Ready, FM.robotComms, "EVIDENCE_FOR"),
    a.edge(T.almRobotCommsLoss, FM.robotComms, "EVIDENCE_FOR"),
    a.edge(T.robotsReadyAll, FM.robotComms, "EVIDENCE_FOR"),
    a.edge(IO.r3LinkPn, FM.robotComms, "EVIDENCE_FOR"),
    a.edge(EV.cpuDiagnostics, FM.robotComms, "EVIDENCE_FOR"),

    a.edge(FM.robotCycleTimeout, AL.robotCycleNotCompleted, "EXPLAINS"),
    a.edge(T.robotCycleDone, FM.robotCycleTimeout, "EVIDENCE_FOR"),
    a.edge(T.almRobotCycleTimeout, FM.robotCycleTimeout, "EVIDENCE_FOR"),
    a.edge(T.cycleTimeDeviation, FM.robotCycleTimeout, "EVIDENCE_FOR"),
    a.edge(T.almCycleDeviation, FM.robotCycleTimeout, "EVIDENCE_FOR"),
    a.edge(T.spotCountCycle, FM.robotCycleTimeout, "EVIDENCE_FOR"),
    a.edge(T.spotTargetCount, FM.robotCycleTimeout, "EVIDENCE_FOR"),
    a.edge(T.seqStep, FM.robotCycleTimeout, "EVIDENCE_FOR"),
    a.edge(EV.robotLog, FM.robotCycleTimeout, "EVIDENCE_FOR"),

    a.edge(FM.electrodeWear, AL.weldCurrentLow, "EXPLAINS"),
    a.edge(FM.electrodeWear, AL.electrodeWear, "EXPLAINS"),
    a.edge(T.weldCurrentAct, FM.electrodeWear, "EVIDENCE_FOR"),
    a.edge(T.weldCurrentOk, FM.electrodeWear, "EVIDENCE_FOR"),
    a.edge(T.almWeldCurrentLow, FM.electrodeWear, "EVIDENCE_FOR"),
    a.edge(T.tipWearCount, FM.electrodeWear, "EVIDENCE_FOR"),
    a.edge(T.tipWearLimit, FM.electrodeWear, "EVIDENCE_FOR"),
    a.edge(T.almTipWearLimit, FM.electrodeWear, "EVIDENCE_FOR"),
    a.edge(T.spotQualityPct, FM.electrodeWear, "EVIDENCE_FOR"),
    a.edge(EV.electrodeLog, FM.electrodeWear, "EVIDENCE_FOR"),

    a.edge(FM.scheduleMismatch, AL.scheduleMismatch, "EXPLAINS"),
    a.edge(T.scheduleMatches, FM.scheduleMismatch, "EVIDENCE_FOR"),
    a.edge(T.scheduleIdLoaded, FM.scheduleMismatch, "EVIDENCE_FOR"),
    a.edge(T.variantIdAct, FM.scheduleMismatch, "EVIDENCE_FOR"),
    a.edge(T.scheduleValid, FM.scheduleMismatch, "EVIDENCE_FOR"),
    a.edge(T.almScheduleMismatch, FM.scheduleMismatch, "EVIDENCE_FOR"),
    a.edge(T.variantSelected, FM.scheduleMismatch, "EVIDENCE_FOR"),
    a.edge(EV.scheduleAuditLog, FM.scheduleMismatch, "EVIDENCE_FOR"),

    a.edge(FM.clampValve, AL.clampDiscrepancy, "EXPLAINS"),
    a.edge(FM.clampValve, AL.clampTimeout, "EXPLAINS"),
    a.edge(T.clampBOpenFb, FM.clampValve, "EVIDENCE_FOR"),
    a.edge(T.clampBClosedFb, FM.clampValve, "EVIDENCE_FOR"),
    a.edge(T.almClampDiscrepancy, FM.clampValve, "EVIDENCE_FOR"),
    a.edge(T.almClampTimeout, FM.clampValve, "EVIDENCE_FOR"),
    a.edge(T.clampsClosedAll, FM.clampValve, "EVIDENCE_FOR"),
    a.edge(I.clampNotClosed, FM.clampValve, "EVIDENCE_FOR"),
    a.edge(IO.clampBClosedDi, FM.clampValve, "EVIDENCE_FOR"),
    a.edge(EV.driveLog, FM.clampValve, "EVIDENCE_FOR"),

    a.edge(FM.dresserJam, AL.dresserJammed, "EXPLAINS"),
    a.edge(T.dresserBladeJam, FM.dresserJam, "EVIDENCE_FOR"),
    a.edge(T.dresserMotorFault, FM.dresserJam, "EVIDENCE_FOR"),
    a.edge(T.almDresserJam, FM.dresserJam, "EVIDENCE_FOR"),
    a.edge(T.tipDressDone, FM.dresserJam, "EVIDENCE_FOR"),
    a.edge(T.tipDressRequest, FM.dresserJam, "EVIDENCE_FOR"),
    a.edge(IO.dresserJamDi, FM.dresserJam, "EVIDENCE_FOR"),
    a.edge(EV.electrodeLog, FM.dresserJam, "EVIDENCE_FOR"),

    a.edge(FM.leftInTeach, AL.cellInTeach, "EXPLAINS"),
    a.edge(T.teachActive, FM.leftInTeach, "EVIDENCE_FOR"),
    a.edge(T.startRequest, FM.leftInTeach, "EVIDENCE_FOR"),
    a.edge(T.seqStep, FM.leftInTeach, "EVIDENCE_FOR"),
    a.edge(T.almCellInTeach, FM.leftInTeach, "EVIDENCE_FOR"),
    a.edge(EV.operatorAuditLog, FM.leftInTeach, "EVIDENCE_FOR"),

    a.edge(FM.weldTelemetryStale, AL.weldTelemetryStale, "EXPLAINS"),
    a.edge(FM.weldTelemetryStale, AL.weldUnverified, "EXPLAINS"),
    a.edge(T.weldLogLinkOk, FM.weldTelemetryStale, "EVIDENCE_FOR"),
    a.edge(T.weldTelemetryAge, FM.weldTelemetryStale, "EVIDENCE_FOR"),
    a.edge(T.weldDataStale, FM.weldTelemetryStale, "EVIDENCE_FOR"),
    a.edge(T.weldMeasured, FM.weldTelemetryStale, "EVIDENCE_FOR"),
    a.edge(T.almTelemetryStale, FM.weldTelemetryStale, "EVIDENCE_FOR"),
    a.edge(T.almWeldUnverified, FM.weldTelemetryStale, "EVIDENCE_FOR"),
    a.edge(T.weldConfidenceOk, FM.weldTelemetryStale, "EVIDENCE_FOR"),
    a.edge(T.spotsVerified, FM.weldTelemetryStale, "EVIDENCE_FOR"),
    a.edge(EV.weldLog, FM.weldTelemetryStale, "EVIDENCE_FOR"),

    /* Safe actions */
    a.edge(SA.partSensor, FM.partSensor, "VERIFIES"),
    a.edge(SA.safetyReview, FM.safetyGate, "VERIFIES"),
    a.edge(SA.utilityReview, FM.utilityLost, "VERIFIES"),
    a.edge(SA.gunDriveHistory, FM.gunDriveTrip, "VERIFIES"),
    a.edge(SA.shuttleDriveHistory, FM.shuttleDriveTrip, "VERIFIES"),
    a.edge(SA.robotLinkCheck, FM.robotComms, "VERIFIES"),
    a.edge(SA.robotCycleReview, FM.robotCycleTimeout, "VERIFIES"),
    a.edge(SA.electrodeReview, FM.electrodeWear, "VERIFIES"),
    a.edge(SA.scheduleReview, FM.scheduleMismatch, "VERIFIES"),
    a.edge(SA.clampInspect, FM.clampValve, "VERIFIES"),
    a.edge(SA.dresserInspect, FM.dresserJam, "VERIFIES"),
    a.edge(SA.auditReview, FM.leftInTeach, "VERIFIES"),
    a.edge(SA.weldLogPath, FM.weldTelemetryStale, "VERIFIES"),
  ],

  artifacts: [
    {
      local: "OB_STARTUP",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "OB100_Startup.scl",
      declares: [B.obStartup],
      provenance: { subsystem: "CELL_BS31", sourceId: "OB100", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: OB_STARTUP_SCL,
    },
    {
      local: "OB_MAIN",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "OB1_Main.scl",
      declares: [B.obMain],
      provenance: { subsystem: "CELL_BS31", sourceId: "OB1", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: OB_MAIN_SCL,
    },
    {
      local: "FB_SAFETY_STATUS",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1510_SafetyStatus.scl",
      declares: [B.fbSafety, P.safetyGranted],
      provenance: { subsystem: "SAFETY_BOUNDARY", sourceId: "FB1510", domain: "SAFETY", safetyClass: "NON_SAFETY" },
      content: FB_SAFETY_STATUS_SCL,
    },
    {
      local: "FB_FIXTURE_CONTROL",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1520_FixtureControl.scl",
      declares: [B.fbFixture, P.fixtureReady, EQ.geoFixture, EQ.clampA, EQ.clampB, EQ.locatingPins],
      provenance: { subsystem: "FIXTURE", sourceId: "FB1520", domain: "MECHANICAL", safetyClass: "NON_SAFETY" },
      content: FB_FIXTURE_CONTROL_SCL,
    },
    {
      local: "FB_VARIANT_MANAGEMENT",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1530_VariantManagement.scl",
      declares: [B.fbVariant, P.scheduleReady],
      provenance: { subsystem: "CELL_BS31", sourceId: "FB1530", domain: "QUALITY", safetyClass: "NON_SAFETY" },
      content: FB_VARIANT_MANAGEMENT_SCL,
    },
    {
      local: "FB_ROBOT_COORDINATION",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1540_RobotCoordination.scl",
      declares: [B.fbRobot, P.robotsReady, EQ.robot1, EQ.robot2, EQ.robot3, EQ.robot4],
      provenance: { subsystem: "ROBOT_GROUP", sourceId: "FB1540", domain: "MECHANICAL", safetyClass: "NON_SAFETY" },
      content: FB_ROBOT_COORDINATION_SCL,
    },
    {
      local: "FB_WELD_SUPERVISION",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1550_WeldSupervision.scl",
      declares: [B.fbWeld, EQ.gun1, EQ.gun2, EQ.gun3, EQ.gun4],
      provenance: { subsystem: "WELD_CONTROL", sourceId: "FB1550", domain: "ENERGY", safetyClass: "NON_SAFETY" },
      content: FB_WELD_SUPERVISION_SCL,
    },
    {
      local: "FB_TIP_MANAGEMENT",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1560_TipManagement.scl",
      declares: [B.fbTip, EQ.tipDresser, TQ, TS.ready, TS.dress, TS.measure, TS.complete],
      provenance: { subsystem: "WELD_CONTROL", sourceId: "FB1560", domain: "MAINTENANCE", safetyClass: "NON_SAFETY" },
      content: FB_TIP_MANAGEMENT_SCL,
    },
    {
      local: "FB_CELL_SEQUENCE",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1570_CellSequence.scl",
      declares: [B.fbSequence, SQ, S.idle, S.infeed, S.clampClose, S.weld, S.verify, S.clampOpen, S.outfeed],
      provenance: { subsystem: "CELL_BS31", sourceId: "FB1570", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: FB_CELL_SEQUENCE_SCL,
    },
    {
      local: "FC_LIBRARY",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FC1580_1583_Library.scl",
      declares: [B.fcUtility, B.fcQuality, B.fcCycle, B.fcKpi, K.bodies, K.spotQuality, K.firstTimeThrough, K.cycleTime, K.weldEnergy, P.utilityReady],
      provenance: { subsystem: "CELL_BS31", sourceId: "FC1580", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: FC_LIBRARY_SCL,
    },
    {
      local: "DB_DEFINITIONS",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "DB1510_1514_Definitions.scl",
      declares: [B.dbInstance, B.dbSchedule, B.dbConfig, B.dbRobots, B.dbAlarms],
      provenance: { subsystem: "CELL_BS31", sourceId: "DB1510", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: DB_DEFINITIONS_SCL,
    },
    {
      local: "UDT_DEFINITIONS",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "UDT_Definitions.scl",
      declares: [B.udtRobot, B.udtSpot, B.udtSchedule, B.udtClamp, B.udtZone, B.udtSeq],
      provenance: { subsystem: "CELL_BS31", sourceId: "UDT", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: UDT_DEFINITIONS_SCL,
    },
    {
      local: "LAD_CELL_PERMISSIVE",
      language: "LAD_XML",
      layer: "PLC_LOGIC",
      fileName: "LAD1590_CellPermissive.lad.xml",
      declares: [P.scheduleReady, P.utilityReady, P.robotsReady, P.fixtureReady, P.safetyGranted],
      provenance: { subsystem: "CELL_BS31", sourceId: "LAD1590", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: LAD_CELL_PERMISSIVE_XML,
    },
    {
      local: "FBD_WELD_ENABLE",
      language: "FBD_XML",
      layer: "PLC_LOGIC",
      fileName: "FBD1591_WeldEnable.fbd.xml",
      declares: [T.weldEnable, T.weldTimerReady, T.weldTimerFault],
      provenance: { subsystem: "WELD_CONTROL", sourceId: "FBD1591", domain: "ENERGY", safetyClass: "NON_SAFETY" },
      content: FBD_WELD_ENABLE_XML,
    },
  ],

  scenarios: [
    {
      id: "TIA-05-FS-01",
      title: t("Fixture reports a body that is not there", "گزارش بدنه‌ای که در فیکسچر نیست"),
      narrative: t(
        "The first presence sensor has read made on every body and on every empty fixture since the shift started, while the second one follows the bodies normally. The cell will not release the clamp step.",
        "سنسور حضور اول از ابتدای شیفت روی هر بدنه و روی هر فیکسچر خالی، وضعیت «بسته» را می‌خواند، در حالی که سنسور دوم بدنه‌ها را عادی دنبال می‌کند. سلول گام بستن گیره را آزاد نمی‌کند.",
      ),
      observations: [
        { nodeId: AL.partNotSeated, state: "TRUE" },
        { nodeId: T.partPresent1, state: "ABNORMAL", detail: "made with an empty fixture" },
        { nodeId: T.partPresent2, state: "FALSE" },
        { nodeId: T.partSeatedOk, state: "FALSE" },
        { nodeId: T.almPartNotSeated, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "SENSOR_FAILURE",
        faultModeId: FM.partSensor,
        supportingNodeIds: [T.partPresent1, T.partPresent2, T.partSeatedOk, AL.partNotSeated],
        expectedMissingNodeIds: [IO.partPresentDi, EV.cpuDiagnostics],
        expectedSafeActionIds: [SA.partSensor],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-05-FS-02",
      title: t("The safety controller is holding the cell", "نگه‌داشتن سلول توسط کنترلر ایمنی"),
      narrative: t(
        "The safety controller reports a safe stop and has withdrawn the robot motion enable. The fence gate reads open and the zone is not clear. Nothing on this controller can clear the stop.",
        "کنترلر ایمنی یک توقف ایمن گزارش می‌کند و مجوز حرکت ربات را سلب کرده است. درِ حصار باز خوانده می‌شود و ناحیه پاک نیست. هیچ‌چیز روی این کنترلر نمی‌تواند توقف را پاک کند.",
      ),
      observations: [
        { nodeId: AL.safetyStop, state: "TRUE" },
        { nodeId: AL.zoneNotClear, state: "TRUE" },
        { nodeId: I.safetyStop, state: "TRUE" },
        { nodeId: I.zoneNotClear, state: "TRUE" },
        { nodeId: T.safeStopActive, state: "TRUE" },
        { nodeId: T.motionEnable, state: "FALSE" },
        { nodeId: T.gateClosed, state: "FALSE" },
        { nodeId: T.zoneClear, state: "FALSE" },
        { nodeId: T.almSafetyStop, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "SAFETY_CIRCUIT",
        faultClass: "INTERLOCK_ACTIVE",
        faultModeId: FM.safetyGate,
        supportingNodeIds: [T.safeStopActive, T.motionEnable, T.gateClosed, I.safetyStop, AL.safetyStop],
        expectedMissingNodeIds: [EV.safetyLog],
        expectedSafeActionIds: [SA.safetyReview],
        requiresEscalation: true,
      },
    },
    {
      id: "TIA-05-FS-03",
      title: t("Gun cooling flow has fallen away", "افت دبی خنک‌کاری گان"),
      narrative: t(
        "The gun cooling flow has dropped below the minimum and the return water is running hot. The utility permissive is absent and the cell is holding before the weld step rather than welding an uncooled gun.",
        "دبی خنک‌کاری گان به زیر حداقل افت کرده و آب برگشتی داغ است. مجوز یوتیلیتی برقرار نیست و سلول به‌جای جوشکاری با گانِ خنک‌نشده، پیش از گام جوش متوقف مانده است.",
      ),
      observations: [
        { nodeId: AL.waterFlowLow, state: "TRUE" },
        { nodeId: T.waterFlowAct, state: "ABNORMAL", detail: "below the minimum" },
        { nodeId: T.waterFlowOk, state: "FALSE" },
        { nodeId: T.waterTemp, state: "ABNORMAL", detail: "return water running hot" },
        { nodeId: T.almWaterFlowLow, state: "TRUE" },
        { nodeId: P.utilityReady, state: "FALSE" },
        { nodeId: I.utilityNotReady, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "PERMISSIVE_MISSING",
        faultModeId: FM.utilityLost,
        supportingNodeIds: [T.waterFlowAct, T.waterFlowOk, T.waterTemp, P.utilityReady, AL.waterFlowLow],
        expectedMissingNodeIds: [T.airPressureOk, EV.utilityTrend],
        expectedSafeActionIds: [SA.utilityReview],
        requiresEscalation: true,
      },
    },
    {
      id: "TIA-05-FS-04",
      title: t("Servo weld gun tripped mid-cycle", "تریپ گان جوش سروو در میانهٔ چرخه"),
      narrative: t(
        "The servo gun on robot 2 faulted with the body clamped. The gun stalled part-way to the sheet, the cell stopped with it, and the drive is reporting a fault that has not been reset.",
        "گان سروو روی ربات ۲ با بدنهٔ مهارشده خطا داد. گان در میانهٔ راه تا ورق متوقف شد، سلول با آن ایستاد و درایو خطایی گزارش می‌کند که ریست نشده است.",
      ),
      observations: [
        { nodeId: AL.gunDriveTripped, state: "TRUE" },
        { nodeId: I.gunDriveTrip, state: "TRUE" },
        { nodeId: T.gunDriveFault, state: "TRUE" },
        { nodeId: T.gunPositionAct, state: "ABNORMAL", detail: "stalled part-way to the sheet" },
        { nodeId: T.almGunDriveTrip, state: "TRUE" },
        { nodeId: T.cellRunning, state: "FALSE" },
      ],
      groundTruth: {
        subsystem: "DRIVE",
        faultClass: "DRIVE_FAULT",
        faultModeId: FM.gunDriveTrip,
        supportingNodeIds: [T.gunDriveFault, T.gunPositionAct, I.gunDriveTrip, AL.gunDriveTripped],
        expectedMissingNodeIds: [IO.gunFaultDi, EV.driveLog],
        expectedSafeActionIds: [SA.gunDriveHistory],
        requiresEscalation: true,
      },
    },
    {
      id: "TIA-05-FS-05",
      title: t("Robot 3 stopped answering", "بی‌پاسخ ماندن ربات ۳"),
      narrative: t(
        "The link to robot 3 went down and its frames stopped arriving. The last frame said ready, which says nothing about the arm now — and the controller has withdrawn group readiness rather than carrying the last value forward.",
        "پیوند ربات ۳ قطع شد و فریم‌های آن از رسیدن بازماندند. آخرین فریم «آماده» بود، که این چیزی دربارهٔ وضعیت کنونی بازو نمی‌گوید — و کنترلر به‌جای ادامه دادن آخرین مقدار، آمادگی گروه را سلب کرده است.",
      ),
      observations: [
        { nodeId: AL.robotTelemetryLost, state: "TRUE" },
        { nodeId: T.r3LinkOk, state: "FALSE" },
        { nodeId: T.r3TelemetryAge, state: "ABNORMAL", detail: "120 s and rising" },
        { nodeId: T.r3DataStale, state: "TRUE" },
        { nodeId: T.r3Ready, state: "STALE", detail: "frozen at the last frame" },
        { nodeId: T.almRobotCommsLoss, state: "TRUE" },
        { nodeId: T.robotsReadyAll, state: "FALSE" },
      ],
      groundTruth: {
        subsystem: "NETWORK",
        faultClass: "COMMUNICATION_LOSS",
        faultModeId: FM.robotComms,
        supportingNodeIds: [T.r3LinkOk, T.r3TelemetryAge, T.r3DataStale, T.r3Ready, AL.robotTelemetryLost],
        expectedMissingNodeIds: [IO.r3LinkPn, EV.cpuDiagnostics],
        expectedSafeActionIds: [SA.robotLinkCheck],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-05-FS-06",
      title: t("The weld step never finished", "پایان نیافتن گام جوش"),
      narrative: t(
        "The cell has been sitting on the weld step past its watchdog. The robots never reported the cycle complete, the spot count is short of the schedule target and the cycle time has run well past it. Every robot link is healthy.",
        "سلول فراتر از سررسید نگهبان خود روی گام جوش مانده است. ربات‌ها هرگز پایان چرخه را گزارش نکردند، شمار نقاط از هدف برنامه کمتر است و زمان چرخه بسیار از آن گذشته است. پیوند همهٔ ربات‌ها سالم است.",
      ),
      observations: [
        { nodeId: AL.robotCycleNotCompleted, state: "TRUE" },
        { nodeId: T.robotCycleDone, state: "FALSE" },
        { nodeId: T.almRobotCycleTimeout, state: "TRUE" },
        { nodeId: T.cycleTimeDeviation, state: "ABNORMAL", detail: "past the schedule target" },
        { nodeId: T.almCycleDeviation, state: "TRUE" },
        { nodeId: T.spotCountCycle, state: "ABNORMAL", detail: "short of the schedule target" },
        { nodeId: T.seqStep, state: "ABNORMAL", detail: "held at the weld step" },
        { nodeId: T.r3LinkOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "PLC_LOGIC",
        faultClass: "SEQUENCE_TIMEOUT",
        faultModeId: FM.robotCycleTimeout,
        supportingNodeIds: [T.robotCycleDone, T.almRobotCycleTimeout, T.cycleTimeDeviation, T.spotCountCycle, AL.robotCycleNotCompleted],
        expectedMissingNodeIds: [T.spotTargetCount, EV.robotLog],
        expectedSafeActionIds: [SA.robotCycleReview],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-05-FS-07",
      title: t("Weld current drifting down as the tips wear", "افت تدریجی جریان جوش با سایش نوک‌ها"),
      narrative: t(
        "The measured weld current has fallen below the schedule band while every setpoint still reads correct. The electrode has passed its spot count limit and no dressing has been carried out. The weld timer is still measuring normally.",
        "جریان جوش اندازه‌گیری‌شده به زیر محدودهٔ برنامه افت کرده، در حالی که همهٔ نقاط تنظیم هنوز درست خوانده می‌شوند. الکترود از حد شمار نقاط خود گذشته و هیچ تراشی انجام نشده است. تایمر جوش هنوز عادی اندازه می‌گیرد.",
      ),
      observations: [
        { nodeId: AL.weldCurrentLow, state: "TRUE" },
        { nodeId: AL.electrodeWear, state: "TRUE" },
        { nodeId: T.weldCurrentAct, state: "ABNORMAL", detail: "below the schedule band" },
        { nodeId: T.weldCurrentOk, state: "FALSE" },
        { nodeId: T.almWeldCurrentLow, state: "TRUE" },
        { nodeId: T.tipWearCount, state: "ABNORMAL", detail: "past the electrode life limit" },
        { nodeId: T.tipWearLimit, state: "TRUE" },
        { nodeId: T.almTipWearLimit, state: "TRUE" },
        { nodeId: T.weldMeasured, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.electrodeWear,
        supportingNodeIds: [T.weldCurrentAct, T.weldCurrentOk, T.tipWearCount, T.tipWearLimit, AL.weldCurrentLow],
        expectedMissingNodeIds: [T.spotQualityPct, EV.electrodeLog],
        expectedSafeActionIds: [SA.electrodeReview],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-05-FS-08",
      title: t("The schedule in the timer is not this body's", "ناهمخوانی برنامهٔ داخل تایمر با این بدنه"),
      narrative: t(
        "The body variant read from the carrier does not match the schedule identity the weld timer is holding. The stored revision checksum is intact, so the schedule itself is not corrupt — it simply belongs to another body.",
        "واریانت بدنه که از حامل خوانده شده با شناسهٔ برنامه‌ای که تایمر جوش نگه داشته یکی نیست. checksum نسخهٔ ذخیره‌شده سالم است، پس خود برنامه خراب نیست — فقط متعلق به بدنهٔ دیگری است.",
      ),
      observations: [
        { nodeId: AL.scheduleMismatch, state: "TRUE" },
        { nodeId: T.scheduleMatches, state: "FALSE" },
        { nodeId: T.scheduleIdLoaded, state: "ABNORMAL", detail: "holds the previous variant" },
        { nodeId: T.variantIdAct, state: "ABNORMAL", detail: "carrier reports a different variant" },
        { nodeId: T.scheduleValid, state: "FALSE" },
        { nodeId: T.almScheduleMismatch, state: "TRUE" },
        { nodeId: T.scheduleChecksumOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "RECIPE_CONFIG",
        faultClass: "RECIPE_MISMATCH",
        faultModeId: FM.scheduleMismatch,
        supportingNodeIds: [T.scheduleMatches, T.scheduleIdLoaded, T.variantIdAct, T.scheduleValid, AL.scheduleMismatch],
        expectedMissingNodeIds: [T.variantSelected, EV.scheduleAuditLog],
        expectedSafeActionIds: [SA.scheduleReview],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-05-FS-09",
      title: t("Clamp group B reports open and closed at once", "گزارش هم‌زمان باز و بسته بودن گروه گیرهٔ B"),
      narrative: t(
        "Both limit switches on clamp group B are made at the same time, which no healthy clamp does, and the group never reached closed within its watchdog. The air pressure is healthy, so the supply is not the reason.",
        "هر دو لیمیت‌سوییچ گروه گیرهٔ B هم‌زمان بسته‌اند، چیزی که هیچ گیرهٔ سالمی انجام نمی‌دهد، و گروه در مدت نگهبان خود هرگز به وضعیت بسته نرسید. فشار هوا سالم است، پس تأمین هوا دلیل ماجرا نیست.",
      ),
      observations: [
        { nodeId: AL.clampDiscrepancy, state: "TRUE" },
        { nodeId: AL.clampTimeout, state: "TRUE" },
        { nodeId: I.clampNotClosed, state: "TRUE" },
        { nodeId: T.clampBOpenFb, state: "ABNORMAL", detail: "open limit made" },
        { nodeId: T.clampBClosedFb, state: "ABNORMAL", detail: "closed limit made at the same time" },
        { nodeId: T.almClampDiscrepancy, state: "TRUE" },
        { nodeId: T.almClampTimeout, state: "TRUE" },
        { nodeId: T.clampsClosedAll, state: "FALSE" },
        { nodeId: T.airPressureOk, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "MECHANICAL",
        faultClass: "ACTUATOR_FAILURE",
        faultModeId: FM.clampValve,
        supportingNodeIds: [T.clampBOpenFb, T.clampBClosedFb, T.clampsClosedAll, I.clampNotClosed, AL.clampDiscrepancy],
        expectedMissingNodeIds: [IO.clampBClosedDi, EV.driveLog],
        expectedSafeActionIds: [SA.clampInspect],
        requiresEscalation: true,
      },
    },
    {
      id: "TIA-05-FS-10",
      title: t("The tip dresser will not turn", "نچرخیدن تراش‌دهندهٔ نوک"),
      narrative: t(
        "The dressing request was raised at the electrode life limit but the dresser never completed. The blade jam contact is made and the motor is drawing against a stalled blade.",
        "درخواست تراش در حد عمر الکترود مطرح شد اما تراش‌دهنده هرگز آن را تکمیل نکرد. کنتاکت گیر تیغه بسته است و موتور در برابر تیغه‌ای متوقف جریان می‌کشد.",
      ),
      observations: [
        { nodeId: AL.dresserJammed, state: "TRUE" },
        { nodeId: T.dresserBladeJam, state: "TRUE" },
        { nodeId: T.dresserMotorFault, state: "ABNORMAL", detail: "drawing against a stalled blade" },
        { nodeId: T.almDresserJam, state: "TRUE" },
        { nodeId: T.tipDressDone, state: "FALSE" },
        { nodeId: T.tipDressRequest, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "MECHANICAL",
        faultClass: "BLOCKAGE",
        faultModeId: FM.dresserJam,
        supportingNodeIds: [T.dresserBladeJam, T.dresserMotorFault, T.tipDressDone, AL.dresserJammed],
        expectedMissingNodeIds: [IO.dresserJamDi, EV.electrodeLog],
        expectedSafeActionIds: [SA.dresserInspect],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-05-FS-11",
      title: t("Cell ignores the start request after a robot programming session", "بی‌پاسخ ماندن درخواست شروع پس از برنامه‌نویسی ربات"),
      narrative: t(
        "After a programming session the cell does not answer a start request from the line control room. Automatic and remote are both selected, nothing reports a fault, and the sequence stays at its idle step.",
        "پس از یک جلسهٔ برنامه‌نویسی، سلول به درخواست شروع از اتاق کنترل خط پاسخ نمی‌دهد. حالت خودکار و از راه دور هر دو انتخاب شده‌اند، هیچ‌چیز خطا گزارش نمی‌کند و توالی در گام بی‌کار خود می‌ماند.",
      ),
      observations: [
        { nodeId: AL.cellInTeach, state: "TRUE" },
        { nodeId: T.teachActive, state: "TRUE", detail: "a pendant is still enabled at the cell" },
        { nodeId: T.startRequest, state: "TRUE" },
        { nodeId: T.seqStep, state: "ABNORMAL", detail: "held at step 0 with a start requested" },
        { nodeId: T.almCellInTeach, state: "TRUE" },
        { nodeId: T.modeAuto, state: "NORMAL" },
        { nodeId: T.modeRemote, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "HMI",
        faultClass: "INCORRECT_MODE",
        faultModeId: FM.leftInTeach,
        supportingNodeIds: [T.teachActive, T.startRequest, T.seqStep, AL.cellInTeach],
        expectedMissingNodeIds: [EV.operatorAuditLog],
        expectedSafeActionIds: [SA.auditReview],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-05-FS-12",
      title: t("Every spot was made and none was measured", "زده شدن همهٔ نقاط و اندازه‌گیری‌نشدن هیچ‌کدام"),
      narrative: t(
        "The weld parameter link went down and the timer stopped publishing measurements in the middle of the cycle. The robots completed their programs, but no spot since then has been verified and the last readings are frozen.",
        "پیوند پارامترهای جوش قطع شد و تایمر در میانهٔ چرخه از انتشار اندازه‌گیری‌ها بازماند. ربات‌ها برنامه‌های خود را کامل کردند، اما از آن زمان هیچ نقطه‌ای صحت‌سنجی نشده و آخرین قرائت‌ها منجمد مانده‌اند.",
      ),
      observations: [
        { nodeId: AL.weldTelemetryStale, state: "TRUE" },
        { nodeId: AL.weldUnverified, state: "TRUE" },
        { nodeId: T.weldLogLinkOk, state: "FALSE" },
        { nodeId: T.weldTelemetryAge, state: "ABNORMAL", detail: "210 s and rising" },
        { nodeId: T.weldDataStale, state: "TRUE" },
        { nodeId: T.weldMeasured, state: "FALSE" },
        { nodeId: T.almTelemetryStale, state: "TRUE" },
        { nodeId: T.almWeldUnverified, state: "TRUE" },
        { nodeId: T.weldConfidenceOk, state: "FALSE" },
        { nodeId: T.spotsVerified, state: "ABNORMAL", detail: "frozen well short of the target" },
        { nodeId: T.weldCurrentAct, state: "STALE" },
      ],
      groundTruth: {
        subsystem: "TELEMETRY",
        faultClass: "STALE_TELEMETRY",
        faultModeId: FM.weldTelemetryStale,
        supportingNodeIds: [T.weldLogLinkOk, T.weldTelemetryAge, T.weldDataStale, T.weldMeasured, T.weldConfidenceOk, AL.weldTelemetryStale],
        expectedMissingNodeIds: [EV.weldLog],
        expectedSafeActionIds: [SA.weldLogPath],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-05-FS-13",
      title: t("Shuttle drive tripped with a body on the carrier", "تریپ درایو شاتل با بدنه روی حامل"),
      narrative: t(
        "The shuttle conveyor drive faulted while moving a body into the cell. The shuttle coasted to a stop short of the weld position and the cell stopped with it. The servo guns are all healthy.",
        "درایو نوار شاتل هنگام انتقال یک بدنه به سلول خطا داد. شاتل پیش از رسیدن به موقعیت جوش از دور افتاد و سلول با آن ایستاد. همهٔ گان‌های سروو سالم‌اند.",
      ),
      observations: [
        { nodeId: AL.shuttleTripped, state: "TRUE" },
        { nodeId: T.shuttleDriveFault, state: "TRUE" },
        { nodeId: T.shuttleSpeedAct, state: "ABNORMAL", detail: "coasted to zero short of the weld position" },
        { nodeId: T.almShuttleDriveTrip, state: "TRUE" },
        { nodeId: T.shuttleInPosition, state: "FALSE" },
        { nodeId: T.cellRunning, state: "FALSE" },
        { nodeId: T.gunDriveFault, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "DRIVE",
        faultClass: "DRIVE_FAULT",
        faultModeId: FM.shuttleDriveTrip,
        supportingNodeIds: [T.shuttleDriveFault, T.shuttleSpeedAct, T.shuttleInPosition, AL.shuttleTripped],
        expectedMissingNodeIds: [EV.driveLog],
        expectedSafeActionIds: [SA.shuttleDriveHistory],
        requiresEscalation: false,
      },
    },
  ],
};
