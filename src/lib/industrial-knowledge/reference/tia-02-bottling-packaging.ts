// PHASE 101 — TIA-02: high-speed bottling and packaging line.
//
// ORIGIN
// Original synthetic engineering reference authored for this repository,
// modelled on the ARCHITECTURE of an S7-1500 packaging-line controller. It
// contains no customer, proprietary or licensed vendor project material, and no
// file in this phase is or claims to be a real TIA Portal archive.
//
// WHAT THIS REFERENCE EXERCISES THAT TIA-01 DOES NOT
// Accumulation, starvation and blocking between stations, changeover against a
// recipe, an inspection reject path, and OEE signals. The diagnostic value is
// that "the filler stopped" is almost never a filler fault on a line like this
// — it is usually the machine downstream or the machine upstream — and the
// corpus has to make that distinction structurally rather than by wording.

import type { AuthoredReferenceSystem } from "../types";
import { authoring, chainStates, t } from "./_authoring";

const a = authoring({
  projectId: "TIA-02",
  subsystem: "FILL_LINE_1",
  domain: "CONTROL_LOGIC",
});

const D = {
  cpu: a.id("DEVICE", "CPU_LINE"),
  remoteIo: a.id("DEVICE", "ET200_FILLER"),
  fillerDrive: a.id("DEVICE", "DRIVE_FILLER"),
  capperDrive: a.id("DEVICE", "DRIVE_CAPPER"),
  inspector: a.id("DEVICE", "VISION_INSPECTOR"),
  safety: a.id("DEVICE", "SAFETY_CTL"),
};

const EQ = {
  depal: a.id("EQUIPMENT", "DEPALLETISER"),
  infeed: a.id("EQUIPMENT", "INFEED_CONVEYOR"),
  filler: a.id("EQUIPMENT", "ROTARY_FILLER"),
  capper: a.id("EQUIPMENT", "CAPPER"),
  labeller: a.id("EQUIPMENT", "LABELLER"),
  reject: a.id("EQUIPMENT", "REJECT_STATION"),
  accumulator: a.id("EQUIPMENT", "ACCUMULATION_TABLE"),
  packer: a.id("EQUIPMENT", "CASE_PACKER"),
};

const B = {
  ob1: a.id("PLC_BLOCK", "OB1_MAIN"),
  line: a.id("PLC_BLOCK", "FB_LINE_SEQUENCE"),
  fill: a.id("PLC_BLOCK", "FB_FILLER_CONTROL"),
  perm: a.id("PLC_BLOCK", "FC_PERMISSIVE_LOGIC"),
  recipe: a.id("PLC_BLOCK", "FB_RECIPE_MANAGER"),
  oee: a.id("PLC_BLOCK", "FB_OEE_COUNTERS"),
  db: a.id("PLC_BLOCK", "DB_LINE_DATA"),
  udt: a.id("PLC_BLOCK", "UDT_STATION_STATUS"),
};

const T = {
  startReq: a.id("TAG", "LINE_START_REQ"),
  modeAuto: a.id("TAG", "LINE_MODE_AUTO"),
  running: a.id("TAG", "LINE_RUNNING"),
  fillerReady: a.id("TAG", "FILLER_DRIVE_READY"),
  fillerFault: a.id("TAG", "FILLER_DRIVE_FAULT"),
  fillerSpeed: a.id("TAG", "FILLER_SPEED_ACT"),
  capperReady: a.id("TAG", "CAPPER_DRIVE_READY"),
  capperTorque: a.id("TAG", "CAPPER_TORQUE_ACT"),
  infeedFull: a.id("TAG", "INFEED_BACKUP_FULL"),
  accumLow: a.id("TAG", "ACCUM_LEVEL_LOW"),
  accumHigh: a.id("TAG", "ACCUM_LEVEL_HIGH"),
  downstreamReady: a.id("TAG", "PACKER_READY"),
  fillLevelAct: a.id("TAG", "FILL_LEVEL_ACT"),
  fillLevelSp: a.id("TAG", "FILL_LEVEL_SP"),
  productTemp: a.id("TAG", "PRODUCT_TEMP_ACT"),
  rejectCount: a.id("TAG", "REJECT_COUNT"),
  goodCount: a.id("TAG", "GOOD_COUNT"),
  recipeId: a.id("TAG", "ACTIVE_RECIPE_ID"),
  recipeLoaded: a.id("TAG", "RECIPE_LOADED_OK"),
  capTorqueOk: a.id("TAG", "CAP_TORQUE_IN_RANGE"),
  estopOk: a.id("TAG", "ESTOP_CHAIN_OK"),
  guardClosed: a.id("TAG", "GUARD_DOORS_CLOSED"),
  visionOnline: a.id("TAG", "VISION_ONLINE"),
};

const IO = {
  bottlePresent: a.id("IO_POINT", "DI_BOTTLE_PRESENT"),
  accumLowSw: a.id("IO_POINT", "DI_ACCUM_LOW_SW"),
  accumHighSw: a.id("IO_POINT", "DI_ACCUM_HIGH_SW"),
  guardSw: a.id("IO_POINT", "PS_GUARD_SWITCH"),
  levelSensor: a.id("IO_POINT", "AI_FILL_LEVEL"),
  tempSensor: a.id("IO_POINT", "AI_PRODUCT_TEMP"),
  rejectValve: a.id("IO_POINT", "DO_REJECT_PUSHER"),
  visionLink: a.id("IO_POINT", "PN_VISION_PORT"),
  capperTorqueAi: a.id("IO_POINT", "AI_CAPPER_TORQUE"),
};

const SQ = a.id("SEQUENCE", "LINE_SEQUENCE");
const S = {
  idle: a.id("STATE", "S00_IDLE"),
  changeover: a.id("STATE", "S10_CHANGEOVER"),
  prime: a.id("STATE", "S20_PRIME"),
  produce: a.id("STATE", "S30_PRODUCE"),
  drain: a.id("STATE", "S40_DRAIN"),
  done: a.id("STATE", "S50_COMPLETE"),
};

const P = {
  mode: a.id("PERMISSIVE", "PRM_MODE_AUTO"),
  recipe: a.id("PERMISSIVE", "PRM_RECIPE_LOADED"),
  guards: a.id("PERMISSIVE", "PRM_GUARDS_CLOSED"),
  infeed: a.id("PERMISSIVE", "PRM_INFEED_SUPPLY"),
  downstream: a.id("PERMISSIVE", "PRM_DOWNSTREAM_READY"),
  vision: a.id("PERMISSIVE", "PRM_VISION_ONLINE"),
};

const I = {
  estop: a.id("INTERLOCK", "ILK_ESTOP_ACTIVE"),
  guardOpen: a.id("INTERLOCK", "ILK_GUARD_OPEN"),
  accumFull: a.id("INTERLOCK", "ILK_ACCUM_FULL"),
  starved: a.id("INTERLOCK", "ILK_INFEED_STARVED"),
  capTorque: a.id("INTERLOCK", "ILK_CAP_TORQUE_OUT_OF_RANGE"),
};

const AL = {
  fillerFault: a.id("ALARM", "ALM_FILLER_DRIVE_FAULT"),
  starved: a.id("ALARM", "ALM_LINE_STARVED"),
  blocked: a.id("ALARM", "ALM_LINE_BLOCKED"),
  fillDeviation: a.id("ALARM", "ALM_FILL_LEVEL_DEVIATION"),
  capTorque: a.id("ALARM", "ALM_CAP_TORQUE_FAULT"),
  visionOffline: a.id("ALARM", "ALM_VISION_OFFLINE"),
  recipeMismatch: a.id("ALARM", "ALM_RECIPE_MISMATCH"),
  guardOpen: a.id("ALARM", "ALM_GUARD_OPEN"),
  rejectRate: a.id("ALARM", "ALM_REJECT_RATE_HIGH"),
};

const RC = {
  bottle500: a.id("RECIPE", "RCP_500ML_STILL"),
  bottle1000: a.id("RECIPE", "RCP_1000ML_SPARKLING"),
};

const K = {
  oee: a.id("KPI", "KPI_OEE"),
  availability: a.id("KPI", "KPI_AVAILABILITY"),
  performance: a.id("KPI", "KPI_PERFORMANCE"),
  quality: a.id("KPI", "KPI_QUALITY"),
};

const EV = {
  fillTrend: a.id("EVIDENCE_SOURCE", "HIST_FILL_LEVEL_TREND"),
  stopLog: a.id("EVIDENCE_SOURCE", "HIST_STOP_EVENT_LOG"),
  rejectLog: a.id("EVIDENCE_SOURCE", "HIST_REJECT_LOG"),
  cpuDiag: a.id("EVIDENCE_SOURCE", "DIAG_CPU_BUFFER"),
  changeoverLog: a.id("EVIDENCE_SOURCE", "HIST_CHANGEOVER_LOG"),
};

const FM = {
  starvation: a.id("FAULT_MODE", "FM_UPSTREAM_STARVATION"),
  blockage: a.id("FAULT_MODE", "FM_DOWNSTREAM_BLOCKAGE"),
  fillerDrive: a.id("FAULT_MODE", "FM_FILLER_DRIVE_TRIP"),
  levelSensor: a.id("FAULT_MODE", "FM_LEVEL_SENSOR_STUCK"),
  recipeMismatch: a.id("FAULT_MODE", "FM_RECIPE_NOT_MATCHING_FORMAT"),
  capperWear: a.id("FAULT_MODE", "FM_CAPPER_CHUCK_WEAR"),
  visionComm: a.id("FAULT_MODE", "FM_VISION_COMM_LOSS"),
  guardInterlock: a.id("FAULT_MODE", "FM_GUARD_INTERLOCK_OPEN"),
  rejectPusher: a.id("FAULT_MODE", "FM_REJECT_PUSHER_FAILED"),
  changeoverIncomplete: a.id("FAULT_MODE", "FM_CHANGEOVER_INCOMPLETE"),
};

const SA = {
  stopLog: a.id("SAFE_ACTION", "SA_REVIEW_STOP_EVENT_LOG"),
  accumCheck: a.id("SAFE_ACTION", "SA_INSPECT_ACCUMULATION_TABLE"),
  upstreamCheck: a.id("SAFE_ACTION", "SA_CHECK_DEPALLETISER_SUPPLY"),
  driveHistory: a.id("SAFE_ACTION", "SA_READ_FILLER_DRIVE_HISTORY"),
  levelCheck: a.id("SAFE_ACTION", "SA_COMPARE_FILL_LEVEL_TO_CHECKWEIGHER"),
  recipeCompare: a.id("SAFE_ACTION", "SA_COMPARE_RECIPE_TO_FORMAT_PARTS"),
  capperInspect: a.id("SAFE_ACTION", "SA_INSPECT_CAPPER_CHUCKS"),
  visionLink: a.id("SAFE_ACTION", "SA_VERIFY_VISION_NETWORK_LINK"),
  guardReview: a.id("SAFE_ACTION", "SA_ESCALATE_GUARD_INTERLOCK_REVIEW"),
  rejectTest: a.id("SAFE_ACTION", "SA_REVIEW_REJECT_LOG_AND_PUSHER"),
  changeoverLog: a.id("SAFE_ACTION", "SA_REVIEW_CHANGEOVER_CHECKLIST"),
};

export const TIA_02_BOTTLING_PACKAGING: AuthoredReferenceSystem = {
  id: "TIA-02",
  name: t("High-speed bottling and packaging line", "خط پرکنی و بسته‌بندی پرسرعت"),
  domain: t(
    "Beverage filling, capping, inspection and packing",
    "پرکنی نوشیدنی، درب‌بندی، بازرسی و بسته‌بندی",
  ),
  sourceType: "TIA_REFERENCE",
  platform: "S7-1500 class controller, PROFINET IO, PROFIsafe guard monitoring",
  version: "1.0.0",
  revision: 1,
  origin: "SYNTHETIC_ORIGINAL",

  nodes: [
    a.node("DEVICE", "CPU_LINE", t("Line controller", "کنترلر خط"), {
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "ET200_FILLER", t("Filler remote I/O station", "ایستگاه ورودی/خروجی دور پرکن"), {
      domain: "FIELD_IO",
      attributes: { deviceCategory: "REMOTE_IO", networkZone: "FIELD" },
    }),
    a.node("DEVICE", "DRIVE_FILLER", t("Rotary filler drive", "درایو پرکن دوّار"), {
      domain: "DRIVES",
      attributes: { deviceCategory: "VFD", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "DRIVE_CAPPER", t("Capper drive", "درایو درب‌بند"), {
      domain: "DRIVES",
      attributes: { deviceCategory: "VFD", networkZone: "CONTROL" },
    }),
    a.node("DEVICE", "VISION_INSPECTOR", t("Vision inspection unit", "واحد بازرسی بینایی"), {
      domain: "QUALITY",
      attributes: { deviceCategory: "INDUSTRIAL_PC", networkZone: "CONTROL", protocol: "OPC_UA" },
    }),
    a.node("DEVICE", "SAFETY_CTL", t("Safety controller", "کنترلر ایمنی"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { deviceCategory: "SAFETY_CONTROLLER", networkZone: "SAFETY" },
      description: t(
        "Review-only within Hermes. Guard and E-stop functions are observed, never reset or bypassed.",
        "در هرمس فقط قابل بازبینی است. توابع حفاظ و توقف اضطراری مشاهده می‌شوند، نه ریست و نه دور زده.",
      ),
    }),

    a.node("EQUIPMENT", "DEPALLETISER", t("Depalletiser", "پالت‌بازکن"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "INFEED_CONVEYOR", t("Infeed conveyor", "نوار نقالهٔ ورودی"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "ROTARY_FILLER", t("Rotary filler", "پرکن دوّار"), { domain: "PROCESS" }),
    a.node("EQUIPMENT", "CAPPER", t("Capper", "درب‌بند"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "LABELLER", t("Labeller", "برچسب‌زن"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "REJECT_STATION", t("Reject station", "ایستگاه حذف"), { domain: "QUALITY" }),
    a.node("EQUIPMENT", "ACCUMULATION_TABLE", t("Accumulation table", "میز انباشت"), { domain: "MECHANICAL" }),
    a.node("EQUIPMENT", "CASE_PACKER", t("Case packer", "کارتن‌گذار"), { domain: "MECHANICAL" }),

    a.node("PLC_BLOCK", "OB1_MAIN", t("OB1 main cyclic block", "بلوک چرخه‌ای اصلی OB1"), {
      attributes: { blockType: "OB" },
      sourceId: "OB1",
    }),
    a.node("PLC_BLOCK", "FB_LINE_SEQUENCE", t("Line sequence function block", "بلوک تابعی توالی خط"), {
      attributes: { blockType: "FB" },
      sourceId: "FB2010",
    }),
    a.node("PLC_BLOCK", "FB_FILLER_CONTROL", t("Filler control function block", "بلوک تابعی کنترل پرکن"), {
      domain: "PROCESS",
      attributes: { blockType: "FB" },
      sourceId: "FB2020",
    }),
    a.node("PLC_BLOCK", "FC_PERMISSIVE_LOGIC", t("Permissive evaluation function", "تابع ارزیابی مجوزها"), {
      attributes: { blockType: "FC" },
      sourceId: "FC2030",
    }),
    a.node("PLC_BLOCK", "FB_RECIPE_MANAGER", t("Recipe manager function block", "بلوک تابعی مدیر دستور ساخت"), {
      domain: "QUALITY",
      attributes: { blockType: "FB" },
      sourceId: "FB2040",
    }),
    a.node("PLC_BLOCK", "FB_OEE_COUNTERS", t("OEE counter function block", "بلوک تابعی شمارنده‌های OEE"), {
      domain: "QUALITY",
      attributes: { blockType: "FB" },
      sourceId: "FB2050",
    }),
    a.node("PLC_BLOCK", "DB_LINE_DATA", t("Line data block", "بلوک دادهٔ خط"), {
      attributes: { blockType: "DB" },
      sourceId: "DB2010",
    }),
    a.node("PLC_BLOCK", "UDT_STATION_STATUS", t("Station status user data type", "نوع دادهٔ کاربری وضعیت ایستگاه"), {
      attributes: { blockType: "UDT" },
      sourceId: "UDT_StationStatus",
    }),

    a.node("TAG", "LINE_START_REQ", t("Line start request", "درخواست راه‌اندازی خط"), {
      attributes: { dataType: "BOOL", address: "DB2010.DBX0.0", accessMode: "READ" },
    }),
    a.node("TAG", "LINE_MODE_AUTO", t("Automatic mode active", "حالت خودکار فعال"), {
      attributes: { dataType: "BOOL", address: "DB2010.DBX0.1", accessMode: "READ" },
    }),
    a.node("TAG", "LINE_RUNNING", t("Line running", "خط در حال کار"), {
      attributes: { dataType: "BOOL", address: "DB2010.DBX0.2", accessMode: "READ" },
    }),
    a.node("TAG", "FILLER_DRIVE_READY", t("Filler drive ready", "آمادگی درایو پرکن"), {
      domain: "DRIVES",
      attributes: { dataType: "BOOL", address: "DB2020.DBX0.0", accessMode: "READ" },
    }),
    a.node("TAG", "FILLER_DRIVE_FAULT", t("Filler drive fault", "خطای درایو پرکن"), {
      domain: "DRIVES",
      attributes: { dataType: "BOOL", address: "DB2020.DBX0.1", accessMode: "READ" },
    }),
    a.node("TAG", "FILLER_SPEED_ACT", t("Filler actual speed", "سرعت واقعی پرکن"), {
      domain: "DRIVES",
      attributes: { dataType: "REAL", address: "DB2020.DBD4", unit: "bpm", accessMode: "READ" },
    }),
    a.node("TAG", "CAPPER_DRIVE_READY", t("Capper drive ready", "آمادگی درایو درب‌بند"), {
      domain: "DRIVES",
      attributes: { dataType: "BOOL", address: "DB2020.DBX8.0", accessMode: "READ" },
    }),
    a.node("TAG", "CAPPER_TORQUE_ACT", t("Capping torque", "گشتاور درب‌بندی"), {
      domain: "QUALITY",
      attributes: { dataType: "REAL", address: "DB2020.DBD12", unit: "N·m", accessMode: "READ" },
    }),
    a.node("TAG", "INFEED_BACKUP_FULL", t("Infeed backed up", "پرشدن صف ورودی"), {
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", address: "DB2010.DBX4.0", accessMode: "READ" },
    }),
    a.node("TAG", "ACCUM_LEVEL_LOW", t("Accumulation low", "کاهش انباشت"), {
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", address: "DB2010.DBX4.1", accessMode: "READ" },
    }),
    a.node("TAG", "ACCUM_LEVEL_HIGH", t("Accumulation high", "افزایش انباشت"), {
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", address: "DB2010.DBX4.2", accessMode: "READ" },
    }),
    a.node("TAG", "PACKER_READY", t("Case packer ready", "آمادگی کارتن‌گذار"), {
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", address: "DB2010.DBX4.3", accessMode: "READ" },
    }),
    a.node("TAG", "FILL_LEVEL_ACT", t("Actual fill level", "سطح پرشدگی واقعی"), {
      domain: "PROCESS",
      attributes: { dataType: "REAL", address: "DB2020.DBD16", unit: "mm", accessMode: "READ" },
    }),
    a.node("TAG", "FILL_LEVEL_SP", t("Fill level setpoint", "نقطهٔ تنظیم سطح پرشدگی"), {
      domain: "PROCESS",
      attributes: { dataType: "REAL", address: "DB2020.DBD20", unit: "mm", accessMode: "READ" },
    }),
    a.node("TAG", "PRODUCT_TEMP_ACT", t("Product temperature", "دمای محصول"), {
      domain: "PROCESS",
      attributes: { dataType: "REAL", address: "DB2020.DBD24", unit: "°C", accessMode: "READ" },
    }),
    a.node("TAG", "REJECT_COUNT", t("Reject count", "شمار حذف‌شده"), {
      domain: "QUALITY",
      attributes: { dataType: "DINT", address: "DB2050.DBD0", accessMode: "READ" },
    }),
    a.node("TAG", "GOOD_COUNT", t("Good count", "شمار سالم"), {
      domain: "QUALITY",
      attributes: { dataType: "DINT", address: "DB2050.DBD4", accessMode: "READ" },
    }),
    a.node("TAG", "ACTIVE_RECIPE_ID", t("Active recipe id", "شناسهٔ دستور ساخت فعال"), {
      domain: "QUALITY",
      attributes: { dataType: "STRING", address: "DB2040.DBB0", accessMode: "READ" },
    }),
    a.node("TAG", "RECIPE_LOADED_OK", t("Recipe loaded successfully", "بارگذاری موفق دستور ساخت"), {
      domain: "QUALITY",
      attributes: { dataType: "BOOL", address: "DB2040.DBX40.0", accessMode: "READ" },
    }),
    a.node("TAG", "CAP_TORQUE_IN_RANGE", t("Capping torque within range", "قرارگرفتن گشتاور درب‌بندی در بازه"), {
      domain: "QUALITY",
      attributes: { dataType: "BOOL", address: "DB2020.DBX28.0", accessMode: "READ" },
    }),
    a.node("TAG", "ESTOP_CHAIN_OK", t("E-stop chain healthy", "سالم‌بودن زنجیرهٔ توقف اضطراری"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", address: "DB2090.DBX0.0", accessMode: "READ" },
    }),
    a.node("TAG", "GUARD_DOORS_CLOSED", t("Guard doors closed", "بسته‌بودن درهای حفاظ"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { dataType: "BOOL", address: "DB2090.DBX0.1", accessMode: "READ" },
    }),
    a.node("TAG", "VISION_ONLINE", t("Vision system online", "برخط‌بودن سامانهٔ بینایی"), {
      domain: "NETWORK",
      attributes: { dataType: "BOOL", address: "DB2060.DBX0.0", accessMode: "READ" },
    }),

    a.node("IO_POINT", "DI_BOTTLE_PRESENT", t("Bottle presence sensor input", "ورودی حسگر حضور بطری"), {
      domain: "FIELD_IO",
      attributes: { channelType: "DI", address: "I20.0" },
    }),
    a.node("IO_POINT", "DI_ACCUM_LOW_SW", t("Accumulation low switch input", "ورودی کلید کاهش انباشت"), {
      domain: "FIELD_IO",
      attributes: { channelType: "DI", address: "I20.1" },
    }),
    a.node("IO_POINT", "DI_ACCUM_HIGH_SW", t("Accumulation high switch input", "ورودی کلید افزایش انباشت"), {
      domain: "FIELD_IO",
      attributes: { channelType: "DI", address: "I20.2" },
    }),
    a.node("IO_POINT", "PS_GUARD_SWITCH", t("Guard door PROFIsafe channel", "کانال پروفی‌سیف در حفاظ"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { channelType: "PROFISAFE" },
    }),
    a.node("IO_POINT", "AI_FILL_LEVEL", t("Fill level sensor input", "ورودی حسگر سطح پرشدگی"), {
      domain: "FIELD_IO",
      attributes: { channelType: "AI", address: "IW200", unit: "mA" },
      description: t(
        "4–20 mA loop. A frozen reading is a loop or sensor fault, not a perfectly stable process.",
        "حلقهٔ ۴ تا ۲۰ میلی‌آمپر. قرائت ثابت‌مانده یعنی خطای حلقه یا حسگر، نه فرایندی کاملاً پایدار.",
      ),
    }),
    a.node("IO_POINT", "AI_PRODUCT_TEMP", t("Product temperature input", "ورودی دمای محصول"), {
      domain: "FIELD_IO",
      attributes: { channelType: "AI", address: "IW202", unit: "mA" },
    }),
    a.node("IO_POINT", "DO_REJECT_PUSHER", t("Reject pusher output", "خروجی پوشر حذف"), {
      domain: "FIELD_IO",
      attributes: { channelType: "DO", address: "Q20.0" },
    }),
    a.node("IO_POINT", "PN_VISION_PORT", t("Vision unit PROFINET port", "پورت پروفینت واحد بینایی"), {
      domain: "NETWORK",
      attributes: { channelType: "PROFINET" },
    }),
    a.node("IO_POINT", "AI_CAPPER_TORQUE", t("Capper torque transducer input", "ورودی مبدل گشتاور درب‌بند"), {
      domain: "FIELD_IO",
      attributes: { channelType: "AI", address: "IW204", unit: "mA" },
    }),

    a.node("SEQUENCE", "LINE_SEQUENCE", t("Line production sequence", "توالی تولید خط"), {
      sourceId: "FB2010/SEQ",
    }),
    a.node("STATE", "S00_IDLE", t("S00 — idle", "S00 — بی‌کار"), { attributes: { stepNumber: 0 } }),
    a.node("STATE", "S10_CHANGEOVER", t("S10 — format changeover", "S10 — تعویض فرمت"), {
      attributes: { stepNumber: 10, stepTimeoutSeconds: 900 },
    }),
    a.node("STATE", "S20_PRIME", t("S20 — prime the fill heads", "S20 — پرکردن اولیهٔ نازل‌ها"), {
      attributes: { stepNumber: 20, stepTimeoutSeconds: 120 },
    }),
    a.node("STATE", "S30_PRODUCE", t("S30 — production", "S30 — تولید"), { attributes: { stepNumber: 30 } }),
    a.node("STATE", "S40_DRAIN", t("S40 — drain down", "S40 — تخلیهٔ خط"), {
      attributes: { stepNumber: 40, stepTimeoutSeconds: 300 },
    }),
    a.node("STATE", "S50_COMPLETE", t("S50 — complete", "S50 — پایان"), { attributes: { stepNumber: 50 } }),

    a.node("PERMISSIVE", "PRM_MODE_AUTO", t("Automatic mode permissive", "مجوز حالت خودکار"), {}),
    a.node("PERMISSIVE", "PRM_RECIPE_LOADED", t("Recipe loaded permissive", "مجوز بارگذاری دستور ساخت"), {
      domain: "QUALITY",
    }),
    a.node("PERMISSIVE", "PRM_GUARDS_CLOSED", t("Guards closed permissive", "مجوز بسته‌بودن حفاظ‌ها"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("PERMISSIVE", "PRM_INFEED_SUPPLY", t("Infeed supply permissive", "مجوز تأمین ورودی"), {
      domain: "MECHANICAL",
    }),
    a.node("PERMISSIVE", "PRM_DOWNSTREAM_READY", t("Downstream ready permissive", "مجوز آمادگی پایین‌دست"), {
      domain: "MECHANICAL",
    }),
    a.node("PERMISSIVE", "PRM_VISION_ONLINE", t("Vision online permissive", "مجوز برخط‌بودن بینایی"), {
      domain: "QUALITY",
    }),

    a.node("INTERLOCK", "ILK_ESTOP_ACTIVE", t("E-stop active interlock", "اینترلاک فعال‌بودن توقف اضطراری"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "Observed only. Hermes never proposes resetting, bridging or defeating this interlock.",
        "فقط مشاهده می‌شود. هرمس هرگز ریست، پل‌زدن یا حذف این اینترلاک را پیشنهاد نمی‌کند.",
      ),
    }),
    a.node("INTERLOCK", "ILK_GUARD_OPEN", t("Guard open interlock", "اینترلاک بازبودن حفاظ"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
    }),
    a.node("INTERLOCK", "ILK_ACCUM_FULL", t("Accumulation full interlock", "اینترلاک پرشدن انباشت"), {
      domain: "MECHANICAL",
    }),
    a.node("INTERLOCK", "ILK_INFEED_STARVED", t("Infeed starved interlock", "اینترلاک کمبود تغذیهٔ ورودی"), {
      domain: "MECHANICAL",
    }),
    a.node("INTERLOCK", "ILK_CAP_TORQUE_OUT_OF_RANGE", t("Capping torque out of range interlock", "اینترلاک خروج گشتاور درب‌بندی از بازه"), {
      domain: "QUALITY",
    }),

    a.node("ALARM", "ALM_FILLER_DRIVE_FAULT", t("Filler drive fault", "خطای درایو پرکن"), {
      domain: "DRIVES",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_LINE_STARVED", t("Line starved — no bottles from upstream", "کمبود تغذیهٔ خط — نبود بطری از بالادست"), {
      domain: "MECHANICAL",
      attributes: { alarmPriority: "MEDIUM", requiresAck: false },
    }),
    a.node("ALARM", "ALM_LINE_BLOCKED", t("Line blocked — downstream not accepting", "انسداد خط — نپذیرفتن پایین‌دست"), {
      domain: "MECHANICAL",
      attributes: { alarmPriority: "MEDIUM", requiresAck: false },
    }),
    a.node("ALARM", "ALM_FILL_LEVEL_DEVIATION", t("Fill level deviation", "انحراف سطح پرشدگی"), {
      domain: "PROCESS",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_CAP_TORQUE_FAULT", t("Capping torque out of specification", "خروج گشتاور درب‌بندی از مشخصات"), {
      domain: "QUALITY",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_VISION_OFFLINE", t("Vision system offline", "برون‌خط‌شدن سامانهٔ بینایی"), {
      domain: "NETWORK",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_RECIPE_MISMATCH", t("Recipe does not match installed format parts", "ناسازگاری دستور ساخت با قطعات فرمت نصب‌شده"), {
      domain: "QUALITY",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_GUARD_OPEN", t("Guard door open", "بازبودن در حفاظ"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_REJECT_RATE_HIGH", t("Reject rate above threshold", "نرخ حذف بالاتر از آستانه"), {
      domain: "QUALITY",
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),

    a.node("RECIPE", "RCP_500ML_STILL", t("500 ml still water format", "فرمت آب بدون گاز ۵۰۰ میلی‌لیتر"), {
      domain: "QUALITY",
      attributes: { formula: "fill level 168 mm, cap torque 1.8–2.4 N·m, 600 bpm" },
    }),
    a.node("RECIPE", "RCP_1000ML_SPARKLING", t("1000 ml sparkling format", "فرمت نوشیدنی گازدار ۱۰۰۰ میلی‌لیتر"), {
      domain: "QUALITY",
      attributes: { formula: "fill level 214 mm, cap torque 2.6–3.2 N·m, 380 bpm" },
    }),

    a.node("KPI", "KPI_OEE", t("Overall equipment effectiveness", "اثربخشی کلی تجهیزات"), {
      domain: "QUALITY",
      attributes: { formula: "availability × performance × quality" },
    }),
    a.node("KPI", "KPI_AVAILABILITY", t("Availability", "دسترس‌پذیری"), {
      domain: "QUALITY",
      attributes: { formula: "run time ÷ planned production time" },
    }),
    a.node("KPI", "KPI_PERFORMANCE", t("Performance", "کارایی"), {
      domain: "QUALITY",
      attributes: { formula: "actual rate ÷ nominal rate" },
    }),
    a.node("KPI", "KPI_QUALITY", t("Quality", "کیفیت"), {
      domain: "QUALITY",
      attributes: { formula: "good count ÷ (good count + reject count)" },
    }),

    a.node("EVIDENCE_SOURCE", "HIST_FILL_LEVEL_TREND", t("Fill level historian", "بایگانی سطح پرشدگی"), {
      domain: "PROCESS",
      attributes: { retentionDays: 180, sampleIntervalSeconds: 1 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_STOP_EVENT_LOG", t("Stop event and downtime log", "گزارش رخداد توقف و زمان از کارافتادگی"), {
      domain: "MAINTENANCE",
      attributes: { retentionDays: 365 },
      description: t(
        "Records which station stopped FIRST — on an interlinked line that single fact usually names the culprit.",
        "ثبت می‌کند کدام ایستگاه نخست متوقف شده — در خط زنجیره‌ای همین یک واقعیت معمولاً مقصر را مشخص می‌کند.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_REJECT_LOG", t("Reject and inspection log", "گزارش حذف و بازرسی"), {
      domain: "QUALITY",
      attributes: { retentionDays: 365 },
    }),
    a.node("EVIDENCE_SOURCE", "DIAG_CPU_BUFFER", t("Controller diagnostic buffer", "بافر تشخیصی کنترلر"), {
      attributes: { retentionDays: 30 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_CHANGEOVER_LOG", t("Changeover checklist log", "گزارش سیاههٔ تعویض فرمت"), {
      domain: "QUALITY",
      attributes: { retentionDays: 365 },
    }),

    a.node("FAULT_MODE", "FM_UPSTREAM_STARVATION", t("Upstream starvation — no supply into the filler", "کمبود تغذیهٔ بالادست — نرسیدن بطری به پرکن"), {
      domain: "MECHANICAL",
      attributes: { faultClass: "BLOCKAGE", subsystem: "UPSTREAM_DOWNSTREAM" },
    }),
    a.node("FAULT_MODE", "FM_DOWNSTREAM_BLOCKAGE", t("Downstream blockage — packer not accepting", "انسداد پایین‌دست — نپذیرفتن کارتن‌گذار"), {
      domain: "MECHANICAL",
      attributes: { faultClass: "BLOCKAGE", subsystem: "UPSTREAM_DOWNSTREAM" },
    }),
    a.node("FAULT_MODE", "FM_FILLER_DRIVE_TRIP", t("Filler drive trip", "تریپ درایو پرکن"), {
      domain: "DRIVES",
      attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
    }),
    a.node("FAULT_MODE", "FM_LEVEL_SENSOR_STUCK", t("Fill level sensor stuck", "گیرکردن حسگر سطح پرشدگی"), {
      domain: "FIELD_IO",
      attributes: { faultClass: "STALE_TELEMETRY", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_RECIPE_NOT_MATCHING_FORMAT", t("Recipe does not match installed format parts", "ناسازگاری دستور ساخت با قطعات فرمت نصب‌شده"), {
      domain: "QUALITY",
      attributes: { faultClass: "RECIPE_MISMATCH", subsystem: "RECIPE_CONFIG" },
    }),
    a.node("FAULT_MODE", "FM_CAPPER_CHUCK_WEAR", t("Capper chuck wear", "سایش گیرهٔ درب‌بند"), {
      domain: "MECHANICAL",
      attributes: { faultClass: "ACTUATOR_FAILURE", subsystem: "MECHANICAL" },
    }),
    a.node("FAULT_MODE", "FM_VISION_COMM_LOSS", t("Vision unit communication loss", "قطع ارتباط واحد بینایی"), {
      domain: "NETWORK",
      attributes: { faultClass: "COMMUNICATION_LOSS", subsystem: "NETWORK" },
    }),
    a.node("FAULT_MODE", "FM_GUARD_INTERLOCK_OPEN", t("Guard interlock open", "بازبودن اینترلاک حفاظ"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { faultClass: "INTERLOCK_ACTIVE", subsystem: "SAFETY_CIRCUIT" },
    }),
    a.node("FAULT_MODE", "FM_REJECT_PUSHER_FAILED", t("Reject pusher failed to actuate", "عمل‌نکردن پوشر حذف"), {
      domain: "FIELD_IO",
      attributes: { faultClass: "ACTUATOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_CHANGEOVER_INCOMPLETE", t("Changeover left incomplete", "ناتمام‌ماندن تعویض فرمت"), {
      domain: "QUALITY",
      attributes: { faultClass: "SEQUENCE_TIMEOUT", subsystem: "RECIPE_CONFIG" },
    }),

    a.node("SAFE_ACTION", "SA_REVIEW_STOP_EVENT_LOG", t("Review the stop event log and identify which station stopped first", "گزارش رخداد توقف را بررسی و ایستگاهی که نخست متوقف شده را مشخص کنید"), {
      domain: "MAINTENANCE",
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_ACCUMULATION_TABLE", t("Inspect the accumulation table for a jam or a stalled bottle", "میز انباشت را برای گیر یا بطری متوقف بازرسی کنید"), {
      domain: "MECHANICAL",
    }),
    a.node("SAFE_ACTION", "SA_CHECK_DEPALLETISER_SUPPLY", t("Check depalletiser output and infeed conveyor supply", "خروجی پالت‌بازکن و تأمین نوار ورودی را بررسی کنید"), {
      domain: "MECHANICAL",
    }),
    a.node("SAFE_ACTION", "SA_READ_FILLER_DRIVE_HISTORY", t("Read the filler drive fault history before any reset", "پیش از هر ریست، تاریخچهٔ خطای درایو پرکن را بخوانید"), {
      domain: "DRIVES",
    }),
    a.node("SAFE_ACTION", "SA_COMPARE_FILL_LEVEL_TO_CHECKWEIGHER", t("Compare the fill level reading against checkweigher results", "قرائت سطح پرشدگی را با نتایج وزن‌سنج کنترلی مقایسه کنید"), {
      domain: "QUALITY",
    }),
    a.node("SAFE_ACTION", "SA_COMPARE_RECIPE_TO_FORMAT_PARTS", t("Compare the active recipe against the format parts physically installed", "دستور ساخت فعال را با قطعات فرمت نصب‌شده مقایسه کنید"), {
      domain: "QUALITY",
    }),
    a.node("SAFE_ACTION", "SA_INSPECT_CAPPER_CHUCKS", t("Inspect the capper chucks and torque calibration", "گیره‌های درب‌بند و کالیبراسیون گشتاور را بازرسی کنید"), {
      domain: "MAINTENANCE",
    }),
    a.node("SAFE_ACTION", "SA_VERIFY_VISION_NETWORK_LINK", t("Verify the vision unit network link and port diagnostics", "پیوند شبکهٔ واحد بینایی و تشخیص پورت را راستی‌آزمایی کنید"), {
      domain: "NETWORK",
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_GUARD_INTERLOCK_REVIEW", t("Escalate to a qualified safety engineer — never bypass a guard interlock", "به مهندس ایمنی واجد صلاحیت ارجاع دهید — اینترلاک حفاظ را هرگز دور نزنید"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_REJECT_LOG_AND_PUSHER", t("Review the reject log and confirm the pusher actuated for each reject", "گزارش حذف را بررسی و عمل‌کردن پوشر برای هر حذف را تأیید کنید"), {
      domain: "QUALITY",
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_CHANGEOVER_CHECKLIST", t("Review the changeover checklist for steps left unconfirmed", "سیاههٔ تعویض فرمت را برای گام‌های تأییدنشده بررسی کنید"), {
      domain: "QUALITY",
    }),
  ],

  edges: [
    a.edge(D.cpu, B.ob1, "CONTAINS"),
    a.edge(D.cpu, B.line, "CONTAINS"),
    a.edge(D.cpu, B.fill, "CONTAINS"),
    a.edge(D.cpu, B.perm, "CONTAINS"),
    a.edge(D.cpu, B.recipe, "CONTAINS"),
    a.edge(D.cpu, B.oee, "CONTAINS"),
    a.edge(D.cpu, B.db, "CONTAINS"),
    a.edge(D.cpu, B.udt, "CONTAINS"),
    a.edge(B.ob1, B.perm, "CALLS"),
    a.edge(B.ob1, B.line, "CALLS"),
    a.edge(B.ob1, B.oee, "CALLS"),
    a.edge(B.line, B.fill, "CALLS"),
    a.edge(B.line, B.recipe, "CALLS"),
    a.edge(B.line, SQ, "CONTAINS"),

    a.edge(D.remoteIo, IO.bottlePresent, "CONTAINS"),
    a.edge(D.remoteIo, IO.accumLowSw, "CONTAINS"),
    a.edge(D.remoteIo, IO.accumHighSw, "CONTAINS"),
    a.edge(D.remoteIo, IO.levelSensor, "CONTAINS"),
    a.edge(D.remoteIo, IO.tempSensor, "CONTAINS"),
    a.edge(D.remoteIo, IO.rejectValve, "CONTAINS"),
    a.edge(D.remoteIo, IO.capperTorqueAi, "CONTAINS"),
    a.edge(D.inspector, IO.visionLink, "CONTAINS"),
    a.edge(D.safety, IO.guardSw, "CONTAINS"),

    a.edge(T.fillLevelAct, IO.levelSensor, "BOUND_TO"),
    a.edge(T.productTemp, IO.tempSensor, "BOUND_TO"),
    a.edge(T.accumLow, IO.accumLowSw, "BOUND_TO"),
    a.edge(T.accumHigh, IO.accumHighSw, "BOUND_TO"),
    a.edge(T.guardClosed, IO.guardSw, "BOUND_TO"),
    a.edge(T.visionOnline, IO.visionLink, "BOUND_TO"),
    a.edge(T.capperTorque, IO.capperTorqueAi, "BOUND_TO"),
    a.edge(T.infeedFull, IO.bottlePresent, "BOUND_TO"),

    a.edge(B.perm, T.modeAuto, "READS"),
    a.edge(B.perm, T.recipeLoaded, "READS"),
    a.edge(B.perm, T.guardClosed, "READS"),
    a.edge(B.perm, T.accumLow, "READS"),
    a.edge(B.perm, T.downstreamReady, "READS"),
    a.edge(B.perm, T.visionOnline, "READS"),
    a.edge(B.perm, P.mode, "WRITES"),
    a.edge(B.perm, P.recipe, "WRITES"),
    a.edge(B.perm, P.guards, "WRITES"),
    a.edge(B.perm, P.infeed, "WRITES"),
    a.edge(B.perm, P.downstream, "WRITES"),
    a.edge(B.perm, P.vision, "WRITES"),

    a.edge(B.line, T.startReq, "READS"),
    a.edge(B.line, T.modeAuto, "READS"),
    a.edge(B.line, P.mode, "READS"),
    a.edge(B.line, P.recipe, "READS"),
    a.edge(B.line, P.guards, "READS"),
    a.edge(B.line, P.downstream, "READS"),
    a.edge(B.line, P.vision, "READS"),
    a.edge(B.line, I.estop, "READS"),
    a.edge(B.line, I.accumFull, "READS"),
    a.edge(B.line, I.starved, "READS"),
    a.edge(B.line, T.running, "WRITES"),

    a.edge(B.fill, T.fillerReady, "READS"),
    a.edge(B.fill, T.fillerFault, "READS"),
    a.edge(B.fill, T.fillerSpeed, "READS"),
    a.edge(B.fill, T.fillLevelAct, "READS"),
    a.edge(B.fill, T.fillLevelSp, "READS"),
    a.edge(B.fill, T.capperTorque, "READS"),
    a.edge(B.fill, T.capTorqueOk, "READS"),
    a.edge(B.fill, T.capTorqueOk, "WRITES"),
    a.edge(B.fill, I.capTorque, "WRITES"),

    a.edge(B.recipe, T.recipeId, "READS"),
    a.edge(B.recipe, T.recipeLoaded, "WRITES"),
    a.edge(B.recipe, T.fillLevelSp, "WRITES"),

    a.edge(B.oee, T.goodCount, "READS"),
    a.edge(B.oee, T.rejectCount, "READS"),
    a.edge(B.oee, T.running, "READS"),

    a.edge(B.db, T.fillLevelSp, "CONTAINS"),
    a.edge(B.udt, T.fillerReady, "CONTAINS"),

    a.edge(EQ.depal, EQ.infeed, "MONITORS"),
    a.edge(EQ.infeed, EQ.filler, "MONITORS"),
    a.edge(EQ.filler, EQ.capper, "MONITORS"),
    a.edge(EQ.capper, EQ.labeller, "MONITORS"),
    a.edge(EQ.labeller, EQ.reject, "MONITORS"),
    a.edge(EQ.reject, EQ.accumulator, "MONITORS"),
    a.edge(EQ.accumulator, EQ.packer, "MONITORS"),
    a.edge(D.fillerDrive, EQ.filler, "ACTUATES"),
    a.edge(D.capperDrive, EQ.capper, "ACTUATES"),
    a.edge(IO.rejectValve, EQ.reject, "ACTUATES"),
    a.edge(T.downstreamReady, EQ.packer, "MONITORS"),
    a.edge(T.accumHigh, EQ.accumulator, "MONITORS"),
    a.edge(T.accumLow, EQ.accumulator, "MONITORS"),
    a.edge(T.infeedFull, EQ.infeed, "MONITORS"),

    a.edge(SQ, S.idle, "CONTAINS"),
    a.edge(SQ, S.changeover, "CONTAINS"),
    a.edge(SQ, S.prime, "CONTAINS"),
    a.edge(SQ, S.produce, "CONTAINS"),
    a.edge(SQ, S.drain, "CONTAINS"),
    a.edge(SQ, S.done, "CONTAINS"),
    ...chainStates(a, [S.idle, S.changeover, S.prime, S.produce, S.drain, S.done]),

    a.edge(P.mode, T.modeAuto, "DERIVED_FROM"),
    a.edge(P.recipe, T.recipeLoaded, "DERIVED_FROM"),
    a.edge(P.guards, T.guardClosed, "DERIVED_FROM"),
    a.edge(P.infeed, T.accumLow, "DERIVED_FROM"),
    a.edge(P.downstream, T.downstreamReady, "DERIVED_FROM"),
    a.edge(P.vision, T.visionOnline, "DERIVED_FROM"),
    a.edge(P.mode, SQ, "GATES"),
    a.edge(P.recipe, S.prime, "GATES"),
    a.edge(P.guards, S.produce, "GATES"),
    a.edge(P.infeed, S.produce, "GATES"),
    a.edge(P.downstream, S.produce, "GATES"),
    a.edge(P.vision, S.produce, "GATES"),

    a.edge(I.estop, T.estopOk, "DERIVED_FROM"),
    a.edge(I.guardOpen, T.guardClosed, "DERIVED_FROM"),
    a.edge(I.accumFull, T.accumHigh, "DERIVED_FROM"),
    a.edge(I.starved, T.accumLow, "DERIVED_FROM"),
    a.edge(I.capTorque, T.capTorqueOk, "DERIVED_FROM"),
    a.edge(I.estop, SQ, "BLOCKS"),
    a.edge(I.guardOpen, S.produce, "BLOCKS"),
    a.edge(I.accumFull, S.produce, "BLOCKS"),
    a.edge(I.starved, S.produce, "BLOCKS"),
    a.edge(I.capTorque, EQ.capper, "BLOCKS"),

    a.edge(T.fillerFault, AL.fillerFault, "RAISES"),
    a.edge(T.accumLow, AL.starved, "RAISES"),
    a.edge(T.accumHigh, AL.blocked, "RAISES"),
    a.edge(T.fillLevelAct, AL.fillDeviation, "RAISES"),
    a.edge(T.capTorqueOk, AL.capTorque, "RAISES"),
    a.edge(T.visionOnline, AL.visionOffline, "RAISES"),
    a.edge(T.recipeId, AL.recipeMismatch, "RAISES"),
    a.edge(T.guardClosed, AL.guardOpen, "RAISES"),
    a.edge(T.rejectCount, AL.rejectRate, "RAISES"),

    a.edge(RC.bottle500, T.fillLevelSp, "DERIVED_FROM"),
    a.edge(RC.bottle1000, T.fillLevelSp, "DERIVED_FROM"),
    a.edge(B.recipe, RC.bottle500, "CONTAINS"),
    a.edge(B.recipe, RC.bottle1000, "CONTAINS"),

    a.edge(K.oee, K.availability, "DERIVED_FROM"),
    a.edge(K.oee, K.performance, "DERIVED_FROM"),
    a.edge(K.oee, K.quality, "DERIVED_FROM"),
    a.edge(K.availability, T.running, "DERIVED_FROM"),
    a.edge(K.performance, T.fillerSpeed, "DERIVED_FROM"),
    a.edge(K.quality, T.goodCount, "DERIVED_FROM"),
    a.edge(K.quality, T.rejectCount, "DERIVED_FROM"),

    a.edge(EV.fillTrend, T.fillLevelAct, "RECORDS"),
    a.edge(EV.stopLog, SQ, "RECORDS"),
    a.edge(EV.rejectLog, T.rejectCount, "RECORDS"),
    a.edge(EV.cpuDiag, D.cpu, "RECORDS"),
    a.edge(EV.changeoverLog, S.changeover, "RECORDS"),

    a.edge(FM.starvation, AL.starved, "EXPLAINS"),
    a.edge(FM.starvation, I.starved, "EXPLAINS"),
    a.edge(T.accumLow, FM.starvation, "EVIDENCE_FOR"),
    a.edge(T.infeedFull, FM.starvation, "EVIDENCE_FOR"),
    a.edge(EQ.depal, FM.starvation, "EVIDENCE_FOR"),
    a.edge(EV.stopLog, FM.starvation, "EVIDENCE_FOR"),

    a.edge(FM.blockage, AL.blocked, "EXPLAINS"),
    a.edge(FM.blockage, I.accumFull, "EXPLAINS"),
    a.edge(T.accumHigh, FM.blockage, "EVIDENCE_FOR"),
    a.edge(T.downstreamReady, FM.blockage, "EVIDENCE_FOR"),
    a.edge(EV.stopLog, FM.blockage, "EVIDENCE_FOR"),

    a.edge(FM.fillerDrive, AL.fillerFault, "EXPLAINS"),
    a.edge(T.fillerFault, FM.fillerDrive, "EVIDENCE_FOR"),
    a.edge(T.fillerReady, FM.fillerDrive, "EVIDENCE_FOR"),
    a.edge(T.fillerSpeed, FM.fillerDrive, "EVIDENCE_FOR"),
    a.edge(EV.cpuDiag, FM.fillerDrive, "EVIDENCE_FOR"),

    a.edge(FM.levelSensor, AL.fillDeviation, "EXPLAINS"),
    a.edge(T.fillLevelAct, FM.levelSensor, "EVIDENCE_FOR"),
    a.edge(IO.levelSensor, FM.levelSensor, "EVIDENCE_FOR"),
    a.edge(EV.fillTrend, FM.levelSensor, "EVIDENCE_FOR"),

    a.edge(FM.recipeMismatch, AL.recipeMismatch, "EXPLAINS"),
    a.edge(T.recipeId, FM.recipeMismatch, "EVIDENCE_FOR"),
    a.edge(T.recipeLoaded, FM.recipeMismatch, "EVIDENCE_FOR"),
    a.edge(T.fillLevelSp, FM.recipeMismatch, "EVIDENCE_FOR"),
    a.edge(EV.changeoverLog, FM.recipeMismatch, "EVIDENCE_FOR"),

    a.edge(FM.capperWear, AL.capTorque, "EXPLAINS"),
    a.edge(FM.capperWear, I.capTorque, "EXPLAINS"),
    a.edge(T.capperTorque, FM.capperWear, "EVIDENCE_FOR"),
    a.edge(T.capTorqueOk, FM.capperWear, "EVIDENCE_FOR"),
    a.edge(IO.capperTorqueAi, FM.capperWear, "EVIDENCE_FOR"),

    a.edge(FM.visionComm, AL.visionOffline, "EXPLAINS"),
    a.edge(T.visionOnline, FM.visionComm, "EVIDENCE_FOR"),
    a.edge(IO.visionLink, FM.visionComm, "EVIDENCE_FOR"),
    a.edge(EV.cpuDiag, FM.visionComm, "EVIDENCE_FOR"),

    a.edge(FM.guardInterlock, AL.guardOpen, "EXPLAINS"),
    a.edge(FM.guardInterlock, I.guardOpen, "EXPLAINS"),
    a.edge(T.guardClosed, FM.guardInterlock, "EVIDENCE_FOR"),
    a.edge(IO.guardSw, FM.guardInterlock, "EVIDENCE_FOR"),

    a.edge(FM.rejectPusher, AL.rejectRate, "EXPLAINS"),
    a.edge(T.rejectCount, FM.rejectPusher, "EVIDENCE_FOR"),
    a.edge(IO.rejectValve, FM.rejectPusher, "EVIDENCE_FOR"),
    a.edge(EV.rejectLog, FM.rejectPusher, "EVIDENCE_FOR"),

    a.edge(FM.changeoverIncomplete, S.changeover, "EXPLAINS"),
    a.edge(T.recipeLoaded, FM.changeoverIncomplete, "EVIDENCE_FOR"),
    a.edge(EV.changeoverLog, FM.changeoverIncomplete, "EVIDENCE_FOR"),

    a.edge(SA.stopLog, FM.starvation, "VERIFIES"),
    a.edge(SA.upstreamCheck, FM.starvation, "VERIFIES"),
    a.edge(SA.stopLog, FM.blockage, "VERIFIES"),
    a.edge(SA.accumCheck, FM.blockage, "VERIFIES"),
    a.edge(SA.driveHistory, FM.fillerDrive, "VERIFIES"),
    a.edge(SA.levelCheck, FM.levelSensor, "VERIFIES"),
    a.edge(SA.recipeCompare, FM.recipeMismatch, "VERIFIES"),
    a.edge(SA.changeoverLog, FM.recipeMismatch, "VERIFIES"),
    a.edge(SA.capperInspect, FM.capperWear, "VERIFIES"),
    a.edge(SA.visionLink, FM.visionComm, "VERIFIES"),
    a.edge(SA.guardReview, FM.guardInterlock, "VERIFIES"),
    a.edge(SA.rejectTest, FM.rejectPusher, "VERIFIES"),
    a.edge(SA.changeoverLog, FM.changeoverIncomplete, "VERIFIES"),
  ],

  artifacts: [
    {
      local: "OB1_MAIN",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "OB1_Main.scl",
      declares: [B.ob1],
      provenance: { subsystem: "FILL_LINE_1", sourceId: "OB1", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: `ORGANIZATION_BLOCK "OB1_MAIN"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0

BEGIN
   "FC_PERMISSIVE_LOGIC"();
   "FB_LINE_SEQUENCE"();
   "FB_OEE_COUNTERS"();
END_ORGANIZATION_BLOCK
`,
    },
    {
      local: "FC_PERMISSIVE_LOGIC",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FC2030_PermissiveLogic.scl",
      declares: [B.perm, P.mode, P.recipe, P.guards, P.infeed, P.downstream, P.vision],
      provenance: { subsystem: "FILL_LINE_1", sourceId: "FC2030", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: `FUNCTION "FC_PERMISSIVE_LOGIC" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0

BEGIN
   // Starvation is expressed as a MISSING permissive rather than an alarm-only
   // condition, so the sequence refuses to start for a reason that can be named
   // instead of simply failing to advance.
   "PRM_MODE_AUTO"        := "LINE_MODE_AUTO";
   "PRM_RECIPE_LOADED"    := "RECIPE_LOADED_OK";
   "PRM_GUARDS_CLOSED"    := "GUARD_DOORS_CLOSED";
   "PRM_INFEED_SUPPLY"    := NOT "ACCUM_LEVEL_LOW";
   "PRM_DOWNSTREAM_READY" := "PACKER_READY";
   "PRM_VISION_ONLINE"    := "VISION_ONLINE";
END_FUNCTION
`,
    },
    {
      local: "FB_LINE_SEQUENCE",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB2010_LineSequence.scl",
      declares: [B.line, SQ, S.idle, S.changeover, S.prime, S.produce, S.drain, S.done],
      provenance: { subsystem: "FILL_LINE_1", sourceId: "FB2010", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: `FUNCTION_BLOCK "FB_LINE_SEQUENCE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
VAR
   step : Int := 0;
END_VAR

BEGIN
   // Safety conditions are OBSERVED here and never written. The guard and
   // E-stop functions live in the safety controller.
   IF "ILK_ESTOP_ACTIVE" THEN
      #step := 0;
   END_IF;

   CASE #step OF
      0:
         IF "LINE_START_REQ" AND "LINE_MODE_AUTO" AND "PRM_MODE_AUTO" THEN
            #step := 10;
         END_IF;

      10: // changeover — the recipe must be confirmed loaded before priming
         IF "PRM_RECIPE_LOADED" THEN
            #step := 20;
         END_IF;

      20: // prime
         IF "PRM_GUARDS_CLOSED" AND "PRM_VISION_ONLINE" THEN
            #step := 30;
         END_IF;

      30: // produce — starvation and blockage both stop production, and the
          // corpus records which one, because the remedy is at the opposite end
          // of the line in each case.
         "LINE_RUNNING" := TRUE;
         IF "ILK_INFEED_STARVED" OR "ILK_ACCUM_FULL" OR NOT "PRM_DOWNSTREAM_READY" THEN
            #step := 40;
         END_IF;

      40: // drain
         "LINE_RUNNING" := FALSE;
         #step := 50;

      50:
         #step := 0;
   END_CASE;

   "FB_RECIPE_MANAGER"();
   "FB_FILLER_CONTROL"();
END_FUNCTION_BLOCK
`,
    },
    {
      local: "FB_FILLER_CONTROL",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB2020_FillerControl.scl",
      declares: [B.fill, I.capTorque],
      provenance: { subsystem: "FILL_LINE_1", sourceId: "FB2020", domain: "PROCESS", safetyClass: "NON_SAFETY" },
      content: `FUNCTION_BLOCK "FB_FILLER_CONTROL"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
VAR
   levelError : Real;
END_VAR
VAR_CONSTANT
   TORQUE_MIN : Real := 1.8;
   TORQUE_MAX : Real := 3.2;
END_VAR

BEGIN
   // Deviation is computed against the RECIPE setpoint, so a level alarm on a
   // correctly-filled bottle points at the recipe, not at the filler.
   #levelError := "FILL_LEVEL_ACT" - "FILL_LEVEL_SP";

   IF "FILLER_DRIVE_FAULT" OR NOT "FILLER_DRIVE_READY" THEN
      #levelError := 0.0;
   END_IF;

   IF "FILLER_SPEED_ACT" > 0.0 THEN
      "CAP_TORQUE_IN_RANGE" := ("CAPPER_TORQUE_ACT" >= TORQUE_MIN) AND ("CAPPER_TORQUE_ACT" <= TORQUE_MAX);
   END_IF;

   IF NOT "CAP_TORQUE_IN_RANGE" THEN
      "ILK_CAP_TORQUE_OUT_OF_RANGE" := TRUE;
   END_IF;
END_FUNCTION_BLOCK
`,
    },
    {
      local: "FB_RECIPE_MANAGER",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB2040_RecipeManager.scl",
      declares: [B.recipe, RC.bottle500, RC.bottle1000],
      provenance: { subsystem: "FILL_LINE_1", sourceId: "FB2040", domain: "QUALITY", safetyClass: "NON_SAFETY" },
      content: `FUNCTION_BLOCK "FB_RECIPE_MANAGER"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
VAR
   loaded : Bool;
END_VAR

BEGIN
   // The controller can confirm that a recipe LOADED. It cannot confirm that
   // the physical format parts fitted to the machine match it — that remains a
   // human checklist step, which is exactly why the mismatch fault mode exists.
   CASE "ACTIVE_RECIPE_ID" OF
      'RCP_500ML_STILL':
         "FILL_LEVEL_SP" := 168.0;
         #loaded := TRUE;
      'RCP_1000ML_SPARKLING':
         "FILL_LEVEL_SP" := 214.0;
         #loaded := TRUE;
   END_CASE;

   "RECIPE_LOADED_OK" := #loaded;
END_FUNCTION_BLOCK
`,
    },
    {
      local: "FB_OEE_COUNTERS",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB2050_OeeCounters.scl",
      declares: [B.oee],
      provenance: { subsystem: "FILL_LINE_1", sourceId: "FB2050", domain: "QUALITY", safetyClass: "NON_SAFETY" },
      content: `FUNCTION_BLOCK "FB_OEE_COUNTERS"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
VAR
   runSeconds  : DInt;
   totalPieces : DInt;
END_VAR

BEGIN
   IF "LINE_RUNNING" THEN
      #runSeconds := #runSeconds + 1;
   END_IF;

   // Counters are READ here for reporting only. They are incremented by the
   // inspection path, not by this block.
   #totalPieces := "GOOD_COUNT" + "REJECT_COUNT";
END_FUNCTION_BLOCK
`,
    },
  ],

  scenarios: [
    {
      id: "TIA-02-FS-01",
      title: t("Filler keeps stopping but shows no fault", "پرکن مدام متوقف می‌شود اما هیچ خطایی نشان نمی‌دهد"),
      narrative: t(
        "The filler stops every few minutes during production. The drive reports no fault and the operator sees bottles backing up before the case packer.",
        "پرکن هر چند دقیقه در حین تولید متوقف می‌شود. درایو هیچ خطایی گزارش نمی‌کند و اپراتور می‌بیند بطری‌ها پیش از کارتن‌گذار انباشته می‌شوند.",
      ),
      observations: [
        { nodeId: T.running, state: "FALSE" },
        { nodeId: T.fillerFault, state: "FALSE" },
        { nodeId: T.fillerReady, state: "TRUE" },
        { nodeId: T.accumHigh, state: "TRUE" },
        { nodeId: T.downstreamReady, state: "FALSE" },
        { nodeId: AL.blocked, state: "TRUE" },
        { nodeId: T.estopOk, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "UPSTREAM_DOWNSTREAM",
        faultClass: "BLOCKAGE",
        faultModeId: FM.blockage,
        supportingNodeIds: [T.accumHigh, T.downstreamReady, AL.blocked],
        expectedMissingNodeIds: [EV.stopLog],
        expectedSafeActionIds: [SA.stopLog, SA.accumCheck],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-02-FS-02",
      title: t("Fill level alarms on every bottle after a changeover", "آلارم سطح پرشدگی روی هر بطری پس از تعویض فرمت"),
      narrative: t(
        "Since the format changeover the fill level deviation alarm is active on every bottle, although the bottles look correctly filled to the operator.",
        "از زمان تعویض فرمت، آلارم انحراف سطح پرشدگی روی هر بطری فعال است، هرچند بطری‌ها از نظر اپراتور درست پر شده‌اند.",
      ),
      observations: [
        { nodeId: AL.fillDeviation, state: "TRUE" },
        { nodeId: T.fillLevelAct, state: "ABNORMAL", detail: "consistently above setpoint" },
        { nodeId: T.recipeLoaded, state: "TRUE" },
        { nodeId: T.recipeId, state: "ABNORMAL", detail: "500 ml recipe active on the 1000 ml format" },
        { nodeId: T.fillLevelSp, state: "ABNORMAL" },
        { nodeId: T.fillerFault, state: "FALSE" },
      ],
      groundTruth: {
        subsystem: "RECIPE_CONFIG",
        faultClass: "RECIPE_MISMATCH",
        faultModeId: FM.recipeMismatch,
        supportingNodeIds: [T.recipeId, T.fillLevelSp, T.recipeLoaded],
        expectedMissingNodeIds: [EV.changeoverLog],
        expectedSafeActionIds: [SA.recipeCompare, SA.changeoverLog],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-02-FS-03",
      title: t("Fill level reading never moves", "قرائت سطح پرشدگی هرگز تغییر نمی‌کند"),
      narrative: t(
        "The fill level value has been identical for the whole shift while the line produced normally and checkweigher results varied as usual.",
        "مقدار سطح پرشدگی در تمام شیفت یکسان مانده، در حالی که خط عادی تولید کرده و نتایج وزن‌سنج کنترلی طبق معمول تغییر داشته است.",
      ),
      observations: [
        { nodeId: T.fillLevelAct, state: "STALE", detail: "identical value for the whole shift" },
        { nodeId: T.running, state: "TRUE" },
        { nodeId: T.fillerFault, state: "FALSE" },
        { nodeId: T.fillLevelSp, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "STALE_TELEMETRY",
        faultModeId: FM.levelSensor,
        supportingNodeIds: [T.fillLevelAct],
        expectedMissingNodeIds: [IO.levelSensor, EV.fillTrend],
        expectedSafeActionIds: [SA.levelCheck],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-02-FS-04",
      title: t("Vision inspection dropped offline", "بازرسی بینایی برون‌خط شد"),
      narrative: t(
        "The vision unit stopped reporting mid-shift. Production halted at the produce step and the vision permissive is no longer satisfied.",
        "واحد بینایی در میانهٔ شیفت گزارش‌دهی را متوقف کرد. تولید در گام تولید متوقف شد و مجوز بینایی دیگر برآورده نمی‌شود.",
      ),
      observations: [
        { nodeId: T.visionOnline, state: "FALSE" },
        { nodeId: AL.visionOffline, state: "TRUE" },
        { nodeId: T.running, state: "FALSE" },
        { nodeId: T.fillerFault, state: "FALSE" },
        { nodeId: T.guardClosed, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "NETWORK",
        faultClass: "COMMUNICATION_LOSS",
        faultModeId: FM.visionComm,
        supportingNodeIds: [T.visionOnline, AL.visionOffline],
        expectedMissingNodeIds: [IO.visionLink, EV.cpuDiag],
        expectedSafeActionIds: [SA.visionLink],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-02-FS-05",
      title: t("Capping torque drifting out of specification", "رانش گشتاور درب‌بندی به بیرون از مشخصات"),
      narrative: t(
        "Capping torque has been drifting downward across the week and now trips the torque interlock intermittently on the same head.",
        "گشتاور درب‌بندی در طول هفته رو به کاهش بوده و اکنون به‌صورت متناوب اینترلاک گشتاور را روی همان کله فعال می‌کند.",
      ),
      observations: [
        { nodeId: T.capperTorque, state: "ABNORMAL", detail: "trending below the lower limit" },
        { nodeId: T.capTorqueOk, state: "FALSE" },
        { nodeId: AL.capTorque, state: "TRUE" },
        { nodeId: T.capperReady, state: "TRUE" },
        { nodeId: T.recipeId, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "MECHANICAL",
        faultClass: "ACTUATOR_FAILURE",
        faultModeId: FM.capperWear,
        supportingNodeIds: [T.capperTorque, T.capTorqueOk, AL.capTorque],
        expectedMissingNodeIds: [IO.capperTorqueAi],
        expectedSafeActionIds: [SA.capperInspect],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-02-FS-06",
      title: t("Line will not start — guard interlock open", "خط راه‌اندازی نمی‌شود — بازبودن اینترلاک حفاظ"),
      narrative: t(
        "The line refuses to start after a cleaning stop. The operator reports that all doors look closed.",
        "خط پس از توقف نظافت راه‌اندازی نمی‌شود. اپراتور گزارش می‌دهد همهٔ درها بسته به نظر می‌رسند.",
      ),
      observations: [
        { nodeId: T.guardClosed, state: "FALSE" },
        { nodeId: AL.guardOpen, state: "TRUE" },
        { nodeId: I.guardOpen, state: "TRUE" },
        { nodeId: T.running, state: "FALSE" },
        { nodeId: T.estopOk, state: "TRUE" },
        { nodeId: T.modeAuto, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "SAFETY_CIRCUIT",
        faultClass: "INTERLOCK_ACTIVE",
        faultModeId: FM.guardInterlock,
        supportingNodeIds: [T.guardClosed, AL.guardOpen, I.guardOpen],
        expectedMissingNodeIds: [IO.guardSw],
        expectedSafeActionIds: [SA.guardReview],
        requiresEscalation: true,
      },
    },
    {
      id: "TIA-02-FS-07",
      title: t("Reject rate high but no rejects reach the bin", "نرخ حذف بالا اما هیچ حذفی به مخزن نمی‌رسد"),
      narrative: t(
        "The reject rate alarm is active and the counter climbs, yet the reject bin is empty and suspect bottles continue downstream.",
        "آلارم نرخ حذف فعال است و شمارنده بالا می‌رود، اما مخزن حذف خالی است و بطری‌های مشکوک به پایین‌دست ادامه می‌دهند.",
      ),
      observations: [
        { nodeId: AL.rejectRate, state: "TRUE" },
        { nodeId: T.rejectCount, state: "ABNORMAL", detail: "climbing steadily" },
        { nodeId: T.visionOnline, state: "TRUE" },
        { nodeId: T.running, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "ACTUATOR_FAILURE",
        faultModeId: FM.rejectPusher,
        supportingNodeIds: [AL.rejectRate, T.rejectCount],
        expectedMissingNodeIds: [IO.rejectValve, EV.rejectLog],
        expectedSafeActionIds: [SA.rejectTest],
        requiresEscalation: false,
      },
    },
  ],
};
