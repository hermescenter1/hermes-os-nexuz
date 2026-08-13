// PHASE 101 — SCADA-04: industrial power distribution and substation
// automation supervisory system.
//
// ORIGIN
// Original synthetic engineering reference authored for this repository. It
// contains no customer, proprietary or licensed vendor project material, no
// operational event record and no customer data. The supervisory scripting is
// the accessor idiom every web-based SCADA platform of this class shares, the
// screen definition is a plain declarative description, and the station bus is
// described by standard, publicly documented service names.
//
// WHAT IS *NOT* CLAIMED
// The IEC 61850 station bus and the IEC 60870-5-104 northbound link are
// described DECLARATIVELY, in the supervisory configuration, as engineering
// intent. No SCL / ICD / CID file was produced, imported or compiled by any
// vendor engineering tool; no GOOSE frame is published, subscribed to or
// simulated; no 104 connection is opened. Saying otherwise would be a claim
// this repository cannot support.
//
// ELECTRICAL SAFETY CONTRACT — enforced structurally, not by convention
//   - Hermes is diagnostic and advisory only. It performs no live switching,
//     no breaker open/close, no relay-setting change, no protection or
//     interlock bypass and no automatic restoration.
//   - The switching and protection surface — circuit breakers, the isolator,
//     the bus coupler, protection relays, trip circuits and every position or
//     trip indication belonging to them — carries NO inbound COMMANDS, WRITES
//     or ACTUATES edge from anything, of any kind. A command intent is a
//     SCADA_TAG that an operator screen declares and a human-invokable script
//     writes; it is never wired to the plant object, because in this corpus it
//     is engineering metadata about what an operator MAY ask for, not a path
//     by which anything can be asked.
//   - Every human-invokable command intent declares a ROLE, a permission and a
//     confirmation, and consults permissive/interlock-backed evidence before it
//     is offered. Unlike SCADA-01..03, acknowledgement is confirmed here too:
//     in a substation the acknowledgement surface carries protection-trip
//     alarms, so the station's alarm philosophy declares acknowledgement a
//     confirmed, recorded act and `unguardedCommands` finds nothing at all.
//   - The automatic watchdog writes exactly one supervisory flag and touches
//     nothing else. It declares no role, because no operator stands behind it.
//   - HV/MV objects are SAFETY_RELATED, which makes every action touching them
//     review-only and drives an escalation condition.
//   - Loss of telemetry is never a healthy electrical state: the stale-picture
//     scenario is answered by the communication fault mode, and no electrical
//     hypothesis gathers a single item of supporting evidence from a frozen
//     mirror.
//
// GOVERNANCE
// Same contract as SCADA-01..03. Hermes grants no role, issues no command and
// writes no audit record — it has no runtime, no session and no write path to
// any device. ROLE and AUDIT_EVENT_TYPE never enter a diagnostic traversal.

import type { AuthoredReferenceSystem } from "../types";
import { authoring, chainStates, t } from "./_authoring";

const a = authoring({
  projectId: "SCADA-04",
  subsystem: "SUPERVISORY_CORE",
  domain: "SUPERVISORY",
});

/* ── Identifiers ──────────────────────────────────────────────────────────── */

const D = {
  primary: a.id("DEVICE", "SCADA_SERVER_PRIMARY"),
  standby: a.id("DEVICE", "SCADA_SERVER_STANDBY"),
  historian: a.id("DEVICE", "HISTORIAN_PDS"),
  soeRecorder: a.id("DEVICE", "SOE_RECORDER"),
  gwA: a.id("DEVICE", "STATION_GATEWAY_A"),
  gwB: a.id("DEVICE", "STATION_GATEWAY_B"),
  timeServer: a.id("DEVICE", "TIME_SERVER"),
  bayIncomer: a.id("DEVICE", "BAY_CONTROLLER_INCOMER"),
  bayFeeder: a.id("DEVICE", "BAY_CONTROLLER_FEEDER"),
  stationCtl: a.id("DEVICE", "STATION_CONTROLLER"),
  relayIncomerA: a.id("DEVICE", "PROT_RELAY_INCOMER_A"),
  relayT1: a.id("DEVICE", "PROT_RELAY_TRANSFORMER_T1"),
  relayF3: a.id("DEVICE", "PROT_RELAY_FEEDER_F3"),
  mccPanel: a.id("DEVICE", "MCC_PANEL_M1"),
  opClient: a.id("DEVICE", "OPERATOR_CLIENT_PDS"),
};

const EQ = {
  incomerA: a.id("EQUIPMENT", "HV_FEEDER_INCOMER_A"),
  incomerB: a.id("EQUIPMENT", "HV_FEEDER_INCOMER_B"),
  transformerT1: a.id("EQUIPMENT", "POWER_TRANSFORMER_T1"),
  transformerT2: a.id("EQUIPMENT", "POWER_TRANSFORMER_T2"),
  busbarA: a.id("EQUIPMENT", "MV_BUSBAR_A"),
  busbarB: a.id("EQUIPMENT", "MV_BUSBAR_B"),
  busCoupler: a.id("EQUIPMENT", "MV_BUS_COUPLER"),
  cbIncomerA: a.id("EQUIPMENT", "CB_INCOMER_A"),
  cbIncomerB: a.id("EQUIPMENT", "CB_INCOMER_B"),
  cbCoupler: a.id("EQUIPMENT", "CB_BUS_COUPLER"),
  cbFeederF3: a.id("EQUIPMENT", "CB_FEEDER_F3"),
  isolatorA: a.id("EQUIPMENT", "ISOLATOR_INCOMER_A"),
  outgoingF3: a.id("EQUIPMENT", "OUTGOING_FEEDER_F3"),
  mccIncomer: a.id("EQUIPMENT", "MCC_INCOMER_M1"),
  capBank: a.id("EQUIPMENT", "CAPACITOR_BANK"),
  stationDc: a.id("EQUIPMENT", "STATION_DC_SYSTEM"),
  ups: a.id("EQUIPMENT", "STATION_UPS"),
};

/** The bay/relay-side process image, as the station's controllers hold it. */
const T = {
  /* Metering and power quality */
  incomerACurrent: a.id("TAG", "INCOMER_A_CURRENT"),
  incomerAVoltage: a.id("TAG", "INCOMER_A_VOLTAGE"),
  incomerBVoltage: a.id("TAG", "INCOMER_B_VOLTAGE"),
  busAVoltage: a.id("TAG", "BUS_A_VOLTAGE"),
  busBVoltage: a.id("TAG", "BUS_B_VOLTAGE"),
  activePower: a.id("TAG", "ACTIVE_POWER"),
  reactivePower: a.id("TAG", "REACTIVE_POWER"),
  powerFactor: a.id("TAG", "POWER_FACTOR"),
  frequency: a.id("TAG", "SYSTEM_FREQUENCY"),
  thdVoltage: a.id("TAG", "VOLTAGE_THD"),
  energyImport: a.id("TAG", "ENERGY_IMPORT"),
  vtHealthy: a.id("TAG", "VT_CIRCUIT_HEALTHY"),
  ctHealthy: a.id("TAG", "CT_CIRCUIT_HEALTHY"),
  measQuality: a.id("TAG", "MEAS_QUALITY_GOOD"),
  /* Transformers */
  t1WindingTemp: a.id("TAG", "T1_WINDING_TEMP"),
  t1OilTemp: a.id("TAG", "T1_OIL_TEMP"),
  t1TapPosition: a.id("TAG", "T1_TAP_POSITION"),
  t1CoolingRunning: a.id("TAG", "T1_COOLING_RUNNING"),
  t1Buchholz: a.id("TAG", "T1_BUCHHOLZ_ALARM"),
  t1DiffTrip: a.id("TAG", "T1_DIFF_PROTECTION_TRIP"),
  t2WindingTemp: a.id("TAG", "T2_WINDING_TEMP"),
  /* Switching indications */
  cbIncomerAClosed: a.id("TAG", "CB_INCOMER_A_CLOSED"),
  cbIncomerAOpen: a.id("TAG", "CB_INCOMER_A_OPEN"),
  cbIncomerBClosed: a.id("TAG", "CB_INCOMER_B_CLOSED"),
  cbCouplerClosed: a.id("TAG", "CB_COUPLER_CLOSED"),
  cbFeederF3Closed: a.id("TAG", "CB_FEEDER_F3_CLOSED"),
  isolatorAClosed: a.id("TAG", "ISOLATOR_A_CLOSED"),
  tripCircuitHealthy: a.id("TAG", "TRIP_CIRCUIT_HEALTHY"),
  /* Protection */
  f3OvercurrentTrip: a.id("TAG", "F3_OVERCURRENT_TRIP"),
  f3EarthFaultTrip: a.id("TAG", "F3_EARTH_FAULT_TRIP"),
  relayHealthy: a.id("TAG", "PROTECTION_RELAY_HEALTHY"),
  /* Synchronism and interlocking */
  synchrocheck: a.id("TAG", "SYNCHROCHECK_OK"),
  couplerInterlockOk: a.id("TAG", "COUPLER_INTERLOCK_OK"),
  /* Capacitor bank */
  capBankSteps: a.id("TAG", "CAP_BANK_STEPS_IN"),
  capBankUnbalance: a.id("TAG", "CAP_BANK_UNBALANCE"),
  /* Station DC, charger and UPS */
  dcBusVoltage: a.id("TAG", "DC_BUS_VOLTAGE"),
  chargerHealthy: a.id("TAG", "BATTERY_CHARGER_HEALTHY"),
  batteryEarthFault: a.id("TAG", "BATTERY_EARTH_FAULT"),
  upsOnBattery: a.id("TAG", "UPS_ON_BATTERY"),
  /* MCC */
  mccAvailable: a.id("TAG", "MCC_INCOMER_AVAILABLE"),
  /* Mode, communications and time */
  stationMode: a.id("TAG", "STATION_MODE_REMOTE"),
  gwALink: a.id("TAG", "GATEWAY_A_LINK_OK"),
  gwBLink: a.id("TAG", "GATEWAY_B_LINK_OK"),
  telemetryAge: a.id("TAG", "TELEMETRY_AGE"),
  timeSyncOk: a.id("TAG", "TIME_SYNC_OK"),
  timeSyncOffset: a.id("TAG", "TIME_SYNC_OFFSET"),
};

/** The supervisory tag database. Named as an operator would see it. */
const ST = {
  incomerACurrent: a.id("SCADA_TAG", "PDS_Incomer_A_Current"),
  busAVoltage: a.id("SCADA_TAG", "PDS_Bus_A_Voltage"),
  activePower: a.id("SCADA_TAG", "PDS_Active_Power"),
  powerFactor: a.id("SCADA_TAG", "PDS_Power_Factor"),
  measQuality: a.id("SCADA_TAG", "PDS_Meas_Quality_Good"),
  t1WindingTemp: a.id("SCADA_TAG", "PDS_T1_Winding_Temp"),
  t1Buchholz: a.id("SCADA_TAG", "PDS_T1_Buchholz_Alarm"),
  cbIncomerAClosed: a.id("SCADA_TAG", "PDS_CB_Incomer_A_Closed"),
  cbIncomerAOpen: a.id("SCADA_TAG", "PDS_CB_Incomer_A_Open"),
  cbCouplerClosed: a.id("SCADA_TAG", "PDS_CB_Coupler_Closed"),
  f3OvercurrentTrip: a.id("SCADA_TAG", "PDS_F3_Overcurrent_Trip"),
  synchrocheck: a.id("SCADA_TAG", "PDS_Synchrocheck_Ok"),
  couplerInterlockOk: a.id("SCADA_TAG", "PDS_Coupler_Interlock_Ok"),
  dcBusVoltage: a.id("SCADA_TAG", "PDS_DC_Bus_Voltage"),
  upsOnBattery: a.id("SCADA_TAG", "PDS_Ups_On_Battery"),
  stationMode: a.id("SCADA_TAG", "PDS_Station_Mode"),
  gwALink: a.id("SCADA_TAG", "PDS_Gw_A_Link_Ok"),
  gwBLink: a.id("SCADA_TAG", "PDS_Gw_B_Link_Ok"),
  telemetryAge: a.id("SCADA_TAG", "PDS_Telemetry_Age"),
  timeSyncOk: a.id("SCADA_TAG", "PDS_Time_Sync_Ok"),
  telemetryStale: a.id("SCADA_TAG", "PDS_Telemetry_Stale"),
  /* Command intents — engineering metadata, never wired to the plant. */
  couplerCloseIntent: a.id("SCADA_TAG", "PDS_Bus_Coupler_Close_Intent"),
  capBankStepIntent: a.id("SCADA_TAG", "PDS_Cap_Bank_Step_Intent"),
  ackCmd: a.id("SCADA_TAG", "PDS_Alarm_Ack_Cmd"),
};

const IO = {
  incomerACt: a.id("IO_POINT", "AI_INCOMER_A_CT"),
  busAVt: a.id("IO_POINT", "AI_BUS_A_VT"),
  t1WindingRtd: a.id("IO_POINT", "AI_T1_WINDING_RTD"),
  cb52a: a.id("IO_POINT", "DI_CB_INCOMER_A_52A"),
  cb52b: a.id("IO_POINT", "DI_CB_INCOMER_A_52B"),
  dcBusVoltage: a.id("IO_POINT", "AI_DC_BUS_VOLTAGE"),
};

const SQ = a.id("SEQUENCE", "BUS_TRANSFER");
const S = {
  split: a.id("STATE", "B00_NORMAL_SPLIT"),
  check: a.id("STATE", "B10_CHECK_SYNCHRONISM"),
  parallel: a.id("STATE", "B20_COUPLER_CLOSED_PARALLEL"),
  openIncomer: a.id("STATE", "B30_INCOMER_OPEN"),
  single: a.id("STATE", "B40_SINGLE_INCOMER_SUPPLY"),
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
  synchronism: a.id("PERMISSIVE", "PRM_SYNCHRONISM_OK"),
  stationRemote: a.id("PERMISSIVE", "PRM_STATION_REMOTE"),
  dcHealthy: a.id("PERMISSIVE", "PRM_DC_SUPPLY_HEALTHY"),
  measurementQuality: a.id("PERMISSIVE", "PRM_MEASUREMENT_QUALITY"),
  capBankReady: a.id("PERMISSIVE", "PRM_CAP_BANK_READY"),
};

const I = {
  busCoupler: a.id("INTERLOCK", "ILK_BUS_COUPLER"),
  transformerProtection: a.id("INTERLOCK", "ILK_TRANSFORMER_PROTECTION"),
  feederProtection: a.id("INTERLOCK", "ILK_FEEDER_PROTECTION"),
};

const AL = {
  measQuality: a.id("ALARM", "ALM_MEASUREMENT_QUALITY_BAD"),
  t1TempHigh: a.id("ALARM", "ALM_T1_WINDING_TEMP_HIGH"),
  cbDiscrepancy: a.id("ALARM", "ALM_CB_POSITION_DISCREPANCY"),
  commsStale: a.id("ALARM", "ALM_STATION_COMMS_STALE"),
  timeSyncLost: a.id("ALARM", "ALM_TIME_SYNC_LOST"),
  couplerBlocked: a.id("ALARM", "ALM_COUPLER_INTERLOCK_BLOCKED"),
  f3ProtectionTrip: a.id("ALARM", "ALM_F3_PROTECTION_TRIP"),
  dcDegraded: a.id("ALARM", "ALM_DC_SUPPLY_DEGRADED"),
  stationInLocal: a.id("ALARM", "ALM_STATION_IN_LOCAL"),
};

const H = {
  overview: a.id("HMI_SCREEN", "Screen_StationOverview"),
  incomers: a.id("HMI_SCREEN", "Screen_Incomers"),
  transformer: a.id("HMI_SCREEN", "Screen_Transformer"),
  busCoupler: a.id("HMI_SCREEN", "Screen_BusCoupler"),
  feeders: a.id("HMI_SCREEN", "Screen_Feeders"),
  stationDc: a.id("HMI_SCREEN", "Screen_StationDc"),
  alarms: a.id("HMI_SCREEN", "Screen_Alarms"),
};

const HO = {
  commsHealth: a.id("HMI_OBJECT", "Ind_CommsHealth"),
  timeSyncHealth: a.id("HMI_OBJECT", "Ind_TimeSyncHealth"),
  activePower: a.id("HMI_OBJECT", "Trend_ActivePower"),
  cbIncomerA: a.id("HMI_OBJECT", "Fp_CbIncomerA"),
  measQuality: a.id("HMI_OBJECT", "Ind_MeasurementQuality"),
  t1WindingTemp: a.id("HMI_OBJECT", "Trend_T1WindingTemp"),
  t1Buchholz: a.id("HMI_OBJECT", "Ind_T1Buchholz"),
  busCoupler: a.id("HMI_OBJECT", "Fp_BusCoupler"),
  f3Protection: a.id("HMI_OBJECT", "Ind_F3Protection"),
  capBankStep: a.id("HMI_OBJECT", "Btn_CapBankStep"),
  dcBusVoltage: a.id("HMI_OBJECT", "Trend_DcBusVoltage"),
  upsOnBattery: a.id("HMI_OBJECT", "Ind_UpsOnBattery"),
  alarmBanner: a.id("HMI_OBJECT", "Banner_ActiveAlarms"),
};

const SC = {
  couplerIntent: a.id("SCRIPT", "OnBusCouplerCloseIntent"),
  capBankIntent: a.id("SCRIPT", "OnCapacitorBankStepIntent"),
  watchdog: a.id("SCRIPT", "OnStationWatchdog"),
  alarmAck: a.id("SCRIPT", "OnAlarmAcknowledge"),
};

const R = {
  operator: a.id("ROLE", "Role_StationOperator"),
  supervisor: a.id("ROLE", "Role_StationSupervisor"),
};

const AE = {
  couplerIntent: a.id("AUDIT_EVENT_TYPE", "Audit_BusCouplerCloseIntentRecorded"),
  capBankIntent: a.id("AUDIT_EVENT_TYPE", "Audit_CapacitorBankStepIntentRecorded"),
  alarmAck: a.id("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged"),
  watchdog: a.id("AUDIT_EVENT_TYPE", "Audit_StationWatchdogRecord"),
};

const K = {
  availability: a.id("KPI", "KPI_SUPPLY_AVAILABILITY"),
  peakDemand: a.id("KPI", "KPI_PEAK_DEMAND"),
  powerFactor: a.id("KPI", "KPI_AVERAGE_POWER_FACTOR"),
  energyImport: a.id("KPI", "KPI_ENERGY_IMPORT"),
  interruption: a.id("KPI", "KPI_INTERRUPTION_DURATION"),
};

const EV = {
  electricalTrend: a.id("EVIDENCE_SOURCE", "HIST_ELECTRICAL_TREND"),
  transformerTrend: a.id("EVIDENCE_SOURCE", "HIST_TRANSFORMER_TREND"),
  soeRecord: a.id("EVIDENCE_SOURCE", "HIST_SOE_RECORD"),
  commsLinkLog: a.id("EVIDENCE_SOURCE", "HIST_COMMS_LINK_LOG"),
  auditLog: a.id("EVIDENCE_SOURCE", "HIST_STATION_AUDIT_LOG"),
  powerQualityTrend: a.id("EVIDENCE_SOURCE", "HIST_POWER_QUALITY_TREND"),
  dcSystemTrend: a.id("EVIDENCE_SOURCE", "HIST_DC_SYSTEM_TREND"),
};

const FM = {
  vtCircuit: a.id("FAULT_MODE", "FM_VT_CIRCUIT_FAILURE"),
  t1Cooling: a.id("FAULT_MODE", "FM_T1_COOLING_DEGRADATION"),
  cbDiscrepancy: a.id("FAULT_MODE", "FM_CB_POSITION_DISCREPANCY"),
  commsLoss: a.id("FAULT_MODE", "FM_STATION_COMMS_LOSS"),
  couplerBlocked: a.id("FAULT_MODE", "FM_COUPLER_SYNCHRONISM_BLOCK"),
  f3EarthFault: a.id("FAULT_MODE", "FM_F3_DOWNSTREAM_EARTH_FAULT"),
  dcDegradation: a.id("FAULT_MODE", "FM_STATION_DC_DEGRADATION"),
  leftInLocal: a.id("FAULT_MODE", "FM_STATION_LEFT_IN_LOCAL"),
};

const SA = {
  vtCircuit: a.id("SAFE_ACTION", "SA_REVIEW_VT_CIRCUIT_AND_FUSE_SUPERVISION"),
  transformerCooling: a.id("SAFE_ACTION", "SA_REVIEW_TRANSFORMER_COOLING_AND_TREND"),
  breakerMechanism: a.id("SAFE_ACTION", "SA_REVIEW_SOE_AND_INSPECT_BREAKER_MECHANISM"),
  gatewaySessions: a.id("SAFE_ACTION", "SA_VERIFY_STATION_GATEWAY_SESSIONS"),
  couplerReview: a.id("SAFE_ACTION", "SA_ESCALATE_BUS_COUPLER_INTERLOCK_REVIEW"),
  feederReview: a.id("SAFE_ACTION", "SA_ESCALATE_FEEDER_PROTECTION_REVIEW"),
  dcSystem: a.id("SAFE_ACTION", "SA_INSPECT_STATION_DC_CHARGER_AND_BATTERY"),
  auditReview: a.id("SAFE_ACTION", "SA_REVIEW_STATION_AUDIT_LOG"),
};

/* ── Engineering source ───────────────────────────────────────────────────── */

const SUPERVISORY_SCRIPTS = `// SCADA-04 — supervisory scripting for the distribution substation.
//
// Vendor-neutral accessor idiom: Tags("Name").Read() / .Write(value) and screen
// navigation. Nothing in this file is executed, transpiled or evaluated by
// Hermes; it is engineering text from which relationships are recovered.
//
// ELECTRICAL SAFETY
// No routine here writes to a breaker, an isolator, the bus coupler, a
// protection relay or a trip circuit. The two operator routines write a
// COMMAND INTENT tag: a recorded statement that an authorised human asked for
// a switching operation, which the station's own control system evaluates and
// executes — or refuses — on its own interlocks. The intent tag is not wired
// to any plant object anywhere in this corpus.

function OnBusCouplerCloseIntent() {
   // Reserved for the station supervisor. The synchronism and interlock
   // picture is READ and shown to the operator; it is NOT re-evaluated here.
   // The bay controller owns the interlock decision, and a supervisory client
   // that second-guessed it would be a second, weaker source of truth.
   var sync = Tags("PDS_Synchrocheck_Ok").Read();
   var interlock = Tags("PDS_Coupler_Interlock_Ok").Read();
   var remote = Tags("PDS_Station_Mode").Read();

   if (sync && interlock && remote) {
      Tags("PDS_Bus_Coupler_Close_Intent").Write(1);
   }

   Navigate("Screen_BusCoupler");
}

function OnCapacitorBankStepIntent() {
   // Reserved for the station operator. A capacitor step is only offered when
   // the measurement behind the power-factor decision is trustworthy: acting
   // on a bad measurement is how a correction becomes an overvoltage.
   var quality = Tags("PDS_Meas_Quality_Good").Read();
   var pf = Tags("PDS_Power_Factor").Read();

   if (quality && pf < 0.95) {
      Tags("PDS_Cap_Bank_Step_Intent").Write(1);
   }
}

function OnStationWatchdog() {
   // Runs on the supervisory server's own schedule. There is no operator
   // behind it, so it declares no role, and it writes exactly one flag. Both
   // redundant station gateways are read: the picture is stale only when
   // NEITHER path is carrying data, and that judgement is published as its own
   // tag rather than inferred separately by every screen.
   var linkA = Tags("PDS_Gw_A_Link_Ok").Read();
   var linkB = Tags("PDS_Gw_B_Link_Ok").Read();
   var age = Tags("PDS_Telemetry_Age").Read();
   var timeOk = Tags("PDS_Time_Sync_Ok").Read();

   if ((!linkA && !linkB) || age > 20 || !timeOk) {
      Tags("PDS_Telemetry_Stale").Write(1);
   }
}

function OnAlarmAcknowledge() {
   // ISA-18.2 acknowledgement: it moves an alarm from Unacknowledged to
   // Acknowledged and records that a human saw it. It changes no plant state,
   // opens or closes nothing, and never clears the condition that raised the
   // alarm.
   Tags("PDS_Alarm_Ack_Cmd").Write(1);
   Navigate("Screen_Alarms");
}
`;

const OPERATOR_SCREENS = `{
  "screens": [
    {
      "name": "Screen_StationOverview",
      "titleEn": "Substation single-line overview",
      "titleFa": "نمای تک‌خطی پست",
      "navigatesTo": [
        "Screen_Incomers",
        "Screen_Transformer",
        "Screen_BusCoupler",
        "Screen_Feeders",
        "Screen_StationDc",
        "Screen_Alarms"
      ],
      "objects": [
        {
          "name": "Ind_CommsHealth",
          "type": "INDICATOR",
          "displays": ["PDS_Gw_A_Link_Ok", "PDS_Gw_B_Link_Ok"]
        },
        {
          "name": "Ind_TimeSyncHealth",
          "type": "INDICATOR",
          "displays": ["PDS_Time_Sync_Ok"]
        },
        {
          "name": "Trend_ActivePower",
          "type": "TREND",
          "displays": ["PDS_Active_Power"]
        }
      ]
    },
    {
      "name": "Screen_Incomers",
      "titleEn": "Incoming feeders",
      "titleFa": "فیدرهای ورودی",
      "navigatesTo": ["Screen_StationOverview"],
      "objects": [
        {
          "name": "Fp_CbIncomerA",
          "type": "FACEPLATE",
          "displays": ["PDS_CB_Incomer_A_Closed", "PDS_CB_Incomer_A_Open", "PDS_Incomer_A_Current"]
        },
        {
          "name": "Ind_MeasurementQuality",
          "type": "INDICATOR",
          "displays": ["PDS_Meas_Quality_Good", "PDS_Bus_A_Voltage"]
        }
      ]
    },
    {
      "name": "Screen_Transformer",
      "titleEn": "Power transformer T1",
      "titleFa": "ترانسفورماتور قدرت T1",
      "navigatesTo": ["Screen_StationOverview"],
      "objects": [
        {
          "name": "Trend_T1WindingTemp",
          "type": "TREND",
          "displays": ["PDS_T1_Winding_Temp"]
        },
        {
          "name": "Ind_T1Buchholz",
          "type": "INDICATOR",
          "displays": ["PDS_T1_Buchholz_Alarm"]
        }
      ]
    },
    {
      "name": "Screen_BusCoupler",
      "titleEn": "MV bus coupler",
      "titleFa": "کوپلر باسبار فشار متوسط",
      "navigatesTo": ["Screen_StationOverview"],
      "objects": [
        {
          "name": "Fp_BusCoupler",
          "type": "FACEPLATE",
          "displays": ["PDS_CB_Coupler_Closed", "PDS_Synchrocheck_Ok", "PDS_Coupler_Interlock_Ok"],
          "commands": ["PDS_Bus_Coupler_Close_Intent"],
          "permission": "COUPLER_SWITCHING",
          "requiresConfirmation": true
        }
      ]
    },
    {
      "name": "Screen_Feeders",
      "titleEn": "Outgoing feeders and capacitor bank",
      "titleFa": "فیدرهای خروجی و بانک خازنی",
      "navigatesTo": ["Screen_StationOverview"],
      "objects": [
        {
          "name": "Ind_F3Protection",
          "type": "INDICATOR",
          "displays": ["PDS_F3_Overcurrent_Trip"]
        },
        {
          "name": "Btn_CapBankStep",
          "type": "BUTTON",
          "commands": ["PDS_Cap_Bank_Step_Intent"],
          "permission": "CAP_BANK_CONTROL",
          "requiresConfirmation": true
        }
      ]
    },
    {
      "name": "Screen_StationDc",
      "titleEn": "Station DC, charger and UPS",
      "titleFa": "سامانهٔ DC، شارژر و UPS پست",
      "navigatesTo": ["Screen_StationOverview"],
      "objects": [
        {
          "name": "Trend_DcBusVoltage",
          "type": "TREND",
          "displays": ["PDS_DC_Bus_Voltage"]
        },
        {
          "name": "Ind_UpsOnBattery",
          "type": "INDICATOR",
          "displays": ["PDS_Ups_On_Battery"]
        }
      ]
    },
    {
      "name": "Screen_Alarms",
      "titleEn": "Active alarms",
      "titleFa": "آلارم‌های فعال",
      "navigatesTo": ["Screen_StationOverview"],
      "objects": [
        {
          "name": "Banner_ActiveAlarms",
          "type": "ALARM_BANNER",
          "displays": ["PDS_Telemetry_Stale"],
          "commands": ["PDS_Alarm_Ack_Cmd"],
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
    "failoverSeconds": 10
  },
  "stationGateways": [
    { "id": "STATION_GATEWAY_A", "role": "PRIMARY_PATH" },
    { "id": "STATION_GATEWAY_B", "role": "REDUNDANT_PATH" }
  ],
  "stationBus": {
    "standard": "IEC 61850",
    "services": ["MMS", "GOOSE"],
    "note": "Declarative engineering description only. No SCL, ICD or CID file was produced, imported or compiled by any vendor engineering tool, and no GOOSE frame is published, subscribed to or simulated anywhere in this repository.",
    "logicalDevices": [
      { "ied": "PROT_RELAY_INCOMER_A", "logicalNodes": ["XCBR1", "PTOC1", "MMXU1"] },
      { "ied": "PROT_RELAY_TRANSFORMER_T1", "logicalNodes": ["PDIF1", "STMP1"] },
      { "ied": "PROT_RELAY_FEEDER_F3", "logicalNodes": ["XCBR1", "PTOC1", "PTEF1"] },
      { "ied": "BAY_CONTROLLER_INCOMER", "logicalNodes": ["CSWI1", "CILO1", "RSYN1"] }
    ],
    "goosePublications": [
      {
        "publisher": "PROT_RELAY_FEEDER_F3",
        "dataset": "TripAndPositionStatus",
        "subscribers": ["BAY_CONTROLLER_FEEDER"],
        "direction": "STATUS_ONLY"
      }
    ]
  },
  "northbound": {
    "standard": "IEC 60870-5-104",
    "direction": "MONITORING_ONLY",
    "commands": "NONE",
    "note": "Northbound telemetry to the control centre is described declaratively. This corpus opens no connection and transmits nothing."
  },
  "timeSynchronisation": {
    "source": "TIME_SERVER",
    "method": "PTP",
    "healthTags": ["TIME_SYNC_OK", "TIME_SYNC_OFFSET"],
    "soeResolutionMs": 1
  },
  "historian": {
    "id": "HISTORIAN_PDS",
    "sequenceOfEvents": "SOE_RECORDER",
    "archives": [
      { "id": "HIST_ELECTRICAL_TREND", "sampleSeconds": 5, "retentionDays": 400 },
      { "id": "HIST_TRANSFORMER_TREND", "sampleSeconds": 30, "retentionDays": 1825 },
      { "id": "HIST_SOE_RECORD", "sampleSeconds": 0, "retentionDays": 1825 },
      { "id": "HIST_COMMS_LINK_LOG", "sampleSeconds": 10, "retentionDays": 180 },
      { "id": "HIST_STATION_AUDIT_LOG", "sampleSeconds": 0, "retentionDays": 1825 },
      { "id": "HIST_POWER_QUALITY_TREND", "sampleSeconds": 1, "retentionDays": 90 },
      { "id": "HIST_DC_SYSTEM_TREND", "sampleSeconds": 30, "retentionDays": 400 }
    ]
  },
  "switchingPolicy": {
    "mode": "ADVISORY_ONLY",
    "supervisoryExecution": "NONE",
    "note": "Operator command intents are recorded as engineering metadata. Breaker, isolator, bus-coupler and protection objects accept no supervisory command, reset, inhibit or bypass, and no automatic restoration exists."
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
      { "code": "ALM_MEASUREMENT_QUALITY_BAD", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_T1_WINDING_TEMP_HIGH", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_CB_POSITION_DISCREPANCY", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_STATION_COMMS_STALE", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_TIME_SYNC_LOST", "priority": "MEDIUM", "requiresAck": true },
      { "code": "ALM_COUPLER_INTERLOCK_BLOCKED", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_F3_PROTECTION_TRIP", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_DC_SUPPLY_DEGRADED", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_STATION_IN_LOCAL", "priority": "MEDIUM", "requiresAck": true }
    ]
  }
}
`;

/* ── System ───────────────────────────────────────────────────────────────── */

export const SCADA_04_POWER_DISTRIBUTION: AuthoredReferenceSystem = {
  id: "SCADA-04",
  name: t(
    "Industrial power distribution and substation automation supervisory system",
    "سامانهٔ نظارتی توزیع برق صنعتی و اتوماسیون پست",
  ),
  domain: t(
    "HV/MV incoming supply, transformation, sectionalised MV distribution, protection, metering and station auxiliaries",
    "تغذیهٔ ورودی فشار قوی و متوسط، تبدیل ولتاژ، توزیع سکشنالایزشدهٔ فشار متوسط، حفاظت، اندازه‌گیری و سرویس‌های جانبی پست",
  ),
  sourceType: "SCADA_REFERENCE",
  platform:
    "Vendor-neutral redundant substation automation platform: JavaScript scripting, declarative screens, declared IEC 61850 station bus and IEC 60870-5-104 northbound telemetry",
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
    a.node("DEVICE", "HISTORIAN_PDS", t("Station historian", "تاریخ‌نگار پست"), {
      domain: "MAINTENANCE",
      attributes: {
        deviceCategory: "INDUSTRIAL_PC",
        networkZone: "SUPERVISORY",
        protocol: "HISTORIAN",
      },
    }),
    a.node("DEVICE", "SOE_RECORDER", t("Sequence-of-events recorder", "ثبت‌کنندهٔ توالی رویدادها"), {
      domain: "MAINTENANCE",
      attributes: {
        deviceCategory: "INDUSTRIAL_PC",
        networkZone: "SUPERVISORY",
        protocol: "HISTORIAN",
      },
      description: t(
        "Time-stamped event capture at millisecond resolution. Its usefulness depends entirely on station time synchronisation, which is why time-sync health is monitored as a first-class signal.",
        "ثبت رویدادهای زمان‌مهرخورده با تفکیک میلی‌ثانیه. سودمندی آن کاملاً به همگام‌سازی زمان پست وابسته است و به همین دلیل سلامت همگام‌سازی زمان یک سیگنال درجه‌یک است.",
      ),
    }),
    a.node("DEVICE", "STATION_GATEWAY_A", t("Station gateway A (primary path)", "دروازهٔ پست مسیر A (اصلی)"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "GATEWAY", networkZone: "DMZ", protocol: "OTHER" },
      description: t(
        "IEC 61850 MMS client toward the bays and IEC 60870-5-104 monitoring direction northbound, as DECLARED by the configuration. One of two redundant paths.",
        "کلاینت IEC 61850 MMS به‌سمت بی‌ها و جهت پایشی IEC 60870-5-104 به‌سمت مرکز کنترل، آن‌گونه که پیکربندی اعلام می‌کند. یکی از دو مسیر افزونه.",
      ),
    }),
    a.node("DEVICE", "STATION_GATEWAY_B", t("Station gateway B (redundant path)", "دروازهٔ پست مسیر B (افزونه)"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "GATEWAY", networkZone: "DMZ", protocol: "OTHER" },
    }),
    a.node("DEVICE", "TIME_SERVER", t("Station time server", "سرور زمان پست"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "OTHER", networkZone: "SUPERVISORY", protocol: "OTHER" },
    }),
    a.node("DEVICE", "BAY_CONTROLLER_INCOMER", t("Incomer and transformer bay controller", "کنترلر بی ورودی و ترانسفورماتور"), {
      subsystem: "STATION_HV",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "BAY_CONTROLLER_FEEDER", t("Outgoing feeder bay controller", "کنترلر بی فیدر خروجی"), {
      subsystem: "STATION_MV",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "STATION_CONTROLLER", t("Station auxiliaries controller", "کنترلر سرویس‌های جانبی پست"), {
      subsystem: "STATION_AUX",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "PROT_RELAY_INCOMER_A", t("Incomer A protection relay", "رلهٔ حفاظت ورودی A"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { deviceCategory: "OTHER", networkZone: "CONTROL", protocol: "OTHER" },
      description: t(
        "Read-only diagnostic evidence. Protection settings are never read out, changed, disabled or bypassed from Hermes, and the relay accepts no supervisory command anywhere in this corpus.",
        "شاهد تشخیصی فقط‌خواندنی. تنظیمات حفاظت هرگز از هرمس خوانده، تغییر داده، غیرفعال یا دور زده نمی‌شود و رله در هیچ جای این پیکره هیچ فرمان نظارتی نمی‌پذیرد.",
      ),
    }),
    a.node("DEVICE", "PROT_RELAY_TRANSFORMER_T1", t("Transformer T1 protection relay", "رلهٔ حفاظت ترانسفورماتور T1"), {
      subsystem: "TRANSFORMER",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { deviceCategory: "OTHER", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "PROT_RELAY_FEEDER_F3", t("Feeder F3 protection relay", "رلهٔ حفاظت فیدر F3"), {
      subsystem: "FEEDERS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { deviceCategory: "OTHER", networkZone: "CONTROL", protocol: "OTHER" },
    }),
    a.node("DEVICE", "MCC_PANEL_M1", t("Motor control centre M1", "مرکز کنترل موتور M1"), {
      subsystem: "FEEDERS",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "MCC", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "OPERATOR_CLIENT_PDS", t("Operator client", "کلاینت اپراتور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { deviceCategory: "HMI", networkZone: "SUPERVISORY" },
    }),

    /* Equipment */
    a.node("EQUIPMENT", "HV_FEEDER_INCOMER_A", t("HV incoming feeder A", "فیدر ورودی فشار قوی A"), {
      subsystem: "STATION_HV",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "HV_FEEDER_INCOMER_B", t("HV incoming feeder B", "فیدر ورودی فشار قوی B"), {
      subsystem: "STATION_HV",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "POWER_TRANSFORMER_T1", t("Power transformer T1", "ترانسفورماتور قدرت T1"), {
      subsystem: "TRANSFORMER",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "POWER_TRANSFORMER_T2", t("Power transformer T2", "ترانسفورماتور قدرت T2"), {
      subsystem: "TRANSFORMER",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "MV_BUSBAR_A", t("MV busbar section A", "سکشن باسبار فشار متوسط A"), {
      subsystem: "STATION_MV",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "MV_BUSBAR_B", t("MV busbar section B", "سکشن باسبار فشار متوسط B"), {
      subsystem: "STATION_MV",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "MV_BUS_COUPLER", t("MV bus coupler", "کوپلر باسبار فشار متوسط"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Paralleling two live busbar sections. Observed only: nothing in Hermes closes, opens or releases it, and the interlock that governs it is never bypassed.",
        "موازی‌کردن دو سکشن باسبار برق‌دار. فقط مشاهده می‌شود: هیچ‌چیز در هرمس آن را وصل، قطع یا آزاد نمی‌کند و اینترلاک حاکم بر آن هرگز دور زده نمی‌شود.",
      ),
    }),
    a.node("EQUIPMENT", "CB_INCOMER_A", t("Incomer A circuit breaker", "کلید قدرت ورودی A"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "CB_INCOMER_B", t("Incomer B circuit breaker", "کلید قدرت ورودی B"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "CB_BUS_COUPLER", t("Bus coupler circuit breaker", "کلید قدرت کوپلر باسبار"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "CB_FEEDER_F3", t("Feeder F3 circuit breaker", "کلید قدرت فیدر F3"), {
      subsystem: "FEEDERS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "ISOLATOR_INCOMER_A", t("Incomer A isolator", "سکسیونر ورودی A"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "OUTGOING_FEEDER_F3", t("Outgoing feeder F3", "فیدر خروجی F3"), {
      subsystem: "FEEDERS",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "MCC_INCOMER_M1", t("MCC M1 incomer", "ورودی مرکز کنترل موتور M1"), {
      subsystem: "FEEDERS",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "CAPACITOR_BANK", t("Power-factor capacitor bank", "بانک خازنی اصلاح ضریب توان"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("EQUIPMENT", "STATION_DC_SYSTEM", t("Station DC system and charger", "سامانهٔ DC و شارژر پست"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "The supply behind every trip circuit in the station. A degrading DC system is a protection availability problem, not a housekeeping one.",
        "تغذیه‌ای که پشت هر مدار تریپ در پست قرار دارد. افت سامانهٔ DC یک مسئلهٔ دسترس‌پذیری حفاظت است، نه یک موضوع نگهداری معمولی.",
      ),
    }),
    a.node("EQUIPMENT", "STATION_UPS", t("Station UPS and battery", "UPS و باتری پست"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),

    /* Metering and power quality */
    a.node("TAG", "INCOMER_A_CURRENT", t("Incomer A current", "جریان ورودی A"), {
      subsystem: "STATION_HV",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ" },
    }),
    a.node("TAG", "INCOMER_A_VOLTAGE", t("Incomer A voltage", "ولتاژ ورودی A"), {
      subsystem: "STATION_HV",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "kV", accessMode: "READ" },
    }),
    a.node("TAG", "INCOMER_B_VOLTAGE", t("Incomer B voltage", "ولتاژ ورودی B"), {
      subsystem: "STATION_HV",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "kV", accessMode: "READ" },
    }),
    a.node("TAG", "BUS_A_VOLTAGE", t("Busbar A voltage", "ولتاژ باسبار A"), {
      subsystem: "STATION_MV",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "kV", accessMode: "READ" },
    }),
    a.node("TAG", "BUS_B_VOLTAGE", t("Busbar B voltage", "ولتاژ باسبار B"), {
      subsystem: "STATION_MV",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "kV", accessMode: "READ" },
    }),
    a.node("TAG", "ACTIVE_POWER", t("Active power", "توان اکتیو"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "MW", accessMode: "READ" },
    }),
    a.node("TAG", "REACTIVE_POWER", t("Reactive power", "توان راکتیو"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "Mvar", accessMode: "READ" },
    }),
    a.node("TAG", "POWER_FACTOR", t("Power factor", "ضریب توان"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
      attributes: { dataType: "REAL", accessMode: "READ" },
    }),
    a.node("TAG", "SYSTEM_FREQUENCY", t("System frequency", "فرکانس شبکه"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "Hz", accessMode: "READ" },
    }),
    a.node("TAG", "VOLTAGE_THD", t("Voltage total harmonic distortion", "اعوجاج هارمونیکی کل ولتاژ"), {
      subsystem: "STATION_MV",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "ENERGY_IMPORT", t("Imported energy", "انرژی وارداتی"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "MWh", accessMode: "READ" },
    }),
    a.node("TAG", "VT_CIRCUIT_HEALTHY", t("VT circuit healthy", "سلامت مدار ترانس ولتاژ"), {
      subsystem: "STATION_MV",
      domain: "FIELD_IO",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Fuse-failure supervision of the voltage-transformer circuit. When it fails, voltage-dependent functions are measuring nothing trustworthy — the plant may be perfectly healthy.",
        "نظارت بر سوختن فیوز مدار ترانس ولتاژ. با ناموفق شدن آن، توابع وابسته به ولتاژ چیز قابل اعتمادی اندازه نمی‌گیرند — در حالی که ممکن است شبکه کاملاً سالم باشد.",
      ),
    }),
    a.node("TAG", "CT_CIRCUIT_HEALTHY", t("CT circuit healthy", "سلامت مدار ترانس جریان"), {
      subsystem: "STATION_MV",
      domain: "FIELD_IO",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "MEAS_QUALITY_GOOD", t("Measurement quality good", "کیفیت اندازه‌گیری مطلوب"), {
      subsystem: "STATION_MV",
      domain: "QUALITY",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "The aggregated quality flag the bay controller publishes with its measurements. Acting on a measurement whose quality is bad is how a correction becomes a disturbance.",
        "پرچم کیفیت تجمیع‌شده‌ای که کنترلر بی همراه اندازه‌گیری‌ها منتشر می‌کند. اقدام بر پایهٔ اندازه‌گیری با کیفیت نامطلوب، همان‌جایی است که یک اصلاح به یک اغتشاش تبدیل می‌شود.",
      ),
    }),

    /* Transformers */
    a.node("TAG", "T1_WINDING_TEMP", t("T1 winding temperature", "دمای سیم‌پیچ T1"), {
      subsystem: "TRANSFORMER",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "T1_OIL_TEMP", t("T1 top-oil temperature", "دمای روغن بالای T1"), {
      subsystem: "TRANSFORMER",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "T1_TAP_POSITION", t("T1 tap-changer position", "موقعیت تپ‌چنجر T1"), {
      subsystem: "TRANSFORMER",
      domain: "PROCESS",
      attributes: { dataType: "INT", accessMode: "READ" },
    }),
    a.node("TAG", "T1_COOLING_RUNNING", t("T1 cooling group running", "کارکرد گروه خنک‌کنندهٔ T1"), {
      subsystem: "TRANSFORMER",
      domain: "PROCESS",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "T1_BUCHHOLZ_ALARM", t("T1 Buchholz alarm", "آلارم بوخهلتس T1"), {
      subsystem: "TRANSFORMER",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "T1_DIFF_PROTECTION_TRIP", t("T1 differential protection trip", "تریپ حفاظت دیفرانسیل T1"), {
      subsystem: "TRANSFORMER",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "T2_WINDING_TEMP", t("T2 winding temperature", "دمای سیم‌پیچ T2"), {
      subsystem: "TRANSFORMER",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),

    /* Switching indications — read-only, safety-related */
    a.node("TAG", "CB_INCOMER_A_CLOSED", t("Incomer A breaker closed (52a)", "وصل بودن کلید ورودی A (52a)"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Indication only. The corpus carries no path by which this breaker can be opened or closed.",
        "فقط نشان‌دهنده است. این پیکره هیچ مسیری برای وصل یا قطع این کلید در اختیار ندارد.",
      ),
    }),
    a.node("TAG", "CB_INCOMER_A_OPEN", t("Incomer A breaker open (52b)", "قطع بودن کلید ورودی A (52b)"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "The complementary auxiliary contact. Two contacts that agree describe a breaker; two that do not describe a discrepancy, and a discrepancy is never resolved by preferring one of them.",
        "کنتاکت کمکی مکمل. دو کنتاکت هم‌خوان یک کلید را توصیف می‌کنند؛ دو کنتاکت ناهم‌خوان یک مغایرت را، و مغایرت هرگز با ترجیح دادن یکی از آن دو حل نمی‌شود.",
      ),
    }),
    a.node("TAG", "CB_INCOMER_B_CLOSED", t("Incomer B breaker closed", "وصل بودن کلید ورودی B"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CB_COUPLER_CLOSED", t("Bus coupler breaker closed", "وصل بودن کلید کوپلر باسبار"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "CB_FEEDER_F3_CLOSED", t("Feeder F3 breaker closed", "وصل بودن کلید فیدر F3"), {
      subsystem: "FEEDERS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "ISOLATOR_A_CLOSED", t("Incomer A isolator closed", "وصل بودن سکسیونر ورودی A"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "TRIP_CIRCUIT_HEALTHY", t("Trip circuit supervision healthy", "سلامت نظارت بر مدار تریپ"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Supervision of the wiring through which protection trips the breaker. Read-only diagnostic evidence; the trip path itself is untouchable from here.",
        "نظارت بر سیم‌کشی‌ای که حفاظت از طریق آن کلید را تریپ می‌کند. شاهد تشخیصی فقط‌خواندنی؛ خودِ مسیر تریپ از اینجا دست‌نیافتنی است.",
      ),
    }),

    /* Protection */
    a.node("TAG", "F3_OVERCURRENT_TRIP", t("F3 overcurrent trip", "تریپ اضافه‌جریان F3"), {
      subsystem: "FEEDERS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "F3_EARTH_FAULT_TRIP", t("F3 earth-fault trip", "تریپ اتصال زمین F3"), {
      subsystem: "FEEDERS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "PROTECTION_RELAY_HEALTHY", t("Protection relay self-supervision healthy", "سلامت خودنظارتی رلهٔ حفاظت"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Synchronism and interlocking */
    a.node("TAG", "SYNCHROCHECK_OK", t("Synchrocheck permitting", "مجاز بودن سنکروچک"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "COUPLER_INTERLOCK_OK", t("Bus coupler interlock satisfied", "برقرار بودن اینترلاک کوپلر"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Capacitor bank */
    a.node("TAG", "CAP_BANK_STEPS_IN", t("Capacitor steps in service", "پله‌های خازنی در مدار"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
      attributes: { dataType: "INT", accessMode: "READ" },
    }),
    a.node("TAG", "CAP_BANK_UNBALANCE", t("Capacitor bank unbalance current", "جریان نامتعادلی بانک خازنی"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ" },
    }),

    /* Station DC, charger and UPS */
    a.node("TAG", "DC_BUS_VOLTAGE", t("Station DC bus voltage", "ولتاژ باس DC پست"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "V", accessMode: "READ" },
    }),
    a.node("TAG", "BATTERY_CHARGER_HEALTHY", t("Battery charger healthy", "سلامت شارژر باتری"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "BATTERY_EARTH_FAULT", t("Battery earth fault", "اتصال زمین باتری"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "UPS_ON_BATTERY", t("UPS running on battery", "کارکرد UPS روی باتری"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* MCC */
    a.node("TAG", "MCC_INCOMER_AVAILABLE", t("MCC incomer available", "دسترس‌پذیری ورودی مرکز کنترل موتور"), {
      subsystem: "FEEDERS",
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),

    /* Mode, communications and time */
    a.node("TAG", "STATION_MODE_REMOTE", t("Station in remote/auto", "پست در حالت دور/خودکار"), {
      subsystem: "STATION_AUX",
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "FALSE means somebody left the station in local at the panel. The evidence for that is an operator action, not a plant state.",
        "مقدار FALSE یعنی کسی پست را روی حالت محلی در تابلو رها کرده است. شاهد این موضوع یک اقدام اپراتوری است، نه یک وضعیت شبکه.",
      ),
    }),
    a.node("TAG", "GATEWAY_A_LINK_OK", t("Gateway A link healthy", "سلامت پیوند دروازهٔ A"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "GATEWAY_B_LINK_OK", t("Gateway B link healthy", "سلامت پیوند دروازهٔ B"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "TELEMETRY_AGE", t("Age of newest station sample", "سن تازه‌ترین نمونهٔ پست"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "s", accessMode: "READ" },
    }),
    a.node("TAG", "TIME_SYNC_OK", t("Station time synchronisation healthy", "سلامت همگام‌سازی زمان پست"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "TIME_SYNC_OFFSET", t("Time synchronisation offset", "انحراف همگام‌سازی زمان"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "ms", accessMode: "READ" },
    }),

    /* Supervisory tag database */
    a.node("SCADA_TAG", "PDS_Incomer_A_Current", t("Incomer A current (supervisory)", "جریان ورودی A (نظارتی)"), {
      subsystem: "STATION_HV",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_Bus_A_Voltage", t("Busbar A voltage (supervisory)", "ولتاژ باسبار A (نظارتی)"), {
      subsystem: "STATION_MV",
      attributes: { dataType: "REAL", unit: "kV", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_Active_Power", t("Active power (supervisory)", "توان اکتیو (نظارتی)"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "MW", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_Power_Factor", t("Power factor (supervisory)", "ضریب توان (نظارتی)"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
      attributes: { dataType: "REAL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_Meas_Quality_Good", t("Measurement quality (supervisory)", "کیفیت اندازه‌گیری (نظارتی)"), {
      subsystem: "STATION_MV",
      domain: "QUALITY",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_T1_Winding_Temp", t("T1 winding temperature (supervisory)", "دمای سیم‌پیچ T1 (نظارتی)"), {
      subsystem: "TRANSFORMER",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_T1_Buchholz_Alarm", t("T1 Buchholz alarm (supervisory)", "آلارم بوخهلتس T1 (نظارتی)"), {
      subsystem: "TRANSFORMER",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_CB_Incomer_A_Closed", t("Incomer A breaker closed (supervisory)", "وصل بودن کلید ورودی A (نظارتی)"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_CB_Incomer_A_Open", t("Incomer A breaker open (supervisory)", "قطع بودن کلید ورودی A (نظارتی)"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_CB_Coupler_Closed", t("Bus coupler breaker closed (supervisory)", "وصل بودن کلید کوپلر (نظارتی)"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_F3_Overcurrent_Trip", t("F3 overcurrent trip (supervisory)", "تریپ اضافه‌جریان F3 (نظارتی)"), {
      subsystem: "FEEDERS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_Synchrocheck_Ok", t("Synchrocheck permitting (supervisory)", "مجاز بودن سنکروچک (نظارتی)"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_Coupler_Interlock_Ok", t("Coupler interlock satisfied (supervisory)", "برقرار بودن اینترلاک کوپلر (نظارتی)"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_DC_Bus_Voltage", t("Station DC bus voltage (supervisory)", "ولتاژ باس DC پست (نظارتی)"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "V", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_Ups_On_Battery", t("UPS on battery (supervisory)", "کارکرد UPS روی باتری (نظارتی)"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_Station_Mode", t("Station mode (supervisory)", "حالت پست (نظارتی)"), {
      subsystem: "STATION_AUX",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OTHER" },
    }),
    a.node("SCADA_TAG", "PDS_Gw_A_Link_Ok", t("Gateway A link healthy (supervisory)", "سلامت پیوند دروازهٔ A (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "PDS_Gw_B_Link_Ok", t("Gateway B link healthy (supervisory)", "سلامت پیوند دروازهٔ B (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "PDS_Telemetry_Age", t("Station sample age", "سن نمونهٔ پست"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "s", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "PDS_Time_Sync_Ok", t("Time synchronisation healthy (supervisory)", "سلامت همگام‌سازی زمان (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "PDS_Telemetry_Stale", t("Station telemetry stale flag", "پرچم کهنگی تله‌متری پست"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ_WRITE" },
      description: t(
        "Published by the watchdog rather than inferred by each screen. Stale means NEITHER station gateway is carrying data — never that the electrical picture behind it is healthy.",
        "به‌جای استنتاج در هر صفحه، توسط دیدبان منتشر می‌شود. کهنگی یعنی هیچ‌یک از دو دروازهٔ پست داده منتقل نمی‌کند — و هرگز به این معنا نیست که تصویر الکتریکی پشت آن سالم است.",
      ),
    }),
    a.node("SCADA_TAG", "PDS_Bus_Coupler_Close_Intent", t("Bus coupler close intent", "قصد وصل کوپلر باسبار"), {
      subsystem: "STATION_MV",
      attributes: {
        dataType: "BOOL",
        accessMode: "WRITE",
        requiredPermission: "COUPLER_SWITCHING",
        requiresConfirmation: true,
      },
      description: t(
        "A recorded statement that an authorised human asked for the coupler to be closed. It is ENGINEERING METADATA: it drives no plant object in this corpus, and the station's own interlocks decide whether the request is honoured.",
        "ثبت این که یک انسانِ مجاز درخواست وصل کوپلر را داده است. این یک فرادادهٔ مهندسی است: در این پیکره هیچ شیء فرایندی را به حرکت درنمی‌آورد و اینترلاک‌های خود پست تصمیم می‌گیرند که درخواست پذیرفته شود یا نه.",
      ),
    }),
    a.node("SCADA_TAG", "PDS_Cap_Bank_Step_Intent", t("Capacitor step intent", "قصد وارد کردن پلهٔ خازنی"), {
      subsystem: "STATION_MV",
      attributes: {
        dataType: "BOOL",
        accessMode: "WRITE",
        requiredPermission: "CAP_BANK_CONTROL",
        requiresConfirmation: true,
      },
    }),
    a.node("SCADA_TAG", "PDS_Alarm_Ack_Cmd", t("Alarm acknowledge command", "فرمان تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: {
        dataType: "BOOL",
        accessMode: "WRITE",
        requiredPermission: "ALARM_ACK",
        requiresConfirmation: true,
      },
      description: t(
        "ISA-18.2 acknowledgement records that a human saw the alarm and clears no condition. Unlike the earlier supervisory references it is confirmed here: this banner carries protection-trip alarms, and the station's alarm philosophy declares acknowledging one a deliberate act.",
        "تأیید طبق ISA-18.2 فقط ثبت می‌کند که انسانی آلارم را دیده و هیچ شرطی را پاک نمی‌کند. برخلاف مراجع نظارتی پیشین، اینجا تأییدیه لازم است: این نوار آلارم‌های تریپ حفاظت را نیز نمایش می‌دهد و فلسفهٔ آلارم پست، تأیید چنین آلارمی را یک اقدام آگاهانه اعلام می‌کند.",
      ),
    }),

    /* Field channels */
    a.node("IO_POINT", "AI_INCOMER_A_CT", t("Incomer A current transformer", "ترانس جریان ورودی A"), {
      subsystem: "STATION_HV",
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      attributes: { channelType: "AI", unit: "A" },
    }),
    a.node("IO_POINT", "AI_BUS_A_VT", t("Busbar A voltage transformer", "ترانس ولتاژ باسبار A"), {
      subsystem: "STATION_MV",
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      attributes: { channelType: "AI", unit: "kV" },
    }),
    a.node("IO_POINT", "AI_T1_WINDING_RTD", t("T1 winding temperature sensor", "حسگر دمای سیم‌پیچ T1"), {
      subsystem: "TRANSFORMER",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "C" },
    }),
    a.node("IO_POINT", "DI_CB_INCOMER_A_52A", t("Breaker A 52a auxiliary contact", "کنتاکت کمکی 52a کلید A"), {
      subsystem: "STATION_HV",
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      attributes: { channelType: "DI" },
    }),
    a.node("IO_POINT", "DI_CB_INCOMER_A_52B", t("Breaker A 52b auxiliary contact", "کنتاکت کمکی 52b کلید A"), {
      subsystem: "STATION_HV",
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      attributes: { channelType: "DI" },
    }),
    a.node("IO_POINT", "AI_DC_BUS_VOLTAGE", t("Station DC bus voltage transducer", "مبدل ولتاژ باس DC پست"), {
      subsystem: "STATION_AUX",
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      attributes: { channelType: "AI", unit: "V" },
    }),

    /* Bus transfer sequence */
    a.node("SEQUENCE", "BUS_TRANSFER", t("Busbar transfer sequence", "توالی انتقال باسبار"), {
      subsystem: "STATION_MV",
      domain: "CONTROL_LOGIC",
      description: t(
        "The station's declared transfer scheme. Hermes describes it and never runs a step of it.",
        "طرح انتقال اعلام‌شدهٔ پست. هرمس آن را توصیف می‌کند و هرگز حتی یک گام از آن را اجرا نمی‌کند.",
      ),
    }),
    a.node("STATE", "B00_NORMAL_SPLIT", t("Normal split operation", "بهره‌برداری عادی تفکیک‌شده"), {
      subsystem: "STATION_MV",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 0 },
    }),
    a.node("STATE", "B10_CHECK_SYNCHRONISM", t("Check synchronism", "بررسی هم‌زمانی"), {
      subsystem: "STATION_MV",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 10, stepTimeoutSeconds: 60 },
    }),
    a.node("STATE", "B20_COUPLER_CLOSED_PARALLEL", t("Coupler closed, sections in parallel", "کوپلر وصل، سکشن‌ها موازی"), {
      subsystem: "STATION_MV",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 20, stepTimeoutSeconds: 30 },
    }),
    a.node("STATE", "B30_INCOMER_OPEN", t("Incomer opened", "قطع ورودی"), {
      subsystem: "STATION_MV",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 30, stepTimeoutSeconds: 30 },
    }),
    a.node("STATE", "B40_SINGLE_INCOMER_SUPPLY", t("Single incomer supplying both sections", "تغذیهٔ هر دو سکشن از یک ورودی"), {
      subsystem: "STATION_MV",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 40 },
    }),

    /* ISA-18.2 alarm lifecycle, declared as a design object */
    a.node("SEQUENCE", "ALARM_LIFECYCLE", t("ISA-18.2 alarm lifecycle", "چرخهٔ عمر آلارم ISA-18.2"), {
      domain: "OPERATOR_INTERFACE",
      description: t(
        "The declared alarm philosophy of the station, in ISA-18.2 stages. Acknowledgement moves an alarm between these states and never clears the underlying condition.",
        "فلسفهٔ اعلام‌شدهٔ آلارم پست، در مراحل ISA-18.2. تأیید، آلارم را بین این حالت‌ها جابه‌جا می‌کند و هرگز شرط زیربنایی را پاک نمی‌کند.",
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
    a.node("PERMISSIVE", "PRM_TELEMETRY_FRESH", t("Station picture fresh enough to act on", "تازگی کافی تصویر پست برای اقدام"), {
      domain: "NETWORK",
      description: t(
        "A permissive about DATA, not about the network. With two redundant gateways it fails only when neither path is carrying data — and its failure never licenses the assumption that the plant is fine.",
        "مجوزی دربارهٔ داده است، نه دربارهٔ شبکهٔ برق. با دو دروازهٔ افزونه تنها وقتی ناموفق می‌شود که هیچ مسیری داده منتقل نکند — و ناموفق شدن آن هرگز مجوز این فرض نیست که شبکه سالم است.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_SYNCHRONISM_OK", t("Synchronism satisfied for paralleling", "برقراری هم‌زمانی برای موازی‌سازی"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("PERMISSIVE", "PRM_STATION_REMOTE", t("Station in remote/auto", "پست در حالت دور/خودکار"), {
      subsystem: "STATION_AUX",
      domain: "CONTROL_LOGIC",
    }),
    a.node("PERMISSIVE", "PRM_DC_SUPPLY_HEALTHY", t("Station DC supply healthy", "سلامت تغذیهٔ DC پست"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "No switching operation is contemplated without a healthy trip supply behind it.",
        "هیچ عملیات کلیدزنی بدون تغذیهٔ سالم مدار تریپ در پشت آن قابل تصور نیست.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_MEASUREMENT_QUALITY", t("Measurement quality trustworthy", "قابل اعتماد بودن کیفیت اندازه‌گیری"), {
      subsystem: "STATION_MV",
      domain: "QUALITY",
    }),
    a.node("PERMISSIVE", "PRM_CAP_BANK_READY", t("Capacitor bank ready to step", "آمادگی بانک خازنی برای تغییر پله"), {
      subsystem: "STATION_MV",
      domain: "ENERGY",
    }),

    /* Interlocks */
    a.node("INTERLOCK", "ILK_BUS_COUPLER", t("Bus coupler interlock", "اینترلاک کوپلر باسبار"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Paralleling two live sections out of synchronism is one of the most damaging things a substation can do. The interlock that prevents it is observed here and bypassed nowhere.",
        "موازی‌کردن دو سکشن برق‌دار خارج از هم‌زمانی یکی از مخرب‌ترین کارهایی است که یک پست می‌تواند انجام دهد. اینترلاکی که از آن جلوگیری می‌کند اینجا مشاهده می‌شود و در هیچ جا دور زده نمی‌شود.",
      ),
    }),
    a.node("INTERLOCK", "ILK_TRANSFORMER_PROTECTION", t("Transformer protection interlock", "اینترلاک حفاظت ترانسفورماتور"), {
      subsystem: "TRANSFORMER",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_FEEDER_PROTECTION", t("Feeder protection interlock", "اینترلاک حفاظت فیدر"), {
      subsystem: "FEEDERS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),

    /* Alarms */
    a.node("ALARM", "ALM_MEASUREMENT_QUALITY_BAD", t("Measurement quality bad", "نامطلوب بودن کیفیت اندازه‌گیری"), {
      subsystem: "STATION_MV",
      domain: "QUALITY",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_T1_WINDING_TEMP_HIGH", t("T1 winding temperature high", "بالا بودن دمای سیم‌پیچ T1"), {
      subsystem: "TRANSFORMER",
      domain: "PROCESS",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_CB_POSITION_DISCREPANCY", t("Breaker position discrepancy", "مغایرت وضعیت کلید"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_STATION_COMMS_STALE", t("Station telemetry stale", "کهنگی تله‌متری پست"), {
      domain: "NETWORK",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_TIME_SYNC_LOST", t("Station time synchronisation lost", "قطع همگام‌سازی زمان پست"), {
      domain: "NETWORK",
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),
    a.node("ALARM", "ALM_COUPLER_INTERLOCK_BLOCKED", t("Bus coupler blocked by interlock", "مسدود شدن کوپلر توسط اینترلاک"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_F3_PROTECTION_TRIP", t("Feeder F3 protection trip", "تریپ حفاظت فیدر F3"), {
      subsystem: "FEEDERS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_DC_SUPPLY_DEGRADED", t("Station DC supply degraded", "افت تغذیهٔ DC پست"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_STATION_IN_LOCAL", t("Station left in local", "رهاشدن پست در حالت محلی"), {
      subsystem: "STATION_AUX",
      domain: "CONTROL_LOGIC",
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),

    /* Operator screens and objects */
    a.node("HMI_SCREEN", "Screen_StationOverview", t("Substation single-line overview", "نمای تک‌خطی پست"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Incomers", t("Incoming feeders", "فیدرهای ورودی"), {
      subsystem: "STATION_HV",
      domain: "OPERATOR_INTERFACE",
      description: t(
        "Display-only. Breaker faceplates on this screen declare no command: the corpus offers no path by which an incomer can be switched.",
        "صرفاً نمایشی. فیس‌پلیت‌های کلید در این صفحه هیچ فرمانی اعلام نمی‌کنند: این پیکره هیچ مسیری برای کلیدزنی ورودی در اختیار نمی‌گذارد.",
      ),
    }),
    a.node("HMI_SCREEN", "Screen_Transformer", t("Power transformer T1", "ترانسفورماتور قدرت T1"), {
      subsystem: "TRANSFORMER",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_BusCoupler", t("MV bus coupler", "کوپلر باسبار فشار متوسط"), {
      subsystem: "STATION_MV",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Feeders", t("Outgoing feeders and capacitor bank", "فیدرهای خروجی و بانک خازنی"), {
      subsystem: "FEEDERS",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_StationDc", t("Station DC, charger and UPS", "سامانهٔ DC، شارژر و UPS پست"), {
      subsystem: "STATION_AUX",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Alarms", t("Active alarms", "آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_CommsHealth", t("Gateway path health indicator", "نشانگر سلامت مسیرهای دروازه"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_TimeSyncHealth", t("Time synchronisation indicator", "نشانگر همگام‌سازی زمان"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_ActivePower", t("Active power trend", "روند توان اکتیو"), {
      subsystem: "STATION_MV",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Fp_CbIncomerA", t("Incomer A breaker faceplate (indication only)", "فیس‌پلیت کلید ورودی A (فقط نشان‌دهنده)"), {
      subsystem: "STATION_HV",
      domain: "OPERATOR_INTERFACE",
      description: t(
        "Shows both auxiliary contacts and the incomer current. It declares no command, which is what makes the position discrepancy a diagnosis rather than an invitation to intervene.",
        "هر دو کنتاکت کمکی و جریان ورودی را نشان می‌دهد. هیچ فرمانی اعلام نمی‌کند و همین است که مغایرت وضعیت را به یک تشخیص تبدیل می‌کند، نه دعوتی به مداخله.",
      ),
    }),
    a.node("HMI_OBJECT", "Ind_MeasurementQuality", t("Measurement quality indicator", "نشانگر کیفیت اندازه‌گیری"), {
      subsystem: "STATION_MV",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_T1WindingTemp", t("T1 winding temperature trend", "روند دمای سیم‌پیچ T1"), {
      subsystem: "TRANSFORMER",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_T1Buchholz", t("T1 Buchholz indicator", "نشانگر بوخهلتس T1"), {
      subsystem: "TRANSFORMER",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Fp_BusCoupler", t("Bus coupler faceplate", "فیس‌پلیت کوپلر باسبار"), {
      subsystem: "STATION_MV",
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "COUPLER_SWITCHING", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Ind_F3Protection", t("Feeder F3 protection indicator", "نشانگر حفاظت فیدر F3"), {
      subsystem: "FEEDERS",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Btn_CapBankStep", t("Capacitor step button", "دکمهٔ تغییر پلهٔ خازنی"), {
      subsystem: "STATION_MV",
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "CAP_BANK_CONTROL", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Trend_DcBusVoltage", t("Station DC bus voltage trend", "روند ولتاژ باس DC پست"), {
      subsystem: "STATION_AUX",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_UpsOnBattery", t("UPS on battery indicator", "نشانگر کارکرد UPS روی باتری"), {
      subsystem: "STATION_AUX",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Banner_ActiveAlarms", t("Active alarm banner", "نوار آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "ALARM_ACK", requiresConfirmation: true },
    }),

    /* Supervisory scripts */
    a.node("SCRIPT", "OnBusCouplerCloseIntent", t("Bus coupler close intent handler", "پردازندهٔ قصد وصل کوپلر باسبار"), {
      subsystem: "STATION_MV",
      attributes: { humanInvokable: true, requiredPermission: "COUPLER_SWITCHING" },
      description: t(
        "Invoked by the station supervisor from the coupler faceplate. It records an intent and closes nothing.",
        "توسط سرپرست پست از فیس‌پلیت کوپلر فراخوانی می‌شود. یک قصد را ثبت می‌کند و هیچ‌چیز را وصل نمی‌کند.",
      ),
    }),
    a.node("SCRIPT", "OnCapacitorBankStepIntent", t("Capacitor step intent handler", "پردازندهٔ قصد تغییر پلهٔ خازنی"), {
      subsystem: "STATION_MV",
      attributes: { humanInvokable: true, requiredPermission: "CAP_BANK_CONTROL" },
    }),
    a.node("SCRIPT", "OnAlarmAcknowledge", t("Alarm acknowledge handler", "پردازندهٔ تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "ALARM_ACK" },
    }),
    a.node("SCRIPT", "OnStationWatchdog", t("Station telemetry watchdog", "دیدبان تله‌متری پست"), {
      domain: "NETWORK",
      description: t(
        "Runs on the supervisory server's schedule. It declares no role because no operator invokes it, humanInvokable is deliberately left undeclared (absence means false), and it writes exactly one supervisory flag — never a plant, switching or protection object.",
        "بر اساس زمان‌بندی سرور نظارتی اجرا می‌شود. چون هیچ اپراتوری آن را فراخوانی نمی‌کند هیچ نقشی اعلام نمی‌کند، humanInvokable عمداً اعلام‌نشده مانده است (نبودن یعنی نادرست) و دقیقاً یک پرچم نظارتی می‌نویسد — هرگز یک شیء فرایندی، کلیدزنی یا حفاظتی.",
      ),
    }),

    /* Governance */
    a.node("ROLE", "Role_StationOperator", t("Station operator", "اپراتور پست")),
    a.node("ROLE", "Role_StationSupervisor", t("Station shift supervisor", "سرپرست شیفت پست")),
    a.node("AUDIT_EVENT_TYPE", "Audit_BusCouplerCloseIntentRecorded", t("Bus coupler close intent recorded", "ثبت قصد وصل کوپلر باسبار")),
    a.node("AUDIT_EVENT_TYPE", "Audit_CapacitorBankStepIntentRecorded", t("Capacitor step intent recorded", "ثبت قصد تغییر پلهٔ خازنی")),
    a.node("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged", t("Alarm acknowledged", "تأیید آلارم")),
    a.node("AUDIT_EVENT_TYPE", "Audit_StationWatchdogRecord", t("Station watchdog record", "رکورد دیدبان پست"), {
      description: t(
        "An automatic routine still leaves a record. EMITS carries no humanInvokable requirement, because an audit trail is about what happened, not about who asked for it.",
        "یک روال خودکار نیز رکورد بر جای می‌گذارد. EMITS هیچ الزامی به humanInvokable ندارد، چون سابقهٔ ممیزی دربارهٔ آنچه رخ داده است، نه دربارهٔ اینکه چه کسی آن را خواسته.",
      ),
    }),

    /* KPI and evidence */
    a.node("KPI", "KPI_SUPPLY_AVAILABILITY", t("Supply availability", "دسترس‌پذیری تغذیه"), {
      domain: "MAINTENANCE",
      attributes: { unit: "%", formula: "energised hours / scheduled hours" },
    }),
    a.node("KPI", "KPI_PEAK_DEMAND", t("Peak demand", "اوج بار"), {
      domain: "ENERGY",
      attributes: { unit: "MW", formula: "maximum active power over the billing period" },
    }),
    a.node("KPI", "KPI_AVERAGE_POWER_FACTOR", t("Average power factor", "میانگین ضریب توان"), {
      domain: "ENERGY",
      attributes: { unit: "ratio", formula: "active energy / apparent energy" },
    }),
    a.node("KPI", "KPI_ENERGY_IMPORT", t("Imported energy", "انرژی وارداتی"), {
      domain: "ENERGY",
      attributes: { unit: "MWh", formula: "metered import over the period" },
    }),
    a.node("KPI", "KPI_INTERRUPTION_DURATION", t("Average interruption duration", "میانگین مدت قطعی"), {
      domain: "MAINTENANCE",
      attributes: { unit: "min", formula: "total de-energised minutes / number of interruptions" },
      description: t(
        "Derived from station indications only. It describes the station's own supply continuity and carries no customer or billing information of any kind.",
        "تنها از نشانگرهای خود پست استخراج می‌شود. پیوستگی تغذیهٔ خود پست را توصیف می‌کند و هیچ اطلاعات مشترک یا صورت‌حسابی در بر ندارد.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_ELECTRICAL_TREND", t("Electrical trend archive", "بایگانی روند الکتریکی"), {
      subsystem: "STATION_MV",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 400, sampleIntervalSeconds: 5 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_TRANSFORMER_TREND", t("Transformer trend archive", "بایگانی روند ترانسفورماتور"), {
      subsystem: "TRANSFORMER",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 1825, sampleIntervalSeconds: 30 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_SOE_RECORD", t("Sequence-of-events archive", "بایگانی توالی رویدادها"), {
      domain: "MAINTENANCE",
      attributes: { retentionDays: 1825 },
      description: t(
        "Millisecond-resolution event ordering. It is the only evidence that can say whether a breaker's contacts changed together or apart, which is exactly what a position discrepancy turns on.",
        "ترتیب‌گذاری رویدادها با تفکیک میلی‌ثانیه. تنها شاهدی است که می‌تواند بگوید کنتاکت‌های یک کلید با هم تغییر کرده‌اند یا جدا از هم — و مغایرت وضعیت دقیقاً بر همین می‌چرخد.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_COMMS_LINK_LOG", t("Gateway link log", "گزارش پیوند دروازه‌ها"), {
      domain: "NETWORK",
      attributes: { retentionDays: 180, sampleIntervalSeconds: 10 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_STATION_AUDIT_LOG", t("Operator audit log", "گزارش ممیزی اپراتور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { retentionDays: 1825 },
      description: t(
        "Where the audit event TYPES the scripts declare would be recorded. Hermes reads about it here; it does not write to it, and this corpus carries no operational record.",
        "جایی که انواع رویداد ممیزی اعلام‌شده توسط اسکریپت‌ها ثبت می‌شوند. هرمس اینجا دربارهٔ آن می‌خواند، در آن نمی‌نویسد و این پیکره هیچ رکورد عملیاتی در بر ندارد.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_POWER_QUALITY_TREND", t("Power-quality archive", "بایگانی کیفیت توان"), {
      subsystem: "STATION_MV",
      domain: "QUALITY",
      attributes: { retentionDays: 90, sampleIntervalSeconds: 1 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_DC_SYSTEM_TREND", t("Station DC archive", "بایگانی سامانهٔ DC پست"), {
      subsystem: "STATION_AUX",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 400, sampleIntervalSeconds: 30 },
    }),

    /* Fault modes */
    a.node("FAULT_MODE", "FM_VT_CIRCUIT_FAILURE", t("VT circuit / measurement quality failure", "خرابی مدار ترانس ولتاژ یا کیفیت اندازه‌گیری"), {
      subsystem: "STATION_MV",
      domain: "FIELD_IO",
      attributes: { faultClass: "SENSOR_FAILURE", subsystem: "FIELD_DEVICE" },
      description: t(
        "The network is healthy and the measurement of it is not. Diagnosing the busbar for this would be a wasted outage.",
        "شبکه سالم است و اندازه‌گیری آن سالم نیست. تشخیص دادن باسبار برای این وضعیت، یک خاموشی بیهوده است.",
      ),
    }),
    a.node("FAULT_MODE", "FM_T1_COOLING_DEGRADATION", t("T1 cooling group degradation", "افت عملکرد گروه خنک‌کنندهٔ T1"), {
      subsystem: "TRANSFORMER",
      domain: "PROCESS",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "PROCESS" },
    }),
    a.node("FAULT_MODE", "FM_CB_POSITION_DISCREPANCY", t("Breaker position discrepancy", "مغایرت وضعیت کلید"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "ACTUATOR_FAILURE", subsystem: "FIELD_DEVICE" },
      description: t(
        "Both auxiliary contacts report made, which no healthy breaker does. Either the mechanism stopped part-way through its travel or an auxiliary contact has failed; the sequence-of-events record and a mechanical inspection separate the two, and nothing here prefers one without them.",
        "هر دو کنتاکت کمکی بسته گزارش می‌شوند، چیزی که هیچ کلید سالمی انجام نمی‌دهد. یا مکانیزم در میانهٔ حرکت متوقف شده یا یک کنتاکت کمکی خراب است؛ رکورد توالی رویدادها و بازرسی مکانیکی این دو را از هم جدا می‌کنند و اینجا هیچ‌چیز بدون آن‌ها یکی را ترجیح نمی‌دهد.",
      ),
    }),
    a.node("FAULT_MODE", "FM_STATION_COMMS_LOSS", t("Both station gateway paths lost", "از دست رفتن هر دو مسیر دروازهٔ پست"), {
      domain: "NETWORK",
      attributes: { faultClass: "COMMUNICATION_LOSS", subsystem: "TELEMETRY" },
      description: t(
        "The supervisory picture froze; the electrical state behind it is simply unknown and must never be reported as healthy.",
        "تصویر نظارتی منجمد شده است؛ وضعیت الکتریکی پشت آن صرفاً نامعلوم است و هرگز نباید سالم گزارش شود.",
      ),
    }),
    a.node("FAULT_MODE", "FM_COUPLER_SYNCHRONISM_BLOCK", t("Coupler held out by synchronism interlock", "نگه‌داشته شدن کوپلر توسط اینترلاک هم‌زمانی"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "INTERLOCK_ACTIVE", subsystem: "SAFETY_CIRCUIT" },
    }),
    a.node("FAULT_MODE", "FM_F3_DOWNSTREAM_EARTH_FAULT", t("Earth fault on the F3 downstream circuit", "اتصال زمین در مدار پایین‌دست F3"), {
      subsystem: "FEEDERS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "UPSTREAM_DOWNSTREAM" },
      description: t(
        "The protection did exactly what it exists to do. The abnormality is in the circuit the feeder supplies, not in the station equipment that cleared it.",
        "حفاظت دقیقاً همان کاری را کرد که برای آن وجود دارد. ناهنجاری در مداری است که فیدر تغذیه می‌کند، نه در تجهیزات پستی که آن را رفع کرد.",
      ),
    }),
    a.node("FAULT_MODE", "FM_STATION_DC_DEGRADATION", t("Station DC supply degradation", "افت تغذیهٔ DC پست"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "PROCESS" },
    }),
    a.node("FAULT_MODE", "FM_STATION_LEFT_IN_LOCAL", t("Station left in local mode", "رهاشدن پست در حالت محلی"), {
      subsystem: "STATION_AUX",
      domain: "OPERATOR_INTERFACE",
      attributes: { faultClass: "INCORRECT_MODE", subsystem: "HMI" },
    }),

    /* Safe actions — instructions for a qualified human being */
    a.node("SAFE_ACTION", "SA_REVIEW_VT_CIRCUIT_AND_FUSE_SUPERVISION", t("Review the VT circuit and its fuse supervision", "بازبینی مدار ترانس ولتاژ و نظارت فیوز آن"), {
      subsystem: "STATION_MV",
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Review-only, by a qualified electrical engineer under the station's own permit-to-work. Nothing here is a switching instruction.",
        "فقط بازبینی، توسط مهندس برق واجد صلاحیت و تحت مجوز کار خود پست. هیچ‌چیز اینجا دستور کلیدزنی نیست.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_TRANSFORMER_COOLING_AND_TREND", t("Review the T1 cooling group and its temperature trend", "بازبینی گروه خنک‌کنندهٔ T1 و روند دمای آن"), {
      subsystem: "TRANSFORMER",
      domain: "PROCESS",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_SOE_AND_INSPECT_BREAKER_MECHANISM", t("Review the SOE record and inspect the breaker mechanism", "بازبینی رکورد توالی رویدادها و بازرسی مکانیزم کلید"), {
      subsystem: "STATION_HV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Review-only and escalate. Any inspection of HV switchgear happens under isolation and permit-to-work by an authorised person; the breaker is never operated to test the indication.",
        "فقط بازبینی و ارجاع. هر بازرسی تجهیزات کلیدزنی فشار قوی تحت جداسازی و مجوز کار و توسط فرد مجاز انجام می‌شود؛ کلید هرگز برای آزمودن نشانگر مانور داده نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_VERIFY_STATION_GATEWAY_SESSIONS", t("Verify both station gateway sessions", "بررسی نشست هر دو دروازهٔ پست"), {
      domain: "NETWORK",
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_BUS_COUPLER_INTERLOCK_REVIEW", t("Escalate to a bus coupler interlock review", "ارجاع به بازبینی اینترلاک کوپلر باسبار"), {
      subsystem: "STATION_MV",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Escalate-only. The synchronism and coupler interlocks are never reset, inhibited, bypassed or simulated from here or from anywhere else in Hermes.",
        "فقط ارجاع. اینترلاک‌های هم‌زمانی و کوپلر هرگز از اینجا یا از هیچ جای دیگر هرمس ریست، غیرفعال، دور زده یا شبیه‌سازی نمی‌شوند.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_FEEDER_PROTECTION_REVIEW", t("Escalate to a feeder protection review", "ارجاع به بازبینی حفاظت فیدر"), {
      subsystem: "FEEDERS",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Escalate-only, to the protection engineer. Relay settings are never read out, changed or disabled from Hermes, and no re-energisation is recommended here.",
        "فقط ارجاع، به مهندس حفاظت. تنظیمات رله هرگز از هرمس خوانده، تغییر داده یا غیرفعال نمی‌شود و هیچ برق‌دار کردن مجددی اینجا توصیه نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_STATION_DC_CHARGER_AND_BATTERY", t("Inspect the station DC charger and battery", "بازرسی شارژر و باتری DC پست"), {
      subsystem: "STATION_AUX",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_STATION_AUDIT_LOG", t("Review the operator audit log", "بازبینی گزارش ممیزی اپراتور"), {
      domain: "OPERATOR_INTERFACE",
    }),
  ],

  edges: [
    /* Containment — bay and station controllers hold the process image */
    a.edge(D.bayIncomer, T.incomerACurrent, "CONTAINS"),
    a.edge(D.bayIncomer, T.incomerAVoltage, "CONTAINS"),
    a.edge(D.bayIncomer, T.incomerBVoltage, "CONTAINS"),
    a.edge(D.bayIncomer, T.busAVoltage, "CONTAINS"),
    a.edge(D.bayIncomer, T.busBVoltage, "CONTAINS"),
    a.edge(D.bayIncomer, T.activePower, "CONTAINS"),
    a.edge(D.bayIncomer, T.reactivePower, "CONTAINS"),
    a.edge(D.bayIncomer, T.powerFactor, "CONTAINS"),
    a.edge(D.bayIncomer, T.frequency, "CONTAINS"),
    a.edge(D.bayIncomer, T.thdVoltage, "CONTAINS"),
    a.edge(D.bayIncomer, T.energyImport, "CONTAINS"),
    a.edge(D.bayIncomer, T.vtHealthy, "CONTAINS"),
    a.edge(D.bayIncomer, T.ctHealthy, "CONTAINS"),
    a.edge(D.bayIncomer, T.measQuality, "CONTAINS"),
    a.edge(D.bayIncomer, T.t1WindingTemp, "CONTAINS"),
    a.edge(D.bayIncomer, T.t1OilTemp, "CONTAINS"),
    a.edge(D.bayIncomer, T.t1TapPosition, "CONTAINS"),
    a.edge(D.bayIncomer, T.t1CoolingRunning, "CONTAINS"),
    a.edge(D.bayIncomer, T.t2WindingTemp, "CONTAINS"),
    a.edge(D.bayIncomer, T.cbIncomerAClosed, "CONTAINS"),
    a.edge(D.bayIncomer, T.cbIncomerAOpen, "CONTAINS"),
    a.edge(D.bayIncomer, T.cbIncomerBClosed, "CONTAINS"),
    a.edge(D.bayIncomer, T.cbCouplerClosed, "CONTAINS"),
    a.edge(D.bayIncomer, T.isolatorAClosed, "CONTAINS"),
    a.edge(D.bayIncomer, T.synchrocheck, "CONTAINS"),
    a.edge(D.bayIncomer, T.couplerInterlockOk, "CONTAINS"),
    a.edge(D.bayFeeder, T.cbFeederF3Closed, "CONTAINS"),
    a.edge(D.bayFeeder, T.capBankSteps, "CONTAINS"),
    a.edge(D.bayFeeder, T.capBankUnbalance, "CONTAINS"),
    a.edge(D.relayIncomerA, T.tripCircuitHealthy, "CONTAINS"),
    a.edge(D.relayIncomerA, T.relayHealthy, "CONTAINS"),
    a.edge(D.relayT1, T.t1Buchholz, "CONTAINS"),
    a.edge(D.relayT1, T.t1DiffTrip, "CONTAINS"),
    a.edge(D.relayF3, T.f3OvercurrentTrip, "CONTAINS"),
    a.edge(D.relayF3, T.f3EarthFaultTrip, "CONTAINS"),
    a.edge(D.mccPanel, T.mccAvailable, "CONTAINS"),
    a.edge(D.stationCtl, T.dcBusVoltage, "CONTAINS"),
    a.edge(D.stationCtl, T.chargerHealthy, "CONTAINS"),
    a.edge(D.stationCtl, T.batteryEarthFault, "CONTAINS"),
    a.edge(D.stationCtl, T.upsOnBattery, "CONTAINS"),
    a.edge(D.stationCtl, T.stationMode, "CONTAINS"),
    a.edge(D.stationCtl, T.timeSyncOk, "CONTAINS"),
    a.edge(D.stationCtl, T.timeSyncOffset, "CONTAINS"),
    a.edge(D.gwA, T.gwALink, "CONTAINS"),
    a.edge(D.gwB, T.gwBLink, "CONTAINS"),
    a.edge(D.primary, T.telemetryAge, "CONTAINS"),
    a.edge(D.primary, ST.telemetryStale, "CONTAINS"),
    a.edge(D.primary, ST.busAVoltage, "CONTAINS"),
    a.edge(D.primary, ST.cbIncomerAClosed, "CONTAINS"),
    a.edge(D.primary, ST.gwALink, "CONTAINS"),
    a.edge(D.primary, ST.gwBLink, "CONTAINS"),
    a.edge(D.primary, ST.couplerCloseIntent, "CONTAINS"),
    a.edge(D.primary, ST.capBankStepIntent, "CONTAINS"),
    a.edge(D.primary, AQ, "CONTAINS"),
    a.edge(D.historian, EV.electricalTrend, "CONTAINS"),
    a.edge(D.historian, EV.transformerTrend, "CONTAINS"),
    a.edge(D.historian, EV.commsLinkLog, "CONTAINS"),
    a.edge(D.historian, EV.auditLog, "CONTAINS"),
    a.edge(D.historian, EV.powerQualityTrend, "CONTAINS"),
    a.edge(D.historian, EV.dcSystemTrend, "CONTAINS"),
    a.edge(D.soeRecorder, EV.soeRecord, "CONTAINS"),
    a.edge(D.opClient, H.overview, "CONTAINS"),
    a.edge(D.opClient, H.incomers, "CONTAINS"),
    a.edge(D.opClient, H.transformer, "CONTAINS"),
    a.edge(D.opClient, H.busCoupler, "CONTAINS"),
    a.edge(D.opClient, H.feeders, "CONTAINS"),
    a.edge(D.opClient, H.stationDc, "CONTAINS"),
    a.edge(D.opClient, H.alarms, "CONTAINS"),
    a.edge(H.overview, HO.commsHealth, "CONTAINS"),
    a.edge(H.overview, HO.timeSyncHealth, "CONTAINS"),
    a.edge(H.overview, HO.activePower, "CONTAINS"),
    a.edge(H.incomers, HO.cbIncomerA, "CONTAINS"),
    a.edge(H.incomers, HO.measQuality, "CONTAINS"),
    a.edge(H.transformer, HO.t1WindingTemp, "CONTAINS"),
    a.edge(H.transformer, HO.t1Buchholz, "CONTAINS"),
    a.edge(H.busCoupler, HO.busCoupler, "CONTAINS"),
    a.edge(H.feeders, HO.f3Protection, "CONTAINS"),
    a.edge(H.feeders, HO.capBankStep, "CONTAINS"),
    a.edge(H.stationDc, HO.dcBusVoltage, "CONTAINS"),
    a.edge(H.stationDc, HO.upsOnBattery, "CONTAINS"),
    a.edge(H.alarms, HO.alarmBanner, "CONTAINS"),
    a.edge(SQ, S.split, "CONTAINS"),
    a.edge(SQ, S.check, "CONTAINS"),
    a.edge(SQ, S.parallel, "CONTAINS"),
    a.edge(SQ, S.openIncomer, "CONTAINS"),
    a.edge(SQ, S.single, "CONTAINS"),
    a.edge(AQ, AS.normal, "CONTAINS"),
    a.edge(AQ, AS.unack, "CONTAINS"),
    a.edge(AQ, AS.acked, "CONTAINS"),
    a.edge(AQ, AS.rtnUnack, "CONTAINS"),

    /* Redundancy — server pair and station gateway pair, as design facts */
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
      t("Redundant station gateway path", "مسیر افزونهٔ دروازهٔ پست"),
    ),

    /* Field channels to the bay process image */
    a.edge(T.incomerACurrent, IO.incomerACt, "BOUND_TO"),
    a.edge(T.busAVoltage, IO.busAVt, "BOUND_TO"),
    a.edge(T.t1WindingTemp, IO.t1WindingRtd, "BOUND_TO"),
    a.edge(T.cbIncomerAClosed, IO.cb52a, "BOUND_TO"),
    a.edge(T.cbIncomerAOpen, IO.cb52b, "BOUND_TO"),
    a.edge(T.dcBusVoltage, IO.dcBusVoltage, "BOUND_TO"),

    /* Supervisory image mirrors the bay image across the station gateways.
     * This is the seam where a healthy network and an unhealthy PICTURE of it
     * become distinguishable. */
    a.edge(ST.incomerACurrent, T.incomerACurrent, "MIRRORS"),
    a.edge(ST.busAVoltage, T.busAVoltage, "MIRRORS"),
    a.edge(ST.activePower, T.activePower, "MIRRORS"),
    a.edge(ST.powerFactor, T.powerFactor, "MIRRORS"),
    a.edge(ST.measQuality, T.measQuality, "MIRRORS"),
    a.edge(ST.t1WindingTemp, T.t1WindingTemp, "MIRRORS"),
    a.edge(ST.t1Buchholz, T.t1Buchholz, "MIRRORS"),
    a.edge(ST.cbIncomerAClosed, T.cbIncomerAClosed, "MIRRORS"),
    a.edge(ST.cbIncomerAOpen, T.cbIncomerAOpen, "MIRRORS"),
    a.edge(ST.cbCouplerClosed, T.cbCouplerClosed, "MIRRORS"),
    a.edge(ST.f3OvercurrentTrip, T.f3OvercurrentTrip, "MIRRORS"),
    a.edge(ST.synchrocheck, T.synchrocheck, "MIRRORS"),
    a.edge(ST.couplerInterlockOk, T.couplerInterlockOk, "MIRRORS"),
    a.edge(ST.dcBusVoltage, T.dcBusVoltage, "MIRRORS"),
    a.edge(ST.upsOnBattery, T.upsOnBattery, "MIRRORS"),
    a.edge(ST.stationMode, T.stationMode, "MIRRORS"),
    a.edge(ST.gwALink, T.gwALink, "MIRRORS"),
    a.edge(ST.gwBLink, T.gwBLink, "MIRRORS"),
    a.edge(ST.telemetryAge, T.telemetryAge, "MIRRORS"),
    a.edge(ST.timeSyncOk, T.timeSyncOk, "MIRRORS"),

    /* What the indications monitor. Note there is deliberately no ACTUATES
     * edge anywhere onto a breaker, isolator, coupler or protection object. */
    a.edge(T.incomerACurrent, EQ.incomerA, "MONITORS"),
    a.edge(T.incomerAVoltage, EQ.incomerA, "MONITORS"),
    a.edge(T.incomerBVoltage, EQ.incomerB, "MONITORS"),
    a.edge(T.busAVoltage, EQ.busbarA, "MONITORS"),
    a.edge(T.busBVoltage, EQ.busbarB, "MONITORS"),
    a.edge(T.activePower, EQ.busbarA, "MONITORS"),
    a.edge(T.reactivePower, EQ.busbarA, "MONITORS"),
    a.edge(T.powerFactor, EQ.busbarA, "MONITORS"),
    a.edge(T.frequency, EQ.busbarA, "MONITORS"),
    a.edge(T.thdVoltage, EQ.busbarA, "MONITORS"),
    a.edge(T.energyImport, EQ.busbarA, "MONITORS"),
    a.edge(T.t1WindingTemp, EQ.transformerT1, "MONITORS"),
    a.edge(T.t1OilTemp, EQ.transformerT1, "MONITORS"),
    a.edge(T.t1TapPosition, EQ.transformerT1, "MONITORS"),
    a.edge(T.t1CoolingRunning, EQ.transformerT1, "MONITORS"),
    a.edge(T.t1Buchholz, EQ.transformerT1, "MONITORS"),
    a.edge(T.t1DiffTrip, EQ.transformerT1, "MONITORS"),
    a.edge(T.t2WindingTemp, EQ.transformerT2, "MONITORS"),
    a.edge(T.cbIncomerAClosed, EQ.cbIncomerA, "MONITORS"),
    a.edge(T.cbIncomerAOpen, EQ.cbIncomerA, "MONITORS"),
    a.edge(T.cbIncomerBClosed, EQ.cbIncomerB, "MONITORS"),
    a.edge(T.cbCouplerClosed, EQ.cbCoupler, "MONITORS"),
    a.edge(T.cbFeederF3Closed, EQ.cbFeederF3, "MONITORS"),
    a.edge(T.isolatorAClosed, EQ.isolatorA, "MONITORS"),
    a.edge(T.tripCircuitHealthy, EQ.cbIncomerA, "MONITORS"),
    a.edge(T.f3OvercurrentTrip, EQ.outgoingF3, "MONITORS"),
    a.edge(T.f3EarthFaultTrip, EQ.outgoingF3, "MONITORS"),
    a.edge(T.capBankSteps, EQ.capBank, "MONITORS"),
    a.edge(T.capBankUnbalance, EQ.capBank, "MONITORS"),
    a.edge(T.dcBusVoltage, EQ.stationDc, "MONITORS"),
    a.edge(T.chargerHealthy, EQ.stationDc, "MONITORS"),
    a.edge(T.batteryEarthFault, EQ.stationDc, "MONITORS"),
    a.edge(T.upsOnBattery, EQ.ups, "MONITORS"),
    a.edge(T.mccAvailable, EQ.mccIncomer, "MONITORS"),
    a.edge(T.synchrocheck, EQ.busCoupler, "MONITORS"),
    a.edge(T.couplerInterlockOk, EQ.busCoupler, "MONITORS"),
    a.edge(D.relayIncomerA, EQ.cbIncomerA, "MONITORS"),
    a.edge(D.relayT1, EQ.transformerT1, "MONITORS"),
    a.edge(D.relayF3, EQ.cbFeederF3, "MONITORS"),
    a.edge(T.timeSyncOk, D.timeServer, "MONITORS"),

    /* Sequences and their gates */
    ...chainStates(a, [S.split, S.check, S.parallel, S.openIncomer, S.single]),
    ...chainStates(a, [AS.normal, AS.unack, AS.acked, AS.rtnUnack]),
    a.edge(
      AS.rtnUnack,
      AS.normal,
      "TRANSITIONS_TO",
      t("Acknowledgement of a returned alarm closes the lifecycle", "تأیید آلارمِ بازگشته چرخه را می‌بندد"),
    ),
    a.edge(P.telemetryFresh, SQ, "GATES"),
    a.edge(P.stationRemote, SQ, "GATES"),
    a.edge(P.dcHealthy, SQ, "GATES"),
    a.edge(P.synchronism, S.parallel, "GATES"),
    a.edge(P.measurementQuality, S.check, "GATES"),
    a.edge(P.capBankReady, S.single, "GATES"),
    a.edge(I.busCoupler, S.parallel, "BLOCKS"),
    a.edge(I.transformerProtection, S.openIncomer, "BLOCKS"),
    a.edge(I.feederProtection, S.single, "BLOCKS"),

    /* What each permissive and interlock actually reads */
    a.edge(P.telemetryFresh, T.gwALink, "READS"),
    a.edge(P.telemetryFresh, T.gwBLink, "READS"),
    a.edge(P.telemetryFresh, T.telemetryAge, "READS"),
    a.edge(P.synchronism, T.synchrocheck, "READS"),
    a.edge(P.synchronism, T.busAVoltage, "READS"),
    a.edge(P.synchronism, T.busBVoltage, "READS"),
    a.edge(P.stationRemote, T.stationMode, "READS"),
    a.edge(P.dcHealthy, T.dcBusVoltage, "READS"),
    a.edge(P.dcHealthy, T.chargerHealthy, "READS"),
    a.edge(P.measurementQuality, T.measQuality, "READS"),
    a.edge(P.measurementQuality, T.vtHealthy, "READS"),
    a.edge(P.measurementQuality, T.ctHealthy, "READS"),
    a.edge(P.capBankReady, T.powerFactor, "READS"),
    a.edge(P.capBankReady, T.capBankUnbalance, "READS"),
    a.edge(I.busCoupler, T.synchrocheck, "READS"),
    a.edge(I.busCoupler, T.couplerInterlockOk, "READS"),
    a.edge(I.transformerProtection, T.t1DiffTrip, "READS"),
    a.edge(I.transformerProtection, T.t1Buchholz, "READS"),
    a.edge(I.feederProtection, T.f3OvercurrentTrip, "READS"),
    a.edge(I.feederProtection, T.f3EarthFaultTrip, "READS"),

    /* Alarms */
    a.edge(T.measQuality, AL.measQuality, "RAISES"),
    a.edge(T.t1WindingTemp, AL.t1TempHigh, "RAISES"),
    a.edge(T.cbIncomerAOpen, AL.cbDiscrepancy, "RAISES"),
    a.edge(ST.telemetryStale, AL.commsStale, "RAISES"),
    a.edge(T.timeSyncOk, AL.timeSyncLost, "RAISES"),
    a.edge(I.busCoupler, AL.couplerBlocked, "RAISES"),
    a.edge(I.feederProtection, AL.f3ProtectionTrip, "RAISES"),
    a.edge(T.dcBusVoltage, AL.dcDegraded, "RAISES"),
    a.edge(T.stationMode, AL.stationInLocal, "RAISES"),

    /* Operator screens */
    a.edge(H.overview, ST.gwALink, "DISPLAYS"),
    a.edge(H.overview, ST.gwBLink, "DISPLAYS"),
    a.edge(H.overview, ST.timeSyncOk, "DISPLAYS"),
    a.edge(H.overview, ST.activePower, "DISPLAYS"),
    a.edge(H.overview, H.incomers, "NAVIGATES_TO"),
    a.edge(H.overview, H.transformer, "NAVIGATES_TO"),
    a.edge(H.overview, H.busCoupler, "NAVIGATES_TO"),
    a.edge(H.overview, H.feeders, "NAVIGATES_TO"),
    a.edge(H.overview, H.stationDc, "NAVIGATES_TO"),
    a.edge(H.overview, H.alarms, "NAVIGATES_TO"),
    a.edge(H.incomers, ST.cbIncomerAClosed, "DISPLAYS"),
    a.edge(H.incomers, ST.cbIncomerAOpen, "DISPLAYS"),
    a.edge(H.incomers, ST.incomerACurrent, "DISPLAYS"),
    a.edge(H.incomers, ST.measQuality, "DISPLAYS"),
    a.edge(H.incomers, ST.busAVoltage, "DISPLAYS"),
    a.edge(H.incomers, H.overview, "NAVIGATES_TO"),
    a.edge(H.transformer, ST.t1WindingTemp, "DISPLAYS"),
    a.edge(H.transformer, ST.t1Buchholz, "DISPLAYS"),
    a.edge(H.transformer, H.overview, "NAVIGATES_TO"),
    a.edge(H.busCoupler, ST.cbCouplerClosed, "DISPLAYS"),
    a.edge(H.busCoupler, ST.synchrocheck, "DISPLAYS"),
    a.edge(H.busCoupler, ST.couplerInterlockOk, "DISPLAYS"),
    a.edge(H.busCoupler, ST.couplerCloseIntent, "COMMANDS"),
    a.edge(H.busCoupler, H.overview, "NAVIGATES_TO"),
    a.edge(H.feeders, ST.f3OvercurrentTrip, "DISPLAYS"),
    a.edge(H.feeders, ST.capBankStepIntent, "COMMANDS"),
    a.edge(H.feeders, H.overview, "NAVIGATES_TO"),
    a.edge(H.stationDc, ST.dcBusVoltage, "DISPLAYS"),
    a.edge(H.stationDc, ST.upsOnBattery, "DISPLAYS"),
    a.edge(H.stationDc, H.overview, "NAVIGATES_TO"),
    a.edge(H.alarms, ST.telemetryStale, "DISPLAYS"),
    a.edge(H.alarms, ST.ackCmd, "COMMANDS"),
    a.edge(H.alarms, H.overview, "NAVIGATES_TO"),

    a.edge(HO.commsHealth, ST.gwALink, "DISPLAYS"),
    a.edge(HO.commsHealth, ST.gwBLink, "DISPLAYS"),
    a.edge(HO.timeSyncHealth, ST.timeSyncOk, "DISPLAYS"),
    a.edge(HO.activePower, ST.activePower, "DISPLAYS"),
    a.edge(HO.cbIncomerA, ST.cbIncomerAClosed, "DISPLAYS"),
    a.edge(HO.cbIncomerA, ST.cbIncomerAOpen, "DISPLAYS"),
    a.edge(HO.cbIncomerA, ST.incomerACurrent, "DISPLAYS"),
    a.edge(HO.measQuality, ST.measQuality, "DISPLAYS"),
    a.edge(HO.measQuality, ST.busAVoltage, "DISPLAYS"),
    a.edge(HO.t1WindingTemp, ST.t1WindingTemp, "DISPLAYS"),
    a.edge(HO.t1Buchholz, ST.t1Buchholz, "DISPLAYS"),
    a.edge(HO.busCoupler, ST.cbCouplerClosed, "DISPLAYS"),
    a.edge(HO.busCoupler, ST.synchrocheck, "DISPLAYS"),
    a.edge(HO.busCoupler, ST.couplerInterlockOk, "DISPLAYS"),
    a.edge(HO.busCoupler, ST.couplerCloseIntent, "COMMANDS"),
    a.edge(HO.f3Protection, ST.f3OvercurrentTrip, "DISPLAYS"),
    a.edge(HO.capBankStep, ST.capBankStepIntent, "COMMANDS"),
    a.edge(HO.dcBusVoltage, ST.dcBusVoltage, "DISPLAYS"),
    a.edge(HO.upsOnBattery, ST.upsOnBattery, "DISPLAYS"),
    a.edge(HO.alarmBanner, ST.telemetryStale, "DISPLAYS"),
    a.edge(HO.alarmBanner, ST.ackCmd, "COMMANDS"),

    /* Scripts — recovered from the supervisory source itself */
    a.edge(SC.couplerIntent, ST.synchrocheck, "READS"),
    a.edge(SC.couplerIntent, ST.couplerInterlockOk, "READS"),
    a.edge(SC.couplerIntent, ST.stationMode, "READS"),
    a.edge(SC.couplerIntent, ST.couplerCloseIntent, "WRITES"),
    a.edge(SC.couplerIntent, H.busCoupler, "NAVIGATES_TO"),
    a.edge(SC.capBankIntent, ST.measQuality, "READS"),
    a.edge(SC.capBankIntent, ST.powerFactor, "READS"),
    a.edge(SC.capBankIntent, ST.capBankStepIntent, "WRITES"),
    a.edge(SC.watchdog, ST.gwALink, "READS"),
    a.edge(SC.watchdog, ST.gwBLink, "READS"),
    a.edge(SC.watchdog, ST.telemetryAge, "READS"),
    a.edge(SC.watchdog, ST.timeSyncOk, "READS"),
    a.edge(SC.watchdog, ST.telemetryStale, "WRITES"),
    a.edge(SC.alarmAck, ST.ackCmd, "WRITES"),
    a.edge(SC.alarmAck, H.alarms, "NAVIGATES_TO"),

    /* Governance — declared authorisation and audit trail */
    a.edge(SC.couplerIntent, R.supervisor, "REQUIRES_ROLE"),
    a.edge(SC.couplerIntent, AE.couplerIntent, "EMITS"),
    a.edge(SC.capBankIntent, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.capBankIntent, AE.capBankIntent, "EMITS"),
    a.edge(SC.alarmAck, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.alarmAck, AE.alarmAck, "EMITS"),
    // No REQUIRES_ROLE: nothing human invokes the watchdog. It still emits.
    a.edge(SC.watchdog, AE.watchdog, "EMITS"),

    /* Historian and KPI */
    a.edge(EV.electricalTrend, T.incomerACurrent, "RECORDS"),
    a.edge(EV.electricalTrend, T.busAVoltage, "RECORDS"),
    a.edge(EV.electricalTrend, T.activePower, "RECORDS"),
    a.edge(EV.electricalTrend, T.reactivePower, "RECORDS"),
    a.edge(EV.electricalTrend, T.energyImport, "RECORDS"),
    a.edge(EV.transformerTrend, T.t1WindingTemp, "RECORDS"),
    a.edge(EV.transformerTrend, T.t1OilTemp, "RECORDS"),
    a.edge(EV.transformerTrend, T.t1CoolingRunning, "RECORDS"),
    a.edge(EV.transformerTrend, T.t2WindingTemp, "RECORDS"),
    a.edge(EV.soeRecord, T.cbIncomerAClosed, "RECORDS"),
    a.edge(EV.soeRecord, T.cbIncomerAOpen, "RECORDS"),
    a.edge(EV.soeRecord, T.cbFeederF3Closed, "RECORDS"),
    a.edge(EV.soeRecord, T.timeSyncOffset, "RECORDS"),
    a.edge(EV.commsLinkLog, T.gwALink, "RECORDS"),
    a.edge(EV.commsLinkLog, T.gwBLink, "RECORDS"),
    a.edge(EV.commsLinkLog, T.telemetryAge, "RECORDS"),
    a.edge(EV.auditLog, T.stationMode, "RECORDS"),
    a.edge(EV.powerQualityTrend, T.thdVoltage, "RECORDS"),
    a.edge(EV.powerQualityTrend, T.powerFactor, "RECORDS"),
    a.edge(EV.powerQualityTrend, T.frequency, "RECORDS"),
    a.edge(EV.dcSystemTrend, T.dcBusVoltage, "RECORDS"),
    a.edge(EV.dcSystemTrend, T.chargerHealthy, "RECORDS"),
    a.edge(K.availability, T.cbIncomerAClosed, "DERIVED_FROM"),
    a.edge(K.availability, T.busAVoltage, "DERIVED_FROM"),
    a.edge(K.peakDemand, T.activePower, "DERIVED_FROM"),
    a.edge(K.powerFactor, T.powerFactor, "DERIVED_FROM"),
    a.edge(K.powerFactor, T.activePower, "DERIVED_FROM"),
    a.edge(K.powerFactor, T.reactivePower, "DERIVED_FROM"),
    a.edge(K.energyImport, T.energyImport, "DERIVED_FROM"),
    a.edge(K.interruption, T.busAVoltage, "DERIVED_FROM"),
    a.edge(K.interruption, T.cbFeederF3Closed, "DERIVED_FROM"),

    /* Fault modes — what each one explains and what is evidence for it */
    a.edge(FM.vtCircuit, AL.measQuality, "EXPLAINS"),
    a.edge(T.vtHealthy, FM.vtCircuit, "EVIDENCE_FOR"),
    a.edge(T.measQuality, FM.vtCircuit, "EVIDENCE_FOR"),
    a.edge(T.busAVoltage, FM.vtCircuit, "EVIDENCE_FOR"),
    a.edge(IO.busAVt, FM.vtCircuit, "EVIDENCE_FOR"),
    a.edge(EV.powerQualityTrend, FM.vtCircuit, "EVIDENCE_FOR"),

    a.edge(FM.t1Cooling, AL.t1TempHigh, "EXPLAINS"),
    a.edge(T.t1WindingTemp, FM.t1Cooling, "EVIDENCE_FOR"),
    a.edge(T.t1OilTemp, FM.t1Cooling, "EVIDENCE_FOR"),
    a.edge(T.t1CoolingRunning, FM.t1Cooling, "EVIDENCE_FOR"),
    a.edge(EV.transformerTrend, FM.t1Cooling, "EVIDENCE_FOR"),

    a.edge(FM.cbDiscrepancy, AL.cbDiscrepancy, "EXPLAINS"),
    a.edge(T.cbIncomerAClosed, FM.cbDiscrepancy, "EVIDENCE_FOR"),
    a.edge(T.cbIncomerAOpen, FM.cbDiscrepancy, "EVIDENCE_FOR"),
    a.edge(IO.cb52a, FM.cbDiscrepancy, "EVIDENCE_FOR"),
    a.edge(EV.soeRecord, FM.cbDiscrepancy, "EVIDENCE_FOR"),

    a.edge(FM.commsLoss, AL.commsStale, "EXPLAINS"),
    a.edge(FM.commsLoss, AL.timeSyncLost, "EXPLAINS"),
    a.edge(T.gwALink, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(T.gwBLink, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(T.telemetryAge, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(T.timeSyncOk, FM.commsLoss, "EVIDENCE_FOR"),
    a.edge(EV.commsLinkLog, FM.commsLoss, "EVIDENCE_FOR"),

    a.edge(FM.couplerBlocked, AL.couplerBlocked, "EXPLAINS"),
    a.edge(I.busCoupler, FM.couplerBlocked, "EVIDENCE_FOR"),
    a.edge(T.synchrocheck, FM.couplerBlocked, "EVIDENCE_FOR"),
    a.edge(T.couplerInterlockOk, FM.couplerBlocked, "EVIDENCE_FOR"),
    a.edge(T.busBVoltage, FM.couplerBlocked, "EVIDENCE_FOR"),
    a.edge(EV.soeRecord, FM.couplerBlocked, "EVIDENCE_FOR"),

    a.edge(FM.f3EarthFault, AL.f3ProtectionTrip, "EXPLAINS"),
    a.edge(I.feederProtection, FM.f3EarthFault, "EVIDENCE_FOR"),
    a.edge(T.f3EarthFaultTrip, FM.f3EarthFault, "EVIDENCE_FOR"),
    a.edge(T.cbFeederF3Closed, FM.f3EarthFault, "EVIDENCE_FOR"),
    a.edge(EV.soeRecord, FM.f3EarthFault, "EVIDENCE_FOR"),

    a.edge(FM.dcDegradation, AL.dcDegraded, "EXPLAINS"),
    a.edge(T.dcBusVoltage, FM.dcDegradation, "EVIDENCE_FOR"),
    a.edge(T.chargerHealthy, FM.dcDegradation, "EVIDENCE_FOR"),
    a.edge(T.upsOnBattery, FM.dcDegradation, "EVIDENCE_FOR"),
    a.edge(EV.dcSystemTrend, FM.dcDegradation, "EVIDENCE_FOR"),

    a.edge(FM.leftInLocal, AL.stationInLocal, "EXPLAINS"),
    a.edge(T.stationMode, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(P.stationRemote, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(EV.auditLog, FM.leftInLocal, "EVIDENCE_FOR"),

    /* Safe actions */
    a.edge(SA.vtCircuit, FM.vtCircuit, "VERIFIES"),
    a.edge(SA.transformerCooling, FM.t1Cooling, "VERIFIES"),
    a.edge(SA.breakerMechanism, FM.cbDiscrepancy, "VERIFIES"),
    a.edge(SA.gatewaySessions, FM.commsLoss, "VERIFIES"),
    a.edge(SA.couplerReview, FM.couplerBlocked, "VERIFIES"),
    a.edge(SA.feederReview, FM.f3EarthFault, "VERIFIES"),
    a.edge(SA.dcSystem, FM.dcDegradation, "VERIFIES"),
    a.edge(SA.auditReview, FM.leftInLocal, "VERIFIES"),
  ],

  artifacts: [
    {
      local: "SupervisoryScripts",
      language: "JAVASCRIPT",
      layer: "SCADA",
      fileName: "SupervisoryScripts.js",
      declares: [SC.couplerIntent, SC.capBankIntent, SC.watchdog, SC.alarmAck],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "SCRIPTS/Substation",
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
        H.incomers,
        H.transformer,
        H.busCoupler,
        H.feeders,
        H.stationDc,
        H.alarms,
        HO.commsHealth,
        HO.timeSyncHealth,
        HO.activePower,
        HO.cbIncomerA,
        HO.measQuality,
        HO.t1WindingTemp,
        HO.t1Buchholz,
        HO.busCoupler,
        HO.f3Protection,
        HO.capBankStep,
        HO.dcBusVoltage,
        HO.upsOnBattery,
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
        D.soeRecorder,
        D.timeServer,
        D.relayIncomerA,
        D.relayT1,
        D.relayF3,
        AQ,
        EV.electricalTrend,
        EV.soeRecord,
        EV.commsLinkLog,
        EV.auditLog,
      ],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "CONFIG/Substation",
        domain: "SUPERVISORY",
        safetyClass: "NON_SAFETY",
      },
      content: SUPERVISORY_CONFIG,
    },
  ],

  scenarios: [
    {
      id: "SCADA-04-FS-01",
      title: t("Busbar A voltage collapsed on the screens only", "افت ولتاژ باسبار A فقط روی صفحه‌ها"),
      narrative: t(
        "Busbar A shows a collapsed voltage on every supervisory screen while the load on the busbar is unchanged and nothing tripped. The bay controller is flagging its measurements as bad quality.",
        "باسبار A روی همهٔ صفحه‌های نظارتی ولتاژ افتاده نشان می‌دهد، در حالی که بار روی باسبار تغییری نکرده و هیچ‌چیز تریپ نکرده است. کنترلر بی، اندازه‌گیری‌های خود را با کیفیت نامطلوب علامت می‌زند.",
      ),
      observations: [
        { nodeId: AL.measQuality, state: "TRUE" },
        { nodeId: T.busAVoltage, state: "ABNORMAL", detail: "one phase reading near zero with load unchanged" },
        { nodeId: T.vtHealthy, state: "FALSE", detail: "fuse-failure supervision picked up" },
        { nodeId: T.measQuality, state: "FALSE" },
        { nodeId: T.incomerACurrent, state: "NORMAL" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "SENSOR_FAILURE",
        faultModeId: FM.vtCircuit,
        supportingNodeIds: [T.vtHealthy, T.measQuality, T.busAVoltage, AL.measQuality],
        expectedMissingNodeIds: [IO.busAVt, EV.powerQualityTrend],
        expectedSafeActionIds: [SA.vtCircuit],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-04-FS-02",
      title: t("Transformer T1 running hot through the afternoon", "داغ شدن ترانسفورماتور T1 در طول بعدازظهر"),
      narrative: t(
        "T1 winding temperature has climbed past the alarm limit while the load has been steady. The top-oil temperature is climbing with it and the cooling group is not reported running. Transformer protection has not operated.",
        "دمای سیم‌پیچ T1 با وجود ثابت بودن بار از حد آلارم گذشته است. دمای روغن بالا نیز همراه آن بالا می‌رود و گروه خنک‌کننده در حال کار گزارش نمی‌شود. حفاظت ترانسفورماتور عمل نکرده است.",
      ),
      observations: [
        { nodeId: AL.t1TempHigh, state: "TRUE" },
        { nodeId: T.t1WindingTemp, state: "ABNORMAL", detail: "past the alarm limit on a steady load" },
        { nodeId: T.t1OilTemp, state: "ABNORMAL", detail: "rising with the winding temperature" },
        { nodeId: T.t1CoolingRunning, state: "FALSE", detail: "cooling group not reported running" },
        { nodeId: T.t1Buchholz, state: "NORMAL" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.t1Cooling,
        supportingNodeIds: [T.t1WindingTemp, T.t1OilTemp, T.t1CoolingRunning, AL.t1TempHigh],
        expectedMissingNodeIds: [EV.transformerTrend],
        expectedSafeActionIds: [SA.transformerCooling],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-04-FS-03",
      title: t("Incomer A breaker reports closed and open together", "کلید ورودی A هم‌زمان وصل و قطع گزارش می‌کند"),
      narrative: t(
        "Both auxiliary contacts of the incomer A breaker are reporting made at the same time, which no healthy breaker does. An operator switching request was recorded shortly before it, and the breaker has shown the same pair ever since.",
        "هر دو کنتاکت کمکی کلید ورودی A هم‌زمان بسته گزارش می‌شوند، چیزی که هیچ کلید سالمی انجام نمی‌دهد. اندکی پیش از آن، یک درخواست کلیدزنی اپراتوری ثبت شده و کلید از آن زمان همین جفت را نشان می‌دهد.",
      ),
      observations: [
        { nodeId: AL.cbDiscrepancy, state: "TRUE" },
        { nodeId: T.cbIncomerAClosed, state: "ABNORMAL", detail: "52a made" },
        { nodeId: T.cbIncomerAOpen, state: "ABNORMAL", detail: "52b made at the same time" },
        { nodeId: T.tripCircuitHealthy, state: "NORMAL" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "ACTUATOR_FAILURE",
        faultModeId: FM.cbDiscrepancy,
        supportingNodeIds: [T.cbIncomerAClosed, T.cbIncomerAOpen, AL.cbDiscrepancy],
        expectedMissingNodeIds: [IO.cb52a, EV.soeRecord],
        expectedSafeActionIds: [SA.breakerMechanism],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-04-FS-04",
      title: t("The whole station picture froze at once", "کل تصویر پست هم‌زمان منجمد شد"),
      narrative: t(
        "Every value from the station stopped updating in the same second, on both gateway paths, and the event timestamps stopped advancing with them. The last readings before the freeze were all normal — which says nothing about what the network is doing now.",
        "همهٔ مقادیر پست در یک ثانیهٔ واحد و روی هر دو مسیر دروازه از به‌روزرسانی بازماندند و زمان‌مهر رویدادها نیز همراه آن‌ها متوقف شد. آخرین قرائت‌ها پیش از انجماد همگی عادی بودند — که چیزی دربارهٔ وضعیت کنونی شبکه نمی‌گوید.",
      ),
      observations: [
        { nodeId: AL.commsStale, state: "TRUE" },
        { nodeId: AL.timeSyncLost, state: "TRUE" },
        { nodeId: T.gwALink, state: "FALSE", detail: "path A down" },
        { nodeId: T.gwBLink, state: "FALSE", detail: "path B down in the same second" },
        { nodeId: T.telemetryAge, state: "ABNORMAL", detail: "310 s and rising" },
        { nodeId: ST.busAVoltage, state: "STALE" },
        { nodeId: ST.cbIncomerAClosed, state: "STALE" },
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
      id: "SCADA-04-FS-05",
      title: t("Bus coupler will not close for the transfer", "کوپلر باسبار برای انتقال وصل نمی‌شود"),
      narrative: t(
        "The planned busbar transfer stops at the synchronism check. The coupler interlock is active, the synchrocheck is not permitting, and busbar B voltage is outside the band the check requires.",
        "انتقال برنامه‌ریزی‌شدهٔ باسبار در مرحلهٔ بررسی هم‌زمانی متوقف می‌شود. اینترلاک کوپلر فعال است، سنکروچک اجازه نمی‌دهد و ولتاژ باسبار B بیرون از باند مورد نیاز بررسی قرار دارد.",
      ),
      observations: [
        { nodeId: AL.couplerBlocked, state: "TRUE" },
        { nodeId: I.busCoupler, state: "TRUE" },
        { nodeId: T.synchrocheck, state: "FALSE" },
        { nodeId: T.couplerInterlockOk, state: "FALSE" },
        { nodeId: T.busBVoltage, state: "ABNORMAL", detail: "outside the synchrocheck voltage band" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "SAFETY_CIRCUIT",
        faultClass: "INTERLOCK_ACTIVE",
        faultModeId: FM.couplerBlocked,
        supportingNodeIds: [I.busCoupler, T.synchrocheck, T.couplerInterlockOk, T.busBVoltage, AL.couplerBlocked],
        expectedMissingNodeIds: [EV.soeRecord],
        expectedSafeActionIds: [SA.couplerReview],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-04-FS-06",
      title: t("Feeder F3 tripped on earth fault", "تریپ فیدر F3 روی اتصال زمین"),
      narrative: t(
        "Feeder F3 tripped and its breaker is open. The earth-fault element operated and the overcurrent element did not, and the busbar behind the feeder held its voltage throughout.",
        "فیدر F3 تریپ کرد و کلید آن قطع است. المان اتصال زمین عمل کرد و المان اضافه‌جریان عمل نکرد، و باسبار پشت فیدر در تمام مدت ولتاژ خود را حفظ کرد.",
      ),
      observations: [
        { nodeId: AL.f3ProtectionTrip, state: "TRUE" },
        { nodeId: I.feederProtection, state: "TRUE" },
        { nodeId: T.f3EarthFaultTrip, state: "TRUE", detail: "earth-fault element operated" },
        { nodeId: T.cbFeederF3Closed, state: "FALSE", detail: "breaker open after the trip" },
        { nodeId: T.busAVoltage, state: "NORMAL" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "UPSTREAM_DOWNSTREAM",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.f3EarthFault,
        supportingNodeIds: [T.f3EarthFaultTrip, I.feederProtection, T.cbFeederF3Closed, AL.f3ProtectionTrip],
        expectedMissingNodeIds: [EV.soeRecord],
        expectedSafeActionIds: [SA.feederReview],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-04-FS-07",
      title: t("Station DC bus drifting down with the UPS on battery", "افت تدریجی باس DC پست و کارکرد UPS روی باتری"),
      narrative: t(
        "The station DC bus voltage has been drifting down since the morning, the charger is not reporting healthy, and the UPS has transferred to battery. Every trip circuit in the station is fed from this supply.",
        "ولتاژ باس DC پست از صبح به‌آرامی افت می‌کند، شارژر سلامت گزارش نمی‌کند و UPS به باتری منتقل شده است. هر مدار تریپ در این پست از همین تغذیه تأمین می‌شود.",
      ),
      observations: [
        { nodeId: AL.dcDegraded, state: "TRUE" },
        { nodeId: T.dcBusVoltage, state: "ABNORMAL", detail: "drifting down since the morning" },
        { nodeId: T.chargerHealthy, state: "FALSE" },
        { nodeId: T.upsOnBattery, state: "TRUE" },
        { nodeId: T.batteryEarthFault, state: "NORMAL" },
        { nodeId: T.gwALink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.dcDegradation,
        supportingNodeIds: [T.dcBusVoltage, T.chargerHealthy, T.upsOnBattery, AL.dcDegraded],
        expectedMissingNodeIds: [EV.dcSystemTrend],
        expectedSafeActionIds: [SA.dcSystem],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-04-FS-08",
      title: t("Station ignores remote operation after maintenance", "بی‌پاسخ ماندن بهره‌برداری از راه دور پس از تعمیرات"),
      narrative: t(
        "After overnight maintenance the station does not answer from the control room. Nothing reports a fault, both gateway paths are healthy, and the remote permissive refuses to come in.",
        "پس از تعمیرات شبانه، پست از اتاق کنترل پاسخ نمی‌دهد. هیچ‌چیز خطا گزارش نمی‌کند، هر دو مسیر دروازه سالم‌اند و مجوز حالت دور برقرار نمی‌شود.",
      ),
      observations: [
        { nodeId: AL.stationInLocal, state: "TRUE" },
        { nodeId: T.stationMode, state: "ABNORMAL", detail: "selector found in LOCAL at the station panel" },
        { nodeId: P.stationRemote, state: "FALSE" },
        { nodeId: T.gwALink, state: "NORMAL" },
        { nodeId: T.gwBLink, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "HMI",
        faultClass: "INCORRECT_MODE",
        faultModeId: FM.leftInLocal,
        supportingNodeIds: [T.stationMode, P.stationRemote, AL.stationInLocal],
        expectedMissingNodeIds: [EV.auditLog],
        expectedSafeActionIds: [SA.auditReview],
        requiresEscalation: false,
      },
    },
  ],
};
