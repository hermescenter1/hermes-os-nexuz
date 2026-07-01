"use client";

import { useState, useRef } from "react";
import { Link } from "@/i18n/navigation";
import type { IndustrialBrainAnalysis, UncertaintyLevel } from "@/lib/industrial-brain/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const IC = "w-full rounded-xl px-3 py-2.5 text-sm bg-[#0C1420] text-slate-100 border border-white/10 placeholder:text-slate-500 focus:outline-none focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20 transition-all font-mono";
const SC = "w-full rounded-xl px-3 py-2 text-sm bg-[#0C1420] text-slate-100 border border-white/10 focus:outline-none focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20 transition-all font-mono";
const TC = "w-full rounded-xl px-3 py-2.5 text-sm bg-[#0C1420] text-slate-100 border border-white/10 placeholder:text-slate-500 focus:outline-none focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/20 transition-all resize-none font-mono";

const STATUS_COLORS = {
  NORMAL:   { bg: "bg-emerald-500/10",   border: "border-emerald-500/30",   text: "text-emerald-400",   dot: "bg-emerald-400" },
  WARNING:  { bg: "bg-amber-500/10",     border: "border-amber-500/30",     text: "text-amber-400",     dot: "bg-amber-400" },
  CRITICAL: { bg: "bg-rose-500/10",      border: "border-rose-500/30",      text: "text-rose-400",      dot: "bg-rose-400" },
  UNKNOWN:  { bg: "bg-slate-500/10",     border: "border-slate-500/30",     text: "text-slate-500",     dot: "bg-slate-500" },
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

type SampleFields = Record<string, string>;

const SAMPLE_SCENARIOS: Record<string, { labelEn: string; labelFa: string; en: SampleFields; fa: SampleFields }> = {
  conveyor: {
    labelEn: "Load conveyor motor sample",
    labelFa: "بارگذاری نمونه موتور کانوایر",
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
  },
  vfdPump: {
    labelEn: "Load VFD pump fault sample",
    labelFa: "بارگذاری نمونه خرابی VFD پمپ",
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
  },
  sensorFeedback: {
    labelEn: "Load sensor feedback sample",
    labelFa: "بارگذاری نمونه فیدبک سنسور",
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

function fmtDateTime(date: Date, isFa: boolean): string {
  try {
    return new Intl.DateTimeFormat(isFa ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return date.toISOString();
  }
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

function uncertaintyLabel(level: UncertaintyLevel, isFa: boolean): string {
  if (!isFa) return level;
  return level === "HIGH" ? "بالا" : level === "MEDIUM" ? "متوسط" : "پایین";
}

function buildSummaryText(analysis: IndustrialBrainAnalysis, meta: ReportMeta, isFa: boolean): string {
  const top = analysis.likelyCauses[0];
  const nextChecks = analysis.likelyCauses.slice(0, 3).map(c => (isFa ? c.suggestedCheckFa : c.suggestedCheck)).filter(Boolean);

  const lines = isFa
    ? [
        `عنوان مشکل: ${meta.problemTitle}`,
        top ? `فرضیه اصلی: ${top.titleFa} (اطمینان ${top.confidence}%)` : "فرضیه‌ای شناسایی نشد",
        `آنتروپی شواهد: ${uncertaintyLabel(analysis.uncertainty.level, true)}`,
        `فوریت: ${analysis.risk.urgencyFa} (${analysis.risk.urgencyLevel})`,
        "بررسی‌های بعدی کلیدی:",
        ...(nextChecks.length ? nextChecks.map(c => `- ${c}`) : ["- بررسی مشخصی ثبت نشده است"]),
      ]
    : [
        `Problem: ${meta.problemTitle}`,
        top ? `Top hypothesis: ${top.title} (${top.confidence}% confidence)` : "No hypothesis identified",
        `Evidence entropy: ${analysis.uncertainty.level}`,
        `Urgency: ${analysis.risk.urgency} (${analysis.risk.urgencyLevel})`,
        "Key next checks:",
        ...(nextChecks.length ? nextChecks.map(c => `- ${c}`) : ["- No specific check recorded"]),
      ];

  return lines.join("\n");
}

function buildFullReportText(analysis: IndustrialBrainAnalysis, meta: ReportMeta, isFa: boolean): string {
  const L = (en: string, fa: string) => (isFa ? fa : en);
  const sec = (title: string) => `\n── ${title} ──\n`;
  const lines: string[] = [];

  lines.push(L("HERMES INDUSTRIAL BRAIN — ENGINEERING REPORT", "مغز صنعتی هرمس — گزارش مهندسی"));
  lines.push(`${L("Title", "عنوان")}: ${meta.problemTitle}`);
  lines.push(`${L("Asset Type", "نوع دارایی")}: ${meta.assetType || L("Not reported", "گزارش نشده")}`);
  lines.push(`${L("System Area", "ناحیه سیستم")}: ${meta.systemArea || L("Not reported", "گزارش نشده")}`);
  lines.push(`${L("PLC / Platform", "پلتفرم PLC")}: ${meta.plcPlatform || L("Not reported", "گزارش نشده")}`);
  lines.push(`${L("Generated", "تولید شده در")}: ${fmtDateTime(meta.generatedAt, isFa)}`);

  lines.push(sec(L("Executive Summary", "خلاصه اجرایی")));
  lines.push(isFa ? analysis.summaryFa : analysis.summary);
  lines.push(`${L("Primary Domain", "حوزه اصلی")}: ${isFa ? analysis.classification.domainFa : analysis.classification.domain}`);
  lines.push(`${L("Severity", "شدت")}: ${analysis.classification.severity}`);
  lines.push(`${L("Diagnostic Confidence", "اطمینان تشخیصی")}: ${analysis.confidence}%`);
  lines.push(`${L("Evidence Entropy", "آنتروپی شواهد")}: ${uncertaintyLabel(analysis.uncertainty.level, isFa)}`);

  lines.push(sec(L("Alarm Intelligence", "هوشمندی آلارم")));
  if (!analysis.alarms.length) {
    lines.push(L(
      "No alarm was reported. The absence of a reported alarm does not confirm healthy operation.",
      "هیچ آلارمی گزارش نشده است. عدم وجود آلارم گزارش‌شده، سالم بودن عملکرد را تأیید نمی‌کند."
    ));
  } else {
    for (const a of analysis.alarms) {
      lines.push(`- [${a.severity}] ${a.alarmText} (${a.source})`);
      lines.push(`  ${a.interpretation}`);
      lines.push(`  ${a.possibleMeaning}`);
    }
  }

  lines.push(sec(L("Signal Matrix", "ماتریس سیگنال")));
  for (const s of analysis.signalMatrix) {
    lines.push(`- ${isFa ? s.signalNameFa : s.signalName} | ${s.source} | ${L("Observed", "مشاهده‌شده")}: ${s.observedValue} | ${L("Expected", "مورد انتظار")}: ${s.expectedValue} | ${L("Status", "وضعیت")}: ${s.status} | ${L("Next check", "بررسی بعدی")}: ${s.nextCheck}`);
  }

  lines.push(sec(L("Evidence Entropy", "آنتروپی شواهد")));
  lines.push(`${L("Level", "سطح")}: ${uncertaintyLabel(analysis.uncertainty.level, isFa)}`);
  lines.push(isFa ? analysis.uncertainty.explanationFa : analysis.uncertainty.explanation);
  if (analysis.uncertainty.missingCriticalSignals.length) {
    lines.push(`${L("Missing Critical Signals", "سیگنال‌های حیاتی مفقود")}: ${(isFa ? analysis.uncertainty.missingCriticalSignalsFa : analysis.uncertainty.missingCriticalSignals).join(", ")}`);
  }

  lines.push(sec(L("Likely Causes", "علل محتمل")));
  analysis.likelyCauses.forEach((c, i) => {
    lines.push(`${i + 1}. ${isFa ? c.titleFa : c.title} (${c.confidence}%)`);
    lines.push(`   ${isFa ? c.explanationFa : c.explanation}`);
    if (c.supportingEvidence.length) lines.push(`   ${L("Supporting", "شواهد پشتیبان")}: ${c.supportingEvidence.join("; ")}`);
    if (c.missingEvidence.length) lines.push(`   ${L("Missing", "شواهد مفقود")}: ${c.missingEvidence.join("; ")}`);
    lines.push(`   ${L("Suggested check", "بررسی پیشنهادی")}: ${isFa ? c.suggestedCheckFa : c.suggestedCheck}`);
  });

  lines.push(sec(L("Safe Action Path", "مسیر اقدام ایمن")));
  for (const group of analysis.recommendedActions) {
    lines.push(`${group.icon} ${isFa ? group.categoryFa : group.category}`);
    for (const item of group.items) lines.push(`  - ${isFa ? item.fa : item.en}`);
  }

  lines.push(sec(L("Disclaimer", "سلب مسئولیت")));
  lines.push(L("Decision-support report.", "گزارش پشتیبان تصمیم‌گیری."));
  lines.push(L("Not a certified safety report.", "گزارش ایمنی تأییدشده نیست."));
  lines.push(L("Verify with qualified personnel and site procedures.", "با پرسنل متخصص و رویه‌های ایمنی سایت راستی‌آزمایی شود."));

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

function SectionHeader({ label, labelFa, accent, isFa }: { label: string; labelFa: string; accent: string; isFa: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-0.5 h-5 rounded-full shrink-0" style={{ background: accent }} />
      <p className="text-[9px] font-mono uppercase tracking-[0.2em]" style={{ color: accent }}>
        {isFa ? labelFa : label}
      </p>
    </div>
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-1.5">{children}</label>;
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function FormSection({ title, titleFa, isFa, children }: { title: string; titleFa: string; isFa: boolean; children: React.ReactNode }) {
  return (
    <div className="border border-white/6 rounded-xl p-4 space-y-4">
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-400/70">{isFa ? titleFa : title}</p>
      {children}
    </div>
  );
}

// ─── Analysis result sections ─────────────────────────────────────────────────

function AlarmPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  if (!analysis.alarms.length) {
    return (
      <Panel>
        <SectionHeader label="Alarm Intelligence" labelFa="هوشمندی آلارم" accent="#38BDF8" isFa={isFa} />
        <p className="text-xs text-slate-400 leading-relaxed">
          {isFa
            ? "هیچ آلارمی گزارش نشده است. عدم وجود آلارم گزارش‌شده، سالم بودن عملکرد را تأیید نمی‌کند — سیم‌بندی میدانی، VFD، MCC یا وضعیت مکانیکی را جداگانه بررسی کنید."
            : "No alarm was reported. The absence of a reported alarm does not confirm healthy operation — check field wiring, VFD, MCC, or mechanical state separately."}
        </p>
      </Panel>
    );
  }
  return (
    <Panel>
      <SectionHeader label="Alarm Intelligence" labelFa="هوشمندی آلارم" accent="#38BDF8" isFa={isFa} />
      <div className="space-y-3">
        {analysis.alarms.map((alarm, i) => {
          const cls = ALARM_COLORS[alarm.severity] ?? ALARM_COLORS.UNKNOWN;
          return (
            <div key={i} className={`rounded-xl border p-4 ${cls.bg} ${cls.border}`}>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <p className="text-sm font-mono text-slate-100 leading-snug">{alarm.alarmText}</p>
                <div className="flex gap-2 shrink-0">
                  <span className={`text-[9px] px-2 py-0.5 rounded border font-mono uppercase ${cls.bg} ${cls.border} ${cls.text}`}>
                    {alarm.severity}
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded border bg-white/5 border-white/10 text-slate-500 font-mono">
                    {alarm.source}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-1">{alarm.interpretation}</p>
              <p className="text-[11px] text-slate-500 leading-relaxed italic">{alarm.possibleMeaning}</p>
              <ConfidenceBar value={alarm.confidence} color="#38BDF8" />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function SignalMatrixPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  return (
    <Panel>
      <SectionHeader label="Signal Matrix" labelFa="ماتریس سیگنال" accent="#1EC8A4" isFa={isFa} />
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="border-b border-white/8">
              {[
                isFa ? "سیگنال" : "Signal",
                isFa ? "منبع" : "Source",
                isFa ? "مقدار مشاهده‌شده" : "Observed",
                isFa ? "وضعیت" : "Status",
                isFa ? "اطمینان" : "Conf.",
              ].map(h => (
                <th key={h} className="py-2 px-2 text-left text-[9px] uppercase tracking-widest text-slate-600 font-normal whitespace-nowrap">
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
                  <td className="py-2.5 px-2 text-slate-500 whitespace-nowrap">{sig.source}</td>
                  <td className="py-2.5 px-2 text-slate-300 max-w-[200px]">
                    <span className="truncate block" title={sig.observedValue}>{sig.observedValue}</span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] uppercase ${cls.bg} ${cls.border} ${cls.text}`}>
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
                        <span className="text-slate-500">{sig.confidence}%</span>
                      </div>
                    ) : <span className="text-slate-600">—</span>}
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
          <div key={i} className="flex gap-2 text-[10px]">
            <span className={`shrink-0 font-mono ${sig.status === "CRITICAL" ? "text-rose-400" : "text-slate-500"}`}>
              ▸ {isFa ? sig.signalNameFa : sig.signalName}:
            </span>
            <span className="text-slate-500 leading-relaxed">{sig.nextCheck}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ReasoningMapPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  const { reasoningMap } = analysis;
  const nodeTypeColors: Record<string, string> = {
    PRESENT:    "border-cyan-500/40 bg-cyan-500/6 text-cyan-300",
    ABSENT:     "border-slate-500/40 bg-slate-500/6 text-slate-500",
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
      <SectionHeader label="Hermes Neural Reasoning Map" labelFa="نقشه استدلال عصبی هرمس" accent="#818CF8" isFa={isFa} />
      <p className="text-[10px] text-slate-600 font-mono mb-4">
        {isFa
          ? "موتور استدلال قطعی — شواهد → فرضیه علت → گره ریسک → اقدام"
          : "Deterministic reasoning engine — Evidence → Cause Hypothesis → Risk Node → Action"}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Evidence */}
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-2">
            {isFa ? "گره‌های شواهد" : "Evidence Nodes"}
          </p>
          <div className="space-y-1.5">
            {reasoningMap.evidenceNodes.map(ev => (
              <div key={ev.id} className={`rounded-lg border px-2 py-1.5 text-[10px] font-mono ${nodeTypeColors[ev.type]}`}>
                <p className="font-semibold truncate">{isFa ? ev.labelFa : ev.label}</p>
                <p className="text-[9px] opacity-60 truncate">{ev.type}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Arrow */}
        <div className="hidden lg:flex items-center justify-center">
          <div className="w-full h-px bg-white/10 relative">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-600">▶</div>
          </div>
        </div>

        {/* Cause hypotheses */}
        <div>
          <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-2">
            {isFa ? "فرضیه‌های علت" : "Cause Hypotheses"}
          </p>
          <div className="space-y-1.5">
            {reasoningMap.causeNodes.map(c => (
              <div key={c.id} className="rounded-lg border border-indigo-500/30 bg-indigo-500/6 px-2 py-1.5 text-[10px] font-mono">
                <p className="text-indigo-300 font-semibold leading-snug">{isFa ? c.labelFa : c.label}</p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="flex-1 h-0.5 rounded-full bg-white/5">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${c.confidence}%` }} />
                  </div>
                  <span className="text-indigo-400 text-[9px]">{c.confidence}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk + Action */}
        <div className="space-y-3">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-2">
              {isFa ? "گره‌های ریسک" : "Risk Nodes"}
            </p>
            <div className="space-y-1.5">
              {reasoningMap.riskNodes.map(r => (
                <div key={r.id} className={`rounded-lg border px-2 py-1.5 text-[10px] font-mono ${riskLevelColors[r.level]}`}>
                  <p className="font-semibold">{isFa ? r.labelFa : r.label}</p>
                  <p className="text-[9px] opacity-60">{r.level}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-2">
              {isFa ? "گره‌های اقدام" : "Action Nodes"}
            </p>
            <div className="space-y-1.5">
              {reasoningMap.actionNodes.map(a => (
                <div key={a.id} className={`rounded-lg border px-2 py-1.5 text-[10px] font-mono ${priorityColors[a.priority]}`}>
                  <p className="font-semibold leading-snug">{isFa ? a.labelFa : a.label}</p>
                  <p className="text-[9px] opacity-60">{a.priority}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function UncertaintyPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  const unc = analysis.uncertainty;
  const cls = UNCERTAINTY_COLORS[unc.level];
  return (
    <Panel>
      <SectionHeader label="Evidence Entropy" labelFa="آنتروپی شواهد" accent="#F59E0B" isFa={isFa} />
      <div className="flex flex-wrap items-start gap-4 mb-4">
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-mono font-bold ${cls.bg} ${cls.border} ${cls.text}`}>
          <span className={`w-2 h-2 rounded-full animate-pulse ${cls.text.replace("text-","bg-")}`} />
          {isFa ? (unc.level === "HIGH" ? "بالا" : unc.level === "MEDIUM" ? "متوسط" : "پایین") : unc.level}
        </div>
        <p className="flex-1 text-xs text-slate-400 leading-relaxed">{isFa ? unc.explanationFa : unc.explanation}</p>
      </div>

      {unc.missingCriticalSignals.length > 0 && (
        <div className="mb-4">
          <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-2">
            {isFa ? "سیگنال‌های حیاتی مفقود" : "Missing Critical Signals"}
          </p>
          <div className="flex flex-wrap gap-2">
            {(isFa ? unc.missingCriticalSignalsFa : unc.missingCriticalSignals).map((s, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded border bg-rose-500/8 border-rose-500/25 text-rose-400 font-mono">
                ⬡ {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {unc.conflictingSignals.length > 0 && (
        <div className="mb-4">
          <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-2">
            {isFa ? "سیگنال‌های متعارض" : "Conflicting Signals"}
          </p>
          <div className="space-y-1">
            {unc.conflictingSignals.map((s, i) => (
              <p key={i} className="text-[11px] text-amber-400 font-mono">⚠ {s}</p>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-2">
          {isFa ? "شواهد پیشنهادی برای کاهش عدم قطعیت" : "Recommended Evidence to Reduce Uncertainty"}
        </p>
        <div className="space-y-1.5">
          {unc.recommendedEvidenceToReduceUncertainty.map((e, i) => (
            <div key={i} className="flex gap-2 text-[11px]">
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
  const risk = analysis.risk;
  const urg = URGENCY_COLORS[risk.urgencyLevel];
  const items = [
    { label: isFa ? "تأثیر تولید" : "Production Impact", value: isFa ? risk.productionImpactFa : risk.productionImpact },
    { label: isFa ? "تأثیر ایمنی" : "Safety Impact",     value: isFa ? risk.safetyImpactFa    : risk.safetyImpact },
    { label: isFa ? "ریسک توقف"  : "Downtime Risk",       value: isFa ? risk.downtimeRiskFa    : risk.downtimeRisk },
  ];
  return (
    <Panel>
      <SectionHeader label="Risk & Urgency" labelFa="ریسک و فوریت" accent="#F87171" isFa={isFa} />
      <div className="flex items-center gap-3 mb-4">
        <span className={`text-lg font-bold font-mono uppercase ${urg}`}>{isFa ? risk.urgencyFa : risk.urgency}</span>
        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-mono uppercase ${urg.replace("text-","border-").replace("400","400/30")} bg-current/10`}>
          {risk.urgencyLevel}
        </span>
      </div>
      <div className="space-y-2">
        {items.map(it => (
          <div key={it.label} className="flex gap-3 text-xs">
            <span className="text-slate-600 font-mono w-36 shrink-0">{it.label}</span>
            <span className="text-slate-300 leading-relaxed">{it.value}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function LikelyCausesPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  return (
    <Panel>
      <SectionHeader label="Likely Causes" labelFa="علل محتمل" accent="#C084FC" isFa={isFa} />
      <div className="space-y-4">
        {analysis.likelyCauses.map((cause, i) => (
          <div key={cause.id} className="border border-white/8 rounded-xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-600">#{i + 1}</span>
                <p className="text-sm font-semibold text-slate-100">{isFa ? cause.titleFa : cause.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[9px] font-mono text-slate-500">{isFa ? "اطمینان" : "CONF"}</span>
                <span className="text-sm font-bold font-mono text-violet-300">{cause.confidence}%</span>
              </div>
            </div>
            <ConfidenceBar value={cause.confidence} color="#C084FC" />
            <p className="text-xs text-slate-400 leading-relaxed mt-3">{isFa ? cause.explanationFa : cause.explanation}</p>

            {cause.supportingEvidence.length > 0 && (
              <div className="mt-3">
                <p className="text-[9px] font-mono uppercase tracking-widest text-emerald-600 mb-1.5">
                  {isFa ? "شواهد پشتیبان" : "Supporting Evidence"}
                </p>
                {cause.supportingEvidence.map((e, j) => (
                  <p key={j} className="text-[11px] text-emerald-400/80 font-mono">✓ {e}</p>
                ))}
              </div>
            )}

            {cause.missingEvidence.length > 0 && (
              <div className="mt-2">
                <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-1.5">
                  {isFa ? "شواهد مفقود" : "Missing Evidence"}
                </p>
                {cause.missingEvidence.map((e, j) => (
                  <p key={j} className="text-[11px] text-slate-500 font-mono">○ {e}</p>
                ))}
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-white/6">
              <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-1">
                {isFa ? "بررسی پیشنهادی" : "Suggested Check"}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">{isFa ? cause.suggestedCheckFa : cause.suggestedCheck}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ChecklistPanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  const byCategory = analysis.inspectionChecklist.reduce<Record<string, typeof analysis.inspectionChecklist>>((acc, item) => {
    const cat = isFa ? item.categoryFa : item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <Panel>
      <SectionHeader label="Inspection Checklist" labelFa="چک‌لیست بررسی" accent="#34D399" isFa={isFa} />
      <p className="text-[10px] text-slate-600 font-mono mb-4">
        {isFa
          ? "⚠ همه بررسی‌های برق/مکانیک نیاز به پرسنل متخصص، LOTO و رویه‌های سایت دارند."
          : "⚠ All electrical/mechanical checks require qualified personnel, LOTO, and site safety procedures."}
      </p>
      <div className="space-y-4">
        {Object.entries(byCategory).map(([cat, items]) => (
          <div key={cat}>
            <p className="text-[9px] font-mono uppercase tracking-widest text-emerald-500/70 mb-2">{cat}</p>
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex gap-3 text-xs">
                  <span className="text-emerald-500 shrink-0 mt-0.5 font-mono">□</span>
                  <span className="text-slate-300 leading-relaxed">
                    {isFa ? item.textFa : item.text}
                    {item.requiresQualifiedPersonnel && (
                      <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono">
                        {isFa ? "متخصص" : "QUALIFIED"}
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
  return (
    <Panel>
      <SectionHeader label="Safe Action Path" labelFa="مسیر اقدام ایمن" accent="#60B4F0" isFa={isFa} />
      <div className="space-y-5">
        {analysis.recommendedActions.map(group => (
          <div key={group.category}>
            <div className="flex items-center gap-2 mb-2">
              <span>{group.icon}</span>
              <p className="text-[10px] font-mono uppercase tracking-widest text-sky-400/80">
                {isFa ? group.categoryFa : group.category}
              </p>
            </div>
            <div className="space-y-1.5 ml-6">
              {group.items.map((item, j) => (
                <div key={j} className="flex gap-2 text-xs">
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

function RelatedKnowledgePanel({ analysis, isFa }: { analysis: IndustrialBrainAnalysis; isFa: boolean }) {
  return (
    <Panel>
      <SectionHeader label="Related Knowledge and Cases" labelFa="دانش و کیس‌های مرتبط" accent="#A78BFA" isFa={isFa} />
      {analysis.relatedKnowledge.length === 0 ? (
        <p className="text-xs text-slate-600 font-mono">
          {isFa ? "هنوز دانش یا کیس مرتبطی یافت نشد." : "No related knowledge or cases found yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {analysis.relatedKnowledge.map(k => (
            <div key={k.id} className="border border-violet-500/15 rounded-xl p-3 bg-violet-500/4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-semibold text-slate-200">{k.title}</p>
                <div className="flex gap-1 shrink-0">
                  <span className="text-[9px] px-1.5 py-0.5 rounded border bg-violet-500/10 border-violet-500/25 text-violet-400 font-mono">
                    {k.type}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border bg-white/4 border-white/8 text-slate-500 font-mono">
                    {k.relevanceScore}%
                  </span>
                </div>
              </div>
              {k.summary && <p className="text-[11px] text-slate-500 leading-relaxed">{k.summary}</p>}
              {k.domain && <p className="text-[9px] font-mono text-violet-500/60 mt-1 uppercase">{k.domain}</p>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ReportHeader({ meta, isFa }: { meta: ReportMeta; isFa: boolean }) {
  const notReported = isFa ? "گزارش نشده" : "Not reported";
  const fields = [
    { label: isFa ? "نوع دارایی" : "Asset Type", value: meta.assetType },
    { label: isFa ? "ناحیه سیستم" : "System Area", value: meta.systemArea },
    { label: isFa ? "پلتفرم PLC" : "PLC / Platform", value: meta.plcPlatform },
  ];
  return (
    <Panel className="border-cyan-500/25 ib-report-header">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.22em] text-cyan-400 mb-1.5">
            {isFa ? "هرمس OS · مغز صنعتی" : "HERMES OS · INDUSTRIAL BRAIN"}
          </p>
          <p className="text-lg font-bold text-slate-100">{isFa ? "گزارش مهندسی" : "Engineering Report"}</p>
          <p className="text-xs text-slate-500 mt-0.5">{isFa ? "بسته شواهد" : "Evidence Pack"}</p>
        </div>
        <div className="text-end shrink-0">
          <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600">
            {isFa ? "تولید شده در" : "Generated"}
          </p>
          <p className="text-xs font-mono text-slate-400">{fmtDateTime(meta.generatedAt, isFa)}</p>
        </div>
      </div>

      <p className="text-sm font-semibold text-slate-200 mb-3">{meta.problemTitle}</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-4 border-b border-white/6">
        {fields.map(f => (
          <div key={f.label}>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-1">{f.label}</p>
            <p className="text-xs text-slate-300 break-words">{f.value || notReported}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/6 p-3">
        <p className="text-[10px] text-amber-400 leading-relaxed font-mono">
          {isFa
            ? "⚠ گزارش پشتیبان تصمیم‌گیری — گزارش ایمنی تأییدشده نیست. با پرسنل متخصص و رویه‌های ایمنی سایت راستی‌آزمایی شود."
            : "⚠ Decision-support report — not a certified safety report. Verify with qualified personnel and site procedures before acting."}
        </p>
      </div>
    </Panel>
  );
}

function ReportActions({ analysis, meta, isFa }: { analysis: IndustrialBrainAnalysis; meta: ReportMeta; isFa: boolean }) {
  const [copied, setCopied] = useState<"summary" | "full" | null>(null);

  async function handleCopy(kind: "summary" | "full") {
    const text = kind === "summary" ? buildSummaryText(analysis, meta, isFa) : buildFullReportText(analysis, meta, isFa);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(prev => (prev === kind ? null : prev)), 2000);
    }
  }

  const btnBase = "flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-mono text-[11px] font-semibold uppercase tracking-wider border transition-all disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="ib-print-hide flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => handleCopy("summary")}
        disabled={!analysis}
        className={`${btnBase} border-cyan-400/25 bg-cyan-400/[0.06] text-cyan-300 hover:bg-cyan-400/[0.12]`}
      >
        {copied === "summary" ? (isFa ? "کپی شد ✓" : "Copied ✓") : (isFa ? "کپی خلاصه" : "Copy Summary")}
      </button>
      <button
        type="button"
        onClick={() => handleCopy("full")}
        disabled={!analysis}
        className={`${btnBase} border-violet-400/25 bg-violet-400/[0.06] text-violet-300 hover:bg-violet-400/[0.12]`}
      >
        {copied === "full" ? (isFa ? "کپی شد ✓" : "Copied ✓") : (isFa ? "کپی گزارش کامل" : "Copy Full Report")}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        disabled={!analysis}
        className={`${btnBase} border-sky-400/25 bg-sky-400/[0.06] text-sky-300 hover:bg-sky-400/[0.12]`}
      >
        {isFa ? "چاپ گزارش" : "Print Report"}
      </button>
    </div>
  );
}

function AnalysisDemoCTA({ isFa }: { isFa: boolean }) {
  return (
    <Panel className="border-cyan-500/20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-400 mb-1">
            {isFa ? "هرمس OS · مغز صنعتی" : "HERMES OS · INDUSTRIAL BRAIN"}
          </p>
          <p className="text-base font-bold text-slate-100">
            {isFa ? "درخواست دمو مغز صنعتی" : "Request Industrial Brain Demo"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isFa
              ? "ببینید چطور هرمس OS عملیات صنعتی شما را با هوشمندی داده‌محور متحول می‌کند."
              : "See how Hermes OS transforms industrial operations with data-driven intelligence."}
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
          {isFa ? "درخواست دمو" : "Request Demo"}
          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>
    </Panel>
  );
}

function AnalysisResult({ analysis, meta, isFa }: { analysis: IndustrialBrainAnalysis; meta: ReportMeta; isFa: boolean }) {
  return (
    <div className="ib-report-print space-y-5 mt-8">
      <ReportHeader meta={meta} isFa={isFa} />
      <ReportActions analysis={analysis} meta={meta} isFa={isFa} />

      {/* Executive Summary + Classification */}
      <Panel>
        <SectionHeader label="Executive Summary" labelFa="خلاصه اجرایی" accent="#1EC8A4" isFa={isFa} />
        <p className="text-sm text-slate-300 leading-relaxed mb-4">{isFa ? analysis.summaryFa : analysis.summary}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/6">
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-1">
              {isFa ? "حوزه اصلی" : "Primary Domain"}
            </p>
            <p className="text-sm font-bold text-cyan-300 font-mono">
              {isFa ? analysis.classification.domainFa : analysis.classification.domain}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-1">
              {isFa ? "شدت" : "Severity"}
            </p>
            <p className={`text-sm font-bold font-mono ${
              analysis.classification.severity === "CRITICAL" ? "text-rose-400" :
              analysis.classification.severity === "HIGH" ? "text-orange-400" :
              analysis.classification.severity === "MEDIUM" ? "text-amber-400" : "text-emerald-400"
            }`}>{analysis.classification.severity}</p>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-1">
              {isFa ? "اطمینان تشخیصی" : "Diagnostic Confidence"}
            </p>
            <p className="text-sm font-bold text-violet-300 font-mono">{analysis.confidence}%</p>
          </div>
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-1">
              {isFa ? "آنتروپی شواهد" : "Evidence Entropy"}
            </p>
            <p className={`text-sm font-bold font-mono ${UNCERTAINTY_COLORS[analysis.uncertainty.level].text}`}>
              {isFa
                ? (analysis.uncertainty.level === "HIGH" ? "بالا" : analysis.uncertainty.level === "MEDIUM" ? "متوسط" : "پایین")
                : analysis.uncertainty.level}
            </p>
          </div>
        </div>

        <div className="mt-3">
          <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-1.5">
            {isFa ? "اطمینان تشخیصی کلی" : "Overall Diagnostic Confidence"}
          </p>
          <ConfidenceBar value={analysis.confidence} color="linear-gradient(90deg, #1EC8A4, #60B4F0)" />
          <p className="text-[10px] text-slate-600 font-mono mt-1">
            {isFa
              ? `موتور هرمس برین V1 · ${analysis.processingMs}ms · فقط برای پشتیبانی تصمیم‌گیری`
              : `Hermes Industrial Brain V1 · ${analysis.processingMs}ms · Decision support only`}
          </p>
        </div>
      </Panel>

      <AlarmPanel analysis={analysis} isFa={isFa} />
      <SignalMatrixPanel analysis={analysis} isFa={isFa} />
      <ReasoningMapPanel analysis={analysis} isFa={isFa} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <UncertaintyPanel analysis={analysis} isFa={isFa} />
        <RiskPanel analysis={analysis} isFa={isFa} />
      </div>

      <LikelyCausesPanel analysis={analysis} isFa={isFa} />

      {analysis.evidenceGaps.length > 0 && (
        <Panel>
          <SectionHeader label="Evidence Gaps" labelFa="کمبود شواهد" accent="#FB923C" isFa={isFa} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {analysis.evidenceGaps.map((gap, i) => (
              <div key={i} className="border border-orange-500/15 rounded-xl p-3 bg-orange-500/4">
                <p className="text-sm font-semibold text-orange-300 mb-1">
                  {isFa ? gap.signalFa : gap.signal}
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">{gap.reason}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <ChecklistPanel analysis={analysis} isFa={isFa} />
      <ActionsPanel analysis={analysis} isFa={isFa} />
      <RelatedKnowledgePanel analysis={analysis} isFa={isFa} />
      <AnalysisDemoCTA isFa={isFa} />
    </div>
  );
}

// ─── Main workspace ───────────────────────────────────────────────────────────

interface Props { locale: string; isFa: boolean }

export function IndustrialBrainWorkspace({ locale, isFa }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<IndustrialBrainAnalysis | null>(null);
  const [reportMeta, setReportMeta] = useState<ReportMeta | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function loadSample(key: keyof typeof SAMPLE_SCENARIOS) {
    if (!formRef.current) return;
    fillSampleForm(formRef.current, SAMPLE_SCENARIOS[key][isFa ? "fa" : "en"]);
    setError(null);
  }

  const impactOptions = [
    { v: "", l: isFa ? "انتخاب کنید..." : "Select..." },
    { v: "NONE",     l: isFa ? "بدون تأثیر" : "None" },
    { v: "LOW",      l: isFa ? "کم" : "Low" },
    { v: "MEDIUM",   l: isFa ? "متوسط" : "Medium" },
    { v: "HIGH",     l: isFa ? "بالا" : "High" },
    { v: "CRITICAL", l: isFa ? "بحرانی" : "Critical" },
  ];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      Array.from(fd.entries()).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])
    );
    body.locale = locale;

    setBusy(true);
    try {
      const res = await fetch("/api/industrial-brain/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; analysis?: IndustrialBrainAnalysis; error?: string };
      if (!data.ok) { setError(data.error ?? "Analysis failed"); return; }
      setAnalysis(data.analysis ?? null);
      setReportMeta({
        problemTitle: String(body.problemTitle ?? ""),
        assetType: String(body.assetType ?? ""),
        systemArea: String(body.systemArea ?? ""),
        plcPlatform: String(body.plcPlatform ?? ""),
        generatedAt: new Date(),
      });
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    } catch {
      setError(isFa ? "خطا در ارتباط با سرور. دوباره تلاش کنید." : "Connection error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* ── Demo-ready examples ────────────────────────────────────────────── */}
      <div className="print:hidden mb-5 rounded-xl border border-white/8 p-3.5" style={{ background: "rgba(7,16,26,0.6)" }}>
        <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-2.5">
          {isFa ? "نمونه‌های آماده دمو" : "Demo-Ready Examples"}
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SAMPLE_SCENARIOS) as Array<keyof typeof SAMPLE_SCENARIOS>).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => loadSample(key)}
              className="text-[11px] font-mono px-3 py-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300 hover:bg-cyan-400/[0.12] hover:border-cyan-400/35 transition-all"
            >
              {isFa ? SAMPLE_SCENARIOS[key].labelFa : SAMPLE_SCENARIOS[key].labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* ── Input Form ─────────────────────────────────────────────────────── */}
      <form ref={formRef} onSubmit={handleSubmit} className="print:hidden space-y-5">

        {/* Problem title + asset */}
        <FormSection title="Fault Identification" titleFa="شناسایی خرابی" isFa={isFa}>
          <div>
            <FieldLabel>{isFa ? "عنوان مشکل *" : "Problem Title *"}</FieldLabel>
            <input name="problemTitle" required minLength={3} maxLength={200} className={IC} style={{ colorScheme: "dark" }}
              placeholder={isFa ? "مثال: موتور کانوایر پس از تعویض راه‌اندازی نمی‌شود" : "e.g. Conveyor motor does not start after replacement"}
            />
          </div>
          <FormRow>
            <div>
              <FieldLabel>{isFa ? "نوع دارایی / تجهیز" : "Asset / Equipment Type"}</FieldLabel>
              <input name="assetType" maxLength={150} className={IC} style={{ colorScheme: "dark" }}
                placeholder={isFa ? "مثال: موتور کانوایر 22kW" : "e.g. 22kW Conveyor Motor"}
              />
            </div>
            <div>
              <FieldLabel>{isFa ? "ناحیه سیستم" : "System Area"}</FieldLabel>
              <input name="systemArea" maxLength={150} className={IC} style={{ colorScheme: "dark" }}
                placeholder={isFa ? "مثال: خط تولید ۱، ناحیه بارگیری" : "e.g. Production Line 1, Loading Area"}
              />
            </div>
          </FormRow>
          <FormRow>
            <div>
              <FieldLabel>{isFa ? "پلتفرم PLC / SCADA / HMI" : "PLC / SCADA / HMI Platform"}</FieldLabel>
              <input name="plcPlatform" maxLength={100} className={IC} style={{ colorScheme: "dark" }}
                placeholder={isFa ? "مثال: Siemens S7-1500، Allen-Bradley" : "e.g. Siemens S7-1500, Allen-Bradley"}
              />
            </div>
            <div>
              <FieldLabel>{isFa ? "تغییرات اخیر" : "Recent Changes"}</FieldLabel>
              <input name="recentChanges" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                placeholder={isFa ? "مثال: تعویض موتور، تراز مکانیکی" : "e.g. Motor replacement, mechanical alignment"}
              />
            </div>
          </FormRow>
        </FormSection>

        {/* Symptoms + alarms */}
        <FormSection title="Observed Symptoms & Alarms" titleFa="علائم مشاهده‌شده و آلارم‌ها" isFa={isFa}>
          <div>
            <FieldLabel>{isFa ? "علائم مشاهده‌شده *" : "Observed Symptoms *"}</FieldLabel>
            <textarea name="observedSymptoms" required minLength={5} maxLength={3000} rows={4} className={TC} style={{ colorScheme: "dark" }}
              placeholder={isFa
                ? "مثال: فرمان اجرا از HMI فعال است. PLC خطای فعالی نشان نمی‌دهد. موتور نمی‌چرخد."
                : "e.g. HMI run command is active. PLC shows no active fault. Motor does not rotate."}
            />
          </div>
          <div>
            <FieldLabel>{isFa ? "آلارم‌ها و کدهای خطا" : "Alarms and Fault Codes"}</FieldLabel>
            <textarea name="activeAlarms" maxLength={1500} rows={3} className={TC} style={{ colorScheme: "dark" }}
              placeholder={isFa
                ? "مثال: آلارم PLC فعالی وجود ندارد، یا کد VFD: F0001، یا هر آلارم فعال دیگر"
                : "e.g. No active PLC alarm, or VFD fault code F0001, or list any active alarms"}
            />
          </div>
        </FormSection>

        {/* Signal states */}
        <FormSection title="Signal States" titleFa="وضعیت سیگنال‌ها" isFa={isFa}>
          <p className="text-[10px] text-slate-600 font-mono -mt-1">
            {isFa
              ? "هر اطلاعاتی که دارید وارد کنید. اطلاعات مفقود به عنوان UNKNOWN تشخیص داده می‌شود."
              : "Enter any known state. Missing information is automatically identified as UNKNOWN."}
          </p>
          <FormRow>
            <div>
              <FieldLabel>{isFa ? "وضعیت فرمان HMI" : "HMI Command State"}</FieldLabel>
              <input name="hmiCommandState" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                placeholder={isFa ? "مثال: فرمان اجرا فعال است" : "e.g. Run command active"}
              />
            </div>
            <div>
              <FieldLabel>{isFa ? "وضعیت خروجی PLC" : "PLC Output State"}</FieldLabel>
              <input name="plcOutputState" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                placeholder={isFa ? "مثال: نامشخص، یا خروجی Q0.0 فعال است" : "e.g. Unknown, or Q0.0 output active"}
              />
            </div>
          </FormRow>
          <FormRow>
            <div>
              <FieldLabel>{isFa ? "وضعیت VFD / MCC / کنتاکتور" : "VFD / MCC / Contactor Status"}</FieldLabel>
              <input name="vfdMccState" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                placeholder={isFa ? "مثال: نامشخص، یا VFD آماده، یا خطای VFD" : "e.g. Unknown, or VFD ready, or VFD fault"}
              />
            </div>
            <div>
              <FieldLabel>{isFa ? "وضعیت اینترلاک / مجوزها" : "Interlock / Permissive Status"}</FieldLabel>
              <input name="interlockStatus" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                placeholder={isFa ? "مثال: نامشخص، یا همه آزاد است" : "e.g. Unknown, or all permissives clear"}
              />
            </div>
          </FormRow>
          <FormRow>
            <div>
              <FieldLabel>{isFa ? "سیگنال سنسور / فیدبک" : "Sensor / Feedback Signal"}</FieldLabel>
              <input name="sensorFeedback" maxLength={500} className={IC} style={{ colorScheme: "dark" }}
                placeholder={isFa ? "مثال: انکودر فعال نیست، یا سنسور پروکسیمیتی کار می‌کند" : "e.g. Encoder not active, or proximity sensor working"}
              />
            </div>
            <div>
              <FieldLabel>{isFa ? "سیگنال‌های مشاهده‌شده دیگر" : "Other Observed Signals"}</FieldLabel>
              <input name="observedSignals" maxLength={1000} className={IC} style={{ colorScheme: "dark" }}
                placeholder={isFa ? "هر وضعیت سیگنال مرتبط دیگر" : "Any other relevant signal states"}
              />
            </div>
          </FormRow>
        </FormSection>

        {/* Impact */}
        <FormSection title="Impact Assessment" titleFa="ارزیابی تأثیر" isFa={isFa}>
          <FormRow>
            <div>
              <FieldLabel>{isFa ? "تأثیر تولید" : "Production Impact"}</FieldLabel>
              <select name="productionImpact" className={SC} style={{ colorScheme: "dark" }}>
                {impactOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>{isFa ? "تأثیر ایمنی" : "Safety Impact"}</FieldLabel>
              <select name="safetyImpact" className={SC} style={{ colorScheme: "dark" }}>
                {impactOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          </FormRow>
        </FormSection>

        {/* Already checked + additional */}
        <FormSection title="What Has Already Been Checked" titleFa="آنچه قبلاً بررسی شده" isFa={isFa}>
          <div>
            <FieldLabel>{isFa ? "قبلاً بررسی شده" : "Already Checked"}</FieldLabel>
            <textarea name="alreadyChecked" maxLength={1000} rows={2} className={TC} style={{ colorScheme: "dark" }}
              placeholder={isFa
                ? "مثال: فرمان HMI، صفحه خطای PLC، چرخش آزاد مکانیکی اولیه"
                : "e.g. HMI command, PLC fault page, basic mechanical free rotation"}
            />
          </div>
          <div>
            <FieldLabel>{isFa ? "اطلاعات اضافی" : "Additional Information"}</FieldLabel>
            <textarea name="additionalInfo" maxLength={1000} rows={2} className={TC} style={{ colorScheme: "dark" }}
              placeholder={isFa ? "هر اطلاعات اضافی مرتبط..." : "Any additional relevant information..."}
            />
          </div>
        </FormSection>

        {/* Warning */}
        <p className="text-[10px] text-slate-600 font-mono text-center">
          {isFa
            ? "⚠ رمزها، اسرار فنی یا نقشه‌های محرمانه کارخانه را وارد نکنید. فقط برای پشتیبانی تصمیم‌گیری."
            : "⚠ Do not enter passwords, secrets, or confidential plant drawings. Decision support only."}
        </p>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/6 px-4 py-3 text-sm text-rose-400 font-mono">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full h-12 rounded-xl font-mono font-bold text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5"
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
          {busy
            ? (isFa ? "در حال تحلیل..." : "Analyzing...")
            : (isFa ? "تحلیل خرابی" : "Analyze Fault")}
        </button>
      </form>

      {/* ── Analysis result ────────────────────────────────────────────────── */}
      <div ref={resultRef}>
        {analysis && reportMeta && <AnalysisResult analysis={analysis} meta={reportMeta} isFa={isFa} />}
      </div>
    </div>
  );
}
