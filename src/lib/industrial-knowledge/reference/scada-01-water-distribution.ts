// PHASE 101 — SCADA-01: multi-site water distribution supervisory system.
//
// ORIGIN
// Original synthetic engineering reference authored for this repository. It
// contains no customer, proprietary or licensed vendor project material, and it
// is deliberately written in vendor-neutral terms: the supervisory scripting is
// the accessor idiom every web-based SCADA platform of this class shares, and
// the screen definition is a plain declarative description. Naming a product
// would add nothing an engineer could use and would misrepresent where this
// design came from.
//
// WHAT THIS REFERENCE EXERCISES THAT TIA-01 AND TIA-02 DO NOT
// The supervisory layer as the SUBJECT rather than the periphery. TIA-01 and
// TIA-02 are controller references whose SCADA/HMI surface is an epilogue;
// here the SCADA server, its historian, the telemetry link to two remote
// stations, the operator screens and the scripts behind their buttons are the
// system under study. Three failure families only exist at this level and are
// what the corpus has to be able to separate:
//
//   - The plant is healthy and the SUPERVISORY PICTURE of it is not: a frozen
//     transmitter value, a telemetry link that stopped without anything in the
//     field changing. Diagnosing the pump for these would be a wasted call-out.
//   - A permissive that is unsatisfied because the DATA behind it went stale
//     rather than because the condition it names became false.
//   - A station left in local mode after a manual intervention, where the
//     evidence is an operator action, not a plant state.
//
// GOVERNANCE
// This is also the first reference to carry the SCRIPT / ROLE /
// AUDIT_EVENT_TYPE slice. Every operator-invokable script declares the role it
// demands and the audit event class its invocation emits; the automatic
// watchdog declares an audit class and no role, because there is no operator
// behind it to authorise anything. Those are DECLARATIONS of the design. Hermes
// grants no role, issues no command and writes no audit record here — it has no
// runtime, no session and no write path to any device, and a `COMMANDS` edge is
// a statement that a screen declares a command, never one this system can send.

import type { AuthoredReferenceSystem } from "../types";
import { authoring, chainStates, t } from "./_authoring";

const a = authoring({
  projectId: "SCADA-01",
  subsystem: "SUPERVISORY_CORE",
  domain: "SUPERVISORY",
});

/* ── Identifiers ──────────────────────────────────────────────────────────── */

const D = {
  scadaServer: a.id("DEVICE", "SCADA_SERVER_A"),
  historian: a.id("DEVICE", "HISTORIAN_A"),
  gateway: a.id("DEVICE", "TELEMETRY_GATEWAY"),
  rtuNorth: a.id("DEVICE", "RTU_NORTH"),
  rtuEast: a.id("DEVICE", "RTU_EAST"),
  opClient: a.id("DEVICE", "OPERATOR_CLIENT"),
  surgeCtl: a.id("DEVICE", "SURGE_PROTECTION_CTL"),
};

const EQ = {
  pump101: a.id("EQUIPMENT", "PUMP_P101"),
  pump102: a.id("EQUIPMENT", "PUMP_P102"),
  transferMain: a.id("EQUIPMENT", "TRANSFER_MAIN"),
  reservoir: a.id("EQUIPMENT", "RESERVOIR_EAST"),
  dosingSkid: a.id("EQUIPMENT", "CHLORINATION_SKID"),
  surgeVessel: a.id("EQUIPMENT", "SURGE_VESSEL"),
};

/** The controller-side process image, as the RTUs hold it. */
const T = {
  p101Run: a.id("TAG", "P101_RUN"),
  p101Fault: a.id("TAG", "P101_FAULT"),
  p102Run: a.id("TAG", "P102_RUN"),
  suction: a.id("TAG", "SUCTION_PRESSURE"),
  discharge: a.id("TAG", "DISCHARGE_PRESSURE"),
  flow: a.id("TAG", "TRANSFER_FLOW"),
  level: a.id("TAG", "RESERVOIR_LEVEL"),
  chlorine: a.id("TAG", "CHLORINE_RESIDUAL"),
  dosingRun: a.id("TAG", "DOSING_PUMP_RUN"),
  remoteAuto: a.id("TAG", "REMOTE_MODE_AUTO"),
  commsOnline: a.id("TAG", "COMMS_ONLINE"),
  telemetryAge: a.id("TAG", "TELEMETRY_AGE"),
  surgePressure: a.id("TAG", "SURGE_VESSEL_PRESSURE"),
  dutySelect: a.id("TAG", "DUTY_SELECT"),
};

/** The supervisory tag database. Named as an operator would see it. */
const ST = {
  p101Run: a.id("SCADA_TAG", "NPS_P101_Run"),
  p101Fault: a.id("SCADA_TAG", "NPS_P101_Fault"),
  suction: a.id("SCADA_TAG", "NPS_Suction_Pressure"),
  discharge: a.id("SCADA_TAG", "NPS_Discharge_Pressure"),
  flow: a.id("SCADA_TAG", "NPS_Transfer_Flow"),
  dutySelect: a.id("SCADA_TAG", "NPS_Duty_Select"),
  level: a.id("SCADA_TAG", "RES_Level"),
  chlorine: a.id("SCADA_TAG", "RES_Chlorine_Residual"),
  commsOnline: a.id("SCADA_TAG", "SYS_Comms_Online"),
  telemetryAge: a.id("SCADA_TAG", "SYS_Telemetry_Age"),
  telemetryStale: a.id("SCADA_TAG", "SYS_Telemetry_Stale"),
  startCmd: a.id("SCADA_TAG", "NPS_P101_Start_Cmd"),
  purgeCmd: a.id("SCADA_TAG", "NPS_Purge_Cmd"),
  ackCmd: a.id("SCADA_TAG", "SYS_Alarm_Ack_Cmd"),
};

const IO = {
  dischargeAi: a.id("IO_POINT", "AI_DISCHARGE_PRESSURE"),
  suctionAi: a.id("IO_POINT", "AI_SUCTION_PRESSURE"),
  levelAi: a.id("IO_POINT", "AI_RESERVOIR_LEVEL"),
  chlorineAi: a.id("IO_POINT", "AI_CHLORINE_RESIDUAL"),
  p101RunDi: a.id("IO_POINT", "DI_P101_RUN_FEEDBACK"),
};

const SQ = a.id("SEQUENCE", "RESERVOIR_REFILL");
const S = {
  idle: a.id("STATE", "R00_IDLE"),
  check: a.id("STATE", "R10_PERMISSIVE_CHECK"),
  prime: a.id("STATE", "R20_PRIME"),
  transfer: a.id("STATE", "R30_TRANSFER"),
  stop: a.id("STATE", "R40_STOP"),
};

const P = {
  remoteAuto: a.id("PERMISSIVE", "PRM_REMOTE_AUTO"),
  suctionOk: a.id("PERMISSIVE", "PRM_SUCTION_PRESSURE_OK"),
  headroom: a.id("PERMISSIVE", "PRM_RESERVOIR_HEADROOM"),
  telemetryFresh: a.id("PERMISSIVE", "PRM_TELEMETRY_FRESH"),
  chlorineOk: a.id("PERMISSIVE", "PRM_CHLORINE_IN_RANGE"),
};

const I = {
  surge: a.id("INTERLOCK", "ILK_SURGE_PROTECTION_ACTIVE"),
  dryRun: a.id("INTERLOCK", "ILK_DRY_RUN"),
  overflow: a.id("INTERLOCK", "ILK_RESERVOIR_OVERFLOW"),
};

const AL = {
  pumpFault: a.id("ALARM", "ALM_P101_DRIVE_FAULT"),
  lowPressure: a.id("ALARM", "ALM_LOW_DISCHARGE_PRESSURE"),
  levelLow: a.id("ALARM", "ALM_RESERVOIR_LEVEL_LOW"),
  telemetryStale: a.id("ALARM", "ALM_TELEMETRY_STALE"),
  chlorineLow: a.id("ALARM", "ALM_CHLORINE_RESIDUAL_LOW"),
  dryRun: a.id("ALARM", "ALM_DRY_RUN_PROTECTION"),
  surge: a.id("ALARM", "ALM_SURGE_PROTECTION_ACTIVE"),
};

const V = {
  network: a.id("SCADA_VIEW", "VIEW_NETWORK_OVERVIEW"),
  station: a.id("SCADA_VIEW", "VIEW_PUMP_STATION_NORTH"),
  alarms: a.id("SCADA_VIEW", "VIEW_ALARM_LIST"),
};

const H = {
  overview: a.id("HMI_SCREEN", "Screen_Overview"),
  station: a.id("HMI_SCREEN", "Screen_PumpStation"),
  chlorination: a.id("HMI_SCREEN", "Screen_Chlorination"),
  alarmList: a.id("HMI_SCREEN", "Screen_AlarmList"),
};

const HO = {
  telemetryHealth: a.id("HMI_OBJECT", "Ind_TelemetryHealth"),
  levelTrend: a.id("HMI_OBJECT", "Trend_ReservoirLevel"),
  pumpFaceplate: a.id("HMI_OBJECT", "Fp_Pump_P101"),
  purgeButton: a.id("HMI_OBJECT", "Btn_ManualPurge"),
  chlorineTrend: a.id("HMI_OBJECT", "Trend_ChlorineResidual"),
  alarmBanner: a.id("HMI_OBJECT", "Banner_ActiveAlarms"),
};

const SC = {
  pumpStart: a.id("SCRIPT", "OnPumpStartRequest"),
  purge: a.id("SCRIPT", "OnManualPurgeRequest"),
  watchdog: a.id("SCRIPT", "OnTelemetryWatchdog"),
  alarmAck: a.id("SCRIPT", "OnAlarmAcknowledge"),
};

const R = {
  operator: a.id("ROLE", "Role_PlantOperator"),
  supervisor: a.id("ROLE", "Role_ShiftSupervisor"),
};

const AE = {
  pumpStart: a.id("AUDIT_EVENT_TYPE", "Audit_PumpStartCommanded"),
  purge: a.id("AUDIT_EVENT_TYPE", "Audit_ManualPurgeCommanded"),
  alarmAck: a.id("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged"),
  watchdog: a.id("AUDIT_EVENT_TYPE", "Audit_TelemetryWatchdogRecord"),
};

const K = {
  specificEnergy: a.id("KPI", "KPI_SPECIFIC_ENERGY"),
  availability: a.id("KPI", "KPI_PUMP_AVAILABILITY"),
};

const EV = {
  pressureTrend: a.id("EVIDENCE_SOURCE", "HIST_PRESSURE_TREND"),
  levelTrend: a.id("EVIDENCE_SOURCE", "HIST_LEVEL_TREND"),
  telemetryLog: a.id("EVIDENCE_SOURCE", "HIST_TELEMETRY_LINK_LOG"),
  auditLog: a.id("EVIDENCE_SOURCE", "HIST_OPERATOR_AUDIT_LOG"),
  chlorineTrend: a.id("EVIDENCE_SOURCE", "HIST_CHLORINE_TREND"),
};

const FM = {
  pumpTrip: a.id("FAULT_MODE", "FM_PUMP_DRIVE_TRIP"),
  dryRun: a.id("FAULT_MODE", "FM_SUCTION_STARVATION"),
  telemetryLoss: a.id("FAULT_MODE", "FM_TELEMETRY_LINK_LOSS"),
  transmitterStuck: a.id("FAULT_MODE", "FM_PRESSURE_TRANSMITTER_STUCK"),
  dosingFailure: a.id("FAULT_MODE", "FM_DOSING_PUMP_FAILURE"),
  surgeInterlock: a.id("FAULT_MODE", "FM_SURGE_INTERLOCK_ACTIVE"),
  leftInManual: a.id("FAULT_MODE", "FM_STATION_LEFT_IN_MANUAL"),
};

const SA = {
  driveHistory: a.id("SAFE_ACTION", "SA_READ_PUMP_DRIVE_HISTORY"),
  suctionStrainer: a.id("SAFE_ACTION", "SA_INSPECT_SUCTION_STRAINER"),
  gatewayLink: a.id("SAFE_ACTION", "SA_VERIFY_TELEMETRY_GATEWAY_LINK"),
  gaugeCompare: a.id("SAFE_ACTION", "SA_COMPARE_PRESSURE_TO_PORTABLE_GAUGE"),
  dosingInspect: a.id("SAFE_ACTION", "SA_INSPECT_DOSING_PUMP"),
  surgeReview: a.id("SAFE_ACTION", "SA_ESCALATE_SURGE_PROTECTION_REVIEW"),
  auditReview: a.id("SAFE_ACTION", "SA_REVIEW_OPERATOR_AUDIT_LOG"),
};

/* ── Engineering source ───────────────────────────────────────────────────── */

const SUPERVISORY_SCRIPTS = `// SCADA-01 — supervisory scripting for the North pump station.
//
// Vendor-neutral accessor idiom: Tags("Name").Read() / .Write(value) and screen
// navigation. Nothing in this file is executed, transpiled or evaluated by
// Hermes; it is engineering text from which relationships are recovered.

function OnPumpStartRequest() {
   // Operator-initiated from the pump station faceplate. The permissive picture
   // is READ and reported to the operator; it is NOT re-evaluated here. The RTU
   // owns the interlock decision, and a supervisory client that second-guessed
   // it would be a second, weaker source of truth.
   var suction = Tags("NPS_Suction_Pressure").Read();
   var telemetryOk = Tags("SYS_Comms_Online").Read();
   var duty = Tags("NPS_Duty_Select").Read();

   if (suction > 0.8 && telemetryOk && duty === 101) {
      Tags("NPS_P101_Start_Cmd").Write(1);
   }

   Navigate("Screen_PumpStation");
}

function OnManualPurgeRequest() {
   // Manual purge of the transfer main. Reserved for the shift supervisor: it
   // moves water outside the refill sequence, so the reservoir level is read and
   // shown before the command is offered at all.
   var level = Tags("RES_Level").Read();

   if (level < 85.0) {
      Tags("NPS_Purge_Cmd").Write(1);
   }
}

function OnTelemetryWatchdog() {
   // Runs on the supervisory server's own schedule. There is no operator behind
   // it, so it declares no role — and a stale link is published as its own tag
   // rather than left as an absence for a screen to infer.
   var online = Tags("SYS_Comms_Online").Read();
   var age = Tags("SYS_Telemetry_Age").Read();

   if (!online || age > 120) {
      Tags("SYS_Telemetry_Stale").Write(1);
   }
}

function OnAlarmAcknowledge() {
   // Acknowledgement records that a human saw the alarm. It changes no plant
   // state and never clears the condition that raised it.
   Tags("SYS_Alarm_Ack_Cmd").Write(1);
   Navigate("Screen_AlarmList");
}
`;

const OPERATOR_SCREENS = `{
  "screens": [
    {
      "name": "Screen_Overview",
      "titleEn": "Distribution network overview",
      "titleFa": "نمای کلی شبکهٔ توزیع",
      "navigatesTo": ["Screen_PumpStation", "Screen_Chlorination", "Screen_AlarmList"],
      "objects": [
        {
          "name": "Ind_TelemetryHealth",
          "type": "INDICATOR",
          "displays": ["SYS_Comms_Online"]
        },
        {
          "name": "Trend_ReservoirLevel",
          "type": "TREND",
          "displays": ["RES_Level"]
        }
      ]
    },
    {
      "name": "Screen_PumpStation",
      "titleEn": "North pump station",
      "titleFa": "ایستگاه پمپاژ شمالی",
      "navigatesTo": ["Screen_Overview"],
      "objects": [
        {
          "name": "Fp_Pump_P101",
          "type": "FACEPLATE",
          "displays": ["NPS_P101_Run", "NPS_P101_Fault", "NPS_Discharge_Pressure"],
          "commands": ["NPS_P101_Start_Cmd"],
          "permission": "PUMP_COMMAND",
          "requiresConfirmation": true
        },
        {
          "name": "Btn_ManualPurge",
          "type": "BUTTON",
          "commands": ["NPS_Purge_Cmd"],
          "permission": "PURGE_EXECUTE",
          "requiresConfirmation": true
        }
      ]
    },
    {
      "name": "Screen_Chlorination",
      "titleEn": "Chlorination skid",
      "titleFa": "اسکید کلرزنی",
      "navigatesTo": ["Screen_Overview"],
      "objects": [
        {
          "name": "Trend_ChlorineResidual",
          "type": "TREND",
          "displays": ["RES_Chlorine_Residual"]
        }
      ]
    },
    {
      "name": "Screen_AlarmList",
      "titleEn": "Active alarms",
      "titleFa": "آلارم‌های فعال",
      "navigatesTo": ["Screen_Overview"],
      "objects": [
        {
          "name": "Banner_ActiveAlarms",
          "type": "ALARM_BANNER",
          "displays": ["SYS_Telemetry_Stale"],
          "commands": ["SYS_Alarm_Ack_Cmd"],
          "permission": "ALARM_ACK"
        }
      ]
    }
  ]
}
`;

const SUPERVISORY_CONFIG = `{
  "server": { "id": "SCADA_SERVER_A", "zone": "SUPERVISORY" },
  "telemetry": {
    "gateway": "TELEMETRY_GATEWAY",
    "stations": [
      { "rtu": "RTU_NORTH", "protocol": "MODBUS_TCP", "pollSeconds": 5 },
      { "rtu": "RTU_EAST", "protocol": "MQTT", "publishSeconds": 30 }
    ],
    "staleAfterSeconds": 120
  },
  "historian": {
    "id": "HISTORIAN_A",
    "archives": [
      { "id": "HIST_PRESSURE_TREND", "sampleSeconds": 5, "retentionDays": 400 },
      { "id": "HIST_LEVEL_TREND", "sampleSeconds": 30, "retentionDays": 400 },
      { "id": "HIST_CHLORINE_TREND", "sampleSeconds": 60, "retentionDays": 400 },
      { "id": "HIST_TELEMETRY_LINK_LOG", "sampleSeconds": 60, "retentionDays": 180 },
      { "id": "HIST_OPERATOR_AUDIT_LOG", "sampleSeconds": 0, "retentionDays": 1825 }
    ]
  },
  "alarms": [
    { "code": "ALM_P101_DRIVE_FAULT", "priority": "HIGH", "requiresAck": true },
    { "code": "ALM_LOW_DISCHARGE_PRESSURE", "priority": "MEDIUM", "requiresAck": true },
    { "code": "ALM_RESERVOIR_LEVEL_LOW", "priority": "HIGH", "requiresAck": true },
    { "code": "ALM_TELEMETRY_STALE", "priority": "HIGH", "requiresAck": true },
    { "code": "ALM_CHLORINE_RESIDUAL_LOW", "priority": "URGENT", "requiresAck": true },
    { "code": "ALM_DRY_RUN_PROTECTION", "priority": "URGENT", "requiresAck": true },
    { "code": "ALM_SURGE_PROTECTION_ACTIVE", "priority": "URGENT", "requiresAck": true }
  ]
}
`;

/* ── System ───────────────────────────────────────────────────────────────── */

export const SCADA_01_WATER_DISTRIBUTION: AuthoredReferenceSystem = {
  id: "SCADA-01",
  name: t("Multi-site water distribution supervisory system", "سامانهٔ نظارتی توزیع آب چندسایتی"),
  domain: t(
    "Pumping, reservoir transfer, chlorination and telemetry supervision",
    "پمپاژ، انتقال به مخزن، کلرزنی و نظارت بر تله‌متری",
  ),
  sourceType: "SCADA_REFERENCE",
  platform:
    "Vendor-neutral supervisory platform: JavaScript scripting, declarative screens, MQTT/Modbus telemetry",
  version: "1.0.0",
  revision: 1,
  origin: "SYNTHETIC_ORIGINAL",

  nodes: [
    /* Devices */
    a.node("DEVICE", "SCADA_SERVER_A", t("Supervisory server", "سرور نظارتی"), {
      attributes: { deviceCategory: "SCADA_SERVER", networkZone: "SUPERVISORY", protocol: "SCADA" },
    }),
    a.node("DEVICE", "HISTORIAN_A", t("Process historian", "تاریخ‌نگار فرایند"), {
      domain: "MAINTENANCE",
      attributes: {
        deviceCategory: "INDUSTRIAL_PC",
        networkZone: "SUPERVISORY",
        protocol: "HISTORIAN",
      },
    }),
    a.node("DEVICE", "TELEMETRY_GATEWAY", t("Telemetry gateway", "دروازهٔ تله‌متری"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "GATEWAY", networkZone: "DMZ", protocol: "MQTT" },
      description: t(
        "Single point through which both remote stations report. Its health is therefore a diagnosis in its own right, not a footnote to the pump.",
        "تنها نقطه‌ای که هر دو ایستگاه دوردست از طریق آن گزارش می‌دهند. بنابراین سلامت آن خود یک تشخیص مستقل است، نه پانوشتی بر وضعیت پمپ.",
      ),
    }),
    a.node("DEVICE", "RTU_NORTH", t("North station RTU", "پایانهٔ دوردست ایستگاه شمالی"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "MODBUS_TCP" },
    }),
    a.node("DEVICE", "RTU_EAST", t("East reservoir RTU", "پایانهٔ دوردست مخزن شرقی"), {
      subsystem: "RESERVOIR_EAST",
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "MQTT" },
    }),
    a.node("DEVICE", "OPERATOR_CLIENT", t("Operator client", "کلاینت اپراتور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { deviceCategory: "HMI", networkZone: "SUPERVISORY" },
    }),
    a.node("DEVICE", "SURGE_PROTECTION_CTL", t("Surge protection controller", "کنترلر حفاظت ضربهٔ قوچ"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { deviceCategory: "SAFETY_CONTROLLER", networkZone: "SAFETY" },
      description: t(
        "Review-only within Hermes. Surge protection is observed, never reset, inhibited or commanded.",
        "در هرمس فقط قابل بازبینی است. حفاظت ضربهٔ قوچ مشاهده می‌شود و هرگز ریست، غیرفعال یا فرمان‌دهی نمی‌شود.",
      ),
    }),

    /* Equipment */
    a.node("EQUIPMENT", "PUMP_P101", t("Transfer pump P101 (duty)", "پمپ انتقال P101 (اصلی)"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "PUMP_P102", t("Transfer pump P102 (standby)", "پمپ انتقال P102 (پشتیبان)"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "TRANSFER_MAIN", t("Transfer main", "خط انتقال اصلی"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "RESERVOIR_EAST", t("East reservoir", "مخزن شرقی"), {
      subsystem: "RESERVOIR_EAST",
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "CHLORINATION_SKID", t("Chlorination skid", "اسکید کلرزنی"), {
      subsystem: "CHLORINATION",
      domain: "QUALITY",
    }),
    a.node("EQUIPMENT", "SURGE_VESSEL", t("Surge vessel", "مخزن ضربه‌گیر"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),

    /* Controller-side process image */
    a.node("TAG", "P101_RUN", t("P101 running", "کارکرد P101"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "P101_FAULT", t("P101 drive fault", "خطای درایو P101"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "DRIVES",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "P102_RUN", t("P102 running", "کارکرد P102"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "SUCTION_PRESSURE", t("Suction pressure", "فشار مکش"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" },
    }),
    a.node("TAG", "DISCHARGE_PRESSURE", t("Discharge pressure", "فشار خروجی"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" },
    }),
    a.node("TAG", "TRANSFER_FLOW", t("Transfer flow rate", "دبی انتقال"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ" },
    }),
    a.node("TAG", "RESERVOIR_LEVEL", t("Reservoir level", "سطح مخزن"), {
      subsystem: "RESERVOIR_EAST",
      domain: "PROCESS",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "CHLORINE_RESIDUAL", t("Chlorine residual", "کلر باقیمانده"), {
      subsystem: "CHLORINATION",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "mg/L", accessMode: "READ" },
    }),
    a.node("TAG", "DOSING_PUMP_RUN", t("Dosing pump running", "کارکرد پمپ تزریق"), {
      subsystem: "CHLORINATION",
      domain: "QUALITY",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "REMOTE_MODE_AUTO", t("Station in remote/auto", "ایستگاه در حالت دور/خودکار"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "BOOL", accessMode: "READ" },
      description: t(
        "FALSE means somebody is standing at the station with it in local. The evidence for that is an operator action, not a plant state.",
        "مقدار FALSE یعنی کسی در ایستگاه ایستاده و آن را در حالت محلی گذاشته است. شاهد این موضوع یک اقدام اپراتوری است، نه یک وضعیت فرایندی.",
      ),
    }),
    a.node("TAG", "COMMS_ONLINE", t("Telemetry link online", "برقراری پیوند تله‌متری"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("TAG", "TELEMETRY_AGE", t("Age of newest telemetry sample", "سن تازه‌ترین نمونهٔ تله‌متری"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "s", accessMode: "READ" },
    }),
    a.node("TAG", "SURGE_VESSEL_PRESSURE", t("Surge vessel pressure", "فشار مخزن ضربه‌گیر"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ" },
    }),
    a.node("TAG", "DUTY_SELECT", t("Duty pump selection", "انتخاب پمپ اصلی"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "CONTROL_LOGIC",
      attributes: { dataType: "INT", accessMode: "READ" },
    }),

    /* Supervisory tag database */
    a.node("SCADA_TAG", "NPS_P101_Run", t("P101 running (supervisory)", "کارکرد P101 (نظارتی)"), {
      subsystem: "PUMP_STATION_NORTH",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "MODBUS_TCP" },
    }),
    a.node("SCADA_TAG", "NPS_P101_Fault", t("P101 fault (supervisory)", "خطای P101 (نظارتی)"), {
      subsystem: "PUMP_STATION_NORTH",
      attributes: { dataType: "BOOL", accessMode: "READ", protocol: "MODBUS_TCP" },
    }),
    a.node("SCADA_TAG", "NPS_Suction_Pressure", t("Suction pressure (supervisory)", "فشار مکش (نظارتی)"), {
      subsystem: "PUMP_STATION_NORTH",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ", protocol: "MODBUS_TCP" },
    }),
    a.node("SCADA_TAG", "NPS_Discharge_Pressure", t("Discharge pressure (supervisory)", "فشار خروجی (نظارتی)"), {
      subsystem: "PUMP_STATION_NORTH",
      attributes: { dataType: "REAL", unit: "bar", accessMode: "READ", protocol: "MODBUS_TCP" },
    }),
    a.node("SCADA_TAG", "NPS_Transfer_Flow", t("Transfer flow (supervisory)", "دبی انتقال (نظارتی)"), {
      subsystem: "PUMP_STATION_NORTH",
      attributes: { dataType: "REAL", unit: "m3/h", accessMode: "READ", protocol: "MODBUS_TCP" },
    }),
    a.node("SCADA_TAG", "NPS_Duty_Select", t("Duty selection (supervisory)", "انتخاب پمپ اصلی (نظارتی)"), {
      subsystem: "PUMP_STATION_NORTH",
      attributes: { dataType: "INT", accessMode: "READ", protocol: "MODBUS_TCP" },
    }),
    a.node("SCADA_TAG", "RES_Level", t("Reservoir level (supervisory)", "سطح مخزن (نظارتی)"), {
      subsystem: "RESERVOIR_EAST",
      attributes: { dataType: "REAL", unit: "%", accessMode: "READ", protocol: "MQTT" },
    }),
    a.node("SCADA_TAG", "RES_Chlorine_Residual", t("Chlorine residual (supervisory)", "کلر باقیمانده (نظارتی)"), {
      subsystem: "CHLORINATION",
      domain: "QUALITY",
      attributes: { dataType: "REAL", unit: "mg/L", accessMode: "READ", protocol: "MQTT" },
    }),
    a.node("SCADA_TAG", "SYS_Comms_Online", t("Telemetry link online (supervisory)", "پیوند تله‌متری برقرار (نظارتی)"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "SYS_Telemetry_Age", t("Telemetry sample age", "سن نمونهٔ تله‌متری"), {
      domain: "NETWORK",
      attributes: { dataType: "INT", unit: "s", accessMode: "READ" },
    }),
    a.node("SCADA_TAG", "SYS_Telemetry_Stale", t("Telemetry stale flag", "پرچم کهنگی تله‌متری"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", accessMode: "READ_WRITE" },
      description: t(
        "Published by the watchdog rather than inferred by each screen, so every surface reads the same judgement about the same link.",
        "به‌جای استنتاج در هر صفحه، توسط دیدبان منتشر می‌شود تا همهٔ سطوح یک قضاوت یکسان دربارهٔ همان پیوند بخوانند.",
      ),
    }),
    a.node("SCADA_TAG", "NPS_P101_Start_Cmd", t("P101 start command", "فرمان راه‌اندازی P101"), {
      subsystem: "PUMP_STATION_NORTH",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "PUMP_COMMAND", requiresConfirmation: true },
      description: t(
        "A DECLARED operator command. Hermes issues no command on this or any other tag.",
        "یک فرمان اپراتوری اعلام‌شده. هرمس روی این تگ یا هر تگ دیگری هیچ فرمانی صادر نمی‌کند.",
      ),
    }),
    a.node("SCADA_TAG", "NPS_Purge_Cmd", t("Transfer main purge command", "فرمان تخلیهٔ خط انتقال"), {
      subsystem: "PUMP_STATION_NORTH",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "PURGE_EXECUTE", requiresConfirmation: true },
    }),
    a.node("SCADA_TAG", "SYS_Alarm_Ack_Cmd", t("Alarm acknowledge command", "فرمان تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { dataType: "BOOL", accessMode: "WRITE", requiredPermission: "ALARM_ACK", requiresConfirmation: false },
      description: t(
        "Acknowledgement records that a human saw the alarm. It clears no condition, so the design deliberately does not put a confirmation dialogue in front of it.",
        "تأیید فقط ثبت می‌کند که انسانی آلارم را دیده است. هیچ شرطی را پاک نمی‌کند، بنابراین طراحی عمداً پیش از آن پنجرهٔ تأیید قرار نمی‌دهد.",
      ),
    }),

    /* Field channels */
    a.node("IO_POINT", "AI_DISCHARGE_PRESSURE", t("Discharge pressure transmitter", "ترانسمیتر فشار خروجی"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "bar" },
    }),
    a.node("IO_POINT", "AI_SUCTION_PRESSURE", t("Suction pressure transmitter", "ترانسمیتر فشار مکش"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "bar" },
    }),
    a.node("IO_POINT", "AI_RESERVOIR_LEVEL", t("Reservoir level transmitter", "ترانسمیتر سطح مخزن"), {
      subsystem: "RESERVOIR_EAST",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "%" },
    }),
    a.node("IO_POINT", "AI_CHLORINE_RESIDUAL", t("Chlorine residual analyser", "آنالایزر کلر باقیمانده"), {
      subsystem: "CHLORINATION",
      domain: "FIELD_IO",
      attributes: { channelType: "AI", unit: "mg/L" },
    }),
    a.node("IO_POINT", "DI_P101_RUN_FEEDBACK", t("P101 run feedback contact", "کنتاکت بازخورد کارکرد P101"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "FIELD_IO",
      attributes: { channelType: "DI" },
    }),

    /* Sequence */
    a.node("SEQUENCE", "RESERVOIR_REFILL", t("Reservoir refill sequence", "توالی پرکردن مخزن"), {
      subsystem: "RESERVOIR_EAST",
      domain: "CONTROL_LOGIC",
    }),
    a.node("STATE", "R00_IDLE", t("Idle", "بی‌کار"), {
      subsystem: "RESERVOIR_EAST",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 0 },
    }),
    a.node("STATE", "R10_PERMISSIVE_CHECK", t("Permissive check", "بررسی مجوزها"), {
      subsystem: "RESERVOIR_EAST",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 10, stepTimeoutSeconds: 60 },
    }),
    a.node("STATE", "R20_PRIME", t("Prime", "هواگیری و پرسازی"), {
      subsystem: "RESERVOIR_EAST",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 20, stepTimeoutSeconds: 180 },
    }),
    a.node("STATE", "R30_TRANSFER", t("Transfer", "انتقال"), {
      subsystem: "RESERVOIR_EAST",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 30 },
    }),
    a.node("STATE", "R40_STOP", t("Stop", "توقف"), {
      subsystem: "RESERVOIR_EAST",
      domain: "CONTROL_LOGIC",
      attributes: { stepNumber: 40 },
    }),

    /* Permissives */
    a.node("PERMISSIVE", "PRM_REMOTE_AUTO", t("Station in remote/auto", "ایستگاه در حالت دور/خودکار"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "CONTROL_LOGIC",
    }),
    a.node("PERMISSIVE", "PRM_SUCTION_PRESSURE_OK", t("Suction pressure sufficient", "کفایت فشار مکش"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "PROCESS",
    }),
    a.node("PERMISSIVE", "PRM_RESERVOIR_HEADROOM", t("Reservoir has headroom", "وجود ظرفیت خالی در مخزن"), {
      subsystem: "RESERVOIR_EAST",
      domain: "PROCESS",
    }),
    a.node("PERMISSIVE", "PRM_TELEMETRY_FRESH", t("Telemetry fresh enough to act on", "تازگی کافی تله‌متری برای اقدام"), {
      domain: "NETWORK",
      description: t(
        "A permissive about DATA, not about plant. It fails when the picture is old, even if every physical condition it summarises is still fine — and confusing the two sends an engineer to the wrong place.",
        "مجوزی دربارهٔ داده است، نه دربارهٔ فرایند. وقتی تصویر کهنه شود ناموفق می‌شود، حتی اگر همهٔ شرایط فیزیکی خلاصه‌شده در آن هنوز درست باشند — و خلط این دو، مهندس را به نشانی اشتباه می‌فرستد.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_CHLORINE_IN_RANGE", t("Chlorine residual in range", "کلر باقیمانده در محدوده"), {
      subsystem: "CHLORINATION",
      domain: "QUALITY",
    }),

    /* Interlocks */
    a.node("INTERLOCK", "ILK_SURGE_PROTECTION_ACTIVE", t("Surge protection active", "حفاظت ضربهٔ قوچ فعال"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_DRY_RUN", t("Dry-run protection active", "حفاظت کارکرد خشک فعال"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "PROCESS",
    }),
    a.node("INTERLOCK", "ILK_RESERVOIR_OVERFLOW", t("Reservoir overflow protection", "حفاظت سرریز مخزن"), {
      subsystem: "RESERVOIR_EAST",
      domain: "PROCESS",
    }),

    /* Alarms */
    a.node("ALARM", "ALM_P101_DRIVE_FAULT", t("P101 drive fault", "خطای درایو P101"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "DRIVES",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_LOW_DISCHARGE_PRESSURE", t("Low discharge pressure", "افت فشار خروجی"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "PROCESS",
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),
    a.node("ALARM", "ALM_RESERVOIR_LEVEL_LOW", t("Reservoir level low", "پایین بودن سطح مخزن"), {
      subsystem: "RESERVOIR_EAST",
      domain: "PROCESS",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_TELEMETRY_STALE", t("Telemetry stale", "کهنگی تله‌متری"), {
      domain: "NETWORK",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_CHLORINE_RESIDUAL_LOW", t("Chlorine residual low", "پایین بودن کلر باقیمانده"), {
      subsystem: "CHLORINATION",
      domain: "QUALITY",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_DRY_RUN_PROTECTION", t("Dry-run protection tripped", "عملکرد حفاظت کارکرد خشک"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "PROCESS",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_SURGE_PROTECTION_ACTIVE", t("Surge protection active", "فعال شدن حفاظت ضربهٔ قوچ"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),

    /* Supervisory views */
    a.node("SCADA_VIEW", "VIEW_NETWORK_OVERVIEW", t("Network overview view", "نمای کلی شبکه")),
    a.node("SCADA_VIEW", "VIEW_PUMP_STATION_NORTH", t("North pump station view", "نمای ایستگاه پمپاژ شمالی"), {
      subsystem: "PUMP_STATION_NORTH",
    }),
    a.node("SCADA_VIEW", "VIEW_ALARM_LIST", t("Alarm list view", "نمای فهرست آلارم")),

    /* Operator screens and objects */
    a.node("HMI_SCREEN", "Screen_Overview", t("Distribution network overview", "نمای کلی شبکهٔ توزیع"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_PumpStation", t("North pump station", "ایستگاه پمپاژ شمالی"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_Chlorination", t("Chlorination skid", "اسکید کلرزنی"), {
      subsystem: "CHLORINATION",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_SCREEN", "Screen_AlarmList", t("Active alarms", "آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Ind_TelemetryHealth", t("Telemetry health indicator", "نشانگر سلامت تله‌متری"), {
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Trend_ReservoirLevel", t("Reservoir level trend", "روند سطح مخزن"), {
      subsystem: "RESERVOIR_EAST",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Fp_Pump_P101", t("P101 faceplate", "فیس‌پلیت P101"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "PUMP_COMMAND", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Btn_ManualPurge", t("Manual purge button", "دکمهٔ تخلیهٔ دستی"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "PURGE_EXECUTE", requiresConfirmation: true },
    }),
    a.node("HMI_OBJECT", "Trend_ChlorineResidual", t("Chlorine residual trend", "روند کلر باقیمانده"), {
      subsystem: "CHLORINATION",
      domain: "OPERATOR_INTERFACE",
    }),
    a.node("HMI_OBJECT", "Banner_ActiveAlarms", t("Active alarm banner", "نوار آلارم‌های فعال"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { requiredPermission: "ALARM_ACK", requiresConfirmation: false },
    }),

    /* Supervisory scripts */
    a.node("SCRIPT", "OnPumpStartRequest", t("Pump start request handler", "پردازندهٔ درخواست راه‌اندازی پمپ"), {
      subsystem: "PUMP_STATION_NORTH",
      attributes: { humanInvokable: true, requiredPermission: "PUMP_COMMAND" },
      description: t(
        "Invoked by an operator from the pump station faceplate.",
        "توسط اپراتور از فیس‌پلیت ایستگاه پمپاژ فراخوانی می‌شود.",
      ),
    }),
    a.node("SCRIPT", "OnManualPurgeRequest", t("Manual purge request handler", "پردازندهٔ درخواست تخلیهٔ دستی"), {
      subsystem: "PUMP_STATION_NORTH",
      attributes: { humanInvokable: true, requiredPermission: "PURGE_EXECUTE" },
    }),
    a.node("SCRIPT", "OnAlarmAcknowledge", t("Alarm acknowledge handler", "پردازندهٔ تأیید آلارم"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { humanInvokable: true, requiredPermission: "ALARM_ACK" },
    }),
    a.node("SCRIPT", "OnTelemetryWatchdog", t("Telemetry watchdog", "دیدبان تله‌متری"), {
      domain: "NETWORK",
      description: t(
        "Runs on the supervisory server's schedule. It declares no role because no operator invokes it, and humanInvokable is deliberately left undeclared: absence means false.",
        "بر اساس زمان‌بندی سرور نظارتی اجرا می‌شود. چون هیچ اپراتوری آن را فراخوانی نمی‌کند، هیچ نقشی اعلام نمی‌کند و humanInvokable عمداً اعلام‌نشده مانده است: نبودن یعنی نادرست.",
      ),
    }),

    /* Governance */
    a.node("ROLE", "Role_PlantOperator", t("Plant operator", "اپراتور بهره‌برداری")),
    a.node("ROLE", "Role_ShiftSupervisor", t("Shift supervisor", "سرپرست شیفت")),
    a.node("AUDIT_EVENT_TYPE", "Audit_PumpStartCommanded", t("Pump start commanded", "صدور فرمان راه‌اندازی پمپ")),
    a.node("AUDIT_EVENT_TYPE", "Audit_ManualPurgeCommanded", t("Manual purge commanded", "صدور فرمان تخلیهٔ دستی")),
    a.node("AUDIT_EVENT_TYPE", "Audit_AlarmAcknowledged", t("Alarm acknowledged", "تأیید آلارم")),
    a.node("AUDIT_EVENT_TYPE", "Audit_TelemetryWatchdogRecord", t("Telemetry watchdog record", "رکورد دیدبان تله‌متری"), {
      description: t(
        "An automatic routine still leaves a record. EMITS carries no humanInvokable requirement, because an audit trail is about what happened, not about who asked for it.",
        "یک روال خودکار نیز رکورد بر جای می‌گذارد. EMITS هیچ الزامی به humanInvokable ندارد، چون سابقهٔ ممیزی دربارهٔ آنچه رخ داده است، نه دربارهٔ اینکه چه کسی آن را خواسته.",
      ),
    }),

    /* KPI and evidence */
    a.node("KPI", "KPI_SPECIFIC_ENERGY", t("Specific pumping energy", "انرژی ویژهٔ پمپاژ"), {
      domain: "ENERGY",
      attributes: { unit: "kWh/m3", formula: "pump energy / transferred volume" },
    }),
    a.node("KPI", "KPI_PUMP_AVAILABILITY", t("Pump availability", "دسترس‌پذیری پمپ"), {
      domain: "MAINTENANCE",
      attributes: { unit: "%", formula: "available hours / scheduled hours" },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_PRESSURE_TREND", t("Pressure trend archive", "بایگانی روند فشار"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 400, sampleIntervalSeconds: 5 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_LEVEL_TREND", t("Level trend archive", "بایگانی روند سطح"), {
      subsystem: "RESERVOIR_EAST",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 400, sampleIntervalSeconds: 30 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_TELEMETRY_LINK_LOG", t("Telemetry link log", "گزارش پیوند تله‌متری"), {
      domain: "NETWORK",
      attributes: { retentionDays: 180, sampleIntervalSeconds: 60 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_OPERATOR_AUDIT_LOG", t("Operator audit log", "گزارش ممیزی اپراتور"), {
      domain: "OPERATOR_INTERFACE",
      attributes: { retentionDays: 1825 },
      description: t(
        "Where the audit events the scripts declare would be recorded. Hermes reads about it here; it does not write to it.",
        "جایی که رویدادهای ممیزی اعلام‌شده توسط اسکریپت‌ها ثبت می‌شوند. هرمس اینجا دربارهٔ آن می‌خواند و در آن نمی‌نویسد.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_CHLORINE_TREND", t("Chlorine residual trend archive", "بایگانی روند کلر باقیمانده"), {
      subsystem: "CHLORINATION",
      domain: "MAINTENANCE",
      attributes: { retentionDays: 400, sampleIntervalSeconds: 60 },
    }),

    /* Fault modes */
    a.node("FAULT_MODE", "FM_PUMP_DRIVE_TRIP", t("Duty pump drive tripped", "تریپ درایو پمپ اصلی"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "DRIVES",
      attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
    }),
    a.node("FAULT_MODE", "FM_SUCTION_STARVATION", t("Suction starvation / dry run", "قحطی مکش / کارکرد خشک"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "PROCESS",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "PROCESS" },
    }),
    a.node("FAULT_MODE", "FM_TELEMETRY_LINK_LOSS", t("Telemetry link lost", "قطع پیوند تله‌متری"), {
      domain: "NETWORK",
      attributes: { faultClass: "COMMUNICATION_LOSS", subsystem: "NETWORK" },
    }),
    a.node("FAULT_MODE", "FM_PRESSURE_TRANSMITTER_STUCK", t("Pressure transmitter stuck", "گیرکردن ترانسمیتر فشار"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "FIELD_IO",
      attributes: { faultClass: "STALE_TELEMETRY", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_DOSING_PUMP_FAILURE", t("Dosing pump not delivering", "عدم تزریق پمپ دوزینگ"), {
      subsystem: "CHLORINATION",
      domain: "QUALITY",
      attributes: { faultClass: "ACTUATOR_FAILURE", subsystem: "PROCESS" },
    }),
    a.node("FAULT_MODE", "FM_SURGE_INTERLOCK_ACTIVE", t("Surge protection holding the station", "نگه‌داشتن ایستگاه توسط حفاظت ضربهٔ قوچ"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { faultClass: "INTERLOCK_ACTIVE", subsystem: "SAFETY_CIRCUIT" },
    }),
    a.node("FAULT_MODE", "FM_STATION_LEFT_IN_MANUAL", t("Station left in local mode", "رهاشدن ایستگاه در حالت محلی"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "OPERATOR_INTERFACE",
      attributes: { faultClass: "INCORRECT_MODE", subsystem: "HMI" },
    }),

    /* Safe actions — instructions for a qualified human being */
    a.node("SAFE_ACTION", "SA_READ_PUMP_DRIVE_HISTORY", t("Read the pump drive fault history", "خواندن تاریخچهٔ خطای درایو پمپ"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "DRIVES",
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_SUCTION_STRAINER", t("Inspect the suction strainer and wet well level", "بازرسی صافی مکش و سطح چاهک"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "PROCESS",
    }),
    a.node("SAFE_ACTION", "SA_VERIFY_TELEMETRY_GATEWAY_LINK", t("Verify the telemetry gateway link", "بررسی پیوند دروازهٔ تله‌متری"), {
      domain: "NETWORK",
    }),
    a.node("SAFE_ACTION", "SA_COMPARE_PRESSURE_TO_PORTABLE_GAUGE", t("Compare the reading to a portable gauge", "مقایسهٔ قرائت با فشارسنج قابل حمل"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "FIELD_IO",
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_DOSING_PUMP", t("Inspect the dosing pump and its suction line", "بازرسی پمپ تزریق و خط مکش آن"), {
      subsystem: "CHLORINATION",
      domain: "QUALITY",
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_SURGE_PROTECTION_REVIEW", t("Escalate to a surge protection review", "ارجاع به بازبینی حفاظت ضربهٔ قوچ"), {
      subsystem: "PUMP_STATION_NORTH",
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      description: t(
        "Review-only. Surge protection is never reset, inhibited or bypassed from here or from anywhere else in Hermes.",
        "فقط قابل بازبینی. حفاظت ضربهٔ قوچ هرگز از اینجا یا از هیچ جای دیگر هرمس ریست، غیرفعال یا دور زده نمی‌شود.",
      ),
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_OPERATOR_AUDIT_LOG", t("Review the operator audit log", "بازبینی گزارش ممیزی اپراتور"), {
      domain: "OPERATOR_INTERFACE",
    }),
  ],

  edges: [
    /* Containment */
    a.edge(D.scadaServer, ST.p101Run, "CONTAINS"),
    a.edge(D.scadaServer, ST.discharge, "CONTAINS"),
    a.edge(D.scadaServer, ST.level, "CONTAINS"),
    a.edge(D.scadaServer, ST.commsOnline, "CONTAINS"),
    a.edge(D.scadaServer, ST.telemetryStale, "CONTAINS"),
    a.edge(D.scadaServer, V.network, "CONTAINS"),
    a.edge(D.scadaServer, V.station, "CONTAINS"),
    a.edge(D.scadaServer, V.alarms, "CONTAINS"),
    a.edge(D.rtuNorth, T.p101Run, "CONTAINS"),
    a.edge(D.rtuNorth, T.p101Fault, "CONTAINS"),
    a.edge(D.rtuNorth, T.suction, "CONTAINS"),
    a.edge(D.rtuNorth, T.discharge, "CONTAINS"),
    a.edge(D.rtuNorth, T.flow, "CONTAINS"),
    a.edge(D.rtuNorth, T.remoteAuto, "CONTAINS"),
    a.edge(D.rtuEast, T.level, "CONTAINS"),
    a.edge(D.rtuEast, T.chlorine, "CONTAINS"),
    a.edge(D.opClient, H.overview, "CONTAINS"),
    a.edge(D.opClient, H.station, "CONTAINS"),
    a.edge(D.opClient, H.chlorination, "CONTAINS"),
    a.edge(D.opClient, H.alarmList, "CONTAINS"),
    a.edge(H.overview, HO.telemetryHealth, "CONTAINS"),
    a.edge(H.overview, HO.levelTrend, "CONTAINS"),
    a.edge(H.station, HO.pumpFaceplate, "CONTAINS"),
    a.edge(H.station, HO.purgeButton, "CONTAINS"),
    a.edge(H.chlorination, HO.chlorineTrend, "CONTAINS"),
    a.edge(H.alarmList, HO.alarmBanner, "CONTAINS"),
    a.edge(SQ, S.idle, "CONTAINS"),
    a.edge(SQ, S.check, "CONTAINS"),
    a.edge(SQ, S.prime, "CONTAINS"),
    a.edge(SQ, S.transfer, "CONTAINS"),
    a.edge(SQ, S.stop, "CONTAINS"),

    /* Field channels to the controller image */
    a.edge(T.discharge, IO.dischargeAi, "BOUND_TO"),
    a.edge(T.suction, IO.suctionAi, "BOUND_TO"),
    a.edge(T.level, IO.levelAi, "BOUND_TO"),
    a.edge(T.chlorine, IO.chlorineAi, "BOUND_TO"),
    a.edge(T.p101Run, IO.p101RunDi, "BOUND_TO"),

    /* Supervisory image mirrors the controller image. This is the seam where a
     * healthy plant and an unhealthy PICTURE of it become distinguishable. */
    a.edge(ST.p101Run, T.p101Run, "MIRRORS"),
    a.edge(ST.p101Fault, T.p101Fault, "MIRRORS"),
    a.edge(ST.suction, T.suction, "MIRRORS"),
    a.edge(ST.discharge, T.discharge, "MIRRORS"),
    a.edge(ST.flow, T.flow, "MIRRORS"),
    a.edge(ST.dutySelect, T.dutySelect, "MIRRORS"),
    a.edge(ST.level, T.level, "MIRRORS"),
    a.edge(ST.chlorine, T.chlorine, "MIRRORS"),
    a.edge(ST.commsOnline, T.commsOnline, "MIRRORS"),
    a.edge(ST.telemetryAge, T.telemetryAge, "MIRRORS"),

    /* Equipment */
    a.edge(T.p101Run, EQ.pump101, "MONITORS"),
    a.edge(T.p102Run, EQ.pump102, "MONITORS"),
    a.edge(T.discharge, EQ.transferMain, "MONITORS"),
    a.edge(T.flow, EQ.transferMain, "MONITORS"),
    a.edge(T.level, EQ.reservoir, "MONITORS"),
    a.edge(T.chlorine, EQ.dosingSkid, "MONITORS"),
    a.edge(T.dosingRun, EQ.dosingSkid, "MONITORS"),
    a.edge(T.surgePressure, EQ.surgeVessel, "MONITORS"),
    a.edge(ST.startCmd, EQ.pump101, "ACTUATES"),

    /* Sequence and its gates */
    ...chainStates(a, [S.idle, S.check, S.prime, S.transfer, S.stop]),
    a.edge(P.remoteAuto, SQ, "GATES"),
    a.edge(P.suctionOk, SQ, "GATES"),
    a.edge(P.headroom, SQ, "GATES"),
    a.edge(P.telemetryFresh, SQ, "GATES"),
    a.edge(P.chlorineOk, S.transfer, "GATES"),
    a.edge(I.surge, S.transfer, "BLOCKS"),
    a.edge(I.dryRun, S.transfer, "BLOCKS"),
    a.edge(I.overflow, S.transfer, "BLOCKS"),

    /* What each permissive and interlock actually reads */
    a.edge(P.remoteAuto, T.remoteAuto, "READS"),
    a.edge(P.suctionOk, T.suction, "READS"),
    a.edge(P.headroom, T.level, "READS"),
    a.edge(P.telemetryFresh, T.commsOnline, "READS"),
    a.edge(P.telemetryFresh, T.telemetryAge, "READS"),
    a.edge(P.chlorineOk, T.chlorine, "READS"),
    a.edge(I.surge, T.surgePressure, "READS"),
    a.edge(I.dryRun, T.suction, "READS"),
    a.edge(I.dryRun, T.flow, "READS"),
    a.edge(I.overflow, T.level, "READS"),

    /* Alarms */
    a.edge(T.p101Fault, AL.pumpFault, "RAISES"),
    a.edge(T.discharge, AL.lowPressure, "RAISES"),
    a.edge(T.level, AL.levelLow, "RAISES"),
    a.edge(ST.telemetryStale, AL.telemetryStale, "RAISES"),
    a.edge(T.chlorine, AL.chlorineLow, "RAISES"),
    a.edge(I.dryRun, AL.dryRun, "RAISES"),
    a.edge(I.surge, AL.surge, "RAISES"),

    /* Supervisory views and operator screens */
    a.edge(V.network, ST.level, "DISPLAYS"),
    a.edge(V.network, ST.commsOnline, "DISPLAYS"),
    a.edge(V.station, ST.p101Run, "DISPLAYS"),
    a.edge(V.station, ST.discharge, "DISPLAYS"),
    a.edge(V.alarms, ST.telemetryStale, "DISPLAYS"),

    a.edge(H.overview, ST.commsOnline, "DISPLAYS"),
    a.edge(H.overview, ST.level, "DISPLAYS"),
    a.edge(H.overview, H.station, "NAVIGATES_TO"),
    a.edge(H.overview, H.chlorination, "NAVIGATES_TO"),
    a.edge(H.overview, H.alarmList, "NAVIGATES_TO"),
    a.edge(H.station, ST.p101Run, "DISPLAYS"),
    a.edge(H.station, ST.p101Fault, "DISPLAYS"),
    a.edge(H.station, ST.discharge, "DISPLAYS"),
    a.edge(H.station, ST.startCmd, "COMMANDS"),
    a.edge(H.station, ST.purgeCmd, "COMMANDS"),
    a.edge(H.station, H.overview, "NAVIGATES_TO"),
    a.edge(H.chlorination, ST.chlorine, "DISPLAYS"),
    a.edge(H.chlorination, H.overview, "NAVIGATES_TO"),
    a.edge(H.alarmList, ST.telemetryStale, "DISPLAYS"),
    a.edge(H.alarmList, ST.ackCmd, "COMMANDS"),
    a.edge(H.alarmList, H.overview, "NAVIGATES_TO"),

    a.edge(HO.telemetryHealth, ST.commsOnline, "DISPLAYS"),
    a.edge(HO.levelTrend, ST.level, "DISPLAYS"),
    a.edge(HO.pumpFaceplate, ST.p101Run, "DISPLAYS"),
    a.edge(HO.pumpFaceplate, ST.p101Fault, "DISPLAYS"),
    a.edge(HO.pumpFaceplate, ST.discharge, "DISPLAYS"),
    a.edge(HO.pumpFaceplate, ST.startCmd, "COMMANDS"),
    a.edge(HO.purgeButton, ST.purgeCmd, "COMMANDS"),
    a.edge(HO.chlorineTrend, ST.chlorine, "DISPLAYS"),
    a.edge(HO.alarmBanner, ST.telemetryStale, "DISPLAYS"),
    a.edge(HO.alarmBanner, ST.ackCmd, "COMMANDS"),

    /* Scripts — recovered from the supervisory source itself */
    a.edge(SC.pumpStart, ST.suction, "READS"),
    a.edge(SC.pumpStart, ST.commsOnline, "READS"),
    a.edge(SC.pumpStart, ST.dutySelect, "READS"),
    a.edge(SC.pumpStart, ST.startCmd, "WRITES"),
    a.edge(SC.pumpStart, H.station, "NAVIGATES_TO"),
    a.edge(SC.purge, ST.level, "READS"),
    a.edge(SC.purge, ST.purgeCmd, "WRITES"),
    a.edge(SC.watchdog, ST.commsOnline, "READS"),
    a.edge(SC.watchdog, ST.telemetryAge, "READS"),
    a.edge(SC.watchdog, ST.telemetryStale, "WRITES"),
    a.edge(SC.alarmAck, ST.ackCmd, "WRITES"),
    a.edge(SC.alarmAck, H.alarmList, "NAVIGATES_TO"),

    /* Governance — declared authorisation and audit trail */
    a.edge(SC.pumpStart, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.pumpStart, AE.pumpStart, "EMITS"),
    a.edge(SC.purge, R.supervisor, "REQUIRES_ROLE"),
    a.edge(SC.purge, AE.purge, "EMITS"),
    a.edge(SC.alarmAck, R.operator, "REQUIRES_ROLE"),
    a.edge(SC.alarmAck, AE.alarmAck, "EMITS"),
    // No REQUIRES_ROLE: nothing human invokes the watchdog. It still emits.
    a.edge(SC.watchdog, AE.watchdog, "EMITS"),

    /* Historian and KPI */
    a.edge(EV.pressureTrend, T.discharge, "RECORDS"),
    a.edge(EV.pressureTrend, T.suction, "RECORDS"),
    a.edge(EV.levelTrend, T.level, "RECORDS"),
    a.edge(EV.telemetryLog, T.commsOnline, "RECORDS"),
    a.edge(EV.telemetryLog, T.telemetryAge, "RECORDS"),
    a.edge(EV.chlorineTrend, T.chlorine, "RECORDS"),
    a.edge(EV.auditLog, T.remoteAuto, "RECORDS"),
    a.edge(K.specificEnergy, T.flow, "DERIVED_FROM"),
    a.edge(K.availability, T.p101Run, "DERIVED_FROM"),

    /* Fault modes — what each one explains and what is evidence for it */
    a.edge(FM.pumpTrip, AL.pumpFault, "EXPLAINS"),
    a.edge(T.p101Fault, FM.pumpTrip, "EVIDENCE_FOR"),
    a.edge(T.p101Run, FM.pumpTrip, "EVIDENCE_FOR"),
    a.edge(EV.pressureTrend, FM.pumpTrip, "EVIDENCE_FOR"),

    a.edge(FM.dryRun, AL.dryRun, "EXPLAINS"),
    a.edge(I.dryRun, FM.dryRun, "EVIDENCE_FOR"),
    a.edge(T.suction, FM.dryRun, "EVIDENCE_FOR"),
    a.edge(T.flow, FM.dryRun, "EVIDENCE_FOR"),

    a.edge(FM.telemetryLoss, AL.telemetryStale, "EXPLAINS"),
    a.edge(T.commsOnline, FM.telemetryLoss, "EVIDENCE_FOR"),
    a.edge(T.telemetryAge, FM.telemetryLoss, "EVIDENCE_FOR"),
    a.edge(EV.telemetryLog, FM.telemetryLoss, "EVIDENCE_FOR"),

    a.edge(FM.transmitterStuck, AL.lowPressure, "EXPLAINS"),
    a.edge(T.discharge, FM.transmitterStuck, "EVIDENCE_FOR"),
    a.edge(IO.dischargeAi, FM.transmitterStuck, "EVIDENCE_FOR"),
    a.edge(EV.pressureTrend, FM.transmitterStuck, "EVIDENCE_FOR"),

    a.edge(FM.dosingFailure, AL.chlorineLow, "EXPLAINS"),
    a.edge(T.chlorine, FM.dosingFailure, "EVIDENCE_FOR"),
    a.edge(T.dosingRun, FM.dosingFailure, "EVIDENCE_FOR"),
    a.edge(EV.chlorineTrend, FM.dosingFailure, "EVIDENCE_FOR"),

    a.edge(FM.surgeInterlock, AL.surge, "EXPLAINS"),
    a.edge(I.surge, FM.surgeInterlock, "EVIDENCE_FOR"),
    a.edge(T.surgePressure, FM.surgeInterlock, "EVIDENCE_FOR"),

    a.edge(FM.leftInManual, AL.levelLow, "EXPLAINS"),
    a.edge(T.remoteAuto, FM.leftInManual, "EVIDENCE_FOR"),
    a.edge(P.remoteAuto, FM.leftInManual, "EVIDENCE_FOR"),
    a.edge(EV.auditLog, FM.leftInManual, "EVIDENCE_FOR"),

    /* Safe actions */
    a.edge(SA.driveHistory, FM.pumpTrip, "VERIFIES"),
    a.edge(SA.suctionStrainer, FM.dryRun, "VERIFIES"),
    a.edge(SA.gatewayLink, FM.telemetryLoss, "VERIFIES"),
    a.edge(SA.gaugeCompare, FM.transmitterStuck, "VERIFIES"),
    a.edge(SA.dosingInspect, FM.dosingFailure, "VERIFIES"),
    a.edge(SA.surgeReview, FM.surgeInterlock, "VERIFIES"),
    a.edge(SA.auditReview, FM.leftInManual, "VERIFIES"),
  ],

  artifacts: [
    {
      local: "SupervisoryScripts",
      language: "JAVASCRIPT",
      layer: "SCADA",
      fileName: "SupervisoryScripts.js",
      declares: [SC.pumpStart, SC.purge, SC.watchdog, SC.alarmAck],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "SCRIPTS/Station_North",
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
        H.station,
        H.chlorination,
        H.alarmList,
        HO.telemetryHealth,
        HO.levelTrend,
        HO.pumpFaceplate,
        HO.purgeButton,
        HO.chlorineTrend,
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
      declares: [D.scadaServer, D.historian, D.gateway, EV.pressureTrend, EV.telemetryLog],
      provenance: {
        subsystem: "SUPERVISORY_CORE",
        sourceId: "CONFIG/Server_A",
        domain: "SUPERVISORY",
        safetyClass: "NON_SAFETY",
      },
      content: SUPERVISORY_CONFIG,
    },
  ],

  scenarios: [
    {
      id: "SCADA-01-FS-01",
      title: t("Duty pump keeps tripping", "پمپ اصلی مدام تریپ می‌کند"),
      narrative: t(
        "The duty pump stopped again overnight. The supervisory client shows a drive fault on P101 and the station did not change over to the standby pump.",
        "پمپ اصلی دوباره در طول شب متوقف شد. کلاینت نظارتی خطای درایو روی P101 نشان می‌دهد و ایستگاه به پمپ پشتیبان سوئیچ نکرده است.",
      ),
      observations: [
        { nodeId: AL.pumpFault, state: "TRUE" },
        { nodeId: T.p101Fault, state: "TRUE", detail: "reported by the RTU at 02:41" },
        { nodeId: T.p101Run, state: "ABNORMAL", detail: "stopped while the sequence still demanded transfer" },
        { nodeId: T.commsOnline, state: "TRUE" },
        { nodeId: T.suction, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "DRIVE",
        faultClass: "DRIVE_FAULT",
        faultModeId: FM.pumpTrip,
        supportingNodeIds: [T.p101Fault, AL.pumpFault, T.p101Run],
        expectedMissingNodeIds: [EV.pressureTrend],
        expectedSafeActionIds: [SA.driveHistory],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-01-FS-02",
      title: t("Every remote value froze at once", "همهٔ مقادیر دوردست هم‌زمان ثابت ماندند"),
      narrative: t(
        "All values from both remote stations stopped updating at the same minute. The plant itself gives no sign of trouble and the last readings were all normal.",
        "همهٔ مقادیر هر دو ایستگاه دوردست در یک دقیقهٔ واحد از به‌روزرسانی بازماندند. خود تأسیسات هیچ نشانه‌ای از مشکل ندارد و آخرین قرائت‌ها همگی عادی بودند.",
      ),
      observations: [
        { nodeId: AL.telemetryStale, state: "TRUE" },
        { nodeId: T.commsOnline, state: "FALSE" },
        { nodeId: T.telemetryAge, state: "ABNORMAL", detail: "1,840 s and rising" },
        { nodeId: T.level, state: "STALE" },
        { nodeId: T.discharge, state: "STALE" },
      ],
      groundTruth: {
        subsystem: "NETWORK",
        faultClass: "COMMUNICATION_LOSS",
        faultModeId: FM.telemetryLoss,
        supportingNodeIds: [T.commsOnline, T.telemetryAge, AL.telemetryStale],
        expectedMissingNodeIds: [EV.telemetryLog],
        expectedSafeActionIds: [SA.gatewayLink],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-01-FS-03",
      title: t("Discharge pressure has not moved all shift", "فشار خروجی در تمام شیفت تغییر نکرده است"),
      narrative: t(
        "Discharge pressure has shown exactly the same value all shift while the pump ran and the flow varied normally. Telemetry is healthy and every other value is updating.",
        "فشار خروجی در تمام شیفت دقیقاً همان مقدار را نشان داده، در حالی که پمپ کار کرده و دبی به‌طور عادی تغییر داشته است. تله‌متری سالم است و همهٔ مقادیر دیگر به‌روز می‌شوند.",
      ),
      observations: [
        { nodeId: T.discharge, state: "STALE", detail: "identical value for eight hours" },
        { nodeId: T.p101Run, state: "TRUE" },
        { nodeId: T.flow, state: "NORMAL" },
        { nodeId: T.commsOnline, state: "TRUE" },
        { nodeId: AL.lowPressure, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "STALE_TELEMETRY",
        faultModeId: FM.transmitterStuck,
        supportingNodeIds: [T.discharge, AL.lowPressure],
        expectedMissingNodeIds: [IO.dischargeAi, EV.pressureTrend],
        expectedSafeActionIds: [SA.gaugeCompare],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-01-FS-04",
      title: t("Surge protection is holding the station", "حفاظت ضربهٔ قوچ ایستگاه را نگه داشته است"),
      narrative: t(
        "The station will not transfer. The surge protection interlock is active and the surge vessel pressure is outside its normal band after a rapid stop earlier in the day.",
        "ایستگاه انتقال را انجام نمی‌دهد. اینترلاک حفاظت ضربهٔ قوچ فعال است و فشار مخزن ضربه‌گیر پس از یک توقف سریع در ساعات پیشین روز، بیرون از باند عادی خود قرار دارد.",
      ),
      observations: [
        { nodeId: I.surge, state: "TRUE" },
        { nodeId: AL.surge, state: "TRUE" },
        { nodeId: T.surgePressure, state: "ABNORMAL", detail: "below the charge pressure band" },
        { nodeId: T.p101Run, state: "FALSE" },
        { nodeId: T.commsOnline, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "SAFETY_CIRCUIT",
        faultClass: "INTERLOCK_ACTIVE",
        faultModeId: FM.surgeInterlock,
        supportingNodeIds: [I.surge, T.surgePressure, AL.surge],
        expectedMissingNodeIds: [EV.pressureTrend],
        expectedSafeActionIds: [SA.surgeReview],
        requiresEscalation: true,
      },
    },
    {
      id: "SCADA-01-FS-05",
      title: t("Reservoir kept falling with no alarm from the pump", "افت مداوم سطح مخزن بدون هیچ آلارمی از پمپ"),
      narrative: t(
        "The reservoir dropped through the low level overnight. The pump reports no fault, the telemetry is healthy, and the station is not answering the refill demand.",
        "سطح مخزن در طول شب از حد پایین عبور کرد. پمپ هیچ خطایی گزارش نمی‌کند، تله‌متری سالم است و ایستگاه به تقاضای پرکردن پاسخ نمی‌دهد.",
      ),
      observations: [
        { nodeId: AL.levelLow, state: "TRUE" },
        { nodeId: T.remoteAuto, state: "ABNORMAL", detail: "station selector found in LOCAL" },
        { nodeId: P.remoteAuto, state: "FALSE" },
        { nodeId: T.level, state: "ABNORMAL", detail: "below the low level" },
        { nodeId: T.p101Fault, state: "FALSE" },
        { nodeId: T.commsOnline, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "HMI",
        faultClass: "INCORRECT_MODE",
        faultModeId: FM.leftInManual,
        supportingNodeIds: [T.remoteAuto, P.remoteAuto, AL.levelLow],
        expectedMissingNodeIds: [EV.auditLog],
        expectedSafeActionIds: [SA.auditReview],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-01-FS-06",
      title: t("Dry-run protection trips shortly after every start", "عملکرد حفاظت کارکرد خشک اندکی پس از هر راه‌اندازی"),
      narrative: t(
        "The pump starts, runs for about a minute, and the dry-run protection trips it. Suction pressure collapses as soon as the pump loads and the flow never reaches its normal rate.",
        "پمپ راه می‌افتد، حدود یک دقیقه کار می‌کند و حفاظت کارکرد خشک آن را متوقف می‌کند. فشار مکش به‌محض باردار شدن پمپ افت می‌کند و دبی هرگز به نرخ عادی خود نمی‌رسد.",
      ),
      observations: [
        { nodeId: I.dryRun, state: "TRUE" },
        { nodeId: AL.dryRun, state: "TRUE" },
        { nodeId: T.suction, state: "ABNORMAL", detail: "collapses to 0.2 bar under load" },
        { nodeId: T.flow, state: "ABNORMAL", detail: "never exceeds a third of the design rate" },
        { nodeId: T.p101Fault, state: "FALSE" },
        { nodeId: T.commsOnline, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "PROCESS_DEVIATION",
        faultModeId: FM.dryRun,
        supportingNodeIds: [I.dryRun, T.suction, T.flow, AL.dryRun],
        expectedMissingNodeIds: [EV.pressureTrend],
        expectedSafeActionIds: [SA.suctionStrainer],
        requiresEscalation: false,
      },
    },
    {
      id: "SCADA-01-FS-07",
      title: t("Chlorine residual falling while the dosing pump reports running", "افت کلر باقیمانده در حالی که پمپ تزریق کارکرد گزارش می‌کند"),
      narrative: t(
        "The chlorine residual at the reservoir has fallen below the limit over two days. The dosing pump reports that it is running and the transfer flow is normal.",
        "کلر باقیماندهٔ مخزن طی دو روز به زیر حد مجاز رسیده است. پمپ تزریق گزارش می‌دهد که در حال کار است و دبی انتقال عادی است.",
      ),
      observations: [
        { nodeId: AL.chlorineLow, state: "TRUE" },
        { nodeId: T.chlorine, state: "ABNORMAL", detail: "0.12 mg/L against a 0.30 mg/L limit" },
        { nodeId: T.dosingRun, state: "TRUE" },
        { nodeId: T.flow, state: "NORMAL" },
        { nodeId: T.commsOnline, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "PROCESS",
        faultClass: "ACTUATOR_FAILURE",
        faultModeId: FM.dosingFailure,
        supportingNodeIds: [T.chlorine, T.dosingRun, AL.chlorineLow],
        expectedMissingNodeIds: [EV.chlorineTrend],
        expectedSafeActionIds: [SA.dosingInspect],
        requiresEscalation: false,
      },
    },
  ],
};
