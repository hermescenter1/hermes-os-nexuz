import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";

export const metadata = noIndexMetadata("My Articles — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function MyArticlesContent({ isFa, locale }: { isFa: boolean; locale: string }) {
  return (
    <div className="min-h-screen">
      {/* Header with write CTA */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-25"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-4xl mx-auto px-6 py-10 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
              {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
            </p>
            <h1 className="text-2xl font-bold text-ink">
              {isFa ? "مقالات من" : "My Articles"}
            </h1>
          </div>
          <Link href={`/${locale}/articles/write`}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-signal text-bg text-sm font-bold hover:bg-signal/90 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/>
            </svg>
            {isFa ? "نوشتن مقاله" : "Write Article"}
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-16 flex flex-col items-center text-center">
        <div className="relative mb-8">
          <div className="w-20 h-20 rounded-2xl bg-surface/80 border border-signal/20 flex items-center justify-center shadow-[0_0_30px_rgba(30,200,164,0.06)]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-signal/50">
              <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7Z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="absolute -inset-2 rounded-2xl"
            style={{ background: "radial-gradient(circle, rgba(30,200,164,0.06) 0%, transparent 70%)" }} />
        </div>
        <h2 className="text-lg font-bold text-ink mb-2">
          {isFa ? "مقاله‌ای منتشر نشده" : "No articles yet"}
        </h2>
        <p className="text-muted text-sm mb-8 max-w-sm leading-relaxed">
          {isFa
            ? "اولین مقاله تخصصی صنعتی خود را برای جامعه هرمس بنویسید و دانش خود را به اشتراک بگذارید."
            : "Write your first industrial article and share your engineering expertise with the Hermes global community."}
        </p>
        <Link href={`/${locale}/articles/write`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-signal text-bg text-sm font-bold hover:bg-signal/90 transition-colors shadow-[0_0_20px_rgba(30,200,164,0.15)]">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z"/>
          </svg>
          {isFa ? "نوشتن اولین مقاله" : "Write Your First Article"}
        </Link>
      </div>
    </div>
  );
}

export default async function MyArticlesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  return (
    <RequireCapability capability="dashboard">
      <MyArticlesContent isFa={isFa} locale={locale} />
    </RequireCapability>
  );
}
