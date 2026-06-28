import { setRequestLocale }  from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";

export const metadata = noIndexMetadata("My Drafts — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

function DraftsContent({ isFa, locale }: { isFa: boolean; locale: string }) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-25"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-4xl mx-auto px-6 py-10">
          <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
            {isFa ? "ژورنال صنعتی هرمس" : "HERMES INDUSTRIAL JOURNAL"}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {isFa ? "پیش‌نویس‌های من" : "My Drafts"}
          </h1>
        </div>
      </div>

      {/* Empty state */}
      <div className="max-w-4xl mx-auto px-6 py-16 flex flex-col items-center text-center">
        <div className="relative mb-8">
          <div className="w-20 h-20 rounded-2xl bg-surface/80 border border-signal/20 flex items-center justify-center shadow-[0_0_30px_rgba(30,200,164,0.06)]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-signal/50">
              <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3L10.58 12.42a4 4 0 0 1-1.343.885l-3.155 1.262a.5.5 0 0 1-.65-.65Z"/>
              <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z"/>
            </svg>
          </div>
          <div className="absolute -inset-2 rounded-2xl"
            style={{ background: "radial-gradient(circle, rgba(30,200,164,0.06) 0%, transparent 70%)" }} />
        </div>
        <h2 className="text-lg font-bold text-ink mb-2">
          {isFa ? "پیش‌نویسی وجود ندارد" : "No drafts yet"}
        </h2>
        <p className="text-muted text-sm mb-8 max-w-sm leading-relaxed">
          {isFa
            ? "اولین مقاله تخصصی خود را بنویسید و تجربه صنعتی خود را با جامعه هرمس به اشتراک بگذارید."
            : "Start writing your first industrial article and share your technical expertise with the Hermes community."}
        </p>
        <Link href={`/${locale}/articles/write`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-signal text-bg text-sm font-bold hover:bg-signal/90 transition-colors shadow-[0_0_20px_rgba(30,200,164,0.15)]">
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
