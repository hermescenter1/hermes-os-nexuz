import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Journal Settings — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function SettingsContent({ isFa }: { isFa: boolean }) {
  const sections = isFa ? [
    { title: "اطلاعیه‌ها", desc: "مدیریت ایمیل‌های اطلاع‌رسانی" },
    { title: "حریم خصوصی", desc: "کنترل دید پروفایل و مقالات" },
    { title: "پروفایل نویسنده", desc: "ویرایش بیوگرافی و حوزه‌های تخصص" },
  ] : [
    { title: "Notifications", desc: "Manage email notification preferences" },
    { title: "Privacy",       desc: "Control your profile and article visibility" },
    { title: "Author Profile",desc: "Edit your bio and expertise areas" },
  ];

  return (
    <div className="min-h-screen">
      <div className="border-b border-line/50 bg-surface/60 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="eyebrow-mono text-signal text-[10px] mb-2">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {isFa ? "تنظیمات ژورنال" : "Journal Settings"}
          </h1>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-3">
        {sections.map(s => (
          <div key={s.title} className="p-5 rounded-xl border border-line/60 bg-surface flex items-center justify-between group cursor-pointer hover:border-signal/30 transition-all">
            <div>
              <p className="text-sm font-semibold text-ink">{s.title}</p>
              <p className="text-xs text-muted mt-0.5">{s.desc}</p>
            </div>
            <svg viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-faint group-hover:text-signal transition-colors ${isFa ? "rotate-180" : ""}`}>
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
