// Hermes Industrial Brain V1 — Deterministic Reasoning Engine
// Phase 80: Evidence-first, safety-aware, explainable analysis
// No external AI calls. No fake claims. Structured deterministic logic.

import { matchCases, CASES } from "@/lib/industrial/cases";
import type { BrainDomainId } from "@/lib/services/types";
import type { VendorId } from "@/lib/industrial/vendors";
import type {
  IndustrialFaultInput,
  IndustrialBrainAnalysis,
  IndustrialDomain,
  SignalStatus,
  SignalMatrixItem,
  AlarmItem,
  AlarmSeverity,
  LikelyCause,
  ChecklistItem,
  ActionGroup,
  EvidenceGap,
  EvidenceNode,
  CauseNode,
  RiskNode,
  ActionNode,
  ReasoningMap,
  UncertaintyResult,
  UncertaintyLevel,
  RiskResult,
  ClassificationResult,
  RelatedKnowledge,
  Severity,
} from "./types";

// ─── Text utilities ───────────────────────────────────────────────────────────

function gatherAllText(input: IndustrialFaultInput): string {
  return [
    input.problemTitle, input.assetType, input.systemArea, input.plcPlatform,
    input.observedSymptoms, input.recentChanges, input.activeAlarms,
    input.observedSignals, input.hmiCommandState, input.plcOutputState,
    input.vfdMccState, input.interlockStatus, input.sensorFeedback,
    input.alreadyChecked, input.additionalInfo,
  ].filter(Boolean).join(" ").toLowerCase();
}

function has(text: string, ...terms: string[]): boolean {
  return terms.some(t => text.includes(t.toLowerCase()));
}

// ─── Domain detection ─────────────────────────────────────────────────────────

const DOMAIN_KW: Record<IndustrialDomain, string[]> = {
  MOTOR:       ["motor","pump","fan","conveyor","belt","compressor","rotation","rpm","torque","winding","bearing","shaft","coupling","gearbox","impeller"],
  VFD:         ["vfd","vsd","inverter","variable frequency","variable speed","drive fault","drive ready","drive run","frequency converter","abb","danfoss","sinamics","altivar"],
  PLC:         ["plc","cpu","program","ladder","scan","watchdog","output coil","input coil","rung","function block","sfb","ob","s7-","controllogix","micrologix","modicon"],
  HMI:         ["hmi","scada panel","operator panel","display","operator screen","run command","hmi run","hmi command","wonder","intouch","wincc","vijeo"],
  SCADA:       ["scada","historian","dcs","distributed control","igss","wonderware","pi historian","ignition"],
  SENSOR:      ["sensor","encoder","proximity","limit switch","position sensor","speed sensor","temperature sensor","pressure sensor","level sensor","flow sensor","photoelectric","inductive","capacitive","ultrasonic","thermocouple","rtd"],
  NETWORK:     ["network","ethernet","profibus","profinet","devicenet","modbus","can bus","io module","remote io","comm fault","communication timeout","network fault"],
  ELECTRICAL:  ["voltage","phase","wiring","terminal","fuse","breaker","cable","short circuit","ground fault","insulation","resistance","ohm","ampere","volt","neutral","earth","earthing"],
  MECHANICAL:  ["vibration","noise","alignment","balance","bearing","coupling","gearbox","seal","leak","wear","mechanical","breakage","lubrication","grease"],
  MAINTENANCE: ["maintenance","overhaul","replacement","inspection","preventive","service","filter","worn","corroded","aged","pm ","scheduled"],
  UNKNOWN:     [],
};

function detectDomains(allText: string): { domain: IndustrialDomain; score: number }[] {
  const scores = (Object.keys(DOMAIN_KW) as IndustrialDomain[])
    .filter(d => d !== "UNKNOWN")
    .map(domain => {
      const score = DOMAIN_KW[domain].reduce((s, kw) =>
        s + (allText.includes(kw.toLowerCase()) ? (kw.length >= 6 ? 3 : 1) : 0), 0);
      return { domain, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scores.length ? scores : [{ domain: "UNKNOWN", score: 0 }];
}

const DOMAIN_FA: Record<IndustrialDomain, string> = {
  MOTOR:       "موتور / محرک",
  VFD:         "درایو / اینورتر",
  PLC:         "PLC / کنترل برنامه‌پذیر",
  HMI:         "HMI / پنل اپراتور",
  SCADA:       "SCADA / سیستم کنترل توزیع‌شده",
  SENSOR:      "سنسور / حسگر",
  NETWORK:     "شبکه صنعتی / ارتباطات",
  ELECTRICAL:  "برق / کابل / سیم‌بندی",
  MECHANICAL:  "مکانیک / الحاقات",
  MAINTENANCE: "نگهداری / تعمیر",
  UNKNOWN:     "نامشخص",
};

// ─── Alarm parsing ────────────────────────────────────────────────────────────

function parseAlarms(alarmText: string): AlarmItem[] {
  if (!alarmText || alarmText.trim().length < 2) return [];
  const t = alarmText.trim().toLowerCase();

  // "No active alarm" / "No alarm" → diagnostic entry
  if (has(t, "no active alarm", "no alarm", "no plc alarm", "no fault", "no active fault", "none", "clear")) {
    return [{
      alarmText: alarmText.trim(),
      source: "PLC / Control System",
      severity: "INFO",
      interpretation: "No active alarm in fault register at time of inspection.",
      possibleMeaning: "CRITICAL DIAGNOSTIC NOTE: Absence of a PLC alarm does not confirm the field device is healthy. " +
        "PLC may be commanding correctly but field wiring, VFD, MCC, or mechanical issue prevents motor from running. " +
        "Check PLC output command state, field device status, and permissive chain separately.",
      confidence: 90,
    }];
  }

  // Parse line-by-line alarms
  const lines = alarmText.split(/[\n;,|]+/).map(l => l.trim()).filter(l => l.length > 3);
  return lines.slice(0, 8).map(line => {
    const lo = line.toLowerCase();
    let source = "Unknown";
    let severity: AlarmSeverity = "UNKNOWN";
    let interpretation = "Alarm requires investigation.";
    let possibleMeaning = "Check alarm history and source device for context.";
    let confidence = 55;

    if (has(lo, "vfd","drive","inverter","frequency")) { source = "VFD / Drive"; confidence = 75; }
    else if (has(lo, "plc","cpu","program")) { source = "PLC / Controller"; confidence = 75; }
    else if (has(lo, "hmi","panel","operator")) { source = "HMI / Operator Station"; confidence = 70; }
    else if (has(lo, "motor","overload","overload relay","thermal")) { source = "Motor Protection"; confidence = 80; }
    else if (has(lo, "safety","e-stop","estop","emergency","guard","interlock")) { source = "Safety System"; confidence = 85; }
    else if (has(lo, "sensor","encoder","proximity","feedback")) { source = "Sensor / Field Device"; confidence = 75; }
    else if (has(lo, "network","comm","communication","profibus","profinet")) { source = "Network / Communication"; confidence = 70; }

    if (has(lo, "critical","emergency","trip","fault","fail","unsafe","danger")) { severity = "CRITICAL"; }
    else if (has(lo, "high","alarm","error","alert","warning")) { severity = "HIGH"; }
    else if (has(lo, "medium","warn","caution")) { severity = "MEDIUM"; }
    else if (has(lo, "low","info","notice")) { severity = "LOW"; }
    else if (has(lo, "trip","fault")) { severity = "HIGH"; }

    if (has(lo, "overload","overcurrent")) {
      interpretation = "Motor protection device detected current exceeding rated threshold.";
      possibleMeaning = "Mechanical jam, wrong motor parameters in overload relay, or motor winding fault.";
      confidence = 82;
    } else if (has(lo, "vfd fault","drive fault","drive error")) {
      interpretation = "VFD has detected an internal fault condition.";
      possibleMeaning = "Check VFD display for specific fault code. Common: F0001 overcurrent, F0002 overvoltage, F0003 undervoltage.";
      confidence = 80;
    } else if (has(lo, "communication","comm fail","timeout")) {
      interpretation = "Communication link between devices has been lost or degraded.";
      possibleMeaning = "Check cable connections, termination resistors, and device addresses.";
      confidence = 75;
    } else if (has(lo, "e-stop","emergency","safety")) {
      interpretation = "Safety system has been triggered, preventing motor operation.";
      possibleMeaning = "Verify E-stop buttons are released, guard doors are closed, safety relay is reset.";
      confidence = 88;
    } else if (has(lo, "sensor","encoder","proximity")) {
      interpretation = "Sensor or feedback device has reported an abnormal state.";
      possibleMeaning = "Check sensor power supply, positioning, and cable integrity.";
      confidence = 73;
    }

    return { alarmText: line, source, severity, interpretation, possibleMeaning, confidence };
  });
}

// ─── Signal matrix ────────────────────────────────────────────────────────────

function buildSignalMatrix(input: IndustrialFaultInput, allText: string): SignalMatrixItem[] {
  const hmi = (input.hmiCommandState ?? "").toLowerCase();
  const plcOut = (input.plcOutputState ?? "").toLowerCase();
  const vfd = (input.vfdMccState ?? "").toLowerCase();
  const interlock = (input.interlockStatus ?? "").toLowerCase();
  const sensor = (input.sensorFeedback ?? "").toLowerCase();
  const alarms = (input.activeAlarms ?? "").toLowerCase();
  const checked = (input.alreadyChecked ?? "").toLowerCase();
  const sym = (input.observedSymptoms ?? "").toLowerCase();
  const changes = (input.recentChanges ?? "").toLowerCase();

  const items: SignalMatrixItem[] = [];

  // ── HMI Run Command ───────────────────────────────────────────────────────
  let hmiStatus: SignalStatus = "UNKNOWN";
  let hmiValue = "Not reported";
  if (has(hmi + " " + sym, "run command active", "hmi run", "run command is active", "hmi command active") ||
      (has(hmi, "run") && has(hmi, "active","on","given","issued"))) {
    hmiStatus = "NORMAL"; hmiValue = "Run command active";
  } else if (has(hmi, "stop","off","not active","no command")) {
    hmiStatus = "WARNING"; hmiValue = "Run command not active";
  } else if (has(sym, "hmi run command is active", "hmi command active", "operator gave run")) {
    hmiStatus = "NORMAL"; hmiValue = "Run command active (from symptoms)";
  } else if (checked.includes("hmi command") || checked.includes("hmi")) {
    hmiStatus = "NORMAL"; hmiValue = "Checked — command issued";
  }

  items.push({
    signalName: "HMI Run Command",
    signalNameFa: "فرمان اجرا از HMI",
    source: "HMI / Operator Station",
    observedValue: hmiValue,
    expectedValue: "Run command active",
    status: hmiStatus,
    diagnosticMeaning: hmiStatus === "NORMAL"
      ? "Operator has issued run command. Signal chain continues from HMI → PLC input → program logic."
      : hmiStatus === "WARNING"
        ? "Run command not active at HMI — motor will not start regardless of downstream state."
        : "HMI command state not confirmed. Verify operator has issued run from correct screen/mode.",
    confidence: hmiStatus !== "UNKNOWN" ? 88 : 0,
    nextCheck: hmiStatus === "UNKNOWN"
      ? "Confirm run command is active on HMI operator screen. Check HMI mode selector (AUTO/MANUAL)."
      : "Trace run command signal to PLC digital input. Confirm PLC input I-bit is HIGH.",
  });

  // ── PLC Fault Register ────────────────────────────────────────────────────
  let plcFaultStatus: SignalStatus = "UNKNOWN";
  let plcFaultValue = "Not reported";
  if (has(alarms, "no active alarm", "no alarm", "no plc alarm", "no fault", "no active fault") ||
      has(sym, "plc shows no fault", "plc no fault", "no active fault", "plc no alarm") ||
      checked.includes("plc fault")) {
    plcFaultStatus = "NORMAL"; plcFaultValue = "No active fault in PLC register";
  } else if (alarms.length > 6 && !has(alarms, "no ","none","clear")) {
    plcFaultStatus = "CRITICAL"; plcFaultValue = "Active PLC faults present";
  }

  items.push({
    signalName: "PLC Fault Register",
    signalNameFa: "ثبت خطای PLC",
    source: "PLC / Controller",
    observedValue: plcFaultValue,
    expectedValue: "No active fault",
    status: plcFaultStatus,
    diagnosticMeaning: plcFaultStatus === "NORMAL"
      ? "No PLC program fault detected. IMPORTANT: This does NOT confirm the PLC output command is active, nor does it confirm field device health. Check Q-bit state separately."
      : plcFaultStatus === "CRITICAL"
        ? "PLC has active faults — check fault register for specific codes. Motor may be blocked by fault interlock in program."
        : "PLC fault register status not confirmed. Check PLC diagnostics online.",
    confidence: plcFaultStatus !== "UNKNOWN" ? 85 : 0,
    nextCheck: "Go online to PLC. Check specific output Q-bit for motor start coil — not just the fault register. Verify rung logic leading to output is satisfied.",
  });

  // ── PLC Output Command ────────────────────────────────────────────────────
  let plcOutStatus: SignalStatus = "UNKNOWN";
  let plcOutValue = "Not reported";
  if (has(plcOut, "active","on","high","true","commanded","energized")) {
    plcOutStatus = "NORMAL"; plcOutValue = "Output command active";
  } else if (has(plcOut, "not active","off","zero","low","false","not energized","not commanded")) {
    plcOutStatus = "CRITICAL"; plcOutValue = "Output command NOT active";
  } else if (has(sym, "plc output active","plc output on","plc commanded")) {
    plcOutStatus = "NORMAL"; plcOutValue = "Active (from symptom description)";
  }

  items.push({
    signalName: "PLC Output Command (Q-bit)",
    signalNameFa: "فرمان خروجی PLC (بیت Q)",
    source: "PLC Output Module",
    observedValue: plcOutValue,
    expectedValue: "Output Q-bit HIGH when run sequence satisfied",
    status: plcOutStatus,
    diagnosticMeaning: plcOutStatus === "UNKNOWN"
      ? "CRITICAL MISSING SIGNAL: PLC output command state not reported. This is the primary bridge between PLC program and field device. Must be checked before any field wiring work."
      : plcOutStatus === "NORMAL"
        ? "PLC is commanding the output. Fault is in field: wiring, VFD, MCC, or mechanical side."
        : "PLC is NOT commanding the output. Check permissive chain, interlock logic, or run rung conditions in PLC program.",
    confidence: plcOutStatus !== "UNKNOWN" ? 80 : 0,
    nextCheck: "Go PLC online. Navigate to output rung/block for motor start. Check Q-bit state and the enabling conditions (all permissives true, no inhibit).",
  });

  // ── VFD / MCC / Contactor ─────────────────────────────────────────────────
  let vfdStatus: SignalStatus = "UNKNOWN";
  let vfdValue = "Not reported";
  if (has(vfd, "ready") && !has(vfd, "not ready","fault","trip","error")) {
    vfdStatus = "NORMAL"; vfdValue = "Ready";
  } else if (has(vfd, "run") && !has(vfd, "not running","fault")) {
    vfdStatus = "WARNING"; vfdValue = "Running state reported";
  } else if (has(vfd, "fault","trip","error","f0","alarm")) {
    vfdStatus = "CRITICAL"; vfdValue = "Faulted / Tripped";
  } else if (has(vfd, "not ready","not energized","de-energized","off","open")) {
    vfdStatus = "CRITICAL"; vfdValue = "Not ready / De-energized";
  } else if (has(vfd, "contactor","mcc","closed","energized") && !has(vfd, "not","fault")) {
    vfdStatus = "NORMAL"; vfdValue = "Energized / Closed";
  }

  items.push({
    signalName: "VFD / MCC / Contactor Status",
    signalNameFa: "وضعیت VFD / MCC / کنتاکتور",
    source: "Electrical Panel / Field",
    observedValue: vfdValue,
    expectedValue: "Ready; run feedback active when commanded",
    status: vfdStatus,
    diagnosticMeaning: vfdStatus === "UNKNOWN"
      ? "CRITICAL MISSING SIGNAL: VFD/MCC/contactor field status not confirmed. Motor may not receive voltage even if PLC issues run command."
      : vfdStatus === "CRITICAL"
        ? "Switching device is faulted or not ready — this is a primary candidate for motor not starting."
        : "Field switching device appears ready — verify run feedback is returned to PLC.",
    confidence: vfdStatus !== "UNKNOWN" ? 78 : 0,
    nextCheck: "Check VFD keypad for fault code. Check contactor auxiliary contact feedback. Verify MCC breaker and isolator are closed and not tripped.",
  });

  // ── Overload Relay ────────────────────────────────────────────────────────
  let overloadStatus: SignalStatus = "UNKNOWN";
  let overloadValue = "Not reported";
  if (has(allText, "overload trip","overload tripped","thermal trip","motor protection trip")) {
    overloadStatus = "CRITICAL"; overloadValue = "Tripped";
  } else if (has(allText, "overload reset","overload ok","overload normal","overload not tripped","overload clear")) {
    overloadStatus = "NORMAL"; overloadValue = "Reset / Not tripped";
  } else if (has(allText, "overload relay checked","checked overload") && !has(allText, "trip")) {
    overloadStatus = "NORMAL"; overloadValue = "Checked (appears normal)";
  }

  items.push({
    signalName: "Overload Relay / Motor Protection",
    signalNameFa: "رله اضافه‌بار / حفاظت موتور",
    source: "MCC / Motor Starter",
    observedValue: overloadValue,
    expectedValue: "Reset / Not tripped",
    status: overloadStatus,
    diagnosticMeaning: overloadStatus === "UNKNOWN"
      ? "Overload relay status not confirmed. A tripped overload will prevent motor starting regardless of PLC or VFD state."
      : overloadStatus === "CRITICAL"
        ? "Overload relay is tripped. Motor cannot start. Identify and resolve overcurrent cause before resetting."
        : "Overload relay appears normal. Motor thermal protection is not blocking start.",
    confidence: overloadStatus !== "UNKNOWN" ? 72 : 0,
    nextCheck: "Check overload relay indicator (yellow lamp = tripped). If tripped, do not reset until root cause is identified. After motor replacement, verify relay is set to nameplate FLA.",
  });

  // ── Safety / Permissive / E-stop ──────────────────────────────────────────
  let safetyStatus: SignalStatus = "UNKNOWN";
  let safetyValue = "Not reported";
  if (has(interlock, "ok","clear","released","satisfied","all clear","normal")) {
    safetyStatus = "NORMAL"; safetyValue = "Clear / Satisfied";
  } else if (has(interlock, "open","active","tripped","not clear","fault","missing","blocked")) {
    safetyStatus = "CRITICAL"; safetyValue = "Open / Active permissive block";
  } else if (has(sym + " " + allText, "e-stop active","estop active","emergency stop active","guard open","door open")) {
    safetyStatus = "CRITICAL"; safetyValue = "Safety condition active";
  } else if (has(sym + " " + allText, "e-stop released","estop released","safety clear","guard closed")) {
    safetyStatus = "NORMAL"; safetyValue = "Safety chain clear";
  }

  items.push({
    signalName: "Safety / Permissive Chain",
    signalNameFa: "زنجیره ایمنی / شرط مجوز",
    source: "Safety System / PLC Inputs",
    observedValue: safetyValue,
    expectedValue: "All permissives satisfied; E-stop released; guards closed",
    status: safetyStatus,
    diagnosticMeaning: safetyStatus === "UNKNOWN"
      ? "Permissive chain status not confirmed. Any open permissive prevents PLC from issuing run command."
      : safetyStatus === "CRITICAL"
        ? "A safety or permissive condition is blocking the start sequence. Resolve before attempting restart."
        : "Safety chain appears satisfied. Permissives are not blocking the start.",
    confidence: safetyStatus !== "UNKNOWN" ? 75 : 0,
    nextCheck: "Check each permissive input in PLC online: E-stop circuit, guard door contacts, temperature limits, pressure switches, run-ready permissives from upstream/downstream equipment.",
  });

  // ── Motor Current ─────────────────────────────────────────────────────────
  let currentStatus: SignalStatus = "UNKNOWN";
  let currentValue = "Not measured";
  if (has(allText, "no current","zero current","0 amp","0a ","current zero")) {
    currentStatus = "CRITICAL"; currentValue = "Zero current measured";
  } else if (has(allText, "high current","overcurrent","overload current")) {
    currentStatus = "CRITICAL"; currentValue = "Overcurrent detected";
  } else if (has(allText, "normal current","current ok","current normal","measured current")) {
    currentStatus = "NORMAL"; currentValue = "Within normal range";
  }

  items.push({
    signalName: "Motor Current (Field Measurement)",
    signalNameFa: "جریان موتور (اندازه‌گیری میدانی)",
    source: "Clamp Meter / CT / VFD Display",
    observedValue: currentValue,
    expectedValue: "Start: ≤6× nameplate FLA for <3s; Run: within nameplate FLA",
    status: currentStatus,
    diagnosticMeaning: currentStatus === "UNKNOWN"
      ? "Motor current not measured. Zero current would confirm no voltage reaching motor. High current would indicate mechanical jam or winding fault."
      : currentStatus === "CRITICAL" && currentValue.includes("Zero")
        ? "Zero current: motor is not receiving power. Fault is in switching device, wiring, or breaker."
        : currentStatus === "CRITICAL"
          ? "Overcurrent: check for mechanical jam, wrong voltage, or motor winding fault."
          : "Current within normal range — electrical supply appears functional.",
    confidence: currentStatus !== "UNKNOWN" ? 68 : 0,
    nextCheck: "Measure current at MCC output with clamp meter during start attempt. Compare to nameplate FLA. Electrical work requires qualified personnel and site LOTO procedure.",
  });

  // ── Mechanical Free Rotation ──────────────────────────────────────────────
  let mechStatus: SignalStatus = "UNKNOWN";
  let mechValue = "Not checked";
  const mechChecked = has(checked, "free rotation","mechanical rotation","shaft rotation","hand rotation","manual rotation");
  const motorReplaced = has(changes, "motor replacement","motor replaced","new motor","replaced motor","motor change");

  if (mechChecked) {
    if (has(allText, "rotates freely","free rotation ok","shaft free","mechanical ok","rotates fine")) {
      mechStatus = "NORMAL"; mechValue = "Rotates freely (confirmed)";
    } else if (has(checked, "basic mechanical free rotation","basic rotation")) {
      mechStatus = "WARNING"; mechValue = "Basic check performed — not fully confirmed";
    } else {
      mechStatus = "WARNING"; mechValue = "Checked but result unclear";
    }
  } else if (motorReplaced) {
    mechStatus = "WARNING"; mechValue = "Motor replaced — full check recommended";
  } else if (has(sensor, "encoder","rotation","speed feedback")) {
    mechStatus = "UNKNOWN"; mechValue = "Not directly verified";
  }

  items.push({
    signalName: "Mechanical Free Rotation",
    signalNameFa: "چرخش آزاد مکانیکی",
    source: "Physical Field Check",
    observedValue: mechValue,
    expectedValue: "Motor shaft rotates freely by hand; coupling aligned; load rotates freely",
    status: mechStatus,
    diagnosticMeaning: mechStatus === "NORMAL"
      ? "Mechanical freedom confirmed. Mechanical jam or coupling issue is unlikely as a primary cause."
      : mechStatus === "WARNING"
        ? "Mechanical check noted but not fully confirmed. After motor replacement, verify coupling alignment, keyway, and that load side is free."
        : "Mechanical rotation not verified. After any motor replacement, this is mandatory before energizing.",
    confidence: mechStatus !== "UNKNOWN" ? 62 : 0,
    nextCheck: "LOTO procedure. Remove or disengage coupling. Rotate motor shaft by hand — should be smooth with no drag. Verify coupling bolts torqued to spec. Check coupling alignment.",
  });

  // ── Sensor / Feedback ─────────────────────────────────────────────────────
  if (sensor && sensor.length > 3 && !has(sensor,"unknown","n/a","not applicable")) {
    let sensorStatus: SignalStatus = "UNKNOWN";
    const sensorValue = sensor.slice(0, 80);

    if (has(sensor, "ok","normal","active","triggered","detected","working","good")) {
      sensorStatus = "NORMAL";
    } else if (has(sensor, "not active","not triggered","missing","failed","fault","no signal","open circuit")) {
      sensorStatus = "CRITICAL";
    } else if (has(sensor, "intermittent","unstable","noisy","floating")) {
      sensorStatus = "WARNING";
    }

    items.push({
      signalName: "Sensor / Feedback Signal",
      signalNameFa: "سیگنال سنسور / فیدبک",
      source: "Field Device / Sensor",
      observedValue: sensorValue,
      expectedValue: "Active and stable feedback matching machine state",
      status: sensorStatus,
      diagnosticMeaning: sensorStatus === "CRITICAL"
        ? "Feedback signal missing or failed. If PLC requires this feedback for permissive, motor will not start."
        : sensorStatus === "WARNING"
          ? "Intermittent or unstable feedback. Check sensor mounting, cable shielding, and power supply."
          : "Feedback appears normal.",
      confidence: sensorStatus !== "UNKNOWN" ? 65 : 0,
      nextCheck: "Check sensor LED indicator, supply voltage (10-30VDC), cable condition, and PLC input I-bit state in online monitor.",
    });
  }

  return items;
}

// ─── Uncertainty / Evidence Entropy ──────────────────────────────────────────

function computeUncertainty(matrix: SignalMatrixItem[]): UncertaintyResult {
  const unknownCount = matrix.filter(s => s.status === "UNKNOWN").length;
  const totalCritical = matrix.length;
  const ratio = unknownCount / Math.max(totalCritical, 1);

  let level: UncertaintyLevel;
  let explanation: string;
  let explanationFa: string;

  if (ratio <= 0.25 || unknownCount <= 1) {
    level = "LOW";
    explanation = "Most critical signals have been reported or measured. Diagnostic confidence is relatively high.";
    explanationFa = "اکثر سیگنال‌های حیاتی گزارش یا اندازه‌گیری شده‌اند. اطمینان تشخیصی نسبتاً بالاست.";
  } else if (ratio <= 0.55 || unknownCount <= 3) {
    level = "MEDIUM";
    explanation = "Several critical signals are missing or unconfirmed. Analysis confidence is reduced. Collect missing evidence before concluding.";
    explanationFa = "چندین سیگنال حیاتی مفقود یا تأیید‌نشده هستند. اطمینان تحلیل کاهش یافته. قبل از نتیجه‌گیری شواهد مفقود را جمع‌آوری کنید.";
  } else {
    level = "HIGH";
    explanation = "Many critical signals are unknown. Multiple causes remain equally plausible. Evidence-gathering is the first priority before any hardware intervention.";
    explanationFa = "تعداد زیادی از سیگنال‌های حیاتی نامشخص هستند. علل متعددی به یک اندازه محتمل هستند. جمع‌آوری شواهد اولویت اول است.";
  }

  const missingCriticalSignals = matrix
    .filter(s => s.status === "UNKNOWN")
    .map(s => s.signalName);
  const missingCriticalSignalsFa = matrix
    .filter(s => s.status === "UNKNOWN")
    .map(s => s.signalNameFa);

  const conflictingSignals: string[] = [];
  // Detect common conflict: HMI says run but PLC output not active
  const hmi = matrix.find(s => s.signalName === "HMI Run Command");
  const plcOut = matrix.find(s => s.signalName.includes("PLC Output"));
  if (hmi?.status === "NORMAL" && plcOut?.status === "CRITICAL") {
    conflictingSignals.push("HMI Run Command is ACTIVE but PLC Output Command is NOT ACTIVE — gap in command chain");
  }
  const plcFault = matrix.find(s => s.signalName === "PLC Fault Register");
  if (plcFault?.status === "NORMAL" && plcOut?.status === "UNKNOWN") {
    conflictingSignals.push("No PLC alarm present but PLC output command state unknown — 'no alarm' ≠ 'output active'");
  }

  const recommendedEvidenceToReduceUncertainty: string[] = [];
  if (missingCriticalSignals.some(s => s.includes("PLC Output"))) {
    recommendedEvidenceToReduceUncertainty.push("Check PLC output Q-bit state in online monitor (go PLC online → Watch Table → output addresses)");
  }
  if (missingCriticalSignals.some(s => s.includes("VFD") || s.includes("MCC"))) {
    recommendedEvidenceToReduceUncertainty.push("Check VFD keypad / contactor auxiliary contact state / MCC breaker status");
  }
  if (missingCriticalSignals.some(s => s.includes("Overload"))) {
    recommendedEvidenceToReduceUncertainty.push("Check overload relay indicator lamp and rated current setting vs motor nameplate FLA");
  }
  if (missingCriticalSignals.some(s => s.includes("Safety") || s.includes("Permissive"))) {
    recommendedEvidenceToReduceUncertainty.push("Monitor all permissive inputs in PLC online — check each interlock I-bit");
  }
  if (missingCriticalSignals.some(s => s.includes("Motor Current"))) {
    recommendedEvidenceToReduceUncertainty.push("Measure motor current at MCC output terminals with clamp meter during start attempt (qualified electrician, LOTO)");
  }
  if (missingCriticalSignals.some(s => s.includes("Mechanical"))) {
    recommendedEvidenceToReduceUncertainty.push("LOTO, decouple load, rotate motor shaft by hand to verify mechanical freedom");
  }
  if (recommendedEvidenceToReduceUncertainty.length === 0) {
    recommendedEvidenceToReduceUncertainty.push("Confirm all signal states before hardware intervention");
  }

  return {
    level, explanation, explanationFa,
    missingCriticalSignals, missingCriticalSignalsFa,
    conflictingSignals,
    recommendedEvidenceToReduceUncertainty,
  };
}

// ─── Risk scoring ─────────────────────────────────────────────────────────────

function computeRisk(input: IndustrialFaultInput, domain: IndustrialDomain, severity: Severity): RiskResult {
  const prod = (input.productionImpact ?? "").toUpperCase();
  const safe = (input.safetyImpact ?? "").toUpperCase();
  const allText = gatherAllText(input);

  const hasProductionStop = has(allText,"not start","not running","stopped","production stop","line down","conveyor stopped");
  const hasSafetyConcern = has(allText,"safety","hazard","injury","fire","explosion","toxic","electrical shock","arc flash");

  const prodImpact = prod || (hasProductionStop ? "HIGH" : "MEDIUM");
  const safeImpact = safe || (hasSafetyConcern ? "HIGH" : "LOW");

  const urgencyLevel = (() => {
    if (safeImpact === "HIGH" || safeImpact === "CRITICAL") return "CRITICAL";
    if (prodImpact === "HIGH" || prodImpact === "CRITICAL" || severity === "CRITICAL") return "HIGH";
    if (prodImpact === "MEDIUM" || severity === "HIGH") return "HIGH";
    return "MEDIUM";
  })() as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  const prodMap: Record<string, { en: string; fa: string }> = {
    NONE:     { en: "No production impact", fa: "بدون تأثیر بر تولید" },
    LOW:      { en: "Minor production impact", fa: "تأثیر جزئی بر تولید" },
    MEDIUM:   { en: "Significant production slowdown", fa: "کاهش قابل توجه تولید" },
    HIGH:     { en: "Production line stopped", fa: "خط تولید متوقف شده" },
    CRITICAL: { en: "Critical production loss — immediate escalation", fa: "توقف بحرانی تولید — تشدید فوری" },
  };
  const safeMap: Record<string, { en: string; fa: string }> = {
    NONE:     { en: "No safety concern identified", fa: "خطر ایمنی شناسایی نشد" },
    LOW:      { en: "Low safety concern — observe standard procedures", fa: "خطر ایمنی کم — رعایت رویه‌های استاندارد" },
    MEDIUM:   { en: "Safety procedures must be followed strictly", fa: "رویه‌های ایمنی باید کاملاً رعایت شوند" },
    HIGH:     { en: "High safety risk — qualified personnel only; LOTO required", fa: "ریسک ایمنی بالا — فقط پرسنل متخصص؛ LOTO الزامی" },
    CRITICAL: { en: "Critical safety hazard — stop work, escalate immediately", fa: "خطر ایمنی بحرانی — توقف فعالیت، تشدید فوری" },
  };

  const urgencyMap = {
    LOW:      { en: "Non-urgent — schedule maintenance", fa: "غیر فوری — برنامه‌ریزی نگهداری" },
    MEDIUM:   { en: "Moderate urgency — investigate within shift", fa: "فوریت متوسط — بررسی در طول شیفت" },
    HIGH:     { en: "High urgency — mobilize maintenance team now", fa: "فوریت بالا — بسیج تیم نگهداری همین الان" },
    CRITICAL: { en: "Critical — immediate escalation to shift supervisor", fa: "بحرانی — تشدید فوری به سرپرست شیفت" },
  };

  const p = prodMap[prodImpact] ?? prodMap.MEDIUM;
  const s = safeMap[safeImpact] ?? safeMap.LOW;
  const u = urgencyMap[urgencyLevel];

  return {
    productionImpact: p.en, productionImpactFa: p.fa,
    safetyImpact: s.en, safetyImpactFa: s.fa,
    downtimeRisk: hasProductionStop
      ? "Unplanned downtime in progress — every minute of delay increases cost impact."
      : "Potential downtime if fault is not diagnosed promptly.",
    downtimeRiskFa: hasProductionStop
      ? "توقف برنامه‌ریزی‌نشده در جریان است — هر دقیقه تأخیر هزینه را افزایش می‌دهد."
      : "خطر توقف احتمالی در صورت عدم تشخیص به موقع.",
    urgency: u.en, urgencyFa: u.fa,
    urgencyLevel,
  };
}

// ─── Cause hypotheses ─────────────────────────────────────────────────────────

interface CauseTemplate {
  id: string;
  title: string;
  titleFa: string;
  triggerKeywords: string[];
  triggerDomains: IndustrialDomain[];
  explanation: string;
  explanationFa: string;
  suggestedCheck: string;
  suggestedCheckFa: string;
  baseConfidence: number;
  boostIf: string[][];  // arrays of terms — boost confidence if all terms in any sub-array present
  penaltyIf: string[]; // reduce confidence if these terms present
  missingEvidence: string[];
}

const CAUSE_TEMPLATES: CauseTemplate[] = [
  {
    id: "field-wiring",
    title: "Field Wiring or Motor Terminal Connection Issue",
    titleFa: "مشکل سیم‌بندی میدانی یا اتصال ترمینال موتور",
    triggerKeywords: ["motor","replacement","replaced","rewired","reconnected","terminal","cable"],
    triggerDomains: ["MOTOR","ELECTRICAL","MAINTENANCE"],
    explanation: "After motor replacement, incorrect terminal connection, loose terminal, wrong phase sequence, or damaged cable between MCC and motor can prevent starting even when PLC commands run.",
    explanationFa: "پس از تعویض موتور، اتصال نادرست ترمینال، ترمینال شل، توالی اشتباه فاز یا کابل آسیب‌دیده بین MCC و موتور می‌تواند از راه‌اندازی جلوگیری کند حتی اگر PLC فرمان اجرا بدهد.",
    suggestedCheck: "LOTO. Check motor terminal box: phase connections (U/V/W or T1/T2/T3), delta/star jumpers, terminal torque. Check cable from MCC to motor terminal box for continuity and insulation resistance.",
    suggestedCheckFa: "LOTO. بررسی جعبه ترمینال موتور: اتصالات فاز (U/V/W)، جامپرهای ستاره/مثلث، گشتاور ترمینال. بررسی کابل از MCC تا جعبه ترمینال موتور از نظر پیوستگی و مقاومت عایق.",
    baseConfidence: 65,
    boostIf: [["motor","replacement"],["motor","replaced"],["rewired"],["reconnected"],["terminal"],["new motor"]],
    penaltyIf: ["terminal ok","wiring ok","cable checked","continuity confirmed"],
    missingEvidence: ["Voltage at motor terminals (U/V/W)", "Motor terminal box connection verified", "Cable continuity test result"],
  },
  {
    id: "mcc-vfd-not-ready",
    title: "VFD / MCC / Contactor Not Ready or Faulted",
    titleFa: "VFD / MCC / کنتاکتور آماده نیست یا خرابی دارد",
    triggerKeywords: ["motor","contactor","vfd","mcc","drive","starter","inverter"],
    triggerDomains: ["MOTOR","VFD","ELECTRICAL"],
    explanation: "VFD internal fault, tripped MCC breaker, contactor coil failure, or missing run feedback from the field device prevents the motor from receiving the start signal even when PLC output is active.",
    explanationFa: "خرابی داخلی VFD، عمل‌کردن کلید MCC، خرابی بوبین کنتاکتور یا عدم دریافت فیدبک اجرا از دستگاه میدانی مانع از رسیدن سیگنال استارت به موتور می‌شود حتی وقتی خروجی PLC فعال است.",
    suggestedCheck: "Check VFD keypad display for fault codes. Check MCC breaker position and thermal trip indicator. Check contactor coil voltage and auxiliary contact feedback. Verify run feedback wiring to PLC.",
    suggestedCheckFa: "بررسی نمایشگر VFD برای کدهای خطا. بررسی وضعیت کلید MCC و نشانگر حرارتی. بررسی ولتاژ بوبین کنتاکتور و فیدبک کنتاکت کمکی. تأیید سیم‌بندی فیدبک اجرا به PLC.",
    baseConfidence: 70,
    boostIf: [["vfd"],["mcc"],["drive","fault"],["contactor"],["starter"]],
    penaltyIf: ["vfd ready","vfd ok","contactor ok","mcc breaker closed","no vfd fault"],
    missingEvidence: ["VFD keypad fault code", "MCC breaker position", "Contactor coil voltage", "Run feedback signal state"],
  },
  {
    id: "permissive-interlock",
    title: "Permissive or Interlock Chain Open",
    titleFa: "باز بودن زنجیره مجوز یا اینترلاک",
    triggerKeywords: ["permissive","interlock","guard","door","e-stop","estop","safety relay","safety","not start","no start"],
    triggerDomains: ["PLC","MOTOR","SENSOR"],
    explanation: "PLC program requires all permissives to be satisfied before issuing run command. If any permissive input (guard, temperature limit, pressure, upstream/downstream equipment status) is not fulfilled, the PLC will not command the output even with no active alarm.",
    explanationFa: "برنامه PLC نیاز دارد همه شرایط مجوز قبل از صدور فرمان اجرا برآورده شوند. اگر هر ورودی مجوز (گارد، محدودیت دما، فشار، وضعیت تجهیزات بالادست/پایین‌دست) برقرار نباشد، PLC حتی بدون آلارم فعال، خروجی را فرمان نمی‌دهد.",
    suggestedCheck: "Go PLC online. Navigate to the motor run rung. Check each enabling condition. Monitor all interlock input I-bits in real time. Identify which permissive input is not satisfied.",
    suggestedCheckFa: "PLC را آنلاین کنید. به رانگ اجرای موتور بروید. هر شرط فعال‌ساز را بررسی کنید. تمام بیت‌های ورودی اینترلاک را در زمان واقعی پایش کنید. تعیین کنید کدام ورودی مجوز برقرار نیست.",
    baseConfidence: 68,
    boostIf: [["permissive"],["interlock"],["guard"],["not start"],["plc no fault"]],
    penaltyIf: ["permissives clear","interlocks ok","all clear","safety satisfied"],
    missingEvidence: ["PLC run rung logic captured online", "Each permissive I-bit state", "Interlock wiring diagram"],
  },
  {
    id: "plc-output-not-reaching",
    title: "PLC Output Command Not Reaching Field Device",
    titleFa: "فرمان خروجی PLC به دستگاه میدانی نمی‌رسد",
    triggerKeywords: ["plc","output","wiring","field","terminal","control wiring"],
    triggerDomains: ["PLC","ELECTRICAL","MOTOR"],
    explanation: "Even when PLC program sets the output bit, the physical signal may not reach the field device due to blown output fuse, failed output card, wiring break in control cable, or interface relay failure.",
    explanationFa: "حتی وقتی برنامه PLC بیت خروجی را تنظیم می‌کند، سیگنال فیزیکی ممکن است به دلیل فیوز سوخته خروجی، کارت خروجی معیوب، قطع سیم در کابل کنترل یا خرابی رله واسط به دستگاه میدانی نرسد.",
    suggestedCheck: "Force PLC output bit ON (with safety approval). Measure voltage at output terminal block. Check output card LED indicator. Trace control cable to field device.",
    suggestedCheckFa: "خروجی PLC را با تأیید ایمنی Force کنید. ولتاژ در ترمینال بلوک خروجی را اندازه بگیرید. LED کارت خروجی را بررسی کنید. کابل کنترل را تا دستگاه میدانی ردیابی کنید.",
    baseConfidence: 58,
    boostIf: [["plc output","unknown"],["no field response"],["wiring break"]],
    penaltyIf: ["plc output active","output confirmed","field device confirmed receiving"],
    missingEvidence: ["PLC output Q-bit state (online monitor)", "Voltage at output terminal block", "Output fuse condition"],
  },
  {
    id: "motor-connection-phase-sequence",
    title: "Incorrect Motor Phase Sequence or Connection After Replacement",
    titleFa: "توالی فاز نادرست یا اتصال اشتباه موتور پس از تعویض",
    triggerKeywords: ["replacement","replaced","new motor","phase","rotation","direction","winding","delta","star","terminal"],
    triggerDomains: ["MOTOR","ELECTRICAL","MAINTENANCE"],
    explanation: "After motor replacement, wrong phase sequence (R-S-T reversed) or wrong winding connection (delta vs star jumper) can cause motor to not start, start backwards, or trip on overload immediately.",
    explanationFa: "پس از تعویض موتور، توالی فاز اشتباه (معکوس R-S-T) یا اتصال اشتباه سیم‌پیچ (جامپر مثلث در مقابل ستاره) می‌تواند باعث شود موتور راه‌اندازی نشود، معکوس شروع به کار کند، یا فوری روی اضافه‌بار عمل کند.",
    suggestedCheck: "Verify phase sequence at motor terminals matches original motor. Check delta/star jumper configuration matches nameplate. If rotation direction check is needed: jog motor momentarily and verify direction (mechanical release required first).",
    suggestedCheckFa: "تأیید توالی فاز در ترمینال موتور با موتور اصلی مطابقت دارد. بررسی پیکربندی جامپر مثلث/ستاره با پلاک نام‌گذاری مطابقت دارد. در صورت نیاز به بررسی جهت چرخش: موتور را لحظه‌ای Jog کنید.",
    baseConfidence: 60,
    boostIf: [["replacement"],["replaced"],["new motor"],["wrong rotation"],["reverse"]],
    penaltyIf: ["phase sequence confirmed","connection verified","rotation correct"],
    missingEvidence: ["Phase sequence measurement at motor terminals", "Nameplate data (voltage/connection type)", "Original motor terminal connection photo"],
  },
  {
    id: "mechanical-coupling-load",
    title: "Mechanical Coupling, Alignment, or Load Issue",
    titleFa: "مشکل کوپلینگ مکانیکی، تراز یا بار",
    triggerKeywords: ["coupling","alignment","mechanical","gearbox","load","conveyor","pump","replacement","replaced"],
    triggerDomains: ["MECHANICAL","MOTOR","MAINTENANCE"],
    explanation: "After motor replacement, coupling may be incorrectly installed, keyway may be damaged, or load may be jammed or seized. This can prevent motor from starting or cause immediate overload trip.",
    explanationFa: "پس از تعویض موتور، کوپلینگ ممکن است نادرست نصب شده، کی‌وی آسیب دیده، یا بار گیر کرده باشد. این می‌تواند مانع راه‌اندازی موتور شود یا باعث عمل فوری اضافه‌بار شود.",
    suggestedCheck: "LOTO. Disconnect coupling. Rotate load shaft by hand — should be free. Rotate motor shaft by hand — should be free. Re-check coupling alignment with dial gauge or laser aligner. Verify keyway and coupling bush are intact.",
    suggestedCheckFa: "LOTO. کوپلینگ را جدا کنید. شفت بار را با دست بچرخانید — باید آزاد باشد. شفت موتور را با دست بچرخانید — باید آزاد باشد. تراز کوپلینگ را با گیج یا تراز‌یاب لیزری مجدداً بررسی کنید. کی‌وی و بوش کوپلینگ را بررسی کنید.",
    baseConfidence: 55,
    boostIf: [["coupling"],["alignment","issue"],["alignment","motor replacement"],["jammed"],["seized"],["load stuck"]],
    penaltyIf: ["coupling ok","alignment ok","load free","mechanical ok"],
    missingEvidence: ["Load side rotation check (hand)", "Coupling condition inspection", "Alignment measurement"],
  },
  {
    id: "sensor-feedback-missing",
    title: "Missing or Failed Sensor / Feedback Signal",
    titleFa: "سیگنال سنسور یا فیدبک مفقود یا معیوب",
    triggerKeywords: ["sensor","encoder","proximity","feedback","limit switch","speed sensor","position"],
    triggerDomains: ["SENSOR","PLC","MOTOR"],
    explanation: "If PLC requires a run-confirm feedback (e.g., zero-speed sensor, encoder, run relay contact) before completing the start sequence, absence or failure of that signal will stop the start cycle.",
    explanationFa: "اگر PLC به یک فیدبک تأیید اجرا (مثل سنسور سرعت صفر، انکودر، کنتاکت رله اجرا) قبل از تکمیل توالی استارت نیاز داشته باشد، نبود یا خرابی آن سیگنال چرخه استارت را متوقف می‌کند.",
    suggestedCheck: "Monitor feedback signal I-bit in PLC online during start attempt. Check sensor power supply (10-30VDC for PNP sensors). Check sensor LED indicator and mounting distance. Check cable shielding and routing.",
    suggestedCheckFa: "بیت ورودی سیگنال فیدبک را در PLC آنلاین هنگام تلاش برای استارت پایش کنید. تغذیه سنسور را بررسی کنید. LED سنسور و فاصله نصب را بررسی کنید. شیلدینگ و مسیر کابل را بررسی کنید.",
    baseConfidence: 45,
    boostIf: [["sensor","not active"],["sensor","failed"],["encoder","fault"],["feedback","missing"]],
    penaltyIf: ["sensor ok","feedback confirmed","encoder working"],
    missingEvidence: ["Sensor I-bit state during start attempt", "Sensor supply voltage", "PLC run sequence logic around feedback requirements"],
  },
];

function generateCauses(
  input: IndustrialFaultInput,
  allText: string,
  domain: IndustrialDomain,
  matrix: SignalMatrixItem[],
): LikelyCause[] {
  const results: LikelyCause[] = [];

  for (const tmpl of CAUSE_TEMPLATES) {
    // Domain relevance
    const domainMatch = tmpl.triggerDomains.includes(domain) ||
      tmpl.triggerDomains.some(d => detectDomains(allText).slice(0,3).map(r=>r.domain).includes(d));

    // Keyword trigger
    const kwMatches = tmpl.triggerKeywords.filter(kw => allText.includes(kw.toLowerCase()));

    if (!domainMatch && kwMatches.length === 0) continue;

    let confidence = tmpl.baseConfidence;

    // Boosts
    for (const group of tmpl.boostIf) {
      if (group.every(term => allText.includes(term.toLowerCase()))) {
        confidence = Math.min(confidence + 15, 95);
        break;
      }
    }
    if (kwMatches.length >= 2) confidence = Math.min(confidence + 5, 95);
    if (domainMatch) confidence = Math.min(confidence + 5, 95);

    // Penalties
    for (const pen of tmpl.penaltyIf) {
      if (allText.includes(pen.toLowerCase())) {
        confidence = Math.max(confidence - 20, 5);
      }
    }

    // Signal matrix context
    const plcOut = matrix.find(s => s.signalName.includes("PLC Output"));
    const vfd = matrix.find(s => s.signalName.includes("VFD"));
    const overload = matrix.find(s => s.signalName.includes("Overload"));
    const safety = matrix.find(s => s.signalName.includes("Safety"));

    if (tmpl.id === "field-wiring" && plcOut?.status === "NORMAL") {
      confidence = Math.min(confidence + 15, 95);
    }
    if (tmpl.id === "mcc-vfd-not-ready" && vfd?.status === "CRITICAL") {
      confidence = Math.min(confidence + 20, 95);
    }
    if (tmpl.id === "mcc-vfd-not-ready" && vfd?.status === "UNKNOWN") {
      confidence = Math.min(confidence + 10, 90);
    }
    if (tmpl.id === "permissive-interlock" && safety?.status === "UNKNOWN") {
      confidence = Math.min(confidence + 10, 90);
    }
    if (tmpl.id === "permissive-interlock" && safety?.status === "CRITICAL") {
      confidence = Math.min(confidence + 25, 95);
    }
    if (tmpl.id === "plc-output-not-reaching" && plcOut?.status === "UNKNOWN") {
      confidence = Math.min(confidence + 12, 88);
    }
    if (tmpl.id === "mcc-vfd-not-ready" && overload?.status === "CRITICAL") {
      confidence = Math.min(confidence + 20, 95);
    }

    // Build supporting evidence from matrix
    const supportingEvidence: string[] = [];
    const missingEvidence = [...tmpl.missingEvidence];

    if (tmpl.id === "field-wiring") {
      if (has(allText, "replacement","replaced","new motor")) supportingEvidence.push("Recent motor replacement increases risk of wiring error");
      if (plcOut?.status === "NORMAL") supportingEvidence.push("PLC output command active → fault is in field, not control");
      if (!has(allText, "terminal checked","wiring verified","cable tested")) missingEvidence.push("Motor terminal box visual inspection not confirmed");
    }
    if (tmpl.id === "mcc-vfd-not-ready") {
      if (vfd?.status === "UNKNOWN") supportingEvidence.push("VFD/MCC status not reported — cannot rule out fault");
      if (vfd?.status === "CRITICAL") supportingEvidence.push("VFD/MCC status confirmed as faulted/not ready");
      if (overload?.status === "CRITICAL") supportingEvidence.push("Overload relay is tripped");
    }
    if (tmpl.id === "permissive-interlock") {
      if (safety?.status === "UNKNOWN") supportingEvidence.push("Permissive chain not confirmed — cannot rule out open interlock");
      if (has(allText, "no active alarm","no alarm")) supportingEvidence.push("No PLC alarm present, consistent with permissive-block scenario (no alarm raised for permissive chain)");
    }
    if (tmpl.id === "plc-output-not-reaching") {
      if (plcOut?.status === "UNKNOWN") supportingEvidence.push("PLC output command state not confirmed in field");
    }
    if (tmpl.id === "motor-connection-phase-sequence") {
      if (has(allText, "replacement","replaced")) supportingEvidence.push("Motor was recently replaced — reconnection error is plausible");
    }
    if (tmpl.id === "mechanical-coupling-load") {
      if (has(allText, "alignment")) supportingEvidence.push("Mechanical alignment work was performed — recheck coupling");
      const mechSig = matrix.find(s => s.signalName.includes("Mechanical"));
      if (mechSig?.status === "WARNING") supportingEvidence.push("Mechanical free rotation only 'basically' checked — not fully confirmed");
    }

    if (supportingEvidence.length === 0) {
      supportingEvidence.push("Domain and keyword pattern match");
    }

    results.push({
      id: tmpl.id,
      title: tmpl.title,
      titleFa: tmpl.titleFa,
      explanation: tmpl.explanation,
      explanationFa: tmpl.explanationFa,
      supportingEvidence,
      missingEvidence,
      confidence,
      suggestedCheck: tmpl.suggestedCheck,
      suggestedCheckFa: tmpl.suggestedCheckFa,
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}

// ─── Reasoning Map ────────────────────────────────────────────────────────────

function buildReasoningMap(
  causes: LikelyCause[],
  matrix: SignalMatrixItem[],
): ReasoningMap {
  const evidenceNodes: EvidenceNode[] = matrix.map((s, i) => ({
    id: `ev-${i}`,
    label: s.signalName,
    labelFa: s.signalNameFa,
    type: s.status === "UNKNOWN" ? "ABSENT"
      : s.status === "CRITICAL" ? "CONFLICTING"
      : "PRESENT",
    value: `${s.observedValue} (${s.status})`,
  }));

  const causeNodes: CauseNode[] = causes.slice(0, 5).map((c, i) => ({
    id: `cause-${i}`,
    label: c.title,
    labelFa: c.titleFa,
    confidence: c.confidence,
    supportedBy: c.supportingEvidence.slice(0, 2),
  }));

  const riskNodes: RiskNode[] = [
    {
      id: "risk-prod",
      label: "Production Downtime",
      labelFa: "توقف تولید",
      level: "HIGH",
    },
    {
      id: "risk-electrical",
      label: "Electrical / Mechanical Hazard",
      labelFa: "خطر برقی / مکانیکی",
      level: "MEDIUM",
    },
    {
      id: "risk-repeat",
      label: "Repeat Fault Risk",
      labelFa: "خطر تکرار خرابی",
      level: "MEDIUM",
    },
  ];

  const actionNodes: ActionNode[] = [
    { id: "act-1", label: "Gather missing signal evidence", labelFa: "جمع‌آوری شواهد سیگنال مفقود", priority: "IMMEDIATE" },
    { id: "act-2", label: "Check PLC output command state online", labelFa: "بررسی وضعیت فرمان خروجی PLC آنلاین", priority: "IMMEDIATE" },
    { id: "act-3", label: "Inspect field wiring and VFD/MCC", labelFa: "بازرسی سیم‌بندی میدانی و VFD/MCC", priority: "NEXT" },
    { id: "act-4", label: "LOTO — mechanical coupling inspection", labelFa: "LOTO — بازرسی کوپلینگ مکانیکی", priority: "NEXT" },
    { id: "act-5", label: "Escalate to instrumentation/electrical engineer", labelFa: "تشدید به مهندس ابزار دقیق/برق", priority: "ESCALATE" },
  ];

  return { evidenceNodes, causeNodes, riskNodes, actionNodes };
}

// ─── Evidence gaps ────────────────────────────────────────────────────────────

function computeEvidenceGaps(matrix: SignalMatrixItem[]): EvidenceGap[] {
  return matrix
    .filter(s => s.status === "UNKNOWN")
    .map(s => ({
      signal: s.signalName,
      signalFa: s.signalNameFa,
      reason: `${s.signalName} state was not reported in the fault submission.`,
      impact: `Without this signal, the diagnosis cannot confirm or rule out ${s.diagnosticMeaning.slice(0, 80)}...`,
    }));
}

// ─── Inspection checklist ─────────────────────────────────────────────────────

function generateChecklist(domain: IndustrialDomain): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let id = 0;
  const add = (text: string, textFa: string, cat: string, catFa: string, qp = false) => {
    items.push({ id: `chk-${++id}`, text, textFa, category: cat, categoryFa: catFa, requiresQualifiedPersonnel: qp });
  };

  // Safety first — always
  add("Follow site LOTO (Lockout/Tagout) procedure before any physical inspection.", "قبل از هر بازرسی فیزیکی، رویه LOTO سایت را اجرا کنید.", "Safety First", "ایمنی اول", true);
  add("Verify equipment is de-energized and mechanically stopped before touching.", "قبل از لمس، اطمینان حاصل کنید تجهیزات برق‌گیری شده و متوقف هستند.", "Safety First", "ایمنی اول", true);
  add("Do not bypass, disable, or jumper any safety interlock or E-stop circuit.", "هیچ اینترلاک ایمنی یا مدار توقف اضطراری را دور نزنید، غیرفعال نکنید یا جامپر نزنید.", "Safety First", "ایمنی اول", true);

  // Control system checks
  add("Go online to PLC and navigate to the motor run output rung.", "PLC را آنلاین کنید و به رانگ خروجی اجرای موتور بروید.", "PLC / Control", "PLC / کنترل", false);
  add("Monitor the motor run output Q-bit state during a start attempt.", "بیت خروجی اجرای موتور را حین تلاش برای استارت پایش کنید.", "PLC / Control", "PLC / کنترل", false);
  add("Check all permissive/interlock input I-bits in online monitor — identify any false/open.", "تمام بیت‌های ورودی مجوز/اینترلاک را در مانیتور آنلاین بررسی کنید — هر false/open را شناسایی کنید.", "PLC / Control", "PLC / کنترل", false);
  add("Confirm HMI run command is active on correct operator screen and mode (AUTO/MANUAL).", "تأیید فرمان اجرای HMI در صفحه اپراتور و حالت صحیح (AUTO/MANUAL) فعال است.", "HMI Check", "بررسی HMI", false);

  // Field device checks
  add("Check VFD keypad display: note any fault codes. Do not clear fault without noting the code.", "نمایشگر VFD را بررسی کنید: کدهای خطا را یادداشت کنید. بدون یادداشت کد، خطا را پاک نکنید.", "VFD / MCC", "VFD / MCC", false);
  add("Check MCC breaker position (ON/OFF/TRIP) and thermal trip indicator lamp.", "وضعیت کلید MCC (ON/OFF/TRIP) و لامپ نشانگر قطع حرارتی را بررسی کنید.", "VFD / MCC", "VFD / MCC", false);
  add("Check overload relay indicator — if tripped (yellow lamp), note before resetting.", "نشانگر رله اضافه‌بار را بررسی کنید — اگر عمل کرده (لامپ زرد)، قبل از ریست یادداشت کنید.", "VFD / MCC", "VFD / MCC", false);
  add("Verify contactor coil energizes when PLC commands run (listen for click / check LED).", "تأیید بوبین کنتاکتور هنگام فرمان PLC تحریک می‌شود (صدای کلیک / بررسی LED).", "VFD / MCC", "VFD / MCC", true);

  // Electrical checks
  add("After LOTO: Inspect motor terminal box — verify U/V/W connections, delta/star jumper, and terminal torque.", "پس از LOTO: جعبه ترمینال موتور را بازرسی کنید — اتصالات U/V/W، جامپر مثلث/ستاره و گشتاور ترمینال.", "Electrical", "برق", true);
  add("After LOTO: Test cable continuity and insulation resistance (>1 MΩ) from MCC to motor terminal.", "پس از LOTO: پیوستگی کابل و مقاومت عایق (بیش از 1 مگا اهم) از MCC تا ترمینال موتور را آزمایش کنید.", "Electrical", "برق", true);
  if (domain === "VFD") {
    add("Check VFD parameter settings: motor nameplate FLA, rated speed, acceleration/deceleration ramp times.", "پارامترهای VFD را بررسی کنید: جریان نامی موتور، سرعت نامی، زمان‌های شتاب/کاهش سرعت.", "VFD / MCC", "VFD / MCC", false);
  }

  // Mechanical checks
  add("After LOTO + mechanical isolation: Rotate motor shaft by hand — should be smooth and free.", "پس از LOTO + ایزولاسیون مکانیکی: شفت موتور را با دست بچرخانید — باید روان و آزاد باشد.", "Mechanical", "مکانیک", true);
  add("Verify coupling: correct installation, bolts torqued to specification, coupling inserts intact.", "کوپلینگ را تأیید کنید: نصب صحیح، پیچ‌ها با گشتاور مشخص، المان‌های کوپلینگ سالم.", "Mechanical", "مکانیک", true);
  if (domain === "MOTOR" || domain === "MECHANICAL") {
    add("Check load side for jam or mechanical seizure — rotate by hand if safely possible.", "بار را از نظر گیر کردن یا قفل مکانیکی بررسی کنید — در صورت امکان ایمن، با دست بچرخانید.", "Mechanical", "مکانیک", true);
  }

  // Data to collect
  add("Document current nameplate data (FLA, voltage, connection type, IP rating) for the replacement motor.", "داده‌های پلاک موتور جایگزین را مستند کنید (FLA، ولتاژ، نوع اتصال، IP).", "Data Collection", "جمع‌آوری داده", false);
  add("Save screenshot of PLC diagnostics page and online monitor during start attempt.", "تصویر صفحه صفحه دیاگنوستیک PLC و مانیتور آنلاین را حین تلاش برای استارت ذخیره کنید.", "Data Collection", "جمع‌آوری داده", false);

  return items;
}

// ─── Recommended actions ──────────────────────────────────────────────────────

function generateActions(): ActionGroup[] {

  return [
    {
      category: "Immediate Safe Checks (No hardware contact)",
      categoryFa: "بررسی‌های فوری ایمن (بدون تماس با سخت‌افزار)",
      icon: "⚡",
      items: [
        { en: "Go PLC online — check motor run Q-bit state and all permissive I-bits", fa: "PLC را آنلاین کنید — وضعیت بیت Q اجرا و تمام بیت‌های I مجوز را بررسی کنید" },
        { en: "Check HMI operator screen — confirm run command active and correct operating mode", fa: "صفحه اپراتور HMI را بررسی کنید — تأیید فرمان اجرا فعال و حالت عملیاتی صحیح است" },
        { en: "Read VFD keypad display — note any fault codes without clearing", fa: "نمایشگر VFD را بخوانید — کدهای خطا را بدون پاک کردن یادداشت کنید" },
        { en: "Check MCC breaker position and overload relay indicator", fa: "وضعیت کلید MCC و نشانگر رله اضافه‌بار را بررسی کنید" },
      ],
    },
    {
      category: "Electrical / Control Diagnostics",
      categoryFa: "دیاگنوستیک برق / کنترل",
      icon: "🔧",
      items: [
        { en: "Qualified electrician: apply LOTO, verify absence of voltage at motor terminals", fa: "برقکار متخصص: LOTO اجرا کنید، عدم وجود ولتاژ در ترمینال موتور را تأیید کنید" },
        { en: "Inspect motor terminal box — verify U/V/W connections, delta/star jumper, terminal tightness", fa: "جعبه ترمینال موتور را بازرسی کنید — اتصالات U/V/W، جامپر مثلث/ستاره و سفتی ترمینال" },
        { en: "Measure cable insulation resistance (>1 MΩ) from MCC output to motor terminals", fa: "مقاومت عایق کابل (بیش از 1 مگا اهم) از خروجی MCC تا ترمینال موتور را اندازه بگیرید" },
        { en: "Verify overload relay is set to motor nameplate FLA (±5%)", fa: "تأیید رله اضافه‌بار روی FLA پلاک موتور تنظیم شده است (±5%)" },
      ],
    },
    {
      category: "PLC / HMI Diagnostics",
      categoryFa: "دیاگنوستیک PLC / HMI",
      icon: "💻",
      items: [
        { en: "Navigate to motor run rung in PLC online — verify all enabling conditions are TRUE", fa: "در PLC آنلاین به رانگ اجرای موتور بروید — تأیید همه شرایط فعال‌ساز TRUE هستند" },
        { en: "Use force/monitor table to check output Q-bit state during start attempt", fa: "از جدول force/monitor برای بررسی وضعیت بیت Q خروجی هنگام تلاش برای استارت استفاده کنید" },
        { en: "Capture PLC diagnostics log and alarm history since motor replacement date", fa: "لاگ دیاگنوستیک PLC و تاریخچه آلارم از تاریخ تعویض موتور را ضبط کنید" },
        { en: "Verify PLC program has correct motor parameters if soft-start or VFD-controlled", fa: "تأیید برنامه PLC پارامترهای صحیح موتور را دارد اگر با soft-start یا VFD کنترل می‌شود" },
      ],
    },
    {
      category: "Mechanical / Field Checks",
      categoryFa: "بررسی‌های مکانیکی / میدانی",
      icon: "⚙️",
      items: [
        { en: "LOTO + mechanical isolation: rotate motor shaft by hand — verify smooth, free rotation", fa: "LOTO + ایزولاسیون مکانیکی: شفت موتور را با دست بچرخانید — چرخش روان و آزاد را تأیید کنید" },
        { en: "Inspect coupling: correct half-coupling match, keyway intact, bolts torqued to spec", fa: "کوپلینگ را بازرسی کنید: تطابق نیمه کوپلینگ، کی‌وی سالم، پیچ‌ها با گشتاور مشخص" },
        { en: "Rotate load side by hand if possible — identify any jam or resistance", fa: "در صورت امکان بار را با دست بچرخانید — هرگونه گیر کردن یا مقاومت را شناسایی کنید" },
        { en: "Verify coupling alignment within OEM tolerances (angular and parallel)", fa: "تراز کوپلینگ را در محدوده تلرانس OEM تأیید کنید (زاویه‌ای و موازی)" },
      ],
    },
    {
      category: "Data to Collect Before Escalation",
      categoryFa: "داده‌های مورد نیاز قبل از تشدید",
      icon: "📋",
      items: [
        { en: "Motor nameplate photo: FLA, voltage, power, speed, connection type, IP, efficiency class", fa: "عکس پلاک موتور: FLA، ولتاژ، توان، سرعت، نوع اتصال، IP، کلاس بازده" },
        { en: "VFD fault code (if any) and current parameter list (P0304 motor rated voltage, P0305 FLA, etc.)", fa: "کد خطای VFD (در صورت وجود) و فهرست پارامترهای فعلی" },
        { en: "PLC online screenshot: output rung state and all permissive input states", fa: "اسکرین‌شات آنلاین PLC: وضعیت رانگ خروجی و تمام وضعیت‌های ورودی مجوز" },
        { en: "Photo of motor terminal box showing current wiring", fa: "عکس جعبه ترمینال موتور که سیم‌بندی فعلی را نشان می‌دهد" },
      ],
    },
    {
      category: "Escalation Path",
      categoryFa: "مسیر تشدید",
      icon: "🚨",
      items: [
        { en: "Escalate to instrumentation/electrical engineer if PLC output Q-bit confirmed active but motor still does not start", fa: "در صورت تأیید فعال بودن Q-bit خروجی PLC اما عدم راه‌اندازی موتور، موضوع را به مهندس ابزار دقیق/برق ارجاع دهید" },
        { en: "Escalate to mechanical engineer if coupling/alignment issue suspected", fa: "در صورت مشکوک بودن به مشکل کوپلینگ/تراز، موضوع را به مهندس مکانیک ارجاع دهید" },
        { en: "Contact motor OEM if motor winding/insulation issue suspected after terminal check", fa: "در صورت مشکوک بودن به مشکل سیم‌پیچ/عایق موتور پس از بررسی ترمینال، با OEM موتور تماس بگیرید" },
        { en: "Notify shift supervisor of downtime impact and timeline", fa: "اطلاع به سرپرست شیفت درباره تأثیر و جدول زمانی توقف" },
      ],
    },
  ];
}

// ─── Related knowledge ────────────────────────────────────────────────────────

function findRelatedKnowledge(allText: string, domains: { domain: IndustrialDomain; score: number }[]): RelatedKnowledge[] {
  try {
    const domainMap: Record<IndustrialDomain, BrainDomainId> = {
      MOTOR: "motors", VFD: "drives", PLC: "plc", SCADA: "scada",
      HMI: "hmi", SENSOR: "sensors", NETWORK: "otNetwork",
      ELECTRICAL: "electrical", MECHANICAL: "maintenance", MAINTENANCE: "maintenance", UNKNOWN: "maintenance",
    };

    const brainDomains = domains.slice(0, 3)
      .map(d => domainMap[d.domain])
      .filter((d): d is BrainDomainId => Boolean(d));

    const matches = matchCases(allText, brainDomains, [] as VendorId[], 5, CASES);
    return matches
      .filter(m => m.score >= 1)
      .slice(0, 4)
      .map(m => ({
        id: m.case.id,
        title: m.case.en.rootCause.slice(0, 80) || m.case.id,
        type: "CASE" as const,
        relevanceScore: Math.min(Math.round((m.score / 10) * 100), 95),
        summary: m.case.en.symptoms.slice(0, 120),
        domain: m.case.category,
      }));
  } catch {
    return [];
  }
}

// ─── Classification ───────────────────────────────────────────────────────────

function classify(
  domains: { domain: IndustrialDomain; score: number }[],
  allText: string,
  input: IndustrialFaultInput,
): ClassificationResult {
  const primary = domains[0]?.domain ?? "UNKNOWN";
  const secondary = domains.slice(1, 4).map(d => d.domain);
  const domainConf = Math.min(65 + (domains[0]?.score ?? 0) * 2, 92);

  const hasProductionStop = has(allText, "not start","stopped","line down","does not run","not running","not rotate");
  const hasSafety = has(allText, "safety","hazard","injury","fire","explosion","arc flash");

  let severity: Severity = "MEDIUM";
  if (hasSafety || (input.safetyImpact ?? "").toUpperCase() === "HIGH") severity = "CRITICAL";
  else if (hasProductionStop || (input.productionImpact ?? "").toUpperCase() === "HIGH") severity = "HIGH";
  else if ((input.productionImpact ?? "").toUpperCase() === "LOW") severity = "LOW";

  return {
    domain: primary,
    domainFa: DOMAIN_FA[primary],
    secondaryDomains: secondary,
    severity,
    confidence: domainConf,
  };
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function buildSummary(
  input: IndustrialFaultInput,
  classification: ClassificationResult,
  uncertainty: UncertaintyResult,
  causes: LikelyCause[],
): { en: string; fa: string } {
  const topCause = causes[0];
  const asset = input.assetType || "the reported equipment";
  const assetFa = input.assetType || "تجهیز گزارش‌شده";
  const title = input.problemTitle || "reported fault";
  const titleFa = input.problemTitle || "خرابی گزارش‌شده";

  const en = `Hermes Industrial Brain has analyzed the ${title} on ${asset}. ` +
    `Primary domain classification: ${classification.domain} (confidence ${classification.confidence}%). ` +
    `Evidence entropy is ${uncertainty.level} — ` +
    (uncertainty.level === "HIGH"
      ? `${uncertainty.missingCriticalSignals.length} critical signals are missing. Gather field evidence before hardware intervention. `
      : uncertainty.level === "MEDIUM"
        ? `${uncertainty.missingCriticalSignals.length} signals unconfirmed. Prioritize evidence collection. `
        : "Most signals confirmed. Focus on top-ranked causes. ") +
    (topCause ? `Highest-confidence hypothesis: ${topCause.title} (${topCause.confidence}% confidence). ` : "") +
    "All recommendations follow site safety procedures. Qualified personnel required for electrical/mechanical inspection.";

  const fa = `مغز صنعتی هرمس ${titleFa} روی ${assetFa} را تحلیل کرد. ` +
    `طبقه‌بندی حوزه اصلی: ${classification.domainFa}. ` +
    `آنتروپی شواهد: ${uncertainty.level} — ` +
    (uncertainty.level === "HIGH"
      ? `${uncertainty.missingCriticalSignals.length} سیگنال حیاتی مفقود. قبل از مداخله سخت‌افزاری شواهد میدانی را جمع‌آوری کنید. `
      : uncertainty.level === "MEDIUM"
        ? `${uncertainty.missingCriticalSignals.length} سیگنال تأیید نشده. جمع‌آوری شواهد را اولویت‌بندی کنید. `
        : "اکثر سیگنال‌ها تأیید شده. روی علل رتبه‌بالا تمرکز کنید. ") +
    (topCause ? `فرضیه با بالاترین اطمینان: ${topCause.titleFa} (${topCause.confidence}٪ اطمینان). ` : "") +
    "تمام توصیه‌ها از رویه‌های ایمنی سایت پیروی می‌کنند. پرسنل متخصص برای بازرسی برقی/مکانیکی الزامی است.";

  return { en, fa };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function analyzeIndustrialFault(input: IndustrialFaultInput): IndustrialBrainAnalysis {
  const t0 = Date.now();
  const allText = gatherAllText(input);
  const domains = detectDomains(allText);
  const classification = classify(domains, allText, input);

  const alarms = parseAlarms(input.activeAlarms ?? "");
  const signalMatrix = buildSignalMatrix(input, allText);
  const uncertainty = computeUncertainty(signalMatrix);
  const risk = computeRisk(input, classification.domain, classification.severity);
  const causes = generateCauses(input, allText, classification.domain, signalMatrix);
  const reasoningMap = buildReasoningMap(causes, signalMatrix);
  const evidenceGaps = computeEvidenceGaps(signalMatrix);
  const checklist = generateChecklist(classification.domain);
  const actions = generateActions();
  const relatedKnowledge = findRelatedKnowledge(allText, domains);
  const summary = buildSummary(input, classification, uncertainty, causes);

  // Overall confidence: weighted by uncertainty and top cause
  const topConfidence = causes[0]?.confidence ?? 50;
  const uncertaintyPenalty = uncertainty.level === "HIGH" ? 20 : uncertainty.level === "MEDIUM" ? 10 : 0;
  const confidence = Math.max(Math.round((classification.confidence + topConfidence) / 2 - uncertaintyPenalty), 20);

  return {
    summary: summary.en,
    summaryFa: summary.fa,
    classification,
    alarms,
    signalMatrix,
    reasoningMap,
    uncertainty,
    risk,
    likelyCauses: causes,
    evidenceGaps,
    inspectionChecklist: checklist,
    recommendedActions: actions,
    relatedKnowledge,
    confidence,
    engineVersion: "Hermes Industrial Brain V1 / Phase 80",
    processingMs: Date.now() - t0,
  };
}
