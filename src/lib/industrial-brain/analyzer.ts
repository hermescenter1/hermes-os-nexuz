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
  SENSOR:      ["sensor","encoder","proximity","limit switch","position sensor","speed sensor","temperature sensor","pressure sensor","level sensor","flow sensor","photoelectric","inductive","capacitive","ultrasonic","thermocouple","rtd","io module","24vdc","input mapping"],
  NETWORK:     ["network","ethernet","profibus","profinet","devicenet","modbus","can bus","io module","remote io","comm fault","communication timeout","network fault","switch","vlan","firewall","ip conflict","duplicate ip","packet loss","scan time","scada driver"],
  ELECTRICAL:  ["voltage","phase","wiring","terminal","fuse","breaker","cable","short circuit","ground fault","insulation","resistance","ohm","ampere","volt","neutral","earth","earthing"],
  MECHANICAL:  ["vibration","noise","alignment","balance","bearing","coupling","gearbox","seal","leak","wear","mechanical","breakage","lubrication","grease","temperature rising","overheating","cooling","vibration trend"],
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
  // Only mark this CRITICAL/OPEN when evidence explicitly describes an open interlock,
  // permissive, or E-stop condition. A bare word like "active" is ambiguous (in relay/PLC
  // terminology an "active" permissive commonly means satisfied) and must not by itself
  // flip this to CRITICAL. Unconfirmed state stays UNKNOWN with an explicit "not confirmed" value.
  let safetyStatus: SignalStatus = "UNKNOWN";
  let safetyValue = "Not confirmed";
  if (has(interlock, "ok","clear","released","satisfied","all clear","normal")) {
    safetyStatus = "NORMAL"; safetyValue = "Clear / Satisfied";
  } else if (has(interlock, "open","not clear","interlock fault","permissive fault","interlock open","permissive open","missing","blocked","tripped")) {
    safetyStatus = "CRITICAL"; safetyValue = "Open / blocked permissive reported";
  } else if (has(sym + " " + allText, "e-stop active","estop active","emergency stop active","guard open","door open","interlock open","permissive open")) {
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
  const recentMechWork = has(changes, "motor replacement","motor replaced","new motor","replaced motor","motor change",
    "coupling maintenance","coupling work","coupling replaced","alignment work","pump coupling");

  if (mechChecked) {
    if (has(allText, "rotates freely","free rotation ok","shaft free","mechanical ok","rotates fine")) {
      mechStatus = "NORMAL"; mechValue = "Rotates freely (confirmed)";
    } else if (has(checked, "basic mechanical free rotation","basic rotation")) {
      mechStatus = "WARNING"; mechValue = "Basic check performed — not fully confirmed";
    } else {
      mechStatus = "WARNING"; mechValue = "Checked but result unclear";
    }
  } else if (recentMechWork) {
    mechStatus = "WARNING"; mechValue = "Recent mechanical work — full check recommended";
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
  const sensorRelevant = (sensor && sensor.length > 3 && !has(sensor,"unknown","n/a","not applicable")) ||
    has(allText, "sensor","feedback","proximity","limit switch","encoder","io module","24v","input mapping");

  if (sensorRelevant) {
    let sensorStatus: SignalStatus = "UNKNOWN";
    const sensorValue = sensor && sensor.length > 0 ? sensor.slice(0, 80) : "See symptom description";
    const sensorCombined = sensor + " " + sym;

    if (has(sensorCombined, "ok","normal","active","triggered","detected","working","good")) {
      sensorStatus = "NORMAL";
    } else if (has(sensorCombined, "not active","not triggered","missing","failed","fault","no signal","open circuit","does not receive","no feedback")) {
      sensorStatus = "CRITICAL";
    } else if (has(sensorCombined, "intermittent","unstable","noisy","floating")) {
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
        ? "Feedback signal missing or failed. If PLC requires this feedback for permissive, motor will not start. Do not assume the program is at fault — hardware and wiring must be ruled out first."
        : sensorStatus === "WARNING"
          ? "Intermittent or unstable feedback. Check sensor mounting, cable shielding, and power supply."
          : "Feedback appears normal.",
      confidence: sensorStatus !== "UNKNOWN" ? 65 : 0,
      nextCheck: "Check sensor LED indicator, supply voltage (10-30VDC), cable condition, and PLC input I-bit state in online monitor.",
    });

    // IO module channel health
    let ioStatus: SignalStatus = "UNKNOWN";
    let ioValue = "Not reported";
    if (has(allText, "io module fault","io module fail","module fault")) { ioStatus = "CRITICAL"; ioValue = "Possible IO module fault"; }
    else if (has(allText, "io module ok","module ok","io module checked")) { ioStatus = "NORMAL"; ioValue = "Checked — appears normal"; }
    items.push({
      signalName: "IO Module Health",
      signalNameFa: "سلامت ماژول IO",
      source: "PLC IO Rack",
      observedValue: ioValue,
      expectedValue: "Channel LED healthy, no module fault reported",
      status: ioStatus,
      diagnosticMeaning: ioStatus === "UNKNOWN"
        ? "IO module channel health not confirmed. A faulty input channel can silently drop a sensor signal even when the sensor itself and its wiring are healthy."
        : ioStatus === "CRITICAL"
          ? "IO module fault suspected — the sensor signal may never reach the PLC program regardless of field wiring."
          : "IO module appears healthy.",
      confidence: ioStatus !== "UNKNOWN" ? 66 : 0,
      nextCheck: "Check the IO module channel status LED and diagnostic word in the PLC. Swap to a known-good channel if a fault is suspected.",
    });

    // 24V DC sensor supply
    let supplyStatus: SignalStatus = "UNKNOWN";
    let supplyValue = "Not measured";
    if (has(allText, "24v ok","24vdc confirmed","supply confirmed","supply ok")) { supplyStatus = "NORMAL"; supplyValue = "Confirmed present"; }
    else if (has(allText, "24v missing","no 24v","supply missing","power missing")) { supplyStatus = "CRITICAL"; supplyValue = "Missing / absent"; }
    items.push({
      signalName: "24V DC Sensor Supply",
      signalNameFa: "تغذیه 24 ولت سنسور",
      source: "Field Power Supply",
      observedValue: supplyValue,
      expectedValue: "Stable 24VDC (±10%) at sensor terminal",
      status: supplyStatus,
      diagnosticMeaning: supplyStatus === "UNKNOWN"
        ? "Sensor supply voltage not measured. Many 'no feedback' cases after a sensor replacement are a missing or miswired 24V supply, not a program issue."
        : supplyStatus === "CRITICAL"
          ? "Sensor supply voltage confirmed missing — the sensor cannot operate without it."
          : "Sensor supply confirmed present.",
      confidence: supplyStatus !== "UNKNOWN" ? 70 : 0,
      nextCheck: "Measure 24VDC at the sensor connector with a multimeter. Check the fuse/breaker feeding the sensor supply rail.",
    });

    // PLC input address mapping
    let mappingStatus: SignalStatus = "UNKNOWN";
    let mappingValue = "Not reported";
    if (has(allText, "input mapping confirmed","address confirmed","tag confirmed","mapping verified")) { mappingStatus = "NORMAL"; mappingValue = "Verified"; }
    items.push({
      signalName: "PLC Input Address Mapping",
      signalNameFa: "نگاشت آدرس ورودی PLC",
      source: "PLC Program",
      observedValue: mappingValue,
      expectedValue: "Input tag/address matches the physical terminal used after sensor replacement",
      status: mappingStatus,
      diagnosticMeaning: mappingStatus === "UNKNOWN"
        ? "PLC input address/tag mapping not confirmed after sensor replacement. Rewiring to a different physical channel without updating the program mapping is a common cause of 'no feedback' after replacement."
        : "Input mapping confirmed correct.",
      confidence: mappingStatus !== "UNKNOWN" ? 60 : 0,
      nextCheck: "Go PLC online, monitor the exact input tag/address used by the program for this sensor, and confirm it corresponds to the physical terminal the sensor is wired to.",
    });

    // Mechanical position — physical confirmation
    let posStatus: SignalStatus = "UNKNOWN";
    let posValue = "Not reported";
    if (has(allText, "reaches position","physically reaches","position confirmed physically","physically present","physically in position")) { posStatus = "NORMAL"; posValue = "Physically confirmed in position"; }
    items.push({
      signalName: "Mechanical Position (Physical Confirmation)",
      signalNameFa: "موقعیت مکانیکی (تأیید فیزیکی)",
      source: "Visual / Manual Field Check",
      observedValue: posValue,
      expectedValue: "Physical position matches the expected sensing point",
      status: posStatus,
      diagnosticMeaning: posStatus === "NORMAL"
        ? "Physical position is confirmed correct — this isolates the fault to the sensing/signal chain rather than the mechanical motion itself."
        : "Physical position not independently confirmed by an observer at the machine.",
      confidence: posStatus !== "UNKNOWN" ? 58 : 0,
      nextCheck: "Have an observer confirm the physical position matches the expected sensing point while a second person monitors the PLC input in real time.",
    });
  }

  // ── Network / Communication (only when relevant) ──────────────────────────
  const networkRelevant = has(allText, "network","scada","switch","ethernet","profinet","communication","comm loss","packet loss","vlan","ip conflict","firewall");
  if (networkRelevant) {
    let commStatus: SignalStatus = "UNKNOWN";
    let commValue = "Not reported";
    if (has(allText, "communication loss","comm loss","communication timeout","intermittent communication","comm fault")) {
      commStatus = "WARNING"; commValue = "Intermittent communication loss reported";
    } else if (has(allText, "communication ok","comm stable","communication normal")) {
      commStatus = "NORMAL"; commValue = "Stable";
    }
    items.push({
      signalName: "SCADA–PLC Communication Link",
      signalNameFa: "لینک ارتباطی SCADA–PLC",
      source: "Network / Communication",
      observedValue: commValue,
      expectedValue: "Stable, continuous communication with no timeouts",
      status: commStatus,
      diagnosticMeaning: commStatus === "WARNING"
        ? "Intermittent communication loss reported. This can be caused by physical layer (switch/cable), IP/VLAN misconfiguration, or PLC/SCADA load issues."
        : "Communication link state not confirmed with timestamps or logs.",
      confidence: commStatus !== "UNKNOWN" ? 70 : 0,
      nextCheck: "Correlate SCADA communication loss timestamps with PLC diagnostics buffer and switch port logs.",
    });

    let switchStatus: SignalStatus = "UNKNOWN";
    let switchValue = "Not reported";
    if (has(allText, "switch replaced","new switch","replaced switch","switch replacement")) { switchStatus = "WARNING"; switchValue = "Recently replaced — configuration not fully verified"; }
    items.push({
      signalName: "Network Switch / Cable Health",
      signalNameFa: "سلامت سوییچ شبکه / کابل",
      source: "Network Infrastructure",
      observedValue: switchValue,
      expectedValue: "Correct port speed/duplex, no CRC errors, cable intact",
      status: switchStatus,
      diagnosticMeaning: switchStatus === "WARNING"
        ? "Switch was recently replaced — port configuration, VLAN assignment, or duplex settings may not match the original device."
        : "Switch/cable health not confirmed. Physical layer issues are a common root cause of intermittent industrial network faults.",
      confidence: switchStatus !== "UNKNOWN" ? 68 : 0,
      nextCheck: "Check switch port LEDs and error counters. Verify VLAN/port configuration matches the original switch. Test cable continuity.",
    });

    let ipStatus: SignalStatus = "UNKNOWN";
    let ipValue = "Not reported";
    if (has(allText, "ip conflict","duplicate ip")) { ipStatus = "CRITICAL"; ipValue = "Possible IP conflict reported"; }
    else if (has(allText, "ip confirmed","no ip conflict","static ip verified")) { ipStatus = "NORMAL"; ipValue = "Verified, no conflict"; }
    items.push({
      signalName: "IP Configuration / VLAN Assignment",
      signalNameFa: "پیکربندی IP / تخصیص VLAN",
      source: "Network Configuration",
      observedValue: ipValue,
      expectedValue: "Unique static IP, correct VLAN, no duplicate address",
      status: ipStatus,
      diagnosticMeaning: ipStatus === "CRITICAL"
        ? "IP conflict can cause intermittent, hard-to-reproduce communication drops."
        : "IP/VLAN configuration not confirmed after the network change.",
      confidence: ipStatus !== "UNKNOWN" ? 65 : 0,
      nextCheck: "Run a network scan to check for duplicate IP addresses. Confirm VLAN assignment for the PLC/SCADA devices.",
    });

    items.push({
      signalName: "PLC Scan Load / SCADA Driver Health",
      signalNameFa: "بار اسکن PLC / سلامت درایور SCADA",
      source: "PLC / SCADA Server",
      observedValue: "Not measured",
      expectedValue: "Scan time within normal range; SCADA driver polling without timeout errors",
      status: "UNKNOWN",
      diagnosticMeaning: "PLC scan time and SCADA communication driver load not measured. High scan load or an outdated driver can cause intermittent polling failures that mimic a network fault.",
      confidence: 0,
      nextCheck: "Check PLC scan time/CPU load trend. Review SCADA driver communication statistics and error/timeout counters.",
    });
  }

  // ── Vibration / Temperature Trend (only when relevant) ────────────────────
  const vibrationRelevant = has(allText, "vibration","temperature rising","bearing temperature","overheating","running hot","temperature increase");
  if (vibrationRelevant) {
    let vibStatus: SignalStatus = "UNKNOWN";
    let vibValue = "Not measured";
    if (has(allText, "vibration increase","increasing vibration","rising vibration","vibration high","high vibration")) {
      vibStatus = "WARNING"; vibValue = "Rising trend reported";
    } else if (has(allText, "vibration normal","vibration ok","vibration stable")) {
      vibStatus = "NORMAL"; vibValue = "Stable / within normal range";
    }
    items.push({
      signalName: "Vibration Trend",
      signalNameFa: "روند ارتعاش",
      source: "Vibration Sensor / Portable Meter",
      observedValue: vibValue,
      expectedValue: "Stable, within ISO 10816 velocity limits for equipment class",
      status: vibStatus,
      diagnosticMeaning: vibStatus === "WARNING"
        ? "A rising vibration trend without a PLC alarm is a classic early indicator of bearing wear, misalignment, or imbalance — mechanical degradation typically precedes an electrical fault code."
        : "Vibration trend not measured. A single reading is less informative than a trend over time.",
      confidence: vibStatus !== "UNKNOWN" ? 70 : 0,
      nextCheck: "Take a vibration reading (velocity mm/s RMS) and compare to the baseline/previous reading. Identify dominant frequency if possible (1x RPM = imbalance, 2x = misalignment).",
    });

    let tempStatus: SignalStatus = "UNKNOWN";
    let tempValue = "Not measured";
    if (has(allText, "temperature rising","running hot","overheating","temperature increase","hot bearing")) {
      tempStatus = "WARNING"; tempValue = "Slow rising trend reported";
    } else if (has(allText, "temperature normal","temperature stable","temperature ok")) {
      tempStatus = "NORMAL"; tempValue = "Stable / within normal range";
    }
    items.push({
      signalName: "Bearing / Housing Temperature",
      signalNameFa: "دمای یاتاقان / بدنه",
      source: "Thermal Sensor / Handheld IR",
      observedValue: tempValue,
      expectedValue: "Stable, within OEM bearing temperature limit",
      status: tempStatus,
      diagnosticMeaning: tempStatus === "WARNING"
        ? "Slow-rising temperature without an alarm suggests developing friction — lubrication degradation, bearing wear, or misalignment. The escalating trend increases failure risk even without an active PLC alarm."
        : "Temperature trend not confirmed. A one-time spot reading may miss a slow-developing trend.",
      confidence: tempStatus !== "UNKNOWN" ? 68 : 0,
      nextCheck: "Take a spot temperature reading at the bearing housing and compare to baseline. Check the last lubrication date and grease condition.",
    });

    let lubeStatus: SignalStatus = "UNKNOWN";
    let lubeValue = "Not reported";
    if (has(allText, "lubrication overdue","grease overdue","missed lubrication")) { lubeStatus = "WARNING"; lubeValue = "Possibly overdue"; }
    else if (has(allText, "lubrication ok","recently greased","lubrication up to date")) { lubeStatus = "NORMAL"; lubeValue = "Recently performed"; }
    items.push({
      signalName: "Lubrication Status",
      signalNameFa: "وضعیت روان‌کاری",
      source: "Maintenance Records",
      observedValue: lubeValue,
      expectedValue: "Lubrication performed per OEM schedule; correct grease type and quantity",
      status: lubeStatus,
      diagnosticMeaning: "Lubrication schedule and condition not fully confirmed. Under- or over-greasing is a common contributor to rising bearing temperature and vibration.",
      confidence: lubeStatus !== "UNKNOWN" ? 55 : 0,
      nextCheck: "Check the last lubrication date against the OEM schedule. Verify correct grease type and quantity was used.",
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
  if (missingCriticalSignals.some(s => s.includes("Communication") || s.includes("Switch"))) {
    recommendedEvidenceToReduceUncertainty.push("Check network switch logs and correlate communication loss timestamps with PLC/SCADA diagnostics");
  }
  if (missingCriticalSignals.some(s => s.includes("IP Configuration"))) {
    recommendedEvidenceToReduceUncertainty.push("Scan the network for duplicate IP addresses and confirm VLAN assignment");
  }
  if (missingCriticalSignals.some(s => s.includes("PLC Scan Load"))) {
    recommendedEvidenceToReduceUncertainty.push("Check PLC scan time/CPU load trend and SCADA driver communication statistics");
  }
  if (missingCriticalSignals.some(s => s.includes("Vibration") || s.includes("Temperature"))) {
    recommendedEvidenceToReduceUncertainty.push("Record a vibration and temperature trend reading and compare to baseline");
  }
  if (missingCriticalSignals.some(s => s.includes("Lubrication"))) {
    recommendedEvidenceToReduceUncertainty.push("Check lubrication schedule and last service date against OEM recommendation");
  }
  if (missingCriticalSignals.some(s => s.includes("IO Module") || s.includes("24V") || s.includes("Input Mapping"))) {
    recommendedEvidenceToReduceUncertainty.push("Measure 24VDC sensor supply, check IO module channel diagnostic LED, and confirm PLC input address mapping");
  }
  if (missingCriticalSignals.some(s => s.includes("Mechanical Position"))) {
    recommendedEvidenceToReduceUncertainty.push("Have an observer confirm physical position while a second person monitors the PLC input in real time");
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
  const validLevels = ["NONE","LOW","MEDIUM","HIGH","CRITICAL"];
  const productionImpactLevel = (validLevels.includes(prodImpact) ? prodImpact : "MEDIUM") as RiskResult["productionImpactLevel"];
  const safetyImpactLevel = (validLevels.includes(safeImpact) ? safeImpact : "LOW") as RiskResult["safetyImpactLevel"];

  return {
    productionImpact: p.en, productionImpactFa: p.fa, productionImpactLevel,
    safetyImpact: s.en, safetyImpactFa: s.fa, safetyImpactLevel,
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
    triggerKeywords: ["motor","replaced","rewired","reconnected","terminal","cable"],
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
    suggestedCheck: "Go PLC online. Navigate to the relevant run/output rung for this equipment. Check each enabling condition. Monitor all interlock input I-bits in real time. Identify which permissive input is not satisfied.",
    suggestedCheckFa: "PLC را آنلاین کنید. به رانگ اجرا/خروجی مربوط به این تجهیز بروید. هر شرط فعال‌ساز را بررسی کنید. تمام بیت‌های ورودی اینترلاک را در زمان واقعی پایش کنید. تعیین کنید کدام ورودی مجوز برقرار نیست.",
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
    triggerKeywords: ["replaced","new motor","phase","rotation","direction","winding","delta","star","terminal"],
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
    title: "Mechanical Coupling, Alignment, Bearing, or Load Issue",
    titleFa: "مشکل کوپلینگ مکانیکی، تراز، یاتاقان یا بار",
    triggerKeywords: ["coupling","alignment","mechanical","gearbox","load","conveyor","pump","replacement","replaced","bearing","friction"],
    triggerDomains: ["MECHANICAL","MOTOR","MAINTENANCE"],
    explanation: "After motor replacement or coupling maintenance, the coupling may be incorrectly installed, the keyway may be damaged, bearing friction may have increased, or the load may be jammed or seized. This can prevent starting, cause immediate overload trip, or produce intermittent stoppage under load.",
    explanationFa: "پس از تعویض موتور یا تعمیر کوپلینگ، کوپلینگ ممکن است نادرست نصب شده، کی‌وی آسیب دیده، اصطکاک یاتاقان افزایش یافته، یا بار گیر کرده باشد. این می‌تواند مانع راه‌اندازی شود، باعث عمل فوری اضافه‌بار شود، یا توقف متناوب تحت بار ایجاد کند.",
    suggestedCheck: "LOTO. Disconnect coupling. Rotate load shaft by hand — should be free. Rotate motor shaft by hand — should be free. Re-check coupling alignment with dial gauge or laser aligner. Verify keyway, coupling bush, and bearing condition (feel for excess friction/heat).",
    suggestedCheckFa: "LOTO. کوپلینگ را جدا کنید. شفت بار را با دست بچرخانید — باید آزاد باشد. شفت موتور را با دست بچرخانید — باید آزاد باشد. تراز کوپلینگ را با گیج یا تراز‌یاب لیزری مجدداً بررسی کنید. کی‌وی، بوش کوپلینگ و وضعیت یاتاقان را بررسی کنید (اصطکاک/گرمای اضافی).",
    baseConfidence: 55,
    boostIf: [["coupling"],["alignment","issue"],["alignment","motor replacement"],["jammed"],["seized"],["load stuck"],["bearing","friction"],["coupling maintenance"]],
    penaltyIf: ["coupling ok","alignment ok","load free","mechanical ok"],
    missingEvidence: ["Load side rotation check (hand)", "Coupling condition inspection", "Alignment measurement", "Bearing friction/heat check"],
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
  {
    id: "sensor-io-module-power",
    title: "IO Module, 24V Supply, or PLC Input Mapping Issue",
    titleFa: "مشکل ماژول IO، تغذیه 24 ولت یا نگاشت ورودی PLC",
    triggerKeywords: ["io module","input module","24v","power supply","plc input","mapping","address","channel","sensor replaced","sensor replacement"],
    triggerDomains: ["SENSOR","PLC","ELECTRICAL"],
    explanation: "Even if the sensor itself is functioning correctly, a faulty IO module channel, missing 24VDC supply, loose field wiring, or an incorrect PLC input address mapping can prevent the signal from being seen by the program — especially after a sensor replacement changed wiring or terminal position.",
    explanationFa: "حتی اگر خود سنسور به‌درستی کار کند، یک کانال ماژول IO معیوب، تغذیه 24 ولت مفقود، سیم‌بندی میدانی شل، یا نگاشت آدرس ورودی نادرست PLC می‌تواند مانع دیده‌شدن سیگنال توسط برنامه شود — به‌ویژه پس از تعویض سنسور که سیم‌بندی یا موقعیت ترمینال را تغییر داده است.",
    suggestedCheck: "Check 24VDC supply at the sensor and IO module terminals. Check the IO module channel status LED. Verify the PLC input tag/address mapping matches the physical channel used, especially after any recent sensor replacement.",
    suggestedCheckFa: "تغذیه 24 ولت را در ترمینال سنسور و ماژول IO بررسی کنید. LED وضعیت کانال ماژول IO را بررسی کنید. تأیید کنید نگاشت آدرس/تگ ورودی PLC با کانال فیزیکی مورد استفاده مطابقت دارد، به‌ویژه پس از هرگونه تعویض اخیر سنسور.",
    baseConfidence: 50,
    boostIf: [["io module"],["24v"],["input mapping"],["sensor","replaced"],["sensor replacement"]],
    penaltyIf: ["io module ok","24v confirmed","mapping verified"],
    missingEvidence: ["24VDC supply voltage measurement", "IO module channel diagnostic LED state", "PLC input address/tag mapping verification"],
  },
  {
    id: "vfd-parameter-mismatch",
    title: "VFD Parameter Mismatch or Nuisance Trip Setting",
    titleFa: "عدم تطابق پارامتر VFD یا تنظیم تریپ ناخواسته",
    triggerKeywords: ["vfd","overcurrent","overload","parameter","trip","current limit","nuisance"],
    triggerDomains: ["VFD","MOTOR","ELECTRICAL"],
    explanation: "VFD current limit, acceleration/deceleration ramp, or motor nameplate parameters that are misconfigured after maintenance work can cause nuisance overcurrent/overload trips under normal load, appearing as intermittent stoppage.",
    explanationFa: "پارامترهای محدودیت جریان، شتاب/کاهش سرعت یا پلاک موتور VFD که پس از کار تعمیراتی به‌درستی تنظیم نشده‌اند می‌توانند باعث تریپ ناخواسته اضافه‌جریان/اضافه‌بار تحت بار عادی شوند و به‌صورت توقف متناوب ظاهر شوند.",
    suggestedCheck: "Verify VFD parameters (current limit, accel/decel ramp, motor nameplate voltage/current/frequency) match the motor nameplate after any component change or maintenance.",
    suggestedCheckFa: "پارامترهای VFD (محدودیت جریان، شتاب/کاهش سرعت، ولتاژ/جریان/فرکانس پلاک موتور) را پس از هرگونه تغییر قطعه یا تعمیرات با پلاک موتور مطابقت دهید.",
    baseConfidence: 50,
    boostIf: [["vfd","overcurrent"],["parameter"],["nuisance trip"],["vfd","trip"]],
    penaltyIf: ["parameters verified","vfd parameters ok"],
    missingEvidence: ["VFD parameter list compared to motor nameplate", "Trip history / timestamp log", "Load current trend during trip"],
  },
  {
    id: "pump-process-blockage",
    title: "Process Blockage or Increased Load on Pump/Driven Equipment",
    titleFa: "انسداد فرآیند یا افزایش بار روی پمپ/تجهیز محرک",
    triggerKeywords: ["pump","blockage","blocked","clogg","strainer","valve closed","cavitation","process","intermittent"],
    triggerDomains: ["MOTOR","MECHANICAL"],
    explanation: "A partial blockage, closed/throttled valve, clogged strainer, or cavitation can intermittently increase load on the pump, causing current spikes and stoppage that look electrical but originate in the process.",
    explanationFa: "انسداد جزئی، شیر بسته/تنگ‌شده، صافی گرفته یا کاویتاسیون می‌تواند به‌صورت متناوب بار روی پمپ را افزایش دهد و باعث افزایش جریان و توقف شود که ظاهراً برقی به نظر می‌رسد اما منشأ آن فرآیند است.",
    suggestedCheck: "Check strainer/filter for blockage, valve positions, suction conditions, and process flow/pressure trend during fault events.",
    suggestedCheckFa: "صافی/فیلتر را از نظر انسداد، وضعیت شیرها، شرایط مکش و روند جریان/فشار فرآیند حین رویداد خطا بررسی کنید.",
    baseConfidence: 48,
    boostIf: [["blockage"],["blocked"],["clogg"],["cavitation"],["pump stops"],["intermittent","pump"]],
    penaltyIf: ["strainer clear","no blockage","process normal"],
    missingEvidence: ["Process flow/pressure trend at fault time", "Strainer/valve inspection result", "Suction pressure reading"],
  },
  {
    id: "cable-motor-insulation",
    title: "Motor Cable or Winding Insulation Degradation",
    titleFa: "افت عایق کابل موتور یا سیم‌پیچ",
    triggerKeywords: ["insulation","cable","winding","megger","ground fault","intermittent trip"],
    triggerDomains: ["ELECTRICAL","MOTOR","VFD"],
    explanation: "Degraded cable or motor winding insulation can cause intermittent ground faults or overcurrent trips, particularly if recent mechanical work disturbed cable routing near the coupling or terminal box.",
    explanationFa: "افت عایق کابل یا سیم‌پیچ موتور می‌تواند باعث اتصال زمین یا تریپ اضافه‌جریان متناوب شود، به‌ویژه اگر کار مکانیکی اخیر مسیر کابل نزدیک کوپلینگ یا جعبه ترمینال را مختل کرده باشد.",
    suggestedCheck: "Megger test motor cable and winding insulation resistance (qualified electrician, LOTO). Inspect cable for chafing or damage near recent mechanical work.",
    suggestedCheckFa: "تست مگر مقاومت عایق کابل و سیم‌پیچ موتور (برقکار متخصص، LOTO). کابل را از نظر سایش یا آسیب نزدیک کار مکانیکی اخیر بازرسی کنید.",
    baseConfidence: 45,
    boostIf: [["insulation"],["megger"],["ground fault"],["intermittent","trip"]],
    penaltyIf: ["insulation confirmed","megger passed","cable ok"],
    missingEvidence: ["Insulation resistance test (megger) result", "Cable visual inspection near recent work", "Ground fault history"],
  },
  {
    id: "network-switch-cable",
    title: "Network Switch or Cable Fault After Replacement",
    titleFa: "خرابی سوییچ شبکه یا کابل پس از تعویض",
    triggerKeywords: ["switch","network","cable","ethernet","profinet","communication","replaced switch","new switch"],
    triggerDomains: ["NETWORK","SCADA","PLC"],
    explanation: "A recently replaced network switch or cable can introduce port misconfiguration, duplex mismatch, a faulty port, or a damaged cable, causing intermittent communication loss and HMI freezes.",
    explanationFa: "سوییچ شبکه یا کابل تازه تعویض‌شده می‌تواند پیکربندی پورت نادرست، عدم تطابق دوپلکس، پورت معیوب یا کابل آسیب‌دیده ایجاد کند و باعث قطع ارتباط متناوب و فریز شدن HMI شود.",
    suggestedCheck: "Check switch port status/LEDs, cable continuity, duplex/speed settings, and swap the suspect cable/port. Review the switch replacement configuration against the original.",
    suggestedCheckFa: "وضعیت/LED پورت سوییچ، پیوستگی کابل، تنظیمات دوپلکس/سرعت را بررسی کنید و کابل/پورت مشکوک را تعویض کنید. پیکربندی سوییچ جدید را با سوییچ قبلی مقایسه کنید.",
    baseConfidence: 55,
    boostIf: [["switch","replaced"],["new switch"],["cable"],["duplex"]],
    penaltyIf: ["switch configuration verified","cable tested ok"],
    missingEvidence: ["Switch port diagnostic/log", "Cable test result", "Switch configuration compared to original device"],
  },
  {
    id: "ip-network-config",
    title: "IP Address Conflict or Network Configuration Issue",
    titleFa: "تداخل آدرس IP یا مشکل پیکربندی شبکه",
    triggerKeywords: ["ip conflict","ip address","subnet","vlan","duplicate ip","dhcp","static ip"],
    triggerDomains: ["NETWORK","SCADA","PLC"],
    explanation: "A duplicate IP address, wrong subnet/VLAN assignment, or DHCP/static IP conflict after a network change can cause intermittent communication drops that appear random.",
    explanationFa: "آدرس IP تکراری، تخصیص نادرست ساب‌نت/VLAN، یا تداخل DHCP/IP ثابت پس از تغییر شبکه می‌تواند باعث قطعی‌های متناوب ارتباط شود که به نظر تصادفی می‌رسند.",
    suggestedCheck: "Verify PLC/SCADA IP settings, VLAN assignment, and check for a duplicate IP using network diagnostic tools.",
    suggestedCheckFa: "تنظیمات IP و تخصیص VLAN مربوط به PLC/SCADA را تأیید کنید و با ابزارهای تشخیص شبکه، وجود آدرس IP تکراری را بررسی کنید.",
    baseConfidence: 45,
    boostIf: [["ip conflict"],["duplicate ip"],["vlan"]],
    penaltyIf: ["ip verified","no duplicate ip"],
    missingEvidence: ["Network configuration audit", "Duplicate IP scan result", "VLAN assignment confirmation"],
  },
  {
    id: "plc-scada-comm-load",
    title: "PLC Scan Load, SCADA Driver, or Firewall/VLAN Filtering Issue",
    titleFa: "بار اسکن PLC، درایور SCADA یا فیلترینگ فایروال/VLAN",
    triggerKeywords: ["scada","plc load","driver","firewall","vlan","scan time","communication timeout","packet loss"],
    triggerDomains: ["NETWORK","SCADA","PLC"],
    explanation: "High PLC scan load, an outdated SCADA communication driver, or firewall/VLAN filtering can intermittently block or delay polling, appearing as random communication loss and HMI freezes even when the physical network is healthy.",
    explanationFa: "بار بالای اسکن PLC، درایور ارتباطی قدیمی SCADA، یا فیلترینگ فایروال/VLAN می‌تواند به‌طور متناوب پولینگ را مسدود یا با تأخیر مواجه کند و حتی وقتی شبکه فیزیکی سالم است، به‌صورت قطع ارتباط تصادفی و فریز HMI ظاهر شود.",
    suggestedCheck: "Check PLC scan time and CPU load, review SCADA driver/polling logs, and confirm firewall/VLAN rules are not intermittently blocking the PLC-SCADA port.",
    suggestedCheckFa: "زمان اسکن و بار CPU پی‌ال‌سی را بررسی کنید، لاگ‌های درایور/پولینگ SCADA را مرور کنید، و تأیید کنید قوانین فایروال/VLAN به‌طور متناوب پورت PLC-SCADA را مسدود نمی‌کنند.",
    baseConfidence: 48,
    boostIf: [["scan time"],["firewall"],["packet loss"],["scada driver"]],
    penaltyIf: ["scan time normal","driver updated","firewall rules confirmed"],
    missingEvidence: ["PLC scan time/CPU load trend", "SCADA communication driver log", "Firewall/VLAN rule review", "Packet loss / ping timestamp log"],
  },
  {
    id: "bearing-lubrication-trend",
    title: "Bearing Wear, Lubrication Degradation, or Misalignment (Rising Vibration/Temperature)",
    titleFa: "فرسودگی یاتاقان، افت روان‌کاری یا عدم تراز (روند صعودی ارتعاش/دما)",
    triggerKeywords: ["vibration","temperature","bearing","lubrication","misalignment","grease","overheating"],
    triggerDomains: ["MECHANICAL","MAINTENANCE","MOTOR"],
    explanation: "Gradually rising vibration and temperature without a PLC alarm is a classic early indicator of bearing wear, lubrication degradation, or misalignment — mechanical degradation trends typically precede an electrical fault code, so absence of an alarm does not mean the equipment is healthy.",
    explanationFa: "روند صعودی تدریجی ارتعاش و دما بدون آلارم PLC، نشانه اولیه کلاسیک فرسودگی یاتاقان، افت روان‌کاری یا عدم تراز است — روندهای فرسودگی مکانیکی معمولاً قبل از کد خطای برقی رخ می‌دهند، پس نبود آلارم به معنای سالم بودن تجهیز نیست.",
    suggestedCheck: "Trend vibration (velocity/acceleration) and bearing temperature over time. Check lubrication schedule and grease condition. Verify shaft alignment and check for load imbalance.",
    suggestedCheckFa: "ارتعاش (سرعت/شتاب) و دمای یاتاقان را در طول زمان روند‌یابی کنید. برنامه روان‌کاری و وضعیت گریس را بررسی کنید. تراز شفت را تأیید کنید و عدم توازن بار را بررسی کنید.",
    baseConfidence: 50,
    boostIf: [["vibration"],["temperature","rising"],["bearing"],["lubrication"]],
    penaltyIf: ["vibration normal","bearing ok","lubrication up to date"],
    missingEvidence: ["Vibration trend data (velocity mm/s or acceleration g)", "Bearing temperature trend", "Last lubrication/grease date", "Alignment check history"],
  },
  {
    id: "cooling-sensor-calibration",
    title: "Cooling System Degradation or Temperature Sensor Calibration Drift",
    titleFa: "افت سیستم خنک‌کاری یا انحراف کالیبراسیون سنسور دما",
    triggerKeywords: ["cooling","fan","calibration","sensor drift","ambient temperature","ventilation"],
    triggerDomains: ["MECHANICAL","SENSOR","MAINTENANCE"],
    explanation: "Reduced cooling airflow, a blocked ventilation path, or a drifted temperature sensor calibration can cause an apparent slow temperature rise that is not purely mechanical wear in origin.",
    explanationFa: "کاهش جریان هوای خنک‌کننده، مسدود شدن مسیر تهویه، یا انحراف کالیبراسیون سنسور دما می‌تواند باعث افزایش دمای ظاهری شود که منشأ آن صرفاً فرسودگی مکانیکی نیست.",
    suggestedCheck: "Check cooling fan operation and ventilation path for blockage. Verify temperature sensor calibration against a reference instrument.",
    suggestedCheckFa: "عملکرد فن خنک‌کننده و مسیر تهویه را از نظر انسداد بررسی کنید. کالیبراسیون سنسور دما را در برابر یک ابزار مرجع تأیید کنید.",
    baseConfidence: 40,
    boostIf: [["cooling"],["fan"],["calibration"],["sensor drift"]],
    penaltyIf: ["cooling confirmed","calibration verified"],
    missingEvidence: ["Cooling fan/airflow check result", "Temperature sensor calibration record", "Ambient temperature reading comparison"],
  },
];

// Generic maintenance/swap language shared across many unrelated fault domains — matching one
// of these alone should not be enough to pull a template into an unrelated scenario.
const GENERIC_MAINTENANCE_TERMS = new Set(["replaced", "replacement", "new motor", "terminal"]);

function generateCauses(
  input: IndustrialFaultInput,
  allText: string,
  domain: IndustrialDomain,
  matrix: SignalMatrixItem[],
  uncertainty: UncertaintyResult,
): LikelyCause[] {
  const results: LikelyCause[] = [];

  for (const tmpl of CAUSE_TEMPLATES) {
    // Domain relevance
    // Domain match is scoped to the classified primary domain only — matching against the
    // broader top-3 detected domains let unrelated hypotheses (e.g. VFD/motor wiring) leak
    // into scenarios sharing only an incidental keyword (e.g. "replaced") with a different domain.
    const domainMatch = tmpl.triggerDomains.includes(domain);

    // Keyword trigger — require at least 2 matches, at least one of which is domain-specific,
    // to qualify a template outside its own domain. A generic maintenance word like "replaced"
    // is common to many unrelated fault types and is not distinctive evidence on its own.
    const kwMatches = tmpl.triggerKeywords.filter(kw => allText.includes(kw.toLowerCase()));
    const hasSpecificMatch = kwMatches.some(kw => !GENERIC_MAINTENANCE_TERMS.has(kw));

    if (!domainMatch && (kwMatches.length < 2 || !hasSpecificMatch)) continue;

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

    // Signal matrix context — a template only gets a large confidence boost when the signal
    // state DIRECTLY and SPECIFICALLY supports it. Templates that get a direct-evidence boost
    // are exempt from the high-uncertainty confidence cap applied below; all others are not.
    const plcOut = matrix.find(s => s.signalName.includes("PLC Output"));
    const vfd = matrix.find(s => s.signalName.includes("VFD"));
    const overload = matrix.find(s => s.signalName.includes("Overload"));
    const safety = matrix.find(s => s.signalName.includes("Safety"));
    const motorCurrent = matrix.find(s => s.signalName.includes("Motor Current"));
    const vibration = matrix.find(s => s.signalName.includes("Vibration"));
    const bearingTemp = matrix.find(s => s.signalName.includes("Bearing"));
    const mechFreeRotation = matrix.find(s => s.signalName.includes("Mechanical Free Rotation"));
    const ioModule = matrix.find(s => s.signalName.includes("IO Module"));
    const supply24v = matrix.find(s => s.signalName.includes("24V"));
    const inputMapping = matrix.find(s => s.signalName.includes("PLC Input Address Mapping"));
    const commLink = matrix.find(s => s.signalName.includes("Communication Link"));
    const switchHealth = matrix.find(s => s.signalName.includes("Switch"));
    const ipConfig = matrix.find(s => s.signalName.includes("IP Configuration"));

    let hasDirectEvidence = false;

    // VFD overcurrent/overload and elevated motor current are direct evidence for VFD/load/
    // mechanical causes — NOT for field wiring, which needs its own wiring-specific language.
    if (tmpl.id === "mcc-vfd-not-ready" && (vfd?.status === "CRITICAL" || overload?.status === "CRITICAL")) {
      confidence = Math.min(confidence + 20, 95); hasDirectEvidence = true;
    }
    if (tmpl.id === "mcc-vfd-not-ready" && vfd?.status === "UNKNOWN") {
      confidence = Math.min(confidence + 10, 90);
    }
    if (tmpl.id === "vfd-parameter-mismatch" && (overload?.status === "CRITICAL" || motorCurrent?.status === "CRITICAL")) {
      confidence = Math.min(confidence + 20, 92); hasDirectEvidence = true;
    }
    if (tmpl.id === "mechanical-coupling-load" && (vibration?.status === "WARNING" || bearingTemp?.status === "WARNING" || mechFreeRotation?.status === "WARNING")) {
      confidence = Math.min(confidence + 20, 92); hasDirectEvidence = true;
    }
    if (tmpl.id === "bearing-lubrication-trend" && (vibration?.status === "WARNING" || bearingTemp?.status === "WARNING")) {
      confidence = Math.min(confidence + 20, 92); hasDirectEvidence = true;
    }
    if (tmpl.id === "pump-process-blockage" && motorCurrent?.status === "CRITICAL") {
      confidence = Math.min(confidence + 15, 88); hasDirectEvidence = true;
    }
    if (tmpl.id === "cable-motor-insulation" && (overload?.status === "CRITICAL" || motorCurrent?.status === "CRITICAL")) {
      confidence = Math.min(confidence + 10, 85);
    }
    if (tmpl.id === "permissive-interlock" && safety?.status === "UNKNOWN") {
      confidence = Math.min(confidence + 10, 88);
    }
    if (tmpl.id === "permissive-interlock" && safety?.status === "CRITICAL") {
      confidence = Math.min(confidence + 25, 95); hasDirectEvidence = true;
    }
    if (tmpl.id === "plc-output-not-reaching" && plcOut?.status === "UNKNOWN") {
      confidence = Math.min(confidence + 12, 85);
    }
    // Field wiring only gets a strong boost when there is wiring/terminal-specific language —
    // the PLC output being confirmed active is not, on its own, specific evidence of a wiring
    // fault over any other field-side cause (VFD, mechanical, sensor, etc.).
    if (tmpl.id === "field-wiring" && plcOut?.status === "NORMAL" && has(allText, "terminal","wiring","cable","rewired","reconnected")) {
      confidence = Math.min(confidence + 10, 85); hasDirectEvidence = true;
    }
    if (tmpl.id === "sensor-io-module-power" && (ioModule?.status !== "NORMAL" || supply24v?.status !== "NORMAL" || inputMapping?.status !== "NORMAL")) {
      confidence = Math.min(confidence + 15, 88); hasDirectEvidence = true;
    }
    if (tmpl.id === "network-switch-cable" && (switchHealth?.status === "WARNING" || commLink?.status === "WARNING")) {
      confidence = Math.min(confidence + 15, 88); hasDirectEvidence = true;
    }
    if (tmpl.id === "ip-network-config" && ipConfig?.status === "CRITICAL") {
      confidence = Math.min(confidence + 20, 90); hasDirectEvidence = true;
    }
    if (tmpl.id === "plc-scada-comm-load" && commLink?.status === "WARNING") {
      confidence = Math.min(confidence + 10, 85);
    }

    // Confidence calibration: when overall evidence entropy is HIGH, a single hypothesis
    // should not present as 90%+ confident unless it has direct alarm/signal support.
    if (uncertainty.level === "HIGH" && !hasDirectEvidence) {
      confidence = Math.min(confidence, 82);
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

function mapImpactToRiskLevel(level: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  return level === "NONE" ? "LOW" : level;
}

function buildReasoningMap(
  causes: LikelyCause[],
  matrix: SignalMatrixItem[],
  risk: RiskResult,
  uncertainty: UncertaintyResult,
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

  // Risk nodes reflect the actual computed risk result, not fixed placeholders.
  const riskNodes: RiskNode[] = [
    {
      id: "risk-prod",
      label: `Production Impact — ${risk.productionImpact}`,
      labelFa: `تأثیر تولید — ${risk.productionImpactFa}`,
      level: mapImpactToRiskLevel(risk.productionImpactLevel),
    },
    {
      id: "risk-safety",
      label: `Safety — ${risk.safetyImpact}`,
      labelFa: `ایمنی — ${risk.safetyImpactFa}`,
      level: mapImpactToRiskLevel(risk.safetyImpactLevel),
    },
    {
      id: "risk-urgency",
      label: `Urgency — ${risk.urgency}`,
      labelFa: `فوریت — ${risk.urgencyFa}`,
      level: risk.urgencyLevel,
    },
  ];

  // Action nodes are derived from the actual top causes and missing evidence for this analysis.
  const actionNodes: ActionNode[] = [];
  const firstUnknown = matrix.find(s => s.status === "UNKNOWN");
  if (firstUnknown) {
    actionNodes.push({
      id: "act-1",
      label: `Confirm ${firstUnknown.signalName}`,
      labelFa: `تأیید ${firstUnknown.signalNameFa}`,
      priority: "IMMEDIATE",
    });
  }
  if (causes[0]) {
    actionNodes.push({ id: "act-2", label: causes[0].suggestedCheck, labelFa: causes[0].suggestedCheckFa, priority: "IMMEDIATE" });
  }
  if (causes[1]) {
    actionNodes.push({ id: "act-3", label: causes[1].suggestedCheck, labelFa: causes[1].suggestedCheckFa, priority: "NEXT" });
  }
  if (uncertainty.conflictingSignals[0]) {
    actionNodes.push({
      id: "act-4",
      label: `Resolve conflicting evidence: ${uncertainty.conflictingSignals[0]}`,
      labelFa: `رفع شواهد متعارض: ${uncertainty.conflictingSignals[0]}`,
      priority: "NEXT",
    });
  }
  actionNodes.push({
    id: "act-5",
    label: causes[0]
      ? `Escalate to the appropriate specialist if "${causes[0].title}" is not confirmed after field checks`
      : "Escalate to the appropriate specialist if field checks do not resolve the fault",
    labelFa: causes[0]
      ? `در صورت عدم تأیید «${causes[0].titleFa}» پس از بررسی‌های میدانی، به متخصص مربوطه ارجاع دهید`
      : "در صورت عدم رفع خرابی پس از بررسی‌های میدانی، به متخصص مربوطه ارجاع دهید",
    priority: "ESCALATE",
  });

  return { evidenceNodes, causeNodes, riskNodes, actionNodes: actionNodes.slice(0, 5) };
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

function generateChecklist(domain: IndustrialDomain, allText: string = ""): ChecklistItem[] {
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

  // Network / communication checks (only when relevant)
  if (domain === "NETWORK" || domain === "SCADA" || has(allText, "switch","network","profinet","vlan","ip conflict")) {
    add("Check network switch port LEDs, error counters, and cable continuity.", "LED پورت سوییچ شبکه، شمارنده خطا و پیوستگی کابل را بررسی کنید.", "Network / Communication", "شبکه / ارتباطات", false);
    add("Verify PLC/SCADA IP address assignment and check for duplicate IP or VLAN misconfiguration.", "تخصیص آدرس IP پی‌ال‌سی/اسکادا را تأیید کنید و پیکربندی نادرست IP تکراری یا VLAN را بررسی کنید.", "Network / Communication", "شبکه / ارتباطات", false);
  }

  // Vibration / temperature checks (only when relevant)
  if (has(allText, "vibration","temperature rising","bearing temperature","overheating")) {
    add("Take a vibration reading and compare to the baseline trend.", "یک قرائت ارتعاش انجام دهید و با روند پایه مقایسه کنید.", "Mechanical", "مکانیک", false);
    add("Check bearing temperature and lubrication schedule/condition.", "دمای یاتاقان و برنامه/وضعیت روان‌کاری را بررسی کنید.", "Mechanical", "مکانیک", false);
  }

  // Data to collect
  add("Document current nameplate data (FLA, voltage, connection type, IP rating) for the replacement motor.", "داده‌های پلاک موتور جایگزین را مستند کنید (FLA، ولتاژ، نوع اتصال، IP).", "Data Collection", "جمع‌آوری داده", false);
  add("Save screenshot of PLC diagnostics page and online monitor during start attempt.", "تصویر صفحه صفحه دیاگنوستیک PLC و مانیتور آنلاین را حین تلاش برای استارت ذخیره کنید.", "Data Collection", "جمع‌آوری داده", false);

  return items;
}

// ─── Recommended actions ──────────────────────────────────────────────────────

function generateActions(domain: IndustrialDomain, allText: string): ActionGroup[] {
  const isNetwork = domain === "NETWORK" || domain === "SCADA" || has(allText, "switch","profinet","packet loss","ip conflict","comm loss","communication loss","vlan");
  const isVibration = has(allText, "vibration","temperature rising","bearing temperature","overheating","running hot");
  const isSensorIO = domain === "SENSOR" || has(allText, "sensor","feedback","io module","24v","input mapping");

  const immediate = [
    { en: "Go PLC online — check motor run Q-bit state and all permissive I-bits", fa: "PLC را آنلاین کنید — وضعیت بیت Q اجرا و تمام بیت‌های I مجوز را بررسی کنید" },
    { en: "Check HMI operator screen — confirm run command active and correct operating mode", fa: "صفحه اپراتور HMI را بررسی کنید — تأیید فرمان اجرا فعال و حالت عملیاتی صحیح است" },
    { en: "Read VFD keypad display — note any fault codes without clearing", fa: "نمایشگر VFD را بخوانید — کدهای خطا را بدون پاک کردن یادداشت کنید" },
    { en: "Check MCC breaker position and overload relay indicator", fa: "وضعیت کلید MCC و نشانگر رله اضافه‌بار را بررسی کنید" },
  ];
  if (isNetwork) immediate.push({ en: "Check network switch port LEDs and note any error indicators", fa: "LED پورت سوییچ شبکه را بررسی کنید و هرگونه نشانگر خطا را یادداشت کنید" });
  if (isVibration) immediate.push({ en: "Take a spot vibration and temperature reading and compare to baseline", fa: "یک قرائت لحظه‌ای ارتعاش و دما بگیرید و با روند پایه مقایسه کنید" });

  const electrical = [
    { en: "Qualified electrician: apply LOTO, verify absence of voltage at motor terminals", fa: "برقکار متخصص: LOTO اجرا کنید، عدم وجود ولتاژ در ترمینال موتور را تأیید کنید" },
    { en: "Inspect motor terminal box — verify U/V/W connections, delta/star jumper, terminal tightness", fa: "جعبه ترمینال موتور را بازرسی کنید — اتصالات U/V/W، جامپر مثلث/ستاره و سفتی ترمینال" },
    { en: "Measure cable insulation resistance (>1 MΩ) from MCC output to motor terminals", fa: "مقاومت عایق کابل (بیش از 1 مگا اهم) از خروجی MCC تا ترمینال موتور را اندازه بگیرید" },
    { en: "Verify overload relay is set to motor nameplate FLA (±5%)", fa: "تأیید رله اضافه‌بار روی FLA پلاک موتور تنظیم شده است (±5%)" },
  ];
  if (isNetwork) electrical.push(
    { en: "Check switch port duplex/speed settings and cable continuity", fa: "تنظیمات دوپلکس/سرعت پورت سوییچ و پیوستگی کابل را بررسی کنید" },
    { en: "Scan the network for duplicate IP addresses and confirm VLAN assignment", fa: "شبکه را از نظر آدرس IP تکراری بررسی کنید و تخصیص VLAN را تأیید کنید" },
  );
  if (isSensorIO) electrical.push(
    { en: "Measure 24VDC sensor supply and check IO module channel diagnostic LED", fa: "تغذیه 24 ولت سنسور را اندازه بگیرید و LED تشخیصی کانال ماژول IO را بررسی کنید" },
  );

  const plcHmi = [
    { en: "Navigate to motor run rung in PLC online — verify all enabling conditions are TRUE", fa: "در PLC آنلاین به رانگ اجرای موتور بروید — تأیید همه شرایط فعال‌ساز TRUE هستند" },
    { en: "Use force/monitor table to check output Q-bit state during start attempt", fa: "از جدول force/monitor برای بررسی وضعیت بیت Q خروجی هنگام تلاش برای استارت استفاده کنید" },
    { en: "Capture PLC diagnostics log and alarm history since motor replacement date", fa: "لاگ دیاگنوستیک PLC و تاریخچه آلارم از تاریخ تعویض موتور را ضبط کنید" },
    { en: "Verify PLC program has correct motor parameters if soft-start or VFD-controlled", fa: "تأیید برنامه PLC پارامترهای صحیح موتور را دارد اگر با soft-start یا VFD کنترل می‌شود" },
  ];
  if (isNetwork) plcHmi.push(
    { en: "Check PLC scan time/CPU load trend and review SCADA driver communication statistics", fa: "روند زمان اسکن/بار CPU پی‌ال‌سی را بررسی کنید و آمار ارتباطی درایور اسکادا را مرور کنید" },
    { en: "Confirm firewall/VLAN rules are not intermittently blocking the PLC–SCADA port", fa: "تأیید کنید قوانین فایروال/VLAN پورت PLC–SCADA را به‌صورت متناوب مسدود نمی‌کنند" },
  );
  if (isSensorIO) plcHmi.push(
    { en: "Confirm PLC input tag/address mapping matches the physical channel used for the sensor", fa: "تأیید کنید نگاشت تگ/آدرس ورودی PLC با کانال فیزیکی مورد استفاده سنسور مطابقت دارد" },
  );

  const mechanical = [
    { en: "LOTO + mechanical isolation: rotate motor shaft by hand — verify smooth, free rotation", fa: "LOTO + ایزولاسیون مکانیکی: شفت موتور را با دست بچرخانید — چرخش روان و آزاد را تأیید کنید" },
    { en: "Inspect coupling: correct half-coupling match, keyway intact, bolts torqued to spec", fa: "کوپلینگ را بازرسی کنید: تطابق نیمه کوپلینگ، کی‌وی سالم، پیچ‌ها با گشتاور مشخص" },
    { en: "Rotate load side by hand if possible — identify any jam or resistance", fa: "در صورت امکان بار را با دست بچرخانید — هرگونه گیر کردن یا مقاومت را شناسایی کنید" },
    { en: "Verify coupling alignment within OEM tolerances (angular and parallel)", fa: "تراز کوپلینگ را در محدوده تلرانس OEM تأیید کنید (زاویه‌ای و موازی)" },
  ];
  if (isVibration) mechanical.push(
    { en: "Trend vibration and bearing temperature over time; check lubrication schedule and grease condition", fa: "ارتعاش و دمای یاتاقان را در طول زمان روند‌یابی کنید؛ برنامه روان‌کاری و وضعیت گریس را بررسی کنید" },
    { en: "Check cooling airflow/ventilation path and load balance", fa: "جریان هوای خنک‌کننده/مسیر تهویه و توازن بار را بررسی کنید" },
  );

  const dataToCollect = [
    { en: "Motor nameplate photo: FLA, voltage, power, speed, connection type, IP, efficiency class", fa: "عکس پلاک موتور: FLA، ولتاژ، توان، سرعت، نوع اتصال، IP، کلاس بازده" },
    { en: "VFD fault code (if any) and current parameter list (P0304 motor rated voltage, P0305 FLA, etc.)", fa: "کد خطای VFD (در صورت وجود) و فهرست پارامترهای فعلی" },
    { en: "PLC online screenshot: output rung state and all permissive input states", fa: "اسکرین‌شات آنلاین PLC: وضعیت رانگ خروجی و تمام وضعیت‌های ورودی مجوز" },
    { en: "Photo of motor terminal box showing current wiring", fa: "عکس جعبه ترمینال موتور که سیم‌بندی فعلی را نشان می‌دهد" },
  ];
  if (isNetwork) dataToCollect.push(
    { en: "Switch port error counters and a configuration backup of the new switch", fa: "شمارنده خطای پورت سوییچ و نسخه پشتیبان پیکربندی سوییچ جدید" },
    { en: "Network scan result for duplicate IP addresses and VLAN assignment", fa: "نتیجه اسکن شبکه برای آدرس‌های IP تکراری و تخصیص VLAN" },
  );
  if (isVibration) dataToCollect.push(
    { en: "Vibration trend log and bearing temperature trend log", fa: "لاگ روند ارتعاش و لاگ روند دمای یاتاقان" },
  );
  if (isSensorIO) dataToCollect.push(
    { en: "IO module diagnostic word and 24VDC sensor supply reading", fa: "کلمه تشخیصی ماژول IO و قرائت تغذیه 24 ولت سنسور" },
  );

  const escalation = [
    { en: "Escalate to instrumentation/electrical engineer if PLC output Q-bit confirmed active but motor still does not start", fa: "در صورت تأیید فعال بودن Q-bit خروجی PLC اما عدم راه‌اندازی موتور، موضوع را به مهندس ابزار دقیق/برق ارجاع دهید" },
    { en: "Escalate to mechanical engineer if coupling/alignment issue suspected", fa: "در صورت مشکوک بودن به مشکل کوپلینگ/تراز، موضوع را به مهندس مکانیک ارجاع دهید" },
    { en: "Contact motor OEM if motor winding/insulation issue suspected after terminal check", fa: "در صورت مشکوک بودن به مشکل سیم‌پیچ/عایق موتور پس از بررسی ترمینال، با OEM موتور تماس بگیرید" },
    { en: "Notify shift supervisor of downtime impact and timeline", fa: "اطلاع به سرپرست شیفت درباره تأثیر و جدول زمانی توقف" },
  ];
  if (isNetwork) escalation.push(
    { en: "Escalate to network/OT engineer if switch, cable, and IP checks do not resolve the fault", fa: "در صورت عدم رفع خرابی توسط بررسی سوییچ، کابل و IP، به مهندس شبکه/OT ارجاع دهید" },
  );
  if (isVibration) escalation.push(
    { en: "Escalate to reliability/maintenance engineer for vibration analysis if the trend continues to rise", fa: "در صورت ادامه روند صعودی، برای تحلیل ارتعاش به مهندس قابلیت اطمینان/نگهداری ارجاع دهید" },
  );

  return [
    { category: "Immediate Safe Checks (No hardware contact)", categoryFa: "بررسی‌های فوری ایمن (بدون تماس با سخت‌افزار)", icon: "⚡", items: immediate },
    { category: "Electrical / Control Diagnostics", categoryFa: "دیاگنوستیک برق / کنترل", icon: "🔧", items: electrical },
    { category: "PLC / HMI Diagnostics", categoryFa: "دیاگنوستیک PLC / HMI", icon: "💻", items: plcHmi },
    { category: "Mechanical / Field Checks", categoryFa: "بررسی‌های مکانیکی / میدانی", icon: "⚙️", items: mechanical },
    { category: "Data to Collect Before Escalation", categoryFa: "داده‌های مورد نیاز قبل از تشدید", icon: "📋", items: dataToCollect },
    { category: "Escalation Path", categoryFa: "مسیر تشدید", icon: "🚨", items: escalation },
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

// Interface-layer domains (HMI/SCADA) report a fault but are rarely its root-cause domain —
// their keywords (e.g. "run command") repeat often in operator-facing phrasing and can
// outscore the actual equipment domain. Prefer a hardware/equipment domain when present.
const HARDWARE_DOMAINS: IndustrialDomain[] = ["MOTOR", "VFD", "SENSOR", "NETWORK", "MECHANICAL", "ELECTRICAL"];

function classify(
  domains: { domain: IndustrialDomain; score: number }[],
  allText: string,
  input: IndustrialFaultInput,
): ClassificationResult {
  let primary = domains[0]?.domain ?? "UNKNOWN";
  if (primary === "HMI" || primary === "SCADA") {
    const hardwareAlt = domains.find(d => HARDWARE_DOMAINS.includes(d.domain) && d.score > 0);
    if (hardwareAlt) primary = hardwareAlt.domain;
  }
  const secondary = domains.filter(d => d.domain !== primary).slice(0, 3).map(d => d.domain);
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
  risk: RiskResult,
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
      ? `${uncertainty.missingCriticalSignals.length} critical signals are missing, so no single cause can be confirmed yet. Gather field evidence before hardware intervention. `
      : uncertainty.level === "MEDIUM"
        ? `${uncertainty.missingCriticalSignals.length} signals unconfirmed. Prioritize evidence collection before ruling out any hypothesis. `
        : "Most signals confirmed. Focus on top-ranked causes. ") +
    (topCause ? `Highest-confidence hypothesis: ${topCause.title} (${topCause.confidence}% confidence). ` : "") +
    `Urgency: ${risk.urgency}. ` +
    "All recommendations follow site safety procedures. Qualified personnel required for electrical/mechanical inspection.";

  const fa = `مغز صنعتی هرمس ${titleFa} روی ${assetFa} را تحلیل کرد. ` +
    `طبقه‌بندی حوزه اصلی: ${classification.domainFa}. ` +
    `آنتروپی شواهد: ${uncertainty.level} — ` +
    (uncertainty.level === "HIGH"
      ? `${uncertainty.missingCriticalSignals.length} سیگنال حیاتی مفقود است، بنابراین هنوز نمی‌توان یک علت واحد را تأیید کرد. قبل از مداخله سخت‌افزاری شواهد میدانی را جمع‌آوری کنید. `
      : uncertainty.level === "MEDIUM"
        ? `${uncertainty.missingCriticalSignals.length} سیگنال تأیید نشده. قبل از رد کردن هر فرضیه، جمع‌آوری شواهد را اولویت‌بندی کنید. `
        : "اکثر سیگنال‌ها تأیید شده. روی علل رتبه‌بالا تمرکز کنید. ") +
    (topCause ? `فرضیه با بالاترین اطمینان: ${topCause.titleFa} (${topCause.confidence}٪ اطمینان). ` : "") +
    `فوریت: ${risk.urgencyFa}. ` +
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
  const causes = generateCauses(input, allText, classification.domain, signalMatrix, uncertainty);
  const reasoningMap = buildReasoningMap(causes, signalMatrix, risk, uncertainty);
  const evidenceGaps = computeEvidenceGaps(signalMatrix);
  const checklist = generateChecklist(classification.domain, allText);
  const actions = generateActions(classification.domain, allText);
  const relatedKnowledge = findRelatedKnowledge(allText, domains);
  const summary = buildSummary(input, classification, uncertainty, risk, causes);

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
