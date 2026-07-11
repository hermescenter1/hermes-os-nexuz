import { setRequestLocale, getTranslations } from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";
import Link                   from "next/link";

export const metadata = noIndexMetadata("Saved Articles — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

async function SavedContent({ locale }: { locale: string }) {
  const t = await getTranslations("journal");
  return (
    <div className="min-h-screen">
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(180deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-25"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-4xl mx-auto px-6 py-10">
          <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
            {t("brandUpper")}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {t("lists.savedTitle")}
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-16 flex flex-col items-center text-center">
        <div className="relative mb-8">
          <div className="w-20 h-20 rounded-2xl bg-surface/80 border border-signal/20 flex items-center justify-center shadow-[0_0_30px_rgba(30,200,164,0.06)]">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-signal/50">
              <path d="M5 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14l-5-2.5L5 18V4Z"/>
            </svg>
          </div>
          <div className="absolute -inset-2 rounded-2xl"
            style={{ background: "radial-gradient(circle, rgba(30,200,164,0.06) 0%, transparent 70%)" }} />
        </div>
        <h2 className="text-lg font-bold text-ink mb-2">
          {t("lists.savedEmpty")}
        </h2>
        <p className="text-muted text-sm mb-8 max-w-sm leading-relaxed">
          {t("lists.savedBody")}
        </p>
        <Link href={`/${locale}/articles`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-signal text-signal text-sm font-bold hover:bg-signal/8 transition-all">
          {t("lists.browseJournal")}
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

  return (
    <RequireCapability capability="dashboard">
      <SavedContent locale={locale} />
    </RequireCapability>
  );
}
