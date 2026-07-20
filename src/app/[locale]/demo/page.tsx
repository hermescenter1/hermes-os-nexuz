import { setRequestLocale, getTranslations } from "next-intl/server";
import { buildMetadata }    from "@/lib/seo/metadata";
import { DemoRequestForm }  from "@/components/sales/DemoRequestForm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // 89C: catalog-backed metadata for all three locales (was a fa-else-en ternary).
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path:        "/demo",
    title:       p.demo.title,
    description: p.demo.description,
  });
}

export const dynamic = "force-dynamic";

// ── Value proposition data ────────────────────────────────────────────────────

const VALUE_PROPS = [
  {
    en: "Fault Analysis",
    fa: "تحلیل خرابی",
    descEn: "AI-driven root-cause analysis for industrial equipment failures",
    descFa: "تحلیل ریشه‌ای خرابی‌های تجهیزات صنعتی با هوش مصنوعی",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
      </svg>
    ),
  },
  {
    en: "Industrial Knowledge",
    fa: "دانش صنعتی",
    descEn: "Case reasoning engine for maintenance, commissioning, and operations",
    descFa: "موتور استدلال بر پایه پرونده‌های نگهداری، راه‌اندازی و عملیات",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M10.75 16.82A7.462 7.462 0 0 1 10 17c-.34 0-.674-.028-1-.083v-2.31l1-1 1 1v2.21ZM10 3a7 7 0 1 0 0 14A7 7 0 0 0 10 3Z"/>
        <path fillRule="evenodd" d="M.25 10a9.75 9.75 0 1 1 19.5 0 9.75 9.75 0 0 1-19.5 0Zm10-7.25a7.25 7.25 0 1 0 0 14.5 7.25 7.25 0 0 0 0-14.5Z" clipRule="evenodd"/>
      </svg>
    ),
  },
  {
    en: "PLC / SCADA Intelligence",
    fa: "هوشمندی PLC / SCADA",
    descEn: "Structured knowledge for automation systems, interlocks, and control logic",
    descFa: "دانش ساختارمند برای سیستم‌های اتوماسیون، اینترلاک‌ها و منطق کنترل",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M2 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5Zm14 1a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM2 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2Zm14 1a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clipRule="evenodd"/>
      </svg>
    ),
  },
  {
    en: "EDMS / CMMS Integration",
    fa: "یکپارچگی EDMS / CMMS",
    descEn: "Ready-to-connect document management and maintenance systems",
    descFa: "آماده اتصال به سیستم‌های مدیریت اسناد و نگهداری",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7Z" clipRule="evenodd"/>
      </svg>
    ),
  },
  {
    en: "Enterprise Architecture",
    fa: "معماری سازمانی",
    descEn: "Multi-language, multi-tenant, role-based industrial SaaS platform",
    descFa: "پلتفرم SaaS صنعتی چندزبانه، چند-مستأجری با کنترل دسترسی نقش‌محور",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M1 2.75A.75.75 0 0 1 1.75 2h16.5a.75.75 0 0 1 0 1.5H18v8.75A2.75 2.75 0 0 1 15.25 15h-1.072l.798 3.06a.75.75 0 0 1-1.452.38L13.21 18H6.79l-.314 1.44a.75.75 0 0 1-1.452-.38L5.823 15H4.75A2.75 2.75 0 0 1 2 12.25V3.5h-.25A.75.75 0 0 1 1 2.75ZM7.373 15l-.391 1.5h6.036L12.627 15H7.373ZM3.5 3.5v8.75c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25V3.5H3.5Z" clipRule="evenodd"/>
      </svg>
    ),
  },
  {
    en: "Expert Network",
    fa: "شبکه متخصصان",
    descEn: "Industrial journal and verified expert knowledge exchange platform",
    descFa: "ژورنال صنعتی و پلتفرم تبادل دانش متخصصان تأیید‌شده",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 18a9.953 9.953 0 0 1-5.385-1.572ZM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 0 0-1.588-3.755 4.502 4.502 0 0 1 5.874 2.636.818.818 0 0 1-.36.98A7.465 7.465 0 0 1 14.5 16Z"/>
      </svg>
    ),
  },
];

const TRUST_ITEMS = [
  { en: "Built for Industrial Operations",   fa: "ساخته‌شده برای عملیات صنعتی" },
  { en: "Bilingual FA / EN",                 fa: "دوزبانه فارسی / انگلیسی" },
  { en: "Enterprise-Ready Architecture",     fa: "معماری آماده سازمانی" },
  { en: "Secure Admin Follow-Up",            fa: "پیگیری ایمن توسط مدیریت" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  return (
    <div className="min-h-screen">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative border-b border-[#1E2E40]/60 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.07) 0%, rgba(6,8,13,0.99) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.10) 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.3 }} />
        <div className="absolute -top-20 end-0 w-96 h-96 rounded-full blur-[120px] pointer-events-none"
          style={{ background: "rgba(96,180,240,0.06)" }} />
        <div className="relative max-w-6xl mx-auto px-6 py-14">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#1EC8A4] mb-3">
            {isFa ? "هرمس OS · مغز صنعتی" : "HERMES OS · INDUSTRIAL BRAIN"}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#F0F4F8] mb-3 leading-tight">
            {isFa ? "درخواست دمو مغز صنعتی" : "Request an Industrial Brain Demo"}
          </h1>
          <p className="text-sm text-[#8A9BB0] max-w-lg">
            {isFa
              ? "ببینید چطور هرمس OS عملیات صنعتی شما را با هوشمندی داده‌محور متحول می‌کند."
              : "See how Hermes OS transforms your industrial operations with data-driven intelligence."}
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

          {/* ── Left: value props + trust ────────────────────────────────── */}
          <div className="space-y-8">
            {/* Value props */}
            <div>
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#1EC8A4] mb-4">
                {isFa ? "قابلیت‌های کلیدی" : "KEY CAPABILITIES"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {VALUE_PROPS.map((v, i) => (
                  <div key={i} className="flex gap-3 p-3.5 rounded-xl border border-[#1E2E40] bg-[#0C1420]/60">
                    <div className="w-8 h-8 rounded-lg bg-[rgba(30,200,164,0.08)] border border-[rgba(30,200,164,0.15)] flex items-center justify-center text-[#1EC8A4] shrink-0">
                      {v.icon}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#F0F4F8]">{isFa ? v.fa : v.en}</p>
                      <p className="text-[10px] text-[#5A6B80] mt-0.5 leading-relaxed">{isFa ? v.descFa : v.descEn}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust strip */}
            <div className="rounded-xl border border-[#1E2E40] bg-[#0C1420]/40 p-4">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#4A5A6E] mb-3">
                {isFa ? "چرا هرمس؟" : "WHY HERMES?"}
              </p>
              <ul className="space-y-2">
                {TRUST_ITEMS.map((item, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <div className="w-1 h-1 rounded-full bg-[#1EC8A4] shrink-0" />
                    <span className="text-xs text-[#8A9BB0]">{isFa ? item.fa : item.en}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Right: form ───────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-[#1E2E40] bg-[#0C1420]/60 p-6 sm:p-8">
            <div className="h-0.5 -mx-8 -mt-8 mb-6 rounded-t-2xl"
              style={{ background: "linear-gradient(90deg, #1EC8A4 0%, #60B4F0 100%)" }} />
            <h2 className="text-base font-bold text-[#F0F4F8] mb-1">
              {isFa ? "فرم درخواست دمو" : "Demo Request Form"}
            </h2>
            <p className="text-xs text-[#5A6B80] mb-6">
              {isFa
                ? "فیلدهای ستاره‌دار الزامی هستند."
                : "Fields marked with * are required."}
            </p>
            <DemoRequestForm isFa={isFa} locale={locale} />
          </div>
        </div>
      </div>
    </div>
  );
}
