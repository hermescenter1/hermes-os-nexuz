// PHASE 101 — SCADA-05: mining and mineral processing plant supervisory system.
//
// ORIGIN
// Original synthetic engineering reference authored for this repository. It
// contains no customer, proprietary or licensed vendor project material, no
// operational event record and no customer data. The supervisory scripting is
// the vendor-neutral accessor idiom every web-based SCADA platform of this
// class shares, and the screen and configuration files are plain declarative
// descriptions.
//
// WHAT IS *NOT* CLAIMED
// Nothing here was produced, imported, compiled or validated by any
// proprietary mining, concentrator or SCADA engineering tool. No plant
// simulator was run, no historian was queried and no controller was reached.
// The declarative configuration describes engineering INTENT; saying more than
// that would be a claim this repository cannot support.
//
// MINERAL PROCESSING SAFETY CONTRACT — enforced structurally, not by convention
//   - Hermes is diagnostic and advisory only. It starts, stops, trips, resets,
//     inhibits and bypasses nothing. There is no live equipment control and no
//     simulated actuation anywhere in this corpus.
//   - Crushers, conveyors, mills, pumps, valves and the reagent system carry NO
//     inbound COMMANDS, WRITES or ACTUATES edge from anything, of any kind. A
//     command intent is a SCADA_TAG that an operator screen declares and a
//     human-invokable script writes; it is never wired to a plant object,
//     because in this corpus it is engineering metadata about what an operator
//     MAY ask for, not a path by which anything can be asked.
//   - No automatic restart exists. After a trip, after communication recovery
//     and after power restoration, restarting is a human act performed on the
//     plant's own control system under its own permissives. The supervisory
//     configuration declares that policy and no script contradicts it: no
//     routine here touches a sequence, a state or a piece of equipment.
//   - E-stop, pull-cord, guard, belt-alignment, zero-speed, metal-detector,
//     mill-protection and tailings interlocks are observed and never bypassed,
//     reset, inhibited or simulated.
//   - Reagent dosing and the tailings boundary are MONITORED ONLY. They carry
//     no command intent at all, their signals are read-only, and the only
//     actions attached to them are review-only or escalation.
//   - The two automatic routines calculate: one publishes a staleness flag,
//     the other a specific-energy figure. Neither declares a role, because no
//     operator stands behind either, and neither touches a plant object.
//   - Missing or stale telemetry is never a healthy plant: the frozen-picture
//     scenario is answered by the communication fault mode, and no process
//     hypothesis gathers a single item of supporting evidence from a stale
//     mirror.
//
// GOVERNANCE
// Same contract as SCADA-01..04. Hermes grants no role, issues no command and
// writes no audit record — it has no runtime, no session and no write path to
// any device. ROLE and AUDIT_EVENT_TYPE never enter a diagnostic traversal.

import type { AuthoredReferenceSystem } from "../types";
import { authoring, chainStates, t } from "./_authoring";

const a = authoring({
  projectId: "SCADA-05",
  subsystem: "SUPERVISORY_CORE",
  domain: "SUPERVISORY",
});

/* ── Identifiers ──────────────────────────────────────────────────────────── */

const D = {
  primary: a.id("DEVICE", "SCADA_SERVER_PRIMARY"),
  standby: a.id("DEVICE", "SCADA_SERVER_STANDBY"),
  historian: a.id("DEVICE", "HISTORIAN_MPP"),
  gwA: a.id("DEVICE", "COMMS_GATEWAY_A"),
  gwB: a.id("DEVICE", "COMMS_GATEWAY_B"),
  timeServer: a.id("DEVICE", "TIME_SERVER_MPP"),
  plcCrushing: a.id("DEVICE", "PLC_CRUSHING"),
  plcConveying: a.id("DEVICE", "PLC_CONVEYING"),
  plcGrinding: a.id("DEVICE", "PLC_GRINDING"),
  plcFlotation: a.id("DEVICE", "PLC_FLOTATION"),
  plcDewatering: a.id("DEVICE", "PLC_DEWATERING"),
  plcUtilities: a.id("DEVICE", "PLC_UTILITIES"),
  safetyPlc: a.id("DEVICE", "SAFETY_PLC_CONVEYOR"),
  vfdMill: a.id("DEVICE", "VFD_SAG_MILL"),
  vfdCv03: a.id("DEVICE", "VFD_CV03_DRIVE"),
  mcc: a.id("DEVICE", "MCC_CONCENTRATOR"),
  opClient: a.id("DEVICE", "OPERATOR_CLIENT_MPP"),
};

const EQ = {
  romHopper: a.id("EQUIPMENT", "ROM_HOPPER"),
  apronFeeder: a.id("EQUIPMENT", "APRON_FEEDER_AF01"),
  grizzly: a.id("EQUIPMENT", "GRIZZLY_FEEDER_GF01"),
  jawCrusher: a.id("EQUIPMENT", "PRIMARY_JAW_CRUSHER_CR01"),
  coneCrusher: a.id("EQUIPMENT", "SECONDARY_CONE_CRUSHER_CR02"),
  screen: a.id("EQUIPMENT", "VIBRATING_SCREEN_SC01"),
  cv01: a.id("EQUIPMENT", "CONVEYOR_CV01"),
  cv02: a.id("EQUIPMENT", "CONVEYOR_CV02"),
  cv03: a.id("EQUIPMENT", "CONVEYOR_CV03"),
  metalDetector: a.id("EQUIPMENT", "METAL_DETECTOR_MD01"),
  magnetSeparator: a.id("EQUIPMENT", "MAGNETIC_SEPARATOR_MS01"),
  stockpile: a.id("EQUIPMENT", "COARSE_ORE_STOCKPILE"),
  sagMill: a.id("EQUIPMENT", "SAG_MILL_ML01"),
  ballMill: a.id("EQUIPMENT", "BALL_MILL_ML02"),
  sump: a.id("EQUIPMENT", "MILL_DISCHARGE_SUMP"),
  slurryPump: a.id("EQUIPMENT", "CYCLONE_FEED_PUMP_PU01"),
  cyclones: a.id("EQUIPMENT", "HYDROCYCLONE_CLUSTER_CY01"),
  flotation: a.id("EQUIPMENT", "FLOTATION_ROW_FL01"),
  reagents: a.id("EQUIPMENT", "REAGENT_SYSTEM_RG01"),
  concThickener: a.id("EQUIPMENT", "CONCENTRATE_THICKENER_TH01"),
  concFilter: a.id("EQUIPMENT", "CONCENTRATE_FILTER_FP01"),
  tailingsThickener: a.id("EQUIPMENT", "TAILINGS_THICKENER_TH02"),
  tailingsPump: a.id("EQUIPMENT", "TAILINGS_PUMP_PU02"),
  dustSuppression: a.id("EQUIPMENT", "DUST_SUPPRESSION_DS01"),
  processWater: a.id("EQUIPMENT", "PROCESS_WATER_TANK_PW01"),
};

/** The controller-side process image, as the plant PLCs hold it. */
const T = {
  /* Run-of-mine feed */
  romHopperLevel: a.id("TAG", "ROM_HOPPER_LEVEL"),
  feederSpeed: a.id("TAG", "AF01_FEEDER_SPEED"),
  feederRunning: a.id("TAG", "AF01_FEEDER_RUNNING"),
  feederModeRemote: a.id("TAG", "AF01_MODE_REMOTE"),
  grizzlyRunning: a.id("TAG", "GF01_RUNNING"),
  /* Primary and secondary crushing */
  cr01MotorCurrent: a.id("TAG", "CR01_MOTOR_CURRENT"),
  cr01PowerDraw: a.id("TAG", "CR01_POWER_DRAW"),
  cr01ChokeLevel: a.id("TAG", "CR01_CAVITY_LEVEL"),
  cr01HydraulicPressure: a.id("TAG", "CR01_HYDRAULIC_PRESSURE"),
  cr01Running: a.id("TAG", "CR01_RUNNING"),
  cr01GuardClosed: a.id("TAG", "CR01_GUARD_CLOSED"),
  cr02MotorCurrent: a.id("TAG", "CR02_MOTOR_CURRENT"),
  cr02Running: a.id("TAG", "CR02_RUNNING"),
  /* Screening */
  sc01Vibration: a.id("TAG", "SC01_VIBRATION"),
  sc01BearingTemp: a.id("TAG", "SC01_BEARING_TEMP"),
  sc01Running: a.id("TAG", "SC01_RUNNING"),
  /* Conveying */
  cv01BeltSpeed: a.id("TAG", "CV01_BELT_SPEED"),
  cv01Running: a.id("TAG", "CV01_RUNNING"),
  cv02BeltSpeed: a.id("TAG", "CV02_BELT_SPEED"),
  cv02Running: a.id("TAG", "CV02_RUNNING"),
  cv02PullcordHealthy: a.id("TAG", "CV02_PULLCORD_HEALTHY"),
  cv02EstopHealthy: a.id("TAG", "CV02_ESTOP_HEALTHY"),
  cv02AlignHealthy: a.id("TAG", "CV02_BELT_ALIGN_HEALTHY"),
  cv03BeltSpeed: a.id("TAG", "CV03_BELT_SPEED"),
  cv03DriveSpeedRef: a.id("TAG", "CV03_DRIVE_SPEED_REFERENCE"),
  cv03DriveCurrent: a.id("TAG", "CV03_DRIVE_CURRENT"),
  cv03DriveFault: a.id("TAG", "CV03_DRIVE_FAULT"),
  cv03ZeroSpeedTrip: a.id("TAG", "CV03_ZERO_SPEED_TRIP"),
  cv03AlignHealthy: a.id("TAG", "CV03_BELT_ALIGN_HEALTHY"),
  cv03PullcordHealthy: a.id("TAG", "CV03_PULLCORD_HEALTHY"),
  cv03PulleyBearingTemp: a.id("TAG", "CV03_DRIVE_PULLEY_BEARING_TEMP"),
  cv03WeightometerRate: a.id("TAG", "CV03_WEIGHTOMETER_RATE"),
  /* Tramp metal removal */
  md01MetalDetected: a.id("TAG", "MD01_METAL_DETECTED"),
  ms01MagnetCurrent: a.id("TAG", "MS01_MAGNET_CURRENT"),
  ms01Running: a.id("TAG", "MS01_RUNNING"),
  /* Stockpile */
  stockpileLevel: a.id("TAG", "STOCKPILE_LEVEL"),
  stockpileReclaimRate: a.id("TAG", "STOCKPILE_RECLAIM_RATE"),
  /* Grinding */
  ml01MillPower: a.id("TAG", "ML01_MILL_POWER"),
  ml01MotorCurrent: a.id("TAG", "ML01_MOTOR_CURRENT"),
  ml01MotorWindingTemp: a.id("TAG", "ML01_MOTOR_WINDING_TEMP"),
  ml01DriveFault: a.id("TAG", "ML01_DRIVE_FAULT"),
  ml01PinionBearingTemp: a.id("TAG", "ML01_PINION_BEARING_TEMP"),
  ml01ShellVibration: a.id("TAG", "ML01_SHELL_VIBRATION"),
  ml01MillSpeed: a.id("TAG", "ML01_MILL_SPEED"),
  ml01FeedRate: a.id("TAG", "ML01_FEED_RATE"),
  ml01LubePressure: a.id("TAG", "ML01_BEARING_LUBE_PRESSURE"),
  ml01LubeOilTemp: a.id("TAG", "ML01_LUBE_OIL_TEMP"),
  ml02MillPower: a.id("TAG", "ML02_MILL_POWER"),
  ml02PinionBearingTemp: a.id("TAG", "ML02_PINION_BEARING_TEMP"),
  /* Slurry transport */
  sumpLevel: a.id("TAG", "SUMP_LEVEL"),
  pu01SuctionPressure: a.id("TAG", "PU01_SUCTION_PRESSURE"),
  pu01DischargePressure: a.id("TAG", "PU01_DISCHARGE_PRESSURE"),
  pu01Flow: a.id("TAG", "PU01_FLOW"),
  pu01MotorCurrent: a.id("TAG", "PU01_MOTOR_CURRENT"),
  pu01Vibration: a.id("TAG", "PU01_VIBRATION"),
  pu01Speed: a.id("TAG", "PU01_SPEED"),
  pu01Running: a.id("TAG", "PU01_RUNNING"),
  /* Classification */
  cy01FeedPressure: a.id("TAG", "CY01_FEED_PRESSURE"),
  cy01FeedDensity: a.id("TAG", "CY01_FEED_DENSITY"),
  cy01OverflowDensity: a.id("TAG", "CY01_OVERFLOW_DENSITY"),
  cy01DensityQuality: a.id("TAG", "CY01_DENSITY_QUALITY_GOOD"),
  cy01OpenCyclones: a.id("TAG", "CY01_OPEN_CYCLONES"),
  /* Flotation */
  fl01CellLevel: a.id("TAG", "FL01_CELL_LEVEL"),
  fl01AirFlow: a.id("TAG", "FL01_AIR_FLOW"),
  fl01PulpPh: a.id("TAG", "FL01_PULP_PH"),
  fl01FrothDepth: a.id("TAG", "FL01_FROTH_DEPTH"),
  /* Reagents — monitored only */
  rg01CollectorFlow: a.id("TAG", "RG01_COLLECTOR_FLOW"),
  rg01FrotherFlow: a.id("TAG", "RG01_FROTHER_FLOW"),
  rg01TankLevel: a.id("TAG", "RG01_TANK_LEVEL"),
  rg01BundLeak: a.id("TAG", "RG01_BUND_LEAK_DETECTED"),
  /* Concentrate dewatering */
  th01BedLevel: a.id("TAG", "TH01_BED_LEVEL"),
  th01RakeTorque: a.id("TAG", "TH01_RAKE_TORQUE"),
  th01UnderflowDensity: a.id("TAG", "TH01_UNDERFLOW_DENSITY"),
  fp01ChamberPressure: a.id("TAG", "FP01_CHAMBER_PRESSURE"),
  fp01FiltrateFlow: a.id("TAG", "FP01_FILTRATE_FLOW"),
  /* Tailings boundary */
  th02BedLevel: a.id("TAG", "TH02_BED_LEVEL"),
  th02RakeTorque: a.id("TAG", "TH02_RAKE_TORQUE"),
  th02UnderflowDensity: a.id("TAG", "TH02_UNDERFLOW_DENSITY"),
  pu02DischargePressure: a.id("TAG", "PU02_DISCHARGE_PRESSURE"),
  pu02Running: a.id("TAG", "PU02_RUNNING"),
  tailingsLinePressure: a.id("TAG", "TAILINGS_LINE_PRESSURE"),
  /* Utilities */
  ds01SprayPressure: a.id("TAG", "DS01_SPRAY_PRESSURE"),
  ds01Running: a.id("TAG", "DS01_RUNNING"),
  pw01TankLevel: a.id("TAG", "PW01_TANK_LEVEL"),
  pw01MakeupFlow: a.id("TAG", "PW01_MAKEUP_FLOW"),
  pw01ReclaimFlow: a.id("TAG", "PW01_RECLAIM_FLOW"),
  /* Mode, communications and time */
  plantModeRemote: a.id("TAG", "PLANT_MODE_REMOTE"),
  gwALink: a.id("TAG", "GATEWAY_A_LINK_OK"),
  gwBLink: a.id("TAG", "GATEWAY_B_LINK_OK"),
  telemetryAge: a.id("TAG", "TELEMETRY_AGE"),
  timeSyncOk: a.id("TAG", "TIME_SYNC_OK"),
};

/** The supervisory tag database. Named as an operator would see it. */
const ST = {
  romHopperLevel: a.id("SCADA_TAG", "MPP_Rom_Hopper_Level"),
  feederSpeed: a.id("SCADA_TAG", "MPP_Feeder_Speed"),
  feederModeRemote: a.id("SCADA_TAG", "MPP_Feeder_Mode_Remote"),
  cr01PowerDraw: a.id("SCADA_TAG", "MPP_Cr01_Power_Draw"),
  cr01ChokeLevel: a.id("SCADA_TAG", "MPP_Cr01_Cavity_Level"),
  sc01Vibration: a.id("SCADA_TAG", "MPP_Sc01_Vibration"),
  cv02PullcordHealthy: a.id("SCADA_TAG", "MPP_Cv02_Pullcord_Healthy"),
  cv03BeltSpeed: a.id("SCADA_TAG", "MPP_Cv03_Belt_Speed"),
  cv03AlignHealthy: a.id("SCADA_TAG", "MPP_Cv03_Align_Healthy"),
  cv03WeightometerRate: a.id("SCADA_TAG", "MPP_Cv03_Weightometer_Rate"),
  md01MetalDetected: a.id("SCADA_TAG", "MPP_Md01_Metal_Detected"),
  stockpileLevel: a.id("SCADA_TAG", "MPP_Stockpile_Level"),
  ml01MillPower: a.id("SCADA_TAG", "MPP_Ml01_Mill_Power"),
  ml01PinionBearingTemp: a.id("SCADA_TAG", "MPP_Ml01_Pinion_Bearing_Temp"),
  ml01ShellVibration: a.id("SCADA_TAG", "MPP_Ml01_Shell_Vibration"),
  ml01LubePressure: a.id("SCADA_TAG", "MPP_Ml01_Lube_Pressure"),
  ml01FeedRate: a.id("SCADA_TAG", "MPP_Ml01_Feed_Rate"),
  sumpLevel: a.id("SCADA_TAG", "MPP_Sump_Level"),
  pu01SuctionPressure: a.id("SCADA_TAG", "MPP_Pu01_Suction_Pressure"),
  pu01Flow: a.id("SCADA_TAG", "MPP_Pu01_Flow"),
  cy01FeedPressure: a.id("SCADA_TAG", "MPP_Cy01_Feed_Pressure"),
  cy01FeedDensity: a.id("SCADA_TAG", "MPP_Cy01_Feed_Density"),
  cy01DensityQuality: a.id("SCADA_TAG", "MPP_Cy01_Density_Quality_Good"),
  fl01CellLevel: a.id("SCADA_TAG", "MPP_Fl01_Cell_Level"),
  rg01CollectorFlow: a.id("SCADA_TAG", "MPP_Rg01_Collector_Flow"),
  rg01BundLeak: a.id("SCADA_TAG", "MPP_Rg01_Bund_Leak"),
  th01RakeTorque: a.id("SCADA_TAG", "MPP_Th01_Rake_Torque"),
  th02RakeTorque: a.id("SCADA_TAG", "MPP_Th02_Rake_Torque"),
  pw01TankLevel: a.id("SCADA_TAG", "MPP_Pw01_Tank_Level"),
  plantMode: a.id("SCADA_TAG", "MPP_Plant_Mode"),
  gwALink: a.id("SCADA_TAG", "MPP_Gw_A_Link_Ok"),
  gwBLink: a.id("SCADA_TAG", "MPP_Gw_B_Link_Ok"),
  telemetryAge: a.id("SCADA_TAG", "MPP_Telemetry_Age"),
  timeSyncOk: a.id("SCADA_TAG", "MPP_Time_Sync_Ok"),
  /* Computed supervisory values — written by the automatic routines only. */
  telemetryStale: a.id("SCADA_TAG", "MPP_Telemetry_Stale"),
  specificEnergy: a.id("SCADA_TAG", "MPP_Specific_Energy_Value"),
  /* Command intents — engineering metadata, never wired to the plant. */
  feederRateIntent: a.id("SCADA_TAG", "MPP_Feeder_Rate_Setpoint_Intent"),
  millFeedTrimIntent: a.id("SCADA_TAG", "MPP_Mill_Feed_Trim_Intent"),
  ackCmd: a.id("SCADA_TAG", "MPP_Alarm_Ack_Cmd"),
};

const IO = {
  cr01PowerAi: a.id("IO_POINT", "AI_CR01_POWER"),
  cv03SpeedAi: a.id("IO_POINT", "AI_CV03_BELT_SPEED"),
  cv03ZeroSpeedDi: a.id("IO_POINT", "DI_CV03_ZERO_SPEED"),
  cv02PullcordDi: a.id("IO_POINT", "DI_CV02_PULLCORD"),
  cv03WeightometerAi: a.id("IO_POINT", "AI_CV03_WEIGHTOMETER"),
  ml01PinionRtd: a.id("IO_POINT", "AI_ML01_PINION_RTD"),
  ml01VibrationAi: a.id("IO_POINT", "AI_ML01_SHELL_VIBRATION"),
  cy01PressureAi: a.id("IO_POINT", "AI_CY01_FEED_PRESSURE"),
  cy01DensityAi: a.id("IO_POINT", "AI_CY01_FEED_DENSITY"),
  sumpLevelAi: a.id("IO_POINT", "AI_SUMP_LEVEL"),
};

/** The plant's declared start-up order. Described here, never executed. */
const SQ = a.id("SEQUENCE", "PLANT_START_SEQUENCE");
const S = {
  stopped: a.id("STATE", "P00_PLANT_STOPPED"),
  utilities: a.id("STATE", "P10_WATER_AND_DUST_READY"),
  conveyors: a.id("STATE", "P20_CONVEYORS_RUNNING"),
  crushing: a.id("STATE", "P30_CRUSHING_RUNNING"),
  grinding: a.id("STATE", "P40_GRINDING_RUNNING"),
  flotation: a.id("STATE", "P50_FLOTATION_RUNNING"),
};

/** The ISA-18.2 alarm lifecycle, authored as a declared design object. */
const AQ = a.id("SEQUENCE", "ALARM_LIFECYCLE");
const AS = {
  normal: a.id("STATE", "AL00_NORMAL"),
  unack: a.id("STATE", "AL10_UNACK_ALARM"),
  acked: a.id("STATE", "AL20_ACK_ALARM"),
  rtnUnack: a.id("STATE", "AL30_RTN_UNACK"),
};

const P = {
  telemetryFresh: a.id("PERMISSIVE", "PRM_TELEMETRY_FRESH"),
  plantRemote: a.id("PERMISSIVE", "PRM_PLANT_REMOTE"),
  conveyorRoute: a.id("PERMISSIVE", "PRM_CONVEYOR_ROUTE_READY"),
  millLubrication: a.id("PERMISSIVE", "PRM_MILL_LUBRICATION_READY"),
  sumpLevel: a.id("PERMISSIVE", "PRM_SUMP_LEVEL_ADEQUATE"),
  processWater: a.id("PERMISSIVE", "PRM_PROCESS_WATER_AVAILABLE"),
  dustSuppression: a.id("PERMISSIVE", "PRM_DUST_SUPPRESSION_ACTIVE"),
};

const I = {
  conveyorSafety: a.id("INTERLOCK", "ILK_CONVEYOR_SAFETY_CIRCUIT"),
  crusherProtection: a.id("INTERLOCK", "ILK_CRUSHER_PROTECTION"),
  millProtection: a.id("INTERLOCK", "ILK_MILL_PROTECTION"),
  metalDetector: a.id("INTERLOCK", "ILK_METAL_DETECTOR_STOP"),
  tailingsLine: a.id("INTERLOCK", "ILK_TAILINGS_LINE_PROTECTION"),
};

const AL = {
  crusherChoke: a.id("ALARM", "ALM_CRUSHER_CHOKE"),
  crushingStartTimeout: a.id("ALARM", "ALM_CRUSHING_START_TIMEOUT"),
  cv03BeltSlip: a.id("ALARM", "ALM_CV03_BELT_SLIP"),
  cv02Pullcord: a.id("ALARM", "ALM_CV02_PULLCORD_OPERATED"),
  metalDetected: a.id("ALARM", "ALM_TRAMP_METAL_DETECTED"),
  millDriveFault: a.id("ALARM", "ALM_MILL_DRIVE_FAULT"),
  millBearingTempHigh: a.id("ALARM", "ALM_MILL_BEARING_TEMP_HIGH"),
  pumpCavitation: a.id("ALARM", "ALM_PUMP_CAVITATION"),
  cycloneDeviation: a.id("ALARM", "ALM_CYCLONE_MEASUREMENT_DEVIATION"),
  commsStale: a.id("ALARM", "ALM_PLANT_COMMS_STALE"),
  timeSyncLost: a.id("ALARM", "ALM_TIME_SYNC_LOST"),
  feederInLocal: a.id("ALARM", "ALM_FEEDER_IN_LOCAL"),
  tailingsRakeTorque: a.id("ALARM", "ALM_TAILINGS_RAKE_TORQUE_HIGH"),
  reagentBundLeak: a.id("ALARM", "ALM_REAGENT_BUND_LEAK"),
};

const H = {
  overview: a.id("HMI_SCREEN", "Screen_PlantOverview"),
  crushing: a.id("HMI_SCREEN", "Screen_CrushingAndScreening"),
  conveyors: a.id("HMI_SCREEN", "Screen_Conveyors"),
  grinding: a.id("HMI_SCREEN", "Screen_Grinding"),
  classification: a.id("HMI_SCREEN", "Screen_Classification"),
  flotation: a.id("HMI_SCREEN", "Screen_Flotation"),
  dewatering: a.id("HMI_SCREEN", "Screen_Dewatering"),
  utilities: a.id("HMI_SCREEN", "Screen_Utilities"),
  alarms: a.id("HMI_SCREEN", "Screen_Alarms"),
};

const HO = {
  commsHealth: a.id("HMI_OBJECT", "Ind_CommsHealth"),
  timeSyncHealth: a.id("HMI_OBJECT", "Ind_TimeSyncHealth"),
  throughput: a.id("HMI_OBJECT", "Trend_Throughput"),
  romHopper: a.id("HMI_OBJECT", "Ind_RomHopperLevel"),
  feederRate: a.id("HMI_OBJECT", "Btn_FeederRateSetpoint"),
  crusherLoad: a.id("HMI_OBJECT", "Trend_CrusherLoad"),
  screenVibration: a.id("HMI_OBJECT", "Ind_ScreenVibration"),
  cv03Speed: a.id("HMI_OBJECT", "Trend_Cv03BeltSpeed"),
  cv02Safety: a.id("HMI_OBJECT", "Ind_Cv02SafetyCircuit"),
  metalDetector: a.id("HMI_OBJECT", "Ind_MetalDetector"),
  millPower: a.id("HMI_OBJECT", "Trend_MillPower"),
  millBearing: a.id("HMI_OBJECT", "Ind_MillBearingTemp"),
  millFeedTrim: a.id("HMI_OBJECT", "Btn_MillFeedTrim"),
  cycloneFeed: a.id("HMI_OBJECT", "Fp_CycloneFeed"),
  sumpLevel: a.id("HMI_OBJECT", "Ind_SumpLevel"),
  flotationLevel: a.id("HMI_OBJECT", "Trend_FlotationLevel"),
  reagentMonitor: a.id("HMI_OBJECT", "Ind_ReagentMonitor"),
  thickenerTorque: a.id("HMI_OBJECT", "Trend_ThickenerTorque"),
  processWater: a.id("HMI_OBJECT", "Ind_ProcessWater"),
  alarmBanner: a.id("HMI_OBJECT", "Banner_ActiveAlarms"),
};

const SC = {
  feederRateIntent: a.id("SCRIPT", "OnFeederRateSetpointIntent"),
  millFeedTrimIntent: a.id("SCRIPT", "OnMillFeedTrimIntent"),
  alarmAck: a.id("SCRIPT", "OnAlarmAcknowledge"),
  watchdog: a.id("SCRIPT", "OnPlantWatchdog"),
  kpiCalc: a.id("SCRIPT", "OnSpecificEnergyCalculation"),
};

const R = {
  operator: a.id("ROLE", "Role_ConcentratorOperator"),
  supervisor: a.id("ROLE", "Role_ConcentratorSupervisor"),
};

const AE = {
  feederRateIntent: a.id("AUDIT_EVENT_TYPE", "Audit_FeederRateSetpointIntentRecorded"),
  millFeedTrimIntent: a.id("AUDIT_EVENT_TYPE", "Audit_MillFeedTrimIntentRecorded"),
  alarmAck: a.id("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged"),
  watchdog: a.id("AUDIT_EVENT_TYPE", "Audit_PlantWatchdogRecord"),
  kpiCalc: a.id("AUDIT_EVENT_TYPE", "Audit_SpecificEnergyCalculationRecord"),
};

const K = {
  throughput: a.id("KPI", "KPI_PLANT_THROUGHPUT"),
  recovery: a.id("KPI", "KPI_METAL_RECOVERY_ESTIMATE"),
  availability: a.id("KPI", "KPI_PLANT_AVAILABILITY"),
  specificEnergy: a.id("KPI", "KPI_SPECIFIC_ENERGY"),
  waterIntensity: a.id("KPI", "KPI_WATER_INTENSITY"),
};

const EV = {
  processTrend: a.id("EVIDENCE_SOURCE", "HIST_PROCESS_TREND"),
  vibrationTrend: a.id("EVIDENCE_SOURCE", "HIST_VIBRATION_TREND"),
  driveEventLog: a.id("EVIDENCE_SOURCE", "HIST_DRIVE_EVENT_LOG"),
  commsLinkLog: a.id("EVIDENCE_SOURCE", "HIST_COMMS_LINK_LOG"),
  plantAuditLog: a.id("EVIDENCE_SOURCE", "HIST_PLANT_AUDIT_LOG"),
  safetyEventLog: a.id("EVIDENCE_SOURCE", "HIST_SAFETY_EVENT_LOG"),
  waterBalanceTrend: a.id("EVIDENCE_SOURCE", "HIST_WATER_BALANCE_TREND"),
};

const FM = {
  crusherChoke: a.id("FAULT_MODE", "FM_PRIMARY_CRUSHER_CHOKE"),
  crushingTimeout: a.id("FAULT_MODE", "FM_CRUSHING_START_TIMEOUT"),
  beltSlip: a.id("FAULT_MODE", "FM_CV03_BELT_SLIP"),
  millDrive: a.id("FAULT_MODE", "FM_SAG_MILL_DRIVE_FAULT"),
  pumpCavitation: a.id("FAULT_MODE", "FM_CYCLONE_FEED_PUMP_CAVITATION"),
  densityTransmitter: a.id("FAULT_MODE", "FM_CYCLONE_DENSITY_TRANSMITTER_FAILURE"),
  commsLoss: a.id("FAULT_MODE", "FM_PLANT_COMMS_LOSS"),
  pullcordInterlock: a.id("FAULT_MODE", "FM_CV02_PULLCORD_INTERLOCK"),
  feederInLocal: a.id("FAULT_MODE", "FM_FEEDER_LEFT_IN_LOCAL"),
  tailingsOvertorque: a.id("FAULT_MODE", "FM_TAILINGS_THICKENER_OVERTORQUE"),
  reagentContainment: a.id("FAULT_MODE", "FM_REAGENT_CONTAINMENT_BREACH"),
};

const SA = {
  crusherCavity: a.id("SAFE_ACTION", "SA_INSPECT_CRUSHER_CAVITY_AND_FEED_PRESENTATION"),
  crushingPermissives: a.id("SAFE_ACTION", "SA_REVIEW_CRUSHING_START_PERMISSIVES"),
  beltTension: a.id("SAFE_ACTION", "SA_REVIEW_CV03_BELT_TENSION_AND_LAGGING"),
  millDrive: a.id("SAFE_ACTION", "SA_REVIEW_MILL_DRIVE_AND_LUBRICATION_TREND"),
  pumpSuction: a.id("SAFE_ACTION", "SA_REVIEW_SUMP_LEVEL_AND_PUMP_SUCTION_CONDITIONS"),
  cycloneInstrument: a.id("SAFE_ACTION", "SA_VERIFY_CYCLONE_INSTRUMENT_CALIBRATION"),
  gatewaySessions: a.id("SAFE_ACTION", "SA_VERIFY_PLANT_GATEWAY_SESSIONS"),
  conveyorSafety: a.id("SAFE_ACTION", "SA_ESCALATE_CONVEYOR_SAFETY_CIRCUIT_REVIEW"),
  auditReview: a.id("SAFE_ACTION", "SA_REVIEW_PLANT_AUDIT_LOG"),
  tailingsReview: a.id("SAFE_ACTION", "SA_ESCALATE_TAILINGS_AND_WATER_BALANCE_REVIEW"),
  reagentReview: a.id("SAFE_ACTION", "SA_ESCALATE_REAGENT_CONTAINMENT_REVIEW"),
};

/* ── Engineering source ───────────────────────────────────────────────────── */

const SUPERVISORY_SCRIPTS = `// SCADA-05 — supervisory scripting for the mineral processing plant.
//
// Vendor-neutral accessor idiom: Tags("Name").Read() / .Write(value) and screen
// navigation. Nothing in this file is executed, transpiled or evaluated by
// Hermes; it is engineering text from which relationships are recovered.
//
// PROCESS SAFETY
// No routine here writes to a crusher, a conveyor, a mill, a pump, a valve or
// the reagent system. The two operator routines write a COMMAND INTENT tag: a
// recorded statement that an authorised human asked for a setpoint change,
// which the plant's own control system evaluates and honours — or refuses — on
// its own permissives and interlocks. The intent tags are not wired to any
// plant object anywhere in this corpus, and nothing here restarts anything
// after a trip, after communications return or after power is restored.

function OnFeederRateSetpointIntent() {
   // Reserved for the concentrator supervisor. The plant mode and the state of
   // the feed are READ and shown to the operator; they are NOT re-evaluated
   // here. The crushing PLC owns the feed decision, and a supervisory client
   // that second-guessed it would be a second, weaker source of truth.
   var remote = Tags("MPP_Plant_Mode").Read();
   var hopper = Tags("MPP_Rom_Hopper_Level").Read();
   var rate = Tags("MPP_Cv03_Weightometer_Rate").Read();

   if (remote && hopper > 15 && rate < 1800) {
      Tags("MPP_Feeder_Rate_Setpoint_Intent").Write(1);
   }

   Navigate("Screen_CrushingAndScreening");
}

function OnMillFeedTrimIntent() {
   // Reserved for the concentrator operator. A feed trim is only offered when
   // the measurement behind the decision is trustworthy and the mill is not
   // already at its power limit: trimming feed onto a bad density reading is
   // how a grinding circuit is overloaded.
   var quality = Tags("MPP_Cy01_Density_Quality_Good").Read();
   var power = Tags("MPP_Ml01_Mill_Power").Read();
   var sump = Tags("MPP_Sump_Level").Read();

   if (quality && power < 11500 && sump > 25) {
      Tags("MPP_Mill_Feed_Trim_Intent").Write(1);
   }
}

function OnAlarmAcknowledge() {
   // ISA-18.2 acknowledgement: it moves an alarm from Unacknowledged to
   // Acknowledged and records that a human saw it. It changes no plant state,
   // starts and stops nothing, and never clears the condition that raised the
   // alarm — least of all a pull-cord, guard or tailings interlock.
   Tags("MPP_Alarm_Ack_Cmd").Write(1);
   Navigate("Screen_Alarms");
}

function OnPlantWatchdog() {
   // Runs on the supervisory server's own schedule. There is no operator
   // behind it, so it declares no role, and it writes exactly one flag. Both
   // redundant gateways are read: the picture is stale only when NEITHER path
   // is carrying data, and that judgement is published as its own tag rather
   // than inferred separately by every screen. A stale picture is never read
   // as a healthy plant.
   var linkA = Tags("MPP_Gw_A_Link_Ok").Read();
   var linkB = Tags("MPP_Gw_B_Link_Ok").Read();
   var age = Tags("MPP_Telemetry_Age").Read();
   var timeOk = Tags("MPP_Time_Sync_Ok").Read();

   if ((!linkA && !linkB) || age > 30 || !timeOk) {
      Tags("MPP_Telemetry_Stale").Write(1);
   }
}

function OnSpecificEnergyCalculation() {
   // The second automatic routine. It CALCULATES: milling power over the
   // tonnage the weightometer reports, published as a supervisory figure. It
   // commands nothing and touches no plant object. When the picture is stale
   // it publishes nothing at all, because a specific energy computed from
   // frozen inputs would be a number that looks like a measurement.
   var stale = Tags("MPP_Telemetry_Stale").Read();
   var power = Tags("MPP_Ml01_Mill_Power").Read();
   var rate = Tags("MPP_Cv03_Weightometer_Rate").Read();

   if (!stale && rate > 0) {
      Tags("MPP_Specific_Energy_Value").Write(power / rate);
   }
}
`;

const OPERATOR_SCREENS = `{
  "screens": [
    {
      "name": "Screen_PlantOverview",
      "titleEn": "Concentrator overview",
      "titleFa": "نمای کلی کارخانهٔ فرآوری",
      "navigatesTo": [
        "Screen_CrushingAndScreening",
        "Screen_Conveyors",
        "Screen_Grinding",
        "Screen_Classification",
        "Screen_Flotation",
        "Screen_Dewatering",
        "Screen_Utilities",
        "Screen_Alarms"
      ],
      "objects": [
        {
          "name": "Ind_CommsHealth",
          "type": "INDICATOR",
          "displays": ["MPP_Gw_A_Link_Ok", "MPP_Gw_B_Link_Ok"]
        },
        {
          "name": "Ind_TimeSyncHealth",
          "type": "INDICATOR",
          "displays": ["MPP_Time_Sync_Ok"]
        },
        {
          "name": "Trend_Throughput",
          "type": "TREND",
          "displays": ["MPP_Cv03_Weightometer_Rate", "MPP_Specific_Energy_Value", "MPP_Stockpile_Level"]
        }
      ]
    },
    {
      "name": "Screen_CrushingAndScreening",
      "titleEn": "Run-of-mine feed, crushing and screening",
      "titleFa": "خوراک خام معدن، سنگ‌شکنی و سرند",
      "navigatesTo": ["Screen_PlantOverview"],
      "objects": [
        {
          "name": "Ind_RomHopperLevel",
          "type": "INDICATOR",
          "displays": ["MPP_Rom_Hopper_Level", "MPP_Feeder_Speed", "MPP_Feeder_Mode_Remote", "MPP_Plant_Mode"]
        },
        {
          "name": "Trend_CrusherLoad",
          "type": "TREND",
          "displays": ["MPP_Cr01_Power_Draw", "MPP_Cr01_Cavity_Level"]
        },
        {
          "name": "Ind_ScreenVibration",
          "type": "INDICATOR",
          "displays": ["MPP_Sc01_Vibration"]
        },
        {
          "name": "Btn_FeederRateSetpoint",
          "type": "BUTTON",
          "commands": ["MPP_Feeder_Rate_Setpoint_Intent"],
          "permission": "FEED_RATE_CONTROL",
          "requiresConfirmation": true
        }
      ]
    },
    {
      "name": "Screen_Conveyors",
      "titleEn": "Conveyor system and tramp metal removal",
      "titleFa": "سامانهٔ نوار نقاله و حذف فلزات مزاحم",
      "navigatesTo": ["Screen_PlantOverview"],
      "objects": [
        {
          "name": "Trend_Cv03BeltSpeed",
          "type": "TREND",
          "displays": ["MPP_Cv03_Belt_Speed", "MPP_Cv03_Weightometer_Rate"]
        },
        {
          "name": "Ind_Cv02SafetyCircuit",
          "type": "INDICATOR",
          "displays": ["MPP_Cv02_Pullcord_Healthy", "MPP_Cv03_Align_Healthy"]
        },
        {
          "name": "Ind_MetalDetector",
          "type": "INDICATOR",
          "displays": ["MPP_Md01_Metal_Detected"]
        }
      ]
    },
    {
      "name": "Screen_Grinding",
      "titleEn": "SAG and ball mill grinding circuit",
      "titleFa": "مدار آسیاکنی SAG و آسیای گلوله‌ای",
      "navigatesTo": ["Screen_PlantOverview"],
      "objects": [
        {
          "name": "Trend_MillPower",
          "type": "TREND",
          "displays": ["MPP_Ml01_Mill_Power", "MPP_Ml01_Feed_Rate"]
        },
        {
          "name": "Ind_MillBearingTemp",
          "type": "INDICATOR",
          "displays": ["MPP_Ml01_Pinion_Bearing_Temp", "MPP_Ml01_Shell_Vibration", "MPP_Ml01_Lube_Pressure"]
        },
        {
          "name": "Btn_MillFeedTrim",
          "type": "BUTTON",
          "commands": ["MPP_Mill_Feed_Trim_Intent"],
          "permission": "MILL_FEED_CONTROL",
          "requiresConfirmation": true
        }
      ]
    },
    {
      "name": "Screen_Classification",
      "titleEn": "Slurry transport and hydrocyclone classification",
      "titleFa": "انتقال دوغاب و طبقه‌بندی با هیدروسیکلون",
      "navigatesTo": ["Screen_PlantOverview"],
      "objects": [
        {
          "name": "Fp_CycloneFeed",
          "type": "FACEPLATE",
          "displays": ["MPP_Cy01_Feed_Pressure", "MPP_Cy01_Feed_Density", "MPP_Cy01_Density_Quality_Good"]
        },
        {
          "name": "Ind_SumpLevel",
          "type": "INDICATOR",
          "displays": ["MPP_Sump_Level", "MPP_Pu01_Suction_Pressure", "MPP_Pu01_Flow"]
        }
      ]
    },
    {
      "name": "Screen_Flotation",
      "titleEn": "Flotation row and reagent monitoring",
      "titleFa": "ردیف فلوتاسیون و پایش معرف‌های شیمیایی",
      "navigatesTo": ["Screen_PlantOverview"],
      "objects": [
        {
          "name": "Trend_FlotationLevel",
          "type": "TREND",
          "displays": ["MPP_Fl01_Cell_Level"]
        },
        {
          "name": "Ind_ReagentMonitor",
          "type": "INDICATOR",
          "displays": ["MPP_Rg01_Collector_Flow", "MPP_Rg01_Bund_Leak"]
        }
      ]
    },
    {
      "name": "Screen_Dewatering",
      "titleEn": "Concentrate dewatering and tailings boundary",
      "titleFa": "آب‌گیری کنسانتره و مرز باطله",
      "navigatesTo": ["Screen_PlantOverview"],
      "objects": [
        {
          "name": "Trend_ThickenerTorque",
          "type": "TREND",
          "displays": ["MPP_Th01_Rake_Torque", "MPP_Th02_Rake_Torque"]
        }
      ]
    },
    {
      "name": "Screen_Utilities",
      "titleEn": "Dust suppression and process water",
      "titleFa": "کنترل غبار و آب فرایندی",
      "navigatesTo": ["Screen_PlantOverview"],
      "objects": [
        {
          "name": "Ind_ProcessWater",
          "type": "INDICATOR",
          "displays": ["MPP_Pw01_Tank_Level"]
        }
      ]
    },
    {
      "name": "Screen_Alarms",
      "titleEn": "Active alarms",
      "titleFa": "آلارم‌های فعال",
      "navigatesTo": ["Screen_PlantOverview"],
      "objects": [
        {
          "name": "Banner_ActiveAlarms",
          "type": "ALARM_BANNER",
          "displays": ["MPP_Telemetry_Stale"],
          "commands": ["MPP_Alarm_Ack_Cmd"],
          "permission": "ALARM_ACK",
          "requiresConfirmation": true
        }
      ]
    }
  ]
}
`;

const SUPERVISORY_CONFIG = `{
  "redundancy": {
    "primary": "SCADA_SERVER_PRIMARY",
    "standby": "SCADA_SERVER_STANDBY",
    "mode": "HOT_STANDBY",
    "failoverSeconds": 15
  },
  "communicationGateways": [
    { "id": "COMMS_GATEWAY_A", "role": "PRIMARY_PATH" },
    { "id": "COMMS_GATEWAY_B", "role": "REDUNDANT_PATH" }
  ],
  "fieldCommunications": {
    "standards": ["OPC UA", "PROFINET", "MODBUS TCP"],
    "direction": "MONITORING_ONLY",
    "commands": "NONE",
    "note": "Declarative engineering description only. No session is opened, no subscription is created and no controller, drive, analyser or historian is contacted anywhere in this repository. Nothing here was produced, compiled or validated by any proprietary mining or SCADA vendor engineering tool."
  },
  "timeSynchronisation": {
    "source": "TIME_SERVER_MPP",
    "method": "NTP",
    "healthTags": ["TIME_SYNC_OK"],
    "staleThresholdSeconds": 30
  },
  "historian": {
    "id": "HISTORIAN_MPP",
    "archives": [
      { "id": "HIST_PROCESS_TREND", "sampleSeconds": 5, "retentionDays": 730 },
      { "id": "HIST_VIBRATION_TREND", "sampleSeconds": 1, "retentionDays": 365 },
      { "id": "HIST_DRIVE_EVENT_LOG", "sampleSeconds": 0, "retentionDays": 730 },
      { "id": "HIST_COMMS_LINK_LOG", "sampleSeconds": 10, "retentionDays": 180 },
      { "id": "HIST_PLANT_AUDIT_LOG", "sampleSeconds": 0, "retentionDays": 1825 },
      { "id": "HIST_SAFETY_EVENT_LOG", "sampleSeconds": 0, "retentionDays": 1825 },
      { "id": "HIST_WATER_BALANCE_TREND", "sampleSeconds": 60, "retentionDays": 730 }
    ]
  },
  "staleDataSupervision": {
    "publishedBy": "OnPlantWatchdog",
    "flag": "MPP_Telemetry_Stale",
    "redundantPathRule": "STALE_ONLY_WHEN_NEITHER_GATEWAY_CARRIES_DATA",
    "interpretation": "UNKNOWN_NOT_HEALTHY",
    "note": "A stale or absent value is reported as unknown. It is never rendered, ranked or reasoned about as a healthy plant condition."
  },
  "controlPolicy": {
    "mode": "ADVISORY_ONLY",
    "supervisoryExecution": "NONE",
    "automaticActuation": "NONE",
    "note": "Operator command intents are recorded as engineering metadata. Crushers, feeders, conveyors, mills, pumps, valves and reagent equipment accept no supervisory command, start, stop, reset, inhibit or bypass from this system."
  },
  "restartPolicy": {
    "afterTrip": "MANUAL_ONLY",
    "afterCommunicationRecovery": "MANUAL_ONLY",
    "afterPowerRestoration": "MANUAL_ONLY",
    "automaticRestart": "NONE",
    "note": "Restarting is a human act performed on the plant's own control system under its own permissives. No routine in this reference restarts, re-enables or re-arms anything."
  },
  "interlockPolicy": {
    "bypass": "NONE",
    "reset": "NONE",
    "simulation": "NONE",
    "protectedFunctions": [
      "EMERGENCY_STOP",
      "CONVEYOR_PULL_CORD",
      "MACHINE_GUARD",
      "BELT_ALIGNMENT",
      "ZERO_SPEED",
      "METAL_DETECTOR_STOP",
      "MILL_PROTECTION",
      "FIRE_DETECTION",
      "TAILINGS_LINE_PROTECTION"
    ],
    "note": "Every listed function is observed as diagnostic evidence only. Nothing in this corpus can bypass, reset, inhibit or simulate any of them."
  },
  "reagentPolicy": {
    "supervisoryControl": "NONE",
    "dosingCommands": "NONE",
    "disposition": "REVIEW_ONLY",
    "note": "The reagent system is monitored. Dosing is neither commanded nor advised from here; a reagent finding is escalated to a qualified process and safety engineer."
  },
  "tailingsPolicy": {
    "supervisoryControl": "NONE",
    "disposition": "ESCALATE",
    "note": "The tailings thickener and pumping boundary are monitored. Any deviation is escalated to the responsible tailings engineer under the site's own tailings management system."
  },
  "alarmPhilosophy": {
    "standard": "ISA-18.2",
    "lifecycle": ["NORMAL", "UNACK_ALARM", "ACK_ALARM", "RTN_UNACK"],
    "acknowledgement": {
      "permission": "ALARM_ACK",
      "requiresConfirmation": true,
      "clearsCondition": false,
      "recordedAs": "Audit_AlarmAcknowledged"
    },
    "alarms": [
      { "code": "ALM_CRUSHER_CHOKE", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_CRUSHING_START_TIMEOUT", "priority": "MEDIUM", "requiresAck": true },
      { "code": "ALM_CV03_BELT_SLIP", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_CV02_PULLCORD_OPERATED", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_TRAMP_METAL_DETECTED", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_MILL_DRIVE_FAULT", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_MILL_BEARING_TEMP_HIGH", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_PUMP_CAVITATION", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_CYCLONE_MEASUREMENT_DEVIATION", "priority": "MEDIUM", "requiresAck": true },
      { "code": "ALM_PLANT_COMMS_STALE", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_TIME_SYNC_LOST", "priority": "MEDIUM", "requiresAck": true },
      { "code": "ALM_FEEDER_IN_LOCAL", "priority": "MEDIUM", "requiresAck": true },
      { "code": "ALM_TAILINGS_RAKE_TORQUE_HIGH", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_REAGENT_BUND_LEAK", "priority": "URGENT", "requiresAck": true }
    ]
  },
  "kpis": [
    { "id": "KPI_PLANT_THROUGHPUT", "unit": "t/h" },
    { "id": "KPI_METAL_RECOVERY_ESTIMATE", "unit": "%", "basis": "ON_LINE_MASS_BALANCE_ESTIMATE_NOT_A_LABORATORY_ASSAY" },
    { "id": "KPI_PLANT_AVAILABILITY", "unit": "%" },
    { "id": "KPI_SPECIFIC_ENERGY", "unit": "kWh/t" },
    { "id": "KPI_WATER_INTENSITY", "unit": "m3/t" }
  ]
}
`;

/* ── System ───────────────────────────────────────────────────────────────── */

export const SCADA_05_MINERAL_PROCESSING: AuthoredReferenceSystem = {
  id: "SCADA-05",
  name: t(
    "Mining and mineral processing plant supervisory system",
    "سامانهٔ نظارتی کارخانهٔ معدنی و فرآوری مواد معدنی",
  ),
  domain: t(
    "Run-of-mine feed, crushing, screening, conveying, grinding, classification, flotation, dewatering, tailings boundary and plant utilities",
    "خوراک خام معدن، سنگ‌شکنی، سرند، انتقال نواری، آسیاکنی، طبقه‌بندی، فلوتاسیون، آب‌گیری، مرز باطله و سرویس‌های جانبی کارخانه",
  ),
  sourceType: "SCADA_REFERENCE",
  platform:
    "Vendor-neutral redundant concentrator supervisory platform: JavaScript scripting, declarative screens, declared OPC UA / PROFINET / MODBUS TCP monitoring-only field communications",
  version: "1.0.0",
  revision: 1,
  origin: "SYNTHETIC_ORIGINAL",

  nodes: [
    /* Devices */
    a.node("DEVICE", "SCADA_SERVER_PRIMARY", t("Primary supervisory server", "سرور نظارتی اصلی"), {
      attributes: { deviceCategory: "SCADA_SERVER", networkZone: "SUPERVISORY", protocol: "SCADA" },
    }),
    a.node("DEVICE", "SCADA_SERVER_STANDBY", t("Standby supervisory server", "سرور نظارتی آماده‌به‌کار"), {
      attributes: { deviceCategory: "SCADA_SERVER", networkZone: "SUPERVISORY", protocol: "SCADA" },
      description: t(
        "Hot standby. It mirrors the primary and takes over per the declared failover contract; a design fact, not a runtime this system participates in.",
        "آماده‌به‌کار گرم. سرور اصلی را آینه می‌کند و طبق قرارداد اعلام‌شدهٔ جایگزینی، کار را بر عهده می‌گیرد؛ یک واقعیت طراحی است، نه زمان اجرایی که این سامانه در آن شرکت کند.",
      ),
    }),
    a.node("DEVICE", "HISTORIAN_MPP", t("Concentrator historian", "تاریخ‌نگار کارخانهٔ فرآوری"), {
      domain: "MAINTENANCE",
      attributes: { deviceCategory: "INDUSTRIAL_PC", networkZone: "SUPERVISORY", protocol: "HISTORIAN" },
    }),
    a.node("DEVICE", "COMMS_GATEWAY_A", t("Industrial communication gateway A (primary path)", "دروازهٔ ارتباط صنعتی مسیر A (اصلی)"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "GATEWAY", networkZone: "DMZ", protocol: "OPC_UA" },
      description: t(
        "Monitoring-direction gateway between the plant controllers and the supervisory layer, as DECLARED by the configuration. One of two redundant paths; no session is opened by this repository.",
        "دروازهٔ جهت پایشی میان کنترلرهای کارخانه و لایهٔ نظارتی، آن‌گونه که پیکربندی اعلام می‌کند. یکی از دو مسیر افزونه؛ هیچ نشستی توسط این مخزن باز نمی‌شود.",
      ),
    }),
    a.node("DEVICE", "COMMS_GATEWAY_B", t("Industrial communication gateway B (redundant path)", "دروازهٔ ارتباط صنعتی مسیر B (افزونه)"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "GATEWAY", networkZone: "DMZ", protocol: "OPC_UA" },
    }),
    a.node("DEVICE", "TIME_SERVER_MPP", t("Plant time server", "سرور زمان کارخانه"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "OTHER", networkZone: "SUPERVISORY", protocol: "OTHER" },
    }),
    a.node("DEVICE", "PLC_CRUSHING", t("Crushing and screening controller", "کنترلر سنگ‌شکنی و سرند"), {
      subsystem: "CRUSHING",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "PLC_CONVEYING", t("Conveying controller", "کنترلر انتقال نواری"), {
      subsystem: "CONVEYING",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "PLC_GRINDING", t("Grinding circuit controller", "کنترلر مدار آسیاکنی"), {
      subsystem: "GRINDING",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "PLC_FLOTATION", t("Flotation and reagent controller", "کنترلر فلوتاسیون و معرف‌ها"), {
      subsystem: "FLOTATION",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "PLC_DEWATERING", t("Dewatering and tailings controller", "کنترلر آب‌گیری و باطله"), {
      subsystem: "DEWATERING",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "PLC_UTILITIES", t("Utilities controller", "کنترلر سرویس‌های جانبی"), {
      subsystem: "UTILITIES",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "SAFETY_PLC_CONVEYOR", t("Conveyor safety controller", "کنترلر ایمنی نوار نقاله"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { deviceCategory: "SAFETY_CONTROLLER", networkZone: "SAFETY", protocol: "OTHER" },
      description: t(
        "Owns the pull-cord, emergency-stop, belt-alignment and zero-speed circuits. Read-only diagnostic evidence: nothing in Hermes resets, inhibits, bypasses or simulates a single one of its functions.",
        "مدارهای طناب توقف اضطراری، توقف اضطراری، انحراف نوار و سرعت صفر را در اختیار دارد. شاهد تشخیصی فقط‌خواندنی: هیچ‌چیز در هرمس حتی یکی از توابع آن را ریست، غیرفعال، دور یا شبیه‌سازی نمی‌کند.",
      ),
    }),
    a.node("DEVICE", "VFD_SAG_MILL", t("SAG mill drive", "درایو آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "DRIVES",
      attributes: { deviceCategory: "VFD", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "VFD_CV03_DRIVE", t("Conveyor CV-03 drive", "درایو نوار نقالهٔ CV-03"), {
      subsystem: "CONVEYING",
      domain: "DRIVES",
      attributes: { deviceCategory: "VFD", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "MCC_CONCENTRATOR", t("Concentrator motor control centre", "مرکز کنترل موتور کارخانهٔ فرآوری"), {
      domain: "DRIVES",
      attributes: { deviceCategory: "MCC", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "OPERATOR_CLIENT_MPP", t("Operator client", "کلاینت اپراتور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { deviceCategory: "HMI", networkZone: "SUPERVISORY" },
    }),

    /* Equipment */
    a.node("EQUIPMENT", "ROM_HOPPER", t("Run-of-mine hopper", "هاپر خوراک خام معدن"), {
      subsystem: "ROM_FEED",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "APRON_FEEDER_AF01", t("Apron feeder AF-01", "تغذیه‌کنندهٔ صفحه‌ای AF-01"), {
      subsystem: "ROM_FEED",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "GRIZZLY_FEEDER_GF01", t("Grizzly feeder GF-01", "تغذیه‌کنندهٔ گریزلی GF-01"), {
      subsystem: "ROM_FEED",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "PRIMARY_JAW_CRUSHER_CR01", t("Primary jaw crusher CR-01", "سنگ‌شکن فکی اولیه CR-01"), {
      subsystem: "CRUSHING",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Observed only. Nothing in Hermes starts, stops, inches or clears it, and its guard interlock is never bypassed; a choked cavity is cleared by qualified people under isolation and permit-to-work.",
        "فقط مشاهده می‌شود. هیچ‌چیز در هرمس آن را راه‌اندازی، متوقف، لِنگی یا تخلیه نمی‌کند و اینترلاک حفاظ آن هرگز دور زده نمی‌شود؛ محفظهٔ گرفته با افراد واجد صلاحیت و تحت جداسازی و مجوز کار پاک می‌شود.",
      ),
    }),
    a.node("EQUIPMENT", "SECONDARY_CONE_CRUSHER_CR02", t("Secondary cone crusher CR-02", "سنگ‌شکن مخروطی ثانویه CR-02"), {
      subsystem: "CRUSHING",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "VIBRATING_SCREEN_SC01", t("Vibrating screen SC-01", "سرند لرزان SC-01"), {
      subsystem: "SCREENING",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "CONVEYOR_CV01", t("Conveyor CV-01 (crusher discharge)", "نوار نقالهٔ CV-01 (تخلیهٔ سنگ‌شکن)"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "CONVEYOR_CV02", t("Conveyor CV-02 (screen transfer)", "نوار نقالهٔ CV-02 (انتقال سرند)"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "CONVEYOR_CV03", t("Conveyor CV-03 (stockpile feed)", "نوار نقالهٔ CV-03 (خوراک دپو)"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "The weightometer conveyor. It carries the tonnage every throughput and specific-energy figure in this reference is derived from, and it is observed only — no supervisory start, stop or speed command exists for it.",
        "نوار دارای باسکول نواری. تناژی را حمل می‌کند که هر شاخص ظرفیت و انرژی ویژه در این مرجع از آن استخراج می‌شود، و فقط مشاهده می‌شود — هیچ فرمان نظارتی راه‌اندازی، توقف یا سرعت برای آن وجود ندارد.",
      ),
    }),
    a.node("EQUIPMENT", "METAL_DETECTOR_MD01", t("Tramp metal detector MD-01", "فلزیاب مواد مزاحم MD-01"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "MAGNETIC_SEPARATOR_MS01", t("Overbelt magnetic separator MS-01", "جداکنندهٔ مغناطیسی روی‌نواری MS-01"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "COARSE_ORE_STOCKPILE", t("Coarse ore stockpile", "دپوی سنگ معدن درشت"), {
      subsystem: "STOCKPILE",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "SAG_MILL_ML01", t("SAG mill ML-01", "آسیای نیمه‌خودشکن ML-01"), {
      subsystem: "GRINDING",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Observed only. No supervisory start, stop, inching, barring or speed command exists for it anywhere in this corpus, and its protection interlock is never bypassed.",
        "فقط مشاهده می‌شود. در هیچ جای این پیکره هیچ فرمان نظارتی راه‌اندازی، توقف، لِنگی، چرخش آهسته یا سرعت برای آن وجود ندارد و اینترلاک حفاظتی آن هرگز دور زده نمی‌شود.",
      ),
    }),
    a.node("EQUIPMENT", "BALL_MILL_ML02", t("Ball mill ML-02", "آسیای گلوله‌ای ML-02"), {
      subsystem: "GRINDING",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "MILL_DISCHARGE_SUMP", t("Mill discharge sump", "حوضچهٔ تخلیهٔ آسیا"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "CYCLONE_FEED_PUMP_PU01", t("Cyclone feed slurry pump PU-01", "پمپ دوغاب خوراک هیدروسیکلون PU-01"), {
      subsystem: "CLASSIFICATION",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "HYDROCYCLONE_CLUSTER_CY01", t("Hydrocyclone cluster CY-01", "خوشهٔ هیدروسیکلون CY-01"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "FLOTATION_ROW_FL01", t("Flotation row FL-01", "ردیف فلوتاسیون FL-01"), {
      subsystem: "FLOTATION",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "REAGENT_SYSTEM_RG01", t("Reagent preparation and dosing system RG-01", "سامانهٔ آماده‌سازی و دوزینگ معرف شیمیایی RG-01"), {
      subsystem: "REAGENTS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "MONITORED ONLY. No dosing command intent exists for it anywhere in this corpus, no routine reads or writes a setpoint of it, and every finding about it is escalated to a qualified process and safety engineer rather than acted on.",
        "فقط پایش می‌شود. در هیچ جای این پیکره هیچ قصد فرمان دوزینگ برای آن وجود ندارد، هیچ روالی نقطهٔ تنظیم آن را نمی‌خواند یا نمی‌نویسد و هر یافته دربارهٔ آن به‌جای اقدام، به مهندس فرایند و ایمنی واجد صلاحیت ارجاع می‌شود.",
      ),
    }),
    a.node("EQUIPMENT", "CONCENTRATE_THICKENER_TH01", t("Concentrate thickener TH-01", "غلیظ‌کنندهٔ کنسانتره TH-01"), {
      subsystem: "DEWATERING",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "CONCENTRATE_FILTER_FP01", t("Concentrate filter press FP-01", "فیلترپرس کنسانتره FP-01"), {
      subsystem: "DEWATERING",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "TAILINGS_THICKENER_TH02", t("Tailings thickener TH-02", "غلیظ‌کنندهٔ باطله TH-02"), {
      subsystem: "TAILINGS",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "The boundary of the tailings management system. Monitored only: nothing here starts, stops or trims it, and any deviation is escalated to the responsible tailings engineer under the site's own governance.",
        "مرز سامانهٔ مدیریت باطله. فقط پایش می‌شود: هیچ‌چیز اینجا آن را راه‌اندازی، متوقف یا تنظیم نمی‌کند و هر انحراف تحت حاکمیت خود سایت به مهندس مسئول باطله ارجاع می‌شود.",
      ),
    }),
    a.node("EQUIPMENT", "TAILINGS_PUMP_PU02", t("Tailings transfer pump PU-02", "پمپ انتقال باطله PU-02"), {
      subsystem: "TAILINGS",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "DUST_SUPPRESSION_DS01", t("Dust suppression system DS-01", "سامانهٔ کنترل غبار DS-01"), {
      subsystem: "UTILITIES",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "PROCESS_WATER_TANK_PW01", t("Process water tank PW-01", "مخزن آب فرایندی PW-01"), {
      subsystem: "UTILITIES",
      domain: "PROCESS",
    }),

    /* Run-of-mine feed */
    a.node("TAG", "ROM_HOPPER_LEVEL", t("ROM hopper level", "سطح هاپر خوراک خام"), {
      subsystem: "ROM_FEED",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "AF01_FEEDER_SPEED", t("Apron feeder speed", "سرعت تغذیه‌کنندهٔ صفحه‌ای"), {
      subsystem: "ROM_FEED",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "AF01_FEEDER_RUNNING", t("Apron feeder running", "در حال کار بودن تغذیه‌کنندهٔ صفحه‌ای"), {
      subsystem: "ROM_FEED",
      domain: "DRIVES",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "AF01_MODE_REMOTE", t("Apron feeder in remote mode", "قرار داشتن تغذیه‌کننده در حالت دور"), {
      subsystem: "ROM_FEED",
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "The field panel selector as the controller reads it. LOCAL means the plant sequence cannot reach the feeder — an operating-mode fact, never a fault of the feeder itself.",
        "کلید انتخاب تابلوی محلی، آن‌گونه که کنترلر می‌خواند. حالت محلی یعنی توالی کارخانه به تغذیه‌کننده دسترسی ندارد — یک واقعیت حالت بهره‌برداری است، نه خرابی خود تغذیه‌کننده.",
      ),
    }),
    a.node("TAG", "GF01_RUNNING", t("Grizzly feeder running", "در حال کار بودن تغذیه‌کنندهٔ گریزلی"), {
      subsystem: "ROM_FEED",
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Crushing */
    a.node("TAG", "CR01_MOTOR_CURRENT", t("Primary crusher motor current", "جریان موتور سنگ‌شکن اولیه"), {
      subsystem: "CRUSHING",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ" },
    }),
    a.node("TAG", "CR01_POWER_DRAW", t("Primary crusher power draw", "توان مصرفی سنگ‌شکن اولیه"), {
      subsystem: "CRUSHING",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "kW", accessMode: "READ" },
    }),
    a.node("TAG", "CR01_CAVITY_LEVEL", t("Primary crusher cavity level", "سطح محفظهٔ سنگ‌شکن اولیه"), {
      subsystem: "CRUSHING",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "CR01_HYDRAULIC_PRESSURE", t("Primary crusher hydraulic pressure", "فشار هیدرولیک سنگ‌شکن اولیه"), {
      subsystem: "CRUSHING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" },
    }),
    a.node("TAG", "CR01_RUNNING", t("Primary crusher running", "در حال کار بودن سنگ‌شکن اولیه"), {
      subsystem: "CRUSHING",
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CR01_GUARD_CLOSED", t("Primary crusher guard closed", "بسته بودن حفاظ سنگ‌شکن اولیه"), {
      subsystem: "CRUSHING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CR02_MOTOR_CURRENT", t("Secondary crusher motor current", "جریان موتور سنگ‌شکن ثانویه"), {
      subsystem: "CRUSHING",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ" },
    }),
    a.node("TAG", "CR02_RUNNING", t("Secondary crusher running", "در حال کار بودن سنگ‌شکن ثانویه"), {
      subsystem: "CRUSHING",
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Screening */
    a.node("TAG", "SC01_VIBRATION", t("Screen vibration amplitude", "دامنهٔ لرزش سرند"), {
      subsystem: "SCREENING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "mm/s", accessMode: "READ" },
    }),
    a.node("TAG", "SC01_BEARING_TEMP", t("Screen bearing temperature", "دمای یاتاقان سرند"), {
      subsystem: "SCREENING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "SC01_RUNNING", t("Screen running", "در حال کار بودن سرند"), {
      subsystem: "SCREENING",
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Conveying */
    a.node("TAG", "CV01_BELT_SPEED", t("CV-01 belt speed", "سرعت نوار CV-01"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "m/s", accessMode: "READ" },
    }),
    a.node("TAG", "CV01_RUNNING", t("CV-01 running", "در حال کار بودن CV-01"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CV02_BELT_SPEED", t("CV-02 belt speed", "سرعت نوار CV-02"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "m/s", accessMode: "READ" },
    }),
    a.node("TAG", "CV02_RUNNING", t("CV-02 running", "در حال کار بودن CV-02"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CV02_PULLCORD_HEALTHY", t("CV-02 pull-cord circuit healthy", "سلامت مدار طناب توقف اضطراری CV-02"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Read-only diagnostic evidence owned by the conveyor safety controller. A pull-cord that has operated is reset at the lanyard by a person who has walked the belt; nothing in Hermes resets, inhibits or bypasses it.",
        "شاهد تشخیصی فقط‌خواندنی در اختیار کنترلر ایمنی نوار. طناب عمل‌کرده را فردی که در طول نوار قدم زده است در محل بازنشانی می‌کند؛ هیچ‌چیز در هرمس آن را ریست، غیرفعال یا دور نمی‌زند.",
      ),
    }),
    a.node("TAG", "CV02_ESTOP_HEALTHY", t("CV-02 emergency-stop circuit healthy", "سلامت مدار توقف اضطراری CV-02"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CV02_BELT_ALIGN_HEALTHY", t("CV-02 belt alignment healthy", "سلامت هم‌راستایی نوار CV-02"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CV03_BELT_SPEED", t("CV-03 belt speed", "سرعت نوار CV-03"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "m/s", accessMode: "READ" },
    }),
    a.node("TAG", "CV03_DRIVE_SPEED_REFERENCE", t("CV-03 drive speed reference", "مرجع سرعت درایو CV-03"), {
      subsystem: "CONVEYING",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "m/s", accessMode: "READ" },
      description: t(
        "What the drive is asked to turn at, read back for comparison. The gap between this and the measured belt speed is what a slipping belt looks like from the control room.",
        "سرعتی که از درایو خواسته شده و برای مقایسه بازخوانی می‌شود. فاصلهٔ میان این مقدار و سرعت اندازه‌گیری‌شدهٔ نوار، همان چیزی است که لغزش نوار از اتاق کنترل به آن شکل دیده می‌شود.",
      ),
    }),
    a.node("TAG", "CV03_DRIVE_CURRENT", t("CV-03 drive current", "جریان درایو CV-03"), {
      subsystem: "CONVEYING",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ" },
    }),
    a.node("TAG", "CV03_DRIVE_FAULT", t("CV-03 drive fault", "خطای درایو CV-03"), {
      subsystem: "CONVEYING",
      domain: "DRIVES",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CV03_ZERO_SPEED_TRIP", t("CV-03 zero-speed device tripped", "عمل‌کردن دستگاه سرعت صفر CV-03"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CV03_BELT_ALIGN_HEALTHY", t("CV-03 belt alignment healthy", "سلامت هم‌راستایی نوار CV-03"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CV03_PULLCORD_HEALTHY", t("CV-03 pull-cord circuit healthy", "سلامت مدار طناب توقف اضطراری CV-03"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CV03_DRIVE_PULLEY_BEARING_TEMP", t("CV-03 drive pulley bearing temperature", "دمای یاتاقان درام محرک CV-03"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "CV03_WEIGHTOMETER_RATE", t("CV-03 weightometer rate", "نرخ باسکول نواری CV-03"), {
      subsystem: "CONVEYING",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "t/h", accessMode: "READ" },
      description: t(
        "The plant's tonnage reference. Throughput, specific energy and the recovery estimate are all derived from it, so a belt that slips falsifies three KPIs at once.",
        "مرجع تناژ کارخانه. ظرفیت، انرژی ویژه و برآورد بازیابی همگی از آن استخراج می‌شوند، بنابراین لغزش نوار هم‌زمان سه شاخص را نادرست می‌کند.",
      ),
    }),

    /* Tramp metal removal */
    a.node("TAG", "MD01_METAL_DETECTED", t("Tramp metal detected", "شناسایی فلز مزاحم"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "MS01_MAGNET_CURRENT", t("Overbelt magnet current", "جریان آهن‌ربای روی‌نواری"), {
      subsystem: "CONVEYING",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ" },
    }),
    a.node("TAG", "MS01_RUNNING", t("Magnetic separator running", "در حال کار بودن جداکنندهٔ مغناطیسی"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Stockpile */
    a.node("TAG", "STOCKPILE_LEVEL", t("Coarse ore stockpile level", "سطح دپوی سنگ معدن درشت"), {
      subsystem: "STOCKPILE",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "STOCKPILE_RECLAIM_RATE", t("Stockpile reclaim rate", "نرخ برداشت از دپو"), {
      subsystem: "STOCKPILE",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "t/h", accessMode: "READ" },
    }),

    /* Grinding */
    a.node("TAG", "ML01_MILL_POWER", t("SAG mill power", "توان آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "kW", accessMode: "READ" },
    }),
    a.node("TAG", "ML01_MOTOR_CURRENT", t("SAG mill motor current", "جریان موتور آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ" },
    }),
    a.node("TAG", "ML01_MOTOR_WINDING_TEMP", t("SAG mill motor winding temperature", "دمای سیم‌پیچ موتور آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "ML01_DRIVE_FAULT", t("SAG mill drive fault", "خطای درایو آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "DRIVES",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "ML01_PINION_BEARING_TEMP", t("SAG mill pinion bearing temperature", "دمای یاتاقان پینیون آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "ML01_SHELL_VIBRATION", t("SAG mill shell vibration", "لرزش بدنهٔ آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "mm/s", accessMode: "READ" },
    }),
    a.node("TAG", "ML01_MILL_SPEED", t("SAG mill speed", "سرعت آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "ML01_FEED_RATE", t("SAG mill feed rate", "نرخ خوراک آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "t/h", accessMode: "READ" },
    }),
    a.node("TAG", "ML01_BEARING_LUBE_PRESSURE", t("SAG mill bearing lubrication pressure", "فشار روان‌کاری یاتاقان آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" },
    }),
    a.node("TAG", "ML01_LUBE_OIL_TEMP", t("SAG mill lubrication oil temperature", "دمای روغن روان‌کاری آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "ML02_MILL_POWER", t("Ball mill power", "توان آسیای گلوله‌ای"), {
      subsystem: "GRINDING",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "kW", accessMode: "READ" },
    }),
    a.node("TAG", "ML02_PINION_BEARING_TEMP", t("Ball mill pinion bearing temperature", "دمای یاتاقان پینیون آسیای گلوله‌ای"), {
      subsystem: "GRINDING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),

    /* Slurry transport */
    a.node("TAG", "SUMP_LEVEL", t("Mill discharge sump level", "سطح حوضچهٔ تخلیهٔ آسیا"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "PU01_SUCTION_PRESSURE", t("Cyclone feed pump suction pressure", "فشار مکش پمپ خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "kPa", accessMode: "READ" },
    }),
    a.node("TAG", "PU01_DISCHARGE_PRESSURE", t("Cyclone feed pump discharge pressure", "فشار خروجی پمپ خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "kPa", accessMode: "READ" },
    }),
    a.node("TAG", "PU01_FLOW", t("Cyclone feed flow", "دبی خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ" },
    }),
    a.node("TAG", "PU01_MOTOR_CURRENT", t("Cyclone feed pump motor current", "جریان موتور پمپ خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ" },
    }),
    a.node("TAG", "PU01_VIBRATION", t("Cyclone feed pump vibration", "لرزش پمپ خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "mm/s", accessMode: "READ" },
    }),
    a.node("TAG", "PU01_SPEED", t("Cyclone feed pump speed", "سرعت پمپ خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "PU01_RUNNING", t("Cyclone feed pump running", "در حال کار بودن پمپ خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Classification */
    a.node("TAG", "CY01_FEED_PRESSURE", t("Hydrocyclone feed pressure", "فشار خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "kPa", accessMode: "READ" },
    }),
    a.node("TAG", "CY01_FEED_DENSITY", t("Hydrocyclone feed density", "چگالی خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "t/m3", accessMode: "READ" },
    }),
    a.node("TAG", "CY01_OVERFLOW_DENSITY", t("Hydrocyclone overflow density", "چگالی سرریز هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "t/m3", accessMode: "READ" },
    }),
    a.node("TAG", "CY01_DENSITY_QUALITY_GOOD", t("Hydrocyclone density measurement quality good", "مطلوب بودن کیفیت اندازه‌گیری چگالی هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "QUALITY",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "The transmitter's own quality flag. When it drops, the density reading beside it is not a process fact and must not be treated as one.",
        "پرچم کیفیت خود ترانسمیتر. با افت آن، قرائت چگالی کنار آن یک واقعیت فرایندی نیست و نباید چنین تلقی شود.",
      ),
    }),
    a.node("TAG", "CY01_OPEN_CYCLONES", t("Hydrocyclones in service", "تعداد هیدروسیکلون‌های در سرویس"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
      attributes: { dataType: "INT", accessMode: "READ" },
    }),

    /* Flotation */
    a.node("TAG", "FL01_CELL_LEVEL", t("Flotation cell level", "سطح سلول فلوتاسیون"), {
      subsystem: "FLOTATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "FL01_AIR_FLOW", t("Flotation air flow", "دبی هوای فلوتاسیون"), {
      subsystem: "FLOTATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "Nm3/h", accessMode: "READ" },
    }),
    a.node("TAG", "FL01_PULP_PH", t("Flotation pulp pH", "pH پالپ فلوتاسیون"), {
      subsystem: "FLOTATION",
      domain: "QUALITY",
      attributes: { dataType: "REAL", accessMode: "READ" },
    }),
    a.node("TAG", "FL01_FROTH_DEPTH", t("Flotation froth depth", "عمق کف فلوتاسیون"), {
      subsystem: "FLOTATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "mm", accessMode: "READ" },
    }),

    /* Reagents — monitored only */
    a.node("TAG", "RG01_COLLECTOR_FLOW", t("Collector reagent flow", "دبی معرف کلکتور"), {
      subsystem: "REAGENTS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "L/h", accessMode: "READ" },
      description: t(
        "Monitored, never commanded. No dosing setpoint of any reagent is written, advised or trimmed from this system.",
        "پایش می‌شود و هرگز فرمان داده نمی‌شود. هیچ نقطهٔ تنظیم دوزینگ هیچ معرفی از این سامانه نوشته، توصیه یا اصلاح نمی‌شود.",
      ),
    }),
    a.node("TAG", "RG01_FROTHER_FLOW", t("Frother reagent flow", "دبی معرف کف‌ساز"), {
      subsystem: "REAGENTS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "L/h", accessMode: "READ" },
    }),
    a.node("TAG", "RG01_TANK_LEVEL", t("Reagent tank level", "سطح مخزن معرف"), {
      subsystem: "REAGENTS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "RG01_BUND_LEAK_DETECTED", t("Reagent bund leak detected", "شناسایی نشت در حوضچهٔ مهار معرف"), {
      subsystem: "REAGENTS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Concentrate dewatering */
    a.node("TAG", "TH01_BED_LEVEL", t("Concentrate thickener bed level", "سطح بستر غلیظ‌کنندهٔ کنسانتره"), {
      subsystem: "DEWATERING",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "m", accessMode: "READ" },
    }),
    a.node("TAG", "TH01_RAKE_TORQUE", t("Concentrate thickener rake torque", "گشتاور ریک غلیظ‌کنندهٔ کنسانتره"), {
      subsystem: "DEWATERING",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "TH01_UNDERFLOW_DENSITY", t("Concentrate thickener underflow density", "چگالی ته‌ریز غلیظ‌کنندهٔ کنسانتره"), {
      subsystem: "DEWATERING",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "t/m3", accessMode: "READ" },
    }),
    a.node("TAG", "FP01_CHAMBER_PRESSURE", t("Filter press chamber pressure", "فشار محفظهٔ فیلترپرس"), {
      subsystem: "DEWATERING",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" },
    }),
    a.node("TAG", "FP01_FILTRATE_FLOW", t("Filter press filtrate flow", "دبی فیلترای فیلترپرس"), {
      subsystem: "DEWATERING",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ" },
    }),

    /* Tailings boundary */
    a.node("TAG", "TH02_BED_LEVEL", t("Tailings thickener bed level", "سطح بستر غلیظ‌کنندهٔ باطله"), {
      subsystem: "TAILINGS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "m", accessMode: "READ" },
    }),
    a.node("TAG", "TH02_RAKE_TORQUE", t("Tailings thickener rake torque", "گشتاور ریک غلیظ‌کنندهٔ باطله"), {
      subsystem: "TAILINGS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
      description: t(
        "Rake torque is the tailings thickener's structural warning. It is read-only evidence: no lift, no speed change and no rake command exists here, and a rising torque is escalated rather than managed from a screen.",
        "گشتاور ریک هشدار سازه‌ای غلیظ‌کنندهٔ باطله است. شاهدی فقط‌خواندنی است: اینجا هیچ فرمان بالابردن، تغییر سرعت یا حرکت ریک وجود ندارد و گشتاور فزاینده به‌جای مدیریت از روی صفحه، ارجاع می‌شود.",
      ),
    }),
    a.node("TAG", "TH02_UNDERFLOW_DENSITY", t("Tailings thickener underflow density", "چگالی ته‌ریز غلیظ‌کنندهٔ باطله"), {
      subsystem: "TAILINGS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "t/m3", accessMode: "READ" },
    }),
    a.node("TAG", "PU02_DISCHARGE_PRESSURE", t("Tailings pump discharge pressure", "فشار خروجی پمپ باطله"), {
      subsystem: "TAILINGS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "kPa", accessMode: "READ" },
    }),
    a.node("TAG", "PU02_RUNNING", t("Tailings pump running", "در حال کار بودن پمپ باطله"), {
      subsystem: "TAILINGS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "TAILINGS_LINE_PRESSURE", t("Tailings pipeline pressure", "فشار خط لولهٔ باطله"), {
      subsystem: "TAILINGS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "kPa", accessMode: "READ" },
    }),

    /* Utilities */
    a.node("TAG", "DS01_SPRAY_PRESSURE", t("Dust suppression spray pressure", "فشار پاشش کنترل غبار"), {
      subsystem: "UTILITIES",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" },
    }),
    a.node("TAG", "DS01_RUNNING", t("Dust suppression running", "در حال کار بودن کنترل غبار"), {
      subsystem: "UTILITIES",
      domain: "PROCESS",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "PW01_TANK_LEVEL", t("Process water tank level", "سطح مخزن آب فرایندی"), {
      subsystem: "UTILITIES",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "PW01_MAKEUP_FLOW", t("Process water make-up flow", "دبی آب جبرانی فرایند"), {
      subsystem: "UTILITIES",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ" },
    }),
    a.node("TAG", "PW01_RECLAIM_FLOW", t("Reclaimed water return flow", "دبی بازگشت آب بازیافتی"), {
      subsystem: "UTILITIES",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ" },
      description: t(
        "Water returning from the tailings thickener overflow. When it falls away while make-up rises, the plant's water balance has moved even though every tank still looks normal.",
        "آبی که از سرریز غلیظ‌کنندهٔ باطله بازمی‌گردد. وقتی این دبی افت می‌کند و هم‌زمان آب جبرانی بالا می‌رود، توازن آب کارخانه جابه‌جا شده است، هرچند همهٔ مخازن هنوز عادی به نظر برسند.",
      ),
    }),

    /* Mode, communications and time */
    a.node("TAG", "PLANT_MODE_REMOTE", t("Plant in remote/auto", "کارخانه در حالت دور/خودکار"), {
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "GATEWAY_A_LINK_OK", t("Gateway A link healthy", "سلامت پیوند دروازهٔ A"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "GATEWAY_B_LINK_OK", t("Gateway B link healthy", "سلامت پیوند دروازهٔ B"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "TELEMETRY_AGE", t("Plant sample age", "سن نمونهٔ کارخانه"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "s", accessMode: "READ" },
    }),
    a.node("TAG", "TIME_SYNC_OK", t("Time synchronisation healthy", "سلامت همگام‌سازی زمان"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Supervisory tag database */
    a.node("SCADA_TAG", "MPP_Rom_Hopper_Level", t("ROM hopper level (supervisory)", "سطح هاپر خوراک خام (نظارتی)"), {
      subsystem: "ROM_FEED",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Feeder_Speed", t("Apron feeder speed (supervisory)", "سرعت تغذیه‌کنندهٔ صفحه‌ای (نظارتی)"), {
      subsystem: "ROM_FEED",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Feeder_Mode_Remote", t("Apron feeder remote mode (supervisory)", "حالت دور تغذیه‌کنندهٔ صفحه‌ای (نظارتی)"), {
      subsystem: "ROM_FEED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Cr01_Power_Draw", t("Primary crusher power (supervisory)", "توان سنگ‌شکن اولیه (نظارتی)"), {
      subsystem: "CRUSHING",
      attributes: { dataType: "REAL", unit: "kW", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Cr01_Cavity_Level", t("Primary crusher cavity level (supervisory)", "سطح محفظهٔ سنگ‌شکن اولیه (نظارتی)"), {
      subsystem: "CRUSHING",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Sc01_Vibration", t("Screen vibration (supervisory)", "لرزش سرند (نظارتی)"), {
      subsystem: "SCREENING",
      attributes: { dataType: "REAL", unit: "mm/s", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Cv02_Pullcord_Healthy", t("CV-02 pull-cord healthy (supervisory)", "سلامت طناب توقف اضطراری CV-02 (نظارتی)"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Cv03_Belt_Speed", t("CV-03 belt speed (supervisory)", "سرعت نوار CV-03 (نظارتی)"), {
      subsystem: "CONVEYING",
      attributes: { dataType: "REAL", unit: "m/s", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Cv03_Align_Healthy", t("CV-03 belt alignment healthy (supervisory)", "سلامت هم‌راستایی نوار CV-03 (نظارتی)"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Cv03_Weightometer_Rate", t("CV-03 weightometer rate (supervisory)", "نرخ باسکول نواری CV-03 (نظارتی)"), {
      subsystem: "CONVEYING",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "t/h", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Md01_Metal_Detected", t("Tramp metal detected (supervisory)", "شناسایی فلز مزاحم (نظارتی)"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Stockpile_Level", t("Stockpile level (supervisory)", "سطح دپو (نظارتی)"), {
      subsystem: "STOCKPILE",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Ml01_Mill_Power", t("SAG mill power (supervisory)", "توان آسیای نیمه‌خودشکن (نظارتی)"), {
      subsystem: "GRINDING",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "kW", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Ml01_Pinion_Bearing_Temp", t("SAG mill pinion bearing temperature (supervisory)", "دمای یاتاقان پینیون آسیای نیمه‌خودشکن (نظارتی)"), {
      subsystem: "GRINDING",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Ml01_Shell_Vibration", t("SAG mill shell vibration (supervisory)", "لرزش بدنهٔ آسیای نیمه‌خودشکن (نظارتی)"), {
      subsystem: "GRINDING",
      attributes: { dataType: "REAL", unit: "mm/s", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Ml01_Lube_Pressure", t("SAG mill lubrication pressure (supervisory)", "فشار روان‌کاری آسیای نیمه‌خودشکن (نظارتی)"), {
      subsystem: "GRINDING",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Ml01_Feed_Rate", t("SAG mill feed rate (supervisory)", "نرخ خوراک آسیای نیمه‌خودشکن (نظارتی)"), {
      subsystem: "GRINDING",
      attributes: { dataType: "REAL", unit: "t/h", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Sump_Level", t("Mill discharge sump level (supervisory)", "سطح حوضچهٔ تخلیهٔ آسیا (نظارتی)"), {
      subsystem: "CLASSIFICATION",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Pu01_Suction_Pressure", t("Cyclone feed pump suction pressure (supervisory)", "فشار مکش پمپ خوراک هیدروسیکلون (نظارتی)"), {
      subsystem: "CLASSIFICATION",
      attributes: { dataType: "REAL", unit: "kPa", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Pu01_Flow", t("Cyclone feed flow (supervisory)", "دبی خوراک هیدروسیکلون (نظارتی)"), {
      subsystem: "CLASSIFICATION",
      attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Cy01_Feed_Pressure", t("Hydrocyclone feed pressure (supervisory)", "فشار خوراک هیدروسیکلون (نظارتی)"), {
      subsystem: "CLASSIFICATION",
      attributes: { dataType: "REAL", unit: "kPa", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Cy01_Feed_Density", t("Hydrocyclone feed density (supervisory)", "چگالی خوراک هیدروسیکلون (نظارتی)"), {
      subsystem: "CLASSIFICATION",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "t/m3", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Cy01_Density_Quality_Good", t("Hydrocyclone density quality good (supervisory)", "مطلوب بودن کیفیت چگالی هیدروسیکلون (نظارتی)"), {
      subsystem: "CLASSIFICATION",
      domain: "QUALITY",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Fl01_Cell_Level", t("Flotation cell level (supervisory)", "سطح سلول فلوتاسیون (نظارتی)"), {
      subsystem: "FLOTATION",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Rg01_Collector_Flow", t("Collector reagent flow (supervisory)", "دبی معرف کلکتور (نظارتی)"), {
      subsystem: "REAGENTS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "L/h", accessMode: "READ", protocol: "OPC_UA" },
      description: t(
        "Read-only. The reagent system appears on the operator interface as an indication and nowhere as a control: there is no reagent command intent, no dosing button and no setpoint anywhere in this reference.",
        "فقط‌خواندنی. سامانهٔ معرف در رابط اپراتور تنها به‌صورت نشانگر ظاهر می‌شود و در هیچ جا به‌صورت کنترل: در این مرجع هیچ قصد فرمان معرف، هیچ دکمهٔ دوزینگ و هیچ نقطهٔ تنظیمی وجود ندارد.",
      ),
    }),
    a.node("SCADA_TAG", "MPP_Rg01_Bund_Leak", t("Reagent bund leak (supervisory)", "نشت حوضچهٔ مهار معرف (نظارتی)"), {
      subsystem: "REAGENTS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Th01_Rake_Torque", t("Concentrate thickener rake torque (supervisory)", "گشتاور ریک غلیظ‌کنندهٔ کنسانتره (نظارتی)"), {
      subsystem: "DEWATERING",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Th02_Rake_Torque", t("Tailings thickener rake torque (supervisory)", "گشتاور ریک غلیظ‌کنندهٔ باطله (نظارتی)"), {
      subsystem: "TAILINGS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Pw01_Tank_Level", t("Process water tank level (supervisory)", "سطح مخزن آب فرایندی (نظارتی)"), {
      subsystem: "UTILITIES",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Plant_Mode", t("Plant mode (supervisory)", "حالت کارخانه (نظارتی)"), {
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "MPP_Gw_A_Link_Ok", t("Gateway A link healthy (supervisory)", "سلامت پیوند دروازهٔ A (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "MPP_Gw_B_Link_Ok", t("Gateway B link healthy (supervisory)", "سلامت پیوند دروازهٔ B (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "MPP_Telemetry_Age", t("Plant sample age (supervisory)", "سن نمونهٔ کارخانه (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "s", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "MPP_Time_Sync_Ok", t("Time synchronisation healthy (supervisory)", "سلامت همگام‌سازی زمان (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "MPP_Telemetry_Stale", t("Plant telemetry stale flag", "پرچم کهنگی تله‌متری کارخانه"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ_WRITE" },
      description: t(
        "Published by the watchdog rather than inferred by each screen. Stale means NEITHER gateway is carrying data — never that the plant behind it is running normally.",
        "به‌جای استنتاج در هر صفحه، توسط دیدبان منتشر می‌شود. کهنگی یعنی هیچ‌یک از دو دروازه داده منتقل نمی‌کند — و هرگز به این معنا نیست که کارخانهٔ پشت آن عادی کار می‌کند.",
      ),
    }),
    a.node("SCADA_TAG", "MPP_Specific_Energy_Value", t("Calculated specific energy", "انرژی ویژهٔ محاسبه‌شده"), {
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "kWh/t", accessMode: "READ_WRITE" },
      description: t(
        "A CALCULATED supervisory figure, not a measurement. It is milling power over weightometer tonnage, published only while the picture is fresh; a stale input produces no value at all rather than a plausible one.",
        "یک مقدار نظارتی محاسبه‌شده است، نه اندازه‌گیری. توان آسیاکنی تقسیم بر تناژ باسکول نواری است و تنها هنگام تازه بودن تصویر منتشر می‌شود؛ ورودی کهنه به‌جای مقداری باورپذیر، اصلاً مقداری تولید نمی‌کند.",
      ),
    }),
    a.node("SCADA_TAG", "MPP_Feeder_Rate_Setpoint_Intent", t("Apron feeder rate setpoint intent", "قصد تعیین نقطهٔ تنظیم نرخ تغذیه‌کننده"), {
      subsystem: "ROM_FEED",
      attributes: {
        dataType: "REAL",
        accessMode: "WRITE",
        requiredPermission: "FEED_RATE_CONTROL",
        requiresConfirmation: true,
      },
      description: t(
        "A recorded statement that an authorised human asked for a feed-rate change. It is ENGINEERING METADATA: it drives no plant object in this corpus, and the crushing controller decides on its own permissives whether the request is honoured.",
        "ثبت این که یک انسانِ مجاز درخواست تغییر نرخ خوراک را داده است. این یک فرادادهٔ مهندسی است: در این پیکره هیچ شیء فرایندی را به حرکت درنمی‌آورد و کنترلر سنگ‌شکنی بر پایهٔ مجوزهای خود تصمیم می‌گیرد که درخواست پذیرفته شود یا نه.",
      ),
    }),
    a.node("SCADA_TAG", "MPP_Mill_Feed_Trim_Intent", t("Mill feed trim intent", "قصد اصلاح خوراک آسیا"), {
      subsystem: "GRINDING",
      attributes: {
        dataType: "REAL",
        accessMode: "WRITE",
        requiredPermission: "MILL_FEED_CONTROL",
        requiresConfirmation: true,
      },
    }),
    a.node("SCADA_TAG", "MPP_Alarm_Ack_Cmd", t("Alarm acknowledge command", "فرمان تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: {
        dataType: "BOOL",
        accessMode: "WRITE",
        requiredPermission: "ALARM_ACK",
        requiresConfirmation: true,
      },
      description: t(
        "ISA-18.2 acknowledgement records that a human saw the alarm and clears no condition. It is confirmed here because this banner carries pull-cord, tailings and reagent-containment alarms, and acknowledging one of those is a deliberate, recorded act.",
        "تأیید طبق ISA-18.2 فقط ثبت می‌کند که انسانی آلارم را دیده و هیچ شرطی را پاک نمی‌کند. اینجا تأییدیه لازم است، زیرا این نوار آلارم‌های طناب توقف اضطراری، باطله و مهار معرف را نیز نمایش می‌دهد و تأیید هر یک از آن‌ها اقدامی آگاهانه و ثبت‌شده است.",
      ),
    }),

    /* Field channels */
    a.node("IO_POINT", "AI_CR01_POWER", t("Primary crusher power transducer", "مبدل توان سنگ‌شکن اولیه"), {
      subsystem: "CRUSHING",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "kW" },
    }),
    a.node("IO_POINT", "AI_CV03_BELT_SPEED", t("CV-03 belt speed sensor", "حسگر سرعت نوار CV-03"), {
      subsystem: "CONVEYING",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "m/s" },
    }),
    a.node("IO_POINT", "DI_CV03_ZERO_SPEED", t("CV-03 zero-speed switch", "سوئیچ سرعت صفر CV-03"), {
      subsystem: "CONVEYING",
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      attributes: { channelType: "DI" },
    }),
    a.node("IO_POINT", "DI_CV02_PULLCORD", t("CV-02 pull-cord switch", "سوئیچ طناب توقف اضطراری CV-02"), {
      subsystem: "CONVEYING",
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      attributes: { channelType: "DI" },
    }),
    a.node("IO_POINT", "AI_CV03_WEIGHTOMETER", t("CV-03 weightometer load cell", "لودسل باسکول نواری CV-03"), {
      subsystem: "CONVEYING",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "t/h" },
    }),
    a.node("IO_POINT", "AI_ML01_PINION_RTD", t("SAG mill pinion bearing RTD", "حسگر دمای یاتاقان پینیون آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "C" },
    }),
    a.node("IO_POINT", "AI_ML01_SHELL_VIBRATION", t("SAG mill shell vibration sensor", "حسگر لرزش بدنهٔ آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "mm/s" },
    }),
    a.node("IO_POINT", "AI_CY01_FEED_PRESSURE", t("Hydrocyclone feed pressure transmitter", "ترانسمیتر فشار خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "kPa" },
    }),
    a.node("IO_POINT", "AI_CY01_FEED_DENSITY", t("Hydrocyclone feed density transmitter", "ترانسمیتر چگالی خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "t/m3" },
    }),
    a.node("IO_POINT", "AI_SUMP_LEVEL", t("Mill discharge sump level transmitter", "ترانسمیتر سطح حوضچهٔ تخلیهٔ آسیا"), {
      subsystem: "CLASSIFICATION",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "%" },
    }),

    /* Plant start-up sequence */
    a.node("SEQUENCE", "PLANT_START_SEQUENCE", t("Plant start-up sequence", "توالی راه‌اندازی کارخانه"), {
      domain: "CONTROL_LOGIC",
      description: t(
        "The plant's declared start-up order: utilities first, then the conveying route from the discharge end backwards, then crushing, grinding and flotation. Hermes describes it and never runs a step of it; there is no automatic restart of any step after a trip.",
        "ترتیب اعلام‌شدهٔ راه‌اندازی کارخانه: نخست سرویس‌های جانبی، سپس مسیر انتقال نواری از انتهای تخلیه به عقب، و پس از آن سنگ‌شکنی، آسیاکنی و فلوتاسیون. هرمس آن را توصیف می‌کند و هرگز حتی یک گام از آن را اجرا نمی‌کند؛ پس از تریپ هیچ راه‌اندازی مجدد خودکاری برای هیچ گامی وجود ندارد.",
      ),
    }),
    a.node("STATE", "P00_PLANT_STOPPED", t("Plant stopped", "توقف کارخانه"), {
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 0 },
    }),
    a.node("STATE", "P10_WATER_AND_DUST_READY", t("Process water and dust suppression ready", "آمادگی آب فرایندی و کنترل غبار"), {
      subsystem: "UTILITIES",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 10, stepTimeoutSeconds: 300 },
    }),
    a.node("STATE", "P20_CONVEYORS_RUNNING", t("Conveying route running", "در حال کار بودن مسیر انتقال نواری"), {
      subsystem: "CONVEYING",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 20, stepTimeoutSeconds: 180 },
    }),
    a.node("STATE", "P30_CRUSHING_RUNNING", t("Crushing and screening running", "در حال کار بودن سنگ‌شکنی و سرند"), {
      subsystem: "CRUSHING",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 30, stepTimeoutSeconds: 240 },
    }),
    a.node("STATE", "P40_GRINDING_RUNNING", t("Grinding circuit running", "در حال کار بودن مدار آسیاکنی"), {
      subsystem: "GRINDING",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 40, stepTimeoutSeconds: 600 },
    }),
    a.node("STATE", "P50_FLOTATION_RUNNING", t("Flotation running", "در حال کار بودن فلوتاسیون"), {
      subsystem: "FLOTATION",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 50 },
    }),

    /* ISA-18.2 alarm lifecycle, declared as a design object */
    a.node("SEQUENCE", "ALARM_LIFECYCLE", t("ISA-18.2 alarm lifecycle", "چرخهٔ عمر آلارم ISA-18.2"), {
      domain: "OPERATOR_INTERFACE",
      description: t(
        "The declared alarm philosophy of the plant, in ISA-18.2 stages. Acknowledgement moves an alarm between these states and never clears the underlying condition.",
        "فلسفهٔ اعلام‌شدهٔ آلارم کارخانه، در مراحل ISA-18.2. تأیید، آلارم را بین این حالت‌ها جابه‌جا می‌کند و هرگز شرط زیربنایی را پاک نمی‌کند.",
      ),
    }),
    a.node("STATE", "AL00_NORMAL", t("Normal", "عادی"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { stepNumber: 0 },
    }),
    a.node("STATE", "AL10_UNACK_ALARM", t("Unacknowledged alarm", "آلارم تأییدنشده"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { stepNumber: 10 },
    }),
    a.node("STATE", "AL20_ACK_ALARM", t("Acknowledged alarm", "آلارم تأییدشده"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { stepNumber: 20 },
    }),
    a.node("STATE", "AL30_RTN_UNACK", t("Returned to normal, unacknowledged", "بازگشته به عادی، تأییدنشده"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { stepNumber: 30 },
    }),

    /* Permissives */
    a.node("PERMISSIVE", "PRM_TELEMETRY_FRESH", t("Plant picture fresh enough to act on", "تازگی کافی تصویر کارخانه برای اقدام"), {
      domain: "NETWORK",
      description: t(
        "A permissive about DATA, not about the plant. With two redundant gateways it fails only when neither path is carrying data — and its failure never licenses the assumption that the plant is fine.",
        "مجوزی دربارهٔ داده است، نه دربارهٔ خود کارخانه. با دو دروازهٔ افزونه تنها وقتی ناموفق می‌شود که هیچ مسیری داده منتقل نکند — و ناموفق شدن آن هرگز مجوز این فرض نیست که کارخانه سالم است.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_PLANT_REMOTE", t("Plant in remote/auto", "کارخانه در حالت دور/خودکار"), {
      domain: "CONTROL_LOGIC",
    }),
    a.node("PERMISSIVE", "PRM_CONVEYOR_ROUTE_READY", t("Conveying route ready end to end", "آمادگی سرتاسری مسیر انتقال نواری"), {
      subsystem: "CONVEYING",
      domain: "CONTROL_LOGIC",
      description: t(
        "Feeding onto a route whose downstream belt is not running is how a transfer chute is buried. The route is proven from the discharge end backwards before any feed is contemplated.",
        "تغذیه به مسیری که نوار پایین‌دست آن در حال کار نیست، همان کاری است که شوت انتقال را دفن می‌کند. مسیر پیش از هر تصمیم به تغذیه، از انتهای تخلیه به عقب اثبات می‌شود.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_MILL_LUBRICATION_READY", t("Mill lubrication established", "برقراری روان‌کاری آسیا"), {
      subsystem: "GRINDING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("PERMISSIVE", "PRM_SUMP_LEVEL_ADEQUATE", t("Sump level adequate for pumping", "کافی بودن سطح حوضچه برای پمپاژ"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
    }),
    a.node("PERMISSIVE", "PRM_PROCESS_WATER_AVAILABLE", t("Process water available", "در دسترس بودن آب فرایندی"), {
      subsystem: "UTILITIES",
      domain: "PROCESS",
    }),
    a.node("PERMISSIVE", "PRM_DUST_SUPPRESSION_ACTIVE", t("Dust suppression active", "فعال بودن کنترل غبار"), {
      subsystem: "UTILITIES",
      domain: "PROCESS",
    }),

    /* Interlocks */
    a.node("INTERLOCK", "ILK_CONVEYOR_SAFETY_CIRCUIT", t("Conveyor safety circuit interlock", "اینترلاک مدار ایمنی نوار نقاله"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Pull-cord, emergency stop, belt alignment and zero speed, in one circuit owned by the safety controller. It is observed here and bypassed, reset, inhibited or simulated nowhere.",
        "طناب توقف اضطراری، توقف اضطراری، هم‌راستایی نوار و سرعت صفر، در یک مدار که در اختیار کنترلر ایمنی است. اینجا مشاهده می‌شود و در هیچ جا دور زده، ریست، غیرفعال یا شبیه‌سازی نمی‌شود.",
      ),
    }),
    a.node("INTERLOCK", "ILK_CRUSHER_PROTECTION", t("Crusher protection interlock", "اینترلاک حفاظت سنگ‌شکن"), {
      subsystem: "CRUSHING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Holds the feed out while the crusher is choked or its guard is open. When it is active the crushing step cannot advance — which is why a start-up timeout beside a choked crusher is a consequence, not a second fault.",
        "تا زمانی که سنگ‌شکن گرفته یا حفاظ آن باز است، خوراک را نگه می‌دارد. با فعال بودن آن گام سنگ‌شکنی نمی‌تواند پیش برود — و به همین دلیل، اتمام زمان راه‌اندازی در کنار سنگ‌شکن گرفته یک پیامد است، نه خطای دوم.",
      ),
    }),
    a.node("INTERLOCK", "ILK_MILL_PROTECTION", t("Mill protection interlock", "اینترلاک حفاظت آسیا"), {
      subsystem: "GRINDING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_METAL_DETECTOR_STOP", t("Tramp metal stop interlock", "اینترلاک توقف بر اثر فلز مزاحم"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_TAILINGS_LINE_PROTECTION", t("Tailings line protection interlock", "اینترلاک حفاظت خط باطله"), {
      subsystem: "TAILINGS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),

    /* Alarms */
    a.node("ALARM", "ALM_CRUSHER_CHOKE", t("Primary crusher choked", "گرفتگی سنگ‌شکن اولیه"), {
      subsystem: "CRUSHING",
      domain: "PROCESS",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_CRUSHING_START_TIMEOUT", t("Crushing start step timed out", "اتمام زمان گام راه‌اندازی سنگ‌شکنی"), {
      subsystem: "CRUSHING",
      domain: "CONTROL_LOGIC",
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),
    a.node("ALARM", "ALM_CV03_BELT_SLIP", t("CV-03 belt slipping", "لغزش نوار CV-03"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_CV02_PULLCORD_OPERATED", t("CV-02 pull-cord operated", "عمل‌کردن طناب توقف اضطراری CV-02"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_TRAMP_METAL_DETECTED", t("Tramp metal detected on the belt", "شناسایی فلز مزاحم روی نوار"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_MILL_DRIVE_FAULT", t("SAG mill drive fault", "خطای درایو آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "DRIVES",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_MILL_BEARING_TEMP_HIGH", t("SAG mill bearing temperature high", "بالا بودن دمای یاتاقان آسیای نیمه‌خودشکن"), {
      subsystem: "GRINDING",
      domain: "MECHANICAL",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_PUMP_CAVITATION", t("Cyclone feed pump cavitating", "کاویتاسیون پمپ خوراک هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_CYCLONE_MEASUREMENT_DEVIATION", t("Hydrocyclone measurement deviation", "انحراف اندازه‌گیری هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "QUALITY",
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),
    a.node("ALARM", "ALM_PLANT_COMMS_STALE", t("Plant telemetry stale", "کهنگی تله‌متری کارخانه"), {
      domain: "NETWORK",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_TIME_SYNC_LOST", t("Time synchronisation lost", "از دست رفتن همگام‌سازی زمان"), {
      domain: "NETWORK",
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),
    a.node("ALARM", "ALM_FEEDER_IN_LOCAL", t("Apron feeder in local mode", "قرار داشتن تغذیه‌کننده در حالت محلی"), {
      subsystem: "ROM_FEED",
      domain: "OPERATOR_INTERFACE",
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),
    a.node("ALARM", "ALM_TAILINGS_RAKE_TORQUE_HIGH", t("Tailings thickener rake torque high", "بالا بودن گشتاور ریک غلیظ‌کنندهٔ باطله"), {
      subsystem: "TAILINGS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_REAGENT_BUND_LEAK", t("Reagent bund leak detected", "شناسایی نشت در حوضچهٔ مهار معرف"), {
      subsystem: "REAGENTS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),

    /* Operator screens */
    a.node("HMI_SCREEN", "Screen_PlantOverview", t("Concentrator overview", "نمای کلی کارخانهٔ فرآوری"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_CrushingAndScreening", t("Run-of-mine feed, crushing and screening", "خوراک خام معدن، سنگ‌شکنی و سرند"), {
      subsystem: "CRUSHING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Conveyors", t("Conveyor system and tramp metal removal", "سامانهٔ نوار نقاله و حذف فلزات مزاحم"), {
      subsystem: "CONVEYING",
      domain: "OPERATOR_INTERFACE",
      description: t(
        "Display-only. Every object on this screen shows conveyor and safety-circuit state; none of them declares a command, because a belt is never started or stopped from here.",
        "صرفاً نمایشی. هر شیء این صفحه وضعیت نوار و مدار ایمنی را نشان می‌دهد؛ هیچ‌کدام فرمانی اعلام نمی‌کند، چون هیچ نواری از اینجا راه‌اندازی یا متوقف نمی‌شود.",
      ),
    }),
    a.node("HMI_SCREEN", "Screen_Grinding", t("SAG and ball mill grinding circuit", "مدار آسیاکنی SAG و آسیای گلوله‌ای"), {
      subsystem: "GRINDING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Classification", t("Slurry transport and hydrocyclone classification", "انتقال دوغاب و طبقه‌بندی با هیدروسیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Flotation", t("Flotation row and reagent monitoring", "ردیف فلوتاسیون و پایش معرف‌های شیمیایی"), {
      subsystem: "FLOTATION",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Dewatering", t("Concentrate dewatering and tailings boundary", "آب‌گیری کنسانتره و مرز باطله"), {
      subsystem: "DEWATERING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Utilities", t("Dust suppression and process water", "کنترل غبار و آب فرایندی"), {
      subsystem: "UTILITIES",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Alarms", t("Active alarms", "آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
    }),

    /* Operator screen objects */
    a.node("HMI_OBJECT", "Ind_CommsHealth", t("Gateway path health indicator", "نشانگر سلامت مسیرهای دروازه"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_TimeSyncHealth", t("Time synchronisation indicator", "نشانگر همگام‌سازی زمان"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_Throughput", t("Throughput and specific energy trend", "روند تناژ و انرژی ویژه"), {
      subsystem: "CONVEYING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_RomHopperLevel", t("ROM hopper and feeder indicator", "نشانگر سیلوی خام و تغذیه‌کننده"), {
      subsystem: "ROM_FEED",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Btn_FeederRateSetpoint", t("Feeder rate setpoint button", "دکمهٔ نقطهٔ کار نرخ تغذیه"), {
      subsystem: "ROM_FEED",
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "FEED_RATE_CONTROL", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Trend_CrusherLoad", t("Primary crusher load trend", "روند بار سنگ‌شکن اولیه"), {
      subsystem: "CRUSHING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_ScreenVibration", t("Screen vibration indicator", "نشانگر ارتعاش سرند"), {
      subsystem: "SCREENING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_Cv03BeltSpeed", t("CV03 belt speed trend", "روند سرعت نوار CV03"), {
      subsystem: "CONVEYING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_Cv02SafetyCircuit", t("Conveyor safety circuit indicator", "نشانگر مدار ایمنی نوار نقاله"), {
      subsystem: "CONVEYING",
      domain: "OPERATOR_INTERFACE",
      description: t(
        "Shows the pull-cord and belt alignment state. It declares no command: a safety circuit is never reset, inhibited or bypassed from an operator screen in this design.",
        "وضعیت طناب توقف اضطراری و هم‌راستایی نوار را نشان می‌دهد. هیچ فرمانی اعلام نمی‌کند: در این طراحی مدار ایمنی هرگز از صفحهٔ اپراتور ریست، غیرفعال یا دور زده نمی‌شود.",
      ),
    }),
    a.node("HMI_OBJECT", "Ind_MetalDetector", t("Metal detector indicator", "نشانگر فلزیاب"), {
      subsystem: "CONVEYING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_MillPower", t("Mill power and feed rate trend", "روند توان و نرخ خوراک آسیا"), {
      subsystem: "GRINDING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_MillBearingTemp", t("Mill bearing and vibration indicator", "نشانگر دمای یاتاقان و ارتعاش آسیا"), {
      subsystem: "GRINDING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Btn_MillFeedTrim", t("Mill feed trim button", "دکمهٔ اصلاح خوراک آسیا"), {
      subsystem: "GRINDING",
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "MILL_FEED_CONTROL", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Fp_CycloneFeed", t("Cyclone feed faceplate", "فیس‌پلیت خوراک سیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_SumpLevel", t("Sump and pump indicator", "نشانگر مخزن مکش و پمپ"), {
      subsystem: "CLASSIFICATION",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_FlotationLevel", t("Flotation cell level trend", "روند سطح سلول فلوتاسیون"), {
      subsystem: "FLOTATION",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_ReagentMonitor", t("Reagent monitoring indicator", "نشانگر پایش معرف‌های شیمیایی"), {
      subsystem: "REAGENTS",
      domain: "OPERATOR_INTERFACE",
      description: t(
        "Monitoring only. Reagent dosing is neither commanded nor advised from this system; a reagent finding is escalated to a qualified process and safety engineer.",
        "فقط پایش. تزریق معرف نه از این سامانه فرمان داده می‌شود و نه توصیه؛ هر یافتهٔ مربوط به معرف به مهندس فرایند و ایمنی واجد صلاحیت ارجاع می‌شود.",
      ),
    }),
    a.node("HMI_OBJECT", "Trend_ThickenerTorque", t("Thickener rake torque trend", "روند گشتاور ریک غلیظ‌کننده"), {
      subsystem: "DEWATERING",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_ProcessWater", t("Process water indicator", "نشانگر آب فرایندی"), {
      subsystem: "UTILITIES",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Banner_ActiveAlarms", t("Active alarm banner", "نوار آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "ALARM_ACK", requiresConfirmation: true },
    }),

    /* Supervisory scripts */
    a.node("SCRIPT", "OnFeederRateSetpointIntent", t("Feeder rate setpoint intent handler", "پردازندهٔ قصد تعیین نرخ تغذیه"), {
      subsystem: "ROM_FEED",
      attributes: { humanInvokable: true, requiredPermission: "FEED_RATE_CONTROL" },
      description: t(
        "Invoked by the concentrator supervisor from the crushing screen. It records an intent and starts nothing.",
        "توسط سرپرست کارخانهٔ فرآوری از صفحهٔ سنگ‌شکنی فراخوانی می‌شود. یک قصد را ثبت می‌کند و هیچ‌چیز را راه‌اندازی نمی‌کند.",
      ),
    }),
    a.node("SCRIPT", "OnMillFeedTrimIntent", t("Mill feed trim intent handler", "پردازندهٔ قصد اصلاح خوراک آسیا"), {
      subsystem: "GRINDING",
      attributes: { humanInvokable: true, requiredPermission: "MILL_FEED_CONTROL" },
    }),
    a.node("SCRIPT", "OnAlarmAcknowledge", t("Alarm acknowledge handler", "پردازندهٔ تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "ALARM_ACK" },
    }),
    a.node("SCRIPT", "OnPlantWatchdog", t("Plant telemetry watchdog", "دیدبان تله‌متری کارخانه"), {
      domain: "NETWORK",
      description: t(
        "Runs on the supervisory server's schedule. It declares no role because no operator invokes it, humanInvokable is deliberately left undeclared (absence means false), and it writes exactly one supervisory flag — never a plant, safety or reagent object.",
        "بر اساس زمان‌بندی سرور نظارتی اجرا می‌شود. چون هیچ اپراتوری آن را فراخوانی نمی‌کند هیچ نقشی اعلام نمی‌کند، humanInvokable عمداً اعلام‌نشده مانده است (نبودن یعنی نادرست) و دقیقاً یک پرچم نظارتی می‌نویسد — هرگز یک شیء فرایندی، ایمنی یا معرف.",
      ),
    }),
    a.node("SCRIPT", "OnSpecificEnergyCalculation", t("Specific energy calculation", "محاسبهٔ انرژی ویژه"), {
      domain: "ENERGY",
      description: t(
        "The second scheduled routine. It CALCULATES and publishes a supervisory figure; it commands nothing, restarts nothing, and publishes nothing at all while the picture is stale, because a number computed from frozen inputs would look like a measurement.",
        "دومین روال زمان‌بندی‌شده. محاسبه می‌کند و یک مقدار نظارتی منتشر می‌کند؛ هیچ فرمانی نمی‌دهد، هیچ‌چیز را دوباره راه‌اندازی نمی‌کند و تا زمانی که تصویر کهنه است هیچ‌چیز منتشر نمی‌کند، چون عددی که از ورودی منجمد محاسبه شود شبیه یک اندازه‌گیری به نظر می‌رسد.",
      ),
    }),

    /* Governance */
    a.node("ROLE", "Role_ConcentratorOperator", t("Concentrator operator", "اپراتور کارخانهٔ فرآوری")),
    a.node("ROLE", "Role_ConcentratorSupervisor", t("Concentrator shift supervisor", "سرپرست شیفت کارخانهٔ فرآوری")),
    a.node("AUDIT_EVENT_TYPE", "Audit_FeederRateSetpointIntentRecorded", t("Feeder rate setpoint intent recorded", "ثبت قصد تعیین نرخ تغذیه")),
    a.node("AUDIT_EVENT_TYPE", "Audit_MillFeedTrimIntentRecorded", t("Mill feed trim intent recorded", "ثبت قصد اصلاح خوراک آسیا")),
    a.node("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged", t("Alarm acknowledged", "تأیید آلارم")),
    a.node("AUDIT_EVENT_TYPE", "Audit_PlantWatchdogRecord", t("Plant watchdog record", "رکورد دیدبان کارخانه")),
    a.node("AUDIT_EVENT_TYPE", "Audit_SpecificEnergyCalculationRecord", t("Specific energy calculation record", "رکورد محاسبهٔ انرژی ویژه"), {
      description: t(
        "An automatic calculation still leaves a record. EMITS carries no humanInvokable requirement, because an audit trail is about what happened, not about who asked for it.",
        "یک محاسبهٔ خودکار نیز رکورد بر جای می‌گذارد. EMITS هیچ الزامی به humanInvokable ندارد، چون سابقهٔ ممیزی دربارهٔ آنچه رخ داده است، نه دربارهٔ اینکه چه کسی آن را خواسته.",
      ),
    }),

    /* KPI */
    a.node("KPI", "KPI_PLANT_THROUGHPUT", t("Plant throughput", "ظرفیت عبوری کارخانه"), {
      domain: "PROCESS",
      attributes: { unit: "t/h", formula: "weightometer tonnage per operating hour" },
    }),
    a.node("KPI", "KPI_METAL_RECOVERY_ESTIMATE", t("Metal recovery estimate", "برآورد بازیابی فلز"), {
      domain: "QUALITY",
      attributes: { unit: "%", formula: "on-line mass-balance estimate, not a laboratory assay" },
      description: t(
        "An on-line ESTIMATE from plant instrumentation, and labelled as one. A laboratory assay is the only thing that settles recovery, and this corpus neither holds nor claims one.",
        "یک برآورد برخط از ابزاردقیق کارخانه، و به همین عنوان برچسب خورده است. تنها آنالیز آزمایشگاهی بازیابی را قطعی می‌کند و این پیکره نه چنین چیزی دارد و نه ادعا می‌کند.",
      ),
    }),
    a.node("KPI", "KPI_PLANT_AVAILABILITY", t("Plant availability", "دسترس‌پذیری کارخانه"), {
      domain: "MAINTENANCE",
      attributes: { unit: "%", formula: "running hours / scheduled hours" },
    }),
    a.node("KPI", "KPI_SPECIFIC_ENERGY", t("Specific grinding energy", "انرژی ویژهٔ آسیاکنی"), {
      domain: "ENERGY",
      attributes: { unit: "kWh/t", formula: "mill power / throughput" },
    }),
    a.node("KPI", "KPI_WATER_INTENSITY", t("Water intensity", "شدت مصرف آب"), {
      domain: "PROCESS",
      attributes: { unit: "m3/t", formula: "net make-up water / milled tonnage" },
    }),

    /* Evidence sources */
    a.node("EVIDENCE_SOURCE", "HIST_PROCESS_TREND", t("Process trend archive", "بایگانی روند فرایند"), {
      domain: "MAINTENANCE",
      attributes: { retentionDays: 730, sampleIntervalSeconds: 5 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_VIBRATION_TREND", t("Vibration trend archive", "بایگانی روند ارتعاش"), {
      subsystem: "GRINDING",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 365, sampleIntervalSeconds: 1 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_DRIVE_EVENT_LOG", t("Drive event log", "گزارش رویدادهای درایو"), {
      domain: "DRIVES",
      attributes: { retentionDays: 730 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_COMMS_LINK_LOG", t("Gateway link log", "گزارش پیوند دروازه‌ها"), {
      domain: "NETWORK",
      attributes: { retentionDays: 180, sampleIntervalSeconds: 10 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_PLANT_AUDIT_LOG", t("Operator audit log", "گزارش ممیزی اپراتور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { retentionDays: 1825 },
      description: t(
        "Where the audit event TYPES the scripts declare would be recorded. Hermes reads about it here; it does not write to it, and this corpus holds no operational record.",
        "جایی که انواع رویداد ممیزی اعلام‌شده توسط اسکریپت‌ها ثبت می‌شوند. هرمس اینجا دربارهٔ آن می‌خواند، در آن نمی‌نویسد و این پیکره هیچ رکورد عملیاتی در بر ندارد.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_SAFETY_EVENT_LOG", t("Safety event log", "گزارش رویدادهای ایمنی"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { retentionDays: 1825 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_WATER_BALANCE_TREND", t("Water balance archive", "بایگانی توازن آب"), {
      subsystem: "UTILITIES",
      domain: "PROCESS",
      attributes: { retentionDays: 730, sampleIntervalSeconds: 60 },
    }),

    /* Fault modes */
    a.node("FAULT_MODE", "FM_PRIMARY_CRUSHER_CHOKE", t("Primary crusher cavity choked", "گرفتگی محفظهٔ سنگ‌شکن اولیه"), {
      subsystem: "CRUSHING",
      domain: "MECHANICAL",
      attributes: { faultClass: "BLOCKAGE", subsystem: "MECHANICAL" },
    }),
    a.node("FAULT_MODE", "FM_CRUSHING_START_TIMEOUT", t("Crushing train failed to start in time", "ناتوانی قطار سنگ‌شکنی در راه‌اندازی به‌موقع"), {
      subsystem: "CRUSHING",
      domain: "CONTROL_LOGIC",
      attributes: { faultClass: "SEQUENCE_TIMEOUT", subsystem: "PLC_LOGIC" },
    }),
    a.node("FAULT_MODE", "FM_CV03_BELT_SLIP", t("CV03 belt slipping on the drive pulley", "لغزش نوار CV03 روی پولی محرک"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      attributes: { faultClass: "ACTUATOR_FAILURE", subsystem: "MECHANICAL" },
      description: t(
        "The drive turns and the belt does not follow it. A stopped belt is the symptom shared with a safety stop, and only the evidence separates them.",
        "محرک می‌چرخد و نوار از آن پیروی نمی‌کند. توقف نوار نشانه‌ای مشترک با توقف ایمنی است و تنها شواهد این دو را از هم جدا می‌کند.",
      ),
    }),
    a.node("FAULT_MODE", "FM_SAG_MILL_DRIVE_FAULT", t("SAG mill drive and bearing fault", "خطای درایو و یاتاقان آسیای SAG"), {
      subsystem: "GRINDING",
      domain: "DRIVES",
      attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
    }),
    a.node("FAULT_MODE", "FM_CYCLONE_FEED_PUMP_CAVITATION", t("Cyclone feed pump cavitating", "کاویتاسیون پمپ خوراک سیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "PROCESS" },
    }),
    a.node("FAULT_MODE", "FM_CYCLONE_DENSITY_TRANSMITTER_FAILURE", t("Cyclone feed density measurement failed", "خرابی اندازه‌گیری چگالی خوراک سیکلون"), {
      subsystem: "CLASSIFICATION",
      domain: "FIELD_IO",
      attributes: { faultClass: "SENSOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_PLANT_COMMS_LOSS", t("Both gateway paths lost", "از دست رفتن هر دو مسیر دروازه"), {
      domain: "NETWORK",
      attributes: { faultClass: "COMMUNICATION_LOSS", subsystem: "TELEMETRY" },
      description: t(
        "The supervisory picture froze; the state of the plant behind it is simply unknown and must never be reported as healthy.",
        "تصویر نظارتی منجمد شده است؛ وضعیت کارخانه پشت آن صرفاً نامعلوم است و هرگز نباید سالم گزارش شود.",
      ),
    }),
    a.node("FAULT_MODE", "FM_CV02_PULLCORD_INTERLOCK", t("CV02 stopped by the pull-cord interlock", "توقف CV02 توسط اینترلاک طناب اضطراری"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "INTERLOCK_ACTIVE", subsystem: "SAFETY_CIRCUIT" },
      description: t(
        "Somebody pulled a cord. The belt is stopped because the safety circuit did its job, and the only correct response is to find the person and the reason before anything is re-armed by the plant's own system.",
        "کسی طناب را کشیده است. نوار متوقف است چون مدار ایمنی کار خود را انجام داده و تنها پاسخ درست، یافتن آن فرد و دلیل کار است، پیش از آن که چیزی توسط سامانهٔ خود کارخانه دوباره مسلح شود.",
      ),
    }),
    a.node("FAULT_MODE", "FM_FEEDER_LEFT_IN_LOCAL", t("Apron feeder left in local mode", "رهاشدن تغذیه‌کنندهٔ صفحه‌ای در حالت محلی"), {
      subsystem: "ROM_FEED",
      domain: "OPERATOR_INTERFACE",
      attributes: { faultClass: "INCORRECT_MODE", subsystem: "HMI" },
    }),
    a.node("FAULT_MODE", "FM_TAILINGS_THICKENER_OVERTORQUE", t("Tailings thickener rake overtorque", "گشتاور بیش‌ازحد ریک غلیظ‌کنندهٔ باطله"), {
      subsystem: "TAILINGS",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "PROCESS" },
    }),
    a.node("FAULT_MODE", "FM_REAGENT_CONTAINMENT_BREACH", t("Reagent containment breached", "نقض مهار معرف شیمیایی"), {
      subsystem: "REAGENTS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "MECHANICAL" },
    }),

    /* Safe actions — instructions for a qualified human being */
    a.node("SAFE_ACTION", "SA_INSPECT_CRUSHER_CAVITY_AND_FEED_PRESENTATION", t("Inspect the crusher cavity and how the feed is presented", "بازرسی محفظهٔ سنگ‌شکن و نحوهٔ ارائهٔ خوراک"), {
      subsystem: "CRUSHING",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Review-only, from a safe position and under the site's isolation and permit-to-work procedure. The crusher is never inched, cleared or started to test the diagnosis.",
        "فقط بازبینی، از موقعیت ایمن و تحت دستورالعمل جداسازی و مجوز کار سایت. سنگ‌شکن هرگز برای آزمودن تشخیص، جابه‌جا، تخلیه یا راه‌اندازی نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_CRUSHING_START_PERMISSIVES", t("Review the crushing start permissives and their order", "بازبینی مجوزهای راه‌اندازی سنگ‌شکنی و ترتیب آن‌ها"), {
      subsystem: "CRUSHING",
      domain: "CONTROL_LOGIC",
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_CV03_BELT_TENSION_AND_LAGGING", t("Review CV03 belt tension, lagging and drive pulley", "بازبینی کشش نوار CV03، لاگینگ و پولی محرک"), {
      subsystem: "CONVEYING",
      domain: "MECHANICAL",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_MILL_DRIVE_AND_LUBRICATION_TREND", t("Review the mill drive fault history and lubrication trend", "بازبینی تاریخچهٔ خطای درایو آسیا و روند روان‌کاری"), {
      subsystem: "GRINDING",
      domain: "DRIVES",
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_SUMP_LEVEL_AND_PUMP_SUCTION_CONDITIONS", t("Review the sump level and pump suction conditions", "بازبینی سطح مخزن مکش و شرایط مکش پمپ"), {
      subsystem: "CLASSIFICATION",
      domain: "PROCESS",
    }),
    a.node("SAFE_ACTION", "SA_VERIFY_CYCLONE_INSTRUMENT_CALIBRATION", t("Verify the cyclone instrument calibration against a reference", "بررسی کالیبراسیون ابزاردقیق سیکلون در برابر مرجع"), {
      subsystem: "CLASSIFICATION",
      domain: "FIELD_IO",
    }),
    a.node("SAFE_ACTION", "SA_VERIFY_PLANT_GATEWAY_SESSIONS", t("Verify both plant gateway sessions", "بررسی نشست هر دو دروازهٔ کارخانه"), {
      domain: "NETWORK",
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_CONVEYOR_SAFETY_CIRCUIT_REVIEW", t("Escalate to a conveyor safety circuit review", "ارجاع به بازبینی مدار ایمنی نوار نقاله"), {
      subsystem: "CONVEYING",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Escalate-only. Locate the person who operated the pull-cord and the reason before the plant's own system re-arms anything. The circuit is never reset, inhibited, bypassed or simulated from Hermes.",
        "فقط ارجاع. پیش از آن که سامانهٔ خود کارخانه چیزی را دوباره مسلح کند، فردی که طناب را کشیده و دلیل آن باید یافت شود. این مدار هرگز از هرمس ریست، غیرفعال، دور زده یا شبیه‌سازی نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_PLANT_AUDIT_LOG", t("Review the operator audit log", "بازبینی گزارش ممیزی اپراتور"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_TAILINGS_AND_WATER_BALANCE_REVIEW", t("Escalate to a tailings and water balance review", "ارجاع به بازبینی باطله و توازن آب"), {
      subsystem: "TAILINGS",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Escalate-only, to the responsible tailings engineer under the site's own tailings management system. Nothing about the tailings boundary is adjusted, commanded or advised from here.",
        "فقط ارجاع، به مهندس مسئول باطله تحت سامانهٔ مدیریت باطلهٔ خود سایت. هیچ چیزی دربارهٔ مرز باطله از اینجا تنظیم، فرمان‌دهی یا توصیه نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_REAGENT_CONTAINMENT_REVIEW", t("Escalate to a reagent containment review", "ارجاع به بازبینی مهار معرف شیمیایی"), {
      subsystem: "REAGENTS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Escalate-only, to a qualified process and safety engineer. Reagent dosing is neither commanded nor advised from this system, and no containment measure is attempted from a supervisory screen.",
        "فقط ارجاع، به مهندس فرایند و ایمنی واجد صلاحیت. تزریق معرف نه از این سامانه فرمان داده می‌شود و نه توصیه، و هیچ اقدام مهارکننده‌ای از صفحهٔ نظارتی انجام نمی‌شود.",
      ),
    }),
  ],

  edges: [
    /* Containment — the plant PLCs hold the process image */
    a.edge(D.plcCrushing, T.romHopperLevel, "CONTAINS"),
    a.edge(D.plcCrushing, T.feederSpeed, "CONTAINS"),
    a.edge(D.plcCrushing, T.feederRunning, "CONTAINS"),
    a.edge(D.plcCrushing, T.feederModeRemote, "CONTAINS"),
    a.edge(D.plcCrushing, T.grizzlyRunning, "CONTAINS"),
    a.edge(D.plcCrushing, T.cr01MotorCurrent, "CONTAINS"),
    a.edge(D.plcCrushing, T.cr01PowerDraw, "CONTAINS"),
    a.edge(D.plcCrushing, T.cr01ChokeLevel, "CONTAINS"),
    a.edge(D.plcCrushing, T.cr01HydraulicPressure, "CONTAINS"),
    a.edge(D.plcCrushing, T.cr01Running, "CONTAINS"),
    a.edge(D.plcCrushing, T.cr01GuardClosed, "CONTAINS"),
    a.edge(D.plcCrushing, T.cr02MotorCurrent, "CONTAINS"),
    a.edge(D.plcCrushing, T.cr02Running, "CONTAINS"),
    a.edge(D.plcCrushing, T.sc01Vibration, "CONTAINS"),
    a.edge(D.plcCrushing, T.sc01BearingTemp, "CONTAINS"),
    a.edge(D.plcCrushing, T.sc01Running, "CONTAINS"),
    a.edge(D.plcConveying, T.cv01BeltSpeed, "CONTAINS"),
    a.edge(D.plcConveying, T.cv01Running, "CONTAINS"),
    a.edge(D.plcConveying, T.cv02BeltSpeed, "CONTAINS"),
    a.edge(D.plcConveying, T.cv02Running, "CONTAINS"),
    a.edge(D.plcConveying, T.cv03BeltSpeed, "CONTAINS"),
    a.edge(D.plcConveying, T.cv03DriveSpeedRef, "CONTAINS"),
    a.edge(D.plcConveying, T.cv03DriveCurrent, "CONTAINS"),
    a.edge(D.plcConveying, T.cv03DriveFault, "CONTAINS"),
    a.edge(D.plcConveying, T.cv03PulleyBearingTemp, "CONTAINS"),
    a.edge(D.plcConveying, T.cv03WeightometerRate, "CONTAINS"),
    a.edge(D.plcConveying, T.md01MetalDetected, "CONTAINS"),
    a.edge(D.plcConveying, T.ms01MagnetCurrent, "CONTAINS"),
    a.edge(D.plcConveying, T.ms01Running, "CONTAINS"),
    a.edge(D.plcConveying, T.stockpileLevel, "CONTAINS"),
    a.edge(D.plcConveying, T.stockpileReclaimRate, "CONTAINS"),
    a.edge(D.safetyPlc, T.cv02PullcordHealthy, "CONTAINS"),
    a.edge(D.safetyPlc, T.cv02EstopHealthy, "CONTAINS"),
    a.edge(D.safetyPlc, T.cv02AlignHealthy, "CONTAINS"),
    a.edge(D.safetyPlc, T.cv03ZeroSpeedTrip, "CONTAINS"),
    a.edge(D.safetyPlc, T.cv03AlignHealthy, "CONTAINS"),
    a.edge(D.safetyPlc, T.cv03PullcordHealthy, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml01MillPower, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml01MotorCurrent, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml01MotorWindingTemp, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml01DriveFault, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml01PinionBearingTemp, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml01ShellVibration, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml01MillSpeed, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml01FeedRate, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml01LubePressure, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml01LubeOilTemp, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml02MillPower, "CONTAINS"),
    a.edge(D.plcGrinding, T.ml02PinionBearingTemp, "CONTAINS"),
    a.edge(D.plcGrinding, T.sumpLevel, "CONTAINS"),
    a.edge(D.plcGrinding, T.pu01SuctionPressure, "CONTAINS"),
    a.edge(D.plcGrinding, T.pu01DischargePressure, "CONTAINS"),
    a.edge(D.plcGrinding, T.pu01Flow, "CONTAINS"),
    a.edge(D.plcGrinding, T.pu01MotorCurrent, "CONTAINS"),
    a.edge(D.plcGrinding, T.pu01Vibration, "CONTAINS"),
    a.edge(D.plcGrinding, T.pu01Speed, "CONTAINS"),
    a.edge(D.plcGrinding, T.pu01Running, "CONTAINS"),
    a.edge(D.plcGrinding, T.cy01FeedPressure, "CONTAINS"),
    a.edge(D.plcGrinding, T.cy01FeedDensity, "CONTAINS"),
    a.edge(D.plcGrinding, T.cy01OverflowDensity, "CONTAINS"),
    a.edge(D.plcGrinding, T.cy01DensityQuality, "CONTAINS"),
    a.edge(D.plcGrinding, T.cy01OpenCyclones, "CONTAINS"),
    a.edge(D.plcFlotation, T.fl01CellLevel, "CONTAINS"),
    a.edge(D.plcFlotation, T.fl01AirFlow, "CONTAINS"),
    a.edge(D.plcFlotation, T.fl01PulpPh, "CONTAINS"),
    a.edge(D.plcFlotation, T.fl01FrothDepth, "CONTAINS"),
    a.edge(D.plcFlotation, T.rg01CollectorFlow, "CONTAINS"),
    a.edge(D.plcFlotation, T.rg01FrotherFlow, "CONTAINS"),
    a.edge(D.plcFlotation, T.rg01TankLevel, "CONTAINS"),
    a.edge(D.plcFlotation, T.rg01BundLeak, "CONTAINS"),
    a.edge(D.plcDewatering, T.th01BedLevel, "CONTAINS"),
    a.edge(D.plcDewatering, T.th01RakeTorque, "CONTAINS"),
    a.edge(D.plcDewatering, T.th01UnderflowDensity, "CONTAINS"),
    a.edge(D.plcDewatering, T.fp01ChamberPressure, "CONTAINS"),
    a.edge(D.plcDewatering, T.fp01FiltrateFlow, "CONTAINS"),
    a.edge(D.plcDewatering, T.th02BedLevel, "CONTAINS"),
    a.edge(D.plcDewatering, T.th02RakeTorque, "CONTAINS"),
    a.edge(D.plcDewatering, T.th02UnderflowDensity, "CONTAINS"),
    a.edge(D.plcDewatering, T.pu02DischargePressure, "CONTAINS"),
    a.edge(D.plcDewatering, T.pu02Running, "CONTAINS"),
    a.edge(D.plcDewatering, T.tailingsLinePressure, "CONTAINS"),
    a.edge(D.plcUtilities, T.ds01SprayPressure, "CONTAINS"),
    a.edge(D.plcUtilities, T.ds01Running, "CONTAINS"),
    a.edge(D.plcUtilities, T.pw01TankLevel, "CONTAINS"),
    a.edge(D.plcUtilities, T.pw01MakeupFlow, "CONTAINS"),
    a.edge(D.plcUtilities, T.pw01ReclaimFlow, "CONTAINS"),
    a.edge(D.plcUtilities, T.plantModeRemote, "CONTAINS"),
    a.edge(D.gwA, T.gwALink, "CONTAINS"),
    a.edge(D.gwB, T.gwBLink, "CONTAINS"),
    a.edge(D.primary, T.telemetryAge, "CONTAINS"),
    a.edge(D.timeServer, T.timeSyncOk, "CONTAINS"),
    a.edge(D.primary, ST.telemetryStale, "CONTAINS"),
    a.edge(D.primary, ST.specificEnergy, "CONTAINS"),
    a.edge(D.primary, ST.feederRateIntent, "CONTAINS"),
    a.edge(D.primary, ST.millFeedTrimIntent, "CONTAINS"),
    a.edge(D.primary, ST.ackCmd, "CONTAINS"),
    a.edge(D.primary, AQ, "CONTAINS"),
    a.edge(D.historian, EV.processTrend, "CONTAINS"),
    a.edge(D.historian, EV.vibrationTrend, "CONTAINS"),
    a.edge(D.historian, EV.driveEventLog, "CONTAINS"),
    a.edge(D.historian, EV.commsLinkLog, "CONTAINS"),
    a.edge(D.historian, EV.plantAuditLog, "CONTAINS"),
    a.edge(D.historian, EV.safetyEventLog, "CONTAINS"),
    a.edge(D.historian, EV.waterBalanceTrend, "CONTAINS"),
    a.edge(D.opClient, H.overview, "CONTAINS"),
    a.edge(D.opClient, H.crushing, "CONTAINS"),
    a.edge(D.opClient, H.conveyors, "CONTAINS"),
    a.edge(D.opClient, H.grinding, "CONTAINS"),
    a.edge(D.opClient, H.classification, "CONTAINS"),
    a.edge(D.opClient, H.flotation, "CONTAINS"),
    a.edge(D.opClient, H.dewatering, "CONTAINS"),
    a.edge(D.opClient, H.utilities, "CONTAINS"),
    a.edge(D.opClient, H.alarms, "CONTAINS"),
    a.edge(H.overview, HO.commsHealth, "CONTAINS"),
    a.edge(H.overview, HO.timeSyncHealth, "CONTAINS"),
    a.edge(H.overview, HO.throughput, "CONTAINS"),
    a.edge(H.crushing, HO.romHopper, "CONTAINS"),
    a.edge(H.crushing, HO.crusherLoad, "CONTAINS"),
    a.edge(H.crushing, HO.screenVibration, "CONTAINS"),
    a.edge(H.crushing, HO.feederRate, "CONTAINS"),
    a.edge(H.conveyors, HO.cv03Speed, "CONTAINS"),
    a.edge(H.conveyors, HO.cv02Safety, "CONTAINS"),
    a.edge(H.conveyors, HO.metalDetector, "CONTAINS"),
    a.edge(H.grinding, HO.millPower, "CONTAINS"),
    a.edge(H.grinding, HO.millBearing, "CONTAINS"),
    a.edge(H.grinding, HO.millFeedTrim, "CONTAINS"),
    a.edge(H.classification, HO.cycloneFeed, "CONTAINS"),
    a.edge(H.classification, HO.sumpLevel, "CONTAINS"),
    a.edge(H.flotation, HO.flotationLevel, "CONTAINS"),
    a.edge(H.flotation, HO.reagentMonitor, "CONTAINS"),
    a.edge(H.dewatering, HO.thickenerTorque, "CONTAINS"),
    a.edge(H.utilities, HO.processWater, "CONTAINS"),
    a.edge(H.alarms, HO.alarmBanner, "CONTAINS"),
    a.edge(SQ, S.stopped, "CONTAINS"),
    a.edge(SQ, S.utilities, "CONTAINS"),
    a.edge(SQ, S.conveyors, "CONTAINS"),
    a.edge(SQ, S.crushing, "CONTAINS"),
    a.edge(SQ, S.grinding, "CONTAINS"),
    a.edge(SQ, S.flotation, "CONTAINS"),
    a.edge(AQ, AS.normal, "CONTAINS"),
    a.edge(AQ, AS.unack, "CONTAINS"),
    a.edge(AQ, AS.acked, "CONTAINS"),
    a.edge(AQ, AS.rtnUnack, "CONTAINS"),

    /* Redundancy — server pair and gateway pair, as design facts */
    a.edge(
      D.standby,
      D.primary,
      "MIRRORS",
      t("Hot standby of the primary supervisory server", "آماده‌به‌کار گرمِ سرور نظارتی اصلی"),
    ),
    a.edge(
      D.gwB,
      D.gwA,
      "MIRRORS",
      t("Redundant industrial communication path", "مسیر افزونهٔ ارتباط صنعتی"),
    ),

    /* Field channels */
    a.edge(T.cr01PowerDraw, IO.cr01PowerAi, "BOUND_TO"),
    a.edge(T.cv03BeltSpeed, IO.cv03SpeedAi, "BOUND_TO"),
    a.edge(T.cv03ZeroSpeedTrip, IO.cv03ZeroSpeedDi, "BOUND_TO"),
    a.edge(T.cv02PullcordHealthy, IO.cv02PullcordDi, "BOUND_TO"),
    a.edge(T.cv03WeightometerRate, IO.cv03WeightometerAi, "BOUND_TO"),
    a.edge(T.ml01PinionBearingTemp, IO.ml01PinionRtd, "BOUND_TO"),
    a.edge(T.ml01ShellVibration, IO.ml01VibrationAi, "BOUND_TO"),
    a.edge(T.cy01FeedPressure, IO.cy01PressureAi, "BOUND_TO"),
    a.edge(T.cy01FeedDensity, IO.cy01DensityAi, "BOUND_TO"),
    a.edge(T.sumpLevel, IO.sumpLevelAi, "BOUND_TO"),

    /* The supervisory image mirrors the PLC image across the gateways. This is
     * the seam where a healthy plant and an unhealthy PICTURE of it become
     * distinguishable. */
    a.edge(ST.romHopperLevel, T.romHopperLevel, "MIRRORS"),
    a.edge(ST.feederSpeed, T.feederSpeed, "MIRRORS"),
    a.edge(ST.feederModeRemote, T.feederModeRemote, "MIRRORS"),
    a.edge(ST.cr01PowerDraw, T.cr01PowerDraw, "MIRRORS"),
    a.edge(ST.cr01ChokeLevel, T.cr01ChokeLevel, "MIRRORS"),
    a.edge(ST.sc01Vibration, T.sc01Vibration, "MIRRORS"),
    a.edge(ST.cv02PullcordHealthy, T.cv02PullcordHealthy, "MIRRORS"),
    a.edge(ST.cv03BeltSpeed, T.cv03BeltSpeed, "MIRRORS"),
    a.edge(ST.cv03AlignHealthy, T.cv03AlignHealthy, "MIRRORS"),
    a.edge(ST.cv03WeightometerRate, T.cv03WeightometerRate, "MIRRORS"),
    a.edge(ST.md01MetalDetected, T.md01MetalDetected, "MIRRORS"),
    a.edge(ST.stockpileLevel, T.stockpileLevel, "MIRRORS"),
    a.edge(ST.ml01MillPower, T.ml01MillPower, "MIRRORS"),
    a.edge(ST.ml01PinionBearingTemp, T.ml01PinionBearingTemp, "MIRRORS"),
    a.edge(ST.ml01ShellVibration, T.ml01ShellVibration, "MIRRORS"),
    a.edge(ST.ml01LubePressure, T.ml01LubePressure, "MIRRORS"),
    a.edge(ST.ml01FeedRate, T.ml01FeedRate, "MIRRORS"),
    a.edge(ST.sumpLevel, T.sumpLevel, "MIRRORS"),
    a.edge(ST.pu01SuctionPressure, T.pu01SuctionPressure, "MIRRORS"),
    a.edge(ST.pu01Flow, T.pu01Flow, "MIRRORS"),
    a.edge(ST.cy01FeedPressure, T.cy01FeedPressure, "MIRRORS"),
    a.edge(ST.cy01FeedDensity, T.cy01FeedDensity, "MIRRORS"),
    a.edge(ST.cy01DensityQuality, T.cy01DensityQuality, "MIRRORS"),
    a.edge(ST.fl01CellLevel, T.fl01CellLevel, "MIRRORS"),
    a.edge(ST.rg01CollectorFlow, T.rg01CollectorFlow, "MIRRORS"),
    a.edge(ST.rg01BundLeak, T.rg01BundLeak, "MIRRORS"),
    a.edge(ST.th01RakeTorque, T.th01RakeTorque, "MIRRORS"),
    a.edge(ST.th02RakeTorque, T.th02RakeTorque, "MIRRORS"),
    a.edge(ST.pw01TankLevel, T.pw01TankLevel, "MIRRORS"),
    a.edge(ST.plantMode, T.plantModeRemote, "MIRRORS"),
    a.edge(ST.gwALink, T.gwALink, "MIRRORS"),
    a.edge(ST.gwBLink, T.gwBLink, "MIRRORS"),
    a.edge(ST.telemetryAge, T.telemetryAge, "MIRRORS"),
    a.edge(ST.timeSyncOk, T.timeSyncOk, "MIRRORS"),

    /* What the indications monitor. Nothing here ACTUATES anything: this
     * reference observes the plant and drives no part of it. */
    a.edge(T.romHopperLevel, EQ.romHopper, "MONITORS"),
    a.edge(T.feederSpeed, EQ.apronFeeder, "MONITORS"),
    a.edge(T.feederRunning, EQ.apronFeeder, "MONITORS"),
    a.edge(T.feederModeRemote, EQ.apronFeeder, "MONITORS"),
    a.edge(T.grizzlyRunning, EQ.grizzly, "MONITORS"),
    a.edge(T.cr01MotorCurrent, EQ.jawCrusher, "MONITORS"),
    a.edge(T.cr01PowerDraw, EQ.jawCrusher, "MONITORS"),
    a.edge(T.cr01ChokeLevel, EQ.jawCrusher, "MONITORS"),
    a.edge(T.cr01HydraulicPressure, EQ.jawCrusher, "MONITORS"),
    a.edge(T.cr01Running, EQ.jawCrusher, "MONITORS"),
    a.edge(T.cr01GuardClosed, EQ.jawCrusher, "MONITORS"),
    a.edge(T.cr02MotorCurrent, EQ.coneCrusher, "MONITORS"),
    a.edge(T.cr02Running, EQ.coneCrusher, "MONITORS"),
    a.edge(T.sc01Vibration, EQ.screen, "MONITORS"),
    a.edge(T.sc01BearingTemp, EQ.screen, "MONITORS"),
    a.edge(T.sc01Running, EQ.screen, "MONITORS"),
    a.edge(T.cv01BeltSpeed, EQ.cv01, "MONITORS"),
    a.edge(T.cv01Running, EQ.cv01, "MONITORS"),
    a.edge(T.cv02BeltSpeed, EQ.cv02, "MONITORS"),
    a.edge(T.cv02Running, EQ.cv02, "MONITORS"),
    a.edge(T.cv02PullcordHealthy, EQ.cv02, "MONITORS"),
    a.edge(T.cv02EstopHealthy, EQ.cv02, "MONITORS"),
    a.edge(T.cv02AlignHealthy, EQ.cv02, "MONITORS"),
    a.edge(T.cv03BeltSpeed, EQ.cv03, "MONITORS"),
    a.edge(T.cv03DriveSpeedRef, EQ.cv03, "MONITORS"),
    a.edge(T.cv03DriveCurrent, EQ.cv03, "MONITORS"),
    a.edge(T.cv03DriveFault, EQ.cv03, "MONITORS"),
    a.edge(T.cv03ZeroSpeedTrip, EQ.cv03, "MONITORS"),
    a.edge(T.cv03AlignHealthy, EQ.cv03, "MONITORS"),
    a.edge(T.cv03PullcordHealthy, EQ.cv03, "MONITORS"),
    a.edge(T.cv03PulleyBearingTemp, EQ.cv03, "MONITORS"),
    a.edge(T.cv03WeightometerRate, EQ.cv03, "MONITORS"),
    a.edge(T.md01MetalDetected, EQ.metalDetector, "MONITORS"),
    a.edge(T.ms01MagnetCurrent, EQ.magnetSeparator, "MONITORS"),
    a.edge(T.ms01Running, EQ.magnetSeparator, "MONITORS"),
    a.edge(T.stockpileLevel, EQ.stockpile, "MONITORS"),
    a.edge(T.stockpileReclaimRate, EQ.stockpile, "MONITORS"),
    a.edge(T.ml01MillPower, EQ.sagMill, "MONITORS"),
    a.edge(T.ml01MotorCurrent, EQ.sagMill, "MONITORS"),
    a.edge(T.ml01MotorWindingTemp, EQ.sagMill, "MONITORS"),
    a.edge(T.ml01DriveFault, EQ.sagMill, "MONITORS"),
    a.edge(T.ml01PinionBearingTemp, EQ.sagMill, "MONITORS"),
    a.edge(T.ml01ShellVibration, EQ.sagMill, "MONITORS"),
    a.edge(T.ml01MillSpeed, EQ.sagMill, "MONITORS"),
    a.edge(T.ml01FeedRate, EQ.sagMill, "MONITORS"),
    a.edge(T.ml01LubePressure, EQ.sagMill, "MONITORS"),
    a.edge(T.ml01LubeOilTemp, EQ.sagMill, "MONITORS"),
    a.edge(T.ml02MillPower, EQ.ballMill, "MONITORS"),
    a.edge(T.ml02PinionBearingTemp, EQ.ballMill, "MONITORS"),
    a.edge(T.sumpLevel, EQ.sump, "MONITORS"),
    a.edge(T.pu01SuctionPressure, EQ.slurryPump, "MONITORS"),
    a.edge(T.pu01DischargePressure, EQ.slurryPump, "MONITORS"),
    a.edge(T.pu01Flow, EQ.slurryPump, "MONITORS"),
    a.edge(T.pu01MotorCurrent, EQ.slurryPump, "MONITORS"),
    a.edge(T.pu01Vibration, EQ.slurryPump, "MONITORS"),
    a.edge(T.pu01Speed, EQ.slurryPump, "MONITORS"),
    a.edge(T.pu01Running, EQ.slurryPump, "MONITORS"),
    a.edge(T.cy01FeedPressure, EQ.cyclones, "MONITORS"),
    a.edge(T.cy01FeedDensity, EQ.cyclones, "MONITORS"),
    a.edge(T.cy01OverflowDensity, EQ.cyclones, "MONITORS"),
    a.edge(T.cy01DensityQuality, EQ.cyclones, "MONITORS"),
    a.edge(T.cy01OpenCyclones, EQ.cyclones, "MONITORS"),
    a.edge(T.fl01CellLevel, EQ.flotation, "MONITORS"),
    a.edge(T.fl01AirFlow, EQ.flotation, "MONITORS"),
    a.edge(T.fl01PulpPh, EQ.flotation, "MONITORS"),
    a.edge(T.fl01FrothDepth, EQ.flotation, "MONITORS"),
    a.edge(T.rg01CollectorFlow, EQ.reagents, "MONITORS"),
    a.edge(T.rg01FrotherFlow, EQ.reagents, "MONITORS"),
    a.edge(T.rg01TankLevel, EQ.reagents, "MONITORS"),
    a.edge(T.rg01BundLeak, EQ.reagents, "MONITORS"),
    a.edge(T.th01BedLevel, EQ.concThickener, "MONITORS"),
    a.edge(T.th01RakeTorque, EQ.concThickener, "MONITORS"),
    a.edge(T.th01UnderflowDensity, EQ.concThickener, "MONITORS"),
    a.edge(T.fp01ChamberPressure, EQ.concFilter, "MONITORS"),
    a.edge(T.fp01FiltrateFlow, EQ.concFilter, "MONITORS"),
    a.edge(T.th02BedLevel, EQ.tailingsThickener, "MONITORS"),
    a.edge(T.th02RakeTorque, EQ.tailingsThickener, "MONITORS"),
    a.edge(T.th02UnderflowDensity, EQ.tailingsThickener, "MONITORS"),
    a.edge(T.pu02DischargePressure, EQ.tailingsPump, "MONITORS"),
    a.edge(T.pu02Running, EQ.tailingsPump, "MONITORS"),
    a.edge(T.tailingsLinePressure, EQ.tailingsPump, "MONITORS"),
    a.edge(T.ds01SprayPressure, EQ.dustSuppression, "MONITORS"),
    a.edge(T.ds01Running, EQ.dustSuppression, "MONITORS"),
    a.edge(T.pw01TankLevel, EQ.processWater, "MONITORS"),
    a.edge(T.pw01MakeupFlow, EQ.processWater, "MONITORS"),
    a.edge(T.pw01ReclaimFlow, EQ.processWater, "MONITORS"),
    a.edge(D.vfdMill, EQ.sagMill, "MONITORS"),
    a.edge(D.vfdCv03, EQ.cv03, "MONITORS"),
    a.edge(D.mcc, EQ.slurryPump, "MONITORS"),
    a.edge(D.safetyPlc, EQ.cv02, "MONITORS"),

    /* Sequences and their gates */
    ...chainStates(a, [S.stopped, S.utilities, S.conveyors, S.crushing, S.grinding, S.flotation]),
    ...chainStates(a, [AS.normal, AS.unack, AS.acked, AS.rtnUnack]),
    a.edge(
      AS.rtnUnack,
      AS.normal,
      "TRANSITIONS_TO",
      t("Acknowledgement of a returned alarm closes the lifecycle", "تأیید آلارمِ بازگشته چرخه را می‌بندد"),
    ),
    a.edge(P.telemetryFresh, SQ, "GATES"),
    a.edge(P.plantRemote, SQ, "GATES"),
    a.edge(P.processWater, S.utilities, "GATES"),
    a.edge(P.dustSuppression, S.utilities, "GATES"),
    a.edge(P.conveyorRoute, S.conveyors, "GATES"),
    a.edge(P.millLubrication, S.grinding, "GATES"),
    a.edge(P.sumpLevel, S.flotation, "GATES"),
    a.edge(I.conveyorSafety, S.conveyors, "BLOCKS"),
    a.edge(I.metalDetector, S.conveyors, "BLOCKS"),
    a.edge(I.crusherProtection, S.crushing, "BLOCKS"),
    a.edge(I.millProtection, S.grinding, "BLOCKS"),
    a.edge(I.tailingsLine, S.flotation, "BLOCKS"),

    /* What each permissive and interlock actually reads */
    a.edge(P.telemetryFresh, T.gwALink, "READS"),
    a.edge(P.telemetryFresh, T.gwBLink, "READS"),
    a.edge(P.telemetryFresh, T.telemetryAge, "READS"),
    a.edge(P.plantRemote, T.plantModeRemote, "READS"),
    a.edge(P.conveyorRoute, T.cv01Running, "READS"),
    a.edge(P.conveyorRoute, T.cv02Running, "READS"),
    a.edge(P.conveyorRoute, T.cv03BeltSpeed, "READS"),
    a.edge(P.millLubrication, T.ml01LubePressure, "READS"),
    a.edge(P.millLubrication, T.ml01LubeOilTemp, "READS"),
    a.edge(P.sumpLevel, T.sumpLevel, "READS"),
    a.edge(P.processWater, T.pw01TankLevel, "READS"),
    a.edge(P.processWater, T.pw01MakeupFlow, "READS"),
    a.edge(P.dustSuppression, T.ds01Running, "READS"),
    a.edge(P.dustSuppression, T.ds01SprayPressure, "READS"),
    a.edge(I.conveyorSafety, T.cv02PullcordHealthy, "READS"),
    a.edge(I.conveyorSafety, T.cv02EstopHealthy, "READS"),
    a.edge(I.conveyorSafety, T.cv02AlignHealthy, "READS"),
    a.edge(I.conveyorSafety, T.cv03ZeroSpeedTrip, "READS"),
    a.edge(I.conveyorSafety, T.cv03AlignHealthy, "READS"),
    a.edge(I.conveyorSafety, T.cv03PullcordHealthy, "READS"),
    a.edge(I.crusherProtection, T.cr01PowerDraw, "READS"),
    a.edge(I.crusherProtection, T.cr01HydraulicPressure, "READS"),
    a.edge(I.crusherProtection, T.cr01GuardClosed, "READS"),
    a.edge(I.millProtection, T.ml01PinionBearingTemp, "READS"),
    a.edge(I.millProtection, T.ml01LubePressure, "READS"),
    a.edge(I.millProtection, T.ml01DriveFault, "READS"),
    a.edge(I.metalDetector, T.md01MetalDetected, "READS"),
    a.edge(I.tailingsLine, T.th02RakeTorque, "READS"),
    a.edge(I.tailingsLine, T.pu02DischargePressure, "READS"),
    a.edge(I.tailingsLine, T.tailingsLinePressure, "READS"),

    /* Alarms */
    a.edge(T.cr01ChokeLevel, AL.crusherChoke, "RAISES"),
    a.edge(S.crushing, AL.crushingStartTimeout, "RAISES"),
    a.edge(T.cv03ZeroSpeedTrip, AL.cv03BeltSlip, "RAISES"),
    a.edge(I.conveyorSafety, AL.cv02Pullcord, "RAISES"),
    a.edge(T.md01MetalDetected, AL.metalDetected, "RAISES"),
    a.edge(T.ml01DriveFault, AL.millDriveFault, "RAISES"),
    a.edge(T.ml01PinionBearingTemp, AL.millBearingTempHigh, "RAISES"),
    a.edge(T.pu01SuctionPressure, AL.pumpCavitation, "RAISES"),
    a.edge(T.cy01DensityQuality, AL.cycloneDeviation, "RAISES"),
    a.edge(ST.telemetryStale, AL.commsStale, "RAISES"),
    a.edge(T.timeSyncOk, AL.timeSyncLost, "RAISES"),
    a.edge(T.feederModeRemote, AL.feederInLocal, "RAISES"),
    a.edge(T.th02RakeTorque, AL.tailingsRakeTorque, "RAISES"),
    a.edge(T.rg01BundLeak, AL.reagentBundLeak, "RAISES"),

    /* Operator screens */
    a.edge(H.overview, ST.gwALink, "DISPLAYS"),
    a.edge(H.overview, ST.gwBLink, "DISPLAYS"),
    a.edge(H.overview, ST.timeSyncOk, "DISPLAYS"),
    a.edge(H.overview, ST.cv03WeightometerRate, "DISPLAYS"),
    a.edge(H.overview, ST.specificEnergy, "DISPLAYS"),
    a.edge(H.overview, ST.stockpileLevel, "DISPLAYS"),
    a.edge(H.overview, H.crushing, "NAVIGATES_TO"),
    a.edge(H.overview, H.conveyors, "NAVIGATES_TO"),
    a.edge(H.overview, H.grinding, "NAVIGATES_TO"),
    a.edge(H.overview, H.classification, "NAVIGATES_TO"),
    a.edge(H.overview, H.flotation, "NAVIGATES_TO"),
    a.edge(H.overview, H.dewatering, "NAVIGATES_TO"),
    a.edge(H.overview, H.utilities, "NAVIGATES_TO"),
    a.edge(H.overview, H.alarms, "NAVIGATES_TO"),
    a.edge(H.crushing, ST.romHopperLevel, "DISPLAYS"),
    a.edge(H.crushing, ST.feederSpeed, "DISPLAYS"),
    a.edge(H.crushing, ST.feederModeRemote, "DISPLAYS"),
    a.edge(H.crushing, ST.plantMode, "DISPLAYS"),
    a.edge(H.crushing, ST.cr01PowerDraw, "DISPLAYS"),
    a.edge(H.crushing, ST.cr01ChokeLevel, "DISPLAYS"),
    a.edge(H.crushing, ST.sc01Vibration, "DISPLAYS"),
    a.edge(H.crushing, ST.feederRateIntent, "COMMANDS"),
    a.edge(H.crushing, H.overview, "NAVIGATES_TO"),
    a.edge(H.conveyors, ST.cv03BeltSpeed, "DISPLAYS"),
    a.edge(H.conveyors, ST.cv03WeightometerRate, "DISPLAYS"),
    a.edge(H.conveyors, ST.cv02PullcordHealthy, "DISPLAYS"),
    a.edge(H.conveyors, ST.cv03AlignHealthy, "DISPLAYS"),
    a.edge(H.conveyors, ST.md01MetalDetected, "DISPLAYS"),
    a.edge(H.conveyors, H.overview, "NAVIGATES_TO"),
    a.edge(H.grinding, ST.ml01MillPower, "DISPLAYS"),
    a.edge(H.grinding, ST.ml01FeedRate, "DISPLAYS"),
    a.edge(H.grinding, ST.ml01PinionBearingTemp, "DISPLAYS"),
    a.edge(H.grinding, ST.ml01ShellVibration, "DISPLAYS"),
    a.edge(H.grinding, ST.ml01LubePressure, "DISPLAYS"),
    a.edge(H.grinding, ST.millFeedTrimIntent, "COMMANDS"),
    a.edge(H.grinding, H.overview, "NAVIGATES_TO"),
    a.edge(H.classification, ST.cy01FeedPressure, "DISPLAYS"),
    a.edge(H.classification, ST.cy01FeedDensity, "DISPLAYS"),
    a.edge(H.classification, ST.cy01DensityQuality, "DISPLAYS"),
    a.edge(H.classification, ST.sumpLevel, "DISPLAYS"),
    a.edge(H.classification, ST.pu01SuctionPressure, "DISPLAYS"),
    a.edge(H.classification, ST.pu01Flow, "DISPLAYS"),
    a.edge(H.classification, H.overview, "NAVIGATES_TO"),
    a.edge(H.flotation, ST.fl01CellLevel, "DISPLAYS"),
    a.edge(H.flotation, ST.rg01CollectorFlow, "DISPLAYS"),
    a.edge(H.flotation, ST.rg01BundLeak, "DISPLAYS"),
    a.edge(H.flotation, H.overview, "NAVIGATES_TO"),
    a.edge(H.dewatering, ST.th01RakeTorque, "DISPLAYS"),
    a.edge(H.dewatering, ST.th02RakeTorque, "DISPLAYS"),
    a.edge(H.dewatering, H.overview, "NAVIGATES_TO"),
    a.edge(H.utilities, ST.pw01TankLevel, "DISPLAYS"),
    a.edge(H.utilities, H.overview, "NAVIGATES_TO"),
    a.edge(H.alarms, ST.telemetryStale, "DISPLAYS"),
    a.edge(H.alarms, ST.ackCmd, "COMMANDS"),
    a.edge(H.alarms, H.overview, "NAVIGATES_TO"),

    a.edge(HO.commsHealth, ST.gwALink, "DISPLAYS"),
    a.edge(HO.commsHealth, ST.gwBLink, "DISPLAYS"),
    a.edge(HO.timeSyncHealth, ST.timeSyncOk, "DISPLAYS"),
    a.edge(HO.throughput, ST.cv03WeightometerRate, "DISPLAYS"),
    a.edge(HO.throughput, ST.specificEnergy, "DISPLAYS"),
    a.edge(HO.throughput, ST.stockpileLevel, "DISPLAYS"),
    a.edge(HO.romHopper, ST.romHopperLevel, "DISPLAYS"),
    a.edge(HO.romHopper, ST.feederSpeed, "DISPLAYS"),
    a.edge(HO.romHopper, ST.feederModeRemote, "DISPLAYS"),
    a.edge(HO.romHopper, ST.plantMode, "DISPLAYS"),
    a.edge(HO.feederRate, ST.feederRateIntent, "COMMANDS"),
    a.edge(HO.crusherLoad, ST.cr01PowerDraw, "DISPLAYS"),
    a.edge(HO.crusherLoad, ST.cr01ChokeLevel, "DISPLAYS"),
    a.edge(HO.screenVibration, ST.sc01Vibration, "DISPLAYS"),
    a.edge(HO.cv03Speed, ST.cv03BeltSpeed, "DISPLAYS"),
    a.edge(HO.cv03Speed, ST.cv03WeightometerRate, "DISPLAYS"),
    a.edge(HO.cv02Safety, ST.cv02PullcordHealthy, "DISPLAYS"),
    a.edge(HO.cv02Safety, ST.cv03AlignHealthy, "DISPLAYS"),
    a.edge(HO.metalDetector, ST.md01MetalDetected, "DISPLAYS"),
    a.edge(HO.millPower, ST.ml01MillPower, "DISPLAYS"),
    a.edge(HO.millPower, ST.ml01FeedRate, "DISPLAYS"),
    a.edge(HO.millBearing, ST.ml01PinionBearingTemp, "DISPLAYS"),
    a.edge(HO.millBearing, ST.ml01ShellVibration, "DISPLAYS"),
    a.edge(HO.millBearing, ST.ml01LubePressure, "DISPLAYS"),
    a.edge(HO.millFeedTrim, ST.millFeedTrimIntent, "COMMANDS"),
    a.edge(HO.cycloneFeed, ST.cy01FeedPressure, "DISPLAYS"),
    a.edge(HO.cycloneFeed, ST.cy01FeedDensity, "DISPLAYS"),
    a.edge(HO.cycloneFeed, ST.cy01DensityQuality, "DISPLAYS"),
    a.edge(HO.sumpLevel, ST.sumpLevel, "DISPLAYS"),
    a.edge(HO.sumpLevel, ST.pu01SuctionPressure, "DISPLAYS"),
    a.edge(HO.sumpLevel, ST.pu01Flow, "DISPLAYS"),
    a.edge(HO.flotationLevel, ST.fl01CellLevel, "DISPLAYS"),
    a.edge(HO.reagentMonitor, ST.rg01CollectorFlow, "DISPLAYS"),
    a.edge(HO.reagentMonitor, ST.rg01BundLeak, "DISPLAYS"),
    a.edge(HO.thickenerTorque, ST.th01RakeTorque, "DISPLAYS"),
    a.edge(HO.thickenerTorque, ST.th02RakeTorque, "DISPLAYS"),
    a.edge(HO.processWater, ST.pw01TankLevel, "DISPLAYS"),
    a.edge(HO.alarmBanner, ST.telemetryStale, "DISPLAYS"),
    a.edge(HO.alarmBanner, ST.ackCmd, "COMMANDS"),

    /* Scripts — recovered from the supervisory source itself */
    a.edge(SC.feederRateIntent, ST.plantMode, "READS"),
    a.edge(SC.feederRateIntent, ST.romHopperLevel, "READS"),
    a.edge(SC.feederRateIntent, ST.cv03WeightometerRate, "READS"),
    a.edge(SC.feederRateIntent, ST.feederRateIntent, "WRITES"),
    a.edge(SC.feederRateIntent, H.crushing, "NAVIGATES_TO"),
    a.edge(SC.millFeedTrimIntent, ST.cy01DensityQuality, "READS"),
    a.edge(SC.millFeedTrimIntent, ST.ml01MillPower, "READS"),
    a.edge(SC.millFeedTrimIntent, ST.sumpLevel, "READS"),
    a.edge(SC.millFeedTrimIntent, ST.millFeedTrimIntent, "WRITES"),
    a.edge(SC.alarmAck, ST.ackCmd, "WRITES"),
    a.edge(SC.alarmAck, H.alarms, "NAVIGATES_TO"),
    a.edge(SC.watchdog, ST.gwALink, "READS"),
    a.edge(SC.watchdog, ST.gwBLink, "READS"),
    a.edge(SC.watchdog, ST.telemetryAge, "READS"),
    a.edge(SC.watchdog, ST.timeSyncOk, "READS"),
    a.edge(SC.watchdog, ST.telemetryStale, "WRITES"),
    a.edge(SC.kpiCalc, ST.telemetryStale, "READS"),
    a.edge(SC.kpiCalc, ST.ml01MillPower, "READS"),
    a.edge(SC.kpiCalc, ST.cv03WeightometerRate, "READS"),
    a.edge(SC.kpiCalc, ST.specificEnergy, "WRITES"),

    /* Governance — declared authorisation and audit trail */
    a.edge(SC.feederRateIntent, R.supervisor, "REQUIRES_ROLE"),
    a.edge(SC.feederRateIntent, AE.feederRateIntent, "EMITS"),
    a.edge(SC.millFeedTrimIntent, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.millFeedTrimIntent, AE.millFeedTrimIntent, "EMITS"),
    a.edge(SC.alarmAck, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.alarmAck, AE.alarmAck, "EMITS"),
    // No REQUIRES_ROLE on either scheduled routine. Both still emit.
    a.edge(SC.watchdog, AE.watchdog, "EMITS"),
    a.edge(SC.kpiCalc, AE.kpiCalc, "EMITS"),

    /* Historian and KPI */
    a.edge(EV.processTrend, T.cr01PowerDraw, "RECORDS"),
    a.edge(EV.processTrend, T.cr01ChokeLevel, "RECORDS"),
    a.edge(EV.processTrend, T.cv03WeightometerRate, "RECORDS"),
    a.edge(EV.processTrend, T.cy01FeedPressure, "RECORDS"),
    a.edge(EV.processTrend, T.cy01FeedDensity, "RECORDS"),
    a.edge(EV.processTrend, T.sumpLevel, "RECORDS"),
    a.edge(EV.processTrend, T.rg01CollectorFlow, "RECORDS"),
    a.edge(EV.processTrend, T.th01RakeTorque, "RECORDS"),
    a.edge(EV.vibrationTrend, T.ml01ShellVibration, "RECORDS"),
    a.edge(EV.vibrationTrend, T.ml01PinionBearingTemp, "RECORDS"),
    a.edge(EV.vibrationTrend, T.pu01Vibration, "RECORDS"),
    a.edge(EV.vibrationTrend, T.cv03PulleyBearingTemp, "RECORDS"),
    a.edge(EV.driveEventLog, T.ml01DriveFault, "RECORDS"),
    a.edge(EV.driveEventLog, T.cv03DriveFault, "RECORDS"),
    a.edge(EV.driveEventLog, T.cr01Running, "RECORDS"),
    a.edge(EV.driveEventLog, T.cr02Running, "RECORDS"),
    a.edge(EV.commsLinkLog, T.gwALink, "RECORDS"),
    a.edge(EV.commsLinkLog, T.gwBLink, "RECORDS"),
    a.edge(EV.commsLinkLog, T.telemetryAge, "RECORDS"),
    a.edge(EV.plantAuditLog, T.feederModeRemote, "RECORDS"),
    a.edge(EV.plantAuditLog, T.plantModeRemote, "RECORDS"),
    a.edge(EV.safetyEventLog, T.cv02PullcordHealthy, "RECORDS"),
    a.edge(EV.safetyEventLog, T.cv02EstopHealthy, "RECORDS"),
    a.edge(EV.safetyEventLog, T.md01MetalDetected, "RECORDS"),
    a.edge(EV.waterBalanceTrend, T.pw01MakeupFlow, "RECORDS"),
    a.edge(EV.waterBalanceTrend, T.pw01ReclaimFlow, "RECORDS"),
    a.edge(EV.waterBalanceTrend, T.th02UnderflowDensity, "RECORDS"),
    a.edge(K.throughput, T.cv03WeightometerRate, "DERIVED_FROM"),
    a.edge(K.recovery, T.fl01CellLevel, "DERIVED_FROM"),
    a.edge(K.recovery, T.ml01FeedRate, "DERIVED_FROM"),
    a.edge(K.recovery, T.th01UnderflowDensity, "DERIVED_FROM"),
    a.edge(K.availability, T.ml01MillPower, "DERIVED_FROM"),
    a.edge(K.availability, T.cv03BeltSpeed, "DERIVED_FROM"),
    a.edge(K.specificEnergy, T.ml01MillPower, "DERIVED_FROM"),
    a.edge(K.specificEnergy, T.cv03WeightometerRate, "DERIVED_FROM"),
    a.edge(K.waterIntensity, T.pw01MakeupFlow, "DERIVED_FROM"),
    a.edge(K.waterIntensity, T.pw01ReclaimFlow, "DERIVED_FROM"),
    a.edge(K.waterIntensity, T.cv03WeightometerRate, "DERIVED_FROM"),

    /* Fault modes — what each one explains and what is evidence for it */
    a.edge(FM.crusherChoke, AL.crusherChoke, "EXPLAINS"),
    a.edge(FM.crusherChoke, AL.metalDetected, "EXPLAINS"),
    a.edge(T.cr01ChokeLevel, FM.crusherChoke, "EVIDENCE_FOR"),
    a.edge(T.cr01PowerDraw, FM.crusherChoke, "EVIDENCE_FOR"),
    a.edge(T.cr01HydraulicPressure, FM.crusherChoke, "EVIDENCE_FOR"),
    a.edge(T.md01MetalDetected, FM.crusherChoke, "EVIDENCE_FOR"),
    a.edge(EV.processTrend, FM.crusherChoke, "EVIDENCE_FOR"),

    a.edge(FM.crushingTimeout, AL.crushingStartTimeout, "EXPLAINS"),
    a.edge(T.cr01Running, FM.crushingTimeout, "EVIDENCE_FOR"),
    a.edge(T.cr02Running, FM.crushingTimeout, "EVIDENCE_FOR"),
    a.edge(P.conveyorRoute, FM.crushingTimeout, "EVIDENCE_FOR"),
    a.edge(EV.driveEventLog, FM.crushingTimeout, "EVIDENCE_FOR"),

    a.edge(FM.beltSlip, AL.cv03BeltSlip, "EXPLAINS"),
    a.edge(T.cv03BeltSpeed, FM.beltSlip, "EVIDENCE_FOR"),
    a.edge(T.cv03ZeroSpeedTrip, FM.beltSlip, "EVIDENCE_FOR"),
    a.edge(T.cv03DriveCurrent, FM.beltSlip, "EVIDENCE_FOR"),
    a.edge(T.cv03PulleyBearingTemp, FM.beltSlip, "EVIDENCE_FOR"),
    a.edge(EV.vibrationTrend, FM.beltSlip, "EVIDENCE_FOR"),

    a.edge(FM.millDrive, AL.millDriveFault, "EXPLAINS"),
    a.edge(FM.millDrive, AL.millBearingTempHigh, "EXPLAINS"),
    a.edge(T.ml01DriveFault, FM.millDrive, "EVIDENCE_FOR"),
    a.edge(T.ml01PinionBearingTemp, FM.millDrive, "EVIDENCE_FOR"),
    a.edge(T.ml01ShellVibration, FM.millDrive, "EVIDENCE_FOR"),
    a.edge(T.ml01LubePressure, FM.millDrive, "EVIDENCE_FOR"),
    a.edge(T.ml01MotorWindingTemp, FM.millDrive, "EVIDENCE_FOR"),
    a.edge(EV.driveEventLog, FM.millDrive, "EVIDENCE_FOR"),

    a.edge(FM.pumpCavitation, AL.pumpCavitation, "EXPLAINS"),
    a.edge(T.pu01SuctionPressure, FM.pumpCavitation, "EVIDENCE_FOR"),
    a.edge(T.sumpLevel, FM.pumpCavitation, "EVIDENCE_FOR"),
    a.edge(T.pu01Vibration, FM.pumpCavitation, "EVIDENCE_FOR"),
    a.edge(T.pu01MotorCurrent, FM.pumpCavitation, "EVIDENCE_FOR"),
    a.edge(T.pu01Flow, FM.pumpCavitation, "EVIDENCE_FOR"),
    a.edge(EV.processTrend, FM.pumpCavitation, "EVIDENCE_FOR"),

    a.edge(FM.densityTransmitter, AL.cycloneDeviation, "EXPLAINS"),
    a.edge(T.cy01FeedDensity, FM.densityTransmitter, "EVIDENCE_FOR"),
    a.edge(T.cy01DensityQuality, FM.densityTransmitter, "EVIDENCE_FOR"),
    a.edge(IO.cy01DensityAi, FM.densityTransmitter, "EVIDENCE_FOR"),
    a.edge(EV.processTrend, FM.densityTransmitter, "EVIDENCE_FOR"),

    a.edge(FM.commsLoss, AL.commsStale, "EXPLAINS"),
    a.edge(FM.commsLoss, AL.timeSyncLost, "EXPLAINS"),
    a.edge(T.gwALink, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(T.gwBLink, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(T.telemetryAge, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(T.timeSyncOk, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(EV.commsLinkLog, FM.commsLoss, "EVIDENCE_FOR"),

    a.edge(FM.pullcordInterlock, AL.cv02Pullcord, "EXPLAINS"),
    a.edge(I.conveyorSafety, FM.pullcordInterlock, "EVIDENCE_FOR"),
    a.edge(T.cv02PullcordHealthy, FM.pullcordInterlock, "EVIDENCE_FOR"),
    a.edge(T.cv02Running, FM.pullcordInterlock, "EVIDENCE_FOR"),
    a.edge(EV.safetyEventLog, FM.pullcordInterlock, "EVIDENCE_FOR"),

    a.edge(FM.feederInLocal, AL.feederInLocal, "EXPLAINS"),
    a.edge(T.feederModeRemote, FM.feederInLocal, "EVIDENCE_FOR"),
    a.edge(T.feederRunning, FM.feederInLocal, "EVIDENCE_FOR"),
    a.edge(EV.plantAuditLog, FM.feederInLocal, "EVIDENCE_FOR"),

    a.edge(FM.tailingsOvertorque, AL.tailingsRakeTorque, "EXPLAINS"),
    a.edge(T.th02RakeTorque, FM.tailingsOvertorque, "EVIDENCE_FOR"),
    a.edge(T.th02BedLevel, FM.tailingsOvertorque, "EVIDENCE_FOR"),
    a.edge(T.th02UnderflowDensity, FM.tailingsOvertorque, "EVIDENCE_FOR"),
    a.edge(T.pu02DischargePressure, FM.tailingsOvertorque, "EVIDENCE_FOR"),
    a.edge(T.tailingsLinePressure, FM.tailingsOvertorque, "EVIDENCE_FOR"),
    a.edge(EV.waterBalanceTrend, FM.tailingsOvertorque, "EVIDENCE_FOR"),

    a.edge(FM.reagentContainment, AL.reagentBundLeak, "EXPLAINS"),
    a.edge(T.rg01BundLeak, FM.reagentContainment, "EVIDENCE_FOR"),
    a.edge(T.rg01TankLevel, FM.reagentContainment, "EVIDENCE_FOR"),
    a.edge(T.rg01CollectorFlow, FM.reagentContainment, "EVIDENCE_FOR"),
    a.edge(EV.processTrend, FM.reagentContainment, "EVIDENCE_FOR"),

    /* Safe actions */
    a.edge(SA.crusherCavity, FM.crusherChoke, "VERIFIES"),
    a.edge(SA.crushingPermissives, FM.crushingTimeout, "VERIFIES"),
    a.edge(SA.beltTension, FM.beltSlip, "VERIFIES"),
    a.edge(SA.millDrive, FM.millDrive, "VERIFIES"),
    a.edge(SA.pumpSuction, FM.pumpCavitation, "VERIFIES"),
    a.edge(SA.cycloneInstrument, FM.densityTransmitter, "VERIFIES"),
    a.edge(SA.gatewaySessions, FM.commsLoss, "VERIFIES"),
    a.edge(SA.conveyorSafety, FM.pullcordInterlock, "VERIFIES"),
    a.edge(SA.auditReview, FM.feederInLocal, "VERIFIES"),
    a.edge(SA.tailingsReview, FM.tailingsOvertorque, "VERIFIES"),
    a.edge(SA.reagentReview, FM.reagentContainment, "VERIFIES"),
  ],

  artifacts: [
    {
      local: "SupervisoryScripts",
      language: "JAVASCRIPT",
      layer: "SCADA",
      fileName: "SupervisoryScripts.js",
      declares: [
        SC.feederRateIntent,
        SC.millFeedTrimIntent,
        SC.alarmAck,
        SC.watchdog,
        SC.kpiCalc,
      ],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "SCRIPTS/Concentrator",
        domain: "SUPERVISORY",
        safetyClass: "NON_SAFETY",
      },
      content: SUPERVISORY_SCRIPTS,
    },
    {
      local: "OperatorScreens",
      language: "HMI_JSON",
      layer: "HMI",
      fileName: "OperatorScreens.hmi.json",
      declares: [
        H.overview,
        H.crushing,
        H.conveyors,
        H.grinding,
        H.classification,
        H.flotation,
        H.dewatering,
        H.utilities,
        H.alarms,
        HO.commsHealth,
        HO.timeSyncHealth,
        HO.throughput,
        HO.romHopper,
        HO.feederRate,
        HO.crusherLoad,
        HO.screenVibration,
        HO.cv03Speed,
        HO.cv02Safety,
        HO.metalDetector,
        HO.millPower,
        HO.millBearing,
        HO.millFeedTrim,
        HO.cycloneFeed,
        HO.sumpLevel,
        HO.flotationLevel,
        HO.reagentMonitor,
        HO.thickenerTorque,
        HO.processWater,
        HO.alarmBanner,
      ],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "SCREENS/Operator",
        domain: "OPERATOR_INTERFACE",
        safetyClass: "NON_SAFETY",
      },
      content: OPERATOR_SCREENS,
    },
    {
      local: "SupervisoryConfiguration",
      language: "SCADA_JSON",
      layer: "SCADA",
      fileName: "SupervisoryConfiguration.json",
      declares: [
        D.primary,
        D.standby,
        D.gwA,
        D.gwB,
        D.historian,
        D.timeServer,
        AQ,
        EV.processTrend,
        EV.vibrationTrend,
        EV.driveEventLog,
        EV.commsLinkLog,
        EV.plantAuditLog,
        EV.safetyEventLog,
        EV.waterBalanceTrend,
      ],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "CONFIG/Concentrator",
        domain: "SUPERVISORY",
        safetyClass: "NON_SAFETY",
      },
      content: SUPERVISORY_CONFIG,
    },
  ],

  scenarios: [
    {
      id: "SCADA-05-FS-01",
      title: t("Primary crusher choking with tramp metal on the belt", "گرفتگی سنگ‌شکن اولیه هم‌زمان با فلز مزاحم روی نوار"),
      narrative: t(
        "The primary crusher is drawing well above its normal power, the cavity level will not come down and the hydraulic pressure has risen with it. The metal detector picked up shortly before, and the feed has not changed.",
        "سنگ‌شکن اولیه بسیار بیش از توان عادی خود جریان می‌کشد، سطح محفظه پایین نمی‌آید و فشار هیدرولیک همراه آن بالا رفته است. اندکی پیش‌تر فلزیاب فعال شده و خوراک تغییری نکرده است.",
      ),
      observations: [
        { nodeId: AL.crusherChoke, state: "TRUE" },
        { nodeId: AL.metalDetected, state: "TRUE" },
        { nodeId: T.cr01ChokeLevel, state: "ABNORMAL", detail: "cavity full and not drawing down" },
        { nodeId: T.cr01PowerDraw, state: "ABNORMAL", detail: "well above the normal band" },
        { nodeId: T.cr01HydraulicPressure, state: "ABNORMAL", detail: "risen with the load" },
        { nodeId: T.md01MetalDetected, state: "TRUE" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "MECHANICAL",
        faultClass: "BLOCKAGE",
        faultModeId: FM.crusherChoke,
        supportingNodeIds: [T.cr01ChokeLevel, T.cr01PowerDraw, T.cr01HydraulicPressure, AL.crusherChoke],
        expectedMissingNodeIds: [EV.processTrend],
        expectedSafeActionIds: [SA.crusherCavity],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-05-FS-02",
      title: t("Crushing train did not start within its window", "راه‌نیفتادن قطار سنگ‌شکنی در بازهٔ مجاز"),
      narrative: t(
        "The crushing start was requested and the sequence timed out. Neither crusher is running and the conveyor route permissive never came in, so the step could not proceed.",
        "درخواست راه‌اندازی سنگ‌شکنی داده شد و توالی زمان‌سنجی را رد کرد. هیچ‌یک از سنگ‌شکن‌ها در حال کار نیست و مجوز مسیر نوار نقاله هرگز برقرار نشد، بنابراین این گام پیش نرفت.",
      ),
      observations: [
        { nodeId: AL.crushingStartTimeout, state: "TRUE" },
        { nodeId: P.conveyorRoute, state: "FALSE" },
        { nodeId: T.cr01Running, state: "FALSE" },
        { nodeId: T.cr02Running, state: "FALSE" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "PLC_LOGIC",
        faultClass: "SEQUENCE_TIMEOUT",
        faultModeId: FM.crushingTimeout,
        supportingNodeIds: [P.conveyorRoute, T.cr01Running, AL.crushingStartTimeout],
        expectedMissingNodeIds: [EV.driveEventLog],
        expectedSafeActionIds: [SA.crushingPermissives],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-05-FS-03",
      title: t("CV03 belt barely moving while the drive turns", "حرکت بسیار کند نوار CV03 در حالی که محرک می‌چرخد"),
      narrative: t(
        "The CV03 drive is turning at its reference speed but the belt is reading a fraction of it, the zero-speed protection has tripped, and the drive is pulling more current than the load justifies. The drive pulley bearing has warmed noticeably.",
        "محرک CV03 با سرعت مرجع خود می‌چرخد اما نوار کسری از آن را نشان می‌دهد، حفاظت سرعت صفر عمل کرده و محرک بیش از آنچه بار توجیه می‌کند جریان می‌کشد. یاتاقان پولی محرک به‌طور محسوسی گرم شده است.",
      ),
      observations: [
        { nodeId: AL.cv03BeltSlip, state: "TRUE" },
        { nodeId: T.cv03BeltSpeed, state: "ABNORMAL", detail: "a third of the drive reference" },
        { nodeId: T.cv03ZeroSpeedTrip, state: "TRUE" },
        { nodeId: T.cv03DriveCurrent, state: "ABNORMAL", detail: "high for the tonnage on the belt" },
        { nodeId: T.cv03PulleyBearingTemp, state: "ABNORMAL", detail: "warmed since the shift started" },
        { nodeId: T.cv03DriveSpeedRef, state: "NORMAL" },
        { nodeId: T.cv02PullcordHealthy, state: "NORMAL" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "MECHANICAL",
        faultClass: "ACTUATOR_FAILURE",
        faultModeId: FM.beltSlip,
        supportingNodeIds: [T.cv03BeltSpeed, T.cv03ZeroSpeedTrip, T.cv03DriveCurrent, AL.cv03BeltSlip],
        expectedMissingNodeIds: [EV.vibrationTrend],
        expectedSafeActionIds: [SA.beltTension],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-05-FS-04",
      title: t("SAG mill tripped with the pinion bearing running hot", "تریپ آسیای SAG با داغ شدن یاتاقان پینیون"),
      narrative: t(
        "The SAG mill drive faulted and stopped the mill. The pinion bearing temperature had been climbing through the shift, shell vibration rose with it, and the bearing lubrication pressure is below its normal band.",
        "درایو آسیای SAG خطا داد و آسیا را متوقف کرد. دمای یاتاقان پینیون در طول شیفت بالا می‌رفت، ارتعاش پوسته همراه آن افزایش یافت و فشار روان‌کاری یاتاقان زیر باند عادی خود است.",
      ),
      observations: [
        { nodeId: AL.millDriveFault, state: "TRUE" },
        { nodeId: AL.millBearingTempHigh, state: "TRUE" },
        { nodeId: T.ml01DriveFault, state: "TRUE", detail: "fault code latched by the drive" },
        { nodeId: T.ml01PinionBearingTemp, state: "ABNORMAL", detail: "climbing all shift" },
        { nodeId: T.ml01ShellVibration, state: "ABNORMAL", detail: "rose with the bearing temperature" },
        { nodeId: T.ml01LubePressure, state: "ABNORMAL", detail: "below the normal band" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "DRIVE",
        faultClass: "DRIVE_FAULT",
        faultModeId: FM.millDrive,
        supportingNodeIds: [T.ml01DriveFault, T.ml01PinionBearingTemp, T.ml01ShellVibration, AL.millDriveFault],
        expectedMissingNodeIds: [T.ml01MotorWindingTemp, EV.driveEventLog],
        expectedSafeActionIds: [SA.millDrive],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-05-FS-05",
      title: t("Cyclone feed pump cavitating on a drawn-down sump", "کاویتاسیون پمپ خوراک سیکلون با افت سطح مخزن مکش"),
      narrative: t(
        "The cyclone feed pump is running rough. The sump has been drawn down below its working band, suction pressure is swinging, vibration has risen and both motor current and flow are hunting instead of holding steady.",
        "پمپ خوراک سیکلون ناهموار کار می‌کند. سطح مخزن مکش زیر باند کاری خود افت کرده، فشار مکش نوسان دارد، ارتعاش بالا رفته و جریان موتور و دبی به‌جای ثابت ماندن در نوسان‌اند.",
      ),
      observations: [
        { nodeId: AL.pumpCavitation, state: "TRUE" },
        { nodeId: T.pu01SuctionPressure, state: "ABNORMAL", detail: "swinging below the design suction" },
        { nodeId: T.sumpLevel, state: "ABNORMAL", detail: "drawn down below the working band" },
        { nodeId: T.pu01Vibration, state: "ABNORMAL" },
        { nodeId: T.pu01MotorCurrent, state: "ABNORMAL", detail: "hunting with the suction" },
        { nodeId: T.pu01Flow, state: "ABNORMAL", detail: "unsteady" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.pumpCavitation,
        supportingNodeIds: [T.pu01SuctionPressure, T.sumpLevel, T.pu01Vibration, AL.pumpCavitation],
        expectedMissingNodeIds: [EV.processTrend],
        expectedSafeActionIds: [SA.pumpSuction],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-05-FS-06",
      title: t("Cyclone feed density frozen while the circuit keeps moving", "ثابت ماندن چگالی خوراک سیکلون با وجود کارکرد مدار"),
      narrative: t(
        "The cyclone feed density has shown exactly the same figure for hours while the pump speed and the feed pressure vary normally, and the bay controller has flagged the density measurement as bad quality.",
        "چگالی خوراک سیکلون ساعت‌هاست دقیقاً همان عدد را نشان می‌دهد، در حالی که سرعت پمپ و فشار خوراک به‌طور عادی تغییر می‌کنند، و کنترلر بی، اندازه‌گیری چگالی را با کیفیت نامطلوب علامت زده است.",
      ),
      observations: [
        { nodeId: AL.cycloneDeviation, state: "TRUE" },
        { nodeId: T.cy01FeedDensity, state: "STALE", detail: "identical figure for hours" },
        { nodeId: T.cy01DensityQuality, state: "FALSE" },
        { nodeId: T.cy01FeedPressure, state: "NORMAL" },
        { nodeId: T.pu01Speed, state: "NORMAL" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "SENSOR_FAILURE",
        faultModeId: FM.densityTransmitter,
        supportingNodeIds: [T.cy01FeedDensity, T.cy01DensityQuality, AL.cycloneDeviation],
        expectedMissingNodeIds: [IO.cy01DensityAi, EV.processTrend],
        expectedSafeActionIds: [SA.cycloneInstrument],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-05-FS-07",
      title: t("The whole plant picture froze at once", "کل تصویر کارخانه هم‌زمان منجمد شد"),
      narrative: t(
        "Every value from the plant stopped updating in the same second, on both gateway paths, and the event timestamps stopped advancing with them. The last readings before the freeze were all normal — which says nothing about what the plant is doing now.",
        "همهٔ مقادیر کارخانه در یک ثانیهٔ واحد و روی هر دو مسیر دروازه از به‌روزرسانی بازماندند و زمان‌مهر رویدادها نیز همراه آن‌ها متوقف شد. آخرین قرائت‌ها پیش از انجماد همگی عادی بودند — که چیزی دربارهٔ وضعیت کنونی کارخانه نمی‌گوید.",
      ),
      observations: [
        { nodeId: AL.commsStale, state: "TRUE" },
        { nodeId: AL.timeSyncLost, state: "TRUE" },
        { nodeId: T.gwALink, state: "FALSE", detail: "path A down" },
        { nodeId: T.gwBLink, state: "FALSE", detail: "path B down in the same second" },
        { nodeId: T.telemetryAge, state: "ABNORMAL", detail: "420 s and rising" },
        { nodeId: ST.ml01MillPower, state: "STALE" },
        { nodeId: ST.cv03BeltSpeed, state: "STALE" },
      ],
      groundTruth: {
        subsystem: "TELEMETRY",
        faultClass: "COMMUNICATION_LOSS",
        faultModeId: FM.commsLoss,
        supportingNodeIds: [T.gwALink, T.gwBLink, T.telemetryAge, AL.commsStale],
        expectedMissingNodeIds: [T.timeSyncOk, EV.commsLinkLog],
        expectedSafeActionIds: [SA.gatewaySessions],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-05-FS-08",
      title: t("CV02 stopped and the pull-cord circuit is open", "توقف CV02 و باز بودن مدار طناب اضطراری"),
      narrative: t(
        "CV02 is stopped and will not run. The conveyor safety circuit is open at a pull-cord, the emergency stops themselves are healthy, and the upstream conveyor kept running until the route stopped it.",
        "نوار CV02 متوقف است و راه نمی‌افتد. مدار ایمنی نوار نقاله در یکی از طناب‌های اضطراری باز است، خود توقف‌های اضطراری سالم‌اند و نوار بالادست تا زمانی که مسیر آن را متوقف کرد در حال کار بود.",
      ),
      observations: [
        { nodeId: AL.cv02Pullcord, state: "TRUE" },
        { nodeId: I.conveyorSafety, state: "TRUE" },
        { nodeId: T.cv02PullcordHealthy, state: "FALSE", detail: "a pull-cord along the walkway is operated" },
        { nodeId: T.cv02Running, state: "FALSE" },
        { nodeId: T.cv02EstopHealthy, state: "NORMAL" },
        { nodeId: T.cv01Running, state: "NORMAL" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "SAFETY_CIRCUIT",
        faultClass: "INTERLOCK_ACTIVE",
        faultModeId: FM.pullcordInterlock,
        supportingNodeIds: [I.conveyorSafety, T.cv02PullcordHealthy, T.cv02Running, AL.cv02Pullcord],
        expectedMissingNodeIds: [EV.safetyEventLog],
        expectedSafeActionIds: [SA.conveyorSafety],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-05-FS-09",
      title: t("Apron feeder ignores the control room after maintenance", "بی‌پاسخ ماندن تغذیه‌کنندهٔ صفحه‌ای به اتاق کنترل پس از تعمیرات"),
      narrative: t(
        "After overnight maintenance the apron feeder does not answer from the control room. Nothing reports a fault, both gateway paths are healthy, the plant itself is in remote, and the feeder is not running.",
        "پس از تعمیرات شبانه، تغذیه‌کنندهٔ صفحه‌ای از اتاق کنترل پاسخ نمی‌دهد. هیچ‌چیز خطا گزارش نمی‌کند، هر دو مسیر دروازه سالم‌اند، خود کارخانه در حالت دور است و تغذیه‌کننده کار نمی‌کند.",
      ),
      observations: [
        { nodeId: AL.feederInLocal, state: "TRUE" },
        { nodeId: T.feederModeRemote, state: "ABNORMAL", detail: "selector found in LOCAL at the field panel" },
        { nodeId: T.feederRunning, state: "FALSE" },
        { nodeId: T.plantModeRemote, state: "NORMAL" },
        { nodeId: T.gwALink, state: "NORMAL" },
        { nodeId: T.gwBLink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "HMI",
        faultClass: "INCORRECT_MODE",
        faultModeId: FM.feederInLocal,
        supportingNodeIds: [T.feederModeRemote, T.feederRunning, AL.feederInLocal],
        expectedMissingNodeIds: [EV.plantAuditLog],
        expectedSafeActionIds: [SA.auditReview],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-05-FS-10",
      title: t("Tailings thickener rake torque climbing with a heavy bed", "افزایش گشتاور ریک غلیظ‌کنندهٔ باطله با بستر سنگین"),
      narrative: t(
        "The tailings thickener rake torque has climbed past its alarm limit. The bed level is high, the underflow has thickened beyond its normal density, and the tailings pump is working against a higher discharge pressure than usual.",
        "گشتاور ریک غلیظ‌کنندهٔ باطله از حد آلارم خود گذشته است. سطح بستر بالاست، جریان زیرین فراتر از چگالی عادی خود غلیظ شده و پمپ باطله در برابر فشار خروجی بالاتر از معمول کار می‌کند.",
      ),
      observations: [
        { nodeId: AL.tailingsRakeTorque, state: "TRUE" },
        { nodeId: T.th02RakeTorque, state: "ABNORMAL", detail: "past the alarm limit" },
        { nodeId: T.th02BedLevel, state: "ABNORMAL", detail: "bed high and rising" },
        { nodeId: T.th02UnderflowDensity, state: "ABNORMAL", detail: "thicker than the normal band" },
        { nodeId: T.pu02DischargePressure, state: "ABNORMAL", detail: "higher than usual for the flow" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.tailingsOvertorque,
        supportingNodeIds: [T.th02RakeTorque, T.th02BedLevel, T.th02UnderflowDensity, AL.tailingsRakeTorque],
        expectedMissingNodeIds: [T.tailingsLinePressure, EV.waterBalanceTrend],
        expectedSafeActionIds: [SA.tailingsReview],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-05-FS-11",
      title: t("Reagent bund leak detected with the tank falling", "شناسایی نشت حوضچهٔ مهار معرف هم‌زمان با افت سطح مخزن"),
      narrative: t(
        "The reagent bund leak detector has picked up. The collector tank level has been falling faster than the dosing flow accounts for, and the dosing flow itself is below its setpoint.",
        "آشکارساز نشت حوضچهٔ مهار معرف فعال شده است. سطح مخزن کلکتور سریع‌تر از آنچه دبی تزریق توجیه می‌کند افت کرده و خود دبی تزریق زیر نقطهٔ کار آن است.",
      ),
      observations: [
        { nodeId: AL.reagentBundLeak, state: "TRUE" },
        { nodeId: T.rg01BundLeak, state: "TRUE" },
        { nodeId: T.rg01TankLevel, state: "ABNORMAL", detail: "falling faster than dosing accounts for" },
        { nodeId: T.rg01CollectorFlow, state: "ABNORMAL", detail: "below setpoint" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "MECHANICAL",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.reagentContainment,
        supportingNodeIds: [T.rg01BundLeak, T.rg01TankLevel, T.rg01CollectorFlow, AL.reagentBundLeak],
        expectedMissingNodeIds: [EV.processTrend],
        expectedSafeActionIds: [SA.reagentReview],
        requiresEscalation: true,
      },
    },
  ],
};
