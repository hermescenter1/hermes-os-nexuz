"use client";

import { formatDateTime } from "@/lib/i18n/format";

import { useState, useRef, useId } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { IndustrialBrainAnalysis, UncertaintyLevel } from "@/lib/industrial-brain/types";
import { buildAnalyzeRequest, findBlockingField } from "@/lib/industrial-brain/request-contract";

/** Loosely-typed next-intl translator for the report-text builders below. */
type Translator = ReturnType<typeof useTranslations>;

// ─── Constants ────────────────────────────────────────────────────────────────

const IC = "w-full rounded-xl px-3 py-2.5 text-sm bg-[#0C1420] text-slate-100 border border-white/10 placeholder:text-slate-400 focus:outline-none focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20 transition-all font-mono";
const SC = "w-full rounded-xl px-3 py-2 text-sm bg-[#0C1420] text-slate-100 border border-white/10 focus:outline-none focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20 transition-all font-mono";
const TC = "w-full rounded-xl px-3 py-2.5 text-sm bg-[#0C1420] text-slate-100 border border-white/10 placeholder:text-slate-400 focus:outline-none focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20 transition-all resize-none font-mono";

const STATUS_COLORS = {
  NORMAL:   { bg: "bg-emerald-500/10",   border: "border-emerald-500/30",   text: "text-emerald-400",   dot: "bg-emerald-400" },
  WARNING:  { bg: "bg-amber-500/10",     border: "border-amber-500/30",     text: "text-amber-400",     dot: "bg-amber-400" },
  CRITICAL: { bg: "bg-rose-500/10",      border: "border-rose-500/30",      text: "text-rose-400",      dot: "bg-rose-400" },
  UNKNOWN:  { bg: "bg-slate-500/10",     border: "border-slate-500/30",     text: "text-slate-400",     dot: "bg-slate-500" },
};

const ALARM_COLORS = {
  INFO:     { bg: "bg-sky-500/10",       border: "border-sky-500/30",       text: "text-sky-400" },
  LOW:      { bg: "bg-emerald-500/10",   border: "border-emerald-500/30",   text: "text-emerald-400" },
  MEDIUM:   { bg: "bg-amber-500/10",     border: "border-amber-500/30",     text: "text-amber-400" },
  HIGH:     { bg: "bg-orange-500/10",    border: "border-orange-500/30",    text: "text-orange-400" },
  CRITICAL: { bg: "bg-rose-500/10",      border: "border-rose-500/30",      text: "text-rose-400" },
  UNKNOWN:  { bg: "bg-slate-500/10",     border: "border-slate-500/30",     text: "text-slate-400" },
};

const URGENCY_COLORS = {
  LOW:      "text-emerald-400",
  MEDIUM:   "text-amber-400",
  HIGH:     "text-orange-400",
  CRITICAL: "text-rose-400",
};

const UNCERTAINTY_COLORS = {
  LOW:    { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  MEDIUM: { text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  HIGH:   { text: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30" },
};

// ─── Demo-ready sample scenarios ───────────────────────────────────────────────
// Trilingual demo dataset that fills the form. `labels` are the button captions
// and the per-locale field maps are the sample values loaded into the form —
// this is locale content data (like a stored multilingual record), so the
// lookups against it below are data selection, not display strings.
//
// PHASE 107 — German added. This dataset is frontend-owned product copy, and
// with only en/fa present the German page fell back to English: the three
// sample buttons and every field they loaded rendered in English on
// /de/industrial-brain, which was the most visible part of the German gap.
//
// Two classes of value are deliberately NOT translated:
//   * vendor and platform identifiers (Siemens S7-1500, Allen-Bradley
//     ControlLogix, Mitsubishi FX / GOT HMI) — these are product names;
//   * productionImpact / safetyImpact — these are the IMPACT_LEVELS enum
//     posted to the analyze API, not prose. Translating them would fail
//     validation at the HTTP boundary. Persian already treats them the same way.
//
// This does NOT make German analysis OUTPUT exist: the deterministic analyzer
// emits only `x` / `xFa` pairs and has no German field, which
// lib/industrial-brain/request-contract.ts documents explicitly. German users
// get a German form with German samples and an English analysis report.

type SampleFields = Record<string, string>;

/** The locales the demo dataset carries content for; anything else uses `en`. */
type SampleLocale = "en" | "fa" | "de";

function sampleLocale(locale: string): SampleLocale {
  return locale === "fa" ? "fa" : locale === "de" ? "de" : "en";
}

const SAMPLE_SCENARIOS: Record<string, {
  labels: Record<SampleLocale, string>;
  en: SampleFields;
  fa: SampleFields;
  de: SampleFields;
}> = {
  conveyor: {
    labels: {
      en: "Load conveyor motor sample",
      fa: "بارگذاری نمونه موتور کانوایر",
      de: "Beispiel Förderbandmotor laden",
    },
    en: {
      problemTitle: "Conveyor motor does not start after replacement",
      assetType: "22kW Conveyor Motor",
      systemArea: "Production Line 1, Loading Area",
      plcPlatform: "Siemens S7-1500",
      observedSymptoms: "HMI run command is active. PLC shows no active fault. Motor does not rotate. Motor was recently replaced.",
      recentChanges: "Motor replacement and mechanical alignment.",
      activeAlarms: "No active PLC alarm.",
      hmiCommandState: "Run command active",
      plcOutputState: "Unknown",
      vfdMccState: "Unknown",
      interlockStatus: "Unknown",
      sensorFeedback: "Unknown",
      productionImpact: "HIGH",
      safetyImpact: "LOW",
      alreadyChecked: "HMI command, PLC fault page, basic mechanical free rotation.",
      additionalInfo: "Motor was recently replaced. Detailed electrical test was not recorded.",
    },
    fa: {
      problemTitle: "موتور کانوایر پس از تعویض راه‌اندازی نمی‌شود",
      assetType: "موتور کانوایر 22 کیلووات",
      systemArea: "خط تولید 1، ناحیه بارگیری",
      plcPlatform: "زیمنس S7-1500",
      observedSymptoms: "فرمان اجرا از HMI فعال است. PLC خطای فعالی نشان نمی‌دهد. موتور نمی‌چرخد. موتور اخیراً تعویض شده است.",
      recentChanges: "تعویض موتور و تراز مکانیکی.",
      activeAlarms: "آلارم فعال PLC وجود ندارد.",
      hmiCommandState: "فرمان اجرا فعال است",
      plcOutputState: "نامشخص",
      vfdMccState: "نامشخص",
      interlockStatus: "نامشخص",
      sensorFeedback: "نامشخص",
      productionImpact: "HIGH",
      safetyImpact: "LOW",
      alreadyChecked: "فرمان HMI، صفحه خطای PLC، چرخش آزاد مکانیکی اولیه.",
      additionalInfo: "موتور اخیراً تعویض شده است. تست الکتریکی دقیق ثبت نشده است.",
    },
    de: {
      problemTitle: "Förderbandmotor startet nach dem Austausch nicht",
      assetType: "Förderbandmotor 22 kW",
      systemArea: "Produktionslinie 1, Beladebereich",
      plcPlatform: "Siemens S7-1500",
      observedSymptoms: "Der Startbefehl am HMI ist aktiv. Die SPS zeigt keine anstehende Störung. Der Motor dreht nicht. Der Motor wurde kürzlich getauscht.",
      recentChanges: "Motortausch und mechanische Ausrichtung.",
      activeAlarms: "Keine anstehende SPS-Störmeldung.",
      hmiCommandState: "Startbefehl aktiv",
      plcOutputState: "Unbekannt",
      vfdMccState: "Unbekannt",
      interlockStatus: "Unbekannt",
      sensorFeedback: "Unbekannt",
      productionImpact: "HIGH",
      safetyImpact: "LOW",
      alreadyChecked: "HMI-Befehl, SPS-Störungsseite, grundlegende mechanische Freigängigkeit.",
      additionalInfo: "Der Motor wurde kürzlich getauscht. Eine detaillierte elektrische Prüfung wurde nicht dokumentiert.",
    },
  },
  vfdPump: {
    labels: {
      en: "Load VFD pump fault sample",
      fa: "بارگذاری نمونه خرابی VFD پمپ",
      de: "Beispiel FU-Pumpenstörung laden",
    },
    en: {
      problemTitle: "Pump stops intermittently with VFD overcurrent alarm",
      assetType: "Centrifugal Pump, 11kW",
      systemArea: "Cooling Water Pump Station",
      plcPlatform: "Allen-Bradley ControlLogix",
      observedSymptoms: "Pump stops intermittently. VFD shows overcurrent/overload alarm. Motor current sometimes spikes above nameplate FLA.",
      recentChanges: "Recent maintenance work on pump coupling alignment.",
      activeAlarms: "VFD overcurrent alarm, intermittent.",
      hmiCommandState: "Run command active",
      plcOutputState: "Active",
      vfdMccState: "Fault / tripped intermittently",
      interlockStatus: "Unknown",
      sensorFeedback: "Unknown",
      productionImpact: "HIGH",
      safetyImpact: "LOW",
      alreadyChecked: "VFD fault code logged, basic coupling visual check.",
      additionalInfo: "Coupling maintenance was performed one week before symptoms started.",
    },
    fa: {
      problemTitle: "پمپ به‌طور متناوب متوقف می‌شود همراه با آلارم اضافه‌جریان VFD",
      assetType: "پمپ گریز از مرکز، 11 کیلووات",
      systemArea: "ایستگاه پمپ آب خنک‌کننده",
      plcPlatform: "Allen-Bradley ControlLogix",
      observedSymptoms: "پمپ به‌طور متناوب متوقف می‌شود. VFD آلارم اضافه‌جریان/اضافه‌بار نشان می‌دهد. جریان موتور گاهی بالاتر از FLA پلاک می‌رود.",
      recentChanges: "کار تعمیراتی اخیر روی تراز کوپلینگ پمپ.",
      activeAlarms: "آلارم اضافه‌جریان VFD، به‌صورت متناوب.",
      hmiCommandState: "فرمان اجرا فعال است",
      plcOutputState: "فعال",
      vfdMccState: "خطا / تریپ به‌صورت متناوب",
      interlockStatus: "نامشخص",
      sensorFeedback: "نامشخص",
      productionImpact: "HIGH",
      safetyImpact: "LOW",
      alreadyChecked: "کد خطای VFD ثبت شده، بازرسی چشمی اولیه کوپلینگ.",
      additionalInfo: "تعمیرات کوپلینگ یک هفته قبل از شروع علائم انجام شده است.",
    },
    de: {
      problemTitle: "Pumpe schaltet sporadisch ab mit FU-Überstromalarm",
      assetType: "Kreiselpumpe, 11 kW",
      systemArea: "Kühlwasser-Pumpstation",
      plcPlatform: "Allen-Bradley ControlLogix",
      observedSymptoms: "Die Pumpe schaltet sporadisch ab. Der Frequenzumrichter meldet Überstrom/Überlast. Der Motorstrom überschreitet zeitweise den Nennstrom laut Typenschild.",
      recentChanges: "Kürzlich Instandhaltung an der Ausrichtung der Pumpenkupplung.",
      activeAlarms: "FU-Überstromalarm, sporadisch.",
      hmiCommandState: "Startbefehl aktiv",
      plcOutputState: "Aktiv",
      vfdMccState: "Störung / sporadisch ausgelöst",
      interlockStatus: "Unbekannt",
      sensorFeedback: "Unbekannt",
      productionImpact: "HIGH",
      safetyImpact: "LOW",
      alreadyChecked: "FU-Fehlercode protokolliert, einfache Sichtprüfung der Kupplung.",
      additionalInfo: "Die Kupplungsinstandhaltung erfolgte eine Woche vor Auftreten der Symptome.",
    },
  },
  sensorFeedback: {
    labels: {
      en: "Load sensor feedback sample",
      fa: "بارگذاری نمونه فیدبک سنسور",
      de: "Beispiel Sensorrückmeldung laden",
    },
    en: {
      problemTitle: "Cylinder reaches position but PLC/HMI shows no feedback",
      assetType: "Pneumatic Cylinder with Proximity Sensor",
      systemArea: "Packaging Cell 3",
      plcPlatform: "Mitsubishi FX / GOT HMI",
      observedSymptoms: "Cylinder physically reaches position. No mechanical jam visible. PLC/HMI does not receive position feedback. Sensor was replaced recently.",
      recentChanges: "Proximity sensor replaced last shift.",
      activeAlarms: "No active PLC alarm.",
      hmiCommandState: "Run command active",
      plcOutputState: "Active",
      vfdMccState: "Unknown",
      interlockStatus: "Unknown",
      sensorFeedback: "Sensor replaced, no feedback signal seen at PLC input",
      productionImpact: "MEDIUM",
      safetyImpact: "LOW",
      alreadyChecked: "Physical position confirmed by operator, sensor LED not checked.",
      additionalInfo: "No wiring diagram change was recorded after sensor replacement.",
    },
    fa: {
      problemTitle: "سیلندر به موقعیت می‌رسد اما PLC/HMI فیدبکی نشان نمی‌دهد",
      assetType: "سیلندر پنوماتیک با سنسور پروکسیمیتی",
      systemArea: "سلول بسته‌بندی 3",
      plcPlatform: "Mitsubishi FX / HMI GOT",
      observedSymptoms: "سیلندر به‌صورت فیزیکی به موقعیت می‌رسد. گیر مکانیکی مشاهده نمی‌شود. PLC/HMI فیدبک موقعیت را دریافت نمی‌کند. سنسور اخیراً تعویض شده است.",
      recentChanges: "سنسور پروکسیمیتی در شیفت قبل تعویض شد.",
      activeAlarms: "آلارم فعال PLC وجود ندارد.",
      hmiCommandState: "فرمان اجرا فعال است",
      plcOutputState: "فعال",
      vfdMccState: "نامشخص",
      interlockStatus: "نامشخص",
      sensorFeedback: "سنسور تعویض شده، سیگنال فیدبک در ورودی PLC دیده نمی‌شود",
      productionImpact: "MEDIUM",
      safetyImpact: "LOW",
      alreadyChecked: "موقعیت فیزیکی توسط اپراتور تأیید شده، LED سنسور بررسی نشده.",
      additionalInfo: "پس از تعویض سنسور، تغییری در نقشه سیم‌بندی ثبت نشده است.",
    },
    de: {
      problemTitle: "Zylinder erreicht die Position, SPS/HMI zeigt keine Rückmeldung",
      assetType: "Pneumatikzylinder mit Näherungsschalter",
      systemArea: "Verpackungszelle 3",
      plcPlatform: "Mitsubishi FX / GOT HMI",
      observedSymptoms: "Der Zylinder erreicht die Position mechanisch. Keine sichtbare Blockierung. SPS/HMI erhält keine Positionsrückmeldung. Der Sensor wurde kürzlich getauscht.",
      recentChanges: "Näherungsschalter in der letzten Schicht getauscht.",
      activeAlarms: "Keine anstehende SPS-Störmeldung.",
      hmiCommandState: "Startbefehl aktiv",
      plcOutputState: "Aktiv",
      vfdMccState: "Unbekannt",
      interlockStatus: "Unbekannt",
      sensorFeedback: "Sensor getauscht, am SPS-Eingang ist kein Rückmeldesignal sichtbar",
      productionImpact: "MEDIUM",
      safetyImpact: "LOW",
      alreadyChecked: "Position vom Bediener bestätigt, Sensor-LED nicht geprüft.",
      additionalInfo: "Nach dem Sensortausch wurde keine Änderung am Klemmenplan dokumentiert.",
    },
  },
};

// ─── Evidence Pack / Engineering Report helpers ────────────────────────────────

interface ReportMeta {
  problemTitle: string;
  assetType: string;
  systemArea: string;
  plcPlatform: string;
  generatedAt: Date;
}

function fmtDateTime(date: Date, locale: string): string {
  return formatDateTime(date, locale);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy copy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function uncertaintyLabel(level: UncertaintyLevel, t: Translator): string {
  return t(`uncertaintyLevel.${level}`);
}

function buildSummaryText(analysis: IndustrialBrainAnalysis, meta: ReportMeta, isFa: boolean, t: Translator): string {
  const top = analysis.likelyCauses[0];
  const nextChecks = analysis.likelyCauses.slice(0, 3).map(c => (isFa ? c.suggestedCheckFa : c.suggestedCheck)).filter(Boolean);

  const lines = [
    t("report.summaryProblem", { title: meta.problemTitle }),
    top
      ? t("report.summaryTopHypothesis", { title: isFa ? top.titleFa : top.title, confidence: String(top.confidence) })
      : t("report.summaryNoHypothesis"),
    t("report.summaryEntropy", { level: uncertaintyLabel(analysis.uncertainty.level, t) }),
    t("report.summaryUrgency", { urgency: isFa ? analysis.risk.urgencyFa : analysis.risk.urgency, level: analysis.risk.urgencyLevel }),
    t("report.summaryKeyChecks"),
    ...(nextChecks.length ? nextChecks.map(c => `- ${c}`) : [t("report.summaryNoCheck")]),
  ];

  return lines.join("\n");
}

function buildFullReportText(analysis: IndustrialBrainAnalysis, meta: ReportMeta, isFa: boolean, locale: string, t: Translator): string {
  const sec = (title: string) => `\n── ${title} ──\n`;
  const lines: string[] = [];

  lines.push(t("report.reportTitle"));
  lines.push(`${t("report.fieldTitle")}: ${meta.problemTitle}`);
  lines.push(`${t("report.fieldAssetType")}: ${meta.assetType || t("report.notReported")}`);
  lines.push(`${t("report.fieldSystemArea")}: ${meta.systemArea || t("report.notReported")}`);
  lines.push(`${t("report.fieldPlcPlatform")}: ${meta.plcPlatform || t("report.notReported")}`);
  lines.push(`${t("report.fieldGenerated")}: ${fmtDateTime(meta.generatedAt, locale)}`);

  lines.push(sec(t("report.secExecutiveSummary")));
  lines.push(isFa ? analysis.summaryFa : analysis.summary);
  lines.push(`${t("report.primaryDomain")}: ${isFa ? analysis.classification.domainFa : analysis.classification.domain}`);
  lines.push(`${t("report.severity")}: ${analysis.classification.severity}`);
  lines.push(`${t("report.diagnosticConfidence")}: ${analysis.confidence}%`);
  lines.push(`${t("report.evidenceEntropy")}: ${uncertaintyLabel(analysis.uncertainty.level, t)}`);

  lines.push(sec(t("report.secAlarmIntelligence")));
  if (!analysis.alarms.length) {
    lines.push(t("report.noAlarmReport"));
  } else {
    for (const a of analysis.alarms) {
      lines.push(`- [${a.severity}] ${a.alarmText} (${a.source})`);
      lines.push(`  ${a.interpretation}`);
      lines.push(`  ${a.possibleMeaning}`);
    }
  }

  lines.push(sec(t("report.secSignalMatrix")));
  for (const s of analysis.signalMatrix) {
    lines.push(`- ${isFa ? s.signalNameFa : s.signalName} | ${s.source} | ${t("report.observed")}: ${s.observedValue} | ${t("report.expected")}: ${s.expectedValue} | ${t("report.status")}: ${s.status} | ${t("report.nextCheck")}: ${s.nextCheck}`);
  }

  lines.push(sec(t("report.secEvidenceEntropy")));
  lines.push(`${t("report.level")}: ${uncertaintyLabel(analysis.uncertainty.level, t)}`);
  lines.push(isFa ? analysis.uncertainty.explanationFa : analysis.uncertainty.explanation);
  if (analysis.uncertainty.missingCriticalSignals.length) {
    lines.push(`${t("report.missingCriticalSignals")}: ${(isFa ? analysis.uncertainty.missingCriticalSignalsFa : analysis.uncertainty.missingCriticalSignals).join(", ")}`);
  }

  lines.push(sec(t("report.secLikelyCauses")));
  analysis.likelyCauses.forEach((c, i) => {
    lines.push(`${i + 1}. ${isFa ? c.titleFa : c.title} (${c.confidence}%)`);
    lines.push(`   ${isFa ? c.explanationFa : c.explanation}`);
    if (c.supportingEvidence.length) lines.push(`   ${t("report.supporting")}: ${c.supportingEvidence.join("; ")}`);
    if (c.missingEvidence.length) lines.push(`   ${t("report.missing")}: ${c.missingEvidence.join("; ")}`);
    lines.push(`   ${t("report.suggestedCheck")}: ${isFa ? c.suggestedCheckFa : c.suggestedCheck}`);
  });

  lines.push(sec(t("report.secSafeActionPath")));
  for (const group of analysis.recommendedActions) {
    lines.push(`${group.icon} ${isFa ? group.categoryFa : group.category}`);
    for (const item of group.items) lines.push(`  - ${isFa ? item.fa : item.en}`);
  }

  lines.push(sec(t("report.secDisclaimer")));
  lines.push(t("report.disclaimerDecision"));
  lines.push(t("report.disclaimerNotCertified"));
  lines.push(t("report.disclaimerVerify"));

  return lines.join("\n");
}

function fillSampleForm(form: HTMLFormElement, data: SampleFields) {
  for (const [name, value] of Object.entries(data)) {
    const el = form.elements.namedItem(name);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.value = value;
    }
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// DASHBOARD ALIGNMENT — a section title is now a real <h3>, not a <p> styled to
// look like one. The result document is long enough that a screen-reader user
// navigating it by heading had nothing to navigate: page h1 → workspace h2 →
// section h3 is the outline the printed report already implies.
function SectionHeader({ title, accent }: { title: string; accent: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-0.5 h-5 rounded-full shrink-0" aria-hidden="true" style={{ background: accent }} />
      <h3 className="text-[12px] font-mono uppercase tracking-[0.2em]" style={{ color: accent }}>
        {title}
      </h3>
    </div>
  );
}

/**
 * Local navigation for a long analytical document.
 *
 * Every entry resolves to an element that is ACTUALLY on the page at the moment
 * the list is rendered: the four result anchors appear only once an analysis
 * exists, because an anchor that scrolls nowhere is worse than one that is
 * absent. `#ib-reference` targets the server-rendered reference panel, which is
 * present on every render.
 *
 * There is no active-section state. Deriving one would mean a scroll observer
 * and a re-render per scroll frame on a page whose whole point is that it does
 * no continuous work, and the list is short enough to read as a contents list.
 */
function SectionNav({ hasAnalysis }: { hasAnalysis: boolean }) {
  const t = useTranslations("industrialBrain");
  const items = [
    { href: "#ib-analyze",   label: t("nav.analyze"),   resultOnly: false },
    { href: "#ib-reasoning", label: t("nav.reasoning"), resultOnly: true },
    { href: "#ib-evidence",  label: t("nav.evidence"),  resultOnly: true },
    { href: "#ib-actions",   label: t("nav.actions"),   resultOnly: true },
    { href: "#ib-report",    label: t("nav.report"),    resultOnly: true },
    { href: "#ib-reference", label: t("nav.reference"), resultOnly: false },
  ].filter(item => hasAnalysis || !item.resultOnly);

  return (
    <nav
      aria-label={t("nav.heading")}
      className="ib-print-hide sticky top-16 z-20 mb-5 rounded-xl border border-white/8"
      style={{ background: "rgba(4,8,15,0.92)", backdropFilter: "blur(12px)" }}
    >
      <ul className="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
        {items.map(item => (
          <li key={item.href} className="shrink-0">
            <a
              href={item.href}
              className="ds-focus inline-flex min-h-11 items-center rounded-lg px-3 text-[13px] font-mono text-slate-300 transition-colors hover:bg-white/5 hover:text-cyan-200"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/8 p-5 ${className}`}
      style={{ background: "rgba(7,16,26,0.80)", backdropFilter: "blur(12px)" }}
    >
      {children}
    </div>
  );
}

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1 rounded-full bg-white/5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${value}%`, background: color }}
      />
    </div>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  // PHASE 107 — `htmlFor` is what makes the visible caption an ACCESSIBLE name.
  // Without it these labels were decorative text sitting next to an unlabelled
  // control, and every field in the fault-report form announced as blank.
  // (104-D2 keeps the association but derives ids with useId via fid(), so a
  // twice-rendered form can never produce duplicate DOM ids.)
  return <label htmlFor={htmlFor} className="block text-[11px] font-mono uppercase tracking-[0.18em] text-slate-400 mb-1.5">{children}</label>;
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-white/6 rounded-xl p-4 space-y-4">
      <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-400/70">{title}</p>
      {children}
    </div>
  );
}

// ─── Analysis result sections ─────────────────────────────────────────────────

function AlarmPanel({ analysis }: { analysis: IndustrialBrainAnalysis }) {
  const t = useTranslations("industrialBrain");
  if (!analysis.alarms.length) {
    return (
      <Panel>
        <SectionHeader title={t("sections.alarmIntelligence")} accent="#38BDF8" />
        <p className="text-[13px] text-slate-400 leading-relaxed">
          {t("alarm.none")}
        </p>
      </Panel>
    );
  }
  return (
    <Panel>
      <SectionHeader title={t("sections.alarmIntelligence")} accent="#38BDF8" />
      <div className="space-y-3">
        {analysis.alarms.map((alarm, i) => {
          const cls = ALARM_COLORS[alarm.severity] ?? ALARM_COLORS.UNKNOWN;
          return (
            <div key={i} className={`rounded-xl border p-4 ${cls.bg} ${cls.border}`}>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <p className="text-sm font-mono text-slate-100 leading-snug">{alarm.alarmText}</p>
                <div className="flex gap-2 shrink-0">
                  <span className={`text-[11px] px-2 py-0.5 rounded border font-mono uppercase ${cls.bg} ${cls.border} ${cls.text}`}>
                    {alarm.severity}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded border bg-white/5 border-white/10 text-slate-400 font-mono">
                    {alarm.source}
                  </span>
                </div>
              </div>
              <p className="text-[13px] text-slate-300 leading-relaxed mb-1">{alarm.interpretation}</p>
              <p className="text-[12px] text-slate-400 leading-relaxed italic">{alarm.possibleMeaning}</p>
              <ConfidenceBar value={alarm.confidence} color="#38BDF8" />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function SignalMatrixPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  const t = useTranslations("industrialBrain");
  return (
    <Panel>
      <SectionHeader title={t("sections.signalMatrix")} accent="#1EC8A4" />
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] font-mono">
          <thead>
            <tr className="border-b border-white/8">
              {[
                t("signalTable.signal"),
                t("signalTable.source"),
                t("signalTable.observed"),
                t("signalTable.status"),
                t("signalTable.conf"),
              ].map(h => (
                <th key={h} className="py-2 px-2 text-left text-[11px] uppercase tracking-widest text-slate-400 font-normal whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.signalMatrix.map((sig, i) => {
              const cls = STATUS_COLORS[sig.status] ?? STATUS_COLORS.UNKNOWN;
              return (
                <tr key={i} className="border-b border-white/4 hover:bg-white/2 transition-colors group">
                  <td className="py-2.5 px-2 text-slate-200 whitespace-nowrap font-semibold">
                    {isFa ? sig.signalNameFa : sig.signalName}
                  </td>
                  <td className="py-2.5 px-2 text-slate-400 whitespace-nowrap">{sig.source}</td>
                  <td className="py-2.5 px-2 text-slate-300 max-w-[200px]">
                    <span className="truncate block" title={sig.observedValue}>{sig.observedValue}</span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] uppercase ${cls.bg} ${cls.border} ${cls.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cls.dot}`} />
                      {sig.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    {sig.confidence > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full bg-cyan-400" style={{ width: `${sig.confidence}%` }} />
                        </div>
                        <span className="text-slate-400">{sig.confidence}%</span>
                      </div>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Next-check hints on hover */}
      <div className="mt-4 space-y-2">
        {analysis.signalMatrix.filter(s => s.status === "UNKNOWN" || s.status === "CRITICAL").slice(0,3).map((sig, i) => (
          <div key={i} className="flex gap-2 text-[12px]">
            <span className={`shrink-0 font-mono ${sig.status === "CRITICAL" ? "text-rose-400" : "text-slate-400"}`}>
              ▸ {isFa ? sig.signalNameFa : sig.signalName}:
            </span>
            <span className="text-slate-400 leading-relaxed">{sig.nextCheck}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ReasoningMapPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  const t = useTranslations("industrialBrain");
  const { reasoningMap } = analysis;
  const nodeTypeColors: Record<string, string> = {
    PRESENT:    "border-cyan-500/40 bg-cyan-500/6 text-cyan-300",
    ABSENT:     "border-slate-500/40 bg-slate-500/6 text-slate-400",
    CONFLICTING:"border-amber-500/40 bg-amber-500/6 text-amber-300",
  };
  const priorityColors: Record<string, string> = {
    IMMEDIATE: "border-rose-500/40 bg-rose-500/6 text-rose-300",
    NEXT:      "border-amber-500/40 bg-amber-500/6 text-amber-300",
    ESCALATE:  "border-violet-500/40 bg-violet-500/6 text-violet-300",
  };
  const riskLevelColors: Record<string, string> = {
    LOW:      "border-emerald-500/40 bg-emerald-500/6 text-emerald-300",
    MEDIUM:   "border-amber-500/40 bg-amber-500/6 text-amber-300",
    HIGH:     "border-orange-500/40 bg-orange-500/6 text-orange-300",
    CRITICAL: "border-rose-500/40 bg-rose-500/6 text-rose-300",
  };

  return (
    <Panel>
      <SectionHeader title={t("sections.reasoningMap")} accent="#818CF8" />
      <p className="text-[12px] text-slate-400 font-mono mb-4">
        {t("reasoning.subtitle")}
      </p>

      {/* ── Row 1: the causal chain, one stage per column ──────────────────
          Evidence → Cause hypotheses → Risk. The three stages carry the same
          nodes, labels, colours and order as before; what changed is that the
          fourth grid cell — a bare horizontal rule with a ▶ glyph floating in
          otherwise empty space — is gone, and Action nodes no longer share a
          quarter-width column with Risk. The stage boundary is now drawn by a
          logical inline-start rule, which mirrors correctly under RTL, and the
          only remaining chevrons sit ON the adjacency they describe. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Evidence */}
        <div className="min-w-0">
          <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">
            {t("reasoning.evidenceNodes")}
          </p>
          <div className="space-y-1.5">
            {reasoningMap.evidenceNodes.map(ev => (
              <div key={ev.id} className={`rounded-lg border px-2 py-1.5 text-[12px] font-mono ${nodeTypeColors[ev.type]}`}>
                <p className="font-semibold truncate">{isFa ? ev.labelFa : ev.label}</p>
                <p className="text-[11px] opacity-60 truncate">{ev.type}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Cause hypotheses */}
        <div className="min-w-0 lg:border-s lg:border-white/8 lg:ps-4">
          <p className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">
            <span aria-hidden="true" className="hidden lg:inline text-slate-500 rtl:-scale-x-100">→</span>
            {t("reasoning.causeHypotheses")}
          </p>
          <div className="space-y-1.5">
            {reasoningMap.causeNodes.map(c => (
              <div key={c.id} className="rounded-lg border border-indigo-500/30 bg-indigo-500/6 px-2 py-1.5 text-[12px] font-mono">
                <p className="text-indigo-300 font-semibold leading-snug">{isFa ? c.labelFa : c.label}</p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="flex-1 h-0.5 rounded-full bg-white/5">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${c.confidence}%` }} />
                  </div>
                  <span className="text-indigo-400 text-[11px]">{c.confidence}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk */}
        <div className="min-w-0 lg:border-s lg:border-white/8 lg:ps-4">
          <p className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">
            <span aria-hidden="true" className="hidden lg:inline text-slate-500 rtl:-scale-x-100">→</span>
            {t("reasoning.riskNodes")}
          </p>
          <div className="space-y-1.5">
            {reasoningMap.riskNodes.map(r => (
              <div key={r.id} className={`rounded-lg border px-2 py-1.5 text-[12px] font-mono ${riskLevelColors[r.level]}`}>
                <p className="font-semibold">{isFa ? r.labelFa : r.label}</p>
                <p className="text-[11px] opacity-60">{r.level}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 2: the actions that chain follows, across the full width ────
          An action node is an operational instruction, often a full sentence
          with a LOTO precondition in it. In a quarter-width column those
          wrapped to a dozen lines each; here they get the whole reasoning-map
          width, two per row from `lg` up and one below it. The ↓ marker sits on
          the real Risk → Action boundary rather than in empty space. */}
      <div className="mt-5 pt-5 border-t border-white/8">
        <p className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">
          <span aria-hidden="true" className="text-slate-500">↓</span>
          {t("reasoning.actionNodes")}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {reasoningMap.actionNodes.map(a => (
            <div key={a.id} className={`min-w-0 rounded-lg border px-3 py-2.5 text-[12px] font-mono ${priorityColors[a.priority]}`}>
              <p className="font-semibold leading-relaxed">{isFa ? a.labelFa : a.label}</p>
              <p className="text-[11px] opacity-60 mt-1">{a.priority}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function UncertaintyPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  const t = useTranslations("industrialBrain");
  const unc = analysis.uncertainty;
  const cls = UNCERTAINTY_COLORS[unc.level];
  return (
    <Panel>
      <SectionHeader title={t("sections.evidenceEntropy")} accent="#F59E0B" />
      <div className="flex flex-wrap items-start gap-4 mb-4">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-mono font-bold ${cls.bg} ${cls.border} ${cls.text}`}>
          <span className={`w-2 h-2 rounded-full animate-pulse ${cls.text.replace("text-","bg-")}`} />
          {t(`uncertaintyLevel.${unc.level}`)}
        </div>
        <p className="flex-1 text-[13px] text-slate-400 leading-relaxed">{isFa ? unc.explanationFa : unc.explanation}</p>
      </div>

      {unc.missingCriticalSignals.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">
            {t("uncertainty.missingCritical")}
          </p>
          <div className="flex flex-wrap gap-2">
            {(isFa ? unc.missingCriticalSignalsFa : unc.missingCriticalSignals).map((s, i) => (
              <span key={i} className="text-[12px] px-2 py-0.5 rounded border bg-rose-500/8 border-rose-500/25 text-rose-400 font-mono">
                ⬡ {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {unc.conflictingSignals.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">
            {t("uncertainty.conflicting")}
          </p>
          <div className="space-y-1">
            {unc.conflictingSignals.map((s, i) => (
              <p key={i} className="text-[12px] text-amber-400 font-mono">⚠ {s}</p>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">
          {t("uncertainty.recommendedEvidence")}
        </p>
        <div className="space-y-1.5">
          {unc.recommendedEvidenceToReduceUncertainty.map((e, i) => (
            <div key={i} className="flex gap-2 text-[12px]">
              <span className="text-cyan-500 shrink-0 mt-0.5">▸</span>
              <span className="text-slate-400 leading-relaxed">{e}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function RiskPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  const t = useTranslations("industrialBrain");
  const risk = analysis.risk;
  const urg = URGENCY_COLORS[risk.urgencyLevel];
  const items = [
    { label: t("risk.production"), value: isFa ? risk.productionImpactFa : risk.productionImpact },
    { label: t("risk.safety"),     value: isFa ? risk.safetyImpactFa    : risk.safetyImpact },
    { label: t("risk.downtime"),   value: isFa ? risk.downtimeRiskFa    : risk.downtimeRisk },
  ];
  return (
    <Panel>
      <SectionHeader title={t("sections.riskUrgency")} accent="#F87171" />
      <div className="flex items-center gap-3 mb-4">
        <span className={`text-lg font-bold font-mono uppercase ${urg}`}>{isFa ? risk.urgencyFa : risk.urgency}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-mono uppercase ${urg.replace("text-","border-").replace("400","400/30")} bg-current/10`}>
          {risk.urgencyLevel}
        </span>
      </div>
      <div className="space-y-2">
        {items.map(it => (
          <div key={it.label} className="flex gap-3 text-[13px]">
            <span className="text-slate-400 font-mono w-36 shrink-0">{it.label}</span>
            <span className="text-slate-300 leading-relaxed">{it.value}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/**
 * The single most-supported hypothesis, given the weight the rest of the page
 * asks the reader to give it.
 *
 * This does NOT duplicate the ranked list: when this panel renders rank 1, the
 * list beside it starts at rank 2 (`skipFirst`). No cause is shown twice and
 * none is dropped. The evidence split is exactly what the deterministic
 * analyzer produces — supporting, missing, suggested check. It has no
 * "contradicting" field, so none is invented here; contradiction at the
 * analysis level is reported by `uncertainty.conflictingSignals` in the
 * Evidence Entropy panel, which is where it is actually computed.
 */
function PrimaryHypothesisPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  const t = useTranslations("industrialBrain");
  const cause = analysis.likelyCauses[0];
  if (!cause) return null;

  return (
    <Panel className="border-violet-400/30">
      <SectionHeader title={t("sections.primaryHypothesis")} accent="#C084FC" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-mono text-violet-300/80">#1</p>
          <p className="mt-1 text-lg font-bold leading-snug text-slate-100">
            {isFa ? cause.titleFa : cause.title}
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-[12px] font-mono uppercase tracking-widest text-slate-400">
            {t("causes.conf")}
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-violet-300">{cause.confidence}%</p>
        </div>
      </div>

      <div className="mt-3">
        <ConfidenceBar value={cause.confidence} color="#C084FC" />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-300">
        {isFa ? cause.explanationFa : cause.explanation}
      </p>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-[12px] font-mono uppercase tracking-widest text-emerald-400 mb-1.5">
            {t("causes.supporting")}
          </p>
          {cause.supportingEvidence.length > 0 ? (
            <ul className="space-y-1">
              {cause.supportingEvidence.map((e, j) => (
                <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-emerald-300/90">
                  <span aria-hidden="true" className="shrink-0 font-mono">✓</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-slate-400">—</p>
          )}
        </div>
        <div>
          <p className="text-[12px] font-mono uppercase tracking-widest text-slate-400 mb-1.5">
            {t("causes.missing")}
          </p>
          {cause.missingEvidence.length > 0 ? (
            <ul className="space-y-1">
              {cause.missingEvidence.map((e, j) => (
                <li key={j} className="flex gap-2 text-[13px] leading-relaxed text-slate-300">
                  <span aria-hidden="true" className="shrink-0 font-mono">○</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-slate-400">—</p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.05] p-3">
        <p className="text-[12px] font-mono uppercase tracking-widest text-cyan-300 mb-1">
          {t("causes.suggestedCheck")}
        </p>
        <p className="text-[13px] leading-relaxed text-slate-200">
          {isFa ? cause.suggestedCheckFa : cause.suggestedCheck}
        </p>
      </div>
    </Panel>
  );
}

function LikelyCausesPanel({ analysis, isFa, skipFirst = false }: { analysis: IndustrialBrainAnalysis; isFa: boolean; skipFirst?: boolean }) {
  const t = useTranslations("industrialBrain");
  // `skipFirst` hands rank 1 to PrimaryHypothesisPanel; the ranks shown here
  // keep their ORIGINAL numbering so a reader comparing the two sees one list.
  const offset = skipFirst ? 1 : 0;
  const causes = skipFirst ? analysis.likelyCauses.slice(1) : analysis.likelyCauses;
  if (skipFirst && causes.length === 0) return null;

  return (
    <Panel>
      <SectionHeader title={t(skipFirst ? "sections.alternativeHypotheses" : "sections.likelyCauses")} accent="#C084FC" />
      <div className="space-y-4">
        {causes.map((cause, i) => (
          <div key={cause.id} className="border border-white/8 rounded-xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-mono text-slate-400">#{i + 1 + offset}</span>
                <p className="text-sm font-semibold text-slate-100">{isFa ? cause.titleFa : cause.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-mono text-slate-400">{t("causes.conf")}</span>
                <span className="text-sm font-bold font-mono text-violet-300">{cause.confidence}%</span>
              </div>
            </div>
            <ConfidenceBar value={cause.confidence} color="#C084FC" />
            <p className="text-[13px] text-slate-400 leading-relaxed mt-3">{isFa ? cause.explanationFa : cause.explanation}</p>

            {cause.supportingEvidence.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-600 mb-1.5">
                  {t("causes.supporting")}
                </p>
                {cause.supportingEvidence.map((e, j) => (
                  <p key={j} className="text-[12px] text-emerald-400/80 font-mono">✓ {e}</p>
                ))}
              </div>
            )}

            {cause.missingEvidence.length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-1.5">
                  {t("causes.missing")}
                </p>
                {cause.missingEvidence.map((e, j) => (
                  <p key={j} className="text-[12px] text-slate-400 font-mono">○ {e}</p>
                ))}
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-white/6">
              <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-1">
                {t("causes.suggestedCheck")}
              </p>
              <p className="text-[13px] text-slate-400 leading-relaxed">{isFa ? cause.suggestedCheckFa : cause.suggestedCheck}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ChecklistPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  const t = useTranslations("industrialBrain");
  const byCategory = analysis.inspectionChecklist.reduce<Record<string, typeof analysis.inspectionChecklist>>((acc, item) => {
    const cat = isFa ? item.categoryFa : item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <Panel>
      <SectionHeader title={t("sections.inspectionChecklist")} accent="#34D399" />
      <div className="space-y-4">
        {Object.entries(byCategory).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[11px] font-mono uppercase tracking-widest text-emerald-500/70 mb-2">{cat}</p>
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex gap-3 text-[13px]">
                  <span className="text-emerald-500 shrink-0 mt-0.5 font-mono">□</span>
                  <span className="text-slate-300 leading-relaxed">
                    {isFa ? item.textFa : item.text}
                    {item.requiresQualifiedPersonnel && (
                      <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono">
                        {t("checklist.qualified")}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ActionsPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  const t = useTranslations("industrialBrain");
  return (
    <Panel>
      <SectionHeader title={t("sections.safeActionPath")} accent="#60B4F0" />
      <div className="space-y-5">
        {analysis.recommendedActions.map(group => (
          <div key={group.category}>
            <div className="flex items-center gap-2 mb-2">
              <span>{group.icon}</span>
              <p className="text-[12px] font-mono uppercase tracking-widest text-sky-400/80">
                {isFa ? group.categoryFa : group.category}
              </p>
            </div>
            <div className="space-y-1.5 ml-6">
              {group.items.map((item, j) => (
                <div key={j} className="flex gap-2 text-[13px]">
                  <span className="text-sky-500 shrink-0 mt-0.5 font-mono">▸</span>
                  <span className="text-slate-300 leading-relaxed">{isFa ? item.fa : item.en}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RelatedKnowledgePanel({ analysis }: { analysis: IndustrialBrainAnalysis }) {
  const t = useTranslations("industrialBrain");
  return (
    <Panel>
      <SectionHeader title={t("sections.relatedKnowledge")} accent="#A78BFA" />
      {analysis.relatedKnowledge.length === 0 ? (
        <p className="text-[13px] text-slate-400 font-mono">
          {t("related.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {analysis.relatedKnowledge.map(k => (
            <div key={k.id} className="border border-violet-500/15 rounded-xl p-3 bg-violet-500/4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-semibold text-slate-200">{k.title}</p>
                <div className="flex gap-1 shrink-0">
                  <span className="text-[11px] px-1.5 py-0.5 rounded border bg-violet-500/10 border-violet-500/25 text-violet-400 font-mono">
                    {k.type}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded border bg-white/4 border-white/8 text-slate-400 font-mono">
                    {k.relevanceScore}%
                  </span>
                </div>
              </div>
              {k.summary && <p className="text-[12px] text-slate-400 leading-relaxed">{k.summary}</p>}
              {k.domain && <p className="text-[11px] font-mono text-violet-500/60 mt-1 uppercase">{k.domain}</p>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/**
 * The human gate, rendered BETWEEN the reasoning and the recommendations.
 *
 * The qualified-personnel / LOTO condition used to be an 10px footnote inside
 * the checklist panel — that is, AFTER the reader had already started reading
 * steps. It is the same catalog string (`checklist.warning`); what changed is
 * that it now stands on its own, ahead of every recommended action, matching
 * the ordering the Phase 101 reference panel already enforces.
 */
function ValidationGate() {
  const t = useTranslations("industrialBrain");
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
      <h3 className="text-[12px] font-mono uppercase tracking-[0.2em] text-amber-400">
        {t("reference.validation.heading")}
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-amber-100">
        {t("checklist.warning")}
      </p>
    </div>
  );
}

/**
 * What the result region shows before an analysis has been requested.
 *
 * The region is not empty markup: it is the target the local navigation and the
 * post-submit scroll both use, so it has to exist on first paint. It states
 * only what is true — nothing has been analysed yet — and claims no readiness.
 */
function AwaitingAnalysis() {
  const t = useTranslations("industrialBrain");
  return (
    <div className="ib-print-hide mt-8 rounded-2xl border border-dashed border-white/12 p-8 text-center">
      <p className="text-[15px] font-semibold text-slate-200">{t("workspace.awaitingHeading")}</p>
      <p className="mx-auto mt-2 max-w-xl text-[13px] leading-relaxed text-slate-400">
        {t("workspace.awaitingBody")}
      </p>
    </div>
  );
}

function ReportHeader({ meta, isFa, locale }: { meta: ReportMeta; isFa: boolean; locale: string }) {
  const t = useTranslations("industrialBrain");
  const notReported = t("reportHeader.notReported");
  const fields = [
    { label: t("reportHeader.assetType"), value: meta.assetType },
    { label: t("reportHeader.systemArea"), value: meta.systemArea },
    { label: t("reportHeader.plcPlatform"), value: meta.plcPlatform },
  ];
  return (
    <Panel className="border-cyan-500/25 ib-report-header">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-400 mb-1.5">
            {t("reportHeader.eyebrow")}
          </p>
          <h2 id="ib-report-heading" className="text-lg font-bold text-slate-100">{t("reportHeader.engineeringReport")}</h2>
          <p className="text-[13px] text-slate-400 mt-0.5">{t("reportHeader.evidencePack")}</p>
        </div>
        <div className="text-end shrink-0">
          <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400">
            {t("reportHeader.generated")}
          </p>
          <p className="text-[13px] font-mono text-slate-400">{fmtDateTime(meta.generatedAt, locale)}</p>
        </div>
      </div>

      <p className="text-sm font-semibold text-slate-200 mb-3">{meta.problemTitle}</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-4 border-b border-white/6">
        {fields.map(f => (
          <div key={f.label}>
            <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-1">{f.label}</p>
            <p className="text-[13px] text-slate-300 break-words">{f.value || notReported}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/6 p-3">
        <p className="text-[12px] text-amber-400 leading-relaxed font-mono">
          {t("reportHeader.disclaimer")}
        </p>
      </div>
    </Panel>
  );
}

function ReportActions({ analysis, meta, isFa, locale, canSaveCase }: {
  analysis: IndustrialBrainAnalysis;
  meta: ReportMeta;
  isFa: boolean;
  locale: string;
  canSaveCase: boolean;
}) {
  const t = useTranslations("industrialBrain");
  const [copied, setCopied] = useState<"summary" | "full" | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleCopy(kind: "summary" | "full") {
    const text = kind === "summary" ? buildSummaryText(analysis, meta, isFa, t) : buildFullReportText(analysis, meta, isFa, locale, t);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(prev => (prev === kind ? null : prev)), 2000);
    }
  }

  // Phase 82: save the analysis as an EngineeringCase draft via the
  // authenticated route — never the public /api/cases endpoint.
  async function handleSave() {
    if (saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/industrial-brain/save-case", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({
          analysis,
          meta: {
            problemTitle: meta.problemTitle,
            assetType:    meta.assetType,
            systemArea:   meta.systemArea,
            plcPlatform:  meta.plcPlatform,
          },
        }),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  const btnBase = "flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-mono text-[12px] font-semibold uppercase tracking-wider border transition-all disabled:opacity-40 disabled:cursor-not-allowed";

  const saveLabel =
    saveState === "saving" ? t("actions.saving")
    : saveState === "error" ? t("actions.saveFailed")
    : t("actions.saveAsCase");

  return (
    <div className="ib-print-hide space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleCopy("summary")}
          disabled={!analysis}
          className={`${btnBase} border-cyan-400/25 bg-cyan-400/[0.06] text-cyan-300 hover:bg-cyan-400/[0.12]`}
        >
          {copied === "summary" ? t("actions.copied") : t("actions.copySummary")}
        </button>
        <button
          type="button"
          onClick={() => handleCopy("full")}
          disabled={!analysis}
          className={`${btnBase} border-violet-400/25 bg-violet-400/[0.06] text-violet-300 hover:bg-violet-400/[0.12]`}
        >
          {copied === "full" ? t("actions.copied") : t("actions.copyFull")}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!analysis}
          className={`${btnBase} border-sky-400/25 bg-sky-400/[0.06] text-sky-300 hover:bg-sky-400/[0.12]`}
        >
          {t("actions.printReport")}
        </button>
      </div>

      {/* Phase 82: save as engineering case (authoring users) or sign-in CTA */}
      <div className="flex flex-wrap items-center gap-3">
        {canSaveCase ? (
          saveState === "saved" ? (
            <Link
              href="/knowledge/case-studio"
              className={`${btnBase} border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300 hover:bg-emerald-400/[0.14]`}
            >
              {t("actions.savedViewStudio")}
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={!analysis || saveState === "saving"}
              className={`${btnBase} ${saveState === "error"
                ? "border-rose-400/30 bg-rose-400/[0.06] text-rose-300 hover:bg-rose-400/[0.12]"
                : "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300 hover:bg-emerald-400/[0.12]"}`}
            >
              {saveLabel}
            </button>
          )
        ) : (
          <>
            <Link
              href={`/auth/login?from=${encodeURIComponent(`/${locale}/industrial-brain`)}`}
              className={`${btnBase} border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300 hover:bg-emerald-400/[0.12]`}
            >
              {t("actions.signInToSave")}
            </Link>
            <Link
              href="/auth/register"
              className="shrink-0 text-[12px] font-mono text-slate-400 hover:text-slate-300 underline underline-offset-4 transition-colors"
            >
              {t("actions.requestAccess")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function AnalysisDemoCTA() {
  const t = useTranslations("industrialBrain");
  return (
    <Panel className="border-cyan-500/20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-400 mb-1">
            {t("demoCta.eyebrow")}
          </p>
          <p className="text-base font-bold text-slate-100">
            {t("demoCta.title")}
          </p>
          <p className="text-[13px] text-slate-400 mt-1">
            {t("demoCta.desc")}
          </p>
        </div>
        <Link
          href="/demo"
          className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-xl font-mono font-semibold text-sm uppercase tracking-wider"
          style={{
            background: "linear-gradient(135deg, rgba(30,200,164,0.15) 0%, rgba(96,180,240,0.15) 100%)",
            border: "1px solid rgba(30,200,164,0.30)",
            color: "#1EC8A4",
          }}
        >
          {t("demoCta.requestDemo")}
          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>
    </Panel>
  );
}

function AnalysisResult({ analysis, meta, isFa, locale, canSaveCase }: {
  analysis: IndustrialBrainAnalysis;
  meta: ReportMeta;
  isFa: boolean;
  locale: string;
  canSaveCase: boolean;
}) {
  const t = useTranslations("industrialBrain");
  /* DASHBOARD ALIGNMENT — the result document is now ordered by decision
     weight rather than by the order the analyzer happens to emit fields:

        decision summary → primary hypothesis → alternatives
          → evidence and uncertainty → risk → human gate
          → safe verification path → report actions and provenance

     Every panel that existed before still renders, with the same data and the
     same strings. Two things MOVED, deliberately: the report action row now
     sits with the report at the end instead of above the reasoning it acts on,
     and the qualified-personnel gate stands between the reasoning and the
     recommendations instead of inside the checklist. */
  return (
    <div className="ib-report-print space-y-5 mt-8">

      {/* ── 1. Decision summary ─────────────────────────────────────────── */}
      <section id="ib-reasoning" className="scroll-mt-32 space-y-5">
        <ReportHeader meta={meta} isFa={isFa} locale={locale} />

        {/* Executive Summary + Classification */}
        <Panel>
          <SectionHeader title={t("sections.executiveSummary")} accent="#1EC8A4" />
          <p className="text-sm text-slate-300 leading-relaxed mb-4">{isFa ? analysis.summaryFa : analysis.summary}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/6">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-1">
                {t("summary.primaryDomain")}
              </p>
              <p className="text-sm font-bold text-cyan-300 font-mono">
                {isFa ? analysis.classification.domainFa : analysis.classification.domain}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-1">
                {t("summary.severity")}
              </p>
              <p className={`text-sm font-bold font-mono ${
                analysis.classification.severity === "CRITICAL" ? "text-rose-400" :
                analysis.classification.severity === "HIGH" ? "text-orange-400" :
                analysis.classification.severity === "MEDIUM" ? "text-amber-400" : "text-emerald-400"
              }`}>{analysis.classification.severity}</p>
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-1">
                {t("summary.diagnosticConfidence")}
              </p>
              <p className="text-sm font-bold text-violet-300 font-mono">{analysis.confidence}%</p>
            </div>
            <div>
              <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-1">
                {t("summary.evidenceEntropy")}
              </p>
              <p className={`text-sm font-bold font-mono ${UNCERTAINTY_COLORS[analysis.uncertainty.level].text}`}>
                {t(`uncertaintyLevel.${analysis.uncertainty.level}`)}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-1.5">
              {t("summary.overallConfidence")}
            </p>
            <ConfidenceBar value={analysis.confidence} color="linear-gradient(90deg, #1EC8A4, #60B4F0)" />
            <p className="text-[12px] text-slate-400 font-mono mt-1">
              {t("summary.engineFootnote", { ms: String(analysis.processingMs) })}
            </p>
          </div>
        </Panel>

        {/* ── 2. The hypothesis the reader is being asked to act on ───────── */}
        {analysis.likelyCauses.length === 0 ? (
          <LikelyCausesPanel analysis={analysis} isFa={isFa} />
        ) : (
          <>
            <PrimaryHypothesisPanel analysis={analysis} isFa={isFa} />
            <ReasoningMapPanel analysis={analysis} isFa={isFa} />
            <LikelyCausesPanel analysis={analysis} isFa={isFa} skipFirst />
          </>
        )}
      </section>

      {/* ── 3. What was observed, and what is still unknown ──────────────
          Signals, alarms, entropy and gaps read as one evidence workspace
          rather than four equal cards scattered through the document. */}
      <section id="ib-evidence" className="scroll-mt-32 space-y-5">
        <SignalMatrixPanel analysis={analysis} isFa={isFa} />
        <AlarmPanel analysis={analysis} />
        <UncertaintyPanel analysis={analysis} isFa={isFa} />

        {analysis.evidenceGaps.length > 0 && (
          <Panel>
            <SectionHeader title={t("sections.evidenceGaps")} accent="#FB923C" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {analysis.evidenceGaps.map((gap, i) => (
                <div key={i} className="border border-orange-500/15 rounded-xl p-3 bg-orange-500/4">
                  <p className="text-sm font-semibold text-orange-300 mb-1">
                    {isFa ? gap.signalFa : gap.signal}
                  </p>
                  <p className="text-[13px] text-slate-400 leading-relaxed">{gap.reason}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </section>

      {/* ── 4. Risk, then the human gate, then advisory verification ─────
          No recommendation is reachable without passing the gate first. */}
      <section id="ib-actions" className="scroll-mt-32 space-y-5">
        <RiskPanel analysis={analysis} isFa={isFa} />
        <ValidationGate />
        <ChecklistPanel analysis={analysis} isFa={isFa} />
        <ActionsPanel analysis={analysis} isFa={isFa} />
      </section>

      {/* ── 5. The report itself: what to take away, and where it came from */}
      <section id="ib-report" className="scroll-mt-32 space-y-5">
        <ReportActions analysis={analysis} meta={meta} isFa={isFa} locale={locale} canSaveCase={canSaveCase} />
        <RelatedKnowledgePanel analysis={analysis} />
        <AnalysisDemoCTA />
      </section>
    </div>
  );
}

// ─── Main workspace ───────────────────────────────────────────────────────────

interface Props { locale: string; isFa: boolean; canSaveCase?: boolean }

export function IndustrialBrainWorkspace({ locale, isFa, canSaveCase = false }: Props) {
  const t = useTranslations("industrialBrain");
  // The safety boundary is read here rather than passed down from the route:
  // it belongs to the workspace it constrains, and reading it from the same
  // namespace keeps the route free of a prop that only forwards catalog text.
  const safetyItems = t.raw("safety.items") as string[];
  // One stable id per field, derived from the control's own `name`, so a
  // label can never point at a field that was renamed underneath it.
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<IndustrialBrainAnalysis | null>(null);
  const [reportMeta, setReportMeta] = useState<ReportMeta | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // PHASE 107 — keyed off the actual locale rather than a fa/not-fa boolean, so
  // German gets German samples instead of silently falling through to English.
  const sampleLang = sampleLocale(locale);

  function loadSample(key: keyof typeof SAMPLE_SCENARIOS) {
    if (!formRef.current) return;
    // Data lookup into the multilingual demo dataset, not display text.
    fillSampleForm(formRef.current, SAMPLE_SCENARIOS[key][sampleLang]);
    setError(null);
  }

  const impactOptions = [
    { v: "", l: t("impact.select") },
    { v: "NONE",     l: t("impact.none") },
    { v: "LOW",      l: t("impact.low") },
    { v: "MEDIUM",   l: t("impact.medium") },
    { v: "HIGH",     l: t("impact.high") },
    { v: "CRITICAL", l: t("impact.critical") },
  ];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Guard against a double submit: an in-flight request must not be duplicated.
    if (busy) return;

    // PHASE 93B — the body is built by the SHARED contract helper, so the
    // client can no longer drift from what the route accepts: every value is a
    // trimmed string and `locale` is a supported tag.
    const body = buildAnalyzeRequest(new FormData(e.currentTarget).entries(), locale);

    // Pre-flight the two hard minimums so the button cannot fire a request the
    // backend is guaranteed to reject.
    const blocking = findBlockingField(body);
    if (blocking) {
      setError(t(blocking === "problemTitle" ? "form.titleTooShort" : "form.symptomsTooShort"));
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/industrial-brain/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // The body may not be JSON (proxy error page, gateway timeout), so parse
      // defensively and keep each failure class distinguishable.
      const data = (await res.json().catch(() => null)) as
        | { ok: boolean; analysis?: IndustrialBrainAnalysis; error?: string; field?: string }
        | null;

      if (!res.ok || !data?.ok) {
        setError(errorMessageFor(res.status, data?.field));
        return;
      }

      setAnalysis(data.analysis ?? null);
      setReportMeta({
        problemTitle: body.problemTitle ?? "",
        assetType: body.assetType ?? "",
        systemArea: body.systemArea ?? "",
        plcPlatform: body.plcPlatform ?? "",
        generatedAt: new Date(),
      });
      // Scroll behaviour is unchanged; focus is added. Moving the caret into
      // the result region means a keyboard or screen-reader user continues
      // from the answer instead of from the submit button they just left,
      // and `preventScroll` keeps the smooth scroll below authoritative.
      setTimeout(() => {
        resultRef.current?.focus({ preventScroll: true });
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    } catch {
      // Network/abort only — a non-2xx response is handled above.
      setError(t("form.connectionError"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * A localized message per failure class. The server's own validation text is
   * deliberately NOT rendered: it is English-only and can echo schema wording,
   * so the safe `field` name is mapped to a catalog message instead. Nothing
   * from the response body is ever rendered verbatim.
   */
  function errorMessageFor(status: number, field?: string): string {
    if (status === 401 || status === 403) return t("form.authError");
    if (status === 429) return t("form.rateLimited");
    if (status >= 500) return t("form.serverError");
    if (field === "problemTitle") return t("form.titleTooShort");
    if (field === "observedSymptoms") return t("form.symptomsTooShort");
    return t("form.validationError");
  }

  return (
    <div>
      <SectionNav hasAnalysis={Boolean(analysis && reportMeta)} />

      {/* ── Fault analysis workspace ───────────────────────────────────────
          The workspace owns its own card now. It used to be wrapped by the
          route in a chrome bar carrying three inert window dots and a pulsing
          "ONLINE" badge — decoration and a liveness claim on a surface with no
          live connection. What remains is the heading the bar already had. */}
      <section
        id="ib-analyze"
        aria-labelledby="ib-analyze-heading"
        className="scroll-mt-32 rounded-2xl border border-white/8 overflow-hidden print:hidden"
        style={{ background: "rgba(7,16,26,0.85)" }}
      >
        <div className="border-b border-white/6 px-5 py-4">
          <h2 id="ib-analyze-heading" className="text-[13px] font-mono uppercase tracking-[0.18em] text-slate-300">
            {t("workspace.header")}
          </h2>
        </div>
        {/* Gradient accent line */}
        <div className="h-px" aria-hidden="true" style={{ background: "linear-gradient(90deg, #1EC8A4, #60B4F0, #818CF8)" }} />

        {/* ── The advisory boundary, immediately above the input ──────────
            It used to sit in a sidebar under six capability cards, which on a
            phone put it AFTER the form and, on desktop, in the column a reader
            scanning the form never looks at. Same catalog strings; it now
            opens the workspace it constrains. */}
        <div className="border-b border-amber-500/20 bg-amber-500/[0.05] px-4 sm:px-5 py-3.5">
          <p className="text-[12px] font-mono uppercase tracking-[0.2em] text-amber-400">
            {t("safety.heading")}
          </p>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {safetyItems.map((item, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed">
                <span aria-hidden="true" className="text-amber-500 shrink-0">▸</span>
                <span className="text-slate-300">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-4 sm:px-5 py-6">
          {/* ── Demo-ready examples ────────────────────────────────────────────── */}
          <div className="print:hidden mb-5 rounded-xl border border-white/8 p-3.5" style={{ background: "rgba(7,16,26,0.6)" }}>
            <p className="text-[12px] font-mono uppercase tracking-[0.18em] text-slate-400 mb-2.5">
              {t("form.demoExamples")}
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SAMPLE_SCENARIOS) as Array<keyof typeof SAMPLE_SCENARIOS>).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => loadSample(key)}
                  className="ds-focus inline-flex min-h-11 items-center text-[12px] font-mono px-3 py-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300 hover:bg-cyan-400/[0.12] hover:border-cyan-400/35 transition-all"
                >
                  {/* Multilingual demo-dataset caption (locale content data). */}
                  {SAMPLE_SCENARIOS[key].labels[sampleLang]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Input Form ─────────────────────────────────────────────────────── */}
          <form ref={formRef} onSubmit={handleSubmit} className="print:hidden space-y-5">

            {/* Problem title + asset */}
            <FormSection title={t("form.faultIdentification")}>
              <div>
                <FieldLabel htmlFor={fid("problemTitle")}>{t("form.problemTitle")}</FieldLabel>
                <input id={fid("problemTitle")} name="problemTitle" required minLength={3} maxLength={200} className={IC} style={{ colorScheme: "dark" }}
                  placeholder={t("form.problemTitlePh")}
                />
              </div>
              <FormRow>
                <div>
                  <FieldLabel htmlFor={fid("assetType")}>{t("form.assetType")}</FieldLabel>
                  <input id={fid("assetType")} name="assetType" maxLength={150} className={IC} style={{ colorScheme: "dark" }}
                    placeholder={t("form.assetTypePh")}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={fid("systemArea")}>{t("form.systemArea")}</FieldLabel>
                  <input id={fid("systemArea")} name="systemArea" maxLength={150} className={IC} style={{ colorScheme: "dark" }}
                    placeholder={t("form.systemAreaPh")}
                  />
                </div>
              </FormRow>
              <FormRow>
                <div>
                  <FieldLabel htmlFor={fid("plcPlatform")}>{t("form.plcPlatform")}</FieldLabel>
                  <input id={fid("plcPlatform")} name="plcPlatform" maxLength={100} className={IC} style={{ colorScheme: "dark" }}
                    placeholder={t("form.plcPlatformPh")}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={fid("recentChanges")}>{t("form.recentChanges")}</FieldLabel>
                  <input id={fid("recentChanges")} name="recentChanges" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                    placeholder={t("form.recentChangesPh")}
                  />
                </div>
              </FormRow>
            </FormSection>

            {/* Symptoms + alarms */}
            <FormSection title={t("form.symptomsSection")}>
              <div>
                <FieldLabel htmlFor={fid("observedSymptoms")}>{t("form.observedSymptoms")}</FieldLabel>
                <textarea id={fid("observedSymptoms")} name="observedSymptoms" required minLength={5} maxLength={3000} rows={4} className={TC} style={{ colorScheme: "dark" }}
                  placeholder={t("form.observedSymptomsPh")}
                />
              </div>
              <div>
                <FieldLabel htmlFor={fid("activeAlarms")}>{t("form.alarms")}</FieldLabel>
                <textarea id={fid("activeAlarms")} name="activeAlarms" maxLength={1500} rows={3} className={TC} style={{ colorScheme: "dark" }}
                  placeholder={t("form.alarmsPh")}
                />
              </div>
            </FormSection>

            {/* Signal states */}
            <FormSection title={t("form.signalStates")}>
              <p className="text-[12px] text-slate-400 font-mono -mt-1">
                {t("form.signalStatesNote")}
              </p>
              <FormRow>
                <div>
                  <FieldLabel htmlFor={fid("hmiCommandState")}>{t("form.hmiCommand")}</FieldLabel>
                  <input id={fid("hmiCommandState")} name="hmiCommandState" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                    placeholder={t("form.hmiCommandPh")}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={fid("plcOutputState")}>{t("form.plcOutput")}</FieldLabel>
                  <input id={fid("plcOutputState")} name="plcOutputState" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                    placeholder={t("form.plcOutputPh")}
                  />
                </div>
              </FormRow>
              <FormRow>
                <div>
                  <FieldLabel htmlFor={fid("vfdMccState")}>{t("form.vfdMcc")}</FieldLabel>
                  <input id={fid("vfdMccState")} name="vfdMccState" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                    placeholder={t("form.vfdMccPh")}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={fid("interlockStatus")}>{t("form.interlock")}</FieldLabel>
                  <input id={fid("interlockStatus")} name="interlockStatus" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                    placeholder={t("form.interlockPh")}
                  />
                </div>
              </FormRow>
              <FormRow>
                <div>
                  <FieldLabel htmlFor={fid("sensorFeedback")}>{t("form.sensorFeedback")}</FieldLabel>
                  <input id={fid("sensorFeedback")} name="sensorFeedback" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                    placeholder={t("form.sensorFeedbackPh")}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={fid("observedSignals")}>{t("form.otherSignals")}</FieldLabel>
                  <input id={fid("observedSignals")} name="observedSignals" maxLength={1000} className={IC} style={{ colorScheme: "dark" }}
                    placeholder={t("form.otherSignalsPh")}
                  />
                </div>
              </FormRow>
            </FormSection>

            {/* Impact */}
            <FormSection title={t("form.impactAssessment")}>
              <FormRow>
                <div>
                  <FieldLabel htmlFor={fid("productionImpact")}>{t("form.productionImpact")}</FieldLabel>
                  <select id={fid("productionImpact")} name="productionImpact" className={SC} style={{ colorScheme: "dark" }}>
                    {impactOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel htmlFor={fid("safetyImpact")}>{t("form.safetyImpact")}</FieldLabel>
                  <select id={fid("safetyImpact")} name="safetyImpact" className={SC} style={{ colorScheme: "dark" }}>
                    {impactOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              </FormRow>
            </FormSection>

            {/* Already checked + additional */}
            <FormSection title={t("form.alreadyCheckedSection")}>
              <div>
                <FieldLabel htmlFor={fid("alreadyChecked")}>{t("form.alreadyChecked")}</FieldLabel>
                <textarea id={fid("alreadyChecked")} name="alreadyChecked" maxLength={1000} rows={2} className={TC} style={{ colorScheme: "dark" }}
                  placeholder={t("form.alreadyCheckedPh")}
                />
              </div>
              <div>
                <FieldLabel htmlFor={fid("additionalInfo")}>{t("form.additionalInfo")}</FieldLabel>
                <textarea id={fid("additionalInfo")} name="additionalInfo" maxLength={1000} rows={2} className={TC} style={{ colorScheme: "dark" }}
                  placeholder={t("form.additionalInfoPh")}
                />
              </div>
            </FormSection>

            {/* Warning */}
            <p className="text-[12px] text-slate-400 font-mono text-center">
              {t("form.privacyWarning")}
            </p>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/30 bg-rose-500/6 px-4 py-3 text-sm text-rose-400 font-mono"
              >
                {error}
              </div>
            )}

            {/* The busy state was conveyed only by a spinner and a changed button
                caption on a control that is simultaneously disabled — which no
                screen reader reliably announces. This says it once, politely. */}
            <p role="status" aria-live="polite" className="sr-only">
              {busy ? t("form.analyzing") : ""}
            </p>

            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="ds-focus w-full h-12 rounded-xl font-mono font-bold text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
              style={{
                background: busy
                  ? "rgba(30,200,164,0.12)"
                  : "linear-gradient(135deg, rgba(30,200,164,0.85) 0%, rgba(96,180,240,0.85) 100%)",
                color: busy ? "#1EC8A4" : "#050816",
                border: "1px solid rgba(30,200,164,0.30)",
              }}
            >
              {busy && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
              {busy ? t("form.analyzing") : t("form.analyze")}
            </button>
          </form>
        </div>
      </section>

      {/* ── Analysis result ──────────────────────────────────────────────────
          The container is rendered unconditionally: it is the scroll target the
          submit handler focuses and the anchor the local navigation resolves,
          so it has to exist before the first analysis, not after it. */}
      <div ref={resultRef} tabIndex={-1} className="outline-none">
        {analysis && reportMeta
          ? <AnalysisResult analysis={analysis} meta={reportMeta} isFa={isFa} locale={locale} canSaveCase={canSaveCase} />
          : <AwaitingAnalysis />}
      </div>
    </div>
  );
}
