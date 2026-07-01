import { setRequestLocale } from "next-intl/server";
import { buildMetadata }    from "@/lib/seo/metadata";
import { Link }             from "@/i18n/navigation";
import { IndustrialBrainWorkspace } from "@/components/industrial-brain/IndustrialBrainWorkspace";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildMetadata({
    locale,
    path:  "/industrial-brain",
    title: locale === "fa"
      ? "مغز صنعتی هرمس — تحلیل خرابی، ماتریس سیگنال"
      : "Hermes Industrial Brain — Alarm Intelligence, Signal Matrix",
    description: locale === "fa"
      ? "نقشه استدلال عصبی هرمس برای تحلیل خرابی صنعتی، تشخیص آلارم، و ماتریس سیگنال."
      : "Hermes Industrial Brain — deterministic fault analysis, alarm intelligence, signal matrix, and neural reasoning map for industrial operations.",
  });
}

export const dynamic = "force-dynamic";

// ─── Brain status modules ─────────────────────────────────────────────────────

const STATUS_MODULES = [
  { en: "Signal Intake",        fa: "دریافت سیگنال",       status: "ONLINE"  },
  { en: "Alarm Intelligence",   fa: "هوشمندی آلارم",       status: "READY"   },
  { en: "Signal Matrix",        fa: "ماتریس سیگنال",       status: "ACTIVE"  },
  { en: "Evidence Entropy",     fa: "آنتروپی شواهد",       status: "ACTIVE"  },
  { en: "Neural Reasoning Map", fa: "نقشه استدلال عصبی",   status: "ACTIVE"  },
  { en: "Safe Action Path",     fa: "مسیر اقدام ایمن",     status: "READY"   },
];

const STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  ONLINE: { dot: "bg-emerald-400",   text: "text-emerald-400" },
  READY:  { dot: "bg-cyan-400",      text: "text-cyan-400" },
  ACTIVE: { dot: "bg-sky-400",       text: "text-sky-400" },
};

// ─── Value propositions ───────────────────────────────────────────────────────

const VALUE_PROPS = [
  {
    en: "Alarm Intelligence", fa: "هوشمندی آلارم",
    descEn: "Parse and interpret PLC/SCADA/VFD alarms, detect missing evidence, classify source and severity",
    descFa: "تجزیه و تفسیر آلارم‌های PLC/SCADA/VFD، تشخیص شواهد مفقود، طبقه‌بندی منبع و شدت",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/></svg>,
    accent: "#38BDF8",
  },
  {
    en: "Signal Matrix", fa: "ماتریس سیگنال",
    descEn: "Build a structured signal matrix: HMI command, PLC output, VFD/MCC, overload, permissive, feedback",
    descFa: "ساخت ماتریس سیگنال ساختارمند: فرمان HMI، خروجی PLC، VFD/MCC، اضافه‌بار، مجوز، فیدبک",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M.99 5.24A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25l.01 9.5A2.25 2.25 0 0 1 16.76 17H3.26A2.272 2.272 0 0 1 1 14.74l-.01-9.5Zm8.26 9.52v-.625a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75v.615c0 .414.336.75.75.75h5.373a.75.75 0 0 0 .627-.74Zm1.5 0a.75.75 0 0 0 .627.74h5.373a.75.75 0 0 0 .75-.75v-.615a.75.75 0 0 0-.75-.75H11.5a.75.75 0 0 0-.75.75v.625Zm6.75-3.63v-.625a.75.75 0 0 0-.75-.75H11.5a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75h5.25a.75.75 0 0 0 .75-.75Zm-8.25 0v-.625a.75.75 0 0 0-.75-.75H3.25a.75.75 0 0 0-.75.75v.625c0 .414.336.75.75.75H8.5a.75.75 0 0 0 .75-.75Z" clipRule="evenodd"/></svg>,
    accent: "#1EC8A4",
  },
  {
    en: "Neural Reasoning Map", fa: "نقشه استدلال عصبی",
    descEn: "Explainable cause hypotheses ranked by evidence, with missing signal gaps and confidence scoring",
    descFa: "فرضیه‌های علت قابل توضیح با رتبه‌بندی بر اساس شواهد، کمبود سیگنال و امتیاز اطمینان",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z"/></svg>,
    accent: "#818CF8",
  },
  {
    en: "Evidence Entropy", fa: "آنتروپی شواهد",
    descEn: "Quantify diagnostic uncertainty, identify conflicting signals, reduce uncertainty systematically",
    descFa: "کمی‌سازی عدم قطعیت تشخیصی، شناسایی سیگنال‌های متعارض، کاهش سیستماتیک عدم قطعیت",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6Z" clipRule="evenodd"/></svg>,
    accent: "#F59E0B",
  },
  {
    en: "Safe Inspection Path", fa: "مسیر بررسی ایمن",
    descEn: "Structured safe-action checklist for PLC/SCADA, electrical, and mechanical inspection",
    descFa: "چک‌لیست اقدام ایمن ساختاریافته برای بازرسی PLC/SCADA، برق و مکانیک",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/></svg>,
    accent: "#34D399",
  },
  {
    en: "Industrial Knowledge Base", fa: "پایگاه دانش صنعتی",
    descEn: "Match against real engineering cases, knowledge articles, and expert-published content",
    descFa: "تطبیق با پرونده‌های مهندسی واقعی، مقالات دانش و محتوای منتشر‌شده توسط متخصصان",
    icon: <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10.75 16.82A7.462 7.462 0 0 1 10 17c-.34 0-.674-.028-1-.083v-2.31l1-1 1 1v2.21ZM10 3a7 7 0 1 0 0 14A7 7 0 0 0 10 3Z"/><path fillRule="evenodd" d="M.25 10a9.75 9.75 0 1 1 19.5 0 9.75 9.75 0 0 1-19.5 0Zm10-7.25a7.25 7.25 0 1 0 0 14.5 7.25 7.25 0 0 0 0-14.5Z" clipRule="evenodd"/></svg>,
    accent: "#C084FC",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function IndustrialBrainPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #04080F 0%, #060A16 100%)" }}>

      {/* ── Dot grid background ───────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(rgba(30,200,164,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* ── Ambient glows ─────────────────────────────────────────────────── */}
      <div className="fixed top-0 start-1/4 w-96 h-96 rounded-full blur-[160px] pointer-events-none" aria-hidden="true"
        style={{ background: "rgba(30,200,164,0.04)" }} />
      <div className="fixed top-40 end-0 w-80 h-80 rounded-full blur-[140px] pointer-events-none" aria-hidden="true"
        style={{ background: "rgba(96,180,240,0.04)" }} />

      <div className="relative z-10">

        {/* ── Brain status strip ────────────────────────────────────────────── */}
        <div className="border-b border-white/6 overflow-x-auto"
          style={{ background: "rgba(4,8,15,0.92)", backdropFilter: "blur(16px)" }}>
          <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center gap-6 min-w-max">
            <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-slate-600 shrink-0">
              {isFa ? "وضعیت سیستم" : "SYSTEM STATUS"}
            </span>
            {STATUS_MODULES.map(mod => {
              const c = STATUS_COLORS[mod.status];
              return (
                <div key={mod.en} className="flex items-center gap-1.5 shrink-0">
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${c.dot}`} />
                  <span className={`text-[9px] font-mono ${c.text}`}>{isFa ? mod.fa : mod.en}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="relative border-b border-white/6 overflow-hidden py-14 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-3xl">
              <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-cyan-400 mb-4">
                {isFa ? "هرمس OS · مغز صنعتی V1" : "HERMES OS · INDUSTRIAL BRAIN V1"}
              </p>
              <h1 className="font-bold leading-tight mb-3"
                style={{ fontSize: "clamp(1.8rem,4vw,3rem)", color: "#E8F4FF" }}>
                {isFa ? "مغز صنعتی هرمس" : "Hermes Industrial Brain"}
              </h1>
              <p className="text-slate-400 mb-1" style={{ fontSize: "clamp(0.9rem,2vw,1.1rem)" }}>
                {isFa
                  ? "هوشمندی آلارم، ماتریس سیگنال و نقشه استدلال عصبی"
                  : "Alarm Intelligence, Signal Matrix & Neural Reasoning Workspace"}
              </p>
              <p className="text-xs text-slate-600 font-mono mb-6">
                {isFa
                  ? "موتور استدلال قطعی — شواهد‌اول، ایمنی‌آگاه، قابل توضیح. فقط برای پشتیبانی تصمیم‌گیری."
                  : "Deterministic reasoning engine — evidence-first, safety-aware, explainable. Decision support only."}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/demo"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs font-semibold uppercase tracking-wider"
                  style={{
                    background: "linear-gradient(135deg, rgba(30,200,164,0.85) 0%, rgba(96,180,240,0.85) 100%)",
                    color: "#04080F",
                  }}>
                  {isFa ? "درخواست دمو" : "Request Demo"}
                </Link>
                <Link href="/articles/discover"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs font-semibold uppercase tracking-wider border border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 transition-colors">
                  {isFa ? "کشف دانش صنعتی" : "Explore Industrial Knowledge"}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Main workspace ───────────────────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">

            {/* ── Left: Value props ────────────────────────────────────────── */}
            <div className="xl:col-span-2 space-y-6">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600 mb-4">
                  {isFa ? "قابلیت‌های مغز صنعتی" : "BRAIN CAPABILITIES"}
                </p>
                <div className="space-y-2">
                  {VALUE_PROPS.map((vp, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-xl border border-white/6 bg-white/2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${vp.accent}15`, border: `1px solid ${vp.accent}25`, color: vp.accent }}>
                        {vp.icon}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-200">{isFa ? vp.fa : vp.en}</p>
                        <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed">{isFa ? vp.descFa : vp.descEn}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Safety notice */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/4 p-4">
                <p className="text-[9px] font-mono uppercase tracking-widest text-amber-500 mb-2">
                  {isFa ? "ایمنی صنعتی" : "INDUSTRIAL SAFETY"}
                </p>
                <ul className="space-y-1.5">
                  {(isFa ? [
                    "هرگز اینترلاک‌های ایمنی را دور نزنید",
                    "بازرسی برق نیاز به پرسنل متخصص دارد",
                    "قبل از لمس فیزیکی LOTO اجرا کنید",
                    "با مستندات OEM و رویه‌های سایت عمل کنید",
                  ] : [
                    "Never bypass safety interlocks",
                    "Electrical inspection requires qualified personnel",
                    "Apply LOTO before physical contact",
                    "Follow OEM manuals and site procedures",
                  ]).map((item, i) => (
                    <li key={i} className="flex gap-2 text-[10px]">
                      <span className="text-amber-500 shrink-0">▸</span>
                      <span className="text-slate-500">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Demo CTA panel */}
              <div className="rounded-xl border border-cyan-500/20 p-4"
                style={{ background: "rgba(30,200,164,0.04)" }}>
                <p className="text-[9px] font-mono uppercase tracking-widest text-cyan-400 mb-2">
                  {isFa ? "هرمس صنعتی" : "HERMES INDUSTRIAL"}
                </p>
                <p className="text-sm font-bold text-slate-200 mb-1">
                  {isFa ? "مغز صنعتی را برای سازمانتان دریافت کنید" : "Deploy Industrial Brain for your organization"}
                </p>
                <p className="text-[10px] text-slate-600 mb-3">
                  {isFa
                    ? "یکپارچه‌سازی کامل با CMMS، EDMS، شبکه متخصصان و عملیات صنعتی"
                    : "Full integration with CMMS, EDMS, expert network, and industrial operations"}
                </p>
                <Link href="/demo"
                  className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-cyan-400 hover:text-cyan-300 transition-colors">
                  {isFa ? "درخواست دمو" : "Request Demo"}
                  <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Link>
              </div>
            </div>

            {/* ── Right: Fault input workspace ─────────────────────────────── */}
            <div className="xl:col-span-3">
              <div className="rounded-2xl border border-white/8 overflow-hidden"
                style={{ background: "rgba(7,16,26,0.85)", backdropFilter: "blur(16px)" }}>
                {/* Workspace header */}
                <div className="border-b border-white/6 px-5 py-4 flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  </div>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 flex-1 text-center">
                    {isFa ? "فضای کاری تحلیل خرابی — ورودی سیگنال صنعتی" : "FAULT ANALYSIS WORKSPACE — INDUSTRIAL SIGNAL INTAKE"}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400" />
                    <span className="text-[9px] font-mono text-emerald-400">
                      {isFa ? "آنلاین" : "ONLINE"}
                    </span>
                  </div>
                </div>

                {/* Gradient accent line */}
                <div className="h-px" style={{ background: "linear-gradient(90deg, #1EC8A4, #60B4F0, #818CF8)" }} />

                <div className="px-5 py-6">
                  <IndustrialBrainWorkspace locale={locale} isFa={isFa} />
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
