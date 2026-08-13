// PHASE 101 — SCADA-03: petrochemical compression and fractionation train
// supervisory system.
//
// ORIGIN
// Original synthetic engineering reference authored for this repository. It
// contains no customer, proprietary or licensed vendor project material, and it
// is deliberately written in vendor-neutral terms: the supervisory scripting is
// the accessor idiom every web-based SCADA platform of this class shares, the
// screen definition is a plain declarative description, and the redundant
// OPC UA aggregation layer is described by role, not by product.
//
// WHAT THIS REFERENCE EXERCISES THAT SCADA-01 AND SCADA-02 DO NOT
//   - REDUNDANT CONNECTIVITY, not only a redundant server pair: two OPC UA
//     gateways carry the same controllers, so the corpus can distinguish "one
//     path degraded" from "the picture is gone" — and the communication-loss
//     scenario needs BOTH sessions down before the plant disappears.
//   - A rotating-machinery protection surround: anti-surge margin and recycle
//     valve, lube-oil and seal-gas auxiliaries, inter-stage cooling. These are
//     machine-protection objects with their own failure families — a valve
//     that stops following its demand is neither a sensor nor a drive fault.
//   - An ESD / flare interface authored as a MONITORED SAFETY BOUNDARY ONLY.
//     The emergency-shutdown system and the flare header appear so that a
//     diagnosis can see them and escalate; no screen declares a command onto
//     them, no script writes toward them, and nothing in Hermes can reset,
//     inhibit, bypass or simulate them. They are SAFETY_CRITICAL and therefore
//     review-only wherever they surface.
//
// GOVERNANCE
// Same contract as SCADA-01/02: every operator-invokable script declares the
// role it demands and the audit event class its invocation emits; the automatic
// OPC UA watchdog declares an audit class and no role. These are DECLARATIONS
// of the design. Hermes grants no role, issues no command and writes no audit
// record — it has no runtime, no session and no write path to any device, and
// a `COMMANDS` edge is a statement that a screen declares a command, never one
// this system can send.

import type { AuthoredReferenceSystem } from "../types";
import { authoring, chainStates, t } from "./_authoring";

const a = authoring({
  projectId: "SCADA-03",
  subsystem: "SUPERVISORY_CORE",
  domain: "SUPERVISORY",
});

/* ── Identifiers ──────────────────────────────────────────────────────────── */

const D = {
  primary: a.id("DEVICE", "SCADA_SERVER_PRIMARY"),
  standby: a.id("DEVICE", "SCADA_SERVER_STANDBY"),
  historian: a.id("DEVICE", "HISTORIAN_PCT"),
  gwA: a.id("DEVICE", "OPCUA_GATEWAY_A"),
  gwB: a.id("DEVICE", "OPCUA_GATEWAY_B"),
  plcTrain: a.id("DEVICE", "PLC_TRAIN"),
  plcColumn: a.id("DEVICE", "PLC_COLUMN"),
  compDrive: a.id("DEVICE", "COMP_MAIN_DRIVE"),
  opClient: a.id("DEVICE", "OPERATOR_CLIENT_PCT"),
  esd: a.id("DEVICE", "ESD_SYSTEM"),
};

const EQ = {
  separator: a.id("EQUIPMENT", "FEED_SEPARATOR"),
  compressor: a.id("EQUIPMENT", "PG_COMPRESSOR"),
  recycleValve: a.id("EQUIPMENT", "ANTISURGE_RECYCLE_VALVE"),
  lubeOil: a.id("EQUIPMENT", "LUBE_OIL_SYSTEM"),
  sealGas: a.id("EQUIPMENT", "SEAL_GAS_SYSTEM"),
  cooler: a.id("EQUIPMENT", "INTERSTAGE_COOLER"),
  column: a.id("EQUIPMENT", "FRACTIONATION_COLUMN"),
  flare: a.id("EQUIPMENT", "FLARE_HEADER"),
};

/** The controller-side process image, as the train and column PLCs hold it. */
const T = {
  sepLevel: a.id("TAG", "SEP_LEVEL"),
  feedFlow: a.id("TAG", "FEED_FLOW"),
  suctionPress: a.id("TAG", "SUCTION_PRESSURE"),
  dischargePress: a.id("TAG", "DISCHARGE_PRESSURE"),
  stage2Temp: a.id("TAG", "STAGE2_SUCTION_TEMP"),
  compSpeed: a.id("TAG", "COMP_SPEED"),
  compFault: a.id("TAG", "COMP_DRIVE_FAULT"),
  compVibration: a.id("TAG", "COMP_VIBRATION"),
  compPower: a.id("TAG", "COMP_MOTOR_POWER"),
  surgeMargin: a.id("TAG", "SURGE_MARGIN"),
  valvePos: a.id("TAG", "RECYCLE_VALVE_POS"),
  valveDemand: a.id("TAG", "RECYCLE_VALVE_DEMAND"),
  lubePress: a.id("TAG", "LUBE_OIL_PRESSURE"),
  lubeTemp: a.id("TAG", "LUBE_OIL_TEMP"),
  sealGasDp: a.id("TAG", "SEAL_GAS_DP"),
  trainMode: a.id("TAG", "TRAIN_MODE_REMOTE"),
  columnDp: a.id("TAG", "COLUMN_DP"),
  columnTopPress: a.id("TAG", "COLUMN_TOP_PRESSURE"),
  esdTrip: a.id("TAG", "ESD_TRIP_ACTIVE"),
  flarePress: a.id("TAG", "FLARE_HEADER_PRESSURE"),
  opcASession: a.id("TAG", "OPCUA_A_SESSION_OK"),
  opcBSession: a.id("TAG", "OPCUA_B_SESSION_OK"),
  opcDataAge: a.id("TAG", "OPCUA_DATA_AGE"),
};

/** The supervisory tag database. Named as an operator would see it. */
const ST = {
  sepLevel: a.id("SCADA_TAG", "PCT_Sep_Level"),
  feedFlow: a.id("SCADA_TAG", "PCT_Feed_Flow"),
  compSpeed: a.id("SCADA_TAG", "PCT_Comp_Speed"),
  compFault: a.id("SCADA_TAG", "PCT_Comp_Drive_Fault"),
  surgeMargin: a.id("SCADA_TAG", "PCT_Surge_Margin"),
  valvePos: a.id("SCADA_TAG", "PCT_Recycle_Valve_Pos"),
  lubePress: a.id("SCADA_TAG", "PCT_Lube_Oil_Press"),
  columnDp: a.id("SCADA_TAG", "PCT_Column_DP"),
  trainMode: a.id("SCADA_TAG", "PCT_Train_Mode"),
  opcASession: a.id("SCADA_TAG", "PCT_OpcUa_A_Session_Ok"),
  opcBSession: a.id("SCADA_TAG", "PCT_OpcUa_B_Session_Ok"),
  opcDataAge: a.id("SCADA_TAG", "PCT_OpcUa_Data_Age"),
  esdTrip: a.id("SCADA_TAG", "PCT_Esd_Trip_Active"),
  flarePress: a.id("SCADA_TAG", "PCT_Flare_Header_Press"),
  telemetryStale: a.id("SCADA_TAG", "PCT_Telemetry_Stale"),
  trainStartCmd: a.id("SCADA_TAG", "PCT_Train_Start_Cmd"),
  columnTrimCmd: a.id("SCADA_TAG", "PCT_Column_Sp_Trim_Cmd"),
  ackCmd: a.id("SCADA_TAG", "PCT_Alarm_Ack_Cmd"),
};

const IO = {
  sepLevel: a.id("IO_POINT", "AI_SEP_LEVEL"),
  suction: a.id("IO_POINT", "AI_SUCTION_PRESSURE"),
  lubePress: a.id("IO_POINT", "AI_LUBE_OIL_PRESSURE"),
  flarePress: a.id("IO_POINT", "AI_FLARE_HEADER_PRESSURE"),
  valveDemand: a.id("IO_POINT", "AO_RECYCLE_VALVE"),
  vibration: a.id("IO_POINT", "AI_COMP_VIBRATION"),
};

const SQ = a.id("SEQUENCE", "TRAIN_STARTUP");
const S = {
  idle: a.id("STATE", "C00_IDLE"),
  check: a.id("STATE", "C10_PERMISSIVE_CHECK"),
  purge: a.id("STATE", "C20_PURGE_AND_PRESSURIZE"),
  loading: a.id("STATE", "C30_LOADING"),
  online: a.id("STATE", "C40_ONLINE"),
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
  opcFresh: a.id("PERMISSIVE", "PRM_OPCUA_FRESH"),
  trainRemote: a.id("PERMISSIVE", "PRM_TRAIN_REMOTE"),
  lubeOk: a.id("PERMISSIVE", "PRM_LUBE_OIL_OK"),
  sealGasOk: a.id("PERMISSIVE", "PRM_SEAL_GAS_OK"),
};

const I = {
  esdTrip: a.id("INTERLOCK", "ILK_ESD_TRIP"),
  surge: a.id("INTERLOCK", "ILK_SURGE_PROTECTION"),
  lubeLow: a.id("INTERLOCK", "ILK_LUBE_OIL_LOW"),
};

const AL = {
  sepLevel: a.id("ALARM", "ALM_SEP_LEVEL_HIGH"),
  compTrip: a.id("ALARM", "ALM_COMP_DRIVE_TRIP"),
  surgeLow: a.id("ALARM", "ALM_SURGE_MARGIN_LOW"),
  opcStale: a.id("ALARM", "ALM_OPCUA_STALE"),
  esdTrip: a.id("ALARM", "ALM_ESD_TRIP"),
  trainNotReady: a.id("ALARM", "ALM_TRAIN_NOT_READY"),
  lubeLow: a.id("ALARM", "ALM_LUBE_OIL_PRESS_LOW"),
};

const H = {
  overview: a.id("HMI_SCREEN", "Screen_TrainOverview"),
  compressor: a.id("HMI_SCREEN", "Screen_Compressor"),
  column: a.id("HMI_SCREEN", "Screen_Column"),
  safety: a.id("HMI_SCREEN", "Screen_SafetyBoundary"),
  alarms: a.id("HMI_SCREEN", "Screen_Alarms"),
};

const HO = {
  opcHealth: a.id("HMI_OBJECT", "Ind_OpcUaHealth"),
  feedFlow: a.id("HMI_OBJECT", "Trend_FeedFlow"),
  compressor: a.id("HMI_OBJECT", "Fp_Compressor"),
  lubeOil: a.id("HMI_OBJECT", "Trend_LubeOil"),
  recycleValve: a.id("HMI_OBJECT", "Trend_RecycleValve"),
  columnDp: a.id("HMI_OBJECT", "Trend_ColumnDp"),
  columnTrim: a.id("HMI_OBJECT", "Btn_ColumnTrim"),
  esdStatus: a.id("HMI_OBJECT", "Ind_EsdStatus"),
  flareHeader: a.id("HMI_OBJECT", "Trend_FlareHeader"),
  alarmBanner: a.id("HMI_OBJECT", "Banner_ActiveAlarms"),
};

const SC = {
  trainStart: a.id("SCRIPT", "OnTrainStartRequest"),
  columnTrim: a.id("SCRIPT", "OnColumnTrimRequest"),
  watchdog: a.id("SCRIPT", "OnOpcUaWatchdog"),
  alarmAck: a.id("SCRIPT", "OnAlarmAcknowledge"),
};

const R = {
  operator: a.id("ROLE", "Role_TrainOperator"),
  supervisor: a.id("ROLE", "Role_TrainSupervisor"),
};

const AE = {
  trainStart: a.id("AUDIT_EVENT_TYPE", "Audit_TrainStartCommanded"),
  columnTrim: a.id("AUDIT_EVENT_TYPE", "Audit_ColumnTrimCommanded"),
  alarmAck: a.id("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged"),
  watchdog: a.id("AUDIT_EVENT_TYPE", "Audit_OpcUaWatchdogRecord"),
};

const K = {
  oee: a.id("KPI", "KPI_OEE"),
  throughput: a.id("KPI", "KPI_THROUGHPUT"),
  specificEnergy: a.id("KPI", "KPI_SPECIFIC_COMPRESSION_ENERGY"),
  availability: a.id("KPI", "KPI_TRAIN_AVAILABILITY"),
};

const EV = {
  processTrend: a.id("EVIDENCE_SOURCE", "HIST_PROCESS_TREND"),
  machineTrend: a.id("EVIDENCE_SOURCE", "HIST_MACHINE_TREND"),
  opcLinkLog: a.id("EVIDENCE_SOURCE", "HIST_OPCUA_LINK_LOG"),
  esdEventLog: a.id("EVIDENCE_SOURCE", "HIST_ESD_EVENT_LOG"),
  auditLog: a.id("EVIDENCE_SOURCE", "HIST_TRAIN_AUDIT_LOG"),
};

const FM = {
  levelDrift: a.id("FAULT_MODE", "FM_SEP_LEVEL_TX_DRIFT"),
  compTrip: a.id("FAULT_MODE", "FM_COMP_DRIVE_TRIP"),
  valveStuck: a.id("FAULT_MODE", "FM_RECYCLE_VALVE_STUCK"),
  opcLoss: a.id("FAULT_MODE", "FM_OPCUA_REDUNDANCY_LOSS"),
  esdBoundary: a.id("FAULT_MODE", "FM_ESD_BOUNDARY_TRIP"),
  leftInLocal: a.id("FAULT_MODE", "FM_TRAIN_LEFT_IN_LOCAL"),
  lubeDecay: a.id("FAULT_MODE", "FM_LUBE_OIL_DEGRADATION"),
};

const SA = {
  levelCompare: a.id("SAFE_ACTION", "SA_COMPARE_SEP_LEVEL_TO_GAUGE"),
  driveHistory: a.id("SAFE_ACTION", "SA_READ_COMP_DRIVE_HISTORY"),
  valveInspect: a.id("SAFE_ACTION", "SA_INSPECT_RECYCLE_VALVE_ACTUATOR"),
  opcVerify: a.id("SAFE_ACTION", "SA_VERIFY_OPCUA_GATEWAY_SESSIONS"),
  esdReview: a.id("SAFE_ACTION", "SA_ESCALATE_ESD_BOUNDARY_REVIEW"),
  auditReview: a.id("SAFE_ACTION", "SA_REVIEW_TRAIN_AUDIT_LOG"),
  lubeInspect: a.id("SAFE_ACTION", "SA_INSPECT_LUBE_OIL_SKID"),
};

/* ── Engineering source ───────────────────────────────────────────────────── */

const SUPERVISORY_SCRIPTS = `// SCADA-03 — supervisory scripting for the compression and fractionation train.
//
// Vendor-neutral accessor idiom: Tags("Name").Read() / .Write(value) and screen
// navigation. Nothing in this file is executed, transpiled or evaluated by
// Hermes; it is engineering text from which relationships are recovered.
// Nothing here reads from or writes toward the ESD system or the flare header:
// that boundary is monitored by the train PLC and displayed read-only.

function OnTrainStartRequest() {
   // Operator-initiated from the compressor faceplate. The permissive picture
   // is READ and reported to the operator; it is NOT re-evaluated here. The
   // train PLC owns the interlock decision, and a supervisory client that
   // second-guessed it would be a second, weaker source of truth.
   var opcOk = Tags("PCT_OpcUa_A_Session_Ok").Read();
   var remote = Tags("PCT_Train_Mode").Read();
   var lube = Tags("PCT_Lube_Oil_Press").Read();

   if (opcOk && remote && lube > 1.2) {
      Tags("PCT_Train_Start_Cmd").Write(1);
   }

   Navigate("Screen_Compressor");
}

function OnColumnTrimRequest() {
   // Column differential-pressure setpoint trim, reserved for the shift
   // supervisor. The current value is read and shown before the trim is
   // offered, and the trim itself is bounded by the column controller —
   // never by this script.
   var dp = Tags("PCT_Column_DP").Read();

   if (dp > 0) {
      Tags("PCT_Column_Sp_Trim_Cmd").Write(1);
   }
}

function OnOpcUaWatchdog() {
   // Runs on the supervisory server's own schedule. There is no operator
   // behind it, so it declares no role. Both redundant sessions are read: the
   // picture is stale only when NEITHER path is fresh, and that judgement is
   // published as its own tag rather than inferred by each screen.
   var sessionA = Tags("PCT_OpcUa_A_Session_Ok").Read();
   var sessionB = Tags("PCT_OpcUa_B_Session_Ok").Read();
   var age = Tags("PCT_OpcUa_Data_Age").Read();

   if ((!sessionA && !sessionB) || age > 30) {
      Tags("PCT_Telemetry_Stale").Write(1);
   }
}

function OnAlarmAcknowledge() {
   // ISA-18.2 acknowledgement: it moves an alarm from Unacknowledged to
   // Acknowledged and records that a human saw it. It changes no plant state
   // and never clears the condition that raised the alarm.
   Tags("PCT_Alarm_Ack_Cmd").Write(1);
   Navigate("Screen_Alarms");
}
`;

const OPERATOR_SCREENS = `{
  "screens": [
    {
      "name": "Screen_TrainOverview",
      "titleEn": "Compression train overview",
      "titleFa": "نمای کلی قطار تراکم",
      "navigatesTo": ["Screen_Compressor", "Screen_Column", "Screen_SafetyBoundary", "Screen_Alarms"],
      "objects": [
        {
          "name": "Ind_OpcUaHealth",
          "type": "INDICATOR",
          "displays": ["PCT_OpcUa_A_Session_Ok", "PCT_OpcUa_B_Session_Ok"]
        },
        {
          "name": "Trend_FeedFlow",
          "type": "TREND",
          "displays": ["PCT_Feed_Flow"]
        }
      ]
    },
    {
      "name": "Screen_Compressor",
      "titleEn": "Process-gas compressor",
      "titleFa": "کمپرسور گاز فرایندی",
      "navigatesTo": ["Screen_TrainOverview"],
      "objects": [
        {
          "name": "Fp_Compressor",
          "type": "FACEPLATE",
          "displays": ["PCT_Comp_Drive_Fault", "PCT_Comp_Speed", "PCT_Surge_Margin"],
          "commands": ["PCT_Train_Start_Cmd"],
          "permission": "TRAIN_COMMAND",
          "requiresConfirmation": true
        },
        {
          "name": "Trend_LubeOil",
          "type": "TREND",
          "displays": ["PCT_Lube_Oil_Press"]
        },
        {
          "name": "Trend_RecycleValve",
          "type": "TREND",
          "displays": ["PCT_Recycle_Valve_Pos"]
        }
      ]
    },
    {
      "name": "Screen_Column",
      "titleEn": "Fractionation column",
      "titleFa": "برج تفکیک",
      "navigatesTo": ["Screen_TrainOverview"],
      "objects": [
        {
          "name": "Trend_ColumnDp",
          "type": "TREND",
          "displays": ["PCT_Column_DP"]
        },
        {
          "name": "Btn_ColumnTrim",
          "type": "BUTTON",
          "commands": ["PCT_Column_Sp_Trim_Cmd"],
          "permission": "COLUMN_TRIM",
          "requiresConfirmation": true
        }
      ]
    },
    {
      "name": "Screen_SafetyBoundary",
      "titleEn": "ESD and flare boundary (monitored only)",
      "titleFa": "مرز ESD و فلر (صرفاً پایش)",
      "navigatesTo": ["Screen_TrainOverview"],
      "objects": [
        {
          "name": "Ind_EsdStatus",
          "type": "INDICATOR",
          "displays": ["PCT_Esd_Trip_Active"]
        },
        {
          "name": "Trend_FlareHeader",
          "type": "TREND",
          "displays": ["PCT_Flare_Header_Press"]
        }
      ]
    },
    {
      "name": "Screen_Alarms",
      "titleEn": "Active alarms",
      "titleFa": "آلارم‌های فعال",
      "navigatesTo": ["Screen_TrainOverview"],
      "objects": [
        {
          "name": "Banner_ActiveAlarms",
          "type": "ALARM_BANNER",
          "displays": ["PCT_Telemetry_Stale"],
          "commands": ["PCT_Alarm_Ack_Cmd"],
          "permission": "ALARM_ACK"
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
  "aggregation": {
    "gateways": [
      { "id": "OPCUA_GATEWAY_A", "role": "PRIMARY_PATH" },
      { "id": "OPCUA_GATEWAY_B", "role": "REDUNDANT_PATH" }
    ],
    "protocol": "OPC_UA",
    "endpoints": [
      { "controller": "PLC_TRAIN", "samplingMs": 250 },
      { "controller": "PLC_COLUMN", "samplingMs": 1000 }
    ],
    "staleAfterSeconds": 30
  },
  "historian": {
    "id": "HISTORIAN_PCT",
    "archives": [
      { "id": "HIST_PROCESS_TREND", "sampleSeconds": 5, "retentionDays": 400 },
      { "id": "HIST_MACHINE_TREND", "sampleSeconds": 1, "retentionDays": 180 },
      { "id": "HIST_OPCUA_LINK_LOG", "sampleSeconds": 10, "retentionDays": 180 },
      { "id": "HIST_ESD_EVENT_LOG", "sampleSeconds": 0, "retentionDays": 3650 },
      { "id": "HIST_TRAIN_AUDIT_LOG", "sampleSeconds": 0, "retentionDays": 1825 }
    ]
  },
  "esdInterface": {
    "mode": "MONITORED_ONLY",
    "commands": "NONE",
    "note": "The ESD system and flare header are read-only safety boundaries. No supervisory command, reset, inhibit or bypass path exists."
  },
  "alarmPhilosophy": {
    "standard": "ISA-18.2",
    "lifecycle": ["NORMAL", "UNACK_ALARM", "ACK_ALARM", "RTN_UNACK"],
    "acknowledgement": {
      "permission": "ALARM_ACK",
      "clearsCondition": false,
      "recordedAs": "Audit_AlarmAcknowledged"
    },
    "alarms": [
      { "code": "ALM_SEP_LEVEL_HIGH", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_COMP_DRIVE_TRIP", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_SURGE_MARGIN_LOW", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_OPCUA_STALE", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_ESD_TRIP", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_TRAIN_NOT_READY", "priority": "MEDIUM", "requiresAck": true },
      { "code": "ALM_LUBE_OIL_PRESS_LOW", "priority": "URGENT", "requiresAck": true }
    ]
  }
}
`;

/* ── System ───────────────────────────────────────────────────────────────── */

export const SCADA_03_PETROCHEMICAL: AuthoredReferenceSystem = {
  id: "SCADA-03",
  name: t(
    "Petrochemical compression and fractionation train supervisory system",
    "سامانهٔ نظارتی قطار تراکم و تفکیک پتروشیمی",
  ),
  domain: t(
    "Feed separation, multi-stage gas compression, anti-surge protection, fractionation and monitored ESD boundary",
    "جداسازی خوراک، تراکم چندمرحله‌ای گاز، حفاظت ضدسرج، تفکیک و مرز پایش‌شوندهٔ ESD",
  ),
  sourceType: "SCADA_REFERENCE",
  platform:
    "Vendor-neutral redundant supervisory platform: JavaScript scripting, declarative screens, dual OPC UA aggregation",
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
        "آماده‌به‌کار گرم. سرور اصلی را آینه می‌کند و طبق قرارداد اعلام‌شدهٔ جایگزینی، کار را بر عهده می‌گیرد؛ یک واقعیت طراحی، نه زمان اجرایی که این سامانه در آن شرکت کند.",
      ),
    }),
    a.node("DEVICE", "HISTORIAN_PCT", t("Train historian", "تاریخ‌نگار قطار تراکم"), {
      domain: "MAINTENANCE",
      attributes: {
        deviceCategory: "INDUSTRIAL_PC",
        networkZone: "SUPERVISORY",
        protocol: "HISTORIAN",
      },
    }),
    a.node("DEVICE", "OPCUA_GATEWAY_A", t("OPC UA gateway A (primary path)", "دروازهٔ OPC UA مسیر A (اصلی)"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "GATEWAY", networkZone: "DMZ", protocol: "OPC_UA" },
      description: t(
        "One of two redundant aggregation paths. Losing one path degrades redundancy; the picture freezes only when both sessions are gone.",
        "یکی از دو مسیر افزونهٔ تجمیع. از دست رفتن یک مسیر افزونگی را کاهش می‌دهد؛ تصویر تنها وقتی منجمد می‌شود که هر دو نشست از دست بروند.",
      ),
    }),
    a.node("DEVICE", "OPCUA_GATEWAY_B", t("OPC UA gateway B (redundant path)", "دروازهٔ OPC UA مسیر B (افزونه)"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "GATEWAY", networkZone: "DMZ", protocol: "OPC_UA" },
    }),
    a.node("DEVICE", "PLC_TRAIN", t("Compression train controller", "کنترلر قطار تراکم"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OPC_UA" },
    }),
    a.node("DEVICE", "PLC_COLUMN", t("Fractionation column controller", "کنترلر برج تفکیک"), {
      subsystem: "FRACTIONATION",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OPC_UA" },
    }),
    a.node("DEVICE", "COMP_MAIN_DRIVE", t("Compressor main drive", "درایو اصلی کمپرسور"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "DRIVES",
      attributes: { deviceCategory: "VFD", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "OPERATOR_CLIENT_PCT", t("Operator client", "کلاینت اپراتور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { deviceCategory: "HMI", networkZone: "SUPERVISORY" },
    }),
    a.node("DEVICE", "ESD_SYSTEM", t("Emergency shutdown system", "سامانهٔ توقف اضطراری"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { deviceCategory: "SAFETY_CONTROLLER", networkZone: "SAFETY" },
      description: t(
        "A monitored safety boundary, nothing more. Hermes observes its declared status; it can never reset, inhibit, bypass or simulate it, and no screen or script declares a command toward it.",
        "صرفاً یک مرز ایمنی پایش‌شونده. هرمس وضعیت اعلام‌شدهٔ آن را مشاهده می‌کند؛ هرگز نمی‌تواند آن را ریست، غیرفعال، دور زده یا شبیه‌سازی کند و هیچ صفحه یا اسکریپتی فرمانی به‌سوی آن اعلام نمی‌کند.",
      ),
    }),

    /* Equipment */
    a.node("EQUIPMENT", "FEED_SEPARATOR", t("Feed separator", "جداکنندهٔ خوراک"), {
      subsystem: "FEED_SEPARATION",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "PG_COMPRESSOR", t("Multi-stage process-gas compressor", "کمپرسور چندمرحله‌ای گاز فرایندی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "ANTISURGE_RECYCLE_VALVE", t("Anti-surge recycle valve", "شیر بازگردانی ضدسرج"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "LUBE_OIL_SYSTEM", t("Lube-oil system", "سامانهٔ روغن روان‌کاری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "SEAL_GAS_SYSTEM", t("Seal-gas system", "سامانهٔ گاز آب‌بندی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "INTERSTAGE_COOLER", t("Inter-stage cooler", "کولر میان‌مرحله‌ای"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "FRACTIONATION_COLUMN", t("Fractionation column", "برج تفکیک"), {
      subsystem: "FRACTIONATION",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "FLARE_HEADER", t("Flare header", "هدر فلر"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Monitored safety boundary. Observed for pressure only; never commanded.",
        "مرز ایمنی پایش‌شونده. فقط فشار آن مشاهده می‌شود؛ هرگز فرمان‌دهی نمی‌شود.",
      ),
    }),

    /* Controller-side process image */
    a.node("TAG", "SEP_LEVEL", t("Separator level", "سطح جداکننده"), {
      subsystem: "FEED_SEPARATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "FEED_FLOW", t("Feed gas flow", "دبی گاز خوراک"), {
      subsystem: "FEED_SEPARATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "km3/h", accessMode: "READ" },
    }),
    a.node("TAG", "SUCTION_PRESSURE", t("Stage 1 suction pressure", "فشار مکش مرحلهٔ ۱"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "barg", accessMode: "READ" },
    }),
    a.node("TAG", "DISCHARGE_PRESSURE", t("Final discharge pressure", "فشار خروجی نهایی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "barg", accessMode: "READ" },
    }),
    a.node("TAG", "STAGE2_SUCTION_TEMP", t("Stage 2 suction temperature", "دمای مکش مرحلهٔ ۲"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "COMP_SPEED", t("Compressor speed", "سرعت کمپرسور"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "rpm", accessMode: "READ" },
    }),
    a.node("TAG", "COMP_DRIVE_FAULT", t("Compressor drive fault", "خطای درایو کمپرسور"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "DRIVES",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "COMP_VIBRATION", t("Compressor bearing vibration", "ارتعاش یاتاقان کمپرسور"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", unit: "mm/s", accessMode: "READ" },
    }),
    a.node("TAG", "COMP_MOTOR_POWER", t("Compressor motor power", "توان موتور کمپرسور"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "kW", accessMode: "READ" },
    }),
    a.node("TAG", "SURGE_MARGIN", t("Anti-surge margin", "حاشیهٔ ضدسرج"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
      description: t(
        "Distance of the operating point from the surge control line, as the train controller calculates it.",
        "فاصلهٔ نقطهٔ کاری از خط کنترل سرج، آن‌گونه که کنترلر قطار محاسبه می‌کند.",
      ),
    }),
    a.node("TAG", "RECYCLE_VALVE_POS", t("Recycle valve position feedback", "بازخورد موقعیت شیر بازگردانی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "RECYCLE_VALVE_DEMAND", t("Recycle valve demand", "فرمان موقعیت شیر بازگردانی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "LUBE_OIL_PRESSURE", t("Lube-oil header pressure", "فشار هدر روغن روان‌کاری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "barg", accessMode: "READ" },
    }),
    a.node("TAG", "LUBE_OIL_TEMP", t("Lube-oil supply temperature", "دمای روغن روان‌کاری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "SEAL_GAS_DP", t("Seal-gas differential pressure", "اختلاف فشار گاز آب‌بندی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" },
    }),
    a.node("TAG", "TRAIN_MODE_REMOTE", t("Train in remote/auto", "قطار در حالت دور/خودکار"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "FALSE means somebody left the local panel selected. The evidence for that is an operator action, not a plant state.",
        "مقدار FALSE یعنی کسی پنل محلی را انتخاب‌شده رها کرده است. شاهد این موضوع یک اقدام اپراتوری است، نه یک وضعیت فرایندی.",
      ),
    }),
    a.node("TAG", "COLUMN_DP", t("Column differential pressure", "اختلاف فشار برج"), {
      subsystem: "FRACTIONATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "mbar", accessMode: "READ" },
    }),
    a.node("TAG", "COLUMN_TOP_PRESSURE", t("Column top pressure", "فشار بالای برج"), {
      subsystem: "FRACTIONATION",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "barg", accessMode: "READ" },
    }),
    a.node("TAG", "ESD_TRIP_ACTIVE", t("ESD trip active", "تریپ ESD فعال"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "Read-only status of the emergency-shutdown boundary, as the ESD system publishes it.",
        "وضعیت فقط‌خواندنی مرز توقف اضطراری، آن‌گونه که سامانهٔ ESD منتشر می‌کند.",
      ),
    }),
    a.node("TAG", "FLARE_HEADER_PRESSURE", t("Flare header pressure", "فشار هدر فلر"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "barg", accessMode: "READ" },
    }),
    a.node("TAG", "OPCUA_A_SESSION_OK", t("OPC UA session A healthy", "سلامت نشست A در OPC UA"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "OPCUA_B_SESSION_OK", t("OPC UA session B healthy", "سلامت نشست B در OPC UA"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "OPCUA_DATA_AGE", t("Age of newest OPC UA sample", "سن تازه‌ترین نمونهٔ OPC UA"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "s", accessMode: "READ" },
    }),

    /* Supervisory tag database */
    a.node("SCADA_TAG", "PCT_Sep_Level", t("Separator level (supervisory)", "سطح جداکننده (نظارتی)"), {
      subsystem: "FEED_SEPARATION",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "PCT_Feed_Flow", t("Feed flow (supervisory)", "دبی خوراک (نظارتی)"), {
      subsystem: "FEED_SEPARATION",
      attributes: { dataType: "REAL", unit: "km3/h", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "PCT_Comp_Speed", t("Compressor speed (supervisory)", "سرعت کمپرسور (نظارتی)"), {
      subsystem: "COMPRESSION_TRAIN",
      attributes: { dataType: "REAL", unit: "rpm", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "PCT_Comp_Drive_Fault", t("Compressor drive fault (supervisory)", "خطای درایو کمپرسور (نظارتی)"), {
      subsystem: "COMPRESSION_TRAIN",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "PCT_Surge_Margin", t("Anti-surge margin (supervisory)", "حاشیهٔ ضدسرج (نظارتی)"), {
      subsystem: "COMPRESSION_TRAIN",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "PCT_Recycle_Valve_Pos", t("Recycle valve position (supervisory)", "موقعیت شیر بازگردانی (نظارتی)"), {
      subsystem: "COMPRESSION_TRAIN",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "PCT_Lube_Oil_Press", t("Lube-oil pressure (supervisory)", "فشار روغن روان‌کاری (نظارتی)"), {
      subsystem: "COMPRESSION_TRAIN",
      attributes: { dataType: "REAL", unit: "barg", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "PCT_Column_DP", t("Column differential pressure (supervisory)", "اختلاف فشار برج (نظارتی)"), {
      subsystem: "FRACTIONATION",
      attributes: { dataType: "REAL", unit: "mbar", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "PCT_Train_Mode", t("Train mode (supervisory)", "حالت قطار (نظارتی)"), {
      subsystem: "COMPRESSION_TRAIN",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "PCT_OpcUa_A_Session_Ok", t("OPC UA session A healthy (supervisory)", "سلامت نشست A (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "PCT_OpcUa_B_Session_Ok", t("OPC UA session B healthy (supervisory)", "سلامت نشست B (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "PCT_OpcUa_Data_Age", t("OPC UA sample age", "سن نمونهٔ OPC UA"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "s", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "PCT_Esd_Trip_Active", t("ESD trip status (supervisory, read-only)", "وضعیت تریپ ESD (نظارتی، فقط‌خواندنی)"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "PCT_Flare_Header_Press", t("Flare header pressure (supervisory)", "فشار هدر فلر (نظارتی)"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "barg", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "PCT_Telemetry_Stale", t("Aggregation stale flag", "پرچم کهنگی تجمیع"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ_WRITE" },
      description: t(
        "Published by the watchdog rather than inferred by each screen. Stale means NEITHER redundant session is fresh.",
        "به‌جای استنتاج در هر صفحه، توسط دیدبان منتشر می‌شود. کهنگی یعنی هیچ‌یک از دو نشست افزونه تازه نیست.",
      ),
    }),
    a.node("SCADA_TAG", "PCT_Train_Start_Cmd", t("Train start command", "فرمان راه‌اندازی قطار"), {
      subsystem: "COMPRESSION_TRAIN",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "TRAIN_COMMAND", requiresConfirmation: true },
      description: t(
        "A DECLARED operator command. Hermes issues no command on this or any other tag.",
        "یک فرمان اپراتوری اعلام‌شده. هرمس روی این تگ یا هر تگ دیگری هیچ فرمانی صادر نمی‌کند.",
      ),
    }),
    a.node("SCADA_TAG", "PCT_Column_Sp_Trim_Cmd", t("Column setpoint trim command", "فرمان اصلاح نقطهٔ کار برج"), {
      subsystem: "FRACTIONATION",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "COLUMN_TRIM", requiresConfirmation: true },
    }),
    a.node("SCADA_TAG", "PCT_Alarm_Ack_Cmd", t("Alarm acknowledge command", "فرمان تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "ALARM_ACK", requiresConfirmation: false },
      description: t(
        "ISA-18.2 acknowledgement records that a human saw the alarm. It clears no condition, so the design deliberately does not put a confirmation dialogue in front of it.",
        "تأیید طبق ISA-18.2 فقط ثبت می‌کند که انسانی آلارم را دیده است. هیچ شرطی را پاک نمی‌کند، بنابراین طراحی عمداً پیش از آن پنجرهٔ تأیید قرار نمی‌دهد.",
      ),
    }),

    /* Field channels */
    a.node("IO_POINT", "AI_SEP_LEVEL", t("Separator level transmitter", "ترانسمیتر سطح جداکننده"), {
      subsystem: "FEED_SEPARATION",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "%" },
    }),
    a.node("IO_POINT", "AI_SUCTION_PRESSURE", t("Suction pressure transmitter", "ترانسمیتر فشار مکش"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "barg" },
    }),
    a.node("IO_POINT", "AI_LUBE_OIL_PRESSURE", t("Lube-oil pressure transmitter", "ترانسمیتر فشار روغن روان‌کاری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "barg" },
    }),
    a.node("IO_POINT", "AI_FLARE_HEADER_PRESSURE", t("Flare header pressure transmitter", "ترانسمیتر فشار هدر فلر"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      attributes: { channelType: "AI", unit: "barg" },
    }),
    a.node("IO_POINT", "AO_RECYCLE_VALVE", t("Recycle valve positioner output", "خروجی پوزیشنر شیر بازگردانی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "FIELD_IO",
      attributes: { channelType: "AO", unit: "%" },
    }),
    a.node("IO_POINT", "AI_COMP_VIBRATION", t("Bearing vibration probe", "پراب ارتعاش یاتاقان"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "mm/s" },
    }),

    /* Train start-up sequence */
    a.node("SEQUENCE", "TRAIN_STARTUP", t("Train start-up sequence", "توالی راه‌اندازی قطار"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "CONTROL_LOGIC",
    }),
    a.node("STATE", "C00_IDLE", t("Idle", "بی‌کار"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 0 },
    }),
    a.node("STATE", "C10_PERMISSIVE_CHECK", t("Permissive check", "بررسی مجوزها"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 10, stepTimeoutSeconds: 120 },
    }),
    a.node("STATE", "C20_PURGE_AND_PRESSURIZE", t("Purge and pressurize", "تخلیه و فشارگیری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 20, stepTimeoutSeconds: 900 },
    }),
    a.node("STATE", "C30_LOADING", t("Loading", "بارگیری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 30, stepTimeoutSeconds: 600 },
    }),
    a.node("STATE", "C40_ONLINE", t("Online", "در مدار"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 40 },
    }),

    /* ISA-18.2 alarm lifecycle, declared as a design object */
    a.node("SEQUENCE", "ALARM_LIFECYCLE", t("ISA-18.2 alarm lifecycle", "چرخهٔ عمر آلارم ISA-18.2"), {
      domain: "OPERATOR_INTERFACE",
      description: t(
        "The declared alarm philosophy of the train, in ISA-18.2 stages. Acknowledgement moves an alarm between these states and never clears the underlying condition.",
        "فلسفهٔ اعلام‌شدهٔ آلارم قطار، در مراحل ISA-18.2. تأیید، آلارم را بین این حالت‌ها جابه‌جا می‌کند و هرگز شرط زیربنایی را پاک نمی‌کند.",
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
    a.node("PERMISSIVE", "PRM_OPCUA_FRESH", t("Aggregated picture fresh enough to act on", "تازگی کافی تصویر تجمیع‌شده برای اقدام"), {
      domain: "NETWORK",
      description: t(
        "A permissive about DATA, not about plant. With two redundant sessions it fails only when neither path is fresh.",
        "مجوزی دربارهٔ داده است، نه دربارهٔ فرایند. با دو نشست افزونه، تنها وقتی ناموفق می‌شود که هیچ مسیری تازه نباشد.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_TRAIN_REMOTE", t("Train in remote/auto", "قطار در حالت دور/خودکار"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "CONTROL_LOGIC",
    }),
    a.node("PERMISSIVE", "PRM_LUBE_OIL_OK", t("Lube-oil pressure sufficient", "کفایت فشار روغن روان‌کاری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
    }),
    a.node("PERMISSIVE", "PRM_SEAL_GAS_OK", t("Seal-gas differential in range", "اختلاف فشار گاز آب‌بندی در محدوده"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
    }),

    /* Interlocks */
    a.node("INTERLOCK", "ILK_ESD_TRIP", t("ESD boundary trip", "تریپ مرز ESD"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "The declared effect of the monitored ESD boundary on the train. Observed only; nothing in Hermes can reset, inhibit or bypass it.",
        "اثر اعلام‌شدهٔ مرز پایش‌شوندهٔ ESD بر قطار. فقط مشاهده می‌شود؛ هیچ‌چیز در هرمس نمی‌تواند آن را ریست، غیرفعال یا دور بزند.",
      ),
    }),
    a.node("INTERLOCK", "ILK_SURGE_PROTECTION", t("Anti-surge protection active", "حفاظت ضدسرج فعال"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
    }),
    a.node("INTERLOCK", "ILK_LUBE_OIL_LOW", t("Lube-oil low-pressure protection", "حفاظت افت فشار روغن روان‌کاری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
    }),

    /* Alarms */
    a.node("ALARM", "ALM_SEP_LEVEL_HIGH", t("Separator level high", "بالا بودن سطح جداکننده"), {
      subsystem: "FEED_SEPARATION",
      domain: "PROCESS",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_COMP_DRIVE_TRIP", t("Compressor drive trip", "تریپ درایو کمپرسور"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "DRIVES",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_SURGE_MARGIN_LOW", t("Anti-surge margin low", "پایین بودن حاشیهٔ ضدسرج"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_OPCUA_STALE", t("OPC UA aggregation stale", "کهنگی تجمیع OPC UA"), {
      domain: "NETWORK",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_ESD_TRIP", t("ESD trip", "تریپ ESD"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_TRAIN_NOT_READY", t("Train not ready", "عدم آمادگی قطار"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "CONTROL_LOGIC",
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),
    a.node("ALARM", "ALM_LUBE_OIL_PRESS_LOW", t("Lube-oil pressure low", "افت فشار روغن روان‌کاری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),

    /* Operator screens and objects */
    a.node("HMI_SCREEN", "Screen_TrainOverview", t("Compression train overview", "نمای کلی قطار تراکم"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Compressor", t("Process-gas compressor", "کمپرسور گاز فرایندی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Column", t("Fractionation column", "برج تفکیک"), {
      subsystem: "FRACTIONATION",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_SafetyBoundary", t("ESD and flare boundary (monitored only)", "مرز ESD و فلر (صرفاً پایش)"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "OPERATOR_INTERFACE",
      description: t(
        "Display-only. This screen declares no command onto any tag.",
        "صرفاً نمایشی. این صفحه هیچ فرمانی روی هیچ تگی اعلام نمی‌کند.",
      ),
    }),
    a.node("HMI_SCREEN", "Screen_Alarms", t("Active alarms", "آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_OpcUaHealth", t("OPC UA path health indicator", "نشانگر سلامت مسیرهای OPC UA"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_FeedFlow", t("Feed flow trend", "روند دبی خوراک"), {
      subsystem: "FEED_SEPARATION",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Fp_Compressor", t("Compressor faceplate", "فیس‌پلیت کمپرسور"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "TRAIN_COMMAND", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Trend_LubeOil", t("Lube-oil pressure trend", "روند فشار روغن روان‌کاری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_RecycleValve", t("Recycle valve position trend", "روند موقعیت شیر بازگردانی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_ColumnDp", t("Column differential-pressure trend", "روند اختلاف فشار برج"), {
      subsystem: "FRACTIONATION",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Btn_ColumnTrim", t("Column trim button", "دکمهٔ اصلاح برج"), {
      subsystem: "FRACTIONATION",
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "COLUMN_TRIM", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Ind_EsdStatus", t("ESD status indicator (read-only)", "نشانگر وضعیت ESD (فقط‌خواندنی)"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_FlareHeader", t("Flare header pressure trend", "روند فشار هدر فلر"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Banner_ActiveAlarms", t("Active alarm banner", "نوار آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "ALARM_ACK", requiresConfirmation: false },
    }),

    /* Supervisory scripts */
    a.node("SCRIPT", "OnTrainStartRequest", t("Train start request handler", "پردازندهٔ درخواست راه‌اندازی قطار"), {
      subsystem: "COMPRESSION_TRAIN",
      attributes: { humanInvokable: true, requiredPermission: "TRAIN_COMMAND" },
      description: t(
        "Invoked by an operator from the compressor faceplate.",
        "توسط اپراتور از فیس‌پلیت کمپرسور فراخوانی می‌شود.",
      ),
    }),
    a.node("SCRIPT", "OnColumnTrimRequest", t("Column trim request handler", "پردازندهٔ درخواست اصلاح برج"), {
      subsystem: "FRACTIONATION",
      attributes: { humanInvokable: true, requiredPermission: "COLUMN_TRIM" },
    }),
    a.node("SCRIPT", "OnAlarmAcknowledge", t("Alarm acknowledge handler", "پردازندهٔ تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "ALARM_ACK" },
    }),
    a.node("SCRIPT", "OnOpcUaWatchdog", t("OPC UA redundancy watchdog", "دیدبان افزونگی OPC UA"), {
      domain: "NETWORK",
      description: t(
        "Runs on the supervisory server's schedule. It declares no role because no operator invokes it, and humanInvokable is deliberately left undeclared: absence means false.",
        "بر اساس زمان‌بندی سرور نظارتی اجرا می‌شود. چون هیچ اپراتوری آن را فراخوانی نمی‌کند، هیچ نقشی اعلام نمی‌کند و humanInvokable عمداً اعلام‌نشده مانده است: نبودن یعنی نادرست.",
      ),
    }),

    /* Governance */
    a.node("ROLE", "Role_TrainOperator", t("Train console operator", "اپراتور کنسول قطار")),
    a.node("ROLE", "Role_TrainSupervisor", t("Train shift supervisor", "سرپرست شیفت قطار")),
    a.node("AUDIT_EVENT_TYPE", "Audit_TrainStartCommanded", t("Train start commanded", "صدور فرمان راه‌اندازی قطار")),
    a.node("AUDIT_EVENT_TYPE", "Audit_ColumnTrimCommanded", t("Column trim commanded", "صدور فرمان اصلاح برج")),
    a.node("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged", t("Alarm acknowledged", "تأیید آلارم")),
    a.node("AUDIT_EVENT_TYPE", "Audit_OpcUaWatchdogRecord", t("OPC UA watchdog record", "رکورد دیدبان OPC UA"), {
      description: t(
        "An automatic routine still leaves a record. EMITS carries no humanInvokable requirement, because an audit trail is about what happened, not about who asked for it.",
        "یک روال خودکار نیز رکورد بر جای می‌گذارد. EMITS هیچ الزامی به humanInvokable ندارد، چون سابقهٔ ممیزی دربارهٔ آنچه رخ داده است، نه دربارهٔ اینکه چه کسی آن را خواسته.",
      ),
    }),

    /* KPI and evidence */
    a.node("KPI", "KPI_OEE", t("Overall equipment effectiveness", "اثربخشی کلی تجهیزات"), {
      domain: "MAINTENANCE",
      attributes: { unit: "%", formula: "availability x performance x quality" },
    }),
    a.node("KPI", "KPI_THROUGHPUT", t("Train throughput", "ظرفیت عبوری قطار"), {
      domain: "PROCESS",
      attributes: { unit: "km3/h", formula: "compressed feed per operating hour" },
    }),
    a.node("KPI", "KPI_SPECIFIC_COMPRESSION_ENERGY", t("Specific compression energy", "انرژی ویژهٔ تراکم"), {
      domain: "ENERGY",
      attributes: { unit: "kWh/km3", formula: "drive energy / compressed volume" },
    }),
    a.node("KPI", "KPI_TRAIN_AVAILABILITY", t("Train availability", "دسترس‌پذیری قطار"), {
      domain: "MAINTENANCE",
      attributes: { unit: "%", formula: "online hours / scheduled hours" },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_PROCESS_TREND", t("Process trend archive", "بایگانی روند فرایند"), {
      domain: "MAINTENANCE",
      attributes: { retentionDays: 400, sampleIntervalSeconds: 5 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_MACHINE_TREND", t("Machine trend archive", "بایگانی روند ماشین"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 180, sampleIntervalSeconds: 1 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_OPCUA_LINK_LOG", t("OPC UA session log", "گزارش نشست OPC UA"), {
      domain: "NETWORK",
      attributes: { retentionDays: 180, sampleIntervalSeconds: 10 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_ESD_EVENT_LOG", t("ESD event log", "گزارش رویدادهای ESD"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 3650 },
      description: t(
        "Where the monitored boundary's trips are recorded. Hermes reads about it here; it does not write to it.",
        "جایی که تریپ‌های مرز پایش‌شونده ثبت می‌شوند. هرمس اینجا دربارهٔ آن می‌خواند و در آن نمی‌نویسد.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_TRAIN_AUDIT_LOG", t("Operator audit log", "گزارش ممیزی اپراتور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { retentionDays: 1825 },
    }),

    /* Fault modes */
    a.node("FAULT_MODE", "FM_SEP_LEVEL_TX_DRIFT", t("Separator level transmitter drift", "رانش ترانسمیتر سطح جداکننده"), {
      subsystem: "FEED_SEPARATION",
      domain: "FIELD_IO",
      attributes: { faultClass: "SENSOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_COMP_DRIVE_TRIP", t("Compressor main drive trip", "تریپ درایو اصلی کمپرسور"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "DRIVES",
      attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
    }),
    a.node("FAULT_MODE", "FM_RECYCLE_VALVE_STUCK", t("Recycle valve not following demand", "پیروی نکردن شیر بازگردانی از فرمان"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "FIELD_IO",
      attributes: { faultClass: "ACTUATOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_OPCUA_REDUNDANCY_LOSS", t("Both OPC UA sessions lost", "از دست رفتن هر دو نشست OPC UA"), {
      domain: "NETWORK",
      attributes: { faultClass: "COMMUNICATION_LOSS", subsystem: "TELEMETRY" },
    }),
    a.node("FAULT_MODE", "FM_ESD_BOUNDARY_TRIP", t("ESD boundary holding the train", "نگه‌داشتن قطار توسط مرز ESD"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { faultClass: "INTERLOCK_ACTIVE", subsystem: "SAFETY_CIRCUIT" },
    }),
    a.node("FAULT_MODE", "FM_TRAIN_LEFT_IN_LOCAL", t("Train left in local mode", "رهاشدن قطار در حالت محلی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "OPERATOR_INTERFACE",
      attributes: { faultClass: "INCORRECT_MODE", subsystem: "HMI" },
    }),
    a.node("FAULT_MODE", "FM_LUBE_OIL_DEGRADATION", t("Lube-oil supply degrading", "افت تدریجی تغذیهٔ روغن روان‌کاری"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "PROCESS" },
    }),

    /* Safe actions — instructions for a qualified human being */
    a.node("SAFE_ACTION", "SA_COMPARE_SEP_LEVEL_TO_GAUGE", t("Compare the level reading to the local gauge glass", "مقایسهٔ قرائت سطح با گیج محلی"), {
      subsystem: "FEED_SEPARATION",
      domain: "FIELD_IO",
    }),
    a.node("SAFE_ACTION", "SA_READ_COMP_DRIVE_HISTORY", t("Read the compressor drive fault history", "خواندن تاریخچهٔ خطای درایو کمپرسور"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "DRIVES",
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_RECYCLE_VALVE_ACTUATOR", t("Inspect the recycle valve actuator and positioner", "بازرسی عملگر و پوزیشنر شیر بازگردانی"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "FIELD_IO",
      description: t(
        "Per the isolation procedure and with the machine protected. The valve is never stroked, forced or simulated from Hermes.",
        "طبق دستورالعمل جداسازی و با ماشین در وضعیت حفاظت‌شده. شیر هرگز از هرمس حرکت داده، تحمیل یا شبیه‌سازی نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_VERIFY_OPCUA_GATEWAY_SESSIONS", t("Verify both OPC UA gateway sessions", "بررسی هر دو نشست دروازهٔ OPC UA"), {
      domain: "NETWORK",
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_ESD_BOUNDARY_REVIEW", t("Escalate to an ESD boundary review", "ارجاع به بازبینی مرز ESD"), {
      subsystem: "SAFETY_BOUNDARY",
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "Review-only and escalate-only. The emergency-shutdown boundary is never reset, inhibited, bypassed or simulated from here or from anywhere else in Hermes.",
        "فقط بازبینی و ارجاع. مرز توقف اضطراری هرگز از اینجا یا از هیچ جای دیگر هرمس ریست، غیرفعال، دور زده یا شبیه‌سازی نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_TRAIN_AUDIT_LOG", t("Review the operator audit log", "بازبینی گزارش ممیزی اپراتور"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_LUBE_OIL_SKID", t("Inspect the lube-oil skid, filters and standby pump", "بازرسی اسکید روغن، فیلترها و پمپ آماده‌به‌کار"), {
      subsystem: "COMPRESSION_TRAIN",
      domain: "PROCESS",
    }),
  ],

  edges: [
    /* Containment */
    a.edge(D.plcTrain, T.sepLevel, "CONTAINS"),
    a.edge(D.plcTrain, T.feedFlow, "CONTAINS"),
    a.edge(D.plcTrain, T.suctionPress, "CONTAINS"),
    a.edge(D.plcTrain, T.dischargePress, "CONTAINS"),
    a.edge(D.plcTrain, T.stage2Temp, "CONTAINS"),
    a.edge(D.plcTrain, T.compSpeed, "CONTAINS"),
    a.edge(D.plcTrain, T.compFault, "CONTAINS"),
    a.edge(D.plcTrain, T.compVibration, "CONTAINS"),
    a.edge(D.plcTrain, T.compPower, "CONTAINS"),
    a.edge(D.plcTrain, T.surgeMargin, "CONTAINS"),
    a.edge(D.plcTrain, T.valvePos, "CONTAINS"),
    a.edge(D.plcTrain, T.valveDemand, "CONTAINS"),
    a.edge(D.plcTrain, T.lubePress, "CONTAINS"),
    a.edge(D.plcTrain, T.lubeTemp, "CONTAINS"),
    a.edge(D.plcTrain, T.sealGasDp, "CONTAINS"),
    a.edge(D.plcTrain, T.trainMode, "CONTAINS"),
    a.edge(D.plcColumn, T.columnDp, "CONTAINS"),
    a.edge(D.plcColumn, T.columnTopPress, "CONTAINS"),
    a.edge(D.esd, T.esdTrip, "CONTAINS"),
    a.edge(D.esd, T.flarePress, "CONTAINS"),
    a.edge(D.gwA, T.opcASession, "CONTAINS"),
    a.edge(D.gwB, T.opcBSession, "CONTAINS"),
    a.edge(D.primary, T.opcDataAge, "CONTAINS"),
    a.edge(D.primary, ST.telemetryStale, "CONTAINS"),
    a.edge(D.primary, ST.sepLevel, "CONTAINS"),
    a.edge(D.primary, ST.compSpeed, "CONTAINS"),
    a.edge(D.primary, ST.opcASession, "CONTAINS"),
    a.edge(D.primary, ST.opcBSession, "CONTAINS"),
    a.edge(D.primary, ST.trainStartCmd, "CONTAINS"),
    a.edge(D.primary, AQ, "CONTAINS"),
    a.edge(D.opClient, H.overview, "CONTAINS"),
    a.edge(D.opClient, H.compressor, "CONTAINS"),
    a.edge(D.opClient, H.column, "CONTAINS"),
    a.edge(D.opClient, H.safety, "CONTAINS"),
    a.edge(D.opClient, H.alarms, "CONTAINS"),
    a.edge(H.overview, HO.opcHealth, "CONTAINS"),
    a.edge(H.overview, HO.feedFlow, "CONTAINS"),
    a.edge(H.compressor, HO.compressor, "CONTAINS"),
    a.edge(H.compressor, HO.lubeOil, "CONTAINS"),
    a.edge(H.compressor, HO.recycleValve, "CONTAINS"),
    a.edge(H.column, HO.columnDp, "CONTAINS"),
    a.edge(H.column, HO.columnTrim, "CONTAINS"),
    a.edge(H.safety, HO.esdStatus, "CONTAINS"),
    a.edge(H.safety, HO.flareHeader, "CONTAINS"),
    a.edge(H.alarms, HO.alarmBanner, "CONTAINS"),
    a.edge(SQ, S.idle, "CONTAINS"),
    a.edge(SQ, S.check, "CONTAINS"),
    a.edge(SQ, S.purge, "CONTAINS"),
    a.edge(SQ, S.loading, "CONTAINS"),
    a.edge(SQ, S.online, "CONTAINS"),
    a.edge(AQ, AS.normal, "CONTAINS"),
    a.edge(AQ, AS.unack, "CONTAINS"),
    a.edge(AQ, AS.acked, "CONTAINS"),
    a.edge(AQ, AS.rtnUnack, "CONTAINS"),

    /* Redundancy: server pair and gateway pair. Design facts, not runtimes. */
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
      t("Redundant OPC UA aggregation path", "مسیر افزونهٔ تجمیع OPC UA"),
    ),

    /* Field channels to the controller image */
    a.edge(T.sepLevel, IO.sepLevel, "BOUND_TO"),
    a.edge(T.suctionPress, IO.suction, "BOUND_TO"),
    a.edge(T.lubePress, IO.lubePress, "BOUND_TO"),
    a.edge(T.flarePress, IO.flarePress, "BOUND_TO"),
    a.edge(T.valveDemand, IO.valveDemand, "BOUND_TO"),
    a.edge(T.compVibration, IO.vibration, "BOUND_TO"),

    /* Supervisory image mirrors the controller image across the redundant
     * OPC UA paths. This is the seam where a healthy plant and an unhealthy
     * PICTURE of it become distinguishable. */
    a.edge(ST.sepLevel, T.sepLevel, "MIRRORS"),
    a.edge(ST.feedFlow, T.feedFlow, "MIRRORS"),
    a.edge(ST.compSpeed, T.compSpeed, "MIRRORS"),
    a.edge(ST.compFault, T.compFault, "MIRRORS"),
    a.edge(ST.surgeMargin, T.surgeMargin, "MIRRORS"),
    a.edge(ST.valvePos, T.valvePos, "MIRRORS"),
    a.edge(ST.lubePress, T.lubePress, "MIRRORS"),
    a.edge(ST.columnDp, T.columnDp, "MIRRORS"),
    a.edge(ST.trainMode, T.trainMode, "MIRRORS"),
    a.edge(ST.opcASession, T.opcASession, "MIRRORS"),
    a.edge(ST.opcBSession, T.opcBSession, "MIRRORS"),
    a.edge(ST.opcDataAge, T.opcDataAge, "MIRRORS"),
    a.edge(ST.esdTrip, T.esdTrip, "MIRRORS"),
    a.edge(ST.flarePress, T.flarePress, "MIRRORS"),

    /* Equipment */
    a.edge(T.sepLevel, EQ.separator, "MONITORS"),
    a.edge(T.feedFlow, EQ.separator, "MONITORS"),
    a.edge(T.suctionPress, EQ.compressor, "MONITORS"),
    a.edge(T.dischargePress, EQ.compressor, "MONITORS"),
    a.edge(T.compSpeed, EQ.compressor, "MONITORS"),
    a.edge(T.compFault, EQ.compressor, "MONITORS"),
    a.edge(T.compVibration, EQ.compressor, "MONITORS"),
    a.edge(T.compPower, EQ.compressor, "MONITORS"),
    a.edge(T.surgeMargin, EQ.compressor, "MONITORS"),
    a.edge(T.stage2Temp, EQ.cooler, "MONITORS"),
    a.edge(T.valvePos, EQ.recycleValve, "MONITORS"),
    a.edge(T.valveDemand, EQ.recycleValve, "ACTUATES"),
    a.edge(T.lubePress, EQ.lubeOil, "MONITORS"),
    a.edge(T.lubeTemp, EQ.lubeOil, "MONITORS"),
    a.edge(T.sealGasDp, EQ.sealGas, "MONITORS"),
    a.edge(T.columnDp, EQ.column, "MONITORS"),
    a.edge(T.columnTopPress, EQ.column, "MONITORS"),
    a.edge(T.flarePress, EQ.flare, "MONITORS"),
    a.edge(D.compDrive, EQ.compressor, "ACTUATES"),
    a.edge(D.esd, EQ.compressor, "MONITORS"),
    a.edge(ST.trainStartCmd, EQ.compressor, "ACTUATES"),
    a.edge(ST.columnTrimCmd, EQ.column, "ACTUATES"),

    /* Sequences and their gates */
    ...chainStates(a, [S.idle, S.check, S.purge, S.loading, S.online]),
    ...chainStates(a, [AS.normal, AS.unack, AS.acked, AS.rtnUnack]),
    a.edge(
      AS.rtnUnack,
      AS.normal,
      "TRANSITIONS_TO",
      t("Acknowledgement of a returned alarm closes the lifecycle", "تأیید آلارمِ بازگشته چرخه را می‌بندد"),
    ),
    a.edge(P.opcFresh, SQ, "GATES"),
    a.edge(P.trainRemote, SQ, "GATES"),
    a.edge(P.lubeOk, SQ, "GATES"),
    a.edge(P.sealGasOk, S.loading, "GATES"),
    a.edge(I.esdTrip, S.loading, "BLOCKS"),
    a.edge(I.surge, S.loading, "BLOCKS"),
    a.edge(I.lubeLow, S.loading, "BLOCKS"),

    /* What each permissive and interlock actually reads */
    a.edge(P.opcFresh, T.opcASession, "READS"),
    a.edge(P.opcFresh, T.opcBSession, "READS"),
    a.edge(P.opcFresh, T.opcDataAge, "READS"),
    a.edge(P.trainRemote, T.trainMode, "READS"),
    a.edge(P.lubeOk, T.lubePress, "READS"),
    a.edge(P.sealGasOk, T.sealGasDp, "READS"),
    a.edge(I.esdTrip, T.esdTrip, "READS"),
    a.edge(I.surge, T.surgeMargin, "READS"),
    a.edge(I.lubeLow, T.lubePress, "READS"),

    /* Alarms */
    a.edge(T.sepLevel, AL.sepLevel, "RAISES"),
    a.edge(T.compFault, AL.compTrip, "RAISES"),
    a.edge(T.surgeMargin, AL.surgeLow, "RAISES"),
    a.edge(ST.telemetryStale, AL.opcStale, "RAISES"),
    a.edge(I.esdTrip, AL.esdTrip, "RAISES"),
    a.edge(T.trainMode, AL.trainNotReady, "RAISES"),
    a.edge(T.lubePress, AL.lubeLow, "RAISES"),

    /* Operator screens */
    a.edge(H.overview, ST.opcASession, "DISPLAYS"),
    a.edge(H.overview, ST.opcBSession, "DISPLAYS"),
    a.edge(H.overview, ST.feedFlow, "DISPLAYS"),
    a.edge(H.overview, H.compressor, "NAVIGATES_TO"),
    a.edge(H.overview, H.column, "NAVIGATES_TO"),
    a.edge(H.overview, H.safety, "NAVIGATES_TO"),
    a.edge(H.overview, H.alarms, "NAVIGATES_TO"),
    a.edge(H.compressor, ST.compFault, "DISPLAYS"),
    a.edge(H.compressor, ST.compSpeed, "DISPLAYS"),
    a.edge(H.compressor, ST.surgeMargin, "DISPLAYS"),
    a.edge(H.compressor, ST.lubePress, "DISPLAYS"),
    a.edge(H.compressor, ST.valvePos, "DISPLAYS"),
    a.edge(H.compressor, ST.trainStartCmd, "COMMANDS"),
    a.edge(H.compressor, H.overview, "NAVIGATES_TO"),
    a.edge(H.column, ST.columnDp, "DISPLAYS"),
    a.edge(H.column, ST.columnTrimCmd, "COMMANDS"),
    a.edge(H.column, H.overview, "NAVIGATES_TO"),
    /* The safety-boundary screen is display-only by design: no COMMANDS edge
     * leaves it, and the screen definition declares none. */
    a.edge(H.safety, ST.esdTrip, "DISPLAYS"),
    a.edge(H.safety, ST.flarePress, "DISPLAYS"),
    a.edge(H.safety, H.overview, "NAVIGATES_TO"),
    a.edge(H.alarms, ST.telemetryStale, "DISPLAYS"),
    a.edge(H.alarms, ST.ackCmd, "COMMANDS"),
    a.edge(H.alarms, H.overview, "NAVIGATES_TO"),

    a.edge(HO.opcHealth, ST.opcASession, "DISPLAYS"),
    a.edge(HO.opcHealth, ST.opcBSession, "DISPLAYS"),
    a.edge(HO.feedFlow, ST.feedFlow, "DISPLAYS"),
    a.edge(HO.compressor, ST.compFault, "DISPLAYS"),
    a.edge(HO.compressor, ST.compSpeed, "DISPLAYS"),
    a.edge(HO.compressor, ST.surgeMargin, "DISPLAYS"),
    a.edge(HO.compressor, ST.trainStartCmd, "COMMANDS"),
    a.edge(HO.lubeOil, ST.lubePress, "DISPLAYS"),
    a.edge(HO.recycleValve, ST.valvePos, "DISPLAYS"),
    a.edge(HO.columnDp, ST.columnDp, "DISPLAYS"),
    a.edge(HO.columnTrim, ST.columnTrimCmd, "COMMANDS"),
    a.edge(HO.esdStatus, ST.esdTrip, "DISPLAYS"),
    a.edge(HO.flareHeader, ST.flarePress, "DISPLAYS"),
    a.edge(HO.alarmBanner, ST.telemetryStale, "DISPLAYS"),
    a.edge(HO.alarmBanner, ST.ackCmd, "COMMANDS"),

    /* Scripts — recovered from the supervisory source itself */
    a.edge(SC.trainStart, ST.opcASession, "READS"),
    a.edge(SC.trainStart, ST.trainMode, "READS"),
    a.edge(SC.trainStart, ST.lubePress, "READS"),
    a.edge(SC.trainStart, ST.trainStartCmd, "WRITES"),
    a.edge(SC.trainStart, H.compressor, "NAVIGATES_TO"),
    a.edge(SC.columnTrim, ST.columnDp, "READS"),
    a.edge(SC.columnTrim, ST.columnTrimCmd, "WRITES"),
    a.edge(SC.watchdog, ST.opcASession, "READS"),
    a.edge(SC.watchdog, ST.opcBSession, "READS"),
    a.edge(SC.watchdog, ST.opcDataAge, "READS"),
    a.edge(SC.watchdog, ST.telemetryStale, "WRITES"),
    a.edge(SC.alarmAck, ST.ackCmd, "WRITES"),
    a.edge(SC.alarmAck, H.alarms, "NAVIGATES_TO"),

    /* Governance — declared authorisation and audit trail */
    a.edge(SC.trainStart, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.trainStart, AE.trainStart, "EMITS"),
    a.edge(SC.columnTrim, R.supervisor, "REQUIRES_ROLE"),
    a.edge(SC.columnTrim, AE.columnTrim, "EMITS"),
    a.edge(SC.alarmAck, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.alarmAck, AE.alarmAck, "EMITS"),
    // No REQUIRES_ROLE: nothing human invokes the watchdog. It still emits.
    a.edge(SC.watchdog, AE.watchdog, "EMITS"),

    /* Historian and KPI */
    a.edge(EV.processTrend, T.sepLevel, "RECORDS"),
    a.edge(EV.processTrend, T.feedFlow, "RECORDS"),
    a.edge(EV.processTrend, T.columnDp, "RECORDS"),
    a.edge(EV.processTrend, T.valvePos, "RECORDS"),
    a.edge(EV.processTrend, T.surgeMargin, "RECORDS"),
    a.edge(EV.machineTrend, T.compSpeed, "RECORDS"),
    a.edge(EV.machineTrend, T.compVibration, "RECORDS"),
    a.edge(EV.machineTrend, T.compPower, "RECORDS"),
    a.edge(EV.machineTrend, T.lubePress, "RECORDS"),
    a.edge(EV.machineTrend, T.lubeTemp, "RECORDS"),
    a.edge(EV.opcLinkLog, T.opcASession, "RECORDS"),
    a.edge(EV.opcLinkLog, T.opcBSession, "RECORDS"),
    a.edge(EV.opcLinkLog, T.opcDataAge, "RECORDS"),
    a.edge(EV.esdEventLog, T.esdTrip, "RECORDS"),
    a.edge(EV.esdEventLog, T.flarePress, "RECORDS"),
    a.edge(EV.auditLog, T.trainMode, "RECORDS"),
    a.edge(K.oee, T.feedFlow, "DERIVED_FROM"),
    a.edge(K.oee, T.compSpeed, "DERIVED_FROM"),
    a.edge(K.oee, T.columnDp, "DERIVED_FROM"),
    a.edge(K.throughput, T.feedFlow, "DERIVED_FROM"),
    a.edge(K.specificEnergy, T.compPower, "DERIVED_FROM"),
    a.edge(K.specificEnergy, T.feedFlow, "DERIVED_FROM"),
    a.edge(K.availability, T.compSpeed, "DERIVED_FROM"),

    /* Fault modes — what each one explains and what is evidence for it */
    a.edge(FM.levelDrift, AL.sepLevel, "EXPLAINS"),
    a.edge(T.sepLevel, FM.levelDrift, "EVIDENCE_FOR"),
    a.edge(IO.sepLevel, FM.levelDrift, "EVIDENCE_FOR"),
    a.edge(EV.processTrend, FM.levelDrift, "EVIDENCE_FOR"),

    a.edge(FM.compTrip, AL.compTrip, "EXPLAINS"),
    a.edge(T.compFault, FM.compTrip, "EVIDENCE_FOR"),
    a.edge(T.compSpeed, FM.compTrip, "EVIDENCE_FOR"),
    a.edge(EV.machineTrend, FM.compTrip, "EVIDENCE_FOR"),

    a.edge(FM.valveStuck, AL.surgeLow, "EXPLAINS"),
    a.edge(T.valvePos, FM.valveStuck, "EVIDENCE_FOR"),
    a.edge(T.surgeMargin, FM.valveStuck, "EVIDENCE_FOR"),
    a.edge(EV.processTrend, FM.valveStuck, "EVIDENCE_FOR"),

    a.edge(FM.opcLoss, AL.opcStale, "EXPLAINS"),
    a.edge(T.opcASession, FM.opcLoss, "EVIDENCE_FOR"),
    a.edge(T.opcBSession, FM.opcLoss, "EVIDENCE_FOR"),
    a.edge(T.opcDataAge, FM.opcLoss, "EVIDENCE_FOR"),
    a.edge(EV.opcLinkLog, FM.opcLoss, "EVIDENCE_FOR"),

    a.edge(FM.esdBoundary, AL.esdTrip, "EXPLAINS"),
    a.edge(I.esdTrip, FM.esdBoundary, "EVIDENCE_FOR"),
    a.edge(T.esdTrip, FM.esdBoundary, "EVIDENCE_FOR"),
    a.edge(T.flarePress, FM.esdBoundary, "EVIDENCE_FOR"),
    a.edge(EV.esdEventLog, FM.esdBoundary, "EVIDENCE_FOR"),

    a.edge(FM.leftInLocal, AL.trainNotReady, "EXPLAINS"),
    a.edge(T.trainMode, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(P.trainRemote, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(EV.auditLog, FM.leftInLocal, "EVIDENCE_FOR"),

    a.edge(FM.lubeDecay, AL.lubeLow, "EXPLAINS"),
    a.edge(T.lubePress, FM.lubeDecay, "EVIDENCE_FOR"),
    a.edge(T.lubeTemp, FM.lubeDecay, "EVIDENCE_FOR"),
    a.edge(EV.machineTrend, FM.lubeDecay, "EVIDENCE_FOR"),

    /* Safe actions */
    a.edge(SA.levelCompare, FM.levelDrift, "VERIFIES"),
    a.edge(SA.driveHistory, FM.compTrip, "VERIFIES"),
    a.edge(SA.valveInspect, FM.valveStuck, "VERIFIES"),
    a.edge(SA.opcVerify, FM.opcLoss, "VERIFIES"),
    a.edge(SA.esdReview, FM.esdBoundary, "VERIFIES"),
    a.edge(SA.auditReview, FM.leftInLocal, "VERIFIES"),
    a.edge(SA.lubeInspect, FM.lubeDecay, "VERIFIES"),
  ],

  artifacts: [
    {
      local: "SupervisoryScripts",
      language: "JAVASCRIPT",
      layer: "SCADA",
      fileName: "SupervisoryScripts.js",
      declares: [SC.trainStart, SC.columnTrim, SC.watchdog, SC.alarmAck],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "SCRIPTS/CompressionTrain",
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
        H.compressor,
        H.column,
        H.safety,
        H.alarms,
        HO.opcHealth,
        HO.feedFlow,
        HO.compressor,
        HO.lubeOil,
        HO.recycleValve,
        HO.columnDp,
        HO.columnTrim,
        HO.esdStatus,
        HO.flareHeader,
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
        AQ,
        EV.processTrend,
        EV.opcLinkLog,
        EV.esdEventLog,
        EV.auditLog,
      ],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "CONFIG/RedundantTrain",
        domain: "SUPERVISORY",
        safetyClass: "NON_SAFETY",
      },
      content: SUPERVISORY_CONFIG,
    },
  ],

  scenarios: [
    {
      id: "SCADA-03-FS-01",
      title: t("Separator level reads high and will not move", "سطح جداکننده بالا نشان می‌دهد و تغییر نمی‌کند"),
      narrative: t(
        "The separator level has crept up to 82 percent and stopped moving, while feed and outflow vary normally. The field operator reports the local gauge glass reads mid-range.",
        "سطح جداکننده تا ۸۲ درصد بالا رفته و از حرکت بازمانده، در حالی که خوراک و خروجی به‌طور عادی تغییر می‌کنند. اپراتور میدانی گزارش می‌دهد گیج محلی میانهٔ محدوده را نشان می‌دهد.",
      ),
      observations: [
        { nodeId: AL.sepLevel, state: "TRUE" },
        { nodeId: T.sepLevel, state: "STALE", detail: "frozen at 82% while flows vary" },
        { nodeId: T.feedFlow, state: "NORMAL" },
        { nodeId: T.opcASession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "SENSOR_FAILURE",
        faultModeId: FM.levelDrift,
        supportingNodeIds: [T.sepLevel, AL.sepLevel],
        expectedMissingNodeIds: [IO.sepLevel, EV.processTrend],
        expectedSafeActionIds: [SA.levelCompare],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-03-FS-02",
      title: t("Compressor tripped under load", "کمپرسور زیر بار تریپ کرد"),
      narrative: t(
        "The main drive tripped while the train was online. The drive reports a fault code, the machine coasted down, and the lube-oil system shows nothing unusual.",
        "درایو اصلی هنگام در مدار بودن قطار تریپ کرد. درایو یک کد خطا گزارش می‌کند، ماشین از دور افتاده و سامانهٔ روغن روان‌کاری هیچ نکتهٔ غیرعادی نشان نمی‌دهد.",
      ),
      observations: [
        { nodeId: AL.compTrip, state: "TRUE" },
        { nodeId: T.compFault, state: "TRUE", detail: "overcurrent code reported by the drive" },
        { nodeId: T.compSpeed, state: "ABNORMAL", detail: "coasted down from full speed" },
        { nodeId: T.compVibration, state: "ABNORMAL", detail: "step change just before the trip" },
        { nodeId: T.lubePress, state: "NORMAL" },
        { nodeId: T.opcASession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "DRIVE",
        faultClass: "DRIVE_FAULT",
        faultModeId: FM.compTrip,
        supportingNodeIds: [T.compFault, T.compSpeed, AL.compTrip],
        expectedMissingNodeIds: [EV.machineTrend],
        expectedSafeActionIds: [SA.driveHistory],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-03-FS-03",
      title: t("Surge margin shrinking while the recycle valve does not move", "حاشیهٔ سرج آب می‌رود و شیر بازگردانی حرکت نمی‌کند"),
      narrative: t(
        "The anti-surge controller is driving the recycle valve open, but the position feedback has not moved and the surge margin keeps shrinking. The drive itself reports no fault.",
        "کنترلر ضدسرج شیر بازگردانی را به سمت باز شدن می‌راند، اما بازخورد موقعیت حرکتی نکرده و حاشیهٔ سرج پیوسته آب می‌رود. خود درایو هیچ خطایی گزارش نمی‌کند.",
      ),
      observations: [
        { nodeId: AL.surgeLow, state: "TRUE" },
        { nodeId: T.valvePos, state: "ABNORMAL", detail: "held at 12% against an 80% demand" },
        { nodeId: T.surgeMargin, state: "ABNORMAL", detail: "shrinking toward the control line" },
        { nodeId: T.compFault, state: "FALSE" },
        { nodeId: T.opcASession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "ACTUATOR_FAILURE",
        faultModeId: FM.valveStuck,
        supportingNodeIds: [T.valvePos, T.surgeMargin, AL.surgeLow],
        expectedMissingNodeIds: [EV.processTrend],
        expectedSafeActionIds: [SA.valveInspect],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-03-FS-04",
      title: t("Every supervisory value froze at once", "همهٔ مقادیر نظارتی هم‌زمان ثابت ماندند"),
      narrative: t(
        "Every value from both controllers stopped updating in the same second, on both redundant paths. The plant itself gives no sign of trouble and the last readings were all normal.",
        "همهٔ مقادیر هر دو کنترلر، روی هر دو مسیر افزونه، در یک ثانیهٔ واحد از به‌روزرسانی بازماندند. خود واحد هیچ نشانه‌ای از مشکل ندارد و آخرین قرائت‌ها همگی عادی بودند.",
      ),
      observations: [
        { nodeId: AL.opcStale, state: "TRUE" },
        { nodeId: T.opcASession, state: "FALSE", detail: "session A dropped" },
        { nodeId: T.opcBSession, state: "FALSE", detail: "session B dropped in the same second" },
        { nodeId: T.opcDataAge, state: "ABNORMAL", detail: "240 s and rising" },
        { nodeId: ST.sepLevel, state: "STALE" },
        { nodeId: ST.compSpeed, state: "STALE" },
      ],
      groundTruth: {
        subsystem: "TELEMETRY",
        faultClass: "COMMUNICATION_LOSS",
        faultModeId: FM.opcLoss,
        supportingNodeIds: [T.opcASession, T.opcBSession, T.opcDataAge, AL.opcStale],
        expectedMissingNodeIds: [EV.opcLinkLog],
        expectedSafeActionIds: [SA.opcVerify],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-03-FS-05",
      title: t("The ESD boundary is holding the train", "مرز ESD قطار را نگه داشته است"),
      narrative: t(
        "The train will not load. The emergency-shutdown system reports an active trip, the flare header pressure spiked during the event, and the loading step is blocked.",
        "قطار بارگیری نمی‌کند. سامانهٔ توقف اضطراری یک تریپ فعال گزارش می‌کند، فشار هدر فلر حین رویداد جهش داشته و گام بارگیری مسدود است.",
      ),
      observations: [
        { nodeId: AL.esdTrip, state: "TRUE" },
        { nodeId: I.esdTrip, state: "TRUE" },
        { nodeId: T.esdTrip, state: "TRUE", detail: "published by the ESD system" },
        { nodeId: T.flarePress, state: "ABNORMAL", detail: "spiked during the trip" },
        { nodeId: T.opcASession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "SAFETY_CIRCUIT",
        faultClass: "INTERLOCK_ACTIVE",
        faultModeId: FM.esdBoundary,
        supportingNodeIds: [I.esdTrip, T.esdTrip, T.flarePress, AL.esdTrip],
        expectedMissingNodeIds: [EV.esdEventLog],
        expectedSafeActionIds: [SA.esdReview],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-03-FS-06",
      title: t("Train ignores the start request after maintenance", "قطار پس از تعمیرات به درخواست راه‌اندازی پاسخ نمی‌دهد"),
      narrative: t(
        "After a maintenance stop the start request goes unanswered. Nothing reports a fault, both aggregation paths are healthy, and the remote permissive refuses to come in.",
        "پس از یک توقف تعمیراتی، درخواست راه‌اندازی بی‌پاسخ می‌ماند. هیچ‌چیز خطا گزارش نمی‌کند، هر دو مسیر تجمیع سالم‌اند و مجوز حالت دور برقرار نمی‌شود.",
      ),
      observations: [
        { nodeId: AL.trainNotReady, state: "TRUE" },
        { nodeId: T.trainMode, state: "ABNORMAL", detail: "selector found in LOCAL at the train panel" },
        { nodeId: P.trainRemote, state: "FALSE" },
        { nodeId: T.compFault, state: "FALSE" },
        { nodeId: T.opcASession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "HMI",
        faultClass: "INCORRECT_MODE",
        faultModeId: FM.leftInLocal,
        supportingNodeIds: [T.trainMode, P.trainRemote, AL.trainNotReady],
        expectedMissingNodeIds: [EV.auditLog],
        expectedSafeActionIds: [SA.auditReview],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-03-FS-07",
      title: t("Lube-oil pressure decaying over the shift", "افت تدریجی فشار روغن روان‌کاری در طول شیفت"),
      narrative: t(
        "The lube-oil header pressure has been decaying slowly for hours while the supply temperature creeps up. The compressor itself reports no fault and keeps running.",
        "فشار هدر روغن روان‌کاری ساعت‌هاست به‌آرامی افت می‌کند و دمای تغذیه بالا می‌خزد. خود کمپرسور هیچ خطایی گزارش نمی‌کند و در کار است.",
      ),
      observations: [
        { nodeId: AL.lubeLow, state: "TRUE" },
        { nodeId: T.lubePress, state: "ABNORMAL", detail: "slow decay toward the trip level" },
        { nodeId: T.lubeTemp, state: "ABNORMAL", detail: "creeping up since the start of the shift" },
        { nodeId: T.compFault, state: "FALSE" },
        { nodeId: T.opcASession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.lubeDecay,
        supportingNodeIds: [T.lubePress, T.lubeTemp, AL.lubeLow],
        expectedMissingNodeIds: [EV.machineTrend],
        expectedSafeActionIds: [SA.lubeInspect],
        requiresEscalation: false,
      },
    },
  ],
};
