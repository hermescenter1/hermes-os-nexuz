import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";

export const metadata = noIndexMetadata("My Articles — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function MyArticlesContent({ isFa, locale }: { isFa: boolean; locale: string }) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-line/50 bg-surface/60 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-8 flex items-center justify-between">
          <div>
            <p className="eyebrow-mono text-signal text-[10px] mb-2">
              {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
            </p>
            <h1 className="text-2xl font-bold text-ink">
              {isFa ? "مقالات من" : "My Articles"}
            </h1>
          </div>
          <Link href={`/${locale}/articles/write`}
            className="text-sm px-4 py-2 rounded-xl bg-signal text-bg font-semibold hover:bg-signal/90 transition-colors">
            {isFa ? "+ نوشتن مقاله" : "+ Write Article"}
          </Link>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface2 border border-line/60 mb-5">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7 text-faint">
            <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1Zm1 3a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7Z" clipRule="evenodd"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-ink mb-2">
          {isFa ? "مقاله‌ای منتشر نشده" : "No articles yet"}
        </h2>
        <p className="text-muted text-sm mb-6">
          {isFa
            ? "اولین مقاله تخصصی صنعتی خود را برای جامعه هرمس بنویسید."
            : "Write your first industrial article and share your expertise with the Hermes community."}
        </p>
        <Link href={`/${locale}/articles/write`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-signal text-bg text-sm font-semibold hover:bg-signal/90 transition-colors">
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
