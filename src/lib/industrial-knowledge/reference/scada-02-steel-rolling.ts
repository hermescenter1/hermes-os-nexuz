// PHASE 101 — SCADA-02: advanced steel hot-rolling line supervisory system.
//
// ORIGIN
// Original synthetic engineering reference authored for this repository. It
// contains no customer, proprietary or licensed vendor project material, and it
// is deliberately written in vendor-neutral terms: the supervisory scripting is
// the accessor idiom every web-based SCADA platform of this class shares, the
// screen definition is a plain declarative description, and the OPC UA
// aggregation layer is described by role, not by product.
//
// WHAT THIS REFERENCE EXERCISES THAT SCADA-01 DOES NOT
//   - A REDUNDANT supervisory pair. The standby server mirrors the primary and
//     the failover contract lives in the declarative configuration, so the
//     corpus can model "the supervisory layer itself is highly available"
//     rather than a single server.
//   - One OPC UA gateway aggregating BOTH controllers. Every mirrored value
//     crosses it, so a lost session freezes the whole picture at once — the
//     hot-rolling variant of the failure family SCADA-01 established with its
//     telemetry link.
//   - The ISA-18.2 alarm lifecycle as a DECLARED design object: the state
//     chain Normal → Unacknowledged → Acknowledged → Returned-unacknowledged is
//     authored as a sequence, and acknowledgement is an operator action behind
//     a role and an audit event, never a condition reset.
//   - A KPI slice (OEE, throughput, specific energy, quality yield) derived
//     from named line tags, so "how well is the line running" is traceable to
//     the same corpus objects a diagnosis cites.
//
// GOVERNANCE
// Same contract as SCADA-01: every operator-invokable script declares the role
// it demands and the audit event class its invocation emits; the automatic
// OPC UA watchdog declares an audit class and no role. These are DECLARATIONS
// of the design. Hermes grants no role, issues no command and writes no audit
// record — it has no runtime, no session and no write path to any device, and
// a `COMMANDS` edge is a statement that a screen declares a command, never one
// this system can send.

import type { AuthoredReferenceSystem } from "../types";
import { authoring, chainStates, t } from "./_authoring";

const a = authoring({
  projectId: "SCADA-02",
  subsystem: "SUPERVISORY_CORE",
  domain: "SUPERVISORY",
});

/* ── Identifiers ──────────────────────────────────────────────────────────── */

const D = {
  primary: a.id("DEVICE", "SCADA_SERVER_PRIMARY"),
  standby: a.id("DEVICE", "SCADA_SERVER_STANDBY"),
  historian: a.id("DEVICE", "HISTORIAN_HSM"),
  gateway: a.id("DEVICE", "OPCUA_GATEWAY"),
  plcFurnace: a.id("DEVICE", "PLC_FURNACE"),
  plcMill: a.id("DEVICE", "PLC_MILL"),
  driveF2: a.id("DEVICE", "DRIVE_STAND_F2"),
  opClient: a.id("DEVICE", "OPERATOR_CLIENT_HSM"),
  burnerSafety: a.id("DEVICE", "BURNER_SAFETY_CTL"),
};

const EQ = {
  furnace: a.id("EQUIPMENT", "REHEATING_FURNACE"),
  descaler: a.id("EQUIPMENT", "DESCALER"),
  standR1: a.id("EQUIPMENT", "ROUGHING_STAND_R1"),
  standF2: a.id("EQUIPMENT", "FINISHING_STAND_F2"),
  shear: a.id("EQUIPMENT", "CROP_SHEAR"),
  coiler: a.id("EQUIPMENT", "DOWN_COILER"),
};

/** The controller-side process image, as the two PLCs hold it. */
const T = {
  zone1Temp: a.id("TAG", "ZONE1_TEMP"),
  zone2Temp: a.id("TAG", "ZONE2_TEMP"),
  fceReady: a.id("TAG", "FCE_READY"),
  combAirPress: a.id("TAG", "COMBUSTION_AIR_PRESSURE"),
  fceSafetyOk: a.id("TAG", "FCE_SAFETY_OK"),
  descalerPress: a.id("TAG", "DESCALER_PRESSURE"),
  f2Ready: a.id("TAG", "F2_DRIVE_READY"),
  f2Fault: a.id("TAG", "F2_DRIVE_FAULT"),
  f2Speed: a.id("TAG", "F2_SPEED"),
  f2Current: a.id("TAG", "F2_CURRENT"),
  shearPos: a.id("TAG", "SHEAR_CYCLE_POS"),
  gaugeDev: a.id("TAG", "STRIP_GAUGE_DEV"),
  tonnage: a.id("TAG", "TONNAGE_RATE"),
  coilerMode: a.id("TAG", "COILER_MODE_REMOTE"),
  coilerTension: a.id("TAG", "COILER_TENSION"),
  opcSession: a.id("TAG", "OPCUA_SESSION_OK"),
  opcDataAge: a.id("TAG", "OPCUA_DATA_AGE"),
};

/** The supervisory tag database. Named as an operator would see it. */
const ST = {
  zone2Temp: a.id("SCADA_TAG", "HSM_Zone2_Temp"),
  fceReady: a.id("SCADA_TAG", "HSM_Fce_Ready"),
  f2Fault: a.id("SCADA_TAG", "HSM_F2_Drive_Fault"),
  f2Speed: a.id("SCADA_TAG", "HSM_F2_Speed"),
  f2Current: a.id("SCADA_TAG", "HSM_F2_Current"),
  coilerMode: a.id("SCADA_TAG", "HSM_Coiler_Mode"),
  coilerTension: a.id("SCADA_TAG", "HSM_Coiler_Tension"),
  tonnage: a.id("SCADA_TAG", "HSM_Tonnage_Rate"),
  gaugeDev: a.id("SCADA_TAG", "HSM_Gauge_Dev"),
  opcSession: a.id("SCADA_TAG", "HSM_OpcUa_Session_Ok"),
  opcDataAge: a.id("SCADA_TAG", "HSM_OpcUa_Data_Age"),
  telemetryStale: a.id("SCADA_TAG", "HSM_Telemetry_Stale"),
  millStartCmd: a.id("SCADA_TAG", "HSM_Mill_Start_Cmd"),
  zone2TrimCmd: a.id("SCADA_TAG", "HSM_Zone2_Trim_Cmd"),
  ackCmd: a.id("SCADA_TAG", "HSM_Alarm_Ack_Cmd"),
};

const IO = {
  zone2Tc: a.id("IO_POINT", "AI_ZONE2_TC"),
  combAir: a.id("IO_POINT", "AI_COMBUSTION_AIR_PRESSURE"),
  descaler: a.id("IO_POINT", "AI_DESCALER_PRESSURE"),
  gauge: a.id("IO_POINT", "AI_STRIP_GAUGE"),
  coilerTension: a.id("IO_POINT", "AI_COILER_TENSION"),
};

const SQ = a.id("SEQUENCE", "MILL_STARTUP");
const S = {
  idle: a.id("STATE", "M00_IDLE"),
  check: a.id("STATE", "M10_PERMISSIVE_CHECK"),
  atTemp: a.id("STATE", "M20_FURNACE_AT_TEMP"),
  threading: a.id("STATE", "M30_THREADING"),
  rolling: a.id("STATE", "M40_ROLLING"),
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
  fceAtTemp: a.id("PERMISSIVE", "PRM_FCE_AT_TEMP"),
  coilerRemote: a.id("PERMISSIVE", "PRM_COILER_REMOTE"),
  descalerOk: a.id("PERMISSIVE", "PRM_DESCALER_PRESSURE_OK"),
};

const I = {
  combustion: a.id("INTERLOCK", "ILK_FCE_COMBUSTION_SAFETY"),
  shearJam: a.id("INTERLOCK", "ILK_SHEAR_JAM"),
  overtension: a.id("INTERLOCK", "ILK_COILER_OVERTENSION"),
};

const AL = {
  zone2Dev: a.id("ALARM", "ALM_ZONE2_TEMP_DEVIATION"),
  f2Trip: a.id("ALARM", "ALM_F2_DRIVE_TRIP"),
  opcStale: a.id("ALARM", "ALM_OPCUA_STALE"),
  shearJam: a.id("ALARM", "ALM_SHEAR_JAM"),
  fceSafety: a.id("ALARM", "ALM_FCE_SAFETY_TRIP"),
  coilerNotReady: a.id("ALARM", "ALM_COILER_NOT_READY"),
};

const H = {
  overview: a.id("HMI_SCREEN", "Screen_LineOverview"),
  furnace: a.id("HMI_SCREEN", "Screen_Furnace"),
  mill: a.id("HMI_SCREEN", "Screen_FinishingMill"),
  coiler: a.id("HMI_SCREEN", "Screen_Coiler"),
  alarms: a.id("HMI_SCREEN", "Screen_Alarms"),
};

const HO = {
  opcHealth: a.id("HMI_OBJECT", "Ind_OpcUaHealth"),
  throughput: a.id("HMI_OBJECT", "Trend_Throughput"),
  gaugeDev: a.id("HMI_OBJECT", "Trend_GaugeDev"),
  zone2Temp: a.id("HMI_OBJECT", "Trend_Zone2Temp"),
  zone2Trim: a.id("HMI_OBJECT", "Btn_Zone2Trim"),
  standF2: a.id("HMI_OBJECT", "Fp_StandF2"),
  coilerMode: a.id("HMI_OBJECT", "Ind_CoilerMode"),
  coilerTension: a.id("HMI_OBJECT", "Trend_CoilerTension"),
  alarmBanner: a.id("HMI_OBJECT", "Banner_ActiveAlarms"),
};

const SC = {
  millStart: a.id("SCRIPT", "OnMillStartRequest"),
  zone2Trim: a.id("SCRIPT", "OnZone2TrimRequest"),
  watchdog: a.id("SCRIPT", "OnOpcUaWatchdog"),
  alarmAck: a.id("SCRIPT", "OnAlarmAcknowledge"),
};

const R = {
  operator: a.id("ROLE", "Role_MillOperator"),
  supervisor: a.id("ROLE", "Role_MillSupervisor"),
};

const AE = {
  millStart: a.id("AUDIT_EVENT_TYPE", "Audit_MillStartCommanded"),
  zone2Trim: a.id("AUDIT_EVENT_TYPE", "Audit_Zone2TrimCommanded"),
  alarmAck: a.id("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged"),
  watchdog: a.id("AUDIT_EVENT_TYPE", "Audit_OpcUaWatchdogRecord"),
};

const K = {
  oee: a.id("KPI", "KPI_OEE"),
  throughput: a.id("KPI", "KPI_THROUGHPUT"),
  specificEnergy: a.id("KPI", "KPI_SPECIFIC_ENERGY"),
  qualityYield: a.id("KPI", "KPI_QUALITY_YIELD"),
};

const EV = {
  furnaceTrend: a.id("EVIDENCE_SOURCE", "HIST_FURNACE_TREND"),
  driveTrend: a.id("EVIDENCE_SOURCE", "HIST_DRIVE_TREND"),
  opcLinkLog: a.id("EVIDENCE_SOURCE", "HIST_OPCUA_LINK_LOG"),
  lineEventLog: a.id("EVIDENCE_SOURCE", "HIST_LINE_EVENT_LOG"),
  auditLog: a.id("EVIDENCE_SOURCE", "HIST_HSM_AUDIT_LOG"),
  qualityTrend: a.id("EVIDENCE_SOURCE", "HIST_QUALITY_TREND"),
};

const FM = {
  tcStuck: a.id("FAULT_MODE", "FM_ZONE2_TC_STUCK"),
  driveTrip: a.id("FAULT_MODE", "FM_F2_DRIVE_OVERCURRENT_TRIP"),
  opcLoss: a.id("FAULT_MODE", "FM_OPCUA_SESSION_LOSS"),
  cobble: a.id("FAULT_MODE", "FM_SHEAR_COBBLE_BLOCKAGE"),
  combustion: a.id("FAULT_MODE", "FM_FCE_COMBUSTION_INTERLOCK_ACTIVE"),
  leftInLocal: a.id("FAULT_MODE", "FM_COILER_LEFT_IN_LOCAL"),
};

const SA = {
  tcCompare: a.id("SAFE_ACTION", "SA_COMPARE_ZONE2_TC_TO_PYROMETER"),
  driveHistory: a.id("SAFE_ACTION", "SA_READ_F2_DRIVE_FAULT_HISTORY"),
  opcSession: a.id("SAFE_ACTION", "SA_VERIFY_OPCUA_GATEWAY_SESSION"),
  shearInspect: a.id("SAFE_ACTION", "SA_INSPECT_CROP_SHEAR_FOR_COBBLE"),
  combustionReview: a.id("SAFE_ACTION", "SA_ESCALATE_COMBUSTION_SAFETY_REVIEW"),
  auditReview: a.id("SAFE_ACTION", "SA_REVIEW_HSM_OPERATOR_AUDIT_LOG"),
};

/* ── Engineering source ───────────────────────────────────────────────────── */

const SUPERVISORY_SCRIPTS = `// SCADA-02 — supervisory scripting for the hot-rolling line.
//
// Vendor-neutral accessor idiom: Tags("Name").Read() / .Write(value) and screen
// navigation. Nothing in this file is executed, transpiled or evaluated by
// Hermes; it is engineering text from which relationships are recovered.

function OnMillStartRequest() {
   // Operator-initiated from the finishing mill faceplate. The permissive
   // picture is READ and reported to the operator; it is NOT re-evaluated
   // here. The mill PLC owns the interlock decision, and a supervisory client
   // that second-guessed it would be a second, weaker source of truth.
   var opcOk = Tags("HSM_OpcUa_Session_Ok").Read();
   var furnaceReady = Tags("HSM_Fce_Ready").Read();
   var coilerRemote = Tags("HSM_Coiler_Mode").Read();

   if (opcOk && furnaceReady && coilerRemote) {
      Tags("HSM_Mill_Start_Cmd").Write(1);
   }

   Navigate("Screen_FinishingMill");
}

function OnZone2TrimRequest() {
   // Zone 2 setpoint trim, reserved for the shift supervisor. The current
   // temperature is read and shown before the trim is offered, and the trim
   // command itself is bounded by the controller — never by this script.
   var zone2 = Tags("HSM_Zone2_Temp").Read();

   if (zone2 > 0) {
      Tags("HSM_Zone2_Trim_Cmd").Write(1);
   }
}

function OnOpcUaWatchdog() {
   // Runs on the supervisory server's own schedule. There is no operator
   // behind it, so it declares no role — and a stale aggregation session is
   // published as its own tag rather than left as an absence for a screen to
   // infer.
   var session = Tags("HSM_OpcUa_Session_Ok").Read();
   var age = Tags("HSM_OpcUa_Data_Age").Read();

   if (!session || age > 60) {
      Tags("HSM_Telemetry_Stale").Write(1);
   }
}

function OnAlarmAcknowledge() {
   // ISA-18.2 acknowledgement: it moves an alarm from Unacknowledged to
   // Acknowledged and records that a human saw it. It changes no plant state
   // and never clears the condition that raised the alarm.
   Tags("HSM_Alarm_Ack_Cmd").Write(1);
   Navigate("Screen_Alarms");
}
`;

const OPERATOR_SCREENS = `{
  "screens": [
    {
      "name": "Screen_LineOverview",
      "titleEn": "Hot-rolling line overview",
      "titleFa": "نمای کلی خط نورد گرم",
      "navigatesTo": ["Screen_Furnace", "Screen_FinishingMill", "Screen_Coiler", "Screen_Alarms"],
      "objects": [
        {
          "name": "Ind_OpcUaHealth",
          "type": "INDICATOR",
          "displays": ["HSM_OpcUa_Session_Ok"]
        },
        {
          "name": "Trend_Throughput",
          "type": "TREND",
          "displays": ["HSM_Tonnage_Rate"]
        },
        {
          "name": "Trend_GaugeDev",
          "type": "TREND",
          "displays": ["HSM_Gauge_Dev"]
        }
      ]
    },
    {
      "name": "Screen_Furnace",
      "titleEn": "Reheating furnace",
      "titleFa": "کورهٔ پیش‌گرم",
      "navigatesTo": ["Screen_LineOverview"],
      "objects": [
        {
          "name": "Trend_Zone2Temp",
          "type": "TREND",
          "displays": ["HSM_Zone2_Temp"]
        },
        {
          "name": "Btn_Zone2Trim",
          "type": "BUTTON",
          "commands": ["HSM_Zone2_Trim_Cmd"],
          "permission": "ZONE_TRIM",
          "requiresConfirmation": true
        }
      ]
    },
    {
      "name": "Screen_FinishingMill",
      "titleEn": "Finishing mill",
      "titleFa": "قفسهٔ نهایی نورد",
      "navigatesTo": ["Screen_LineOverview"],
      "objects": [
        {
          "name": "Fp_StandF2",
          "type": "FACEPLATE",
          "displays": ["HSM_F2_Drive_Fault", "HSM_F2_Speed", "HSM_F2_Current"],
          "commands": ["HSM_Mill_Start_Cmd"],
          "permission": "MILL_COMMAND",
          "requiresConfirmation": true
        }
      ]
    },
    {
      "name": "Screen_Coiler",
      "titleEn": "Down coiler",
      "titleFa": "کلاف‌پیچ",
      "navigatesTo": ["Screen_LineOverview"],
      "objects": [
        {
          "name": "Ind_CoilerMode",
          "type": "INDICATOR",
          "displays": ["HSM_Coiler_Mode"]
        },
        {
          "name": "Trend_CoilerTension",
          "type": "TREND",
          "displays": ["HSM_Coiler_Tension"]
        }
      ]
    },
    {
      "name": "Screen_Alarms",
      "titleEn": "Active alarms",
      "titleFa": "آلارم‌های فعال",
      "navigatesTo": ["Screen_LineOverview"],
      "objects": [
        {
          "name": "Banner_ActiveAlarms",
          "type": "ALARM_BANNER",
          "displays": ["HSM_Telemetry_Stale"],
          "commands": ["HSM_Alarm_Ack_Cmd"],
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
    "gateway": "OPCUA_GATEWAY",
    "protocol": "OPC_UA",
    "endpoints": [
      { "controller": "PLC_FURNACE", "samplingMs": 1000 },
      { "controller": "PLC_MILL", "samplingMs": 250 }
    ],
    "staleAfterSeconds": 60
  },
  "historian": {
    "id": "HISTORIAN_HSM",
    "archives": [
      { "id": "HIST_FURNACE_TREND", "sampleSeconds": 5, "retentionDays": 400 },
      { "id": "HIST_DRIVE_TREND", "sampleSeconds": 1, "retentionDays": 90 },
      { "id": "HIST_OPCUA_LINK_LOG", "sampleSeconds": 10, "retentionDays": 180 },
      { "id": "HIST_LINE_EVENT_LOG", "sampleSeconds": 0, "retentionDays": 400 },
      { "id": "HIST_HSM_AUDIT_LOG", "sampleSeconds": 0, "retentionDays": 1825 },
      { "id": "HIST_QUALITY_TREND", "sampleSeconds": 5, "retentionDays": 730 }
    ]
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
      { "code": "ALM_ZONE2_TEMP_DEVIATION", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_F2_DRIVE_TRIP", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_OPCUA_STALE", "priority": "HIGH", "requiresAck": true },
      { "code": "ALM_SHEAR_JAM", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_FCE_SAFETY_TRIP", "priority": "URGENT", "requiresAck": true },
      { "code": "ALM_COILER_NOT_READY", "priority": "MEDIUM", "requiresAck": true }
    ]
  }
}
`;

/* ── System ───────────────────────────────────────────────────────────────── */

export const SCADA_02_STEEL_ROLLING: AuthoredReferenceSystem = {
  id: "SCADA-02",
  name: t(
    "Advanced steel hot-rolling line supervisory system",
    "سامانهٔ نظارتی پیشرفتهٔ خط نورد گرم فولاد",
  ),
  domain: t(
    "Reheating, descaling, rolling, shearing, coiling and OPC UA supervision",
    "پیش‌گرم، رسوب‌زدایی، نورد، برش و کلاف‌پیچی با نظارت OPC UA",
  ),
  sourceType: "SCADA_REFERENCE",
  platform:
    "Vendor-neutral redundant supervisory platform: JavaScript scripting, declarative screens, OPC UA aggregation",
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
        "Hot standby. It mirrors the primary and takes over per the declared failover contract; it is a design fact here, not a runtime this system participates in.",
        "آماده‌به‌کار گرم. سرور اصلی را آینه می‌کند و طبق قرارداد اعلام‌شدهٔ جایگزینی، کار را بر عهده می‌گیرد؛ اینجا یک واقعیت طراحی است، نه زمان اجرایی که این سامانه در آن شرکت کند.",
      ),
    }),
    a.node("DEVICE", "HISTORIAN_HSM", t("Line historian", "تاریخ‌نگار خط"), {
      domain: "MAINTENANCE",
      attributes: {
        deviceCategory: "INDUSTRIAL_PC",
        networkZone: "SUPERVISORY",
        protocol: "HISTORIAN",
      },
    }),
    a.node("DEVICE", "OPCUA_GATEWAY", t("OPC UA aggregation gateway", "دروازهٔ تجمیع OPC UA"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "GATEWAY", networkZone: "DMZ", protocol: "OPC_UA" },
      description: t(
        "Single aggregation point through which both controllers publish. Its session health is therefore a diagnosis in its own right, not a footnote to the stand or the furnace.",
        "تنها نقطهٔ تجمیعی که هر دو کنترلر از طریق آن منتشر می‌کنند. بنابراین سلامت نشست آن خود یک تشخیص مستقل است، نه پانوشتی بر وضعیت قفسه یا کوره.",
      ),
    }),
    a.node("DEVICE", "PLC_FURNACE", t("Reheating furnace controller", "کنترلر کورهٔ پیش‌گرم"), {
      subsystem: "REHEAT_FURNACE",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OPC_UA" },
    }),
    a.node("DEVICE", "PLC_MILL", t("Rolling mill controller", "کنترلر خط نورد"), {
      subsystem: "ROLLING_MILL",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "OPC_UA" },
    }),
    a.node("DEVICE", "DRIVE_STAND_F2", t("Finishing stand F2 main drive", "درایو اصلی قفسهٔ نهایی F2"), {
      subsystem: "ROLLING_MILL",
      domain: "DRIVES",
      attributes: { deviceCategory: "VFD", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "OPERATOR_CLIENT_HSM", t("Operator client", "کلاینت اپراتور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { deviceCategory: "HMI", networkZone: "SUPERVISORY" },
    }),
    a.node("DEVICE", "BURNER_SAFETY_CTL", t("Burner management safety controller", "کنترلر ایمنی مدیریت مشعل"), {
      subsystem: "REHEAT_FURNACE",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { deviceCategory: "SAFETY_CONTROLLER", networkZone: "SAFETY" },
      description: t(
        "Review-only within Hermes. The combustion safety chain is observed, never reset, inhibited or commanded.",
        "در هرمس فقط قابل بازبینی است. زنجیرهٔ ایمنی احتراق مشاهده می‌شود و هرگز ریست، غیرفعال یا فرمان‌دهی نمی‌شود.",
      ),
    }),

    /* Equipment */
    a.node("EQUIPMENT", "REHEATING_FURNACE", t("Reheating furnace", "کورهٔ پیش‌گرم"), {
      subsystem: "REHEAT_FURNACE",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "DESCALER", t("High-pressure descaler", "رسوب‌زدای پرفشار"), {
      subsystem: "ROLLING_MILL",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "ROUGHING_STAND_R1", t("Roughing stand R1", "قفسهٔ خشن‌کاری R1"), {
      subsystem: "ROLLING_MILL",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "FINISHING_STAND_F2", t("Finishing stand F2", "قفسهٔ نهایی F2"), {
      subsystem: "ROLLING_MILL",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "CROP_SHEAR", t("Crop shear", "قیچی سروته‌زن"), {
      subsystem: "ROLLING_MILL",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "DOWN_COILER", t("Down coiler", "کلاف‌پیچ"), {
      subsystem: "COILER_AREA",
      domain: "MECHANICAL",
    }),

    /* Controller-side process image */
    a.node("TAG", "ZONE1_TEMP", t("Zone 1 temperature", "دمای ناحیهٔ ۱"), {
      subsystem: "REHEAT_FURNACE",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "ZONE2_TEMP", t("Zone 2 temperature", "دمای ناحیهٔ ۲"), {
      subsystem: "REHEAT_FURNACE",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ" },
    }),
    a.node("TAG", "FCE_READY", t("Furnace ready for rolling", "آمادگی کوره برای نورد"), {
      subsystem: "REHEAT_FURNACE",
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "COMBUSTION_AIR_PRESSURE", t("Combustion air pressure", "فشار هوای احتراق"), {
      subsystem: "REHEAT_FURNACE",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "mbar", accessMode: "READ" },
    }),
    a.node("TAG", "FCE_SAFETY_OK", t("Combustion safety chain healthy", "سلامت زنجیرهٔ ایمنی احتراق"), {
      subsystem: "REHEAT_FURNACE",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "DESCALER_PRESSURE", t("Descaler water pressure", "فشار آب رسوب‌زدا"), {
      subsystem: "ROLLING_MILL",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" },
    }),
    a.node("TAG", "F2_DRIVE_READY", t("F2 drive ready", "آمادگی درایو F2"), {
      subsystem: "ROLLING_MILL",
      domain: "DRIVES",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "F2_DRIVE_FAULT", t("F2 drive fault", "خطای درایو F2"), {
      subsystem: "ROLLING_MILL",
      domain: "DRIVES",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "F2_SPEED", t("F2 roll speed", "سرعت غلتک F2"), {
      subsystem: "ROLLING_MILL",
      domain: "DRIVES",
      attributes: { dataType: "REAL", unit: "rpm", accessMode: "READ" },
    }),
    a.node("TAG", "F2_CURRENT", t("F2 motor current", "جریان موتور F2"), {
      subsystem: "ROLLING_MILL",
      domain: "ENERGY",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ" },
    }),
    a.node("TAG", "SHEAR_CYCLE_POS", t("Crop shear cycle position", "موقعیت سیکل قیچی سروته‌زن"), {
      subsystem: "ROLLING_MILL",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "deg", accessMode: "READ" },
    }),
    a.node("TAG", "STRIP_GAUGE_DEV", t("Strip gauge deviation", "انحراف ضخامت تسمه"), {
      subsystem: "ROLLING_MILL",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "mm", accessMode: "READ" },
    }),
    a.node("TAG", "TONNAGE_RATE", t("Rolled tonnage rate", "نرخ تناژ نوردشده"), {
      subsystem: "ROLLING_MILL",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "t/h", accessMode: "READ" },
    }),
    a.node("TAG", "COILER_MODE_REMOTE", t("Coiler in remote/auto", "کلاف‌پیچ در حالت دور/خودکار"), {
      subsystem: "COILER_AREA",
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "FALSE means somebody left the coiler station in local. The evidence for that is an operator action, not a plant state.",
        "مقدار FALSE یعنی کسی ایستگاه کلاف‌پیچ را در حالت محلی رها کرده است. شاهد این موضوع یک اقدام اپراتوری است، نه یک وضعیت فرایندی.",
      ),
    }),
    a.node("TAG", "COILER_TENSION", t("Coiler strip tension", "کشش تسمهٔ کلاف‌پیچ"), {
      subsystem: "COILER_AREA",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "kN", accessMode: "READ" },
    }),
    a.node("TAG", "OPCUA_SESSION_OK", t("OPC UA session healthy", "سلامت نشست OPC UA"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "OPCUA_DATA_AGE", t("Age of newest OPC UA sample", "سن تازه‌ترین نمونهٔ OPC UA"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "s", accessMode: "READ" },
    }),

    /* Supervisory tag database */
    a.node("SCADA_TAG", "HSM_Zone2_Temp", t("Zone 2 temperature (supervisory)", "دمای ناحیهٔ ۲ (نظارتی)"), {
      subsystem: "REHEAT_FURNACE",
      attributes: { dataType: "REAL", unit: "C", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "HSM_Fce_Ready", t("Furnace ready (supervisory)", "آمادگی کوره (نظارتی)"), {
      subsystem: "REHEAT_FURNACE",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "HSM_F2_Drive_Fault", t("F2 drive fault (supervisory)", "خطای درایو F2 (نظارتی)"), {
      subsystem: "ROLLING_MILL",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "HSM_F2_Speed", t("F2 roll speed (supervisory)", "سرعت غلتک F2 (نظارتی)"), {
      subsystem: "ROLLING_MILL",
      attributes: { dataType: "REAL", unit: "rpm", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "HSM_F2_Current", t("F2 motor current (supervisory)", "جریان موتور F2 (نظارتی)"), {
      subsystem: "ROLLING_MILL",
      attributes: { dataType: "REAL", unit: "A", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "HSM_Coiler_Mode", t("Coiler mode (supervisory)", "حالت کلاف‌پیچ (نظارتی)"), {
      subsystem: "COILER_AREA",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "HSM_Coiler_Tension", t("Coiler tension (supervisory)", "کشش کلاف‌پیچ (نظارتی)"), {
      subsystem: "COILER_AREA",
      attributes: { dataType: "REAL", unit: "kN", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "HSM_Tonnage_Rate", t("Tonnage rate (supervisory)", "نرخ تناژ (نظارتی)"), {
      subsystem: "ROLLING_MILL",
      attributes: { dataType: "REAL", unit: "t/h", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "HSM_Gauge_Dev", t("Gauge deviation (supervisory)", "انحراف ضخامت (نظارتی)"), {
      subsystem: "ROLLING_MILL",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "mm", accessMode: "READ", protocol: "OPC_UA" },
    }),
    a.node("SCADA_TAG", "HSM_OpcUa_Session_Ok", t("OPC UA session healthy (supervisory)", "سلامت نشست OPC UA (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "HSM_OpcUa_Data_Age", t("OPC UA sample age", "سن نمونهٔ OPC UA"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "s", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "HSM_Telemetry_Stale", t("Aggregation stale flag", "پرچم کهنگی تجمیع"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ_WRITE" },
      description: t(
        "Published by the watchdog rather than inferred by each screen, so every surface reads the same judgement about the same session.",
        "به‌جای استنتاج در هر صفحه، توسط دیدبان منتشر می‌شود تا همهٔ سطوح یک قضاوت یکسان دربارهٔ همان نشست بخوانند.",
      ),
    }),
    a.node("SCADA_TAG", "HSM_Mill_Start_Cmd", t("Mill start command", "فرمان راه‌اندازی نورد"), {
      subsystem: "ROLLING_MILL",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "MILL_COMMAND", requiresConfirmation: true },
      description: t(
        "A DECLARED operator command. Hermes issues no command on this or any other tag.",
        "یک فرمان اپراتوری اعلام‌شده. هرمس روی این تگ یا هر تگ دیگری هیچ فرمانی صادر نمی‌کند.",
      ),
    }),
    a.node("SCADA_TAG", "HSM_Zone2_Trim_Cmd", t("Zone 2 setpoint trim command", "فرمان اصلاح نقطهٔ کار ناحیهٔ ۲"), {
      subsystem: "REHEAT_FURNACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "ZONE_TRIM", requiresConfirmation: true },
    }),
    a.node("SCADA_TAG", "HSM_Alarm_Ack_Cmd", t("Alarm acknowledge command", "فرمان تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "ALARM_ACK", requiresConfirmation: false },
      description: t(
        "ISA-18.2 acknowledgement records that a human saw the alarm. It clears no condition, so the design deliberately does not put a confirmation dialogue in front of it.",
        "تأیید طبق ISA-18.2 فقط ثبت می‌کند که انسانی آلارم را دیده است. هیچ شرطی را پاک نمی‌کند، بنابراین طراحی عمداً پیش از آن پنجرهٔ تأیید قرار نمی‌دهد.",
      ),
    }),

    /* Field channels */
    a.node("IO_POINT", "AI_ZONE2_TC", t("Zone 2 thermocouple", "ترموکوپل ناحیهٔ ۲"), {
      subsystem: "REHEAT_FURNACE",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "C" },
    }),
    a.node("IO_POINT", "AI_COMBUSTION_AIR_PRESSURE", t("Combustion air pressure transmitter", "ترانسمیتر فشار هوای احتراق"), {
      subsystem: "REHEAT_FURNACE",
      domain: "FIELD_IO",
      safetyClass: "SAFETY_RELATED",
      attributes: { channelType: "AI", unit: "mbar" },
    }),
    a.node("IO_POINT", "AI_DESCALER_PRESSURE", t("Descaler pressure transmitter", "ترانسمیتر فشار رسوب‌زدا"), {
      subsystem: "ROLLING_MILL",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "bar" },
    }),
    a.node("IO_POINT", "AI_STRIP_GAUGE", t("Strip gauge sensor", "حسگر ضخامت تسمه"), {
      subsystem: "ROLLING_MILL",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "mm" },
    }),
    a.node("IO_POINT", "AI_COILER_TENSION", t("Coiler tension load cell", "لودسل کشش کلاف‌پیچ"), {
      subsystem: "COILER_AREA",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "kN" },
    }),

    /* Mill start-up sequence */
    a.node("SEQUENCE", "MILL_STARTUP", t("Mill start-up sequence", "توالی راه‌اندازی نورد"), {
      subsystem: "ROLLING_MILL",
      domain: "CONTROL_LOGIC",
    }),
    a.node("STATE", "M00_IDLE", t("Idle", "بی‌کار"), {
      subsystem: "ROLLING_MILL",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 0 },
    }),
    a.node("STATE", "M10_PERMISSIVE_CHECK", t("Permissive check", "بررسی مجوزها"), {
      subsystem: "ROLLING_MILL",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 10, stepTimeoutSeconds: 60 },
    }),
    a.node("STATE", "M20_FURNACE_AT_TEMP", t("Furnace at temperature", "کوره در دمای کار"), {
      subsystem: "ROLLING_MILL",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 20, stepTimeoutSeconds: 1800 },
    }),
    a.node("STATE", "M30_THREADING", t("Threading", "هدایت سر تسمه"), {
      subsystem: "ROLLING_MILL",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 30, stepTimeoutSeconds: 300 },
    }),
    a.node("STATE", "M40_ROLLING", t("Rolling", "نورد"), {
      subsystem: "ROLLING_MILL",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 40 },
    }),

    /* ISA-18.2 alarm lifecycle, declared as a design object */
    a.node("SEQUENCE", "ALARM_LIFECYCLE", t("ISA-18.2 alarm lifecycle", "چرخهٔ عمر آلارم ISA-18.2"), {
      domain: "OPERATOR_INTERFACE",
      description: t(
        "The declared alarm philosophy of the line, in ISA-18.2 stages. Acknowledgement moves an alarm between these states and never clears the underlying condition.",
        "فلسفهٔ اعلام‌شدهٔ آلارم خط، در مراحل ISA-18.2. تأیید، آلارم را بین این حالت‌ها جابه‌جا می‌کند و هرگز شرط زیربنایی را پاک نمی‌کند.",
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
    a.node("PERMISSIVE", "PRM_OPCUA_FRESH", t("OPC UA picture fresh enough to act on", "تازگی کافی تصویر OPC UA برای اقدام"), {
      domain: "NETWORK",
      description: t(
        "A permissive about DATA, not about plant. It fails when the aggregated picture is old, even if every physical condition it summarises is still fine.",
        "مجوزی دربارهٔ داده است، نه دربارهٔ فرایند. وقتی تصویر تجمیع‌شده کهنه شود ناموفق می‌شود، حتی اگر همهٔ شرایط فیزیکی خلاصه‌شده در آن هنوز درست باشند.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_FCE_AT_TEMP", t("Furnace at rolling temperature", "کوره در دمای نورد"), {
      subsystem: "REHEAT_FURNACE",
      domain: "PROCESS",
    }),
    a.node("PERMISSIVE", "PRM_COILER_REMOTE", t("Coiler in remote/auto", "کلاف‌پیچ در حالت دور/خودکار"), {
      subsystem: "COILER_AREA",
      domain: "CONTROL_LOGIC",
    }),
    a.node("PERMISSIVE", "PRM_DESCALER_PRESSURE_OK", t("Descaler pressure sufficient", "کفایت فشار رسوب‌زدا"), {
      subsystem: "ROLLING_MILL",
      domain: "PROCESS",
    }),

    /* Interlocks */
    a.node("INTERLOCK", "ILK_FCE_COMBUSTION_SAFETY", t("Combustion safety chain active", "زنجیرهٔ ایمنی احتراق فعال"), {
      subsystem: "REHEAT_FURNACE",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_SHEAR_JAM", t("Crop shear jam protection", "حفاظت گیرکردن قیچی سروته‌زن"), {
      subsystem: "ROLLING_MILL",
      domain: "PROCESS",
    }),
    a.node("INTERLOCK", "ILK_COILER_OVERTENSION", t("Coiler overtension protection", "حفاظت کشش بیش‌ازحد کلاف‌پیچ"), {
      subsystem: "COILER_AREA",
      domain: "PROCESS",
    }),

    /* Alarms */
    a.node("ALARM", "ALM_ZONE2_TEMP_DEVIATION", t("Zone 2 temperature deviation", "انحراف دمای ناحیهٔ ۲"), {
      subsystem: "REHEAT_FURNACE",
      domain: "PROCESS",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_F2_DRIVE_TRIP", t("F2 drive trip", "تریپ درایو F2"), {
      subsystem: "ROLLING_MILL",
      domain: "DRIVES",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_OPCUA_STALE", t("OPC UA aggregation stale", "کهنگی تجمیع OPC UA"), {
      domain: "NETWORK",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_SHEAR_JAM", t("Crop shear jam", "گیرکردن قیچی سروته‌زن"), {
      subsystem: "ROLLING_MILL",
      domain: "PROCESS",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_FCE_SAFETY_TRIP", t("Combustion safety trip", "تریپ ایمنی احتراق"), {
      subsystem: "REHEAT_FURNACE",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_COILER_NOT_READY", t("Coiler not ready", "عدم آمادگی کلاف‌پیچ"), {
      subsystem: "COILER_AREA",
      domain: "CONTROL_LOGIC",
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),

    /* Operator screens and objects */
    a.node("HMI_SCREEN", "Screen_LineOverview", t("Hot-rolling line overview", "نمای کلی خط نورد گرم"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Furnace", t("Reheating furnace", "کورهٔ پیش‌گرم"), {
      subsystem: "REHEAT_FURNACE",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_FinishingMill", t("Finishing mill", "قفسهٔ نهایی نورد"), {
      subsystem: "ROLLING_MILL",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Coiler", t("Down coiler", "کلاف‌پیچ"), {
      subsystem: "COILER_AREA",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Alarms", t("Active alarms", "آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_OpcUaHealth", t("OPC UA health indicator", "نشانگر سلامت OPC UA"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_Throughput", t("Throughput trend", "روند تناژ"), {
      subsystem: "ROLLING_MILL",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_GaugeDev", t("Gauge deviation trend", "روند انحراف ضخامت"), {
      subsystem: "ROLLING_MILL",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_Zone2Temp", t("Zone 2 temperature trend", "روند دمای ناحیهٔ ۲"), {
      subsystem: "REHEAT_FURNACE",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Btn_Zone2Trim", t("Zone 2 trim button", "دکمهٔ اصلاح ناحیهٔ ۲"), {
      subsystem: "REHEAT_FURNACE",
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "ZONE_TRIM", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Fp_StandF2", t("Stand F2 faceplate", "فیس‌پلیت قفسهٔ F2"), {
      subsystem: "ROLLING_MILL",
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "MILL_COMMAND", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Ind_CoilerMode", t("Coiler mode indicator", "نشانگر حالت کلاف‌پیچ"), {
      subsystem: "COILER_AREA",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_CoilerTension", t("Coiler tension trend", "روند کشش کلاف‌پیچ"), {
      subsystem: "COILER_AREA",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Banner_ActiveAlarms", t("Active alarm banner", "نوار آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "ALARM_ACK", requiresConfirmation: false },
    }),

    /* Supervisory scripts */
    a.node("SCRIPT", "OnMillStartRequest", t("Mill start request handler", "پردازندهٔ درخواست راه‌اندازی نورد"), {
      subsystem: "ROLLING_MILL",
      attributes: { humanInvokable: true, requiredPermission: "MILL_COMMAND" },
      description: t(
        "Invoked by an operator from the finishing mill faceplate.",
        "توسط اپراتور از فیس‌پلیت قفسهٔ نهایی فراخوانی می‌شود.",
      ),
    }),
    a.node("SCRIPT", "OnZone2TrimRequest", t("Zone 2 trim request handler", "پردازندهٔ درخواست اصلاح ناحیهٔ ۲"), {
      subsystem: "REHEAT_FURNACE",
      attributes: { humanInvokable: true, requiredPermission: "ZONE_TRIM" },
    }),
    a.node("SCRIPT", "OnAlarmAcknowledge", t("Alarm acknowledge handler", "پردازندهٔ تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "ALARM_ACK" },
    }),
    a.node("SCRIPT", "OnOpcUaWatchdog", t("OPC UA session watchdog", "دیدبان نشست OPC UA"), {
      domain: "NETWORK",
      description: t(
        "Runs on the supervisory server's schedule. It declares no role because no operator invokes it, and humanInvokable is deliberately left undeclared: absence means false.",
        "بر اساس زمان‌بندی سرور نظارتی اجرا می‌شود. چون هیچ اپراتوری آن را فراخوانی نمی‌کند، هیچ نقشی اعلام نمی‌کند و humanInvokable عمداً اعلام‌نشده مانده است: نبودن یعنی نادرست.",
      ),
    }),

    /* Governance */
    a.node("ROLE", "Role_MillOperator", t("Mill operator", "اپراتور نورد")),
    a.node("ROLE", "Role_MillSupervisor", t("Mill shift supervisor", "سرپرست شیفت نورد")),
    a.node("AUDIT_EVENT_TYPE", "Audit_MillStartCommanded", t("Mill start commanded", "صدور فرمان راه‌اندازی نورد")),
    a.node("AUDIT_EVENT_TYPE", "Audit_Zone2TrimCommanded", t("Zone 2 trim commanded", "صدور فرمان اصلاح ناحیهٔ ۲")),
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
    a.node("KPI", "KPI_THROUGHPUT", t("Line throughput", "تناژ خروجی خط"), {
      domain: "PROCESS",
      attributes: { unit: "t/h", formula: "rolled tonnage / operating hour" },
    }),
    a.node("KPI", "KPI_SPECIFIC_ENERGY", t("Specific rolling energy", "انرژی ویژهٔ نورد"), {
      domain: "ENERGY",
      attributes: { unit: "kWh/t", formula: "drive energy / rolled tonnage" },
    }),
    a.node("KPI", "KPI_QUALITY_YIELD", t("In-gauge quality yield", "بازده کیفی در محدودهٔ ضخامت"), {
      domain: "QUALITY",
      attributes: { unit: "%", formula: "in-gauge tonnage / total tonnage" },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_FURNACE_TREND", t("Furnace trend archive", "بایگانی روند کوره"), {
      subsystem: "REHEAT_FURNACE",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 400, sampleIntervalSeconds: 5 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_DRIVE_TREND", t("Drive trend archive", "بایگانی روند درایو"), {
      subsystem: "ROLLING_MILL",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 90, sampleIntervalSeconds: 1 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_OPCUA_LINK_LOG", t("OPC UA session log", "گزارش نشست OPC UA"), {
      domain: "NETWORK",
      attributes: { retentionDays: 180, sampleIntervalSeconds: 10 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_LINE_EVENT_LOG", t("Line event log", "گزارش رویدادهای خط"), {
      subsystem: "ROLLING_MILL",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 400 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_HSM_AUDIT_LOG", t("Operator audit log", "گزارش ممیزی اپراتور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { retentionDays: 1825 },
      description: t(
        "Where the audit events the scripts declare would be recorded. Hermes reads about it here; it does not write to it.",
        "جایی که رویدادهای ممیزی اعلام‌شده توسط اسکریپت‌ها ثبت می‌شوند. هرمس اینجا دربارهٔ آن می‌خواند و در آن نمی‌نویسد.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_QUALITY_TREND", t("Quality trend archive", "بایگانی روند کیفیت"), {
      subsystem: "ROLLING_MILL",
      domain: "QUALITY",
      attributes: { retentionDays: 730, sampleIntervalSeconds: 5 },
    }),

    /* Fault modes */
    a.node("FAULT_MODE", "FM_ZONE2_TC_STUCK", t("Zone 2 thermocouple stuck", "گیرکردن ترموکوپل ناحیهٔ ۲"), {
      subsystem: "REHEAT_FURNACE",
      domain: "FIELD_IO",
      attributes: { faultClass: "SENSOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_F2_DRIVE_OVERCURRENT_TRIP", t("F2 main drive overcurrent trip", "تریپ اضافه‌جریان درایو اصلی F2"), {
      subsystem: "ROLLING_MILL",
      domain: "DRIVES",
      attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
    }),
    a.node("FAULT_MODE", "FM_OPCUA_SESSION_LOSS", t("OPC UA aggregation session lost", "قطع نشست تجمیع OPC UA"), {
      domain: "NETWORK",
      attributes: { faultClass: "COMMUNICATION_LOSS", subsystem: "TELEMETRY" },
    }),
    a.node("FAULT_MODE", "FM_SHEAR_COBBLE_BLOCKAGE", t("Cobble jammed in the crop shear", "گیرکردن کوبل در قیچی سروته‌زن"), {
      subsystem: "ROLLING_MILL",
      domain: "MECHANICAL",
      attributes: { faultClass: "BLOCKAGE", subsystem: "MECHANICAL" },
    }),
    a.node("FAULT_MODE", "FM_FCE_COMBUSTION_INTERLOCK_ACTIVE", t("Combustion safety holding the furnace", "نگه‌داشتن کوره توسط ایمنی احتراق"), {
      subsystem: "REHEAT_FURNACE",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "INTERLOCK_ACTIVE", subsystem: "SAFETY_CIRCUIT" },
    }),
    a.node("FAULT_MODE", "FM_COILER_LEFT_IN_LOCAL", t("Coiler left in local mode", "رهاشدن کلاف‌پیچ در حالت محلی"), {
      subsystem: "COILER_AREA",
      domain: "OPERATOR_INTERFACE",
      attributes: { faultClass: "INCORRECT_MODE", subsystem: "HMI" },
    }),

    /* Safe actions — instructions for a qualified human being */
    a.node("SAFE_ACTION", "SA_COMPARE_ZONE2_TC_TO_PYROMETER", t("Compare the zone 2 reading to a portable pyrometer", "مقایسهٔ قرائت ناحیهٔ ۲ با پیرومتر قابل حمل"), {
      subsystem: "REHEAT_FURNACE",
      domain: "FIELD_IO",
    }),
    a.node("SAFE_ACTION", "SA_READ_F2_DRIVE_FAULT_HISTORY", t("Read the F2 drive fault history", "خواندن تاریخچهٔ خطای درایو F2"), {
      subsystem: "ROLLING_MILL",
      domain: "DRIVES",
    }),
    a.node("SAFE_ACTION", "SA_VERIFY_OPCUA_GATEWAY_SESSION", t("Verify the OPC UA gateway session", "بررسی نشست دروازهٔ OPC UA"), {
      domain: "NETWORK",
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_CROP_SHEAR_FOR_COBBLE", t("Inspect the crop shear area for a cobble", "بازرسی محوطهٔ قیچی سروته‌زن از نظر کوبل"), {
      subsystem: "ROLLING_MILL",
      domain: "MECHANICAL",
      description: t(
        "From a safe position and per the line clearance and isolation procedure. Never while the line is able to move.",
        "از موقعیت ایمن و طبق دستورالعمل پاک‌سازی و جداسازی خط. هرگز در حالی که خط امکان حرکت دارد.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_COMBUSTION_SAFETY_REVIEW", t("Escalate to a combustion safety review", "ارجاع به بازبینی ایمنی احتراق"), {
      subsystem: "REHEAT_FURNACE",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Review-only. The burner management safety chain is never reset, inhibited or bypassed from here or from anywhere else in Hermes.",
        "فقط قابل بازبینی. زنجیرهٔ ایمنی مدیریت مشعل هرگز از اینجا یا از هیچ جای دیگر هرمس ریست، غیرفعال یا دور زده نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_HSM_OPERATOR_AUDIT_LOG", t("Review the operator audit log", "بازبینی گزارش ممیزی اپراتور"), {
      domain: "OPERATOR_INTERFACE",
    }),
  ],

  edges: [
    /* Containment */
    a.edge(D.plcFurnace, T.zone1Temp, "CONTAINS"),
    a.edge(D.plcFurnace, T.zone2Temp, "CONTAINS"),
    a.edge(D.plcFurnace, T.fceReady, "CONTAINS"),
    a.edge(D.plcFurnace, T.combAirPress, "CONTAINS"),
    a.edge(D.burnerSafety, T.fceSafetyOk, "CONTAINS"),
    a.edge(D.plcMill, T.descalerPress, "CONTAINS"),
    a.edge(D.plcMill, T.f2Ready, "CONTAINS"),
    a.edge(D.plcMill, T.f2Fault, "CONTAINS"),
    a.edge(D.plcMill, T.f2Speed, "CONTAINS"),
    a.edge(D.plcMill, T.f2Current, "CONTAINS"),
    a.edge(D.plcMill, T.shearPos, "CONTAINS"),
    a.edge(D.plcMill, T.gaugeDev, "CONTAINS"),
    a.edge(D.plcMill, T.tonnage, "CONTAINS"),
    a.edge(D.plcMill, T.coilerMode, "CONTAINS"),
    a.edge(D.plcMill, T.coilerTension, "CONTAINS"),
    a.edge(D.gateway, T.opcSession, "CONTAINS"),
    a.edge(D.gateway, T.opcDataAge, "CONTAINS"),
    a.edge(D.primary, ST.zone2Temp, "CONTAINS"),
    a.edge(D.primary, ST.f2Speed, "CONTAINS"),
    a.edge(D.primary, ST.opcSession, "CONTAINS"),
    a.edge(D.primary, ST.opcDataAge, "CONTAINS"),
    a.edge(D.primary, ST.telemetryStale, "CONTAINS"),
    a.edge(D.primary, ST.millStartCmd, "CONTAINS"),
    a.edge(D.primary, AQ, "CONTAINS"),
    a.edge(D.opClient, H.overview, "CONTAINS"),
    a.edge(D.opClient, H.furnace, "CONTAINS"),
    a.edge(D.opClient, H.mill, "CONTAINS"),
    a.edge(D.opClient, H.coiler, "CONTAINS"),
    a.edge(D.opClient, H.alarms, "CONTAINS"),
    a.edge(H.overview, HO.opcHealth, "CONTAINS"),
    a.edge(H.overview, HO.throughput, "CONTAINS"),
    a.edge(H.overview, HO.gaugeDev, "CONTAINS"),
    a.edge(H.furnace, HO.zone2Temp, "CONTAINS"),
    a.edge(H.furnace, HO.zone2Trim, "CONTAINS"),
    a.edge(H.mill, HO.standF2, "CONTAINS"),
    a.edge(H.coiler, HO.coilerMode, "CONTAINS"),
    a.edge(H.coiler, HO.coilerTension, "CONTAINS"),
    a.edge(H.alarms, HO.alarmBanner, "CONTAINS"),
    a.edge(SQ, S.idle, "CONTAINS"),
    a.edge(SQ, S.check, "CONTAINS"),
    a.edge(SQ, S.atTemp, "CONTAINS"),
    a.edge(SQ, S.threading, "CONTAINS"),
    a.edge(SQ, S.rolling, "CONTAINS"),
    a.edge(AQ, AS.normal, "CONTAINS"),
    a.edge(AQ, AS.unack, "CONTAINS"),
    a.edge(AQ, AS.acked, "CONTAINS"),
    a.edge(AQ, AS.rtnUnack, "CONTAINS"),

    /* Redundancy: the standby mirrors the primary. A design fact, not a runtime. */
    a.edge(
      D.standby,
      D.primary,
      "MIRRORS",
      t("Hot standby of the primary supervisory server", "آماده‌به‌کار گرمِ سرور نظارتی اصلی"),
    ),

    /* Field channels to the controller image */
    a.edge(T.zone2Temp, IO.zone2Tc, "BOUND_TO"),
    a.edge(T.combAirPress, IO.combAir, "BOUND_TO"),
    a.edge(T.descalerPress, IO.descaler, "BOUND_TO"),
    a.edge(T.gaugeDev, IO.gauge, "BOUND_TO"),
    a.edge(T.coilerTension, IO.coilerTension, "BOUND_TO"),

    /* Supervisory image mirrors the controller image across the OPC UA
     * gateway. This is the seam where a healthy plant and an unhealthy
     * PICTURE of it become distinguishable. */
    a.edge(ST.zone2Temp, T.zone2Temp, "MIRRORS"),
    a.edge(ST.fceReady, T.fceReady, "MIRRORS"),
    a.edge(ST.f2Fault, T.f2Fault, "MIRRORS"),
    a.edge(ST.f2Speed, T.f2Speed, "MIRRORS"),
    a.edge(ST.f2Current, T.f2Current, "MIRRORS"),
    a.edge(ST.coilerMode, T.coilerMode, "MIRRORS"),
    a.edge(ST.coilerTension, T.coilerTension, "MIRRORS"),
    a.edge(ST.tonnage, T.tonnage, "MIRRORS"),
    a.edge(ST.gaugeDev, T.gaugeDev, "MIRRORS"),
    a.edge(ST.opcSession, T.opcSession, "MIRRORS"),
    a.edge(ST.opcDataAge, T.opcDataAge, "MIRRORS"),

    /* Equipment */
    a.edge(T.zone1Temp, EQ.furnace, "MONITORS"),
    a.edge(T.zone2Temp, EQ.furnace, "MONITORS"),
    a.edge(T.fceSafetyOk, EQ.furnace, "MONITORS"),
    a.edge(T.descalerPress, EQ.descaler, "MONITORS"),
    a.edge(T.f2Fault, EQ.standF2, "MONITORS"),
    a.edge(T.f2Speed, EQ.standF2, "MONITORS"),
    a.edge(T.f2Current, EQ.standF2, "MONITORS"),
    a.edge(T.gaugeDev, EQ.standF2, "MONITORS"),
    a.edge(T.shearPos, EQ.shear, "MONITORS"),
    a.edge(T.coilerTension, EQ.coiler, "MONITORS"),
    a.edge(T.tonnage, EQ.coiler, "MONITORS"),
    a.edge(D.driveF2, EQ.standF2, "ACTUATES"),
    a.edge(ST.millStartCmd, EQ.standF2, "ACTUATES"),
    a.edge(ST.zone2TrimCmd, EQ.furnace, "ACTUATES"),
    a.edge(D.burnerSafety, EQ.furnace, "MONITORS"),

    /* Sequences and their gates */
    ...chainStates(a, [S.idle, S.check, S.atTemp, S.threading, S.rolling]),
    ...chainStates(a, [AS.normal, AS.unack, AS.acked, AS.rtnUnack]),
    a.edge(
      AS.rtnUnack,
      AS.normal,
      "TRANSITIONS_TO",
      t("Acknowledgement of a returned alarm closes the lifecycle", "تأیید آلارمِ بازگشته چرخه را می‌بندد"),
    ),
    a.edge(P.opcFresh, SQ, "GATES"),
    a.edge(P.fceAtTemp, SQ, "GATES"),
    a.edge(P.coilerRemote, SQ, "GATES"),
    a.edge(P.descalerOk, S.threading, "GATES"),
    a.edge(I.combustion, S.atTemp, "BLOCKS"),
    a.edge(I.shearJam, S.rolling, "BLOCKS"),
    a.edge(I.overtension, S.rolling, "BLOCKS"),

    /* What each permissive and interlock actually reads */
    a.edge(P.opcFresh, T.opcSession, "READS"),
    a.edge(P.opcFresh, T.opcDataAge, "READS"),
    a.edge(P.fceAtTemp, T.fceReady, "READS"),
    a.edge(P.fceAtTemp, T.zone2Temp, "READS"),
    a.edge(P.coilerRemote, T.coilerMode, "READS"),
    a.edge(P.descalerOk, T.descalerPress, "READS"),
    a.edge(I.combustion, T.combAirPress, "READS"),
    a.edge(I.combustion, T.fceSafetyOk, "READS"),
    a.edge(I.shearJam, T.shearPos, "READS"),
    a.edge(I.overtension, T.coilerTension, "READS"),

    /* Alarms */
    a.edge(T.zone2Temp, AL.zone2Dev, "RAISES"),
    a.edge(T.f2Fault, AL.f2Trip, "RAISES"),
    a.edge(ST.telemetryStale, AL.opcStale, "RAISES"),
    a.edge(I.shearJam, AL.shearJam, "RAISES"),
    a.edge(I.combustion, AL.fceSafety, "RAISES"),
    a.edge(T.coilerMode, AL.coilerNotReady, "RAISES"),

    /* Operator screens */
    a.edge(H.overview, ST.opcSession, "DISPLAYS"),
    a.edge(H.overview, ST.tonnage, "DISPLAYS"),
    a.edge(H.overview, ST.gaugeDev, "DISPLAYS"),
    a.edge(H.overview, H.furnace, "NAVIGATES_TO"),
    a.edge(H.overview, H.mill, "NAVIGATES_TO"),
    a.edge(H.overview, H.coiler, "NAVIGATES_TO"),
    a.edge(H.overview, H.alarms, "NAVIGATES_TO"),
    a.edge(H.furnace, ST.zone2Temp, "DISPLAYS"),
    a.edge(H.furnace, ST.zone2TrimCmd, "COMMANDS"),
    a.edge(H.furnace, H.overview, "NAVIGATES_TO"),
    a.edge(H.mill, ST.f2Fault, "DISPLAYS"),
    a.edge(H.mill, ST.f2Speed, "DISPLAYS"),
    a.edge(H.mill, ST.f2Current, "DISPLAYS"),
    a.edge(H.mill, ST.millStartCmd, "COMMANDS"),
    a.edge(H.mill, H.overview, "NAVIGATES_TO"),
    a.edge(H.coiler, ST.coilerMode, "DISPLAYS"),
    a.edge(H.coiler, ST.coilerTension, "DISPLAYS"),
    a.edge(H.coiler, H.overview, "NAVIGATES_TO"),
    a.edge(H.alarms, ST.telemetryStale, "DISPLAYS"),
    a.edge(H.alarms, ST.ackCmd, "COMMANDS"),
    a.edge(H.alarms, H.overview, "NAVIGATES_TO"),

    a.edge(HO.opcHealth, ST.opcSession, "DISPLAYS"),
    a.edge(HO.throughput, ST.tonnage, "DISPLAYS"),
    a.edge(HO.gaugeDev, ST.gaugeDev, "DISPLAYS"),
    a.edge(HO.zone2Temp, ST.zone2Temp, "DISPLAYS"),
    a.edge(HO.zone2Trim, ST.zone2TrimCmd, "COMMANDS"),
    a.edge(HO.standF2, ST.f2Fault, "DISPLAYS"),
    a.edge(HO.standF2, ST.f2Speed, "DISPLAYS"),
    a.edge(HO.standF2, ST.f2Current, "DISPLAYS"),
    a.edge(HO.standF2, ST.millStartCmd, "COMMANDS"),
    a.edge(HO.coilerMode, ST.coilerMode, "DISPLAYS"),
    a.edge(HO.coilerTension, ST.coilerTension, "DISPLAYS"),
    a.edge(HO.alarmBanner, ST.telemetryStale, "DISPLAYS"),
    a.edge(HO.alarmBanner, ST.ackCmd, "COMMANDS"),

    /* Scripts — recovered from the supervisory source itself */
    a.edge(SC.millStart, ST.opcSession, "READS"),
    a.edge(SC.millStart, ST.fceReady, "READS"),
    a.edge(SC.millStart, ST.coilerMode, "READS"),
    a.edge(SC.millStart, ST.millStartCmd, "WRITES"),
    a.edge(SC.millStart, H.mill, "NAVIGATES_TO"),
    a.edge(SC.zone2Trim, ST.zone2Temp, "READS"),
    a.edge(SC.zone2Trim, ST.zone2TrimCmd, "WRITES"),
    a.edge(SC.watchdog, ST.opcSession, "READS"),
    a.edge(SC.watchdog, ST.opcDataAge, "READS"),
    a.edge(SC.watchdog, ST.telemetryStale, "WRITES"),
    a.edge(SC.alarmAck, ST.ackCmd, "WRITES"),
    a.edge(SC.alarmAck, H.alarms, "NAVIGATES_TO"),

    /* Governance — declared authorisation and audit trail */
    a.edge(SC.millStart, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.millStart, AE.millStart, "EMITS"),
    a.edge(SC.zone2Trim, R.supervisor, "REQUIRES_ROLE"),
    a.edge(SC.zone2Trim, AE.zone2Trim, "EMITS"),
    a.edge(SC.alarmAck, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.alarmAck, AE.alarmAck, "EMITS"),
    // No REQUIRES_ROLE: nothing human invokes the watchdog. It still emits.
    a.edge(SC.watchdog, AE.watchdog, "EMITS"),

    /* Historian and KPI */
    a.edge(EV.furnaceTrend, T.zone1Temp, "RECORDS"),
    a.edge(EV.furnaceTrend, T.zone2Temp, "RECORDS"),
    a.edge(EV.furnaceTrend, T.combAirPress, "RECORDS"),
    a.edge(EV.driveTrend, T.f2Speed, "RECORDS"),
    a.edge(EV.driveTrend, T.f2Current, "RECORDS"),
    a.edge(EV.opcLinkLog, T.opcSession, "RECORDS"),
    a.edge(EV.opcLinkLog, T.opcDataAge, "RECORDS"),
    a.edge(EV.lineEventLog, T.shearPos, "RECORDS"),
    a.edge(EV.lineEventLog, T.tonnage, "RECORDS"),
    a.edge(EV.auditLog, T.coilerMode, "RECORDS"),
    a.edge(EV.qualityTrend, T.gaugeDev, "RECORDS"),
    a.edge(K.oee, T.tonnage, "DERIVED_FROM"),
    a.edge(K.oee, T.f2Speed, "DERIVED_FROM"),
    a.edge(K.oee, T.gaugeDev, "DERIVED_FROM"),
    a.edge(K.throughput, T.tonnage, "DERIVED_FROM"),
    a.edge(K.specificEnergy, T.f2Current, "DERIVED_FROM"),
    a.edge(K.specificEnergy, T.tonnage, "DERIVED_FROM"),
    a.edge(K.qualityYield, T.gaugeDev, "DERIVED_FROM"),
    a.edge(K.qualityYield, T.tonnage, "DERIVED_FROM"),

    /* Fault modes — what each one explains and what is evidence for it */
    a.edge(FM.tcStuck, AL.zone2Dev, "EXPLAINS"),
    a.edge(T.zone2Temp, FM.tcStuck, "EVIDENCE_FOR"),
    a.edge(IO.zone2Tc, FM.tcStuck, "EVIDENCE_FOR"),
    a.edge(EV.furnaceTrend, FM.tcStuck, "EVIDENCE_FOR"),

    a.edge(FM.driveTrip, AL.f2Trip, "EXPLAINS"),
    a.edge(T.f2Fault, FM.driveTrip, "EVIDENCE_FOR"),
    a.edge(T.f2Speed, FM.driveTrip, "EVIDENCE_FOR"),
    a.edge(EV.driveTrend, FM.driveTrip, "EVIDENCE_FOR"),

    a.edge(FM.opcLoss, AL.opcStale, "EXPLAINS"),
    a.edge(T.opcSession, FM.opcLoss, "EVIDENCE_FOR"),
    a.edge(T.opcDataAge, FM.opcLoss, "EVIDENCE_FOR"),
    a.edge(EV.opcLinkLog, FM.opcLoss, "EVIDENCE_FOR"),

    a.edge(FM.cobble, AL.shearJam, "EXPLAINS"),
    a.edge(I.shearJam, FM.cobble, "EVIDENCE_FOR"),
    a.edge(T.shearPos, FM.cobble, "EVIDENCE_FOR"),
    a.edge(EV.lineEventLog, FM.cobble, "EVIDENCE_FOR"),

    a.edge(FM.combustion, AL.fceSafety, "EXPLAINS"),
    a.edge(I.combustion, FM.combustion, "EVIDENCE_FOR"),
    a.edge(T.combAirPress, FM.combustion, "EVIDENCE_FOR"),
    a.edge(EV.furnaceTrend, FM.combustion, "EVIDENCE_FOR"),

    a.edge(FM.leftInLocal, AL.coilerNotReady, "EXPLAINS"),
    a.edge(T.coilerMode, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(P.coilerRemote, FM.leftInLocal, "EVIDENCE_FOR"),
    a.edge(EV.auditLog, FM.leftInLocal, "EVIDENCE_FOR"),

    /* Safe actions */
    a.edge(SA.tcCompare, FM.tcStuck, "VERIFIES"),
    a.edge(SA.driveHistory, FM.driveTrip, "VERIFIES"),
    a.edge(SA.opcSession, FM.opcLoss, "VERIFIES"),
    a.edge(SA.shearInspect, FM.cobble, "VERIFIES"),
    a.edge(SA.combustionReview, FM.combustion, "VERIFIES"),
    a.edge(SA.auditReview, FM.leftInLocal, "VERIFIES"),
  ],

  artifacts: [
    {
      local: "SupervisoryScripts",
      language: "JAVASCRIPT",
      layer: "SCADA",
      fileName: "SupervisoryScripts.js",
      declares: [SC.millStart, SC.zone2Trim, SC.watchdog, SC.alarmAck],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "SCRIPTS/HotRollingLine",
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
        H.furnace,
        H.mill,
        H.coiler,
        H.alarms,
        HO.opcHealth,
        HO.throughput,
        HO.gaugeDev,
        HO.zone2Temp,
        HO.zone2Trim,
        HO.standF2,
        HO.coilerMode,
        HO.coilerTension,
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
        D.gateway,
        D.historian,
        AQ,
        EV.furnaceTrend,
        EV.opcLinkLog,
        EV.auditLog,
      ],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "CONFIG/RedundantPair",
        domain: "SUPERVISORY",
        safetyClass: "NON_SAFETY",
      },
      content: SUPERVISORY_CONFIG,
    },
  ],

  scenarios: [
    {
      id: "SCADA-02-FS-01",
      title: t("Zone 2 temperature has not moved for hours", "دمای ناحیهٔ ۲ ساعت‌هاست تغییر نکرده است"),
      narrative: t(
        "Zone 2 has shown exactly the same temperature for four hours while zone 1 tracks its setpoint normally. The aggregation session is healthy and every other value is updating.",
        "ناحیهٔ ۲ چهار ساعت است دقیقاً همان دما را نشان می‌دهد، در حالی که ناحیهٔ ۱ نقطهٔ کار خود را به‌طور عادی دنبال می‌کند. نشست تجمیع سالم است و همهٔ مقادیر دیگر به‌روز می‌شوند.",
      ),
      observations: [
        { nodeId: AL.zone2Dev, state: "TRUE" },
        { nodeId: T.zone2Temp, state: "STALE", detail: "identical value for four hours" },
        { nodeId: T.zone1Temp, state: "NORMAL" },
        { nodeId: T.opcSession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "SENSOR_FAILURE",
        faultModeId: FM.tcStuck,
        supportingNodeIds: [T.zone2Temp, AL.zone2Dev],
        expectedMissingNodeIds: [IO.zone2Tc, EV.furnaceTrend],
        expectedSafeActionIds: [SA.tcCompare],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-02-FS-02",
      title: t("Stand F2 tripped mid-pass", "قفسهٔ F2 در میانهٔ پاس تریپ کرد"),
      narrative: t(
        "The finishing stand main drive tripped in the middle of a pass and the strip stopped in the mill. The drive reports an overcurrent code and the furnace is healthy.",
        "درایو اصلی قفسهٔ نهایی در میانهٔ پاس تریپ کرد و تسمه داخل نورد متوقف شد. درایو کد اضافه‌جریان گزارش می‌کند و کوره سالم است.",
      ),
      observations: [
        { nodeId: AL.f2Trip, state: "TRUE" },
        { nodeId: T.f2Fault, state: "TRUE", detail: "overcurrent code reported by the drive" },
        { nodeId: T.f2Speed, state: "ABNORMAL", detail: "coasted to a stop under load" },
        { nodeId: T.zone2Temp, state: "NORMAL" },
        { nodeId: T.opcSession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "DRIVE",
        faultClass: "DRIVE_FAULT",
        faultModeId: FM.driveTrip,
        supportingNodeIds: [T.f2Fault, T.f2Speed, AL.f2Trip],
        expectedMissingNodeIds: [EV.driveTrend],
        expectedSafeActionIds: [SA.driveHistory],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-02-FS-03",
      title: t("Every supervisory value froze at once", "همهٔ مقادیر نظارتی هم‌زمان ثابت ماندند"),
      narrative: t(
        "Every value from both controllers stopped updating in the same second. The plant itself gives no sign of trouble and the last readings were all normal.",
        "همهٔ مقادیر هر دو کنترلر در یک ثانیهٔ واحد از به‌روزرسانی بازماندند. خود خط هیچ نشانه‌ای از مشکل ندارد و آخرین قرائت‌ها همگی عادی بودند.",
      ),
      observations: [
        { nodeId: AL.opcStale, state: "TRUE" },
        { nodeId: T.opcSession, state: "FALSE", detail: "gateway session dropped" },
        { nodeId: T.opcDataAge, state: "ABNORMAL", detail: "480 s and rising" },
        { nodeId: ST.f2Speed, state: "STALE" },
        { nodeId: ST.zone2Temp, state: "STALE" },
      ],
      groundTruth: {
        subsystem: "TELEMETRY",
        faultClass: "COMMUNICATION_LOSS",
        faultModeId: FM.opcLoss,
        supportingNodeIds: [T.opcSession, T.opcDataAge, AL.opcStale],
        expectedMissingNodeIds: [EV.opcLinkLog],
        expectedSafeActionIds: [SA.opcSession],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-02-FS-04",
      title: t("The line is held by the crop shear", "خط توسط قیچی سروته‌زن نگه داشته شده است"),
      narrative: t(
        "Rolling will not resume after a crop cut. The shear stopped mid-cycle, its jam protection is active, and the drives upstream report no fault of their own.",
        "نورد پس از یک برش سروته از سر گرفته نمی‌شود. قیچی در میانهٔ سیکل متوقف شده، حفاظت گیرکردن آن فعال است و درایوهای بالادست هیچ خطایی از خود گزارش نمی‌کنند.",
      ),
      observations: [
        { nodeId: AL.shearJam, state: "TRUE" },
        { nodeId: I.shearJam, state: "TRUE" },
        { nodeId: T.shearPos, state: "ABNORMAL", detail: "blade stalled at 140 deg, mid-cycle" },
        { nodeId: T.f2Fault, state: "FALSE" },
        { nodeId: T.opcSession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "MECHANICAL",
        faultClass: "BLOCKAGE",
        faultModeId: FM.cobble,
        supportingNodeIds: [I.shearJam, T.shearPos, AL.shearJam],
        expectedMissingNodeIds: [EV.lineEventLog],
        expectedSafeActionIds: [SA.shearInspect],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-02-FS-05",
      title: t("Combustion safety is holding the furnace", "ایمنی احتراق کوره را نگه داشته است"),
      narrative: t(
        "The furnace will not fire. The combustion safety chain has tripped and the combustion air pressure is below the burner-management minimum after a fan problem earlier in the shift.",
        "کوره روشن نمی‌شود. زنجیرهٔ ایمنی احتراق تریپ کرده و فشار هوای احتراق پس از مشکل فن در ساعات پیشین شیفت، زیر حداقل مدیریت مشعل است.",
      ),
      observations: [
        { nodeId: AL.fceSafety, state: "TRUE" },
        { nodeId: I.combustion, state: "TRUE" },
        { nodeId: T.combAirPress, state: "ABNORMAL", detail: "below the burner-management minimum" },
        { nodeId: T.fceReady, state: "FALSE" },
        { nodeId: T.opcSession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "SAFETY_CIRCUIT",
        faultClass: "INTERLOCK_ACTIVE",
        faultModeId: FM.combustion,
        supportingNodeIds: [I.combustion, T.combAirPress, AL.fceSafety],
        expectedMissingNodeIds: [EV.furnaceTrend],
        expectedSafeActionIds: [SA.combustionReview],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-02-FS-06",
      title: t("Coiler ignores the mill start after a roll change", "کلاف‌پیچ پس از تعویض غلتک به راه‌اندازی نورد پاسخ نمی‌دهد"),
      narrative: t(
        "After the night-shift roll change the mill start request goes unanswered. The coiler reports no fault, the aggregation is healthy, and its remote permissive refuses to come in.",
        "پس از تعویض غلتک شیفت شب، درخواست راه‌اندازی نورد بی‌پاسخ می‌ماند. کلاف‌پیچ هیچ خطایی گزارش نمی‌کند، تجمیع سالم است و مجوز حالت دورِ آن برقرار نمی‌شود.",
      ),
      observations: [
        { nodeId: AL.coilerNotReady, state: "TRUE" },
        { nodeId: T.coilerMode, state: "ABNORMAL", detail: "selector found in LOCAL after the roll change" },
        { nodeId: P.coilerRemote, state: "FALSE" },
        { nodeId: T.f2Fault, state: "FALSE" },
        { nodeId: T.opcSession, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "HMI",
        faultClass: "INCORRECT_MODE",
        faultModeId: FM.leftInLocal,
        supportingNodeIds: [T.coilerMode, P.coilerRemote, AL.coilerNotReady],
        expectedMissingNodeIds: [EV.auditLog],
        expectedSafeActionIds: [SA.auditReview],
        requiresEscalation: false,
      },
    },
  ],
};
