import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";

export const metadata = noIndexMetadata("Editorial Board — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function EditorialBoardContent({ isFa, locale }: { isFa: boolean; locale: string }) {
  const links = isFa ? [
    {
      href:  `/${locale}/articles/submissions`,
      label: "مقالات ارسال‌شده",
      desc:  "مقالات ارسال‌شده برای بررسی اولیه",
      badge: "SUBMISSIONS",
      color: "border-warn/20 bg-warn/5 text-warn",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z"/>
        </svg>
      ),
    },
    {
      href:  `/${locale}/articles/review-queue`,
      label: "صف بررسی",
      desc:  "مقالات در حال بررسی توسط تیم تحریریه",
      badge: "REVIEW",
      color: "border-ice/20 bg-ice/5 text-ice",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd"/>
        </svg>
      ),
    },
    {
      href:  `/${locale}/articles/moderation`,
      label: "اعتدال محتوا",
      desc:  "مدیریت و نظارت بر همه محتوای ژورنال",
      badge: "MODERATION",
      color: "border-signal/20 bg-signal/5 text-signal",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
        </svg>
      ),
    },
    {
      href:  `/${locale}/articles/reports`,
      label: "گزارش‌های محتوا",
      desc:  "گزارش‌های محتوای نامناسب توسط کاربران",
      badge: "REPORTS",
      color: "border-danger/20 bg-danger/5 text-danger",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
        </svg>
      ),
    },
  ] : [
    {
      href:  `/${locale}/articles/submissions`,
      label: "Submissions",
      desc:  "Articles submitted for initial editorial review",
      badge: "SUBMISSIONS",
      color: "border-warn/20 bg-warn/5 text-warn",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z"/>
        </svg>
      ),
    },
    {
      href:  `/${locale}/articles/review-queue`,
      label: "Review Queue",
      desc:  "Articles currently under editorial peer review",
      badge: "REVIEW",
      color: "border-ice/20 bg-ice/5 text-ice",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd"/>
        </svg>
      ),
    },
    {
      href:  `/${locale}/articles/moderation`,
      label: "Moderation",
      desc:  "Manage and oversee all journal content",
      badge: "MODERATION",
      color: "border-signal/20 bg-signal/5 text-signal",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
        </svg>
      ),
    },
    {
      href:  `/${locale}/articles/reports`,
      label: "Content Reports",
      desc:  "User-submitted reports of inappropriate content",
      badge: "REPORTS",
      color: "border-danger/20 bg-danger/5 text-danger",
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Command center header */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(145deg, rgba(30,200,164,0.07) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-30"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.15) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="absolute -top-10 end-0 w-64 h-64 rounded-full blur-[80px] pointer-events-none"
          style={{ background: "rgba(30,200,164,0.05)" }} />

        <div className="relative max-w-4xl mx-auto px-6 py-12">
          <p className="eyebrow-mono text-signal text-[9px] mb-3 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس — سطح دسترسی: تحریریه" : "HERMES INDUSTRIAL JOURNAL — EDITORIAL ACCESS"}
          </p>
          <h1 className="text-3xl font-bold text-ink mb-2">
            {isFa ? "مرکز فرماندهی تحریریه" : "Editorial Command Center"}
          </h1>
          <p className="text-muted text-sm max-w-lg">
            {isFa
              ? "مرکز مدیریت محتوا، بررسی مقالات، و نظارت بر ژورنال صنعتی هرمس"
              : "Content management hub for the Hermes Industrial Journal editorial team"}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {links.map(l => (
            <Link key={l.href} href={l.href}
              className="group flex flex-col gap-4 p-5 rounded-xl border border-line/40 bg-surface/60 hover:border-signal/20 hover:bg-surface2/40 hover:shadow-[0_0_20px_rgba(30,200,164,0.04)] transition-all duration-200 overflow-hidden">
              {/* Top bar */}
              <div className="h-0.5 -mx-5 -mt-5 bg-gradient-to-r from-signal/25 to-transparent" />

              <div className="flex items-start gap-3 pt-1">
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${l.color}`}>
                  {l.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-ink group-hover:text-signal transition-colors">{l.label}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wider ${l.color}`}>
                      {l.badge}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{l.desc}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-signal/60 group-hover:text-signal transition-colors font-mono">
                  {isFa ? "ورود به بخش" : "Enter section"}
                </span>
                <svg viewBox="0 0 20 20" fill="currentColor"
                  className={`w-3 h-3 text-signal/50 group-hover:text-signal transition-all group-hover:translate-x-0.5 ${isFa ? "rotate-180" : ""}`}>
                  <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd"/>
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function EditorialBoardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  return (
    <RequireCapability capability="admin">
      <EditorialBoardContent isFa={isFa} locale={locale} />
    </RequireCapability>
  );
}
