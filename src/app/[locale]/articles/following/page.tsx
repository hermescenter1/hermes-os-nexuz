import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";

export const metadata = noIndexMetadata("Following — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function FollowingContent({ isFa, locale }: { isFa: boolean; locale: string }) {
  return (
    <div className="min-h-screen">
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-25"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-4xl mx-auto px-6 py-10">
          <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {isFa ? "نویسندگان دنبال‌شده" : "Following"}
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-16 flex flex-col items-center text-center">
        <div className="relative mb-8">
          <div className="w-20 h-20 rounded-2xl bg-surface/80 border border-signal/20 flex items-center justify-center shadow-[0_0_30px_rgba(30,200,164,0.06)]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-signal/50">
              <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2.046 15.253c-.058.468.172.92.57 1.174A9.953 9.953 0 0 0 8 18c1.536 0 2.989-.348 4.284-.963.115-.06.237-.12.37-.19a.75.75 0 0 0 .336-.963l-3.13-6.977a.75.75 0 0 0-1.38 0L6.49 13.07a.75.75 0 0 0 .336.963c.133.07.255.13.37.19.595.258 1.21.457 1.83.601l-.06.044-1.38.882a.75.75 0 0 0 .416 1.383Z"/>
            </svg>
          </div>
          <div className="absolute -inset-2 rounded-2xl"
            style={{ background: "radial-gradient(circle, rgba(30,200,164,0.06) 0%, transparent 70%)" }} />
        </div>
        <h2 className="text-lg font-bold text-ink mb-2">
          {isFa ? "هیچ نویسنده‌ای دنبال نشده" : "Not following anyone yet"}
        </h2>
        <p className="text-muted text-sm mb-8 max-w-sm leading-relaxed">
          {isFa
            ? "متخصصان صنعتی را دنبال کنید تا مقالات جدید آن‌ها را اینجا ببینید."
            : "Follow verified industrial experts to see their latest articles here in your personalized feed."}
        </p>
        <Link href={`/${locale}/articles/authors`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-signal text-signal text-sm font-bold hover:bg-signal/8 transition-all">
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
