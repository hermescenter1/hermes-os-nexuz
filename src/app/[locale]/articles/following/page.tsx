import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";

export const metadata = noIndexMetadata("Following — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function FollowingContent({ isFa, locale }: { isFa: boolean; locale: string }) {
  return (
    <div className="min-h-screen">
      <div className="border-b border-line/50 bg-surface/60 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <p className="eyebrow-mono text-signal text-[10px] mb-2">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {isFa ? "نویسندگان دنبال‌شده" : "Following"}
          </h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface2 border border-line/60 mb-5">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-7 h-7 text-faint">
            <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2.046 15.253c-.058.468.172.92.57 1.174A9.953 9.953 0 0 0 8 18c1.536 0 2.989-.348 4.284-.963.115-.06.237-.12.37-.19a.75.75 0 0 0 .336-.963l-3.13-6.977a.75.75 0 0 0-1.38 0L6.49 13.07a.75.75 0 0 0 .336.963c.133.07.255.13.37.19.595.258 1.21.457 1.83.601l-.06.044-1.38.882a.75.75 0 0 0 .416 1.383Z"/>
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-ink mb-2">
          {isFa ? "هیچ نویسنده‌ای دنبال نشده" : "Not following anyone yet"}
        </h2>
        <p className="text-muted text-sm mb-6">
          {isFa
            ? "متخصصان را دنبال کنید تا مقالات جدید آن‌ها را اینجا ببینید."
            : "Follow experts to see their latest articles in your feed."}
        </p>
        <Link href={`/${locale}/articles/authors`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-signal text-signal text-sm font-medium hover:bg-signal/10 transition-colors">
          {isFa ? "مرور متخصصان" : "Browse Experts"}
        </Link>
      </div>
    </div>
  );
}

export default async function FollowingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  return (
    <RequireCapability capability="dashboard">
      <FollowingContent isFa={isFa} locale={locale} />
    </RequireCapability>
  );
}
