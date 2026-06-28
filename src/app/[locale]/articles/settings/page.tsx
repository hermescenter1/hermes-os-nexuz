import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Journal Settings — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function SettingsContent({ isFa }: { isFa: boolean }) {
  const sections = isFa ? [
    {
      title: "اطلاعیه‌ها",
      desc:  "مدیریت ایمیل‌های اطلاع‌رسانی برای مقالات جدید و تعاملات",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M4.214 3.227a.75.75 0 0 0-1.156-.956 8.97 8.97 0 0 0-1.856 3.826.75.75 0 0 0 1.466.316 7.47 7.47 0 0 1 1.546-3.186ZM16.942 2.271a.75.75 0 0 0-1.157.956 7.47 7.47 0 0 1 1.547 3.186.75.75 0 0 0 1.466-.316 8.971 8.971 0 0 0-1.856-3.826ZM10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.91 32.91 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6Z"/>
        </svg>
      ),
    },
    {
      title: "حریم خصوصی",
      desc:  "کنترل دید پروفایل و مقالات در ژورنال",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd"/>
        </svg>
      ),
    },
    {
      title: "پروفایل نویسنده",
      desc:  "ویرایش بیوگرافی، حوزه‌های تخصص، و اطلاعات حرفه‌ای",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z"/>
        </svg>
      ),
    },
  ] : [
    {
      title: "Notifications",
      desc:  "Manage email preferences for new articles and interactions",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M4.214 3.227a.75.75 0 0 0-1.156-.956 8.97 8.97 0 0 0-1.856 3.826.75.75 0 0 0 1.466.316 7.47 7.47 0 0 1 1.546-3.186ZM16.942 2.271a.75.75 0 0 0-1.157.956 7.47 7.47 0 0 1 1.547 3.186.75.75 0 0 0 1.466-.316 8.971 8.971 0 0 0-1.856-3.826ZM10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.91 32.91 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6Z"/>
        </svg>
      ),
    },
    {
      title: "Privacy",
      desc:  "Control your profile and article visibility in the journal",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd"/>
        </svg>
      ),
    },
    {
      title: "Author Profile",
      desc:  "Edit your bio, areas of expertise, and professional details",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-20"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-2xl mx-auto px-6 py-10">
          <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {isFa ? "تنظیمات ژورنال" : "Journal Settings"}
          </h1>
          <p className="text-xs text-muted mt-1">
            {isFa ? "ترجیحات و پروفایل نویسنده خود را مدیریت کنید" : "Manage your preferences and author profile"}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-3">
        {sections.map(s => (
          <div key={s.title}
            className="group flex items-center gap-4 p-5 rounded-xl border border-line/40 bg-surface/60 hover:border-signal/20 hover:bg-surface2/40 cursor-pointer transition-all duration-200 overflow-hidden">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl border border-signal/20 bg-signal/5 flex items-center justify-center shrink-0 text-signal/60 group-hover:text-signal group-hover:border-signal/30 transition-all">
              {s.icon}
            </div>
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink group-hover:text-signal transition-colors">{s.title}</p>
              <p className="text-xs text-muted mt-0.5">{s.desc}</p>
            </div>
            {/* Arrow */}
            <svg viewBox="0 0 20 20" fill="currentColor"
              className={`w-4 h-4 text-faint group-hover:text-signal transition-colors shrink-0 ${isFa ? "rotate-180" : ""}`}>
              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd"/>
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  return (
    <RequireCapability capability="dashboard">
      <SettingsContent isFa={isFa} />
    </RequireCapability>
  );
}
