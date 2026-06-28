import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";

export const metadata = noIndexMetadata("Saved Articles — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function SavedContent({ isFa, locale }: { isFa: boolean; locale: string }) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-line/50 bg-surface/60 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <p className="eyebrow-mono text-signal text-[10px] mb-2">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {isFa ? "مقالات ذخیره‌شده" : "Saved Articles"}
          </h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface2 border border-line/60 mb-5">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7 text-faint">
            <path d="M5 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14l-5-2.5L5 18V4Z"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-ink mb-2">
          {isFa ? "مقاله‌ای ذخیره نشده" : "No saved articles"}
        </h2>
        <p className="text-muted text-sm mb-6">
          {isFa
            ? "مقالاتی که ذخیره می‌کنید اینجا نمایش داده می‌شوند."
            : "Articles you save will appear here for later reading."}
        </p>
        <Link href={`/${locale}/articles`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-signal text-signal text-sm font-medium hover:bg-signal/10 transition-colors">
          {isFa ? "مرور مقالات" : "Browse Articles"}
        </Link>
      </div>
    </div>
  );
}

export default async function SavedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  return (
    <RequireCapability capability="dashboard">
      <SavedContent isFa={isFa} locale={locale} />
    </RequireCapability>
  );
}
