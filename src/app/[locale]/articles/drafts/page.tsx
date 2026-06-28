import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";

export const metadata = noIndexMetadata("My Drafts — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function DraftsContent({ isFa, locale }: { isFa: boolean; locale: string }) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-line/50 bg-surface/60 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <p className="eyebrow-mono text-signal text-[10px] mb-2">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {isFa ? "پیش‌نویس‌های من" : "My Drafts"}
          </h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface2 border border-line/60 mb-5">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7 text-faint">
            <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3L10.58 12.42a4 4 0 0 1-1.343.885l-3.155 1.262a.5.5 0 0 1-.65-.65Z"/>
            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-ink mb-2">
          {isFa ? "پیش‌نویسی وجود ندارد" : "No drafts yet"}
        </h2>
        <p className="text-muted text-sm mb-6">
          {isFa
            ? "اولین مقاله تخصصی خود را بنویسید."
            : "Start writing your first industrial article."}
        </p>
        <Link href={`/${locale}/articles/write`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-signal text-bg text-sm font-semibold hover:bg-signal/90 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z"/>
          </svg>
          {isFa ? "نوشتن مقاله جدید" : "Write New Article"}
        </Link>
      </div>
    </div>
  );
}

export default async function DraftsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  return (
    <RequireCapability capability="dashboard">
      <DraftsContent isFa={isFa} locale={locale} />
    </RequireCapability>
  );
}
