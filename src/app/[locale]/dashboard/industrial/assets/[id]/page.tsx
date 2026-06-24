import { setRequestLocale }  from "next-intl/server";
import { PageShell }         from "@/components/PageShell";
import { AssetDetailClient } from "@/components/industrial/AssetDetailClient";
import { Link }              from "@/i18n/navigation";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-6 pt-10 pb-16">
        {/* Back link */}
        <div className="mb-6">
          <Link
            href="/dashboard/industrial/assets"
            className="inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-signal transition-colors"
          >
            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
              <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Assets
          </Link>
        </div>

        <AssetDetailClient assetId={id} />
      </div>
    </PageShell>
  );
}
