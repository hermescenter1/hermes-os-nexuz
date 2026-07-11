import { setRequestLocale, getTranslations } from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Content Reports — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

async function ReportsContent() {
  const t = await getTranslations("journalEditorial");
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="relative border-b border-line/30 overflow-hidden"
        style={{ background: "linear-gradient(145deg, rgba(30,200,164,0.05) 0%, rgba(6,8,13,0.98) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-20"
          style={{ backgroundImage: "radial-gradient(rgba(30,200,164,0.14) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-5xl mx-auto px-6 py-10">
          <p className="eyebrow-mono text-signal text-[9px] mb-2 tracking-[0.2em]">
            {t("reportsBrand")}
          </p>
          <h1 className="text-2xl font-bold text-ink">
            {t("reportsTitle")}
          </h1>
          <p className="text-xs text-muted mt-1">
            {t("reportsSubtitle")}
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex flex-col items-center py-20 rounded-2xl border border-line/30 bg-surface/20">
          <div className="w-14 h-14 rounded-2xl border border-signal/15 bg-surface2/60 flex items-center justify-center mb-5">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-signal/40">
              <path fillRule="evenodd" d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-ink mb-1">
            {t("reportsClear")}
          </p>
          <p className="text-xs text-muted">
            {t("reportsClearBody")}
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <RequireCapability capability="admin">
      <ReportsContent />
    </RequireCapability>
  );
}
