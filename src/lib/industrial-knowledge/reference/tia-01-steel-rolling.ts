// PHASE 101 — TIA-01: steel rolling / hot strip finishing line.
//
// ORIGIN
// Original synthetic engineering reference authored for this repository. It is
// modelled on the ARCHITECTURE of an S7-1500 class rolling-line controller —
// block structure, permissive/interlock separation, sequence stepping — and
// contains no customer, proprietary or licensed vendor project material. No
// file in this phase is, or claims to be, a real TIA Portal archive.
//
// SCOPE OF THE SAFETY SUBSYSTEM
// The E-stop chain, the PROFIsafe channel and the safety controller appear here
// so the Brain can OBSERVE and REASON ABOUT them. They are authored as
// SAFETY_CRITICAL, which makes every action touching them review-only. Nothing
// in this file describes a way to modify, bypass or reset a safety function.

import type { AuthoredReferenceSystem } from "../types";
import { authoring, chainStates, t } from "./_authoring";

const a = authoring({
  projectId: "TIA-01",
  subsystem: "ROLL_LINE_A",
  domain: "CONTROL_LOGIC",
});

/* ── ids ──────────────────────────────────────────────────────────────────── */

const D = {
  cpu: a.id("DEVICE", "CPU_MILL"),
  remoteIo: a.id("DEVICE", "ET200_STAND1"),
  drive: a.id("DEVICE", "DRIVE_STAND1"),
  safety: a.id("DEVICE", "SAFETY_CTL"),
  switch: a.id("DEVICE", "SW_CELL_MILL"),
};

const EQ = {
  stand: a.id("EQUIPMENT", "MILL_STAND1"),
  table: a.id("EQUIPMENT", "ENTRY_ROLLER_TABLE"),
  descaler: a.id("EQUIPMENT", "DESCALER"),
  cooling: a.id("EQUIPMENT", "COOLING_SECTION"),
  coiler: a.id("EQUIPMENT", "DOWN_COILER"),
};

const B = {
  ob1: a.id("PLC_BLOCK", "OB1_MAIN"),
  seq: a.id("PLC_BLOCK", "FB_MILL_SEQUENCE"),
  drive: a.id("PLC_BLOCK", "FB_DRIVE_INTERFACE"),
  perm: a.id("PLC_BLOCK", "FC_PERMISSIVE_LOGIC"),
  db: a.id("PLC_BLOCK", "DB_MILL_DATA"),
  udt: a.id("PLC_BLOCK", "UDT_DRIVE_STATUS"),
};

const T = {
  startReq: a.id("TAG", "MILL_START_REQ"),
  modeAuto: a.id("TAG", "MILL_MODE_AUTO"),
  running: a.id("TAG", "MILL_RUNNING"),
  driveReady: a.id("TAG", "DRIVE1_READY"),
  driveFault: a.id("TAG", "DRIVE1_FAULT"),
  driveSpeed: a.id("TAG", "DRIVE1_SPEED_ACT"),
  driveTorque: a.id("TAG", "DRIVE1_TORQUE_ACT"),
  gapAct: a.id("TAG", "STAND1_GAP_ACT"),
  gapSp: a.id("TAG", "STAND1_GAP_SP"),
  entryTemp: a.id("TAG", "ENTRY_TEMP_ACT"),
  exitTemp: a.id("TAG", "EXIT_TEMP_ACT"),
  hydPress: a.id("TAG", "HYD_PRESSURE_ACT"),
  lubeOk: a.id("TAG", "LUBE_PRESSURE_OK"),
  coolFlow: a.id("TAG", "COOLING_FLOW_ACT"),
  slabPresent: a.id("TAG", "SLAB_PRESENT_ENTRY"),
  estopOk: a.id("TAG", "ESTOP_CHAIN_OK"),
  motorTemp: a.id("TAG", "STAND1_MOTOR_TEMP"),
  coilerReady: a.id("TAG", "COILER_READY"),
  coilCount: a.id("TAG", "PROD_COUNT_COILS"),
};

const IO = {
  slab: a.id("IO_POINT", "DI_SLAB_PRESENT"),
  lube: a.id("IO_POINT", "DI_LUBE_PRESSURE_SW"),
  entryPyro: a.id("IO_POINT", "AI_ENTRY_PYROMETER"),
  exitPyro: a.id("IO_POINT", "AI_EXIT_PYROMETER"),
  hyd: a.id("IO_POINT", "AI_HYD_PRESSURE"),
  coolValve: a.id("IO_POINT", "AO_COOLING_VALVE"),
  pnDrive: a.id("IO_POINT", "PN_DRIVE1_PORT"),
  psEstop: a.id("IO_POINT", "PS_ESTOP_CHANNEL"),
  motorPt100: a.id("IO_POINT", "AI_MOTOR_PT100"),
};

const SQ = a.id("SEQUENCE", "MILL_SEQUENCE");
const S = {
  idle: a.id("STATE", "S00_IDLE"),
  prepare: a.id("STATE", "S10_PREPARE"),
  thread: a.id("STATE", "S20_THREAD"),
  roll: a.id("STATE", "S30_ROLL"),
  tail: a.id("STATE", "S40_TAIL_OUT"),
  done: a.id("STATE", "S50_COMPLETE"),
};

const P = {
  hyd: a.id("PERMISSIVE", "PRM_HYD_PRESSURE"),
  lube: a.id("PERMISSIVE", "PRM_LUBE_OK"),
  cooling: a.id("PERMISSIVE", "PRM_COOLING_FLOW"),
  mode: a.id("PERMISSIVE", "PRM_MODE_AUTO"),
  drive: a.id("PERMISSIVE", "PRM_DRIVE_READY"),
  coiler: a.id("PERMISSIVE", "PRM_COILER_READY"),
};

const I = {
  estop: a.id("INTERLOCK", "ILK_ESTOP_ACTIVE"),
  overtemp: a.id("INTERLOCK", "ILK_MOTOR_OVERTEMP"),
  gap: a.id("INTERLOCK", "ILK_GAP_OUT_OF_TOLERANCE"),
  downstream: a.id("INTERLOCK", "ILK_DOWNSTREAM_FULL"),
};

const AL = {
  driveFault: a.id("ALARM", "ALM_DRIVE1_FAULT"),
  hydLow: a.id("ALARM", "ALM_HYD_PRESSURE_LOW"),
  lubeLow: a.id("ALARM", "ALM_LUBE_PRESSURE_LOW"),
  seqTimeout: a.id("ALARM", "ALM_SEQ_TIMEOUT_THREAD"),
  entryTempLow: a.id("ALARM", "ALM_ENTRY_TEMP_LOW"),
  motorOvertemp: a.id("ALARM", "ALM_MOTOR_OVERTEMP"),
  pnLoss: a.id("ALARM", "ALM_PROFINET_COMM_LOSS"),
  coilerFull: a.id("ALARM", "ALM_COILER_NOT_READY"),
};

const EV = {
  driveTrend: a.id("EVIDENCE_SOURCE", "HIST_DRIVE_TREND"),
  tempTrend: a.id("EVIDENCE_SOURCE", "HIST_TEMPERATURE_TREND"),
  hydTrend: a.id("EVIDENCE_SOURCE", "HIST_HYDRAULIC_TREND"),
  cpuDiag: a.id("EVIDENCE_SOURCE", "DIAG_CPU_BUFFER"),
  seqLog: a.id("EVIDENCE_SOURCE", "HIST_SEQUENCE_STEP_LOG"),
};

const FM = {
  driveOc: a.id("FAULT_MODE", "FM_DRIVE_OVERCURRENT"),
  hydDegraded: a.id("FAULT_MODE", "FM_HYDRAULIC_PUMP_DEGRADED"),
  lubeSwitch: a.id("FAULT_MODE", "FM_LUBE_SWITCH_STUCK"),
  pyroDrift: a.id("FAULT_MODE", "FM_ENTRY_PYROMETER_DRIFT"),
  pnName: a.id("FAULT_MODE", "FM_PROFINET_DEVICE_NAME_MISMATCH"),
  permHyd: a.id("FAULT_MODE", "FM_HYDRAULIC_PERMISSIVE_NOT_MET"),
  modeManual: a.id("FAULT_MODE", "FM_MODE_LEFT_IN_MANUAL"),
  coilerBlock: a.id("FAULT_MODE", "FM_DOWNSTREAM_COILER_BLOCKED"),
  threadTimeout: a.id("FAULT_MODE", "FM_THREAD_STEP_TIMEOUT"),
  motorCooling: a.id("FAULT_MODE", "FM_MOTOR_COOLING_OBSTRUCTED"),
};

const SA = {
  driveHistory: a.id("SAFE_ACTION", "SA_READ_DRIVE_FAULT_HISTORY"),
  hydTrend: a.id("SAFE_ACTION", "SA_REVIEW_HYDRAULIC_TREND"),
  lubeSwitch: a.id("SAFE_ACTION", "SA_VERIFY_LUBE_PRESSURE_SWITCH"),
  pyroCheck: a.id("SAFE_ACTION", "SA_COMPARE_PYROMETER_TO_REFERENCE"),
  pnName: a.id("SAFE_ACTION", "SA_VERIFY_PROFINET_DEVICE_NAME"),
  cpuDiag: a.id("SAFE_ACTION", "SA_READ_CPU_DIAGNOSTIC_BUFFER"),
  modeCheck: a.id("SAFE_ACTION", "SA_CONFIRM_MODE_SELECTOR_POSITION"),
  coilerCheck: a.id("SAFE_ACTION", "SA_INSPECT_COILER_AVAILABILITY"),
  seqLog: a.id("SAFE_ACTION", "SA_REVIEW_SEQUENCE_STEP_LOG"),
  thermoscan: a.id("SAFE_ACTION", "SA_THERMOSCAN_MOTOR_AND_COOLING"),
  safetyReview: a.id("SAFE_ACTION", "SA_ESCALATE_TO_SAFETY_REVIEW"),
};

/* ── system ───────────────────────────────────────────────────────────────── */

export const TIA_01_STEEL_ROLLING: AuthoredReferenceSystem = {
  id: "TIA-01",
  name: t("Steel rolling — hot strip finishing line", "نورد فولاد — خط پایانی نوار گرم"),
  domain: t(
    "Steel rolling / continuous process line",
    "نورد فولاد / خط فرایندی پیوسته",
  ),
  sourceType: "TIA_REFERENCE",
  platform: "S7-1500 class controller, PROFINET IO, PROFIsafe safety subsystem",
  version: "1.0.0",
  revision: 1,
  origin: "SYNTHETIC_ORIGINAL",

  nodes: [
    /* devices */
    a.node("DEVICE", "CPU_MILL", t("Mill line controller", "کنترلر خط نورد"), {
      domain: "CONTROL_LOGIC",
      attributes: { deviceCategory: "PLC", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
      description: t(
        "Cyclic controller owning the mill sequence, permissive logic and drive interface.",
        "کنترلر چرخه‌ای که توالی نورد، منطق مجوزها و رابط درایو را در اختیار دارد.",
      ),
    }),
    a.node("DEVICE", "ET200_STAND1", t("Stand 1 remote I/O station", "ایستگاه ورودی/خروجی دور استند ۱"), {
      domain: "FIELD_IO",
      attributes: { deviceCategory: "REMOTE_IO", networkZone: "FIELD", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "DRIVE_STAND1", t("Stand 1 main drive", "درایو اصلی استند ۱"), {
      domain: "DRIVES",
      attributes: { deviceCategory: "VFD", networkZone: "CONTROL", protocol: "SIEMENS_S7" },
    }),
    a.node("DEVICE", "SAFETY_CTL", t("Safety controller", "کنترلر ایمنی"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { deviceCategory: "SAFETY_CONTROLLER", networkZone: "SAFETY" },
      description: t(
        "Review-only within Hermes. Observed for diagnosis; never configured, reset or bypassed.",
        "در هرمس فقط قابل بازبینی است. برای عیب‌یابی مشاهده می‌شود؛ هرگز پیکربندی، ریست یا دور زده نمی‌شود.",
      ),
    }),
    a.node("DEVICE", "SW_CELL_MILL", t("Mill cell network switch", "سوییچ شبکهٔ سلول نورد"), {
      domain: "NETWORK",
      attributes: { deviceCategory: "NETWORK_SWITCH", networkZone: "CONTROL" },
    }),

    /* equipment */
    a.node("EQUIPMENT", "MILL_STAND1", t("Rolling stand 1", "استند نورد ۱"), {
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "ENTRY_ROLLER_TABLE", t("Entry roller table", "میز غلتکی ورودی"), {
      domain: "MECHANICAL",
    }),
    a.node("EQUIPMENT", "DESCALER", t("High-pressure descaler", "پوسته‌زدای فشار بالا"), {
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "COOLING_SECTION", t("Laminar cooling section", "بخش خنک‌کاری لایه‌ای"), {
      domain: "PROCESS",
    }),
    a.node("EQUIPMENT", "DOWN_COILER", t("Down coiler", "کلاف‌پیچ پایین‌دست"), {
      domain: "MECHANICAL",
    }),

    /* blocks */
    a.node("PLC_BLOCK", "OB1_MAIN", t("OB1 main cyclic block", "بلوک چرخه‌ای اصلی OB1"), {
      attributes: { blockType: "OB" },
      sourceId: "OB1",
    }),
    a.node("PLC_BLOCK", "FB_MILL_SEQUENCE", t("Mill sequence function block", "بلوک تابعی توالی نورد"), {
      attributes: { blockType: "FB" },
      sourceId: "FB1210",
    }),
    a.node("PLC_BLOCK", "FB_DRIVE_INTERFACE", t("Drive interface function block", "بلوک تابعی رابط درایو"), {
      domain: "DRIVES",
      attributes: { blockType: "FB" },
      sourceId: "FB1220",
    }),
    a.node("PLC_BLOCK", "FC_PERMISSIVE_LOGIC", t("Permissive evaluation function", "تابع ارزیابی مجوزها"), {
      attributes: { blockType: "FC" },
      sourceId: "FC1230",
    }),
    a.node("PLC_BLOCK", "DB_MILL_DATA", t("Mill data block", "بلوک دادهٔ نورد"), {
      attributes: { blockType: "DB" },
      sourceId: "DB1210",
    }),
    a.node("PLC_BLOCK", "UDT_DRIVE_STATUS", t("Drive status user data type", "نوع دادهٔ کاربری وضعیت درایو"), {
      domain: "DRIVES",
      attributes: { blockType: "UDT" },
      sourceId: "UDT_DriveStatus",
    }),

    /* tags */
    a.node("TAG", "MILL_START_REQ", t("Mill start request", "درخواست راه‌اندازی نورد"), {
      attributes: { dataType: "BOOL", address: "DB1210.DBX0.0", accessMode: "READ", expectedState: "TRUE while the operator holds a start request" },
    }),
    a.node("TAG", "MILL_MODE_AUTO", t("Automatic mode active", "حالت خودکار فعال"), {
      attributes: { dataType: "BOOL", address: "DB1210.DBX0.1", accessMode: "READ", expectedState: "TRUE in production" },
    }),
    a.node("TAG", "MILL_RUNNING", t("Mill running", "نورد در حال کار"), {
      attributes: { dataType: "BOOL", address: "DB1210.DBX0.2", accessMode: "READ" },
    }),
    a.node("TAG", "DRIVE1_READY", t("Drive 1 ready", "آمادگی درایو ۱"), {
      domain: "DRIVES",
      attributes: { dataType: "BOOL", address: "DB1220.DBX0.0", accessMode: "READ", expectedState: "TRUE before a start is accepted" },
    }),
    a.node("TAG", "DRIVE1_FAULT", t("Drive 1 fault", "خطای درایو ۱"), {
      domain: "DRIVES",
      attributes: { dataType: "BOOL", address: "DB1220.DBX0.1", accessMode: "READ", expectedState: "FALSE in normal operation" },
    }),
    a.node("TAG", "DRIVE1_SPEED_ACT", t("Drive 1 actual speed", "سرعت واقعی درایو ۱"), {
      domain: "DRIVES",
      attributes: { dataType: "REAL", address: "DB1220.DBD4", unit: "rpm", accessMode: "READ" },
    }),
    a.node("TAG", "DRIVE1_TORQUE_ACT", t("Drive 1 actual torque", "گشتاور واقعی درایو ۱"), {
      domain: "DRIVES",
      attributes: { dataType: "REAL", address: "DB1220.DBD8", unit: "%", accessMode: "READ" },
    }),
    a.node("TAG", "STAND1_GAP_ACT", t("Stand 1 actual roll gap", "فاصلهٔ واقعی غلتک استند ۱"), {
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", address: "DB1210.DBD10", unit: "mm", accessMode: "READ" },
    }),
    a.node("TAG", "STAND1_GAP_SP", t("Stand 1 roll gap setpoint", "نقطهٔ تنظیم فاصلهٔ غلتک استند ۱"), {
      domain: "MECHANICAL",
      attributes: { dataType: "REAL", address: "DB1210.DBD14", unit: "mm", accessMode: "READ" },
    }),
    a.node("TAG", "ENTRY_TEMP_ACT", t("Entry temperature", "دمای ورودی"), {
      domain: "PROCESS",
      attributes: { dataType: "REAL", address: "DB1210.DBD18", unit: "°C", accessMode: "READ", expectedState: "within the rolling window for the grade in production" },
    }),
    a.node("TAG", "EXIT_TEMP_ACT", t("Exit temperature", "دمای خروجی"), {
      domain: "PROCESS",
      attributes: { dataType: "REAL", address: "DB1210.DBD22", unit: "°C", accessMode: "READ" },
    }),
    a.node("TAG", "HYD_PRESSURE_ACT", t("Hydraulic system pressure", "فشار سامانهٔ هیدرولیک"), {
      domain: "PROCESS",
      attributes: { dataType: "REAL", address: "DB1210.DBD26", unit: "bar", accessMode: "READ", expectedState: "above the permissive threshold before a start" },
    }),
    a.node("TAG", "LUBE_PRESSURE_OK", t("Lubrication pressure healthy", "سالم‌بودن فشار روان‌کاری"), {
      domain: "MAINTENANCE",
      attributes: { dataType: "BOOL", address: "DB1210.DBX30.0", accessMode: "READ", expectedState: "TRUE whenever the stand turns" },
    }),
    a.node("TAG", "COOLING_FLOW_ACT", t("Cooling water flow", "دبی آب خنک‌کاری"), {
      domain: "PROCESS",
      attributes: { dataType: "REAL", address: "DB1210.DBD32", unit: "m³/h", accessMode: "READ" },
    }),
    a.node("TAG", "SLAB_PRESENT_ENTRY", t("Slab present at entry", "حضور تختال در ورودی"), {
      domain: "FIELD_IO",
      attributes: { dataType: "BOOL", address: "DB1210.DBX36.0", accessMode: "READ" },
    }),
    a.node("TAG", "ESTOP_CHAIN_OK", t("E-stop chain healthy", "سالم‌بودن زنجیرهٔ توقف اضطراری"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { dataType: "BOOL", address: "DB1240.DBX0.0", accessMode: "READ", expectedState: "TRUE — observed only, never written" },
    }),
    a.node("TAG", "STAND1_MOTOR_TEMP", t("Stand 1 motor winding temperature", "دمای سیم‌پیچ موتور استند ۱"), {
      domain: "DRIVES",
      attributes: { dataType: "REAL", address: "DB1220.DBD12", unit: "°C", accessMode: "READ" },
    }),
    a.node("TAG", "COILER_READY", t("Down coiler ready", "آمادگی کلاف‌پیچ"), {
      domain: "MECHANICAL",
      attributes: { dataType: "BOOL", address: "DB1250.DBX0.0", accessMode: "READ", expectedState: "TRUE before threading begins" },
    }),
    a.node("TAG", "PROD_COUNT_COILS", t("Coils produced this shift", "تعداد کلاف تولیدشده در شیفت"), {
      domain: "QUALITY",
      attributes: { dataType: "DINT", address: "DB1260.DBD0", accessMode: "READ" },
    }),

    /* I/O */
    a.node("IO_POINT", "DI_SLAB_PRESENT", t("Slab presence photocell input", "ورودی چشم الکتریکی حضور تختال"), {
      domain: "FIELD_IO",
      attributes: { channelType: "DI", address: "I12.0" },
    }),
    a.node("IO_POINT", "DI_LUBE_PRESSURE_SW", t("Lubrication pressure switch input", "ورودی کلید فشار روان‌کاری"), {
      domain: "FIELD_IO",
      attributes: { channelType: "DI", address: "I12.1" },
    }),
    a.node("IO_POINT", "AI_ENTRY_PYROMETER", t("Entry pyrometer analogue input", "ورودی آنالوگ پیرومتر ورودی"), {
      domain: "FIELD_IO",
      attributes: { channelType: "AI", address: "IW100", unit: "mA" },
      description: t(
        "4–20 mA loop. A reading below live zero is a loop fault, not a low temperature.",
        "حلقهٔ ۴ تا ۲۰ میلی‌آمپر. قرائت زیر صفر زنده یعنی خطای حلقه، نه دمای پایین.",
      ),
    }),
    a.node("IO_POINT", "AI_EXIT_PYROMETER", t("Exit pyrometer analogue input", "ورودی آنالوگ پیرومتر خروجی"), {
      domain: "FIELD_IO",
      attributes: { channelType: "AI", address: "IW102", unit: "mA" },
    }),
    a.node("IO_POINT", "AI_HYD_PRESSURE", t("Hydraulic pressure transmitter input", "ورودی ترانسمیتر فشار هیدرولیک"), {
      domain: "FIELD_IO",
      attributes: { channelType: "AI", address: "IW104", unit: "mA" },
    }),
    a.node("IO_POINT", "AO_COOLING_VALVE", t("Cooling control valve output", "خروجی شیر کنترل خنک‌کاری"), {
      domain: "FIELD_IO",
      attributes: { channelType: "AO", address: "QW110", unit: "mA" },
    }),
    a.node("IO_POINT", "PN_DRIVE1_PORT", t("Drive 1 PROFINET port", "پورت پروفینت درایو ۱"), {
      domain: "NETWORK",
      attributes: { channelType: "PROFINET" },
    }),
    a.node("IO_POINT", "PS_ESTOP_CHANNEL", t("E-stop PROFIsafe channel", "کانال پروفی‌سیف توقف اضطراری"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      attributes: { channelType: "PROFISAFE" },
    }),
    a.node("IO_POINT", "AI_MOTOR_PT100", t("Motor winding PT100 input", "ورودی PT100 سیم‌پیچ موتور"), {
      domain: "FIELD_IO",
      attributes: { channelType: "AI", address: "IW106", unit: "Ω" },
    }),

    /* sequence + states */
    a.node("SEQUENCE", "MILL_SEQUENCE", t("Mill production sequence", "توالی تولید نورد"), {
      sourceId: "FB1210/SEQ",
    }),
    a.node("STATE", "S00_IDLE", t("S00 — idle", "S00 — بی‌کار"), {
      attributes: { stepNumber: 0 },
    }),
    a.node("STATE", "S10_PREPARE", t("S10 — prepare and set gap", "S10 — آماده‌سازی و تنظیم فاصله"), {
      attributes: { stepNumber: 10, stepTimeoutSeconds: 45 },
    }),
    a.node("STATE", "S20_THREAD", t("S20 — thread slab into stand", "S20 — هدایت تختال به داخل استند"), {
      attributes: { stepNumber: 20, stepTimeoutSeconds: 30 },
    }),
    a.node("STATE", "S30_ROLL", t("S30 — rolling pass", "S30 — پاس نورد"), {
      attributes: { stepNumber: 30, stepTimeoutSeconds: 180 },
    }),
    a.node("STATE", "S40_TAIL_OUT", t("S40 — tail out", "S40 — خروج انتهای تختال"), {
      attributes: { stepNumber: 40, stepTimeoutSeconds: 60 },
    }),
    a.node("STATE", "S50_COMPLETE", t("S50 — pass complete", "S50 — پایان پاس"), {
      attributes: { stepNumber: 50 },
    }),

    /* permissives */
    a.node("PERMISSIVE", "PRM_HYD_PRESSURE", t("Hydraulic pressure permissive", "مجوز فشار هیدرولیک"), {
      domain: "PROCESS",
      description: t(
        "System pressure must be above the configured threshold before the stand may start.",
        "فشار سامانه باید پیش از راه‌اندازی استند بالاتر از آستانهٔ پیکربندی‌شده باشد.",
      ),
    }),
    a.node("PERMISSIVE", "PRM_LUBE_OK", t("Lubrication permissive", "مجوز روان‌کاری"), {
      domain: "MAINTENANCE",
    }),
    a.node("PERMISSIVE", "PRM_COOLING_FLOW", t("Cooling flow permissive", "مجوز دبی خنک‌کاری"), {
      domain: "PROCESS",
    }),
    a.node("PERMISSIVE", "PRM_MODE_AUTO", t("Automatic mode permissive", "مجوز حالت خودکار"), {}),
    a.node("PERMISSIVE", "PRM_DRIVE_READY", t("Drive ready permissive", "مجوز آمادگی درایو"), {
      domain: "DRIVES",
    }),
    a.node("PERMISSIVE", "PRM_COILER_READY", t("Coiler availability permissive", "مجوز آمادگی کلاف‌پیچ"), {
      domain: "MECHANICAL",
    }),

    /* interlocks */
    a.node("INTERLOCK", "ILK_ESTOP_ACTIVE", t("E-stop active interlock", "اینترلاک فعال‌بودن توقف اضطراری"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
      description: t(
        "Observed only. Hermes never proposes resetting, bridging or defeating this interlock.",
        "فقط مشاهده می‌شود. هرمس هرگز ریست، پل‌زدن یا حذف این اینترلاک را پیشنهاد نمی‌کند.",
      ),
    }),
    a.node("INTERLOCK", "ILK_MOTOR_OVERTEMP", t("Motor over-temperature interlock", "اینترلاک دمای بیش‌ازحد موتور"), {
      domain: "DRIVES",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("INTERLOCK", "ILK_GAP_OUT_OF_TOLERANCE", t("Roll gap out of tolerance interlock", "اینترلاک خروج فاصلهٔ غلتک از رواداری"), {
      domain: "MECHANICAL",
    }),
    a.node("INTERLOCK", "ILK_DOWNSTREAM_FULL", t("Downstream not available interlock", "اینترلاک نبود آمادگی پایین‌دست"), {
      domain: "MECHANICAL",
    }),

    /* alarms */
    a.node("ALARM", "ALM_DRIVE1_FAULT", t("Stand 1 drive fault", "خطای درایو استند ۱"), {
      domain: "DRIVES",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_HYD_PRESSURE_LOW", t("Hydraulic pressure low", "افت فشار هیدرولیک"), {
      domain: "PROCESS",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_LUBE_PRESSURE_LOW", t("Lubrication pressure low", "افت فشار روان‌کاری"), {
      domain: "MAINTENANCE",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_SEQ_TIMEOUT_THREAD", t("Threading step timeout", "اتمام مهلت گام هدایت تختال"), {
      attributes: { alarmPriority: "MEDIUM", requiresAck: true },
    }),
    a.node("ALARM", "ALM_ENTRY_TEMP_LOW", t("Entry temperature below window", "دمای ورودی زیر پنجرهٔ مجاز"), {
      domain: "PROCESS",
      attributes: { alarmPriority: "MEDIUM", requiresAck: false },
    }),
    a.node("ALARM", "ALM_MOTOR_OVERTEMP", t("Stand 1 motor over-temperature", "دمای بیش‌ازحد موتور استند ۱"), {
      domain: "DRIVES",
      safetyClass: "SAFETY_RELATED",
      attributes: { alarmPriority: "URGENT", requiresAck: true },
    }),
    a.node("ALARM", "ALM_PROFINET_COMM_LOSS", t("PROFINET communication loss", "قطع ارتباط پروفینت"), {
      domain: "NETWORK",
      attributes: { alarmPriority: "HIGH", requiresAck: true },
    }),
    a.node("ALARM", "ALM_COILER_NOT_READY", t("Down coiler not ready", "نبود آمادگی کلاف‌پیچ"), {
      domain: "MECHANICAL",
      attributes: { alarmPriority: "LOW", requiresAck: false },
    }),

    /* evidence sources */
    a.node("EVIDENCE_SOURCE", "HIST_DRIVE_TREND", t("Drive current and torque historian", "بایگانی جریان و گشتاور درایو"), {
      domain: "DRIVES",
      attributes: { retentionDays: 90, sampleIntervalSeconds: 1 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_TEMPERATURE_TREND", t("Entry/exit temperature historian", "بایگانی دمای ورودی و خروجی"), {
      domain: "PROCESS",
      attributes: { retentionDays: 180, sampleIntervalSeconds: 1 },
    }),
    a.node("EVIDENCE_SOURCE", "HIST_HYDRAULIC_TREND", t("Hydraulic pressure historian", "بایگانی فشار هیدرولیک"), {
      domain: "PROCESS",
      attributes: { retentionDays: 90, sampleIntervalSeconds: 5 },
    }),
    a.node("EVIDENCE_SOURCE", "DIAG_CPU_BUFFER", t("Controller diagnostic buffer", "بافر تشخیصی کنترلر"), {
      domain: "CONTROL_LOGIC",
      attributes: { retentionDays: 30 },
      description: t(
        "The FIRST entry after a disturbance is the diagnostic value; later entries are consequences.",
        "نخستین رخداد پس از یک اختلال ارزش تشخیصی دارد؛ رخدادهای بعدی پیامد هستند.",
      ),
    }),
    a.node("EVIDENCE_SOURCE", "HIST_SEQUENCE_STEP_LOG", t("Sequence step transition log", "گزارش گذار گام‌های توالی"), {
      attributes: { retentionDays: 60 },
    }),

    /* fault modes */
    a.node("FAULT_MODE", "FM_DRIVE_OVERCURRENT", t("Drive overcurrent during acceleration", "اضافه‌جریان درایو هنگام شتاب‌گیری"), {
      domain: "DRIVES",
      attributes: { faultClass: "DRIVE_FAULT", subsystem: "DRIVE" },
    }),
    a.node("FAULT_MODE", "FM_HYDRAULIC_PUMP_DEGRADED", t("Hydraulic pump delivery degraded", "افت دبی پمپ هیدرولیک"), {
      domain: "PROCESS",
      attributes: { faultClass: "PROCESS_DEVIATION", subsystem: "PROCESS" },
    }),
    a.node("FAULT_MODE", "FM_LUBE_SWITCH_STUCK", t("Lubrication pressure switch stuck", "گیرکردن کلید فشار روان‌کاری"), {
      domain: "FIELD_IO",
      attributes: { faultClass: "SENSOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_ENTRY_PYROMETER_DRIFT", t("Entry pyrometer measurement drift", "رانش اندازه‌گیری پیرومتر ورودی"), {
      domain: "FIELD_IO",
      attributes: { faultClass: "SENSOR_FAILURE", subsystem: "FIELD_DEVICE" },
    }),
    a.node("FAULT_MODE", "FM_PROFINET_DEVICE_NAME_MISMATCH", t("PROFINET device name mismatch after replacement", "عدم تطابق نام دستگاه پروفینت پس از تعویض"), {
      domain: "NETWORK",
      attributes: { faultClass: "COMMUNICATION_LOSS", subsystem: "NETWORK" },
    }),
    a.node("FAULT_MODE", "FM_HYDRAULIC_PERMISSIVE_NOT_MET", t("Hydraulic permissive not satisfied", "برآورده‌نشدن مجوز هیدرولیک"), {
      attributes: { faultClass: "PERMISSIVE_MISSING", subsystem: "PLC_LOGIC" },
    }),
    a.node("FAULT_MODE", "FM_MODE_LEFT_IN_MANUAL", t("Line left in manual mode", "باقی‌ماندن خط در حالت دستی"), {
      attributes: { faultClass: "INCORRECT_MODE", subsystem: "PLC_LOGIC" },
    }),
    a.node("FAULT_MODE", "FM_DOWNSTREAM_COILER_BLOCKED", t("Down coiler blocked or unavailable", "انسداد یا نبود دسترسی کلاف‌پیچ"), {
      domain: "MECHANICAL",
      attributes: { faultClass: "BLOCKAGE", subsystem: "UPSTREAM_DOWNSTREAM" },
    }),
    a.node("FAULT_MODE", "FM_THREAD_STEP_TIMEOUT", t("Threading step exceeded its watchdog", "تجاوز گام هدایت تختال از واچ‌داگ"), {
      attributes: { faultClass: "SEQUENCE_TIMEOUT", subsystem: "PLC_LOGIC" },
    }),
    a.node("FAULT_MODE", "FM_MOTOR_COOLING_OBSTRUCTED", t("Motor cooling path obstructed", "انسداد مسیر خنک‌کاری موتور"), {
      domain: "MECHANICAL",
      attributes: { faultClass: "ACTUATOR_FAILURE", subsystem: "MECHANICAL" },
    }),

    /* safe actions */
    a.node("SAFE_ACTION", "SA_READ_DRIVE_FAULT_HISTORY", t("Read the complete drive fault history before any reset", "پیش از هر ریست، تاریخچهٔ کامل خطای درایو را بخوانید"), {
      domain: "DRIVES",
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_HYDRAULIC_TREND", t("Review the hydraulic pressure trend across the last starts", "روند فشار هیدرولیک را در چند راه‌اندازی اخیر بررسی کنید"), {
      domain: "PROCESS",
    }),
    a.node("SAFE_ACTION", "SA_VERIFY_LUBE_PRESSURE_SWITCH", t("Verify the lubrication pressure switch against an independent gauge", "کلید فشار روان‌کاری را با فشارسنج مستقل راستی‌آزمایی کنید"), {
      domain: "MAINTENANCE",
      safetyClass: "SAFETY_RELATED",
    }),
    a.node("SAFE_ACTION", "SA_COMPARE_PYROMETER_TO_REFERENCE", t("Compare the pyrometer against a calibrated reference at the same point", "پیرومتر را با مرجع کالیبره در همان نقطه مقایسه کنید"), {
      domain: "FIELD_IO",
    }),
    a.node("SAFE_ACTION", "SA_VERIFY_PROFINET_DEVICE_NAME", t("Verify the PROFINET device name and IP against the configured topology", "نام دستگاه و IP پروفینت را با توپولوژی پیکربندی‌شده تطبیق دهید"), {
      domain: "NETWORK",
    }),
    a.node("SAFE_ACTION", "SA_READ_CPU_DIAGNOSTIC_BUFFER", t("Read the controller diagnostic buffer and take the first entry", "بافر تشخیصی کنترلر را بخوانید و نخستین رخداد را ملاک بگیرید"), {}),
    a.node("SAFE_ACTION", "SA_CONFIRM_MODE_SELECTOR_POSITION", t("Confirm the mode selector position with the operator on shift", "موقعیت کلید انتخاب حالت را با اپراتور شیفت تأیید کنید"), {}),
    a.node("SAFE_ACTION", "SA_INSPECT_COILER_AVAILABILITY", t("Inspect down-coiler availability and clear-out status", "آمادگی و وضعیت تخلیهٔ کلاف‌پیچ را بازرسی کنید"), {
      domain: "MECHANICAL",
    }),
    a.node("SAFE_ACTION", "SA_REVIEW_SEQUENCE_STEP_LOG", t("Review the sequence step log for the step that stalled", "گزارش گام‌های توالی را برای گام متوقف‌شده بررسی کنید"), {}),
    a.node("SAFE_ACTION", "SA_THERMOSCAN_MOTOR_AND_COOLING", t("Thermo-scan the motor body and verify the cooling path and fan", "بدنهٔ موتور را ترموگرافی و مسیر خنک‌کاری و فن را بررسی کنید"), {
      domain: "MAINTENANCE",
    }),
    a.node("SAFE_ACTION", "SA_ESCALATE_TO_SAFETY_REVIEW", t("Escalate to a qualified safety engineer — do not reset or bypass the safety function", "به مهندس ایمنی واجد صلاحیت ارجاع دهید — تابع ایمنی را ریست یا دور نزنید"), {
      domain: "SAFETY",
      safetyClass: "SAFETY_CRITICAL",
    }),
  ],

  edges: [
    /* structure */
    a.edge(D.cpu, B.ob1, "CONTAINS"),
    a.edge(D.cpu, B.seq, "CONTAINS"),
    a.edge(D.cpu, B.drive, "CONTAINS"),
    a.edge(D.cpu, B.perm, "CONTAINS"),
    a.edge(D.cpu, B.db, "CONTAINS"),
    a.edge(D.cpu, B.udt, "CONTAINS"),
    a.edge(B.ob1, B.perm, "CALLS"),
    a.edge(B.ob1, B.seq, "CALLS"),
    a.edge(B.seq, B.drive, "CALLS"),
    a.edge(B.seq, SQ, "CONTAINS"),
    a.edge(D.remoteIo, IO.slab, "CONTAINS"),
    a.edge(D.remoteIo, IO.lube, "CONTAINS"),
    a.edge(D.remoteIo, IO.entryPyro, "CONTAINS"),
    a.edge(D.remoteIo, IO.exitPyro, "CONTAINS"),
    a.edge(D.remoteIo, IO.hyd, "CONTAINS"),
    a.edge(D.remoteIo, IO.coolValve, "CONTAINS"),
    a.edge(D.remoteIo, IO.motorPt100, "CONTAINS"),
    a.edge(D.drive, IO.pnDrive, "CONTAINS"),
    a.edge(D.safety, IO.psEstop, "CONTAINS"),
    a.edge(D.switch, IO.pnDrive, "MONITORS"),

    /* tag ↔ I/O binding */
    a.edge(T.slabPresent, IO.slab, "BOUND_TO"),
    a.edge(T.lubeOk, IO.lube, "BOUND_TO"),
    a.edge(T.entryTemp, IO.entryPyro, "BOUND_TO"),
    a.edge(T.exitTemp, IO.exitPyro, "BOUND_TO"),
    a.edge(T.hydPress, IO.hyd, "BOUND_TO"),
    a.edge(T.coolFlow, IO.coolValve, "BOUND_TO"),
    a.edge(T.estopOk, IO.psEstop, "BOUND_TO"),
    a.edge(T.motorTemp, IO.motorPt100, "BOUND_TO"),
    a.edge(T.driveReady, IO.pnDrive, "BOUND_TO"),
    a.edge(T.driveFault, IO.pnDrive, "BOUND_TO"),
    a.edge(T.driveSpeed, IO.pnDrive, "BOUND_TO"),
    a.edge(T.driveTorque, IO.pnDrive, "BOUND_TO"),

    /* block ↔ tag */
    a.edge(B.seq, T.startReq, "READS"),
    a.edge(B.seq, T.modeAuto, "READS"),
    a.edge(B.seq, T.slabPresent, "READS"),
    a.edge(B.seq, T.coilerReady, "READS"),
    a.edge(B.seq, T.running, "WRITES"),
    // Read-modify-write: the completion step increments the counter, so the
    // sequence genuinely reads it as well as writing it. The source states
    // both, and the graph must too.
    a.edge(B.seq, T.coilCount, "READS"),
    a.edge(B.seq, T.coilCount, "WRITES"),
    a.edge(B.drive, T.driveReady, "READS"),
    a.edge(B.drive, T.driveFault, "READS"),
    a.edge(B.drive, T.driveSpeed, "READS"),
    a.edge(B.drive, T.driveTorque, "READS"),
    a.edge(B.drive, T.motorTemp, "READS"),
    a.edge(B.drive, I.overtemp, "WRITES"),
    a.edge(B.seq, P.hyd, "READS"),
    a.edge(B.seq, P.lube, "READS"),
    a.edge(B.seq, P.drive, "READS"),
    a.edge(B.seq, P.coiler, "READS"),
    a.edge(B.seq, I.estop, "READS"),
    a.edge(B.seq, I.downstream, "READS"),
    a.edge(B.perm, T.hydPress, "READS"),
    a.edge(B.perm, T.lubeOk, "READS"),
    a.edge(B.perm, T.coolFlow, "READS"),
    a.edge(B.perm, T.modeAuto, "READS"),
    a.edge(B.perm, T.driveReady, "READS"),
    a.edge(B.perm, T.coilerReady, "READS"),
    a.edge(B.db, T.gapAct, "CONTAINS"),
    a.edge(B.db, T.gapSp, "CONTAINS"),
    a.edge(B.udt, T.driveFault, "CONTAINS"),

    /* equipment */
    a.edge(B.drive, EQ.stand, "ACTUATES"),
    a.edge(D.drive, EQ.stand, "ACTUATES"),
    a.edge(EQ.table, EQ.stand, "MONITORS"),
    a.edge(EQ.stand, EQ.cooling, "MONITORS"),
    a.edge(EQ.cooling, EQ.coiler, "MONITORS"),
    a.edge(EQ.descaler, EQ.stand, "MONITORS"),
    a.edge(T.coilerReady, EQ.coiler, "MONITORS"),
    a.edge(T.motorTemp, EQ.stand, "MONITORS"),

    /* sequence */
    a.edge(SQ, S.idle, "CONTAINS"),
    a.edge(SQ, S.prepare, "CONTAINS"),
    a.edge(SQ, S.thread, "CONTAINS"),
    a.edge(SQ, S.roll, "CONTAINS"),
    a.edge(SQ, S.tail, "CONTAINS"),
    a.edge(SQ, S.done, "CONTAINS"),
    ...chainStates(a, [S.idle, S.prepare, S.thread, S.roll, S.tail, S.done]),

    /* permissives */
    a.edge(P.hyd, T.hydPress, "DERIVED_FROM"),
    a.edge(P.lube, T.lubeOk, "DERIVED_FROM"),
    a.edge(P.cooling, T.coolFlow, "DERIVED_FROM"),
    a.edge(P.mode, T.modeAuto, "DERIVED_FROM"),
    a.edge(P.drive, T.driveReady, "DERIVED_FROM"),
    a.edge(P.coiler, T.coilerReady, "DERIVED_FROM"),
    a.edge(P.hyd, S.prepare, "GATES"),
    a.edge(P.lube, S.prepare, "GATES"),
    a.edge(P.cooling, S.roll, "GATES"),
    a.edge(P.mode, SQ, "GATES"),
    a.edge(P.drive, S.prepare, "GATES"),
    a.edge(P.coiler, S.thread, "GATES"),
    a.edge(B.perm, P.hyd, "WRITES"),
    a.edge(B.perm, P.lube, "WRITES"),
    a.edge(B.perm, P.cooling, "WRITES"),
    a.edge(B.perm, P.mode, "WRITES"),
    a.edge(B.perm, P.drive, "WRITES"),
    a.edge(B.perm, P.coiler, "WRITES"),

    /* interlocks */
    a.edge(I.estop, T.estopOk, "DERIVED_FROM"),
    a.edge(I.overtemp, T.motorTemp, "DERIVED_FROM"),
    a.edge(I.gap, T.gapAct, "DERIVED_FROM"),
    a.edge(I.downstream, T.coilerReady, "DERIVED_FROM"),
    a.edge(I.estop, SQ, "BLOCKS"),
    a.edge(I.overtemp, EQ.stand, "BLOCKS"),
    a.edge(I.gap, S.roll, "BLOCKS"),
    a.edge(I.downstream, S.thread, "BLOCKS"),

    /* alarms */
    a.edge(T.driveFault, AL.driveFault, "RAISES"),
    a.edge(T.hydPress, AL.hydLow, "RAISES"),
    a.edge(T.lubeOk, AL.lubeLow, "RAISES"),
    a.edge(S.thread, AL.seqTimeout, "RAISES"),
    a.edge(T.entryTemp, AL.entryTempLow, "RAISES"),
    a.edge(T.motorTemp, AL.motorOvertemp, "RAISES"),
    a.edge(IO.pnDrive, AL.pnLoss, "RAISES"),
    a.edge(T.coilerReady, AL.coilerFull, "RAISES"),

    /* evidence */
    a.edge(EV.driveTrend, T.driveSpeed, "RECORDS"),
    a.edge(EV.driveTrend, T.driveTorque, "RECORDS"),
    a.edge(EV.tempTrend, T.entryTemp, "RECORDS"),
    a.edge(EV.tempTrend, T.exitTemp, "RECORDS"),
    a.edge(EV.hydTrend, T.hydPress, "RECORDS"),
    a.edge(EV.cpuDiag, D.cpu, "RECORDS"),
    a.edge(EV.seqLog, SQ, "RECORDS"),

    /* fault-mode explanations */
    a.edge(FM.driveOc, AL.driveFault, "EXPLAINS"),
    a.edge(T.driveTorque, FM.driveOc, "EVIDENCE_FOR"),
    a.edge(T.driveSpeed, FM.driveOc, "EVIDENCE_FOR"),
    a.edge(EV.driveTrend, FM.driveOc, "EVIDENCE_FOR"),

    a.edge(FM.hydDegraded, AL.hydLow, "EXPLAINS"),
    a.edge(T.hydPress, FM.hydDegraded, "EVIDENCE_FOR"),
    a.edge(EV.hydTrend, FM.hydDegraded, "EVIDENCE_FOR"),
    a.edge(FM.hydDegraded, P.hyd, "EXPLAINS"),

    a.edge(FM.lubeSwitch, AL.lubeLow, "EXPLAINS"),
    a.edge(T.lubeOk, FM.lubeSwitch, "EVIDENCE_FOR"),
    a.edge(IO.lube, FM.lubeSwitch, "EVIDENCE_FOR"),

    a.edge(FM.pyroDrift, AL.entryTempLow, "EXPLAINS"),
    a.edge(T.entryTemp, FM.pyroDrift, "EVIDENCE_FOR"),
    a.edge(IO.entryPyro, FM.pyroDrift, "EVIDENCE_FOR"),
    a.edge(T.exitTemp, FM.pyroDrift, "EVIDENCE_FOR"),
    // Drift is only visible against history: a single reading cannot separate
    // a drifting instrument from a genuinely colder slab.
    a.edge(EV.tempTrend, FM.pyroDrift, "EVIDENCE_FOR"),

    a.edge(FM.pnName, AL.pnLoss, "EXPLAINS"),
    a.edge(IO.pnDrive, FM.pnName, "EVIDENCE_FOR"),
    a.edge(T.driveReady, FM.pnName, "EVIDENCE_FOR"),
    a.edge(EV.cpuDiag, FM.pnName, "EVIDENCE_FOR"),

    a.edge(FM.permHyd, P.hyd, "EXPLAINS"),
    a.edge(T.hydPress, FM.permHyd, "EVIDENCE_FOR"),
    a.edge(T.startReq, FM.permHyd, "EVIDENCE_FOR"),
    a.edge(T.running, FM.permHyd, "EVIDENCE_FOR"),
    // Ruling this fault mode in means ruling the OTHER start permissive out,
    // and showing from the trend whether pressure ever reached the threshold.
    a.edge(T.lubeOk, FM.permHyd, "EVIDENCE_FOR"),
    a.edge(EV.hydTrend, FM.permHyd, "EVIDENCE_FOR"),

    a.edge(FM.modeManual, P.mode, "EXPLAINS"),
    a.edge(T.modeAuto, FM.modeManual, "EVIDENCE_FOR"),
    a.edge(T.startReq, FM.modeManual, "EVIDENCE_FOR"),

    a.edge(FM.coilerBlock, AL.coilerFull, "EXPLAINS"),
    a.edge(FM.coilerBlock, I.downstream, "EXPLAINS"),
    a.edge(T.coilerReady, FM.coilerBlock, "EVIDENCE_FOR"),
    a.edge(EQ.coiler, FM.coilerBlock, "EVIDENCE_FOR"),

    a.edge(FM.threadTimeout, AL.seqTimeout, "EXPLAINS"),
    a.edge(S.thread, FM.threadTimeout, "EVIDENCE_FOR"),
    a.edge(EV.seqLog, FM.threadTimeout, "EVIDENCE_FOR"),
    a.edge(T.slabPresent, FM.threadTimeout, "EVIDENCE_FOR"),

    a.edge(FM.motorCooling, AL.motorOvertemp, "EXPLAINS"),
    a.edge(FM.motorCooling, I.overtemp, "EXPLAINS"),
    a.edge(T.motorTemp, FM.motorCooling, "EVIDENCE_FOR"),
    a.edge(T.driveTorque, FM.motorCooling, "EVIDENCE_FOR"),
    // The PT100 channel separates a genuinely hot winding from a faulty
    // measurement chain — without it the diagnosis is not yet earned.
    a.edge(IO.motorPt100, FM.motorCooling, "EVIDENCE_FOR"),

    /* verification */
    a.edge(SA.driveHistory, FM.driveOc, "VERIFIES"),
    a.edge(SA.cpuDiag, FM.driveOc, "VERIFIES"),
    a.edge(SA.hydTrend, FM.hydDegraded, "VERIFIES"),
    a.edge(SA.hydTrend, FM.permHyd, "VERIFIES"),
    a.edge(SA.lubeSwitch, FM.lubeSwitch, "VERIFIES"),
    a.edge(SA.pyroCheck, FM.pyroDrift, "VERIFIES"),
    a.edge(SA.pnName, FM.pnName, "VERIFIES"),
    a.edge(SA.cpuDiag, FM.pnName, "VERIFIES"),
    a.edge(SA.modeCheck, FM.modeManual, "VERIFIES"),
    a.edge(SA.coilerCheck, FM.coilerBlock, "VERIFIES"),
    a.edge(SA.seqLog, FM.threadTimeout, "VERIFIES"),
    a.edge(SA.coilerCheck, FM.threadTimeout, "VERIFIES"),
    a.edge(SA.thermoscan, FM.motorCooling, "VERIFIES"),
    a.edge(SA.safetyReview, FM.motorCooling, "VERIFIES"),
  ],

  artifacts: [
    {
      local: "OB1_MAIN",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "OB1_Main.scl",
      declares: [B.ob1],
      provenance: { subsystem: "ROLL_LINE_A", sourceId: "OB1", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: `ORGANIZATION_BLOCK "OB1_MAIN"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
VAR_TEMP
   cycleOk : Bool;
END_VAR

BEGIN
   // Permissives are evaluated FIRST so the sequence always sees a value
   // computed in the same scan. Evaluating them after the sequence would let
   // the sequence act on the previous cycle's permissive state.
   "FC_PERMISSIVE_LOGIC"();

   "FB_MILL_SEQUENCE"();
END_ORGANIZATION_BLOCK
`,
    },
    {
      local: "FC_PERMISSIVE_LOGIC",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FC1230_PermissiveLogic.scl",
      declares: [B.perm, P.hyd, P.lube, P.cooling, P.mode, P.drive, P.coiler],
      provenance: { subsystem: "ROLL_LINE_A", sourceId: "FC1230", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: `FUNCTION "FC_PERMISSIVE_LOGIC" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
VAR_CONSTANT
   HYD_MIN_BAR   : Real := 140.0;
   COOL_MIN_FLOW : Real := 55.0;
END_VAR

BEGIN
   // A permissive states that starting is ALLOWED. It is not an interlock:
   // losing a permissive prevents a start, it does not by itself stop a
   // running pass. The two are kept in separate blocks so that distinction
   // stays visible in the code, not only in the documentation.

   "PRM_HYD_PRESSURE"  := "HYD_PRESSURE_ACT" >= HYD_MIN_BAR;
   "PRM_LUBE_OK"       := "LUBE_PRESSURE_OK";
   "PRM_COOLING_FLOW"  := "COOLING_FLOW_ACT" >= COOL_MIN_FLOW;
   "PRM_MODE_AUTO"     := "MILL_MODE_AUTO";
   "PRM_DRIVE_READY"   := "DRIVE1_READY";
   "PRM_COILER_READY"  := "COILER_READY";
END_FUNCTION
`,
    },
    {
      local: "FB_MILL_SEQUENCE",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1210_MillSequence.scl",
      declares: [B.seq, SQ, S.idle, S.prepare, S.thread, S.roll, S.tail, S.done],
      provenance: { subsystem: "ROLL_LINE_A", sourceId: "FB1210", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: `FUNCTION_BLOCK "FB_MILL_SEQUENCE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
VAR
   step        : Int := 0;
   stepElapsed : Time;
   stepTimeout : Bool;
END_VAR
VAR_CONSTANT
   T_PREPARE : Time := T#45s;
   T_THREAD  : Time := T#30s;
   T_ROLL    : Time := T#180s;
   T_TAIL    : Time := T#60s;
END_VAR

BEGIN
   // The E-stop interlock is READ here and nowhere written. Hermes observes
   // this chain for diagnosis; the safety function itself lives in the safety
   // controller and is never reset, bridged or defeated from this program.
   IF "ILK_ESTOP_ACTIVE" THEN
      #step := 0;
   END_IF;

   CASE #step OF
      0:  // S00 idle — every start condition is checked together
         IF "MILL_START_REQ"
            AND "MILL_MODE_AUTO"
            AND "PRM_HYD_PRESSURE"
            AND "PRM_LUBE_OK"
            AND "PRM_DRIVE_READY"
         THEN
            #step := 10;
         END_IF;

      10: // S10 prepare — set the roll gap, wait for the coiler
         IF "PRM_COILER_READY" AND NOT "ILK_DOWNSTREAM_FULL" THEN
            #step := 20;
         END_IF;

      20: // S20 thread — the slab must actually arrive
         IF "SLAB_PRESENT_ENTRY" AND "COILER_READY" THEN
            #step := 30;
         END_IF;

      30: // S30 roll
         "MILL_RUNNING" := TRUE;
         IF NOT "SLAB_PRESENT_ENTRY" THEN
            #step := 40;
         END_IF;

      40: // S40 tail out
         "MILL_RUNNING" := FALSE;
         #step := 50;

      50: // S50 complete
         "PROD_COUNT_COILS" := "PROD_COUNT_COILS" + 1;
         #step := 0;
   END_CASE;

   "FB_DRIVE_INTERFACE"();
END_FUNCTION_BLOCK
`,
    },
    {
      local: "FB_DRIVE_INTERFACE",
      language: "SCL",
      layer: "PLC_LOGIC",
      fileName: "FB1220_DriveInterface.scl",
      declares: [B.drive, I.overtemp],
      provenance: { subsystem: "ROLL_LINE_A", sourceId: "FB1220", domain: "DRIVES", safetyClass: "SAFETY_RELATED" },
      content: `FUNCTION_BLOCK "FB_DRIVE_INTERFACE"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 1.0
VAR
   torqueFiltered : Real;
END_VAR
VAR_CONSTANT
   MOTOR_TEMP_TRIP_C : Real := 145.0;
END_VAR

BEGIN
   // Read-only mirror of the drive telemetry. This block issues no setpoint
   // and no command word: Hermes reasons about the drive, it does not drive it.
   #torqueFiltered := "DRIVE1_TORQUE_ACT";

   IF "DRIVE1_FAULT" OR NOT "DRIVE1_READY" THEN
      #torqueFiltered := 0.0;
   END_IF;

   IF "DRIVE1_SPEED_ACT" > 0.0 AND "STAND1_MOTOR_TEMP" >= MOTOR_TEMP_TRIP_C THEN
      "ILK_MOTOR_OVERTEMP" := TRUE;
   END_IF;
END_FUNCTION_BLOCK
`,
    },
    {
      local: "LAD_INTERLOCK_NETWORK",
      language: "LAD_XML",
      layer: "PLC_LOGIC",
      fileName: "FC1240_InterlockNetwork.lad.xml",
      declares: [I.gap, I.downstream],
      provenance: { subsystem: "ROLL_LINE_A", sourceId: "FC1240/NW1", domain: "CONTROL_LOGIC", safetyClass: "NON_SAFETY" },
      content: `<?xml version="1.0" encoding="utf-8"?>
<!--
  Ladder network exported in a structured, importable form. It is engineering
  METADATA: nothing in this repository compiles, downloads or executes it.
-->
<Document>
  <SW.Blocks.FC ID="FC1240">
    <AttributeList>
      <Name>FC_INTERLOCK_NETWORK</Name>
      <ProgrammingLanguage>LAD</ProgrammingLanguage>
    </AttributeList>
    <ObjectList>
      <SW.Blocks.CompileUnit ID="NW1">
        <AttributeList>
          <NetworkTitle>Roll gap outside tolerance blocks the rolling step</NetworkTitle>
          <NetworkSource>
            <FlgNet>
              <Parts>
                <Access Scope="GlobalVariable" UId="21"><Symbol><Component Name="STAND1_GAP_ACT"/></Symbol></Access>
                <Access Scope="GlobalVariable" UId="22"><Symbol><Component Name="STAND1_GAP_SP"/></Symbol></Access>
                <Access Scope="GlobalVariable" UId="23"><Symbol><Component Name="ILK_GAP_OUT_OF_TOLERANCE"/></Symbol></Access>
                <Part Name="Sub" UId="24"/>
                <Part Name="Abs" UId="25"/>
                <Part Name="Gt" UId="26"/>
                <Part Name="Coil" UId="27"/>
              </Parts>
              <Wires>
                <Wire UId="31"><IdentCon UId="21"/><NameCon UId="24" Name="in1"/></Wire>
                <Wire UId="32"><IdentCon UId="22"/><NameCon UId="24" Name="in2"/></Wire>
                <Wire UId="33"><NameCon UId="24" Name="out"/><NameCon UId="25" Name="in"/></Wire>
                <Wire UId="34"><NameCon UId="25" Name="out"/><NameCon UId="26" Name="in1"/></Wire>
                <Wire UId="35"><NameCon UId="26" Name="out"/><NameCon UId="27" Name="in"/></Wire>
                <Wire UId="36"><NameCon UId="27" Name="operand"/><IdentCon UId="23"/></Wire>
              </Wires>
            </FlgNet>
          </NetworkSource>
        </AttributeList>
      </SW.Blocks.CompileUnit>
      <SW.Blocks.CompileUnit ID="NW2">
        <AttributeList>
          <NetworkTitle>Down coiler not ready blocks threading</NetworkTitle>
          <NetworkSource>
            <FlgNet>
              <Parts>
                <Access Scope="GlobalVariable" UId="41"><Symbol><Component Name="COILER_READY"/></Symbol></Access>
                <Access Scope="GlobalVariable" UId="42"><Symbol><Component Name="ILK_DOWNSTREAM_FULL"/></Symbol></Access>
                <Part Name="Not" UId="43"/>
                <Part Name="Coil" UId="44"/>
              </Parts>
              <Wires>
                <Wire UId="51"><IdentCon UId="41"/><NameCon UId="43" Name="in"/></Wire>
                <Wire UId="52"><NameCon UId="43" Name="out"/><NameCon UId="44" Name="in"/></Wire>
                <Wire UId="53"><NameCon UId="44" Name="operand"/><IdentCon UId="42"/></Wire>
              </Wires>
            </FlgNet>
          </NetworkSource>
        </AttributeList>
      </SW.Blocks.CompileUnit>
    </ObjectList>
  </SW.Blocks.FC>
</Document>
`,
    },
  ],

  scenarios: [
    {
      id: "TIA-01-FS-01",
      title: t("Mill stand will not start", "استند نورد راه‌اندازی نمی‌شود"),
      narrative: t(
        "Operator holds the start request in automatic mode; the stand does not start and no drive fault is shown.",
        "اپراتور در حالت خودکار درخواست راه‌اندازی را نگه می‌دارد؛ استند راه نمی‌افتد و هیچ خطای درایوی نمایش داده نمی‌شود.",
      ),
      observations: [
        { nodeId: T.startReq, state: "TRUE" },
        { nodeId: T.modeAuto, state: "TRUE" },
        { nodeId: T.running, state: "FALSE" },
        { nodeId: T.driveFault, state: "FALSE" },
        { nodeId: T.driveReady, state: "TRUE" },
        { nodeId: T.hydPress, state: "ABNORMAL", detail: "below the start threshold" },
        { nodeId: AL.hydLow, state: "TRUE" },
        { nodeId: T.estopOk, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "PLC_LOGIC",
        faultClass: "PERMISSIVE_MISSING",
        faultModeId: FM.permHyd,
        supportingNodeIds: [T.hydPress, AL.hydLow, T.running, T.startReq],
        expectedMissingNodeIds: [T.lubeOk, EV.hydTrend],
        expectedSafeActionIds: [SA.hydTrend],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-01-FS-02",
      title: t("Drive trips every time the pass accelerates", "درایو در هر شتاب‌گیری پاس تریپ می‌کند"),
      narrative: t(
        "The stand drive faults repeatedly a few seconds into acceleration; torque peaks well above the previous shift.",
        "درایو استند چند ثانیه پس از شروع شتاب‌گیری مکرراً خطا می‌دهد؛ قله‌های گشتاور بسیار بالاتر از شیفت پیشین است.",
      ),
      observations: [
        { nodeId: T.driveFault, state: "TRUE" },
        { nodeId: AL.driveFault, state: "TRUE" },
        { nodeId: T.driveTorque, state: "ABNORMAL", detail: "peaks above the previous shift" },
        { nodeId: T.driveSpeed, state: "ABNORMAL", detail: "never reaches the pass reference" },
        { nodeId: T.motorTemp, state: "NORMAL" },
        { nodeId: T.hydPress, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "DRIVE",
        faultClass: "DRIVE_FAULT",
        faultModeId: FM.driveOc,
        supportingNodeIds: [T.driveFault, AL.driveFault, T.driveTorque, T.driveSpeed],
        expectedMissingNodeIds: [EV.driveTrend, EV.cpuDiag],
        expectedSafeActionIds: [SA.driveHistory, SA.cpuDiag],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-01-FS-03",
      title: t("Entry temperature reads low but product is on grade", "دمای ورودی پایین خوانده می‌شود اما محصول در گرید است"),
      narrative: t(
        "Entry temperature alarms low on every slab, yet exit temperature and finished product quality are unchanged.",
        "دمای ورودی برای هر تختال آلارم پایین می‌دهد، اما دمای خروجی و کیفیت محصول نهایی تغییری نکرده است.",
      ),
      observations: [
        { nodeId: T.entryTemp, state: "ABNORMAL", detail: "consistently below the rolling window" },
        { nodeId: AL.entryTempLow, state: "TRUE" },
        { nodeId: T.exitTemp, state: "NORMAL" },
        { nodeId: T.running, state: "TRUE" },
        { nodeId: T.driveFault, state: "FALSE" },
      ],
      groundTruth: {
        subsystem: "FIELD_DEVICE",
        faultClass: "SENSOR_FAILURE",
        faultModeId: FM.pyroDrift,
        supportingNodeIds: [T.entryTemp, AL.entryTempLow, T.exitTemp],
        expectedMissingNodeIds: [IO.entryPyro, EV.tempTrend],
        expectedSafeActionIds: [SA.pyroCheck],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-01-FS-04",
      title: t("Drive unreachable after a hardware replacement", "درایو پس از تعویض سخت‌افزار در دسترس نیست"),
      narrative: t(
        "The stand drive was replaced during the shutdown. Since restart the controller reports a communication fault and the drive never reports ready.",
        "درایو استند در توقف برنامه‌ریزی‌شده تعویض شد. از زمان راه‌اندازی مجدد، کنترلر خطای ارتباطی گزارش می‌دهد و درایو هرگز آمادگی اعلام نمی‌کند.",
      ),
      observations: [
        { nodeId: AL.pnLoss, state: "TRUE" },
        { nodeId: T.driveReady, state: "STALE", detail: "no update since the restart" },
        { nodeId: T.driveFault, state: "STALE" },
        { nodeId: T.running, state: "FALSE" },
        { nodeId: T.hydPress, state: "NORMAL" },
      ],
      groundTruth: {
        subsystem: "NETWORK",
        faultClass: "COMMUNICATION_LOSS",
        faultModeId: FM.pnName,
        supportingNodeIds: [AL.pnLoss, T.driveReady, T.driveFault],
        expectedMissingNodeIds: [EV.cpuDiag, IO.pnDrive],
        expectedSafeActionIds: [SA.pnName, SA.cpuDiag],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-01-FS-05",
      title: t("Sequence stalls at the threading step", "توالی در گام هدایت تختال متوقف می‌ماند"),
      narrative: t(
        "The sequence reaches the threading step and times out. The slab is present at entry and the drive is healthy.",
        "توالی به گام هدایت تختال می‌رسد و مهلتش تمام می‌شود. تختال در ورودی حاضر است و درایو سالم است.",
      ),
      observations: [
        { nodeId: S.thread, state: "ABNORMAL", detail: "step watchdog expired" },
        { nodeId: AL.seqTimeout, state: "TRUE" },
        { nodeId: T.slabPresent, state: "TRUE" },
        { nodeId: T.driveFault, state: "FALSE" },
        { nodeId: T.coilerReady, state: "FALSE" },
        { nodeId: AL.coilerFull, state: "TRUE" },
      ],
      groundTruth: {
        subsystem: "UPSTREAM_DOWNSTREAM",
        faultClass: "BLOCKAGE",
        faultModeId: FM.coilerBlock,
        supportingNodeIds: [T.coilerReady, AL.coilerFull, S.thread, AL.seqTimeout],
        expectedMissingNodeIds: [EV.seqLog, EQ.coiler],
        expectedSafeActionIds: [SA.coilerCheck, SA.seqLog],
        requiresEscalation: false,
      },
    },
    {
      id: "TIA-01-FS-06",
      title: t("Stand motor over-temperature trips the line", "دمای بیش‌ازحد موتور استند خط را متوقف می‌کند"),
      narrative: t(
        "Motor winding temperature climbs through the shift and finally trips the over-temperature interlock at normal production torque.",
        "دمای سیم‌پیچ موتور در طول شیفت بالا می‌رود و سرانجام در گشتاور عادی تولید، اینترلاک دمای بیش‌ازحد را فعال می‌کند.",
      ),
      observations: [
        { nodeId: T.motorTemp, state: "ABNORMAL", detail: "rising trend across the shift" },
        { nodeId: AL.motorOvertemp, state: "TRUE" },
        { nodeId: I.overtemp, state: "TRUE" },
        { nodeId: T.driveTorque, state: "NORMAL" },
        { nodeId: T.driveFault, state: "FALSE" },
      ],
      groundTruth: {
        subsystem: "MECHANICAL",
        faultClass: "ACTUATOR_FAILURE",
        faultModeId: FM.motorCooling,
        supportingNodeIds: [T.motorTemp, AL.motorOvertemp, I.overtemp, T.driveTorque],
        expectedMissingNodeIds: [IO.motorPt100],
        expectedSafeActionIds: [SA.thermoscan, SA.safetyReview],
        requiresEscalation: true,
      },
    },
  ],
};
